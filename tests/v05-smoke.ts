import { BridgeGame } from '../src/server/game.js';
import { ACTIVE_SHIP_PROFILE, SHIP_PROFILES, repairCrewTransitSeconds } from '../src/server/config/shipProfiles.js';
import type { EngineeringPuzzleState, JunctionState, SystemName } from '../src/shared/protocol.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runDistressMissionTest() {
  const game = new BridgeGame();
  const captain = 'captain-v05';
  game.claimRole('captain', captain, 'Captain V05');
  assert(game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'selectMission', missionId: 'meridian-distress' }), 'Could not select distress mission');
  assert(game.state.missionId === 'meridian-distress', 'Distress mission not selected');
  assert(game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'startMission' }), 'Could not start distress mission');
  let elapsed = 0;
  while (game.state.missionStatus === 'running' && elapsed < 90) { game.tick(0.05); elapsed += 0.05; }
  assert(game.state.missionStatus === 'victory', `AI crew did not complete distress mission: ${game.state.missionStage}`);
  assert(game.state.friendlyContact?.status === 'safe', 'Meridian did not reach safe state');
  assert((game.state.friendlyContact?.aidProgress ?? 0) >= 100, 'Aid transfer did not complete');
  console.log(`Distress mission AI-completion smoke test passed in ${elapsed.toFixed(1)} simulated seconds.`);
}

function runCommunicationsHandoffTest() {
  const game = new BridgeGame();
  const captain = 'captain-comms';
  const comms = 'human-comms';
  game.claimRole('captain', captain, 'Captain Comms');
  game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'selectMission', missionId: 'meridian-distress' });
  game.claimRole('communications', comms, 'Human Comms');
  game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'startMission' });
  game.tick(3);
  assert(game.state.friendlyContact?.status === 'distress', 'AI Communications acted while human held station');
  assert(game.executeCommand({ kind: 'human', sessionId: comms }, { type: 'sendCommsResponse', response: 'acknowledge' }), 'Human communications response failed');
  assert(game.state.missionStage === 'rendezvous', 'Human acknowledgement did not advance mission');
  game.releaseRole(comms);
  game.tick(1);
  assert(game.state.roles.find(r => r.role === 'communications')?.controller === 'ai', 'Communications did not return to AI');
  console.log('Communications human/AI handoff smoke test passed.');
}

function runDamageRepairTest() {
  const game = new BridgeGame();
  const captain = 'captain-repair';
  const engineering = 'human-engineering';
  game.claimRole('captain', captain, 'Captain Repair');
  game.claimRole('engineering', engineering, 'Human Engineering');
  // Use the non-combat mission plus the Engineering test control so this
  // repair regression is deterministic and cannot be masked by fresh enemy hits.
  game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'selectMission', missionId: 'meridian-distress' });
  game.executeCommand({ kind: 'human', sessionId: captain }, { type: 'startMission' });
  const system: SystemName = 'shields';
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringTestSetSystem', system, health:60 }), 'Could not create deterministic subsystem damage');
  const before = game.state.systems[system];
  assert(game.executeCommand({ kind: 'human', sessionId: engineering }, { type: 'setRepairTarget', system }), 'Engineering could not select repair diagnostic');
  const crew = game.state.repairCrews[0];
  assert(game.executeCommand({ kind: 'human', sessionId: engineering }, { type: 'assignRepairCrew', crewId: crew.id, system }), 'Engineering could not dispatch repair crew');
  for (let i = 0; i < 160; i += 1) game.tick(0.1);
  assert(game.state.systems[system] > before, `Repair crew did not improve ${system}`);
  console.log(`Damage-control repair smoke test passed for ${system}: ${before.toFixed(0)}% -> ${game.state.systems[system].toFixed(0)}%.`);
}

runDistressMissionTest();
runCommunicationsHandoffTest();
runDamageRepairTest();

function rotateTileTo(game: BridgeGame, engineering: string, index: number, targetRotation: 0 | 90 | 180 | 270) {
  for (let i = 0; i < 4; i += 1) {
    const tile = game.state.engineeringPuzzle?.circuitTiles?.find(entry => entry.index === index);
    if (!tile || tile.rotation === targetRotation) return;
    game.executeCommand({ kind: 'human', sessionId: engineering }, { type: 'engineeringPuzzleAction', puzzleId: game.state.engineeringPuzzle!.id, action: 'rotate', index });
  }
}

