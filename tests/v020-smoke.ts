import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runDistressTrafficWorkflowTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-comms-alpha20';
  const comms = 'comms-alpha20';
  game.claimRole('captain', captain, 'Captain Signal');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'selectMission', missionId:'meridian-distress' });
  game.claimRole('communications', comms, 'Comms Signal');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });

  const traffic = game.state.communications.transmissions.find((entry) => entry.sourceContactId === 'meridian');
  assert(traffic, 'Meridian distress traffic was not queued');
  if (!traffic) throw new Error('Meridian distress traffic was not queued');
  assert(traffic.status === 'queued', 'Distress traffic did not begin as queued carrier traffic');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'selectTransmission',transmissionId:traffic.id}), 'Comms could not select distress traffic');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'setCommsTuner',value:traffic.frequency}), 'Comms tuner rejected carrier setting');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'setCommsFilter',value:traffic.filterTarget}), 'Comms filter rejected diagnostic setting');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'verifyCommsSignal'}), 'Correct carrier/filter alignment did not open the channel');
  assert(traffic.status === 'open', 'Distress traffic did not become an open channel');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'sendTransmissionResponse',transmissionId:traffic.id,responseId:'acknowledge'}), 'Structured distress response failed');
  assert(game.state.missionStage === 'rendezvous', 'Acknowledging distress did not advance Meridian mission');
  assert(traffic.status === 'resolved', 'Transmission did not remain logged as resolved');
  console.log('Communications queue, tuning, and structured distress-response smoke test passed.');
}

function runHostileElectronicWarfareTest() {
  const game = new BridgeGame(() => 0.42);
  const captain = 'captain-ew-alpha20';
  const science = 'science-ew-alpha20';
  const comms = 'comms-ew-alpha20';
  game.claimRole('captain', captain, 'Captain EW');
  game.claimRole('science', science, 'Science EW');
  game.claimRole('communications', comms, 'Comms EW');
  game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  game.executeCommand({ kind:'human', sessionId:science }, { type:'scanTarget' });
  for (let i=0;i<16;i++) game.tick(.25);

  const enemy = (game as any).enemyActual as {id:string};
  assert(game.state.sensors.intelLevel >= 1, 'Science did not identify hostile for Communications test');
  const hostileTraffic = game.state.communications.transmissions.find((entry) => entry.sourceContactId === enemy.id && entry.priority === 'hostile');
  assert(hostileTraffic, 'Hostile identification did not create priority Communications traffic');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'selectCommunicationsContact',contactId:enemy.id}), 'Comms could not select identified hostile');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'startCommsIntercept',contactId:enemy.id}), 'Comms could not begin hostile intercept');
  for (let i=0;i<34;i++) game.tick(.25);
  assert(game.state.communications.electronicWarfare.interceptIntel, 'Hostile intercept did not resolve intelligence');
  assert(game.state.communications.transmissions.some((entry) => entry.kind === 'intercept' && entry.status === 'open'), 'Decoded intercept was not added to traffic queue');
  assert(game.executeCommand({kind:'human',sessionId:comms},{type:'toggleCommsJamming',contactId:enemy.id}), 'Comms could not begin jamming identified hostile');
  game.tick(.1);
  assert(game.state.communications.electronicWarfare.jammingActive, 'Jamming did not remain active');
  assert(game.state.communications.electronicWarfare.jammingStrength > 0, 'Jamming strength was not derived from operational communications system');
  console.log('Communications hostile interception and jamming smoke test passed.');
}

runDistressTrafficWorkflowTest();
runHostileElectronicWarfareTest();
