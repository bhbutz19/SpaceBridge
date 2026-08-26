import type { EnemyState, SpaceObjectState, SystemName } from './protocol.js';

export type ShipVisualVariant = 'prototype' | 'kestrel' | 'viper' | 'civilian' | 'unknown';
export type ShieldVisualState = 'unknown' | 'strong' | 'low' | 'down';
export type HullVisualState = 'unknown' | 'stable' | 'damaged' | 'critical';

export type EnemyDamageVisualState = {
  shieldState: ShieldVisualState;
  hullState: HullVisualState;
  offlineSystems: SystemName[];
  repairPendingSeconds: number | null;
  repairingSystem: SystemName | null;
  surrendered: boolean;
};

const systemNames: SystemName[] = ['engines', 'shields', 'weapons', 'sensors', 'communications'];

export function shipVisualVariant(object: SpaceObjectState, enemy: EnemyState): ShipVisualVariant {
  if (object.disposition === 'player') return 'prototype';
  if (object.id === enemy.id || object.disposition === 'hostile') {
    if (!object.identified) return 'unknown';
    return enemy.wave >= 2 ? 'viper' : 'kestrel';
  }
  if (object.disposition === 'friendly' || object.subtype.toLowerCase().includes('civilian')) return 'civilian';
  return 'unknown';
}

export function enemyDamageVisualState(enemy: EnemyState): EnemyDamageVisualState {
  const offlineSystems = systemNames.filter((system) => enemy.systems[system] === 0);
  const pendingDelays = systemNames
    .map((system) => enemy.repairDelays[system])
    .filter((delay): delay is number => delay !== null && delay > 0);
  return {
    shieldState: enemy.shields === null ? 'unknown' : enemy.shields <= 0 ? 'down' : enemy.shields <= 35 ? 'low' : 'strong',
    hullState: enemy.hull === null ? 'unknown' : enemy.hull <= 35 ? 'critical' : enemy.hull <= 70 ? 'damaged' : 'stable',
    offlineSystems,
    repairPendingSeconds: pendingDelays.length > 0 ? Math.min(...pendingDelays) : null,
    repairingSystem: enemy.repairingSystem,
    surrendered: enemy.surrender.ceasefire || enemy.operationalState === 'surrendered'
  };
}

export function enemyVisualStatusLabel(enemy: EnemyState, visual = enemyDamageVisualState(enemy)) {
  if (!enemy.alive) return 'DESTROYED';
  if (visual.surrendered) return 'SURRENDERED';
  if (visual.repairingSystem) return `REPAIRING ${visual.repairingSystem.toUpperCase()}`;
  if (visual.repairPendingSeconds !== null) return `REPAIR MOBILIZING ${Math.ceil(visual.repairPendingSeconds)}s`;
  if (visual.offlineSystems.length > 0) return `${visual.offlineSystems.length} SYSTEM${visual.offlineSystems.length === 1 ? '' : 'S'} OFFLINE`;
  if (visual.shieldState === 'down') return 'SHIELDS DOWN';
  return enemy.operationalState.replace('-', ' ').toUpperCase();
}
