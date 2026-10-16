# Working title: Riftfall

Game design draft · Version 0.1 · October 16, 2026

Status: discussion draft. This document proposes the game we want to build; it does not describe existing functionality. The title, roster, numbers, and milestone boundaries are provisional. No new gameplay implementation is part of this design task.

## 1. Game concept

A 2D pixel-art team platform fighter for up to ten players. Players choose fighters with distinct weapons, movement, and powers, then battle across a compact arena of platforms and dangerous open space. Attacks increase an opponent’s damage and send them flying. Players survive through positioning, defense, and recovery abilities; crossing a stage’s outer elimination boundary costs a life.

The intended combination is the immediate movement, knockback, and ring-outs of a platform fighter with the weapon identity, aerial mobility, and atmospheric science-fiction setting associated with action exploration games. Matches take place in bounded arenas. Exploration, backtracking, and a campaign are outside the initial scope. Characters, environments, music, and terminology should be original.

**Primary mode:** 5v5 team stock battle, with three lives per player.

**Target platform:** desktop web browsers, keyboard and gamepad. Target smooth 60 FPS play on typical modern laptops. Exact minimum hardware will follow measurement.

**Target experience:** readable teamwork, satisfying movement, and dramatic recoveries in matches that usually last 5–8 minutes.

## 2. Design pillars

1. **Movement is a weapon.** Jumping, aerial control, ledge pressure, and recovery matter as much as attack selection.
2. **Every fighter offers a clear identity.** A silhouette, primary weapon, signature power, and recovery style make each fighter immediately recognizable.
3. **Ten players remain readable.** Team markings, restrained effects, compact movesets, and appropriate arena space take priority over spectacle.
4. **Teams win through cooperation.** Peel attackers off allies, cover a teammate’s return, and combine pressure. No single role should be mandatory.
5. **A fall should feel earned.** Clear boundaries, reliable controls, visible danger, and predictable knockback make defeats understandable.

## 3. Match rules

### Lives and elimination

- Each fighter starts with **three personal lives**, often called stocks. Teams therefore start with 15 total lives in a full 5v5 match, but those lives are not pooled.
- Crossing any outer elimination boundary costs one life. Falling below the arena is the most common ring-out; sufficiently strong knockback can also carry someone beyond a side or upper boundary.
- Losing a first or second life triggers a respawn. Losing a third life eliminates that fighter for the rest of the match.
- **Recommended interpretation of the three-life rule:** the match ends when every fighter on one team has lost all three lives. One player’s third loss does not end the entire team match.
- Eliminated players spectate their surviving teammates. There is no stock borrowing or revival in the initial ruleset.
- Damage resets to zero on respawn. Abilities reset to their normal starting state, preventing players from banking a powerful move through a death.

### Victory and time limit

- A team wins immediately when the other team has no surviving fighters.
- Initial time limit: **eight minutes**, subject to playtesting.
- At timeout, compare total remaining lives. The team with more wins.
- If lives are tied, compare the sum of current damage on surviving fighters. Lower total damage wins.
- If both are equal, record a draw. Do not add sudden death to the first release.
- If both teams lose their final lives during the same simulation tick, record a draw.
- Award at most one life loss per fighter per simulation tick. A respawning or eliminated fighter cannot lose additional lives before becoming active again.

These rules should be shown in the lobby and post-match summary. Damage is only the timeout tiebreaker; it is not a score players must accumulate.

### Respawn and match flow

1. Host creates a private room and shares a room code.
2. Players join, choose a team and fighter, then ready up.
3. Team capacities are five players each. The lobby supports 2–10 players, with at least one player on each team. Unequal teams require a visible host confirmation; standard play uses equal teams.
4. The host selects an arena. Teams, fighters, and rules lock when the countdown begins.
5. After a three-second countdown, the battle starts.
6. A defeated fighter waits approximately two seconds, then respawns at a safe team spawn with two seconds of protection. Attacking cancels protection. Spawns must be inside safe ground, away from immediate ring-out hazards.
7. A team victory, timeout, or draw leads to results: winning team, remaining lives, ring-outs, assists, damage dealt, and falls.
8. Players return to the same lobby for a rematch and can change fighters.

