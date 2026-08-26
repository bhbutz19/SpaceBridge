# SpaceBridge v0.5.0-alpha.40

SpaceBridge is a browser-first cooperative spaceship bridge simulator. One authoritative host runs the simulation while bridge stations connect through browsers on the same LAN; deterministic AI officers fill empty stations and use the same validated command paths as human players.

## v0.5 alpha.40 Pre-engagement diplomacy and hail initiative

- Plain-language hails and distress calls now open immediately. Frequency acquisition is reserved for explicitly encrypted, coded, damaged, or intercepted traffic.
- Every initial ship-to-ship hail offers positive, neutral, and hostile responses with distinct replies and authoritative consequences.
- Added a real pre-engagement communications phase. Player and hostile weapons remain held until the initial exchange closes, except for profiles explicitly configured to launch a surprise attack.
- Added mutual commitments: our ship can promise to withdraw, contacts can agree to hold position, and either party can violate its agreement and trigger hostility.
- Added profile-based hail priority from 1–5. Emergency contacts initiate immediately, while reserved or routine traffic waits longer—or indefinitely—for the authority vessel to hail first.
- The Hail control is disabled while that contact already has an unresolved hail or distress channel.
- Communications displays initiative, trust, weapons posture, hail priority, and live commitment status; Tactical displays a clear diplomatic weapons-hold banner.

## v0.5 alpha.39 Communications clarity and transcript follow

- Main-view and station conversation transcripts now follow the newest exchange automatically, keeping the latest response visible during longer hails.
- Rebuilt carrier acquisition into a compact, always-visible frequency finder with side-by-side tuning controls and a clearly labeled decode action.
- Added explicit workflow banners that distinguish inbound signal decoding, outgoing live hails, incoming open channels, and internal traffic review.
- Classified message traffic by operational type: hostile flashes red, neutral blue, friendly green, and internal bridge data yellow.
- Separated the outgoing-hail control from hostile interception and jamming controls so transmitting and decoding read as different tasks.

## v0.5 alpha.38 Communications workflow and viewscreen handoff

- Opening a visual hail or distress channel temporarily auto-tunes the shared main viewscreen to Communications and retains the Captain's previous display selection.
- Ship-to-ship conversations show separate lines for USS Prototype and the remote captain, including the selected response and the remote vessel's reply.
- Responses no longer close a channel immediately. Communications explicitly closes the channel after the exchange, at which point the main viewscreen restores its retained mode.
- Reorganized the Communications station into a persistent select → tune → respond → close workflow. Signal acquisition and channel responses remain on the station instead of opening a separate workbench overlay.
- Added a four-light attention strip for incoming traffic, carrier tuning, required responses, main-view linkage, and array failure states. Work remains user-directed; no console opens itself.
- Non-visual intercepts and coded traffic do not take over the main viewscreen.

## v0.5 alpha.37 Captain-controlled main viewscreen

- Rebuilt the main viewscreen as a true full-height display with no permanent title/objective header or right-side information pane. The live picture fills the available screen and essential target or ship data lives in one compact bottom dock.
- The Captain can rotate the shared display among forward camera, aft camera, tactical radar, mission goals, and communications. This is an authoritative shared setting, so every connected main-view display changes together.
- Forward and aft cameras use ship-relative bearings, on-screen contact framing, and off-axis direction cues. Radar, mission status, and communications now each receive the full display instead of competing for space.
- Ship-to-ship hail and distress traffic can show the speaker on the main screen. Meridian, Kestrel, and Viper commanders have distinct portraits; unresolved carriers remain obscured and non-visual intercepts retain a signal-only treatment.
- Added alpha.37 regression coverage for Captain-only display authority, all five modes, invalid-mode rejection, and transmission-to-portrait routing.

## v0.5 alpha.36 Combat presentation and ship identity

- Every station map now renders compact directional silhouettes for player, Kestrel, Viper, civilian, and unresolved ship contacts. Helm, Tactical, Science, Captain, and the viewscreen inset therefore share the same readable headings without enlarging the contacts.
- Selected contacts use angular targeting brackets plus a concise live condition tag, replacing the less legible circular selection pulse.
- Hostile map silhouettes visualize the authoritative shield envelope, hull condition, engine and weapon disablement, repair activity, and surrender power-down state.
- The main viewscreen adds profile-specific asset slots, animated enemy shield envelopes and engine emissions, hull breach/scar feedback, subsystem-offline flags, repair activity, and surrender power-down treatment.
- A compact target-condition card keeps hostile shields, hull, operational state, and mapped offline systems visible without covering the battle.
- `src/shared/shipVisuals.ts` centralizes presentation thresholds and profile selection. This release changes no damage, repair, surrender, movement, or weapon authority.

