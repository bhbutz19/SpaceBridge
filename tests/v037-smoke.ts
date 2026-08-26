import { BridgeGame } from '../src/server/game.js';
import type { CommsTransmissionState, ViewscreenMode } from '../src/shared/protocol.js';
import { captainPortraitForTransmission } from '../src/shared/viewscreenPresentation.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runCaptainViewscreenAuthorityTest() {
  const game = new BridgeGame(() => .5);
  assert(game.state.viewscreenMode === 'forward', 'Main viewscreen did not default to the forward camera');
  assert(game.claimRole('captain', 'alpha37-captain', 'Alpha 37 Captain'), 'Captain role could not be claimed');
  assert(game.claimRole('helm', 'alpha37-helm', 'Alpha 37 Helm'), 'Helm role could not be claimed');
  const modes: ViewscreenMode[] = ['forward', 'aft', 'tactical', 'mission', 'communications'];
  for (const mode of modes) {
    assert(game.executeCommand({ kind: 'human', sessionId: 'alpha37-captain' }, { type: 'setViewscreenMode', mode }), `Captain could not select ${mode} viewscreen mode`);
    assert(game.safeSnapshot().viewscreenMode === mode, `${mode} viewscreen selection was not shared in the public snapshot`);
  }
  assert(!game.executeCommand({ kind: 'human', sessionId: 'alpha37-helm' }, { type: 'setViewscreenMode', mode: 'aft' }), 'Helm bypassed Captain viewscreen authority');
  assert(!game.executeCommand({ kind: 'human', sessionId: 'alpha37-captain' }, { type: 'setViewscreenMode', mode: 'invalid' as ViewscreenMode }), 'Invalid viewscreen mode was accepted');
  console.log('Captain-authorized shared viewscreen rotation smoke test passed.');
}

function transmission(overrides: Partial<CommsTransmissionState>): CommsTransmissionState {
  return {
    id: 1, sourceContactId: null, sourceName: 'Signal', priority: 'routine', trafficClass: 'neutral', kind: 'hail', subject: 'Test',
    status: 'open', encrypted: false, frequency: 50, tuner: 50, filterTarget: 50, filter: 50, signalQuality: 100,
    message: 'Test transmission', responses: [], exchange: [], ...overrides
  };
}

function runCaptainPortraitRoutingTest() {
  const enemy = new BridgeGame(() => .5).safeSnapshot().enemy;
  assert(captainPortraitForTransmission(transmission({ sourceContactId: 'meridian', kind: 'distress' }), enemy) === 'meridian', 'Meridian distress channel did not select the civilian captain');
  enemy.wave = 1;
  assert(captainPortraitForTransmission(transmission({ sourceContactId: enemy.id }), enemy) === 'kestrel', 'Wave-one hail did not select the Kestrel commander');
  enemy.wave = 2;
  assert(captainPortraitForTransmission(transmission({ sourceContactId: enemy.id }), enemy) === 'viper', 'Wave-two hail did not select the Viper commander');
  assert(captainPortraitForTransmission(transmission({ sourceContactId: enemy.id, kind: 'intercept' }), enemy) === null, 'Intercepted traffic incorrectly presented itself as a live captain video channel');
  assert(captainPortraitForTransmission(null, enemy) === null, 'Standby communications selected a captain portrait');
  console.log('Ship-to-ship captain portrait routing smoke test passed.');
}

runCaptainViewscreenAuthorityTest();
runCaptainPortraitRoutingTest();
