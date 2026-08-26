# Changelog

## v0.5.0-alpha.40

- Made unencrypted hail and distress channels immediately readable while retaining acquisition for encrypted, coded, damaged, and intercepted traffic.
- Added positive, neutral, and hostile response tones with two-sided ship replies.
- Added authoritative pre-engagement diplomacy, shared weapon restraint, and an explicit surprise-attack profile exception.
- Added player and contact commitments, timed compliance checks, broken-promise escalation, trust changes, and internal violation alerts.
- Added per-profile 1–5 hail initiative, delayed NPC initiation, authority-vessel-first behavior, and duplicate-hail prevention.
- Added Communications/Tactical diplomacy presentation and alpha.40 regression coverage for all new branches.

## v0.5.0-alpha.39

- Anchored main-view and Communications-station exchanges to the latest conversation line.
- Reworked frequency acquisition into a compact, fully visible console with explicit carrier and filter guidance.
- Added distinct inbound-decode, outgoing-hail, incoming-channel, and internal-review workflow labels.
- Added authoritative hostile, neutral, friendly, and internal traffic classification with red, blue, green, and yellow queue presentation.
- Separated outgoing hail controls from electronic-warfare interception and added alpha.39 regression coverage for workflow markers and all traffic classes.

## v0.5.0-alpha.38

- Added server-authoritative visual-channel takeover with retention and restoration of the Captain's previous viewscreen mode.
- Added per-channel two-sided exchange history so the main viewscreen shows both USS Prototype responses and remote replies.
- Separated responding from closing: Communications now explicitly closes an answered channel before the viewscreen returns.
- Rebuilt Communications as a persistent queue, active-channel workbench, contact/EW area, and bridge-traffic panel with no automatic pop-up consoles.
- Added flashing status lights for incoming traffic, carrier acquisition, response requirements, viewscreen linkage, and communications failure.
- Added alpha.38 regression coverage for channel handoff, response persistence, Communications-only closure, return-mode updates, exchange ordering, and non-visual traffic isolation.

## v0.5.0-alpha.37

- Replaced the overflowing main-view layout with a viewport-locked, nearly full-screen live display and compact bottom telemetry dock.
- Removed the persistent mission title, Captain objective, and right information pane from the main viewscreen.
- Added Captain-authorized shared rotation among forward camera, aft camera, tactical radar, mission goals, and communications displays.
- Added ship-relative camera bearings, off-axis contact cues, a dedicated mission presentation, and a full-screen communications channel treatment.
- Added distinct generated captain portraits for Meridian, the Kestrel, and the Viper, with unresolved and non-visual signal handling.
- Added alpha.37 regression coverage for viewscreen command authority and captain-portrait routing.

## v0.5.0-alpha.36

- Expanded compact directional ship silhouettes to every station map and added distinct player, Kestrel, Viper, civilian, and unresolved profiles.
- Replaced circular contact-selection pulses with angular brackets and an unobtrusive selected-hostile condition tag.
- Added authoritative shield, hull-damage, engine/weapon-offline, repair, mission-kill, and surrender visuals to map contacts.
- Upgraded the main viewscreen with shield envelopes, engine emissions, hull scars/sparks, subsystem-offline flags, repair orbits, surrender power-down feedback, and a compact target-condition card.
- Added reusable asset-slot identifiers so future externally generated ship art can replace the code-native silhouettes without changing combat-state wiring.
- Added alpha.36 regression coverage for profile selection and shield/hull/subsystem/repair/surrender visual-state derivation. No simulation balance or command authority changed.

## v0.5.0-alpha.35

- Rebalanced precision subsystem attacks so only 14% of penetrating damage reaches the hostile hull while the rest is routed through the active subsystem solution.
- Added independent 30–45 second enemy repair-mobilization lockouts for every disabled subsystem, followed by limited authoritative restoration.
- Made surrender-stall repairs respect the same damage-control delay instead of beginning immediately.
- Moved precision-lock alignment authority and commands from Tactical to Communications while keeping subsystem designation at Tactical.
- Added a compact Communications targeting-data-link console and replaced Tactical's lock puzzle with a live shared-link readout.
- Added Science-visible repair countdowns/activity and alpha.35 regression coverage for lock ownership, uninterrupted Tactical fire, low hull collateral, and repair timing.

