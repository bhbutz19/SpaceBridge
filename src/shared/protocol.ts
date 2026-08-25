export const ROLES = ['captain', 'helm', 'tactical', 'engineering', 'science', 'communications'] as const;
export type Role = (typeof ROLES)[number];
export type OperationalRole = Exclude<Role, 'captain'>;

export type MissionId = 'signal-dark' | 'meridian-distress';
export type SystemName = 'engines' | 'shields' | 'weapons' | 'sensors' | 'communications';

export type SpaceObjectType = 'ship' | 'station' | 'planet' | 'moon' | 'asteroid' | 'anomaly' | 'debris' | 'beacon';
export type SpaceObjectDisposition = 'player' | 'friendly' | 'neutral' | 'unknown' | 'hostile';
export type SpaceObjectState = {
  id: string;
  name: string;
  objectType: SpaceObjectType;
  subtype: string;
  disposition: SpaceObjectDisposition;
  x: number;
  y: number;
  radius: number;
  selectable: boolean;
  targetable: boolean;
  alive: boolean;
  identified: boolean;
  contactStatus?: string;
};
export type StationSelectionState = { tacticalContactId: string | null; scienceContactId: string | null; communicationsContactId: string | null; helmContactId: string | null };

export type HelmManeuver = 'manual' | 'intercept' | 'flankPort' | 'flankStarboard' | 'takeStern' | 'maintainRange' | 'matchVelocity' | 'breakAway' | 'emergencyReverse' | 'hold' | 'orbitPort' | 'orbitStarboard';
export type HelmAspect = 'none' | 'stationary' | 'headOn' | 'pursuit' | 'crossing';
export type HelmPositionalAdvantage = 'unknown' | 'danger' | 'neutral' | 'flank' | 'stern';
export type EnemyManeuverState = 'approach' | 'attackRun' | 'extend' | 'reposition';
export type HelmState = {
  selectedContactId: string | null;
  maneuver: HelmManeuver;
  assistEnabled: boolean;
  orbitRange: number;
  recommendedHeading: number | null;
  recommendedThrottle: number | null;
  targetRange: number | null;
  targetBearing: number | null;
  relativeBearing: number | null;
  closingSpeed: number | null;
  aspect: HelmAspect;
  insideEnemyArc: boolean | null;
  targetRelativePosition: number | null;
  desiredRelativePosition: number | null;
  positionError: number | null;
  positionalAdvantage: HelmPositionalAdvantage;
  turnAuthority: number;
  enemyManeuver: EnemyManeuverState | null;
};

export type ShipCapabilitiesState = {
  profileId: string;
  profileName: string;
  stationSensors: {
    tacticalRange: number;
    helmRange: number;
    scienceRange: number | null;
  };
  weapons: {
    beamRange: number;
    beamArcDegrees: number;
    torpedoRange: number;
    torpedoArcDegrees: number;
  };
  flight: {
    maxForwardSpeed: number;
    maxReverseSpeed: number;
    baseTurnRateDegreesPerSecond: number;
    enginePowerTurnBonusDegreesPerSecond: number;
    accelerationResponse: number;
    lateralThrustFraction: number;
    lateralAccelerationResponse: number;
    maneuverOptimalMinFraction: number;
    maneuverOptimalMaxFraction: number;
    lowSpeedTurnFactor: number;
    highSpeedTurnFactor: number;
    defaultCombatOrbitRange: number;
  };
};

export type CrewOrder =
  | 'auto' | 'intercept' | 'hold' | 'evade'
  | 'weaponsFree' | 'holdFire'
  | 'balanced' | 'shields' | 'weapons' | 'engines'
  | 'scan' | 'passive'
  | 'monitor' | 'hail' | 'silent';

export type RoleAssignment = {
  role: Role;
  sessionId: string | null;
  playerName: string | null;
  controller: 'human' | 'ai';
  aiOfficerName: string;
  status: string;
  captainOrder: CrewOrder | null;
};

export type ShipState = {
  heading: number; requestedHeading: number; throttle: number; speed: number; lateralThrust: number; lateralSpeed: number;
  hull: number; shields: number; shieldPower: number; enginePower: number; weaponPower: number;
  beamCharge: number; torpedoes: number; x: number; y: number;
};

export type EnemySubsystemHealthState = Record<SystemName, number | null>;
export type EnemyState = { id: string; name: string; x: number; y: number; hull: number | null; shields: number | null; alive: boolean; wave: number; systems: EnemySubsystemHealthState; heading: number | null; speed: number | null; beamRange: number | null; beamArcDegrees: number | null; };
export type SensorState = {
  scanActive: boolean; scanProgress: number; intelLevel: 0 | 1 | 2; contactClass: string; weaponsEstimate: string; shieldEstimate: string; hullEstimate: string;
  tacticalAnalysisActive: boolean; tacticalAnalysisProgress: number; shieldFrequency: string | null; shieldSolution: boolean; systemsMapped: boolean;
};

