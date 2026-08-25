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

## Command authority

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

## Bridge communications

The authoritative snapshot now contains a structured `commsLog`. Captain text orders, AI acknowledgements, Science identifications, Tactical range calls, Engineering damage warnings, and status reports are recorded as communication events. The communications layer is presentation/state only; it cannot bypass station authority.

## Host lobby

`/host` is a read-only operations dashboard. It shows current mission state, human/AI station occupancy, station join URL, viewscreen URL, and server health URL. It intentionally does not receive privileged mutation rights. Mission authority remains with the Captain station.

## Built-host topology

Development mode remains split for fast iteration:

```text
Vite UI :5173  --->  Colyseus :2567
```

After `npm run build`, v0.4 can run a single-process host:

```text
Node / Colyseus / Express :2567
  ├─ /            station UI
  ├─ /host        host lobby
  ├─ /viewscreen  main display
  ├─ /health      health endpoint
  └─ WebSocket    authoritative room traffic
```

This is packaging groundwork, not yet a standalone executable.

## Future LLM layer

v0.4 adds a deterministic natural-language Captain interpreter before any LLM integration. It translates common bridge phrases into the same structured command/order objects used by the button controls. Example:

```text
"Helm, keep us outside beam range"
    -> intent parser / LLM
    -> validated Helm order
    -> deterministic Helm behavior
    -> authoritative simulation
```

The deterministic officer remains the execution layer even when an LLM is added.

## v0.5 mission framework

The snapshot now carries a mission ID so Captain can select mission logic at briefing. `Signal in the Dark` remains the combat vertical slice; `Meridian Distress` is the first non-combat objective chain and introduces friendly contacts.

Communications is a full station authority boundary, not a cosmetic panel. Human and AI Communications both use `hailContact` / `sendCommsResponse` through the same command validator.

Damage-control state is authoritative and shared. Subsystem integrity modifies simulation effectiveness, while Engineering assigns one repair priority at a time. This creates cross-station consequences without allowing the UI to change system health directly.

## Engineering repair tiers (v0.5 alpha.6)

Subsystem health now controls the repair path. Above 75% the repair crew works without a mini-game. From 1–75%, Engineering may complete a short server-validated combat-repair task for an immediate repair bump and temporary speed multiplier. At exactly 0%, the subsystem is hard-offline: passive repair is frozen until a server-validated critical restoration procedure succeeds.

Critical restoration currently uses the randomized circuit-routing board and Junction Isolation. A completed restoration does not instantly make the system healthy; it re-energizes the subsystem at partial integrity so normal repair can resume. AI Engineering uses the same state machine and command authority, with longer simulated completion times.

## Engineering diagnostic persistence (v0.5 alpha.11)

Unfinished Engineering diagnostics are stored server-side by subsystem. `repairTarget` represents the Engineer's current focus; it is not the owner of puzzle state. Switching focus projects the stored puzzle for the newly selected subsystem without regenerating any unfinished diagnostic.

When a different subsystem suffers a catastrophic 0% failure while a human Engineer is solving an active puzzle, the server creates and stores the failed subsystem's restoration procedure but does not change `repairTarget`. The Engineer can finish the current task or manually switch to the new casualty. If the subsystem currently being worked on is itself knocked offline, its quick diagnostic is invalidated and replaced with the appropriate restoration procedure.


## Repair crews (v0.5 alpha.11)

Repair crews are authoritative simulation entities rather than UI-only counters. `REPAIR_CREW_CONFIG.count` currently creates three crews, while the protocol exposes a dynamic crew array so future ships or difficulty modes can change that number without rewriting station UI.

Each crew has one of four states: `idle`, `traveling`, `working`, or `dead`. A reassignment command starts server-timed transit; the crew contributes no repair until arrival. Conventional subsystem repair is calculated independently for every subsystem with crews on station, allowing Engineering to split teams across simultaneous casualties or stack teams for faster repair.

