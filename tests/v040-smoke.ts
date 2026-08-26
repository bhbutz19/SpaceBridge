import { BridgeGame } from '../src/server/game.js';
import { ENEMY_AI_PROFILES } from '../src/server/config/enemyProfiles.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function prepareInitialContact(random = () => .5) {
  const game = new BridgeGame(random);
  const sessions = { captain: 'alpha40-captain', communications: 'alpha40-comms', tactical: 'alpha40-tactical' };
  assert(game.claimRole('captain', sessions.captain, 'Alpha 40 Captain'), 'Captain role could not be claimed');
  assert(game.claimRole('communications', sessions.communications, 'Alpha 40 Comms'), 'Communications role could not be claimed');
  assert(game.claimRole('tactical', sessions.tactical, 'Alpha 40 Tactical'), 'Tactical role could not be claimed');
  assert(game.executeCommand({ kind:'human', sessionId:sessions.captain }, { type:'startMission' }), 'Mission could not be started');
  game.state.sensors.intelLevel = 1;
  game.state.missionStage = 'intercept';
  game.state.diplomacy.phase = 'awaiting-contact';
  game.state.diplomacy.weaponsHold = true;
  const enemy = (game as any).enemyActual;
  assert(game.executeCommand({ kind:'human', sessionId:sessions.communications }, { type:'selectCommunicationsContact', contactId:enemy.id }), 'Enemy could not be selected at Communications');
  return { game, sessions, enemy };
}

function openPlayerHail(game: BridgeGame, communications: string) {
  assert(game.executeCommand({ kind:'human', sessionId:communications }, { type:'hailContact' }), 'Authority hail could not be opened');
  const transmission = game.state.communications.transmissions.find((entry) => entry.subject === 'AUTHORITY HAIL');
  assert(transmission?.status === 'open', 'Plain-language outgoing hail did not open immediately');
  if (!transmission) throw new Error('Authority hail was not created');
  return transmission;
}

function runPlainHailAndDuplicateInterlockTest() {
  const distress = new BridgeGame(() => .4);
  const captain = 'alpha40-distress-captain';
  const communications = 'alpha40-distress-comms';
  distress.claimRole('captain', captain, 'Distress Captain');
  distress.claimRole('communications', communications, 'Distress Comms');
  distress.executeCommand({ kind:'human', sessionId:captain }, { type:'selectMission', missionId:'meridian-distress' });
  distress.executeCommand({ kind:'human', sessionId:captain }, { type:'startMission' });
  const mayday = distress.state.communications.transmissions.find((entry) => entry.sourceContactId === 'meridian');
  assert(mayday?.status === 'open' && mayday.exchange[0]?.side === 'remote', 'Plain-language distress hail incorrectly required frequency decoding');
  assert(!distress.executeCommand({ kind:'human', sessionId:communications }, { type:'hailContact' }), 'A second hail opened while Meridian already had an active channel');

  const encryptedId = (distress as any).enqueueTransmission({
    sourceContactId: 'coded-contact', sourceName: 'Coded Contact', priority: 'priority', kind: 'coded',
    subject: 'ENCRYPTED TEST', message: 'Hidden payload.', encrypted: true
  }) as number;
  assert(distress.state.communications.transmissions.find((entry) => entry.id === encryptedId)?.status === 'queued', 'Encrypted traffic bypassed the decode workflow');
  console.log('Plain-hail bypass, encrypted-decode, and duplicate-hail interlock smoke test passed.');
}

function runPriorityInitiativeTest() {
  assert(ENEMY_AI_PROFILES.kestrelSkirmisher.hailPriority === 3, 'Kestrel hail priority was not stored in its ship profile');
  assert(ENEMY_AI_PROFILES.viperHunter.hailPriority === 2 && ENEMY_AI_PROFILES.viperHunter.surpriseAttack, 'Viper initiative/surprise profile was not configured');
  const { game, enemy } = prepareInitialContact(() => .5);
  (game as any).queueHostileTransmission();
  assert(game.state.communications.transmissions.length === 0, 'Priority-three contact hailed before giving the authority vessel initiative');
  for (let elapsed = 0; elapsed < 11; elapsed += .1) game.tick(.1);
  assert(!game.state.communications.transmissions.some((entry) => entry.sourceContactId === enemy.id), 'Priority-three contact hailed before its initiative delay elapsed');
  for (let elapsed = 0; elapsed < 2; elapsed += .1) game.tick(.1);
  const incoming = game.state.communications.transmissions.find((entry) => entry.sourceContactId === enemy.id);
  assert(incoming?.status === 'open' && incoming.subject === 'HOSTILE CHALLENGE', 'Priority-three contact did not initiate its delayed readable hail');
  console.log('Profile-based NPC hail initiative smoke test passed.');
}

