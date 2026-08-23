import type {
  CrewOrder,
  GameSnapshot,
  OperationalRole,
  Role,
  RoleAssignment,
  StationCommand
} from '../shared/protocol.js';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;

const AI_OFFICERS: Record<Role, string> = {
  captain: 'Cmdr. Hale',
  helm: 'Lt. Vega',
  tactical: 'Lt. Rook',
  engineering: 'Lt. Chen',
  science: 'Lt. Sato'
};

const ALLOWED_ORDERS: Record<OperationalRole, CrewOrder[]> = {
  helm: ['auto', 'intercept', 'hold', 'evade'],
  tactical: ['auto', 'weaponsFree', 'holdFire'],
  engineering: ['auto', 'balanced', 'shields', 'weapons', 'engines'],
  science: ['auto', 'scan', 'passive']
};

type CommandActor =
  | { kind: 'human'; sessionId: string }
  | { kind: 'ai'; role: Role };

type InternalEnemy = {
  id: string;
  trueName: string;
  className: string;
  weapons: string;
  x: number;
  y: number;
  hull: number;
  shields: number;
  alive: boolean;
  wave: number;
};

const roleForCommand = (command: StationCommand): Role => {
  switch (command.type) {
    case 'startMission':
    case 'resetMission':
    case 'issueOrder':
      return 'captain';
    case 'setHeading':
    case 'setThrottle':
      return 'helm';
    case 'setPower':
      return 'engineering';
    case 'fireBeam':
    case 'fireTorpedo':
      return 'tactical';
    case 'scanTarget':
      return 'science';
  }
};

const roleOrderLabel = (order: CrewOrder) => order
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (c) => c.toUpperCase());

export class BridgeGame {
  state: GameSnapshot;

  private enemyActual: InternalEnemy;
  private enemyFireCooldown = 4;
  private aiDecisionAccumulator = 0;
  private aiBeamCooldown = 0;
  private aiTorpedoCooldown = 1.5;
  private aiEngineeringCooldown = 0;
  private reinforcementTimer = 0;
  private scanIdentityLogged = false;
  private scanCompleteLogged = false;

  constructor() {
    this.enemyActual = this.enemyForWave(1);
    this.state = this.createInitialState();
    this.syncEnemyPublicState();
  }

  private createInitialState(): GameSnapshot {
    return {
      serverTime: Date.now(),
      missionStatus: 'briefing',
      missionStage: 'briefing',
      missionTitle: 'Signal in the Dark',
      currentObjective: 'Await captain authorization to begin the mission.',
      encounter: 1,
      ship: {
        heading: 0,
        requestedHeading: 0,
        throttle: 0,
        speed: 0,
        hull: 100,
        shields: 100,
        shieldPower: 34,
        enginePower: 33,
        weaponPower: 33,
        beamCharge: 100,
        torpedoes: 10,
        x: 0,
        y: 0
      },
      enemy: {
        id: this.enemyActual.id,
        name: 'Unknown Contact',
        x: this.enemyActual.x,
        y: this.enemyActual.y,
        hull: null,
        shields: null,
        alive: this.enemyActual.alive,
        wave: this.enemyActual.wave
      },
      sensors: {
        scanActive: false,
        scanProgress: 0,
        intelLevel: 0,
        contactClass: 'Unknown',
        weaponsEstimate: 'Unknown',
        shieldEstimate: 'Unknown',
        hullEstimate: 'Unknown'
      },
      roles: (['captain', 'helm', 'tactical', 'engineering', 'science'] as Role[]).map((role) => ({
        role,
        sessionId: null,
        playerName: null,
        controller: 'ai',
        aiOfficerName: AI_OFFICERS[role],
        status: role === 'captain' ? 'Awaiting human captain' : 'Standing by',
        captainOrder: role === 'captain' ? null : 'auto'
      })),
      eventLog: [
        'AI crew online. Empty operational stations will be covered automatically.',
        'Mission loaded: Signal in the Dark. Awaiting captain.'
      ]
    };
  }

