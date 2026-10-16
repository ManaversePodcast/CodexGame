import { ARENA, FIGHTERS, MATCH_SECONDS, idle, type AttackView, type FighterId, type Input, type Player, type RoomState, type Team, type Projectile } from './game.js';

const GRAVITY = 1580;
const DT = 1 / 60;
interface Runtime {
  previous: Input; hit: Set<string>; emitted: boolean; drop: number; dodgeLock: number; guardDelay: number;
  ledgeUsed: boolean; lastDamage: Map<string, number>; lastAttacker: string;
}
const runtimes = new WeakMap<Player, Runtime>();
const clocks = new WeakMap<RoomState, { time: number; id: number }>();
function runtime(p: Player): Runtime {
  let value = runtimes.get(p);
  if (!value) { value = { previous: idle(), hit: new Set(), emitted: false, drop: 0, dodgeLock: 0, guardDelay: 0, ledgeUsed: false, lastDamage: new Map(), lastAttacker: '' }; runtimes.set(p, value); }
  return value;
}
function clock(room: RoomState) {
  let value = clocks.get(room);
  if (!value) { value = { time: 0, id: 0 }; clocks.set(room, value); }
  return value;
}
export const bodySize = (p: Player) => p.fighter === 'rivet' ? { width: 32, height: 44 } : { width: 24, height: 40 };
export function createPlayer(id: string, name: string, fighter: FighterId = 'kestrel', team: Team = 'sun'): Player {
  return { id, name, fighter, team, ready: false, connected: true, spectator: false,
    x: 600, y: 700, vx: 0, vy: 0, facing: team === 'sun' ? 1 : -1, grounded: true, jumps: 0,
    damage: 0, stocks: 3, guard: 100, guarding: false, dodge: 0, recoveryUsed: false, airDodgeUsed: false,
    invulnerable: 0, stun: 0, respawn: 0, cooldown: 0, attack: null, ledge: 0, charge: 0, ack: -1,
    kos: 0, assists: 0, dealt: 0, falls: 0 };
}
export function createRoom(code: string, host: string, training = false): RoomState {
  return { code, host, phase: 'lobby', countdown: 0, remaining: MATCH_SECONDS, tick: 0, training, paused: false,
    players: [], projectiles: [], fields: [], events: [], winner: null, reason: '' };
}
function spawn(room: RoomState, p: Player, protection: number) {
  const peers = room.players.filter(q => q.team === p.team && !q.spectator);
  const index = Math.max(0, peers.indexOf(p));
  const size = bodySize(p);
  p.x = p.id.startsWith('dummy-') ? 1040 : p.team === 'sun' ? 515 + index * 65 : 1405 - index * 65;
  p.y = 720 - size.height / 2;
  p.vx = 0; p.vy = 0; p.facing = p.team === 'sun' ? 1 : -1; p.grounded = true; p.jumps = 0;
  p.damage = 0; p.guard = 100; p.guarding = false; p.dodge = 0; p.invulnerable = protection;
  p.stun = 0; p.respawn = 0; p.cooldown = 0; p.attack = null; p.recoveryUsed = false; p.airDodgeUsed = false; p.ledge = 0; p.charge = 0;
  runtimes.delete(p);
}
export function startMatch(room: RoomState) {
  room.phase = 'countdown'; room.countdown = 3; room.remaining = MATCH_SECONDS; room.winner = null; room.reason = ''; room.paused = false;
  room.projectiles = []; room.fields = []; room.events = []; clocks.set(room, { time: 0, id: clock(room).id });
  for (const p of room.players) {
    if (p.spectator) { p.stocks = 0; continue; }
    p.stocks = 3; p.kos = 0; p.assists = 0; p.dealt = 0; p.falls = 0;
    spawn(room, p, 1);
  }
}
export function resetLobby(room: RoomState) {
  room.phase = 'lobby'; room.winner = null; room.reason = ''; room.paused = false; room.countdown = 0; room.remaining = MATCH_SECONDS;
  room.projectiles = []; room.fields = []; room.events = [];
  // Spectators take an open team slot only in the lobby, never mid-match.
  for (const p of room.players) {
    if (p.spectator && room.players.filter(q => !q.spectator && q.team === p.team).length < 5) p.spectator = false;
    p.ready = p.id.startsWith('dummy-'); p.stocks = p.spectator ? 0 : 3; p.damage = 0; p.attack = null;
    p.vx = p.vy = 0; p.charge = 0; p.ack = -1; runtimes.delete(p);
  }
}
export function finishMatch(room: RoomState, reason = 'Time limit') {
  if (room.phase !== 'active') return;
  const lives = (team: Team) => room.players.filter(p => p.team === team).reduce((sum, p) => sum + p.stocks, 0);
  const damage = (team: Team) => room.players.filter(p => p.team === team && p.stocks > 0).reduce((sum, p) => sum + p.damage, 0);
  const sun = lives('sun'), moon = lives('moon');
  room.winner = sun !== moon ? (sun > moon ? 'sun' : 'moon') : damage('sun') !== damage('moon') ? (damage('sun') < damage('moon') ? 'sun' : 'moon') : 'draw';
  room.phase = 'results'; room.reason = reason; room.projectiles = []; room.fields = []; room.paused = false;
  for (const p of room.players) { p.attack = null; p.guarding = false; p.charge = 0; }
}
function event(room: RoomState, kind: 'hit' | 'ko' | 'guard' | 'respawn', p: Player, text: string) {
  room.events.push({ id: ++clock(room).id, kind, x: p.x, y: p.y, text, team: p.team });
  if (room.events.length > 12) room.events.shift();
}
function loseLife(room: RoomState, p: Player) {
  p.stocks = room.training ? 3 : Math.max(0, p.stocks - 1);
  p.falls++; p.respawn = p.stocks ? 2 : 0; p.attack = null; p.charge = 0; p.ledge = 0;
  p.guarding = false; p.vx = p.vy = 0;
  room.projectiles = room.projectiles.filter(q => q.owner !== p.id); room.fields = room.fields.filter(q => q.owner !== p.id);
  const rt = runtime(p), now = clock(room).time;
  const credit = room.players.find(q => q.id === rt.lastAttacker && q.team !== p.team && now - (rt.lastDamage.get(q.id) ?? -Infinity) <= 10);
  if (credit) {
    credit.kos++;
    for (const q of room.players) if (q.id !== credit.id && q.team !== p.team && now - (rt.lastDamage.get(q.id) ?? -Infinity) <= 10) q.assists++;
  }
  event(room, 'ko', p, credit ? `${credit.name} → ${p.name}` : `${p.name} fell`);
}
function beginAttack(p: Player, kind: string, dx: number, dy: number, damage: number, reach: number, startup: number, active: number, recovery: number) {
  p.attack = { kind, age: 0, dx, dy, damage, reach, startup, active, total: startup + active + recovery };
  p.invulnerable = 0; p.guarding = false;
  const rt = runtime(p); rt.hit.clear(); rt.emitted = false;
}
function direction(p: Player, input: Input) {
  if (input.up) return { dx: 0, dy: -1, label: 'up' };
  if (input.down) return { dx: 0, dy: 1, label: 'down' };
  return { dx: p.facing, dy: 0, label: input.left || input.right ? 'forward' : 'neutral' };
}
function attack(p: Player, input: Input) {
  const f = FIGHTERS[p.fighter], dir = direction(p, input);
  const aerial = !p.grounded;
  const damage = f.damage * (dir.label === 'up' ? 0.9 : dir.label === 'down' ? 1.1 : dir.label === 'forward' ? 1.15 : 1);
  beginAttack(p, `${aerial ? 'air' : 'ground'}-${dir.label}`, dir.dx, dir.dy, damage, f.reach, f.startup / 60, 0.1, f.recoveryFrames / 60);
}
function projectile(room: RoomState, p: Player, kind: Projectile['kind'], damage: number, speed: number, radius: number, life: number, vy = 0) {
  if (room.projectiles.filter(q => q.owner === p.id).length >= 3) return;
  room.projectiles.push({ id: ++clock(room).id, owner: p.id, team: p.team, x: p.x + p.facing * 25, y: p.y - 4, vx: p.facing * speed, vy, radius, life, kind, damage });
}
function special(room: RoomState, p: Player, input: Input) {
  const f = FIGHTERS[p.fighter];
  if (input.up) {
    if (p.recoveryUsed) return;
    p.recoveryUsed = true; p.grounded = false; p.jumps = 2; p.ledge = 0;
    p.vy = -f.recovery; p.vx = (Number(input.right) - Number(input.left)) * (p.fighter === 'rivet' ? 130 : 370);
    beginAttack(p, 'recovery', 0, -1, f.damage, 57, 0, 0.25, 0.22); return;
  }
  if (p.cooldown > 0) return;
  const side = input.left || input.right;
  p.cooldown = input.down ? 2.5 : 0.85;
  if (p.fighter === 'kestrel') {
    if (input.down) beginAttack(p, 'pulse', 0, 1, 13, 115, 0.2, 0.12, 0.3);
    else if (side) { p.vx = p.facing * 690; beginAttack(p, 'dash', p.facing, 0, 11, 60, 0.03, 0.18, 0.25); }
    else { p.charge = DT; p.invulnerable = 0; }
  } else if (p.fighter === 'rivet') {
    if (input.down) beginAttack(p, 'shockwave', p.facing, 0, 16, 70, 0.3, 0.1, 0.4);
    else if (side) beginAttack(p, 'pull', p.facing, 0, 6, 175, 0.22, 0.14, 0.4);
    else beginAttack(p, 'hammer', p.facing, 0, 22, 112, 0.27, 0.13, 0.42);
  } else if (p.fighter === 'wisp') {
    if (input.down) beginAttack(p, 'counter', p.facing, 0, 15, 70, 0, 0.22, 0.48);
    else if (side) { p.vx = p.facing * 850; beginAttack(p, 'blink', p.facing, 0, 10, 65, 0.04, 0.14, 0.2); }
    else beginAttack(p, 'blades', p.facing, 0, 10, 80, 0.06, 0.1, 0.18);
  } else {
    if (input.down) beginAttack(p, 'field', 0, 1, 0, 0, 0.24, 0.05, 0.25);
    else if (side) beginAttack(p, 'burst', p.facing, 0, 18, 95, 0.45, 0.12, 0.3);
    else beginAttack(p, 'shard', p.facing, 0, 12, 50, 0.15, 0.1, 0.25);
  }
}
function hurt(room: RoomState, victim: Player, attacker: Player, damage: number, dx: number, dy: number, pulling = false, countered = false) {
  if (victim.team === attacker.team || victim.spectator || !victim.stocks || victim.respawn > 0 || victim.invulnerable > 0 || victim.dodge > 0.12) return;
  if (!countered && victim.attack?.kind === 'counter' && victim.attack.age <= 0.22) {
    victim.attack = null; victim.invulnerable = 0.2;
    hurt(room, attacker, victim, 17, -dx, -0.65, false, true); event(room, 'guard', victim, 'COUNTER'); return;
  }
  if (victim.guarding) {
    victim.guard = Math.max(0, victim.guard - damage * 2.7); runtime(victim).guardDelay = 1;
    event(room, 'guard', victim, victim.guard <= 0 ? 'GUARD BREAK' : 'BLOCK');
    if (victim.guard <= 0) { victim.stun = 1; victim.guarding = false; }
    return;
  }
  const force = Math.min(1750, (225 + damage * 15 + (victim.damage + damage) * 6) / FIGHTERS[victim.fighter].weight);
  victim.damage = Math.min(999, victim.damage + damage); attacker.dealt += damage;
  victim.vx = dx * force * (pulling ? -0.65 : 1);
  victim.vy = dy === 0 ? -force * 0.48 : dy * force * 0.9;
  victim.stun = Math.min(0.64, 0.12 + force / 2600); victim.grounded = false; victim.ledge = 0;
  victim.attack = null; victim.charge = 0; victim.invulnerable = 0.085;
  const rt = runtime(victim); rt.lastAttacker = attacker.id; rt.lastDamage.set(attacker.id, clock(room).time);
  event(room, 'hit', victim, `${Math.round(damage)}`);
}
function attackHits(room: RoomState, p: Player, a: AttackView) {
  if (a.kind === 'counter' || a.kind === 'field' || a.kind === 'cannon' || a.kind === 'shard' || a.kind === 'shockwave') return;
  const rt = runtime(p);
  for (const q of room.players) {
    if (q.team === p.team || q.id === p.id || rt.hit.has(q.id)) continue;
    const dx = q.x - p.x, dy = q.y - p.y;
    const radial = a.kind === 'pulse' || a.kind === 'burst' || a.kind === 'hammer' || a.kind === 'blades';
    const inRange = radial ? Math.hypot(dx, dy) < a.reach + 12 : a.dy ? Math.abs(dx) < 40 && dy * a.dy > -15 && Math.abs(dy) < a.reach + 20 : Math.abs(dy) < 40 && dx * a.dx > -12 && Math.abs(dx) < a.reach + 12;
    if (inRange) { rt.hit.add(q.id); hurt(room, q, p, a.damage, radial ? (dx >= 0 ? 1 : -1) : a.dx, a.kind === 'pulse' ? -0.7 : a.dy, a.kind === 'pull'); }
  }
}
function movePhysics(p: Player, input: Input, dt: number) {
  const rt = runtime(p), size = bodySize(p), halfW = size.width / 2, halfH = size.height / 2;
  const oldX = p.x, oldY = p.y;
  p.vy = Math.min(1050, p.vy + GRAVITY * dt);
  p.x += p.vx * dt; p.y += p.vy * dt; p.grounded = false;
  for (const platform of ARENA.platforms) {
    if (!platform.solid && rt.drop > 0) continue;
    const overlapX = p.x + halfW > platform.x && p.x - halfW < platform.x + platform.width;
    if (overlapX && p.vy >= 0 && oldY + halfH <= platform.y + 1 && p.y + halfH >= platform.y) {
      p.y = platform.y - halfH; p.vy = 0; p.grounded = true;
      p.jumps = 0; p.airDodgeUsed = false; p.recoveryUsed = false; rt.ledgeUsed = false;
    } else if (platform.solid) {
      if (overlapX && p.vy < 0 && oldY - halfH >= platform.y + platform.height && p.y - halfH <= platform.y + platform.height) {
        p.y = platform.y + platform.height + halfH; p.vy = 0;
      }
      if (p.y + halfH > platform.y + 2 && p.y - halfH < platform.y + platform.height) {
        if (oldX + halfW <= platform.x && p.x + halfW >= platform.x) { p.x = platform.x - halfW; p.vx = 0; }
        if (oldX - halfW >= platform.x + platform.width && p.x - halfW <= platform.x + platform.width) { p.x = platform.x + platform.width + halfW; p.vx = 0; }
      }
    }
  }
  if (!p.grounded && p.vy > 0 && !rt.ledgeUsed && !input.down && p.stun <= 0 && p.y > 716 && p.y < 770) {
    const edge = p.x < 320 && p.x > 285 ? 320 : p.x > 1600 && p.x < 1635 ? 1600 : 0;
    if (edge) { p.ledge = 0.8; p.x = edge + (edge === 320 ? -halfW : halfW); p.y = 738; p.vx = p.vy = 0; p.invulnerable = 0.45; rt.ledgeUsed = true; }
  }
  // Leaving safe ground consumes the ground jump, including walk-offs and launches.
  if (!p.grounded && p.jumps === 0) p.jumps = 1;
}
function updatePlayer(room: RoomState, p: Player, supplied: Input, dt: number) {
  const rt = runtime(p), f = FIGHTERS[p.fighter];
  const input = p.connected ? supplied : idle();
  const previous = rt.previous; rt.previous = { ...input };
  if (p.spectator || p.stocks <= 0) return;
  if (p.respawn > 0) {
    p.respawn = Math.max(0, p.respawn - dt);
    if (!p.respawn) { spawn(room, p, 2); event(room, 'respawn', p, 'RETURN'); }
    return;
  }
  for (const key of ['invulnerable', 'stun', 'cooldown', 'dodge'] as const) p[key] = Math.max(0, p[key] - dt);
  rt.drop = Math.max(0, rt.drop - dt); rt.dodgeLock = Math.max(0, rt.dodgeLock - dt); rt.guardDelay = Math.max(0, rt.guardDelay - dt);
  const jump = input.jump && !previous.jump, attackPressed = input.attack && !previous.attack, specialPressed = input.special && !previous.special;
  const axis = Number(input.right) - Number(input.left);
  if (p.ledge > 0) {
    p.ledge = Math.max(0, p.ledge - dt);
    if (jump || (p.x < 960 ? input.right : input.left)) {
      p.x = p.x < 960 ? 348 : 1572; p.y = 720 - bodySize(p).height / 2;
      p.ledge = 0; p.grounded = true; p.jumps = 0; p.recoveryUsed = false; p.airDodgeUsed = false; rt.ledgeUsed = false;
      // Climbing to safe ground refreshes resources; merely hanging never does.
      if (!jump) return;
    } else if (input.down || p.ledge <= 0) { p.ledge = 0; p.y += 32; }
    else return;
  }
  p.guarding = input.guard && p.grounded && p.stun <= 0 && !p.attack && p.charge === 0 && axis === 0 && p.guard > 0;
  if (p.guarding) {
    p.guard = Math.max(0, p.guard - 16 * dt); rt.guardDelay = 0.7;
    if (p.guard === 0) { p.stun = 1; p.guarding = false; event(room, 'guard', p, 'GUARD BREAK'); }
  } else if (!rt.guardDelay) p.guard = Math.min(100, p.guard + 25 * dt);
  if (p.stun <= 0) {
    if (axis && !p.attack && !p.charge) p.facing = axis;
    if (input.guard && !previous.guard && !p.attack && !p.charge && !rt.dodgeLock && (axis || !p.grounded) && (p.grounded || !p.airDodgeUsed)) {
      if (!p.grounded) p.airDodgeUsed = true;
      p.dodge = 0.32; rt.dodgeLock = 0.8; p.guarding = false;
      p.vx = (axis || p.facing) * 480; if (!p.grounded) p.vy *= 0.25;
    }
    if (jump && !p.attack && p.charge === 0 && !p.guarding && !p.dodge) {
      const platform = ARENA.platforms.find(q => !q.solid && Math.abs(p.y + bodySize(p).height / 2 - q.y) < 3);
      if (input.down && p.grounded && platform) { rt.drop = 0.27; p.y += 4; p.vy = 80; p.grounded = false; }
      else if (p.grounded || p.jumps < 2) { p.vy = -f.jump; p.jumps = p.grounded ? 1 : p.jumps + 1; p.grounded = false; }
    }
    if (!input.jump && previous.jump && p.vy < -230 && !p.attack) p.vy *= 0.55;
    if (p.charge > 0) {
      p.charge = Math.min(0.85, p.charge + dt);
      if (!input.special || p.charge >= 0.85) {
        const amount = p.charge;
        beginAttack(p, 'cannon', p.facing, 0, 8 + amount * 19, 50, 0.06, 0.08, 0.26);
        // Store shot charge as reach for deterministic emission; visual charge is cleared.
        p.attack!.reach = 50 + amount * 50; p.charge = 0;
      }
    }
    if (!p.attack && p.charge === 0 && !p.dodge && !p.guarding) {
      if (specialPressed) special(room, p, input);
      else if (attackPressed) attack(p, input);
    }
  }
  const dash = p.attack && ['dash', 'blink'].includes(p.attack.kind) && p.attack.age < p.attack.startup + p.attack.active;
  if (p.stun <= 0 && !p.dodge && !dash) {
    const slow = room.fields.some(q => q.team !== p.team && Math.hypot(q.x - p.x, q.y - p.y) < q.radius) ? 0.6 : 1;
    const target = axis * f.speed * slow * (p.guarding ? 0 : p.charge ? 0.3 : p.attack ? 0.5 : input.down && p.grounded ? 0.4 : 1);
    const acceleration = p.grounded ? 2400 : 1050;
    p.vx += Math.max(-acceleration * dt, Math.min(acceleration * dt, target - p.vx));
  } else if (p.stun > 0) {
    // Small directional influence while launched; no position authority on clients.
    p.vx += axis * 180 * dt;
  }
  movePhysics(p, input, dt);
  const a = p.attack;
  if (a) {
    a.age += dt;
    if (a.age >= a.startup && a.age <= a.startup + a.active) {
      if (!rt.emitted) {
        rt.emitted = true;
        if (a.kind === 'cannon') projectile(room, p, 'shot', a.damage, 660, a.damage > 17 ? 12 : 8, 0.85);
        if (a.kind === 'shard') projectile(room, p, 'shard', a.damage, 490, 10, 1.2, -230);
        if (a.kind === 'shockwave') { projectile(room, p, 'wave', a.damage, 500, 15, 0.8); }
        if (a.kind === 'field') {
          room.fields = room.fields.filter(q => q.owner !== p.id);
          room.fields.push({ id: ++clock(room).id, owner: p.id, team: p.team, x: p.x, y: p.y + 20, radius: 125, life: 3 });
        }
      }
    }
    if (a.age >= a.total) p.attack = null;
  }
}
export function stepRoom(room: RoomState, inputs: Map<string, Input>, dt = DT) {
  if (room.paused) return;
  room.tick++;
  if (room.phase === 'countdown') {
    room.countdown = Math.max(0, room.countdown - dt);
    if (room.countdown <= 0.00001) { room.countdown = 0; room.phase = 'active'; }
    return;
  }
  if (room.phase !== 'active') return;
  clock(room).time += dt;
  if (!room.training) room.remaining = Math.max(0, room.remaining - dt);
  for (const p of room.players) updatePlayer(room, p, inputs.get(p.id) ?? idle(), dt);
  // Advance everyone before resolving hits. Capture active attacks so equal-frame
  // strikes trade instead of granting the first room member an ordering advantage.
  const activeAttacks = room.players.flatMap(p => p.attack && p.attack.age >= p.attack.startup && p.attack.age <= p.attack.startup + p.attack.active ? [{ player: p, attack: p.attack }] : []);
  for (const { player, attack } of activeAttacks) attackHits(room, player, attack);
  for (const q of room.projectiles) {
    q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    if (q.kind === 'shard') q.vy += 450 * dt;
    const owner = room.players.find(p => p.id === q.owner);
    if (!owner || !owner.stocks || owner.respawn > 0) { q.life = 0; continue; }
    for (const p of room.players) {
      if (p.team === q.team || p.spectator || !p.stocks || p.respawn || p.invulnerable > 0) continue;
      if (Math.abs(q.x - p.x) < q.radius + bodySize(p).width / 2 && Math.abs(q.y - p.y) < q.radius + bodySize(p).height / 2) {
        hurt(room, p, owner, q.damage, Math.sign(q.vx), 0); q.life = 0; break;
      }
    }
    if (ARENA.platforms.some(p => p.solid && q.x > p.x && q.x < p.x + p.width && q.y > p.y && q.y < p.y + p.height)) q.life = 0;
  }
  room.projectiles = room.projectiles.filter(q => q.life > 0 && q.x > ARENA.bounds.left && q.x < ARENA.bounds.right && q.y > ARENA.bounds.top && q.y < ARENA.bounds.bottom);
  for (const q of room.fields) q.life -= dt;
  room.fields = room.fields.filter(q => q.life > 0 && room.players.some(p => p.id === q.owner && p.stocks > 0 && !p.respawn));
  for (const p of room.players) {
    if (!p.spectator && p.stocks > 0 && !p.respawn && (p.x < ARENA.bounds.left || p.x > ARENA.bounds.right || p.y < ARENA.bounds.top || p.y > ARENA.bounds.bottom)) loseLife(room, p);
  }
  if (!room.training) {
    const lives = (team: Team) => room.players.filter(p => p.team === team).reduce((sum, p) => sum + p.stocks, 0);
    if (!lives('sun') || !lives('moon')) finishMatch(room, 'Team eliminated');
    else if (room.remaining <= 0) finishMatch(room, 'Time limit');
  }
}
