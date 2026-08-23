export const ROLES = ['captain', 'helm', 'tactical', 'engineering', 'science'] as const;
export type Role = (typeof ROLES)[number];
export type OperationalRole = Exclude<Role, 'captain'>;

export type CrewOrder =
  | 'auto'
  | 'intercept'
  | 'hold'
  | 'evade'
  | 'weaponsFree'
  | 'holdFire'
  | 'balanced'
  | 'shields'
  | 'weapons'
  | 'engines'
  | 'scan'
  | 'passive';

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
  heading: number;
  requestedHeading: number;
  throttle: number;
  speed: number;
  hull: number;
  shields: number;
  shieldPower: number;
  enginePower: number;
  weaponPower: number;
  beamCharge: number;
  torpedoes: number;
  x: number;
  y: number;
};

export type EnemyState = {
  id: string;
  name: string;
  x: number;
  y: number;
  hull: number | null;
  shields: number | null;
  alive: boolean;
  wave: number;
};

export type SensorState = {
  scanActive: boolean;
  scanProgress: number;
  intelLevel: 0 | 1 | 2;
  contactClass: string;
  weaponsEstimate: string;
  shieldEstimate: string;
  hullEstimate: string;
};

export type MissionStage =
  | 'briefing'
  | 'investigate'
  | 'intercept'
  | 'combat'
  | 'reinforcement'
  | 'victory'
  | 'defeat';

export type CommsTone = 'captain' | 'ack' | 'report' | 'warning' | 'system';

export type BridgeCommsEntry = {
  id: number;
  speaker: string;
  role: Role | 'computer';
  message: string;
  tone: CommsTone;
};

export type GameSnapshot = {
  serverTime: number;
  missionStatus: 'briefing' | 'running' | 'victory' | 'defeat';
  missionStage: MissionStage;
  missionTitle: string;
  currentObjective: string;
  encounter: number;
  ship: ShipState;
  enemy: EnemyState;
  sensors: SensorState;
  roles: RoleAssignment[];
  eventLog: string[];
  commsLog?: BridgeCommsEntry[];
};

export type StationCommand =
  | { type: 'startMission' }
  | { type: 'resetMission' }
  | { type: 'issueOrder'; role: OperationalRole; order: CrewOrder }
  | { type: 'captainTextOrder'; text: string }
  | { type: 'setHeading'; heading: number }
  | { type: 'setThrottle'; throttle: number }
  | { type: 'setPower'; system: 'engines' | 'shields' | 'weapons'; value: number }
  | { type: 'fireBeam' }
  | { type: 'fireTorpedo' }
  | { type: 'scanTarget' };

export type ClientCommand =
  | { type: 'claimRole'; role: Role; playerName: string }
  | { type: 'releaseRole' }
  | StationCommand;
