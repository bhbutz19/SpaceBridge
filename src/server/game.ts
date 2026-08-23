import type { GameSnapshot, Role, RoleAssignment, StationCommand } from '../shared/protocol.js';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const AI_OFFICERS: Record<Role, string> = {
  captain: 'Cmdr. Hale',
  helm: 'Lt. Vega',
  tactical: 'Lt. Rook',
  engineering: 'Lt. Chen'
};

type CommandActor =
  | { kind: 'human'; sessionId: string }
  | { kind: 'ai'; role: Role };

const roleForCommand = (command: StationCommand): Role => {
  switch (command.type) {
    case 'startMission': return 'captain';
    case 'setHeading':
    case 'setThrottle': return 'helm';
    case 'setPower': return 'engineering';
    case 'fireBeam':
    case 'fireTorpedo': return 'tactical';
  }
};

export class BridgeGame {
  state: GameSnapshot = {
    serverTime: Date.now(),
    missionStatus: 'briefing',
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
      torpedoes: 6,
      x: 0,
      y: 0
    },
    enemy: {
      id: 'raider-1',
      name: 'Hostile Raider',
      x: 18,
      y: 8,
      hull: 100,
      shields: 60,
      alive: true
    },
    roles: (['captain', 'helm', 'tactical', 'engineering'] as Role[]).map((role) => ({
      role,
      sessionId: null,
      playerName: null,
      controller: 'ai',
      aiOfficerName: AI_OFFICERS[role],
      status: role === 'captain' ? 'Awaiting human captain' : 'Standing by'
    })),
    eventLog: [
      'AI crew online. Helm, Tactical, and Engineering will operate empty stations.',
      'Mission loaded. Awaiting captain.'
    ]
  };

  private enemyFireCooldown = 4;
  private aiDecisionAccumulator = 0;
  private aiBeamCooldown = 0;
  private aiTorpedoCooldown = 1.5;
  private aiEngineeringCooldown = 0;

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
    }
    return true;
  }

  tick(dt: number) {
    this.state.serverTime = Date.now();
    this.aiBeamCooldown = Math.max(0, this.aiBeamCooldown - dt);
    this.aiTorpedoCooldown = Math.max(0, this.aiTorpedoCooldown - dt);
    this.aiEngineeringCooldown = Math.max(0, this.aiEngineeringCooldown - dt);

    if (this.state.missionStatus !== 'running') return;

    this.aiDecisionAccumulator += dt;
    if (this.aiDecisionAccumulator >= 0.25) {
      const decisionDt = this.aiDecisionAccumulator;
      this.aiDecisionAccumulator = 0;
      this.runAiCrew(decisionDt);
    }

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

    this.enemyBehavior(dt);
    if (!this.state.enemy.alive) {
      this.state.missionStatus = 'victory';
      this.setAiStatus('helm', 'Holding position');
      this.setAiStatus('tactical', 'Target destroyed');
      this.setAiStatus('engineering', 'Stabilizing systems');
      this.log('MISSION COMPLETE: Hostile vessel destroyed.');
    } else if (ship.hull <= 0) {
      this.state.missionStatus = 'defeat';
      this.log('MISSION FAILED: Your ship has been destroyed.');
    }
  }

  private runAiCrew(_dt: number) {
    this.runAiHelm();
    this.runAiEngineering();
    this.runAiTactical();
  }

  private runAiHelm() {
    if (!this.isAiControlled('helm') || !this.state.enemy.alive) return;

    const ship = this.state.ship;
    const enemy = this.state.enemy;
    const dx = enemy.x - ship.x;
    const dy = enemy.y - ship.y;
    const range = Math.hypot(dx, dy);
    const bearingToEnemy = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);

    if (range > 13) {
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: range > 18 ? 75 : 45 });
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
    let system: 'engines' | 'shields' | 'weapons';
    let value: number;
    let status: string;

    if (ship.shields < 45 || ship.hull < 75) {
      system = 'shields';
      value = 58;
      status = 'Prioritizing defensive power';
    } else if (range > 15) {
      system = 'engines';
      value = 48;
      status = 'Powering pursuit engines';
    } else if (ship.beamCharge < 45) {
      system = 'weapons';
      value = 50;
      status = 'Charging weapon capacitors';
    } else {
      system = 'shields';
      value = 42;
      status = 'Balanced combat distribution';
    }

    this.executeCommand({ kind: 'ai', role: 'engineering' }, { type: 'setPower', system, value });
    this.setAiStatus('engineering', status);
    this.aiEngineeringCooldown = 1.25;
  }

  private runAiTactical() {
    if (!this.isAiControlled('tactical') || !this.state.enemy.alive) return;

    const ship = this.state.ship;
    const range = this.rangeToEnemy();

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
    if (ship.torpedoes > 0 && this.aiTorpedoCooldown <= 0 && this.state.enemy.hull > 15) {
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

  private startMission() {
    if (this.state.missionStatus !== 'briefing') return;
    this.state.missionStatus = 'running';
    this.setAiStatus('helm', 'Acquiring intercept course');
    this.setAiStatus('tactical', 'Acquiring target');
    this.setAiStatus('engineering', 'Configuring combat power');
    this.log('MISSION START: Intercept and destroy the hostile raider. AI crew engaging empty stations.');
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
    if (this.state.missionStatus !== 'running' || !this.state.enemy.alive) return;
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
    if (this.state.missionStatus !== 'running' || !this.state.enemy.alive) return;
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
    const enemy = this.state.enemy;
    const ship = this.state.ship;
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const range = Math.hypot(dx, dy);
    if (range > 10) {
      const step = Math.min(range, dt * 0.8);
      enemy.x += (dx / range) * step;
      enemy.y += (dy / range) * step;
    }

    this.enemyFireCooldown -= dt;
    if (range < 16 && this.enemyFireCooldown <= 0) {
      this.enemyFireCooldown = 3.5;
      const damage = 8;
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
    const enemy = this.state.enemy;
    let remaining = amount;
    if (enemy.shields > 0) {
      const absorbed = Math.min(enemy.shields, remaining);
      enemy.shields -= absorbed;
      remaining -= absorbed;
    }
    enemy.hull = clamp(enemy.hull - remaining, 0, 100);
    if (enemy.hull <= 0) enemy.alive = false;
    this.log(`${source}: enemy shields ${Math.round(enemy.shields)}%, hull ${Math.round(enemy.hull)}%.`);
  }

  private rangeToEnemy() {
    return Math.hypot(this.state.ship.x - this.state.enemy.x, this.state.ship.y - this.state.enemy.y);
  }

  private log(message: string) {
    if (this.state.eventLog[0] === message) return;
    this.state.eventLog.unshift(message);
    this.state.eventLog = this.state.eventLog.slice(0, 16);
  }

  safeSnapshot(): GameSnapshot {
    return structuredClone(this.state);
  }
}
