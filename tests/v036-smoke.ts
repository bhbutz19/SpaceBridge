import { BridgeGame } from '../src/server/game.js';
import type { SpaceObjectState } from '../src/shared/protocol.js';
import { enemyDamageVisualState, enemyVisualStatusLabel, shipVisualVariant } from '../src/shared/shipVisuals.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

const object = (overrides: Partial<SpaceObjectState>): SpaceObjectState => ({
  id: 'contact', name: 'Contact', objectType: 'ship', subtype: 'Unknown vessel', disposition: 'unknown',
  x: 0, y: 0, radius: 1, selectable: true, targetable: false, alive: true, identified: false,
  ...overrides
});

function runProfileSilhouetteTest() {
  const enemy = new BridgeGame(() => .5).safeSnapshot().enemy;
  const hostile = object({ id: enemy.id, disposition: 'hostile' });
  assert(shipVisualVariant(object({ disposition: 'player' }), enemy) === 'prototype', 'Player vessel did not receive the Prototype silhouette');
  assert(shipVisualVariant(hostile, enemy) === 'unknown', 'Unidentified hostile exposed a class silhouette');
  hostile.identified = true;
  enemy.wave = 1;
  assert(shipVisualVariant(hostile, enemy) === 'kestrel', 'Wave-one hostile did not receive the Kestrel silhouette');
  enemy.wave = 2;
  assert(shipVisualVariant(hostile, enemy) === 'viper', 'Wave-two hostile did not receive the Viper silhouette');
  hostile.disposition = 'neutral';
  assert(shipVisualVariant(hostile, enemy) === 'viper', 'Surrendered hostile lost its identified ship profile');
  assert(shipVisualVariant(object({ disposition: 'friendly', identified: true, subtype: 'Civilian transport' }), enemy) === 'civilian', 'Friendly ship did not receive the civilian silhouette');
  console.log('Profile-driven directional silhouette smoke test passed.');
}

function runAuthoritativeDamageVisualTest() {
  const enemy = new BridgeGame(() => .5).safeSnapshot().enemy;
  enemy.alive = true;
  enemy.shields = 82;
  enemy.hull = 91;
  enemy.systems = { engines: 100, shields: 100, weapons: 100, sensors: 100, communications: 100 };
  enemy.repairDelays = { engines: null, shields: null, weapons: null, sensors: null, communications: null };
  let visual = enemyDamageVisualState(enemy);
  assert(visual.shieldState === 'strong' && visual.hullState === 'stable', 'Healthy hostile visual state was misclassified');

  enemy.shields = 22;
  enemy.hull = 58;
  visual = enemyDamageVisualState(enemy);
  assert(visual.shieldState === 'low' && visual.hullState === 'damaged', 'Damaged hostile visual state was misclassified');

  enemy.shields = 0;
  enemy.hull = 31;
  enemy.systems.engines = 0;
  enemy.systems.weapons = 0;
  enemy.repairDelays.engines = 38;
  enemy.repairDelays.weapons = 32;
  visual = enemyDamageVisualState(enemy);
  assert(visual.shieldState === 'down' && visual.hullState === 'critical', 'Critical hostile visual state was misclassified');
  assert(visual.offlineSystems.includes('engines') && visual.offlineSystems.includes('weapons'), 'Offline systems were not exposed to combat visuals');
  assert(visual.repairPendingSeconds === 32 && enemyVisualStatusLabel(enemy, visual) === 'REPAIR MOBILIZING 32s', 'Repair-mobilization feedback was not derived from the authoritative countdown');

  enemy.repairingSystem = 'weapons';
  enemy.repairDelays.weapons = 0;
  visual = enemyDamageVisualState(enemy);
  assert(enemyVisualStatusLabel(enemy, visual) === 'REPAIRING WEAPONS', 'Active hostile repair did not override the mobilization label');

  enemy.operationalState = 'surrendered';
  enemy.surrender.ceasefire = true;
  visual = enemyDamageVisualState(enemy);
  assert(visual.surrendered && enemyVisualStatusLabel(enemy, visual) === 'SURRENDERED', 'Surrender power-down visual was not authoritative');
  console.log('Shield, hull, subsystem, repair, and surrender visual-state smoke test passed.');
}

runProfileSilhouetteTest();
runAuthoritativeDamageVisualTest();
