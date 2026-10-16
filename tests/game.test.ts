import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { attachGame } from '../server/game.js';
import { idle, move, parseInput, WORLD, type ServerMessage } from '../shared/game.js';

test('movement normalizes diagonals and enforces world bounds', () => {
  const p = { id: 'test', x: 100, y: 100, color: 0 };
  move(p, { ...idle(), right: true, down: true }, 1);
  assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 100) - WORLD.speed) < 0.001);
  move(p, { ...idle(), right: true }, 100);
  assert.equal(p.x, WORLD.width - WORLD.tile);
  assert.equal(parseInput({ type: 'input', ...idle(), up: 'yes' }), null);
});

test('two clients share authoritative movement and disconnect cleanup', { timeout: 10000 }, async () => {
  const server = createServer();
  const stop = attachGame(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  function client() {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    return { socket, messages };
  }
  async function until<T>(get: () => T | undefined): Promise<T> {
    const end = Date.now() + 3000;
    while (Date.now() < end) { const value = get(); if (value !== undefined) return value; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('Timed out waiting for multiplayer state');
  }
  try {
    const a = client(); const b = client();
    const welcome = await until(() => a.messages.find(m => m.type === 'welcome'));
    assert.equal(welcome.type, 'welcome');
    if (welcome.type !== 'welcome') throw new Error('Missing welcome');
    const initial = await until(() => b.messages.find(m => m.type === 'state' && m.players.length === 2));
    if (initial.type !== 'state') throw new Error('Missing state');
    const x = initial.players.find(p => p.id === welcome.id)!.x;
    a.socket.send('invalid json');
    a.socket.send(JSON.stringify({ type: 'input', ...idle(), right: true, x: 99999 }));
    await until(() => b.messages.find(m => m.type === 'state' && m.players.some(p => p.id === welcome.id && p.x > x)));
    a.socket.close();
    await until(() => b.messages.find(m => m.type === 'state' && m.players.length === 1 && m.players[0].id !== welcome.id));
  } finally {
    for (const s of sockets) s.terminate();
    stop(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