## v0.5 alpha.35 Precision-disable balance and crew handoff

- A valid subsystem lock now routes 86% of penetrating damage into the selected system and only 14% into hull collateral. Taking one healthy subsystem offline costs roughly 10–15 hull points instead of nearly destroying the vessel.
- Each disabled hostile subsystem receives a 30–45 second damage-control mobilization buffer before any repair can begin. Science displays the countdown and identifies the subsystem once active restoration emissions appear.
- Deceptive surrender repairs obey the same buffer; the Viper can still stall, but no longer restores a system almost immediately after it is disabled.
- Tactical still designates the desired precision subsystem, but Communications now owns the three-channel targeting-link puzzle and transmits the completed solution back to fire control.
- Tactical retains uninterrupted beam and torpedo access while Communications works. Shots fired before the data link is complete remain ordinary general fire; completed links concentrate subsequent penetrating hits.

## v0.5 alpha.34 Subsystem consequences and surrender

- Hostile subsystem damage now changes what the ship can actually do: engine damage reduces speed and turning, weapon damage reduces cadence and output before disabling fire, shield damage lowers capacity and regeneration before an offline generator collapses the envelope, and sensor damage reduces targeting confidence and accuracy.
- Disabling hostile Communications stops normal traffic and active interception, while still permitting an emergency surrender beacon.
- Combat capability is classified as combat-capable, degraded, mission-killed, or surrendered. Disabling engines and weapons—or knocking out three subsystems—creates a real surrender opportunity instead of requiring hull destruction.
- Communications can demand surrender when Science confirms sufficient pressure. The cautious Kestrel may accept; the persistent Viper can refuse or stall while covertly attempting repairs.
- Accepted surrender activates a server-enforced ceasefire and Tactical weapon interlock. Science must verify weapons, propulsion, and targeting power-down before the encounter is secured.
- Tactical, Science, Communications, and the main viewscreen now share compact surrender and subsystem-condition cues without obscuring the battle display.







## v0.5 alpha.33 Adaptive hostile AI

- Enemy combat is now driven by reusable personality profiles and a utility evaluator rather than a single fixed maneuver loop.
- The first Kestrel fights as a cautious flanking skirmisher: it favors strafing and stand-off pressure, breaks for shield recovery earlier, and withdraws at a safer hull threshold.
- The Viper fights as a persistent assault hunter: it prefers closer range, commits longer to attack runs, and accepts more damage before breaking contact.
- Hostiles evaluate firing lanes, range, player vulnerability, their own shields/hull/subsystems, recent incoming damage, and sensor confidence on timed decision ticks. Commitment windows and transition margins keep choices readable instead of twitchy.
- Science's three-peak tactical analysis now reveals combat doctrine, traits, preferred range, live intent, threat/opportunity estimates, targeting confidence, and the reason for the current decision.
- Helm and Tactical receive compact live-intent cues after Science completes the profile, keeping the main battle view unobstructed.

## v0.5 alpha.32 Combat feedback and handling pass

- Reduced forward/reverse speed, acceleration, turn response, and lateral-thruster response for the playable ship. The heavy-cruiser example now scales down further so larger profiles feel appropriately weighty.
- Tactical precision, beam-capacitor, and torpedo-guidance workbenches now dismiss themselves when their solution is completed. Engineering diagnostics and Communications signal acquisition do the same.
- Successful weapon effects track the target's live position until impact. Hits produce a visible impact burst and `HIT` marker; misses pass beside the target with `MISS`, while out-of-range beams stop short with `DISSIPATED`.
- Replaced whole-card weapon activation with dedicated, high-contrast `FIRE BEAM` and per-tube `FIRE` buttons beside every weapon readout.

## v0.5 alpha.31 Persistent Tactical battle view

