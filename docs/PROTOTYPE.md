# Riftfall prototype

Implementation notes for the playable prototype. The [design document](GAME_DESIGN.md) describes the broader release direction; its acceptance gates still require the validation described there. Current numerical move tuning is in [the attack sheets](ATTACK_SHEETS.md).

## Playable scope

- Private room creation/joining, fighter and team selection, readiness, host-controlled start, three-second countdown, battle, results, and return to the same lobby.
- Up to ten combatants, five per team, with duplicates allowed. Smaller matches require at least one fighter per team; uneven teams require explicit host confirmation. Late joins spectate until the next lobby, subject to available slots.
- One static Relay Station arena: wide solid deck, three one-way platforms, ledges, open sides, and visible blast boundaries.
- Four playable fighters: Kestrel, Rivet, Wisp, and Morrow, with different movement, weight, basic attack tuning, and special behaviors.
- Acceleration/braking, ground/air jump, variable jump height, deliberate platform drop-through, limited directional influence during knockback, and a ledge hang/climb/jump.
- Eight directional basic attack variants per fighter, distinguished by grounded/aerial state and neutral/forward/up/down input. They share the fighter's baseline timing and use directional damage/launch variations rather than eight finished sprite animations.
- Neutral, side, up recovery, and down specials. Kestrel charges/fires a cannon, dashes, and pulses; Rivet swings/pulls/shockwaves; Wisp uses blades, a fast collision-aware dash, and counter; Morrow fires arcing shards, bursts, and a bounded slow field. Up specials provide recovery, with fighter-specific velocity.
- Damage percentage and weight-scaled knockback; explicit attack startup/active/recovery; one hit per victim per normal activation; no allied damage or body blocking.
- Ground guard with meter, drain, recovery delay, and guard break. Ground/air dodge with an invulnerable window and vulnerable recovery. Air dodge/recovery refresh on safe landing.
- Three personal stocks, two-second respawn delay, two-second protection, elimination, team victory, eight-minute timer, timeout tiebreaks, and simultaneous-final-stock draw handling. Attacking removes respawn protection. Ring-outs track recent attackers for credit and assists.
- Solo training against a scripted dummy, endless stocks, no clock loss, and pause. The dummy is a practice target rather than a combat AI.

## Rules and controls

A fighter loses one stock per ring-out, never a stock simply for reaching a damage percentage. Eliminated teammates remain out of play while surviving teammates continue. At timeout, compare total team stocks, then total damage on surviving fighters (lower wins), then draw. Training overrides the finite-stock/timer rules.

