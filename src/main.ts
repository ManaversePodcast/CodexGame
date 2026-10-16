import Phaser from 'phaser';
import { WORLD, type Input, type Player, type ServerMessage } from '../shared/game';
import './style.css';
class Commons extends Phaser.Scene {
  private socket?: WebSocket;
  private id = '';
  private players = new Map<string, Phaser.GameObjects.Container>();
  private targets: Player[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastSent = 0;
  create() {
    const g = this.add.graphics();
    for (let y = 0; y < WORLD.height; y += 16) for (let x = 0; x < WORLD.width; x += 16) {
      const border = x === 0 || y === 0 || x === WORLD.width - 16 || y === WORLD.height - 16;
      g.fillStyle(border ? 0x284c41 : ((x * 7 + y * 11) % 48 === 0 ? 0x42664c : 0x3b6046)); g.fillRect(x, y, 16, 16);
      if (!border) { g.fillStyle(0x527653); g.fillRect(x + 3, y + 10, 2, 2); }
    }
    g.fillStyle(0x71816a); g.fillRect(16, 184, 608, 32); g.fillRect(304, 16, 32, 368);
    g.fillStyle(0x8f9a78); for (let x = 20; x < 620; x += 24) g.fillRect(x, 194, 12, 3);
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as typeof this.keys;
    this.connect();
    this.game.events.once('destroy', () => this.socket?.close());
  }
  private connect() {
    const socket = this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    const status = document.querySelector('#status')!;
    socket.onopen = () => { status.textContent = 'Connected · Entering the commons'; };
    socket.onmessage = event => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'welcome') this.id = message.id;
      else {
        this.targets = message.players;
        status.textContent = `Online · ${message.players.length} player${message.players.length === 1 ? '' : 's'}`;
      }
    };
    socket.onclose = () => {
      status.textContent = 'Disconnected · Reconnecting…'; this.targets = [];
      this.time.delayedCall(1500, () => this.connect());
    };
    socket.onerror = () => socket.close();
  }
  update(time: number, delta: number) {
    if (this.socket?.readyState === WebSocket.OPEN && time - this.lastSent >= 50) {
      const k = this.keys;
      const active = document.hasFocus();
      const input: Input = { up: active && (k.W.isDown || k.UP.isDown), down: active && (k.S.isDown || k.DOWN.isDown), left: active && (k.A.isDown || k.LEFT.isDown), right: active && (k.D.isDown || k.RIGHT.isDown) };
      this.socket.send(JSON.stringify({ type: 'input', ...input })); this.lastSent = time;
    }
    const ids = new Set(this.targets.map(p => p.id));
    for (const [id, sprite] of this.players) if (!ids.has(id)) { sprite.destroy(); this.players.delete(id); }
    for (const p of this.targets) {
      let sprite = this.players.get(p.id);
      if (!sprite) {
        const shadow = this.add.ellipse(0, 7, 14, 5, 0x142d28, 0.5);
        const body = this.add.rectangle(0, 1, 10, 10, p.color);
        const head = this.add.rectangle(0, -6, 8, 7, 0xf3d1a4);
        const eyes = this.add.rectangle(2, -6, 2, 2, 0x243039);
        const label = this.add.text(0, -22, p.id === this.id ? 'YOU' : p.id.slice(0, 4), { fontFamily: 'monospace', fontSize: '8px', color: '#f0eed5' }).setOrigin(0.5);
        sprite = this.add.container(p.x, p.y, [shadow, body, head, eyes, label]); this.players.set(p.id, sprite);
      }
      const blend = 1 - Math.exp(-delta / 45);
      sprite.x += (p.x - sprite.x) * blend; sprite.y += (p.y - sprite.y) * blend; sprite.setDepth(sprite.y);
    }
  }
}
new Phaser.Game({ type: Phaser.AUTO, width: WORLD.width, height: WORLD.height, parent: 'game', pixelArt: true, roundPixels: true, backgroundColor: '#3b6046', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY }, scene: Commons });
