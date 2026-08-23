# Architecture Contract — v0.2

## 1. Server authority

The server is the only process allowed to mutate canonical game state. Browser clients and AI officers submit structured commands only.

## 2. Stations are permissions

A station is primarily an authorization boundary, not a separate simulation. Helm owns navigation commands; Tactical owns weapon commands; Engineering owns power commands; Captain starts the mission and observes crew state.

## 3. One command bus

Human and AI station actions pass through `BridgeGame.executeCommand()`.

The command bus resolves the actor's role, checks which role is required for the requested action, verifies current station ownership, and only then calls the simulation mutation method.

```text
Human session ──┐
                ├── executeCommand(actor, command) ──> validation ──> simulation
AI role ────────┘
```

Direct AI mutation of ship state is prohibited.

## 4. Human/AI handoff

Every role has one control slot. An AI officer is considered authoritative only when that slot has no human session attached.

When a human claims an AI station:

1. the human session becomes the station owner;
2. the station controller changes to `human`;
3. subsequent AI commands for that role fail command-bus validation;
4. the human acts on the same current simulation state.

When the human leaves, the slot returns to `ai` and deterministic AI resumes during the next decision cycle.

## 5. Deterministic AI first

The v0.2 AI layer contains no LLM calls.

- Helm evaluates relative bearing and range.
- Tactical evaluates range, ammunition, charge, and cooldowns.
- Engineering evaluates range, shields, hull, and beam charge.

This gives us reproducible gameplay behavior and a safe execution layer for future conversational AI.

## 6. Simulation/render separation

The simulation contains no React, DOM, Canvas, Three.js, audio, or UI assumptions. Station screens and future viewscreen clients are projections of server state.

## 7. LLM isolation

A future language model will not receive direct mutation access. Its job will be to interpret natural-language orders and observations into structured intents. Deterministic officer logic will convert/validate those intents and submit allowed commands to the same command bus.

## 8. Information asymmetry

As Science and Communications are added, role-specific observations should be generated server-side. Clients should not simply receive every canonical field and hide fields in CSS. Information asymmetry is a gameplay rule and an authority/security boundary.
