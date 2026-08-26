import type { GameSnapshot, HelmPositionalAdvantage, SpaceObjectState } from './protocol.js';

export type TacticalWeaponReadiness = {
  ready: boolean;
  status: string;
  blockers: string[];
};

export type TacticalAwareness = {
  selectedContact: SpaceObjectState | null;
  hostileSelected: boolean;
  range: number | null;
  bearing: number | null;
  relativeBearing: number | null;
  inTacticalScope: boolean;
  positionalAdvantage: HelmPositionalAdvantage;
  positionLabel: string;
  targetRelativePosition: number | null;
  insideHostileArc: boolean | null;
  hostileArcLabel: string;
  beam: TacticalWeaponReadiness;
  torpedo: TacticalWeaponReadiness;
};

const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const signedHeadingDelta = (target: number, current: number) => ((target - current + 540) % 360) - 180;
const withinArc = (heading: number, bearing: number, arcDegrees: number) => arcDegrees >= 359.9 || Math.abs(signedHeadingDelta(bearing, heading)) <= arcDegrees / 2;

function weaponReadiness(commonBlockers: string[], weaponBlockers: string[]): TacticalWeaponReadiness {
  const blockers = [...commonBlockers, ...weaponBlockers];
  return {
    ready: blockers.length === 0,
    status: blockers[0] ?? 'READY TO FIRE',
    blockers
  };
}

export function evaluateTacticalAwareness(snapshot: GameSnapshot): TacticalAwareness {
  const selectedContact = snapshot.spaceObjects.find((object) => object.id === snapshot.stationSelections.tacticalContactId) ?? null;
  const enemyContactSelected = selectedContact?.id === snapshot.enemy.id;
  const hostileSelected = selectedContact?.id === snapshot.enemy.id && selectedContact.disposition === 'hostile';
  const dx = selectedContact ? selectedContact.x - snapshot.ship.x : 0;
  const dy = selectedContact ? selectedContact.y - snapshot.ship.y : 0;
  const range = selectedContact ? Math.hypot(dx, dy) : null;
  const bearing = selectedContact ? normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI) : null;
  const relativeBearing = bearing === null ? null : signedHeadingDelta(bearing, snapshot.ship.heading);
  const inTacticalScope = range !== null && range <= snapshot.shipCapabilities.stationSensors.tacticalRange;

  let targetRelativePosition: number | null = null;
  let insideHostileArc: boolean | null = null;
  let positionalAdvantage: HelmPositionalAdvantage = 'unknown';
  let positionLabel = 'AWAITING SCIENCE GEOMETRY';
  let hostileArcLabel = 'HOSTILE ARC UNKNOWN';

  if (hostileSelected && snapshot.enemy.heading !== null && snapshot.enemy.beamRange !== null && snapshot.enemy.beamArcDegrees !== null) {
    const enemyToShipBearing = normalizeHeading(Math.atan2(snapshot.ship.x - snapshot.enemy.x, snapshot.ship.y - snapshot.enemy.y) * 180 / Math.PI);
    targetRelativePosition = signedHeadingDelta(enemyToShipBearing, snapshot.enemy.heading);
    insideHostileArc = range !== null && range <= snapshot.enemy.beamRange && withinArc(snapshot.enemy.heading, enemyToShipBearing, snapshot.enemy.beamArcDegrees);
    hostileArcLabel = insideHostileArc ? 'INSIDE HOSTILE FIRE ARC' : 'CLEAR OF HOSTILE FIRE ARC';

    if (insideHostileArc) {
      positionalAdvantage = 'danger';
      positionLabel = 'EXPOSED TO HOSTILE BOW';
    } else if (Math.abs(targetRelativePosition) >= 145) {
      positionalAdvantage = 'stern';
      positionLabel = 'STERN ADVANTAGE';
    } else if (Math.abs(targetRelativePosition) >= 65) {
      positionalAdvantage = 'flank';
      positionLabel = targetRelativePosition < 0 ? 'PORT FLANK' : 'STARBOARD FLANK';
    } else {
      positionalAdvantage = 'neutral';
      positionLabel = 'FORWARD QUADRANT';
    }
  }

  const commonBlockers: string[] = [];
  if (snapshot.missionStatus !== 'running') commonBlockers.push('MISSION NOT ACTIVE');
  if (snapshot.enemy.surrender.ceasefire) commonBlockers.push('SURRENDER CEASEFIRE ACTIVE');
  if (snapshot.diplomacy.weaponsHold && !snapshot.diplomacy.surpriseAttack && snapshot.missionStage !== 'combat' && snapshot.missionStage !== 'surrender') {
    commonBlockers.push(snapshot.diplomacy.phase === 'channel-open' ? 'DIPLOMATIC CHANNEL OPEN' : snapshot.diplomacy.phase === 'agreement' ? 'ACTIVE DIPLOMATIC AGREEMENT' : 'INITIAL HAIL REQUIRED');
  }
  if (!selectedContact) commonBlockers.push('SELECT A CONTACT');
  else if (enemyContactSelected && snapshot.sensors.intelLevel < 1) commonBlockers.push('SCIENCE IDENTIFICATION REQUIRED');
  else if (!hostileSelected) commonBlockers.push(selectedContact.disposition === 'friendly' ? 'FRIENDLY INTERLOCK' : 'NO HOSTILE FIRING SOLUTION');
  if (!snapshot.enemy.alive) commonBlockers.push('NO ACTIVE HOSTILE');
  if (snapshot.systems.weapons <= 0) commonBlockers.push('WEAPONS CONTROL OFFLINE');

  const beamBlockers: string[] = [];
  if (snapshot.ship.beamCharge < 25) beamBlockers.push('CAPACITOR BELOW 25%');
  if (hostileSelected && range !== null && range > snapshot.shipCapabilities.weapons.beamRange) beamBlockers.push('TARGET OUT OF BEAM RANGE');
  if (hostileSelected && bearing !== null && !withinArc(snapshot.ship.heading, bearing, snapshot.shipCapabilities.weapons.beamArcDegrees)) beamBlockers.push('TARGET OUTSIDE BEAM ARC');

  const torpedoBlockers: string[] = [];
  if (snapshot.ship.torpedoes <= 0) torpedoBlockers.push('TORPEDO MAGAZINE EMPTY');
  else if ((snapshot.ship.torpedoInventory[snapshot.tactical.selectedTorpedoType] ?? 0) <= 0) torpedoBlockers.push('SELECTED TORPEDO TYPE DEPLETED');
  if (!snapshot.ship.torpedoTubes.some((tube) => tube.reloadRemaining <= 0)) torpedoBlockers.push('ALL TORPEDO TUBES RELOADING');
  if (hostileSelected && range !== null && range > snapshot.shipCapabilities.weapons.torpedoRange) torpedoBlockers.push('TARGET OUT OF TORPEDO RANGE');
  if (hostileSelected && bearing !== null && !withinArc(snapshot.ship.heading, bearing, snapshot.shipCapabilities.weapons.torpedoArcDegrees)) torpedoBlockers.push('TARGET OUTSIDE LAUNCH ARC');

  return {
    selectedContact,
    hostileSelected,
    range,
    bearing,
    relativeBearing,
    inTacticalScope,
    positionalAdvantage,
    positionLabel,
    targetRelativePosition,
    insideHostileArc,
    hostileArcLabel,
    beam: weaponReadiness(commonBlockers, beamBlockers),
    torpedo: weaponReadiness(commonBlockers, torpedoBlockers)
  };
}
