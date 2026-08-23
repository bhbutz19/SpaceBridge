# SpaceBridge Architecture

## Core rule

The host server is authoritative. Browser clients never write ship or universe state directly. Humans and AI both submit validated station commands to the same command bus.

```text
Human station ──┐
                ├──> validated command ──> authoritative simulation
AI officer ─────┘
```

This keeps human/AI handoff predictable and gives the future conversational layer a safe boundary: an LLM may decide what command to request, but it does not mutate simulation state itself.

## Runtime

- **Server:** Node.js + TypeScript + Colyseus
- **Client:** React + TypeScript + Vite
- **Transport:** Colyseus/WebSockets over LAN
- **Stations:** Captain, Helm, Tactical, Engineering, Science
- **Spectator display:** `/viewscreen`

## v0.3 command authority

Each station has exactly one active controller. A human claim immediately blocks AI commands for that role. Releasing the station returns authority to its deterministic AI officer.

Captain commands are separate from station commands. The Captain can set standing orders for an operational role. If that role is AI-controlled, its behavior changes. If a human occupies the role, the order is displayed to the human but the server does not seize their controls.

Examples:

```text
Captain -> Helm: INTERCEPT
Captain -> Tactical: HOLD FIRE
Captain -> Engineering: SHIELDS
Captain -> Science: SCAN
```

## Science and incomplete information

The server maintains the actual hostile ship state internally. The public snapshot masks target identity and defensive values until Science resolves them.

- Intel level 0: unknown contact; no verified firing solution.
- Intel level 1: identity/class/weapons resolved; Tactical may engage.
- Intel level 2: shields/hull resolved and exposed to clients.

This is the first step toward information asymmetry between bridge stations.

## Mission state machine

`Signal in the Dark` now progresses through:

```text
briefing
  -> investigate
  -> intercept
  -> combat
  -> reinforcement
  -> investigate
  -> intercept
  -> combat
  -> victory
```

A defeat can occur whenever player hull reaches zero. Captain reset returns the simulation to briefing while retaining connected human role assignments.

## Main viewscreen

`/viewscreen` is a read-only Colyseus client intended for a TV/projector. It consumes the same authoritative snapshots but never claims a bridge role or sends gameplay commands.

## Future LLM layer

The conversational officer layer should translate natural-language orders into the same structured command/order objects used in v0.3. Example:

```text
"Helm, keep us outside beam range"
    -> intent parser / LLM
    -> validated Helm order
    -> deterministic Helm behavior
    -> authoritative simulation
```

The deterministic officer remains the execution layer even when an LLM is added.