Join-in-progress players spectate until the next match. Duplicate fighters are allowed initially, avoiding draft contention and supporting a small roster. Each duplicate receives a player marker.

### Teams and attribution

Friendly fire and teammate body collision are disabled. Allied attacks and projectiles pass through allies. Enemies also do not create solid body blocking initially; attacks and knockback determine space control. A team can have multiple copies of a fighter.

Credit a ring-out to the last enemy who damaged the defeated fighter within the preceding ten seconds. Other enemies who damaged them in that window receive an assist. If no enemy qualifies, count it as a self-inflicted fall. Attribution affects results, not victory rules.

## 4. Core movement and combat

### Movement

- Left/right movement, acceleration, braking, and modest air steering.
- One ground jump and one air jump. Variable jump height rewards a short tap versus holding jump.
- Crouch and deliberate drop-through on one-way platforms.
- One aerial dodge and one recovery special per airtime. These refresh after landing safely or respawning.
- A short, visible ledge grab provides a chance to climb or jump back. Repeated grabs without landing do not repeatedly restore invulnerability or recovery resources.
- No wall jumps or wall clinging in the first playable slice. A future fighter may use them as an explicit trait.

All fighters need a reliable route back from a reasonable distance offstage, with different strengths and weaknesses. Recovery should create a contest, not guarantee safety.

### Damage and knockback

Damage starts at 0% and rises when attacks connect. Increasing damage increases launch distance; reaching a particular percentage does not automatically kill a fighter. There is no conventional health bar in the initial mode.

Knockback depends on the attack’s base force, its damage scaling, the victim’s current damage, and the victim’s weight. Attack direction and limited player influence during launch allow skillful survival. Exact formulas and values are tuning work, not commitments in this draft.

Use a fixed simulation step, explicit startup/active/recovery windows, and hitboxes separate from visual sprites. A normal attack should hit each victim at most once per activation unless explicitly authored as a multi-hit move. A fighter can hit several enemies with a single appropriate attack; this makes wide attacks valuable in teams and requires careful tuning.

### Compact initial moveset

Each fighter receives:

| Input family | Actions |
| --- | --- |
| Ground attack | Neutral strike, directional forward strike, up strike, down strike |
| Aerial attack | Neutral air, forward air, up air, down air; forward air follows facing |
| Special | Neutral weapon/power, side power, up recovery, down utility |
| Defense | Ground guard, grounded directional dodge, aerial dodge |

There are no command motions, item pickups, grabs, throws, ultimate attacks, or elaborate combo trees initially. Holding a direction selects an attack; facing selects the forward variant. Consistent input rules matter more than moveset size.

### Defense and counterplay

- Ground guard reduces incoming threat but consumes a guard meter. Holding guard drains it; hits drain additional meter.
- An exhausted guard causes a brief, clearly signaled vulnerability. Guard meter regenerates while not guarding, after a short delay.
- Dodges grant a short invulnerable window followed by vulnerable recovery. Repeated dodging must not provide continuous protection.
- Specials use authored recovery and, where needed, visible cooldowns. There is no shared mana or ammunition economy in the initial mode.
- Projectiles have bounded lifetime, range, and active counts. They disappear when their owner loses a life. Respawn protection does not permit safe projectile firing.
- Heavy attacks and powerful zoning tools need clear anticipation and punishable recovery. Avoid long stuns, permanent traps, healing loops, and unavoidable team lockouts.

Hit pause, camera shake, sound, and launch trails provide feedback. Camera shake should be optional and restrained; gameplay simulation continues consistently regardless of individual visual settings.

## 5. Proposed launch roster

Four fighters are a realistic first-release target. Build and validate two before committing to all four. Roles describe strengths, not restrictions or a required team composition.

