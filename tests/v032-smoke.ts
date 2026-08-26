import { BridgeGame } from '../src/server/game.js';
import { SHIP_PROFILES } from '../src/server/config/shipProfiles.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupCombat() {
  const game = new BridgeGame(() => 0.37);
  const captain = 'captain-alpha32';
  const tactical = 'tactical-alpha32';
  game.claimRole('captain', captain, 'Captain Alpha 32');
  game.claimRole('tactical', tactical, 'Tactical Alpha 32');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.systems.weapons = 100;
  game.state.ship.beamCharge = 100;
  game.state.ship.x = 0;
  game.state.ship.y = 0;
  game.state.ship.heading = 0;
  game.state.ship.requestedHeading = 0;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 10;
  enemy.heading = 180;
  enemy.speed = 0;
  return { game, tactical, enemy };
}

function runMassScaledFlightTest() {
  const prototype = SHIP_PROFILES.prototype.flight;
  const cruiser = SHIP_PROFILES.heavyCruiserExample.flight;
  assert(prototype.maxForwardSpeed < 5.5 && prototype.accelerationResponse < 1.8, 'Prototype linear handling was not slowed from alpha.31');
  assert(prototype.baseTurnRateDegreesPerSecond < 18 && prototype.lateralAccelerationResponse < 2.8, 'Prototype rotational/lateral handling was not slowed from alpha.31');
  assert(cruiser.maxForwardSpeed < prototype.maxForwardSpeed, 'Larger cruiser did not receive a lower forward-speed ceiling');
  assert(cruiser.accelerationResponse < prototype.accelerationResponse, 'Larger cruiser did not receive additional linear inertia');
  assert(cruiser.baseTurnRateDegreesPerSecond < prototype.baseTurnRateDegreesPerSecond, 'Larger cruiser did not receive lower turn response');
  assert(cruiser.lateralAccelerationResponse < prototype.lateralAccelerationResponse, 'Larger cruiser did not receive lower lateral-thruster response');
  console.log('Size-scaled ship speed and maneuver-response smoke test passed.');
}

function runTrackedImpactTest() {
  const { game, tactical, enemy } = setupCombat();
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  const hit = game.state.combatEffects.at(-1);
  assert(hit?.kind === 'beam' && hit.result === 'hit', 'In-range beam did not author a hit effect');
  assert(hit.trackedTarget === 'enemy' && hit.impactOffsetX === 0 && hit.impactOffsetY === 0, 'Beam hit does not terminate on the live enemy position');

  enemy.y = 30;
  game.state.ship.beamCharge = 100;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  const dissipated = game.state.combatEffects.at(-1);
  assert(dissipated?.result === 'dissipated' && dissipated.trackedTarget === null, 'Out-of-range beam did not author a fixed dissipation endpoint');
  assert(Math.abs(Math.hypot(dissipated.targetX - dissipated.sourceX, dissipated.targetY - dissipated.sourceY) - SHIP_PROFILES.prototype.weapons.beamRange) < .001, 'Dissipated beam did not stop at its effective-range boundary');

  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireTorpedo', tubeId:'tube-1' });
  const miss = game.state.combatEffects.at(-1);
  assert(miss?.kind === 'torpedo' && miss.result === 'miss', 'Out-of-range torpedo did not author a miss effect');
  assert(miss.trackedTarget === 'enemy' && Math.hypot(miss.impactOffsetX, miss.impactOffsetY) > 1, 'Torpedo miss does not pass visibly beside the live target');
  console.log('Tracked hit, displaced miss, and beam-dissipation endpoint smoke test passed.');
}

runMassScaledFlightTest();
runTrackedImpactTest();
