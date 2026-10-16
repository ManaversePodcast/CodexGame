import Phaser from 'phaser';
import { ARENA, FIGHTERS, FIGHTER_IDS, idle, teamName, type ClientMessage, type FighterId, type Input, type Player, type RoomState, type ServerMessage, type Team } from '../shared/game';
import './style.css';
import { TapJumpController } from './controls';
import { makePortrait, makeFighterSheet, fighterFrame, FRAME_SIZE, FRAMES, POSES } from './fighter-art';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const safeRead = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const escapeKey = (code: string | undefined): string => !code ? '—' : ({ Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT' }[code] || code.replace('Key', '').replace('Digit', ''));
const teamColor = (team: Team) => team === 'sun' ? 0xf6c65b : 0x71d8ed;
const defaultBindings: Record<keyof Input, string[]> = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], jump: ['Space'], attack: ['KeyJ'], special: ['KeyK'], guard: ['KeyL', 'ShiftLeft', 'ShiftRight'] };
const settingDefaults = { contrast: false, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches, effects: 0.45, music: 0.12, tapJump: true, gamepadTapJump: false, combatView: true, bindings: defaultBindings };
const settings = { ...settingDefaults, ...safeRead<Partial<typeof settingDefaults>>('riftfall-settings-v1', {}) };
const tapJump = new TapJumpController();
settings.bindings = { ...defaultBindings, ...settings.bindings };
const saveSettings = () => { try { localStorage.setItem('riftfall-settings-v1', JSON.stringify(settings)); } catch { /* Storage may be unavailable in private browsing. */ } };

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="/" aria-label="Riftfall home"><span class="brand-mark" aria-hidden="true">R<span>✦</span></span><div><div class="eyebrow">ORBITAL COMBAT DIVISION</div><h1>RIFTFALL<span>PROTOTYPE</span></h1></div></a>
    <div class="header-actions"><button id="combat-view" class="text-button hidden">Show lobby</button><button id="combat-leave" class="text-button hidden">Leave match</button><div class="connection-status"><span id="connection-dot"></span><span id="connection-label">Connecting</span></div><button id="settings-button" class="icon-button" title="Controls and settings" aria-label="Controls and settings">⚙</button></div>
  </header>
  <main class="workspace">
    <section class="play-column" aria-label="Arena">
      <div class="arena-heading"><div><span class="eyebrow">SECTOR 07 / LOW ORBIT</span><h2 class="arena-title">Relay Station <span>01</span></h2></div><div class="arena-meta"><span class="mode-chip" id="mode-chip">TEAM STOCK · 5 V 5</span><span id="room-meta">PRIVATE ROOMS · UP TO 10 PLAYERS</span><button id="pause-training" class="text-button hidden">Pause Ⅱ</button></div></div>
      <div class="match-strip"><div class="team-score sun"><span class="team-symbol">◆</span><span>SOLAR</span><strong id="sun-score">—</strong></div><div class="match-clock"><strong id="match-clock">08:00</strong><span id="phase-label">AWAITING FIGHTERS</span></div><div class="team-score moon"><strong id="moon-score">—</strong><span>LUNAR</span><span class="team-symbol">●</span></div></div>
      <div class="arena-shell"><div id="game" aria-label="Relay Station multiplayer arena"></div><div class="arena-corner top-left">RELAY // CAM 01</div><div class="arena-corner bottom-left" id="arena-status">SERVER-AUTHORITATIVE · 60 HZ</div><div class="arena-corner bottom-right">1920 × 1080 · VOID BOUNDARY ACTIVE</div><div class="arena-overlay" id="arena-overlay"><span class="overlay-kicker">THREE LIVES. ONE TEAM.</span><h2 class="overlay-title">HOLD YOUR GROUND.</h2><p class="overlay-copy">Choose a fighter. Find your crew. Send your rivals into the void.</p></div><div id="event-feed" class="event-feed" aria-live="polite"></div></div>
      <div id="hud" class="hud"><div class="team-hud sun" id="sun-hud"></div><div class="team-hud moon" id="moon-hud"></div></div>
      <div class="notice-strip" id="notice-strip"><span class="notice-icon">i</span><span id="notice">Welcome to Relay Station. Start with solo training or invite a rival to a private room.</span></div>
      <div class="controls-strip" id="controls-strip"></div>
      <div id="local-resources" class="local-resources hidden" aria-label="Your recovery resources"></div>
    </section>
    <aside class="side-column">
      <section class="panel" id="entry-panel"><div class="panel-heading"><span class="panel-number">01</span><h2 class="panel-title">Enter the arena</h2><span class="status-pill">ONLINE</span></div><p class="panel-intro">A crew of ten. A station on the edge.<br>Pick your side and make every life count.</p><div class="field"><label for="player-name">CALLSIGN</label><input id="player-name" maxlength="20" placeholder="Enter your callsign" autocomplete="nickname"></div><div class="entry-actions"><button id="create-room" class="primary-button">Create private room <span>↗</span></button><button id="train" class="secondary-button">Solo training <span>⌁</span></button></div><div class="separator"><span>HAVE AN INVITE?</span></div><form id="join-form"><label class="small-label" for="join-code">ROOM CODE</label><div class="join-line"><input id="join-code" placeholder="ABC123" maxlength="6" aria-label="Room code" autocomplete="off" autocapitalize="characters"><button class="secondary-button" type="submit">Join →</button></div></form><p class="help-text">No account needed. Share a room code with your friends to play together.</p></section>
      <section class="panel hidden" id="room-panel"><div class="panel-heading"><span class="panel-number">01</span><h2 class="panel-title" id="room-title">Your squad</h2><button class="text-button" id="leave-room">Leave ↗</button></div><div class="room-code-box"><div><span class="room-code-label">INVITE CODE</span><strong class="room-code" id="room-code">—</strong></div><div class="room-tools"><button class="icon-button" id="copy-code" aria-label="Copy room code" title="Copy room code">⧉</button><button class="icon-button" id="share-room" aria-label="Copy invite link" title="Copy invite link">↗</button></div></div><div class="field"><label>YOUR TEAM</label><div class="team-choices"><button class="team-choice sun" id="team-sun">◆ Solar <span id="sun-count">0 / 5</span></button><button class="team-choice moon" id="team-moon">● Lunar <span id="moon-count">0 / 5</span></button></div></div><div class="player-list" id="player-list"></div><div id="lobby-actions"><button class="primary-button" id="ready-button">Ready up <span>✓</span></button><label class="uneven-option" id="uneven-option"><input type="checkbox" id="allow-uneven">Allow unequal teams</label><button class="secondary-button" id="start-button">Launch match →</button></div><p class="help-text" id="room-help">Choose your fighter and team, then ready up.</p></section>
      <section class="panel" id="fighter-panel"><div class="panel-heading"><span class="panel-number">02</span><h2 class="panel-title">Choose your fighter</h2><span class="small-label" id="roster-count">04 AVAILABLE</span></div><div class="roster-grid" id="roster-grid"></div><div id="fighter-info"><div class="fighter-detail-heading"><h3 id="fighter-detail-name">Kestrel</h3><span id="fighter-detail-role">Armored scout</span></div><p id="fighter-detail-copy"></p><div class="fighter-bars" id="fighter-bars"></div><div class="ability-row"><kbd>K</kbd><span id="fighter-special">Charge cannon</span></div><div class="ability-row"><kbd>↑ K</kbd><span id="fighter-recovery">Jet recovery</span></div><p class="help-text">Hold a direction with J or K to change your attack. Down + jump drops through platforms.</p></div></section>
      <section class="panel hidden" id="results-panel"><div class="panel-heading"><span class="panel-number">03</span><h2 class="panel-title">Match report</h2></div><h3 class="results-title" id="results-title"></h3><p class="help-text" id="results-reason"></p><div class="stats-table" id="results-stats"></div><button class="primary-button" id="rematch-button">Return to lobby ↺</button><p class="help-text" id="rematch-help"></p></section>
      <div class="rule-line"><span>◆ 3 LIVES EACH</span><span>◷ 8 MINUTES</span><span>NO FRIENDLY FIRE</span></div>
    </aside>
  </main>
  <footer class="page-footer"><span><i class="footer-dot"></i> ORIGINAL PIXEL COMBAT / BUILT FOR YOUR BROWSER</span><span id="footer-hint">LOSE THREE LIVES. YOUR TEAM FIGHTS ON.</span></footer>
  <dialog id="settings-dialog"><div class="dialog-content"><div class="dialog-header"><div><span class="eyebrow">FLIGHT COMPUTER</span><h2>Controls & settings</h2></div><button id="close-settings" class="icon-button" aria-label="Close settings">×</button></div><p class="help-text">Keyboard or a standard gamepad. Menus do not pause multiplayer matches.</p><label class="settings-row"><span>Keyboard aim-up also jumps</span><input type="checkbox" id="tap-jump"></label><label class="settings-row"><span>Gamepad stick / D-pad up also jumps</span><input type="checkbox" id="gamepad-tap-jump"></label><label class="settings-row"><span>Focus arena during matches</span><input type="checkbox" id="combat-view-setting"></label><div id="bindings"></div><button class="text-button" id="reset-bindings">Restore default controls</button><div class="settings-divider"></div><label class="settings-row"><span>High contrast team outlines</span><input type="checkbox" id="high-contrast"></label><label class="settings-row"><span>Reduce shake & effects</span><input type="checkbox" id="reduce-effects"></label><label class="settings-row"><span>Effects volume</span><input type="range" min="0" max="1" step="0.05" id="effects-volume"></label><label class="settings-row"><span>Ambient audio volume</span><input type="range" min="0" max="1" step="0.05" id="music-volume"></label><p class="help-text" id="controller-status">Gamepad: connect a controller and press a button.</p></div></dialog><div class="toast hidden" id="toast" role="status"></div>
