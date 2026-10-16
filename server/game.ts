import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer, type VerifyClientCallbackSync } from 'ws';
import { FIGHTER_IDS, idle, parseInput, TICK_RATE, type Input, type Player, type RoomState, type ServerMessage, type Team } from '../shared/game.js';
import { clearPlayerInput, createPlayer, createRoom, resetLobby, startMatch, stepRoom } from '../shared/simulation.js';

/** Shorter windows are useful for integration tests; production keeps the design's 30-second reservation. */
export type GameOptions = { reconnectMs?: number; emptyRoomMs?: number; heartbeatMs?: number };
type Session = {
  token: string; player: Player; room: Room; socket?: WebSocket;
  input: Input; pending: Input; updated: number; lastSeq: number; disconnectedAt: number | null; forfeited: boolean;
};
type Room = { state: RoomState; sessions: Map<string, Session>; fighterSeats: Set<string>; emptySince: number | null };
type Client = { session?: Session; alive: boolean; joinedAt: number; tokens: number; refillAt: number; controls: number; controlRefillAt: number; errorAt: number; lastError: string };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CONNECTIONS = 128;
const MAX_ROOMS = 64;
const MAX_PLAYERS = 10;
const MAX_SPECTATORS = 4;
const STALE_INPUT_MS = 500;
const ACTION_BUTTONS = ['jump', 'attack', 'special', 'guard'] as const;
const DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

function displayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || null;
}

