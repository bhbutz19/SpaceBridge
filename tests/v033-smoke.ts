import { BridgeGame } from '../src/server/game.js';
import { ENEMY_AI_PROFILES } from '../src/server/config/enemyProfiles.js';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function prepareCombat() {
  const game = new BridgeGame(() => .31);
  game.claimRole('tactical', 'alpha33-tactical', 'Alpha 33 Observer');
  game.state.missionStatus = 'running';
  game.state.missionStage = 'combat';
  game.state.sensors.intelLevel = 2;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 0;
  enemy.heading = 0;
  enemy.speed = 0;
  enemy.maneuverState = 'approach';
  enemy.maneuverTimer = 0;
  enemy.ai.commitmentRemaining = 0;
  enemy.ai.decisionCooldown = 0;
  game.state.ship.x = 0;
  game.state.ship.y = 10;
  game.state.ship.heading = 180;
  game.state.ship.requestedHeading = 180;
  game.state.ship.speed = 0;
  game.state.ship.throttle = 0;
  return { game, enemy };
}

function runDistinctDoctrineProfileTest() {
  const kestrel = ENEMY_AI_PROFILES.kestrelSkirmisher;
  const viper = ENEMY_AI_PROFILES.viperHunter;
  assert(kestrel.doctrine === 'skirmisher' && viper.doctrine === 'hunter', 'Enemy waves do not have distinct combat doctrines');
  assert(kestrel.caution > viper.caution && kestrel.strafeBias > viper.strafeBias, 'Kestrel profile is not the more cautious flanking combatant');
  assert(viper.aggression > kestrel.aggression && viper.persistence > kestrel.persistence, 'Viper profile is not the more aggressive persistent combatant');
  assert(viper.hullFleeRatio < kestrel.hullFleeRatio, 'Hunter doctrine does not tolerate more hull risk than skirmisher doctrine');
  console.log('Distinct adaptive enemy doctrine profile smoke test passed.');
}

function runScienceGatedBehaviorIntelTest() {
  const { game } = prepareCombat();
  let snapshot = game.safeSnapshot();
  assert(snapshot.enemy.ai.profileName === null && snapshot.enemy.ai.intent === null && snapshot.enemy.ai.traits.length === 0, 'Behavior intelligence leaked before Science completed tactical analysis');
  game.state.sensors.systemsMapped = true;
  game.tick(.05);
  snapshot = game.safeSnapshot();
  assert(snapshot.enemy.ai.profileName === 'Cautious Flanking Skirmisher', 'Science link did not reveal the Kestrel behavior profile');
  assert(snapshot.enemy.ai.doctrine === 'skirmisher' && snapshot.enemy.ai.traits.includes('flanker'), 'Science link did not reveal doctrine traits');
  assert(snapshot.enemy.ai.intent === 'attackRun' && snapshot.enemy.ai.intentLabel === 'ATTACK RUN', `Science live-intent link did not expose the committed attack run (${snapshot.enemy.ai.intent})`);
  assert(snapshot.enemy.ai.reason?.toLowerCase().includes('firing') && snapshot.enemy.ai.confidence !== null, 'Science live-intent model did not expose its reason and confidence');
  console.log('Science-gated behavioral intelligence smoke test passed.');
}

function runCommittedUtilityDecisionTest() {
  const { game, enemy } = prepareCombat();
  game.state.sensors.systemsMapped = true;
  game.tick(.05);
  assert(enemy.maneuverState === 'attackRun', `Healthy aligned enemy did not choose an attack run (${enemy.maneuverState})`);
  const committedHeading = enemy.maneuverHeading;
  game.state.ship.x = 10;
  game.state.ship.y = 0;
  game.tick(.5);
  assert(enemy.maneuverState === 'attackRun', 'Adaptive AI discarded its attack commitment after the player crossed its bow');
  assert(Math.abs(((enemy.heading - committedHeading + 540) % 360) - 180) < 8, 'Committed attack run re-tracked the player instead of honoring its chosen vector');
  assert(Object.keys(enemy.ai.intentScores).length >= 8, 'Utility evaluator did not record its candidate intent scores');
  console.log('Utility scoring and maneuver commitment smoke test passed.');
}

function runDamageResponseTest() {
  const { game, enemy } = prepareCombat();
  game.state.sensors.systemsMapped = true;
  enemy.shields = 2;
  enemy.ai.lastShields = 2;
  enemy.ai.recentDamage = 0;
  game.tick(.05);
  assert(enemy.maneuverState === 'recharge', `Cautious Kestrel did not prioritize shield recovery below its doctrine threshold (${enemy.maneuverState})`);
  const shieldsBeforeRecovery = enemy.shields;
  game.tick(1);
  assert(enemy.shields > shieldsBeforeRecovery, 'Recharge intent did not accelerate shield recovery');

  enemy.hull = 5;
  enemy.ai.lastHull = 5;
  enemy.ai.commitmentRemaining = 0;
  enemy.ai.decisionCooldown = 0;
  game.tick(.05);
  assert(enemy.maneuverState === 'flee', `Critical-hull Kestrel did not break contact (${enemy.maneuverState})`);
  assert(enemy.ai.intentReason.includes('Hull survival threshold'), 'Flee intent did not retain its decision reason');
  console.log('Adaptive shield-recovery and survival-threshold smoke test passed.');
}

function runWaveSpecificProfileBindingTest() {
  const { game } = prepareCombat();
  (game as any).spawnWave(2);
  game.state.sensors.intelLevel = 2;
  game.state.sensors.systemsMapped = true;
  const enemy = (game as any).enemyActual;
  enemy.x = 0;
  enemy.y = 0;
  enemy.heading = 0;
  game.state.ship.x = 0;
  game.state.ship.y = 10;
  game.state.ship.heading = 180;
  game.tick(.05);
  const snapshot = game.safeSnapshot();
  assert(snapshot.enemy.ai.profileName === 'Persistent Assault Hunter' && snapshot.enemy.ai.doctrine === 'hunter', 'Wave two did not bind the Viper hunter profile');
  assert(snapshot.enemy.ai.traits.includes('rusher'), 'Viper hunter personality traits were not published');
  assert(enemy.maneuverState === 'attackRun', `Aligned Viper hunter did not seize its attack opportunity (${enemy.maneuverState})`);
  console.log('Wave-specific adaptive profile binding smoke test passed.');
}

runDistinctDoctrineProfileTest();
runScienceGatedBehaviorIntelTest();
runCommittedUtilityDecisionTest();
runDamageResponseTest();
runWaveSpecificProfileBindingTest();
