export type FighterId = 'kestrel' | 'rivet' | 'wisp' | 'morrow';
export type Team = 'sun' | 'moon';
export type Phase = 'lobby' | 'countdown' | 'active' | 'results';
export const TICK_RATE = 60;
export const MATCH_SECONDS = 480;
export const ARENA = {
  name: 'Relay Station', width: 1920, height: 1080,
  bounds: { left: -120, right: 2040, top: -340, bottom: 1180 },
  platforms: [
    { x: 320, y: 720, width: 1280, height: 64, solid: true },
    { x: 430, y: 540, width: 260, height: 16, solid: false },
    { x: 830, y: 370, width: 260, height: 16, solid: false },
    { x: 1230, y: 540, width: 260, height: 16, solid: false },
  ],
};
export const FIGHTERS: Record<FighterId, { name: string; role: string; description: string; color: number; speed: number; weight: number; jump: number; recovery: number; damage: number; reach: number; startup: number; recoveryFrames: number }> = {
  kestrel: { name: 'Kestrel', role: 'Armored scout', description: 'Charge cannon · burst dash · pulse · jet recovery', color: 0xf6c65b, speed: 300, weight: 1, jump: 620, recovery: 820, damage: 9, reach: 64, startup: 7, recoveryFrames: 17 },
  rivet: { name: 'Rivet', role: 'Heavy defender', description: 'Hammer sweep · magnetic pull · shockwave · piston jump', color: 0xee8960, speed: 235, weight: 1.32, jump: 580, recovery: 940, damage: 14, reach: 86, startup: 13, recoveryFrames: 26 },
  wisp: { name: 'Wisp', role: 'Blade duelist', description: 'Twin blades · blink dash · counter · angled recovery', color: 0x9f98fb, speed: 365, weight: 0.78, jump: 660, recovery: 770, damage: 7, reach: 55, startup: 4, recoveryFrames: 12 },
  morrow: { name: 'Morrow', role: 'Crystal controller', description: 'Arcing shards · delayed burst · slow field · recoil vault', color: 0x77ddbe, speed: 270, weight: 1.05, jump: 610, recovery: 800, damage: 10, reach: 70, startup: 9, recoveryFrames: 21 },
};
export const FIGHTER_IDS = Object.keys(FIGHTERS) as FighterId[];
export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; jump: boolean; attack: boolean; special: boolean; guard: boolean };
export const idle = (): Input => ({ left: false, right: false, up: false, down: false, jump: false, attack: false, special: false, guard: false });
export type InputCommand = Input & { type: 'input'; seq: number };
export function parseInput(value: unknown): InputCommand | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.type !== 'input' || !Number.isSafeInteger(v.seq) || (v.seq as number) < 0 || !Object.keys(idle()).every(k => typeof v[k] === 'boolean')) return null;
  return { type: 'input', seq: v.seq as number, ...Object.fromEntries(Object.keys(idle()).map(k => [k, v[k]])) } as InputCommand;
}
export type AttackView = { kind: string; age: number; startup: number; active: number; total: number; dx: number; dy: number; reach: number; damage: number };
export type Player = {
  id: string; name: string; fighter: FighterId; team: Team; ready: boolean; connected: boolean; spectator: boolean;
  x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; jumps: number;
  damage: number; stocks: number; guard: number; guarding: boolean; dodge: number; recoveryUsed: boolean; airDodgeUsed: boolean;
  invulnerable: number; stun: number; respawn: number; cooldown: number; attack: AttackView | null;
  ledge: number; charge: number; ack: number; kos: number; assists: number; dealt: number; falls: number;
};
export type Projectile = { id: number; owner: string; team: Team; x: number; y: number; vx: number; vy: number; radius: number; life: number; kind: 'shot' | 'shard' | 'wave' | 'burst'; damage: number };
export type Field = { id: number; owner: string; team: Team; x: number; y: number; radius: number; life: number };
export type GameEvent = { id: number; kind: 'hit' | 'ko' | 'guard' | 'respawn'; x: number; y: number; text: string; team: Team; tick: number; victim: string; attacker?: string; dx?: number; dy?: number; damage?: number };
export type RoomState = {
  code: string; host: string; phase: Phase; countdown: number; remaining: number; tick: number; training: boolean; paused: boolean;
  players: Player[]; projectiles: Projectile[]; fields: Field[]; events: GameEvent[];
  winner: Team | 'draw' | null; reason: string;
};
export type ClientMessage = InputCommand
  | { type: 'create'; name: string; training?: boolean }
  | { type: 'join'; code: string; name: string }
  | { type: 'resume'; token: string }
  | { type: 'select'; fighter?: FighterId; team?: Team }
  | { type: 'ready'; ready: boolean }
  | { type: 'start'; allowUneven?: boolean }
  | { type: 'pause'; paused: boolean }
  | { type: 'rematch' } | { type: 'leave' } | { type: 'ping'; at: number };
export type ServerMessage = { type: 'welcome'; id: string; token: string }
  | { type: 'state'; room: RoomState } | { type: 'error'; message: string }
  | { type: 'left' } | { type: 'pong'; at: number };
export const teamName = (team: Team) => team === 'sun' ? 'Solar' : 'Lunar';
