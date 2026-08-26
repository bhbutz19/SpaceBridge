import { BridgeGame } from '../src/server/game.js';
import { evaluateTacticalAwareness } from '../src/shared/tacticalAwareness.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function setupTacticalEngagement() {
  const game = new BridgeGame(() => 0.31);
  const captain = 'captain-alpha30';
  const tactical = 'tactical-alpha30';
  game.claimRole('captain', captain, 'Captain Awareness');
  game.claimRole('tactical', tactical, 'Tactical Awareness');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  game.state.missionStage = 'combat';
  return { game, tactical };
}

function runTacticalBlockerReadoutTest() {
  const { game } = setupTacticalEngagement();
  let awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.beam.status === 'SCIENCE IDENTIFICATION REQUIRED', `Unidentified contact blocker was unclear: ${awareness.beam.status}`);

  const enemy = (game as any).enemyActual;
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0;
  game.state.ship.x = 0; game.state.ship.y = -10; game.state.ship.heading = 0; game.state.ship.requestedHeading = 0;
  game.state.ship.beamCharge = 100;
  game.state.systems.weapons = 100;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.beam.ready, `Valid beam solution was not reported ready: ${awareness.beam.blockers.join(', ')}`);
  assert(awareness.torpedo.ready, `Valid torpedo solution was not reported ready: ${awareness.torpedo.blockers.join(', ')}`);

  game.state.ship.heading = 180;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(!awareness.beam.ready && awareness.beam.status === 'TARGET OUTSIDE BEAM ARC', `Beam arc blocker was not explicit: ${awareness.beam.status}`);
  assert(awareness.torpedo.ready, 'All-around torpedo solution should remain ready while beam is outside its firing arc');

  game.state.ship.heading = 0;
  game.state.systems.weapons = 0;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.beam.status === 'WEAPONS CONTROL OFFLINE' && awareness.torpedo.status === 'WEAPONS CONTROL OFFLINE', 'Offline weapons did not become the primary blocker');

  game.state.systems.weapons = 100;
  game.state.ship.beamCharge = 10;
  game.state.ship.torpedoes = 0;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.beam.status === 'CAPACITOR BELOW 25%', `Low-capacitor blocker was not explicit: ${awareness.beam.status}`);
  assert(awareness.torpedo.status === 'TORPEDO MAGAZINE EMPTY', `Empty-magazine blocker was not explicit: ${awareness.torpedo.status}`);

  game.state.ship.beamCharge = 100;
  game.state.ship.torpedoes = 4;
  game.state.ship.y = -40;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.beam.status === 'TARGET OUT OF BEAM RANGE', `Beam range blocker was not explicit: ${awareness.beam.status}`);
  assert(awareness.torpedo.status === 'TARGET OUT OF TORPEDO RANGE', `Torpedo range blocker was not explicit: ${awareness.torpedo.status}`);
  console.log('Tactical at-a-glance fire-blocker smoke test passed.');
}

function runTacticalPositionReadoutTest() {
  const { game } = setupTacticalEngagement();
  const enemy = (game as any).enemyActual;
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0;
  game.state.ship.x = 0; game.state.ship.y = -10; game.state.ship.heading = 0;
  let awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.positionalAdvantage === 'stern' && awareness.positionLabel === 'STERN ADVANTAGE', `Hostile stern position was not identified: ${awareness.positionLabel}`);
  assert(awareness.insideHostileArc === false, 'Stern position should be clear of hostile forward weapons');

  game.state.ship.x = 0; game.state.ship.y = 10;
  awareness = evaluateTacticalAwareness(game.safeSnapshot());
  assert(awareness.positionalAdvantage === 'danger' && awareness.insideHostileArc === true, `Bow exposure was not identified: ${awareness.positionLabel}`);
  console.log('Tactical hostile-position and firing-arc awareness smoke test passed.');
}

runTacticalBlockerReadoutTest();
runTacticalPositionReadoutTest();