See [README controls](../README.md#play) for defaults. Use a separate browser context or tab per human player; the game does not implement local couch multiplayer. All participants must connect to the same server process.

Keyboard bindings, high contrast, reduced effects, and separate effects/ambient audio levels persist in local browser settings. Standard gamepad input is available, and ping is displayed. Training pause is host-controlled; ordinary multiplayer cannot pause.

The pixel characters and attack effects are prototype graphics. Hitboxes are authoritative simulation geometry and do not depend on sprite poses. Names/team markers, grouped HUD, stocks, damage, cooldown/recovery indicators, timer, and match notices make the state visible.

## Networking and lifecycle

The Node.js server owns simulation state. Clients send boolean controls with increasing sequence numbers; client positions, damage, stocks, and victory claims are never trusted. Simulation advances at 60 Hz with snapshots at approximately 20 Hz. Client rendering interpolates every fighter, including the local player; local prediction and reconciliation are not implemented. Networking remains a prototype; WebSocket ordering and packet loss can affect combat responsiveness.

Rooms are independent and remain in memory. Disconnect immediately neutralizes input, leaves an active fighter vulnerable, and transfers host controls to a connected player. A 30-second reconnect reservation preserves identity, damage, stocks, and accepted input sequence. Expiry forfeits remaining stocks; resuming cannot create a fresh life. Reconnect tokens are unguessable credentials stored by the browser. A new server process cannot restore an old match.

Brief action presses are latched between simulation steps, including their directional chord; accepted sequence numbers prevent stale input replay. Inputs/messages, room population, projectiles, and field counts are bounded. Heartbeats detect dead connections, stale held input is neutralized, slow clients cannot accumulate unlimited outgoing buffers, and abandoned rooms expire. Display names are length-limited and inserted as text. These measures support private playtesting; they do not establish public-service hardening or capacity.

## Verification

`npm test` checks deterministic gameplay and real HTTP/WebSocket connections without an unauthenticated debug or teleport endpoint. Unit tests directly create simulation states to reproduce rare cases precisely; network tests use the ordinary client protocol.

The current regression suite has 26 passing tests. It covers movement/landing, the two-jump limit including walk-off behavior, drop-through collision, ledge resource refresh, startup/single-hit/friendly-fire rules, damage/weight knockback, guard and regeneration, aerial resource limits, charged projectiles, Wisp counter, Morrow field cleanup, stock loss/respawn/protection, team elimination, timeout/draws, attribution, rematch, and training/pause. Integration checks cover ten real clients, five-per-team/full-room limits, lobby readiness, countdown, late spectator join, input authority and stale sequences, reconnect identity/forfeit, host transfer, room isolation, and failed-token rejection, late resume after forfeit, and host-controlled solo training pause.

`npm run build` performs strict TypeScript checks and produces both client and server artifacts. Chromium automation verified focused keyboard movement, attack/projectile damage against the dummy, jumping/recovery, training pause/resume, reload with the same reconnect identity and continued inputs, settings, two-browser private rooms and fighter selection/countdown, synthetic standard-gamepad input mapping, disconnect status, and a narrow responsive layout. No page errors occurred. Synthetic controller input does not establish physical-controller feel or compatibility.

`npm run smoke:rooms` connects ten real WebSocket clients to a running server and finishes two full stock matches, including respawns, final elimination/draw, results, return to lobby, and rematch. It was run against both development and built production servers. The production run completed in 28.9 seconds with 60 total falls across two matches and no protocol errors. This scripted scenario deliberately walks fighters offstage; it validates match lifecycle and transport, not combat balance. It received about 33.1 MiB across all ten clients, including menus and snapshots. Pass an alternate endpoint with `npm run smoke:rooms -- ws://127.0.0.1:3002/ws`.

Human five-versus-five combat, full browser/controller compatibility, internet packet-loss behavior, visual readability, and sustained render budgets still need playtests.

`npm run profile` is a repeatable CPU/snapshot-size diagnostic of the shared simulation with ten fighters. It is not a ten-browser load test, a network throughput measurement, or a hardware support certification. Record the printed machine/tool versions and timings when comparing revisions. The design's sustained server/render p95 gates, latency/loss scenarios, and full-match human playtests remain separate validation work.

## Deliberate prototype limits

- Original final art, animation sets, music, arena polish, and numerical balance require playtesting and further production. Fast movement and recovery remain simplified; four fighters do not imply a finished competitive roster.
- Shared basic attack logic provides directional coverage. Aerial and ground variants do not yet have individually authored animation frames or independently balanced hitbox shapes for every move.
- The design's 50/100/150 ms round-trip and packet-loss acceptance study has not established a supported competitive latency range. The build has no local movement prediction/reconciliation or rollback netcode.
- Ten socket connections and a CPU microbenchmark do not certify ten-player combat readability, client frame-time budgets, sustained internet capacity, or all-browser/controller support.
- One arena and one game mode; no arena selection, moving platforms, items, campaign, ranked matchmaking, progression, accounts, persistent match recovery, public moderation, or local couch play.
- Rooms are private invitations and use display names. HTTPS/WSS, review of the configurable origin policy, observability, deployment/abuse controls, room routing across multiple processes, and operational playtests remain necessary before a public launch.

## Next playtest

Run a small private session first: verify jumping/recovery, use every special, attempt guard pressure, finish a stock match, disconnect/rejoin, and rematch. Then expand to ten players and review whether a player can identify their own character, incoming attacks, and the blast boundary at the widest camera view. Measure latency and frame time on recorded hardware before treating the later design milestones as complete.
