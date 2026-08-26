import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function prepareHumanCrew(random = () => .5) {
  const game = new BridgeGame(random);
  const sessions = {
    captain: 'alpha34-captain',
    helm: 'alpha34-helm',
    engineering: 'alpha34-engineering',
    tactical: 'alpha34-tactical',
    science: 'alpha34-science',
    communications: 'alpha34-communications'
  } as const;
  for (const [role, sessionId] of Object.entries(sessions)) {
    assert(game.claimRole(role as keyof typeof sessions, sessionId, `Alpha 34 ${role}`), `Could not claim ${role}`);
  }
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.captain }, { type: 'startMission' }), 'Captain could not start alpha.34 test mission');
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  game.state.ship.x = 0;
  game.state.ship.y = 10;
  game.state.ship.heading = 180;
  game.state.ship.requestedHeading = 180;
  game.state.ship.speed = 0;
  game.state.ship.throttle = 0;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 0;
  enemy.heading = 0;
  enemy.speed = 0;
  enemy.maneuverState = 'approach';
  enemy.ai.decisionCooldown = 10;
  game.tick(.01);
  return { game, sessions, enemy };
}

function selectSurrenderStations(game: BridgeGame, sessions: ReturnType<typeof prepareHumanCrew>['sessions'], enemyId: string) {
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.science }, { type: 'selectScienceContact', contactId: enemyId }), 'Science could not select hostile for verification');
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'selectCommunicationsContact', contactId: enemyId }), 'Communications could not select hostile for surrender demand');
}

function runSubsystemConsequenceTest() {
  const propulsion = prepareHumanCrew();
  propulsion.enemy.speed = .8;
  propulsion.enemy.systems.engines = 0;
  const startX = propulsion.enemy.x;
  const startY = propulsion.enemy.y;
  propulsion.game.tick(.5);
  assert(propulsion.enemy.speed < .25, 'Offline enemy engines did not rapidly remove maneuver authority');
  assert(Math.hypot(propulsion.enemy.x - startX, propulsion.enemy.y - startY) < .001, 'Enemy continued powered movement with engines offline');
  assert(propulsion.game.safeSnapshot().enemy.operationalState === 'degraded', 'Single offline subsystem was not published as degraded combat capability');

  const weapons = prepareHumanCrew(() => 0);
  weapons.enemy.maxSpeed = 0;
  weapons.enemy.systems.weapons = 0;
  (weapons.game as any).enemyFireCooldown = 0;
  const shieldsBefore = weapons.game.state.ship.shields;
  weapons.game.tick(.2);
  assert(weapons.game.state.ship.shields === shieldsBefore, 'Enemy fired despite its weapons subsystem being offline');
  assert(!weapons.game.state.combatEffects.some((effect) => effect.kind === 'hostileBeam'), 'Offline enemy weapons still authored a hostile beam effect');

  const shields = prepareHumanCrew();
  shields.enemy.maxSpeed = 0;
  shields.enemy.shields = shields.enemy.maxShields;
  shields.enemy.systems.shields = 0;
  const envelopeBefore = shields.enemy.shields;
  shields.game.tick(1);
  assert(shields.enemy.shields < envelopeBefore - shields.enemy.maxShields * .2, 'Offline shield generators did not collapse the remaining hostile envelope');

  const sensors = prepareHumanCrew(() => .5);
  sensors.enemy.maxSpeed = 0;
  sensors.enemy.systems.sensors = 0;
  (sensors.game as any).enemyFireCooldown = 0;
  const playerShieldsBefore = sensors.game.state.ship.shields;
  sensors.game.tick(.2);
  const hostileEffect = sensors.game.state.combatEffects.find((effect) => effect.kind === 'hostileBeam');
  assert(hostileEffect?.result === 'miss', 'Offline enemy sensors did not reduce its targeting solution to the severe-degradation miss rate');
  assert(sensors.game.state.ship.shields === playerShieldsBefore, 'Sensor-dark hostile unexpectedly landed its controlled test shot');
  console.log('Graded propulsion, weapons, shields, and sensors consequence smoke test passed.');
}