export function attachGame(server: Server, options: GameOptions = {}) {
  const reconnectMs = options.reconnectMs ?? 30_000;
  const emptyRoomMs = options.emptyRoomMs ?? 30_000;
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean));
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Session>();
  const clients = new Map<WebSocket, Client>();
  let stopped = false;

  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 2048, perMessageDeflate: false,
    verifyClient: ((info) => {
      // Command-line clients do not send Origin. Browsers must use the serving host or an explicit allowlist.
      if (!info.origin) return true;
      if (allowedOrigins.size) return allowedOrigins.has(info.origin);
      try {
        const origin = new URL(info.origin);
        const host = new URL(`http://${info.req.headers.host ?? ''}`);
        return (origin.protocol === 'http:' || origin.protocol === 'https:') && origin.hostname === host.hostname;
      } catch { return false; }
    }) as VerifyClientCallbackSync,
  });

  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) { socket.terminate(); return; }
    socket.send(JSON.stringify(message));
  }
  function error(socket: WebSocket, client: Client, message: string) {
    const now = Date.now();
    if (message !== client.lastError || now - client.errorAt >= 500) { client.errorAt = now; client.lastError = message; send(socket, { type: 'error', message }); }
  }
  function broadcast(room: Room) {
    const message: ServerMessage = { type: 'state', room: room.state };
    for (const session of room.sessions.values()) if (session.socket) send(session.socket, message);
  }
  function transferHost(room: Room) {
    const host = room.sessions.get(room.state.host);
    if (host?.socket && host.player.connected) return;
    room.state.host = [...room.sessions.values()].find(session => session.socket && session.player.connected)?.player.id ?? '';
  }
  function clearInput(session: Session) { session.input = idle(); session.pending = idle(); session.updated = 0; clearPlayerInput(session.player); }
  function forfeit(session: Session) {
    session.forfeited = true;
    clearInput(session);
    const player = session.player;
    player.stocks = 0; player.spectator = true; player.attack = null; player.guarding = false;
    player.vx = 0; player.vy = 0;
    session.room.state.projectiles = session.room.state.projectiles.filter(projectile => projectile.owner !== player.id);
    session.room.state.fields = session.room.state.fields.filter(field => field.owner !== player.id);
  }
  function removeSession(session: Session, keepResult: boolean) {
    sessions.delete(session.token);
    session.room.sessions.delete(session.player.id);
    if (!keepResult) session.room.state.players = session.room.state.players.filter(player => player.id !== session.player.id);
  }
  function leave(socket: WebSocket, client: Client) {
    const session = client.session;
    if (!session) { send(socket, { type: 'left' }); return; }
    const room = session.room;
    const preserve = room.state.phase !== 'lobby' && !session.player.spectator;
    if (preserve) forfeit(session);
    session.player.connected = false;
    session.socket = undefined;
    removeSession(session, preserve);
    client.session = undefined;
    transferHost(room);
    broadcast(room);
    send(socket, { type: 'left' });
  }
  function bind(socket: WebSocket, client: Client, session: Session) {
    if (session.socket && session.socket !== socket) {
      const previous = clients.get(session.socket);
      if (previous) previous.session = undefined;
      session.socket.close(4001, 'Session resumed in another connection');
    }
    session.socket = socket; session.disconnectedAt = null; session.player.connected = true;
    clearInput(session); client.session = session;
    session.room.emptySince = null;
    transferHost(session.room);
    send(socket, { type: 'welcome', id: session.player.id, token: session.token });
    broadcast(session.room);
  }
  function newSession(socket: WebSocket, client: Client, room: Room, player: Player) {
    const session: Session = {
      token: randomBytes(32).toString('base64url'), player, room,
      input: idle(), pending: idle(), updated: 0, lastSeq: -1, disconnectedAt: null, forfeited: false,
    };
    room.sessions.set(player.id, session); sessions.set(session.token, session);
    bind(socket, client, session);
  }
  function teamSize(room: Room, team: Team, except?: string) {
    return room.state.players.filter(player => !player.spectator && player.team === team && player.id !== except).length;
  }
  function chooseTeam(room: Room): Team { return teamSize(room, 'sun') <= teamSize(room, 'moon') ? 'sun' : 'moon'; }

  function handle(socket: WebSocket, client: Client, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { error(socket, client, 'Send a valid game message.'); return; }
    const message = value as Record<string, unknown>;
    const now = Date.now();
    // Rate limits are checked before parsing or considering sequence numbers.
    client.tokens = Math.min(180, client.tokens + (now - client.refillAt) * 0.12); client.refillAt = now;
    if (client.tokens < 1) { error(socket, client, 'Too many messages. Please slow down.'); return; }
    client.tokens--;
    if (message.type === 'input') {
      const input = parseInput(message);
      const session = client.session;
      if (!input || !session || session.socket !== socket || session.player.spectator) return;
      if (input.seq <= session.lastSeq) return;
      session.lastSeq = input.seq; session.player.ack = input.seq;
      // A press and release can arrive in the same server tick. Keep the edge
      // until simulation sees it, while continuous movement uses the newest packet.
      let pressed = false;
      for (const button of ACTION_BUTTONS) {
        if (input[button] && !session.input[button]) { session.pending[button] = true; pressed = true; }
      }
      if (pressed) for (const direction of DIRECTIONS) session.pending[direction] = input[direction];
      session.input = input; session.updated = now;
      return;
    }
    client.controls = Math.min(20, client.controls + (now - client.controlRefillAt) * 0.008); client.controlRefillAt = now;
    if (client.controls < 1) { error(socket, client, 'Too many menu actions. Please slow down.'); return; }
    client.controls--;
    if (message.type === 'ping') {
      if (typeof message.at === 'number' && Number.isFinite(message.at)) send(socket, { type: 'pong', at: message.at });
      return;
    }
    if (message.type === 'leave') { leave(socket, client); return; }
    if (message.type === 'resume') {
      if (client.session) { error(socket, client, 'Leave the current room before resuming another session.'); return; }
      if (typeof message.token !== 'string' || message.token.length > 128) return;
      const session = sessions.get(message.token);
      if (!session) { error(socket, client, 'This session has expired. Join the room again.'); return; }
      // Apply the reservation deadline here too, so a resume between simulation ticks cannot escape a forfeit.
      if (session.disconnectedAt !== null && now - session.disconnectedAt >= reconnectMs) {
        if (session.room.state.phase === 'lobby') {
          removeSession(session, false); error(socket, client, 'This session has expired. Join the room again.'); return;
        }
        forfeit(session);
      }
      bind(socket, client, session); return;
    }
    if (message.type === 'create' || message.type === 'join') {
      if (client.session) { error(socket, client, 'Leave the current room first.'); return; }
      const name = displayName(message.name);
      if (!name) { error(socket, client, 'Enter a display name of up to 24 characters.'); return; }
      if (message.type === 'create') {
        if (rooms.size >= MAX_ROOMS) { error(socket, client, 'The server is full. Please try again shortly.'); return; }
        let code: string;
        do { code = [...randomBytes(6)].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join(''); } while (rooms.has(code));
        const player = createPlayer(randomUUID(), name);
        const training = message.training === true;
        const state = createRoom(code, player.id, training);
        state.players.push(player);
        const room: Room = { state, sessions: new Map(), fighterSeats: new Set(), emptySince: null };
        if (training) {
          const dummy = createPlayer(`dummy-${randomUUID()}`, 'Training dummy', 'rivet', 'moon');
          dummy.ready = true; state.players.push(dummy);
        }
        rooms.set(code, room); newSession(socket, client, room, player); return;
      }
      if (typeof message.code !== 'string' || message.code.length > 16) { error(socket, client, 'Enter a valid room code.'); return; }
      const room = rooms.get(message.code.trim().toUpperCase());
      if (!room) { error(socket, client, 'Room not found. Check the code with your host.'); return; }
      if (room.state.training) { error(socket, client, 'Training is a solo room. Create a team room to play together.'); return; }
      const spectating = room.state.phase !== 'lobby';
      if ((!spectating && room.state.players.filter(player => !player.spectator).length >= MAX_PLAYERS) || room.state.players.length >= MAX_PLAYERS + MAX_SPECTATORS || (spectating && room.state.players.filter(player => !room.fighterSeats.has(player.id)).length >= MAX_SPECTATORS)) {
        error(socket, client, spectating ? 'The spectator seats are full.' : 'This room has ten fighters already.'); return;
      }
      const player = createPlayer(randomUUID(), name, 'kestrel', chooseTeam(room));
      player.spectator = spectating;
      if (spectating) player.stocks = 0;
      room.state.players.push(player); newSession(socket, client, room, player); return;
    }

    const session = client.session;
    if (!session || session.socket !== socket) { error(socket, client, 'Create or join a room first.'); return; }
    const room = session.room;
    const state = room.state;
    const player = session.player;
    if (message.type === 'select') {
      if (state.phase !== 'lobby' || player.spectator) { error(socket, client, 'Fighters and teams can be changed in the lobby.'); return; }
      if (message.fighter !== undefined && (typeof message.fighter !== 'string' || !FIGHTER_IDS.includes(message.fighter as Player['fighter']))) { error(socket, client, 'Choose a fighter from the roster.'); return; }
      if (message.team !== undefined && message.team !== 'sun' && message.team !== 'moon') return;
      if (message.team && message.team !== player.team && teamSize(room, message.team, player.id) >= 5) { error(socket, client, 'That team already has five fighters.'); return; }
      if (state.training && message.team === 'moon') { error(socket, client, 'The training dummy is on Lunar. Stay on Solar to practice.'); return; }
      if (message.fighter) player.fighter = message.fighter as Player['fighter'];
      if (message.team) player.team = message.team;
      player.ready = false; broadcast(room); return;
    }
    if (message.type === 'ready') {
      if (state.phase !== 'lobby' || player.spectator || typeof message.ready !== 'boolean') return;
      player.ready = message.ready; broadcast(room); return;
    }
    if (message.type === 'start') {
      if (state.host !== player.id) { error(socket, client, 'Only the host can start the match.'); return; }
      if (state.phase !== 'lobby') return;
      const roster = state.players.filter(fighter => !fighter.spectator);
      if (!roster.every(fighter => fighter.connected)) { error(socket, client, 'Wait for disconnected fighters to return or their reserved slots to expire.'); return; }
      if (!roster.every(fighter => fighter.ready)) { error(socket, client, 'Every fighter must be ready before starting.'); return; }
      const sun = teamSize(room, 'sun'), moon = teamSize(room, 'moon');
      if (!sun || !moon) { error(socket, client, 'Each team needs at least one fighter.'); return; }
      if (!state.training && sun !== moon && message.allowUneven !== true) { error(socket, client, 'Teams are uneven. Confirm the uneven match before starting.'); return; }
      for (const participant of room.sessions.values()) clearInput(participant);
      room.fighterSeats = new Set(roster.map(fighter => fighter.id));
      startMatch(state); broadcast(room); return;
    }
    if (message.type === 'pause') {
      if (state.host !== player.id || !state.training || state.phase !== 'active' || typeof message.paused !== 'boolean') { error(socket, client, 'Only solo training can be paused.'); return; }
      state.paused = message.paused;
      for (const participant of room.sessions.values()) clearInput(participant);
      broadcast(room); return;
    }
    if (message.type === 'rematch') {
      if (state.host !== player.id) { error(socket, client, 'Only the host can return the room to the lobby.'); return; }
      if (state.phase !== 'results') return;
      for (const participant of [...room.sessions.values()]) {
        if (participant.disconnectedAt !== null && now - participant.disconnectedAt >= reconnectMs) removeSession(participant, false);
      }
      state.players = state.players.filter(fighter => fighter.id.startsWith('dummy-') || room.sessions.has(fighter.id));
      // Preserve the ten existing fighters' seats before considering late spectators for the next match.
      const formerSpectators = new Set(state.players.filter(fighter => !room.fighterSeats.has(fighter.id)).map(fighter => fighter.id));
      resetLobby(state);
      let sun = 0, moon = 0, count = 0;
      for (const fighter of [...state.players].sort((a, b) => Number(formerSpectators.has(a.id)) - Number(formerSpectators.has(b.id)))) {
        if (count >= MAX_PLAYERS) { fighter.spectator = true; fighter.stocks = 0; continue; }
        if ((fighter.team === 'sun' ? sun : moon) >= 5) fighter.team = fighter.team === 'sun' ? 'moon' : 'sun';
        fighter.spectator = false; fighter.stocks = 3; fighter.ready = fighter.id.startsWith('dummy-');
        if (fighter.team === 'sun') sun++; else moon++;
        count++;
      }
      for (const participant of room.sessions.values()) {
        clearInput(participant); participant.forfeited = false;
        participant.player.ack = participant.lastSeq;
      }
      broadcast(room); return;
    }
    error(socket, client, 'Unknown game action.');
  }

  wss.on('connection', socket => {
    if (stopped || clients.size >= MAX_CONNECTIONS) { socket.close(1013, 'Server connection limit reached'); return; }
    const now = Date.now();
    const client: Client = { alive: true, joinedAt: now, tokens: 180, refillAt: now, controls: 20, controlRefillAt: now, errorAt: 0, lastError: '' };
    clients.set(socket, client);
    socket.on('pong', () => { client.alive = true; });
    socket.on('message', (raw, binary) => {
      if (binary) { error(socket, client, 'Binary messages are not supported.'); return; }
      try { handle(socket, client, JSON.parse(raw.toString())); }
      catch { error(socket, client, 'Send valid JSON game messages.'); }
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clients.delete(socket);
      const session = client.session;
      if (!session || session.socket !== socket) return;
      session.socket = undefined; session.disconnectedAt = Date.now(); session.player.connected = false;
      if (session.room.state.phase === 'lobby') session.player.ready = false;
      clearInput(session); transferHost(session.room); broadcast(session.room);
    });
  });

  let previous = performance.now();
  let accumulated = 0;
  const tick = setInterval(() => {
    const now = Date.now();
    const current = performance.now();
    accumulated = Math.min(accumulated + (current - previous) / 1000, 5 / TICK_RATE);
    previous = current;
    for (const [code, room] of rooms) {
      for (const session of [...room.sessions.values()]) {
        if (!session.forfeited && session.disconnectedAt !== null && now - session.disconnectedAt >= reconnectMs) {
          if (room.state.phase === 'lobby') removeSession(session, false);
          else forfeit(session);
        }
      }
      if (![...room.sessions.values()].some(session => session.socket)) {
        room.emptySince ??= now;
        if (now - room.emptySince >= emptyRoomMs) {
          for (const session of room.sessions.values()) sessions.delete(session.token);
          rooms.delete(code); continue;
        }
      } else room.emptySince = null;
      for (let remaining = accumulated; remaining >= 1 / TICK_RATE; remaining -= 1 / TICK_RATE) {
        const inputs = new Map<string, Input>();
        for (const session of room.sessions.values()) {
          const input = session.socket && now - session.updated < STALE_INPUT_MS ? { ...session.input } : idle();
          if (session.socket && now - session.updated < STALE_INPUT_MS) {
            for (const button of ACTION_BUTTONS) input[button] ||= session.pending[button];
            // Keep the intended directional variant when a complete key chord
            // was released before simulation could observe any of its keys.
            if (!DIRECTIONS.some(direction => input[direction])) {
              for (const direction of DIRECTIONS) input[direction] = session.pending[direction];
            }
          }
          inputs.set(session.player.id, input);
        }
        stepRoom(room.state, inputs, 1 / TICK_RATE);
        // Consume a queued press once, including when this timer catches up with
        // several fixed steps. Holding a button keeps its ordinary held state.
        for (const session of room.sessions.values()) session.pending = idle();
      }
    }
    while (accumulated >= 1 / TICK_RATE) accumulated -= 1 / TICK_RATE;
    for (const [socket, client] of clients) if (!client.session && now - client.joinedAt >= 60_000) socket.close(1000, 'Create or join a room to continue');
  }, 1000 / TICK_RATE);
  const snapshots = setInterval(() => { for (const room of rooms.values()) broadcast(room); }, 50);
  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) socket.terminate();
      else { client.alive = false; socket.ping(); }
    }
  }, options.heartbeatMs ?? 15_000);

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(tick); clearInterval(snapshots); clearInterval(heartbeat);
    for (const socket of clients.keys()) socket.terminate();
    rooms.clear(); sessions.clear(); clients.clear();
    wss.close();
  };
}
