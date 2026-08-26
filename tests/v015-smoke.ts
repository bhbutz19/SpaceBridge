import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

const game = new BridgeGame(() => 0.42);
const captain = 'captain-alpha15';
const tactical = 'tactical-alpha15';
const science = 'science-alpha15';
game.claimRole('captain', captain, 'Captain Multi');
game.claimRole('tactical', tactical, 'Tactical Multi');
game.claimRole('science', science, 'Science Multi');
game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
game.state.missionStage = 'combat';
game.tick(0.1);

const types = new Set(game.state.spaceObjects.map((object) => object.objectType));
assert(types.has('ship'), 'General map omitted ships');
assert(types.has('planet'), 'General map omitted configured planet');
assert(types.has('asteroid'), 'General map omitted configured asteroid');

const asteroid = game.state.spaceObjects.find((object) => object.objectType === 'asteroid');
assert(asteroid, 'Configured asteroid missing');
assert(game.executeCommand({ kind:'human', sessionId:science }, { type:'selectScienceContact', contactId:asteroid.id }), 'Science could not select a non-ship map object');
assert(game.state.stationSelections.scienceContactId === asteroid.id, 'Science selection did not persist');

assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'selectTacticalContact', contactId:asteroid.id }), 'Tactical could not select a map object for inspection');
const enemy = (game as any).enemyActual;
const before = enemy.shields;
game.state.sensors.intelLevel = 2;
game.state.ship.beamCharge = 100;
game.state.ship.x = 28;
game.state.ship.y = 0;
game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
assert(enemy.shields === before, 'Weapons interlock failed when a neutral object was selected');

assert(game.executeCommand({ kind:'human', sessionId:tactical }, { type:'selectTacticalContact', contactId:enemy.id }), 'Tactical could not reselect hostile');
game.executeCommand({ kind:'human', sessionId:tactical }, { type:'fireBeam' });
assert(enemy.shields < before, 'Weapons did not fire after hostile was reselected');

console.log('Multi-object map, independent station selection, and weapons-interlock smoke test passed.');