## v0.5.0-alpha.34

- Connected hostile engine, weapon, shield, sensor, and communications health to authoritative movement, fire, defense, targeting, interception, and AI-confidence behavior.
- Added graded subsystem conditions, operational-state classification, mission kills, subsystem-offline bridge reports, and weapon-hardpoint secondary damage.
- Added Science-gated surrender pressure and eligibility analysis plus Communications surrender demands.
- Added personality-sensitive acceptance, refusal, and deceptive negotiation-stall outcomes; a stalling hostile can restore limited engine or weapon power while Science monitors its signatures.
- Added server-enforced surrender ceasefire interlocks, Science power-down verification, emergency-beacon fallback, surrendered-contact presentation, and surrender-based encounter resolution.
- Added alpha.34 regression coverage for every subsystem consequence, information gating, ceasefire enforcement, Kestrel acceptance/verification, and Viper deception/repair behavior.


## v0.5.0-alpha.33

- Replaced the fixed hostile maneuver loop with a profile-driven utility AI that continuously evaluates range, firing geometry, damage, subsystem health, targeting confidence, threat, and opportunity.
- Added distinct combat personalities: the Kestrel is a cautious flanking skirmisher, while the Viper is a persistent assault hunter.
- Expanded hostile intentions to include assessment, approach, committed attack runs, strafing, kiting, extension, repositioning, disengagement, shield recovery, and critical-hull withdrawal.
- Added timed decisions, minimum maneuver commitments, transition margins, and a per-enemy blackboard so hostiles respond to changing combat conditions without twitching between choices every frame.
- Science tactical analysis now identifies hostile doctrine, traits, preferred range, live intent, confidence, threat/opportunity estimates, and the reason behind the current maneuver. This information remains hidden until the analysis mini-game is complete.
- Linked compact live-intent readouts to Helm and Tactical without adding battle-obscuring overlays.
- Added alpha.33 regression coverage for doctrine differences, Science information gating, utility scoring, maneuver commitment, shield recovery, survival withdrawal, and wave-specific profile binding.

## v0.5.0-alpha.32

- Slowed the active ship's speed, acceleration, turning, and lateral response, with a stronger mass penalty in the heavy-cruiser example profile.
- Added automatic completion dismissal for Tactical, Engineering, and Communications mini-game consoles.
- Made successful fire effects follow live targets and added distinct impact bursts plus `HIT`, `MISS`, and `DISSIPATED` map markers.
- Reworked Tactical weapon activation into a dedicated beam trigger and explicit fire button for every profile-defined torpedo tube.
- Added alpha.32 regression coverage for size-scaled flight tuning and authoritative tracked impact/miss endpoints.

## v0.5.0-alpha.31

- Added transient server-authored beam, hostile-beam, and torpedo combat effects to all shared map views.
- Standardized Bridge Log access in the persistent station header and removed every permanent station-log panel.
- Reworked Tactical into a persistent map/full-height fire-control split with compact precision targeting and non-blocking edge workbenches.
- Converted Science tactical analysis into a three-stage spectral-lock mini-game and gated the optional beam-capacitor timing console behind its completion.
- Added ship-profile torpedo-tube layouts, independent reload timers, typed inventory, Tactical warhead selection, and Photon/Quantum/Ion damage profiles.
- Added alpha.31 regression coverage for Science gating, combat-effect events, tube independence/reload, profile-driven tube counts, and torpedo damage specialization.

## v0.5.0-alpha.30

- Refined Tactical around a persistent engagement strip for target, position, beam solution, and torpedo solution.
- Added directional ship silhouettes and a compact hostile-relative position card with firing-arc exposure and Helm director context.
- Replaced ambiguous disabled weapon controls with explicit `READY`/`BLOCKED` states and exact blocker explanations.
- Centralized derived Tactical awareness in a shared pure helper without changing weapon authority, command validation, or Science identification gates.
- Added alpha.30 regression coverage for target identification, firing arcs and ranges, weapon subsystem/capacitor/magazine interlocks, and flank/stern positioning.

