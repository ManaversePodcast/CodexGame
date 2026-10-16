# Codex Game · Pixel Commons

A playable browser multiplayer foundation for a 2D pixel game. Open two tabs to see players share the same world. Move with WASD or arrow keys.

## Stack

- **TypeScript + Phaser 3:** mature 2D rendering, crisp pixel scaling, and a path to tilemaps, animation, audio, and physics. Runs in modern desktop browsers without a client install.
- **Node.js + WebSocket:** one authoritative room; clients send directional input, never positions. The server simulates and broadcasts at 20 Hz; clients interpolate snapshots.
- **Vite:** fast client development and production bundling. Shared TypeScript defines movement rules and message types.

The starter uses procedural pixel characters and scenery, with no external assets, keys, databases, or paid services.

## Develop

Use Node.js 22 or newer (validated with Node 24).

```sh
npm ci
npm run dev
```

Vite serves the game on port 5173 and proxies `/ws` to the game server on port 3001. Open the Vite address in two desktop browser tabs. The online count should reach two; movement in either focused tab appears in both. Input stops on loss of focus; disconnected clients are removed. Clients reconnect automatically.

```sh
npm test           # movement rules and real two-client WebSocket integration
npm run build      # strict type checks, client bundle, server compilation
npm start          # serves built game and WebSocket endpoint together on port 3001
```

Production supports `PORT` (default 3001). `/health` returns JSON. Run `npm start` from the repository root. Deploy the built `dist` directory, package manifests, and production npm dependencies to a Node host with persistent WebSocket support. Terminate HTTPS at a reverse proxy that forwards WebSocket upgrades; the client automatically uses WSS under HTTPS. Static-only hosting cannot run the multiplayer server.

## Layout

- `src/`: Phaser scene, networking, keyboard input, and page styles.
- `server/`: HTTP hosting and authoritative multiplayer simulation.
- `shared/`: world dimensions, protocol types, input validation, and movement.
- `tests/`: simulation and multiplayer integration checks.

## Current scope

One public, in-memory room with up to 64 connections. State resets when the server restarts. Includes bounded movement, diagonal speed normalization, malformed-input handling, stale-input timeout, connection heartbeat, payload limits, and slow-client backpressure limits. Rendering smooths network updates; local prediction and reconciliation are future work.

This is a development foundation, not a public service launch. Before a public release add authentication, origin policy appropriate to the deployment, per-client message rate limits, rooms/matchmaking, persistence if needed, monitoring, and load testing. Multiple server replicas require room routing. Combat, inventory, art production, mobile controls, and game-specific rules are intentionally left for the game design.
