import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, FIGHTER_IDS, idle, parseInput, type Input, type Player, type RoomState } from '../shared/game.js';
import { bodySize, createPlayer, createRoom, finishMatch, resetLobby, startMatch, stepRoom } from '../shared/simulation.js';

const DT = 1 / 60;

function fixture() {
  const a = createPlayer('a', 'Ada', 'kestrel', 'sun');
  const b = createPlayer('b', 'Bea', 'rivet', 'moon');
  const room = createRoom('ABCDEF', a.id);
  room.players.push(a, b);
  startMatch(room);
  room.phase = 'active';
  a.invulnerable = b.invulnerable = 0;
  return { room, a, b };
}

function tick(room: RoomState, frames = 1, commands = new Map<string, Input>()) {
  for (let frame = 0; frame < frames; frame++) stepRoom(room, commands, DT);
}

function onDeck(player: Player, x: number) {
  player.x = x;
  player.y = ARENA.platforms[0].y - bodySize(player).height / 2;
  player.vx = player.vy = 0;
  player.grounded = true;
  player.jumps = 0;
  player.invulnerable = 0;
}

test('input parser requires a valid sequence and boolean controls; it discards client position and damage', () => {
  const command = { type: 'input', seq: 0, ...idle(), right: true, x: 999999, damage: 0, stocks: 999 };
  assert.deepEqual(parseInput(command), { type: 'input', seq: 0, ...idle(), right: true });
  for (const seq of [-1, 0.5, Infinity, NaN, '1', undefined]) {
    assert.equal(parseInput({ ...command, seq }), null);
  }
  assert.equal(parseInput({ ...command, jump: 'true' }), null);
  assert.equal(parseInput(null), null);
});

test('all four fighters start with three personal stocks and a three-second countdown', () => {
  for (const fighter of FIGHTER_IDS) {
    const player = createPlayer(fighter, fighter, fighter, 'sun');
    const room = createRoom('ABCDEF', player.id);
    room.players.push(player, createPlayer('enemy', 'Enemy', 'kestrel', 'moon'));
    startMatch(room);
    assert.equal(player.stocks, 3);
    assert.equal(player.damage, 0);
    assert.equal(room.phase, 'countdown');
    assert.equal(room.countdown, 3);
    tick(room, 181);
    assert.equal(room.phase, 'active');
  }
});

test('gravity lands on solid geometry, jump has one air jump, and holding jump cannot fly', () => {
  const { room, a } = fixture();
  a.x = 760; a.y = 120; a.grounded = false; a.vx = a.vy = 0;
  tick(room, 100);
  assert.equal(a.grounded, true);
  assert.equal(a.y, ARENA.platforms[0].y - bodySize(a).height / 2);

  const jump = new Map([[a.id, { ...idle(), jump: true }]]);
  tick(room, 1, jump);
  assert.equal(a.grounded, false);
  assert.ok(a.vy < 0);
  const firstJumpCount = a.jumps;
  tick(room, 3, jump);
  assert.equal(a.jumps, firstJumpCount, 'holding jump must not consume or repeat jumps');
  tick(room);
  tick(room, 1, jump);
  assert.equal(a.jumps, 2);
  tick(room);
  const before = a.vy;
  tick(room, 1, jump);
  assert.ok(a.vy >= before, 'a third jump cannot apply an upward impulse');
});

test('down plus jump passes through a one-way platform but not the main deck', () => {
  const { room, a } = fixture();
  const platform = ARENA.platforms[1];
  a.x = platform.x + platform.width / 2;
  a.y = platform.y - bodySize(a).height / 2;
  a.vx = a.vy = 0; a.grounded = true; a.jumps = 0;
  tick(room, 18, new Map([[a.id, { ...idle(), down: true, jump: true }]]));
  assert.ok(a.y > platform.y, 'fighter must pass below the one-way platform');
  tick(room, 80);
  assert.equal(a.grounded, true);
  assert.equal(a.y, ARENA.platforms[0].y - bodySize(a).height / 2);
  tick(room, 20, new Map([[a.id, { ...idle(), down: true, jump: true }]]));
  assert.ok(a.y <= ARENA.platforms[0].y - bodySize(a).height / 2, 'solid deck must remain solid');
});

