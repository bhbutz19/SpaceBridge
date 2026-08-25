import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const bearingTo = (ship: {x:number;y:number}, target: {x:number;y:number}) => ((Math.atan2(target.x - ship.x, target.y - ship.y) * 180 / Math.PI) % 360 + 360) % 360;
const angleDelta = (a:number,b:number) => Math.abs(((a - b + 540) % 360) - 180);

function runDynamicCaptainNavigationTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-alpha17';
  const helm = 'helm-alpha17';
  game.claimRole('captain', captain, 'Captain Vector');
  game.claimRole('helm', helm, 'Helm Vector');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });

  const enemy = (game as any).enemyActual as {id:string;x:number;y:number};
  game.safeSnapshot();
  assert(!game.executeCommand({ kind:'human', sessionId:captain }, { type:'issueNavigationTargetOrder', contactId:enemy.id }), 'Captain could track an unresolved Science contact');

  game.state.sensors.intelLevel = 1;
  game.safeSnapshot();
  const object = game.state.spaceObjects.find((entry) => entry.id === enemy.id);
  assert(object?.identified === true, 'Science-identified hostile was not marked as a known navigation object');
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'issueNavigationTargetOrder', contactId:enemy.id }), 'Captain could not issue course to identified contact');
  assert(game.state.captainNavigationTargetId === enemy.id, 'Captain target ID was not retained');
  const firstBearing = game.state.captainHeadingOrder as number;
  assert(angleDelta(firstBearing, bearingTo(game.state.ship, enemy)) < .01, 'Initial dynamic bearing was incorrect');

  enemy.x += 13;
  enemy.y -= 7;
  game.safeSnapshot();
  const secondBearing = game.state.captainHeadingOrder as number;
  assert(angleDelta(secondBearing, bearingTo(game.state.ship, enemy)) < .01, 'Dynamic bearing did not update after target moved');
  assert(angleDelta(firstBearing, secondBearing) > 1, 'Target movement did not materially change Captain course');
  assert(Math.round(game.state.ship.requestedHeading) !== Math.round(secondBearing), 'Human Helm was automatically overridden by target-tracking order');

  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'issueHeadingOrder', heading:270 }), 'Fixed heading could not replace target tracking');
  assert(game.state.captainNavigationTargetId === null && game.state.captainHeadingOrder === 270, 'Fixed heading did not clear dynamic target');
  console.log('Captain dynamic target-tracking course smoke test passed.');
}

function runAiHelmTargetCourseTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-aihelm-alpha17';
  game.claimRole('captain', captain, 'Captain AI Helm');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.state.sensors.intelLevel = 1;
  game.safeSnapshot();
  const enemy = (game as any).enemyActual as {id:string;x:number;y:number};
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'captainTextOrder', text:'Helm, course to the target.' }), 'Natural-language target-course order failed');
  game.tick(.3);
  assert(game.state.captainNavigationTargetId === enemy.id, 'Text target order did not resolve Science/Tactical contact');
  assert(angleDelta(game.state.ship.requestedHeading, game.state.captainHeadingOrder ?? -999) < 5, 'AI Helm did not adopt live target bearing');
  assert(game.state.ship.throttle > 0, 'AI Helm did not make way toward a distant Captain navigation target');
  console.log('AI Helm dynamic target-course smoke test passed.');
}

runDynamicCaptainNavigationTest();
runAiHelmTargetCourseTest();