export type TacticalTarget = 'hull' | SystemName;
export type TargetLockAxis = 'azimuth' | 'elevation' | 'velocity';
export type TargetLockAxisState = { axis: TargetLockAxis; target: number; value: number };
export type TargetLockState = { target: TacticalTarget; status: 'idle' | 'aligning' | 'locked'; quality: number; strikes: number; axes: TargetLockAxisState[] };
export type BeamTimingState = {
  phase: number;
  sweetSpot: number;
  window: number;
  status: 'idle' | 'synced';
  quality: number;
  bonusMultiplier: number;
  strikes: number;
};
export type TorpedoGuidanceState = {
  target: TacticalTarget;
  status: 'idle' | 'guiding' | 'ready';
  stage: number;
  phase: number;
  gates: number[];
  samples: number[];
  strikes: number;
  quality: number;
  bonusMultiplier: number;
};
export type TacticalState = {
  selectedTarget: TacticalTarget;
  lock: TargetLockState;
  weaponOutputMultiplier: number;
  shieldDamageMultiplier: number;
  beamTiming: BeamTimingState;
  torpedoGuidance: TorpedoGuidanceState;
};


export type CommsPriority = 'routine' | 'priority' | 'urgent' | 'hostile';
export type CommsTransmissionKind = 'distress' | 'hail' | 'tactical' | 'intercept' | 'coded';
export type CommsTransmissionStatus = 'queued' | 'tuning' | 'open' | 'resolved';
export type CommsResponseOption = { id: string; label: string; outcome: string };
export type CommsTransmissionState = {
  id: number;
  sourceContactId: string | null;
  sourceName: string;
  priority: CommsPriority;
  kind: CommsTransmissionKind;
  subject: string;
  status: CommsTransmissionStatus;
  encrypted: boolean;
  frequency: number;
  tuner: number;
  filterTarget: number;
  filter: number;
  signalQuality: number;
  message: string;
  responses: CommsResponseOption[];
};
export type CommsElectronicWarfareState = {
  jamTargetId: string | null;
  jammingActive: boolean;
  jammingStrength: number;
  interceptTargetId: string | null;
  interceptActive: boolean;
  interceptProgress: number;
  interceptIntel: string | null;
};
export type CommunicationsState = {
  selectedContactId: string | null;
  activeTransmissionId: number | null;
  transmissions: CommsTransmissionState[];
  electronicWarfare: CommsElectronicWarfareState;
};

export type FriendlyContactState = {
  id: string; name: string; type: string; x: number; y: number;
  status: 'distress' | 'acknowledged' | 'rendezvous' | 'assisting' | 'safe';
  hailStatus: 'unopened' | 'open' | 'closed';
  distress: string;
  aidProgress: number;
};

export type SystemHealthState = Record<SystemName, number>;

export type RepairCrewStatus = 'idle' | 'traveling' | 'working' | 'dead';
export type RepairCrewState = {
  id: string;
  name: string;
  status: RepairCrewStatus;
  system: SystemName | null;
  destinationSystem: SystemName | null;
  travelRemaining: number;
  autoDispatch: boolean;
};

export type EngineeringPuzzleType = 'breaker' | 'coolant' | 'fuse' | 'circuit' | 'junction';
export type EngineeringPuzzleMode = 'quick' | 'restoration';
export type EngineeringPuzzleStatus = 'active' | 'solved';
export type CircuitShape = 'straight' | 'corner';
export type CircuitTileState = { index: number; shape: CircuitShape; rotation: 0 | 90 | 180 | 270 };
export type JunctionProfile = 'cyan' | 'amber' | 'magenta' | 'striped';
export type JunctionRuleCode = 'I' | 'K' | 'E' | 'A' | 'R';
export type JunctionProtocol = 'ALPHA' | 'BETA' | 'GAMMA';
export type JunctionState = { id: string; profile: JunctionProfile; lamp: boolean; tagged: boolean; isolated: boolean };
export type JunctionRuleRow = { profile: JunctionProfile; offClear: JunctionRuleCode; litClear: JunctionRuleCode; offTagged: JunctionRuleCode; litTagged: JunctionRuleCode };
export type JunctionContextState = { checksum: number; auxiliaryOnline: boolean; reserve: number; protocol: JunctionProtocol };
export type FuseBayState = { id: string; load: number; installed: number | null };
export type BreakerState = { id: string; bus: number; tripped: boolean; reset: boolean };
export type CoolantValveState = { id: string; setting: number; target: number };

export type EngineeringPuzzleState = {
  id: number;
  system: SystemName;
  type: EngineeringPuzzleType;
  mode: EngineeringPuzzleMode;
  status: EngineeringPuzzleStatus;
  moves: number;
  strikes: number;
  circuitTiles?: CircuitTileState[];
  circuitSize?: number;
  circuitSourceIndex?: number;
  circuitSinkIndex?: number;
  junctions?: JunctionState[];
  junctionRules?: JunctionRuleRow[];
  junctionContext?: JunctionContextState;
  fuseBays?: FuseBayState[];
  fuseOptions?: number[];
  breakers?: BreakerState[];
  coolantValves?: CoolantValveState[];
};

