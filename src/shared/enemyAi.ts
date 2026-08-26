import type { EnemyManeuverState } from './protocol.js';

export const ENEMY_INTENT_LABELS: Record<EnemyManeuverState, string> = {
  assess: 'ASSESSING',
  approach: 'CLOSING',
  attackRun: 'ATTACK RUN',
  strafe: 'FLANKING STRAFE',
  kite: 'STAND-OFF KITE',
  extend: 'EXTENDING',
  reposition: 'REPOSITIONING',
  disengage: 'DISENGAGING',
  recharge: 'SHIELD RECOVERY',
  flee: 'WITHDRAWING'
};

export const enemyIntentLabel = (intent: EnemyManeuverState | null): string =>
  intent === null ? 'UNKNOWN' : ENEMY_INTENT_LABELS[intent];