## v0.5.0-alpha.29
- Refactored the Captain station into a situational-awareness-first command deck.
- Replaced the cramped bottom-row Crew Orders, text-command, Bridge Communications, and Bridge Log panels with on-demand focused overlays.
- Replaced the large always-open navigation order editor with a compact live navigation summary and an `OPEN NAVIGATION ORDERS` overlay action.
- Added a compact full-width Command Deck launcher with active-order, communications, and log summaries.
- Added acknowledge-on-open attention for new Captain bridge communications while preserving existing mission and ship-damage alerts.
- No server gameplay authority or command protocol changes in this release.

## v0.5.0-alpha.28

- Replaced circular orbit logic with target-relative Flank Port, Flank Starboard, Take Stern, and Hold Range directors that solve toward moving positions around the selected contact.
- Added Helm target-relative position/error/advantage telemetry and a desired-position marker on the navigation scope.
- Added ship-profile maneuver-speed curves so turn authority peaks in a configurable mid-speed band and falls at very low/high speeds.
- Added ship-profile lateral thrusters with authoritative port/starboard thrust commands, lateral velocity, keyboard Q/E controls, and projected-path support.
- Reworked hostile flight AI into committed approach, attack-run, extend, and reposition phases so enemies no longer continuously point-perfectly at the player.
- Updated AI Helm to use the target-relative stern director once Science maps hostile geometry.
- Added alpha.28 regression coverage for positional director behavior, maneuver-speed turn authority, lateral thrusters, and enemy attack-run commitment.

## v0.5.0-alpha.27

- Moved Target-Relative Maneuvering into a full-width Helm workspace beneath the navigation scope so contact data, maneuver selection, and Flight Director can be read together.
- Fixed maneuver-button readability with explicit high-contrast inactive/active/disabled states and more button room.
- Replaced the always-visible Helm Bridge Log panel with an on-demand Ship Log overlay opened from the navigation header.
- Added the player's own beam firing sector and torpedo range envelope to the Helm radar while preserving Science-gated hostile firing geometry.
- This patch is presentation-only; no flight, weapon, targeting, or command authority changed from alpha.26.

## v0.5.0-alpha.26

- Rebuilt Helm around point-and-steer flight controls, keyboard steering/throttle, reverse thrust, and ship-profile-driven acceleration/turning.
- Added an 8-second projected flight path and separate actual/requested/Captain heading vectors.
- Added independent Helm contact selection with target-relative range, bearing, closing speed, relative bearing, and aspect.
- Added maneuver directors for Intercept, Orbit Port, Orbit Starboard, Match Velocity, Break Away, Emergency Reverse, and Hold, plus optional server-authoritative Flight Assist.
- Direct human steering or throttle input immediately disengages Flight Assist without discarding the selected maneuver reference.
- Science tactical mapping now reveals hostile primary weapon range/arc/heading to Helm. Hostile beam fire is server-restricted to the modeled forward firing arc, making maneuvering outside that arc a real defensive tactic.
- Added alpha.26 regression coverage for reverse thrust, maneuver assistance/manual override, Science-to-Helm weapon geometry, and enemy firing-arc consequences.

## v0.5.0-alpha.25

- Extended acknowledgeable attention states across Captain, Helm, Tactical, Science, and Communications without changing simulation authority.
- Added blinking mission/status alerts for Captain, dynamic course/order acknowledgement for Helm, Science-to-Tactical milestone alerts, unresolved-contact pulses for Science, and priority-coded transmission alerts for Communications.
- Added manually opened focused overlays for Tactical precision targeting, beam timing, torpedo guidance, and Communications signal/channel work so these tasks never cover the station unexpectedly.
- Compacted the remaining desktop station layouts further so maps, core controls, selected-contact data, queues, and alerts stay visible within one viewport.
- Preserved Engineering alpha.24 acknowledgement/repair-crew behavior unchanged.

