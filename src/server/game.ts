import type {
  CircuitTileState,
  CrewOrder,
  EngineeringPuzzleState,
  EnemyManeuverState,
  JunctionContextState,
  JunctionProfile,
  JunctionProtocol,
  JunctionRuleCode,
  JunctionRuleRow,
  GameSnapshot,
  HelmManeuver,
  MissionId,
  OperationalRole,
  Role,
  RoleAssignment,
  SpaceObjectState,
  RepairCrewState,
  StationCommand,
  SystemName,
  TacticalTarget,
  TargetLockAxis
} from '../shared/protocol.js';
import { ACTIVE_SHIP_PROFILE, repairCrewTransitSeconds } from './config/shipProfiles.js';
import { instantiateMissionWorldObjects } from './config/worldObjects.js';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const circularDistance = (a: number, b: number, period = 100) => {
  const raw = Math.abs(a - b) % period;
  return Math.min(raw, period - raw);
};

// Repair-crew count, travel geometry/timing, scaling, and casualty tuning now live
// in the active ship profile under src/server/config/shipProfiles.ts.

const AI_OFFICERS: Record<Role, string> = {
  captain: 'Cmdr. Hale',
  helm: 'Lt. Vega',
  tactical: 'Lt. Rook',
  engineering: 'Lt. Chen',
  science: 'Lt. Sato',
  communications: 'Lt. Reyes'
};

const ALLOWED_ORDERS: Record<OperationalRole, CrewOrder[]> = {
  helm: ['auto', 'intercept', 'hold', 'evade'],
  tactical: ['auto', 'weaponsFree', 'holdFire'],
  engineering: ['auto', 'balanced', 'shields', 'weapons', 'engines'],
  science: ['auto', 'scan', 'passive'],
  communications: ['auto', 'monitor', 'hail', 'silent']
};

type CommandActor =
  | { kind: 'human'; sessionId: string }
  | { kind: 'ai'; role: Role };

type InternalEnemy = {
  id: string;
  trueName: string;
  className: string;
  weapons: string;
  shieldFrequency: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  maxSpeed: number;
  turnRateDegreesPerSecond: number;
  maneuverState: EnemyManeuverState;
  maneuverTimer: number;
  maneuverHeading: number;
  maneuverSide: -1 | 1;
  beamRange: number;
  beamArcDegrees: number;
  hull: number;
  shields: number;
  maxShields: number;
  systems: Record<SystemName, number>;
  alive: boolean;
  wave: number;
};

const roleForCommand = (command: StationCommand): Role => {
  switch (command.type) {
    case 'startMission':
    case 'resetMission':
    case 'selectMission':
    case 'issueOrder':
    case 'captainTextOrder':
    case 'issueHeadingOrder':
    case 'issueNavigationTargetOrder':
      return 'captain';
    case 'setHeading':
    case 'setThrottle':
    case 'setLateralThrust':
    case 'selectHelmContact':
    case 'setHelmManeuver':
    case 'setHelmAssist':
    case 'setHelmOrbitRange':
      return 'helm';
    case 'setPower':
    case 'setRepairTarget':
    case 'assignRepairCrew':
    case 'setRepairCrewAuto':
    case 'engineeringTestSetSystem':
    case 'engineeringPuzzleAction':
      return 'engineering';
    case 'fireBeam':
    case 'fireTorpedo':
    case 'selectEnemyTarget':
    case 'selectTacticalContact':
    case 'startTargetLock':
    case 'setTargetLockAxis':
    case 'verifyTargetLock':
    case 'syncBeamCapacitor':
    case 'startTorpedoGuidance':
    case 'markTorpedoGuidance':
      return 'tactical';
    case 'scanTarget':
    case 'selectScienceContact':
    case 'beginTacticalAnalysis':
      return 'science';
    case 'hailContact':
    case 'sendCommsResponse':
    case 'selectCommunicationsContact':
    case 'selectTransmission':
    case 'setCommsTuner':
    case 'setCommsFilter':
    case 'verifyCommsSignal':
    case 'sendTransmissionResponse':
    case 'toggleCommsJamming':
    case 'startCommsIntercept':
      return 'communications';
  }
};

const roleOrderLabel = (order: CrewOrder) => order
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (c) => c.toUpperCase());

export class BridgeGame {
  state: GameSnapshot;

  private readonly random: () => number;

