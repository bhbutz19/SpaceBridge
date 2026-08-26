import { BridgeGame } from '../src/server/game.js';
import { SHIP_PROFILES } from '../src/server/config/shipProfiles.js';
import type { TorpedoTypeId } from '../src/shared/protocol.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupCombat() {
  const game = new BridgeGame(() => 0.37);
  const captain = 'captain-alpha31';
  const tactical = 'tactical-alpha31';
  const science = 'science-alpha31';
  game.claimRole('captain', captain, 'Captain Alpha 31');
  game.claimRole('tactical', tactical, 'Tactical Alpha 31');
  game.claimRole('science', science, 'Science Alpha 31');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  const enemy = (game as any).enemyActual;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0;
  game.state.ship.x = 0; game.state.ship.y = -10; game.state.ship.heading = 0; game.state.ship.requestedHeading = 0;
  game.state.ship.beamCharge = 100;
  game.state.systems.weapons = 100;
  return { game, tactical, science, enemy };
}

function runScienceCapacitorGateTest() {
  const { game, tactical, science } = setupCombat();
  game.state.tactical.beamTiming.phase = game.state.tactical.beamTiming.sweetSpot;
  assert(!game.executeCommand({kind:'human',sessionId:tactical},{type:'syncBeamCapacitor'}), 'Beam capacitor unlocked before Science completed the hostile profile');
  assert(game.executeCommand({kind:'human',sessionId:science},{type:'beginTacticalAnalysis'}), 'Science could not begin the spectral mini-game');
  while (!game.state.sensors.systemsMapped) {
    const sensors = game.state.sensors;
    const gate = sensors.tacticalAnalysisGates[sensors.tacticalAnalysisStage];
    assert(gate !== undefined, 'Science spectral gate was missing');
    sensors.tacticalAnalysisPhase = gate;
    assert(game.executeCommand({kind:'human',sessionId:science},{type:'markTacticalAnalysis'}), 'Science could not lock a spectral peak');
  }
  game.state.tactical.beamTiming.phase = game.state.tactical.beamTiming.sweetSpot;
  assert(game.executeCommand({kind:'human',sessionId:tactical},{type:'syncBeamCapacitor'}), 'Beam capacitor did not unlock after Science completed the mini-game');
  console.log('Science-gated beam capacitor and spectral mini-game smoke test passed.');
}

function runWeaponVisualAndTubeReloadTest() {
  const { game, tactical } = setupCombat();
  game.state.sensors.systemsMapped = true;
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireBeam'});
  const beamEffect = game.state.combatEffects.at(-1);
  assert(beamEffect?.kind === 'beam' && beamEffect.result === 'hit', 'Beam fire did not create an authoritative hit visual');

  const torpedoesBefore = game.state.ship.torpedoes;
  const photonBefore = game.state.ship.torpedoInventory.photon;
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireTorpedo',tubeId:'tube-1'});
  const tubeOne = game.state.ship.torpedoTubes.find((tube) => tube.id === 'tube-1');
  const torpedoEffect = game.state.combatEffects.at(-1);
  assert(tubeOne && tubeOne.reloadRemaining === tubeOne.reloadSeconds, 'Fired torpedo tube did not enter its reload cycle');
  assert(game.state.ship.torpedoes === torpedoesBefore - 1 && game.state.ship.torpedoInventory.photon === photonBefore - 1, 'Torpedo inventory did not decrement by type');
  assert(torpedoEffect?.kind === 'torpedo' && torpedoEffect.torpedoType === 'photon', 'Torpedo launch did not create the correct typed projectile visual');

  const afterFirstLaunch = game.state.ship.torpedoes;
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireTorpedo',tubeId:'tube-1'});
  assert(game.state.ship.torpedoes === afterFirstLaunch, 'Reloading tube accepted another launch');
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireTorpedo',tubeId:'tube-2'});
  assert(game.state.ship.torpedoes === afterFirstLaunch - 1, 'Independent second tube did not remain available');
  assert(game.state.ship.torpedoTubes.length === 2 && SHIP_PROFILES.heavyCruiserExample.weapons.torpedoTubes.length === 4, 'Torpedo tube count is not driven by ship layout');
  console.log('Weapon visuals, profile-driven torpedo tubes, and independent reload smoke test passed.');
}

function torpedoDamage(type: TorpedoTypeId, shields: number) {
  const { game, tactical, enemy } = setupCombat();
  game.state.sensors.systemsMapped = true;
  enemy.shields = shields;
  enemy.hull = 100;
  assert(game.executeCommand({kind:'human',sessionId:tactical},{type:'selectTorpedoType',torpedoType:type}), `Could not select ${type} torpedo`);
  const shieldsBefore = enemy.shields as number;
  const hullBefore = enemy.hull as number;
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireTorpedo',tubeId:'tube-1'});
  return { shieldDamage: shieldsBefore - enemy.shields, hullDamage: hullBefore - enemy.hull };
}

function runTorpedoDamageProfileTest() {
  const ionShield = torpedoDamage('ion', 100);
  const quantumShield = torpedoDamage('quantum', 100);
  assert(ionShield.shieldDamage > quantumShield.shieldDamage * 1.25, 'Ion torpedo did not outperform quantum against shields');
  const ionHull = torpedoDamage('ion', 0);
  const quantumHull = torpedoDamage('quantum', 0);
  assert(quantumHull.hullDamage > ionHull.hullDamage * 2, 'Quantum torpedo did not outperform ion against exposed hull');
  console.log('Typed torpedo shield/hull damage-profile smoke test passed.');
}

runScienceCapacitorGateTest();
runWeaponVisualAndTubeReloadTest();
runTorpedoDamageProfileTest();