## v0.5.0-alpha.24

- Replaced forced Engineering diagnostic pop-ups with acknowledgeable subsystem severity alerts.
- Added persistent yellow/orange/red damage states with flashing only for unacknowledged or newly escalated severity tiers.
- Diagnostics now open only from the Active Diagnostic pane.
- Added per-crew AUTO DAMAGE CONTROL mode, automatic dispatch to damaged systems, and manual override behavior.
- Added `repairCrews.autoDispatchDefault` to ship profiles.
- Added automatic repair-crew dispatch regression coverage.

## v0.5.0-alpha.23

- Moved Engineering repair mini-games into a full-screen diagnostic overlay to keep the complete puzzle visible while playing.
- Added compact Engineering diagnostic dock with reopen controls and live puzzle status.
- Preserved per-subsystem puzzle state when the overlay is closed or the engineer changes focus.
- Added desktop and short-screen layout rules for Circuit Routing, Junction Isolation, Breaker Reset, Coolant Balance, and Fuse Replacement inside the overlay.

## v0.5.0-alpha.22

- Compacted Engineering power distribution into single-line power rows so all three allocations remain visible without internal scrolling on desktop.
- Reduced repair-crew card and deployment-summary height while preserving assignment, transit, casualty, and repair-rate information.
- Rebalanced the Engineering desktop grid to devote more space to Damage Control and active diagnostics without changing gameplay.
- Compacted the Engineering condition summary so utility information remains visible in the top row.

## v0.5.0-alpha.21

- Reorganized Captain, Helm, Tactical, Engineering, Science, and Communications into full-screen desktop console layouts.
- Added compact persistent header telemetry and station-specific accent styling.
- Reduced dead space and moved long content into internally scrolling panes rather than extending the whole page.
- Preserved responsive tablet/mobile fallback and all alpha.20 gameplay behavior.

## v0.5.0-alpha.20

- Expanded Communications into a persistent transmission queue with priorities, selectable contacts, carrier tuning/noise filtering, and structured response options.
- Added hostile tactical-signal interception that generates decoded intelligence traffic.
- Added Communications electronic warfare; active jamming reduces hostile targeting accuracy and is disabled if the Communications subsystem goes offline.
- Added outbound hailing for identified ships/stations/beacons and preserved Meridian distress mission progression through the new structured traffic workflow.
- Updated AI Lt. Reyes to acquire carriers, answer distress traffic, log hostile traffic, intercept emissions, and jam during combat using the same server-authoritative commands.
- Added v0.5 alpha.20 Communications smoke tests while preserving all prior mission, Engineering, Science, and Tactical tests.

## v0.5.0-alpha.19

- Science long-range radar can now pan independently of the player ship using mouse/touch drag gestures.
- Science zoom now operates around the current free-pan map center instead of always magnifying the ship position.
- Added CENTER SHIP and CENTER SELECTED controls, while FULL resets the long-range display to the full-map ship-centered view.
- Science free-pan state is client-side presentation only and does not change authoritative sensor knowledge or contact state.

## v0.5.0-alpha.18

- Added local Science radar zoom controls with full-map, 2x, 4x, and 8x views while preserving Science as the widest-area sensor station.
- Confirmed configured planets and dynamic hostile ships are separate authoritative space objects; added a regression test ensuring Nereid IV remains fixed when wave-two Raider coordinates move.
- Repositioned Nereid IV away from the second Raider's initial spawn because the prior coordinates were only about 2.2 km apart and could visually overlap on the ship-centered sensor map.

## v0.5.0-alpha.17

- Added Captain-issued dynamic navigation targets for Science-identified contacts.
- Target-course bearings recalculate continuously as moving objects change position.
- Added identified/known state to generalized space objects so unresolved contacts cannot be used as Captain navigation targets.
- Updated Helm navigation display with live target bearing and persistent target highlighting.
- AI Helm can follow a Captain target course and modulates throttle as it approaches.
- Added natural-language target-course orders and alpha.17 navigation regression tests.