`;

const tutorial: Record<FighterId, { copy: string; special: string; recovery: string }> = {
  kestrel: { copy: 'A dependable scout with a precision arm cannon. Control the lane, then burst into the fight.', special: 'Hold K: charge cannon · → K: burst dash', recovery: 'Jet boost · ↓ K: space-clearing pulse' },
  rivet: { copy: 'A heavy defender with a magnetic hammer. Stay grounded, make space, and punish a reckless approach.', special: 'Hammer sweep · → K: magnetic pull', recovery: 'Piston jump · ↓ K: ground shockwave' },
  wisp: { copy: 'A quick, light duelist with twin energy blades. Close the gap, strike fast, and avoid a heavy launch.', special: 'Twin blades · → K: blink dash', recovery: 'Angled blink · ↓ K: timed counter' },
  morrow: { copy: 'A crystal-wielding controller. Shape the battlefield with arcing shards and temporary slowing fields.', special: 'Arcing shard · → K: delayed burst', recovery: 'Recoil vault · ↓ K: slowing field' },
};
let selected: FighterId = 'kestrel';
let room: RoomState | null = null;
let localId = '';
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let token = (() => { try { return sessionStorage.getItem('riftfall-token') || ''; } catch { return ''; } })();
let resuming = false;
let online = false;
let latency = 0;
let sequence = 0;
let latestAt = 0;
let selectedBeforeRoom = true;
let lastPhase = '';
let toastTimer: ReturnType<typeof setTimeout>;
let lastEvent = 0;
let bindTarget: keyof Input | null = null;
const held = new Set<string>();
const latched = new Set<keyof Input>();
const dialog = $<HTMLDialogElement>('#settings-dialog');
const sceneData: { current: RoomState | null; previous: RoomState | null; at: number; previousAt: number } = { current: null, previous: null, at: 0, previousAt: 0 };
function toast(message: string) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4200); }
function notice(message: string) { $('#notice').textContent = message; }
function send(message: ClientMessage) { if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message)); return true; } toast('Connection is unavailable. Reconnecting…'); return false; }
function setToken(value: string) { token = value; try { if (value) sessionStorage.setItem('riftfall-token', value); else sessionStorage.removeItem('riftfall-token'); } catch { /* Reconnect remains available for this page. */ } }
function callsign() { const input = $<HTMLInputElement>('#player-name'); const name = input.value.trim() || 'Pilot'; input.value = name; try { localStorage.setItem('riftfall-callsign', name); } catch { /* Optional preference. */ } return name; }
$('#player-name').setAttribute('value', safeRead<string>('riftfall-callsign', '') || (() => { try { return localStorage.getItem('riftfall-callsign') || ''; } catch { return ''; } })());
function connect() {
  clearTimeout(reconnectTimer);
  $('#connection-label').textContent = room ? 'Reconnecting…' : 'Connecting';
  $('#connection-dot').classList.remove('online');
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  socket.onopen = () => { online = true; $('#connection-dot').classList.add('online'); $('#connection-label').textContent = 'Online'; if (token) { resuming = true; send({ type: 'resume', token }); } render(); };
  socket.onmessage = ({ data }) => {
    let message: ServerMessage; try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'welcome') { if (resuming) selectedBeforeRoom = false; localId = message.id; sequence = 0; setToken(message.token); resuming = false; audio.unlock(); }
    if (message.type === 'state') {
      const next = message.room;
      if (room?.code !== next.code) { lastEvent = 0; sceneData.previous = null; sceneData.current = null; }
      sceneData.previous = sceneData.current; sceneData.previousAt = sceneData.at;
      sceneData.current = next; sceneData.at = performance.now();
      room = next; latestAt = performance.now();
      if (selectedBeforeRoom && room.phase === 'lobby') { selectedBeforeRoom = false; send({ type: 'select', fighter: selected }); }
      const me = next.players.find(p => p.id === localId);
      if (me) { selected = me.fighter; sequence = Math.max(sequence, me.ack + 1); }
      for (const event of next.events) if (event.id > lastEvent) { lastEvent = event.id; if (event.kind === 'ko') { showFeed(event.text, event.team); audio.play('ko'); } else if (event.kind === 'hit') audio.play('hit'); else if (event.kind === 'guard') audio.play('guard'); else audio.play('spawn'); }
      if (next.phase !== lastPhase) { if (next.phase === 'active') audio.play('start'); if (next.phase === 'results') audio.play('finish'); lastPhase = next.phase; }
      render();
    }
    if (message.type === 'pong') { latency = Math.round(performance.now() - message.at); $('#connection-label').textContent = `Online · ${latency} ms`; }
    if (message.type === 'error') { toast(message.message); if (resuming) { resuming = false; setToken(''); room = null; localId = ''; sceneData.current = null; sceneData.previous = null; render(); } }
    if (message.type === 'left') { resetRoom(); }
  };
  socket.onclose = () => { online = false; held.clear(); latched.clear(); $('#connection-label').textContent = 'Reconnecting…'; $('#connection-dot').classList.remove('online'); render(); reconnectTimer = setTimeout(connect, 1300); };
  socket.onerror = () => socket?.close();
}
function resetRoom() { room = null; localId = ''; setToken(''); selectedBeforeRoom = true; sceneData.current = sceneData.previous = null; lastPhase = ''; lastEvent = 0; $('#event-feed').replaceChildren(); notice('Welcome to Relay Station. Start with solo training or invite a rival to a private room.'); render(); }
setInterval(() => { if (online) send({ type: 'ping', at: performance.now() }); }, 3000);
function showFeed(message: string, team: Team) { const el = document.createElement('div'); el.className = `feed-item ${team}`; el.textContent = message; const feed = $('#event-feed'); feed.prepend(el); while (feed.children.length > 3) feed.lastElementChild?.remove(); setTimeout(() => el.remove(), 4800); }
$('#create-room').onclick = () => { audio.unlock(); selectedBeforeRoom = true; send({ type: 'create', name: callsign() }); };
$('#train').onclick = () => { audio.unlock(); selectedBeforeRoom = true; send({ type: 'create', name: callsign(), training: true }); };
$('#join-form').onsubmit = event => { event.preventDefault(); audio.unlock(); const code = $<HTMLInputElement>('#join-code').value.trim().toUpperCase(); if (!code) { $<HTMLInputElement>('#join-code').focus(); return; } selectedBeforeRoom = true; send({ type: 'join', code, name: callsign() }); };
$('#leave-room').onclick = () => { send({ type: 'leave' }); held.clear(); };
$('#team-sun').onclick = () => send({ type: 'select', team: 'sun' });
$('#team-moon').onclick = () => send({ type: 'select', team: 'moon' });
$('#ready-button').onclick = () => { const me = room?.players.find(p => p.id === localId); if (me) send({ type: 'ready', ready: !me.ready }); audio.unlock(); };
$('#start-button').onclick = () => { audio.unlock(); send({ type: 'start', allowUneven: $<HTMLInputElement>('#allow-uneven').checked }); };
$('#rematch-button').onclick = () => send({ type: 'rematch' });
$('#pause-training').onclick = () => { if (room?.training) { held.clear(); latched.clear(); send({ type: 'pause', paused: !room.paused }); } };
async function copy(value: string, success: string) { try { await navigator.clipboard.writeText(value); toast(success); } catch { toast(`Room code: ${room?.code || value}`); } }
$('#copy-code').onclick = () => { if (room) void copy(room.code, 'Room code copied. Send it to your crew.'); };
$('#share-room').onclick = () => { if (room) { const url = new URL(location.href); url.searchParams.set('room', room.code); void copy(url.toString(), 'Invite link copied.'); } };
const invitedRoom = new URLSearchParams(location.search).get('room'); if (invitedRoom) $<HTMLInputElement>('#join-code').value = invitedRoom.toUpperCase().slice(0, 6);

for (const id of FIGHTER_IDS) {
  const button = document.createElement('button'); button.className = 'fighter-card'; button.dataset.fighter = id; button.type = 'button'; button.setAttribute('aria-label', `${FIGHTERS[id].name}, ${FIGHTERS[id].role}`);
  const portrait = document.createElement('div'); portrait.className = `fighter-portrait ${id}`; portrait.append(makePortrait(id));
  const name = document.createElement('span'); name.className = 'fighter-name'; name.textContent = FIGHTERS[id].name;
  const role = document.createElement('span'); role.className = 'fighter-role'; role.textContent = FIGHTERS[id].role;
  button.append(portrait, name, role); $('#roster-grid').append(button);
  button.onclick = () => { selected = id; if (room?.phase === 'lobby') send({ type: 'select', fighter: id }); audio.unlock(); audio.play('select'); renderFighter(); };
}
function renderFighter() {
  const renderKey = `${selected}:${room?.phase === 'lobby' || !room}`; if (renderKey === fighterRenderKey) return; fighterRenderKey = renderKey;
  const fighter = FIGHTERS[selected], info = tutorial[selected];
  document.querySelectorAll<HTMLButtonElement>('.fighter-card').forEach(button => { button.classList.toggle('active', button.dataset.fighter === selected); button.setAttribute('aria-pressed', String(button.dataset.fighter === selected)); button.disabled = Boolean(room && room.phase !== 'lobby'); });
  $('#fighter-detail-name').textContent = fighter.name; $('#fighter-detail-role').textContent = fighter.role; $('#fighter-detail-copy').textContent = info.copy; $('#fighter-special').textContent = info.special; $('#fighter-recovery').textContent = info.recovery;
  const bars = $('#fighter-bars'); bars.replaceChildren();
  for (const [name, amount] of [['MOBILITY', Math.round(fighter.speed / 80)], ['POWER', Math.round(fighter.damage / 3)], ['WEIGHT', Math.round(fighter.weight * 3)]] as const) { const row = document.createElement('div'); row.className = 'fighter-stat'; const label = document.createElement('span'); label.textContent = name; row.append(label); const track = document.createElement('span'); for (let n = 0; n < 5; n++) { const bar = document.createElement('i'); if (n < amount) bar.className = 'filled'; track.append(bar); } row.append(track); bars.append(row); }
}
const hudSlots: Record<Team, HTMLElement[]> = { sun: [], moon: [] };
for (const team of ['sun', 'moon'] as Team[]) for (let i = 0; i < 5; i++) { const slot = document.createElement('div'); slot.className = 'hud-player empty'; slot.innerHTML = `<div class="hud-avatar"></div><div class="hud-info"><div class="hud-name">OPEN SLOT</div><div class="hud-bottom"><strong class="hud-damage">—</strong><span class="hud-stocks">○ ○ ○</span></div><div class="hud-resources"></div></div>`; $(`#${team}-hud`).append(slot); hudSlots[team].push(slot); }
let rosterKey = '';
let fighterRenderKey = '';
let lobbyReadyKey = '';