function findCircuitSolution(puzzle: EngineeringPuzzleState): Array<[number, 0 | 90 | 180 | 270]> {
  const tiles = puzzle.circuitTiles ?? [];
  const size = puzzle.circuitSize ?? 3;
  const source = puzzle.circuitSourceIndex ?? size;
  const sink = puzzle.circuitSinkIndex ?? (size * 2 - 1);
  type Direction = 'up' | 'right' | 'down' | 'left';
  const directions: Direction[] = ['up', 'right', 'down', 'left'];
  const opposite: Record<Direction, Direction> = { up:'down', right:'left', down:'up', left:'right' };
  const vector: Record<Direction, [number, number]> = { up:[-1,0], right:[0,1], down:[1,0], left:[0,-1] };
  const rotationFor = (shape: 'straight' | 'corner', a: Direction, b: Direction): 0 | 90 | 180 | 270 | null => {
    if (a === b) return null;
    const pair = new Set([a,b]);
    if (shape === 'straight') {
      if (pair.has('left') && pair.has('right')) return 0;
      if (pair.has('up') && pair.has('down')) return 90;
      return null;
    }
    if (pair.has('up') && pair.has('right')) return 0;
    if (pair.has('right') && pair.has('down')) return 90;
    if (pair.has('down') && pair.has('left')) return 180;
    if (pair.has('left') && pair.has('up')) return 270;
    return null;
  };

  const visited = new Set<number>();
  const route: Array<[number, 0 | 90 | 180 | 270]> = [];
  const search = (index: number, entry: Direction): boolean => {
    if (visited.has(index)) return false;
    visited.add(index);
    const tile = tiles[index];
    if (!tile) { visited.delete(index); return false; }
    if (index === sink) {
      const rotation = rotationFor(tile.shape, entry, 'right');
      if (rotation !== null) { route.push([index, rotation]); return true; }
    }
    const row = Math.floor(index / size), col = index % size;
    for (const out of directions) {
      const rotation = rotationFor(tile.shape, entry, out);
      if (rotation === null) continue;
      const [dr,dc] = vector[out];
      const nr=row+dr,nc=col+dc;
      if(nr<0||nr>=size||nc<0||nc>=size) continue;
      const next=nr*size+nc;
      if(visited.has(next)) continue;
      route.push([index, rotation]);
      if(search(next, opposite[out])) return true;
      route.pop();
    }
    visited.delete(index);
    return false;
  };
  assert(search(source, 'left'), 'Could not derive a valid route through randomized circuit board');
  return route;
}

function solveJunction(game: BridgeGame, engineering: string, puzzle: EngineeringPuzzleState) {
  const context = puzzle.junctionContext!;
  const rulePasses = (code: string) => code === 'I' || (code === 'E' && context.checksum % 2 === 0) || (code === 'A' && context.auxiliaryOnline) || (code === 'R' && context.reserve >= 60);
  const shouldIsolate = (entry: JunctionState) => {
    const row = puzzle.junctionRules!.find(rule => rule.profile === entry.profile)!;
    const code = entry.lamp ? (entry.tagged ? row.litTagged : row.litClear) : (entry.tagged ? row.offTagged : row.offClear);
    return rulePasses(code);
  };
  for (const entry of puzzle.junctions!.filter(shouldIsolate)) game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'toggleJunction', junctionId:entry.id });
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'verifyJunctions' });
}