- Beam, hostile-beam, and typed torpedo fire now produce authoritative animated effects directly on bridge maps, including impact or miss/dissipation states.
- Removed permanent Bridge Log panels from every station. A consistent `BRIDGE LOG` control now lives in the shared top telemetry bar and opens the log on demand.
- Rebuilt Tactical as an uninterrupted combat scope plus a full-height right-side fire-control rail. Precision target selection is a compact dropdown instead of a separate panel.
- Tactical precision, capacitor, and guidance work now opens in a small edge workbench that leaves the battle map visible.
- Science tactical analysis is now an interactive three-peak spectral mini-game. Completing it maps hostile geometry and unlocks Tactical's optional beam-capacitor synchronization; ordinary beam fire remains available.
- Added ship-profile-driven torpedo tubes with independent reload cycles. The prototype carries two tubes, while the heavy-cruiser example demonstrates four.
- Added Photon, Quantum, and Ion torpedoes with separate inventories and shield, hull, and subsystem damage profiles.

## v0.5 alpha.30 Tactical engagement awareness

- Added a persistent engagement strip that keeps the selected target, positional advantage, and both weapon solutions visible at a glance.
- Tactical contacts now use compact directional ship silhouettes, making relative headings legible without opening another console.
- Beam and torpedo controls show explicit `READY` or `BLOCKED` states and list the exact interlock, range, arc, identification, subsystem, capacitor, or magazine reason preventing fire.
- Added hostile-relative position and firing-arc awareness so Tactical can immediately call out bow exposure, flank position, or stern advantage and coordinate with Helm's active maneuver director.
- Optional beam timing, torpedo guidance, and precision-targeting work remains in focused overlays; the server remains authoritative for every shot.
- Added shared pure awareness calculations and alpha.30 regression coverage for identification gating, firing solutions, subsystem interlocks, and hostile-relative geometry.

## v0.5 alpha.29 Captain command-deck overlays
- Reworked the Captain station around a persistent tactical overview plus compact mission, ship-status, crew-status, and navigation-summary panels.
- Moved option-heavy Captain controls into focused overlays: Crew Standing Orders, Navigation Orders, Voice/Text Command Console, Bridge Communications, and Bridge Log.
- Added a full-width Command Deck action strip with current active-order count, latest bridge-comms preview, and log count.
- New bridge communications callouts blink on the Captain Command Deck until opened/acknowledged; opening a focused console never changes underlying game state.
- Preserved the existing Captain mission/objective and ship-condition attention behavior while reclaiming more screen space for situational awareness.

## v0.5 alpha.28 Helm positional combat

- Replaced simple circular orbit recommendations with target-relative combat positions: Flank Port, Flank Starboard, Take Stern, and Hold Range. The server tracks both desired range and desired position around the selected ship and continuously solves a moving intercept point.
- Added a target-relative position marker on the Helm scope plus position error, positional advantage, and mapped hostile maneuver state so the officer can see whether the ship is actually gaining the flank/stern.
- Hostile AI now fights in committed Approach → Attack Run → Extend → Reposition cycles instead of perfectly nose-tracking the player every frame. This creates real maneuver windows.
- Turn rate now depends on speed. The configured mid-speed maneuvering band gives full authority, while very low and very high speeds turn less effectively. Engineering engine power and subsystem health still scale the result.
- Added limited lateral maneuvering thrusters. Hold Q/E or the PORT/STBD controls to slide sideways while keeping the ship's nose and weapon arc pointed elsewhere.
- Flight projection includes lateral motion and the new speed-dependent turn curve. AI Helm uses the same target-relative director after Science maps hostile geometry.

## v0.5 alpha.27 Helm layout + firing-geometry patch

- Target-relative maneuvering now occupies the full-width lower Helm workspace instead of being squeezed into the narrow right column. Range/bearing/aspect, maneuver buttons, and Flight Director are visible together.
- Helm maneuver buttons now have explicit high-contrast idle, hover, disabled, and active states so labels remain readable before selection.
- The Bridge/Ship Log has moved off the permanent station surface. A compact `SHIP LOG` button on the navigation panel opens the log in a focused overlay and closes without affecting flight controls or simulation state.
- Helm radar now renders the player's own weapon geometry alongside Science-revealed hostile geometry: a cyan forward beam sector and a dashed torpedo range ring, each labeled with current ship-profile range/arc values.

## v0.5 alpha.26 Helm flight mechanics

Helm now uses a real flight-control loop instead of only heading/throttle sliders. Click the navigation scope to set a requested heading, use A/D or arrow keys for fine steering, and W/S or arrow keys for throttle. The ship turns and accelerates according to ship-profile flight characteristics, supports reverse thrust, and shows an 8-second projected path.