Quick diagnostic boosts are tracked per subsystem. Offline systems remain hard-gated by their critical restoration puzzle even if crews are already present. Once restored, surviving crews already in that compartment resume conventional repairs immediately.

A catastrophic shield-down combat failure evaluates casualty risk only for crews whose authoritative state is `working` on the failed subsystem. Casualties persist for the mission and are reset with the mission state. AI Engineering issues the same crew assignment commands through the normal command bus.

## Ship profiles and repair-crew transit (v0.5 alpha.12)

Ship-layout-dependent Engineering tuning lives in `src/server/config/shipProfiles.ts`, not in the core repair loop. A `ShipProfile` controls repair crew count, scaling/casualty tuning, abstract subsystem compartment positions, and travel timing. The game asks `repairCrewTransitSeconds()` for dispatch time rather than calculating ship geometry itself.

This is deliberately data-driven so future ships can have different internal sizes/layouts. Most ships can use position + seconds-per-step tuning; exceptional routes can use exact `routeOverridesSeconds`. The current prototype still uses three crews and preserves the alpha.11 travel behavior.


## Team combat data flow (v0.5 alpha.13)

Combat station depth is intentionally cross-station rather than isolated:

```text
Science primary scan
    -> hostile identity / hull / shield state
    -> deeper Tactical Analysis
        -> shield resonance solution -> Tactical shield coupling bonus
        -> subsystem geometry map -> Tactical precision target selection

Engineering weapon power + weapon subsystem health
    -> authoritative weapon output multiplier
    -> beam / torpedo damage

Tactical selected subsystem + server-validated precision lock
    -> normal shield/hull damage
    -> concentrated subsystem damage when the attack can reach that system
```

The server owns tactical-analysis progress, shield-frequency discovery, target selection, precision-lock axes/quality, enemy subsystem health, and all resulting damage. The browser only presents controls and submits structured commands. AI Science/Tactical use the same command bus and information gates as human stations.


## Tactical skill mechanics (v0.5 alpha.14)

Beam timing and torpedo guidance are optional Tactical execution layers on top of the existing Science/Engineering/Tactical combat pipeline. The server advances both timing cursors and validates every timing mark. The browser never reports its own score or damage multiplier.

```text
Engineering weapon output ──────────────┐
Science shield/subsystem intelligence ──┼─> authoritative weapon damage
Tactical precision target lock ─────────┤
Beam timing OR torpedo guidance bonus ──┘
```

Beam timing stores a one-shot synchronization quality and multiplier which is consumed by the next beam shot. Torpedo guidance stores a three-gate, target-specific solution which is consumed by the next torpedo launch. Both reset on use; torpedo guidance also resets when the selected target changes. AI Tactical invokes the same commands and can gain the same bonuses, but is allowed to fire without them so optional skill mechanics never deadlock solo play.


## General space-object model

The authoritative snapshot exposes `spaceObjects`, a type-neutral world projection for ships, stations, planets, moons, asteroids, anomalies, debris, and beacons. Mission-static objects are data-driven through `src/server/config/worldObjects.ts`; dynamic actors are layered into the same collection by the simulation. Tactical and Science own separate contact-selection IDs so one station can analyze a contact while the other engages a different one. Legacy `enemy` and `friendlyContact` fields remain during the migration so existing mission/combat systems stay stable while future multi-contact combat moves onto the generic object model.
## Station sensor scopes and weapon geometry (v0.5 alpha.16)

Ship layout now controls both information scale and weapon geometry through `src/server/config/shipProfiles.ts`. The active ship profile defines Tactical, Helm, and Science sensor scopes plus beam/torpedo ranges and total firing arcs. Science can use a `null` range to auto-fit the entire known map.

```text
spaceObjects[]
   ├─ Tactical projection -> short weapon-area scope + hostile edge bearings
   ├─ Helm projection     -> medium navigation scope + heading vectors
   └─ Science projection  -> full known map
```