function runEngineeringPuzzleTest() {
  const game = new BridgeGame();
  const engineering = 'engineering-puzzle-human';
  game.claimRole('engineering', engineering, 'Puzzle Engineer');

  game.state.systems.shields = 60;
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'shields' }), 'Could not start shield repair');
  let puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'breaker' && puzzle.mode === 'quick', 'First damaged-system task should be quick breaker reset');
  for (const breaker of [...(puzzle.breakers ?? [])].filter(b => b.tripped).sort((a,b) => a.bus - b.bus)) game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'resetBreaker', breakerId:breaker.id });
  assert(game.state.engineeringPuzzle?.status === 'solved', 'Breaker quick repair did not solve');
  assert(game.state.systems.shields > 60 && game.state.repairBoostRemaining > 0, 'Quick repair did not award repair boost');

  game.state.systems.engines = 55;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'engines' });
  puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'coolant' && puzzle.mode === 'quick', 'Second damaged-system task should be coolant balance');
  for (const valve of puzzle.coolantValves ?? []) while (valve.setting !== valve.target) game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'cycleCoolant', valveId:valve.id });
  assert(game.state.engineeringPuzzle?.status === 'solved', 'Coolant quick repair did not solve');

  game.state.systems.weapons = 50;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'weapons' });
  puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'fuse' && puzzle.mode === 'quick', 'Third damaged-system task should be fuse replacement');
  const fuseRating = (load:number) => [10,15,20].find(rating => rating >= load)!;
  for (const bay of puzzle.fuseBays ?? []) game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'installFuse', bayId:bay.id, rating:fuseRating(bay.load) });
  assert(game.state.engineeringPuzzle?.status === 'solved', 'Fuse quick repair did not solve');

  game.state.systems.sensors = 0;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'sensors' });
  puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'circuit' && puzzle.mode === 'restoration', 'First offline-system procedure should be circuit restoration');
  for (let i=0;i<100;i+=1) game.tick(.1);
  assert(game.state.systems.sensors === 0, 'Offline subsystem repaired without completing restoration');
  const firstCircuitSignature = JSON.stringify({ source:puzzle.circuitSourceIndex, sink:puzzle.circuitSinkIndex, tiles:puzzle.circuitTiles });
  for (const [index, rotation] of findCircuitSolution(puzzle)) rotateTileTo(game, engineering, index, rotation);
  assert(game.state.engineeringPuzzle?.status === 'solved', 'Circuit restoration did not solve');
  assert(game.state.systems.sensors >= 18, 'Circuit restoration did not bring subsystem online');

  game.state.systems.communications = 0;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'communications' });
  puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'junction' && puzzle.mode === 'restoration', 'Second offline-system procedure should be junction isolation');
  solveJunction(game, engineering, puzzle);
  assert(game.state.engineeringPuzzle?.status === 'solved' && game.state.systems.communications >= 18, 'Junction restoration did not bring subsystem online');

  game.state.systems.shields = 0;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'shields' });
  puzzle = game.state.engineeringPuzzle!;
  assert(puzzle.type === 'circuit', 'Third offline-system procedure should cycle back to circuit restoration');
  const secondCircuitSignature = JSON.stringify({ source:puzzle.circuitSourceIndex, sink:puzzle.circuitSinkIndex, tiles:puzzle.circuitTiles });
  assert(secondCircuitSignature !== firstCircuitSignature, 'Repeated critical circuit restoration generated the same board');
  console.log('Engineering quick-repair and offline-restoration smoke tests passed.');
}

function runEngineeringAiPuzzleFallbackTest() {
  const game = new BridgeGame();
  game.state.systems.sensors = 0;
  assert(game.executeCommand({ kind:'ai', role:'engineering' }, { type:'setRepairTarget', system:'sensors' }), 'AI could not set offline repair target');
  assert(game.state.engineeringPuzzle?.mode === 'restoration', 'AI offline repair did not generate restoration procedure');
  for (let i=0;i<900;i+=1) game.tick(.05);
  assert(game.state.engineeringPuzzle?.status === 'solved' || game.state.systems.sensors > 0, 'AI did not complete offline restoration fallback');
  console.log('Engineering AI offline-restoration fallback smoke test passed.');
}


function runOfflineSubsystemConsequenceTest() {
  const game = new BridgeGame();
  const captain='offline-captain', helm='offline-helm', tactical='offline-tactical', science='offline-science';
  game.claimRole('captain', captain, 'Offline Captain'); game.claimRole('helm', helm, 'Offline Helm'); game.claimRole('tactical', tactical, 'Offline Tactical'); game.claimRole('science', science, 'Offline Science');
  game.executeCommand({kind:'human',sessionId:captain},{type:'startMission'});

  game.state.systems.engines=0; game.state.ship.x=0; game.state.ship.y=0;
  game.executeCommand({kind:'human',sessionId:helm},{type:'setThrottle',throttle:100}); game.tick(1);
  assert(Math.hypot(game.state.ship.x,game.state.ship.y) < 0.001, 'Offline engines still propelled the ship');

  game.state.systems.sensors=0; game.state.sensors.scanActive=false;
  game.executeCommand({kind:'human',sessionId:science},{type:'scanTarget'});
  assert(!game.state.sensors.scanActive, 'Offline sensors still initiated a scan');

  game.state.systems.weapons=0; game.state.ship.beamCharge=100;
  game.executeCommand({kind:'human',sessionId:tactical},{type:'fireBeam'});
  assert(game.state.ship.beamCharge===100, 'Offline weapons still fired or consumed beam charge');
  console.log('Offline subsystem gameplay-consequence smoke test passed.');
}