function runKestrelSurrenderAndVerificationTest() {
  const { game, sessions, enemy } = prepareHumanCrew();
  selectSurrenderStations(game, sessions, enemy.id);
  enemy.systems.engines = 0;
  enemy.systems.weapons = 0;
  enemy.systems.communications = 0;
  game.tick(.1);

  let snapshot = game.safeSnapshot();
  assert(snapshot.enemy.operationalState === 'mission-killed', 'Disabled Kestrel was not classified as mission-killed');
  assert(snapshot.enemy.surrender.status === 'eligible' && snapshot.enemy.surrender.demandAvailable, 'Mission-killed Kestrel did not expose a surrender window');
  assert(snapshot.enemy.surrender.pressure !== null && snapshot.enemy.surrender.pressure >= 63, 'Science did not publish sufficient Kestrel surrender pressure');

  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'demandSurrender' }), 'Communications surrender demand was rejected');
  snapshot = game.safeSnapshot();
  assert(snapshot.enemy.surrender.status === 'accepted' && snapshot.enemy.surrender.ceasefire, 'Kestrel did not accept surrender or activate the ceasefire');
  assert(game.state.communications.transmissions.some((entry) => entry.sourceName.includes('EMERGENCY BEACON') && entry.subject.includes('SURRENDER ACCEPTED')), 'Communications-offline surrender did not fall back to the emergency beacon');

  const enemyIntegrity = enemy.hull + enemy.shields;
  game.state.ship.beamCharge = 100;
  game.executeCommand({ kind: 'human', sessionId: sessions.tactical }, { type: 'fireBeam' });
  assert(enemy.hull + enemy.shields === enemyIntegrity, 'Tactical fire bypassed the surrender ceasefire interlock');

  assert(game.executeCommand({ kind: 'human', sessionId: sessions.science }, { type: 'beginSurrenderVerification' }), 'Science could not begin surrender verification');
  assert(game.safeSnapshot().enemy.surrender.status === 'verifying', 'Surrender verification did not enter the active state');
  game.tick(5.1);
  assert(enemy.surrender.status === 'verified', 'Science verification did not confirm the hostile power-down');
  assert(game.state.missionStage === 'reinforcement', 'Verified first-wave surrender did not resolve the encounter');
  console.log('Kestrel surrender, ceasefire interlock, emergency channel, and Science verification smoke test passed.');
}

function runViperDeceptionTest() {
  const { game, sessions } = prepareHumanCrew();
  (game as any).spawnWave(2);
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 0;
  enemy.heading = 0;
  enemy.speed = 0;
  enemy.systems.engines = 0;
  enemy.systems.weapons = 0;
  game.tick(.1);
  selectSurrenderStations(game, sessions, enemy.id);

  assert(game.safeSnapshot().enemy.surrender.status === 'eligible', 'Mission-killed Viper did not expose a surrender opportunity');
  assert(game.executeCommand({ kind: 'human', sessionId: sessions.communications }, { type: 'demandSurrender' }), 'Viper surrender demand was rejected');
  assert(enemy.surrender.status === 'stalling', 'Persistent Viper did not use the expected negotiation stall at full hull');
  assert(!game.safeSnapshot().enemy.surrender.ceasefire, 'A deceptive negotiation stall incorrectly activated ceasefire protection');
  game.tick(8.1);
  assert(enemy.surrender.status === 'stalling', 'Viper bypassed the new subsystem repair-mobilization delay');
  assert(enemy.systems.engines === 0 && enemy.systems.weapons === 0, 'Viper began covert repairs before its damage-control lockout expired');
  for (let elapsed = 0; elapsed < 40 && enemy.surrender.status === 'stalling'; elapsed += .1) game.tick(.1);
  assert(enemy.surrender.status === 'refused', 'Science did not expose the completed Viper repair stall');
  assert(enemy.systems.engines > 0 || enemy.systems.weapons > 0, 'Viper did not restore a damaged combat subsystem during its stall');
  assert(game.state.commsLog.some((entry) => entry.message.toLowerCase().includes('used negotiations') || entry.message.toLowerCase().includes('repair')), 'Bridge crew did not receive a warning about the surrender deception');
  console.log('Viper surrender-stall and covert repair smoke test passed.');
}

function runScienceIntelGatingTest() {
  const game = new BridgeGame();
  const enemy = (game as any).enemyActual;
  game.state.missionStatus = 'running';
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  enemy.systems.engines = 0;
  enemy.systems.weapons = 0;
  game.tick(.1);
  const snapshot = game.safeSnapshot();
  assert(snapshot.enemy.surrender.status === 'eligible', 'Authoritative surrender state did not activate before tactical mapping');
  assert(snapshot.enemy.surrender.pressure === null && snapshot.enemy.surrender.eligibilityReason === null, 'Surrender analysis leaked before Science mapped hostile systems');
  console.log('Science-gated surrender analysis smoke test passed.');
}

runSubsystemConsequenceTest();
runKestrelSurrenderAndVerificationTest();
runViperDeceptionTest();
runScienceIntelGatingTest();
