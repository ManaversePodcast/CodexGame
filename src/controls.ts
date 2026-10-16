import { idle, type Input } from '../shared/game.js';

// Give an up+attack/recovery chord 40 ms to arrive before turning up into jump.
// A short tap is retained through release, so the grace period never eats it.
interface TapState { wasUp: boolean; due: number | null; active: boolean }
export class TapJumpController {
  private keyboard: TapState = { wasUp: false, due: null, active: false };
  private pad: TapState = { wasUp: false, due: null, active: false };
  reset() {
    this.keyboard = { wasUp: false, due: null, active: false };
    this.pad = { wasUp: false, due: null, active: false };
  }
  read(keyboard: Input, pad: Input, keyboardTap: boolean, gamepadTap: boolean, now: number): Input {
    const input = idle();
    for (const key of Object.keys(input) as (keyof Input)[]) input[key] = keyboard[key] || pad[key];
    const chord = input.attack || input.special || input.guard || input.jump;
    const update = (state: TapState, up: boolean, enabled: boolean) => {
      if (!enabled) { state.wasUp = up; state.due = null; state.active = false; return false; }
      if (up && !state.wasUp) { state.due = now + 40; state.active = false; }
      state.wasUp = up;
      if (chord) { state.due = null; state.active = false; }
      let pulse = false;
      if (state.due !== null && now >= state.due) { state.due = null; state.active = up; pulse = true; }
      if (!up) state.active = false;
      return pulse || state.active;
    };
    const keyJump = update(this.keyboard, keyboard.up, keyboardTap);
    const padJump = update(this.pad, pad.up, gamepadTap);
    input.jump ||= keyJump || padJump;
    return input;
  }
}