runEngineeringPuzzleTest();
runEngineeringAiPuzzleFallbackTest();
runOfflineSubsystemConsequenceTest();

function runEngineeringFailureDrillTest() {
  const game = new BridgeGame();
  const engineering = 'engineering-drill-human';
  game.claimRole('engineering', engineering, 'Drill Engineer');
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringTestSetSystem', system:'weapons', health:0 }), 'Engineering failure drill could not force weapons offline');
  assert(game.state.systems.weapons === 0, 'Failure drill did not set weapons to zero');
  assert(game.state.repairTarget === 'weapons', 'Failure drill did not select the offline subsystem');
  assert(game.state.engineeringPuzzle?.mode === 'restoration', 'Failure drill did not generate a critical restoration puzzle');
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringTestSetSystem', system:'weapons', health:20 }), 'Failure drill could not set critical health');
  assert(game.state.systems.weapons === 20 && game.state.engineeringPuzzle?.mode === 'quick', '20% drill state did not generate quick repair');
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringTestSetSystem', system:'weapons', health:100 }), 'Failure drill could not restore subsystem');
  assert(game.state.systems.weapons === 100 && game.state.repairTarget === null && game.state.engineeringPuzzle === null, 'Failure drill did not fully restore subsystem state');
  console.log('Engineering system-failure drill smoke test passed.');
}

runEngineeringFailureDrillTest();

function runShieldGatedCatastrophicFailureTest() {
  const protectedGame = new BridgeGame(() => 0);
  protectedGame.state.ship.shields = 40;
  const protectedResult = (protectedGame as any).maybeCatastrophicSubsystemFailure(8, 1);
  assert(!protectedResult, 'Catastrophic failure occurred while shields were still up');
  assert(Object.values(protectedGame.state.systems).every((health) => health > 0), 'Shielded hit knocked a subsystem offline');

  const floorGame = new BridgeGame(() => 0);
  (floorGame as any).damageSubsystem(500);
  assert(Object.values(floorGame.state.systems).every((health) => health > 0), 'Ordinary subsystem damage bypassed the 1% critical floor');

  const collapsedShieldGame = new BridgeGame(() => 0.03);
  collapsedShieldGame.state.ship.shields = 0;
  collapsedShieldGame.state.systems.shields = 100;
  const normalCollapsedResult = (collapsedShieldGame as any).maybeCatastrophicSubsystemFailure(8, 1);
  assert(!normalCollapsedResult, '2% catastrophic failure gate accepted a 3% roll');

  collapsedShieldGame.state.systems.shields = 0;
  const offlineGridResult = (collapsedShieldGame as any).maybeCatastrophicSubsystemFailure(8, 1);
  assert(offlineGridResult, 'Offline shield grid did not increase catastrophic failure risk to 5%');
  assert(Object.values(collapsedShieldGame.state.systems).some((health) => health === 0), 'Catastrophic failure did not take an online subsystem offline');
  assert(collapsedShieldGame.state.engineeringPuzzle?.mode === 'restoration', 'Catastrophic failure did not generate a critical restoration procedure');
  console.log('Shield-gated catastrophic subsystem failure smoke test passed.');
}

runShieldGatedCatastrophicFailureTest();

