import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachGame } from '../server/game.js';
import { idle, type RoomState, type ServerMessage } from '../shared/game.js';

type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until<T>(get: () => T | undefined, label: string, timeout = 5000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = get();
    if (value !== undefined) return value;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function fixture(options: Parameters<typeof attachGame>[1] = {}) {
  const server = createServer();
  const stop = attachGame(server, options);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  async function client() {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await once(socket, 'open');
    return {
      socket, messages,
      send(value: unknown) { socket.send(JSON.stringify(value)); },
      welcome: () => until(() => messages.find((m): m is Welcome => m.type === 'welcome'), 'welcome'),
      state: (predicate: (room: RoomState) => boolean = () => true) => until(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          if (message.type === 'state' && predicate(message.room)) return message.room;
        }
        return undefined;
      }, 'room state'),
      error: (since = 0) => until(() => messages.slice(since).find(m => m.type === 'error'), 'protocol error'),
    };
  }
  return {
    client,
    async close() {
      for (const socket of sockets) socket.terminate();
      stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

test('ten real WebSocket clients select fighters, ready, and start a capped 5v5 room', { timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    const host = await f.client();
    host.send({ type: 'create', name: 'Host' });
    const hostIdentity = await host.welcome();
    const room = await host.state();
    assert.match(room.code, /^[A-Z0-9]{6}$/);
    assert.equal(room.host, hostIdentity.id);
    const clients = [host];
    for (let index = 1; index < 10; index++) {
      const client = await f.client();
      client.send({ type: 'join', code: room.code, name: `Pilot ${index}` });
      await client.welcome(); clients.push(client);
    }
    const full = await host.state(r => r.players.length === 10);
    assert.equal(full.players.filter(p => p.team === 'sun').length, 5);
    assert.equal(full.players.filter(p => p.team === 'moon').length, 5);
    const overflow = await f.client();
    overflow.send({ type: 'join', code: room.code, name: 'Overflow' });
    await overflow.error();
    assert.equal(overflow.messages.some(m => m.type === 'welcome'), false);

    const moon = full.players.find(p => p.team === 'moon')!;
    const moonClient = clients.find(c => c.messages.some(m => m.type === 'welcome' && m.id === moon.id))!;
    const beforeTeam = moonClient.messages.length;
    moonClient.send({ type: 'select', team: 'sun' });
    await moonClient.error(beforeTeam);
    moonClient.send({ type: 'select', fighter: 'wisp' });
    await host.state(r => r.players.find(p => p.id === moon.id)?.fighter === 'wisp');

    const beforeStart = clients[1].messages.length;
    clients[1].send({ type: 'start' });
    await clients[1].error(beforeStart);
    for (const client of clients) client.send({ type: 'ready', ready: true });
    await host.state(r => r.players.every(p => p.ready));
    host.send({ type: 'start' });
    const countdown = await host.state(r => r.phase === 'countdown');
    assert.equal(countdown.players.length, 10);
    const active = await host.state(r => r.phase === 'active');
    assert.ok(active.players.every(p => p.stocks === 3 && p.damage === 0));
    assert.ok(active.remaining <= 480 && active.remaining > 470);

    const late = await f.client();
    late.send({ type: 'join', code: room.code, name: 'Observer' });
    const lateIdentity = await late.welcome();
    const observed = await host.state(r => r.players.some(p => p.id === lateIdentity.id));
    assert.equal(observed.players.find(p => p.id === lateIdentity.id)?.spectator, true);
    assert.equal(observed.players.filter(p => !p.spectator).length, 10);
  } finally { await f.close(); }
});

test('authoritative inputs reject stale sequences, forged positions, and client stock changes', { timeout: 12000 }, async () => {
  const f = await fixture();
  try {
    const a = await f.client(); const b = await f.client();
    a.send({ type: 'create', name: 'Alpha' });
    const identity = await a.welcome(); const room = await a.state();
    b.send({ type: 'join', code: room.code, name: 'Beta' }); await b.welcome();
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    await a.state(r => r.players.length === 2 && r.players.every(p => p.ready));
    a.send({ type: 'start' });
    const active = await a.state(r => r.phase === 'active');
    const startX = active.players.find(p => p.id === identity.id)!.x;
    a.socket.send('invalid json');
    a.send({ type: 'input', seq: 10, ...idle(), right: true, x: 999999, damage: 0, stocks: 99 });
    const accepted = await b.state(r => r.players.some(p => p.id === identity.id && p.ack === 10 && p.x > startX));
    const player = accepted.players.find(p => p.id === identity.id)!;
    assert.equal(player.stocks, 3); assert.equal(player.damage, 0);
    assert.ok(player.x < startX + 200);
    a.send({ type: 'input', seq: 9, ...idle(), left: true });
    a.send({ type: 'input', seq: 10, ...idle(), left: true });
    a.send({ type: 'input', seq: 11, ...idle(), right: 'yes' });
    await delay(130);
    const latest = await b.state(r => r.tick > accepted.tick + 3);
    assert.equal(latest.players.find(p => p.id === identity.id)!.ack, 10);
    a.send({ type: 'input', seq: 11, ...idle() });
    await b.state(r => r.players.some(p => p.id === identity.id && p.ack === 11));
  } finally { await f.close(); }
});

test('resume preserves identity and stocks; disconnect transfers host and eventually forfeits', { timeout: 12000 }, async () => {
  const f = await fixture({ reconnectMs: 800, emptyRoomMs: 1000 });
  try {
    const a = await f.client(); const b = await f.client();
    a.send({ type: 'create', name: 'Alpha' });
    const identity = await a.welcome(); const room = await a.state();
    b.send({ type: 'join', code: room.code, name: 'Beta' });
    const bIdentity = await b.welcome();
    a.send({ type: 'ready', ready: true }); b.send({ type: 'ready', ready: true });
    await a.state(r => r.players.length === 2 && r.players.every(p => p.ready));
    a.send({ type: 'start' }); await a.state(r => r.phase === 'active');
    a.send({ type: 'input', seq: 4, ...idle() });
    await b.state(r => r.players.some(p => p.id === identity.id && p.ack === 4));
    a.socket.close();
    const disconnected = await b.state(r => r.host === bIdentity.id && r.players.some(p => p.id === identity.id && !p.connected));
    const original = disconnected.players.find(p => p.id === identity.id)!;
    const replacement = await f.client();
    replacement.send({ type: 'resume', token: identity.token });
    assert.equal((await replacement.welcome()).id, identity.id);
    const restored = await replacement.state(r => r.players.some(p => p.id === identity.id && p.connected));
    const player = restored.players.find(p => p.id === identity.id)!;
    assert.equal(player.stocks, original.stocks); assert.equal(player.damage, original.damage);
    assert.equal(player.ack, 4);
    replacement.socket.close();
    const ended = await b.state(r => r.phase === 'results');
    assert.equal(ended.winner, ended.players.find(p => p.id === bIdentity.id)!.team);
    assert.equal(ended.players.find(p => p.id === identity.id)!.stocks, 0);
    const late = await f.client();
    late.send({ type: 'resume', token: identity.token });
    assert.equal((await late.welcome()).id, identity.id);
    const spectator = await late.state(r => r.phase === 'results');
    assert.equal(spectator.players.find(p => p.id === identity.id)!.stocks, 0);
    assert.equal(spectator.players.find(p => p.id === identity.id)!.spectator, true);
  } finally { await f.close(); }
});

test('rooms are isolated, lobby departure transfers the host, and failed resume grants no identity', { timeout: 8000 }, async () => {
  const f = await fixture();
  try {
    const a = await f.client(); const b = await f.client(); const other = await f.client();
    a.send({ type: 'create', name: 'A'.repeat(100) });
    const aIdentity = await a.welcome(); const first = await a.state();
    assert.ok(first.players[0].name.length <= 24);
    b.send({ type: 'join', code: first.code, name: 'Beta' }); const bIdentity = await b.welcome();
    other.send({ type: 'create', name: 'Other room' }); await other.welcome();
    const isolated = await other.state();
    assert.notEqual(isolated.code, first.code);
    assert.equal(isolated.players.length, 1);
    assert.equal(isolated.players.some(p => p.id === aIdentity.id || p.id === bIdentity.id), false);
    a.send({ type: 'leave' });
    const remaining = await b.state(r => r.host === bIdentity.id && r.players.length === 1);
    assert.equal(remaining.phase, 'lobby');
    const intruder = await f.client();
    intruder.send({ type: 'resume', token: aIdentity.id }); await intruder.error();
    assert.equal(intruder.messages.some(m => m.type === 'welcome'), false);
  } finally { await f.close(); }
});

test('solo training rejects joiners and only its host can pause and resume simulation', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const host = await f.client();
    host.send({ type: 'create', name: 'Practice', training: true });
    await host.welcome(); const lobby = await host.state();
    assert.equal(lobby.training, true);
    assert.equal(lobby.players.length, 2);
    assert.ok(lobby.players.some(p => p.id.startsWith('dummy-')));
    const guest = await f.client();
    guest.send({ type: 'join', code: lobby.code, name: 'Visitor' });
    await guest.error();
    assert.equal(guest.messages.some(m => m.type === 'welcome'), false);
    host.send({ type: 'ready', ready: true });
    await host.state(r => r.players.every(p => p.ready));
    host.send({ type: 'start' }); await host.state(r => r.phase === 'active');
    host.send({ type: 'pause', paused: true });
    const paused = await host.state(r => r.paused);
    await delay(150);
    const latest = await host.state(r => r.paused);
    assert.equal(latest.tick, paused.tick); assert.equal(latest.remaining, paused.remaining);
    host.send({ type: 'pause', paused: false });
    const resumed = await host.state(r => !r.paused && r.tick > paused.tick);
    assert.equal(resumed.phase, 'active');
  } finally { await f.close(); }
});