| Fighter | Identity and weapon | Signature abilities | Recovery | Weakness |
| --- | --- | --- | --- | --- |
| **Kestrel** | Balanced armored scout with an arm cannon | Short charged energy shot; forward burst; downward pulse that creates space | Upward jet boost with limited steering | Reliable everywhere, exceptional nowhere; charge is punishable |
| **Rivet** | Heavy industrial defender with a magnetic hammer | Slow sweeping strikes; short-range magnetic pull on enemies; ground shockwave | Strong vertical piston jump, weak horizontal reach | Large target, slow attacks, vulnerable away from the stage |
| **Wisp** | Light duelist using twin energy blades | Quick close-range strings; short side dash; down-special counter with a narrow timing window | Angled blink with a visible destination cue | Low weight, short reach, poor results from reckless approaches |
| **Morrow** | Midweight controller using a crystal launcher | Arcing shard shot; delayed burst; one temporary slowing field | Diagonal recoil vault | Setup time and slower close-range attacks; field has clear limits |

All roster attacks, assets, and names are original proposals. Wisp’s blink cannot pass through solid stage geometry. Rivet’s pull does not control allies or alter stage geometry. Morrow’s field has a cooldown, limited lifetime, and a maximum of one active field per fighter; it slows movement without stacking or removing jump/recovery control. Its power should be reduced or redesigned if stacking multiple Morrows harms play.

Every fighter needs an attack sheet before implementation: animation frames, hitboxes, damage, launch direction, knockback, movement restrictions, cooldown, and counterplay. Start from shared movement rules and tune differences deliberately. Do not promise complete numerical balance before playtests.

## 6. Arena design

### Starter arena: Relay Station

An abandoned orbital relay above a deep atmospheric void. A wide central deck supports team fights; three one-way platforms at staggered heights create aerial routes. Open sides support recovery and edge pressure. There are no moving platforms, destructible terrain, random hazards, or stage damage in the starter arena.

Initial blockout proposal: a 1,280-unit-wide main deck, a 720-unit playable vertical span, and roughly 24 × 40-unit fighter collision bodies. These are world units, not output resolution. Leave a recovery margin between the deck edges and outer elimination boundaries. Test those distances before producing final art.

Arena requirements:

- Enough usable floor and platform routes for ten players to spread out without forcing everyone into one choke point.
- Short routes back to meaningful action. A bounded arena should not become a chase across a giant empty map.
- Multiple routes through the center, no permanent safe camping location, and no unavoidable spawn traps.
- Team spawns placed on safe ground; no instant advantage from an obstructed opening shot.
- Distinct visual treatment for solid floors, one-way platforms, ledges, and elimination danger.
- Static geometry and deterministic collision. Decorative background elements never resemble gameplay platforms.

Use one shared camera that expands to include active fighters, within a tested zoom range. At minimum zoom, silhouettes and team markers must remain readable. Distant recovering players get edge indicators. If ten players cannot fit legibly, revise arena dimensions and camera framing before adding more visual detail. Per-client spectator cameras may follow individual fighters.

The arena is a combat space, not an exploration level. Theme and movement routes provide the action-adventure influence without adding campaign scope.

## 7. Controls and presentation

### Proposed default controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Move / aim direction | WASD or arrows | Left stick / D-pad |
| Jump | Space | A / Cross |
| Attack | J | X / Square |
| Special | K | Y / Triangle |
| Guard / dodge | L or Shift, plus direction for dodge | Right trigger, plus direction for dodge |
| Drop through platform | Down + jump | Down + jump |

Jump is a dedicated button; up selects attacks rather than causing an accidental jump. Support rebinding and keyboard-only play. Controller labels should adapt where practical. Local multi-controller play and touch controls are outside the first release.

### HUD and accessibility

- Two grouped team HUD rows, each showing five players at most: fighter portrait, player number/name, damage, lives, and elimination state.
- Team identity uses outlines, icons, and HUD grouping as well as color. Enemy effects and allied effects remain distinguishable.
- Timer and remaining team lives are prominent. The last-life state is clear without obscuring combat.
- Recovery availability and essential special cooldowns are visible near the owning player or their HUD slot.
- Compact ring-out notices; no persistent text cloud over every fighter.
- High-contrast settings, reduced shake/flashes, separate music/effects volume, and readable menus.
- Pause is available in solo training only. A multiplayer menu must not pause the match.