let resultsKey = '';
function render() {
  const fighting = Boolean(room && (room.phase === 'active' || room.phase === 'countdown'));
  document.body.classList.toggle('combat-focused', fighting && settings.combatView);
  $('#combat-view').classList.toggle('hidden', !fighting);
  $('#combat-leave').classList.toggle('hidden', !fighting);
  $('#combat-view').textContent = settings.combatView ? 'Show lobby' : 'Focus arena';
  $<HTMLInputElement>('#combat-view-setting').checked = settings.combatView;
  $('#combat-view').setAttribute('aria-pressed', String(settings.combatView));
  $('#pause-training').classList.toggle('hidden', !room?.training || room.phase !== 'active' || room.host !== localId);
  $('#pause-training').textContent = room?.paused ? 'Resume ▶' : 'Pause Ⅱ';
  $('#entry-panel').classList.toggle('hidden', Boolean(room)); $('#room-panel').classList.toggle('hidden', !room); $('#results-panel').classList.toggle('hidden', room?.phase !== 'results');
  for (const id of ['#create-room', '#train']) $<HTMLButtonElement>(id).disabled = !online;
  $('#join-form button').toggleAttribute('disabled', !online);
  if (!room) {
    $('#match-clock').textContent = '08:00'; $('#phase-label').textContent = 'AWAITING FIGHTERS'; $('#sun-score').textContent = $('#moon-score').textContent = '—'; $('#mode-chip').textContent = 'TEAM STOCK · 5 V 5'; $('#room-meta').textContent = 'PRIVATE ROOMS · UP TO 10 PLAYERS';
    $('#arena-overlay').classList.remove('hidden'); $('#arena-overlay .overlay-kicker').textContent = 'THREE LIVES. ONE TEAM.'; $('#arena-overlay .overlay-title').textContent = 'HOLD YOUR GROUND.'; $('#arena-overlay .overlay-copy').textContent = 'Choose a fighter. Find your crew. Send your rivals into the void.';
  } else {
    const me = room.players.find(p => p.id === localId), host = room.host === localId, lobby = room.phase === 'lobby';
    $('#room-code').textContent = room.code; $('#room-title').textContent = room.training ? 'Training room' : 'Your squad'; $('#room-meta').textContent = `ROOM ${room.code} · ${room.players.filter(p => !p.spectator).length} / 10 FIGHTERS`; $('#mode-chip').textContent = room.training ? 'SOLO TRAINING' : 'TEAM STOCK · 5 V 5';
    const remaining = Math.max(0, Math.ceil(room.remaining));
    $('#match-clock').textContent = room.training ? '∞' : `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
    $('#phase-label').textContent = ({ lobby: 'WAITING FOR READY', countdown: 'SYSTEMS ARMED', active: me?.spectator || me?.stocks === 0 ? 'SPECTATING' : 'BATTLE IN PROGRESS', results: 'MATCH COMPLETE' })[room.phase];
    for (const team of ['sun', 'moon'] as Team[]) { const players = room.players.filter(p => p.team === team && !p.spectator); $(`#${team}-score`).textContent = String(players.reduce((sum, p) => sum + (lobby ? 3 : p.stocks), 0)); $(`#${team}-count`).textContent = `${players.length} / 5`; const button = $<HTMLButtonElement>(`#team-${team}`); button.disabled = !lobby || players.length >= 5 && me?.team !== team; button.classList.toggle('active', me?.team === team); button.setAttribute('aria-pressed', String(me?.team === team)); }
    $('#lobby-actions').classList.toggle('hidden', !lobby); $('#uneven-option').classList.toggle('hidden', !host || room.training); $('#start-button').classList.toggle('hidden', !host); $<HTMLButtonElement>('#ready-button').disabled = Boolean(me?.spectator); if (lobbyReadyKey !== String(me?.ready)) { lobbyReadyKey = String(me?.ready); $('#ready-button').innerHTML = me?.ready ? 'Ready — waiting for crew <span>✓</span>' : 'Ready up <span>✓</span>'; } $('#ready-button').classList.toggle('is-ready', Boolean(me?.ready));
    $('#room-help').textContent = me?.spectator ? 'You joined mid-match. Spectate now; pick a fighter in the next lobby.' : lobby ? host ? 'Everyone must ready up. The host launches the match.' : 'Choose your fighter and team, then ready up. Your host launches the match.' : room.phase === 'results' ? 'Your crew stays together for the next round.' : 'Three lives each. Team elimination wins. Up + special is your recovery.';
    const nextRosterKey = room.players.map(p => `${p.id}:${p.name}:${p.team}:${p.ready}:${p.connected}:${p.spectator}:${p.fighter}`).join('|') + room.host + room.phase;
    if (nextRosterKey !== rosterKey) { rosterKey = nextRosterKey; const list = $('#player-list'); list.replaceChildren(); for (const p of room.players) { const row = document.createElement('div'); row.className = `player-row ${p.team}`; const team = document.createElement('span'); team.className = `player-team ${p.team}`; team.textContent = p.team === 'sun' ? '◆' : '●'; const name = document.createElement('span'); name.className = 'player-name'; name.textContent = `${p.name}${p.id === localId ? ' (you)' : ''}`; const status = document.createElement('span'); status.className = `player-badge ${p.ready ? 'ready-badge' : ''}`; status.textContent = !p.connected ? 'OFFLINE' : p.spectator ? 'WATCHING' : p.ready && lobby ? 'READY' : p.id === room!.host ? 'HOST' : FIGHTERS[p.fighter].name; row.append(team, name, status); list.append(row); } }
    const overlay = $('#arena-overlay'); overlay.classList.toggle('hidden', room.phase === 'active' && !room.paused);
    if (room.paused) { $('#arena-overlay .overlay-kicker').textContent = 'TRAINING SIMULATION'; $('#arena-overlay .overlay-title').textContent = 'PAUSED.'; $('#arena-overlay .overlay-copy').textContent = 'Take a breather. Resume when you are ready.'; }
    if (lobby) { $('#arena-overlay .overlay-kicker').textContent = room.training ? 'TRAINING // SYSTEMS READY' : `ROOM ${room.code} // ASSEMBLING CREW`; $('#arena-overlay .overlay-title').textContent = room.training ? 'LEARN TO DEFY GRAVITY.' : 'THE CALM BEFORE THE CLASH.'; $('#arena-overlay .overlay-copy').textContent = room.training ? 'Ready up and launch. Practice against a resetting training dummy.' : 'Choose your fighter, ready up, and wait for your host to launch.'; }
    if (room.phase === 'countdown') { $('#arena-overlay .overlay-kicker').textContent = 'GET READY'; $('#arena-overlay .overlay-title').textContent = String(Math.max(1, Math.ceil(room.countdown))); $('#arena-overlay .overlay-copy').textContent = 'Stay on the station. Keep your crew alive.'; }
    if (room.phase === 'results') { const victory = room.winner === 'draw' ? 'STANDOFF.' : `${room.winner ? teamName(room.winner).toUpperCase() : 'MATCH'} VICTORY.`; $('#arena-overlay .overlay-kicker').textContent = 'MATCH COMPLETE'; $('#arena-overlay .overlay-title').textContent = victory; $('#arena-overlay .overlay-copy').textContent = room.reason; $('#results-title').textContent = victory; $('#results-title').className = `results-title ${room.winner}`; $('#results-reason').textContent = room.reason; $('#rematch-button').classList.toggle('hidden', !host); $('#rematch-help').textContent = host ? 'Return to the lobby to change teams and fighters.' : 'Waiting for the host to return the crew to the lobby.';
      const key = JSON.stringify(room.players.map(p => [p.id, p.kos, p.assists, p.dealt, p.falls, p.stocks])); if (key !== resultsKey) { resultsKey = key; const stats = $('#results-stats'); stats.replaceChildren(); const header = document.createElement('div'); header.className = 'stat-row stat-header'; for (const text of ['FIGHTER', 'KO', 'AST', 'DMG', 'FALL']) { const cell = document.createElement('span'); cell.textContent = text; header.append(cell); } stats.append(header); for (const p of room.players.filter(p => !p.spectator)) { const row = document.createElement('div'); row.className = `stat-row ${p.team}`; for (const text of [p.name, String(p.kos), String(p.assists), String(Math.round(p.dealt)), String(p.falls)]) { const cell = document.createElement('span'); cell.textContent = text; row.append(cell); } stats.append(row); } }
    }
    if (room.phase === 'active') { const text = room.paused ? 'Training paused. Press Escape or Resume to continue.' : !online ? 'Connection lost. Your fighter stays in the arena. Reconnecting…' : me?.spectator ? 'Spectator mode. You can join the fight when the host returns to the lobby.' : me?.stocks === 0 ? 'You are out of lives. Your team fights on — stay for the result.' : me && me.respawn > 0 ? `Returning to the station in ${Math.ceil(me.respawn)}…` : room.training ? 'Training: damage builds knockback. Up + K recovers. Your dummy resets after a ring-out.' : 'Cover your allies. Damage increases knockback. Up + K brings you back from the edge.'; notice(text); }
    else if (room.phase === 'lobby') notice(room.training ? 'Solo training is ready. Ready up, then launch to practice against a scripted dummy.' : 'Invite your crew with the room code. Each team can field up to five fighters.');
    else if (room.phase === 'countdown') notice('Match starting. Fighters, teams, and rules are now locked.');
    else notice('Match complete. Ring-outs and assists celebrate your contribution; remaining team lives decide victory.');
  }
  renderHUD(); renderFighter();
}
function renderHUD() {
  const me = room?.players.find(p => p.id === localId);
  const resources = $('#local-resources');
  resources.classList.toggle('hidden', !room || room.phase !== 'active' || !me || me.spectator);
  if (me) {
    resources.classList.toggle('danger', me.stocks === 1);
    resources.textContent = me.stocks <= 0 ? 'ELIMINATED · YOUR TEAM FIGHTS ON' : me.respawn > 0 ? `RESPAWNING IN ${Math.ceil(me.respawn)}s · ${me.stocks} LIVES LEFT` :
      `AIR JUMP ${me.jumps < 2 ? '●' : '○'}   ·   RECOVERY ${me.recoveryUsed ? '○ USED' : '● READY'}   ·   AIR DODGE ${me.airDodgeUsed ? '○ USED' : '● READY'}   ·   GUARD ${Math.round(me.guard)}   ·   ${me.invulnerable > 0 ? 'PROTECTED' : me.cooldown > 0 ? `SPECIAL ${me.cooldown.toFixed(1)}s` : 'SPECIAL READY'}`;
  }
  for (const team of ['sun', 'moon'] as Team[]) {
    const players = room?.players.filter(p => p.team === team && !p.spectator) || [];
    for (let i = 0; i < 5; i++) {
      const slot = hudSlots[team][i], p = players[i]; slot.className = `hud-player${p ? `${p.id === localId ? ' self' : ''}${p.stocks <= 0 && room?.phase !== 'lobby' ? ' eliminated' : ''}` : ' empty'}`;
      const portrait = slot.querySelector<HTMLElement>('.hud-avatar')!;
      if (portrait.dataset.fighter !== p?.fighter) { portrait.replaceChildren(); if (p) portrait.append(makePortrait(p.fighter, 2)); portrait.dataset.fighter = p?.fighter || ''; }
      slot.querySelector('.hud-name')!.textContent = p ? `${p.id === localId ? '▸ ' : ''}${p.name}` : 'OPEN SLOT';
      const stocks = p ? room?.phase === 'lobby' ? 3 : p.stocks : 0;
      const percent = slot.querySelector<HTMLElement>('.hud-damage')!; percent.textContent = p ? `${Math.round(p.damage)}%` : '—'; percent.style.color = p && p.damage >= 120 ? '#ff806d' : p && p.damage >= 70 ? '#f6c65b' : '';
      slot.querySelector('.hud-stocks')!.textContent = p ? '◆'.repeat(stocks) + '◇'.repeat(Math.max(0, 3 - stocks)) : '· · ·';
      slot.querySelector('.hud-resources')!.textContent = p ? p.stocks <= 0 && room?.phase !== 'lobby' ? 'ELIMINATED' : !p.connected ? 'RECONNECTING' : p.respawn > 0 ? `RESPAWN ${Math.ceil(p.respawn)}` : `J${Math.max(0, 2 - p.jumps)} · R${p.recoveryUsed ? '○' : '●'} · G${Math.round(p.guard)}` : 'AWAITING PILOT';
    }
  }
}

