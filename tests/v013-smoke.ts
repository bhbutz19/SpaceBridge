import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupHumanCombat() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-team-combat';
  const science = 'science-team-combat';
  const tactical = 'tactical-team-combat';
  const communications = 'communications-team-combat';
  game.claimRole('captain', captain, 'Captain Team');
  game.claimRole('science', science, 'Science Team');
  game.claimRole('tactical', tactical, 'Tactical Team');
  game.claimRole('communications', communications, 'Communications Team');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.state.missionStage = 'combat';
  return { game, captain, science, tactical, communications };
}

function runScienceTacticalAnalysisTest() {
  const { game, science } = setupHumanCombat();
  assert(game.executeCommand({ kind:'human', sessionId:science }, { type:'scanTarget' }), 'Science could not start primary scan');
  let elapsed = 0;
  while (game.state.sensors.intelLevel < 2 && elapsed < 30) { game.tick(.1); elapsed += .1; }
  assert(game.state.sensors.intelLevel === 2, 'Primary science scan did not complete');
  assert(game.executeCommand({ kind:'human', sessionId:science }, { type:'beginTacticalAnalysis' }), 'Science could not start tactical analysis');
  const markNextPeak = () => {
    const sensors = game.state.sensors;
    const gate = sensors.tacticalAnalysisGates[sensors.tacticalAnalysisStage];
    if (gate === undefined) return;
    const raw = Math.abs(sensors.tacticalAnalysisPhase - gate) % 100;
    if (Math.min(raw, 100 - raw) <= 10) game.executeCommand({ kind:'human', sessionId:science }, { type:'markTacticalAnalysis' });
  };
  while (!game.state.sensors.shieldSolution && elapsed < 50) { game.tick(.1); markNextPeak(); elapsed += .1; }
  assert(game.state.sensors.shieldSolution && !!game.state.sensors.shieldFrequency, 'Shield resonance solution did not resolve');
  while (!game.state.sensors.systemsMapped && elapsed < 65) { game.tick(.1); markNextPeak(); elapsed += .1; }
  assert(game.state.sensors.systemsMapped, 'Enemy subsystem map did not complete');
  assert(game.safeSnapshot().enemy.systems.weapons !== null, 'Mapped enemy subsystem health was not exposed in safe snapshot');
  console.log('Science shield-frequency and subsystem-mapping smoke test passed.');
}

function beamShieldDamage(power: number, shieldSolution: boolean) {
  const { game, tactical } = setupHumanCombat();
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  game.state.sensors.shieldSolution = shieldSolution;
  game.state.sensors.shieldFrequency = shieldSolution ? 'TEST' : null;
  game.state.ship.weaponPower = power;
  game.state.ship.beamCharge = 100;
  game.state.ship.x = 28;
  game.state.ship.y = 0;
  const before = (game as any).enemyActual.shields as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  const after = (game as any).enemyActual.shields as number;
  return { damage: before - after, output: game.state.tactical.weaponOutputMultiplier };
}

function runEngineeringWeaponPowerTest() {
  const low = beamShieldDamage(25, false);
  const high = beamShieldDamage(100, false);
  assert(high.damage > low.damage * 1.7, `Engineering weapons power did not materially change damage: ${low.damage} vs ${high.damage}`);
  console.log(`Engineering-to-Tactical weapon-output smoke test passed: low ${low.damage.toFixed(1)}, high ${high.damage.toFixed(1)} shield damage.`);
}

function runShieldFrequencyBonusTest() {
  const normal = beamShieldDamage(50, false);
  const solved = beamShieldDamage(50, true);
  assert(solved.damage > normal.damage * 1.3, `Science shield solution did not improve shield damage enough: ${normal.damage} vs ${solved.damage}`);
  console.log('Science shield-frequency weapon-coupling smoke test passed.');
}

function runPrecisionSubsystemTargetingTest() {
  const { game, tactical, communications } = setupHumanCombat();
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  game.state.ship.weaponPower = 75;
  game.state.ship.beamCharge = 100;
  game.state.ship.x = 28;
  game.state.ship.y = 0;
  (game as any).enemyActual.shields = 0;
  game.safeSnapshot();

  assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'selectEnemyTarget', target:'weapons' }), 'Tactical could not select enemy weapons');
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'selectCommunicationsContact', contactId:(game as any).enemyActual.id }), 'Communications could not select the hostile contact');
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'startTargetLock' }), 'Communications could not begin precision lock');
  const axes = game.state.tactical.lock.axes.map((axis) => ({ ...axis }));
  for (const axis of axes) assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'setTargetLockAxis', axis:axis.axis, value:axis.target }), `Could not align ${axis.axis}`);
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'verifyTargetLock' }), 'Precision lock verification failed');
  assert(game.state.tactical.lock.status === 'locked' && game.state.tactical.lock.quality >= 70, 'Precision lock did not become active');
  const before = (game as any).enemyActual.systems.weapons as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  const after = (game as any).enemyActual.systems.weapons as number;
  assert(after < before, 'Precision beam strike did not damage selected enemy subsystem');
  console.log(`Communications-linked precision-subsystem targeting smoke test passed: enemy weapons ${before.toFixed(0)}% -> ${after.toFixed(0)}%.`);
}

runScienceTacticalAnalysisTest();
runEngineeringWeaponPowerTest();
runShieldFrequencyBonusTest();
runPrecisionSubsystemTargetingTest();