Use crisp pixel sprites with a consistent pixel density and nearest-neighbor scaling. Prioritize distinct silhouettes, attack anticipation, launch direction, and landing poses. Build the first slice with simple placeholder art. Commission or create final sprites after attack timing and body dimensions settle.

## 8. Multiplayer and technical direction

Retain TypeScript, Phaser, and a Node.js authoritative server as the starting stack. The existing top-down walking demo is a scaffold; platform physics, combat, stocks, teams, and match flow still need to be built.

### Simulation responsibilities

The server owns positions, velocity, collision, damage, hit resolution, lives, ability resources, teams, and victory. Clients submit sequenced input. Clients never submit trusted damage, positions, or life changes. Cap input rate and reject malformed, stale, duplicate, and out-of-range commands.

Target a 60 Hz fixed gameplay simulation and approximately 20 Hz state snapshots initially, adjusting only after measurement. Interpolate remote fighters; prototype local input prediction and reconciliation for movement. Keep combat resolution authoritative and make latency visible. Do not market rollback netcode unless a separate prototype proves it feasible for this game and ten-player load.

The current WebSocket transport is suitable for an initial private prototype, but its ordered reliable delivery can stall under packet loss. Explicitly test that risk before committing to a public competitive experience. Alternate transport or rollback work is a separate technical decision if the prototype fails the latency goals.

### Rooms and lifecycle

- One server may host independent rooms, with a hard ten-player match limit per room.
- Server state follows lobby → countdown → active → results → lobby. Only legal transitions are accepted.
- During an active match, disconnecting does not pause or make a fighter invulnerable. Input becomes neutral and their fighter remains vulnerable.
- Reserve the player’s slot and identity for a proposed 30-second reconnect window. Returning players resume the same damage and remaining lives; reconnecting never refunds a life.
- After that window, mark the fighter eliminated and forfeit their remaining lives. An eliminated player who reconnects spectates.
- Use an unguessable reconnect token; a public player ID is not a credential. Match clock and enemy actions continue throughout the window.
- If everyone disconnects, expire the room after a short cleanup window. A server crash ends an in-memory match; restoration is outside the first release.
- Lobby host departure transfers host controls to another connected player. Match simulation never depends on the host’s browser.

### Initial operating scope

Start with private room codes and display names, no account requirement. Usernames must be length-limited and rendered as plain text. Room codes are invitations, not a substitute for moderation or public-service security.

Before a public launch, require deployment-specific origin checks, input/message limits, connection limits, observability, privacy-conscious logs, and basic abuse controls. Avoid general chat in the first release; preset team pings can come later. Use HTTPS/WSS in deployment. No database is required until persistent progression or accounts are approved.

## 9. Scope and milestones

Each phase has a playable acceptance gate. Passing one phase does not imply later phases are complete. This draft deliberately omits calendar estimates until the physics/networking spike is measured.

### Phase 0 — Design agreement

Deliverables: agree on stock rules, combat model, target platform, first two fighters, and a graybox arena sketch. Create an initial attack sheet and define how readability will be judged.

Gate: the team can explain a complete match, one fighter’s actions, and exactly how a team wins. This document is the starting point, not automatic design approval.

### Phase 1 — Movement and combat sandbox

Scope: one graybox arena, one fighter, platform collision, jump/air jump, recovery, ledge behavior, basic attacks, guard/dodge, damage, knockback, ring-outs, respawn, and a stationary/moving training dummy. A local debug view may show hitboxes and frame timings.

Gate: a player can reliably move, hit a dummy, survive using recovery, lose a life, and respawn. Attacks respect authored windows; diagonal inputs and frame-rate changes do not change simulation speed. No networking polish or final art is required here.

### Phase 2 — Two-player online vertical slice

Scope: Kestrel and Rivet, 1v1 private room, fighter selection, three-life match, results/rematch, gamepad input, authoritative hit resolution, and an initial movement prediction experiment.