function renderBindings() {
  $('#bindings').replaceChildren();
  const names: Record<keyof Input, string> = { left: 'Move left', right: 'Move right', up: 'Aim up / tap jump', down: 'Crouch / aim down', jump: 'Jump / air jump', attack: 'Attack', special: 'Special / recovery', guard: 'Guard / dodge' };
  const pads: Record<keyof Input, string> = { left: '← stick', right: '→ stick', up: '↑ stick', down: '↓ stick', jump: 'A / Cross', attack: 'X / Square', special: 'Y / Triangle', guard: 'RT / R2' };
  for (const action of Object.keys(names) as (keyof Input)[]) { const row = document.createElement('div'); row.className = 'binding-row'; const label = document.createElement('span'); label.textContent = names[action]; const button = document.createElement('button'); button.className = 'binding-button'; button.textContent = settings.bindings[action].map(escapeKey).join(' / '); button.onclick = () => { bindTarget = action; button.textContent = 'Press a key…'; }; const pad = document.createElement('small'); pad.textContent = pads[action]; row.append(label, button, pad); $('#bindings').append(row); }
  renderControlHints();
}
function renderControlHints() {
  const specialKey = escapeKey(settings.bindings.special[0]);
  document.querySelectorAll<HTMLElement>('.ability-row kbd').forEach((key, index) => { key.textContent = `${index ? '↑ ' : ''}${specialKey}`; });
  const controls = $('#controls-strip'); controls.replaceChildren();
  for (const [action, label] of [['left', 'MOVE'], ['jump', 'JUMP'], ['attack', 'ATTACK'], ['special', 'SPECIAL'], ['guard', 'GUARD / DODGE']] as [keyof Input, string][]) { const hint = document.createElement('span'); const key = document.createElement('kbd'); key.textContent = action === 'left' ? `${escapeKey(settings.bindings.left[0])} ${escapeKey(settings.bindings.right[0])}` : action === 'jump' && settings.tapJump ? `${escapeKey(settings.bindings.up[0])} / ${escapeKey(settings.bindings.jump[0])}` : escapeKey(settings.bindings[action][0]); hint.append(key, ` ${label}`); controls.append(hint); }
  const gamepad = document.createElement('button'); gamepad.className = 'text-button'; gamepad.textContent = '⌘ Controls'; gamepad.onclick = () => openSettings(); controls.append(gamepad);
}
function openSettings() { held.clear(); latched.clear(); tapJump.reset(); bindTarget = null; renderBindings(); dialog.showModal(); audio.unlock(); }
$('#combat-view').onclick = () => { settings.combatView = !settings.combatView; saveSettings(); render(); };
$('#combat-leave').onclick = () => { send({ type: 'leave' }); held.clear(); latched.clear(); tapJump.reset(); };
$('#settings-button').onclick = openSettings; $('#close-settings').onclick = () => dialog.close();
$('#reset-bindings').onclick = () => { settings.bindings = { ...defaultBindings }; saveSettings(); renderBindings(); };
for (const [id, key] of [['tap-jump', 'tapJump'], ['gamepad-tap-jump', 'gamepadTapJump'], ['combat-view-setting', 'combatView']] as const) {
  $<HTMLInputElement>(`#${id}`).checked = settings[key];
  $(`#${id}`).onchange = () => { settings[key] = $<HTMLInputElement>(`#${id}`).checked; tapJump.reset(); held.clear(); latched.clear(); saveSettings(); renderBindings(); render(); };
}
$<HTMLInputElement>('#high-contrast').checked = settings.contrast; $<HTMLInputElement>('#reduce-effects').checked = settings.reduced;
$<HTMLInputElement>('#effects-volume').value = String(settings.effects); $<HTMLInputElement>('#music-volume').value = String(settings.music);
function applySettings() { document.body.classList.toggle('high-contrast', settings.contrast); document.body.classList.toggle('reduce-effects', settings.reduced); saveSettings(); }
$('#high-contrast').onchange = () => { settings.contrast = $<HTMLInputElement>('#high-contrast').checked; applySettings(); };
$('#reduce-effects').onchange = () => { settings.reduced = $<HTMLInputElement>('#reduce-effects').checked; applySettings(); };
$('#effects-volume').oninput = () => { settings.effects = Number($<HTMLInputElement>('#effects-volume').value); applySettings(); };
$('#music-volume').oninput = () => { settings.music = Number($<HTMLInputElement>('#music-volume').value); audio.updateVolume(); applySettings(); };
window.addEventListener('keydown', event => {
  if (bindTarget) {
    event.preventDefault(); event.stopPropagation();
    if (event.code !== 'Escape') {
      const priorKey = settings.bindings[bindTarget][0];
      for (const action of Object.keys(settings.bindings) as (keyof Input)[]) if (action !== bindTarget && settings.bindings[action].includes(event.code)) {
        settings.bindings[action] = settings.bindings[action].filter(code => code !== event.code);
        if (!settings.bindings[action].length) settings.bindings[action] = [priorKey || defaultBindings[action][0]];
      }
      settings.bindings[bindTarget] = [event.code]; saveSettings();
    }
    held.clear(); latched.clear(); bindTarget = null; renderBindings(); return;
  }
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (!typing && !dialog.open && Object.values(settings.bindings).flat().includes(event.code)) {
    if (room?.phase === 'active' || room?.phase === 'countdown') event.preventDefault();
    held.add(event.code);
    if (!event.repeat) {
      let actionPressed = false;
      for (const action of ['jump', 'attack', 'special', 'guard'] as (keyof Input)[]) if (settings.bindings[action].includes(event.code)) { latched.add(action); actionPressed = true; }
      // Capture direction at the instant the action is pressed, even if both keys
      // are released before the next poll (for example a quick up + recovery tap).
      if (actionPressed || settings.tapJump && settings.bindings.up.includes(event.code)) transmitInput();
    }
  }
  if (event.code === 'Escape') { held.clear(); latched.clear(); if (!typing && !dialog.open && room?.training && room.phase === 'active') send({ type: 'pause', paused: !room.paused }); }
});
window.addEventListener('keyup', event => { held.delete(event.code); if (!dialog.open && Object.values(settings.bindings).flat().includes(event.code)) transmitInput(); }); window.addEventListener('blur', () => { held.clear(); latched.clear(); tapJump.reset(); transmitInput(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); latched.clear(); } });
function readInput(): Input {
  const input = idle(); if (!document.hasFocus() || document.hidden || dialog.open || document.activeElement instanceof HTMLInputElement || !online || room?.paused || room?.phase !== 'active') { latched.clear(); tapJump.reset(); return input; }
  for (const key of Object.keys(input) as (keyof Input)[]) input[key] = settings.bindings[key].some(code => held.has(code)) || latched.has(key);
  latched.clear();
  const padInput = idle();
  const pad = Array.from(navigator.getGamepads?.() || []).find(p => p?.connected);
  if (pad) { const button = (n: number) => Boolean(pad.buttons[n]?.pressed); padInput.left ||= (pad.axes[0] || 0) < -0.3 || button(14); padInput.right ||= (pad.axes[0] || 0) > 0.3 || button(15); padInput.up ||= (pad.axes[1] || 0) < -0.4 || button(12); padInput.down ||= (pad.axes[1] || 0) > 0.4 || button(13); padInput.jump ||= button(0); padInput.attack ||= button(2); padInput.special ||= button(3); padInput.guard ||= button(7) || button(5); $('#controller-status').textContent = `Gamepad connected: ${pad.id.slice(0, 60)}`; }
  return tapJump.read(input, padInput, settings.tapJump, settings.gamepadTapJump, performance.now());
}