function runEngineeringPuzzlePersistenceTest() {
  const game = new BridgeGame();
  const engineering = 'engineering-persistence-human';
  game.claimRole('engineering', engineering, 'Persistence Engineer');

  game.state.systems.shields = 60;
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'shields' }), 'Could not select shields for persistence test');
  const shieldPuzzle = game.state.engineeringPuzzle!;
  assert(shieldPuzzle.mode === 'quick', 'Shield persistence puzzle was not a quick repair');
  const originalShieldPuzzleId = shieldPuzzle.id;

  // Make one valid move so we verify puzzle progress as well as puzzle identity.
  if (shieldPuzzle.type === 'breaker') {
    const first = [...(shieldPuzzle.breakers ?? [])].filter(entry => entry.tripped).sort((a,b) => a.bus-b.bus)[0];
    if (first) game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringPuzzleAction', puzzleId:shieldPuzzle.id, action:'resetBreaker', breakerId:first.id });
  }
  const shieldSignatureBefore = JSON.stringify(game.state.engineeringPuzzle);

  game.state.systems.engines = 55;
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'engines' }), 'Could not switch to engines');
  const enginePuzzleId = game.state.engineeringPuzzle?.id;
  assert(enginePuzzleId && enginePuzzleId !== originalShieldPuzzleId, 'Switching subsystem did not open a different subsystem puzzle');

  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'shields' }), 'Could not return to shields');
  assert(game.state.engineeringPuzzle?.id === originalShieldPuzzleId, 'Returning to shields generated a new puzzle instead of restoring the unfinished one');
  assert(JSON.stringify(game.state.engineeringPuzzle) === shieldSignatureBefore, 'Returning to shields did not preserve puzzle progress');

  // While the Engineer is actively solving shields, another system goes hard
  // offline. The new restoration must queue without stealing the current puzzle.
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'engineeringTestSetSystem', system:'weapons', health:0 }), 'Could not force a second subsystem offline');
  assert(game.state.repairTarget === 'shields', 'A new offline casualty stole Engineering repair focus');
  assert(game.state.engineeringPuzzle?.id === originalShieldPuzzleId, 'A new offline casualty replaced the active Engineering puzzle');

  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'weapons' }), 'Could not open queued weapons restoration');
  const weaponsPuzzleId = game.state.engineeringPuzzle?.id;
  assert(game.state.engineeringPuzzle?.mode === 'restoration', 'Queued offline subsystem did not retain a restoration procedure');
  assert(weaponsPuzzleId && weaponsPuzzleId !== originalShieldPuzzleId, 'Queued restoration reused the wrong puzzle instance');

  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'shields' }), 'Could not return to original puzzle after viewing queued restoration');
  assert(game.state.engineeringPuzzle?.id === originalShieldPuzzleId, 'Original subsystem puzzle was lost after viewing another restoration');

  // Exercise the actual catastrophic-failure path as well: a new knockout must
  // queue behind an active human diagnostic rather than auto-selecting itself.
  const combatGame = new BridgeGame(() => 0);
  const combatEngineer = 'engineering-combat-focus-human';
  combatGame.claimRole('engineering', combatEngineer, 'Combat Focus Engineer');
  combatGame.state.systems.shields = 60;
  combatGame.executeCommand({ kind:'human', sessionId:combatEngineer }, { type:'setRepairTarget', system:'shields' });
  const combatPuzzleId = combatGame.state.engineeringPuzzle!.id;
  combatGame.state.ship.shields = 0;
  assert((combatGame as any).maybeCatastrophicSubsystemFailure(12, 2), 'Could not trigger deterministic catastrophic failure during focus test');
  assert(combatGame.state.repairTarget === 'shields', 'Catastrophic failure stole active human Engineering focus');
  assert(combatGame.state.engineeringPuzzle?.id === combatPuzzleId, 'Catastrophic failure replaced the puzzle currently being solved');
  const queuedOffline = (Object.entries(combatGame.state.systems) as Array<[SystemName, number]>).find(([system, health]) => system !== 'shields' && health === 0);
  assert(queuedOffline, 'Catastrophic failure did not leave a second subsystem offline for queued restoration');
  combatGame.executeCommand({ kind:'human', sessionId:combatEngineer }, { type:'setRepairTarget', system:queuedOffline![0] });
  assert(combatGame.state.engineeringPuzzle?.mode === 'restoration', 'Queued catastrophic casualty did not retain its restoration puzzle');

  console.log('Engineering per-subsystem puzzle persistence and focus-retention smoke test passed.');
}