## v0.5.0-alpha.16

- Added ship-profile-defined station sensor scopes: short-range Tactical, broader Helm navigation scope, and full-map Science scope.
- Tactical radar now hides out-of-scope contacts while showing bearing-only edge beacons for known hostiles beyond the tactical envelope.
- Helm now shows current heading, Helm-requested heading, and a separate Captain fixed-heading order with a dashed map vector.
- Added Captain exact heading orders through both UI controls and natural-language commands such as `Helm, heading 090`.
- Added ship-profile-defined beam/torpedo ranges and firing arcs. The prototype uses a 180-degree forward beam arc and 360-degree torpedo launch arc; the heavy-cruiser example demonstrates 360-degree beam coverage.
- Tactical radar now visualizes beam and torpedo firing envelopes and fire-control reports range/bearing/arc availability.
- Added authoritative firing-arc validation on the server plus regression tests for station scope config, Captain heading orders, forward-only beams, and all-around torpedo launch.

## v0.5.0-alpha.15

- Added a general `spaceObjects` map projection supporting ships, stations, planets, moons, asteroids, anomalies, debris, and beacons.
- Added independent Science and Tactical map selections and clickable radar contacts.
- Added non-hostile weapons interlocks and example configured world objects for the current missions.
- Added regression coverage for multi-object selection and interlocks.

## v0.5.0-alpha.14

- Added optional server-authoritative Beam Capacitor Timing. Synchronizing inside the discharge window banks a one-shot beam damage bonus based on timing quality.
- Added optional three-stage Torpedo Guidance. Tactical marks moving intercept gates to build a target-specific one-shot torpedo damage bonus.
- Guidance packages are invalidated when Tactical changes targets; basic beam and torpedo fire remain available without either skill mechanic.
- AI Tactical now uses both timing systems opportunistically through the same validated command bus as human Tactical.
- Added smoke tests for beam timing, torpedo guidance, bonus consumption, and normal-fire fallback.

## v0.5.0-alpha.13

- Added Science Tactical Analysis after the primary contact scan.
- Science now resolves hostile shield resonance at 45% analysis and transmits a 1.4x shield-coupling solution to Tactical.
- Science now maps hostile subsystem health at 100% analysis.
- Added Tactical subsystem selection for hull, shields, weapons, engines, sensors, and communications.
- Added randomized three-axis precision-lock alignment for human Tactical officers plus delayed AI lock acquisition.
- Engineering weapon-power allocation now scales beam and torpedo damage through a visible weapon-output multiplier.
- Added hostile subsystem damage effects to movement, weapons, sensors, and shield regeneration.
- Added smoke tests for Science/Tactical analysis, Engineering weapon output, shield-frequency coupling, and precision subsystem damage.

## v0.5.0-alpha.12

- Moved repair-crew transit timing and crew-count tuning into reusable ship profiles under `src/server/config/shipProfiles.ts`.
- Added configurable subsystem compartment positions plus standby/system travel timing for different ship sizes and layouts.
- Added optional exact route overrides for unusual compartment-to-compartment travel times.
- Included a non-active heavy-cruiser example profile to demonstrate how future ships can vary crew count and transit behavior without changing Engineering logic.

## v0.5.0-alpha.11

- Added configurable server-authoritative repair crews; three crews are created by default.
- Engineering now deploys repair crews independently from diagnostic focus, and conventional repairs require crews physically on station.
- Added server-timed crew travel between assignments with visible EN ROUTE state and ETA.
- Added diminishing-return repair scaling: 1 crew = 1.0×, 2 crews = 1.75×, 3 crews = 2.5×.
- Added per-subsystem diagnostic repair boosts so simultaneous crew assignments do not share the wrong boost.
- Added a small independent casualty risk for crews physically working in a compartment when that subsystem suffers a catastrophic combat failure.
- Added AI repair-crew deployment using the same authoritative assignment command as human Engineering.
- Added Engineering UI for crew assignment, travel status, casualty state, and per-subsystem repair-rate summaries.
- Added smoke tests for crew transit, repair scaling, AI behavior, and catastrophic-failure casualties.

