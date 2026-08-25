import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runStaticPlanetSeparationTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-alpha18';
  game.claimRole('captain', captain, 'Captain Scope');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });

  // Put the scenario on wave two because this was the visually confusing pairing.
  (game as any).spawnWave(2);
  game.safeSnapshot();

  const planet = game.state.spaceObjects.find((object) => object.id === 'nereid-iv');
  const enemy = (game as any).enemyActual as { id:string; x:number; y:number };
  assert(planet, 'Nereid IV missing from generalized space-object map');
  assert(planet.id !== enemy.id, 'Planet and second hostile share an object ID');

  const separation = Math.hypot(planet.x - enemy.x, planet.y - enemy.y);
  assert(separation > 8, `Planet and second hostile spawn too close together (${separation.toFixed(1)} km)`);

  const planetStart = { x: planet.x, y: planet.y };
  enemy.x += 9;
  enemy.y -= 6;
  game.safeSnapshot();

  const planetAfter = game.state.spaceObjects.find((object) => object.id === 'nereid-iv');
  const enemyAfter = game.state.spaceObjects.find((object) => object.id === enemy.id);
  assert(planetAfter?.x === planetStart.x && planetAfter?.y === planetStart.y, 'Static planet inherited moving hostile coordinates');
  assert(enemyAfter?.x === enemy.x && enemyAfter?.y === enemy.y, 'Second hostile did not retain its independent moving coordinates');

  console.log('Static planet / moving hostile object-separation smoke test passed.');
}

runStaticPlanetSeparationTest();