test('an attack obeys startup, hits each enemy once, and never damages a teammate', () => {
  const { room, a, b } = fixture();
  const ally = createPlayer('ally', 'Ally', 'kestrel', 'sun');
  room.players.push(ally);
  onDeck(a, 900); onDeck(b, 940); onDeck(ally, 940);
  a.facing = 1;
  tick(room, 1, new Map([[a.id, { ...idle(), attack: true }]]));
  assert.equal(b.damage, 0, 'startup must precede hit resolution');
  tick(room, 12);
  assert.ok(b.damage > 0);
  assert.ok(Math.abs(b.vx) > 0 || b.vy < 0, 'a hit must launch its victim');
  const damage = b.damage;
  tick(room, 35);
  assert.equal(b.damage, damage, 'the same attack activation cannot hit twice');
  assert.equal(ally.damage, 0);
  assert.ok(a.dealt > 0);
});

test('higher damage increases knockback and heavier fighters resist the same hit', () => {
  function launch(damage: number, fighter: 'kestrel' | 'rivet') {
    const { room, a, b } = fixture();
    b.fighter = fighter; b.damage = damage;
    onDeck(a, 900); onDeck(b, 940);
    tick(room, 1, new Map([[a.id, { ...idle(), attack: true }]]));
    for (let frame = 0; frame < 20; frame++) {
      tick(room);
      if (b.damage > damage) return Math.hypot(b.vx, b.vy);
    }
    throw new Error('Expected an enemy hit');
  }
  assert.ok(launch(140, 'kestrel') > launch(0, 'kestrel'));
  assert.ok(launch(100, 'kestrel') > launch(100, 'rivet'));
});

test('guard drains while held, reduces damage, and regenerates after release', () => {
  const { room, a, b } = fixture();
  onDeck(a, 900); onDeck(b, 940);
  tick(room, 10, new Map([[b.id, { ...idle(), guard: true }]]));
  assert.equal(b.guarding, true);
  assert.ok(b.guard < 100);
  tick(room, 1, new Map([[a.id, { ...idle(), attack: true }], [b.id, { ...idle(), guard: true }]]));
  tick(room, 15, new Map([[b.id, { ...idle(), guard: true }]]));
  assert.equal(b.damage, 0);
  const drained = b.guard;
  tick(room, 180);
  assert.ok(b.guard > drained);
  assert.ok(b.guard <= 100);
});

test('a ring-out costs one stock; respawn waits, clears damage, and grants protection', () => {
  const { room, a } = fixture();
  a.damage = 123;
  a.y = ARENA.bounds.bottom + 100;
  tick(room);
  assert.equal(a.stocks, 2);
  assert.ok(a.respawn > 0);
  tick(room, 30);
  assert.equal(a.stocks, 2, 'an inactive respawn cannot repeatedly lose stocks');
  tick(room, 100);
  assert.equal(a.respawn, 0);
  assert.equal(a.damage, 0);
  assert.ok(a.invulnerable > 0);
  assert.ok(a.x > ARENA.platforms[0].x && a.x < ARENA.platforms[0].x + ARENA.platforms[0].width);
  tick(room, 1, new Map([[a.id, { ...idle(), attack: true }]]));
  assert.equal(a.invulnerable, 0, 'attacking cancels spawn protection');
});

test('an eliminated teammate spectates while the team continues, and final stocks end the match', () => {
  const { room, a, b } = fixture();
  const ally = createPlayer('ally', 'Ally', 'wisp', 'sun');
  room.players.push(ally); onDeck(ally, 700);
  a.stocks = 1; a.y = ARENA.bounds.bottom + 100;
  tick(room);
  assert.equal(a.stocks, 0);
  assert.equal(room.phase, 'active');
  const eliminatedX = a.x;
  tick(room, 10, new Map([[a.id, { ...idle(), right: true, jump: true }]]));
  assert.equal(a.x, eliminatedX, 'eliminated fighters cannot act');
  ally.stocks = 1; ally.y = ARENA.bounds.bottom + 100;
  tick(room);
  assert.equal(room.phase, 'results'); assert.equal(room.winner, b.team);
});