## v0.5.0-alpha.10

- Engineering mini-games now persist per subsystem until solved; switching repair focus away and back restores the same puzzle ID, board state, moves, and mistakes.
- New subsystem failures no longer steal focus from an active human Engineering diagnostic. Offline restoration procedures are generated and queued for the failed subsystem while the current puzzle remains active.
- A quick-repair diagnostic is automatically replaced by a critical-restoration diagnostic only if that same subsystem itself drops to 0%.
- Clearing repair focus no longer discards unfinished diagnostics.
- Added smoke tests covering per-subsystem puzzle persistence, preserved puzzle progress, and focus retention when another subsystem goes offline.

## v0.5.0-alpha.9

- Added shield-gated catastrophic subsystem failures: ordinary combat damage can reduce an online subsystem to 1% but cannot knock it offline while shields are still protecting the ship.
- Once shield charge is depleted, meaningful hull hits have a 2% base chance to knock an online subsystem fully offline; an offline shield subsystem raises that base risk to 5%.
- Heavy wave-two / high-damage hull hits modestly increase catastrophic-failure probability.
- Catastrophic target selection is weighted toward already-damaged systems, while still allowing a healthy subsystem to fail occasionally.
- A catastrophic failure automatically becomes the Engineering repair target and generates the existing Critical Restoration procedure.
- Added bridge computer and Engineering warnings for catastrophic subsystem loss.
- Retained the alpha Engineering failure drill for deterministic testing.

## v0.5.0-alpha.7

- Added an Engineering System Failure Drill panel for alpha testing. A human Engineer can force the selected subsystem to 0%, 20%, 55%, or 100% so quick-repair and critical-restoration mechanics can be tested without waiting for combat RNG.
- Forcing a subsystem to 0% immediately generates the appropriate server-authoritative critical restoration procedure and applies the real offline gameplay consequences.

## v0.5.0-alpha.6

- Split Engineering gameplay into fast combat repairs and slower critical restoration procedures.
- Systems above 75% use normal automated repair; systems at 75% or below can receive quick breaker, coolant, or fuse tasks for a repair boost.
- Systems at 0% are now hard-offline and cannot auto-repair until Engineering completes a circuit-routing or Junction Isolation restoration.
- Critical restoration returns a subsystem online at partial integrity, after which normal repair resumes.
- Added real offline effects for engines, weapons, sensors, communications, and shields.
- Added AI timing profiles for quick repairs versus full restoration procedures and expanded Engineering smoke tests.

## v0.5.0-alpha.5

- Replaced the simple wire-matching diagnostic with **Junction Isolation**.
- Junction Isolation generates six randomized junctions with lead profiles, warning lamps, and bypass tags.
- Each puzzle also generates live diagnostic context: protocol revision, checksum parity, auxiliary-bus state, and reserve power.
- Engineers use a protocol matrix to translate each junction's attributes into an action code, then resolve conditional codes against the live diagnostic context.
- Players can open/close any junction and submit the full isolation pattern for server-authoritative verification; failed verification records a fault without revealing the incorrect junction.
- Junction layouts and context are randomized per diagnostic while remaining deterministically testable.
- AI Engineering now takes longer to resolve this higher-complexity diagnostic, preserving solo play without making the human puzzle cosmetic.
- Added smoke coverage that derives the correct isolation set from public puzzle rules and verifies successful server validation.

## v0.5.0-alpha.4

- Rebuilt the Engineering circuit-routing diagnostic as a randomized 4×4 board instead of a fixed 3×3 route.
- Entry and repair-bus ports now vary by puzzle, while the server generates a longer solvable path and fills unused cells with decoy traces.
- Circuit boards use seeded server-side generation so repeat diagnostics differ while remaining deterministic and testable.
- Added smoke coverage that derives and solves randomized circuit routes and verifies subsequent circuit boards are different.

## v0.5.0-alpha.3

