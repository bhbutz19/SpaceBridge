# Bridge Simulator — Vertical Slice 0.2

A browser-first, multi-station spaceship bridge simulator inspired by cooperative bridge games. One authoritative Colyseus server owns the simulation. Human stations connect through a web browser and send validated commands; deterministic AI officers use the exact same command bus when a station is empty.

## What is new in v0.2

- Active AI Helm, Tactical, and Engineering officers
- Solo play: one human Captain can start and complete the mission with an AI crew
- Human/AI station handoff at any time during a mission
- Shared server command bus for both human and AI actions
- Live AI officer names and duty/status text in the station selector and Captain crew panel
- AI authority is revoked immediately when a human claims its station and resumes when the human leaves

AI crew roster:

- Helm — Lt. Vega
- Tactical — Lt. Rook
- Engineering — Lt. Chen
- Captain placeholder — Cmdr. Hale (does not autonomously start missions in v0.2)

## Current prototype

- Four browser stations: Captain, Helm, Tactical, Engineering
- Server-authoritative ship, enemy, weapons, shields, movement, damage and mission state
- One starter mission: intercept and destroy a hostile raider
- Responsive browser UI suitable for laptops, phones, and tablets
- LAN-ready development configuration
- Empty operational stations are automatically run by deterministic AI

## Requirements on the host computer

- Node.js 20.19+ or 22.12+ (modern Node 24 also works)
- npm
- Git available on PATH for the current development dependency install
- Host and station devices on the same network for LAN play

Only the host needs the development tools. Other bridge stations only need a modern web browser.

## Run it

```bash
npm install
npm run dev
```

On the host computer:

- Client UI: `http://localhost:5173`
- Colyseus server: `http://localhost:2567`
- Health check: `http://localhost:2567/health`

For another device on the same LAN, open:

```text
http://HOST_LAN_IP:5173
```

The browser client automatically connects to Colyseus on `HOST_LAN_IP:2567`.

## First solo test

1. Open the client on the host or another device.
2. Enter your name.
3. Take **Captain**.
4. Leave Helm, Tactical, and Engineering under AI control.
5. Press **START MISSION**.
6. Watch the Captain crew panel and bridge log.

The AI crew will:

- **Helm:** intercept the raider, manage range, and settle into a combat orbit.
- **Tactical:** track the target, fire torpedoes at longer range, then combine beam and torpedo fire inside weapons range.
- **Engineering:** prioritize engines while closing, weapons while charging, and shields when the ship takes damage.

## Test human takeover

While the mission is running:

1. Open the bridge URL in another browser tab/device.
2. Enter a different officer name.
3. Select an AI-controlled station such as Helm.
4. The AI immediately loses permission to issue commands for that station.
5. Operate the station manually.
6. Press **Return Station to AI**.
7. The AI resumes from the current live ship state.

## Authority model

Humans and AI do not mutate simulation state directly.

```text
Human UI ───────┐
                ├──> validated station command ──> command bus ──> simulation
AI officer ─────┘
```

Example commands:

```text
setHeading(090)
setThrottle(75)
setPower(weapons, 55)
fireBeam()
fireTorpedo()
```

The command bus verifies which role is allowed to issue each command and whether the actor currently owns that station.

## Validation completed for v0.2

The core simulation was exercised headlessly before packaging. After `npm install`, you can repeat the key checks with `npm run test:ai`.

- AI-only Helm/Tactical/Engineering completed the starter mission with a human Captain.
- In the smoke run, the raider was destroyed in approximately 11.5 simulated seconds.
- Human takeover of Helm blocked further AI Helm commands.
- Returning Helm to AI caused it to immediately resume pursuit from the live state.
- Client and server TypeScript source passed syntax/type-shape checks in the build environment.

The full `npm install && npm run build` could not be executed in the packaging environment because outbound package installation timed out, so the real dependency/build test should still be run on the host after extraction.

## Next milestone

Suggested v0.3 scope:

1. Science/Sensors as station #5 with server-enforced incomplete information.
2. Dedicated `/viewscreen` display for a TV/projector.
3. Captain-to-crew orders and task queue, initially deterministic rather than conversational.
4. Mission reset/restart and a slightly longer scenario.
5. Host landing screen with LAN address and QR code.
6. Begin packaging the host so normal players do not need Node/npm/Git installed.

Conversational LLM control should still sit above the deterministic officer layer rather than bypassing it.