Helm can independently select a contact and receives range, bearing, relative bearing, closing/opening speed, and aspect information. Maneuver directors provide continuously updated recommendations for Intercept, Orbit Port/Starboard, Match Velocity, Break Away, Emergency Reverse, and Hold; optional Flight Assist can follow those recommendations, while any direct human control immediately disengages the assist. After Science completes tactical analysis, mapped hostile forward weapon geometry appears on Helm radar and enemy fire is now physically restricted to that firing arc.

### alpha.25 UI attention pass

The non-Engineering bridge stations now use the same acknowledgement-first UI philosophy as Damage Control. New mission stages, Captain orders, Science discoveries, Tactical analysis milestones, sensor contacts, and Communications traffic can flash locally until acknowledged. Focus-heavy Tactical and Communications work opens in overlays only when the player requests it, keeping the primary station view readable during combat.

## v0.5 alpha.24 Engineering alert acknowledgement + AUTO crews

- Engineering damage tiles now alert by severity instead of forcing a diagnostic overlay open: yellow for damaged, orange for critical, and red for offline.
- Clicking a flashing subsystem acknowledges the current severity and selects it for inspection; the tile remains color-coded until fully repaired. Escalating into a worse severity tier starts the alert flashing again.
- Diagnostic overlays open only when the Engineer chooses the action from the Active Diagnostic pane.
- Repair crews now support configurable AUTO DAMAGE CONTROL mode. AUTO crews finish their current assignment and automatically dispatch to damaged subsystems when they would otherwise be idle.
- Manual crew assignment overrides AUTO for that individual crew; AUTO ALL restores automation quickly during combat.
- Ship profiles expose `repairCrews.autoDispatchDefault` so different ship classes can choose whether repair teams begin in automatic mode.

## v0.5 alpha.23 Engineering diagnostic overlay

- Engineering mini-games now open in a centered full-screen diagnostic overlay so the complete puzzle can remain visible during play.
- Closing the overlay never resets server-side puzzle progress; returning to the same subsystem resumes the same puzzle state.
- The Engineering middle pane is now a compact diagnostic dock with status, moves/faults, and an explicit OPEN REPAIR/RESTORATION CONSOLE action.
- Active diagnostics auto-open when a new puzzle is generated, and can be closed with the on-screen control, Escape, or by clicking the backdrop.
- Circuit, Junction Isolation, breaker, coolant, and fuse layouts are compressed specifically for one-screen overlay visibility.

## v0.5 alpha.22 full-screen station UI pass

- Reworked all six playable stations into fixed, full-screen bridge-console layouts on desktop.
- Each station now has one dominant primary workspace with docked secondary controls and compact status/log areas.
- Reduced outer margins, panel padding, and dead space while keeping every existing gameplay control available.
- Added a compact always-visible station header with hull, shields, speed, mission state, and station identity.
- Added station-specific accent colors while preserving the shared SpaceBridge visual language.
- Panels that can grow now scroll internally so the bridge console stays within one viewport; tablets and phones fall back to natural vertical scrolling.
- No gameplay mechanics or command authority changed in this pass.

## v0.5 alpha.20 Communications depth pass

Communications is now a full bridge-workflow station rather than a simple hail button. Incoming traffic is kept in a persistent priority queue, human operators acquire carriers with tuner/filter controls, structured NPC responses drive mission outcomes, and identified hostiles can be intercepted or jammed. Jamming degrades hostile targeting while intercept work produces tactical intelligence and a decoded traffic entry. AI Communications uses the same queue/tuning/response/EW systems for solo play.

## v0.5 alpha.19 Science free-pan radar

Science can now explore the long-range map independently of the ship. Drag the Science radar with a mouse or touch gesture to move the map center, then use the existing 2x/4x/8x zoom around that location. `CENTER SHIP` restores ship-following, `CENTER SELECTED` jumps to the currently selected space object, and `FULL` restores the original full-map ship-centered view. Panning is a client display operation only; it does not change what the server considers scanned or identified.

## v0.5 alpha.19 Science radar zoom and static-object separation

Science remains the widest-area station but can now zoom its ship-centered sensor display to **2x, 4x, or 8x**, then return to **FULL MAP**. Zoom is a local display choice and does not alter server sensor authority or object positions.