export type MissionStage =
  | 'briefing' | 'investigate' | 'intercept' | 'combat' | 'reinforcement'
  | 'distress' | 'rendezvous' | 'assist'
  | 'victory' | 'defeat';

export type CommsTone = 'captain' | 'ack' | 'report' | 'warning' | 'system' | 'external';
export type BridgeCommsEntry = { id: number; speaker: string; role: Role | 'computer' | 'external'; message: string; tone: CommsTone; };

export type GameSnapshot = {
  serverTime: number;
  missionId: MissionId;
  missionStatus: 'briefing' | 'running' | 'victory' | 'defeat';
  missionStage: MissionStage;
  missionTitle: string;
  currentObjective: string;
  encounter: number;
  ship: ShipState;
  enemy: EnemyState;
  sensors: SensorState;
  tactical: TacticalState;
  helm: HelmState;
  friendlyContact: FriendlyContactState | null;
  spaceObjects: SpaceObjectState[];
  stationSelections: StationSelectionState;
  shipCapabilities: ShipCapabilitiesState;
  captainHeadingOrder: number | null;
  captainNavigationTargetId: string | null;
  systems: SystemHealthState;
  repairTarget: SystemName | null;
  repairProgress: number;
  repairCrews: RepairCrewState[];
  engineeringPuzzle: EngineeringPuzzleState | null;
  repairBoostRemaining: number;
  repairBoostSystem: SystemName | null;
  repairBoosts: SystemHealthState;
  roles: RoleAssignment[];
  eventLog: string[];
  commsLog: BridgeCommsEntry[];
  communications: CommunicationsState;
};

export type StationCommand =
  | { type: 'startMission' }
  | { type: 'resetMission' }
  | { type: 'selectMission'; missionId: MissionId }
  | { type: 'issueOrder'; role: OperationalRole; order: CrewOrder }
  | { type: 'captainTextOrder'; text: string }
  | { type: 'issueHeadingOrder'; heading: number | null }
  | { type: 'issueNavigationTargetOrder'; contactId: string | null }
  | { type: 'setHeading'; heading: number }
  | { type: 'setThrottle'; throttle: number }
  | { type: 'setLateralThrust'; thrust: number }
  | { type: 'selectHelmContact'; contactId: string }
  | { type: 'setHelmManeuver'; maneuver: HelmManeuver }
  | { type: 'setHelmAssist'; enabled: boolean }
  | { type: 'setHelmOrbitRange'; range: number }
  | { type: 'setPower'; system: 'engines' | 'shields' | 'weapons'; value: number }
  | { type: 'setRepairTarget'; system: SystemName | null }
  | { type: 'assignRepairCrew'; crewId: string; system: SystemName | null }
  | { type: 'setRepairCrewAuto'; crewId: string; enabled: boolean }
  | { type: 'engineeringTestSetSystem'; system: SystemName; health: number }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'rotate'; index: number }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'toggleJunction'; junctionId: string }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'verifyJunctions' }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'installFuse'; bayId: string; rating: number }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'resetBreaker'; breakerId: string }
  | { type: 'engineeringPuzzleAction'; puzzleId: number; action: 'cycleCoolant'; valveId: string }
  | { type: 'fireBeam' }
  | { type: 'fireTorpedo' }
  | { type: 'selectEnemyTarget'; target: TacticalTarget }
  | { type: 'selectTacticalContact'; contactId: string }
  | { type: 'selectScienceContact'; contactId: string }
  | { type: 'selectCommunicationsContact'; contactId: string }
  | { type: 'selectTransmission'; transmissionId: number }
  | { type: 'setCommsTuner'; value: number }
  | { type: 'setCommsFilter'; value: number }
  | { type: 'verifyCommsSignal' }
  | { type: 'sendTransmissionResponse'; transmissionId: number; responseId: string }
  | { type: 'toggleCommsJamming'; contactId: string | null }
  | { type: 'startCommsIntercept'; contactId: string }
  | { type: 'startTargetLock' }
  | { type: 'setTargetLockAxis'; axis: TargetLockAxis; value: number }
  | { type: 'verifyTargetLock' }
  | { type: 'syncBeamCapacitor' }
  | { type: 'startTorpedoGuidance' }
  | { type: 'markTorpedoGuidance' }
  | { type: 'scanTarget' }
  | { type: 'beginTacticalAnalysis' }
  | { type: 'hailContact' }
  | { type: 'sendCommsResponse'; response: 'acknowledge' | 'standby' | 'decline' };

export type ClientCommand = { type: 'claimRole'; role: Role; playerName: string } | { type: 'releaseRole' } | StationCommand;
