import { BridgeGame } from '../src/server/game.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const game = new BridgeGame();
assert(game.claimRole('captain', 'test-captain', 'Test Captain'), 'Captain claim failed');
assert(game.executeCommand({ kind: 'human', sessionId: 'test-captain' }, { type: 'startMission' }), 'Mission start failed');

let elapsed = 0;
while (elapsed < 120 && game.state.missionStatus === 'running') {
  game.tick(0.05);
  elapsed += 0.05;
}

assert(game.state.missionStatus === 'victory', 'AI crew did not complete the starter mission');
console.log(`AI mission smoke test passed in ${elapsed.toFixed(2)} simulated seconds.`);

const handoff = new BridgeGame();
assert(handoff.claimRole('captain', 'captain', 'Captain'), 'Handoff captain claim failed');
assert(handoff.executeCommand({ kind: 'human', sessionId: 'captain' }, { type: 'startMission' }), 'Handoff mission start failed');
for (let i = 0; i < 30; i++) handoff.tick(0.05);
assert(handoff.claimRole('helm', 'pilot', 'Pilot'), 'Human helm claim failed');
assert(handoff.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 99 }) === false, 'AI Helm retained authority after takeover');
assert(handoff.executeCommand({ kind: 'human', sessionId: 'pilot' }, { type: 'setHeading', heading: 270 }), 'Human Helm command rejected');
assert(handoff.executeCommand({ kind: 'human', sessionId: 'pilot' }, { type: 'setThrottle', throttle: 12 }), 'Human throttle command rejected');
for (let i = 0; i < 30; i++) handoff.tick(0.05);
assert(handoff.state.ship.requestedHeading === 270 && handoff.state.ship.throttle === 12, 'AI interfered with human Helm');
handoff.releaseRole('pilot');
for (let i = 0; i < 10; i++) handoff.tick(0.05);
assert(handoff.state.roles.find((r) => r.role === 'helm')?.controller === 'ai', 'Helm did not return to AI');
assert(handoff.state.ship.throttle !== 12, 'AI Helm did not resume after release');
console.log('Human/AI Helm handoff smoke test passed.');