`Nereid IV` and the second hostile were already separate server objects, but their previous starting coordinates (`-25,22` and `-24,24`) placed them almost on top of one another. Nereid IV has been moved farther away for visual clarity, and a regression test now verifies that static world objects retain fixed world coordinates while dynamic ships move independently.


## v0.5 alpha.17 Dynamic Captain target courses

- Science-identified contacts become available to the Captain as navigation targets.
- Captain can issue a tracking course to a known ship/object; the ordered bearing recalculates continuously as that object moves.
- Human Helm sees the live bearing and moving dashed course vector without losing manual controls.
- AI Helm follows the live bearing and makes way toward the target, slowing as it approaches.
- Fixed headings, target-tracking courses, and maneuver orders supersede each other cleanly.
- Captain text orders understand phrases such as `Helm, course to the target.` and named mapped contacts.


## v0.5 alpha.16 Station scopes and weapon geometry

The bridge stations now see the tactical space at different scales, configured per ship in `src/server/config/shipProfiles.ts`:

- **Tactical** uses the shortest scope, matched to the ship's weapons envelope. Contacts beyond scope disappear from the detailed radar, while known hostiles produce a bearing-only edge beacon.
- **Helm** uses a broader navigation scope and overlays current ship heading plus the Captain's fixed heading order.
- **Science** defaults to a full-map sensor view that automatically fits all known map objects.

Weapon geometry is also ship-profile-driven. The prototype has a 15 km beam range with a 180-degree forward firing arc and a 24 km all-around torpedo envelope. The heavy-cruiser example shows how a future hull can use 360-degree beam coverage. Tactical displays these envelopes directly on radar, and the authoritative server enforces both range and arc.

The Captain can issue an exact heading from the Captain station or by text (`Helm, heading 090`). Human Helm sees the ordered heading; AI Helm follows it until the order is cleared or superseded by a maneuver order.

## Multi-object map foundation

Alpha.15 introduces a general `spaceObjects` world projection. Ships, stations, planets, moons, asteroids, anomalies, debris, and beacons use the same map-object shape. Tactical and Science each keep an independent selected contact, and current mission maps include configured non-ship objects as examples. Add future static map content in `src/server/config/worldObjects.ts`.

## v0.5 alpha.14 Tactical skill mechanics

Tactical now has two optional skill systems layered on top of normal firing. Neither is required to use the weapons; a human or AI officer can still fire beams and torpedoes at normal effectiveness.

- **Beam Capacitor Timing** runs a server-authoritative discharge cycle. Tactical can synchronize inside the highlighted optimal window to bank a one-shot beam bonus. Better timing produces a stronger bonus, up to roughly 1.35x on the next beam shot.
- **Torpedo Guidance** is a three-gate intercept exercise. Tactical opens a guidance package for the currently selected target and marks each intercept gate as the flight cursor crosses it. Completing all three stages banks a one-shot torpedo bonus of up to roughly 1.40x.
- Guidance is target-specific. Changing the selected enemy subsystem invalidates the old torpedo solution and requires a new package.
- Engineering weapon power and Science shield/subsystem solutions continue to stack with these Tactical skill bonuses, so the best attacks still depend on the bridge team.
- AI Tactical uses the same systems opportunistically but never blocks ordinary weapons fire while waiting for a perfect timing result.

## v0.5 alpha.13 Team combat loop

Science, Engineering, and Tactical now combine their station abilities during combat:

- Science completes the normal contact scan, then can run a deeper Tactical Analysis.
- At 45% Tactical Analysis, Science resolves the hostile shield resonance and transmits a modulation solution. Tactical then deals 1.4x effective damage to enemy shields.
- At 100% Tactical Analysis, Science maps hostile Engines, Shields, Weapons, Sensors, and Communications for precision targeting.
- Engineering weapon-power allocation now directly scales beam and torpedo damage. At healthy weapon condition the continuous multiplier is roughly 0.5 + Weapon Power / 100, from 0.5x at zero power to 1.5x at full power.
- Tactical can select mapped enemy subsystems, align a three-axis precision lock, and concentrate penetrating damage on the selected system.
- Enemy subsystem damage has gameplay consequences: damaged engines slow pursuit, damaged weapons reduce enemy damage and rate of fire, damaged sensors reduce enemy accuracy, and damaged shield control slows regeneration.
- Empty stations remain AI-capable: Lt. Sato performs tactical analysis, Lt. Chen manages power, and Lt. Rook selects subsystem priorities and acquires precision locks with a deliberate delay.