test('coalesced action presses and releases preserve one jump and a directional recovery', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const host = await f.client();
    host.send({ type: 'create', name: 'Quick inputs', training: true });
    const identity = await host.welcome();
    host.send({ type: 'ready', ready: true });
    await host.state(r => r.players.every(p => p.ready));
    host.send({ type: 'start' });
    const active = await host.state(r => r.phase === 'active');
    const groundY = active.players.find(p => p.id === identity.id)!.y;

    // Adjacent packets can be delivered together between two fixed simulation steps.
    host.send({ type: 'input', seq: 1, ...idle(), jump: true });
    host.send({ type: 'input', seq: 2, ...idle() });
    const jumped = await host.state(r => r.players.some(p => p.id === identity.id && p.ack === 2 && p.jumps === 1 && p.y < groundY - 5));
    const landed = await host.state(r => r.tick > jumped.tick + 10 && r.players.some(p => p.id === identity.id && p.grounded && p.jumps === 0));
    await delay(100);
    const stable = await host.state(r => r.tick > landed.tick + 3);
    assert.equal(stable.players.find(p => p.id === identity.id)!.grounded, true);

    host.send({ type: 'input', seq: 3, ...idle(), up: true, special: true });
    host.send({ type: 'input', seq: 4, ...idle() });
    const recovered = await host.state(r => r.players.some(p => p.id === identity.id && p.ack === 4 && p.recoveryUsed && p.attack?.kind === 'recovery'));
    assert.ok(recovered.players.find(p => p.id === identity.id)!.vy < 0);
  } finally { await f.close(); }
});