function runResponseToneAndPrecombatHoldTest() {
  const { game, sessions, enemy } = prepareInitialContact(() => .5);
  enemy.x = 0; enemy.y = 10; enemy.maxSpeed = 0; enemy.speed = 0;
  game.state.ship.x = 0; game.state.ship.y = 0; game.state.ship.heading = 0;
  const hail = openPlayerHail(game, sessions.communications);
  assert(hail.responses.map((entry) => entry.tone).join(',') === 'positive,neutral,hostile', 'Initial hail did not expose positive, neutral, and hostile response tones');
  assert(game.state.diplomacy.initiatedBy === 'player' && game.state.diplomacy.phase === 'channel-open', 'Player-initiated hail did not establish the diplomatic channel phase');
  assert(!game.executeCommand({ kind:'human', sessionId:sessions.communications }, { type:'hailContact' }), 'Duplicate hail bypassed the active-channel interlock');
  const integrityBefore = enemy.hull + enemy.shields;
  game.state.ship.beamCharge = 100;
  game.executeCommand({ kind:'human', sessionId:sessions.tactical }, { type:'fireBeam' });
  assert(enemy.hull + enemy.shields === integrityBefore, 'Player weapons fired before the initial conversation ended');
  assert(game.executeCommand({ kind:'human', sessionId:sessions.communications }, { type:'sendTransmissionResponse', transmissionId:hail.id, responseId:'identify' }), 'Neutral authority response failed');
  assert(game.executeCommand({ kind:'human', sessionId:sessions.communications }, { type:'closeTransmission', transmissionId:hail.id }), 'Initial channel could not be closed');
  assert(game.state.diplomacy.phase === 'combat' && !game.state.diplomacy.weaponsHold, 'Unresolved neutral exchange did not release combat after channel closure');
  game.executeCommand({ kind:'human', sessionId:sessions.tactical }, { type:'fireBeam' });
  assert(enemy.hull + enemy.shields < integrityBefore, 'Weapons remained interlocked after the conversation concluded without agreement');
  console.log('Response-tone, precombat hold, and post-conversation release smoke test passed.');
}

function runMutualCommitmentViolationTest() {
  const playerBreach = prepareInitialContact(() => .5);
  playerBreach.enemy.maxSpeed = 0;
  const playerHail = openPlayerHail(playerBreach.game, playerBreach.sessions.communications);
  playerBreach.game.executeCommand({ kind:'human', sessionId:playerBreach.sessions.communications }, { type:'sendTransmissionResponse', transmissionId:playerHail.id, responseId:'comply' });
  playerBreach.game.executeCommand({ kind:'human', sessionId:playerBreach.sessions.communications }, { type:'closeTransmission', transmissionId:playerHail.id });
  assert(playerBreach.game.state.diplomacy.playerCommitment?.status === 'active' && playerBreach.game.state.diplomacy.phase === 'agreement', 'Positive response did not create a tracked player commitment');
  for (let elapsed = 0; elapsed < 19; elapsed += .1) playerBreach.game.tick(.1);
  assert(playerBreach.game.state.diplomacy.playerCommitment?.status === 'breached' && playerBreach.game.state.diplomacy.phase === 'combat', 'Failure to withdraw did not make the contact hostile');

  const contactBreach = prepareInitialContact(() => .95);
  contactBreach.enemy.x = 0; contactBreach.enemy.y = 10; contactBreach.enemy.heading = 180; contactBreach.enemy.maxSpeed = .82;
  contactBreach.game.state.ship.x = 0; contactBreach.game.state.ship.y = 0;
  const contactHail = openPlayerHail(contactBreach.game, contactBreach.sessions.communications);
  contactBreach.game.executeCommand({ kind:'human', sessionId:contactBreach.sessions.communications }, { type:'sendTransmissionResponse', transmissionId:contactHail.id, responseId:'stand-down' });
  contactBreach.game.executeCommand({ kind:'human', sessionId:contactBreach.sessions.communications }, { type:'closeTransmission', transmissionId:contactHail.id });
  assert(contactBreach.game.state.diplomacy.contactCommitment?.status === 'active', 'Hostile order did not create a tracked contact commitment');
  for (let elapsed = 0; elapsed < 12 && contactBreach.game.state.diplomacy.phase !== 'combat'; elapsed += .1) contactBreach.game.tick(.1);
  assert(contactBreach.game.state.diplomacy.contactCommitment?.status === 'breached' && contactBreach.game.state.diplomacy.phase === 'combat', 'Contact movement did not violate its hold-position promise');
  assert(contactBreach.game.state.communications.transmissions.some((entry) => entry.subject === 'CONTACT COMMITMENT VIOLATED'), 'Contact violation did not alert Communications');
  console.log('Mutual commitment monitoring and violation escalation smoke test passed.');
}

runPlainHailAndDuplicateInterlockTest();
runPriorityInitiativeTest();
runResponseToneAndPrecombatHoldTest();
runMutualCommitmentViolationTest();
