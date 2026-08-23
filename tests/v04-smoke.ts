import { BridgeGame } from '../src/server/game-v04.js';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const game = new BridgeGame();
const captainSession = 'captain-natural-language';
game.claimRole('captain', captainSession, 'Captain Natural');
game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'startMission' });

assert(game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Helm, hold position.' }), 'Natural-language Helm order was rejected');
game.tick(0.5);
assert(game.state.roles.find((r) => r.role === 'helm')?.captainOrder === 'hold', 'Natural-language Helm HOLD was not parsed');
assert(game.state.ship.throttle === 0, 'Natural-language Helm HOLD did not affect AI behavior');

assert(game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Tactical, weapons free; Engineering, prioritize shields.' }), 'Combined natural-language order was rejected');
assert(game.state.roles.find((r) => r.role === 'tactical')?.captainOrder === 'weaponsFree', 'Natural-language Tactical order was not parsed');
assert(game.state.roles.find((r) => r.role === 'engineering')?.captainOrder === 'shields', 'Natural-language Engineering order was not parsed');

const commsBefore = game.state.commsLog?.length ?? 0;
game.executeCommand({ kind: 'human', sessionId: captainSession }, { type: 'captainTextOrder', text: 'Status report, all stations.' });
const comms = game.state.commsLog ?? [];
assert(comms.length >= commsBefore + 4, 'Status report did not produce bridge communications');
assert(comms.some((entry) => entry.speaker === 'Lt. Vega'), 'Helm did not answer status report');
assert(comms.some((entry) => entry.speaker === 'Lt. Sato'), 'Science did not answer status report');
console.log('Natural-language Captain order and bridge communications smoke test passed.');
