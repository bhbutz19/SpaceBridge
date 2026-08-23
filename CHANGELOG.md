# Changelog

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
