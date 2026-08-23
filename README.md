# SpaceBridge v0.3

SpaceBridge is a browser-first cooperative spaceship bridge simulator inspired by multi-station bridge games. One computer runs the authoritative game host; laptops, tablets, phones, and a TV/projector connect through ordinary web browsers on the same LAN.

## v0.3 highlights

- Five playable bridge stations: **Captain, Helm, Tactical, Engineering, Science**
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
Main viewscreen:  http://localhost:5173/viewscreen
Game server:      http://localhost:2567
Health check:     http://localhost:2567/health
```

Other devices on the LAN use the host computer's IP address, for example:

```text
http://192.168.1.182:5173
http://192.168.1.182:5173/viewscreen
```

## Recommended v0.3 test

1. Take **Captain** and leave Helm, Tactical, Engineering, and Science under AI control.
2. Start `Signal in the Dark`.
3. Watch Science identify the first unknown contact.
4. Use **Captain Orders** to tell Helm to HOLD, INTERCEPT, or EVADE; Tactical to HOLD FIRE or go WEAPONS FREE; Engineering to prioritize systems; and Science to SCAN or go PASSIVE.
5. Open `/viewscreen` on another display.
6. During the mission, take an AI station from another device, operate it manually, then return it to AI.
7. Complete both hostile encounters.
8. Use **RESET TO BRIEFING** and confirm connected crew remain assigned.

## Automated smoke test

After dependencies are installed:

```bash
npm run test:ai
```

The test checks:

- a human Captain with AI Helm/Tactical/Engineering/Science can complete both encounters;
- AI authority stops immediately when a human takes Helm and resumes when the human leaves;
- Captain orders affect AI behavior;
- mission reset returns to briefing without dropping the human Captain.

## Authority model

```text
Human UI ───────┐
                ├──> validated station command ──> command bus ──> simulation
AI officer ─────┘

Captain standing order ──> deterministic AI policy ──> same command bus
```

The future conversational AI layer will sit above this system rather than bypassing it.

## Validated milestone

v0.2 was tested successfully on a real Windows host with a phone connected over the LAN, including synchronized station inputs and a complete solo mission with a human Captain and AI crew.
