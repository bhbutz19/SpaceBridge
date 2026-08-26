import { BridgeGame } from '../src/server/game.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function runTrafficClassificationTest() {
  const game = new BridgeGame(() => .45);
  const enqueue = (input: Record<string, unknown>) => (game as any).enqueueTransmission(input) as number;
  const hostileId = enqueue({
    sourceContactId: (game as any).enemyActual.id,
    sourceName: 'Hostile Intercept',
    priority: 'priority',
    kind: 'intercept',
    subject: 'HOSTILE CLASS TEST',
    message: 'Enemy tactical traffic.'
  });
  const friendlyId = enqueue({
    sourceContactId: 'meridian',
    sourceName: 'CSV Meridian',
    priority: 'urgent',
    kind: 'distress',
    subject: 'FRIENDLY CLASS TEST',
    message: 'Friendly distress traffic.'
  });
  const internalId = enqueue({
    sourceContactId: null,
    sourceName: 'Tactical Data Link',
    priority: 'priority',
    kind: 'tactical',
    subject: 'INTERNAL CLASS TEST',
    message: 'Firing solution ready.'
  });
  const neutralId = enqueue({
    sourceContactId: 'relay-beacon',
    sourceName: 'Relay Beacon',
    priority: 'routine',
    kind: 'coded',
    subject: 'NEUTRAL CLASS TEST',
    message: 'Navigation beacon traffic.'
  });
  const byId = (id: number) => game.state.communications.transmissions.find((entry) => entry.id === id);
  assert(byId(hostileId)?.trafficClass === 'hostile', 'Enemy intercept traffic was not classified hostile/red');
  assert(byId(friendlyId)?.trafficClass === 'friendly', 'Known friendly traffic was not classified friendly/green');
  assert(byId(internalId)?.trafficClass === 'internal', 'Internal tactical traffic was not classified internal/yellow');
  assert(byId(neutralId)?.trafficClass === 'neutral', 'Unaligned external traffic was not classified neutral/blue');
  console.log('Communications traffic classification smoke test passed.');
}

function runHailDecodeSeparationTest() {
  const game = new BridgeGame(() => .5);
  const inboundId = (game as any).enqueueTransmission({
    sourceContactId: 'neutral-contact',
    sourceName: 'Inbound Contact',
    priority: 'routine',
    kind: 'hail',
    subject: 'INBOUND CARRIER',
    message: 'Incoming message awaiting acquisition.'
  }) as number;
  const outboundId = (game as any).enqueueTransmission({
    sourceContactId: 'neutral-contact-2',
    sourceName: 'Outbound Contact',
    priority: 'routine',
    kind: 'hail',
    subject: 'OUTGOING CHANNEL',
    message: 'Remote acknowledgement.',
    open: true,
    localOpening: 'USS Prototype calling.'
  }) as number;
  const codedId = (game as any).enqueueTransmission({
    sourceContactId: 'coded-contact',
    sourceName: 'Coded Contact',
    priority: 'priority',
    kind: 'coded',
    subject: 'CODED CARRIER',
    message: 'Encrypted payload.',
    encrypted: true
  }) as number;
  const inbound = game.state.communications.transmissions.find((entry) => entry.id === inboundId);
  const outbound = game.state.communications.transmissions.find((entry) => entry.id === outboundId);
  const coded = game.state.communications.transmissions.find((entry) => entry.id === codedId);
  assert(inbound?.status === 'open' && inbound.exchange[0]?.side === 'remote', 'Plain incoming hail did not bypass decoding');
  assert(outbound?.status === 'open' && outbound.exchange[0]?.side === 'local', 'Outgoing hail did not retain its local-opening workflow marker');
  assert(coded?.status === 'queued' && coded.exchange.length === 0, 'Coded traffic did not retain the decode workflow');
  console.log('Readable hail and coded-decode workflow separation smoke test passed.');
}

runTrafficClassificationTest();
runHailDecodeSeparationTest();