class Synth {
  private context?: AudioContext;
  private ambient?: GainNode;
  private last = new Map<string, number>();
  unlock() { if (!this.context) { try { this.context = new AudioContext(); this.ambient = this.context.createGain(); this.ambient.connect(this.context.destination); for (const f of [55, 82.41, 110.12]) { const oscillator = this.context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = f; const gain = this.context.createGain(); gain.gain.value = 0.055; oscillator.connect(gain); gain.connect(this.ambient); oscillator.start(); } this.updateVolume(); } catch { return; } } void this.context.resume(); }
  updateVolume() { if (this.context && this.ambient) this.ambient.gain.setTargetAtTime(settings.music, this.context.currentTime, 0.15); }
  play(kind: string) { const context = this.context; if (!context || context.state !== 'running' || settings.effects <= 0) return; const now = performance.now(); if (now - (this.last.get(kind) || -Infinity) < (kind === 'hit' ? 65 : 100)) return; this.last.set(kind, now); const oscillator = context.createOscillator(), gain = context.createGain(), t = context.currentTime; const params: Record<string, [number, number, number]> = { hit: [210, 55, 0.12], heavy: [95, 26, 0.2], guard: [470, 220, 0.1], ko: [160, 28, 0.35], spawn: [300, 750, 0.18], select: [400, 650, 0.05], start: [220, 880, 0.4], finish: [660, 330, 0.65] }; const [from, to, duration] = params[kind] || params.hit; oscillator.type = kind === 'hit' || kind === 'heavy' || kind === 'ko' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(from, t); oscillator.frequency.exponentialRampToValueAtTime(to, t + duration); gain.gain.setValueAtTime(settings.effects * 0.13, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duration); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(t); oscillator.stop(t + duration); }
}
const audio = new Synth();