  claimRole(role: Role, sessionId: string, playerName: string): boolean {
    const slot = this.roleSlot(role);
    if (!slot || slot.sessionId) return false;

    const cleanName = playerName.trim().slice(0, 24) || 'Officer';
    slot.sessionId = sessionId;
    slot.playerName = cleanName;
    slot.controller = 'human';
    slot.status = 'Human control';
    this.log(`${cleanName} assumed ${role.toUpperCase()}; ${slot.aiOfficerName} standing by.`);
    return true;
  }

  releaseRole(sessionId: string) {
    const slot = this.state.roles.find((r) => r.sessionId === sessionId);
    if (!slot) return;
    const name = slot.playerName ?? 'Officer';
    slot.sessionId = null;
    slot.playerName = null;
    slot.controller = 'ai';
    slot.status = slot.role === 'captain' ? 'Awaiting human captain' : 'Resuming station duties';
    this.log(`${name} left ${slot.role.toUpperCase()}; ${slot.aiOfficerName} resumed the station.`);
  }

  roleFor(sessionId: string): Role | null {
    return this.state.roles.find((r) => r.sessionId === sessionId)?.role ?? null;
  }

  executeCommand(actor: CommandActor, command: StationCommand): boolean {
    const requiredRole = roleForCommand(command);
    const actorRole = this.resolveActorRole(actor);
    if (actorRole !== requiredRole) return false;

    const slot = this.roleSlot(requiredRole);
    if (!slot) return false;
    if (actor.kind === 'ai' && slot.sessionId !== null) return false;
    if (actor.kind === 'human' && slot.sessionId !== actor.sessionId) return false;

    switch (command.type) {
      case 'startMission':
        this.startMission();
        break;
      case 'resetMission':
        this.resetMission();
        break;
      case 'issueOrder':
        return this.issueOrder(command.role, command.order);
      case 'setHeading':
        if (!Number.isFinite(command.heading)) return false;
        this.setHeading(command.heading);
        break;
      case 'setThrottle':
        if (!Number.isFinite(command.throttle)) return false;
        this.setThrottle(command.throttle);
        break;
      case 'setPower':
        if (!Number.isFinite(command.value)) return false;
        this.setPower(command.system, command.value);
        break;
      case 'fireBeam':
        this.fireBeam();
        break;
      case 'fireTorpedo':
        this.fireTorpedo();
        break;
      case 'scanTarget':
        this.startScan();
        break;
    }
    return true;
  }

  tick(dt: number) {
    this.state.serverTime = Date.now();
    this.aiBeamCooldown = Math.max(0, this.aiBeamCooldown - dt);
    this.aiTorpedoCooldown = Math.max(0, this.aiTorpedoCooldown - dt);
    this.aiEngineeringCooldown = Math.max(0, this.aiEngineeringCooldown - dt);

    if (this.state.missionStatus !== 'running') {
      this.syncEnemyPublicState();
      return;
    }

    if (this.state.missionStage === 'reinforcement') {
      this.reinforcementTimer -= dt;
      if (this.reinforcementTimer <= 0) {
        this.spawnWave(2);
        this.log('SCIENCE: New contact detected on an attack vector. Identification required.');
      }
      this.syncEnemyPublicState();
      return;
    }

    this.aiDecisionAccumulator += dt;
    if (this.aiDecisionAccumulator >= 0.25) {
      this.aiDecisionAccumulator = 0;
      this.runAiCrew();
    }

    this.updateScan(dt);
    this.updateShipMovement(dt);
    this.updateMissionStageByRange();
    this.enemyBehavior(dt);
    this.resolveEncounterEnd();
    this.syncEnemyPublicState();
  }

  private runAiCrew() {
    this.runAiScience();
    this.runAiHelm();
    this.runAiEngineering();
    this.runAiTactical();
  }

