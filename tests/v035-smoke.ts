import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function prepareCrew() {
  const game = new BridgeGame(() => .5);
  const sessions = {
    captain: 'alpha35-captain',
    helm: 'alpha35-helm',
    engineering: 'alpha35-engineering',
    tactical: 'alpha35-tactical',
    science: 'alpha35-science',
    communications: 'alpha35-communications'
  } as const;
  for (const [role, sessionId] of Object.entries(sessions)) {
    assert(game.claimRole(role as keyof typeof sessions, sessionId, `Alpha 35 ${role}`), `Could not claim ${role}`);
  }
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.captain }, { type: 'startMission' }), 'Captain could not start alpha.35 test mission');
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  game.state.ship.x = 0;
  game.state.ship.y = 10;
  game.state.ship.heading = 180;
  game.state.ship.requestedHeading = 180;
  game.state.ship.speed = 0;
  game.state.ship.throttle = 0;
  game.state.ship.weaponPower = 50;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 0;
  enemy.heading = 0;
  enemy.speed = 0;
  enemy.shields = 0;
  enemy.ai.decisionCooldown = 10;
  game.tick(.01);
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'selectTacticalContact', contactId: enemy.id }), 'Tactical could not select hostile');
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'selectCommunicationsContact', contactId: enemy.id }), 'Communications could not select hostile');
  return { game, sessions, enemy };
}

function runCommunicationsLockOwnershipTest() {
  const { game, sessions, enemy } = prepareCrew();
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'selectEnemyTarget', target: 'weapons' }), 'Tactical could not designate the desired subsystem');
  assert(!game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'startTargetLock' }), 'Tactical still owned the precision-lock puzzle');
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'startTargetLock' }), 'Communications could not open the targeting data link');

  const hullBeforeGeneralFire = enemy.hull;
  game.state.ship.beamCharge = 100;
  game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'fireBeam' });
  assert(game.state.ship.beamCharge === 75, 'Tactical could not fire while Communications was aligning the subsystem link');
  assert(enemy.hull < hullBeforeGeneralFire, 'Unlocked fire did not remain available as general hull fire during Communications alignment');

  enemy.hull = 100;
  const axes = game.state.tactical.lock.axes.map((axis) => ({ ...axis }));
  for (const axis of axes) {
    assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'setTargetLockAxis', axis: axis.axis, value: axis.target }), `Communications could not align ${axis.axis}`);
  }
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'verifyTargetLock' }), 'Communications could not transmit the precision solution');
  assert(game.state.tactical.lock.status === 'locked', 'Communications solution was not linked to Tactical');
  console.log('Communications-owned targeting link and concurrent Tactical fire smoke test passed.');
}

function runLowCollateralSubsystemDisableTest() {
  const { game, sessions, enemy } = prepareCrew();
  game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'selectEnemyTarget', target: 'weapons' });
  game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'startTargetLock' });
  for (const axis of game.state.tactical.lock.axes.map((entry) => ({ ...entry }))) {
    game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'setTargetLockAxis', axis: axis.axis, value: axis.target });
  }
  game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'verifyTargetLock' });

  const startingHull = enemy.hull;
  let shots = 0;
  while (enemy.systems.weapons > 0 && shots < 12) {
    game.state.ship.beamCharge = 100;
    game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'fireBeam' });
    shots += 1;
  }
  const hullLoss = startingHull - enemy.hull;
  assert(enemy.systems.weapons === 0, 'Precision fire did not take the selected weapons subsystem offline');
  assert(hullLoss >= 10 && hullLoss <= 16, `Disabling one subsystem caused ${hullLoss.toFixed(1)} hull damage instead of approximately 10–15%`);
  assert(enemy.hull >= 84, 'Precision subsystem fire left too little hull integrity for a disable-and-surrender strategy');
  console.log(`Low-collateral subsystem disable smoke test passed in ${shots} shots with ${hullLoss.toFixed(1)} hull damage.`);
}

function runRepairMobilizationDelayTest() {
  const { game, sessions, enemy } = prepareCrew();
  game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'selectEnemyTarget', target: 'weapons' });
  game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'startTargetLock' });
  for (const axis of game.state.tactical.lock.axes.map((entry) => ({ ...entry }))) {
    game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'setTargetLockAxis', axis: axis.axis, value: axis.target });
  }
  game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'verifyTargetLock' });
  while (enemy.systems.weapons > 0) {
    game.state.ship.beamCharge = 100;
    game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'fireBeam' });
  }

  let snapshot = game.safeSnapshot();
  const initialDelay = snapshot.enemy.repairDelays.weapons;
  assert(initialDelay !== null && initialDelay >= 30 && initialDelay <= 45, `Enemy repair delay was outside the 30–45 second window (${initialDelay})`);
  for (let elapsed = 0; elapsed < 30; elapsed += .1) game.tick(.1);
  assert(enemy.systems.weapons === 0, 'Enemy began subsystem repairs before the minimum 30-second buffer');
  snapshot = game.safeSnapshot();
  assert((snapshot.enemy.repairDelays.weapons ?? 0) > 0, 'Science did not retain the repair-mobilization countdown during the buffer');

  for (let elapsed = 0; elapsed < 16 && enemy.systems.weapons <= 0; elapsed += .1) game.tick(.1);
  assert(enemy.systems.weapons > 0, 'Enemy damage control did not begin limited restoration after the 30–45 second buffer');
  assert(game.safeSnapshot().enemy.repairingSystem === 'weapons', 'Science did not identify the active hostile repair location');
  console.log('Enemy subsystem repair-mobilization buffer and Science countdown smoke test passed.');
}

runCommunicationsLockOwnershipTest();
runLowCollateralSubsystemDisableTest();
runRepairMobilizationDelayTest();