test('simultaneous final ring-outs draw and timeout compares stocks before survivor damage', () => {
  const simultaneous = fixture();
  for (const p of [simultaneous.a, simultaneous.b]) { p.stocks = 1; p.y = ARENA.bounds.bottom + 100; }
  tick(simultaneous.room);
  assert.equal(simultaneous.room.winner, 'draw');

  const { room, a, b } = fixture();
  a.stocks = 2; b.stocks = 1; a.damage = 190; b.damage = 0;
  finishMatch(room, 'Time expired'); assert.equal(room.winner, 'sun');
  room.phase = 'active'; a.stocks = b.stocks = 1; a.damage = 20; b.damage = 10;
  finishMatch(room, 'Time expired'); assert.equal(room.winner, 'moon');
  room.phase = 'active'; a.damage = b.damage;
  finishMatch(room, 'Time expired'); assert.equal(room.winner, 'draw');
});

test('rematch clears match resources and returns the same players to an unready lobby', () => {
  const { room, a, b } = fixture();
  a.damage = 99; a.stocks = 1; a.ready = b.ready = true;
  finishMatch(room, 'Time expired');
  resetLobby(room);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.players.length, 2);
  assert.equal(a.ready, false); assert.equal(b.ready, false);
  assert.equal(room.winner, null);
  assert.equal(room.projectiles.length, 0); assert.equal(room.fields.length, 0);
});

test('recovery and air dodge are once per airtime and landing refreshes both', () => {
  const { room, a } = fixture();
  a.x = 760; a.y = 610; a.grounded = false; a.vy = 0; a.jumps = 2;
  tick(room, 1, new Map([[a.id, { ...idle(), up: true, special: true }]]));
  assert.equal(a.recoveryUsed, true); assert.ok(a.vy < -700);
  tick(room, 30);
  const before = a.vy;
  tick(room, 1, new Map([[a.id, { ...idle(), up: true, special: true }]]));
  assert.ok(a.vy >= before, 'recovery cannot be used again in the same airtime');
  tick(room);
  tick(room, 1, new Map([[a.id, { ...idle(), guard: true, right: true }]]));
  assert.equal(a.airDodgeUsed, true); assert.ok(a.dodge > 0);
  // Keep this airborne interval outside every platform's horizontal footprint.
  a.x = 100; a.y = -100; a.vx = a.vy = 0;
  tick(room, 55);
  tick(room, 1, new Map([[a.id, { ...idle(), guard: true, left: true }]]));
  assert.equal(a.dodge, 0, 'air dodge cannot repeat before landing');
  a.x = 760; a.y = 650; a.vy = 100; a.vx = 0;
  tick(room, 30);
  assert.equal(a.grounded, true);
  assert.equal(a.airDodgeUsed, false); assert.equal(a.recoveryUsed, false);
});

test('charged cannon passes through allies, hits an enemy once, and disappears', () => {
  const { room, a, b } = fixture();
  const ally = createPlayer('ally', 'Ally', 'kestrel', 'sun');
  room.players.push(ally);
  onDeck(a, 800); onDeck(ally, 880); onDeck(b, 1030);
  tick(room, 30, new Map([[a.id, { ...idle(), special: true }]]));
  assert.ok(a.charge > 0);
  tick(room, 7);
  assert.ok(room.projectiles.some(p => p.kind === 'shot'));
  tick(room, 25);
  assert.ok(b.damage > 15, 'charge must increase cannon damage');
  assert.equal(ally.damage, 0);
  const damage = b.damage;
  tick(room, 60);
  assert.equal(b.damage, damage);
  assert.equal(room.projectiles.length, 0);
});

test('Wisp counter retaliates during its window and Morrow keeps a single temporary slow field', () => {
  const counter = fixture();
  counter.b.fighter = 'wisp';
  onDeck(counter.a, 900); onDeck(counter.b, 940);
  tick(counter.room, 1, new Map([[counter.b.id, { ...idle(), down: true, special: true }]]));
  tick(counter.room, 1, new Map([[counter.a.id, { ...idle(), attack: true }]]));
  tick(counter.room, 9);
  assert.equal(counter.b.damage, 0); assert.ok(counter.a.damage > 0);

  const field = fixture();
  field.a.fighter = 'morrow'; onDeck(field.a, 900); onDeck(field.b, 1000);
  tick(field.room, 1, new Map([[field.a.id, { ...idle(), down: true, special: true }]]));
  tick(field.room, 18);
  assert.equal(field.room.fields.length, 1);
  tick(field.room, 140);
  tick(field.room, 1, new Map([[field.a.id, { ...idle(), down: true, special: true }]]));
  tick(field.room, 18);
  assert.equal(field.room.fields.length, 1, 'refresh replaces the prior field');
  field.a.y = ARENA.bounds.bottom + 50;
  tick(field.room);
  assert.equal(field.room.fields.length, 0, 'losing a stock removes owned fields');
});