Gate: two real clients finish a full match; they agree on damage, deaths, and winner. Malformed input and a reconnect cannot grant damage or lives. Test simulated round-trip latency of 50, 100, and 150 ms and a packet-loss scenario; document feel, stalls, and divergence. Set a measured acceptable operating range before expanding.

### Phase 3 — Ten-player team prototype

Scope: two teams, ten connected clients, team selection, 5v5 stock rules, shared camera, full HUD, assists, reconnect/forfeit, spectators, timeout and draw handling. Duplicate fighters remain allowed.

Gate: ten real clients complete repeated matches. Validate simultaneous final deaths, tied timeouts, a full lobby, late joins, host departure, focus loss, and disconnects. Run a sustained ten-client load check and record server tick time, snapshot traffic, memory use, and render frame times. Confirm players can identify themselves and threats at the widest camera zoom.

Target budgets: server simulation p95 below 16.7 ms per tick at ten players; client p95 frame time below 16.7 ms on an explicitly recorded reference machine during ordinary combat. Stress effects and projectiles must have caps. If budgets fail, reduce active effects/complexity or revise the stack before adding content.

### Phase 4 — First playable release

Scope: four tuned fighters, one polished arena, original art/audio, remappable controls, settings, basic onboarding, deployment, diagnostics, and documented known limitations.

Gate: complete matches across the target browser matrix; keyboard and gamepad checks; all roster moves implemented and tested; accessibility/readability review; no known life duplication, repeated-hit, room-leak, or match-lock defects. Declare the supported latency range and hardware expectations from measurements. A second arena is optional after the first is proven.

### Explicitly deferred

Campaign and exploration, bosses, ranked matchmaking, tournaments, progression, unlocks, cosmetics store, crafting/inventory, persistent accounts, player-made stages, mobile, native console release, local couch multiplayer, voice/text chat, bots, rollback promises, items, ultimates, and moving/destructible stages.

Training can use scripted dummies without committing to combat AI. No progression should affect combat strength if progression is later introduced.

## 10. Main design risks and experiments

| Risk | Early experiment | Response if unsuccessful |
| --- | --- | --- |
| Ten-player combat is visually chaotic | Graybox 5v5 with full HUD and worst-case projectiles | Simplify effects/moves, revise platform layout and camera, cap projectiles |
| Early elimination creates long spectator waits | Measure time eliminated and match duration in team playtests | Tune match timer and pacing; consider a separate team-stock variant only after review |
| Projectiles dominate large teams | Play five copies of the ranged fighter against mixed teams | Tune range, recovery, cooldown, and active projectile limits |
| Teams can repeatedly juggle or trap one player | Test coordinated multi-attacker pressure and ledge coverage | Adjust hitstun, displacement, invulnerability windows, and stage routes |
| Networking feels poor for precision combat | Two-player latency/loss spike before roster expansion | Revisit prediction, transport, or game pacing before content production |
| Four unique fighters create too much content work | Complete two attack sheets and one full animated moveset | Keep the first public prototype at two fighters; expand after evidence |

## 11. Decisions for the next design review

These are recommended defaults to discuss, not blockers to reading or refining the document:

1. **Life rule:** three lives per fighter; team loses when all five fighters are eliminated. Alternative: three lives pooled across the entire team, which would create much shorter matches.
2. **Combat model:** damage percentage and scaling knockback. Alternative: health depletion plus ring-outs, which changes pacing and how recoveries matter.
3. **First fighters:** Kestrel and Rivet, providing a balanced ranged fighter and a heavy melee fighter to test different combat needs.
4. **Initial distribution:** browser-first private rooms. Native downloads can follow if browser performance or input needs justify them.
5. **Tone:** original atmospheric sci-fi with readable, colorful fighters. Final title, visual references, and story remain open.
6. **Recovery and defense complexity:** include guard, dodge, and ledges in the sandbox; tune and simplify them before roster expansion if the controls become crowded.

Next artifact after design agreement: an arena blockout diagram and detailed Kestrel/Rivet attack sheets. No additional gameplay code should be built until the core rules and Phase 1 scope have been reviewed.
