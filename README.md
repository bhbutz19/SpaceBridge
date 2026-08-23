# SpaceBridge v0.4.0

SpaceBridge is a browser-first cooperative spaceship bridge simulator inspired by multi-station bridge games. One computer runs the authoritative game host; laptops, tablets, phones, and a TV/projector connect through ordinary web browsers on the same LAN.

## v0.4 highlights

- Five playable bridge stations: **Captain, Helm, Tactical, Engineering, Science**
- Natural-language Captain order console that converts common bridge phrases into validated standing orders
- AI crew acknowledgements, warning calls, and all-stations status reports in a dedicated Bridge Communications panel
- Dedicated read-only **Host Lobby** at `/host` with LAN join links, roster status, mission status, and viewscreen/server links
- Production-host groundwork: after a build, one Node/Colyseus process can serve stations, `/host`, `/viewscreen`, and WebSockets on port 2567
- Main viewscreen graphics pass with animated starfield, target brackets, ship/enemy silhouettes, beams, torpedoes, hit effects, and mission alert banners
- Main viewscreen second graphics pass with scanlines/vignette, engine streaks, camera shake, shield-hit ripple, danger-state HUD treatment, and expanded explosion/shockwave effects
- Deterministic AI officer for every empty operational station
- Human takeover/release at any time without restarting the mission
- Captain-to-AI standing orders
- Science scanning and progressive contact identification
- Tactical data hidden until Science resolves it
- Dedicated read-only **Main Viewscreen** at `/viewscreen`
- Longer two-contact mission with investigation, interception, combat, reinforcement, victory, and defeat stages
- Mission reset/restart while connected crew remain at their stations
- Windows install/start scripts that stay open and report errors correctly

AI crew roster:

- Helm — Lt. Vega
- Tactical — Lt. Rook
- Engineering — Lt. Chen
- Science — Lt. Sato
- Captain placeholder — Cmdr. Hale (the mission still requires a human Captain to start)

## Requirements on the host

- Node.js 20.19+ or 22.12+; Node 24 is also supported by the current toolchain
- npm
- Git for Windows available on PATH

Only the host needs Node/npm/Git. Other bridge devices only need a modern browser.

## Install

From a terminal in the repository:

```bash
npm install
```

Or on Windows, double-click:

```text
INSTALL_BRIDGE.bat
```

## Start

```bash
npm run dev
```

Or double-click:

```text
START_BRIDGE.bat
```

Host URLs:

```text
Bridge stations: http://localhost:5173
Host lobby:      http://localhost:5173/host
Main viewscreen: http://localhost:5173/viewscreen
Game server:     http://localhost:2567
Health check:    http://localhost:2567/health
```

Other devices on the LAN use the host computer's IP address, for example:

```text
http://192.168.1.182:5173
http://192.168.1.182:5173/host
http://192.168.1.182:5173/viewscreen
```

## Recommended v0.4 test

1. Take **Captain** and leave Helm, Tactical, Engineering, and Science under AI control.
2. Start `Signal in the Dark`.
3. Watch Science identify the first unknown contact.
4. Use both the standing-order buttons and the new **Captain Voice / Text Orders** console. Try phrases such as `Helm, intercept`, `Tactical, hold fire`, `Engineering, prioritize shields`, `Science, scan`, or `Status report, all stations`.
5. Confirm Lt. Vega, Lt. Rook, Lt. Chen, and Lt. Sato acknowledge orders or provide reports in **Bridge Communications**.
6. Open `/host` on the host computer to monitor station occupancy and copy LAN links.
7. Open `/viewscreen` on another display.
8. During the mission, take an AI station from another device, operate it manually, then return it to AI.
9. Complete both hostile encounters.
10. Use **RESET TO BRIEFING** and confirm connected crew remain assigned.

## Built host / packaging groundwork

The normal development launcher still runs Vite on port 5173 and Colyseus on 2567. v0.4 also adds a production-style single-process mode.

On Windows:

```text
BUILD_BRIDGE.bat
START_BUILT_BRIDGE.bat
```

Or from a terminal:

```bash
npm run build
npm start
```

In built mode, everything is served from port 2567:

```text
Stations:   http://localhost:2567/
Host lobby: http://localhost:2567/host
Viewscreen: http://localhost:2567/viewscreen
Health:     http://localhost:2567/health
```

This is groundwork for a future packaged `SpaceBridge.exe`; v0.4 does not yet produce a standalone executable.

## Automated smoke test

After dependencies are installed:

```bash
npm run test:ai
```

The test checks:

- a human Captain with AI Helm/Tactical/Engineering/Science can complete both encounters;
- AI authority stops immediately when a human takes Helm and resumes when the human leaves;
- Captain orders affect AI behavior;
- natural-language Captain orders parse into validated station orders;
- Bridge Communications returns AI acknowledgements and status reports;
- mission reset returns to briefing without dropping the human Captain.

## Authority model

```text
Human UI ───────┐
                ├──> validated station command ──> command bus ──> simulation
AI officer ─────┘

Captain standing order ──> deterministic AI policy ──> same command bus

Captain text order ──> deterministic intent parser ──> standing order ──> same command bus
```

v0.4 deliberately uses a deterministic natural-language interpreter first. A future LLM can replace or augment the intent parser, but it will still emit the same validated structured orders rather than mutating game state directly.

## Validated milestone

v0.2 was tested successfully on a real Windows host with a phone connected over the LAN, including synchronized station inputs and a complete solo mission with a human Captain and AI crew.
