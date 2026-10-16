import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { idle, move, parseInput, type Input, type Player } from '../shared/game.js';

export function attachGame(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
  const clients = new Map<WebSocket, { player: Player; input: Input; updated: number; alive: boolean }>();
  const colors = [0xf5c451, 0x70d6b0, 0xed789c, 0x83b5f5];
  wss.on('connection', socket => {
    if (clients.size >= 64) { socket.close(1013, 'Room full'); return; }
    const player: Player = { id: randomUUID(), x: 64 + Math.random() * 480, y: 64 + Math.random() * 272, color: colors[clients.size % colors.length] };
    const client = { player, input: idle(), updated: Date.now(), alive: true };
    clients.set(socket, client);
    socket.send(JSON.stringify({ type: 'welcome', id: player.id }));
    socket.on('pong', () => { client.alive = true; });
    socket.on('message', (raw, binary) => {
      if (binary) return;
      try {
        const input = parseInput(JSON.parse(raw.toString()));
        if (input) { client.input = input; client.updated = Date.now(); }
      } catch { /* Malformed messages never affect simulation. */ }
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => clients.delete(socket));
  });
  const tick = setInterval(() => {
    for (const { player, input, updated } of clients.values()) move(player, Date.now() - updated < 500 ? input : idle(), 1 / 20);
    const message = JSON.stringify({ type: 'state', players: [...clients.values()].map(c => c.player) });
    for (const socket of clients.keys()) {
      if (socket.readyState === WebSocket.OPEN) {
        if (socket.bufferedAmount > 64 * 1024) socket.terminate();
        else socket.send(message);
      }
    }
  }, 50);
  const heartbeat = setInterval(() => {
    for (const [socket, client] of clients) {
      if (!client.alive) socket.terminate();
      else { client.alive = false; socket.ping(); }
    }
  }, 15000);
  return () => {
    clearInterval(tick); clearInterval(heartbeat);
    for (const socket of clients.keys()) socket.terminate();
    wss.close();
  };
}