  private enemyActual: InternalEnemy;
  private enemyFireCooldown = 4;
  private aiDecisionAccumulator = 0;
  private aiBeamCooldown = 0;
  private aiTorpedoCooldown = 1.5;
  private aiPrecisionLockTimer = 0;
  private aiEngineeringCooldown = 0;
  private reinforcementTimer = 0;
  private scanIdentityLogged = false;
  private scanCompleteLogged = false;
  private tacticalFrequencyLogged = false;
  private tacticalSystemsLogged = false;
  private commsSequence = 0;
  private shieldWarningIssued = false;
  private hullWarningIssued = false;
  private selectedMission: MissionId = 'signal-dark';
  private distressAidAccumulator = 0;
  private communicationsCooldown = 0;
  private communicationsTransmissionSequence = 0;
  private hostileTransmissionQueuedForWave = 0;
  private communicationsPayloads = new Map<number, string>();
  private repairAccumulator = 0;
  private enemyHitCount = 0;
  private engineeringPuzzleSequence = 0;
  private quickPuzzleSequence = 0;
  private restorationPuzzleSequence = 0;
  private aiPuzzleTimer = 0;
  private engineeringPuzzleBySystem = new Map<SystemName, EngineeringPuzzleState>();
  private junctionSolutions = new Map<number, Set<string>>();
  private breakerSolutions = new Map<number, string[]>();

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.enemyActual = this.enemyForWave(1);
    this.state = this.createInitialState();
    this.syncEnemyPublicState();
    this.syncSpaceObjects();
  }

  private createInitialState(): GameSnapshot {
    return {
      serverTime: Date.now(),
      missionId: this.selectedMission,
      missionStatus: 'briefing',
      missionStage: 'briefing',
      missionTitle: this.selectedMission === 'meridian-distress' ? 'Meridian Distress' : 'Signal in the Dark',
      currentObjective: this.selectedMission === 'meridian-distress' ? 'Await Captain authorization to answer the Meridian distress call.' : 'Await captain authorization to begin the mission.',
      encounter: 1,
      ship: {
        heading: 0,
        requestedHeading: 0,
        throttle: 0,
        speed: 0,
        lateralThrust: 0,
        lateralSpeed: 0,
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
        wave: this.enemyActual.wave,
        systems: { engines: null, shields: null, weapons: null, sensors: null, communications: null },
        heading: null, speed: null, beamRange: null, beamArcDegrees: null
      },
      sensors: {
        scanActive: false,
        scanProgress: 0,
        intelLevel: 0,
        contactClass: 'Unknown',
        weaponsEstimate: 'Unknown',
        shieldEstimate: 'Unknown',
        hullEstimate: 'Unknown',
        tacticalAnalysisActive: false,
        tacticalAnalysisProgress: 0,
        shieldFrequency: null,
        shieldSolution: false,
        systemsMapped: false
      },
      tactical: this.createTacticalState(),
      helm: {
        selectedContactId: this.selectedMission === 'signal-dark' ? this.enemyActual.id : (this.selectedMission === 'meridian-distress' ? 'meridian' : null),
        maneuver: 'manual',
        assistEnabled: false,
        orbitRange: ACTIVE_SHIP_PROFILE.flight.defaultCombatOrbitRange,
        recommendedHeading: null,
        recommendedThrottle: null,
        targetRange: null,
        targetBearing: null,
        relativeBearing: null,
        closingSpeed: null,
        aspect: 'none',
        insideEnemyArc: null,
        targetRelativePosition: null,
        desiredRelativePosition: null,
        positionError: null,
        positionalAdvantage: 'unknown',
        turnAuthority: 100,
        enemyManeuver: null
      },
      friendlyContact: this.selectedMission === 'meridian-distress' ? {
        id: 'meridian', name: 'CSV Meridian', type: 'Civilian freighter', x: 24, y: 8,
        status: 'distress', hailStatus: 'unopened',
        distress: 'Drive failure and cascading life-support instability. Request immediate assistance.',
        aidProgress: 0
      } : null,
      spaceObjects: [],
      stationSelections: {
        tacticalContactId: this.selectedMission === 'signal-dark' ? this.enemyActual.id : null,
        scienceContactId: this.selectedMission === 'signal-dark' ? this.enemyActual.id : (this.selectedMission === 'meridian-distress' ? 'meridian' : null),
        communicationsContactId: this.selectedMission === 'meridian-distress' ? 'meridian' : null,
        helmContactId: this.selectedMission === 'signal-dark' ? this.enemyActual.id : (this.selectedMission === 'meridian-distress' ? 'meridian' : null)
      },
      shipCapabilities: {
        profileId: ACTIVE_SHIP_PROFILE.id,
        profileName: ACTIVE_SHIP_PROFILE.displayName,
        stationSensors: { ...ACTIVE_SHIP_PROFILE.stationSensors },
        weapons: { ...ACTIVE_SHIP_PROFILE.weapons },
        flight: { ...ACTIVE_SHIP_PROFILE.flight }
      },
      captainHeadingOrder: null,
      captainNavigationTargetId: null,
      systems: { engines: 100, shields: 100, weapons: 100, sensors: 100, communications: 100 },
      repairTarget: null,
      repairProgress: 0,
      repairCrews: this.createRepairCrews(),
      engineeringPuzzle: null,
      repairBoostRemaining: 0,
      repairBoostSystem: null,
      repairBoosts: { engines: 0, shields: 0, weapons: 0, sensors: 0, communications: 0 },
      roles: (['captain', 'helm', 'tactical', 'engineering', 'science', 'communications'] as Role[]).map((role) => ({
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
        `Mission loaded: ${this.selectedMission === 'meridian-distress' ? 'Meridian Distress' : 'Signal in the Dark'}. Awaiting captain.`
      ],
      commsLog: [
        { id: ++this.commsSequence, speaker: 'Bridge Computer', role: 'computer', message: 'Crew network online. AI officers standing by for Captain orders.', tone: 'system' }
      ],
      communications: {
        selectedContactId: this.selectedMission === 'meridian-distress' ? 'meridian' : null,
        activeTransmissionId: null,
        transmissions: [],
        electronicWarfare: {
          jamTargetId: null,
          jammingActive: false,
          jammingStrength: 0,
          interceptTargetId: null,
          interceptActive: false,
          interceptProgress: 0,
          interceptIntel: null
        }
      }
    };
  }

  private syncSpaceObjects() {
    const objects: SpaceObjectState[] = [
      {
        id: 'player-ship', name: 'USS Prototype', objectType: 'ship' as const, subtype: 'Player vessel',
        disposition: 'player' as const, x: this.state.ship.x, y: this.state.ship.y, radius: 1.4, selectable: false, targetable: false, alive: this.state.ship.hull > 0, identified: true
      },
      {
        id: this.enemyActual.id, name: this.state.enemy.name, objectType: 'ship' as const, subtype: this.state.sensors.contactClass,
        disposition: (this.state.sensors.intelLevel >= 1 ? 'hostile' : 'unknown') as 'hostile' | 'unknown',
        x: this.enemyActual.x, y: this.enemyActual.y, radius: 1.2, selectable: this.enemyActual.alive, targetable: this.enemyActual.alive, alive: this.enemyActual.alive, identified: this.state.sensors.intelLevel >= 1,
        contactStatus: this.state.sensors.intelLevel >= 1 ? 'identified' : 'unresolved'
      }
    ];
    if (this.state.friendlyContact) {
      objects.push({
        id: this.state.friendlyContact.id, name: this.state.friendlyContact.name, objectType: 'ship' as const, subtype: this.state.friendlyContact.type,
        disposition: 'friendly' as const, x: this.state.friendlyContact.x, y: this.state.friendlyContact.y, radius: 1.1, selectable: true, targetable: false, alive: true, identified: true,
        contactStatus: this.state.friendlyContact.status
      });
    }
    objects.push(...instantiateMissionWorldObjects(this.state.missionId));
    this.state.spaceObjects = objects;
    const validIds = new Set(objects.filter((object) => object.selectable).map((object) => object.id));
    const currentEnemySelectable = this.enemyActual.alive && validIds.has(this.enemyActual.id);
    if (this.state.stationSelections.tacticalContactId && !validIds.has(this.state.stationSelections.tacticalContactId)) {
      const tacticalAi = this.state.roles.find((role) => role.role === 'tactical')?.controller === 'ai';
      this.state.stationSelections.tacticalContactId = tacticalAi && currentEnemySelectable ? this.enemyActual.id : null;
    }
    if (this.state.stationSelections.scienceContactId && !validIds.has(this.state.stationSelections.scienceContactId)) {
      const scienceAi = this.state.roles.find((role) => role.role === 'science')?.controller === 'ai';
      this.state.stationSelections.scienceContactId = scienceAi && currentEnemySelectable ? this.enemyActual.id : null;
    }
    if (this.state.stationSelections.communicationsContactId && !validIds.has(this.state.stationSelections.communicationsContactId)) {
      this.state.stationSelections.communicationsContactId = null;
      this.state.communications.selectedContactId = null;
    }
    if (this.state.stationSelections.helmContactId && !validIds.has(this.state.stationSelections.helmContactId)) {
      this.state.stationSelections.helmContactId = null;
      this.state.helm.selectedContactId = null;
    }
    if (!this.state.stationSelections.tacticalContactId && currentEnemySelectable && this.state.roles.find((role) => role.role === 'tactical')?.controller === 'ai') this.state.stationSelections.tacticalContactId = this.enemyActual.id;
    if (!this.state.stationSelections.scienceContactId && currentEnemySelectable && this.state.roles.find((role) => role.role === 'science')?.controller === 'ai') this.state.stationSelections.scienceContactId = this.enemyActual.id;
  }

  private selectStationContact(station: 'tactical' | 'science' | 'communications' | 'helm', contactId: string): boolean {
    this.syncSpaceObjects();
    const object = this.state.spaceObjects.find((entry) => entry.id === contactId && entry.selectable);
    if (!object) return false;
    if (station === 'tactical') {
      this.state.stationSelections.tacticalContactId = contactId;
      if (contactId !== this.enemyActual.id) {
        this.state.tactical.lock.status = 'idle';
        this.state.tactical.torpedoGuidance.status = 'idle';
      }
      this.log(`Tactical selected ${object.name}.`);
    } else if (station === 'science') {
      this.state.stationSelections.scienceContactId = contactId;
      this.log(`Science focused sensors on ${object.name}.`);
    } else if (station === 'communications') {
      this.state.stationSelections.communicationsContactId = contactId;
      this.state.communications.selectedContactId = contactId;
      this.log(`Communications selected ${object.name}.`);
    } else {
      this.state.stationSelections.helmContactId = contactId;
      this.state.helm.selectedContactId = contactId;
      this.log(`Helm selected ${object.name} for relative navigation.`);
    }
    return true;
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
      case 'selectMission':
        return this.selectMission(command.missionId);
      case 'issueOrder':
        return this.issueOrder(command.role, command.order);
      case 'captainTextOrder':
        return this.handleCaptainTextOrder(command.text);
      case 'issueHeadingOrder':
        return this.issueHeadingOrder(command.heading);
      case 'issueNavigationTargetOrder':
        return this.issueNavigationTargetOrder(command.contactId);
      case 'setHeading':
        if (!Number.isFinite(command.heading)) return false;
        if (actor.kind === 'human') this.disengageHelmAssistForManualControl();
        this.setHeading(command.heading);
        break;
      case 'setThrottle':
        if (!Number.isFinite(command.throttle)) return false;
        if (actor.kind === 'human') this.disengageHelmAssistForManualControl();
        this.setThrottle(command.throttle);
        break;
      case 'setLateralThrust':
        if (!Number.isFinite(command.thrust)) return false;
        this.setLateralThrust(command.thrust);
        break;
      case 'selectHelmContact':
        return this.selectStationContact('helm', command.contactId);
      case 'setHelmManeuver':
        return this.setHelmManeuver(command.maneuver);
      case 'setHelmAssist':
        return this.setHelmAssist(command.enabled);
      case 'setHelmOrbitRange':
        return this.setHelmOrbitRange(command.range);
      case 'setPower':
        if (!Number.isFinite(command.value)) return false;
        this.setPower(command.system, command.value);
        break;
      case 'setRepairTarget':
        return this.setRepairTarget(command.system);
      case 'assignRepairCrew':
        return this.assignRepairCrew(command.crewId, command.system);
      case 'setRepairCrewAuto':
        return this.setRepairCrewAuto(command.crewId, command.enabled);
      case 'engineeringTestSetSystem':
        return this.engineeringTestSetSystem(command.system, command.health);
      case 'engineeringPuzzleAction':
        return this.handleEngineeringPuzzleAction(command);
      case 'fireBeam':
        this.fireBeam();
        break;
      case 'fireTorpedo':
        this.fireTorpedo();
        break;
      case 'selectEnemyTarget':
        return this.selectEnemyTarget(command.target);
      case 'selectTacticalContact':
        return this.selectStationContact('tactical', command.contactId);
      case 'startTargetLock':
        return this.startTargetLock();
      case 'setTargetLockAxis':
        return this.setTargetLockAxis(command.axis, command.value);
      case 'verifyTargetLock':
        return this.verifyTargetLock();
      case 'syncBeamCapacitor':
        return this.syncBeamCapacitor();
      case 'startTorpedoGuidance':
        return this.startTorpedoGuidance();
      case 'markTorpedoGuidance':
        return this.markTorpedoGuidance();
      case 'scanTarget':
        this.startScan();
        break;
      case 'selectScienceContact':
        return this.selectStationContact('science', command.contactId);
      case 'selectCommunicationsContact':
        return this.selectStationContact('communications', command.contactId);
      case 'beginTacticalAnalysis':
        return this.beginTacticalAnalysis();
      case 'selectTransmission':
        return this.selectTransmission(command.transmissionId);
      case 'setCommsTuner':
        return this.setCommsTuner(command.value);
      case 'setCommsFilter':
        return this.setCommsFilter(command.value);
      case 'verifyCommsSignal':
        return this.verifyCommsSignal();
      case 'sendTransmissionResponse':
        return this.sendTransmissionResponse(command.transmissionId, command.responseId);
      case 'toggleCommsJamming':
        return this.toggleCommsJamming(command.contactId);
      case 'startCommsIntercept':
        return this.startCommsIntercept(command.contactId);
      case 'hailContact':
        return this.hailFriendlyContact();
      case 'sendCommsResponse':
        return this.sendFriendlyResponse(command.response);
    }
    return true;
  }

  tick(dt: number) {
    this.state.serverTime = Date.now();
    this.syncSpaceObjects();
    this.updateCaptainNavigationCourse();
    this.updateHelmFlightDirector();
    this.aiBeamCooldown = Math.max(0, this.aiBeamCooldown - dt);
    this.aiTorpedoCooldown = Math.max(0, this.aiTorpedoCooldown - dt);
    this.aiPrecisionLockTimer = Math.max(0, this.aiPrecisionLockTimer - dt);
    this.aiEngineeringCooldown = Math.max(0, this.aiEngineeringCooldown - dt);
    this.communicationsCooldown = Math.max(0, this.communicationsCooldown - dt);
    this.updateRepairBoosts(dt);
    this.updateRepairCrews(dt);
    this.manageAutoRepairCrews();
    this.updateTacticalDerivedState();
    this.updateTacticalSkillTimers(dt);
    this.updateCommunicationsSystems(dt);
    this.updateEngineeringPuzzleAi(dt);

    if (this.state.missionStatus !== 'running') {
      this.syncEnemyPublicState();
      return;
    }

    if (this.state.missionId === 'meridian-distress') {
      this.aiDecisionAccumulator += dt;
      if (this.aiDecisionAccumulator >= 0.25) { this.aiDecisionAccumulator = 0; this.runAiCrew(); }
      this.updateShipMovement(dt);
      this.updateRepair(dt);
      this.updateDistressMission(dt);
      this.syncSpaceObjects();
      this.updateCaptainNavigationCourse();
      this.updateHelmFlightDirector();
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
    this.updateTacticalAnalysis(dt);
    this.updateShipMovement(dt);
    this.updateMissionStageByRange();
    this.enemyBehavior(dt);
    this.updateRepair(dt);
    this.resolveEncounterEnd();
    this.syncSpaceObjects();
    this.updateCaptainNavigationCourse();
    this.updateHelmFlightDirector();
    this.syncEnemyPublicState();
  }

  private runAiCrew() {
    this.runAiScience();
    this.runAiHelm();
    this.runAiEngineering();
    this.runAiTactical();
    this.runAiCommunications();
  }

  private runAiScience() {
    if (!this.isAiControlled('science')) return;
    if (this.state.missionId === 'meridian-distress') {
      this.setAiStatus('science', this.state.missionStage === 'assist' ? 'Monitoring Meridian life support' : 'Tracking civilian distress contact');
      return;
    }
    if (!this.enemyActual.alive) return;
    const order = this.orderFor('science');

    if (order === 'passive') {
      this.state.sensors.scanActive = false;
      this.state.sensors.tacticalAnalysisActive = false;
      this.setAiStatus('science', 'Passive sensors only');
      return;
    }

    if (this.state.sensors.intelLevel < 2) {
      if (!this.state.sensors.scanActive) {
        this.executeCommand({ kind: 'ai', role: 'science' }, { type: 'scanTarget' });
      }
      this.setAiStatus('science', `Scanning contact • ${Math.round(this.state.sensors.scanProgress)}%`);
      return;
    }

    if (!this.state.sensors.systemsMapped) {
      if (!this.state.sensors.tacticalAnalysisActive) {
        this.executeCommand({ kind: 'ai', role: 'science' }, { type: 'beginTacticalAnalysis' });
      }
      this.setAiStatus('science', `Tactical analysis • ${Math.round(this.state.sensors.tacticalAnalysisProgress)}%`);
    } else {
      this.setAiStatus('science', `Tactical profile linked to weapons • ${this.enemyActual.trueName}`);
    }
  }

  private runAiHelm() {
    if (!this.isAiControlled('helm')) return;
    const useManualAiFlight = () => {
      if (this.state.helm.assistEnabled) this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHelmAssist', enabled: false });
      if (this.state.helm.maneuver !== 'manual') this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHelmManeuver', maneuver: 'manual' });
      if (this.state.ship.lateralThrust !== 0) this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setLateralThrust', thrust: 0 });
    };
    const captainTarget = this.captainNavigationObject();
    if (captainTarget && this.state.captainHeadingOrder !== null) {
      useManualAiFlight();
      const targetRange = Math.hypot(captainTarget.x - this.state.ship.x, captainTarget.y - this.state.ship.y);
      const arrivalRange = captainTarget.objectType === 'ship' ? 7.5 : Math.max(4, captainTarget.radius + 2.5);
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: this.state.captainHeadingOrder });
      if (targetRange > arrivalRange + 8) this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 65 });
      else if (targetRange > arrivalRange) this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 30 });
      else this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 0 });
      this.setAiStatus('helm', targetRange <= arrivalRange
        ? `On station near ${captainTarget.name} • ${targetRange.toFixed(1)} km`
        : `Tracking ${captainTarget.name} • bearing ${Math.round(this.state.captainHeadingOrder).toString().padStart(3, '0')}° • ${targetRange.toFixed(1)} km`);
      return;
    }
    if (this.state.captainHeadingOrder !== null) {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: this.state.captainHeadingOrder });
      this.setAiStatus('helm', `Captain heading ${Math.round(this.state.captainHeadingOrder).toString().padStart(3, '0')}°`);
      return;
    }
    if (this.state.missionId === 'meridian-distress' && this.state.friendlyContact) {
      useManualAiFlight();
      const ship = this.state.ship;
      const contact = this.state.friendlyContact;
      const dx = contact.x - ship.x;
      const dy = contact.y - ship.y;
      const friendlyRange = Math.hypot(dx, dy);
      const bearing = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
      if (this.state.missionStage === 'rendezvous' && friendlyRange > 7.5) {
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearing });
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: friendlyRange > 14 ? 62 : 30 });
        this.setAiStatus('helm', `Rendezvous with Meridian • ${friendlyRange.toFixed(1)} km`);
      } else {
        this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 0 });
        this.setAiStatus('helm', this.state.missionStage === 'assist' ? 'Holding alongside Meridian' : 'Holding for communications');
      }
      return;
    }
    if (!this.enemyActual.alive) return;

    const ship = this.state.ship;
    const enemy = this.enemyActual;
    const dx = enemy.x - ship.x;
    const dy = enemy.y - ship.y;
    const range = Math.hypot(dx, dy);
    const bearingToEnemy = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
    const order = this.orderFor('helm');

    if (order === 'hold') {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 0 });
      this.setAiStatus('helm', 'Holding position by captain order');
      return;
    }

    if (order === 'evade') {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 180 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 85 });
      this.setAiStatus('helm', `Evasive withdrawal • ${range.toFixed(1)} km`);
      return;
    }

    if (this.state.missionStage === 'investigate' && order !== 'intercept') {
      useManualAiFlight();
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

    if (this.state.sensors.systemsMapped) {
      if (this.state.stationSelections.helmContactId !== enemy.id) this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'selectHelmContact', contactId: enemy.id });
      const maneuver: HelmManeuver = range > 18 ? 'intercept' : 'takeStern';
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHelmManeuver', maneuver });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHelmAssist', enabled: true });
      this.setAiStatus('helm', maneuver === 'takeStern' ? `Working toward hostile stern • ${range.toFixed(1)} km` : `Lead intercept • ${range.toFixed(1)} km`);
    } else if (range > 13) {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: range > 18 ? 78 : 48 });
      this.setAiStatus('helm', `Closing on target • ${range.toFixed(1)} km`);
    } else if (range < 8.5) {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 180 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 38 });
      this.setAiStatus('helm', `Opening range • ${range.toFixed(1)} km`);
    } else {
      useManualAiFlight();
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setHeading', heading: bearingToEnemy + 70 });
      this.executeCommand({ kind: 'ai', role: 'helm' }, { type: 'setThrottle', throttle: 24 });
      this.setAiStatus('helm', `Combat positioning • ${range.toFixed(1)} km`);
    }
  }

  private runAiEngineering() {
    if (!this.isAiControlled('engineering') || this.aiEngineeringCooldown > 0) return;

    this.manageAiRepairCrews();
    const damaged = (Object.entries(this.state.systems) as Array<[SystemName, number]>).sort((a, b) => a[1] - b[1])[0];
    if (damaged && damaged[1] < 92 && this.state.repairTarget !== damaged[0]) this.executeCommand({ kind: 'ai', role: 'engineering' }, { type: 'setRepairTarget', system: damaged[0] });
    if (this.state.missionId === 'meridian-distress' && this.state.missionStage === 'assist') {
      this.setAiStatus('engineering', 'Coordinating emergency support transfer');
      this.aiEngineeringCooldown = 1.25;
      return;
    }

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
    if (!this.isAiControlled('tactical')) return;
    if (this.state.missionId === 'meridian-distress') {
      this.setAiStatus('tactical', 'Weapons safed • civilian assistance mission');
      return;
    }
    if (!this.enemyActual.alive) return;
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

    if (this.state.sensors.systemsMapped) {
      let desired: TacticalTarget = 'hull';
      if (this.enemyActual.shields > 5 && this.enemyActual.systems.shields > 0) desired = 'shields';
      else if (this.enemyActual.systems.weapons > 15) desired = 'weapons';
      else if (this.enemyActual.hull > 45 && this.enemyActual.systems.engines > 20) desired = 'engines';
      if (this.state.tactical.selectedTarget !== desired) {
        this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'selectEnemyTarget', target: desired });
      }

      if (desired !== 'hull' && range <= 20) {
        const lock = this.state.tactical.lock;
        if (lock.target !== desired || lock.status === 'idle') {
          if (this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'startTargetLock' })) {
            this.aiPrecisionLockTimer = 6 + this.random() * 3;
          }
        } else if (lock.status === 'aligning' && this.aiPrecisionLockTimer <= 0) {
          for (const axis of lock.axes) {
            this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'setTargetLockAxis', axis: axis.axis, value: axis.target });
          }
          this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'verifyTargetLock' });
        }
      }
    } else if (this.state.tactical.selectedTarget !== 'hull') {
      this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'selectEnemyTarget', target: 'hull' });
    }

    if (range > ACTIVE_SHIP_PROFILE.weapons.torpedoRange) {
      this.setAiStatus('tactical', `Tracking target • ${range.toFixed(1)} km`);
      return;
    }

    const lock = this.state.tactical.lock;
    const targetText = this.state.tactical.selectedTarget === 'hull'
      ? 'general hull'
      : lock.status === 'locked'
        ? `${this.state.tactical.selectedTarget} lock ${lock.quality}%`
        : `${this.state.tactical.selectedTarget} lock acquiring`;

    // AI Tactical uses the same optional skill systems as a human, but does not
    // hold up basic weapons fire waiting for a perfect result.
    const guidance = this.state.tactical.torpedoGuidance;
    if (ship.torpedoes > 0 && range <= ACTIVE_SHIP_PROFILE.weapons.torpedoRange) {
      if (guidance.status === 'idle' && this.aiTorpedoCooldown > 1.1) {
        this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'startTorpedoGuidance' });
      } else if (guidance.status === 'guiding') {
        const gate = guidance.gates[guidance.stage];
        if (gate !== undefined && circularDistance(guidance.phase, gate) <= 10) {
          this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'markTorpedoGuidance' });
        }
      }
    }

    const beamTiming = this.state.tactical.beamTiming;
    if (range <= ACTIVE_SHIP_PROFILE.weapons.beamRange && this.enemyWithinWeaponArc(ACTIVE_SHIP_PROFILE.weapons.beamArcDegrees) && ship.beamCharge >= 25 && beamTiming.status === 'idle' && circularDistance(beamTiming.phase, beamTiming.sweetSpot) <= 8) {
      this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'syncBeamCapacitor' });
    }

    if (range > ACTIVE_SHIP_PROFILE.weapons.beamRange || !this.enemyWithinWeaponArc(ACTIVE_SHIP_PROFILE.weapons.beamArcDegrees)) {
      if (ship.torpedoes > 0 && this.aiTorpedoCooldown <= 0) {
        this.executeCommand({ kind: 'ai', role: 'tactical' }, { type: 'fireTorpedo' });
        this.aiTorpedoCooldown = 4.5;
        this.setAiStatus('tactical', `Long-range torpedo • ${targetText}`);
      } else {
        this.setAiStatus('tactical', `Tracking ${targetText} • ${range.toFixed(1)} km`);
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
    this.setAiStatus('tactical', fired ? `Weapons free • ${targetText}` : `Tracking ${targetText}`);
  }

  private runAiCommunications() {
    if (!this.isAiControlled('communications') || this.communicationsCooldown > 0) return;
    const order = this.orderFor('communications');
    const ew = this.state.communications.electronicWarfare;
    if (order === 'silent') {
      if (ew.jammingActive) this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'toggleCommsJamming', contactId: null });
      this.setAiStatus('communications', 'Radio silence');
      return;
    }

    const pending = this.state.communications.transmissions.find((entry) => entry.status !== 'resolved');
    if (pending) {
      this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'selectTransmission', transmissionId: pending.id });
      if (pending.status !== 'open') {
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'setCommsTuner', value: pending.frequency });
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'setCommsFilter', value: pending.filterTarget });
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'verifyCommsSignal' });
        this.setAiStatus('communications', `Locking ${pending.sourceName} carrier`);
        this.communicationsCooldown = 2.5;
        return;
      }
      if (pending.kind === 'distress' && pending.responses.some((entry) => entry.id === 'acknowledge')) {
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'sendTransmissionResponse', transmissionId: pending.id, responseId: 'acknowledge' });
        this.setAiStatus('communications', 'Distress acknowledged • channel open');
        this.communicationsCooldown = 2;
        return;
      }
      if (pending.responses.length) {
        const responseId = pending.kind === 'intercept' ? pending.responses[0].id : (pending.responses.find((entry) => entry.id === 'no-response')?.id ?? pending.responses[0].id);
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'sendTransmissionResponse', transmissionId: pending.id, responseId });
        this.setAiStatus('communications', `Traffic logged from ${pending.sourceName}`);
        this.communicationsCooldown = 2;
        return;
      }
    }

    if (this.state.missionId === 'signal-dark' && this.state.sensors.intelLevel >= 1 && this.enemyActual.alive) {
      if (!ew.interceptActive && !ew.interceptIntel) {
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'startCommsIntercept', contactId: this.enemyActual.id });
        this.setAiStatus('communications', `Intercepting ${this.enemyActual.trueName}`);
      } else if ((this.state.missionStage === 'combat' || order === 'monitor') && !ew.jammingActive) {
        this.executeCommand({ kind: 'ai', role: 'communications' }, { type: 'toggleCommsJamming', contactId: this.enemyActual.id });
        this.setAiStatus('communications', `Jamming ${this.enemyActual.trueName}`);
      } else {
        this.setAiStatus('communications', ew.jammingActive ? `Jamming ${this.enemyActual.trueName}` : `Monitoring ${this.enemyActual.trueName}`);
      }
    } else if (this.state.friendlyContact) {
      this.setAiStatus('communications', `Monitoring ${this.state.friendlyContact.name}`);
    } else {
      this.setAiStatus('communications', order === 'monitor' ? 'Monitoring priority channels' : 'Routine communications watch');
    }
    this.communicationsCooldown = 2;
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
    // A maneuver order supersedes any older fixed compass heading. HOLD can be
    // used while retaining an explicit heading for a human Helm to reference.
    if (role === 'helm' && (order === 'intercept' || order === 'evade' || order === 'auto')) {
      this.state.captainHeadingOrder = null;
      this.state.captainNavigationTargetId = null;
    }
    const recipient = slot.controller === 'ai' ? slot.aiOfficerName : slot.playerName ?? role.toUpperCase();
    this.log(`CAPTAIN ORDER → ${role.toUpperCase()}: ${roleOrderLabel(order)} (${recipient}).`);
    this.acknowledgeOrder(role, order);
    return true;
  }

  private issueHeadingOrder(heading: number | null): boolean {
    // An exact compass course replaces any prior target-tracking order.
    this.state.captainNavigationTargetId = null;
    if (heading === null) {
      this.state.captainHeadingOrder = null;
      this.log('CAPTAIN ORDER → HELM: Navigation course order cleared.');
      this.comms('helm', AI_OFFICERS.helm, 'Navigation course order cleared, Captain.', 'ack');
      return true;
    }
    if (!Number.isFinite(heading)) return false;
    const normalized = normalizeHeading(heading);
    const helmSlot = this.roleSlot('helm');
    if (helmSlot) helmSlot.captainOrder = 'auto';
    this.state.captainHeadingOrder = normalized;
    this.log(`CAPTAIN ORDER → HELM: Steer heading ${Math.round(normalized).toString().padStart(3, '0')}°.`);
    this.comms('helm', AI_OFFICERS.helm, `Aye, Captain. Ordered heading ${Math.round(normalized).toString().padStart(3, '0')} degrees.`, 'ack');
    return true;
  }

  private captainNavigationObject(contactId = this.state.captainNavigationTargetId): SpaceObjectState | null {
    if (!contactId) return null;
    return this.state.spaceObjects.find((object) => object.id === contactId && object.selectable && object.alive && object.identified) ?? null;
  }

  private bearingToSpaceObject(object: SpaceObjectState): number {
    return normalizeHeading(Math.atan2(object.x - this.state.ship.x, object.y - this.state.ship.y) * 180 / Math.PI);
  }

  private issueNavigationTargetOrder(contactId: string | null): boolean {
    if (contactId === null) {
      const previous = this.captainNavigationObject();
      this.state.captainNavigationTargetId = null;
      this.state.captainHeadingOrder = null;
      this.log(`CAPTAIN ORDER → HELM: ${previous ? `Course to ${previous.name} cleared.` : 'Navigation target cleared.'}`);
      this.comms('helm', AI_OFFICERS.helm, 'Target-tracking course cleared, Captain.', 'ack');
      return true;
    }

    this.syncSpaceObjects();
    const object = this.state.spaceObjects.find((entry) => entry.id === contactId && entry.selectable && entry.alive);
    if (!object || !object.identified || object.disposition === 'player') {
      this.log('CAPTAIN: Navigation target unavailable. Science must identify the contact before Helm can track it.');
      return false;
    }

    const helmSlot = this.roleSlot('helm');
    if (helmSlot) helmSlot.captainOrder = 'auto';
    this.state.captainNavigationTargetId = object.id;
    this.state.captainHeadingOrder = this.bearingToSpaceObject(object);
    this.log(`CAPTAIN ORDER → HELM: Set tracking course to ${object.name}.`);
    this.comms('helm', AI_OFFICERS.helm, `Aye, Captain. Tracking course laid in for ${object.name}. I will continuously update the bearing as the contact moves.`, 'ack');
    return true;
  }

  private updateCaptainNavigationCourse() {
    if (!this.state.captainNavigationTargetId) return;
    const object = this.captainNavigationObject();
    if (!object) {
      this.state.captainNavigationTargetId = null;
      this.state.captainHeadingOrder = null;
      this.log('HELM: Captain navigation target is no longer available. Tracking course cleared.');
      return;
    }
    this.state.captainHeadingOrder = this.bearingToSpaceObject(object);
  }

  private handleCaptainTextOrder(rawText: string): boolean {
    const text = rawText.trim().slice(0, 220);
    if (!text) return false;

    const captainName = this.roleSlot('captain')?.playerName ?? 'Captain';
    this.comms('captain', captainName, text, 'captain');

    const headingMatch = text.match(/\b(?:helm|navigation|pilot)?[^.]{0,30}\b(?:heading|course)\s*(?:to\s*)?(\d{1,3})\b/i);
    if (headingMatch) {
      const heading = Number(headingMatch[1]);
      if (heading >= 0 && heading <= 359) return this.issueHeadingOrder(heading);
    }

    if (/\b(?:clear|cancel)\b[^.]{0,30}\b(?:course|navigation target|tracking)\b/i.test(text)) {
      return this.issueNavigationTargetOrder(null);
    }

    if (/\b(?:course|navigate|proceed|head|track)\b[^.]{0,60}\b(?:to|toward|for)\b/i.test(text)) {
      this.syncSpaceObjects();
      const eligible = this.state.spaceObjects.filter((object) => object.selectable && object.alive && object.identified && object.disposition !== 'player');
      const lower = text.toLowerCase();
      const named = [...eligible].sort((a, b) => b.name.length - a.name.length).find((object) => lower.includes(object.name.toLowerCase()));
      if (named) return this.issueNavigationTargetOrder(named.id);
      if (/\b(?:target|contact)\b/i.test(text)) {
        const preferredIds = [this.state.stationSelections.scienceContactId, this.state.stationSelections.tacticalContactId];
        const preferred = preferredIds.map((id) => eligible.find((object) => object.id === id)).find(Boolean);
        if (preferred) return this.issueNavigationTargetOrder(preferred.id);
      }
    }

    if (/\b(status|sitrep|report)\b/i.test(text)) {
      this.sendStatusReport();
      return true;
    }

    const parsed = this.parseCaptainOrders(text);
    if (parsed.length === 0) {
      this.comms(
        'computer',
        'Bridge Computer',
        'Order not understood. Try naming a station and action, such as “Helm, intercept”, “Tactical, hold fire”, “Engineering, shields”, “Science, scan”, or “Communications, hail”.',
        'system'
      );
      return true;
    }

    let accepted = false;
    for (const item of parsed) {
      accepted = this.issueOrder(item.role, item.order) || accepted;
    }
    return accepted;
  }

  private parseCaptainOrders(text: string): Array<{ role: OperationalRole; order: CrewOrder }> {
    const lower = text.toLowerCase();
    const results: Array<{ role: OperationalRole; order: CrewOrder }> = [];
    const push = (role: OperationalRole, order: CrewOrder | null) => {
      if (!order || results.some((item) => item.role === role)) return;
      results.push({ role, order });
    };

    const aliases: Record<OperationalRole, RegExp> = {
      helm: /\b(helm|navigation|pilot)\b/,
      tactical: /\b(tactical|weapons?|gunnery)\b/,
      engineering: /\b(engineering|engineer|power)\b/,
      science: /\b(science|sensors?|scanner)\b/,
      communications: /\b(communications?|comms?|radio)\b/
    };
    const segments = lower
      .split(/[;.]+|\band\s+(?=(?:helm|navigation|pilot|tactical|gunnery|engineering|engineer|science|sensor|scanner|communications?|comms?|radio)\b)/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    const contextFor = (role: OperationalRole) => segments.find((segment) => aliases[role].test(segment)) ?? lower;
    const hasRole = (role: OperationalRole) => aliases[role].test(lower);

    const parseHelm = (source = contextFor('helm')) => {
      if (/\b(evade|evasive|withdraw|retreat|back off|open range)\b/.test(source)) return 'evade' as CrewOrder;
      if (/\b(hold position|hold course|stop|all stop|maintain position)\b/.test(source)) return 'hold' as CrewOrder;
      if (/\b(intercept|close|pursue|approach|chase|engage course)\b/.test(source)) return 'intercept' as CrewOrder;
      if (/\b(auto|automatic|standard)\b/.test(source)) return 'auto' as CrewOrder;
      return null;
    };
    const parseTactical = (source = contextFor('tactical')) => {
      if (/\b(hold fire|cease fire|weapons hold|do not fire|don't fire)\b/.test(source)) return 'holdFire' as CrewOrder;
      if (/\b(weapons free|open fire|fire at will|engage|attack)\b/.test(source)) return 'weaponsFree' as CrewOrder;
      if (/\b(auto|automatic|standard)\b/.test(source)) return 'auto' as CrewOrder;
      return null;
    };
    const parseEngineering = (source = contextFor('engineering')) => {
      if (/\b(shields?|defen[cs]e|defensive)\b/.test(source)) return 'shields' as CrewOrder;
      if (/\b(weapons?|weapon power|capacitors?)\b/.test(source)) return 'weapons' as CrewOrder;
      if (/\b(engines?|engine power|speed|propulsion)\b/.test(source)) return 'engines' as CrewOrder;
      if (/\b(balance|balanced|even power|normal power)\b/.test(source)) return 'balanced' as CrewOrder;
      if (/\b(auto|automatic|standard)\b/.test(source)) return 'auto' as CrewOrder;
      return null;
    };
    const parseScience = (source = contextFor('science')) => {
      if (/\b(passive|passive sensors|silent sensors)\b/.test(source)) return 'passive' as CrewOrder;
      if (/\b(scan|analy[sz]e|identify|resolve|active sensors?)\b/.test(source)) return 'scan' as CrewOrder;
      if (/\b(auto|automatic|standard)\b/.test(source)) return 'auto' as CrewOrder;
      return null;
    };
    const parseCommunications = (source = contextFor('communications')) => {
      if (/\b(silent|radio silence|do not hail|don't hail)\b/.test(source)) return 'silent' as CrewOrder;
      if (/\b(hail|open channel|contact them|answer)\b/.test(source)) return 'hail' as CrewOrder;
      if (/\b(monitor|listen|watch channels)\b/.test(source)) return 'monitor' as CrewOrder;
      if (/\b(auto|automatic|standard)\b/.test(source)) return 'auto' as CrewOrder;
      return null;
    };

    if (hasRole('helm')) push('helm', parseHelm());
    if (hasRole('tactical')) push('tactical', parseTactical());
    if (hasRole('engineering')) push('engineering', parseEngineering());
    if (hasRole('science')) push('science', parseScience());
    if (hasRole('communications')) push('communications', parseCommunications());

    if (results.length === 0) {
      if (/\b(hold position|all stop|intercept|pursue|evade|evasive|withdraw|retreat)\b/.test(lower)) push('helm', parseHelm(lower));
      else if (/\b(hold fire|cease fire|weapons free|open fire|fire at will)\b/.test(lower)) push('tactical', parseTactical(lower));
      else if (/\b(full power to shields|prioritize shields|power to engines|power to weapons|balanced power)\b/.test(lower)) push('engineering', parseEngineering(lower));
      else if (/\b(scan the|scan target|identify contact|active scan)\b/.test(lower)) push('science', parseScience(lower));
      else if (/\b(hail|open channel|radio silence|monitor channels)\b/.test(lower)) push('communications', parseCommunications(lower));
    }

    return results;
  }

  private sendStatusReport() {
    const range = this.state.friendlyContact
      ? Math.hypot(this.state.ship.x - this.state.friendlyContact.x, this.state.ship.y - this.state.friendlyContact.y)
      : this.rangeToEnemy();
    this.comms('helm', AI_OFFICERS.helm, `Range ${range.toFixed(1)} kilometers. Heading ${Math.round(this.state.ship.heading).toString().padStart(3, '0')}. Throttle ${Math.round(this.state.ship.throttle)} percent.`, 'report');
    this.comms('tactical', AI_OFFICERS.tactical, this.state.missionId === 'meridian-distress' ? 'Weapons safed for civilian rescue operations.' : `${this.state.sensors.intelLevel >= 1 ? `Tracking ${this.enemyActual.trueName}` : 'No verified target identification'}. Weapon output ${this.state.tactical.weaponOutputMultiplier.toFixed(2)} times nominal, target ${this.state.tactical.selectedTarget}, beam charge ${Math.round(this.state.ship.beamCharge)} percent, ${this.state.ship.torpedoes} torpedoes remaining.`, 'report');
    this.comms('engineering', AI_OFFICERS.engineering, `Shields ${Math.round(this.state.ship.shields)} percent, hull ${Math.round(this.state.ship.hull)} percent. Power distribution engines ${Math.round(this.state.ship.enginePower)}, shields ${Math.round(this.state.ship.shieldPower)}, weapons ${Math.round(this.state.ship.weaponPower)}.`, 'report');
    this.comms('science', AI_OFFICERS.science, `Sensor resolution ${Math.round(this.state.sensors.scanProgress)} percent. ${this.state.sensors.intelLevel >= 1 ? `${this.enemyActual.className} identified.` : 'Contact remains unresolved.'} ${this.state.sensors.shieldSolution ? `Shield resonance ${this.state.sensors.shieldFrequency}.` : 'Shield resonance unresolved.'} ${this.state.sensors.systemsMapped ? 'Subsystem map complete.' : `Tactical analysis ${Math.round(this.state.sensors.tacticalAnalysisProgress)} percent.`}`, 'report');
    this.comms('communications', AI_OFFICERS.communications, this.state.friendlyContact ? `Channel status ${this.state.friendlyContact.hailStatus}. ${this.state.friendlyContact.name}: ${this.state.friendlyContact.status}.` : 'No active friendly or civilian channels requiring response.', 'report');
  }

  private acknowledgeOrder(role: OperationalRole, order: CrewOrder) {
    const slot = this.roleSlot(role);
    if (!slot) return;
    if (slot.controller === 'human') {
      this.comms('computer', 'Bridge Computer', `Order relayed to ${slot.playerName ?? role.toUpperCase()} at ${role.toUpperCase()}.`, 'system');
      return;
    }

    const messages: Record<OperationalRole, Partial<Record<CrewOrder, string>>> = {
      helm: {
        auto: 'Aye, Captain. Returning to standard helm profile.',
        intercept: 'Aye, Captain. Intercept course laid in.',
        hold: 'Aye, Captain. Holding position.',
        evade: 'Aye, Captain. Beginning evasive withdrawal.'
      },
      tactical: {
        auto: 'Aye, Captain. Tactical returning to standard engagement rules.',
        weaponsFree: 'Weapons free. I will engage when I have a firing solution.',
        holdFire: 'Holding fire, Captain.'
      },
      engineering: {
        auto: 'Aye, Captain. Returning power management to automatic.',
        balanced: 'Power distribution balanced.',
        shields: 'Routing priority power to shields.',
        weapons: 'Prioritizing weapon capacitors.',
        engines: 'Prioritizing engine power.'
      },
      science: {
        auto: 'Aye, Captain. Standard sensor doctrine resumed.',
        scan: 'Beginning active scan, Captain.',
        passive: 'Switching to passive sensors.'
      },
      communications: {
        auto: 'Aye, Captain. Standard communications watch resumed.',
        monitor: 'Monitoring all civilian and priority channels.',
        hail: 'Aye, Captain. I will open a channel to the active contact.',
        silent: 'Radio silence established.'
      }
    };

    this.comms(role, slot.aiOfficerName, messages[role][order] ?? `${roleOrderLabel(order)} order acknowledged.`, 'ack');
  }

  private selectMission(missionId: MissionId): boolean {
    if (this.state.missionStatus !== 'briefing') return false;
    if (missionId !== 'signal-dark' && missionId !== 'meridian-distress') return false;
    this.selectedMission = missionId;
    this.resetMission();
    this.comms('computer', 'Bridge Computer', `Mission selected: ${this.state.missionTitle}.`, 'system');
    return true;
  }

  private createRepairCrews(): RepairCrewState[] {
    const callSigns = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    return Array.from({ length: ACTIVE_SHIP_PROFILE.repairCrews.count }, (_, index) => ({
      id: `repair-${index + 1}`,
      name: `Repair Crew ${callSigns[index] ?? index + 1}`,
      status: 'idle' as const,
      system: null,
      destinationSystem: null,
      travelRemaining: 0,
      autoDispatch: ACTIVE_SHIP_PROFILE.repairCrews.autoDispatchDefault
    }));
  }

  private repairCrewTravelTime(crew: RepairCrewState, destination: SystemName): number {
    return repairCrewTransitSeconds(ACTIVE_SHIP_PROFILE, crew.system, destination);
  }

  private sendRepairCrew(crew: RepairCrewState, system: SystemName | null, preserveAuto = false): boolean {
    if (crew.status === 'dead') return false;
    if (system !== null && !(system in this.state.systems)) return false;
    if (!preserveAuto) crew.autoDispatch = false;

    if (system === null) {
      if (crew.status !== 'idle') this.log(`ENGINEERING: ${crew.name} released to damage-control standby.`);
      crew.status = 'idle';
      crew.system = null;
      crew.destinationSystem = null;
      crew.travelRemaining = 0;
      return true;
    }

    if ((crew.status === 'working' && crew.system === system) || (crew.status === 'traveling' && crew.destinationSystem === system)) return true;

    const seconds = this.repairCrewTravelTime(crew, system);
    crew.status = 'traveling';
    crew.system = null;
    crew.destinationSystem = system;
    crew.travelRemaining = seconds;
    this.log(`ENGINEERING: ${crew.name} dispatched to ${system.toUpperCase()} • ETA ${seconds.toFixed(0)} sec.${crew.autoDispatch ? ' AUTO' : ''}`);
    return true;
  }

  private assignRepairCrew(crewId: string, system: SystemName | null): boolean {
    const crew = this.state.repairCrews.find((entry) => entry.id === crewId);
    if (!crew || crew.status === 'dead') return false;
    return this.sendRepairCrew(crew, system, false);
  }

  private setRepairCrewAuto(crewId: string, enabled: boolean): boolean {
    const crew = this.state.repairCrews.find((entry) => entry.id === crewId);
    if (!crew || crew.status === 'dead') return false;
    crew.autoDispatch = enabled;
    if (enabled) {
      this.log(`ENGINEERING: ${crew.name} set to automatic damage-control dispatch.`);
      this.manageAutoRepairCrews();
    } else {
      this.log(`ENGINEERING: ${crew.name} automatic dispatch disabled.`);
    }
    return true;
  }

  private manageAutoRepairCrews() {
    const systems = Object.entries(this.state.systems) as Array<[SystemName, number]>;
    const damaged = systems.filter(([, health]) => health < 100);
    const autoCrews = this.state.repairCrews.filter((crew) => crew.status !== 'dead' && crew.autoDispatch);
    if (!autoCrews.length) return;

    if (!damaged.length) {
      for (const crew of autoCrews) {
        const assigned = crew.status === 'traveling' ? crew.destinationSystem : crew.system;
        if (crew.status !== 'idle' && (!assigned || this.state.systems[assigned] >= 100)) this.sendRepairCrew(crew, null, true);
      }
      return;
    }

    // Count existing physical/committed crew assignments first. Auto crews stay on
    // a damaged compartment until it is restored, avoiding constant reshuffling.
    const committed = new Map<SystemName, number>();
    for (const crew of this.state.repairCrews) {
      if (crew.status === 'dead') continue;
      const assigned = crew.status === 'traveling' ? crew.destinationSystem : crew.system;
      if (!assigned || this.state.systems[assigned] >= 100) continue;
      committed.set(assigned, (committed.get(assigned) ?? 0) + 1);
    }

    for (const crew of autoCrews) {
      const assigned = crew.status === 'traveling' ? crew.destinationSystem : crew.system;
      if (assigned && this.state.systems[assigned] < 100) continue;

      // Prefer the lowest-health subsystem, but spread crews when several systems
      // are damaged so automatic mode does not leave secondary casualties ignored.
      const target = damaged
        .slice()
        .sort((a, b) => {
          const scoreA = a[1] + (committed.get(a[0]) ?? 0) * 18;
          const scoreB = b[1] + (committed.get(b[0]) ?? 0) * 18;
          return scoreA - scoreB;
        })[0]?.[0] ?? null;
      if (!target) continue;
      this.sendRepairCrew(crew, target, true);
      committed.set(target, (committed.get(target) ?? 0) + 1);
    }
  }

  private updateRepairCrews(dt: number) {
    for (const crew of this.state.repairCrews) {
      if (crew.status !== 'traveling' || !crew.destinationSystem) continue;
      crew.travelRemaining = Math.max(0, crew.travelRemaining - dt);
      if (crew.travelRemaining > 0) continue;
      const destination = crew.destinationSystem;
      crew.status = 'working';
      crew.system = destination;
      crew.destinationSystem = null;
      crew.travelRemaining = 0;
      this.log(`ENGINEERING: ${crew.name} arrived at ${destination.toUpperCase()} and is on station.`);
    }
  }

  private repairCrewMultiplier(count: number): number {
    if (count <= 0) return 0;
    return 1 + Math.max(0, count - 1) * ACTIVE_SHIP_PROFILE.repairCrews.additionalCrewEfficiency;
  }

  private updateRepairBoosts(dt: number) {
    for (const system of Object.keys(this.state.repairBoosts) as SystemName[]) {
      this.state.repairBoosts[system] = Math.max(0, this.state.repairBoosts[system] - dt);
    }
    const focused = this.state.repairTarget;
    const activeSystem = focused && this.state.repairBoosts[focused] > 0
      ? focused
      : (Object.entries(this.state.repairBoosts) as Array<[SystemName, number]>).find(([, remaining]) => remaining > 0)?.[0] ?? null;
    this.state.repairBoostSystem = activeSystem;
    this.state.repairBoostRemaining = activeSystem ? this.state.repairBoosts[activeSystem] : 0;
  }

  private applyRepairCrewCasualties(system: SystemName): number {
    let casualties = 0;
    for (const crew of this.state.repairCrews) {
      if (crew.status !== 'working' || crew.system !== system) continue;
      if (this.random() >= ACTIVE_SHIP_PROFILE.repairCrews.casualtyChance) continue;
      casualties += 1;
      crew.status = 'dead';
      crew.system = null;
      crew.destinationSystem = null;
      crew.travelRemaining = 0;
      this.log(`DAMAGE CONTROL CASUALTY: ${crew.name} lost in the ${system.toUpperCase()} compartment explosion.`);
      this.comms('engineering', AI_OFFICERS.engineering, `${crew.name} is not responding after the ${system} failure. Damage-control casualty confirmed.`, 'warning');
    }
    return casualties;
  }

  private manageAiRepairCrews() {
    if (!this.isAiControlled('engineering')) return;
    for (const crew of this.state.repairCrews) {
      if (crew.status === 'dead') continue;
      crew.autoDispatch = true;
    }
    this.manageAutoRepairCrews();
  }

  private discardEngineeringPuzzle(system: SystemName) {
    const puzzle = this.engineeringPuzzleBySystem.get(system);
    if (!puzzle) return;
    if (puzzle.type === 'junction') this.junctionSolutions.delete(puzzle.id);
    if (puzzle.type === 'breaker') this.breakerSolutions.delete(puzzle.id);
    this.engineeringPuzzleBySystem.delete(system);
  }

  private ensureEngineeringPuzzle(system: SystemName): EngineeringPuzzleState | null {
    const requiredMode = this.state.systems[system] <= 0 ? 'restoration' : 'quick';
    const existing = this.engineeringPuzzleBySystem.get(system);

    // Once issued, an unfinished diagnostic belongs to that subsystem until it
    // is solved (or the subsystem changes between online/offline repair tiers).
    // This is true even if ordinary repair has since nudged integrity above 75%.
    if (existing && existing.status === 'active' && existing.mode === requiredMode) return existing;
    if (existing) this.discardEngineeringPuzzle(system);
    if (this.state.systems[system] > 75) return null;

    const puzzle = this.generateEngineeringPuzzle(system);
    this.engineeringPuzzleBySystem.set(system, puzzle);
    return puzzle;
  }

  private hasActiveFocusedEngineeringPuzzle(): boolean {
    return Boolean(
      this.state.repairTarget
      && this.state.engineeringPuzzle
      && this.state.engineeringPuzzle.status === 'active'
      && this.state.engineeringPuzzle.system === this.state.repairTarget
    );
  }

  private setRepairTarget(system: SystemName | null): boolean {
    if (system !== null && !(system in this.state.systems)) return false;
    const changed = this.state.repairTarget !== system;
    this.state.repairTarget = system;
    this.state.repairProgress = 0;
    if (system === null) {
      // Clearing focus must not discard an unfinished diagnostic. Returning to
      // the subsystem later restores the same puzzle instance and progress.
      this.state.engineeringPuzzle = null;
      this.aiPuzzleTimer = 0;
      this.updateRepairBoosts(0);
      return true;
    }

    this.state.engineeringPuzzle = this.ensureEngineeringPuzzle(system);
    if (changed) this.aiPuzzleTimer = 0;
    this.updateRepairBoosts(0);
    this.log(`ENGINEERING: Diagnostic focus set to ${system.toUpperCase()}.`);
    return true;
  }


  private engineeringTestSetSystem(system: SystemName, health: number): boolean {
    if (!(system in this.state.systems) || !Number.isFinite(health)) return false;
    const next = clamp(Math.round(health), 0, 100);
    const focusedPuzzleBefore = this.hasActiveFocusedEngineeringPuzzle() ? this.state.engineeringPuzzle : null;
    this.state.systems[system] = next;
    if (system === 'shields' && next <= 0) this.state.ship.shields = 0;

    if (next >= 100) {
      this.discardEngineeringPuzzle(system);
      if (this.state.repairTarget === system) {
        this.state.repairTarget = null;
        this.state.engineeringPuzzle = null;
        this.state.repairProgress = 0;
        this.aiPuzzleTimer = 0;
      }
    } else {
      // Changing a system across the 0% boundary changes the required puzzle
      // tier, so replace only that subsystem's stored diagnostic.
      const existing = this.engineeringPuzzleBySystem.get(system);
      const neededMode = next <= 0 ? 'restoration' : 'quick';
      if (existing && existing.mode !== neededMode) this.discardEngineeringPuzzle(system);
      const puzzle = this.ensureEngineeringPuzzle(system);

      // A casualty elsewhere must not steal focus from a puzzle the Engineer is
      // actively solving. If there is no active puzzle, focus the drill target.
      const preserveOtherFocus = focusedPuzzleBefore && focusedPuzzleBefore.system !== system;
      if (!preserveOtherFocus) {
        this.state.repairTarget = system;
        this.state.engineeringPuzzle = puzzle;
        this.state.repairProgress = 0;
        this.state.repairBoosts[system] = 0;
        this.updateRepairBoosts(0);
        this.aiPuzzleTimer = 0;
      }
    }

    if (next <= 0) {
      this.log(`ENGINEERING DRILL: ${system.toUpperCase()} forced OFFLINE for restoration testing.`);
      this.comms('computer', 'Engineering Test Bench', `${system[0].toUpperCase()+system.slice(1)} forced offline. Critical restoration procedure generated.`, 'system');
    } else if (next >= 100) {
      this.log(`ENGINEERING DRILL: ${system.toUpperCase()} restored to 100%.`);
    } else {
      this.log(`ENGINEERING DRILL: ${system.toUpperCase()} set to ${next}% for repair testing.`);
    }
    return true;
  }

  private engineeringPuzzleRandom(id: number, system: SystemName): () => number {
    const systemIndex = ['engines', 'shields', 'weapons', 'sensors', 'communications'].indexOf(system) + 1;
    let seed = ((id * 2654435761) ^ (systemIndex * 2246822519) ^ Math.round(this.state.systems[system] * 1009)) >>> 0;
    if (seed === 0) seed = 0x9e3779b9;
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }

  private generateCircuitRoute(size: number, sourceIndex: number, sinkIndex: number, rng: () => number): number[] {
    type Direction = [number, number];
    const directions: Direction[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const shuffle = <T,>(items: T[]): T[] => {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };

    for (let attempt = 0; attempt < 28; attempt += 1) {
      const minLength = 7 + Math.floor(rng() * 4);
      const visited = new Set<number>([sourceIndex]);
      const path = [sourceIndex];
      const search = (index: number): boolean => {
        if (index === sinkIndex) return path.length >= minLength;
        if (path.length >= size * size) return false;
        const row = Math.floor(index / size), col = index % size;
        for (const [dr, dc] of shuffle(directions)) {
          const nr = row + dr, nc = col + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
          const next = nr * size + nc;
          if (visited.has(next)) continue;
          // Do not end immediately; force the route to wind through the board.
          if (next === sinkIndex && path.length + 1 < minLength) continue;
          visited.add(next);
          path.push(next);
          if (search(next)) return true;
          path.pop();
          visited.delete(next);
        }
        return false;
      };
      if (search(sourceIndex)) return [...path];
    }

    // Deterministic fallback: travel to an outer detour row, cross the board,
    // then return vertically to the sink row. This is always solvable.
    const sourceRow = Math.floor(sourceIndex / size);
    const sinkRow = Math.floor(sinkIndex / size);
    const candidates = [0, size - 1].filter((row) => row !== sourceRow || row !== sinkRow);
    const detourRow = candidates[Math.floor(rng() * candidates.length)] ?? 0;
    const path = [sourceIndex];
    let row = sourceRow;
    const verticalStep = detourRow > row ? 1 : -1;
    while (row !== detourRow) { row += verticalStep; path.push(row * size); }
    for (let col = 1; col < size; col += 1) path.push(detourRow * size + col);
    row = detourRow;
    const endStep = sinkRow > row ? 1 : -1;
    while (row !== sinkRow) { row += endStep; path.push(row * size + (size - 1)); }
    return path;
  }

  private generateEngineeringPuzzle(system: SystemName): EngineeringPuzzleState {
    const id = ++this.engineeringPuzzleSequence;
    const offline = this.state.systems[system] <= 0;
    const mode = offline ? 'restoration' as const : 'quick' as const;
    const quickTypes = ['breaker', 'coolant', 'fuse'] as const;
    const restorationTypes = ['circuit', 'junction'] as const;
    const type = offline
      ? restorationTypes[(this.restorationPuzzleSequence++) % restorationTypes.length]
      : quickTypes[(this.quickPuzzleSequence++) % quickTypes.length];

    if (type === 'breaker') {
      const rng = this.engineeringPuzzleRandom(id, system);
      const buses: number[] = [];
      while (buses.length < 5) {
        const bus = 1 + Math.floor(rng() * 9);
        if (!buses.includes(bus)) buses.push(bus);
      }
      const trippedCount = 2 + Math.floor(rng() * 2);
      const shuffled = [...buses].sort(() => rng() - 0.5);
      const trippedBuses = new Set(shuffled.slice(0, trippedCount));
      const breakers = buses.map((bus, index) => ({ id: `CB-${index + 1}`, bus, tripped: trippedBuses.has(bus), reset: false }));
      const solution = breakers.filter((entry) => entry.tripped).sort((a,b) => a.bus - b.bus).map((entry) => entry.id);
      this.breakerSolutions.set(id, solution);
      return { id, system, type, mode, status:'active', moves:0, strikes:0, breakers };
    }

    if (type === 'coolant') {
      const rng = this.engineeringPuzzleRandom(id, system);
      const coolantValves = Array.from({ length: 3 }, (_, index) => {
        const target = Math.floor(rng() * 4);
        let setting = Math.floor(rng() * 4);
        if (setting === target) setting = (setting + 1 + Math.floor(rng() * 3)) % 4;
        return { id:`V-${index + 1}`, setting, target };
      });
      return { id, system, type, mode, status:'active', moves:0, strikes:0, coolantValves };
    }

    if (type === 'fuse') {
      const rng = this.engineeringPuzzleRandom(id, system);
      const ratings = [10, 15, 20];
      const loads = ratings.map((rating) => {
        const low = rating === 10 ? 6.2 : rating === 15 ? 10.2 : 15.2;
        const high = rating - 0.4;
        return Number((low + rng() * (high - low)).toFixed(1));
      }).sort(() => rng() - 0.5);
      return {
        id, system, type, mode, status:'active', moves:0, strikes:0,
        fuseBays: loads.map((load, index) => ({ id:`bay-${index}`, load, installed:null })),
        fuseOptions:[10,15,20]
      };
    }

    if (type === 'circuit') {
      const size = 4;
      const rng = this.engineeringPuzzleRandom(id, system);
      const sourceRow = Math.floor(rng() * size);
      const sinkRow = Math.floor(rng() * size);
      const sourceIndex = sourceRow * size;
      const sinkIndex = sinkRow * size + (size - 1);
      const route = this.generateCircuitRoute(size, sourceIndex, sinkIndex, rng);
      const rotations = [0, 90, 180, 270] as const;
      type Direction = 'up' | 'right' | 'down' | 'left';
      const directionBetween = (from: number, to: number): Direction => {
        const fr = Math.floor(from / size), fc = from % size;
        const tr = Math.floor(to / size), tc = to % size;
        if (tr < fr) return 'up'; if (tr > fr) return 'down'; if (tc < fc) return 'left'; return 'right';
      };
      const tileFor = (a: Direction, b: Direction): { shape: CircuitTileState['shape']; rotation: 0 | 90 | 180 | 270 } => {
        const pair = new Set([a,b]);
        if (pair.has('left') && pair.has('right')) return { shape:'straight', rotation:0 };
        if (pair.has('up') && pair.has('down')) return { shape:'straight', rotation:90 };
        if (pair.has('up') && pair.has('right')) return { shape:'corner', rotation:0 };
        if (pair.has('right') && pair.has('down')) return { shape:'corner', rotation:90 };
        if (pair.has('down') && pair.has('left')) return { shape:'corner', rotation:180 };
        return { shape:'corner', rotation:270 };
      };
      const goals = new Map<number, { shape: CircuitTileState['shape']; rotation: 0|90|180|270 }>();
      route.forEach((index, routeIndex) => {
        const incoming: Direction = routeIndex === 0 ? 'left' : directionBetween(index, route[routeIndex - 1]);
        const outgoing: Direction = routeIndex === route.length - 1 ? 'right' : directionBetween(index, route[routeIndex + 1]);
        goals.set(index, tileFor(incoming, outgoing));
      });
      const circuitTiles: CircuitTileState[] = Array.from({ length:size*size }, (_, index) => {
        const goal = goals.get(index);
        const shape: CircuitTileState['shape'] = goal?.shape ?? (rng() < .48 ? 'straight' : 'corner');
        return { index, shape, rotation: rotations[Math.floor(rng() * rotations.length)] };
      });
      const minimumMisaligned = Math.max(5, Math.floor(route.length * .65));
      let misaligned = route.filter((index) => {
        const goal=goals.get(index)!; const tile=circuitTiles[index];
        return tile.shape === 'straight' ? tile.rotation % 180 !== goal.rotation % 180 : tile.rotation !== goal.rotation;
      }).length;
      for (const index of route) {
        if (misaligned >= minimumMisaligned) break;
        const goal=goals.get(index)!; const tile=circuitTiles[index];
        const aligned = tile.shape === 'straight' ? tile.rotation % 180 === goal.rotation % 180 : tile.rotation === goal.rotation;
        if (aligned) { tile.rotation = ((tile.rotation + 90) % 360) as 0|90|180|270; misaligned += 1; }
      }
      const puzzle: EngineeringPuzzleState = { id, system, type, mode, status:'active', moves:0, strikes:0, circuitTiles, circuitSize:size, circuitSourceIndex:sourceIndex, circuitSinkIndex:sinkIndex };
      if (this.circuitPuzzleSolved(puzzle)) {
        const tile=circuitTiles[route[Math.floor(route.length/2)]];
        tile.rotation=((tile.rotation+90)%360) as 0|90|180|270;
      }
      return puzzle;
    }

    const rng = this.engineeringPuzzleRandom(id, system);
    const profiles: JunctionProfile[] = ['cyan','amber','magenta','striped'];
    const protocols: JunctionProtocol[] = ['ALPHA','BETA','GAMMA'];
    const protocol = protocols[Math.floor(rng()*protocols.length)];
    const matrices: Record<JunctionProtocol, JunctionRuleCode[][]> = {
      ALPHA:[['I','E','A','K'],['K','R','I','E'],['A','K','R','I'],['E','I','K','R']],
      BETA:[['R','I','K','A'],['E','K','R','I'],['I','A','E','K'],['K','E','I','R']],
      GAMMA:[['A','R','I','E'],['I','E','K','R'],['R','I','A','K'],['E','K','R','I']]
    };
    const matrix=matrices[protocol];
    const junctionRules: JunctionRuleRow[] = profiles.map((profile,row)=>({ profile, offClear:matrix[row][0], litClear:matrix[row][1], offTagged:matrix[row][2], litTagged:matrix[row][3] }));
    const junctionContext: JunctionContextState = { checksum:10+Math.floor(rng()*90), auxiliaryOnline:rng()>=.5, reserve:35+Math.floor(rng()*51), protocol };
    const rulePasses=(code:JunctionRuleCode)=> code==='I' ? true : code==='K' ? false : code==='E' ? junctionContext.checksum%2===0 : code==='A' ? junctionContext.auxiliaryOnline : junctionContext.reserve>=60;
    let junctions: NonNullable<EngineeringPuzzleState['junctions']> = [];
    let solution=new Set<string>();
    for(let attempt=0;attempt<60;attempt+=1){
      junctions=Array.from({length:6},(_,index)=>({ id:`J${index+1}`, profile:profiles[Math.floor(rng()*profiles.length)], lamp:rng()>=.5, tagged:rng()>=.5, isolated:false }));
      solution=new Set(junctions.filter((junction)=>{ const row=junctionRules.find((entry)=>entry.profile===junction.profile)!; const code=junction.lamp ? (junction.tagged?row.litTagged:row.litClear) : (junction.tagged?row.offTagged:row.offClear); return rulePasses(code); }).map((junction)=>junction.id));
      if(solution.size>=2&&solution.size<=4) break;
    }
    this.junctionSolutions.set(id,solution);
    return { id, system, type:'junction', mode, status:'active', moves:0, strikes:0, junctions, junctionRules, junctionContext };
  }

  private handleEngineeringPuzzleAction(command: Extract<StationCommand, { type: 'engineeringPuzzleAction' }>): boolean {
    const puzzle = this.state.engineeringPuzzle;
    if (!puzzle || puzzle.status !== 'active' || puzzle.id !== command.puzzleId || puzzle.system !== this.state.repairTarget) return false;

    if (command.action === 'rotate' && puzzle.type === 'circuit') {
      const tile = puzzle.circuitTiles?.find((entry) => entry.index === command.index);
      if (!tile) return false;
      tile.rotation = ((tile.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      puzzle.moves += 1;
      if (this.circuitPuzzleSolved(puzzle)) this.completeEngineeringPuzzle('human');
      return true;
    }

    if (command.action === 'toggleJunction' && puzzle.type === 'junction') {
      const junction = puzzle.junctions?.find((entry) => entry.id === command.junctionId);
      if (!junction) return false;
      junction.isolated = !junction.isolated;
      puzzle.moves += 1;
      return true;
    }

    if (command.action === 'verifyJunctions' && puzzle.type === 'junction') {
      const expected = this.junctionSolutions.get(puzzle.id);
      if (!expected || !puzzle.junctions) return false;
      puzzle.moves += 1;
      const selected = new Set(puzzle.junctions.filter((entry) => entry.isolated).map((entry) => entry.id));
      const correct = selected.size === expected.size && [...expected].every((id) => selected.has(id));
      if (correct) this.completeEngineeringPuzzle('human');
      else puzzle.strikes += 1;
      return true;
    }

    if (command.action === 'installFuse' && puzzle.type === 'fuse') {
      const bay = puzzle.fuseBays?.find((entry) => entry.id === command.bayId);
      if (!bay || bay.installed !== null || !puzzle.fuseOptions?.includes(command.rating)) return false;
      if (puzzle.fuseBays?.some((entry) => entry.installed === command.rating)) return false;
      puzzle.moves += 1;
      const required = this.requiredFuseRating(bay.load);
      if (required === command.rating) {
        bay.installed = command.rating;
        if (puzzle.fuseBays?.every((entry) => entry.installed !== null)) this.completeEngineeringPuzzle('human');
      } else puzzle.strikes += 1;
      return true;
    }

    if (command.action === 'resetBreaker' && puzzle.type === 'breaker') {
      const breaker = puzzle.breakers?.find((entry) => entry.id === command.breakerId);
      const solution = this.breakerSolutions.get(puzzle.id);
      if (!breaker || !solution || !breaker.tripped || breaker.reset) return false;
      puzzle.moves += 1;
      const completed = puzzle.breakers?.filter((entry) => entry.reset).length ?? 0;
      if (solution[completed] === breaker.id) {
        breaker.reset = true;
        if ((puzzle.breakers?.filter((entry) => entry.tripped && !entry.reset).length ?? 0) === 0) this.completeEngineeringPuzzle('human');
      } else puzzle.strikes += 1;
      return true;
    }

    if (command.action === 'cycleCoolant' && puzzle.type === 'coolant') {
      const valve = puzzle.coolantValves?.find((entry) => entry.id === command.valveId);
      if (!valve) return false;
      valve.setting = (valve.setting + 1) % 4;
      puzzle.moves += 1;
      if (puzzle.coolantValves?.every((entry) => entry.setting === entry.target)) this.completeEngineeringPuzzle('human');
      return true;
    }

    return false;
  }

  private circuitPuzzleSolved(puzzle: EngineeringPuzzleState): boolean {
    const tiles = puzzle.circuitTiles;
    const size = puzzle.circuitSize ?? 3;
    if (!tiles || tiles.length !== size * size) return false;
    type Direction = 'up' | 'right' | 'down' | 'left';
    const opposite: Record<Direction, Direction> = { up: 'down', right: 'left', down: 'up', left: 'right' };
    const vector: Record<Direction, [number, number]> = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
    const connections = (tile: CircuitTileState): Direction[] => {
      if (tile.shape === 'straight') return tile.rotation % 180 === 0 ? ['left', 'right'] : ['up', 'down'];
      if (tile.rotation === 0) return ['up', 'right'];
      if (tile.rotation === 90) return ['right', 'down'];
      if (tile.rotation === 180) return ['down', 'left'];
      return ['left', 'up'];
    };

    const sourceIndex = puzzle.circuitSourceIndex ?? size;
    const sinkIndex = puzzle.circuitSinkIndex ?? (size * 2 - 1);
    if (!tiles[sourceIndex] || !tiles[sinkIndex] || !connections(tiles[sourceIndex]).includes('left')) return false;
    const queue = [sourceIndex];
    const visited = new Set<number>();
    while (queue.length) {
      const index = queue.shift()!;
      if (visited.has(index)) continue;
      visited.add(index);
      const tile = tiles[index];
      const row = Math.floor(index / size);
      const col = index % size;
      for (const direction of connections(tile)) {
        if (index === sinkIndex && direction === 'right') return true;
        const [dr, dc] = vector[direction];
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const nextIndex = nr * size + nc;
        if (connections(tiles[nextIndex]).includes(opposite[direction]) && !visited.has(nextIndex)) queue.push(nextIndex);
      }
    }
    return false;
  }

  private requiredFuseRating(load: number): number {
    return [10, 15, 20].find((rating) => rating >= load) ?? 20;
  }

  private completeEngineeringPuzzle(source: 'human' | 'ai') {
    const puzzle = this.state.engineeringPuzzle;
    if (!puzzle || puzzle.status !== 'active') return;
    puzzle.status = 'solved';
    if (puzzle.type === 'junction') this.junctionSolutions.delete(puzzle.id);
    if (puzzle.type === 'breaker') this.breakerSolutions.delete(puzzle.id);
    this.engineeringPuzzleBySystem.delete(puzzle.system);

    if (puzzle.mode === 'restoration') {
      const restoredTo = source === 'human' ? 18 : 15;
      this.state.systems[puzzle.system] = Math.max(this.state.systems[puzzle.system], restoredTo);
      this.state.repairBoosts[puzzle.system] = Math.max(this.state.repairBoosts[puzzle.system], source === 'human' ? 10 : 6);
      this.updateRepairBoosts(0);
      this.aiPuzzleTimer = 0;
      const sourceLabel = source === 'human' ? 'Manual restoration complete' : `${AI_OFFICERS.engineering} completed restoration procedure`;
      this.log(`ENGINEERING: ${sourceLabel}. ${puzzle.system.toUpperCase()} returned ONLINE at ${restoredTo}%.`);
      this.comms('engineering', AI_OFFICERS.engineering, `${sourceLabel}. ${puzzle.system} is back online at ${restoredTo} percent. Assigned repair crews can resume conventional repair.`, 'report');
      return;
    }

    const immediateRepair = source === 'human' ? 6 : 4;
    this.state.systems[puzzle.system] = clamp(this.state.systems[puzzle.system] + immediateRepair, 0, 100);
    this.state.repairBoosts[puzzle.system] = Math.max(this.state.repairBoosts[puzzle.system], source === 'human' ? 10 : 7);
    this.updateRepairBoosts(0);
    this.aiPuzzleTimer = 0;
    const sourceLabel = source === 'human' ? 'Combat repair task complete' : `${AI_OFFICERS.engineering} completed combat repair task`;
    this.log(`ENGINEERING: ${sourceLabel}. ${puzzle.system.toUpperCase()} repair rate boosted.`);
    this.comms('engineering', AI_OFFICERS.engineering, `${sourceLabel}. ${puzzle.system} repair crews received an accelerated repair path.`, 'report');
  }

  private updateEngineeringPuzzleAi(dt: number) {
    const puzzle = this.state.engineeringPuzzle;
    if (!puzzle || puzzle.status !== 'active' || !this.isAiControlled('engineering') || this.state.repairTarget !== puzzle.system) {
      if (!puzzle || puzzle.status !== 'active') this.aiPuzzleTimer = 0;
      return;
    }
    if (this.aiPuzzleTimer <= 0) {
      const baseTime = puzzle.mode === 'restoration'
        ? (puzzle.type === 'junction' ? 36 : 30)
        : (puzzle.type === 'coolant' ? 9 : puzzle.type === 'breaker' ? 7 : 8);
      this.aiPuzzleTimer = baseTime + (puzzle.id % 4);
      this.setAiStatus('engineering', puzzle.mode === 'restoration' ? `Restoring offline ${puzzle.system}` : `Running ${puzzle.type} combat repair`);
    }
    this.aiPuzzleTimer -= dt;
    if (this.aiPuzzleTimer <= 0) this.completeEngineeringPuzzle('ai');
  }

  private communicationsSignalQuality(frequency: number, tuner: number, filterTarget: number, filterValue: number): number {
    const carrierError = Math.abs(frequency - tuner);
    const filterError = Math.abs(filterTarget - filterValue);
    return clamp(Math.round(100 - carrierError * 2.1 - filterError * 1.45), 0, 100);
  }

  private enqueueTransmission(input: {
    sourceContactId: string | null;
    sourceName: string;
    priority: 'routine' | 'priority' | 'urgent' | 'hostile';
    kind: 'distress' | 'hail' | 'tactical' | 'intercept' | 'coded';
    subject: string;
    message: string;
    encrypted?: boolean;
    responses?: Array<{ id: string; label: string; outcome: string }>;
    open?: boolean;
  }): number {
    const duplicate = this.state.communications.transmissions.find((entry) =>
      entry.sourceContactId === input.sourceContactId && entry.subject === input.subject && entry.status !== 'resolved'
    );
    if (duplicate) return duplicate.id;
    const frequency = Math.round(12 + this.random() * 76);
    const filterTarget = Math.round(18 + this.random() * 64);
    const id = ++this.communicationsTransmissionSequence;
    const transmission = {
      id,
      sourceContactId: input.sourceContactId,
      sourceName: input.sourceName,
      priority: input.priority,
      kind: input.kind,
      subject: input.subject,
      status: (input.open ? 'open' : 'queued') as 'queued' | 'tuning' | 'open' | 'resolved',
      encrypted: !!input.encrypted,
      frequency,
      tuner: 50,
      filterTarget,
      filter: 50,
      signalQuality: this.communicationsSignalQuality(frequency, 50, filterTarget, 50),
      message: input.open ? input.message : '[CARRIER UNRESOLVED — ACQUIRE SIGNAL]',
      responses: input.responses ?? []
    };
    this.communicationsPayloads.set(id, input.message);
    this.state.communications.transmissions.unshift(transmission);
    this.state.communications.transmissions = this.state.communications.transmissions.slice(0, 12);
    if (this.state.communications.activeTransmissionId === null) this.state.communications.activeTransmissionId = id;
    if (input.sourceContactId && !this.state.communications.selectedContactId) {
      this.state.communications.selectedContactId = input.sourceContactId;
      this.state.stationSelections.communicationsContactId = input.sourceContactId;
    }
    this.log(`COMMUNICATIONS: ${input.priority.toUpperCase()} traffic queued from ${input.sourceName} • ${input.subject}.`);
    return id;
  }

  private selectTransmission(transmissionId: number): boolean {
    const transmission = this.state.communications.transmissions.find((entry) => entry.id === transmissionId);
    if (!transmission || transmission.status === 'resolved') return false;
    this.state.communications.activeTransmissionId = transmissionId;
    if (transmission.status === 'queued') transmission.status = 'tuning';
    if (transmission.sourceContactId) {
      this.state.communications.selectedContactId = transmission.sourceContactId;
      this.state.stationSelections.communicationsContactId = transmission.sourceContactId;
    }
    return true;
  }

  private activeTransmission() {
    const id = this.state.communications.activeTransmissionId;
    return id === null ? null : this.state.communications.transmissions.find((entry) => entry.id === id) ?? null;
  }

  private setCommsTuner(value: number): boolean {
    if (this.state.systems.communications <= 0) return false;
    const transmission = this.activeTransmission();
    if (!transmission || transmission.status === 'open' || transmission.status === 'resolved') return false;
    transmission.status = 'tuning';
    transmission.tuner = clamp(value, 0, 100);
    transmission.signalQuality = this.communicationsSignalQuality(transmission.frequency, transmission.tuner, transmission.filterTarget, transmission.filter);
    return true;
  }

  private setCommsFilter(value: number): boolean {
    if (this.state.systems.communications <= 0) return false;
    const transmission = this.activeTransmission();
    if (!transmission || transmission.status === 'open' || transmission.status === 'resolved') return false;
    transmission.status = 'tuning';
    transmission.filter = clamp(value, 0, 100);
    transmission.signalQuality = this.communicationsSignalQuality(transmission.frequency, transmission.tuner, transmission.filterTarget, transmission.filter);
    return true;
  }

  private verifyCommsSignal(): boolean {
    if (this.state.systems.communications <= 0) return false;
    const transmission = this.activeTransmission();
    if (!transmission || transmission.status === 'open' || transmission.status === 'resolved') return false;
    transmission.signalQuality = this.communicationsSignalQuality(transmission.frequency, transmission.tuner, transmission.filterTarget, transmission.filter);
    const threshold = transmission.encrypted ? 88 : 80;
    if (transmission.signalQuality < threshold) {
      this.log(`COMMUNICATIONS: Carrier lock failed at ${transmission.signalQuality}% quality. Continue tuning.`);
      return false;
    }
    transmission.status = 'open';
    transmission.message = this.communicationsPayloads.get(transmission.id) ?? transmission.message;
    this.comms('communications', AI_OFFICERS.communications, `${transmission.sourceName} carrier locked at ${transmission.signalQuality}% quality.`, 'report');
    this.comms('external', transmission.sourceName, transmission.message, 'external');
    return true;
  }

  private sendTransmissionResponse(transmissionId: number, responseId: string): boolean {
    if (this.state.systems.communications <= 0) return false;
    const transmission = this.state.communications.transmissions.find((entry) => entry.id === transmissionId);
    if (!transmission || transmission.status !== 'open') return false;
    const response = transmission.responses.find((entry) => entry.id === responseId);
    if (!response) return false;

    if (transmission.sourceContactId === 'meridian' && ['acknowledge', 'standby', 'decline'].includes(responseId)) {
      const ok = this.sendFriendlyResponse(responseId as 'acknowledge' | 'standby' | 'decline');
      if (!ok) return false;
    } else if (transmission.sourceContactId === this.enemyActual.id) {
      if (responseId === 'stand-down') {
        this.comms('communications', AI_OFFICERS.communications, `${transmission.sourceName}, stand down and power off your weapons.`, 'ack');
        this.comms('external', transmission.sourceName, 'Negative. This lane is ours. Break off or be fired upon.', 'external');
        this.enemyFireCooldown += 1.5;
      } else if (responseId === 'identify') {
        this.comms('communications', AI_OFFICERS.communications, `${transmission.sourceName}, transmit registry and command authentication.`, 'ack');
        this.comms('external', transmission.sourceName, 'Authentication denied. You have your warning.', 'external');
      } else if (responseId === 'log') {
        this.comms('communications', AI_OFFICERS.communications, 'Intercept intelligence logged and forwarded to command.', 'report');
      } else {
        this.comms('communications', AI_OFFICERS.communications, 'No response transmitted. Channel logged and closed.', 'system');
      }
    } else {
      this.comms('communications', AI_OFFICERS.communications, response.outcome, 'ack');
    }

    transmission.status = 'resolved';
    if (this.state.communications.activeTransmissionId === transmission.id) {
      const next = this.state.communications.transmissions.find((entry) => entry.status !== 'resolved');
      this.state.communications.activeTransmissionId = next?.id ?? null;
    }
    return true;
  }

  private toggleCommsJamming(contactId: string | null): boolean {
    const ew = this.state.communications.electronicWarfare;
    if (contactId === null) {
      ew.jammingActive = false;
      ew.jamTargetId = null;
      ew.jammingStrength = 0;
      this.setAiStatus('communications', 'Electronic warfare standby');
      return true;
    }
    if (this.state.systems.communications <= 0 || contactId !== this.enemyActual.id || this.state.sensors.intelLevel < 1 || !this.enemyActual.alive) return false;
    ew.jamTargetId = contactId;
    ew.jammingActive = true;
    this.state.communications.selectedContactId = contactId;
    this.state.stationSelections.communicationsContactId = contactId;
    this.log(`COMMUNICATIONS: Jamming carrier established on ${this.enemyActual.trueName}.`);
    return true;
  }

  private startCommsIntercept(contactId: string): boolean {
    const ew = this.state.communications.electronicWarfare;
    if (this.state.systems.communications <= 0 || contactId !== this.enemyActual.id || this.state.sensors.intelLevel < 1 || !this.enemyActual.alive) return false;
    ew.interceptTargetId = contactId;
    ew.interceptActive = true;
    ew.interceptProgress = 0;
    ew.interceptIntel = null;
    this.state.communications.selectedContactId = contactId;
    this.state.stationSelections.communicationsContactId = contactId;
    this.log(`COMMUNICATIONS: Intercepting tactical emissions from ${this.enemyActual.trueName}.`);
    return true;
  }

  private updateCommunicationsSystems(dt: number) {
    const ew = this.state.communications.electronicWarfare;
    const health = this.state.systems.communications;
    const efficiency = health <= 0 ? 0 : clamp(health / 100, 0.2, 1);

    if (ew.jammingActive) {
      if (health <= 0 || ew.jamTargetId !== this.enemyActual.id || !this.enemyActual.alive) {
        ew.jammingActive = false;
        ew.jamTargetId = null;
        ew.jammingStrength = 0;
      } else {
        ew.jammingStrength = Math.round(35 + efficiency * 65);
      }
    } else {
      ew.jammingStrength = 0;
    }

    if (ew.interceptActive) {
      if (health <= 0 || ew.interceptTargetId !== this.enemyActual.id || !this.enemyActual.alive) {
        ew.interceptActive = false;
      } else {
        const enemyCommsEfficiency = clamp(this.enemyActual.systems.communications / 100, 0.25, 1);
        ew.interceptProgress = clamp(ew.interceptProgress + 13 * efficiency * enemyCommsEfficiency * dt, 0, 100);
        if (ew.interceptProgress >= 100) {
          ew.interceptActive = false;
          ew.interceptIntel = this.enemyActual.wave === 2
            ? 'Command traffic indicates coordinated rapid-fire cycles and a reinforcement beacon protocol.'
            : 'Tactical traffic indicates a close-range attack pattern and repeating weapons-cycle telemetry.';
          this.enqueueTransmission({
            sourceContactId: this.enemyActual.id,
            sourceName: `${this.enemyActual.trueName} INTERCEPT`,
            priority: 'priority',
            kind: 'intercept',
            subject: 'DECODED TACTICAL TRAFFIC',
            message: ew.interceptIntel,
            open: true,
            responses: [{ id: 'log', label: 'LOG INTELLIGENCE', outcome: 'Intercept intelligence logged for the Captain.' }]
          });
          this.comms('communications', AI_OFFICERS.communications, `Enemy tactical traffic decoded. ${ew.interceptIntel}`, 'report');
        }
      }
    }
  }

  private queueHostileTransmission() {
    if (this.hostileTransmissionQueuedForWave === this.enemyActual.wave || this.state.sensors.intelLevel < 1 || !this.enemyActual.alive) return;
    this.hostileTransmissionQueuedForWave = this.enemyActual.wave;
    this.enqueueTransmission({
      sourceContactId: this.enemyActual.id,
      sourceName: this.enemyActual.trueName,
      priority: 'hostile',
      kind: this.enemyActual.wave === 2 ? 'coded' : 'hail',
      subject: this.enemyActual.wave === 2 ? 'ENCRYPTED COMMAND BURST' : 'HOSTILE CHALLENGE',
      message: this.enemyActual.wave === 2
        ? 'Encrypted command traffic resolved: attack group confirms target acquisition and weapons authorization.'
        : 'Unidentified vessel, leave the relay lane immediately. This territory is under our protection.',
      encrypted: this.enemyActual.wave === 2,
      responses: [
        { id: 'stand-down', label: 'ORDER THEM TO STAND DOWN', outcome: 'Stand-down demand transmitted.' },
        { id: 'identify', label: 'DEMAND IDENTIFICATION', outcome: 'Authentication request transmitted.' },
        { id: 'no-response', label: 'LOG / NO RESPONSE', outcome: 'Transmission logged without reply.' }
      ]
    });
    this.comms('communications', AI_OFFICERS.communications, `Priority traffic detected from ${this.enemyActual.trueName}. Carrier acquisition required.`, 'warning');
  }

  private hailFriendlyContact(): boolean {
    if (this.state.systems.communications <= 0) return false;
    const selectedId = this.state.communications.selectedContactId ?? this.state.stationSelections.communicationsContactId;
    if (selectedId === 'meridian' && this.state.friendlyContact) {
      const contact = this.state.friendlyContact;
      if (contact.hailStatus === 'open') return true;
      contact.hailStatus = 'open';
      this.comms('communications', AI_OFFICERS.communications, `Channel open to ${contact.name}.`, 'ack');
      this.comms('external', contact.name, contact.distress, 'external');
      return true;
    }
    if (selectedId === this.enemyActual.id && this.state.sensors.intelLevel >= 1 && this.enemyActual.alive) {
      this.comms('communications', AI_OFFICERS.communications, `${this.enemyActual.trueName}, this is USS Prototype. Respond on this channel.`, 'ack');
      this.enqueueTransmission({
        sourceContactId: this.enemyActual.id,
        sourceName: this.enemyActual.trueName,
        priority: 'hostile',
        kind: 'hail',
        subject: 'DIRECT HAIL RESPONSE',
        message: 'Channel acknowledged. State your intentions quickly.',
        open: true,
        responses: [
          { id: 'stand-down', label: 'ORDER THEM TO STAND DOWN', outcome: 'Stand-down demand transmitted.' },
          { id: 'identify', label: 'DEMAND IDENTIFICATION', outcome: 'Authentication request transmitted.' },
          { id: 'no-response', label: 'CLOSE CHANNEL', outcome: 'Channel closed.' }
        ]
      });
      return true;
    }
    const object = this.state.spaceObjects.find((entry) => entry.id === selectedId && entry.identified && entry.selectable);
    if (!object || !['ship', 'station', 'beacon'].includes(object.objectType)) return false;
    this.comms('communications', AI_OFFICERS.communications, `Hailing ${object.name}.`, 'ack');
    this.enqueueTransmission({
      sourceContactId: object.id,
      sourceName: object.name,
      priority: 'routine',
      kind: 'hail',
      subject: 'CHANNEL ACKNOWLEDGEMENT',
      message: `${object.name} acknowledges your transmission. No priority traffic to report.`,
      open: true,
      responses: [{ id: 'log', label: 'LOG / CLOSE CHANNEL', outcome: `${object.name} channel closed.` }]
    });
    return true;
  }

  private sendFriendlyResponse(response: 'acknowledge' | 'standby' | 'decline'): boolean {
    const contact = this.state.friendlyContact;
    if (!contact || this.state.systems.communications <= 0) return false;
    contact.hailStatus = 'open';
    if (response === 'acknowledge') {
      contact.status = 'acknowledged';
      this.comms('communications', AI_OFFICERS.communications, `Meridian, SpaceBridge vessel acknowledges your distress call. We are inbound.`, 'ack');
      this.comms('external', contact.name, 'Acknowledged. Life support is degrading. We will hold position for your approach.', 'external');
      this.state.missionStage = 'rendezvous';
      this.state.currentObjective = `Rendezvous with ${contact.name}. Approach within 8 km.`;
    } else if (response === 'standby') {
      this.comms('communications', AI_OFFICERS.communications, 'Meridian, stand by. We are assessing your situation.', 'ack');
      this.comms('external', contact.name, 'Standing by. Please hurry.', 'external');
    } else {
      this.comms('communications', AI_OFFICERS.communications, 'Meridian, we are unable to render assistance.', 'warning');
      this.comms('external', contact.name, 'Understood. Continuing emergency broadcast.', 'external');
    }
    return true;
  }

  private updateDistressMission(dt: number) {
    const contact = this.state.friendlyContact;
    if (!contact) return;
    const friendlyRange = Math.hypot(this.state.ship.x - contact.x, this.state.ship.y - contact.y);
    if (this.state.missionStage === 'rendezvous' && friendlyRange <= 8) {
      this.state.missionStage = 'assist';
      contact.status = 'assisting';
      this.state.currentObjective = 'Hold alongside Meridian while Engineering transfers emergency power and repair support.';
      this.distressAidAccumulator = 0;
      this.log('RENDEZVOUS COMPLETE: Emergency support transfer underway.');
      this.comms('engineering', AI_OFFICERS.engineering, 'We are connected to Meridian. Beginning emergency power and repair support.', 'report');
      this.comms('external', contact.name, 'Support link confirmed. Life-support pressure is stabilizing.', 'external');
    }
    if (this.state.missionStage === 'assist') {
      if (friendlyRange > 10) {
        this.state.currentObjective = 'Return within 10 km of Meridian to maintain the emergency support link.';
        return;
      }
      this.distressAidAccumulator += dt;
      contact.aidProgress = clamp(contact.aidProgress + dt * 16, 0, 100);
      this.state.currentObjective = `Emergency support transfer ${Math.round(contact.aidProgress)}% complete. Maintain position.`;
      if (contact.aidProgress >= 100) {
        contact.status = 'safe';
        this.state.missionStatus = 'victory';
        this.state.missionStage = 'victory';
        this.state.currentObjective = 'Mission complete. CSV Meridian is stable and awaiting recovery tug support.';
        this.setAiStatus('helm', 'Holding alongside Meridian');
        this.setAiStatus('communications', 'Recovery channel established');
        this.comms('external', contact.name, 'Life support stable. Drive core isolated. Thank you, SpaceBridge. We can hold for recovery.', 'external');
        this.comms('communications', AI_OFFICERS.communications, 'Meridian is stable. Recovery tug has their coordinates.', 'report');
        this.log('MISSION COMPLETE: CSV Meridian stabilized without combat.');
      }
    }
  }

  private updateRepair(dt: number) {
    const crewCounts = new Map<SystemName, number>();
    for (const crew of this.state.repairCrews) {
      if (crew.status !== 'working' || !crew.system) continue;
      crewCounts.set(crew.system, (crewCounts.get(crew.system) ?? 0) + 1);
    }

    let focusedRepair = 0;
    for (const [target, crewCount] of crewCounts.entries()) {
      const health = this.state.systems[target];
      if (health <= 0 || health >= 100 || crewCount <= 0) continue;

      const efficiency = clamp(this.state.ship.enginePower / 33, 0.45, 1.8);
      const puzzleMultiplier = this.state.repairBoosts[target] > 0 ? 3 : 1;
      const crewMultiplier = this.repairCrewMultiplier(crewCount);
      const repaired = dt * 2.2 * efficiency * puzzleMultiplier * crewMultiplier;
      this.state.systems[target] = clamp(health + repaired, 0, 100);
      this.repairAccumulator += repaired;
      if (this.state.repairTarget === target) focusedRepair += repaired;

      if (this.state.systems[target] >= 99.9) {
        this.state.systems[target] = 100;
        this.discardEngineeringPuzzle(target);
        if (this.state.engineeringPuzzle?.system === target) this.state.engineeringPuzzle = null;
        this.state.repairBoosts[target] = 0;
        this.comms('engineering', AI_OFFICERS.engineering, `${target[0].toUpperCase()+target.slice(1)} systems restored to full operation.`, 'report');
        if (this.state.repairTarget === target) {
          this.state.repairTarget = null;
          this.state.repairProgress = 0;
        }
      }
    }

    if (this.state.repairTarget) {
      this.state.repairProgress = clamp(this.state.repairProgress + focusedRepair, 0, 100);
    } else {
      this.state.repairProgress = 0;
    }
    this.updateRepairBoosts(0);
  }

  private damageSubsystem(amount: number) {
    const sequence: SystemName[] = ['shields', 'engines', 'weapons', 'sensors', 'communications'];
    const start = this.enemyHitCount % sequence.length;
    this.enemyHitCount += 1;
    let target: SystemName | null = null;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      const candidate = sequence[(start + offset) % sequence.length];
      if (this.state.systems[candidate] > 0) { target = candidate; break; }
    }
    if (!target) return;

    // Ordinary combat damage can make a system critical, but never takes an
    // online subsystem all the way to zero. A true knockout is handled by the
    // shield-gated catastrophic-failure roll below.
    const before = this.state.systems[target];
    this.state.systems[target] = clamp(Math.max(1, before - amount), 1, 100);

    if (this.state.repairTarget === target && this.state.systems[target] <= 75) {
      const active = this.state.engineeringPuzzle?.status === 'active';
      if (!active) {
        this.state.engineeringPuzzle = this.ensureEngineeringPuzzle(target);
        this.aiPuzzleTimer = 0;
      }
    }

    this.log(`DAMAGE CONTROL: ${target.toUpperCase()} system at ${Math.round(this.state.systems[target])}%.`);
    this.comms('engineering', AI_OFFICERS.engineering, `${target[0].toUpperCase()+target.slice(1)} subsystem damaged. Integrity ${Math.round(this.state.systems[target])} percent.`, 'warning');
  }

  private chooseCatastrophicFailureTarget(): SystemName | null {
    const candidates = (Object.entries(this.state.systems) as Array<[SystemName, number]>)
      .filter(([, health]) => health > 0);
    if (!candidates.length) return null;

    // Already-damaged systems are deliberately more vulnerable. A healthy
    // system can still fail, but a system at 20% is several times more likely.
    const weighted = candidates.map(([system, health]) => ({
      system,
      weight: 1 + (100 - health) / 15
    }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = this.random() * total;
    for (const entry of weighted) {
      pick -= entry.weight;
      if (pick <= 0) return entry.system;
    }
    return weighted[weighted.length - 1].system;
  }

  private maybeCatastrophicSubsystemFailure(hullDamage: number, enemyWave: number): boolean {
    // Catastrophic knockouts are only possible on an unshielded hull hit.
    if (hullDamage <= 0 || this.state.ship.shields > 0) return false;

    const shieldGridOffline = this.state.systems.shields <= 0;
    const baseChance = shieldGridOffline ? 0.05 : 0.02;
    const heavyHitMultiplier = enemyWave >= 2 || hullDamage >= 10 ? 1.25 : 1;
    const chance = Math.min(0.08, baseChance * heavyHitMultiplier);
    if (this.random() >= chance) return false;

    const target = this.chooseCatastrophicFailureTarget();
    if (!target) return false;

    const focusedPuzzleBefore = this.hasActiveFocusedEngineeringPuzzle() ? this.state.engineeringPuzzle : null;
    this.state.systems[target] = 0;
    if (target === 'shields') this.state.ship.shields = 0;
    const crewCasualties = this.applyRepairCrewCasualties(target);
    this.state.repairBoosts[target] = 0;
    this.updateRepairBoosts(0);

    // If this subsystem already had a quick-repair diagnostic, it is no longer
    // valid after a hard knockout. Replace it with a restoration procedure and
    // store that procedure with the failed subsystem.
    this.discardEngineeringPuzzle(target);
    const failurePuzzle = this.ensureEngineeringPuzzle(target);
    const preserveOtherFocus = focusedPuzzleBefore && focusedPuzzleBefore.system !== target;
    if (!preserveOtherFocus) {
      this.state.repairTarget = target;
      this.state.repairProgress = 0;
      this.state.engineeringPuzzle = failurePuzzle;
      this.aiPuzzleTimer = 0;
    }

    const chanceLabel = Math.round(chance * 100);
    this.log(`CATASTROPHIC FAILURE: ${target.toUpperCase()} knocked OFFLINE after an unshielded hull impact.`);
    if (crewCasualties > 0) this.log(`DAMAGE CONTROL: ${crewCasualties} repair crew${crewCasualties === 1 ? '' : 's'} lost in the casualty.`);
    this.comms('computer', 'Damage Control Computer', `${target.toUpperCase()} OFFLINE. Critical restoration procedure required.`, 'warning');
    this.comms('engineering', AI_OFFICERS.engineering, `${target[0].toUpperCase()+target.slice(1)} just dropped offline after that hull hit. I need a critical restoration procedure now.`, 'warning');
    if (preserveOtherFocus) this.log(`ENGINEERING: ${target.toUpperCase()} restoration queued; current ${focusedPuzzleBefore!.system.toUpperCase()} diagnostic retained in focus.`);
    this.log(`DAMAGE CONTROL: catastrophic failure risk was ${chanceLabel}% for this hit.`);
    return true;
  }

  private startMission() {
    if (this.state.missionStatus !== 'briefing') return;
    this.state.missionStatus = 'running';
    if (this.state.missionId === 'meridian-distress') {
      this.state.missionStage = 'distress';
      this.state.currentObjective = 'Establish communications with CSV Meridian and acknowledge its distress call.';
      this.setAiStatus('helm', 'Holding for communications response');
      this.setAiStatus('tactical', 'Weapons safed');
      this.setAiStatus('engineering', 'Preparing damage-control support');
      this.setAiStatus('science', 'Monitoring civilian contact');
      this.setAiStatus('communications', 'Receiving distress traffic');
      this.log('MISSION START: CSV Meridian is broadcasting an emergency distress call.');
      this.enqueueTransmission({
        sourceContactId: 'meridian',
        sourceName: 'CSV Meridian',
        priority: 'urgent',
        kind: 'distress',
        subject: 'MAYDAY • LIFE SUPPORT FAILURE',
        message: this.state.friendlyContact?.distress ?? 'Request immediate assistance.',
        responses: [
          { id: 'acknowledge', label: 'ACKNOWLEDGE • WE ARE INBOUND', outcome: 'Distress acknowledgement transmitted.' },
          { id: 'standby', label: 'REQUEST STANDBY', outcome: 'Standby request transmitted.' },
          { id: 'decline', label: 'DECLINE ASSISTANCE', outcome: 'Assistance declined.' }
        ]
      });
      this.comms('external', 'CSV Meridian', this.state.friendlyContact?.distress ?? 'Request immediate assistance.', 'external');
      this.comms('communications', AI_OFFICERS.communications, 'Distress call received, Captain. Carrier acquisition required before response.', 'warning');
      return;
    }
    this.state.missionStage = 'investigate';
    this.state.currentObjective = 'Investigate and identify the unknown contact.';
    this.setAiStatus('helm', 'Approaching sensor range');
    this.setAiStatus('tactical', 'Tracking unknown contact');
    this.setAiStatus('engineering', 'Configuring mission power');
    this.setAiStatus('science', 'Beginning sensor sweep');
    this.setAiStatus('communications', 'Monitoring traffic');
    this.log('MISSION START: Investigate the unknown contact near the civilian relay lane.');
    this.comms('science', AI_OFFICERS.science, 'Beginning long-range sensor sweep. I will identify the contact before Tactical engages.', 'report');
    this.comms('helm', AI_OFFICERS.helm, 'Helm standing by. Approaching sensor range.', 'ack');
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
    fresh.eventLog = ['Mission reset to briefing.', `Mission loaded: ${fresh.missionTitle}. Awaiting captain.`];
    this.state = fresh;
    this.enemyFireCooldown = 4;
    this.aiDecisionAccumulator = 0;
    this.aiBeamCooldown = 0;
    this.aiTorpedoCooldown = 1.5;
    this.aiPrecisionLockTimer = 0;
    this.aiEngineeringCooldown = 0;
    this.reinforcementTimer = 0;
    this.scanIdentityLogged = false;
    this.scanCompleteLogged = false;
    this.tacticalFrequencyLogged = false;
    this.tacticalSystemsLogged = false;
    this.shieldWarningIssued = false;
    this.hullWarningIssued = false;
    this.distressAidAccumulator = 0;
    this.communicationsCooldown = 0;
    this.communicationsTransmissionSequence = 0;
    this.hostileTransmissionQueuedForWave = 0;
    this.communicationsPayloads.clear();
    this.repairAccumulator = 0;
    this.enemyHitCount = 0;
    this.aiPuzzleTimer = 0;
    this.engineeringPuzzleBySystem.clear();
    this.junctionSolutions.clear();
    this.breakerSolutions.clear();
    this.comms('computer', 'Bridge Computer', 'Mission reset complete. Crew retained at assigned stations.', 'system');
    this.syncEnemyPublicState();
  }

  private createTacticalState(): GameSnapshot['tactical'] {
    return {
      selectedTarget: 'hull',
      lock: { target: 'hull', status: 'idle', quality: 0, strikes: 0, axes: [] },
      weaponOutputMultiplier: this.weaponOutputMultiplier(),
      shieldDamageMultiplier: 1,
      beamTiming: {
        phase: 0,
        sweetSpot: Math.round(18 + this.random() * 64),
        window: 11,
        status: 'idle',
        quality: 0,
        bonusMultiplier: 1,
        strikes: 0
      },
      torpedoGuidance: {
        target: 'hull',
        status: 'idle',
        stage: 0,
        phase: 0,
        gates: [],
        samples: [],
        strikes: 0,
        quality: 0,
        bonusMultiplier: 1
      }
    };
  }

  private updateTacticalSkillTimers(dt: number) {
    const tactical = this.state.tactical;
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive || this.state.systems.weapons <= 0) return;

    const weaponHealth = clamp(this.state.systems.weapons / 100, 0.2, 1);
    const powerFactor = 0.75 + clamp(this.state.ship.weaponPower, 0, 100) / 200;
    tactical.beamTiming.phase = (tactical.beamTiming.phase + dt * 30 * weaponHealth * powerFactor) % 100;

    if (tactical.torpedoGuidance.status === 'guiding') {
      tactical.torpedoGuidance.phase = (tactical.torpedoGuidance.phase + dt * 32 * weaponHealth) % 100;
    }
  }

  private syncBeamCapacitor(): boolean {
    if (this.state.stationSelections.tacticalContactId !== this.enemyActual.id) return false;
    if (this.state.systems.weapons <= 0 || this.state.missionStatus !== 'running' || !this.enemyActual.alive) return false;
    const timing = this.state.tactical.beamTiming;
    const distance = circularDistance(timing.phase, timing.sweetSpot);
    if (distance > timing.window) {
      timing.strikes += 1;
      timing.status = 'idle';
      timing.quality = 0;
      timing.bonusMultiplier = 1;
      this.log(`TACTICAL: Capacitor sync missed optimal discharge window by ${Math.round(distance)} points.`);
      return false;
    }
    timing.quality = clamp(Math.round(100 - (distance / Math.max(1, timing.window)) * 30), 70, 100);
    timing.bonusMultiplier = Number((1.1 + timing.quality * 0.0025).toFixed(2));
    timing.status = 'synced';
    this.log(`TACTICAL: Beam capacitor synchronized • quality ${timing.quality}% • next beam ${timing.bonusMultiplier.toFixed(2)}× timing bonus.`);
    return true;
  }

  private resetBeamTiming() {
    const timing = this.state.tactical.beamTiming;
    timing.status = 'idle';
    timing.quality = 0;
    timing.bonusMultiplier = 1;
    timing.sweetSpot = Math.round(18 + this.random() * 64);
  }

  private startTorpedoGuidance(): boolean {
    if (this.state.stationSelections.tacticalContactId !== this.enemyActual.id) return false;
    if (this.state.systems.weapons <= 0 || this.state.missionStatus !== 'running' || !this.enemyActual.alive || this.state.ship.torpedoes <= 0) return false;
    if (this.state.sensors.intelLevel < 1) return false;
    const target = this.state.tactical.selectedTarget;
    this.state.tactical.torpedoGuidance = {
      target,
      status: 'guiding',
      stage: 0,
      phase: 0,
      gates: Array.from({ length: 3 }, () => Math.round(15 + this.random() * 70)),
      samples: [],
      strikes: 0,
      quality: 0,
      bonusMultiplier: 1
    };
    this.log(`TACTICAL: Torpedo guidance package opened for ${target.toUpperCase()}. Mark three intercept gates.`);
    return true;
  }

  private markTorpedoGuidance(): boolean {
    const guidance = this.state.tactical.torpedoGuidance;
    if (guidance.status !== 'guiding' || guidance.target !== this.state.tactical.selectedTarget) return false;
    const gate = guidance.gates[guidance.stage];
    if (gate === undefined) return false;
    const distance = circularDistance(guidance.phase, gate);
    if (distance > 14) {
      guidance.strikes += 1;
      this.log(`TACTICAL: Torpedo intercept mark missed gate ${guidance.stage + 1}.`);
      return false;
    }
    const score = clamp(Math.round(100 - distance * 3), 58, 100);
    guidance.samples.push(score);
    guidance.stage += 1;
    if (guidance.stage >= guidance.gates.length) {
      guidance.quality = Math.round(guidance.samples.reduce((sum, value) => sum + value, 0) / guidance.samples.length);
      guidance.bonusMultiplier = Number((1.08 + guidance.quality * 0.0032).toFixed(2));
      guidance.status = 'ready';
      this.log(`TACTICAL: Torpedo guidance solution ready • quality ${guidance.quality}% • warhead effectiveness ${guidance.bonusMultiplier.toFixed(2)}×.`);
      return true;
    }
    this.log(`TACTICAL: Torpedo guidance gate ${guidance.stage}/${guidance.gates.length} locked.`);
    return true;
  }

  private resetTorpedoGuidance() {
    this.state.tactical.torpedoGuidance = {
      target: this.state.tactical.selectedTarget,
      status: 'idle',
      stage: 0,
      phase: 0,
      gates: [],
      samples: [],
      strikes: 0,
      quality: 0,
      bonusMultiplier: 1
    };
  }

  private weaponOutputMultiplier(): number {
    const power = this.state?.ship?.weaponPower ?? 33;
    const health = this.state?.systems?.weapons ?? 100;
    const powerFactor = 0.5 + clamp(power, 0, 100) / 100;
    const healthFactor = health <= 0 ? 0 : 0.6 + 0.4 * clamp(health, 0, 100) / 100;
    return Number((powerFactor * healthFactor).toFixed(2));
  }

  private updateTacticalDerivedState() {
    if (!this.state?.tactical) return;
    this.state.tactical.weaponOutputMultiplier = this.weaponOutputMultiplier();
    this.state.tactical.shieldDamageMultiplier = this.state.sensors.shieldSolution ? 1.4 : 1;
    if (!this.enemyActual.alive || this.rangeToEnemy() > 26) {
      if (this.state.tactical.lock.status === 'locked') {
        this.state.tactical.lock = { target: this.state.tactical.selectedTarget, status: 'idle', quality: 0, strikes: 0, axes: [] };
      }
      if (!this.enemyActual.alive) {
        if (this.state.tactical.beamTiming.status !== 'idle') this.resetBeamTiming();
        if (this.state.tactical.torpedoGuidance.status !== 'idle') this.resetTorpedoGuidance();
      }
    }
  }

  private beginTacticalAnalysis(): boolean {
    if (this.state.stationSelections.scienceContactId !== this.enemyActual.id) { this.log('SCIENCE: Select the hostile contact before beginning tactical analysis.'); return false; }
    if (this.state.systems.sensors <= 0) { this.log('SCIENCE: Sensor array offline. Tactical analysis unavailable.'); return false; }
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive || this.state.missionId !== 'signal-dark') return false;
    if (this.state.sensors.intelLevel < 2) { this.log('SCIENCE: Complete the primary scan before tactical analysis.'); return false; }
    if (this.state.sensors.systemsMapped) return true;
    this.state.sensors.tacticalAnalysisActive = true;
    this.log('SCIENCE: Tactical analysis initiated. Resolving shield resonance and subsystem geometry.');
    return true;
  }

  private updateTacticalAnalysis(dt: number) {
    const sensors = this.state.sensors;
    if (!sensors.tacticalAnalysisActive || sensors.systemsMapped || !this.enemyActual.alive) return;
    if (this.state.systems.sensors <= 0) return;
    const range = this.rangeToEnemy();
    const rangeFactor = range <= 18 ? 1 : clamp(18 / range, 0.35, 1);
    const sensorEfficiency = clamp(this.state.systems.sensors / 100, 0.2, 1);
    sensors.tacticalAnalysisProgress = clamp(sensors.tacticalAnalysisProgress + 14 * rangeFactor * sensorEfficiency * dt, 0, 100);

    if (sensors.tacticalAnalysisProgress >= 45 && !sensors.shieldSolution) {
      sensors.shieldSolution = true;
      sensors.shieldFrequency = this.enemyActual.shieldFrequency;
      if (!this.tacticalFrequencyLogged) {
        this.tacticalFrequencyLogged = true;
        this.log(`SCIENCE: Enemy shield resonance resolved at ${this.enemyActual.shieldFrequency}. Tactical modulation solution transmitted.`);
        this.comms('science', AI_OFFICERS.science, `Shield resonance resolved: ${this.enemyActual.shieldFrequency}. Tactical modulation solution transmitted. Expect approximately forty percent greater shield coupling.`, 'report');
      }
    }

    if (sensors.tacticalAnalysisProgress >= 100) {
      sensors.systemsMapped = true;
      sensors.tacticalAnalysisActive = false;
      if (!this.tacticalSystemsLogged) {
        this.tacticalSystemsLogged = true;
        this.log(`SCIENCE: Enemy subsystem map complete. Weapons geometry resolved at ${this.enemyActual.beamRange.toFixed(0)} km / ${Math.round(this.enemyActual.beamArcDegrees)}° forward arc.`);
        this.comms('science', AI_OFFICERS.science, `Subsystem geometry mapped. Enemy primary weapons are forward-mounted: ${this.enemyActual.beamRange.toFixed(0)} kilometer range, ${Math.round(this.enemyActual.beamArcDegrees)} degree arc. Helm and Tactical have the geometry.`, 'report');
      }
    }
  }

  private selectEnemyTarget(target: TacticalTarget): boolean {
    if (target !== 'hull' && !(target in this.enemyActual.systems)) return false;
    if (target !== 'hull' && !this.state.sensors.systemsMapped) {
      this.log('TACTICAL: Science subsystem map required for precision target selection.');
      return false;
    }
    if (this.state.tactical.selectedTarget === target) return true;
    this.state.tactical.selectedTarget = target;
    this.state.tactical.lock = { target, status: 'idle', quality: 0, strikes: 0, axes: [] };
    this.resetTorpedoGuidance();
    this.aiPrecisionLockTimer = 0;
    this.log(`TACTICAL: Target selection changed to ${target.toUpperCase()}.`);
    return true;
  }

  private generateTargetLockAxes() {
    const axes: TargetLockAxis[] = ['azimuth', 'elevation', 'velocity'];
    return axes.map((axis) => ({
      axis,
      target: Math.round(18 + this.random() * 64),
      value: 50
    }));
  }

  private startTargetLock(): boolean {
    if (this.state.stationSelections.tacticalContactId !== this.enemyActual.id) return false;
    const target = this.state.tactical.selectedTarget;
    if (target === 'hull') { this.log('TACTICAL: General hull fire does not require a precision subsystem lock.'); return false; }
    if (!this.state.sensors.systemsMapped || !this.enemyActual.alive) return false;
    if (this.rangeToEnemy() > 20) { this.log('TACTICAL: Precision lock unavailable outside 20 km.'); return false; }
    this.state.tactical.lock = { target, status: 'aligning', quality: 0, strikes: 0, axes: this.generateTargetLockAxes() };
    this.log(`TACTICAL: Precision lock alignment started on enemy ${target.toUpperCase()}.`);
    return true;
  }

  private setTargetLockAxis(axis: TargetLockAxis, value: number): boolean {
    const lock = this.state.tactical.lock;
    if (lock.status !== 'aligning' || lock.target !== this.state.tactical.selectedTarget || !Number.isFinite(value)) return false;
    const entry = lock.axes.find((candidate) => candidate.axis === axis);
    if (!entry) return false;
    entry.value = clamp(value, 0, 100);
    return true;
  }

  private verifyTargetLock(): boolean {
    const lock = this.state.tactical.lock;
    if (lock.status !== 'aligning' || lock.target !== this.state.tactical.selectedTarget || !lock.axes.length) return false;
    const distances = lock.axes.map((axis) => Math.abs(axis.target - axis.value));
    const maxDistance = Math.max(...distances);
    if (maxDistance > 8) {
      lock.strikes += 1;
      this.log(`TACTICAL: Precision alignment outside tolerance on ${lock.target.toUpperCase()}. Recalibrate and retry.`);
      return false;
    }
    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    lock.quality = clamp(Math.round(100 - average * 4), 70, 100);
    lock.status = 'locked';
    this.log(`TACTICAL: Precision lock acquired on ${lock.target.toUpperCase()} • quality ${lock.quality}%.`);
    this.comms('tactical', AI_OFFICERS.tactical, `Precision lock acquired on ${lock.target}. Lock quality ${lock.quality} percent.`, 'report');
    return true;
  }

  private startScan() {
    if (this.state.stationSelections.scienceContactId !== this.enemyActual.id) { this.log('SCIENCE: Selected object has no active hostile scan profile in this mission.'); return; }
    if (this.state.systems.sensors <= 0) { this.log('SCIENCE: Sensor array offline. Engineering restoration required.'); return; }
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive || this.state.sensors.intelLevel >= 2) return;
    this.state.sensors.scanActive = true;
    this.log('SCIENCE: Active scan initiated on unknown contact.');
  }

  private updateScan(dt: number) {
    if (!this.state.sensors.scanActive || !this.enemyActual.alive || this.state.sensors.intelLevel >= 2) return;

    const range = this.rangeToEnemy();
    const rangeFactor = range <= 24 ? 1 : clamp(24 / range, 0.45, 1);
    if (this.state.systems.sensors <= 0) return;
    const sensorEfficiency = clamp(this.state.systems.sensors / 100, 0.2, 1);
    this.state.sensors.scanProgress = clamp(this.state.sensors.scanProgress + 22 * rangeFactor * sensorEfficiency * dt, 0, 100);

    if (this.state.sensors.scanProgress >= 45 && this.state.sensors.intelLevel < 1) {
      this.state.sensors.intelLevel = 1;
      this.state.sensors.contactClass = this.enemyActual.className;
      this.state.sensors.weaponsEstimate = this.enemyActual.weapons;
      if (!this.scanIdentityLogged) {
        this.scanIdentityLogged = true;
        this.log(`SCIENCE: Contact identified as ${this.enemyActual.trueName}, ${this.enemyActual.className}.`);
        this.comms('science', AI_OFFICERS.science, `Contact identified: ${this.enemyActual.trueName}, ${this.enemyActual.className}. Weapons signature: ${this.enemyActual.weapons}.`, 'report');
        this.queueHostileTransmission();
      }
    }

    if (this.state.sensors.scanProgress >= 100 && this.state.sensors.intelLevel < 2) {
      this.state.sensors.intelLevel = 2;
      this.state.sensors.scanActive = false;
      this.state.sensors.shieldEstimate = `${Math.round(this.enemyActual.shields)}%`;
      this.state.sensors.hullEstimate = `${Math.round(this.enemyActual.hull)}%`;
      if (!this.scanCompleteLogged) {
        this.scanCompleteLogged = true;
        this.log('SCIENCE: Primary tactical scan complete. Shields and hull resolved; deeper resonance analysis available.');
        this.comms('science', AI_OFFICERS.science, `Primary scan complete. Shields ${Math.round(this.enemyActual.shields)} percent, hull ${Math.round(this.enemyActual.hull)} percent. Beginning deeper tactical analysis next.`, 'report');
      }
      if (this.state.missionStage === 'investigate') {
        this.state.missionStage = 'intercept';
        this.state.currentObjective = `Intercept ${this.enemyActual.trueName} and prevent escape.`;
        this.log('CAPTAIN: Contact is hostile. Intercept authorized.');
      }
    }
  }

  private helmSelectedObject(): SpaceObjectState | null {
    const selectedId = this.state.stationSelections.helmContactId ?? this.state.helm.selectedContactId;
    if (!selectedId) return null;
    return this.state.spaceObjects.find((object) => object.id === selectedId && object.alive) ?? null;
  }

  private shipEngineHealthFactor(): number {
    return this.state.systems.engines <= 0 ? 0 : clamp(this.state.systems.engines / 100, 0.2, 1);
  }

  private shipFlightPowerFactor(): number {
    return 0.45 + 0.55 * clamp(this.state.ship.enginePower / 100, 0, 1);
  }

  private effectiveShipForwardSpeed(): number {
    return ACTIVE_SHIP_PROFILE.flight.maxForwardSpeed * this.shipFlightPowerFactor() * this.shipEngineHealthFactor();
  }

  private effectiveShipReverseSpeed(): number {
    return ACTIVE_SHIP_PROFILE.flight.maxReverseSpeed * this.shipFlightPowerFactor() * this.shipEngineHealthFactor();
  }

  private signedHeadingDelta(target: number, reference: number): number {
    return ((target - reference + 540) % 360) - 180;
  }

  private shipTurnAuthorityFactor(): number {
    const flight = ACTIVE_SHIP_PROFILE.flight;
    const effectiveMax = Math.max(0.1, this.effectiveShipForwardSpeed());
    const speedFraction = clamp(Math.abs(this.state.ship.speed) / effectiveMax, 0, 1);
    if (speedFraction < flight.maneuverOptimalMinFraction) {
      const t = speedFraction / Math.max(0.01, flight.maneuverOptimalMinFraction);
      return flight.lowSpeedTurnFactor + (1 - flight.lowSpeedTurnFactor) * t;
    }
    if (speedFraction <= flight.maneuverOptimalMaxFraction) return 1;
    const t = (speedFraction - flight.maneuverOptimalMaxFraction) / Math.max(0.01, 1 - flight.maneuverOptimalMaxFraction);
    return 1 - (1 - flight.highSpeedTurnFactor) * clamp(t, 0, 1);
  }

  private targetMotionForHelm(object: SpaceObjectState): { heading: number; speed: number; vx: number; vy: number } {
    if (object.id === this.enemyActual.id && this.enemyActual.alive) {
      const radians = this.enemyActual.heading * Math.PI / 180;
      return {
        heading: this.enemyActual.heading,
        speed: this.enemyActual.speed,
        vx: Math.sin(radians) * this.enemyActual.speed,
        vy: Math.cos(radians) * this.enemyActual.speed
      };
    }
    return { heading: 0, speed: 0, vx: 0, vy: 0 };
  }

  private playerInsideEnemyWeaponArc(): boolean {
    if (!this.enemyActual.alive) return false;
    const dx = this.state.ship.x - this.enemyActual.x;
    const dy = this.state.ship.y - this.enemyActual.y;
    const distance = Math.hypot(dx, dy);
    if (distance > this.enemyActual.beamRange) return false;
    const bearing = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
    return Math.abs(this.signedHeadingDelta(bearing, this.enemyActual.heading)) <= this.enemyActual.beamArcDegrees / 2;
  }

  private recommendedInterceptHeading(object: SpaceObjectState, targetVx: number, targetVy: number): number {
    const dx = object.x - this.state.ship.x;
    const dy = object.y - this.state.ship.y;
    const distance = Math.hypot(dx, dy);
    const chaseSpeed = Math.max(0.5, this.effectiveShipForwardSpeed() * 0.8);
    const leadSeconds = clamp(distance / chaseSpeed, 0, 8);
    const leadX = object.x + targetVx * leadSeconds;
    const leadY = object.y + targetVy * leadSeconds;
    return normalizeHeading(Math.atan2(leadX - this.state.ship.x, leadY - this.state.ship.y) * 180 / Math.PI);
  }

  private currentTargetRelativePosition(object: SpaceObjectState, targetHeading: number): number {
    const bearingTargetToShip = normalizeHeading(Math.atan2(this.state.ship.x - object.x, this.state.ship.y - object.y) * 180 / Math.PI);
    return this.signedHeadingDelta(bearingTargetToShip, targetHeading);
  }

  private relativePositionDirector(object: SpaceObjectState, targetMotion: { heading: number; speed: number; vx: number; vy: number }, desiredRelativePosition: number) {
    const ship = this.state.ship;
    const rangeToTarget = Math.max(0.01, Math.hypot(object.x - ship.x, object.y - ship.y));
    const currentRelative = this.currentTargetRelativePosition(object, targetMotion.heading);
    const angularError = this.signedHeadingDelta(desiredRelativePosition, currentRelative);

    // Do not cut through the target to reach the far side of the engagement ring.
    // Advance around the ring in bounded angular steps, which makes TAKE STERN and
    // flank commands behave like an actual circling maneuver rather than a waypoint
    // on the other side of the hostile's center.
    const stagedRelative = Math.abs(angularError) > 48
      ? currentRelative + clamp(angularError, -42, 42)
      : desiredRelativePosition;
    const stagedWorldBearing = normalizeHeading(targetMotion.heading + stagedRelative);

    // If we have drifted dangerously inside the requested combat radius, prioritize
    // opening distance before continuing the angular maneuver.
    if (rangeToTarget < Math.max(3.5, this.state.helm.orbitRange * 0.68)) {
      const awayBearing = normalizeHeading(Math.atan2(ship.x - object.x, ship.y - object.y) * 180 / Math.PI);
      return { heading: awayBearing, throttle: 58, waypointDistance: this.state.helm.orbitRange - rangeToTarget };
    }

    const initialX = object.x + Math.sin(stagedWorldBearing * Math.PI / 180) * this.state.helm.orbitRange;
    const initialY = object.y + Math.cos(stagedWorldBearing * Math.PI / 180) * this.state.helm.orbitRange;
    const initialDistance = Math.hypot(initialX - ship.x, initialY - ship.y);
    const closingCapacity = Math.max(0.75, this.effectiveShipForwardSpeed() - Math.max(0, targetMotion.speed) * 0.4);
    const leadSeconds = clamp(initialDistance / closingCapacity, 0, 4.0);
    const targetX = object.x + targetMotion.vx * leadSeconds;
    const targetY = object.y + targetMotion.vy * leadSeconds;
    const waypointX = targetX + Math.sin(stagedWorldBearing * Math.PI / 180) * this.state.helm.orbitRange;
    const waypointY = targetY + Math.cos(stagedWorldBearing * Math.PI / 180) * this.state.helm.orbitRange;
    const waypointDistance = Math.hypot(waypointX - ship.x, waypointY - ship.y);
    const heading = normalizeHeading(Math.atan2(waypointX - ship.x, waypointY - ship.y) * 180 / Math.PI);

    // Far away, close decisively. Once near the combat ring, remain in the ship's
    // high-authority maneuvering band so it can actually work around the target.
    let throttle = rangeToTarget > this.state.helm.orbitRange + 10 ? 78
      : rangeToTarget > this.state.helm.orbitRange + 4 ? 62
        : waypointDistance > 4 ? 50
          : 38;
    if (rangeToTarget < this.state.helm.orbitRange - 1.5) throttle = 46;
    return { heading, throttle, waypointDistance };
  }

  private updateHelmFlightDirector() {
    const helm = this.state.helm;
    helm.selectedContactId = this.state.stationSelections.helmContactId;
    helm.turnAuthority = Math.round(this.shipTurnAuthorityFactor() * 100);
    const object = this.helmSelectedObject();
    if (!object) {
      helm.targetRange = null;
      helm.targetBearing = null;
      helm.relativeBearing = null;
      helm.closingSpeed = null;
      helm.aspect = 'none';
      helm.insideEnemyArc = null;
      helm.targetRelativePosition = null;
      helm.desiredRelativePosition = null;
      helm.positionError = null;
      helm.positionalAdvantage = 'unknown';
      helm.enemyManeuver = null;
      helm.recommendedHeading = helm.maneuver === 'hold' ? this.state.ship.heading : null;
      helm.recommendedThrottle = helm.maneuver === 'hold' ? 0 : helm.maneuver === 'emergencyReverse' ? -100 : null;
      if (helm.assistEnabled && helm.recommendedHeading !== null && helm.recommendedThrottle !== null) {
        this.state.ship.requestedHeading = normalizeHeading(helm.recommendedHeading);
        this.state.ship.throttle = clamp(helm.recommendedThrottle, -100, 100);
      }
      return;
    }

    const ship = this.state.ship;
    const dx = object.x - ship.x;
    const dy = object.y - ship.y;
    const distance = Math.max(0.0001, Math.hypot(dx, dy));
    const bearing = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
    const relativeBearing = this.signedHeadingDelta(bearing, ship.heading);
    const shipRadians = ship.heading * Math.PI / 180;
    const starboardRadians = (ship.heading + 90) * Math.PI / 180;
    const shipVx = Math.sin(shipRadians) * ship.speed + Math.sin(starboardRadians) * ship.lateralSpeed;
    const shipVy = Math.cos(shipRadians) * ship.speed + Math.cos(starboardRadians) * ship.lateralSpeed;
    const targetMotion = this.targetMotionForHelm(object);
    const relativeVx = targetMotion.vx - shipVx;
    const relativeVy = targetMotion.vy - shipVy;
    const rangeRate = (dx * relativeVx + dy * relativeVy) / distance;
    const closingSpeed = -rangeRate;

    let aspect: typeof helm.aspect = 'stationary';
    if (targetMotion.speed > 0.08) {
      const targetRadialSpeed = (dx * targetMotion.vx + dy * targetMotion.vy) / distance;
      if (targetRadialSpeed > targetMotion.speed * 0.45) aspect = 'pursuit';
      else if (targetRadialSpeed < -targetMotion.speed * 0.45) aspect = 'headOn';
      else aspect = 'crossing';
    }

    helm.targetRange = distance;
    helm.targetBearing = bearing;
    helm.relativeBearing = relativeBearing;
    helm.closingSpeed = closingSpeed;
    helm.aspect = aspect;
    helm.insideEnemyArc = object.id === this.enemyActual.id && this.state.sensors.systemsMapped ? this.playerInsideEnemyWeaponArc() : null;
    const targetRelativePosition = targetMotion.speed > 0.08 || object.id === this.enemyActual.id
      ? this.currentTargetRelativePosition(object, targetMotion.heading)
      : null;
    helm.targetRelativePosition = targetRelativePosition;
    helm.enemyManeuver = object.id === this.enemyActual.id && this.state.sensors.systemsMapped ? this.enemyActual.maneuverState : null;

    let desiredRelative: number | null = null;
    if (helm.maneuver === 'flankPort' || helm.maneuver === 'orbitPort') desiredRelative = -90;
    else if (helm.maneuver === 'flankStarboard' || helm.maneuver === 'orbitStarboard') desiredRelative = 90;
    else if (helm.maneuver === 'takeStern') desiredRelative = 180;
    else if (helm.maneuver === 'maintainRange') desiredRelative = helm.desiredRelativePosition ?? targetRelativePosition;
    helm.desiredRelativePosition = desiredRelative;
    helm.positionError = targetRelativePosition !== null && desiredRelative !== null
      ? this.signedHeadingDelta(desiredRelative, targetRelativePosition)
      : null;

    if (helm.insideEnemyArc === null) helm.positionalAdvantage = 'unknown';
    else if (helm.insideEnemyArc) helm.positionalAdvantage = 'danger';
    else if (targetRelativePosition !== null && Math.abs(targetRelativePosition) >= 145) helm.positionalAdvantage = 'stern';
    else if (targetRelativePosition !== null && Math.abs(targetRelativePosition) >= 65) helm.positionalAdvantage = 'flank';
    else helm.positionalAdvantage = 'neutral';

    let recommendedHeading: number | null = null;
    let recommendedThrottle: number | null = null;
    const targetIsMoving = targetMotion.speed > 0.08;
    switch (helm.maneuver) {
      case 'manual':
        break;
      case 'intercept':
        recommendedHeading = this.recommendedInterceptHeading(object, targetMotion.vx, targetMotion.vy);
        recommendedThrottle = distance > helm.orbitRange + 8 ? 88 : distance > helm.orbitRange + 2 ? 62 : 42;
        break;
      case 'orbitPort':
      case 'flankPort':
      case 'orbitStarboard':
      case 'flankStarboard':
      case 'takeStern':
      case 'maintainRange': {
        if (desiredRelative !== null) {
          const director = this.relativePositionDirector(object, targetMotion, desiredRelative);
          recommendedHeading = director.heading;
          recommendedThrottle = director.throttle;
        }
        break;
      }
      case 'matchVelocity':
        if (targetIsMoving) {
          if (distance > 6) {
            recommendedHeading = this.recommendedInterceptHeading(object, targetMotion.vx, targetMotion.vy);
            recommendedThrottle = 42;
          } else {
            recommendedHeading = targetMotion.heading;
            const maxForward = Math.max(0.1, this.effectiveShipForwardSpeed());
            recommendedThrottle = clamp(targetMotion.speed / maxForward * 100, 0, 100);
          }
        } else {
          recommendedHeading = ship.heading;
          recommendedThrottle = 0;
        }
        break;
      case 'breakAway': {
        const awayBearing = normalizeHeading(bearing + 180);
        if (object.id === this.enemyActual.id && this.state.sensors.systemsMapped) {
          const bearingEnemyToShip = normalizeHeading(Math.atan2(ship.x - this.enemyActual.x, ship.y - this.enemyActual.y) * 180 / Math.PI);
          const enemyRelative = this.signedHeadingDelta(bearingEnemyToShip, this.enemyActual.heading);
          const side = enemyRelative >= 0 ? 1 : -1;
          recommendedHeading = normalizeHeading(bearing + side * 105);
        } else recommendedHeading = awayBearing;
        recommendedThrottle = 100;
        break;
      }
      case 'emergencyReverse':
        recommendedHeading = ship.heading;
        recommendedThrottle = -100;
        break;
      case 'hold':
        recommendedHeading = ship.heading;
        recommendedThrottle = 0;
        break;
    }

    helm.recommendedHeading = recommendedHeading;
    helm.recommendedThrottle = recommendedThrottle;
    if (helm.assistEnabled && recommendedHeading !== null && recommendedThrottle !== null) {
      ship.requestedHeading = normalizeHeading(recommendedHeading);
      ship.throttle = clamp(recommendedThrottle, -100, 100);
    }
  }

  private disengageHelmAssistForManualControl() {
    if (this.state.helm.assistEnabled) this.state.helm.assistEnabled = false;
  }

  private setHelmManeuver(maneuver: HelmManeuver): boolean {
    const allowed: HelmManeuver[] = ['manual', 'intercept', 'flankPort', 'flankStarboard', 'takeStern', 'maintainRange', 'matchVelocity', 'breakAway', 'emergencyReverse', 'hold', 'orbitPort', 'orbitStarboard'];
    if (!allowed.includes(maneuver)) return false;
    const targetRequired = ['intercept', 'flankPort', 'flankStarboard', 'takeStern', 'maintainRange', 'matchVelocity', 'breakAway', 'orbitPort', 'orbitStarboard'].includes(maneuver);
    if (targetRequired && !this.helmSelectedObject()) {
      this.log('HELM: Select a navigation contact before engaging that maneuver director.');
      return false;
    }
    this.state.helm.maneuver = maneuver;
    if (maneuver === 'manual') this.state.helm.assistEnabled = false;
    if (maneuver === 'maintainRange') {
      const object = this.helmSelectedObject();
      if (object) {
        const motion = this.targetMotionForHelm(object);
        this.state.helm.desiredRelativePosition = this.currentTargetRelativePosition(object, motion.heading);
      }
    } else if (!['flankPort', 'flankStarboard', 'takeStern', 'orbitPort', 'orbitStarboard'].includes(maneuver)) {
      this.state.helm.desiredRelativePosition = null;
    }
    this.updateHelmFlightDirector();
    return true;
  }

  private setHelmAssist(enabled: boolean): boolean {
    if (enabled && this.state.helm.maneuver === 'manual') return false;
    this.state.helm.assistEnabled = enabled;
    this.updateHelmFlightDirector();
    return true;
  }

  private setHelmOrbitRange(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    this.state.helm.orbitRange = clamp(value, 4, 30);
    this.updateHelmFlightDirector();
    return true;
  }

  private updateShipMovement(dt: number) {
    const ship = this.state.ship;
    const engineHealth = this.shipEngineHealthFactor();
    const flight = ACTIVE_SHIP_PROFILE.flight;
    const turnAuthority = this.shipTurnAuthorityFactor();
    const turnRate = (flight.baseTurnRateDegreesPerSecond + flight.enginePowerTurnBonusDegreesPerSecond * clamp(ship.enginePower / 100, 0, 1)) * engineHealth * turnAuthority;
    let delta = this.signedHeadingDelta(ship.requestedHeading, ship.heading);
    delta = clamp(delta, -turnRate * dt, turnRate * dt);
    ship.heading = normalizeHeading(ship.heading + delta);

    const throttleRatio = clamp(ship.throttle / 100, -1, 1);
    const targetSpeed = throttleRatio >= 0
      ? throttleRatio * this.effectiveShipForwardSpeed()
      : throttleRatio * this.effectiveShipReverseSpeed();
    ship.speed += (targetSpeed - ship.speed) * Math.min(1, dt * flight.accelerationResponse);

    const lateralRatio = clamp(ship.lateralThrust / 100, -1, 1);
    const targetLateralSpeed = lateralRatio * this.effectiveShipForwardSpeed() * flight.lateralThrustFraction;
    ship.lateralSpeed += (targetLateralSpeed - ship.lateralSpeed) * Math.min(1, dt * flight.lateralAccelerationResponse);
    if (engineHealth <= 0) ship.lateralSpeed += (0 - ship.lateralSpeed) * Math.min(1, dt * 2.5);

    const radians = ship.heading * Math.PI / 180;
    const starboardRadians = (ship.heading + 90) * Math.PI / 180;
    ship.x += (Math.sin(radians) * ship.speed + Math.sin(starboardRadians) * ship.lateralSpeed) * dt;
    ship.y += (Math.cos(radians) * ship.speed + Math.cos(starboardRadians) * ship.lateralSpeed) * dt;

    const weaponHealth = this.state.systems.weapons <= 0 ? 0 : clamp(this.state.systems.weapons / 100, 0.2, 1);
    const shieldHealth = this.state.systems.shields <= 0 ? 0 : clamp(this.state.systems.shields / 100, 0.2, 1);
    ship.beamCharge = clamp(ship.beamCharge + (4 + ship.weaponPower * 0.12) * weaponHealth * dt, 0, 100);
    ship.shields = clamp(ship.shields + ship.shieldPower * 0.015 * shieldHealth * dt, 0, 100);
  }

  private updateMissionStageByRange() {
    if (this.state.missionStage === 'intercept' && this.rangeToEnemy() <= 18) {
      this.state.missionStage = 'combat';
      this.state.currentObjective = `Engage and disable ${this.enemyActual.trueName}.`;
      this.log('TACTICAL: Target entering effective weapons envelope.');
      this.comms('tactical', AI_OFFICERS.tactical, 'Target entering effective weapons range. Firing solution available.', 'report');
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
        this.comms('tactical', AI_OFFICERS.tactical, 'First hostile destroyed.', 'report');
        this.comms('science', AI_OFFICERS.science, 'Captain, I have another contact inbound on long-range sensors.', 'warning');
        // Prevent this branch from running on every tick while the reinforcement timer counts down.
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
        this.comms('tactical', AI_OFFICERS.tactical, 'All hostile contacts neutralized.', 'report');
        this.comms('science', AI_OFFICERS.science, 'No additional contacts on sensors. Relay lane is clear.', 'report');
      }
    } else if (this.state.ship.hull <= 0) {
      this.state.missionStatus = 'defeat';
      this.state.missionStage = 'defeat';
      this.state.currentObjective = 'Mission failed. Reset to briefing to try again.';
      this.log('MISSION FAILED: Your ship has been destroyed.');
      this.comms('computer', 'Bridge Computer', 'Critical hull failure. Mission terminated.', 'warning');
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
      hullEstimate: 'Unknown',
      tacticalAnalysisActive: false,
      tacticalAnalysisProgress: 0,
      shieldFrequency: null,
      shieldSolution: false,
      systemsMapped: false
    };
    this.state.tactical = this.createTacticalState();
    this.enemyFireCooldown = wave === 1 ? 4 : 2.5;
    this.scanIdentityLogged = false;
    this.scanCompleteLogged = false;
    this.tacticalFrequencyLogged = false;
    this.tacticalSystemsLogged = false;
    this.aiPrecisionLockTimer = 0;
    this.setAiStatus('science', 'New contact detected');
    this.setAiStatus('tactical', 'Awaiting target identification');
    if (wave === 2) this.comms('science', AI_OFFICERS.science, 'Second contact acquired. Beginning identification sweep.', 'warning');
    this.syncEnemyPublicState();
  }

  private enemyForWave(wave: 1 | 2): InternalEnemy {
    if (wave === 1) {
      return {
        id: 'raider-1',
        trueName: 'Kestrel Raider',
        className: 'Kestrel-class raider',
        weapons: 'Medium beam array, torpedo launcher',
        shieldFrequency: '184.7 THz • DELTA-7',
        x: 28,
        y: 11,
        heading: 248,
        speed: 0,
        maxSpeed: 0.82,
        turnRateDegreesPerSecond: 12,
        maneuverState: 'approach',
        maneuverTimer: 0,
        maneuverHeading: 248,
        maneuverSide: 1,
        beamRange: 16,
        beamArcDegrees: 120,
        hull: 100,
        shields: 65,
        maxShields: 65,
        systems: { engines: 100, shields: 100, weapons: 100, sensors: 100, communications: 100 },
        alive: true,
        wave: 1
      };
    }
    return {
      id: 'raider-2',
      trueName: 'Viper Command Raider',
      className: 'Viper-class command raider',
      weapons: 'Heavy beams, rapid torpedo launcher',
      shieldFrequency: '231.2 THz • SIGMA-4',
      x: -24,
      y: 24,
      heading: 135,
      speed: 0,
      maxSpeed: 1.05,
      turnRateDegreesPerSecond: 16,
      maneuverState: 'approach',
      maneuverTimer: 0,
      maneuverHeading: 135,
      maneuverSide: -1,
      beamRange: 16,
      beamArcDegrees: 140,
      hull: 100,
      shields: 90,
      maxShields: 90,
      systems: { engines: 100, shields: 100, weapons: 100, sensors: 100, communications: 100 },
      alive: true,
      wave: 2
    };
  }

  private setHeading(value: number) {
    this.state.ship.requestedHeading = normalizeHeading(value);
  }

  private setThrottle(value: number) {
    this.state.ship.throttle = clamp(value, -100, 100);
  }

  private setLateralThrust(value: number) {
    this.state.ship.lateralThrust = clamp(value, -100, 100);
  }

  private bearingToEnemy(): number {
    const dx = this.enemyActual.x - this.state.ship.x;
    const dy = this.enemyActual.y - this.state.ship.y;
    return normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
  }

  private enemyWithinWeaponArc(arcDegrees: number): boolean {
    if (arcDegrees >= 359.9) return true;
    const bearing = this.bearingToEnemy();
    const delta = ((bearing - this.state.ship.heading + 540) % 360) - 180;
    return Math.abs(delta) <= arcDegrees / 2;
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
    if (this.state.stationSelections.tacticalContactId !== this.enemyActual.id) { this.log('TACTICAL: Weapons interlock — selected contact is not an active hostile target.'); return; }
    if (this.state.systems.weapons <= 0) { this.log('TACTICAL: Weapons control offline. Engineering restoration required.'); return; }
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive) return;
    if (this.state.sensors.intelLevel < 1) {
      this.log('Tactical: No verified firing solution. Science must identify the contact first.');
      return;
    }
    const ship = this.state.ship;
    if (ship.beamCharge < 25) return;
    const range = this.rangeToEnemy();
    const beam = ACTIVE_SHIP_PROFILE.weapons;
    const timing = this.state.tactical.beamTiming;
    const timingBonus = timing.status === 'synced' ? timing.bonusMultiplier : 1;
    const timingQuality = timing.status === 'synced' ? timing.quality : 0;
    if (!this.enemyWithinWeaponArc(beam.beamArcDegrees)) {
      this.log(`Tactical: Beam interlock — target is outside the ${Math.round(beam.beamArcDegrees)}° beam firing arc.`);
      return;
    }
    if (range > beam.beamRange) {
      this.log(`Tactical: Beam shot dissipated outside ${beam.beamRange.toFixed(0)} km effective range.`);
      ship.beamCharge -= 25;
      if (timing.status === 'synced') this.resetBeamTiming();
      return;
    }
    ship.beamCharge -= 25;
    const output = this.weaponOutputMultiplier();
    const timingText = timingBonus > 1 ? ` • capacitor sync ${timingQuality}%` : '';
    this.damageEnemy(14 * output * timingBonus, `Beam strike • ${output.toFixed(2)}× weapon output${timingText}`);
    if (timing.status === 'synced') this.resetBeamTiming();
  }

  private fireTorpedo() {
    if (this.state.stationSelections.tacticalContactId !== this.enemyActual.id) { this.log('TACTICAL: Weapons interlock — selected contact is not an active hostile target.'); return; }
    if (this.state.systems.weapons <= 0) { this.log('TACTICAL: Torpedo control offline. Engineering restoration required.'); return; }
    if (this.state.missionStatus !== 'running' || !this.enemyActual.alive) return;
    if (this.state.sensors.intelLevel < 1) {
      this.log('Tactical: No verified firing solution. Science must identify the contact first.');
      return;
    }
    const ship = this.state.ship;
    if (ship.torpedoes <= 0) return;
    const guidance = this.state.tactical.torpedoGuidance;
    const guidanceReady = guidance.status === 'ready' && guidance.target === this.state.tactical.selectedTarget;
    const guidanceBonus = guidanceReady ? guidance.bonusMultiplier : 1;
    const guidanceQuality = guidanceReady ? guidance.quality : 0;
    const torpedo = ACTIVE_SHIP_PROFILE.weapons;
    if (!this.enemyWithinWeaponArc(torpedo.torpedoArcDegrees)) {
      this.log(`Tactical: Torpedo interlock — target is outside the ${Math.round(torpedo.torpedoArcDegrees)}° launcher arc.`);
      return;
    }
    ship.torpedoes -= 1;
    if (this.rangeToEnemy() > torpedo.torpedoRange) {
      this.log(`Tactical: Torpedo lost target lock outside ${torpedo.torpedoRange.toFixed(0)} km effective range.`);
      if (guidanceReady) this.resetTorpedoGuidance();
      return;
    }
    const output = this.weaponOutputMultiplier();
    const guidanceText = guidanceReady ? ` • guidance ${guidanceQuality}%` : '';
    this.damageEnemy(28 * output * guidanceBonus, `Torpedo impact • ${output.toFixed(2)}× weapon output${guidanceText}`);
    if (guidanceReady) this.resetTorpedoGuidance();
  }

  private enemyBehavior(dt: number) {
    const enemy = this.enemyActual;
    if (!enemy.alive) return;
    const ship = this.state.ship;
    const dx = ship.x - enemy.x;
    const dy = ship.y - enemy.y;
    const range = Math.hypot(dx, dy);

    const shieldSystemEfficiency = enemy.systems.shields <= 0 ? 0 : clamp(enemy.systems.shields / 100, 0.15, 1);
    if (enemy.shields > 0 && enemy.shields < enemy.maxShields && shieldSystemEfficiency > 0) {
      enemy.shields = clamp(enemy.shields + 0.45 * shieldSystemEfficiency * dt, 0, enemy.maxShields);
    }

    const engineEfficiency = enemy.systems.engines <= 0 ? 0 : clamp(enemy.systems.engines / 100, 0.18, 1);
    if (this.state.sensors.intelLevel >= 1 && engineEfficiency > 0) {
      enemy.maneuverTimer = Math.max(0, enemy.maneuverTimer - dt);
      const bearingToShip = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
      const shipRadians = ship.heading * Math.PI / 180;
      const shipStarboardRadians = (ship.heading + 90) * Math.PI / 180;
      const shipVx = Math.sin(shipRadians) * ship.speed + Math.sin(shipStarboardRadians) * ship.lateralSpeed;
      const shipVy = Math.cos(shipRadians) * ship.speed + Math.cos(shipStarboardRadians) * ship.lateralSpeed;
      const leadSeconds = clamp(range / Math.max(1, enemy.maxSpeed + Math.abs(ship.speed) * 0.35), 0, 2.5);
      const leadBearing = normalizeHeading(Math.atan2((ship.x + shipVx * leadSeconds) - enemy.x, (ship.y + shipVy * leadSeconds) - enemy.y) * 180 / Math.PI);
      const firingDelta = Math.abs(this.signedHeadingDelta(bearingToShip, enemy.heading));

      // Hostiles now commit to attack passes instead of tracking the player's nose every frame.
      // That creates exploitable flank/stern windows for a skilled Helm officer.
      if (enemy.maneuverState === 'approach' && range <= enemy.beamRange * 0.95 && firingDelta <= enemy.beamArcDegrees * 0.42) {
        enemy.maneuverState = 'attackRun';
        enemy.maneuverTimer = enemy.wave === 2 ? 4.2 : 4.8;
        enemy.maneuverHeading = leadBearing;
      } else if (enemy.maneuverState === 'attackRun' && enemy.maneuverTimer <= 0) {
        enemy.maneuverState = 'extend';
        enemy.maneuverTimer = enemy.wave === 2 ? 3.0 : 3.7;
        enemy.maneuverHeading = enemy.heading;
      } else if (enemy.maneuverState === 'extend' && (enemy.maneuverTimer <= 0 || range > enemy.beamRange * 1.45)) {
        enemy.maneuverState = 'reposition';
        enemy.maneuverTimer = enemy.wave === 2 ? 3.6 : 4.2;
        enemy.maneuverSide = enemy.maneuverSide === 1 ? -1 : 1;
      } else if (enemy.maneuverState === 'reposition' && (enemy.maneuverTimer <= 0 || range > enemy.beamRange * 1.25)) {
        enemy.maneuverState = 'approach';
        enemy.maneuverTimer = 0;
      }

      let desiredHeading = bearingToShip;
      let speedFactor = 0.78;
      let turnFactor = 0.88;
      switch (enemy.maneuverState) {
        case 'approach':
          desiredHeading = leadBearing;
          speedFactor = range > enemy.beamRange ? 0.88 : 0.72;
          turnFactor = 0.88;
          break;
        case 'attackRun':
          desiredHeading = enemy.maneuverHeading;
          speedFactor = 1;
          turnFactor = 0.52;
          break;
        case 'extend':
          desiredHeading = enemy.maneuverHeading;
          speedFactor = 1;
          turnFactor = 0.28;
          break;
        case 'reposition':
          desiredHeading = normalizeHeading(leadBearing + enemy.maneuverSide * 38);
          speedFactor = 0.68;
          turnFactor = 1;
          break;
      }

      const turnRate = enemy.turnRateDegreesPerSecond * engineEfficiency * turnFactor;
      let headingDelta = this.signedHeadingDelta(desiredHeading, enemy.heading);
      headingDelta = clamp(headingDelta, -turnRate * dt, turnRate * dt);
      enemy.heading = normalizeHeading(enemy.heading + headingDelta);

      const desiredSpeed = enemy.maxSpeed * speedFactor * engineEfficiency;
      enemy.speed += (desiredSpeed - enemy.speed) * Math.min(1, dt * 1.25);
      const enemyRadians = enemy.heading * Math.PI / 180;
      enemy.x += Math.sin(enemyRadians) * enemy.speed * dt;
      enemy.y += Math.cos(enemyRadians) * enemy.speed * dt;
    } else {
      enemy.speed += (0 - enemy.speed) * Math.min(1, dt * 1.5);
    }

    this.enemyFireCooldown -= dt;
    const weaponEfficiency = enemy.systems.weapons <= 0 ? 0 : clamp(enemy.systems.weapons / 100, 0.2, 1);
    const postMoveRange = Math.hypot(ship.x - enemy.x, ship.y - enemy.y);
    const bearingToShip = normalizeHeading(Math.atan2(ship.x - enemy.x, ship.y - enemy.y) * 180 / Math.PI);
    const firingDelta = this.signedHeadingDelta(bearingToShip, enemy.heading);
    const playerInEnemyArc = Math.abs(firingDelta) <= enemy.beamArcDegrees / 2;
    if (this.state.sensors.intelLevel >= 1 && postMoveRange < enemy.beamRange && playerInEnemyArc && this.enemyFireCooldown <= 0 && weaponEfficiency > 0) {
      const baseCooldown = enemy.wave === 2 ? 2.7 : 3.5;
      this.enemyFireCooldown = baseCooldown / weaponEfficiency;
      let sensorAccuracy = enemy.systems.sensors <= 0 ? 0.35 : 0.35 + 0.65 * clamp(enemy.systems.sensors / 100, 0, 1);
      const ew = this.state.communications.electronicWarfare;
      if (ew.jammingActive && ew.jamTargetId === enemy.id && this.state.systems.communications > 0) {
        const interference = 0.12 + 0.28 * (ew.jammingStrength / 100);
        sensorAccuracy *= (1 - interference);
      }
      if (this.random() > sensorAccuracy) {
        this.log('Enemy weapons fire missed after degraded targeting solution.');
        return;
      }
      const damage = (enemy.wave === 2 ? 11 : 8) * (0.55 + 0.45 * weaponEfficiency);
      let hullDamage = 0;
      if (ship.shields > 0) {
        const absorbed = Math.min(ship.shields, damage);
        ship.shields -= absorbed;
        hullDamage = damage - absorbed;
        ship.hull -= hullDamage;
      } else {
        hullDamage = damage;
        ship.hull -= hullDamage;
      }
      ship.hull = clamp(ship.hull, 0, 100);
      this.log(`Enemy weapons hit: shields ${Math.round(ship.shields)}%, hull ${Math.round(ship.hull)}%.`);
      if (ship.shields < 70 || ship.hull < 100) {
        this.damageSubsystem((enemy.wave === 2 ? 12 : 8) * (0.6 + 0.4 * weaponEfficiency));
        this.maybeCatastrophicSubsystemFailure(hullDamage, enemy.wave);
      }
      if (ship.shields < 50 && !this.shieldWarningIssued) {
        this.shieldWarningIssued = true;
        this.comms('engineering', AI_OFFICERS.engineering, `Shield strength below fifty percent. Current shields ${Math.round(ship.shields)} percent.`, 'warning');
      }
      if (ship.hull < 75 && !this.hullWarningIssued) {
        this.hullWarningIssued = true;
        this.comms('engineering', AI_OFFICERS.engineering, `Hull integrity is down to ${Math.round(ship.hull)} percent. Recommend defensive power.`, 'warning');
      }
    }
  }

  private applyTargetedEnemySubsystemDamage(shieldDamage: number, hullDamage: number, source: string) {
    const target = this.state.tactical.selectedTarget;
    const lock = this.state.tactical.lock;
    if (target === 'hull' || !this.state.sensors.systemsMapped || lock.status !== 'locked' || lock.target !== target || lock.quality < 70) return;
    const current = this.enemyActual.systems[target];
    if (current <= 0) return;

    let basis = 0;
    if (target === 'shields') basis = shieldDamage > 0 ? shieldDamage * 0.55 : hullDamage * 0.9;
    else basis = hullDamage * 1.15;
    if (basis <= 0) return;

    const precisionFactor = 0.65 + (lock.quality / 100) * 0.55;
    const subsystemDamage = Math.max(1, basis * precisionFactor);
    this.enemyActual.systems[target] = clamp(current - subsystemDamage, 0, 100);
    const remaining = this.enemyActual.systems[target];
    this.log(`${source}: precision hit on enemy ${target.toUpperCase()} • subsystem ${Math.round(remaining)}%.`);
    if (remaining <= 0) {
      this.log(`TACTICAL: Enemy ${target.toUpperCase()} subsystem disabled.`);
      this.comms('tactical', AI_OFFICERS.tactical, `Enemy ${target} subsystem disabled.`, 'report');
    }
  }

  private damageEnemy(amount: number, source: string) {
    const enemy = this.enemyActual;
    let remaining = amount;
    let shieldDamage = 0;
    let hullDamage = 0;
    if (enemy.shields > 0) {
      const coupling = this.state.sensors.shieldSolution ? 1.4 : 1;
      const possibleShieldDamage = remaining * coupling;
      shieldDamage = Math.min(enemy.shields, possibleShieldDamage);
      enemy.shields -= shieldDamage;
      remaining -= shieldDamage / coupling;
    }
    hullDamage = Math.max(0, remaining);
    enemy.hull = clamp(enemy.hull - hullDamage, 0, 100);
    this.applyTargetedEnemySubsystemDamage(shieldDamage, hullDamage, source);
    if (enemy.hull <= 0) enemy.alive = false;

    if (this.state.sensors.intelLevel >= 2) {
      const resonance = this.state.sensors.shieldSolution && shieldDamage > 0 ? ' • shield modulation active' : '';
      this.log(`${source}: enemy shields ${Math.round(enemy.shields)}%, hull ${Math.round(enemy.hull)}%${resonance}.`);
    } else {
      this.log(`${source}: impact confirmed on hostile contact.`);
    }
    this.syncEnemyPublicState();
  }

  private rangeToEnemy() {
    return Math.hypot(this.state.ship.x - this.enemyActual.x, this.state.ship.y - this.enemyActual.y);
  }

  private syncEnemyPublicState() {
    if (this.state.missionId === 'meridian-distress') {
      this.state.enemy = { id: 'none', name: 'No Hostile Contact', x: 0, y: 0, hull: null, shields: null, alive: false, wave: 0, systems: { engines: null, shields: null, weapons: null, sensors: null, communications: null }, heading: null, speed: null, beamRange: null, beamArcDegrees: null };
      return;
    }
    const intel = this.state.sensors.intelLevel;
    this.state.enemy = {
      id: this.enemyActual.id,
      name: intel >= 1 ? this.enemyActual.trueName : 'Unknown Contact',
      x: this.enemyActual.x,
      y: this.enemyActual.y,
      hull: intel >= 2 ? this.enemyActual.hull : null,
      shields: intel >= 2 ? this.enemyActual.shields : null,
      alive: this.enemyActual.alive,
      wave: this.state.encounter,
      systems: this.state.sensors.systemsMapped
        ? { ...this.enemyActual.systems }
        : { engines: null, shields: null, weapons: null, sensors: null, communications: null },
      heading: this.state.sensors.systemsMapped ? this.enemyActual.heading : null,
      speed: this.state.sensors.systemsMapped ? this.enemyActual.speed : null,
      beamRange: this.state.sensors.systemsMapped ? this.enemyActual.beamRange : null,
      beamArcDegrees: this.state.sensors.systemsMapped ? this.enemyActual.beamArcDegrees : null
    };
    if (intel >= 2) {
      this.state.sensors.shieldEstimate = `${Math.round(this.enemyActual.shields)}%`;
      this.state.sensors.hullEstimate = `${Math.round(this.enemyActual.hull)}%`;
    }
  }

  private comms(role: Role | 'computer' | 'external', speaker: string, message: string, tone: 'captain' | 'ack' | 'report' | 'warning' | 'system' | 'external') {
    this.state.commsLog.unshift({ id: ++this.commsSequence, speaker, role, message, tone });
    this.state.commsLog = this.state.commsLog.slice(0, 30);
  }

  private log(message: string) {
    if (this.state.eventLog[0] === message) return;
    this.state.eventLog.unshift(message);
    this.state.eventLog = this.state.eventLog.slice(0, 20);
  }

  safeSnapshot(): GameSnapshot {
    this.syncEnemyPublicState();
    this.syncSpaceObjects();
    this.updateCaptainNavigationCourse();
    this.updateHelmFlightDirector();
    this.syncEnemyPublicState();
    return structuredClone(this.state);
  }
}