test('ring-out attribution credits the last enemy and another recent attacker an assist', () => {
  const { room, a, b } = fixture();
  const ally = createPlayer('ally', 'Ally', 'kestrel', 'sun');
  room.players.push(ally);
  onDeck(a, 900); onDeck(b, 940); onDeck(ally, 870);
  tick(room, 1, new Map([[a.id, { ...idle(), attack: true }]]));
  tick(room, 15);
  assert.ok(b.damage > 0);
  tick(room, 40);
  onDeck(b, 940); onDeck(ally, 900); onDeck(a, 700);
  tick(room, 1, new Map([[ally.id, { ...idle(), attack: true }]]));
  tick(room, 15);
  assert.ok(ally.dealt > 0);
  b.y = ARENA.bounds.bottom + 10;
  tick(room);
  assert.equal(ally.kos, 1); assert.equal(a.assists, 1);
});

test('training has no clock loss, endlessly restores stocks, and respects pause', () => {
  const { room, a } = fixture();
  room.training = true;
  const remaining = room.remaining;
  tick(room, 120);
  assert.equal(room.remaining, remaining);
  a.y = ARENA.bounds.bottom + 10;
  tick(room); assert.equal(a.stocks, 3); assert.ok(a.respawn > 0);
  room.paused = true;
  const respawn = a.respawn;
  const previousTick = room.tick;
  tick(room, 120);
  assert.equal(room.tick, previousTick); assert.equal(a.respawn, respawn);
});

test('walking off the deck leaves one air jump rather than two', () => {
  const { room, a } = fixture();
  onDeck(a, 1590);
  tick(room, 24, new Map([[a.id, { ...idle(), right: true, down: true }]]));
  assert.equal(a.grounded, false);
  assert.equal(a.jumps, 1, 'the ground jump is spent when leaving solid ground');
  tick(room, 1, new Map([[a.id, { ...idle(), jump: true }]]));
  assert.equal(a.jumps, 2); assert.ok(a.vy < 0);
  tick(room);
  const before = a.vy;
  tick(room, 1, new Map([[a.id, { ...idle(), jump: true }]]));
  assert.ok(a.vy >= before, 'walking off cannot grant a third total jump');
});

test('jumping from a ledge safely refreshes aerial resources before the new jump', () => {
  const { room, a } = fixture();
  a.x = 308; a.y = 738; a.ledge = 0.8; a.grounded = false;
  a.vx = a.vy = 0; a.jumps = 2; a.recoveryUsed = a.airDodgeUsed = true;
  tick(room, 1, new Map([[a.id, { ...idle(), jump: true }]]));
  assert.equal(a.ledge, 0);
  assert.ok(a.x > ARENA.platforms[0].x);
  assert.ok(a.vy < 0);
  assert.equal(a.jumps, 1);
  assert.equal(a.recoveryUsed, false); assert.equal(a.airDodgeUsed, false);
});

test('equal-frame attacks trade equally regardless of room membership order', () => {
  for (const reverse of [false, true]) {
    const { room, a, b } = fixture();
    b.fighter = 'kestrel';
    onDeck(a, 900); onDeck(b, 940);
    a.facing = 1; b.facing = -1;
    if (reverse) room.players.reverse();
    tick(room, 1, new Map([[a.id, { ...idle(), attack: true }], [b.id, { ...idle(), attack: true }]]));
    tick(room, 12);
    assert.equal(a.damage, 9); assert.equal(b.damage, 9);
  }
});

test('guard on the impact tick protects regardless of room membership order', () => {
  for (const reverse of [false, true]) {
    const { room, a, b } = fixture();
    onDeck(a, 900); onDeck(b, 940); a.facing = 1;
    if (reverse) room.players.reverse();
    tick(room, 1, new Map([[a.id, { ...idle(), attack: true }]]));
    // Begin guarding on the first active simulation tick.
    while (a.attack && a.attack.age + DT < a.attack.startup) tick(room);
    tick(room, 1, new Map([[b.id, { ...idle(), guard: true }]]));
    assert.equal(b.damage, 0);
    assert.ok(b.guard < 90, 'the incoming attack must have been blocked');
  }
});
