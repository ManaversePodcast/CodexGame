import { type FighterId, type Player } from '../shared/game.js';

export const FRAME_SIZE = 96;
export const FRAMES = 6;
export const POSES = ['idle', 'run', 'jump', 'fall', 'land', 'hurt', 'guard', 'dodge', 'charge', 'ledge', 'recover',
  'forward-start', 'forward-hit', 'forward-end', 'up-start', 'up-hit', 'up-end', 'down-start', 'down-hit', 'down-end'] as const;
export type Pose = typeof POSES[number];
const palettes: Record<FighterId, { dark: string; shade: string; base: string; light: string; glow: string; steel: string }> = {
  kestrel: { dark: '#151b2b', shade: '#9e6038', base: '#df9c43', light: '#ffe39a', glow: '#8ef5ff', steel: '#6d8ba4' },
  rivet: { dark: '#201e2c', shade: '#813c3c', base: '#c66a4d', light: '#ffbd80', glow: '#fff0ab', steel: '#91a0b2' },
  wisp: { dark: '#1c1b35', shade: '#51417e', base: '#9681d7', light: '#e2caff', glow: '#8ffff0', steel: '#7792ce' },
  morrow: { dark: '#132734', shade: '#26645f', base: '#4cab98', light: '#b2f3d3', glow: '#e3baff', steel: '#78a4a5' },
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frame = (pose: Pose, n: number) => POSES.indexOf(pose) * FRAMES + Math.max(0, Math.min(FRAMES - 1, Math.floor(n)));

/** Original pixel art drawn on an integer grid, with articulated limbs and weapon keyframes. */
function paint(ctx: CanvasRenderingContext2D, id: FighterId, pose: Pose, n: number, ox = 0, oy = 0) {
  const p = palettes[id], t = n / (FRAMES - 1);
  const running = pose === 'run', floating = !['run', 'land', 'hurt', 'dodge'].includes(pose);
  const stride = running ? Math.sin(n / FRAMES * Math.PI * 2) : 0;
  const bob = running ? Math.round(Math.abs(stride) * 2) : floating ? Math.round(Math.sin(n / FRAMES * Math.PI * 2)) : 0;
  const crouch = pose === 'land' ? Math.round(4 * (1 - t)) : pose === 'guard' ? 3 : pose === 'dodge' ? 6 : 0;
  const hurt = pose === 'hurt';
  const lean = running ? 2 : hurt ? -3 : pose.endsWith('-hit') ? 3 : 0;
  const cx = ox + 47 + lean, cy = oy + 48 + bob + crouch;
  const rect = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(Math.round(cx + x), Math.round(cy + y), Math.round(w), Math.round(h)); };
  const panel = (x: number, y: number, w: number, h: number, color = p.base) => {
    rect(x - 1, y - 1, w + 2, h + 2, p.dark); rect(x, y, w, h, color); rect(x, y, w - 1, 2, p.light);
    rect(x + w - 3, y + 2, 3, h - 2, p.shade);
  };
  const line = (ax: number, ay: number, bx: number, by: number, width: number, color: string, outline = true) => {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= steps; i++) {
      const x = lerp(ax, bx, i / steps), y = lerp(ay, by, i / steps);
      if (outline) rect(x - width / 2 - 1, y - width / 2 - 1, width + 2, width + 2, p.dark);
    }
    for (let i = 0; i <= steps; i++) rect(lerp(ax, bx, i / steps) - width / 2, lerp(ay, by, i / steps) - width / 2, width, width, color);
  };
  const diamond = (x: number, y: number, r: number, color: string) => {
    for (let row = -r; row <= r; row++) { const w = r - Math.abs(row); rect(x - w, y + row, w * 2 + 1, 1, color); }
    line(x, y - r + 2, x, y + r - 2, 1, '#f1ffff', false);
  };
  // Legs have planted feet in idle, six running frames, and different aerial silhouettes.
  const leftLeg = running ? stride * 6 : pose === 'jump' || pose === 'recover' ? -5 : pose === 'fall' ? -2 : 0;
  const rightLeg = running ? -stride * 6 : pose === 'jump' || pose === 'recover' ? 3 : pose === 'fall' ? 4 : 0;
  const footY = 17 - crouch - bob;
  for (const [x, swing] of [[-6, leftLeg], [5, rightLeg]]) {
    line(x, 5, x + swing, 13 - Math.abs(swing) / 3, id === 'rivet' ? 7 : 5, p.shade);
    panel(x - 3 + swing, footY - Math.abs(swing) / 3, id === 'rivet' ? 9 : 7, 4, p.steel);
  }
  if (id === 'wisp') {
    // Split scarf tails and pointed helmet make Wisp legible even in silhouette.
    line(-4, -12, -16 - Math.abs(stride) * 4, -8 + Math.sin(n) * 3, 4, p.base);
    line(-14, -8, -23, -12 + bob * 2, 2, p.light);
    rect(-8, -15, 15, 5, p.shade);
  }
  if (id === 'morrow') {
    // Layered cloak, asymmetric shoulder and floating crystals.
    panel(-9, -10, 18, 20); rect(-10, 4, 21, 5, p.shade);
    for (let row = 0; row < 7; row++) rect(-11 - Math.floor(row / 3), 8 + row, 23 + Math.floor(row / 3) * 2, 1, row < 3 ? p.base : p.shade);
    rect(-10, 12, 3, 3, p.light); rect(8, 12, 3, 3, p.light); rect(-1, 6, 2, 9, p.light);
    diamond(-15, -13 + bob, 3, p.glow); diamond(13, -17 - bob, 2, p.glow);
  } else {
    if (id === 'kestrel') { panel(-13, -10, 5, 15, p.steel); rect(-13, 4, 4, 3, p.glow); }
    panel(id === 'rivet' ? -11 : -8, -11, id === 'rivet' ? 23 : 17, 17);
    panel(-5, -10, 10, 10, p.shade); rect(-3, -7, 6, 2, p.glow);
    rect(-8, 5, id === 'rivet' ? 22 : 17, 3, p.steel); rect(0, 5, 3, 3, p.light);
    if (id === 'rivet') { panel(-15, -12, 8, 9, p.steel); panel(8, -12, 9, 9); rect(-8, 0, 18, 2, p.dark); rect(-6, 1, 4, 2, p.light); }
  }
  // Rear arm and glove.
  const rearX = running ? -11 - stride * 4 : pose === 'guard' ? -3 : -11;
  line(-8, -8, rearX, 2, id === 'rivet' ? 6 : 4, p.shade); panel(rearX - 2, 1, 5, 5, p.steel);
  // Helmets/hoods are separate layers, preserving a crisp visor and face highlights.
  const headX = hurt ? -3 : pose.endsWith('-hit') ? 1 : 0;
  if (id === 'morrow') {
    panel(-9 + headX, -23, 19, 13, p.shade); rect(-6 + headX, -20, 13, 9, p.dark); rect(-4 + headX, -17, 10, 2, p.light);
    diamond(1 + headX, -23, 3, p.glow);
  } else {
    panel(-8 + headX, -23, id === 'rivet' ? 19 : 16, 13);
    rect(-5 + headX, -19, id === 'rivet' ? 15 : 12, 5, p.dark); rect(-3 + headX, -18, id === 'rivet' ? 12 : 10, 2, p.glow);
    rect(4 + headX, -18, 2, 3, '#f4ffff'); rect(-5 + headX, -11, 10, 2, p.steel);
    if (id === 'kestrel') { rect(-7, -26, 10, 3, p.shade); rect(-8, -25, 2, 5, p.light); }
    if (id === 'rivet') { rect(-6, -26, 17, 4, p.steel); rect(-3, -25, 3, 2, p.light); rect(5, -25, 3, 2, p.light); }
    if (id === 'wisp') { line(-7, -20, -12, -27, 2, p.light); rect(4, -25, 6, 2, p.base); }
  }
  // Every weapon follows authored wind-up, contact and follow-through keyframes.
  let angle = pose === 'guard' ? -1.6 : pose === 'jump' ? -0.4 : pose === 'fall' ? 0.35 : pose === 'ledge' ? -2 : 0.25;
  let extension = 1;
  const aim = pose.startsWith('up-') ? -Math.PI / 2 : pose.startsWith('down-') ? Math.PI / 2 : 0;
  if (pose.endsWith('-start')) { angle = lerp(aim + 0.5, aim - 1.9, t); extension = 0.82; }
  if (pose.endsWith('-hit')) { angle = lerp(aim - 1.5, aim + 1.2, t); extension = 1.2; }
  if (pose.endsWith('-end')) { angle = lerp(aim + 1.2, 0.25, t); extension = lerp(1.15, 1, t); }
  if (pose === 'recover') angle = -Math.PI / 2;
  if (pose === 'charge' || id === 'kestrel' && pose.startsWith('forward-hit')) angle = 0;
  const reach = id === 'rivet' ? 19 : id === 'morrow' ? 17 : 15;
  const handX = 6 + Math.cos(angle) * reach * extension, handY = -6 + Math.sin(angle) * reach * extension;
  line(8, -8, handX, handY, id === 'rivet' ? 6 : 4, p.base);
  if (id === 'kestrel') {
    line(handX - Math.cos(angle) * 6, handY - Math.sin(angle) * 6, handX + Math.cos(angle) * 5, handY + Math.sin(angle) * 5, 7, p.steel);
    rect(handX - 3, handY - 3, 5, 3, p.light); rect(handX + 4, handY - 2, 3, 4, p.glow);
    if (pose === 'charge') diamond(handX + 6, handY, 3 + Math.round(t * 2), p.glow);
  } else if (id === 'rivet') {
    const tipX = handX + Math.cos(angle) * 8, tipY = handY + Math.sin(angle) * 8;
    line(7, -5, tipX, tipY, 3, p.steel);
    panel(tipX - 7, tipY - 7, 15, 12, p.steel); rect(tipX - 5, tipY - 5, 3, 8, p.glow); rect(tipX + 5, tipY - 5, 2, 8, p.shade);
  } else if (id === 'wisp') {
    line(handX, handY, handX + Math.cos(angle) * 10, handY + Math.sin(angle) * 10, 3, p.glow);
    const second = angle - 1.2;
    line(-7, -2, -7 + Math.cos(second) * 13, -2 + Math.sin(second) * 13, 2, p.glow);
    rect(handX - 2, handY - 2, 4, 4, p.light);
  } else {
    line(handX - Math.cos(angle) * 9, handY - Math.sin(angle) * 9, handX + Math.cos(angle) * 8, handY + Math.sin(angle) * 8, 3, p.steel);
    diamond(handX + Math.cos(angle) * 9, handY + Math.sin(angle) * 9, 5, p.glow);
  }
  if (pose === 'recover' && id !== 'rivet') {
    for (let i = 0; i < 3; i++) rect(-9 + i * 7, 10 + (n + i) % 3 * 3, 3, 5 + n % 2 * 3, i % 2 ? '#ffffff' : p.glow);
  }
}
export function makeFighterSheet(id: FighterId): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = FRAME_SIZE * FRAMES; canvas.height = FRAME_SIZE * POSES.length;
  const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  POSES.forEach((pose, row) => {
    for (let n = 0; n < FRAMES; n++) {
      ctx.save(); ctx.beginPath(); ctx.rect(n * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE); ctx.clip();
      paint(ctx, id, pose, n, n * FRAME_SIZE, row * FRAME_SIZE); ctx.restore();
    }
  });
  return canvas;
}
export function makePortrait(id: FighterId, scale = 2): HTMLCanvasElement {
  const base = document.createElement('canvas'); base.width = base.height = FRAME_SIZE;
  paint(base.getContext('2d')!, id, 'idle', 0);
  const portrait = document.createElement('canvas'); portrait.width = 60 * scale; portrait.height = 60 * scale;
  portrait.setAttribute('aria-hidden', 'true'); const ctx = portrait.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 18, 16, 60, 60, 0, 0, portrait.width, portrait.height); return portrait;
}
export function fighterFrame(p: Player, seconds: number, landing = 0): number {
  if (p.stun > 0) return frame('hurt', (seconds * 12) % FRAMES);
  if (p.dodge > 0) return frame('dodge', (0.32 - p.dodge) / 0.32 * FRAMES);
  if (p.ledge > 0) return frame('ledge', (seconds * 5) % FRAMES);
  if (p.attack) {
    const a = p.attack;
    if (a.kind === 'recovery') return frame('recover', a.age / a.total * FRAMES);
    if (a.kind === 'counter') return frame('guard', a.age / a.total * FRAMES);
    const aim = a.dy < 0 ? 'up' : a.dy > 0 ? 'down' : 'forward';
    if (a.age < a.startup) return frame(`${aim}-start`, a.age / Math.max(0.001, a.startup) * FRAMES);
    if (a.age < a.startup + a.active) return frame(`${aim}-hit`, (a.age - a.startup) / a.active * FRAMES);
    return frame(`${aim}-end`, (a.age - a.startup - a.active) / Math.max(0.001, a.total - a.startup - a.active) * FRAMES);
  }
  if (p.charge > 0) return frame('charge', p.charge / 0.85 * FRAMES);
  if (p.guarding) return frame('guard', (seconds * 5) % FRAMES);
  if (!p.grounded) return frame(p.vy < 0 ? 'jump' : 'fall', (seconds * 6) % FRAMES);
  if (landing > 0) return frame('land', (0.12 - landing) / 0.12 * FRAMES);
  return frame(Math.abs(p.vx) > 25 ? 'run' : 'idle', seconds * (Math.abs(p.vx) > 25 ? 13 : 4) % FRAMES);
}