interface Actor { container: Phaser.GameObjects.Container; sprite: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; edge: Phaser.GameObjects.Text; fighter: FighterId; x: number; y: number; freezeUntil: number; flashUntil: number; landingUntil: number; }
class RelayStation extends Phaser.Scene {
  private actors = new Map<string, Actor>();
  private effects!: Phaser.GameObjects.Graphics;
  private scenery!: Phaser.GameObjects.Graphics;
  private eventId = 0;
  private roomCode = '';
  private ambientTime = 0;
  private particles = 0;
  private lastGround = new Map<string, boolean>();
  create() {
    for (const id of FIGHTER_IDS) {
      const texture = this.textures.addCanvas(`fighter-${id}`, makeFighterSheet(id))!;
      for (let row = 0; row < POSES.length; row++) for (let column = 0; column < FRAMES; column++) texture.add(row * FRAMES + column, 0, column * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
    }
    this.drawBackground(); this.drawStation();
    this.scenery = this.add.graphics().setDepth(4);
    this.effects = this.add.graphics().setDepth(36);
    this.cameras.main.setZoom(0.82).centerOn(960, 490);
    this.input.mouse?.disableContextMenu();
    this.game.events.once('destroy', () => socket?.close());
    this.scale.on('resize', () => { this.cameras.main.setSize(this.scale.width, this.scale.height); });
  }
  private drawBackground() {
    const g = this.add.graphics().setDepth(-100);
    g.fillStyle(0x080f20); g.fillRect(-4000, -3000, 10000, 7000);
    // Distant atmospheric bands and nebula fragments, kept distinct from playable geometry.
    for (let y = -300; y < 1600; y += 12) { const light = Math.max(0, 1 - Math.abs(y - 500) / 1000); g.fillStyle(Phaser.Display.Color.GetColor(8 + light * 5, 15 + light * 8, 32 + light * 13)); g.fillRect(-2000, y, 6000, 12); }
    const seeded = (i: number) => { const n = Math.sin(i * 341.73 + 9.7) * 57321.792; return n - Math.floor(n); };
    for (let i = 0; i < 250; i++) { const x = seeded(i + 1) * 3600 - 800, y = seeded(i + 310) * 1800 - 650; const bright = seeded(i + 700); g.fillStyle(bright > 0.8 ? 0xaac9db : 0x44607a, bright > 0.8 ? 0.8 : 0.5); g.fillRect(x, y, bright > 0.94 ? 3 : 2, bright > 0.94 ? 3 : 2); if (bright > 0.96) { g.fillStyle(0xaac9db, 0.25); g.fillRect(x - 4, y + 1, 11, 1); g.fillRect(x + 1, y - 4, 1, 11); } }
    g.fillStyle(0x203d50, 0.15); g.fillEllipse(1800, 540, 2300, 850); g.fillStyle(0x274a60, 0.12); g.fillEllipse(1800, 570, 2200, 650);
    // A large pixel-edged moon with a thin atmospheric crescent.
    const planetX = 1465, planetY = 180, radius = 190;
    for (let row = -radius; row <= radius; row += 8) { const half = Math.sqrt(Math.max(0, radius * radius - row * row)); const band = Math.floor((row + radius) / 25) % 3; g.fillStyle([0x1b3246, 0x213b4d, 0x254053][band]); g.fillRect(Math.round((planetX - half) / 8) * 8, planetY + row, Math.round(half * 2 / 8) * 8, 8); }
    g.fillStyle(0x0e1a2d, 0.92); g.fillCircle(planetX - 65, planetY - 35, 188);
    g.lineStyle(1, 0x77a6bf, 0.18); g.lineBetween(1250, 388, 1760, 388); g.lineBetween(1250, 394, 1630, 394);
    // Far-away orbital machinery.
    g.fillStyle(0x142438); g.fillRect(30, 400, 80, 255); g.fillRect(58, 320, 24, 100); g.fillRect(-130, 460, 400, 13); g.fillRect(1710, 490, 180, 310); g.fillRect(1780, 400, 40, 120); g.fillRect(1650, 550, 370, 15);
    g.lineStyle(2, 0x284259, 0.4); g.lineBetween(66, 330, 66, 220); g.lineBetween(1799, 410, 1799, 300);
    g.fillStyle(0xc8a45d, 0.55); g.fillRect(64, 310, 4, 4); g.fillRect(1797, 390, 4, 4);
    g.fillStyle(0x20364d, 0.4); for (let i = 0; i < 6; i++) g.fillRect(1727 + i * 24, 512, 12, 3);
    g.lineStyle(1, 0x3b6179, 0.14); for (let x = -160; x < 2400; x += 160) g.lineBetween(x, 900, x - 600, 1800); for (let y = 900; y < 1500; y += 100) g.lineBetween(-1000, y, 3000, y);
    // Visible danger threshold, beyond the recovery margin.
    const bounds = ARENA.bounds; g.lineStyle(2, 0xee766a, 0.3);
    for (let x = bounds.left; x < bounds.right; x += 48) g.lineBetween(x, bounds.bottom - 5, x + 20, bounds.bottom - 5);
    this.add.text(960, bounds.bottom - 38, '▼  ELIMINATION BOUNDARY  ▼', { fontFamily: 'monospace', fontSize: '13px', color: '#9d655f', letterSpacing: 6 }).setOrigin(0.5).setDepth(-40);
  }
  private drawStation() {
    const g = this.add.graphics().setDepth(10);
    for (const platform of ARENA.platforms) {
      const { x, y, width, height, solid } = platform;
      if (solid) {
        g.fillStyle(0x080e19, 0.5); g.fillRect(x - 10, y + 8, width + 20, height + 12);
        g.fillStyle(0x172638); g.fillRect(x, y, width, height);
        g.fillStyle(0x26394b); g.fillRect(x + 4, y + 8, width - 8, 24);
        g.fillStyle(0x3a5263); g.fillRect(x, y, width, 7);
        g.fillStyle(0x78a6b6); g.fillRect(x, y, width, 3);
        g.fillStyle(0x102033); for (let tile = x + 8; tile < x + width - 8; tile += 80) { g.fillRect(tile, y + 11, 64, 5); g.fillRect(tile + 3, y + 23, 55, 3); g.fillRect(tile + 3, y + 39, 55, 12); g.fillStyle(0x607b8b); g.fillRect(tile, y + 42, 3, 3); g.fillRect(tile + 64, y + 42, 3, 3); g.fillStyle(0x102033); }
        g.fillStyle(0x718690); g.fillRect(x, y + height - 8, width, 4);
        g.fillStyle(0xc49e54); for (let a = 0; a < 5; a++) { g.fillRect(x + 8 + a * 14, y + 9, 8, 5); g.fillRect(x + width - 16 - a * 14, y + 9, 8, 5); }
        g.fillStyle(0x0a1625); g.fillTriangle(x + 110, y + height, x + 400, y + height, x + 300, y + 195); g.fillTriangle(x + width - 110, y + height, x + width - 400, y + height, x + width - 300, y + 195);
        g.lineStyle(4, 0x2b4458); g.lineBetween(x + 130, y + height, x + 300, y + 180); g.lineBetween(x + width - 130, y + height, x + width - 300, y + 180);
        g.fillStyle(0x567683); g.fillRect(x + 238, y + 126, 100, 8); g.fillRect(x + width - 338, y + 126, 100, 8);
        g.fillStyle(0xf6c65b); g.fillRect(x, y - 3, 9, 12); g.fillStyle(0x71d8ed); g.fillRect(x + width - 9, y - 3, 9, 12);
        // Deck inlays define team sides without adding visual collision geometry.
        g.fillStyle(0xf6c65b, 0.3); g.fillRect(x + 115, y + 1, 175, 3); g.fillStyle(0x71d8ed, 0.3); g.fillRect(x + width - 290, y + 1, 175, 3);
      } else {
        g.fillStyle(0x152b3b); g.fillRect(x + 8, y + 5, width - 16, height + 5);
        g.fillStyle(0x2e4b5c); g.fillRect(x, y, width, height);
        g.fillStyle(0x84bdc5); g.fillRect(x, y, width, 3);
        g.fillStyle(0x172c3e); for (let tile = x + 12; tile < x + width - 10; tile += 28) g.fillRect(tile, y + 7, 16, 4);
        g.fillStyle(0x66b5bd, 0.35); g.fillRect(x + 30, y + height + 7, 16, 4); g.fillRect(x + width - 46, y + height + 7, 16, 4);
        g.fillStyle(0x4c9fa9, 0.07); g.fillTriangle(x + 25, y + height + 10, x + 55, y + height + 10, x + 40, y + height + 45); g.fillTriangle(x + width - 55, y + height + 10, x + width - 25, y + height + 10, x + width - 40, y + height + 45);
      }
    }
    this.add.text(960, 755, 'R E L A Y   / /   0 7', { fontFamily: 'monospace', fontSize: '13px', color: '#6c8e9d' }).setOrigin(0.5).setDepth(12);
    // Hanging dish structure is decorative and well behind the combat plane.
    const back = this.add.graphics().setDepth(-5); back.lineStyle(6, 0x24364a); back.lineBetween(960, 80, 960, 300); back.lineStyle(3, 0x314a5d); back.lineBetween(885, 180, 1035, 180); back.lineBetween(895, 130, 1025, 230); back.lineBetween(1025, 130, 895, 230); back.fillStyle(0x263c50); back.fillRect(930, 290, 60, 15); back.fillStyle(0x406779); back.fillRect(940, 300, 40, 6); back.fillStyle(0x6ecbda, 0.55); back.fillRect(954, 309, 12, 5);
  }
  private spawnActor(p: Player): Actor {
    const marker = this.add.graphics();
    const sprite = this.add.image(0, 0, `fighter-${p.fighter}`, 0);
    const label = this.add.text(0, -52, '', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#e7f2f4', stroke: '#090f20', strokeThickness: 4 }).setOrigin(0.5);
    const container = this.add.container(p.x, p.y, [marker, sprite, label]).setDepth(30);
    const edge = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: p.team === 'sun' ? '#f6c65b' : '#71d8ed', backgroundColor: '#0a1424', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(100).setVisible(false);
    const actor: Actor = { container, marker, sprite, label, edge, fighter: p.fighter, x: p.x, y: p.y, freezeUntil: 0, flashUntil: 0, landingUntil: 0 }; this.actors.set(p.id, actor); return actor;
  }
  update(time: number, delta: number) {
    this.ambientTime += delta;
    const activeRoom = sceneData.current;
    const c = this.cameras.main;
    const blend = 1 - Math.exp(-Math.min(delta, 50) / 240);
    const alive = activeRoom?.players.filter(p => !p.spectator && p.stocks > 0 && p.respawn <= 0) || [];
    let targetX = 960, targetY = 490, targetZoom = 0.82;
    if (activeRoom?.phase === 'active' && alive.length) {
      const minX = Math.min(420, ...alive.map(p => p.x - 135)), maxX = Math.max(1500, ...alive.map(p => p.x + 135));
      const minY = Math.min(280, ...alive.map(p => p.y - 130)), maxY = Math.max(840, ...alive.map(p => p.y + 140));
      targetZoom = Phaser.Math.Clamp(Math.min(c.width / (maxX - minX), c.height / (maxY - minY)), 0.69, 1.14);
      targetX = Phaser.Math.Clamp((minX + maxX) / 2, 740, 1180); targetY = Phaser.Math.Clamp((minY + maxY) / 2, 220, 610);
    }
    c.setZoom(Phaser.Math.Linear(c.zoom, targetZoom, blend));
    c.centerOn(Phaser.Math.Linear(c.midPoint.x, targetX, blend), Phaser.Math.Linear(c.midPoint.y, targetY, blend));
    const visible = c.worldView;
    this.scenery.clear();
    const glow = settings.reduced ? 0.15 : 0.12 + Math.sin(time / 1100) * 0.08;
    this.scenery.fillStyle(0x7ad8e8, glow); this.scenery.fillRect(951, 318, 18, 4); this.scenery.fillStyle(0x7ad8e8, glow / 3); this.scenery.fillTriangle(949, 322, 971, 322, 960, 355);
    this.effects.clear();
    if (!activeRoom) { for (const actor of this.actors.values()) { actor.container.destroy(); actor.edge.destroy(); } this.actors.clear(); return; }
    if (this.roomCode !== activeRoom.code) { this.roomCode = activeRoom.code; this.eventId = 0; this.lastGround.clear(); }
    const previous = new Map(sceneData.previous?.players.map(p => [p.id, p]) || []);
    const interval = Math.max(20, Math.min(100, sceneData.at - sceneData.previousAt));
    const progress = Phaser.Math.Clamp((performance.now() - sceneData.at) / interval, 0, 1);
    const ids = new Set(activeRoom.players.filter(p => !p.spectator).map(p => p.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) { actor.container.destroy(); actor.edge.destroy(); this.actors.delete(id); }
    for (const p of activeRoom.players) {
      if (p.spectator) continue;
      const actor = this.actors.get(p.id) || this.spawnActor(p), prev = previous.get(p.id);
      if (actor.fighter !== p.fighter) { actor.sprite.setTexture(`fighter-${p.fighter}`, 0); actor.fighter = p.fighter; }
      const teleport = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 300 || (prev.respawn > 0) !== (p.respawn > 0);
      const hitStop = !settings.reduced && performance.now() < actor.freezeUntil && !teleport && p.stocks > 0 && p.respawn <= 0;
      if (!hitStop) { actor.x = teleport ? p.x : Phaser.Math.Linear(prev!.x, p.x, progress); actor.y = teleport ? p.y : Phaser.Math.Linear(prev!.y, p.y, progress); }
      if (this.lastGround.get(p.id) === false && p.grounded) actor.landingUntil = time + 120;
      const visualPlayer = p.attack && prev?.attack && prev.attack.kind === p.attack.kind && prev.attack.age <= p.attack.age ? { ...p, attack: { ...p.attack, age: Phaser.Math.Linear(prev.attack.age, p.attack.age, progress) } } : p;
      if (!hitStop) actor.sprite.setFrame(fighterFrame(visualPlayer, activeRoom.tick / 60, Math.max(0, actor.landingUntil - time) / 1000));
      const visiblePlayer = (p.stocks > 0 || activeRoom.phase === 'lobby') && p.respawn <= 0;
      actor.container.setPosition(actor.x, actor.y).setVisible(visiblePlayer);
      actor.sprite.setFlipX(p.facing < 0).setAlpha(p.invulnerable > 0 && Math.floor(time / 85) % 2 ? 0.42 : 1);
      actor.sprite.setRotation(p.dodge > 0 ? Math.sin(time / 40) * 0.15 : p.stun > 0 ? Math.max(-0.6, Math.min(0.6, p.vx / 1600)) : 0);
      if (!settings.reduced && performance.now() < actor.flashUntil) actor.sprite.setTintFill(0xfff2c6); else if (p.stun > 0) actor.sprite.setTint(0xffa6a1); else if (!p.connected) actor.sprite.setTint(0x8c9ca9); else actor.sprite.clearTint();
      actor.sprite.setScale(1);
      actor.label.setText(p.id === localId ? `${p.name.slice(0, 10)} ◂ YOU` : `${activeRoom.players.filter(q => !q.spectator).findIndex(q => q.id === p.id) + 1} ${p.name.slice(0, 8)}`).setColor(p.team === 'sun' ? '#f6d77a' : '#96e3f4');
      actor.label.setFontSize(p.id === localId ? 13 : 11).setAlpha(p.id === localId ? 1 : 0.8);
      const mark = actor.marker; mark.clear();
      mark.fillStyle(0x000000, 0.25); mark.fillEllipse(0, 21, p.fighter === 'rivet' ? 40 : 31, 9);
      const color = teamColor(p.team);
      if (settings.contrast || p.id === localId) { mark.lineStyle(p.id === localId ? 2.5 : 2, color, 0.75); mark.strokeRoundedRect(-19, -25, 38, 48, 3); }
      mark.fillStyle(color, 1);
      if (p.team === 'sun') mark.fillPoints([{ x: 0, y: -43 }, { x: 5, y: -38 }, { x: 0, y: -33 }, { x: -5, y: -38 }], true); else mark.fillCircle(0, -38, 4);
      if (p.id === localId) { mark.fillStyle(0xffffff, 0.85); mark.fillTriangle(-4, 29, 4, 29, 0, 24); }
      if (p.stocks === 1) { mark.lineStyle(1.5, 0xfe947f, 0.8); mark.strokeEllipse(0, 21, 38, 10); }
      if (p.guarding) { mark.lineStyle(2, color, 0.45 + p.guard / 200); mark.fillStyle(color, 0.08); mark.fillCircle(0, 0, 31); mark.strokeCircle(0, 0, 31); }
      if (p.invulnerable > 0) { mark.lineStyle(1.5, 0xeaf7ff, 0.6); mark.strokeEllipse(0, 0, 40, 53); }
      if (p.charge > 0) { const radius = 4 + p.charge * 10; mark.fillStyle(FIGHTERS[p.fighter].color, 0.15); mark.fillCircle(p.facing * 22, -1, radius + 5); mark.fillStyle(0xeeffff, 0.8); mark.fillCircle(p.facing * 22, -1, radius / 2); }
      const danger = p.y > ARENA.bounds.bottom - 260 || p.x < ARENA.bounds.left + 220 || p.x > ARENA.bounds.right - 220 || p.y < ARENA.bounds.top + 190;
      if (danger && visiblePlayer) {
        mark.lineStyle(2, 0xffab7d, settings.reduced ? 0.8 : 0.55 + Math.sin(time / 130) * 0.25); mark.strokeCircle(0, 0, 35);
        mark.fillStyle(0xffab7d); mark.fillTriangle(-4, 42, 4, 42, 0, 48);
        if (p.id === localId) { actor.label.setText(`${p.name} · DANGER`).setColor('#ffb58b'); }
      }
      if (p.id === localId && p.cooldown > 0) { mark.fillStyle(0x0b1521, 0.9); mark.fillRect(-16, 36, 32, 3); mark.fillStyle(color); mark.fillRect(-16, 36, 32 * (1 - Math.min(p.cooldown / 3, 1)), 3); }
      if (!settings.reduced && visiblePlayer && Math.hypot(p.vx, p.vy) > 600) { const speed = Math.hypot(p.vx, p.vy); this.effects.lineStyle(p.stun > 0 ? 5 : 3, color, 0.24); this.effects.lineBetween(actor.x, actor.y, actor.x - p.vx / speed * 40, actor.y - p.vy / speed * 40); }
      if (p.attack && visiblePlayer) this.drawAttack(visualPlayer, actor.x, actor.y, time);
      if (this.lastGround.get(p.id) === false && p.grounded && visiblePlayer && !settings.reduced) this.spark(actor.x, actor.y + 22, 0x8ab0bf, 3, 18);
      this.lastGround.set(p.id, p.grounded);
      const outside = visiblePlayer && (actor.x < visible.x + 28 || actor.x > visible.right - 28 || actor.y < visible.y + 50 || actor.y > visible.bottom - 40);
      actor.edge.setVisible(outside);
      if (outside) { const ex = Phaser.Math.Clamp(actor.x, visible.x + 46, visible.right - 46), ey = Phaser.Math.Clamp(actor.y, visible.y + 50, visible.bottom - 46); const arrow = actor.x < visible.x + 28 ? '◀' : actor.x > visible.right - 28 ? '▶' : actor.y < visible.y + 50 ? '▲' : '▼'; actor.edge.setPosition(ex, ey).setText(`${arrow} ${p.id === localId ? 'YOU' : p.name.slice(0, 7)}`).setScale(1 / c.zoom); }
    }
    for (const field of activeRoom.fields) { const col = teamColor(field.team); this.effects.fillStyle(col, settings.reduced ? 0.05 : 0.07); this.effects.fillCircle(field.x, field.y, field.radius); this.effects.lineStyle(2, col, 0.4); this.effects.strokeCircle(field.x, field.y, field.radius); if (!settings.reduced) for (let i = 0; i < 5; i++) { const x = field.x + Math.sin(i * 12 + time / 1500) * field.radius * 0.85; const y = field.y - (time / 30 + i * 13) % 55; this.effects.fillStyle(col, 0.45); this.effects.fillRect(x, y, 3, 3); } }
    for (const shot of activeRoom.projectiles) {
      const oldShot = sceneData.previous?.projectiles.find(s => s.id === shot.id);
      const x = oldShot ? Phaser.Math.Linear(oldShot.x, shot.x, progress) : shot.x, y = oldShot ? Phaser.Math.Linear(oldShot.y, shot.y, progress) : shot.y;
      const col = teamColor(shot.team), g = this.effects;
      if (shot.kind === 'burst') { g.lineStyle(2, col, 0.7); g.strokeCircle(x, y, shot.radius + Math.sin(time / 90) * 3); g.fillStyle(col, 0.2); g.fillCircle(x, y, shot.radius); g.fillStyle(0xf1faff, 0.9); g.fillRect(x - 3, y - 3, 6, 6); }
      else if (shot.kind === 'wave') { g.lineStyle(3, col, 0.8); g.strokeEllipse(x, y, shot.radius * 2, shot.radius * 3); g.fillStyle(col, 0.2); g.fillEllipse(x, y, shot.radius * 2, shot.radius * 3); }
      else if (shot.kind === 'shard') { g.fillStyle(col, 0.95); g.fillPoints([{ x: x + shot.radius + 4, y }, { x, y: y - shot.radius }, { x: x - shot.radius - 4, y }, { x, y: y + shot.radius }], true); g.fillStyle(0xf0ffff); g.fillRect(x - 2, y - 2, 4, 4); }
      else { if (!settings.reduced) { g.lineStyle(shot.radius * 1.5, col, 0.22); const length = Math.hypot(shot.vx, shot.vy) || 1; g.lineBetween(x, y, x - shot.vx / length * 40, y - shot.vy / length * 40); } g.fillStyle(col); g.fillCircle(x, y, shot.radius); g.fillStyle(0xf5ffff); g.fillCircle(x, y, shot.radius * 0.45); }
    }
    for (const event of activeRoom.events) if (event.id > this.eventId) {
      this.eventId = event.id;
      if (event.kind === 'hit' && activeRoom.tick - event.tick < 12) {
        const heavy = (event.damage ?? 0) >= 14;
        for (const id of [event.victim, event.attacker]) {
          const actor = id ? this.actors.get(id) : undefined;
          if (actor && !settings.reduced) { actor.freezeUntil = performance.now() + (heavy ? 65 : 40); if (id === event.victim) actor.flashUntil = performance.now() + 95; }
        }
        const length = Math.hypot(event.dx ?? 0, event.dy ?? 0) || 1;
        const nx = (event.dx ?? 1) / length, ny = (event.dy ?? 0) / length;
        this.effects.lineStyle(heavy ? 5 : 3, 0xfff3c2, 0.9);
        this.effects.lineBetween(event.x - nx * 18, event.y - ny * 18, event.x + nx * (heavy ? 60 : 35), event.y + ny * (heavy ? 60 : 35));
        if (heavy) audio.play('heavy');
      }
      if (event.kind === 'hit'  || event.kind === 'guard') { this.spark(event.x, event.y, event.kind === 'guard' ? 0xd8f8ff : teamColor(event.team), settings.reduced ? 2 : 8, 70); if (!settings.reduced && event.kind === 'hit' && activeRoom.players.some(p => p.id === localId && Math.hypot(p.x - event.x, p.y - event.y) < 45)) c.shake(70, 0.002); }
      if (event.kind === 'ko') { this.spark(Phaser.Math.Clamp(event.x, visible.x + 10, visible.right - 10), Phaser.Math.Clamp(event.y, visible.y + 10, visible.bottom - 10), teamColor(event.team), settings.reduced ? 4 : 18, 210); if (!settings.reduced) c.shake(180, 0.003); }
      if (event.kind === 'respawn') this.spark(event.x, event.y, 0xb6f1ec, settings.reduced ? 3 : 10, 80);
    }
    if (activeRoom.phase === 'active' && performance.now() - latestAt > 1500) $('#arena-status').textContent = 'SIGNAL DELAYED · WAITING FOR SERVER'; else $('#arena-status').textContent = `${activeRoom.training ? 'TRAINING' : 'SERVER-AUTHORITATIVE'} · ${latency} MS · 60 HZ`;
  }
  private drawAttack(p: Player, x: number, y: number, time: number) {
    const a = p.attack!, g = this.effects, color = FIGHTERS[p.fighter].color;
    const aim = Math.atan2(a.dy, a.dx), started = a.age >= a.startup, active = started && a.age < a.startup + a.active;
    const radial = ['pulse', 'burst', 'hammer', 'blades'].includes(a.kind);
    if (!started) {
      const anticipation = a.age / Math.max(a.startup, 0.001);
      g.lineStyle(1, color, 0.25 + anticipation * 0.4);
      if (a.kind === 'burst') { g.strokeCircle(x, y, a.reach * anticipation); for (let i = 0; i < 4; i++) { const angle = i * Math.PI / 2 + time / 800; g.fillStyle(color, 0.65); g.fillRect(x + Math.cos(angle) * a.reach * anticipation - 2, y + Math.sin(angle) * a.reach * anticipation - 2, 4, 4); } }
      else { const wx = x + Math.cos(aim) * 23, wy = y + Math.sin(aim) * 23; g.strokeCircle(wx, wy, 7 + anticipation * 6); }
      return;
    }
    if (!active) return;
    const contact = Phaser.Math.Clamp((a.age - a.startup) / a.active, 0, 1);
    if (['cannon', 'shard', 'shockwave'].includes(a.kind)) {
      g.fillStyle(color, 0.35); g.fillTriangle(x + p.facing * 22, y - 11, x + p.facing * 22, y + 5, x + p.facing * 46, y - 3);
      if (!settings.reduced) { g.fillStyle(0xf1ffff); g.fillRect(x + p.facing * 27 - 3, y - 6, 6, 6); }
      return;
    }
    if (a.kind === 'counter') { g.lineStyle(2, 0xd4c3ff, 0.8); g.strokeCircle(x, y, 30); g.strokeCircle(x, y, 36); return; }
    if (a.kind === 'field') return;
    if (a.kind === 'pull') {
      g.lineStyle(2, color, 0.75);
      for (let i = 0; i < 3; i++) { const distance = a.reach * (1 - (contact + i / 3) % 1); const px = x + p.facing * distance; g.lineBetween(px, y - 20, px - p.facing * 12, y); g.lineBetween(px - p.facing * 12, y, px, y + 20); }
      return;
    }
    if (radial) {
      g.lineStyle(a.kind === 'hammer' ? 5 : 2, color, 0.75); g.fillStyle(color, settings.reduced ? 0.025 : 0.065); g.fillCircle(x, y, a.reach); g.strokeCircle(x, y, a.reach);
      if (a.kind === 'pulse' || a.kind === 'burst') { g.lineStyle(2, 0xe8ffff, 0.6); g.strokeCircle(x, y, a.reach * contact); return; }
    }
    const span = p.fighter === 'rivet' ? 1.8 : p.fighter === 'wisp' ? 1.2 : 0.75;
    const start = aim - span, end = aim + span * (0.1 + contact * 1.9);
    const drawArc = (radius: number, tint: number, width: number, alpha: number, offset = 0) => {
      g.lineStyle(width, tint, alpha); g.beginPath();
      for (let i = 0; i <= 16; i++) { const angle = Phaser.Math.Linear(start, end, i / 16); const px = x + Math.cos(angle + offset) * radius, py = y + Math.sin(angle + offset) * radius; if (!i) g.moveTo(px, py); else g.lineTo(px, py); } g.strokePath();
    };
    drawArc(a.reach * 0.82, color, p.fighter === 'rivet' ? 8 : 4, 0.8);
    drawArc(a.reach * 0.9, 0xf0ffff, 1.5, 0.9);
    if (p.fighter === 'wisp') drawArc(a.reach * 0.65, 0x9ffff0, 3, 0.7, 0.45);
    if (p.fighter === 'morrow') {
      for (let i = 0; i < 3; i++) { const angle = aim - 0.5 + i * 0.5; const px = x + Math.cos(angle) * a.reach * contact, py = y + Math.sin(angle) * a.reach * contact; g.fillStyle(color, 0.9); g.fillPoints([{ x: px, y: py - 5 }, { x: px + 4, y: py }, { x: px, y: py + 5 }, { x: px - 4, y: py }], true); }
    }
    if (a.kind === 'recovery' || a.kind === 'dash' || a.kind === 'blink') {
      g.lineStyle(4, color, 0.45); g.lineBetween(x, y + 12, x - Math.cos(aim) * 60, y - Math.sin(aim) * 60);
    }
  }
  private spark(x: number, y: number, color: number, count: number, spread: number) {
    if (this.particles > 180) return;
    for (let n = 0; n < count; n++) {
      const angle = Math.random() * Math.PI * 2, distance = spread * (0.3 + Math.random() * 0.7), size = 2 + Math.floor(Math.random() * 3);
      const particle = this.add.rectangle(x, y, size, size, n % 3 ? color : 0xf5ffff).setDepth(70); this.particles++;
      this.tweens.add({ targets: particle, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance, alpha: 0, scale: 0.2, duration: 180 + Math.random() * 180, ease: 'Cubic.Out', onComplete: () => { particle.destroy(); this.particles--; } });
    }
  }
}
function transmitInput() { if (online && localId && room) send({ type: 'input', seq: sequence++, ...readInput() }); }
// Input polling is independent of rendering, so GPU stalls do not hold a movement key on the server.
setInterval(transmitInput, 1000 / 60);
applySettings(); renderBindings(); render(); connect();
new Phaser.Game({ type: Phaser.AUTO, width: 1600, height: 900, parent: 'game', pixelArt: true, roundPixels: true, antialias: false, backgroundColor: '#080f20', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, fps: { target: 60 }, scene: RelayStation, audio: { noAudio: true }, render: { powerPreference: 'high-performance' } });
