import type { EnemyAiDoctrine, EnemyAiTrait, HailPriority } from '../../shared/protocol.js';

export type EnemyAiProfile = {
  id: string;
  displayName: string;
  doctrine: EnemyAiDoctrine;
  traits: EnemyAiTrait[];
  aggression: number;
  caution: number;
  persistence: number;
  discipline: number;
  curiosity: number;
  preferredRange: number;
  decisionIntervalSeconds: number;
  minimumCommitmentSeconds: number;
  attackCommitmentSeconds: number;
  extendCommitmentSeconds: number;
  transitionMargin: number;
  shieldBreakRatio: number;
  shieldReengageRatio: number;
  hullFleeRatio: number;
  strafeBias: number;
  kiteBias: number;
  hailPriority: HailPriority;
  surpriseAttack: boolean;
  agreementReliability: number;
};

export const ENEMY_AI_PROFILES = {
  kestrelSkirmisher: {
    id: 'kestrel-skirmisher',
    displayName: 'Cautious Flanking Skirmisher',
    doctrine: 'skirmisher',
    traits: ['cautious', 'disciplined', 'curious', 'flanker', 'kiter'],
    aggression: .56,
    caution: .76,
    persistence: .48,
    discipline: .82,
    curiosity: .68,
    preferredRange: 11.5,
    decisionIntervalSeconds: .48,
    minimumCommitmentSeconds: 1.35,
    attackCommitmentSeconds: 3.7,
    extendCommitmentSeconds: 2.5,
    transitionMargin: 8,
    shieldBreakRatio: .28,
    shieldReengageRatio: .58,
    hullFleeRatio: .20,
    strafeBias: .88,
    kiteBias: .76,
    hailPriority: 3,
    surpriseAttack: false,
    agreementReliability: .46
  },
  viperHunter: {
    id: 'viper-hunter',
    displayName: 'Persistent Assault Hunter',
    doctrine: 'hunter',
    traits: ['aggressive', 'persistent', 'disciplined', 'rusher'],
    aggression: .91,
    caution: .34,
    persistence: .9,
    discipline: .78,
    curiosity: .3,
    preferredRange: 8.5,
    decisionIntervalSeconds: .38,
    minimumCommitmentSeconds: 1.65,
    attackCommitmentSeconds: 4.4,
    extendCommitmentSeconds: 2.15,
    transitionMargin: 11,
    shieldBreakRatio: .13,
    shieldReengageRatio: .4,
    hullFleeRatio: .09,
    strafeBias: .38,
    kiteBias: .16,
    hailPriority: 2,
    surpriseAttack: true,
    agreementReliability: .08
  }
} as const satisfies Record<string, EnemyAiProfile>;

export type EnemyAiProfileId = keyof typeof ENEMY_AI_PROFILES;

export function enemyAiProfile(id: EnemyAiProfileId): EnemyAiProfile {
  return ENEMY_AI_PROFILES[id];
}
