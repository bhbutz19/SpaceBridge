import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runAutomaticRepairCrewDispatchTest() {
  const game = new BridgeGame(() => 0.5);
  const engineering = 'engineering-alpha24';
  game.claimRole('engineering', engineering, 'Auto Crew Engineer');

  assert(game.state.repairCrews.every((crew) => crew.autoDispatch), 'Repair crews should begin in configured AUTO mode');
  game.state.systems.shields = 42;
  game.state.systems.weapons = 61;
  game.tick(0.1);

  assert(game.state.repairCrews.every((crew) => crew.status !== 'idle'), 'AUTO crews remained idle while damaged systems needed repair');
  assert(game.state.repairCrews.some((crew) => crew.destinationSystem === 'shields' || crew.system === 'shields'), 'AUTO dispatch ignored the most damaged subsystem');

  const crew = game.state.repairCrews[0];
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'assignRepairCrew', crewId:crew.id, system:'engines' }), 'Manual crew assignment failed');
  assert(!crew.autoDispatch, 'Manual assignment did not disable AUTO for that crew');
  assert(crew.destinationSystem === 'engines' || crew.system === 'engines', 'Manual crew assignment did not take priority');

  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairCrewAuto', crewId:crew.id, enabled:true }), 'Could not return crew to AUTO');
  game.state.systems.engines = 100;
  game.tick(0.1);
  assert(crew.autoDispatch, 'Crew did not remain in AUTO mode');
  assert(crew.destinationSystem !== 'engines', 'AUTO crew stayed committed to a fully healthy subsystem');

  console.log('Engineering automatic repair-crew dispatch and manual override smoke test passed.');
}

runAutomaticRepairCrewDispatchTest();
