export const WORLD = { width: 640, height: 400, tile: 16, speed: 96, radius: 6 };
export type Input = { up: boolean; down: boolean; left: boolean; right: boolean };
export type Player = { id: string; x: number; y: number; color: number };
export type ServerMessage = { type: 'welcome'; id: string } | { type: 'state'; players: Player[] };
export const idle = (): Input => ({ up: false, down: false, left: false, right: false });
export function parseInput(value: unknown): Input | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'input' || !['up', 'down', 'left', 'right'].every(k => typeof v[k] === 'boolean')) return null;
  return { up: v.up as boolean, down: v.down as boolean, left: v.left as boolean, right: v.right as boolean };
}
export function move(player: Player, input: Input, seconds: number): void {
  let dx = Number(input.right) - Number(input.left);
  let dy = Number(input.down) - Number(input.up);
  const length = Math.hypot(dx, dy);
  if (length) { dx /= length; dy /= length; }
  player.x = Math.max(WORLD.tile, Math.min(WORLD.width - WORLD.tile, player.x + dx * WORLD.speed * seconds));
  player.y = Math.max(WORLD.tile, Math.min(WORLD.height - WORLD.tile, player.y + dy * WORLD.speed * seconds));
}
