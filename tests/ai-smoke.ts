import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

function runSoloMissionTest() {
  const game = new BridgeGame();
  const captainSession = 'captain-test';
  assert(game.claimRole('captain', captainSession, 'Captain Test'), 'Captain role claim failed');
  assert(game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' }), 'Captain could not start mission');

  let elapsed = 0;
  while (game.state.missionStatus === 'running' && elapsed < 120) {
    game.tick(0.05);
    elapsed += 0.05;
  }

  assert(game.state.missionStatus === 'victory', `AI crew failed solo mission; final status ${game.state.missionStatus}`);
  assert(game.state.encounter === 2, 'Mission did not reach the second encounter');
  assert(game.state.ship.hull > 0, 'Player ship was destroyed');
  console.log(`AI mission smoke test passed in ${elapsed.toFixed(1)} simulated seconds. Hull ${game.state.ship.hull.toFixed(0)}%, shields ${game.state.ship.shields.toFixed(0)}%.`);
}

function runHumanAiHandoffTest() {
  const game = new BridgeGame();
  const captainSession = 'captain-handoff';
  const helmSession = 'helm-human';
  game.claimRole('captain', captainSession, 'Captain Handoff');
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' });
  game.tick(0.5);

  assert(game.claimRole('helm', helmSession, 'Human Helm'), 'Human could not take Helm');
  game.executeCommand({ kind: 'human', sessionId: helmSession }, { type: 'setHeading', heading: 222 });
  game.executeCommand({ kind: 'human', sessionId: helmSession }, { type: 'setThrottle', throttle: 17 });
  game.tick(1.0);
  assert(Math.abs(game.state.ship.requestedHeading - 222) < 0.01, 'AI Helm overwrote human heading after takeover');
  assert(Math.abs(game.state.ship.throttle - 17) < 0.01, 'AI Helm overwrote human throttle after takeover');

  game.releaseRole(helmSession);
  game.tick(1.0);
  assert(Math.abs(game.state.ship.requestedHeading - 222) > 0.01 || Math.abs(game.state.ship.throttle - 17) > 0.01, 'AI Helm did not resume after station release');
  console.log('Human/AI Helm handoff smoke test passed.');
}

function runCaptainOrderTest() {
  const game = new BridgeGame();
  const captainSession = 'captain-orders';
  game.claimRole('captain', captainSession, 'Captain Orders');
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' });
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'issueOrder', role: 'helm', order: 'hold' });
  game.tick(1.0);
  assert(game.state.ship.throttle === 0, 'Helm did not obey HOLD order');

  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'issueOrder', role: 'helm', order: 'intercept' });
  game.tick(1.0);
  assert(game.state.ship.throttle > 0, 'Helm did not obey INTERCEPT order');

  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'issueOrder', role: 'science', order: 'passive' });
  const before = game.state.sensors.scanProgress;
  game.tick(1.0);
  assert(Math.abs(game.state.sensors.scanProgress - before) < 0.01, 'Science scanned while under PASSIVE order');

  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'issueOrder', role: 'science', order: 'scan' });
  game.tick(1.0);
  assert(game.state.sensors.scanProgress > before, 'Science did not obey SCAN order');
  console.log('Captain-to-AI order smoke test passed.');
}

function runResetTest() {
  const game = new BridgeGame();
  const captainSession = 'captain-reset';
  game.claimRole('captain', captainSession, 'Captain Reset');
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' });
  game.tick(2.0);
  assert(game.state.missionStatus === 'running', 'Mission did not start before reset');
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'resetMission' });
  assert(game.state.missionStatus === 'briefing', 'Reset did not return mission to briefing');
  assert(game.roleFor(captainSession) === 'captain', 'Reset dropped the human Captain assignment');
  assert(game.state.encounter === 1, 'Reset did not restore encounter one');
  console.log('Mission reset smoke test passed.');
}

runSoloMissionTest();
runHumanAiHandoffTest();
runCaptainOrderTest();
runResetTest();

function runNaturalLanguageCaptainTest() {
  const game = new BridgeGame();
  const captainSession = 'captain-natural-language';
  game.claimRole('captain', captainSession, 'Captain Natural');
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' });

  assert(game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Helm, hold position.' }), 'Natural-language Helm order was rejected');
  game.tick(0.5);
  assert(game.state.roles.find((r) => r.role === 'helm')?.captainOrder === 'hold', 'Natural-language Helm HOLD was not parsed');
  assert(game.state.ship.throttle === 0, 'Natural-language Helm HOLD did not affect AI behavior');

  assert(game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Tactical, weapons free; Engineering, prioritize shields.' }), 'Combined natural-language order was rejected');
  assert(game.state.roles.find((r) => r.role === 'tactical')?.captainOrder === 'weaponsFree', 'Natural-language Tactical order was not parsed');
  assert(game.state.roles.find((r) => r.role === 'engineering')?.captainOrder === 'shields', 'Natural-language Engineering order was not parsed');

  const commsBefore = game.state.commsLog.length;
  game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Status report, all stations.' });
  assert(game.state.commsLog.length >= commsBefore + 4, 'Status report did not produce bridge communications');
  assert(game.state.commsLog.some((entry) => entry.speaker === 'Lt. Vega'), 'Helm did not answer status report');
  assert(game.state.commsLog.some((entry) => entry.speaker === 'Lt. Sato'), 'Science did not answer status report');
  console.log('Natural-language Captain order and bridge communications smoke test passed.');
}

runNaturalLanguageCaptainTest();