## v0.5 alpha.12 Ship-specific repair-crew transit

Repair-crew travel timing is now configured per ship in `src/server/config/shipProfiles.ts`. The active prototype profile defines crew count, repair scaling, casualty chance, subsystem compartment positions, and transit timing in one place. To make a larger or smaller ship, add a ship profile and change `ACTIVE_SHIP_PROFILE_ID` (future lobby ship selection can choose this dynamically).

The simplest tuning controls are:

```ts
fromStandbyBaseSeconds: 5,
fromStandbyPerStepSeconds: 0.75,
betweenSystemsBaseSeconds: 4,
betweenSystemsPerStepSeconds: 1.5
```

Subsystem positions are also configurable. For unusual layouts, `routeOverridesSeconds` can set an exact travel time for a specific route such as `engines>weapons`.

## v0.5 alpha.11 Repair crews

- Engineering has **three repair crews** by default. The count is controlled by `REPAIR_CREW_CONFIG.count` in `src/server/game.ts`; the server state and UI render the crew array dynamically, so the number can be increased or reduced later.
- Repair crews are assigned independently from Engineering's diagnostic focus. A subsystem receives conventional repair only while at least one living crew is physically on station.
- Reassignment takes time. Crews enter an **EN ROUTE** state and contribute no repair until they arrive. Travel time varies with the source/destination compartment.
- Multiple crews accelerate repair with diminishing returns: 1 crew = 1.0×, 2 crews = 1.75×, 3 crews = 2.5× conventional repair rate.
- If a catastrophic combat failure destroys a subsystem while a crew is working there, each exposed crew has a small independent casualty risk. A lost crew remains unavailable for the rest of the mission and returns only after mission reset.
- Quick diagnostics still provide their repair-rate boost, but the boost only helps conventional repair when crews are actually on that subsystem. Offline systems still require critical restoration before any crew can raise integrity.
- AI Engineering deploys the same crew resource automatically when the station is unoccupied.

## v0.5 Engineering workflow

Engineering now has three repair tiers:

- **Routine / degraded (76–99%)** — no puzzle required; one or more assigned repair crews perform conventional repair.
- **Combat repair (1–75%)** — optional fast tasks (breaker reset, coolant balancing, or fuse replacement) that grant an immediate repair bump and temporary 3× repair boost.
- **Offline (0%)** — crew repair is suspended until Engineering completes a full restoration procedure. Critical restoration alternates between the randomized circuit-routing board and Junction Isolation.

Offline systems now have real gameplay consequences: engines cannot propel the ship, weapons cannot fire/recharge, sensors cannot scan, communications cannot hail, and an offline shield subsystem cannot regenerate shields until restored. AI Engineering can perform both quick repairs and full restorations, but critical procedures take substantially longer than a skilled human.

### Persistent diagnostics and protected focus

Engineering diagnostics now belong to the **subsystem**, not to whichever card happens to be selected. If you start a mini-game on Shields, switch to Engines, and later return to Shields, the exact same unfinished puzzle returns with every move preserved.

A new casualty also no longer interrupts a human Engineer who is already working an active diagnostic. If another subsystem drops offline, its critical-restoration procedure is generated and queued in the background; the current puzzle stays on screen until the Engineer chooses to change focus or solves it.

## v0.5 alpha highlights

- Adds **Communications** as the sixth playable station, with AI officer **Lt. Reyes** and human/AI handoff.
- Adds the first **mission selector** at the Captain station.
- Keeps the existing combat mission **Signal in the Dark**.
- Adds **Meridian Distress**, the first non-combat mission: answer a civilian distress call, rendezvous with CSV Meridian, hold close formation, and complete an emergency support transfer.
- Adds friendly/civilian contact state and external communications traffic.
- Adds subsystem health for **engines, shields, weapons, sensors, and communications**.
- Adds Engineering **repair-crew deployment**, damage-control diagnostics, and automatic AI crew assignment when Engineering is unoccupied.
- Damaged systems now affect movement, shield regeneration, weapon recharge, sensor resolution, and communications capability.
- Preserves Captain natural-language orders, Bridge Communications, Host Lobby, built-host mode, and the v0.3.2 viewscreen graphics baseline.

## Crew

- Captain — human command seat (Cmdr. Hale remains the placeholder AI identity)
- Helm — Lt. Vega
- Tactical — Lt. Rook
- Engineering — Lt. Chen
- Science — Lt. Sato
- Communications — Lt. Reyes

