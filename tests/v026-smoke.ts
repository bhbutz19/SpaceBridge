import { BridgeGame } from '../src/server/game.js';
import { ACTIVE_SHIP_PROFILE } from '../src/server/config/shipProfiles.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runHelmFlightProfileAndReverseTest() {
  const game = new BridgeGame(() => 0.1);
  const captain = 'captain-alpha26-flight';
  const helm = 'helm-alpha26-flight';
  game.claimRole('captain', captain, 'Captain Flight');
  game.claimRole('helm', helm, 'Helm Flight');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  assert(game.state.shipCapabilities.flight.maxForwardSpeed === ACTIVE_SHIP_PROFILE.flight.maxForwardSpeed, 'Flight profile not exposed through ship capabilities');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setThrottle',throttle:-100}), 'Helm could not command reverse thrust');
  game.tick(1);
  assert(game.state.ship.throttle === -100, 'Reverse throttle was not retained');
  assert(game.state.ship.speed < 0, 'Reverse throttle did not produce negative ship velocity');
  console.log('Helm ship-profile flight model and reverse-thrust smoke test passed.');
}

function runHelmDirectorAndAssistTest() {
  const game = new BridgeGame(() => 0.2);
  const captain = 'captain-alpha26-director';
  const helm = 'helm-alpha26-director';
  game.claimRole('captain', captain, 'Captain Director');
  game.claimRole('helm', helm, 'Helm Director');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'selectHelmContact',contactId:'raider-1'}), 'Helm could not select hostile as relative-navigation contact');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setHelmManeuver',maneuver:'orbitStarboard'}), 'Helm could not select orbit maneuver');
  game.safeSnapshot();
  assert(game.state.helm.recommendedHeading !== null && game.state.helm.recommendedThrottle !== null, 'Orbit maneuver did not produce a flight-director solution');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setHelmAssist',enabled:true}), 'Helm could not engage flight assist');
  game.tick(.25);
  assert(game.state.helm.assistEnabled, 'Flight assist did not remain engaged');
  assert(Math.abs(game.state.ship.requestedHeading - (game.state.helm.recommendedHeading ?? -999)) < 1, 'Flight assist did not follow recommended heading');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setHeading',heading:45}), 'Manual Helm override failed');
  assert(!game.state.helm.assistEnabled, 'Manual steering should immediately disengage flight assist');
  assert(game.state.helm.maneuver === 'orbitStarboard', 'Manual override should preserve the selected maneuver director for reference');
  console.log('Helm target-relative director, assist, and manual-override smoke test passed.');
}

function runHelmWeaponsGeometryIntelTest() {
  const game = new BridgeGame(() => 0.3);
  let snapshot = game.safeSnapshot();
  assert(snapshot.enemy.beamArcDegrees === null && snapshot.enemy.heading === null, 'Enemy firing geometry leaked before Science mapping');
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  snapshot = game.safeSnapshot();
  assert(snapshot.enemy.beamArcDegrees === 120, 'Science subsystem mapping did not expose enemy firing arc to Helm');
  assert(snapshot.enemy.beamRange === 16 && snapshot.enemy.heading !== null, 'Mapped enemy weapon range/heading missing');
  console.log('Science-to-Helm hostile weapons-geometry smoke test passed.');
}

function runEnemyFiringArcConsequenceTest() {
  const game = new BridgeGame(() => 0);
  const captain = 'captain-alpha26-arc';
  const helm = 'helm-alpha26-arc';
  game.claimRole('captain', captain, 'Captain Arc');
  game.claimRole('helm', helm, 'Helm Arc');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  game.state.sensors.intelLevel = 1;
  const enemy = (game as any).enemyActual;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0; enemy.turnRateDegreesPerSecond = 0; enemy.beamRange = 16; enemy.beamArcDegrees = 120;
  game.state.ship.x = 5; game.state.ship.y = 0; game.state.ship.throttle = 0; game.state.ship.speed = 0;
  (game as any).enemyFireCooldown = 0;
  const shieldsOutside = game.state.ship.shields;
  game.tick(.01);
  assert(game.state.ship.shields === shieldsOutside, 'Enemy fired while player was outside its forward firing arc');
  game.state.ship.x = 0; game.state.ship.y = 5;
  (game as any).enemyFireCooldown = 0;
  game.tick(.01);
  assert(game.state.ship.shields < shieldsOutside, 'Enemy failed to fire when player moved inside its forward firing arc');
  console.log('Enemy forward firing arc now has real combat consequences for Helm maneuvering.');
}

runHelmFlightProfileAndReverseTest();
runHelmDirectorAndAssistTest();
runHelmWeaponsGeometryIntelTest();
runEnemyFiringArcConsequenceTest();
