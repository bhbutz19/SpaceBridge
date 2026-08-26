import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runViewscreenChannelHandoffTest() {
  const game = new BridgeGame(() => .42);
  const captain = 'alpha38-captain';
  const communications = 'alpha38-communications';
  assert(game.claimRole('captain', captain, 'Captain Handoff'), 'Captain role could not be claimed');
  assert(game.claimRole('communications', communications, 'Comms Handoff'), 'Communications role could not be claimed');
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'selectMission', missionId:'meridian-distress' }), 'Meridian mission could not be selected');
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'setViewscreenMode', mode:'tactical' }), 'Captain could not establish the pre-hail tactical view');
  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' }), 'Mission could not be started');

  const traffic = game.state.communications.transmissions.find((entry) => entry.sourceContactId === 'meridian');
  assert(traffic, 'Meridian distress transmission was not queued');
  if (!traffic) throw new Error('Meridian distress transmission was not queued');
  assert(traffic.status === 'open', 'Plain-language Meridian hail did not open directly');
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'selectTransmission', transmissionId:traffic.id }), 'Communications could not select the distress transmission');
  assert(game.state.viewscreenMode === 'communications', 'Opening a visual channel did not auto-tune the main viewscreen');
  assert(game.state.communications.viewscreenReturnMode === 'tactical', 'The pre-hail viewscreen mode was not retained');
  assert(game.state.communications.viewscreenChannelTransmissionId === traffic.id, 'The visual channel was not bound to the opened transmission');
  assert(traffic.exchange.length === 1 && traffic.exchange[0].side === 'remote', 'The remote opening call was not recorded in the channel exchange');

  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'sendTransmissionResponse', transmissionId:traffic.id, responseId:'acknowledge' }), 'Communications could not send the structured response');
  assert(traffic.status === 'open', 'Sending a response closed the channel before Communications chose to close it');
  assert(traffic.responses.length === 0, 'A transmitted response remained actionable');
  assert(traffic.exchange.slice(-2).map((line) => line.side).join(',') === 'local,remote', 'The viewscreen exchange did not retain both our response and the remote reply');
  assert(game.state.viewscreenMode === 'communications', 'The viewscreen left the conversation before the channel was closed');

  assert(game.executeCommand({ kind:'human', sessionId:captain }, { type:'setViewscreenMode', mode:'aft' }), 'Captain could not choose a post-hail return view');
  assert(game.state.viewscreenMode === 'communications', 'Captain selection bypassed the live visual-channel takeover');
  assert(game.state.communications.viewscreenReturnMode === 'aft', 'Captain selection did not update the queued return view');
  assert(!game.executeCommand({ kind:'human', sessionId:captain }, { type:'closeTransmission', transmissionId:traffic.id }), 'Captain bypassed Communications channel-close authority');
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'closeTransmission', transmissionId:traffic.id }), 'Communications could not close the channel');
  assert(traffic.status === 'resolved', 'Closed channel was not logged as resolved');
  assert(game.state.viewscreenMode === 'aft', 'Closing the channel did not restore the retained viewscreen mode');
  assert(game.state.communications.viewscreenChannelTransmissionId === null && game.state.communications.viewscreenReturnMode === null, 'Temporary viewscreen channel state was not cleared');
  console.log('Communications-controlled viewscreen handoff and two-sided exchange smoke test passed.');
}

function runNonVisualTrafficIsolationTest() {
  const game = new BridgeGame(() => .5);
  game.state.viewscreenMode = 'mission';
  const id = (game as any).enqueueTransmission({
    sourceContactId: 'enemy-1', sourceName: 'Intercept Source', priority: 'hostile', kind: 'intercept',
    subject: 'DECODED TRAFFIC', message: 'Non-visual tactical carrier.', open: true, responses: []
  }) as number;
  assert(game.state.viewscreenMode === 'mission', 'A non-visual intercept incorrectly took over the main viewscreen');
  assert(game.state.communications.viewscreenChannelTransmissionId === null, 'A non-visual intercept was tracked as a captain video channel');
  assert(game.state.communications.transmissions.find((entry) => entry.id === id)?.exchange[0]?.side === 'remote', 'Open non-visual traffic did not retain its decoded message');
  console.log('Non-visual Communications traffic isolation smoke test passed.');
}

runViewscreenChannelHandoffTest();
runNonVisualTrafficIsolationTest();
