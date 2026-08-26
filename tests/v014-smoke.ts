import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupHumanTactical() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-tactical-skills';
  const tactical = 'tactical-skills';
  game.claimRole('captain', captain, 'Captain Skills');
  game.claimRole('tactical', tactical, 'Tactical Skills');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  game.state.ship.weaponPower = 50;
  game.state.ship.beamCharge = 100;
  game.state.ship.x = 28;
  game.state.ship.y = 0;
  return { game, tactical };
}

function beamDamage(useTiming: boolean) {
  const { game, tactical } = setupHumanTactical();
  const enemy = (game as any).enemyActual;
  enemy.shields = 100;
  if (useTiming) {
    game.state.tactical.beamTiming.phase = game.state.tactical.beamTiming.sweetSpot;
    assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'syncBeamCapacitor' }), 'Could not synchronize beam capacitor in the optimal window');
    assert(game.state.tactical.beamTiming.status === 'synced' && game.state.tactical.beamTiming.quality === 100, 'Perfect beam timing did not produce a ready sync');
  }
  const before = enemy.shields as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  const after = enemy.shields as number;
  if (useTiming) assert(game.state.tactical.beamTiming.status === 'idle', 'Beam timing bonus was not consumed by the shot');
  return before - after;
}

function runBeamCapacitorTimingTest() {
  const normal = beamDamage(false);
  const timed = beamDamage(true);
  assert(timed > normal * 1.3, `Perfect capacitor timing did not materially improve beam damage: ${normal} vs ${timed}`);
  console.log(`Tactical beam-capacitor timing smoke test passed: ${normal.toFixed(1)} -> ${timed.toFixed(1)} shield damage.`);
}

function torpedoDamage(useGuidance: boolean) {
  const { game, tactical } = setupHumanTactical();
  const enemy = (game as any).enemyActual;
  enemy.shields = 100;
  game.state.ship.torpedoes = 10;
  if (useGuidance) {
    assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'startTorpedoGuidance' }), 'Could not open torpedo guidance package');
    while (game.state.tactical.torpedoGuidance.status === 'guiding') {
      const guidance = game.state.tactical.torpedoGuidance;
      const gate = guidance.gates[guidance.stage];
      assert(gate !== undefined, 'Guidance gate missing');
      guidance.phase = gate;
      assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'markTorpedoGuidance' }), 'Could not mark guidance gate');
    }
    assert(game.state.tactical.torpedoGuidance.status === 'ready' && game.state.tactical.torpedoGuidance.quality === 100, 'Perfect torpedo guidance did not become ready');
  }
  const before = enemy.shields as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireTorpedo' });
  const after = enemy.shields as number;
  if (useGuidance) assert(game.state.tactical.torpedoGuidance.status === 'idle', 'Torpedo guidance package was not consumed by launch');
  return before - after;
}

function runTorpedoGuidanceTest() {
  const normal = torpedoDamage(false);
  const guided = torpedoDamage(true);
  assert(guided > normal * 1.35, `Perfect torpedo guidance did not materially improve damage: ${normal} vs ${guided}`);
  console.log(`Tactical torpedo-guidance smoke test passed: ${normal.toFixed(1)} -> ${guided.toFixed(1)} shield damage.`);
}

function runOptionalMechanicsTest() {
  const { game, tactical } = setupHumanTactical();
  const enemy = (game as any).enemyActual;
  const before = enemy.shields as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  assert((enemy.shields as number) < before, 'Basic beam fire stopped working without capacitor timing');
  assert(game.state.tactical.torpedoGuidance.status === 'idle', 'Basic weapons unexpectedly required a guidance package');
  console.log('Tactical optional-skill fallback smoke test passed.');
}

runBeamCapacitorTimingTest();
runTorpedoGuidanceTest();
runOptionalMechanicsTest();