## Run

```bash
npm install
npm run dev
```

Or use `START_BRIDGE.bat` after dependencies are installed.

Development URLs:

```text
Stations:       http://localhost:5173/
Host lobby:     http://localhost:5173/host
Main viewscreen:http://localhost:5173/viewscreen
Server health:  http://localhost:2567/health
```

## Automated tests

```bash
npm run test:ai
```

The v0.5 alpha test set covers the existing combat/AI/handoff/order tests plus:

- fast breaker, coolant, and fuse combat-repair tasks;
- hard-offline repair lockout until circuit/Junction restoration succeeds;
- AI offline-restoration fallback timing;
- offline engines, sensors, and weapons gameplay consequences;

- AI completion of Meridian Distress without a human Communications officer;
- human takeover of Communications blocking AI Communications actions;
- human distress acknowledgement advancing the mission;
- deterministic combat subsystem damage;
- Engineering repair assignment restoring a damaged subsystem;
- ship-profile Tactical/Helm/Science sensor-scope configuration;
- Captain fixed-heading orders, including natural-language heading commands;
- forward-only beam firing-arc enforcement and all-around torpedo launch geometry.

## Meridian Distress test

1. Take Captain.
2. At briefing, select **Meridian Distress**.
3. Leave Communications under AI control for a solo test, or have another browser take Communications.
4. Start the mission.
5. Communications acknowledges CSV Meridian's distress call.
6. Helm closes to rendezvous distance.
7. Hold within support range while Engineering transfers emergency support.
8. The mission completes when Meridian reaches a stable condition.

## Communications station

When a friendly/civilian contact is active, Communications can:

- open a channel;
- acknowledge a distress call;
- tell the contact to stand by;
- decline assistance;
- follow Captain standing orders: AUTO, MONITOR, HAIL, or SILENT.

The deterministic Captain text interpreter also understands phrases such as `Communications, hail the contact` and `radio silence`.

## Damage control

Engineering now sees five subsystem-health values. Selecting a subsystem assigns repair crews to it. Empty Engineering stations automatically prioritize the most damaged subsystem. Damage is deterministic so tests remain reproducible.

The authoritative-server rule remains unchanged: human and AI station commands pass through the same validation layer; no AI system directly mutates game state outside the simulation rules.

### Engineering diagnostic bypass puzzles

When a subsystem is damaged, Engineering can assign repair crews and optionally solve a manual diagnostic bypass to accelerate the repair. Three puzzle types are included. Circuit routing uses the randomized 4×4 board introduced in alpha.4. Alpha.5 replaces the old matching-wires diagnostic with Junction Isolation, a multi-attribute reasoning module:

- circuit routing: rotate board tiles to complete a powered path;
- junction isolation: inspect six junctions, use lead profile + lamp + bypass-tag attributes against a protocol matrix, then resolve conditional action codes using checksum parity, auxiliary-bus state, and reserve power;
- fuse replacement: choose the smallest standard fuse that safely covers each measured bus load.

Repairs continue slowly even if the puzzle is ignored. A successful human solution grants an immediate repair pulse plus a temporary 3x repair-rate boost. AI Engineering can also complete the bypass after a short simulated troubleshooting delay, preserving solo play.


## Alpha engineering test control

During v0.5 alpha testing, the Engineering station includes a **System Failure Drill** panel. Select a subsystem under Damage Control, then use the drill controls to set it to 55%, 20%, 0% (offline), or restore it to 100%. This is a testing aid only and does not alter normal combat damage unless a player presses one of the drill buttons.

### Catastrophic subsystem failures (alpha.8)

Routine subsystem damage cannot take an online system below **1%** while the ship still has shield protection. Once shield charge reaches zero, hull impacts gain a small chance to cause a true subsystem knockout. The base chance is **5%** with a functioning shield grid and **10%** if the shield subsystem itself is offline; heavier hits receive a modest increase. Already-damaged systems are more likely to be selected. A knockout immediately creates a Critical Restoration procedure in Engineering.



## Catastrophic failure tuning

In alpha.9, catastrophic subsystem failures remain shield-gated but are rarer: 2% per meaningful unshielded hull hit, or 5% when the shield subsystem itself is offline. Already-damaged systems remain more likely to be selected if a catastrophic failure occurs.
