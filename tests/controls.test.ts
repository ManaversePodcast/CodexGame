import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idle } from '../shared/game.js';
import { TapJumpController } from '../src/controls.js';
import { fighterFrame, FRAMES, POSES } from '../src/fighter-art.js';
import { createPlayer } from '../shared/simulation.js';

test('keyboard tap-up jumps once, preserves short taps, and can be disabled', () => {
  const c = new TapJumpController(), up = { ...idle(), up: true };
  assert.equal(c.read(up, idle(), true, false, 0).jump, false);
  assert.equal(c.read(up, idle(), true, false, 41).jump, true);
  assert.equal(c.read(up, idle(), true, false, 500).jump, true, 'holding is one sustained jump input, not pulses');
  assert.equal(c.read(idle(), idle(), true, false, 510).jump, false);
  assert.equal(c.read(up, idle(), true, false, 520).jump, false);
  assert.equal(c.read(idle(), idle(), true, false, 530).jump, false);
  assert.equal(c.read(idle(), idle(), true, false, 561).jump, true, 'a brief tap survives release during chord grace');
  assert.equal(c.read(idle(), idle(), true, false, 580).jump, false);
  c.reset();
  assert.equal(c.read(up, idle(), false, false, 0).jump, false);
  assert.equal(c.read(up, idle(), false, false, 100).jump, false);
  assert.equal(c.read({ ...up, jump: true }, idle(), false, false, 110).jump, true, 'Space remains independent');
});

test('up aiming chords suppress tap jump and do not jump when the action is released', () => {
  for (const action of ['special', 'attack', 'guard'] as const) {
    const c = new TapJumpController();
    c.read({ ...idle(), up: true }, idle(), true, false, 0);
    const chord = c.read({ ...idle(), up: true, [action]: true }, idle(), true, false, 15);
    assert.equal(chord.jump, false); assert.equal(chord.up, true); assert.equal(chord[action], true);
    assert.equal(c.read({ ...idle(), up: true }, idle(), true, false, 100).jump, false);
  }
});

test('gamepad tap-up is optional and losing focus can reset pending jumps', () => {
  const c = new TapJumpController(), up = { ...idle(), up: true };
  c.read(idle(), up, true, false, 0);
  assert.equal(c.read(idle(), up, true, false, 100).jump, false);
  c.reset(); c.read(idle(), up, true, true, 0);
  assert.equal(c.read(idle(), up, true, true, 41).jump, true);
  c.reset();
  assert.equal(c.read(idle(), idle(), true, true, 100).jump, false);
});

test('fighter animation uses authoritative attack phases and leaves hitbox tuning untouched', () => {
  const p = createPlayer('a', 'Ada');
  p.attack = { kind: 'ground-up', age: 0.05, startup: 0.2, active: 0.1, total: 0.6, dx: 0, dy: -1, damage: 9, reach: 64 };
  const pose = () => POSES[Math.floor(fighterFrame(p, 10) / FRAMES)];
  assert.equal(pose(), 'up-start');
  p.attack.age = 0.24; assert.equal(pose(), 'up-hit');
  p.attack.age = 0.4; assert.equal(pose(), 'up-end');
  assert.equal(p.attack.reach, 64); assert.equal(p.attack.damage, 9);
  p.attack = null; p.grounded = false; p.vy = -100; assert.equal(pose(), 'jump');
  p.vy = 100; assert.equal(pose(), 'fall');
  p.stun = 0.1; assert.equal(pose(), 'hurt');
});
