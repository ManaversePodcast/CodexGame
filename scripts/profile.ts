/** Repeatable CPU/snapshot diagnostic; not a network or browser performance claim. */
import { performance } from 'node:perf_hooks';
import { createRoom, createPlayer, startMatch, stepRoom } from '../shared/simulation.js';
import { FIGHTER_IDS, idle, type Input } from '../shared/game.js';
const room = createRoom('PROFILE', 'p0');
for (let i = 0; i < 10; i++) room.players.push(createPlayer(`p${i}`, `Pilot ${i + 1}`, FIGHTER_IDS[i % 4], i < 5 ? 'sun' : 'moon'));
startMatch(room); room.phase = 'active';
const times: number[] = [];
let bytes = 0, samples = 0;
const inputs = new Map<string, Input>();
for (let tick = 0; tick < 3600; tick++) {
  for (let i = 0; i < 10; i++) {
    const p = room.players[i];
    const toward = p.x < 960;
    inputs.set(p.id, { ...idle(), left: !toward, right: toward, jump: tick % (100 + i) === 0,
      up: tick % 240 < 60, down: tick % 240 >= 180, attack: tick % 30 === 0, special: tick % 90 === 0, guard: tick % 150 > 130 });
  }
  if (room.phase === 'results') { startMatch(room); room.phase = 'active'; }
  const start = performance.now(); stepRoom(room, inputs); times.push(performance.now() - start);
  if (tick % 3 === 0) { bytes += Buffer.byteLength(JSON.stringify({ type: 'state', room })); samples++; }
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ scenario: '60 simulated seconds, 10 fighters with movement/attacks; no real sockets',
  node: process.version, ticks: times.length, p50TickMs: +times[Math.floor(times.length * 0.5)].toFixed(3),
  p95TickMs: +times[Math.floor(times.length * 0.95)].toFixed(3), maxTickMs: +times.at(-1)!.toFixed(3),
  averageSnapshotBytes: Math.round(bytes / samples), estimatedPerClientKBpsAt20Hz: +(bytes / samples * 20 / 1024).toFixed(1),
  rssMB: +(process.memoryUsage().rss / 1024 / 1024).toFixed(1) }, null, 2));
