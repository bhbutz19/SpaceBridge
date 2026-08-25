import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runTargetRelativePositionDirectorTest() {
  const game = new BridgeGame(() => 0.2);
  const captain = 'captain-alpha28-position';
  const helm = 'helm-alpha28-position';
  game.claimRole('captain', captain, 'Captain Position');
  game.claimRole('helm', helm, 'Helm Position');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  const enemy = (game as any).enemyActual;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0; enemy.maxSpeed = 0; enemy.systems.engines = 0;
  game.state.ship.x = -11; game.state.ship.y = 0; game.state.ship.heading = 0; game.state.ship.requestedHeading = 0; game.state.ship.speed = 0;
  game.safeSnapshot();
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'selectHelmContact',contactId:enemy.id}), 'Helm could not select hostile contact');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setHelmManeuver',maneuver:'flankStarboard'}), 'Helm could not request starboard flank');
  game.safeSnapshot();
  assert(game.state.helm.desiredRelativePosition === 90, 'Starboard flank did not target +90 degrees around hostile bow');
  assert(game.state.helm.positionError !== null && Math.abs(game.state.helm.positionError) > 100, 'Director did not recognize large initial positional error');
  assert(game.state.helm.recommendedHeading !== null && game.state.helm.recommendedThrottle !== null, 'Flank director did not produce course/throttle');
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setHelmAssist',enabled:true}), 'Could not engage positional assist');
  const desiredX = 11, desiredY = 0;
  const before = Math.hypot(game.state.ship.x - desiredX, game.state.ship.y - desiredY);
  let minimumRange = 999;
  for (let i=0;i<80;i++) { game.tick(.1); game.safeSnapshot(); minimumRange = Math.min(minimumRange, game.state.helm.targetRange ?? 999); }
  const after = Math.hypot(game.state.ship.x - desiredX, game.state.ship.y - desiredY);
  assert(after < before, `Target-relative assist failed to reduce flank waypoint distance (${before.toFixed(2)} -> ${after.toFixed(2)})`);
  assert(minimumRange > 6, `Target-relative assist cut dangerously through target center; minimum range ${minimumRange.toFixed(2)} km`);
  console.log('Helm target-relative flank director smoke test passed.');
}

function runManeuverSpeedTurnAuthorityTest() {
  const game = new BridgeGame(() => 0.2);
  game.state.ship.enginePower = 100;
  game.state.systems.engines = 100;
  game.state.ship.speed = 0;
  game.safeSnapshot();
  const low = game.state.helm.turnAuthority;
  const effectiveMax = game.state.shipCapabilities.flight.maxForwardSpeed;
  game.state.ship.speed = effectiveMax * .4;
  game.safeSnapshot();
  const mid = game.state.helm.turnAuthority;
  game.state.ship.speed = effectiveMax;
  game.safeSnapshot();
  const high = game.state.helm.turnAuthority;
  assert(mid >= 98, `Mid-speed turn authority should be optimal, got ${mid}%`);
  assert(low < mid, `Low-speed turn authority should be lower than optimal (${low} vs ${mid})`);
  assert(high < mid, `High-speed turn authority should be lower than optimal (${high} vs ${mid})`);
  console.log('Helm maneuver-speed turn-authority curve smoke test passed.');
}

function runLateralThrusterTest() {
  const game = new BridgeGame(() => 0.2);
  const helm = 'helm-alpha28-thruster';
  game.claimRole('helm', helm, 'Helm Thruster');
  game.state.missionStatus = 'running';
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 0;
  game.state.ship.heading = 0;
  game.state.ship.requestedHeading = 0;
  game.state.ship.throttle = 0;
  game.state.ship.speed = 0;
  const x0 = game.state.ship.x;
  assert(game.executeCommand({kind:'human',sessionId:helm},{type:'setLateralThrust',thrust:100}), 'Starboard lateral-thrust command rejected');
  game.tick(1);
  assert(game.state.ship.lateralSpeed > 0, 'Starboard thruster did not create lateral velocity');
  assert(game.state.ship.x > x0, 'Heading 000 starboard thrust should move ship toward +X');
  assert(Math.abs(game.state.ship.heading) < .1, 'Lateral thrust should not rotate ship nose');
  game.executeCommand({kind:'human',sessionId:helm},{type:'setLateralThrust',thrust:0});
  console.log('Helm lateral maneuvering-thruster smoke test passed.');
}

function runEnemyAttackRunCommitmentTest() {
  const game = new BridgeGame(() => 0.2);
  game.state.missionStatus = 'running';
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  const enemy = (game as any).enemyActual;
  enemy.x = 0; enemy.y = 0; enemy.heading = 0; enemy.speed = 0; enemy.maneuverState = 'approach'; enemy.maneuverTimer = 0;
  game.state.ship.x = 0; game.state.ship.y = 10; game.state.ship.speed = 0; game.state.ship.throttle = 0;
  game.tick(.05);
  assert(enemy.maneuverState === 'attackRun', `Enemy failed to enter committed attack run; state=${enemy.maneuverState}`);
  const committedHeading = enemy.maneuverHeading;
  game.state.ship.x = 10; game.state.ship.y = 0;
  game.tick(.5);
  assert(enemy.maneuverState === 'attackRun', 'Enemy abandoned attack run immediately when player crossed its bow');
  assert(Math.abs(((enemy.heading - committedHeading + 540) % 360) - 180) < 8, 'Enemy attack run re-tracked player too aggressively instead of honoring committed heading');
  for (let i=0;i<55;i++) game.tick(.1);
  assert(enemy.maneuverState !== 'attackRun', 'Enemy attack run never progressed into extension/reposition cycle');
  console.log('Enemy committed attack-run state-machine smoke test passed.');
}

runTargetRelativePositionDirectorTest();
runManeuverSpeedTurnAuthorityTest();
runLateralThrusterTest();
runEnemyAttackRunCommitmentTest();