Weapon authorization remains server-side. A client button being enabled is only presentation; `BridgeGame` independently checks the selected hostile, system availability, range, and mount firing arc before applying damage. This allows future ship profiles to represent forward-only emitters, broadside arrays, dorsal turrets, or full 360-degree cruiser coverage without changing Tactical command semantics.

Captain fixed-heading orders are stored separately from Helm's current/requested heading. Human Helm receives the order as bridge information; AI Helm treats it as a course to maintain until cleared or superseded.



## Dynamic Captain navigation targets (v0.5 alpha.17)

Captain navigation now distinguishes a fixed compass heading from a tracked world-object course. A tracked order stores the authoritative `captainNavigationTargetId`; the server resolves the current object coordinates and continuously derives `captainHeadingOrder` from the moving relative position.

Only identified/known selectable objects can become Captain navigation targets. The active hostile becomes eligible after Science identification. Static charted objects and known friendly contacts are eligible immediately.

Human Helm receives the live bearing as an order/reference and retains manual heading/throttle controls. AI Helm uses the same live bearing through the normal validated Helm commands and adjusts throttle as it approaches the tracked object. A fixed heading or a superseding Helm maneuver order clears the tracked target.

## Science display zoom and static world objects (v0.5 alpha.18)

Science radar zoom is client-local presentation state. It changes only the displayed scope radius; it does not mutate `spaceObjects`, sensor knowledge, contact positions, or server authority. Configured world objects such as planets/stations/asteroids are re-instantiated from mission map data with fixed world coordinates, while dynamic ship contacts are synchronized from their own simulation entities. Regression coverage verifies that moving a hostile cannot move Nereid IV.


## Science free-pan display (v0.5 alpha.19)

Science's long-range radar now separates the **camera/view center** from the authoritative player-ship position. The default camera follows the ship, but a human Science officer can drag the radar to establish a client-local world-space center and zoom around that point. The camera can snap back to the ship or to the currently selected object.

This camera state remains client-side only. The server continues to own object world coordinates, Science identification state, scan progress, and all gameplay-relevant sensor information. Changing the Science view center therefore never reveals hidden server data or moves any space object.

## Communications traffic and electronic warfare (v0.5 alpha.20)

Communications traffic is authoritative server state. Each transmission retains its source object, priority, type, carrier/filter solution, signal quality, open/resolved state, message, and structured response options. The client only manipulates tuner/filter controls and submits response IDs; it never changes mission or contact state directly.

Communications has an independent selected map contact. Hostile electronic-warfare state tracks jamming and interception separately from ordinary message traffic. Jamming is validated against an identified live hostile and Communications subsystem health before influencing enemy targeting. Interception progresses server-side and creates a decoded transmission/intelligence item on completion. Empty Communications stations are driven by Lt. Reyes through the same command bus.

## Full-screen station console layout (v0.5 alpha.21)

Station UIs remain projections of authoritative server state; this pass changes presentation only. Desktop station routes are designed as fixed single-viewport consoles with one dominant station workspace, docked secondary tools, and internally scrolling logs/queues where necessary. Tablet and phone layouts fall back to document scrolling so no control becomes inaccessible. The shared header exposes common ship telemetry without granting any new command authority.

## Engineering alert acknowledgement and automatic crews (alpha.24)

Engineering damage notification is presentation state, not simulation authority. Subsystems report authoritative health as before; the human Engineering client derives severity tiers (minor, critical, offline) and locally acknowledges alerts. Acknowledgement suppresses flashing for that incident but does not alter subsystem health, diagnostics, or repair behavior. Escalation to a higher severity tier creates a new alert, and returning to 100% resets acknowledgement for the next casualty.

