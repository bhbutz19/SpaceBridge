import { BridgeGame as BaseBridgeGame } from './game.js';
import type { BridgeCommsEntry, CrewOrder, GameSnapshot, OperationalRole, Role, StationCommand } from '../shared/protocol.js';

const AI_OFFICERS: Record<Role, string> = {
  captain: 'Cmdr. Hale',
  helm: 'Lt. Vega',
  tactical: 'Lt. Rook',
  engineering: 'Lt. Chen',
  science: 'Lt. Sato'
};

type Actor = { kind: 'human'; sessionId: string } | { kind: 'ai'; role: Role };

const label = (order: CrewOrder) => order.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export class BridgeGame extends BaseBridgeGame {
  private commsSequence = 0;
  private shieldWarningIssued = false;
  private hullWarningIssued = false;

  constructor() {
    super();
    this.state.commsLog = [];
    this.comms('computer', 'Bridge Computer', 'Crew network online. AI officers standing by for Captain orders.', 'system');
  }

  override executeCommand(actor: Actor, command: StationCommand): boolean {
    if (command.type === 'captainTextOrder') {
      if (actor.kind !== 'human' || this.roleFor(actor.sessionId) !== 'captain') return false;
      return this.handleCaptainTextOrder(actor.sessionId, command.text);
    }

    const beforeStatus = this.state.missionStatus;
    const accepted = super.executeCommand(actor as never, command as never);
    if (!accepted) return false;

    if (command.type === 'issueOrder') this.acknowledgeOrder(command.role, command.order);
    if (command.type === 'startMission' && beforeStatus === 'briefing' && this.state.missionStatus === 'running') {
      this.comms('science', AI_OFFICERS.science, 'Beginning long-range sensor sweep. I will identify the contact before Tactical engages.', 'report');
      this.comms('helm', AI_OFFICERS.helm, 'Helm standing by. Approaching sensor range.', 'ack');
    }
    if (command.type === 'resetMission') {
      this.state.commsLog = [];
      this.commsSequence = 0;
      this.shieldWarningIssued = false;
      this.hullWarningIssued = false;
      this.comms('computer', 'Bridge Computer', 'Mission reset complete. Crew retained at assigned stations.', 'system');
    }
    return true;
  }

  override tick(dt: number) {
    const before = {
      intel: this.state.sensors.intelLevel,
      stage: this.state.missionStage,
      status: this.state.missionStatus,
      shields: this.state.ship.shields,
      hull: this.state.ship.hull,
      enemyAlive: this.state.enemy.alive,
      encounter: this.state.encounter
    };

    super.tick(dt);
    if (!this.state.commsLog) this.state.commsLog = [];

    if (before.intel < 1 && this.state.sensors.intelLevel >= 1) {
      this.comms('science', AI_OFFICERS.science, `Contact identified: ${this.state.enemy.name}, ${this.state.sensors.contactClass}. Weapons signature: ${this.state.sensors.weaponsEstimate}.`, 'report');
    }
    if (before.intel < 2 && this.state.sensors.intelLevel >= 2) {
      this.comms('science', AI_OFFICERS.science, `Full tactical profile complete. Shields ${this.state.sensors.shieldEstimate}, hull ${this.state.sensors.hullEstimate}.`, 'report');
    }
    if (before.stage !== 'combat' && this.state.missionStage === 'combat') {
      this.comms('tactical', AI_OFFICERS.tactical, 'Target entering effective weapons range. Firing solution available.', 'report');
    }
    if (before.enemyAlive && !this.state.enemy.alive && this.state.missionStage === 'reinforcement') {
      this.comms('tactical', AI_OFFICERS.tactical, 'First hostile destroyed.', 'report');
      this.comms('science', AI_OFFICERS.science, 'Captain, I have another contact inbound on long-range sensors.', 'warning');
    }
    if (before.encounter === 1 && this.state.encounter === 2) {
      this.comms('science', AI_OFFICERS.science, 'Second contact acquired. Beginning identification sweep.', 'warning');
    }
    if (before.status !== 'victory' && this.state.missionStatus === 'victory') {
      this.comms('tactical', AI_OFFICERS.tactical, 'All hostile contacts neutralized.', 'report');
      this.comms('science', AI_OFFICERS.science, 'No additional contacts on sensors. Relay lane is clear.', 'report');
    }
    if (before.status !== 'defeat' && this.state.missionStatus === 'defeat') {
      this.comms('computer', 'Bridge Computer', 'Critical hull failure. Mission terminated.', 'warning');
    }
    if (this.state.ship.shields < 50 && before.shields >= 50 && !this.shieldWarningIssued) {
      this.shieldWarningIssued = true;
      this.comms('engineering', AI_OFFICERS.engineering, `Shield strength below fifty percent. Current shields ${Math.round(this.state.ship.shields)} percent.`, 'warning');
    }
    if (this.state.ship.hull < 75 && before.hull >= 75 && !this.hullWarningIssued) {
      this.hullWarningIssued = true;
      this.comms('engineering', AI_OFFICERS.engineering, `Hull integrity is down to ${Math.round(this.state.ship.hull)} percent. Recommend defensive power.`, 'warning');
    }
  }

  private handleCaptainTextOrder(sessionId: string, rawText: string): boolean {
    const text = rawText.trim().slice(0, 220);
    if (!text) return false;
    const captainName = this.state.roles.find((r) => r.role === 'captain')?.playerName ?? 'Captain';
    this.comms('captain', captainName, text, 'captain');

    if (/\b(status|sitrep|report)\b/i.test(text)) {
      this.sendStatusReport();
      return true;
    }

    const parsed = this.parseCaptainOrders(text);
    if (!parsed.length) {
      this.comms('computer', 'Bridge Computer', 'Order not understood. Try naming a station and action, such as “Helm, intercept”, “Tactical, hold fire”, “Engineering, shields”, or “Science, scan”.', 'system');
      return true;
    }

    let accepted = false;
    for (const item of parsed) {
      accepted = this.executeCommand({ kind: 'human', sessionId }, { type: 'issueOrder', role: item.role, order: item.order }) || accepted;
    }
    return accepted;
  }

  private parseCaptainOrders(text: string): Array<{ role: OperationalRole; order: CrewOrder }> {
    const lower = text.toLowerCase();
    const results: Array<{ role: OperationalRole; order: CrewOrder }> = [];
    const add = (role: OperationalRole, order: CrewOrder | null) => {
      if (order && !results.some((item) => item.role === role)) results.push({ role, order });
    };
    const segments = lower.split(/[;.]+|\band\s+(?=(?:helm|navigation|pilot|tactical|gunnery|engineering|engineer|science|sensor|scanner)\b)/).map((s) => s.trim()).filter(Boolean);
    const segmentFor = (re: RegExp) => segments.find((segment) => re.test(segment)) ?? lower;

    const helm = /\b(helm|navigation|pilot)\b/;
    const tactical = /\b(tactical|weapons?|gunnery)\b/;
    const engineering = /\b(engineering|engineer|power)\b/;
    const science = /\b(science|sensors?|scanner)\b/;
    const parseHelm = (s: string): CrewOrder | null => /\b(evade|evasive|withdraw|retreat|back off|open range)\b/.test(s) ? 'evade' : /\b(hold position|hold course|stop|all stop|maintain position)\b/.test(s) ? 'hold' : /\b(intercept|close|pursue|approach|chase|engage course)\b/.test(s) ? 'intercept' : /\b(auto|automatic|standard)\b/.test(s) ? 'auto' : null;
    const parseTactical = (s: string): CrewOrder | null => /\b(hold fire|cease fire|weapons hold|do not fire|don't fire)\b/.test(s) ? 'holdFire' : /\b(weapons free|open fire|fire at will|engage|attack)\b/.test(s) ? 'weaponsFree' : /\b(auto|automatic|standard)\b/.test(s) ? 'auto' : null;
    const parseEngineering = (s: string): CrewOrder | null => /\b(shields?|defen[cs]e|defensive)\b/.test(s) ? 'shields' : /\b(weapons?|weapon power|capacitors?)\b/.test(s) ? 'weapons' : /\b(engines?|engine power|speed|propulsion)\b/.test(s) ? 'engines' : /\b(balance|balanced|even power|normal power)\b/.test(s) ? 'balanced' : /\b(auto|automatic|standard)\b/.test(s) ? 'auto' : null;
    const parseScience = (s: string): CrewOrder | null => /\b(passive|passive sensors|silent sensors)\b/.test(s) ? 'passive' : /\b(scan|analy[sz]e|identify|resolve|active sensors?)\b/.test(s) ? 'scan' : /\b(auto|automatic|standard)\b/.test(s) ? 'auto' : null;

    if (helm.test(lower)) add('helm', parseHelm(segmentFor(helm)));
    if (tactical.test(lower)) add('tactical', parseTactical(segmentFor(tactical)));
    if (engineering.test(lower)) add('engineering', parseEngineering(segmentFor(engineering)));
    if (science.test(lower)) add('science', parseScience(segmentFor(science)));

    if (!results.length) {
      if (/\b(hold position|all stop|intercept|pursue|evade|evasive|withdraw|retreat)\b/.test(lower)) add('helm', parseHelm(lower));
      else if (/\b(hold fire|cease fire|weapons free|open fire|fire at will)\b/.test(lower)) add('tactical', parseTactical(lower));
      else if (/\b(full power to shields|prioritize shields|power to engines|power to weapons|balanced power)\b/.test(lower)) add('engineering', parseEngineering(lower));
      else if (/\b(scan the|scan target|identify contact|active scan)\b/.test(lower)) add('science', parseScience(lower));
    }
    return results;
  }

  private sendStatusReport() {
    const range = Math.hypot(this.state.ship.x - this.state.enemy.x, this.state.ship.y - this.state.enemy.y);
    this.comms('helm', AI_OFFICERS.helm, `Range ${range.toFixed(1)} kilometers. Heading ${Math.round(this.state.ship.heading).toString().padStart(3, '0')}. Throttle ${Math.round(this.state.ship.throttle)} percent.`, 'report');
    this.comms('tactical', AI_OFFICERS.tactical, `${this.state.sensors.intelLevel >= 1 ? `Tracking ${this.state.enemy.name}` : 'No verified target identification'}. Beam charge ${Math.round(this.state.ship.beamCharge)} percent, ${this.state.ship.torpedoes} torpedoes remaining.`, 'report');
    this.comms('engineering', AI_OFFICERS.engineering, `Shields ${Math.round(this.state.ship.shields)} percent, hull ${Math.round(this.state.ship.hull)} percent. Power distribution engines ${Math.round(this.state.ship.enginePower)}, shields ${Math.round(this.state.ship.shieldPower)}, weapons ${Math.round(this.state.ship.weaponPower)}.`, 'report');
    this.comms('science', AI_OFFICERS.science, `Sensor resolution ${Math.round(this.state.sensors.scanProgress)} percent. ${this.state.sensors.intelLevel >= 1 ? `${this.state.sensors.contactClass} identified.` : 'Contact remains unresolved.'}`, 'report');
  }

  private acknowledgeOrder(role: OperationalRole, order: CrewOrder) {
    const slot = this.state.roles.find((r) => r.role === role);
    if (!slot) return;
    if (slot.controller === 'human') {
      this.comms('computer', 'Bridge Computer', `Order relayed to ${slot.playerName ?? role.toUpperCase()} at ${role.toUpperCase()}.`, 'system');
      return;
    }
    const messages: Record<OperationalRole, Partial<Record<CrewOrder, string>>> = {
      helm: { auto: 'Aye, Captain. Returning to standard helm profile.', intercept: 'Aye, Captain. Intercept course laid in.', hold: 'Aye, Captain. Holding position.', evade: 'Aye, Captain. Beginning evasive withdrawal.' },
      tactical: { auto: 'Aye, Captain. Tactical returning to standard engagement rules.', weaponsFree: 'Weapons free. I will engage when I have a firing solution.', holdFire: 'Holding fire, Captain.' },
      engineering: { auto: 'Aye, Captain. Returning power management to automatic.', balanced: 'Power distribution balanced.', shields: 'Routing priority power to shields.', weapons: 'Prioritizing weapon capacitors.', engines: 'Prioritizing engine power.' },
      science: { auto: 'Aye, Captain. Standard sensor doctrine resumed.', scan: 'Beginning active scan, Captain.', passive: 'Switching to passive sensors.' }
    };
    this.comms(role, slot.aiOfficerName, messages[role][order] ?? `${label(order)} order acknowledged.`, 'ack');
  }

  private comms(role: Role | 'computer', speaker: string, message: string, tone: BridgeCommsEntry['tone']) {
    if (!this.state.commsLog) this.state.commsLog = [];
    this.state.commsLog.unshift({ id: ++this.commsSequence, speaker, role, message, tone });
    this.state.commsLog = this.state.commsLog.slice(0, 30);
  }

  override safeSnapshot(): GameSnapshot {
    const snapshot = super.safeSnapshot();
    snapshot.commsLog = structuredClone(this.state.commsLog ?? []);
    return snapshot;
  }
}
