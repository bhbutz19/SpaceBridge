import { BridgeGame } from '../src/server/game.js';
import { SHIP_PROFILES } from '../src/server/config/shipProfiles.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupCombat() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-alpha16';
  const tactical = 'tactical-alpha16';
  game.claimRole('captain', captain, 'Captain Scope');
  game.claimRole('tactical', tactical, 'Tactical Scope');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.safeSnapshot();
  return { game, captain, tactical };
}

function runShipCapabilityTest() {
  const game = new BridgeGame(() => 0.42);
  assert(game.state.shipCapabilities.stationSensors.tacticalRange === 24, 'Prototype Tactical scope was not loaded from ship profile');
  assert(game.state.shipCapabilities.stationSensors.helmRange > game.state.shipCapabilities.stationSensors.tacticalRange, 'Helm scope should exceed Tactical scope');
  assert(game.state.shipCapabilities.stationSensors.scienceRange === null, 'Science should be configured for full-map scope');
  assert(game.state.shipCapabilities.weapons.beamArcDegrees === 180, 'Prototype beam arc should cover the forward half of the ship');
  assert(game.state.shipCapabilities.weapons.torpedoArcDegrees === 360, 'Prototype torpedo launcher should support all-around launch geometry');
  assert(SHIP_PROFILES.heavyCruiserExample.weapons.beamArcDegrees === 360, 'Heavy cruiser example should demonstrate all-around beam coverage');
  console.log('Ship-profile station scope and weapon-geometry smoke test passed.');
}

function runCaptainHeadingOrderTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-heading-alpha16';
  game.claimRole('captain', captain, 'Captain Course');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'issueHeadingOrder', heading:135 }), 'Captain could not issue a fixed heading');
  game.tick(.3);
  assert(game.state.captainHeadingOrder === 135, 'Captain heading order did not persist');
  assert(Math.round(game.state.ship.requestedHeading) === 135, 'AI Helm did not adopt Captain fixed heading');
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'captainTextOrder', text:'Helm, heading 090.' }), 'Captain text heading order failed');
  game.tick(.3);
  assert(game.state.captainHeadingOrder === 90 && Math.round(game.state.ship.requestedHeading) === 90, 'Natural-language heading did not reach Helm');
  console.log('Captain-to-Helm fixed-heading order smoke test passed.');
}

function runBeamArcTest() {
  const { game, tactical } = setupCombat();
  const enemy = (game as any).enemyActual;
  game.state.ship.x = enemy.x;
  game.state.ship.y = enemy.y + 10; // hostile is directly astern when heading north
  game.state.ship.heading = 0;
  game.state.ship.requestedHeading = 0;
  game.state.ship.beamCharge = 100;
  const before = enemy.shields as number;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  assert(enemy.shields === before, 'Forward-only beam fired through the aft arc');
  assert(game.state.ship.beamCharge === 100, 'Beam capacitor was consumed by firing-arc interlock');
  game.state.ship.heading = 180;
  game.state.ship.requestedHeading = 180;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
  assert(enemy.shields < before, 'Beam did not fire after hostile entered forward arc');
  console.log('Forward beam firing-arc smoke test passed.');
}

function runTorpedoAllAroundTest() {
  const { game, tactical } = setupCombat();
  const enemy = (game as any).enemyActual;
  game.state.ship.x = enemy.x;
  game.state.ship.y = enemy.y + 10;
  game.state.ship.heading = 0; // hostile remains directly astern
  const before = enemy.shields as number;
  const torpedoes = game.state.ship.torpedoes;
  game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireTorpedo' });
  assert(game.state.ship.torpedoes === torpedoes - 1, 'All-around torpedo launcher refused an aft launch');
  assert(enemy.shields < before, 'Aft torpedo launch did not damage hostile');
  console.log('All-around torpedo launch-arc smoke test passed.');
}

runShipCapabilityTest();
runCaptainHeadingOrderTest();
runBeamArcTest();
runTorpedoAllAroundTest();