Repair-crew automation is authoritative server state. Each `RepairCrewState` exposes `autoDispatch`. AUTO crews remain committed to a damaged compartment until it is restored, then the server dispatches them to another damaged system using health plus current crew commitment as its priority score. Explicit human assignment disables AUTO for that crew, so automation never overrides a deliberate manual deployment. AI Engineering re-enables AUTO when it resumes the station. The default AUTO state is ship-profile configuration under `repairCrews.autoDispatchDefault`.


## Helm flight director and hostile firing geometry (v0.5 alpha.26)

Helm now separates **manual flight control**, **maneuver recommendation**, and **optional assist**. The authoritative ship state still owns actual heading, requested heading, throttle, signed speed, and world position. Ship-specific flight characteristics are configured in `shipProfiles.ts` (`maxForwardSpeed`, `maxReverseSpeed`, turn-rate parameters, acceleration response, and default combat orbit range).

`HelmState` stores the selected relative-navigation contact and server-derived maneuver solution. Intercept/orbit/match/break-away calculations produce recommended heading and throttle; enabling Flight Assist applies those recommendations to the same ship controls a human Helm uses. Direct human heading or throttle commands immediately disengage assist, preserving human override authority.

Hostile ships now carry internal heading, speed, turn rate, primary beam range, and forward firing arc. Their movement turns toward the player at a finite rate rather than translating directly toward the player's coordinates. Enemy attacks are accepted only when the player is physically inside the hostile firing envelope. The public snapshot withholds hostile heading/range/arc until Science completes tactical analysis, after which Helm can render the authoritative geometry.

The projected Helm path is client presentation only: it predicts roughly eight seconds using the public ship profile and current controls. It does not move the ship or bypass the server command bus.


## Helm presentation geometry and focused log (v0.5 alpha.27)

Alpha.27 does not change server authority or flight simulation. The Helm station reorganizes the existing relative-navigation state into a full-width lower workspace and moves the event log into the shared client-side focused overlay. Opening or closing the Ship Log is local presentation state only.

The Helm radar now draws the player's beam and torpedo envelopes from `snapshot.shipCapabilities.weapons`, centered on the authoritative ship position and rotated by authoritative `ship.heading`. These are presentation overlays only: Tactical/server-side weapon validation continues to determine whether a shot is legal. Hostile weapon geometry remains gated by Science analysis exactly as in alpha.26.


## Target-relative Helm combat model (v0.5 alpha.28)

Helm maneuver assists are now **position objectives**, not circular steering shortcuts. For a selected moving ship the server derives the player's bearing in the target's local frame, then solves a moving world-space point at the requested combat range. Flank Port targets roughly -90 degrees from the hostile bow, Flank Starboard +90 degrees, Take Stern 180 degrees, and Hold Range preserves the relative position that existed when the order was selected. The resulting heading/throttle remain recommendations unless Flight Assist is engaged.

Ship turn performance is profile-driven. `shipProfiles.ts` defines an optimal maneuver-speed band plus low/high-speed authority factors. Engine subsystem health and Engineering engine power multiply the available turn rate; Helm cannot bypass those limits. Lateral thrust is also ship-profile-driven and is represented in authoritative `ShipState` by commanded lateral thrust plus damped lateral velocity. It supplements, rather than replaces, forward/reverse flight.

Hostile movement uses a compact combat state machine: `approach -> attackRun -> extend -> reposition`. During an attack run and extension the hostile commits to a heading for a finite period instead of recalculating perfect pursuit every simulation frame. The public Helm display receives the hostile maneuver label only after Science has mapped its tactical geometry.


## Captain command-deck presentation model (v0.5 alpha.29)
The Captain station now separates persistent situational awareness from option-heavy command workflows. Mission objective, tactical overview, ship condition, crew status, and a compact navigation summary remain visible in the primary station grid. Detailed Crew Orders, Navigation Orders, natural-language Command Console, Bridge Communications, and Bridge Log are client-local focused overlays launched from the Command Deck. Overlay state is presentation-only and does not alter server authority, command validation, AI control, mission state, or acknowledgement semantics beyond the local visual attention state.
