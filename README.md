# Riftfall

A browser prototype of an original pixel-art team platform fighter. Create a private room, choose one of four fighters, and battle with up to ten players across two teams. Each fighter has three personal stocks; the last surviving team wins.

Built with TypeScript, Phaser 3, Vite, and a Node.js authoritative WebSocket server. Pixel characters, scenery, and effects are generated locally; no asset downloads, account, database, or API keys are required.

## Run on Windows

Install **Node.js 24 LTS** (minimum 22.12) and **Git** first. Development is validated with Node 24. In Windows Command Prompt, clone and start:

```cmd
cd /d "%USERPROFILE%"
git clone https://github.com/ManaversePodcast/CodexGame.git
cd CodexGame
npm ci
npm run dev
```

If you already have the repository, update and start it instead:

```cmd
cd /d "%USERPROFILE%\CodexGame"
git pull
npm ci
npm run dev
```

Open **http://localhost:5173**. Keep the terminal running. Other players need to open the same running server, then enter its room code; a room code does not connect separate local servers. For play across the internet, deploy the server to a shared Node.js host.

## Develop in the cloud or on macOS/Linux

From the repository directory:

```sh
npm ci
npm run dev
```

In the Codex cloud checkout, the directory is `/workspace/CodexGame`. That path belongs to the cloud machine; use the Windows commands above on your own PC.

The Vite client runs on port **5173**, proxies `/ws` to the game server on **3001**, and listens on all interfaces for development. Cloud onboarding validates the server using local requests; run the Windows instructions above to play on your PC.

```sh
npm test           # simulation regressions and real WebSocket room integration
npm run typecheck  # strict client/shared/server TypeScript checks
npm run build      # type checks, client bundle, server compilation
npm start          # serve the production build on port 3001
npm run profile    # repeatable ten-fighter simulation CPU/snapshot diagnostic
npm run smoke:rooms # two full ten-client matches against an already running server
```

## Play

Create a room and share its code, choose your fighter and Solar/Lunar team, and ready up. The host starts the match after everyone is ready. Each team supports five fighters; smaller matches work too. Unequal teams require the host's explicit confirmation. A solo training room provides a dummy, unlimited lives, and pause.

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Move / aim | WASD or arrows | Left stick / D-pad |
| Jump / air jump | Space, W or ↑ | A / Cross (optional stick-up jump) |
| Attack | J | X / Square |
| Special | K | Y / Triangle |
| Guard / directional dodge | L or Shift | Right trigger / bumper |
| Drop through one-way platform | Down + jump | Down + jump |
| Recovery special | Up + special | Up + special |

Direction selects up, down, or forward attacks; neutral attacks use your facing direction. Keyboard aim-up also jumps by default; disable "Keyboard aim-up also jumps" in settings to keep aiming and jumping separate. Space remains a dedicated jump button. A brief 40 ms grace period lets up + attack/special take priority over an accidental jump; holding up never repeats jumps. Release and press again for a second jump or another attack. Guard works on the ground; a direction plus guard dodges. Use your recovery special and one air dodge to return to the stage. Falling beyond the blast boundary costs a stock. Eliminated players watch until results and rematch.

The settings menu saves keyboard bindings, keyboard/gamepad tap-up jump options, combat focus, high contrast, reduced effects, and separate effects/ambient volume locally. Matches expand the arena and hide the lobby; use **Show lobby** to reopen it, **Leave match** to exit, or settings to disable automatic focus. A resource strip shows air jump, recovery, dodge, guard, and protection/cooldown state. Ping is visible during play. Training can be paused; multiplayer battles keep running.

Actions pressed within **120 ms** of becoming legal are buffered by the server. A buffered press executes once; it cannot shorten recovery, grant extra air jumps, or carry through respawn/pause/rematch. The newest attack/special replaces the older pending combat action. Ground and air attacks use the same combat tuning as before; sprite animation, hit flashes, and 40–65 ms visual hit-stop do not pause or alter the simulation. Reduced effects disables hit-stop, white impact flashes, and camera shake.

## Project documentation

- [Game design](docs/GAME_DESIGN.md): the agreed direction, full intended scope, and milestone gates.
- [Prototype scope and validation](docs/PROTOTYPE.md): what is implemented, rules, architecture, and remaining work.
- [Attack sheets](docs/ATTACK_SHEETS.md): current move tuning and counterplay.

## Production hosting

Run `npm run build`, then `npm start` from the repository root. `PORT` defaults to 3001. The HTTP server hosts `dist/client`, `/health` returns JSON, and `/ws` accepts WebSocket connections. Deploy the built `dist` directory, package manifests, and production npm dependencies to a host that supports persistent Node.js processes and WebSocket upgrades. The browser chooses WSS automatically when the page uses HTTPS.

Use a reverse proxy for HTTPS and WebSocket forwarding. Browser WebSocket origins default to the serving hostname. Set optional `ALLOWED_ORIGINS` to comma-separated exact permitted origins (such as `https://game.example.com`, without a trailing slash) when deployment needs an explicit allowlist. Static-only hosting cannot run the multiplayer server. Each server keeps its own rooms in memory; restart loses matches. Multiple replicas require room routing. This prototype is intended for private playtests; public operation still needs a reviewed deployment origin policy, monitoring, abuse controls, and measured capacity/latency testing.

## Layout

- `src/`: Phaser rendering, lobby/HUD, controls, audio, and networking.
- `shared/game.ts`: types, fighter definitions, arena geometry, input validation.
- `shared/simulation.ts`: fixed-step movement, combat, stocks, and match rules.
- `server/`: room/session lifecycle and HTTP/WebSocket hosting.
- `tests/`: deterministic gameplay tests and socket integration tests.
- `scripts/`: simulation profiling and full-match WebSocket smoke checks.
