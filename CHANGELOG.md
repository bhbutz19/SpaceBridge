# Changelog

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