  private runAiScience() {
    if (!this.isAiControlled('science') || !this.enemyActual.alive) return;
    const order = this.orderFor('science');

    if (order === 'passive') {
      this.state.sensors.scanActive = false;
      this.setAiStatus('science', 'Passive sensors only');
      return;
    }

    if (this.state.sensors.intelLevel < 2) {
      if (!this.state.sensors.scanActive) {
        this.executeCommand({ kind: 'ai', role: 'science' }, { type: 'scanTarget' });
      }
      this.setAiStatus('science', `Scanning contact • ${Math.round(this.state.sensors.scanProgress)}%`);
    } else {
      this.setAiStatus('science', `Tracking ${this.enemyActual.trueName}`);
    }
  }

  private runAiHelm() {
    if (!this.isAiControlled('helm') || !this.enemyActual.alive) return;

    const ship = this.state.ship;
    const enemy = this.enemyActual;
    const dx = enemy.x - ship.x;
    const dy = enemy.y - ship.y;
    const range = Math.hypot(dx, dy);
    const bearingToEnemy = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
    const order = this.orderFor('helm');

    if (order === 'hold') {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 0 });
      this.setAiStatus('helm', 'Holding position by captain order');
      return;
    }

    if (order === 'evade') {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 180 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 85 });
      this.setAiStatus('helm', `Evasive withdrawal • ${range.toFixed(1)} km`);
      return;
    }

    if (this.state.missionStage === 'investigate' && order !== 'intercept') {
      if (range > 23) {
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy });
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 36 });
        this.setAiStatus('helm', `Approaching sensor range • ${range.toFixed(1)} km`);
      } else {
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 0 });
        this.setAiStatus('helm', `Holding for science scan • ${range.toFixed(1)} km`);
      }
      return;
    }

    if (range > 13) {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: range > 18 ? 78 : 48 });
      this.setAiStatus('helm', `Closing on target • ${range.toFixed(1)} km`);
    } else if (range < 8.5) {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 180 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 38 });
      this.setAiStatus('helm', `Opening range • ${range.toFixed(1)} km`);
    } else {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 70 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 24 });
      this.setAiStatus('helm', `Combat orbit • ${range.toFixed(1)} km`);
    }
  }

  private runAiEngineering() {
    if (!this.isAiControlled('engineering') || this.aiEngineeringCooldown > 0) return;

    const ship = this.state.ship;
    const range = this.rangeToEnemy();
    const order = this.orderFor('engineering');
    let system: 'engines' | 'shields' | 'weapons';
    let value: number;
    let status: string;

    if (order === 'shields') {
      system = 'shields'; value = 62; status = 'Captain order: shields priority';
    } else if (order === 'weapons') {
      system = 'weapons'; value = 58; status = 'Captain order: weapons priority';
    } else if (order === 'engines') {
      system = 'engines'; value = 58; status = 'Captain order: engines priority';
    } else if (order === 'balanced') {
      system = 'shields'; value = 34; status = 'Captain order: balanced power';
    } else if (ship.shields < 45 || ship.hull < 75) {
      system = 'shields'; value = 58; status = 'Prioritizing defensive power';
    } else if (range > 15) {
      system = 'engines'; value = 48; status = 'Powering pursuit engines';
    } else if (ship.beamCharge < 45) {
      system = 'weapons'; value = 50; status = 'Charging weapon capacitors';
    } else {
      system = 'shields'; value = 42; status = 'Balanced combat distribution';
    }

    this.executeCommand({ kind: 'ai', role: 'engineering' }, { type: 'setPower', system, value });
    this.setAiStatus('engineering', status);
    this.aiEngineeringCooldown = 1.25;
  }

  private runAiTactical() {
    if (!this.isAiControlled('tactical') || !this.enemyActual.alive) return;
    const order = this.orderFor('tactical');
    const ship = this.state.ship;
    const range = this.rangeToEnemy();

    if (order === 'holdFire') {
      this.setAiStatus('tactical', 'Holding fire by captain order');
      return;
    }

    if (this.state.sensors.intelLevel < 1) {
      this.setAiStatus('tactical', 'Awaiting target identification');
      return;
    }

    if (range > 24) {
      this.setAiStatus('tactical', `Tracking target • ${range.toFixed(1)} km`);
      return;
    }

    if (range > 15) {
      if (ship.torpedoes > 0 && this.aiTorpedoCooldown <= 0) {
        this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'fireTorpedo' });
        this.aiTorpedoCooldown = 4.5;
        this.setAiStatus('tactical', 'Long-range torpedo engagement');
      } else {
        this.setAiStatus('tactical', `Holding beam fire • ${range.toFixed(1)} km`);
      }
      return;
    }

    let fired = false;
    if (ship.beamCharge >= 25 && this.aiBeamCooldown <= 0) {
      this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'fireBeam' });
      this.aiBeamCooldown = 1.15;
      fired = true;
    }
    if (ship.torpedoes > 0 && this.aiTorpedoCooldown <= 0 && this.enemyActual.hull > 15) {
      this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'fireTorpedo' });
      this.aiTorpedoCooldown = 5;
      fired = true;
    }
    this.setAiStatus('tactical', fired ? 'Weapons free' : 'Tracking firing solution');
  }

  private resolveActorRole(actor: CommandActor): Role | null {
    return actor.kind === 'human' ? this.roleFor(actor.sessionId) : actor.role;
  }

  private roleSlot(role: Role): RoleAssignment | undefined {
    return this.state.roles.find((r) => r.role === role);
  }

  private isAiControlled(role: Role) {
    const slot = this.roleSlot(role);
    return !!slot && slot.controller === 'ai' && slot.sessionId === null;
  }

  private setAiStatus(role: Role, status: string) {
    const slot = this.roleSlot(role);
    if (slot?.controller === 'ai') slot.status = status;
  }

  private orderFor(role: OperationalRole): CrewOrder {
    return this.roleSlot(role)?.captainOrder ?? 'auto';
  }

  private issueOrder(role: OperationalRole, order: CrewOrder): boolean {
    if (!ALLOWED_ORDERS[role]?.includes(order)) return false;
    const slot = this.roleSlot(role);
    if (!slot) return false;
    slot.captainOrder = order;
    const recipient = slot.controller === 'ai' ? slot.aiOfficerName : slot.playerName ?? role.toUpperCase();
    this.log(`CAPTAIN ORDER → ${role.toUpperCase()}: ${roleOrderLabel(order)} (${recipient}).`);
    return true;
  }

  private startMission() {
    if (this.state.missionStatus !== 'briefing') return;
    this.state.missionStatus = 'running';
    this.state.missionStage = 'investigate';
    this.state.currentObjective = 'Investigate and identify the unknown contact.';
    this.setAiStatus('helm', 'Approaching sensor range');
    this.setAiStatus('tactical', 'Tracking unknown contact');
    this.setAiStatus('engineering', 'Configuring mission power');
    this.setAiStatus('science', 'Beginning sensor sweep');
    this.log('MISSION START: Investigate the unknown contact near the civilian relay lane.');
  }

  private resetMission() {
    const roleState = this.state.roles.map((r) => ({
      role: r.role,
      sessionId: r.sessionId,
      playerName: r.playerName,
      controller: r.controller,
      aiOfficerName: r.aiOfficerName,
      status: r.sessionId ? 'Human control' : r.role === 'captain' ? 'Awaiting human captain' : 'Standing by',
      captainOrder: r.role === 'captain' ? null : 'auto' as CrewOrder
    }));

    this.enemyActual = this.enemyForWave(1);
    const fresh = this.createInitialState();
    fresh.roles = roleState;
    fresh.eventLog = ['Mission reset to briefing.', 'Mission loaded: Signal in the Dark. Awaiting captain.'];
    this.state = fresh;
    this.enemyFireCooldown = 4;
    this.aiDecisionAccumulator = 0;
    this.aiBeamCooldown = 0;
    this.aiTorpedoCooldown = 1.5;
    this.aiEngineeringCooldown = 0;
    this.reinforcementTimer = 0;
    this.scanIdentityLogged = false;
    this.scanCompleteLogged = false;
    this.syncEnemyPublicState();
  }

  private startScan() {
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive || this.state.sensors.intelLevel >= 2) return;
    this.state.sensors.scanActive = true;
    this.log('SCIENCE: Active scan initiated on unknown contact.');
  }

  private updateScan(dt: number) {
    if (!this.state.sensors.scanActive || !this.enemyActual.alive || this.state.sensors.intelLevel >= 2) return;

    const range = this.rangeToEnemy();
    const rangeFactor = range <= 24 ? 1 : clamp(24 / range, 0.45, 1);
    this.state.sensors.scanProgress = clamp(this.state.sensors.scanProgress + 22 * rangeFactor * dt, 0, 100);

    if (this.state.sensors.scanProgress >= 45 && this.state.sensors.intelLevel < 1) {
      this.state.sensors.intelLevel = 1;
      this.state.sensors.contactClass = this.enemyActual.className;
      this.state.sensors.weaponsEstimate = this.enemyActual.weapons;
      if (!this.scanIdentityLogged) {
        this.scanIdentityLogged = true;
        this.log(`SCIENCE: Contact identified as ${this.enemyActual.trueName}, ${this.enemyActual.className}.`);
      }
    }

    if (this.state.sensors.scanProgress >= 100 && this.state.sensors.intelLevel < 2) {
      this.state.sensors.intelLevel = 2;
      this.state.sensors.scanActive = false;
      this.state.sensors.shieldEstimate = `${Math.round(this.enemyActual.shields)}%`;
      this.state.sensors.hullEstimate = `${Math.round(this.enemyActual.hull)}%`;
      if (!this.scanCompleteLogged) {
        this.scanCompleteLogged = true;
        this.log('SCIENCE: Full tactical profile complete. Weapons and defensive systems resolved.');
      }
      if (this.state.missionStage === 'investigate') {
        this.state.missionStage = 'intercept';
        this.state.currentObjective = `Intercept ${this.enemyActual.trueName} and prevent escape.`;
        this.log('CAPTAIN: Contact is hostile. Intercept authorized.');
      }
    }
  }

  private updateShipMovement(dt: number) {
    const ship = this.state.ship;
    const turnRate = 18 + ship.enginePower * 0.22;
    let delta = ((ship.requestedHeading - ship.heading + 540) % 360) - 180;
    delta = clamp(delta, -turnRate * dt, turnRate * dt);
    ship.heading = normalizeHeading(ship.heading + delta);

    const targetSpeed = ship.throttle * (0.025 + ship.enginePower * 0.0003);
    ship.speed += (targetSpeed - ship.speed) * Math.min(1, dt * 1.8);
    const radians = ship.heading * Math.PI / 180;
    ship.x += Math.sin(radians) * ship.speed * dt;
    ship.y += Math.cos(radians) * ship.speed * dt;

    ship.beamCharge = clamp(ship.beamCharge + (4 + ship.weaponPower * 0.12) * dt, 0, 100);
    ship.shields = clamp(ship.shields + ship.shieldPower * 0.015 * dt, 0, 100);
  }

  private updateMissionStageByRange() {
    if (this.state.missionStage === 'intercept' && this.rangeToEnemy() <= 18) {
      this.state.missionStage = 'combat';
      this.state.currentObjective = `Engage and disable ${this.enemyActual.trueName}.`;
      this.log('TACTICAL: Target entering effective weapons envelope.');
    }
  }

  private resolveEncounterEnd() {
    if (!this.enemyActual.alive) {
      if (this.enemyActual.wave === 1) {
        this.state.missionStage = 'reinforcement';
        this.state.currentObjective = 'Stand by. Long-range sensors report another inbound contact.';
        this.reinforcementTimer = 3;
        this.state.sensors.scanActive = false;
        this.setAiStatus('helm', 'Holding after first engagement');
        this.setAiStatus('tactical', 'First target destroyed');
        this.setAiStatus('engineering', 'Stabilizing systems');
        this.setAiStatus('science', 'Searching for additional contacts');
        this.log('FIRST CONTACT DESTROYED: Long-range sensors detect a second vessel inbound.');
        this.enemyActual.wave = 0;
      } else if (this.enemyActual.wave === 2) {
        this.state.missionStatus = 'victory';
        this.state.missionStage = 'victory';
        this.state.currentObjective = 'Mission complete. Civilian relay lane secure.';
        this.setAiStatus('helm', 'Holding position');
        this.setAiStatus('tactical', 'All hostiles neutralized');
        this.setAiStatus('engineering', 'Stabilizing systems');
        this.setAiStatus('science', 'No additional contacts');
        this.log('MISSION COMPLETE: Both hostile vessels destroyed. Relay lane secure.');
      }
    } else if (this.state.ship.hull <= 0) {
      this.state.missionStatus = 'defeat';
      this.state.missionStage = 'defeat';
      this.state.currentObjective = 'Mission failed. Reset to briefing to try again.';
      this.log('MISSION FAILED: Your ship has been destroyed.');
    }
  }

  private spawnWave(wave: 1 | 2) {
    this.enemyActual = this.enemyForWave(wave);
    this.state.encounter = wave;
    this.state.missionStage = 'investigate';
    this.state.currentObjective = wave === 1
      ? 'Investigate and identify the unknown contact.'
      : 'Identify the second inbound contact before it reaches weapons range.';
    this.state.sensors = {
      scanActive: false,
      scanProgress: 0,
      intelLevel: 0,
      contactClass: 'Unknown',
      weaponsEstimate: 'Unknown',
      shieldEstimate: 'Unknown',
      hullEstimate: 'Unknown'
    };
    this.enemyFireCooldown = wave === 1 ? 4 : 2.5;
    this.scanIdentityLogged = false;
    this.scanCompleteLogged = false;
    this.setAiStatus('science', 'New contact detected');
    this.setAiStatus('tactical', 'Awaiting target identification');
    this.syncEnemyPublicState();
  }

  private enemyForWave(wave: 1 | 2): InternalEnemy {
    if (wave === 1) {
      return {
        id: 'raider-1',
        trueName: 'Kestrel Raider',
        className: 'Kestrel-class raider',
        weapons: 'Medium beam array, torpedo launcher',
        x: 28,
        y: 11,
        hull: 100,
        shields: 65,
        alive: true,
        wave: 1
      };
    }
    return {
      id: 'raider-2',
      trueName: 'Viper Command Raider',
      className: 'Viper-class command raider',
      weapons: 'Heavy beams, rapid torpedo launcher',
      x: -24,
      y: 24,
      hull: 100,
      shields: 90,
      alive: true,
      wave: 2
    };
  }

  private setHeading(value: number) {
    this.state.ship.requestedHeading = normalizeHeading(value);
  }

  private setThrottle(value: number) {
    this.state.ship.throttle = clamp(value, 0, 100);
  }

  private setPower(system: 'engines' | 'shields' | 'weapons', value: number) {
    const ship = this.state.ship;
    const next = clamp(value, 0, 100);
    const keys = {
      engines: 'enginePower',
      shields: 'shieldPower',
      weapons: 'weaponPower'
    } as const;
    const key = keys[system];
    const otherKeys = (Object.values(keys) as Array<keyof typeof ship>).filter((k) => k !== key);
    const remaining = 100 - next;
    const currentOtherTotal = otherKeys.reduce((sum, k) => sum + Number(ship[k]), 0) || 1;
    ship[key] = next as never;
    for (const other of otherKeys) {
      ship[other] = (remaining * Number(ship[other]) / currentOtherTotal) as never;
    }
  }

  private fireBeam() {
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive) return;
    if (this.state.sensors.intelLevel < 1) {
      this.log('Tactical: No verified firing solution. Science must identify the contact first.');
      return;
    }
    const ship = this.state.ship;
    if (ship.beamCharge < 25) return;
    const range = this.rangeToEnemy();
    if (range > 15) {
      this.log('Tactical: Beam shot dissipated out of range.');
      ship.beamCharge -= 25;
      return;
    }
    ship.beamCharge -= 25;
    this.damageEnemy(9 + ship.weaponPower * 0.12, 'Beam strike');
  }

  private fireTorpedo() {
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive) return;
    if (this.state.sensors.intelLevel < 1) {
      this.log('Tactical: No verified firing solution. Science must identify the contact first.');
      return;
    }
    const ship = this.state.ship;
    if (ship.torpedoes <= 0) return;
    ship.torpedoes -= 1;
    if (this.rangeToEnemy() > 24) {
      this.log('Tactical: Torpedo lost target lock outside effective range.');
      return;
    }
    this.damageEnemy(24, 'Torpedo impact');
  }

  private enemyBehavior(dt: number) {
    const enemy = this.enemyActual;
    if (!enemy.alive) return;
    const ship = this.state.ship;
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const range = Math.hypot(dx, dy);

    if (this.state.sensors.intelLevel >= 1 && range > 10) {
      const speed = enemy.wave === 2 ? 1.05 : 0.82;
      const step = Math.min(range, dt * speed);
      enemy.x += (dx / range) * step;
      enemy.y += (dy / range) * step;
    }

    this.enemyFireCooldown -= dt;
    if (this.state.sensors.intelLevel >= 1 && range < 16 && this.enemyFireCooldown <= 0) {
      this.enemyFireCooldown = enemy.wave === 2 ? 2.7 : 3.5;
      const damage = enemy.wave === 2 ? 11 : 8;
      if (ship.shields > 0) {
        const absorbed = Math.min(ship.shields, damage);
        ship.shields -= absorbed;
        ship.hull -= damage - absorbed;
      } else {
        ship.hull -= damage;
      }
      this.log(`Enemy weapons hit: shields ${Math.round(ship.shields)}%, hull ${Math.round(ship.hull)}%.`);
    }
  }

  private damageEnemy(amount: number, source: string) {
    const enemy = this.enemyActual;
    let remaining = amount;
    if (enemy.shields > 0) {
      const absorbed = Math.min(enemy.shields, remaining);
      enemy.shields -= absorbed;
      remaining -= absorbed;
    }
    enemy.hull = clamp(enemy.hull - remaining, 0, 100);
    if (enemy.hull <= 0) enemy.alive = false;

    if (this.state.sensors.intelLevel >= 2) {
      this.log(`${source}: enemy shields ${Math.round(enemy.shields)}%, hull ${Math.round(enemy.hull)}%.`);
    } else {
      this.log(`${source}: impact confirmed on hostile contact.`);
    }
    this.syncEnemyPublicState();
  }

  private rangeToEnemy() {
    return Math.hypot(this.state.ship.x - this.enemyActual.x, this.state.ship.y - this.enemyActual.y);
  }

  private syncEnemyPublicState() {
    const intel = this.state.sensors.intelLevel;
    this.state.enemy = {
      id: this.enemyActual.id,
      name: intel >= 1 ? this.enemyActual.trueName : 'Unknown Contact',
      x: this.enemyActual.x,
      y: this.enemyActual.y,
      hull: intel >= 2 ? this.enemyActual.hull : null,
      shields: intel >= 2 ? this.enemyActual.shields : null,
      alive: this.enemyActual.alive,
      wave: this.state.encounter
    };
    if (intel >= 2) {
      this.state.sensors.shieldEstimate = `${Math.round(this.enemyActual.shields)}%`;
      this.state.sensors.hullEstimate = `${Math.round(this.enemyActual.hull)}%`;
    }
  }

  private log(message: string) {
    if (this.state.eventLog[0] === message) return;
    this.state.eventLog.unshift(message);
    this.state.eventLog = this.state.eventLog.slice(0, 20);
  }

  safeSnapshot(): GameSnapshot {
    this.syncEnemyPublicState();
    return structuredClone(this.state);
  }
}
