import type { CommsTransmissionState, EnemyState } from './protocol.js';

export type CaptainPortraitId = 'meridian' | 'kestrel' | 'viper';

export function captainPortraitForTransmission(transmission: CommsTransmissionState | null, enemy: EnemyState): CaptainPortraitId | null {
  if (!transmission || !['hail', 'distress'].includes(transmission.kind)) return null;
  if (transmission.sourceContactId === 'meridian') return 'meridian';
  if (transmission.sourceContactId === enemy.id) return enemy.wave >= 2 ? 'viper' : 'kestrel';
  return null;
}