- Added server-authoritative Engineering diagnostic bypass puzzles for damaged subsystems.
- Added three puzzle types: circuit routing, wire matching, and fuse replacement.
- Human puzzle completion grants an immediate repair pulse and a temporary 3x repair-speed bonus.
- AI Engineering completes the same bypass after a simulated troubleshooting delay so solo missions remain viable.
- Expanded Engineering station UI with interactive puzzle board, move/fault counters, and repair-boost timer.

## v0.5.0-alpha.2

- Fixed friendly/civilian contacts not appearing on tactical radar. CSV Meridian now renders as a distinct civilian contact on Captain, Helm, Science, Tactical inset, and main viewscreen radar displays.
- Fixed the main viewscreen rescue-mission contact presentation so civilian contact data is shown instead of hostile ship/sensor information.

## v0.5.0-alpha.1

- Added Communications as the sixth playable station with AI officer Lt. Reyes and seamless human/AI handoff.
- Added Captain mission selection and the non-combat `Meridian Distress` rescue scenario.
- Added friendly-contact state, civilian distress traffic, hailing, and response commands.
- Added subsystem health and Engineering damage-control repair priorities.
- Damaged engines, shields, weapons, sensors, and communications now reduce associated system effectiveness.
- Added deterministic v0.5 smoke tests for rescue-mission completion, Communications handoff, and damage repair.
- Preserved the validated v0.4 command bus, natural-language Captain orders, host lobby, built host, and graphics baseline.

## v0.4.0

- Added natural-language Captain text orders with a deterministic server-side interpreter that converts common bridge phrases into existing validated standing orders.
- Added structured Bridge Communications with Captain messages, AI acknowledgements, Science reports, Tactical calls, Engineering warnings, and all-stations status reports.
- Added `/host`, a read-only Host Lobby showing LAN join links, station occupancy, mission status, viewscreen link, and server health link.
- Added production-host groundwork: built React assets can be served by the same Colyseus/Express process on port 2567.
- Added `BUILD_BRIDGE.bat` and `START_BUILT_BRIDGE.bat` for single-process built-host testing.
- Added natural-language command and communications coverage to the automated smoke tests.
- Preserved the v0.3.2 main viewscreen graphics as the visual baseline; no additional graphics expansion is part of v0.4.

## v0.3.2

- Added a second main-viewscreen graphics pass with camera shake, player damage flash, shield-hit ripple, engine streaks, scanline/vignette overlays, a deeper starfield, and stronger victory/defeat presentation.
- Added enemy shockwave effects on destruction, richer throttle/intercept motion treatment, and danger-state styling for the player ship HUD panel.
- Updated in-app version labels and project version to 0.3.2.

## v0.3.1

- Added a first-pass cinematic main viewscreen with animated starfield layers, target brackets, ship/enemy silhouettes, scan sweep effects, torpedo/beam visuals, hit effects, and alert banners.
- Added a sensor sidecar and tactical inset to the viewscreen so the TV/projector display presents both cinematic and tactical information at the same time.
- Updated in-app version labels and package version to 0.3.1.

## v0.3.0

- Added Science/Sensors as the fifth bridge station with AI officer Lt. Sato.
- Added active scanning, progressive contact identification, and hidden tactical data until Science resolves the contact.
- Added Captain-to-crew orders for AI Helm, Tactical, Engineering, and Science.
- Human-controlled stations retain and display Captain orders instead of being overridden by AI.
- Added a dedicated read-only `/viewscreen` route for a TV or projector.
- Expanded the starter scenario into a two-contact mission with investigate, intercept, combat, reinforcement, victory, and defeat stages.
- Added mission reset/restart while preserving connected human station assignments.
- Added tests for solo AI mission completion, human/AI handoff, Captain orders, and mission reset.
- Fixed Windows launcher scripts to use `call npm ...`, preventing the command window from disappearing before error handling can run.

## v0.2.0

- Added deterministic AI Helm, Tactical, and Engineering officers.
- Added seamless human takeover and return-to-AI handoff.
- Added a shared validated command bus for human and AI station actions.
- Added live AI officer status text and solo mission smoke tests.