function runRepairCrewDeploymentTest() {
  const game = new BridgeGame();
  const engineering = 'repair-crew-human';
  game.claimRole('engineering', engineering, 'Crew Chief');
  assert(game.state.repairCrews.length === 3, 'Default repair crew count is not three');

  game.state.systems.engines = 50;
  game.executeCommand({ kind:'human', sessionId:engineering }, { type:'setRepairTarget', system:'engines' });
  const first = game.state.repairCrews[0];
  assert(game.executeCommand({ kind:'human', sessionId:engineering }, { type:'assignRepairCrew', crewId:first.id, system:'engines' }), 'Could not assign first repair crew');
  assert(first.status === 'traveling' && first.destinationSystem === 'engines', 'Repair crew did not enter transit state');
  const beforeTravel = game.state.systems.engines;
  (game as any).updateRepair(2);
  assert(game.state.systems.engines === beforeTravel, 'Repair began before crew arrived');
  (game as any).updateRepairCrews(20);
  assert(first.status === 'working' && first.system === 'engines', 'Repair crew did not arrive at assigned subsystem');
  (game as any).updateRepair(1);
  const oneCrewGain = game.state.systems.engines - beforeTravel;
  assert(oneCrewGain > 0, 'One working repair crew did not repair subsystem');

  const twoCrewGame = new BridgeGame();
  const eng2 = 'repair-crew-two-human';
  twoCrewGame.claimRole('engineering', eng2, 'Two Crew Chief');
  twoCrewGame.state.systems.engines = 50;
  for (const crew of twoCrewGame.state.repairCrews.slice(0,2)) {
    twoCrewGame.executeCommand({ kind:'human', sessionId:eng2 }, { type:'assignRepairCrew', crewId:crew.id, system:'engines' });
  }
  (twoCrewGame as any).updateRepairCrews(20);
  (twoCrewGame as any).updateRepair(1);
  const twoCrewGain = twoCrewGame.state.systems.engines - 50;
  assert(twoCrewGain > oneCrewGain * 1.5, 'Multiple repair crews did not meaningfully accelerate repair');

  const casualtyGame = new BridgeGame(() => 0);
  const casualtyEngineer = 'repair-casualty-human';
  casualtyGame.claimRole('engineering', casualtyEngineer, 'Casualty Chief');
  const exposedCrew = casualtyGame.state.repairCrews[0];
  casualtyGame.executeCommand({ kind:'human', sessionId:casualtyEngineer }, { type:'assignRepairCrew', crewId:exposedCrew.id, system:'engines' });
  (casualtyGame as any).updateRepairCrews(20);
  casualtyGame.state.ship.shields = 0;
  assert((casualtyGame as any).maybeCatastrophicSubsystemFailure(12, 2), 'Could not trigger deterministic catastrophic failure for crew casualty test');
  assert(casualtyGame.state.systems.engines === 0, 'Deterministic catastrophic failure did not hit the crewed subsystem');
  assert(exposedCrew.status === 'dead', 'Repair crew casualty roll did not remove crew during deterministic explosion');

  console.log('Repair-crew deployment, transit, scaling, and casualty smoke test passed.');
}

runRepairCrewDeploymentTest();

runEngineeringPuzzlePersistenceTest();


function runShipProfileTransitConfigTest() {
  assert(ACTIVE_SHIP_PROFILE.repairCrews.count === 3, 'Prototype ship profile should keep three repair crews');
  const standbyToEngines = repairCrewTransitSeconds(ACTIVE_SHIP_PROFILE, null, 'engines');
  const enginesToSensors = repairCrewTransitSeconds(ACTIVE_SHIP_PROFILE, 'engines', 'sensors');
  assert(Math.abs(standbyToEngines - 6.5) < 0.001, `Prototype standby-to-engines transit changed unexpectedly: ${standbyToEngines}`);
  assert(Math.abs(enginesToSensors - 10) < 0.001, `Prototype engines-to-sensors transit changed unexpectedly: ${enginesToSensors}`);

  const heavy = SHIP_PROFILES.heavyCruiserExample;
  assert(heavy.repairCrews.count === 4, 'Example heavy-cruiser profile should demonstrate configurable crew count');
  assert(repairCrewTransitSeconds(heavy, 'engines', 'sensors') === 20, 'Exact heavy-cruiser route override was not honored');
  assert(repairCrewTransitSeconds(heavy, null, 'engines') > standbyToEngines, 'Larger example ship should take longer to dispatch crew to engines');
  console.log('Ship-profile repair-crew transit configuration smoke test passed.');
}

runShipProfileTransitConfigTest();
