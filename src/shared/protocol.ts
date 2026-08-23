export const ROLES = ['captain', 'helm', 'tactical', 'engineering'] as const;
export type Role = (typeof ROLES)[number];

export type RoleAssignment = {
  role: Role;
  sessionId: string | null;
  playerName: string | null;
  controller: 'human' | 'ai';
  aiOfficerName: string;
  status: string;
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
  hull: number;
  shields: number;
  alive: boolean;
};

export type GameSnapshot = {
  serverTime: number;
  missionStatus: 'briefing' | 'running' | 'victory' | 'defeat';
  ship: ShipState;
  enemy: EnemyState;
  roles: RoleAssignment[];
  eventLog: string[];
};

export type StationCommand =
  | { type: 'startMission' }
  | { type: 'setHeading'; heading: number }
  | { type: 'setThrottle'; throttle: number }
  | { type: 'setPower'; system: 'engines' | 'shields' | 'weapons'; value: number }
  | { type: 'fireBeam' }
  | { type: 'fireTorpedo' };

export type ClientCommand =
  | { type: 'claimRole'; role: Role; playerName: string }
  | { type: 'releaseRole' }
  | StationCommand;
