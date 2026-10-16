/** Against a running server: two full ten-client stock matches using actual WebSockets. */
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { FIGHTER_IDS, idle, type ClientMessage, type RoomState, type ServerMessage } from '../shared/game.js';
const url = process.argv[2] ?? 'ws://127.0.0.1:3001/ws';
const clients: { socket: WebSocket; id: string; seq: number; room?: RoomState }[] = [];
let bytes = 0, snapshots = 0;
const errors: string[] = [];
async function until<T>(get: () => T | undefined, label: string, timeout = 40000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = get(); if (value !== undefined) return value; await new Promise(r => setTimeout(r, 25)); }
  throw new Error(`Timed out: ${label}. Errors: ${errors.join(', ')}`);
}
function send(i: number, message: ClientMessage) { clients[i].socket.send(JSON.stringify(message)); }
let timer: ReturnType<typeof setInterval> | undefined;
const started = Date.now();
try {
  for (let i = 0; i < 10; i++) {
    const socket = new WebSocket(url);
    const client: typeof clients[number] = { socket, id: '', seq: 0 };
    clients.push(client);
    socket.on('message', raw => {
      bytes += raw.byteLength;
      const message = JSON.parse(raw.toString()) as ServerMessage;
      if (message.type === 'welcome') client.id = message.id;
      if (message.type === 'state') { client.room = message.room; snapshots++; }
      if (message.type === 'error') errors.push(message.message);
    });
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    if (!i) send(i, { type: 'create', name: 'Smoke 1' });
    else send(i, { type: 'join', code: clients[0].room!.code, name: `Smoke ${i + 1}` });
    await until(() => client.id || undefined, 'welcome');
  }
  const code = clients[0].room!.code;
  for (let i = 0; i < 10; i++) send(i, { type: 'select', fighter: FIGHTER_IDS[Math.floor(i / 2) % 4], team: i % 2 ? 'moon' : 'sun' });
  await until(() => clients[0].room?.players.length === 10 ? true : undefined, 'ten seats');
  timer = setInterval(() => {
    for (const client of clients) if (client.socket.readyState === WebSocket.OPEN && client.room?.phase === 'active') {
      const me = client.room.players.find(p => p.id === client.id)!;
      client.socket.send(JSON.stringify({ type: 'input', seq: client.seq++, ...idle(), left: me.team === 'sun', right: me.team === 'moon' }));
    }
  }, 33);
  const results: string[] = [];
  for (let match = 0; match < 2; match++) {
    for (let i = 0; i < 10; i++) send(i, { type: 'ready', ready: true });
    await until(() => clients[0].room?.players.every(p => p.ready) ? true : undefined, 'ready gate');
    send(0, { type: 'start' });
    await until(() => clients[0].room?.phase === 'active' ? true : undefined, 'active phase');
    await until(() => clients[0].room?.phase === 'results' ? true : undefined, 'full three-stock match', 45000);
    const state = clients[0].room!;
    assert.equal(state.players.length, 10);
    assert.equal(state.reason, 'Team eliminated');
    assert.ok(state.players.every(p => p.falls >= 2), 'all clients must exercise repeated stock loss and respawn');
    assert.ok(state.players.some(p => p.stocks === 0));
    results.push(`${state.winner}: ${state.reason}, total falls ${state.players.reduce((n, p) => n + p.falls, 0)}`);
    if (!match) {
      send(0, { type: 'rematch' });
      await until(() => clients[0].room?.phase === 'lobby' ? true : undefined, 'rematch lobby');
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ room: code, clients: clients.length, completedMatches: results, seconds: +((Date.now() - started) / 1000).toFixed(1),
    snapshotsReceived: snapshots, totalReceivedMiB: +(bytes / 1024 / 1024).toFixed(2),
    aggregateKiBPerSecond: +(bytes / 1024 / ((Date.now() - started) / 1000)).toFixed(1) }, null, 2));
} finally { clearInterval(timer); for (const { socket } of clients) socket.terminate(); }
