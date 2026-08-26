import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { ClientCommand, CrewOrder, EngineeringPuzzleState, GameSnapshot, HelmManeuver, OperationalRole, SpaceObjectState, SystemName, TacticalTarget, ViewscreenMode } from '../../shared/protocol';
import { enemyIntentLabel } from '../../shared/enemyAi';
import { evaluateTacticalAwareness } from '../../shared/tacticalAwareness';
import { enemyDamageVisualState, enemyVisualStatusLabel, shipVisualVariant, type EnemyDamageVisualState, type ShipVisualVariant } from '../../shared/shipVisuals';
import { captainPortraitForTransmission } from '../../shared/viewscreenPresentation';
import meridianCaptainPortrait from '../assets/portraits/meridian-captain.webp';
import kestrelCommanderPortrait from '../assets/portraits/kestrel-commander.webp';
import viperCommanderPortrait from '../assets/portraits/viper-commander.webp';

type Props = { snapshot: GameSnapshot; send: (command: ClientCommand) => void };
const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const range = (s: GameSnapshot) => Math.hypot(s.ship.x - s.enemy.x, s.ship.y - s.enemy.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const objectRange = (snapshot: GameSnapshot, object: SpaceObjectState) => Math.hypot(object.x - snapshot.ship.x, object.y - snapshot.ship.y);
const objectBearing = (snapshot: GameSnapshot, object: SpaceObjectState) => normalizeHeading(Math.atan2(object.x - snapshot.ship.x, object.y - snapshot.ship.y) * 180 / Math.PI);

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><div className="meter-label"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track"><div className="meter-fill" style={{ width: pct(value) }} /></div></div>;
}

function UnknownMeter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <div className="unknown-readout"><span>{label}</span><strong>UNKNOWN</strong></div>;
  return <Meter label={label} value={value} />;
}

function EnemyBehaviorIntel({ snapshot }: { snapshot: GameSnapshot }) {
  const ai = snapshot.enemy.ai;
  if (!snapshot.sensors.systemsMapped || !ai.profileName || !ai.doctrine) return null;
  return <div className="enemy-behavior-intel">
    <div className="enemy-behavior-heading"><div><span>BEHAVIORAL PROFILE</span><strong>{ai.profileName}</strong></div><em>{ai.doctrine.toUpperCase()}</em></div>
    <div className="enemy-behavior-traits">{ai.traits.map((trait) => <span key={trait}>{trait.toUpperCase()}</span>)}</div>
    <div className="enemy-behavior-intent"><span>LIVE INTENT</span><strong>{ai.intentLabel ?? enemyIntentLabel(ai.intent)}</strong><small>{ai.reason ?? 'Intent model updating.'}</small></div>
    <div className="enemy-behavior-metrics">
      <div><span>THREAT</span><strong>{ai.threatLevel ?? 0}%</strong><i><b style={{width:pct(ai.threatLevel ?? 0)}}/></i></div>
      <div><span>OPPORTUNITY</span><strong>{ai.opportunityLevel ?? 0}%</strong><i><b style={{width:pct(ai.opportunityLevel ?? 0)}}/></i></div>
      <div><span>CONFIDENCE</span><strong>{ai.confidence ?? 0}%</strong><i><b style={{width:pct(ai.confidence ?? 0)}}/></i></div>
    </div>
    <small className="enemy-behavior-range">PREFERRED RANGE • {ai.preferredRange?.toFixed(1) ?? '---'} km</small>
  </div>;
}

const enemySystemCondition = (health: number) => health <= 0 ? 'OFFLINE' : health <= 25 ? 'FAILING' : health <= 50 ? 'CRITICAL' : health <= 75 ? 'DEGRADED' : 'NOMINAL';

const enemySystemEffect = (system: SystemName, health: number) => {
  if (health <= 0) {
    const offlineEffects: Record<SystemName, string> = {
      engines: 'NO MANEUVER • DRIFTING',
      shields: 'ENVELOPE COLLAPSING',
      weapons: 'HOSTILE FIRE DISABLED',
      sensors: 'TARGETING BLIND',
      communications: 'EMERGENCY BEACON ONLY'
    };
    return offlineEffects[system];
  }
  if (health <= 25) return system === 'engines' ? 'MINIMAL THRUST' : system === 'weapons' ? 'SEVERE OUTPUT / CYCLE LOSS' : system === 'shields' ? 'LOW CAPACITY / REGEN' : system === 'sensors' ? 'SEVERE ACCURACY LOSS' : 'UNSTABLE TRAFFIC';
  if (health <= 50) return 'MAJOR PERFORMANCE LOSS';
  if (health <= 75) return 'REDUCED PERFORMANCE';
  return 'FULL CAPABILITY';
};

function EnemySystemMap({ snapshot }: { snapshot: GameSnapshot }) {
  return <div className="enemy-system-map"><h4>ENEMY SYSTEM MAP</h4>{(Object.entries(snapshot.enemy.systems) as Array<[SystemName, number | null]>).map(([system, health]) => {
    const value = health ?? 0;
    const condition = health === null ? 'UNKNOWN' : enemySystemCondition(value);
    const repairDelay = snapshot.enemy.repairDelays[system];
    const repairState = health !== null && value <= 0 && repairDelay !== null && repairDelay > 0
      ? ` • REPAIR MOBILIZATION ${Math.ceil(repairDelay)}s`
      : snapshot.enemy.repairingSystem === system
        ? ' • REPAIR ACTIVITY DETECTED'
        : '';
    return <div key={system} className={`enemy-system-row condition-${condition.toLowerCase()} ${snapshot.enemy.repairingSystem === system ? 'repair-active' : ''}`}><span>{system.toUpperCase()}</span><strong>{health === null ? 'UNKNOWN' : `${Math.round(value)}% • ${condition}`}</strong><small>{health === null ? 'AWAITING SCIENCE DATA' : `${enemySystemEffect(system, value)}${repairState}`}</small><div className="mini-health-track"><div style={{width:pct(value)}}/></div></div>;
  })}</div>;
}

function SurrenderVerificationPanel({ snapshot, send }: Props) {
  const surrender = snapshot.enemy.surrender;
  if (surrender.status === 'unavailable') return null;
  const selected = snapshot.stationSelections.scienceContactId === snapshot.enemy.id;
  return <div className={`surrender-verification status-${surrender.status}`}>
    <div><span>SURRENDER ANALYSIS</span><strong>{surrender.status.toUpperCase()}</strong><em>{surrender.pressure === null ? 'PRESSURE UNKNOWN' : `PRESSURE ${surrender.pressure}%`}</em></div>
    <p>{surrender.eligibilityReason ?? 'Monitoring hostile combat capability and power signatures.'}</p>
    {surrender.status === 'accepted' && <button className="primary full" disabled={!selected || snapshot.systems.sensors <= 0} onClick={() => send({type:'beginSurrenderVerification'})}>{selected ? 'VERIFY WEAPONS + PROPULSION POWER-DOWN' : 'SELECT HOSTILE CONTACT TO VERIFY'}</button>}
    {surrender.status === 'verifying' && <><div className="mini-health-track"><div style={{width:pct(surrender.verificationProgress)}}/></div><small>POWER-DOWN VERIFICATION {Math.round(surrender.verificationProgress)}%</small></>}
    {surrender.status === 'verified' && <div className="surrender-verified"><strong>VESSEL SECURED</strong><span>No active propulsion, targeting, or weapon emissions.</span></div>}
  </div>;
}

export function StationFocusOverlay({ title, status, accent = 'blue', onClose, children }: { title: string; status?: string; accent?: 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'teal'; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className={`station-focus-overlay accent-${accent}`} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="station-focus-modal">
      <header className="station-focus-modal-bar"><div><span>FOCUSED CONSOLE</span><strong>{title}</strong>{status && <em>{status}</em>}</div><button className="secondary station-focus-close" onClick={onClose}>CLOSE</button></header>
      <div className="station-focus-content">{children}</div>
    </section>
  </div>;
}

function spaceObjectGlyph(object: SpaceObjectState) {
  if (object.disposition === 'player') return '▲';
  if (object.objectType === 'station') return '▣';
  if (object.objectType === 'planet') return '●';
  if (object.objectType === 'moon') return '○';
  if (object.objectType === 'asteroid') return '⬟';
  if (object.objectType === 'anomaly') return '✦';
  if (object.objectType === 'debris') return '✣';
  if (object.objectType === 'beacon') return '⌁';
  if (object.disposition === 'hostile') return '◆';
  if (object.disposition === 'friendly') return '◇';
  return '◈';
}

const mapShipPaths: Record<ShipVisualVariant, { hull: string; detail: string }> = {
  prototype: { hull: 'M16 2 21 10 29 22 21 20 18 30 16 26 14 30 11 20 3 22 11 10Z', detail: 'M16 6V25M10 20H22' },
  kestrel: { hull: 'M16 2 27 23 21 20 19 29 16 25 13 29 11 20 5 23Z', detail: 'M16 6V24M11 19 16 14 21 19' },
  viper: { hull: 'M16 2 23 10 31 20 23 19 27 27 18 23 16 30 14 23 5 27 9 19 1 20 9 10Z', detail: 'M16 6V25M8 19H24' },
  civilian: { hull: 'M16 2 21 9 21 16 27 20 22 23 19 21 19 29 13 29 13 21 10 23 5 20 11 16 11 9Z', detail: 'M16 6V26M11 14H21' },
  unknown: { hull: 'M16 3 24 15 21 26 16 22 11 26 8 15Z', detail: 'M16 7V22' }
};

function MapShipSilhouette({ object, heading, snapshot }: { object: SpaceObjectState; heading: number | null; snapshot: GameSnapshot }) {
  const variant = shipVisualVariant(object, snapshot.enemy);
  const paths = mapShipPaths[variant];
  const visual = object.id === snapshot.enemy.id ? enemyDamageVisualState(snapshot.enemy) : null;
  const enginesOffline = visual?.offlineSystems.includes('engines') ?? false;
  const weaponsOffline = visual?.offlineSystems.includes('weapons') ?? false;
  const visualClasses = visual ? `shield-${visual.shieldState} hull-${visual.hullState} ${visual.surrendered ? 'is-surrendered' : ''} ${visual.repairingSystem ? 'is-repairing' : ''}` : '';
  return <span className={`map-ship-visual variant-${variant} ${visualClasses}`} data-asset-slot={`map-ship-${variant}`}>
    <svg className={`map-ship-silhouette disposition-${object.disposition}`} viewBox="0 0 32 32" aria-hidden="true" style={heading === null ? undefined : { transform: `rotate(${heading}deg)` }}>
      {visual?.shieldState !== 'down' && visual?.shieldState !== 'unknown' && <ellipse className="map-ship-shield" cx="16" cy="16" rx="14" ry="15"/>}
      {!enginesOffline && <path className="map-engine-trail" d="M13 27v4M19 27v4"/>}
      <path className="map-ship-hull" d={paths.hull}/><path className="ship-centerline" d={paths.detail}/>
      {weaponsOffline && <path className="map-system-offline-mark" d="M6 8 26 24M26 8 6 24"/>}
    </svg>
    {visual?.repairingSystem && <i className="map-repair-pulse"/>}
  </span>;
}

function TacticalPlot({ snapshot, large = false, send, selectionMode, mapMode, zoom = 1, mapCenter, onMapCenterChange, attentionIds = [], onSelection }: { snapshot: GameSnapshot; large?: boolean; send?: Props['send']; selectionMode?: 'tactical' | 'science' | 'helm'; mapMode?: 'tactical' | 'helm' | 'science' | 'overview'; zoom?: number; mapCenter?: { x: number; y: number } | null; onMapCenterChange?: (center: { x: number; y: number }) => void; attentionIds?: string[]; onSelection?: (object: SpaceObjectState) => void }) {
  const mode = mapMode ?? selectionMode ?? 'overview';
  const selectedId = selectionMode === 'science'
    ? snapshot.stationSelections.scienceContactId
    : selectionMode === 'tactical'
      ? snapshot.stationSelections.tacticalContactId
      : selectionMode === 'helm'
        ? snapshot.stationSelections.helmContactId
        : (mode === 'helm' || mode === 'overview')
          ? snapshot.captainNavigationTargetId
          : null;
  const effectiveCenter = mode === 'science' && mapCenter ? mapCenter : { x: snapshot.ship.x, y: snapshot.ship.y };
  const distanceFromCenter = (object: SpaceObjectState) => Math.hypot(object.x - effectiveCenter.x, object.y - effectiveCenter.y);
  const maxKnownRange = Math.max(1, ...snapshot.spaceObjects.map((object) => Math.hypot(object.x - snapshot.ship.x, object.y - snapshot.ship.y)));
  const baseScopeRange = mode === 'tactical'
    ? snapshot.shipCapabilities.stationSensors.tacticalRange
    : mode === 'helm'
      ? snapshot.shipCapabilities.stationSensors.helmRange
      : mode === 'science'
        ? snapshot.shipCapabilities.stationSensors.scienceRange ?? maxKnownRange * 1.08
        : maxKnownRange * 1.08;
  const scopeRange = mode === 'science'
    ? Math.max(4, baseScopeRange / Math.max(1, zoom))
    : baseScopeRange;
  const plotRadius = 44;
  const visibleObjects = snapshot.spaceObjects.filter((object) => distanceFromCenter(object) <= scopeRange);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const canPan = mode === 'science' && Boolean(onMapCenterChange);
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPan || (event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const bounds = plotRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !bounds || !onMapCenterChange) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
    const worldPerPixelX = scopeRange / Math.max(1, bounds.width * (plotRadius / 100));
    const worldPerPixelY = scopeRange / Math.max(1, bounds.height * (plotRadius / 100));
    onMapCenterChange({ x: effectiveCenter.x - dx * worldPerPixelX, y: effectiveCenter.y + dy * worldPerPixelY });
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const offScopeHostiles = mode === 'tactical'
    ? snapshot.spaceObjects.filter((object) => object.disposition === 'hostile' && object.alive && objectRange(snapshot, object) > scopeRange)
    : [];
  const beamRadius = Math.min(plotRadius, plotRadius * snapshot.shipCapabilities.weapons.beamRange / scopeRange);
  const torpedoRadius = Math.min(plotRadius, plotRadius * snapshot.shipCapabilities.weapons.torpedoRange / scopeRange);
  const captainHeading = snapshot.captainHeadingOrder;
  const helmPath = mode === 'helm' ? (() => {
    const flight = snapshot.shipCapabilities.flight;
    const health = snapshot.systems.engines <= 0 ? 0 : clamp(snapshot.systems.engines / 100, .2, 1);
    const power = clamp(snapshot.ship.enginePower / 100, 0, 1);
    const powerFactor = .45 + .55 * power;
    const effectiveForward = Math.max(.1, flight.maxForwardSpeed * powerFactor * health);
    const throttleRatio = clamp(snapshot.ship.throttle / 100, -1, 1);
    const targetSpeed = throttleRatio >= 0
      ? throttleRatio * effectiveForward
      : throttleRatio * flight.maxReverseSpeed * powerFactor * health;
    const targetLateralSpeed = clamp(snapshot.ship.lateralThrust / 100, -1, 1) * effectiveForward * flight.lateralThrustFraction;
    let heading = snapshot.ship.heading;
    let speed = snapshot.ship.speed;
    let lateralSpeed = snapshot.ship.lateralSpeed;
    let x = 0;
    let y = 0;
    const points: Array<{ x: number; y: number; t: number }> = [];
    const step = .5;
    for (let t = step; t <= 8; t += step) {
      const speedFraction = clamp(Math.abs(speed) / effectiveForward, 0, 1);
      const turnAuthority = speedFraction < flight.maneuverOptimalMinFraction
        ? flight.lowSpeedTurnFactor + (1 - flight.lowSpeedTurnFactor) * (speedFraction / Math.max(.01, flight.maneuverOptimalMinFraction))
        : speedFraction <= flight.maneuverOptimalMaxFraction
          ? 1
          : 1 - (1 - flight.highSpeedTurnFactor) * clamp((speedFraction - flight.maneuverOptimalMaxFraction) / Math.max(.01, 1 - flight.maneuverOptimalMaxFraction), 0, 1);
      const turnRate = (flight.baseTurnRateDegreesPerSecond + flight.enginePowerTurnBonusDegreesPerSecond * power) * health * turnAuthority;
      let delta = ((snapshot.ship.requestedHeading - heading + 540) % 360) - 180;
      delta = clamp(delta, -turnRate * step, turnRate * step);
      heading = normalizeHeading(heading + delta);
      speed += (targetSpeed - speed) * Math.min(1, step * flight.accelerationResponse);
      lateralSpeed += (targetLateralSpeed - lateralSpeed) * Math.min(1, step * flight.lateralAccelerationResponse);
      const radians = heading * Math.PI / 180;
      const starboard = (heading + 90) * Math.PI / 180;
      x += (Math.sin(radians) * speed + Math.sin(starboard) * lateralSpeed) * step;
      y += (Math.cos(radians) * speed + Math.cos(starboard) * lateralSpeed) * step;
      points.push({ x: 50 + x / scopeRange * plotRadius, y: 50 - y / scopeRange * plotRadius, t });
    }
    return points.filter((point) => point.x >= 3 && point.x <= 97 && point.y >= 3 && point.y <= 97);
  })() : [];
  const helmEnemyEnvelope = mode === 'helm' && snapshot.enemy.alive && snapshot.enemy.heading !== null && snapshot.enemy.beamRange !== null && snapshot.enemy.beamArcDegrees !== null
    ? (() => {
      const dx = snapshot.enemy.x - effectiveCenter.x;
      const dy = snapshot.enemy.y - effectiveCenter.y;
      const distance = Math.hypot(dx, dy);
      if (distance > scopeRange + snapshot.enemy.beamRange!) return null;
      return {
        left: 50 + dx / scopeRange * plotRadius,
        top: 50 - dy / scopeRange * plotRadius,
        radius: plotRadius * snapshot.enemy.beamRange! / scopeRange,
        heading: snapshot.enemy.heading!,
        arc: snapshot.enemy.beamArcDegrees!
      };
    })()
    : null;
  const helmRelativeWaypoint = mode === 'helm' && snapshot.helm.desiredRelativePosition !== null && snapshot.stationSelections.helmContactId
    ? (() => {
      const object = snapshot.spaceObjects.find((entry) => entry.id === snapshot.stationSelections.helmContactId);
      if (!object) return null;
      const targetHeading = object.id === snapshot.enemy.id ? snapshot.enemy.heading : 0;
      if (targetHeading === null) return null;
      const worldBearing = normalizeHeading(targetHeading + snapshot.helm.desiredRelativePosition!);
      const waypointX = object.x + Math.sin(worldBearing * Math.PI / 180) * snapshot.helm.orbitRange;
      const waypointY = object.y + Math.cos(worldBearing * Math.PI / 180) * snapshot.helm.orbitRange;
      if (Math.hypot(waypointX - effectiveCenter.x, waypointY - effectiveCenter.y) > scopeRange) return null;
      return { left: 50 + (waypointX - effectiveCenter.x) / scopeRange * plotRadius, top: 50 - (waypointY - effectiveCenter.y) / scopeRange * plotRadius };
    })()
    : null;
  const visibleCombatEffects = snapshot.combatEffects.map((effect) => {
    const sourceLeft = 50 + (effect.sourceX - effectiveCenter.x) / scopeRange * plotRadius;
    const sourceTop = 50 - (effect.sourceY - effectiveCenter.y) / scopeRange * plotRadius;
    const trackedTarget = effect.trackedTarget === 'player'
      ? snapshot.ship
      : effect.trackedTarget === 'enemy'
        ? snapshot.enemy
        : null;
    const targetWorldX = (trackedTarget?.x ?? effect.targetX) + effect.impactOffsetX;
    const targetWorldY = (trackedTarget?.y ?? effect.targetY) + effect.impactOffsetY;
    const targetLeft = 50 + (targetWorldX - effectiveCenter.x) / scopeRange * plotRadius;
    const targetTop = 50 - (targetWorldY - effectiveCenter.y) / scopeRange * plotRadius;
    const dx = targetLeft - sourceLeft;
    const dy = targetTop - sourceTop;
    const length = Math.hypot(dx, dy);
    if (length < .2 || [sourceLeft, sourceTop, targetLeft, targetTop].every((value) => value < -8 || value > 108)) return null;
    const torpedoColor = effect.torpedoType
      ? snapshot.shipCapabilities.weapons.torpedoTypes.find((type) => type.id === effect.torpedoType)?.color ?? '#ffb45f'
      : effect.kind === 'hostileBeam' ? '#ff4f5d' : '#71d9ff';
    const age = Math.max(0, snapshot.serverTime - effect.startedAt);
    const lineStyle = {
      left: `${sourceLeft}%`,
      top: `${sourceTop}%`,
      width: `${length}%`,
      transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`,
      '--effect-duration': `${effect.durationMs}ms`,
      '--effect-delay': `${-Math.min(age, effect.durationMs)}ms`,
      '--effect-color': torpedoColor
    } as CSSProperties;
    const impactStyle = {
      left: `${targetLeft}%`,
      top: `${targetTop}%`,
      '--effect-duration': `${effect.durationMs}ms`,
      '--effect-delay': `${-Math.min(age, effect.durationMs)}ms`,
      '--effect-color': torpedoColor
    } as CSSProperties;
    const resultLabel = effect.result === 'hit' ? 'HIT' : effect.result === 'miss' ? 'MISS' : 'DISSIPATED';
    return <span key={effect.id} className="combat-effect-group" aria-hidden="true">
      <i className={`combat-effect effect-${effect.kind} result-${effect.result}`} style={lineStyle}><b/></i>
      <i className={`combat-impact effect-${effect.kind} result-${effect.result}`} style={impactStyle}><em/><strong>{resultLabel}</strong></i>
    </span>;
  });
  const handleHelmClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== 'helm' || !send || (event.target as HTMLElement).closest('button')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = (bounds.top + bounds.height / 2) - event.clientY;
    if (Math.hypot(dx, dy) < 12) return;
    const heading = normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
    send({ type: 'setHeading', heading });
  };
  return <div ref={plotRef} className={`tactical-plot map-mode-${mode} ${large ? 'viewscreen-plot' : ''} ${selectionMode ? 'interactive-map' : ''} ${canPan ? 'pannable-map' : ''} ${mode === 'helm' && send ? 'helm-steer-map' : ''}`} onClick={handleHelmClick} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
    <div className="grid-ring ring-one"/><div className="grid-ring ring-two"/><div className="crosshair x"/><div className="crosshair y"/>
    {mode === 'tactical' && <>
      <div className="weapon-envelope torpedo-envelope" style={{ width: `${torpedoRadius * 2}%` }}/>
      <div className="weapon-envelope beam-envelope" style={{ width: `${beamRadius * 2}%`, background: `conic-gradient(from ${snapshot.ship.heading - snapshot.shipCapabilities.weapons.beamArcDegrees / 2}deg, rgba(255,105,116,.13) 0deg ${snapshot.shipCapabilities.weapons.beamArcDegrees}deg, transparent ${snapshot.shipCapabilities.weapons.beamArcDegrees}deg 360deg)` }}/>
      <div className="weapon-envelope-label torpedo-label">TORP {snapshot.shipCapabilities.weapons.torpedoRange} km</div>
      <div className="weapon-envelope-label beam-label">BEAM {snapshot.shipCapabilities.weapons.beamRange} km • {snapshot.shipCapabilities.weapons.beamArcDegrees}°</div>
    </>}
    {mode === 'helm' && <>
      <div className="weapon-envelope helm-own-torpedo-envelope" style={{ width: `${torpedoRadius * 2}%` }}/>
      <div className="weapon-envelope helm-own-beam-envelope" style={{ width: `${beamRadius * 2}%`, background: `conic-gradient(from ${snapshot.ship.heading - snapshot.shipCapabilities.weapons.beamArcDegrees / 2}deg, rgba(79,196,239,.18) 0deg ${snapshot.shipCapabilities.weapons.beamArcDegrees}deg, transparent ${snapshot.shipCapabilities.weapons.beamArcDegrees}deg 360deg)` }}/>
      <div className="helm-own-weapon-label helm-own-beam-label">OUR BEAM • {snapshot.shipCapabilities.weapons.beamRange} km • {snapshot.shipCapabilities.weapons.beamArcDegrees}°</div>
      <div className="helm-own-weapon-label helm-own-torpedo-label">OUR TORP • {snapshot.shipCapabilities.weapons.torpedoRange} km</div>
      {helmEnemyEnvelope && <div className="enemy-weapon-envelope" style={{ left:`${helmEnemyEnvelope.left}%`, top:`${helmEnemyEnvelope.top}%`, width:`${helmEnemyEnvelope.radius * 2}%`, background:`conic-gradient(from ${helmEnemyEnvelope.heading - helmEnemyEnvelope.arc / 2}deg, rgba(255,75,88,.22) 0deg ${helmEnemyEnvelope.arc}deg, transparent ${helmEnemyEnvelope.arc}deg 360deg)` }}><span>HOSTILE FIRE ARC</span></div>}
      {helmPath.map((point, index) => <i key={`path-${index}`} className={`helm-flight-path-dot ${index % 4 === 3 ? 'major' : ''}`} style={{left:`${point.x}%`,top:`${point.y}%`}}/>)}
      {helmRelativeWaypoint && <div className="helm-relative-waypoint" style={{left:`${helmRelativeWaypoint.left}%`,top:`${helmRelativeWaypoint.top}%`}}><span>◎</span><small>DESIRED POSITION</small></div>}
      <div className="heading-vector current" style={{ transform: `translate(-50%,-100%) rotate(${snapshot.ship.heading}deg)` }}/>
      <div className="heading-vector requested" style={{ transform: `translate(-50%,-100%) rotate(${snapshot.ship.requestedHeading}deg)` }}/>
      {captainHeading !== null && <div className="heading-vector captain" style={{ transform: `translate(-50%,-100%) rotate(${captainHeading}deg)` }}/>} 
    </>}
    {visibleCombatEffects}
    {visibleObjects.map((object) => {
      const dx = object.x - effectiveCenter.x;
      const dy = object.y - effectiveCenter.y;
      const x = 50 + dx / scopeRange * plotRadius;
      const y = 50 - dy / scopeRange * plotRadius;
      const selected = selectedId === object.id;
      const canSelect = Boolean(selectionMode && send && object.selectable);
      const label = object.disposition === 'unknown' ? 'UNKNOWN' : object.name.toUpperCase();
      const enemyVisual = object.id === snapshot.enemy.id ? enemyDamageVisualState(snapshot.enemy) : null;
      const className = `contact object-${object.objectType} ${object.disposition} ${selected ? 'selected-contact' : ''} ${canSelect ? 'selectable-contact' : ''} ${attentionIds.includes(object.id) ? 'attention-contact' : ''} ${enemyVisual ? `shield-${enemyVisual.shieldState} hull-${enemyVisual.hullState} state-${snapshot.enemy.operationalState}` : ''}`;
      const glyphStyle = object.disposition === 'player' ? { transform: `rotate(${snapshot.ship.heading}deg)` } : undefined;
      const shipHeading = object.disposition === 'player' ? snapshot.ship.heading : object.id === snapshot.enemy.id ? snapshot.enemy.heading : null;
      const content = <>{object.objectType === 'ship' ? <MapShipSilhouette object={object} heading={shipHeading} snapshot={snapshot}/> : <span className={object.disposition === 'player' ? 'player-map-glyph' : ''} style={glyphStyle}>{spaceObjectGlyph(object)}</span>}<small>{label}</small>{selected && enemyVisual && snapshot.sensors.intelLevel >= 1 && <em className="map-contact-state">{enemyVisualStatusLabel(snapshot.enemy, enemyVisual)}</em>}</>;
      if (canSelect) {
        const commandType = selectionMode === 'science' ? 'selectScienceContact' : selectionMode === 'helm' ? 'selectHelmContact' : 'selectTacticalContact';
        return <button key={object.id} type="button" className={className} style={{ left: `${x}%`, top: `${y}%` }} onClick={(event) => { event.stopPropagation(); onSelection?.(object); send?.({ type: commandType, contactId: object.id } as ClientCommand); }}>{content}</button>;
      }
      return <div key={object.id} className={className} style={{ left: `${x}%`, top: `${y}%` }}>{content}</div>;
    })}
    {offScopeHostiles.map((object) => {
      const dx = object.x - snapshot.ship.x;
      const dy = object.y - snapshot.ship.y;
      const distance = Math.max(.001, Math.hypot(dx, dy));
      const x = 50 + dx / distance * 47;
      const y = 50 - dy / distance * 47;
      const selected = selectedId === object.id;
      const canSelect = Boolean(selectionMode === 'tactical' && send && object.selectable);
      const className = `edge-hostile-beacon ${selected ? 'selected-contact' : ''} ${canSelect ? 'selectable-contact' : ''}`;
      const content = <><strong>◆</strong><span>HOSTILE</span><small>{Math.round(objectBearing(snapshot, object)).toString().padStart(3,'0')}°</small></>;
      if (canSelect) return <button key={`edge-${object.id}`} className={className} style={{left:`${x}%`,top:`${y}%`}} onClick={() => { onSelection?.(object); send?.({type:'selectTacticalContact',contactId:object.id}); }}>{content}</button>;
      return <div key={`edge-${object.id}`} className={className} style={{left:`${x}%`,top:`${y}%`}}>{content}</div>;
    })}
    <div className="map-scope-label">{mode === 'science' && snapshot.shipCapabilities.stationSensors.scienceRange === null && zoom <= 1 ? 'FULL SENSOR MAP' : `${mode.toUpperCase()} SCOPE • ${scopeRange.toFixed(0)} km${mode === 'science' && zoom > 1 ? ` • ${zoom.toFixed(1).replace('.0','')}× ZOOM` : ''}`}{mode === 'science' && mapCenter ? ' • FREE PAN' : ''}{mode === 'helm' && send ? ' • CLICK MAP TO STEER' : ''}</div>
  </div>;
}

export function MissionLog({ snapshot }: { snapshot: GameSnapshot }) {
  return <section className="panel log-panel"><h3>Bridge Log</h3><div className="log-list">{snapshot.eventLog.map((event, i) => <div key={`${event}-${i}`} className="log-entry"><span>{i === 0 ? '●' : '·'}</span>{event}</div>)}</div></section>;
}

const orderOptions: Record<OperationalRole, Array<{ order: CrewOrder; label: string }>> = {
  helm: [
    { order: 'auto', label: 'AUTO' },
    { order: 'intercept', label: 'INTERCEPT' },
    { order: 'hold', label: 'HOLD' },
    { order: 'evade', label: 'EVADE' }
  ],
  tactical: [
    { order: 'auto', label: 'AUTO' },
    { order: 'weaponsFree', label: 'WEAPONS FREE' },
    { order: 'holdFire', label: 'HOLD FIRE' }
  ],
  engineering: [
    { order: 'auto', label: 'AUTO' },
    { order: 'balanced', label: 'BALANCED' },
    { order: 'shields', label: 'SHIELDS' },
    { order: 'weapons', label: 'WEAPONS' },
    { order: 'engines', label: 'ENGINES' }
  ],
  science: [
    { order: 'auto', label: 'AUTO' },
    { order: 'scan', label: 'SCAN' },
    { order: 'passive', label: 'PASSIVE' }
  ],
  communications: [
    { order: 'auto', label: 'AUTO' },
    { order: 'monitor', label: 'MONITOR' },
    { order: 'hail', label: 'HAIL' },
    { order: 'silent', label: 'SILENT' }
  ]
};

function CaptainOrders({ snapshot, send }: Props) {
  return <section className="panel captain-orders"><h3>Captain Orders</h3><p className="muted compact-copy">Orders directly steer AI behavior. If a human occupies the station, the order remains visible for them to follow.</p>
    <div className="order-stack">
      {(Object.keys(orderOptions) as OperationalRole[]).map((role) => {
        const slot = snapshot.roles.find((r) => r.role === role);
        return <div className="order-row" key={role}>
          <div className="order-role"><strong>{role.toUpperCase()}</strong><small>{slot?.controller === 'human' ? `HUMAN • ${slot.playerName}` : `AI • ${slot?.aiOfficerName}`}</small></div>
          <div className="order-buttons">{orderOptions[role].map(({ order, label }) => <button key={order} className={slot?.captainOrder === order ? 'active' : ''} onClick={() => send({ type: 'issueOrder', role, order })}>{label}</button>)}</div>
        </div>;
      })}
    </div>
  </section>;
}

function BridgeCommsPanel({ snapshot, compact = false }: { snapshot: GameSnapshot; compact?: boolean }) {
  const entries = snapshot.commsLog.slice(0, compact ? 5 : 12);
  return <section className={`panel bridge-comms-panel ${compact ? 'compact' : ''}`}>
    <div className="panel-title"><span>BRIDGE COMMUNICATIONS</span><strong>{entries.length ? 'LIVE' : 'STANDBY'}</strong></div>
    <div className="bridge-comms-list">
      {entries.map((entry) => <div key={entry.id} className={`bridge-comms-entry tone-${entry.tone}`}>
        <div className="bridge-comms-speaker"><strong>{entry.speaker}</strong><span>{entry.role === 'computer' ? 'SYSTEM' : entry.role.toUpperCase()}</span></div>
        <p>{entry.message}</p>
      </div>)}
    </div>
  </section>;
}

function CaptainCommandConsole({ send }: { send: (command: ClientCommand) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const clean = text.trim();
    if (!clean) return;
    send({ type: 'captainTextOrder', text: clean });
    setText('');
  };
  const quick = (value: string) => send({ type: 'captainTextOrder', text: value });

  return <section className="panel captain-command-console">
    <div className="panel-title"><span>CAPTAIN VOICE / TEXT ORDERS</span><strong>DETERMINISTIC INTERPRETER</strong></div>
    <p className="muted compact-copy">Give the crew natural-language orders. The interpreter converts them into the same validated standing orders used by the buttons above.</p>
    <div className="captain-command-row">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        maxLength={220}
        placeholder="Try: Helm, intercept. Tactical, weapons free. Engineering, shields."
      />
      <button className="primary" onClick={submit} disabled={!text.trim()}>SEND ORDER</button>
    </div>
    <div className="captain-command-examples">
      <button onClick={() => quick('Status report, all stations.')}>STATUS REPORT</button>
      <button onClick={() => quick('Helm, intercept the contact.')}>HELM: INTERCEPT</button>
      <button onClick={() => quick('Tactical, hold fire.')}>TACTICAL: HOLD FIRE</button>
      <button onClick={() => quick('Engineering, prioritize shields.')}>ENGINEERING: SHIELDS</button>
      <button onClick={() => quick('Science, scan the target.')}>SCIENCE: SCAN</button>
      <button onClick={() => quick('Communications, hail the contact.')}>COMMS: HAIL</button>
    </div>
  </section>;
}

function CaptainHeadingOrderPanel({ snapshot, send }: Props) {
  const activeTarget = snapshot.captainNavigationTargetId
    ? snapshot.spaceObjects.find((object) => object.id === snapshot.captainNavigationTargetId) ?? null
    : null;
  const navigationTargets = snapshot.spaceObjects.filter((object) => object.selectable && object.alive && object.identified && object.disposition !== 'player');
  const [heading, setHeading] = useState(snapshot.captainHeadingOrder ?? Math.round(snapshot.ship.requestedHeading));
  useEffect(() => {
    if (snapshot.captainHeadingOrder !== null) setHeading(Math.round(snapshot.captainHeadingOrder));
  }, [snapshot.captainHeadingOrder]);

  return <section className="panel captain-heading-order">
    <div className="panel-title"><span>NAVIGATION COURSE ORDER</span><strong>{activeTarget ? `TRACKING ${activeTarget.name.toUpperCase()}` : snapshot.captainHeadingOrder === null ? 'NO COURSE' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}° FIXED`}</strong></div>
    <p className="muted compact-copy">Order a fixed compass course, or send Helm toward an identified contact. Target-tracking courses continuously recalculate as the object moves.</p>

    {activeTarget && <div className="captain-nav-track-readout">
      <div><span>NAVIGATION TARGET</span><strong>{activeTarget.name}</strong></div>
      <div><span>LIVE BEARING</span><strong>{snapshot.captainHeadingOrder === null ? '---' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}°`}</strong></div>
      <div><span>RANGE</span><strong>{objectRange(snapshot, activeTarget).toFixed(1)} km</strong></div>
    </div>}

    <div className="captain-nav-targets">
      <span className="mini-section-label">KNOWN NAVIGATION CONTACTS</span>
      {navigationTargets.length === 0
        ? <p className="muted compact-copy">Science has not identified a selectable contact yet.</p>
        : <div className="nav-target-button-grid">{navigationTargets.map((object) => <button key={object.id} className={snapshot.captainNavigationTargetId === object.id ? 'active' : ''} onClick={() => send({type:'issueNavigationTargetOrder',contactId:object.id})}><strong>{object.name}</strong><span>{object.objectType.toUpperCase()} • {objectRange(snapshot, object).toFixed(1)} km • {Math.round(objectBearing(snapshot, object)).toString().padStart(3,'0')}°</span></button>)}</div>}
    </div>

    <div className="heading-order-controls"><input type="range" min="0" max="359" value={heading} onChange={(e) => setHeading(Number(e.target.value))}/><strong>{Math.round(heading).toString().padStart(3,'0')}°</strong></div>
    <div className="quick-buttons"><button className="primary" onClick={() => send({type:'issueHeadingOrder',heading})}>ORDER FIXED HEADING</button><button className="secondary" onClick={() => send({type:'issueNavigationTargetOrder',contactId:null})}>CLEAR COURSE</button></div>
  </section>;
}

type CaptainOverlay = 'navigation' | 'orders' | 'command' | 'comms' | null;
const viewscreenModeOptions: Array<{ mode: ViewscreenMode; label: string; detail: string }> = [
  { mode: 'forward', label: 'FORE', detail: 'Forward camera' },
  { mode: 'aft', label: 'AFT', detail: 'Aft camera' },
  { mode: 'tactical', label: 'RADAR', detail: 'Tactical plot' },
  { mode: 'mission', label: 'MISSION', detail: 'Goals + status' },
  { mode: 'communications', label: 'COMMS', detail: 'Active channel' }
];

export function CaptainStation({ snapshot, send }: Props) {
  const missionAttentionKey = `${snapshot.missionStage}|${snapshot.currentObjective}`;
  const [ackMissionKey, setAckMissionKey] = useState(snapshot.missionStatus === 'briefing' ? missionAttentionKey : '');
  const captainDamageSeverity = snapshot.ship.hull < 35 ? 3 : snapshot.ship.shields <= 0 || snapshot.ship.hull < 60 ? 2 : snapshot.ship.shields < 40 || snapshot.ship.hull < 85 ? 1 : 0;
  const [ackDamageSeverity, setAckDamageSeverity] = useState(0);
  const [overlay, setOverlay] = useState<CaptainOverlay>(null);
  const latestCommsKey: number | 'none' = snapshot.commsLog[0] ? snapshot.commsLog[0].id : 'none';
  const [ackCommsKey, setAckCommsKey] = useState<number | 'none'>(latestCommsKey);
  useEffect(() => { if (captainDamageSeverity === 0) setAckDamageSeverity(0); }, [captainDamageSeverity]);
  const missionNeedsAck = snapshot.missionStatus !== 'briefing' && ackMissionKey !== missionAttentionKey;
  const damageNeedsAck = captainDamageSeverity > ackDamageSeverity;
  const damageColor = captainDamageSeverity >= 3 ? 'red' : captainDamageSeverity === 2 ? 'orange' : 'yellow';
  const commsNeedsAck = latestCommsKey !== 'none' && latestCommsKey !== ackCommsKey;
  const activeNavTarget = snapshot.captainNavigationTargetId ? snapshot.spaceObjects.find((object) => object.id === snapshot.captainNavigationTargetId) ?? null : null;
  const activeOrders = snapshot.roles.filter((role) => role.captainOrder && role.captainOrder !== 'auto').length;
  const latestComms = snapshot.commsLog[0] ?? null;
  const openComms = () => { setAckCommsKey(latestCommsKey); setOverlay('comms'); };

  return <>
  <main className="station-grid captain-layout captain-overlay-layout v03-captain">
    <section className={`panel mission-card captain-mission-panel ${missionNeedsAck ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckMissionKey(missionAttentionKey)}><div className="panel-title"><span>{snapshot.missionTitle.toUpperCase()}</span><strong>{snapshot.missionId === 'signal-dark' ? `ENCOUNTER ${snapshot.encounter}/2` : 'CIVILIAN RESPONSE'}</strong></div><h2>{snapshot.currentObjective}</h2>{snapshot.missionStatus === 'briefing' && <div className="mission-selector"><button className={snapshot.missionId === 'signal-dark' ? 'active' : ''} onClick={() => send({ type:'selectMission', missionId:'signal-dark' })}><strong>Signal in the Dark</strong><span>Combat • investigate hostile contacts</span></button><button className={snapshot.missionId === 'meridian-distress' ? 'active' : ''} onClick={() => send({ type:'selectMission', missionId:'meridian-distress' })}><strong>Meridian Distress</strong><span>Rescue • communications and rendezvous</span></button></div>}<div className="stage-line"><span>MISSION STAGE</span><strong>{snapshot.missionStage.toUpperCase()}</strong></div><div className="captain-mission-actions">{snapshot.missionStatus === 'briefing' && <button className="primary" onClick={() => send({ type: 'startMission' })}>START MISSION</button>}{snapshot.missionStatus !== 'briefing' && <button className="secondary" onClick={() => send({ type: 'resetMission' })}>RESET TO BRIEFING</button>}</div></section>
    <section className="panel hero-panel captain-overview-panel"><div className="panel-title"><span>TACTICAL OVERVIEW</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className={`panel captain-ship-status ${damageNeedsAck ? `attention-pulse attention-${damageColor}` : captainDamageSeverity ? `attention-${damageColor}` : ''}`} onClick={() => setAckDamageSeverity(captainDamageSeverity)}><h3>Ship Status</h3><Meter label="Hull Integrity" value={snapshot.ship.hull}/><Meter label="Shields" value={snapshot.ship.shields}/><div className="readout-grid"><div><span>Heading</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</strong></div><div><span>Speed</span><strong>{snapshot.ship.speed.toFixed(1)}</strong></div><div><span>Torpedoes</span><strong>{snapshot.ship.torpedoes}</strong></div><div><span>Beam</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong></div></div></section>
    <section className="panel captain-crew-panel"><div className="panel-title"><span>CREW STATIONS</span><strong>{activeOrders ? `${activeOrders} DIRECT ORDERS` : 'NORMAL OPS'}</strong></div><div className="crew-list">{snapshot.roles.map(r => <div key={r.role} className="crew-row crew-row-detailed"><div><span className="crew-role">{r.role.toUpperCase()}</span><small>{r.status}{r.captainOrder && r.captainOrder !== 'auto' ? ` • Order: ${r.captainOrder}` : ''}</small></div><strong className={r.controller}>{r.controller === 'human' ? r.playerName : `AI • ${r.aiOfficerName}`}</strong></div>)}</div></section>

    <section className="panel captain-nav-summary">
      <div className="panel-title"><span>NAVIGATION ORDER</span><strong>{activeNavTarget ? 'TARGET TRACK' : snapshot.captainHeadingOrder === null ? 'NO COURSE' : 'FIXED COURSE'}</strong></div>
      <div className="captain-nav-summary-main"><div><span>{activeNavTarget ? 'TRACKING' : 'ORDERED HEADING'}</span><strong>{activeNavTarget ? activeNavTarget.name : snapshot.captainHeadingOrder === null ? '---' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}°`}</strong></div>{activeNavTarget && <div><span>LIVE BEARING / RANGE</span><strong>{snapshot.captainHeadingOrder === null ? '---' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}°`} • {objectRange(snapshot, activeNavTarget).toFixed(1)} km</strong></div>}</div>
      <button className="secondary captain-open-console" onClick={() => setOverlay('navigation')}>OPEN NAVIGATION ORDERS</button>
    </section>

    <section className="panel captain-command-deck">
      <div className="captain-command-deck-heading"><div><span>COMMAND DECK</span><strong>FOCUSED CONTROLS</strong></div><small>Choose what the bridge sees, then open detailed controls only when needed.</small></div>
      <div className="captain-command-deck-main">
        <div className="captain-viewscreen-switcher"><div><span>MAIN VIEWSCREEN</span><strong>{viewscreenModeOptions.find((option) => option.mode === snapshot.viewscreenMode)?.detail.toUpperCase()}</strong></div><div>{viewscreenModeOptions.map((option) => <button key={option.mode} className={snapshot.viewscreenMode === option.mode ? 'active' : ''} onClick={() => send({type:'setViewscreenMode',mode:option.mode})}><span>{option.label}</span><small>{option.detail}</small></button>)}</div></div>
        <div className="captain-command-deck-actions">
          <button className={activeOrders ? 'captain-deck-button active' : 'captain-deck-button'} onClick={() => setOverlay('orders')}><span>CREW ORDERS</span><strong>{activeOrders ? `${activeOrders} ACTIVE` : 'STANDING ORDERS'}</strong><small>Helm • Tactical • Engineering • Science • Comms</small></button>
          <button className="captain-deck-button" onClick={() => setOverlay('command')}><span>COMMAND CONSOLE</span><strong>VOICE / TEXT</strong><small>Issue natural-language bridge orders</small></button>
          <button className={`captain-deck-button ${commsNeedsAck ? 'attention-pulse attention-yellow' : ''}`} onClick={openComms}><span>BRIDGE COMMS</span><strong>{latestComms ? latestComms.speaker.toUpperCase() : 'STANDBY'}</strong><small>{latestComms ? latestComms.message : 'No current bridge traffic'}</small></button>
        </div>
      </div>
    </section>
  </main>

  {overlay === 'navigation' && <StationFocusOverlay title="NAVIGATION ORDERS" status={activeNavTarget ? `TRACKING ${activeNavTarget.name.toUpperCase()}` : snapshot.captainHeadingOrder === null ? 'NO ACTIVE COURSE' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}° FIXED`} accent="yellow" onClose={() => setOverlay(null)}><CaptainHeadingOrderPanel snapshot={snapshot} send={send}/></StationFocusOverlay>}
  {overlay === 'orders' && <StationFocusOverlay title="CREW STANDING ORDERS" status={activeOrders ? `${activeOrders} ACTIVE` : 'ALL STATIONS AUTO'} accent="yellow" onClose={() => setOverlay(null)}><CaptainOrders snapshot={snapshot} send={send}/></StationFocusOverlay>}
  {overlay === 'command' && <StationFocusOverlay title="CAPTAIN COMMAND CONSOLE" status="VOICE / TEXT ORDERS" accent="yellow" onClose={() => setOverlay(null)}><CaptainCommandConsole send={send}/></StationFocusOverlay>}
  {overlay === 'comms' && <StationFocusOverlay title="BRIDGE COMMUNICATIONS" status={snapshot.commsLog.length ? `${snapshot.commsLog.length} MESSAGES` : 'STANDBY'} accent="yellow" onClose={() => setOverlay(null)}><BridgeCommsPanel snapshot={snapshot}/></StationFocusOverlay>}
  </>;
}

export function HelmStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'helm');
  const courseKey = `${snapshot.captainNavigationTargetId ?? 'fixed'}|${snapshot.captainHeadingOrder ?? 'none'}`;
  const orderKey = assignment?.captainOrder ?? 'auto';
  const [ackCourseKey, setAckCourseKey] = useState('');
  const [ackOrderKey, setAckOrderKey] = useState('auto');
  const courseNeedsAck = snapshot.captainHeadingOrder !== null && courseKey !== ackCourseKey;
  const orderNeedsAck = orderKey !== 'auto' && orderKey !== ackOrderKey;
  const selectedContact = snapshot.stationSelections.helmContactId ? snapshot.spaceObjects.find((object) => object.id === snapshot.stationSelections.helmContactId) ?? null : null;
  const headingRef = useRef(snapshot.ship.requestedHeading);
  const throttleRef = useRef(snapshot.ship.throttle);
  useEffect(() => { headingRef.current = snapshot.ship.requestedHeading; }, [snapshot.ship.requestedHeading]);
  useEffect(() => { throttleRef.current = snapshot.ship.throttle; }, [snapshot.ship.throttle]);
  useEffect(() => { if (snapshot.captainHeadingOrder === null) setAckCourseKey(courseKey); }, [snapshot.captainHeadingOrder, courseKey]);
  useEffect(() => { if (orderKey === 'auto') setAckOrderKey('auto'); }, [orderKey]);
  useEffect(() => {
    const ignoredTarget = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      return Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (ignoredTarget(event)) return;
      const key = event.key.toLowerCase();
      if (key === 'a' || event.key === 'ArrowLeft') {
        event.preventDefault();
        headingRef.current = normalizeHeading(headingRef.current - 5);
        send({type:'setHeading', heading:headingRef.current});
      } else if (key === 'd' || event.key === 'ArrowRight') {
        event.preventDefault();
        headingRef.current = normalizeHeading(headingRef.current + 5);
        send({type:'setHeading', heading:headingRef.current});
      } else if (key === 'w' || event.key === 'ArrowUp') {
        event.preventDefault();
        throttleRef.current = clamp(throttleRef.current + 10, -100, 100);
        send({type:'setThrottle', throttle:throttleRef.current});
      } else if (key === 's' || event.key === 'ArrowDown') {
        event.preventDefault();
        throttleRef.current = clamp(throttleRef.current - 10, -100, 100);
        send({type:'setThrottle', throttle:throttleRef.current});
      } else if (key === 'q') {
        event.preventDefault();
        send({type:'setLateralThrust', thrust:-100});
      } else if (key === 'e') {
        event.preventDefault();
        send({type:'setLateralThrust', thrust:100});
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'q' || key === 'e') send({type:'setLateralThrust', thrust:0});
    };
    const clearLateral = () => send({type:'setLateralThrust', thrust:0});
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearLateral);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearLateral);
    };
  }, [send]);

  const relativeBearing = snapshot.helm.relativeBearing;
  const relativeLabel = relativeBearing === null ? '---' : Math.abs(relativeBearing) < 3 ? 'AHEAD' : relativeBearing < 0 ? `PORT ${Math.abs(relativeBearing).toFixed(0)}°` : `STARBOARD ${relativeBearing.toFixed(0)}°`;
  const closing = snapshot.helm.closingSpeed;
  const aspectLabel = snapshot.helm.aspect === 'headOn' ? 'HEAD-ON' : snapshot.helm.aspect === 'pursuit' ? 'PURSUIT' : snapshot.helm.aspect === 'crossing' ? 'CROSSING' : snapshot.helm.aspect === 'stationary' ? 'STATIONARY' : '---';
  const targetPositionLabel = snapshot.helm.targetRelativePosition === null ? '---' : Math.abs(snapshot.helm.targetRelativePosition) >= 150 ? `STERN ${Math.abs(snapshot.helm.targetRelativePosition).toFixed(0)}°` : snapshot.helm.targetRelativePosition < 0 ? `PORT ${Math.abs(snapshot.helm.targetRelativePosition).toFixed(0)}°` : `STBD ${snapshot.helm.targetRelativePosition.toFixed(0)}°`;
  const positionRating = snapshot.helm.positionalAdvantage === 'stern' ? 'STERN ADVANTAGE' : snapshot.helm.positionalAdvantage === 'flank' ? 'FLANK ADVANTAGE' : snapshot.helm.positionalAdvantage === 'danger' ? 'IN FIRING ARC' : snapshot.helm.positionalAdvantage === 'neutral' ? 'NEUTRAL' : 'UNKNOWN';
  const enemyManeuverLabel = enemyIntentLabel(snapshot.helm.enemyManeuver);
  const maneuverOptions: Array<{ id: HelmManeuver; label: string; target?: boolean }> = [
    {id:'manual',label:'MANUAL'},
    {id:'intercept',label:'INTERCEPT',target:true},
    {id:'flankPort',label:'FLANK PORT',target:true},
    {id:'flankStarboard',label:'FLANK STBD',target:true},
    {id:'takeStern',label:'TAKE STERN',target:true},
    {id:'maintainRange',label:'HOLD RANGE',target:true},
    {id:'matchVelocity',label:'MATCH VEL',target:true},
    {id:'breakAway',label:'BREAK AWAY',target:true},
    {id:'emergencyReverse',label:'REVERSE'},
    {id:'hold',label:'ALL STOP'}
  ];
  const canAssist = snapshot.helm.maneuver !== 'manual' && snapshot.helm.recommendedHeading !== null && snapshot.helm.recommendedThrottle !== null;

  return <>
  <main className="station-grid helm-layout helm-flight-layout">
    <section className="panel hero-panel helm-navigation-map"><div className="panel-title helm-map-title"><span>NAVIGATION / FLIGHT DIRECTOR</span><div className="helm-map-title-actions"><strong>{snapshot.shipCapabilities.stationSensors.helmRange} km SCOPE</strong></div></div><TacticalPlot snapshot={snapshot} send={send} selectionMode="helm" mapMode="helm"/></section>
    <section className={`panel helm-captain-course ${snapshot.captainHeadingOrder !== null ? 'active' : ''} ${courseNeedsAck ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCourseKey(courseKey)}><div className="panel-title"><span>{snapshot.captainNavigationTargetId ? 'CAPTAIN NAVIGATION TARGET' : 'CAPTAIN ORDERED HEADING'}</span><strong>{snapshot.captainNavigationTargetId ? (snapshot.spaceObjects.find((object) => object.id === snapshot.captainNavigationTargetId)?.name.toUpperCase() ?? 'TRACKING') : snapshot.captainHeadingOrder === null ? 'NONE' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}°`}</strong></div><div className="course-order-readout"><span>CURRENT</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</strong><span>{snapshot.captainNavigationTargetId ? 'LIVE BEARING' : 'REQUESTED'}</span><strong>{snapshot.captainNavigationTargetId ? (snapshot.captainHeadingOrder === null ? '---' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}°`) : `${Math.round(snapshot.ship.requestedHeading).toString().padStart(3,'0')}°`}</strong></div>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order helm-inline-order ${orderNeedsAck ? 'attention-pulse attention-yellow' : ''}`} onClick={(event) => {event.stopPropagation();setAckOrderKey(orderKey);}}>CAPTAIN: {assignment.captainOrder.toUpperCase()} {orderNeedsAck && <small> • ACK</small>}</div>}</section>

    <section className="panel controls-panel helm-flight-controls"><div className="panel-title"><span>MANUAL FLIGHT CONTROLS</span><strong>{snapshot.helm.assistEnabled ? 'ASSIST ACTIVE' : 'HELM CONTROL'}</strong></div>
      <div className="helm-heading-dual"><div><span>ACTUAL HEADING</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</strong></div><div><span>REQUESTED</span><strong>{Math.round(snapshot.ship.requestedHeading).toString().padStart(3,'0')}°</strong></div></div>
      <input aria-label="Requested heading" type="range" min="0" max="359" value={snapshot.ship.requestedHeading} onChange={(e) => send({ type:'setHeading', heading:Number(e.target.value) })}/>
      <div className="quick-buttons helm-heading-buttons"><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading - 15})}>−15°</button><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading + 15})}>+15°</button></div>
      <div className="helm-throttle-heading"><span>THROTTLE</span><strong className={snapshot.ship.throttle < 0 ? 'reverse-value' : ''}>{Math.round(snapshot.ship.throttle)}%</strong><em>{snapshot.ship.speed < -.05 ? `REVERSE ${Math.abs(snapshot.ship.speed).toFixed(1)}` : `${snapshot.ship.speed.toFixed(1)} km/s`}</em></div>
      <input aria-label="Throttle" type="range" min="-100" max="100" value={snapshot.ship.throttle} onChange={(e) => send({ type:'setThrottle', throttle:Number(e.target.value) })}/>
      <div className="quick-buttons helm-throttle-buttons"><button onClick={() => send({type:'setThrottle', throttle:-100})}>FULL REV</button><button onClick={() => send({type:'setThrottle', throttle:0})}>STOP</button><button onClick={() => send({type:'setThrottle', throttle:50})}>HALF</button><button onClick={() => send({type:'setThrottle', throttle:100})}>FULL</button></div>
      <div className="helm-thruster-row">
        <button className="helm-thruster-button port" onPointerDown={() => send({type:'setLateralThrust', thrust:-100})} onPointerUp={() => send({type:'setLateralThrust', thrust:0})} onPointerCancel={() => send({type:'setLateralThrust', thrust:0})} onPointerLeave={() => send({type:'setLateralThrust', thrust:0})}>◀ PORT THRUST</button>
        <div className={`helm-maneuver-authority ${snapshot.helm.turnAuthority >= 90 ? 'optimal' : snapshot.helm.turnAuthority < 70 ? 'limited' : ''}`}><span>TURN AUTHORITY</span><strong>{snapshot.helm.turnAuthority}%</strong><small>{snapshot.helm.turnAuthority >= 90 ? 'OPTIMAL SPEED' : snapshot.helm.turnAuthority < 70 ? 'LIMITED' : 'GOOD'} • SIDE {Math.abs(snapshot.ship.lateralSpeed).toFixed(1)} km/s</small></div>
        <button className="helm-thruster-button starboard" onPointerDown={() => send({type:'setLateralThrust', thrust:100})} onPointerUp={() => send({type:'setLateralThrust', thrust:0})} onPointerCancel={() => send({type:'setLateralThrust', thrust:0})} onPointerLeave={() => send({type:'setLateralThrust', thrust:0})}>STARBOARD THRUST ▶</button>
      </div>
      <small className="helm-control-hint">CLICK RADAR TO STEER • A/D TURN • W/S THROTTLE • HOLD Q/E FOR LATERAL THRUST</small>
    </section>

    <section className="panel helm-maneuver-panel"><div className="panel-title"><span>TARGET-RELATIVE MANEUVERING</span><strong>{selectedContact ? selectedContact.name.toUpperCase() : 'SELECT CONTACT'}</strong></div>
      <div className="helm-maneuver-workspace">
        <div className="helm-maneuver-relative">
          {selectedContact ? <>
            <div className="helm-relative-grid"><div><span>RANGE</span><strong>{snapshot.helm.targetRange === null ? '---' : `${snapshot.helm.targetRange.toFixed(1)} km`}</strong></div><div><span>BEARING</span><strong>{snapshot.helm.targetBearing === null ? '---' : `${Math.round(snapshot.helm.targetBearing).toString().padStart(3,'0')}°`}</strong></div><div><span>TARGET OFF BOW</span><strong>{relativeLabel}</strong></div><div><span>{closing !== null && closing < 0 ? 'OPENING' : 'CLOSING'}</span><strong>{closing === null ? '---' : `${Math.abs(closing).toFixed(1)} km/s`}</strong></div><div><span>POSITION AROUND TARGET</span><strong>{targetPositionLabel}</strong></div><div><span>POSITION ERROR</span><strong>{snapshot.helm.positionError === null ? '---' : `${Math.abs(snapshot.helm.positionError).toFixed(0)}°`}</strong></div><div className={`position-${snapshot.helm.positionalAdvantage}`}><span>TACTICAL POSITION</span><strong>{positionRating}</strong></div><div className={snapshot.helm.insideEnemyArc === true ? 'danger' : snapshot.helm.insideEnemyArc === false ? 'safe' : ''}><span>HOSTILE ARC</span><strong>{snapshot.helm.insideEnemyArc === null ? 'UNKNOWN' : snapshot.helm.insideEnemyArc ? 'INSIDE' : 'CLEAR'}</strong></div><div><span>HOSTILE MANEUVER</span><strong>{enemyManeuverLabel}</strong></div></div>
          </> : <p className="muted compact-copy">Click a contact on the navigation scope to make it the Helm relative-navigation reference.</p>}
        </div>
        <div className="helm-maneuver-actions">
          <div className="helm-maneuver-buttons">{maneuverOptions.map((option) => <button key={option.id} disabled={Boolean(option.target && !selectedContact)} className={snapshot.helm.maneuver === option.id ? 'active' : ''} onClick={() => send({type:'setHelmManeuver',maneuver:option.id})}>{option.label}</button>)}</div>
          {(['flankPort','flankStarboard','takeStern','maintainRange','orbitPort','orbitStarboard'] as HelmManeuver[]).includes(snapshot.helm.maneuver) && <div className="helm-orbit-range"><div><span>DESIRED COMBAT RANGE</span><strong>{snapshot.helm.orbitRange.toFixed(1)} km</strong></div><input type="range" min="4" max="30" step=".5" value={snapshot.helm.orbitRange} onChange={(e) => send({type:'setHelmOrbitRange',range:Number(e.target.value)})}/></div>}
        </div>
        <div className="helm-maneuver-director">
          <div className={`helm-director ${canAssist ? 'ready' : ''}`}><div><span>FLIGHT DIRECTOR</span><strong>{snapshot.helm.recommendedHeading === null ? 'MANUAL' : `${Math.round(snapshot.helm.recommendedHeading).toString().padStart(3,'0')}° / ${Math.round(snapshot.helm.recommendedThrottle ?? 0)}%`}</strong><small>{snapshot.helm.maneuver === 'manual' ? 'Direct steering. Click the map or use heading controls.' : 'Target-relative solution updates continuously as both ships maneuver.'}</small></div><button className={snapshot.helm.assistEnabled ? 'active assist-toggle' : 'assist-toggle'} disabled={!canAssist} onClick={() => send({type:'setHelmAssist',enabled:!snapshot.helm.assistEnabled})}>{snapshot.helm.assistEnabled ? 'ASSIST ON' : 'ENGAGE ASSIST'}</button></div>
          {snapshot.enemy.beamArcDegrees !== null && selectedContact?.id === snapshot.enemy.id && <div className="helm-geometry-note">SCIENCE WEAPONS GEOMETRY • {snapshot.enemy.beamRange?.toFixed(0)} km • {Math.round(snapshot.enemy.beamArcDegrees)}° FORWARD ARC</div>}
        </div>
      </div>
    </section>
  </main>
  </>
}

const tacticalTargets: TacticalTarget[] = ['hull', 'shields', 'weapons', 'engines', 'sensors', 'communications'];

function TargetLockPanel({ snapshot, send }: Props) {
  const target = snapshot.tactical.selectedTarget;
  const lock = snapshot.tactical.lock;
  if (target === 'hull') {
    return <section className="precision-lock-card idle"><div className="precision-lock-title"><span>TARGETING DATA LINK</span><strong>GENERAL FIRE</strong></div><p>Tactical has selected general hull fire. No subsystem data-link alignment is required.</p></section>;
  }
  if (!snapshot.sensors.systemsMapped) {
    return <section className="precision-lock-card locked-out"><div className="precision-lock-title"><span>TARGETING DATA LINK</span><strong>SCIENCE DATA REQUIRED</strong></div><p>Science must complete tactical subsystem mapping before Communications can align a precision targeting link.</p></section>;
  }
  return <section className={`precision-lock-card status-${lock.status}`}>
    <div className="precision-lock-title"><span>COMMUNICATIONS DATA LINK • {target.toUpperCase()}</span><strong>{lock.status === 'locked' ? `${lock.quality}% LOCK` : lock.status.toUpperCase()}</strong></div>
    {lock.status === 'idle' && <><p className="muted compact-copy">Tactical selected {target.toUpperCase()}. Align its fire-control telemetry while Tactical continues operating weapons independently.</p><button className="primary full" disabled={!snapshot.enemy.alive || snapshot.systems.communications <= 0 || snapshot.communications.selectedContactId !== snapshot.enemy.id} onClick={() => send({type:'startTargetLock'})}>BEGIN TARGETING LINK</button></>}
    {lock.status === 'aligning' && <>
      <p className="muted compact-copy">Align each telemetry channel inside ±8 of the Science-derived target value, then transmit the solution to Tactical.</p>
      <div className="lock-axis-stack">{lock.axes.map((axis) => <div className="lock-axis" key={axis.axis}>
        <div><span>{axis.axis.toUpperCase()}</span><strong>{Math.round(axis.value)} / TARGET {axis.target}</strong></div>
        <input type="range" min="0" max="100" value={axis.value} onChange={(e) => send({type:'setTargetLockAxis', axis:axis.axis, value:Number(e.target.value)})}/>
      </div>)}</div>
      <button className="primary full" onClick={() => send({type:'verifyTargetLock'})}>TRANSMIT ALIGNMENT</button>
      {lock.strikes > 0 && <div className="lock-strikes">ALIGNMENT FAULTS: {lock.strikes}</div>}
    </>}
    {lock.status === 'locked' && <div className="lock-confirmed"><strong>TARGETING LINK TRANSMITTED</strong><span>Tactical fire will concentrate penetrating damage on {target.toUpperCase()} with minimal hull collateral.</span><button className="secondary" onClick={() => send({type:'startTargetLock'})}>RECALIBRATE</button></div>}
  </section>;
}

function BeamTimingPanel({ snapshot, send }: Props) {
  const timing = snapshot.tactical.beamTiming;
  const ready = timing.status === 'synced';
  if (!snapshot.sensors.systemsMapped) return <section className="panel tactical-skill-panel beam-timing-panel locked"><div className="panel-title"><span>BEAM CAPACITOR TIMING</span><strong>SCIENCE LOCK</strong></div><div className="tactical-console-lock"><strong>HOSTILE PROFILE REQUIRED</strong><span>Science must complete the three-peak tactical-analysis mini-game before capacitor synchronization becomes available. Ordinary beam fire remains online.</span><div className="mini-health-track"><div style={{width:pct(snapshot.sensors.tacticalAnalysisProgress)}}/></div><small>SCIENCE ANALYSIS {Math.round(snapshot.sensors.tacticalAnalysisProgress)}%</small></div></section>;
  return <section className={`panel tactical-skill-panel beam-timing-panel ${ready ? 'ready' : ''}`}>
    <div className="panel-title"><span>BEAM CAPACITOR TIMING</span><strong>{ready ? `${timing.quality}% SYNC` : 'OPTIONAL BOOST'}</strong></div>
    <p className="muted compact-copy">Synchronize the beam discharge while the moving capacitor marker is inside the optimal window. A good sync boosts the <strong>next beam shot only</strong>; basic beam fire remains available without it.</p>
    <div className="timing-track beam-track">
      <div className="timing-sweet-zone" style={{left:`${timing.sweetSpot - timing.window}%`,width:`${timing.window * 2}%`}}/>
      <div className="timing-center-line" style={{left:`${timing.sweetSpot}%`}}/>
      <div className="timing-marker" style={{left:`${timing.phase}%`}}/>
    </div>
    <div className="tactical-skill-readouts"><span>CAPACITOR PHASE <strong>{Math.round(timing.phase)}</strong></span><span>FAULTS <strong>{timing.strikes}</strong></span><span>NEXT SHOT <strong>{ready ? `${timing.bonusMultiplier.toFixed(2)}×` : '1.00×'}</strong></span></div>
    {ready ? <div className="tactical-skill-ready"><strong>CAPACITOR SYNCHRONIZED</strong><span>Fire the beam to consume the timing bonus.</span></div> : <button className="primary full" disabled={!snapshot.sensors.systemsMapped || !snapshot.enemy.alive || snapshot.systems.weapons <= 0 || snapshot.ship.beamCharge < 25} onClick={() => send({type:'syncBeamCapacitor'})}>SYNC CAPACITOR</button>}
  </section>;
}

function TorpedoGuidancePanel({ snapshot, send }: Props) {
  const guidance = snapshot.tactical.torpedoGuidance;
  const gate = guidance.gates[guidance.stage];
  const targetChanged = guidance.target !== snapshot.tactical.selectedTarget || guidance.torpedoType !== snapshot.tactical.selectedTorpedoType;
  const selectedType = snapshot.shipCapabilities.weapons.torpedoTypes.find((type) => type.id === snapshot.tactical.selectedTorpedoType);
  return <section className={`panel tactical-skill-panel torpedo-guidance-panel status-${guidance.status}`}>
    <div className="panel-title"><span>TORPEDO GUIDANCE</span><strong>{guidance.status === 'ready' ? `${guidance.quality}% SOLUTION` : guidance.status.toUpperCase()}</strong></div>
    <p className="muted compact-copy">Build an optional three-point intercept solution for the selected target and <strong>{selectedType?.name ?? 'torpedo'}</strong>. The completed solution boosts the next launch.</p>
    {guidance.status === 'idle' && <button className="primary full" disabled={!snapshot.enemy.alive || snapshot.systems.weapons <= 0 || snapshot.ship.torpedoes <= 0 || snapshot.ship.torpedoInventory[snapshot.tactical.selectedTorpedoType] <= 0 || snapshot.sensors.intelLevel < 1} onClick={() => send({type:'startTorpedoGuidance'})}>OPEN GUIDANCE PACKAGE</button>}
    {guidance.status === 'guiding' && !targetChanged && <>
      <div className="guidance-stage-row">{guidance.gates.map((_, index) => <span key={index} className={index < guidance.stage ? 'complete' : index === guidance.stage ? 'active' : ''}>GATE {index + 1}</span>)}</div>
      <div className="timing-track guidance-track">
        {gate !== undefined && <><div className="guidance-gate-zone" style={{left:`${gate - 14}%`,width:'28%'}}/><div className="timing-center-line" style={{left:`${gate}%`}}/></>}
        <div className="timing-marker torpedo-marker" style={{left:`${guidance.phase}%`}}/>
      </div>
      <div className="tactical-skill-readouts"><span>INTERCEPT CURSOR <strong>{Math.round(guidance.phase)}</strong></span><span>GATE <strong>{guidance.stage + 1}/3</strong></span><span>MISSED MARKS <strong>{guidance.strikes}</strong></span></div>
      <button className="primary full" onClick={() => send({type:'markTorpedoGuidance'})}>MARK INTERCEPT</button>
    </>}
    {guidance.status === 'ready' && !targetChanged && <div className="tactical-skill-ready torpedo-ready"><strong>GUIDANCE PACKAGE LOADED • {guidance.bonusMultiplier.toFixed(2)}×</strong><span>Next torpedo uses this solution against {guidance.target.toUpperCase()}.</span><button className="secondary" onClick={() => send({type:'startTorpedoGuidance'})}>RECALCULATE</button></div>}
    {targetChanged && guidance.status !== 'idle' && <div className="intel-warning">TARGET OR WARHEAD CHANGED — OPEN A NEW GUIDANCE PACKAGE</div>}
  </section>;
}

function TacticalMiniConsole({ title, status, onClose, children }: { title: string; status: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <aside className="tactical-mini-console" role="dialog" aria-modal="false"><header><div><span>TACTICAL WORKBENCH</span><strong>{title}</strong><em>{status}</em></div><button className="secondary" onClick={onClose}>CLOSE</button></header><div className="tactical-mini-console-content">{children}</div></aside>;
}

export function TacticalStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'tactical');
  const shieldSolution = snapshot.sensors.shieldSolution;
  const awareness = evaluateTacticalAwareness(snapshot);
  const selectedContact = awareness.selectedContact;
  const hostileSelected = awareness.hostileSelected;
  const selectedRange = awareness.range;
  const selectedBearing = awareness.bearing;
  const relativeBearing = awareness.relativeBearing;
  const [focusConsole, setFocusConsole] = useState<'beam' | 'torpedo' | null>(null);
  const [ackScienceMilestone, setAckScienceMilestone] = useState(0);
  const [ackCaptainOrder, setAckCaptainOrder] = useState('auto');
  const priorMiniGameStatus = useRef({
    beam: snapshot.tactical.beamTiming.status,
    torpedo: snapshot.tactical.torpedoGuidance.status
  });
  const scienceMilestone = snapshot.sensors.systemsMapped ? 2 : shieldSolution ? 1 : 0;
  const orderKey = assignment?.captainOrder ?? 'auto';
  const shieldAttention = scienceMilestone >= 1 && ackScienceMilestone < 1;
  const mapAttention = scienceMilestone >= 2 && ackScienceMilestone < 2;
  const orderAttention = orderKey !== 'auto' && orderKey !== ackCaptainOrder;
  const guidanceTargetChanged = snapshot.tactical.torpedoGuidance.status !== 'idle' && (snapshot.tactical.torpedoGuidance.target !== snapshot.tactical.selectedTarget || snapshot.tactical.torpedoGuidance.torpedoType !== snapshot.tactical.selectedTorpedoType);
  useEffect(() => { if (scienceMilestone === 0) setAckScienceMilestone(0); }, [scienceMilestone]);
  useEffect(() => { if (orderKey === 'auto') setAckCaptainOrder('auto'); }, [orderKey]);
  useEffect(() => {
    const previous = priorMiniGameStatus.current;
    const next = {
      beam: snapshot.tactical.beamTiming.status,
      torpedo: snapshot.tactical.torpedoGuidance.status
    };
    const completed = (focusConsole === 'beam' && previous.beam !== 'synced' && next.beam === 'synced')
      || (focusConsole === 'torpedo' && previous.torpedo !== 'ready' && next.torpedo === 'ready');
    priorMiniGameStatus.current = next;
    if (!completed) return;
    const timer = window.setTimeout(() => setFocusConsole(null), 320);
    return () => window.clearTimeout(timer);
  }, [focusConsole, snapshot.tactical.beamTiming.status, snapshot.tactical.torpedoGuidance.status]);

  const relativeBearingLabel = relativeBearing === null ? '---' : Math.abs(relativeBearing) < 1 ? 'DEAD AHEAD' : `${Math.abs(Math.round(relativeBearing))}° ${relativeBearing < 0 ? 'PORT' : 'STBD'}`;
  const hostilePosition = awareness.targetRelativePosition === null
    ? '---'
    : Math.abs(awareness.targetRelativePosition) < 1
      ? '000° BOW'
      : Math.abs(awareness.targetRelativePosition) >= 179
        ? '180° STERN'
        : `${Math.abs(Math.round(awareness.targetRelativePosition))}° ${awareness.targetRelativePosition < 0 ? 'PORT' : 'STBD'}`;
  const helmManeuver = snapshot.helm.selectedContactId === snapshot.enemy.id ? snapshot.helm.maneuver.replace(/([A-Z])/g, ' $1').toUpperCase() : 'NO SHARED DIRECTOR';
  const selectedTorpedo = snapshot.shipCapabilities.weapons.torpedoTypes.find((type) => type.id === snapshot.tactical.selectedTorpedoType) ?? snapshot.shipCapabilities.weapons.torpedoTypes[0];
  const selectedTorpedoCount = selectedTorpedo ? snapshot.ship.torpedoInventory[selectedTorpedo.id] : 0;
  const lockStatus = snapshot.tactical.selectedTarget === 'hull' ? 'GENERAL FIRE' : !snapshot.sensors.systemsMapped ? 'SCIENCE DATA REQUIRED' : snapshot.tactical.lock.status === 'locked' ? `${snapshot.tactical.lock.quality}% COMMS LOCK` : snapshot.tactical.lock.status === 'aligning' ? 'COMMS ALIGNING' : 'AWAIT COMMS LINK';
  return <>
    <main className="station-grid tactical-layout tactical-teamwork-layout">
      <section className="panel hero-panel tactical-scope-panel"><div className="panel-title"><span>WEAPONS TRACKING</span><strong>{snapshot.shipCapabilities.stationSensors.tacticalRange} km TACTICAL SCOPE</strong></div><TacticalPlot snapshot={snapshot} send={send} selectionMode="tactical" mapMode="tactical"/><div className="tactical-engagement-strip">
        <div className={hostileSelected ? 'target-hostile' : ''}><span>TRACKED CONTACT</span><strong>{selectedContact?.name ?? 'NO CONTACT'}</strong><small>{selectedRange === null || selectedBearing === null ? 'SELECT ON SCOPE' : `${selectedRange.toFixed(1)} km • ${Math.round(selectedBearing).toString().padStart(3,'0')}° • ${relativeBearingLabel}`}</small></div>
        <div className={`position-${awareness.positionalAdvantage}`}><span>TACTICAL POSITION</span><strong>{awareness.positionLabel}</strong><small>{awareness.hostileArcLabel}</small></div>
        <div className={awareness.beam.ready ? 'solution-ready' : 'solution-blocked'}><span>BEAM SOLUTION</span><strong>{awareness.beam.ready ? 'READY' : 'BLOCKED'}</strong><small>{awareness.beam.status}</small></div>
        <div className={awareness.torpedo.ready ? 'solution-ready' : 'solution-blocked'}><span>TORPEDO SOLUTION</span><strong>{awareness.torpedo.ready ? 'READY' : 'BLOCKED'}</strong><small>{awareness.torpedo.status}</small></div>
      </div></section>
      <section className="panel tactical-fire-control"><div className="panel-title"><span>FIRE CONTROL</span><strong>{snapshot.tactical.weaponOutputMultiplier.toFixed(2)}× OUTPUT</strong></div>
        <div className={`tactical-contact-header disposition-${selectedContact?.disposition ?? 'none'}`}><div><span>SELECTED CONTACT</span><strong>{selectedContact?.name ?? 'NO CONTACT SELECTED'}</strong><small>{selectedContact ? `${selectedContact.objectType.toUpperCase()} • ${selectedContact.subtype}` : 'Select a contact on the tactical scope.'}</small></div><em>{selectedContact?.disposition.toUpperCase() ?? 'STANDBY'}</em></div>
        {assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order ${orderAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCaptainOrder(orderKey)}>CAPTAIN ORDER: {assignment.captainOrder.replace(/([A-Z])/g, ' $1').toUpperCase()} {orderAttention && <small> • CLICK TO ACK</small>}</div>}
        {snapshot.diplomacy.weaponsHold && !snapshot.diplomacy.surpriseAttack && snapshot.missionStage !== 'combat' && snapshot.missionStage !== 'surrender' && <div className="tactical-diplomatic-hold"><div><span>DIPLOMATIC WEAPONS HOLD</span><strong>{snapshot.diplomacy.phase.replace('-', ' ').toUpperCase()}</strong></div><small>{snapshot.diplomacy.phase === 'channel-open' ? 'COMMUNICATIONS CHANNEL OPEN • COMPLETE AND CLOSE THE EXCHANGE' : snapshot.diplomacy.phase === 'agreement' ? snapshot.diplomacy.playerCommitment?.description ?? snapshot.diplomacy.contactCommitment?.description ?? 'MONITOR AGREEMENT COMPLIANCE' : 'INITIAL SHIP-TO-SHIP CONTACT REQUIRED'}</small></div>}
        <div className="tactical-contact-vitals"><UnknownMeter label="Enemy Shields" value={snapshot.enemy.shields}/><UnknownMeter label="Enemy Hull" value={snapshot.enemy.hull}/></div>
        {snapshot.enemy.surrender.status !== 'unavailable' && <div className={`combat-resolution-banner status-${snapshot.enemy.surrender.status}`}><div><span>COMBAT RESOLUTION</span><strong>{snapshot.enemy.operationalState.replace('-', ' ').toUpperCase()} • {snapshot.enemy.surrender.status.toUpperCase()}</strong></div><small>{snapshot.enemy.surrender.eligibilityReason ?? 'Science is evaluating hostile combat capability.'}</small>{snapshot.enemy.surrender.ceasefire && <em>WEAPONS INTERLOCKED • CEASEFIRE</em>}</div>}
        <div className={`science-link-card ${shieldSolution ? 'resolved' : 'pending'} ${shieldAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckScienceMilestone(Math.max(ackScienceMilestone, 1))}><div><span>SCIENCE SHIELD SOLUTION</span><strong>{shieldSolution ? snapshot.sensors.shieldFrequency : 'PENDING'}</strong></div><em>{shieldSolution ? `SHIELD COUPLING ${snapshot.tactical.shieldDamageMultiplier.toFixed(2)}×` : 'NORMAL SHIELD EFFECTIVENESS'}</em></div>
        {selectedContact && !hostileSelected && <div className="intel-warning">{selectedContact.disposition === 'friendly' ? 'FRIENDLY CONTACT — WEAPONS INTERLOCK ACTIVE' : 'NO HOSTILE FIRING SOLUTION FOR SELECTED OBJECT'}</div>}
        {hostileSelected && !awareness.inTacticalScope && <div className="intel-warning">HOSTILE OUTSIDE TACTICAL SCOPE • EDGE BEARING ONLY</div>}
        {hostileSelected && <div className={`tactical-position-card ${snapshot.enemy.ai.intent ? 'with-intent' : ''}`}><div className={`position-${awareness.positionalAdvantage}`}><span>ENGAGEMENT POSITION</span><strong>{awareness.positionLabel}</strong><small>RELATIVE TO HOSTILE: {hostilePosition}</small></div><div className={awareness.insideHostileArc ? 'danger' : awareness.insideHostileArc === false ? 'safe' : ''}><span>HOSTILE WEAPONS</span><strong>{awareness.hostileArcLabel}</strong><small>HELM DIRECTOR: {helmManeuver}</small></div>{snapshot.enemy.ai.intent && <div className="hostile-intent"><span>HOSTILE INTENT</span><strong>{snapshot.enemy.ai.intentLabel ?? enemyIntentLabel(snapshot.enemy.ai.intent)}</strong><small>{snapshot.enemy.ai.reason ?? 'SCIENCE MODEL UPDATING'}</small></div>}</div>}
        {hostileSelected && <div className="weapon-geometry-status"><div><span>TARGET GEOMETRY</span><strong>{selectedRange === null || selectedBearing === null ? '---' : `${selectedRange.toFixed(1)} km • ${Math.round(selectedBearing).toString().padStart(3,'0')}°`}</strong></div><div className={awareness.beam.ready ? 'available' : 'blocked'}><span>BEAM SOLUTION</span><strong>{awareness.beam.status}</strong></div><div className={awareness.torpedo.ready ? 'available' : 'blocked'}><span>TORPEDO SOLUTION</span><strong>{awareness.torpedo.status}</strong></div></div>}
        <section className={`weapon-fire-row beam-weapon-row ${awareness.beam.ready ? 'fire-ready' : 'fire-blocked'} ${snapshot.tactical.beamTiming.status === 'synced' ? 'skill-ready' : ''}`} title={awareness.beam.blockers.join(' • ')}>
          <div className="weapon-fire-readout"><span>BEAM ARRAY</span><strong>{Math.round(snapshot.ship.beamCharge)}% CHARGE</strong><em>{awareness.beam.status}</em><small>25% per shot • output {snapshot.tactical.weaponOutputMultiplier.toFixed(2)}×{snapshot.tactical.beamTiming.status === 'synced' ? ` • timing ${snapshot.tactical.beamTiming.bonusMultiplier.toFixed(2)}×` : ''}</small></div>
          <button aria-label="Fire beam array" className="weapon-fire-trigger beam-fire-trigger" disabled={!awareness.beam.ready} onClick={() => send({type:'fireBeam'})}><span>FIRE</span><strong>BEAM</strong></button>
        </section>

        <section className="torpedo-loadout"><div className="torpedo-loadout-heading"><div><span>TORPEDO LOADOUT</span><strong>{selectedTorpedo?.name ?? 'NO WARHEAD'}</strong><small>{selectedTorpedo?.description ?? 'No torpedo type configured.'}</small></div><select aria-label="Torpedo type" value={snapshot.tactical.selectedTorpedoType} onChange={(event) => send({type:'selectTorpedoType',torpedoType:event.target.value as typeof snapshot.tactical.selectedTorpedoType})}>{snapshot.shipCapabilities.weapons.torpedoTypes.map((type) => <option key={type.id} value={type.id} disabled={snapshot.ship.torpedoInventory[type.id] <= 0}>{type.shortName} • {snapshot.ship.torpedoInventory[type.id]}</option>)}</select></div>
          <div className="torpedo-damage-profile"><span>SHIELD <strong>{selectedTorpedo?.shieldMultiplier.toFixed(2)}×</strong></span><span>HULL <strong>{selectedTorpedo?.hullMultiplier.toFixed(2)}×</strong></span><span>SYSTEM <strong>{selectedTorpedo?.subsystemMultiplier.toFixed(2)}×</strong></span><span>RESERVE <strong>{selectedTorpedoCount}</strong></span></div>
          <div className="torpedo-tube-grid">{snapshot.ship.torpedoTubes.map((tube) => {
            const ready = tube.reloadRemaining <= 0;
            const canFire = ready && awareness.torpedo.ready;
            return <div key={tube.id} title={ready ? awareness.torpedo.blockers.join(' • ') : `${tube.label} reloading`} className={`torpedo-tube ${ready ? 'loaded' : 'reloading'} ${canFire ? 'fire-ready' : 'fire-blocked'} ${snapshot.tactical.torpedoGuidance.status === 'ready' ? 'guided' : ''}`}>
              <div className="torpedo-tube-readout"><span>{tube.label}</span><strong>{ready ? 'LOADED' : `${tube.reloadRemaining.toFixed(1)}s`}</strong><em>{ready ? selectedTorpedo?.shortName ?? 'TORPEDO' : 'RELOADING'}</em>{!ready && <i style={{width:pct((1 - tube.reloadRemaining / tube.reloadSeconds) * 100)}}/>}</div>
              <button aria-label={`Fire ${selectedTorpedo?.name ?? 'torpedo'} from ${tube.label}`} className="weapon-fire-trigger torpedo-fire-trigger" disabled={!canFire} onClick={() => send({type:'fireTorpedo',tubeId:tube.id})}><span>FIRE</span><strong>{tube.label}</strong></button>
            </div>;
          })}</div>
        </section>

        <section className={`tactical-precision-compact ${mapAttention ? 'attention-pulse attention-orange' : ''}`} onClick={() => { if (mapAttention) setAckScienceMilestone(2); }}><div><span>PRECISION SHOT</span><strong>{lockStatus}</strong></div><select aria-label="Precision target" value={snapshot.tactical.selectedTarget} disabled={!hostileSelected} onChange={(event) => send({type:'selectEnemyTarget',target:event.target.value as TacticalTarget})}>{tacticalTargets.map((target) => { const health = target === 'hull' ? snapshot.enemy.hull : snapshot.enemy.systems[target]; return <option key={target} value={target} disabled={target !== 'hull' && !snapshot.sensors.systemsMapped}>{target.toUpperCase()} • {health === null ? 'UNKNOWN' : `${Math.round(health)}%`}</option>; })}</select><span className="precision-link-owner">COMMUNICATIONS OWNS LOCK</span></section>

        <div className="tactical-workbench-launchers"><button className={snapshot.tactical.beamTiming.status === 'synced' ? 'ready' : ''} disabled={!snapshot.sensors.systemsMapped} onClick={() => setFocusConsole('beam')}><span>BEAM CAPACITOR</span><strong>{!snapshot.sensors.systemsMapped ? `SCIENCE LOCK • ${Math.round(snapshot.sensors.tacticalAnalysisProgress)}%` : snapshot.tactical.beamTiming.status === 'synced' ? `${snapshot.tactical.beamTiming.quality}% SYNC READY` : 'OPTIONAL TIMING BOOST'}</strong></button><button className={snapshot.tactical.torpedoGuidance.status === 'ready' ? 'ready' : guidanceTargetChanged ? 'attention-pulse attention-orange' : ''} onClick={() => setFocusConsole('torpedo')}><span>TORPEDO GUIDANCE</span><strong>{guidanceTargetChanged ? 'RECALCULATE' : snapshot.tactical.torpedoGuidance.status === 'ready' ? `${snapshot.tactical.torpedoGuidance.quality}% READY` : 'OPTIONAL INTERCEPT BOOST'}</strong></button></div>
      </section>
    </main>
    {focusConsole === 'beam' && <TacticalMiniConsole title="BEAM CAPACITOR" status={`${Math.round(snapshot.ship.beamCharge)}% CHARGE`} onClose={() => setFocusConsole(null)}><BeamTimingPanel snapshot={snapshot} send={send}/></TacticalMiniConsole>}
    {focusConsole === 'torpedo' && <TacticalMiniConsole title="TORPEDO GUIDANCE" status={`${selectedTorpedo?.shortName ?? 'TORPEDO'} • ${selectedTorpedoCount} REMAINING`} onClose={() => setFocusConsole(null)}><TorpedoGuidancePanel snapshot={snapshot} send={send}/></TacticalMiniConsole>}
  </>;
}


const circuitGlyph = (shape: 'straight' | 'corner', rotation: number) => {
  if (shape === 'straight') return rotation % 180 === 0 ? '━' : '┃';
  if (rotation === 0) return '┗';
  if (rotation === 90) return '┏';
  if (rotation === 180) return '┓';
  return '┛';
};

function EngineeringRepairPuzzle({ snapshot, send }: Props) {
  const puzzle = snapshot.engineeringPuzzle;
  const target = snapshot.repairTarget;
  const health = target ? snapshot.systems[target] : 100;
  if (!target) {
    return <section className="panel engineering-puzzle-panel idle"><div className="panel-title"><span>DAMAGE CONTROL</span><strong>STANDBY</strong></div><div className="puzzle-idle"><strong>SELECT A DAMAGED SUBSYSTEM</strong><span>Select a subsystem to open its diagnostic panel. Repair crews are assigned separately and must physically reach a subsystem before conventional repair begins. Systems at 75% or below can receive a quick combat-repair task; systems at 0% require a full restoration procedure.</span></div></section>;
  }
  if (!puzzle) {
    return <section className="panel engineering-puzzle-panel idle"><div className="panel-title"><span>DAMAGE CONTROL • {target.toUpperCase()}</span><strong>NO DIAGNOSTIC REQUIRED</strong></div><div className="puzzle-idle"><strong>{Math.round(health)}% • DEGRADED BUT STABLE</strong><span>Conventional repair crews can handle this damage without a manual diagnostic. Assign one or more crews to the subsystem to restore integrity.</span></div></section>;
  }

  const solved = puzzle.status === 'solved';
  const restoration = puzzle.mode === 'restoration';
  const boost = snapshot.repairBoosts[puzzle.system] ?? 0;
  return <section className={`panel engineering-puzzle-panel puzzle-${puzzle.type} mode-${puzzle.mode} ${solved ? 'solved' : ''}`}>
    <div className="panel-title"><span>{restoration ? 'CRITICAL RESTORATION' : 'COMBAT REPAIR'} • {puzzle.system.toUpperCase()}</span><strong>{solved ? (restoration ? 'SYSTEM ONLINE' : 'BOOST ACTIVE') : puzzle.type.toUpperCase()}</strong></div>
    <div className="puzzle-meta"><span>CLASS <strong>{restoration ? 'OFFLINE' : health < 25 ? 'CRITICAL' : 'DAMAGED'}</strong></span><span>MOVES <strong>{puzzle.moves}</strong></span><span>FAULTS <strong>{puzzle.strikes}</strong></span><span>BOOST <strong>{boost > 0 ? `${boost.toFixed(1)}s` : 'READY'}</strong></span></div>
    {solved ? <div className="puzzle-success"><strong>{restoration ? 'SUBSYSTEM RE-ENERGIZED' : 'COMBAT REPAIR COMPLETE'}</strong><span>{restoration ? 'The subsystem is back online. Any repair crews already on station can immediately resume restoring integrity.' : 'Repair crews received an immediate integrity bump and a temporary 3× repair-rate boost.'}</span></div> : <>
      {restoration && <div className="restoration-warning"><strong>SYSTEM OFFLINE</strong><span>Repair crews cannot raise integrity while this subsystem is offline. Complete the restoration procedure to re-energize it.</span></div>}
      {puzzle.type === 'breaker' && <BreakerResetPuzzle puzzle={puzzle} send={send}/>} 
      {puzzle.type === 'coolant' && <CoolantBalancePuzzle puzzle={puzzle} send={send}/>} 
      {puzzle.type === 'fuse' && <FusePuzzle puzzle={puzzle} send={send}/>} 
      {puzzle.type === 'circuit' && <CircuitPuzzle puzzle={puzzle} send={send}/>} 
      {puzzle.type === 'junction' && <JunctionIsolationPuzzle puzzle={puzzle} send={send}/>} 
    </>}
  </section>;
}

function BreakerResetPuzzle({ puzzle, send }: { puzzle: EngineeringPuzzleState; send: Props['send'] }) {
  const remaining = (puzzle.breakers ?? []).filter((entry) => entry.tripped && !entry.reset).length;
  return <div className="quick-repair-wrap">
    <p className="puzzle-instruction">Reset only the <strong>TRIPPED</strong> breakers, in order from the <strong>lowest bus number to the highest</strong>. A wrong reset records a fault but leaves the panel energized.</p>
    <div className="breaker-bank">{puzzle.breakers?.map((breaker) => <button key={breaker.id} disabled={!breaker.tripped || breaker.reset} className={`breaker-card ${breaker.tripped ? 'tripped' : 'normal'} ${breaker.reset ? 'reset' : ''}`} onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'resetBreaker', breakerId:breaker.id })}>
      <span>{breaker.id}</span><strong>BUS {breaker.bus}</strong><i/>
      <small>{breaker.reset ? 'RESET' : breaker.tripped ? 'TRIPPED' : 'CLOSED'}</small>
    </button>)}</div>
    <div className="quick-repair-footer"><span>TRIPPED BREAKERS REMAINING</span><strong>{remaining}</strong></div>
  </div>;
}

function CoolantBalancePuzzle({ puzzle, send }: { puzzle: EngineeringPuzzleState; send: Props['send'] }) {
  const labels = ['LOW','MED','HIGH','MAX'];
  return <div className="quick-repair-wrap">
    <p className="puzzle-instruction">Match each coolant valve to the target flow shown by the diagnostic computer. Click a valve to advance it through the four flow settings.</p>
    <div className="coolant-bank">{puzzle.coolantValves?.map((valve, index) => <button key={valve.id} className={`coolant-card ${valve.setting === valve.target ? 'matched' : ''}`} onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'cycleCoolant', valveId:valve.id })}>
      <span>LOOP {index + 1}</span><strong>{labels[valve.setting]}</strong><div className="coolant-gauge"><i style={{width:`${(valve.setting + 1) * 25}%`}}/></div><small>TARGET {labels[valve.target]}</small>
    </button>)}</div>
  </div>;
}

function CircuitPuzzle({ puzzle, send }: { puzzle: EngineeringPuzzleState; send: Props['send'] }) {
  const size = puzzle.circuitSize ?? 3;
  const sourceIndex = puzzle.circuitSourceIndex ?? size;
  const sinkIndex = puzzle.circuitSinkIndex ?? (size * 2 - 1);
  const sourceRow = Math.floor(sourceIndex / size);
  const sinkRow = Math.floor(sinkIndex / size);
  return <div className="circuit-puzzle-wrap">
    <p className="puzzle-instruction">Rotate the board until there is one continuous powered route from <strong>POWER IN</strong> to the <strong>REPAIR BUS</strong>. The entry and exit ports can move between diagnostics, and unused traces may be decoys.</p>
    <div className="circuit-board-row randomized">
      <div className="circuit-end-rail" style={{ gridTemplateRows:`repeat(${size}, 1fr)` }}><span className="circuit-end source" style={{ gridRow:sourceRow + 1 }}>POWER<br/>IN</span></div>
      <div className="circuit-grid" style={{ gridTemplateColumns:`repeat(${size}, 1fr)` }}>{puzzle.circuitTiles?.map((tile) => <button key={tile.index} className="circuit-tile" onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'rotate', index:tile.index })}><span>{circuitGlyph(tile.shape, tile.rotation)}</span><small>{tile.index + 1}</small></button>)}</div>
      <div className="circuit-end-rail" style={{ gridTemplateRows:`repeat(${size}, 1fr)` }}><span className="circuit-end sink" style={{ gridRow:sinkRow + 1 }}>REPAIR<br/>BUS</span></div>
    </div>
  </div>;
}

function JunctionIsolationPuzzle({ puzzle, send }: { puzzle: EngineeringPuzzleState; send: Props['send'] }) {
  const context = puzzle.junctionContext;
  const rules = puzzle.junctionRules ?? [];
  const junctions = puzzle.junctions ?? [];
  const isolated = junctions.filter((junction) => junction.isolated).length;
  const profileLabel = (profile: string) => profile === 'cyan' ? 'CYAN' : profile === 'amber' ? 'AMBER' : profile === 'magenta' ? 'MAGENTA' : 'DUAL STRIPE';
  const ruleTitle: Record<string, string> = {
    I: 'ISOLATE',
    K: 'KEEP CLOSED',
    E: 'IF CHECKSUM EVEN',
    A: 'IF AUX ONLINE',
    R: 'IF RESERVE ≥ 60%'
  };

  return <div className="junction-puzzle-wrap">
    <p className="puzzle-instruction">Determine which damaged junctions must be <strong>isolated</strong>. For each junction, find its lead profile and indicator column in the protocol matrix, then resolve the action code against the live diagnostic conditions. Set the correct junctions OPEN and verify the isolation pattern.</p>

    <div className="junction-context-strip">
      <div><span>PROTOCOL</span><strong>{context?.protocol ?? '—'}</strong></div>
      <div><span>CHECKSUM</span><strong>{context ? `${context.checksum} • ${context.checksum % 2 === 0 ? 'EVEN' : 'ODD'}` : '—'}</strong></div>
      <div><span>AUX BUS</span><strong className={context?.auxiliaryOnline ? 'good' : 'warn'}>{context?.auxiliaryOnline ? 'ONLINE' : 'OFFLINE'}</strong></div>
      <div><span>RESERVE</span><strong className={(context?.reserve ?? 0) >= 60 ? 'good' : 'warn'}>{context ? `${context.reserve}%` : '—'}</strong></div>
    </div>

    <div className="junction-workspace">
      <div className="junction-bank">
        <div className="junction-section-title"><span>FAULTED JUNCTION BANK</span><strong>{isolated} OPEN</strong></div>
        <div className="junction-grid">{junctions.map((junction) => <button key={junction.id} className={`junction-card profile-${junction.profile} ${junction.isolated ? 'isolated' : 'closed'}`} onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'toggleJunction', junctionId:junction.id })}>
          <div className="junction-card-head"><strong>{junction.id}</strong><span>{junction.isolated ? 'OPEN / ISOLATED' : 'CLOSED / ENERGIZED'}</span></div>
          <div className={`junction-lamp ${junction.lamp ? 'lit' : ''}`}><i/>{junction.lamp ? 'LAMP ON' : 'LAMP OFF'}</div>
          <div className={`junction-conductor profile-${junction.profile}`}><span/><span/></div>
          <div className="junction-card-foot"><strong>{profileLabel(junction.profile)}</strong><span className={junction.tagged ? 'tagged' : ''}>{junction.tagged ? '◆ BYPASS TAG' : 'NO TAG'}</span></div>
          <div className="junction-switch"><span>{junction.isolated ? 'RESET CLOSED' : 'ISOLATE'}</span></div>
        </button>)}</div>
        <button className="primary full junction-verify" onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'verifyJunctions' })}>VERIFY ISOLATION PATTERN</button>
        <p className="junction-warning">A failed verification records a diagnostic fault but does not reveal which junction is wrong.</p>
      </div>

      <div className="junction-manual">
        <div className="junction-section-title"><span>PROTOCOL {context?.protocol ?? '—'} MATRIX</span><strong>LIVE REFERENCE</strong></div>
        <div className="junction-rule-table">
          <div className="rule-cell header profile">LEAD</div>
          <div className="rule-cell header">LAMP OFF<br/>NO TAG</div>
          <div className="rule-cell header">LAMP ON<br/>NO TAG</div>
          <div className="rule-cell header">LAMP OFF<br/>TAG</div>
          <div className="rule-cell header">LAMP ON<br/>TAG</div>
          {rules.map((row) => <div className="rule-row" key={row.profile}>
            <div className={`rule-cell profile profile-${row.profile}`}>{profileLabel(row.profile)}</div>
            {[row.offClear, row.litClear, row.offTagged, row.litTagged].map((code, index) => <div className={`rule-cell code code-${code.toLowerCase()}`} key={`${row.profile}-${index}`}><strong>{code}</strong><small>{ruleTitle[code]}</small></div>)}
          </div>)}
        </div>
        <div className="junction-code-legend">
          <div><strong>I</strong><span>Always isolate</span></div>
          <div><strong>K</strong><span>Keep closed</span></div>
          <div><strong>E</strong><span>Isolate only if checksum is even</span></div>
          <div><strong>A</strong><span>Isolate only if auxiliary bus is online</span></div>
          <div><strong>R</strong><span>Isolate only if reserve is at least 60%</span></div>
        </div>
      </div>
    </div>
  </div>;
}

function FusePuzzle({ puzzle, send }: { puzzle: EngineeringPuzzleState; send: Props['send'] }) {
  const installed = new Set((puzzle.fuseBays ?? []).flatMap((bay) => bay.installed === null ? [] : [bay.installed]));
  return <div className="fuse-puzzle-wrap">
    <p className="puzzle-instruction">Each bus shows its measured load. Install the <strong>smallest standard fuse rated at or above that load</strong>. Each cartridge can be used once.</p>
    <div className="fuse-bays">{puzzle.fuseBays?.map((bay, index) => <div key={bay.id} className={`fuse-bay ${bay.installed !== null ? 'filled' : ''}`}><div className="fuse-bay-heading"><span>BUS {index + 1}</span><strong>{bay.load.toFixed(1)} A</strong></div><div className="fuse-slot">{bay.installed !== null ? <strong>{bay.installed}A</strong> : <span>BLOWN</span>}</div><div className="fuse-options">{puzzle.fuseOptions?.map((rating) => <button key={rating} disabled={bay.installed !== null || installed.has(rating)} onClick={() => send({ type:'engineeringPuzzleAction', puzzleId:puzzle.id, action:'installFuse', bayId:bay.id, rating })}>{rating}A</button>)}</div></div>)}</div>
  </div>;
}


function EngineeringDiagnosticDock({ snapshot, onOpen }: { snapshot: GameSnapshot; onOpen: () => void }) {
  const target = snapshot.repairTarget;
  const puzzle = snapshot.engineeringPuzzle;
  const health = target ? snapshot.systems[target] : null;
  if (!target) {
    return <section className="panel engineering-diagnostic-dock idle"><div className="panel-title"><span>ACTIVE DIAGNOSTIC</span><strong>STANDBY</strong></div><div className="diagnostic-dock-body"><strong>NO SUBSYSTEM SELECTED</strong><span>Select a damaged subsystem in Damage Control to inspect its repair state.</span></div></section>;
  }
  if (!puzzle) {
    return <section className="panel engineering-diagnostic-dock idle"><div className="panel-title"><span>ACTIVE DIAGNOSTIC • {target.toUpperCase()}</span><strong>CREW REPAIR</strong></div><div className="diagnostic-dock-body"><strong>{Math.round(health ?? 100)}% • NO MANUAL PROCEDURE</strong><span>Assign repair crews to restore subsystem integrity. A manual diagnostic becomes available at 75% or below.</span></div></section>;
  }
  const restoration = puzzle.mode === 'restoration';
  const solved = puzzle.status === 'solved';
  return <section className={`panel engineering-diagnostic-dock ${restoration ? 'critical' : 'active'} ${solved ? 'solved' : ''}`}>
    <div className="panel-title"><span>{restoration ? 'CRITICAL RESTORATION' : 'COMBAT DIAGNOSTIC'} • {puzzle.system.toUpperCase()}</span><strong>{solved ? 'COMPLETE' : puzzle.type.toUpperCase()}</strong></div>
    <div className="diagnostic-dock-body">
      <div className="diagnostic-dock-status"><div><span>STATUS</span><strong>{solved ? (restoration ? 'SYSTEM ONLINE' : 'BOOST ACTIVE') : restoration ? 'OFFLINE' : `${Math.round(health ?? 0)}%`}</strong></div><div><span>MOVES</span><strong>{puzzle.moves}</strong></div><div><span>FAULTS</span><strong>{puzzle.strikes}</strong></div></div>
      <button className="primary diagnostic-open-button" onClick={onOpen}>{solved ? 'VIEW DIAGNOSTIC' : restoration ? 'OPEN RESTORATION CONSOLE' : 'OPEN REPAIR CONSOLE'}</button>
      <small>The diagnostic opens in a full-screen overlay. Closing it does not reset progress.</small>
    </div>
  </section>;
}

function EngineeringDiagnosticOverlay({ snapshot, send, onClose }: Props & { onClose: () => void }) {
  const previousStatus = useRef(snapshot.engineeringPuzzle?.status);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    const currentStatus = snapshot.engineeringPuzzle?.status;
    const completed = previousStatus.current === 'active' && currentStatus === 'solved';
    previousStatus.current = currentStatus;
    if (!completed) return;
    const timer = window.setTimeout(onClose, 420);
    return () => window.clearTimeout(timer);
  }, [snapshot.engineeringPuzzle?.status, onClose]);

  return <div className="engineering-diagnostic-overlay" role="dialog" aria-modal="true" aria-label="Engineering diagnostic console" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="engineering-diagnostic-modal">
      <div className="engineering-diagnostic-modal-bar"><div><span>ENGINEERING DAMAGE CONTROL</span><strong>{snapshot.repairTarget ? snapshot.repairTarget.toUpperCase() : 'DIAGNOSTIC'}</strong></div><button className="secondary diagnostic-close" onClick={onClose}>CLOSE • ESC</button></div>
      <EngineeringRepairPuzzle snapshot={snapshot} send={send}/>
    </div>
  </div>;
}

function RepairCrewPanel({ snapshot, send }: Props) {
  const systems: SystemName[] = ['engines', 'shields', 'weapons', 'sensors', 'communications'];
  const living = snapshot.repairCrews.filter((crew) => crew.status !== 'dead').length;
  const dead = snapshot.repairCrews.length - living;
  const workingCount = (system: SystemName) => snapshot.repairCrews.filter((crew) => crew.status === 'working' && crew.system === system).length;
  const travelingCount = (system: SystemName) => snapshot.repairCrews.filter((crew) => crew.status === 'traveling' && crew.destinationSystem === system).length;
  const multiplierFor = (count: number) => count <= 0 ? 0 : 1 + Math.max(0, count - 1) * 0.75;
  const autoCount = snapshot.repairCrews.filter((crew) => crew.status !== 'dead' && crew.autoDispatch).length;

  return <section className="panel repair-crews-panel">
    <div className="panel-title"><span>REPAIR CREWS</span><strong>{living}/{snapshot.repairCrews.length} AVAILABLE{dead ? ` • ${dead} LOST` : ''}</strong></div>
    <div className="repair-crew-auto-bar"><span>AUTO DAMAGE CONTROL</span><strong>{autoCount}/{living} CREWS</strong><button className="secondary" disabled={!living || autoCount === living} onClick={() => snapshot.repairCrews.filter((crew) => crew.status !== 'dead').forEach((crew) => send({type:'setRepairCrewAuto', crewId:crew.id, enabled:true}))}>AUTO ALL</button></div>
    <p className="muted compact-copy">AUTO crews finish their current casualty, then move to the next damaged subsystem. Selecting a specific compartment overrides AUTO for that crew.</p>
    <div className="repair-crew-list">{snapshot.repairCrews.map((crew) => {
      const assigned = crew.status === 'traveling' ? crew.destinationSystem : crew.system;
      const status = crew.status === 'dead'
        ? 'CASUALTY'
        : crew.status === 'traveling'
          ? `EN ROUTE • ${crew.travelRemaining.toFixed(1)}s • ${(crew.destinationSystem ?? '').toUpperCase()}`
          : crew.status === 'working'
            ? `${crew.system && snapshot.systems[crew.system] >= 100 ? 'ON STATION' : 'REPAIRING'} • ${(crew.system ?? '').toUpperCase()}`
            : 'STANDBY';
      const selectValue = crew.autoDispatch ? '__auto' : (assigned ?? '');
      return <div className={`repair-crew-card status-${crew.status} ${crew.autoDispatch ? 'auto' : 'manual'}`} key={crew.id}>
        <div className="repair-crew-identity"><strong>{crew.name}</strong><span>{crew.autoDispatch && crew.status !== 'dead' ? `AUTO • ${status}` : status}</span></div>
        <select disabled={crew.status === 'dead'} value={selectValue} onChange={(event) => {
          if (event.target.value === '__auto') send({type:'setRepairCrewAuto', crewId:crew.id, enabled:true});
          else send({ type:'assignRepairCrew', crewId:crew.id, system:(event.target.value || null) as SystemName | null });
        }}>
          <option value="__auto">AUTO DAMAGE CONTROL</option>
          <option value="">MANUAL STANDBY</option>
          {systems.map((system) => <option key={system} value={system}>MANUAL • {system.toUpperCase()}</option>)}
        </select>
      </div>;
    })}</div>
    <div className="crew-deployment-summary">{systems.map((system) => {
      const working = workingCount(system);
      const traveling = travelingCount(system);
      return <div key={system} className={working || traveling ? 'active' : ''}><span>{system.toUpperCase()}</span><strong>{working} ON STATION{traveling ? ` + ${traveling} EN ROUTE` : ''}</strong><small>{working ? `${multiplierFor(working).toFixed(2)}× CREW RATE` : 'NO ACTIVE REPAIR'}</small></div>;
    })}</div>
  </section>;
}

const engineeringSeverity = (health: number): { level: 0 | 1 | 2 | 3; key: 'nominal' | 'minor' | 'critical' | 'offline'; label: string } => {
  if (health <= 0) return { level: 3, key: 'offline', label: 'OFFLINE' };
  if (health < 25) return { level: 2, key: 'critical', label: 'CRITICAL' };
  if (health < 100) return { level: 1, key: 'minor', label: 'MINOR DAMAGE' };
  return { level: 0, key: 'nominal', label: 'NOMINAL' };
};

export function EngineeringStation({ snapshot, send }: Props) {
  const ship = snapshot.ship;
  const assignment = snapshot.roles.find((r) => r.role === 'engineering');
  const set = (system: 'engines'|'shields'|'weapons', value: number) => send({type:'setPower', system, value});
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [acknowledgedSeverity, setAcknowledgedSeverity] = useState<Record<SystemName, number>>({ engines:0, shields:0, weapons:0, sensors:0, communications:0 });

  // Returning to 100% clears acknowledgement history so the next damage event
  // will alert again. Improving within the same incident does not re-alert.
  useEffect(() => {
    setAcknowledgedSeverity((current) => {
      let changed = false;
      const next = { ...current };
      for (const [system, health] of Object.entries(snapshot.systems) as Array<[SystemName, number]>) {
        if (health >= 100 && next[system] !== 0) { next[system] = 0; changed = true; }
      }
      return changed ? next : current;
    });
  }, [snapshot.systems.engines, snapshot.systems.shields, snapshot.systems.weapons, snapshot.systems.sensors, snapshot.systems.communications]);

  const acknowledgeAndSelect = (system: SystemName, health: number) => {
    const severity = engineeringSeverity(health);
    setAcknowledgedSeverity((current) => ({ ...current, [system]: Math.max(current[system], severity.level) }));
    setDiagnosticOpen(false);
    send({ type:'setRepairTarget', system });
  };

  return <>
    <main className="station-grid engineering-layout">
      <section className="panel power-panel"><div className="panel-title"><span>POWER DISTRIBUTION</span><strong>TOTAL 100%</strong></div>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className="incoming-order">CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()}</div>}{([['engines', ship.enginePower], ['shields', ship.shieldPower], ['weapons', ship.weaponPower]] as const).map(([system,value]) => <div className="power-control" key={system}><div className="power-heading"><span>{system.toUpperCase()}</span><strong>{Math.round(value)}%</strong></div><input type="range" min="0" max="100" value={value} onChange={(e)=>set(system,Number(e.target.value))}/></div>)}</section>
      <section className="panel engineering-system-condition"><h3>System Condition</h3><Meter label="Hull Integrity" value={ship.hull}/><Meter label="Shield Strength" value={ship.shields}/><Meter label="Beam Capacitor" value={ship.beamCharge}/><div className="readout-grid"><div><span>Engine Output</span><strong>{ship.enginePower.toFixed(0)}%</strong></div><div><span>Shield Output</span><strong>{ship.shieldPower.toFixed(0)}%</strong></div><div><span>Weapon Bus</span><strong>{ship.weaponPower.toFixed(0)}%</strong></div><div><span>Weapon Damage</span><strong>{snapshot.tactical.weaponOutputMultiplier.toFixed(2)}×</strong></div><div><span>Speed</span><strong>{ship.speed.toFixed(1)}</strong></div></div></section>
      <section className="panel damage-control-panel"><div className="panel-title"><span>DAMAGE CONTROL</span><strong>{snapshot.repairTarget ? `ACKNOWLEDGED ${snapshot.repairTarget.toUpperCase()}` : 'MONITORING'}</strong></div><p className="muted compact-copy">Flashing subsystem tiles require acknowledgement. Click a tile to acknowledge the alert and inspect that system; this never opens a diagnostic automatically. Yellow = damage, orange = critical, red = offline.</p><div className="system-health-grid">{(Object.entries(snapshot.systems) as Array<[SystemName, number]>).map(([system, health]) => {
        const severity = engineeringSeverity(health);
        const alerting = severity.level > acknowledgedSeverity[system];
        const selected = snapshot.repairTarget === system;
        return <button key={system} className={`system-health-card ${selected ? 'active' : ''} severity-${severity.key} ${alerting ? 'needs-ack' : 'acknowledged'}`} onClick={() => acknowledgeAndSelect(system, health)}><span>{system.toUpperCase()}</span><strong>{Math.round(health)}%</strong><em>{alerting ? `ACK • ${severity.label}` : severity.label}</em><small className="system-crew-count">{snapshot.repairCrews.filter((crew) => crew.status === 'working' && crew.system === system).length} CREW ON STATION{snapshot.repairCrews.some((crew) => crew.status === 'traveling' && crew.destinationSystem === system) ? ' • EN ROUTE' : ''}</small><div className="mini-health-track"><div style={{width:pct(health)}}/></div></button>;
      })}</div><button className="secondary full" onClick={() => { setDiagnosticOpen(false); send({ type:'setRepairTarget', system:null }); }}>CLEAR DIAGNOSTIC FOCUS</button></section>
      <RepairCrewPanel snapshot={snapshot} send={send}/>
      <section className="panel engineering-test-bench"><div className="panel-title"><span>SYSTEM FAILURE DRILL</span><strong>ALPHA TEST CONTROL</strong></div><p className="muted compact-copy">Use this only to test repair mechanics. Select a subsystem above, then force it into a known damage state. These controls are not part of normal mission balance.</p><div className="engineering-test-actions"><button className="danger" disabled={!snapshot.repairTarget} onClick={() => snapshot.repairTarget && send({ type:'engineeringTestSetSystem', system:snapshot.repairTarget, health:0 })}>FORCE SELECTED OFFLINE</button><button disabled={!snapshot.repairTarget} onClick={() => snapshot.repairTarget && send({ type:'engineeringTestSetSystem', system:snapshot.repairTarget, health:20 })}>SET SELECTED TO 20%</button><button disabled={!snapshot.repairTarget} onClick={() => snapshot.repairTarget && send({ type:'engineeringTestSetSystem', system:snapshot.repairTarget, health:55 })}>SET SELECTED TO 55%</button><button className="secondary" disabled={!snapshot.repairTarget} onClick={() => snapshot.repairTarget && send({ type:'engineeringTestSetSystem', system:snapshot.repairTarget, health:100 })}>RESTORE SELECTED TO 100%</button></div></section>
      <EngineeringDiagnosticDock snapshot={snapshot} onOpen={() => setDiagnosticOpen(true)}/>
    </main>
    {diagnosticOpen && snapshot.repairTarget && <EngineeringDiagnosticOverlay snapshot={snapshot} send={send} onClose={() => setDiagnosticOpen(false)}/>} 
  </>;
}

export function ScienceStation({ snapshot, send }: Props) {
  const sensor = snapshot.sensors;
  const assignment = snapshot.roles.find((r) => r.role === 'science');
  const selectedContact = snapshot.spaceObjects.find((object) => object.id === snapshot.stationSelections.scienceContactId) ?? null;
  const enemySelected = selectedContact?.id === snapshot.enemy.id;
  const scienceZoomLevels = [1, 2, 4, 8];
  const [scienceZoom, setScienceZoom] = useState(1);
  const [scienceMapCenter, setScienceMapCenter] = useState<{ x: number; y: number } | null>(null);
  const [acknowledgedContacts, setAcknowledgedContacts] = useState<Record<string, boolean>>({});
  const [ackTacticalMilestone, setAckTacticalMilestone] = useState(0);
  const [ackCaptainOrder, setAckCaptainOrder] = useState('auto');
  const zoomIndex = Math.max(0, scienceZoomLevels.indexOf(scienceZoom));
  const tacticalMilestone = sensor.systemsMapped ? 2 : sensor.shieldSolution ? 1 : 0;
  const orderKey = assignment?.captainOrder ?? 'auto';
  const attentionContactIds = snapshot.spaceObjects.filter((object) => object.selectable && object.disposition !== 'player' && !object.identified && !acknowledgedContacts[object.id]).map((object) => object.id);
  const resultAttention = tacticalMilestone > ackTacticalMilestone;
  const orderAttention = orderKey !== 'auto' && orderKey !== ackCaptainOrder;
  const analysisGate = sensor.tacticalAnalysisGates[sensor.tacticalAnalysisStage];
  useEffect(() => { if (tacticalMilestone === 0) setAckTacticalMilestone(0); }, [tacticalMilestone]);
  useEffect(() => { if (orderKey === 'auto') setAckCaptainOrder('auto'); }, [orderKey]);
  const centerOnSelected = () => {
    if (!selectedContact) return;
    setScienceMapCenter({ x: selectedContact.x, y: selectedContact.y });
  };
  const acknowledgeContact = (object: SpaceObjectState) => setAcknowledgedContacts((current) => ({ ...current, [object.id]: true }));
  return <main className="station-grid science-layout science-teamwork-layout">
    <section className={`panel hero-panel science-radar-panel ${attentionContactIds.length ? 'attention-edge attention-yellow' : ''}`}><div className="panel-title"><span>LONG-RANGE SENSORS</span><strong>{attentionContactIds.length ? `${attentionContactIds.length} UNRESOLVED CONTACT${attentionContactIds.length === 1 ? '' : 'S'} • SELECT TO ACK` : 'SELECT CONTACT • DRAG MAP TO PAN'}</strong></div><div className="science-radar-toolbar"><span>RADAR VIEW</span><div><button className="secondary" disabled={zoomIndex === 0} onClick={() => setScienceZoom(scienceZoomLevels[Math.max(0, zoomIndex - 1)])}>−</button><strong>{scienceZoom === 1 ? 'FULL MAP' : `${scienceZoom}×`}</strong><button className="secondary" disabled={zoomIndex === scienceZoomLevels.length - 1} onClick={() => setScienceZoom(scienceZoomLevels[Math.min(scienceZoomLevels.length - 1, zoomIndex + 1)])}>+</button><button className="secondary" onClick={() => { setScienceZoom(1); setScienceMapCenter(null); }}>FULL</button><button className="secondary" disabled={scienceMapCenter === null} onClick={() => setScienceMapCenter(null)}>CENTER SHIP</button><button className="secondary" disabled={!selectedContact} onClick={centerOnSelected}>CENTER SELECTED</button></div></div><TacticalPlot snapshot={snapshot} send={send} selectionMode="science" mapMode="science" zoom={scienceZoom} mapCenter={scienceMapCenter} onMapCenterChange={setScienceMapCenter} attentionIds={attentionContactIds} onSelection={acknowledgeContact}/></section>
    <section className="panel science-console"><h3>Contact Analysis • {selectedContact?.name ?? 'NO CONTACT SELECTED'}</h3>{selectedContact && !enemySelected && <div className="contact-selection-banner science"><span>{selectedContact.objectType.toUpperCase()} • {selectedContact.subtype}</span><strong>{selectedContact.disposition.toUpperCase()}</strong><small>{selectedContact.contactStatus ?? 'PASSIVE SENSOR RETURN'}</small></div>}{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order ${orderAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCaptainOrder(orderKey)}>CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()} {orderAttention && <small> • CLICK TO ACK</small>}</div>}<div className="scan-progress"><div className="scan-ring"><strong>{Math.round(sensor.scanProgress)}%</strong><span>SCAN</span></div></div><Meter label="Scan Resolution" value={sensor.scanProgress}/><div className="science-readouts"><div><span>IDENTITY</span><strong>{snapshot.enemy.name}</strong></div><div><span>CLASS</span><strong>{sensor.contactClass}</strong></div><div><span>WEAPONS</span><strong>{sensor.weaponsEstimate}</strong></div><div><span>SHIELDS</span><strong>{sensor.shieldEstimate}</strong></div><div><span>HULL</span><strong>{sensor.hullEstimate}</strong></div></div><button className="primary full" disabled={snapshot.missionStatus !== 'running' || !snapshot.enemy.alive || !enemySelected || sensor.intelLevel >= 2 || sensor.scanActive} onClick={() => send({ type: 'scanTarget' })}>{sensor.intelLevel >= 2 ? 'PRIMARY SCAN COMPLETE' : sensor.scanActive ? 'SCANNING…' : 'BEGIN ACTIVE SCAN'}</button></section>
    <section className={`panel tactical-analysis-panel ${sensor.systemsMapped ? 'complete' : ''} ${resultAttention ? `attention-pulse ${tacticalMilestone >= 2 ? 'attention-orange' : 'attention-yellow'}` : ''}`} onClick={() => setAckTacticalMilestone(tacticalMilestone)}>
      <div className="panel-title"><span>TACTICAL ANALYSIS</span><strong>{sensor.systemsMapped ? 'BEHAVIOR LINK ACTIVE' : `${Math.round(sensor.tacticalAnalysisProgress)}%`}</strong></div>
      <p className="muted compact-copy">Lock three spectral peaks from the hostile return. Peak two resolves shield resonance; peak three maps weapons geometry, identifies combat doctrine, and unlocks the live intent model.</p>
      <Meter label="Tactical Analysis" value={sensor.tacticalAnalysisProgress}/>
      {sensor.tacticalAnalysisActive && !sensor.systemsMapped && <div className="science-analysis-minigame"><div className="guidance-stage-row">{sensor.tacticalAnalysisGates.map((_, index) => <span key={index} className={index < sensor.tacticalAnalysisStage ? 'complete' : index === sensor.tacticalAnalysisStage ? 'active' : ''}>PEAK {index + 1}</span>)}</div><div className="timing-track science-analysis-track">{analysisGate !== undefined && <><div className="guidance-gate-zone" style={{left:`${analysisGate - 13}%`,width:'26%'}}/><div className="timing-center-line" style={{left:`${analysisGate}%`}}/></>}<div className="timing-marker science-marker" style={{left:`${sensor.tacticalAnalysisPhase}%`}}/></div><div className="science-analysis-readout"><span>PHASE <strong>{Math.round(sensor.tacticalAnalysisPhase)}</strong></span><span>LOCK <strong>{sensor.tacticalAnalysisStage + 1}/3</strong></span><span>FAULTS <strong>{sensor.tacticalAnalysisStrikes}</strong></span></div><button className="primary full" onClick={(event) => { event.stopPropagation(); send({type:'markTacticalAnalysis'}); }}>LOCK SPECTRAL PEAK</button></div>}
      <div className="science-tactical-results"><div className={sensor.shieldSolution ? 'resolved' : ''}><span>SHIELD RESONANCE</span><strong>{sensor.shieldSolution ? sensor.shieldFrequency : 'UNRESOLVED'}</strong><small>{sensor.shieldSolution ? 'TACTICAL +40% SHIELD COUPLING' : 'LOCKS AFTER PEAK 2'}</small></div><div className={sensor.systemsMapped ? 'resolved' : ''}><span>COMBAT MODEL</span><strong>{sensor.systemsMapped ? 'MAPPED' : 'UNRESOLVED'}</strong><small>{sensor.systemsMapped ? 'GEOMETRY + LIVE INTENT ENABLED' : 'LOCKS AFTER PEAK 3'}</small></div></div>
      {!sensor.tacticalAnalysisActive && <button className="primary full" disabled={snapshot.missionStatus !== 'running' || !snapshot.enemy.alive || !enemySelected || sensor.intelLevel < 2 || sensor.systemsMapped} onClick={() => send({type:'beginTacticalAnalysis'})}>{sensor.systemsMapped ? 'TACTICAL PROFILE COMPLETE' : sensor.intelLevel < 2 ? 'COMPLETE PRIMARY SCAN FIRST' : sensor.tacticalAnalysisProgress > 0 ? 'RESUME SPECTRAL ANALYSIS' : 'BEGIN SPECTRAL ANALYSIS'}</button>}
      {sensor.systemsMapped && <EnemyBehaviorIntel snapshot={snapshot}/>}
      {sensor.systemsMapped && <SurrenderVerificationPanel snapshot={snapshot} send={send}/>}
      {sensor.systemsMapped && <EnemySystemMap snapshot={snapshot}/>}
    </section>
  </main>;
}


function CommunicationsWorkbench({ snapshot, send }: Props) {
  const comms = snapshot.communications;
  const active = comms.transmissions.find((entry) => entry.id === comms.activeTransmissionId) ?? null;
  const communicationsOnline = snapshot.systems.communications > 0;
  const requiresSignalLock = !!active && active.status !== 'open' && active.status !== 'resolved';
  const requiresResponse = !!active && active.status === 'open' && active.responses.length > 0;
  const attention = !communicationsOnline ? 'attention-pulse attention-red' : requiresResponse ? 'attention-pulse attention-orange' : requiresSignalLock ? 'attention-pulse attention-yellow' : '';
  const stationExchangeRef = useRef<HTMLDivElement | null>(null);
  const outgoingHail = !!active && ['hail', 'distress'].includes(active.kind) && active.exchange[0]?.side === 'local';
  const workflow = requiresSignalLock ? 'decode' : active?.trafficClass === 'internal' ? 'internal' : outgoingHail ? 'hail' : 'received';
  const workflowLabel = workflow === 'decode' ? 'INBOUND SIGNAL • DECODE' : workflow === 'hail' ? 'OUTGOING HAIL • LIVE' : workflow === 'internal' ? 'INTERNAL TRAFFIC • REVIEW' : active ? 'INCOMING CHANNEL • LIVE' : 'RECEIVER STANDBY';
  useEffect(() => {
    const exchange = stationExchangeRef.current;
    if (exchange) exchange.scrollTop = exchange.scrollHeight;
  }, [active?.id, active?.exchange.length]);
  return <section className={`panel comms-signal-console comms-persistent-workbench ${attention}`}>
    <div className="panel-title"><span>ACTIVE CHANNEL WORKFLOW</span><strong>{!communicationsOnline ? 'ARRAY OFFLINE' : requiresResponse ? 'RESPONSE REQUIRED' : requiresSignalLock ? 'TUNE CARRIER' : active?.status === 'open' ? 'CHANNEL OPEN' : 'STANDBY'}</strong></div>
    {!communicationsOnline && <div className="comms-offline-warning"><strong>COMMUNICATIONS ARRAY OFFLINE</strong><span>Engineering restoration required before tuning, hailing, interception, or jamming.</span></div>}
    {active ? <>
      <div className={`comms-workflow-banner workflow-${workflow} traffic-${active.trafficClass}`}><div><span>{workflowLabel}</span><strong>{active.sourceName}</strong><small>{active.subject}</small></div><div><span>{active.encrypted ? 'ENCRYPTED CARRIER' : active.kind.toUpperCase()}</span><strong>{requiresSignalLock ? 'ALIGN + VERIFY' : active.status.toUpperCase()}</strong></div></div>
      {active.status !== 'open' && active.status !== 'resolved' ? <div className="comms-acquisition-workspace">
        <div className="signal-spectrum" aria-label="Frequency finder"><div className="spectrum-label"><span>FREQUENCY FINDER</span><strong>ALIGN GOLD CURSOR TO BLUE CARRIER</strong></div><div className="spectrum-noise"/><div className="carrier-peak" style={{left:`${active.frequency}%`}}/><div className="tuner-cursor" style={{left:`${active.tuner}%`}}><span>TUNER</span></div></div>
        <div className="comms-tuning-grid">
          <div className="comms-tuning-control"><div className="comms-control-row"><div><span>CARRIER TUNING</span><strong>{Math.round(active.tuner)}</strong></div><input type="range" min="0" max="100" value={active.tuner} onChange={(event) => send({type:'setCommsTuner', value:Number(event.target.value)})}/></div></div>
          <div className="comms-tuning-control"><div className="filter-scale"><span className="filter-target" style={{left:`${active.filterTarget}%`}}/><span className="filter-cursor" style={{left:`${active.filter}%`}}/></div><div className="comms-control-row"><div><span>NOISE FILTER</span><strong>{Math.round(active.filter)}</strong></div><input type="range" min="0" max="100" value={active.filter} onChange={(event) => send({type:'setCommsFilter', value:Number(event.target.value)})}/></div></div>
        </div>
        <div className="comms-acquisition-footer"><Meter label="Decode Quality" value={active.signalQuality}/><button className="primary" disabled={!communicationsOnline} onClick={() => send({type:'verifyCommsSignal'})}>{active.encrypted ? 'VERIFY + DECODE' : 'VERIFY CARRIER LOCK'}</button></div>
        <small className="comms-hint">DECODE PROCEDURE • Match both frequency and filter markers. This receives traffic; it does not hail the contact.</small>
      </div> : active.status === 'open' ? <div className="open-transmission comms-open-channel">
        <div className="open-channel-label">CHANNEL OPEN • QUALITY {active.signalQuality}% • {comms.viewscreenChannelTransmissionId === active.id ? 'MAIN VIEWSCREEN LINKED' : active.trafficClass === 'internal' ? 'INTERNAL CIRCUIT' : 'AUDIO / DATA CHANNEL'}</div>
        <div ref={stationExchangeRef} className="station-channel-exchange">{active.exchange.map((line, index) => <div key={`${line.side}-${index}`} className={`station-channel-line side-${line.side}`}><span>{line.side === 'local' ? 'OUR SHIP' : line.speaker.toUpperCase()}</span><p>{line.message}</p></div>)}</div>
        {active.responses.length > 0 && <><div className="comms-response-label">SELECT RESPONSE TONE</div><div className="structured-response-grid">{active.responses.map((response) => <button key={response.id} className={`response-tone-${response.tone ?? 'neutral'} ${response.tone === 'hostile' ? 'danger' : response.tone === 'positive' ? 'primary' : ''}`} onClick={() => send({type:'sendTransmissionResponse', transmissionId:active.id, responseId:response.id})}>{response.label}</button>)}</div></>}
        <button className="secondary full comms-close-channel" onClick={() => send({type:'closeTransmission', transmissionId:active.id})}>CLOSE CHANNEL / RETURN VIEWSCREEN</button>
      </div> : <div className="comms-idle"><strong>TRANSMISSION LOGGED</strong><span>Select another active channel from the queue.</span></div>}
    </> : <div className="comms-idle tall"><strong>RECEIVER STANDBY</strong><span>Select traffic from the queue or choose a contact to hail/intercept.</span></div>}
  </section>;
}

export function CommunicationsStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'communications');
  const comms = snapshot.communications;
  const selectedContact = snapshot.spaceObjects.find((object) => object.id === comms.selectedContactId) ?? null;
  const active = comms.transmissions.find((entry) => entry.id === comms.activeTransmissionId) ?? null;
  const ew = comms.electronicWarfare;
  const communicationsOnline = snapshot.systems.communications > 0;
  const contactOptions = snapshot.spaceObjects.filter((object) => object.selectable && ['ship', 'station', 'beacon'].includes(object.objectType));
  const enemySelected = selectedContact?.id === snapshot.enemy.id && selectedContact.identified;
  const hostileSelected = selectedContact?.id === snapshot.enemy.id && selectedContact.disposition === 'hostile' && selectedContact.identified;
  const surrender = snapshot.enemy.surrender;
  const selectedChannelActive = !!selectedContact && comms.transmissions.some((entry) => entry.sourceContactId === selectedContact.id && entry.status !== 'resolved' && ['hail', 'distress'].includes(entry.kind));
  const canHail = !!selectedContact && communicationsOnline && selectedContact.identified && ['ship', 'station', 'beacon'].includes(selectedContact.objectType) && !selectedChannelActive;
  const unresolvedCount = comms.transmissions.filter((entry) => entry.status !== 'resolved').length;
  const [acknowledgedTransmissions, setAcknowledgedTransmissions] = useState<Record<number, boolean>>({});
  const [ackCaptainOrder, setAckCaptainOrder] = useState('auto');
  const [ackInterceptIntel, setAckInterceptIntel] = useState('');
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false);
  const orderKey = assignment?.captainOrder ?? 'auto';
  const orderAttention = orderKey !== 'auto' && orderKey !== ackCaptainOrder;
  const interceptAttention = !!ew.interceptIntel && ew.interceptIntel !== ackInterceptIntel;
  const offlineAttention = !communicationsOnline && !offlineAcknowledged;
  useEffect(() => { if (orderKey === 'auto') setAckCaptainOrder('auto'); }, [orderKey]);
  useEffect(() => { if (communicationsOnline) setOfflineAcknowledged(false); }, [communicationsOnline]);
  const trafficAttentionColor = (trafficClass: string) => trafficClass === 'hostile' ? 'red' : trafficClass === 'friendly' ? 'green' : trafficClass === 'internal' ? 'yellow' : 'blue';
  const unacknowledgedCount = comms.transmissions.filter((entry) => entry.status !== 'resolved' && !acknowledgedTransmissions[entry.id]).length;
  const signalAction = !!active && active.status !== 'open' && active.status !== 'resolved';
  const responseAction = !!active && active.status === 'open' && active.responses.length > 0;
  const selectTransmission = (id: number) => {
    setAcknowledgedTransmissions((current) => ({ ...current, [id]: true }));
    send({type:'selectTransmission', transmissionId:id});
  };

  return <>
    <main className="station-grid communications-layout communications-depth-layout communications-command-layout">
      <div className="comms-alert-strip">
        <div className={unacknowledgedCount ? 'alerting urgent' : ''}><i/><span>INCOMING</span><strong>{unacknowledgedCount ? `${unacknowledgedCount} NEW` : 'CLEAR'}</strong></div>
        <div className={signalAction ? 'alerting' : ''}><i/><span>CARRIER</span><strong>{signalAction ? 'TUNING REQUIRED' : 'LOCKED / STANDBY'}</strong></div>
        <div className={responseAction ? 'alerting urgent' : ''}><i/><span>RESPONSE</span><strong>{responseAction ? 'ACTION REQUIRED' : 'NONE PENDING'}</strong></div>
        <div className={!communicationsOnline ? 'alerting danger' : comms.viewscreenChannelTransmissionId !== null ? 'linked' : ''}><i/><span>MAIN VIEW</span><strong>{!communicationsOnline ? 'ARRAY OFFLINE' : comms.viewscreenChannelTransmissionId !== null ? 'CHANNEL LINKED' : 'CAPTAIN DISPLAY'}</strong></div>
      </div>
      <section className="panel comms-traffic-queue">
        <div className="panel-title"><span>MESSAGE TRAFFIC</span><strong>{unresolvedCount} ACTIVE</strong></div>
        {assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order ${orderAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCaptainOrder(orderKey)}>CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()} {orderAttention && <small> • CLICK TO ACK</small>}</div>}
        <div className="comms-traffic-legend"><span className="hostile">HOSTILE</span><span className="neutral">NEUTRAL</span><span className="friendly">FRIENDLY</span><span className="internal">INTERNAL</span></div>
        <p className="muted compact-copy">Plain-language hails open directly. Only encrypted, coded, damaged, or intercepted traffic uses the frequency/decode workflow.</p>
        <div className="transmission-list">
          {comms.transmissions.length ? comms.transmissions.map((entry) => {
            const needsAck = entry.status !== 'resolved' && !acknowledgedTransmissions[entry.id];
            const openLabel = entry.trafficClass === 'internal' ? 'REVIEW / LOG' : entry.exchange[0]?.side === 'local' ? 'OUTGOING HAIL OPEN' : 'INCOMING CHANNEL OPEN';
            return <button key={entry.id} disabled={entry.status === 'resolved'} className={`transmission-card traffic-${entry.trafficClass} priority-${entry.priority} ${entry.id === comms.activeTransmissionId ? 'active' : ''} status-${entry.status} ${needsAck ? `attention-pulse attention-${trafficAttentionColor(entry.trafficClass)}` : ''}`} onClick={() => selectTransmission(entry.id)}>
              <div><span>{entry.trafficClass.toUpperCase()} • {entry.kind.toUpperCase()}</span><strong>{entry.sourceName}</strong></div>
              <p>{entry.subject}</p>
              <em>{entry.status === 'resolved' ? 'LOGGED' : needsAck ? 'CLICK TO ACK' : entry.status === 'open' ? openLabel : entry.status === 'tuning' ? 'DECODING / ACQUIRING' : 'DECODE REQUIRED'}</em>
            </button>;
          }) : <div className="comms-idle"><strong>NO PRIORITY TRAFFIC</strong><span>Monitoring civilian, emergency, fleet, and hostile bands.</span></div>}
        </div>
      </section>

      <div className={offlineAttention ? 'comms-workbench-wrap attention-pulse attention-red' : 'comms-workbench-wrap'} onClick={() => { if (!communicationsOnline) setOfflineAcknowledged(true); }}><CommunicationsWorkbench key={`${active?.id ?? 'idle'}-${active?.status ?? 'idle'}`} snapshot={snapshot} send={send}/></div>

      <section className={`panel comms-contact-panel ${interceptAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => { if (ew.interceptIntel) setAckInterceptIntel(ew.interceptIntel); }}>
        <div className="panel-title"><span>CONTACTS / ELECTRONIC WARFARE</span><strong>{selectedContact ? selectedContact.name.toUpperCase() : 'NO CONTACT'}</strong></div>
        <div className="comms-contact-list">{contactOptions.map((object) => <button key={object.id} className={`${comms.selectedContactId === object.id ? 'active' : ''} disposition-${object.disposition}`} onClick={() => send({type:'selectCommunicationsContact', contactId:object.id})}><span>{spaceObjectGlyph(object)} {object.name}</span><strong>{object.identified ? object.disposition.toUpperCase() : 'UNRESOLVED'}</strong><small>{object.subtype} • HAIL PRIORITY {object.hailPriority ?? 5}</small></button>)}</div>
        {selectedContact && <div className="selected-comms-contact"><span>SELECTED CONTACT • HAIL PRIORITY {selectedContact.hailPriority ?? 5}</span><strong>{selectedContact.name}</strong><small>{selectedContact.objectType.toUpperCase()} • {objectRange(snapshot, selectedContact).toFixed(1)} km • bearing {Math.round(objectBearing(snapshot, selectedContact)).toString().padStart(3,'0')}°</small></div>}
        {selectedContact?.id === snapshot.diplomacy.contactId && <div className={`comms-diplomacy-card phase-${snapshot.diplomacy.phase}`}><div><span>ENCOUNTER PROTOCOL</span><strong>{snapshot.diplomacy.phase.replace('-', ' ').toUpperCase()}</strong><em>{snapshot.diplomacy.weaponsHold ? 'WEAPONS HOLD' : 'WEAPONS RELEASED'}</em></div><small>{snapshot.diplomacy.initiatedBy ? `${snapshot.diplomacy.initiatedBy === 'player' ? 'USS PROTOTYPE' : selectedContact.name} INITIATED CONTACT • ` : ''}TRUST ${snapshot.diplomacy.trust}%</small>{snapshot.diplomacy.playerCommitment && <p><b>OUR COMMITMENT:</b> {snapshot.diplomacy.playerCommitment.description} • {snapshot.diplomacy.playerCommitment.status.toUpperCase()}{snapshot.diplomacy.playerCommitment.remainingSeconds !== null ? ` • ${Math.ceil(snapshot.diplomacy.playerCommitment.remainingSeconds)}s` : ''}</p>}{snapshot.diplomacy.contactCommitment && <p><b>THEIR COMMITMENT:</b> {snapshot.diplomacy.contactCommitment.description} • {snapshot.diplomacy.contactCommitment.status.toUpperCase()}{snapshot.diplomacy.contactCommitment.remainingSeconds !== null ? ` • ${Math.ceil(snapshot.diplomacy.contactCommitment.remainingSeconds)}s` : ''}</p>}</div>}
        {enemySelected && surrender.status !== 'unavailable' && <div className={`surrender-comms-card status-${surrender.status} ${surrender.demandAvailable ? 'attention-pulse attention-orange' : ''}`}><div><span>SURRENDER CHANNEL</span><strong>{surrender.status.toUpperCase()}</strong><em>{surrender.pressure === null ? 'SCIENCE DATA PENDING' : `PRESSURE ${surrender.pressure}%`}</em></div><p>{surrender.eligibilityReason ?? 'Monitoring hostile combat capability.'}</p>{surrender.demandAvailable && <button className="danger full" disabled={!communicationsOnline} onClick={() => send({type:'demandSurrender'})}>{surrender.status === 'refused' ? 'REPEAT SURRENDER DEMAND' : 'DEMAND SURRENDER'}</button>}{surrender.status === 'stalling' && <small>SCIENCE WARNING • MONITOR FOR REPAIR ACTIVITY</small>}{surrender.ceasefire && <small>CEASEFIRE ACTIVE • SCIENCE VERIFICATION REQUIRED</small>}</div>}
        {enemySelected && <div className="comms-targeting-link"><TargetLockPanel snapshot={snapshot} send={send}/></div>}
        <div className={`outbound-hail-block ${selectedChannelActive ? 'channel-active' : ''}`}><div><span>OUTGOING HAIL</span><small>{selectedChannelActive ? 'A hail or distress channel with this contact is already active.' : 'Opens a live two-way channel; no frequency decoding is required.'}</small></div><button className="primary" disabled={!canHail} onClick={() => send({type:'hailContact'})}>{selectedChannelActive ? 'CHANNEL ALREADY OPEN' : 'OPEN HAIL CHANNEL'}</button></div>
        {hostileSelected && <div className="communications-actions ew-action-buttons"><button disabled={!communicationsOnline || ew.interceptActive} onClick={() => send({type:'startCommsIntercept', contactId:selectedContact!.id})}>{ew.interceptActive ? 'INTERCEPTING…' : 'INTERCEPT / DECODE TRAFFIC'}</button><button className={ew.jammingActive && ew.jamTargetId === selectedContact!.id ? 'danger' : ''} disabled={!communicationsOnline} onClick={() => send({type:'toggleCommsJamming', contactId:ew.jammingActive && ew.jamTargetId === selectedContact!.id ? null : selectedContact!.id})}>{ew.jammingActive && ew.jamTargetId === selectedContact!.id ? 'STOP JAMMING' : 'JAM TARGET'}</button></div>}
        {hostileSelected && <div className="ew-status-grid"><div><span>INTERCEPT</span><strong>{ew.interceptActive ? `${Math.round(ew.interceptProgress)}%` : ew.interceptIntel ? 'INTEL ACQUIRED' : 'STANDBY'}</strong>{ew.interceptActive && <div className="mini-health-track"><div style={{width:pct(ew.interceptProgress)}}/></div>}</div><div><span>JAMMING</span><strong>{ew.jammingActive ? `${ew.jammingStrength}%` : 'OFF'}</strong><small>{ew.jammingActive ? 'DEGRADING HOSTILE TARGETING' : 'NO ACTIVE INTERFERENCE'}</small></div></div>}
        {ew.interceptIntel && <div className="intercept-intel"><span>INTERCEPT INTELLIGENCE</span><p>{ew.interceptIntel}</p></div>}
      </section>

      <BridgeCommsPanel snapshot={snapshot}/>
    </main>
  </>;
}


function PlayerShipGraphic() {
  return <svg viewBox="0 0 160 90" className="viewscreen-ship-svg" data-asset-slot="viewscreen-player-prototype" aria-hidden="true">
    <defs>
      <linearGradient id="shipHullGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#d9f4ff" />
        <stop offset="55%" stopColor="#7eb8dd" />
        <stop offset="100%" stopColor="#25475d" />
      </linearGradient>
      <linearGradient id="shipAccentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#4ed4ff" />
        <stop offset="100%" stopColor="#256d9b" />
      </linearGradient>
    </defs>
    <path d="M80 4 L114 28 L104 38 L146 56 L112 56 L98 88 L80 66 L62 88 L48 56 L14 56 L56 38 L46 28 Z" fill="url(#shipHullGrad)" stroke="#9fe5ff" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M80 16 L95 28 L86 43 L80 40 L74 43 L65 28 Z" fill="#0d1e2b" stroke="#78caef" strokeWidth="2"/>
    <path d="M46 57 H114" stroke="url(#shipAccentGrad)" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="80" cy="57" r="5" fill="#6ae2ff" opacity="0.9"/>
  </svg>;
}

function EnemyShipGraphic({ wave, identified, visual }: { wave: number; identified: boolean; visual: EnemyDamageVisualState }) {
  const profile = !identified ? 'unknown' : wave === 2 ? 'viper' : 'kestrel';
  const enginesOffline = visual.offlineSystems.includes('engines');
  const weaponsOffline = visual.offlineSystems.includes('weapons');
  const classes = `enemy-ship-visual profile-${profile} shield-${visual.shieldState} hull-${visual.hullState} ${enginesOffline ? 'engines-offline' : ''} ${weaponsOffline ? 'weapons-offline' : ''} ${visual.repairingSystem ? 'repair-active' : ''} ${visual.surrendered ? 'powering-down' : ''}`;
  return <div className={classes} data-asset-slot={`viewscreen-enemy-${profile}`}>
    {visual.shieldState !== 'unknown' && visual.shieldState !== 'down' && <div className="enemy-shield-envelope"/>}
    {!identified ? <svg viewBox="0 0 160 110" className="viewscreen-enemy-svg unresolved-enemy-svg" aria-hidden="true">
      <ellipse cx="80" cy="55" rx="54" ry="35" fill="rgba(142,190,215,.06)" stroke="#8fb9cd" strokeWidth="2" strokeDasharray="5 5"/>
      <path d="M80 13 108 39 132 56 104 64 92 94 80 78 68 94 56 64 28 56 52 39Z" fill="rgba(121,166,190,.08)" stroke="#9bc6d8" strokeWidth="2" strokeDasharray="4 3"/>
      <path d="M80 25V78M53 55H107" fill="none" stroke="#7eaabd" strokeWidth="1" opacity=".65"/>
      <circle cx="80" cy="55" r="9" fill="none" stroke="#b4d8e6" strokeWidth="1" opacity=".7"/>
    </svg> : wave === 2 ? <svg viewBox="0 0 160 110" className="viewscreen-enemy-svg" aria-hidden="true">
      <defs>
        <linearGradient id="enemyHullGradB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={identified ? '#ffd1d6' : '#c7959f'} />
          <stop offset="60%" stopColor="#c04d60" />
          <stop offset="100%" stopColor="#36131f" />
        </linearGradient>
      </defs>
      {!enginesOffline && <g className="enemy-engine-plumes"><path d="M65 70 71 100"/><path d="M95 70 89 100"/></g>}
      <path className="enemy-hull-shape" d="M80 8 L110 28 L144 48 L124 55 L148 72 L96 70 L80 102 L64 70 L12 72 L36 55 L16 48 L50 28 Z" fill="url(#enemyHullGradB)" stroke="#ff9caa" strokeWidth="3" strokeLinejoin="round"/>
      <path className="enemy-command-core" d="M80 24 L96 37 L91 56 L80 62 L69 56 L64 37 Z" fill="#20070d" stroke="#ff9db3" strokeWidth="2"/>
      <path className="enemy-weapon-line" d="M48 55 H112" stroke="#ff7c96" strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
      <circle cx="80" cy="55" r="5.2" fill="#ffdce2" opacity="0.95"/>
      {visual.hullState !== 'stable' && visual.hullState !== 'unknown' && <g className="enemy-hull-scars"><path d="M38 50 57 48 50 62 72 65"/><path d="M100 35 94 49 111 58"/></g>}
    </svg> : <svg viewBox="0 0 140 100" className="viewscreen-enemy-svg" aria-hidden="true">
      <defs>
      <linearGradient id="enemyHullGradA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={identified ? '#ffd2d8' : '#b4878d'} />
        <stop offset="55%" stopColor="#cc6571" />
        <stop offset="100%" stopColor="#3b1720" />
      </linearGradient>
      </defs>
      {!enginesOffline && <g className="enemy-engine-plumes"><path d="M57 68 62 94"/><path d="M83 68 78 94"/></g>}
      <path className="enemy-hull-shape" d="M70 8 L94 28 L126 44 L102 52 L116 72 L84 68 L70 92 L56 68 L24 72 L38 52 L14 44 L46 28 Z" fill="url(#enemyHullGradA)" stroke="#ff9aa6" strokeWidth="3" strokeLinejoin="round"/>
      <path className="enemy-command-core" d="M70 24 L82 34 L79 50 L70 57 L61 50 L58 34 Z" fill="#1b0810" stroke="#ff9bb2" strokeWidth="2"/>
      <circle cx="70" cy="50" r="4.5" fill="#ffdbe2" opacity="0.9"/>
      {visual.hullState !== 'stable' && visual.hullState !== 'unknown' && <g className="enemy-hull-scars"><path d="M34 47 52 49 45 61 63 65"/><path d="M87 31 82 47 99 55"/></g>}
    </svg>}
    {visual.hullState === 'critical' && <><i className="enemy-damage-spark spark-one"/><i className="enemy-damage-spark spark-two"/></>}
    {visual.repairingSystem && <div className="enemy-repair-orbit"><span>{visual.repairingSystem.toUpperCase()}</span></div>}
    {weaponsOffline && <div className="enemy-offline-flag weapons">WEAPONS OFFLINE</div>}
    {enginesOffline && <div className="enemy-offline-flag engines">ENGINES OFFLINE</div>}
  </div>;
}

function stageAlert(snapshot: GameSnapshot) {
  if (snapshot.missionStatus === 'victory') return { title: 'MISSION COMPLETE', detail: 'Relay lane secure. All hostiles neutralized.' };
  if (snapshot.missionStatus === 'defeat') return { title: 'HULL FAILURE', detail: 'The ship has been destroyed. Reset from Captain station.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'distress') return { title: 'CIVILIAN DISTRESS CALL', detail: 'CSV Meridian requests immediate assistance. Communications response required.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'rendezvous') return { title: 'RESCUE RENDEZVOUS', detail: 'Approach CSV Meridian and establish a close support position.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'assist') return { title: 'EMERGENCY SUPPORT', detail: `Aid transfer ${Math.round(snapshot.friendlyContact?.aidProgress ?? 0)}% complete.` };
  if (snapshot.missionStage === 'surrender') return { title: 'SURRENDER IN PROGRESS', detail: snapshot.enemy.surrender.status === 'verifying' ? `Science power-down verification ${Math.round(snapshot.enemy.surrender.verificationProgress)}% complete.` : 'Cease fire. Await Science verification of hostile weapons and propulsion.' };
  if (snapshot.missionStage === 'reinforcement') return { title: 'REINFORCEMENT CONTACT', detail: 'Long-range sensors report a second inbound hostile.' };
  if (snapshot.sensors.scanActive) return { title: 'ACTIVE SENSOR SWEEP', detail: `Science resolving contact • ${Math.round(snapshot.sensors.scanProgress)}% complete.` };
  if (snapshot.sensors.intelLevel === 0) return { title: 'UNKNOWN CONTACT', detail: 'No verified firing solution. Awaiting science identification.' };
  if (snapshot.diplomacy.weaponsHold && snapshot.diplomacy.phase === 'awaiting-contact') return { title: 'INITIAL CONTACT REQUIRED', detail: 'Communications must complete a hail before weapons engagement.' };
  if (snapshot.diplomacy.phase === 'channel-open') return { title: 'DIPLOMATIC CHANNEL OPEN', detail: 'Weapons held while Communications resolves the exchange.' };
  if (snapshot.diplomacy.phase === 'agreement') return { title: 'AGREEMENT ACTIVE', detail: snapshot.diplomacy.playerCommitment?.description ?? snapshot.diplomacy.contactCommitment?.description ?? 'Monitor mutual compliance.' };
  if (snapshot.missionStage === 'intercept') return { title: 'INTERCEPT COURSE', detail: 'Helm is maneuvering to engage the hostile contact.' };
  if (snapshot.missionStage === 'combat') return { title: 'WEAPONS ENGAGED', detail: 'Tactical engagement in progress.' };
  return { title: 'BRIDGE STATUS', detail: snapshot.currentObjective };
}

export function Viewscreen({ snapshot }: { snapshot: GameSnapshot }) {
  const [beamPulse, setBeamPulse] = useState(false);
  const [impactPulse, setImpactPulse] = useState(false);
  const [scanPing, setScanPing] = useState(false);
  const [playerImpactPulse, setPlayerImpactPulse] = useState<'shields' | 'hull' | null>(null);
  const [playerShake, setPlayerShake] = useState(false);
  const [enemyShockwave, setEnemyShockwave] = useState(false);
  const [victoryPulse, setVictoryPulse] = useState(false);
  const [torpedoTrails, setTorpedoTrails] = useState<Array<{ id: number; lane: number }>>([]);
  const previousRef = useRef<GameSnapshot | null>(null);
  const channelExchangeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    if (previous) {
      if (snapshot.ship.beamCharge < previous.ship.beamCharge - 18) {
        setBeamPulse(true);
        window.setTimeout(() => setBeamPulse(false), 360);
      }
      if (snapshot.ship.torpedoes < previous.ship.torpedoes) {
        const launches = Math.max(1, previous.ship.torpedoes - snapshot.ship.torpedoes);
        for (let i = 0; i < launches; i += 1) {
          const trail = { id: Date.now() + i + Math.random(), lane: i % 2 };
          setTorpedoTrails((current) => [...current, trail]);
          window.setTimeout(() => setTorpedoTrails((current) => current.filter((entry) => entry.id !== trail.id)), 1650);
        }
      }
      const previousEnemyIntegrity = (previous.enemy.hull ?? 0) + (previous.enemy.shields ?? 0);
      const currentEnemyIntegrity = (snapshot.enemy.hull ?? 0) + (snapshot.enemy.shields ?? 0);
      if (snapshot.enemy.alive && currentEnemyIntegrity < previousEnemyIntegrity) {
        setImpactPulse(true);
        window.setTimeout(() => setImpactPulse(false), 420);
      }
      if (snapshot.sensors.scanProgress > previous.sensors.scanProgress + 2) {
        setScanPing(true);
        window.setTimeout(() => setScanPing(false), 700);
      }
      if (snapshot.ship.shields < previous.ship.shields || snapshot.ship.hull < previous.ship.hull) {
        setPlayerImpactPulse(snapshot.ship.shields < previous.ship.shields ? 'shields' : 'hull');
        setPlayerShake(true);
        window.setTimeout(() => setPlayerImpactPulse(null), 560);
        window.setTimeout(() => setPlayerShake(false), 460);
      }
      if (previous.enemy.alive && !snapshot.enemy.alive) {
        setEnemyShockwave(true);
        window.setTimeout(() => setEnemyShockwave(false), 1100);
      }
      if (previous.missionStatus !== 'victory' && snapshot.missionStatus === 'victory') {
        setVictoryPulse(true);
        window.setTimeout(() => setVictoryPulse(false), 1800);
      }
    }
    previousRef.current = snapshot;
  }, [snapshot]);

  const mode = snapshot.viewscreenMode;
  const alert = stageAlert(snapshot);
  const currentRange = snapshot.friendlyContact ? Math.hypot(snapshot.ship.x - snapshot.friendlyContact.x, snapshot.ship.y - snapshot.friendlyContact.y) : range(snapshot);
  const bearing = useMemo(() => {
    const targetX = snapshot.friendlyContact?.x ?? snapshot.enemy.x;
    const targetY = snapshot.friendlyContact?.y ?? snapshot.enemy.y;
    return normalizeHeading(Math.atan2(targetX - snapshot.ship.x, targetY - snapshot.ship.y) * 180 / Math.PI);
  }, [snapshot.enemy.x, snapshot.enemy.y, snapshot.friendlyContact?.x, snapshot.friendlyContact?.y, snapshot.ship.x, snapshot.ship.y]);
  const cameraHeading = normalizeHeading(snapshot.ship.heading + (mode === 'aft' ? 180 : 0));
  const rawCameraBearing = ((bearing - cameraHeading + 540) % 360) - 180;
  const cameraBearing = clamp(rawCameraBearing, -75, 75);
  const contactAvailable = Boolean(snapshot.friendlyContact || snapshot.enemy.alive || enemyShockwave);
  const contactVisible = contactAvailable && Math.abs(rawCameraBearing) <= 96;
  const contactX = 50 + cameraBearing * .34;
  const contactY = clamp(52 - currentRange * .8, 20, 58);
  const contactScale = clamp(1.45 - currentRange * .025, .48, 1.28);
  const shipShieldPercent = Math.round(snapshot.ship.shields);
  const shipHullPercent = Math.round(snapshot.ship.hull);
  const enemyVisual = enemyDamageVisualState(snapshot.enemy);
  const enemyStatus = enemyVisualStatusLabel(snapshot.enemy, enemyVisual);
  const alertClass = snapshot.missionStatus === 'victory' ? 'victory' : snapshot.missionStatus === 'defeat' ? 'defeat' : snapshot.missionStage === 'surrender' ? 'surrender' : snapshot.missionStage === 'combat' || snapshot.missionStage === 'reinforcement' ? 'combat' : snapshot.sensors.scanActive ? 'scan' : 'neutral';
  const cinemaClass = [snapshot.ship.throttle > 65 && snapshot.missionStatus === 'running' ? 'high-throttle' : '', snapshot.sensors.scanActive ? 'scan-mode' : '', playerShake ? 'camera-shake' : '', playerImpactPulse ? `player-hit-${playerImpactPulse}` : '', snapshot.missionStatus === 'victory' ? 'victory-mode' : '', snapshot.missionStatus === 'defeat' ? 'defeat-mode' : '', snapshot.enemy.surrender.ceasefire ? 'surrender-mode' : ''].filter(Boolean).join(' ');
  const activeTransmission = snapshot.communications.transmissions.find((entry) => entry.id === snapshot.communications.viewscreenChannelTransmissionId)
    ?? snapshot.communications.transmissions.find((entry) => entry.id === snapshot.communications.activeTransmissionId)
    ?? snapshot.communications.transmissions.find((entry) => entry.status === 'open')
    ?? snapshot.communications.transmissions[0]
    ?? null;
  useEffect(() => {
    const exchange = channelExchangeRef.current;
    if (exchange) exchange.scrollTop = exchange.scrollHeight;
  }, [activeTransmission?.id, activeTransmission?.exchange.length]);
  const portraitId = captainPortraitForTransmission(activeTransmission, snapshot.enemy);
  const portraitProfile = portraitId === 'meridian'
    ? { src: meridianCaptainPortrait, name: 'CAPTAIN ELENA VOSS', vessel: 'CSV MERIDIAN', tone: 'civilian' }
    : portraitId === 'viper'
      ? { src: viperCommanderPortrait, name: 'COMMANDER VESKA', vessel: snapshot.enemy.name.toUpperCase(), tone: 'hostile' }
      : portraitId === 'kestrel'
        ? { src: kestrelCommanderPortrait, name: 'COMMANDER ROURKE', vessel: snapshot.enemy.name.toUpperCase(), tone: 'hostile' }
        : null;
  const signalResolved = activeTransmission?.status === 'open' || activeTransmission?.status === 'resolved';
  const missionSteps = snapshot.missionId === 'meridian-distress'
    ? ['briefing', 'distress', 'rendezvous', 'assist', 'victory']
    : ['briefing', 'investigate', 'intercept', 'combat', 'reinforcement', 'victory'];
  const currentMissionStep = Math.max(0, missionSteps.indexOf(snapshot.missionStage));
  const modeLabel = viewscreenModeOptions.find((option) => option.mode === mode)?.detail.toUpperCase() ?? mode.toUpperCase();

  const exteriorView = (mode === 'forward' || mode === 'aft') && <section className={`viewscreen-mode-surface viewscreen-cinema viewscreen-exterior mode-${mode} ${cinemaClass}`}>
    <div className="space-layer stars-near"/><div className="space-layer stars-mid"/><div className="space-layer stars-far"/><div className="space-layer nebula-cloud"/><div className="space-layer nebula-ribbon"/><div className="space-layer horizon-glow"/><div className="screen-vignette"/><div className="screen-scanlines"/>
    {mode === 'aft' && <div className="aft-camera-frame"><i/><i/></div>}
    {snapshot.ship.throttle > 65 && snapshot.missionStatus === 'running' && <div className="engine-streaks"/>}
    {snapshot.sensors.scanActive && <div className={`scan-sweep ${scanPing ? 'active' : ''}`}/>}
    {playerImpactPulse && <div className={`player-impact-flash ${playerImpactPulse}`}/>}
    {playerImpactPulse === 'shields' && <div className="shield-ripple-overlay"/>}
    {contactVisible && enemyShockwave && !snapshot.enemy.alive && <div className="enemy-shockwave" style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%` } as CSSProperties }/>}
    {contactVisible && beamPulse && snapshot.enemy.alive && <div className="beam-lance" style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%` } as CSSProperties }/>}
    {contactVisible && torpedoTrails.map((trail, index) => <div key={trail.id} className={`torpedo-trail lane-${trail.lane}`} style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%`, ['--trail-delay' as string]: `${index * 120}ms` } as CSSProperties }/>) }
    {contactVisible && (snapshot.friendlyContact || snapshot.enemy.alive) && <div className={`target-bracket tracked ${snapshot.friendlyContact ? 'civilian-track' : ''}`} style={{ left: `${contactX}%`, top: `${contactY}%` }}><span className="target-bracket-corner tl"/><span className="target-bracket-corner tr"/><span className="target-bracket-corner bl"/><span className="target-bracket-corner br"/></div>}
    {contactVisible && (snapshot.friendlyContact ? <div className="civilian-contact-layer" style={{ left: `${contactX}%`, top: `${contactY}%`, transform: `translate(-50%, -50%) scale(${contactScale})` }}><div className="civilian-contact-glyph">◇</div><div className="enemy-ship-caption"><strong>{snapshot.friendlyContact.name}</strong><span>{snapshot.friendlyContact.type.toUpperCase()} • {snapshot.friendlyContact.status.toUpperCase()}</span></div></div> : snapshot.enemy.alive ? <div className={`enemy-ship-layer intel-${snapshot.sensors.intelLevel} state-${snapshot.enemy.operationalState} ${impactPulse ? 'impacting' : ''} ${enemyVisual.surrendered ? 'surrendered' : ''}`} style={{ left: `${contactX}%`, top: `${contactY}%`, transform: `translate(-50%, -50%) scale(${contactScale}) rotate(${cameraBearing * .08}deg)` }}><EnemyShipGraphic wave={snapshot.enemy.wave} identified={snapshot.sensors.intelLevel >= 1} visual={enemyVisual}/><div className="enemy-ship-caption"><strong>{snapshot.enemy.name}</strong><span>{snapshot.sensors.intelLevel >= 1 ? snapshot.sensors.contactClass : 'UNRESOLVED SIGNATURE'}</span></div></div> : null)}
    {!contactVisible && contactAvailable && <div className={`viewscreen-offaxis-cue ${rawCameraBearing < 0 ? 'port' : 'starboard'}`}><span>CONTACT OUTSIDE {mode.toUpperCase()} CAMERA</span><strong>{rawCameraBearing < 0 ? 'PORT' : 'STARBOARD'} {Math.round(Math.abs(rawCameraBearing))}°</strong></div>}
  </section>;

  return <div className={`viewscreen-shell viewscreen-rotator stage-${snapshot.missionStage} graphics-pass graphics-pass-two graphics-pass-three graphics-pass-four ${victoryPulse ? 'victory-pulse' : ''}`}>
    <main className="viewscreen-main viewscreen-full-layout">
      <div className="viewscreen-live-surface">
        <div className="viewscreen-mode-badge"><span>USS PROTOTYPE • MAIN VIEWSCREEN</span><strong>{modeLabel}</strong></div>
        {mode !== 'mission' && <div className={`viewscreen-alert-overlay ${alertClass}`}><span>{alert.title}</span><strong>{alert.detail}</strong></div>}
        {exteriorView}
        {mode === 'tactical' && <section className="viewscreen-mode-surface viewscreen-radar-mode"><div className="radar-mode-heading"><span>TACTICAL RADAR</span><strong>LIVE SHARED SENSOR PLOT</strong></div><TacticalPlot snapshot={snapshot} large mapMode="tactical"/></section>}
        {mode === 'mission' && <section className={`viewscreen-mode-surface viewscreen-mission-mode status-${snapshot.missionStatus}`}>
          <div className="mission-mode-heading"><span>MISSION GOALS</span><strong>{alert.title}</strong><p>{snapshot.currentObjective}</p></div>
          <div className="mission-stage-route">{missionSteps.map((step, index) => <div key={step} className={`${index < currentMissionStep ? 'complete' : ''} ${index === currentMissionStep ? 'current' : ''}`}><i>{index < currentMissionStep ? '✓' : index + 1}</i><span>{step.toUpperCase()}</span></div>)}</div>
          <div className="mission-mode-grid"><div><span>STATUS</span><strong>{snapshot.missionStatus.toUpperCase()}</strong><small>{alert.detail}</small></div><div><span>SHIP READINESS</span><strong>{shipHullPercent}% HULL • {shipShieldPercent}% SHIELDS</strong><small>{snapshot.systems.engines <= 0 ? 'PROPULSION OFFLINE' : snapshot.systems.weapons <= 0 ? 'WEAPONS OFFLINE' : 'CORE SYSTEMS RESPONDING'}</small></div><div><span>ENCOUNTER</span><strong>{snapshot.missionId === 'signal-dark' ? `${snapshot.encounter}/2` : `${Math.round(snapshot.friendlyContact?.aidProgress ?? 0)}% AID`}</strong><small>{snapshot.missionId === 'signal-dark' ? 'HOSTILE CONTACT SEQUENCE' : 'CIVILIAN SUPPORT PROGRESS'}</small></div></div>
          <div className="mission-event-feed"><span>RECENT MISSION EVENTS</span>{snapshot.eventLog.slice(0, 4).map((event, index) => <p key={`${event}-${index}`}>{event}</p>)}</div>
        </section>}
        {mode === 'communications' && <section className={`viewscreen-mode-surface viewscreen-comms-mode ${activeTransmission ? `priority-${activeTransmission.priority} status-${activeTransmission.status}` : 'idle'}`}>
          {activeTransmission ? <div className="comms-viewscreen-grid">
            <div className={`comms-portrait-frame tone-${portraitProfile?.tone ?? 'unknown'} ${signalResolved ? 'resolved' : 'unresolved'}`}>{portraitProfile ? <img src={portraitProfile.src} alt={`${portraitProfile.name}, ${portraitProfile.vessel}`}/> : <div className="comms-portrait-placeholder"><span>⌁</span><strong>NON-VISUAL SIGNAL</strong></div>}<div className="comms-signal-bars"><i/><i/><i/><i/><i/></div></div>
            <article className="comms-channel-copy">
              <header><span>{activeTransmission.encrypted ? 'ENCRYPTED • ' : ''}{activeTransmission.kind.toUpperCase()} • {activeTransmission.status.toUpperCase()}</span><strong>{portraitProfile?.name ?? activeTransmission.sourceName.toUpperCase()}</strong><small>{portraitProfile?.vessel ?? activeTransmission.sourceName.toUpperCase()}</small></header>
              <h2>{activeTransmission.subject}</h2>
              <div ref={channelExchangeRef} className="viewscreen-channel-exchange">
                {signalResolved && activeTransmission.exchange.length ? activeTransmission.exchange.map((line, index) => <div key={`${line.side}-${index}`} className={`channel-exchange-line side-${line.side}`}><span>{line.side === 'local' ? 'USS PROTOTYPE' : line.speaker.toUpperCase()}</span><p>{line.message}</p></div>) : <div className="channel-exchange-unresolved">[ CARRIER UNRESOLVED — COMMUNICATIONS ACQUISITION IN PROGRESS ]</div>}
              </div>
              <footer><span>SIGNAL QUALITY {Math.round(activeTransmission.signalQuality)}%</span><strong>{activeTransmission.status === 'open' ? 'CHANNEL OPEN • COMMUNICATIONS CONTROL' : activeTransmission.status === 'resolved' ? 'CHANNEL CLOSED / LOGGED' : 'AWAITING COMMUNICATIONS LOCK'}</strong></footer>
            </article>
          </div> : <div className="comms-viewscreen-idle"><span>⌁</span><strong>NO ACTIVE SHIP-TO-SHIP CHANNEL</strong><p>Communications is monitoring priority, civilian, and hostile bands.</p></div>}
        </section>}
      </div>

      <div className={`viewscreen-bottom-dock mode-${mode}`}>
        <div className="dock-mode"><span>DISPLAY</span><strong>{modeLabel}</strong><small>CAPTAIN CONTROL</small></div>
        {(mode === 'forward' || mode === 'aft' || mode === 'tactical') && <><div><span>CONTACT</span><strong>{snapshot.friendlyContact?.name ?? (snapshot.enemy.alive ? snapshot.enemy.name : 'CLEAR SPACE')}</strong><small>{snapshot.friendlyContact ? snapshot.friendlyContact.status.toUpperCase() : snapshot.sensors.intelLevel >= 1 ? enemyStatus : 'SENSOR RESOLUTION PENDING'}</small></div><div><span>RANGE / BEARING</span><strong>{currentRange.toFixed(1)} km • {Math.round(bearing).toString().padStart(3, '0')}°</strong><small>{mode === 'tactical' ? `${snapshot.spaceObjects.filter((object) => object.alive).length} LIVE TRACKS` : contactVisible ? 'CONTACT IN FRAME' : `OUTSIDE ${mode.toUpperCase()} CAMERA`}</small></div>{!snapshot.friendlyContact && snapshot.enemy.alive && <div><span>TARGET SHIELD / HULL</span><strong>{snapshot.enemy.shields === null ? '---' : `${Math.round(snapshot.enemy.shields)}%`} / {snapshot.enemy.hull === null ? '---' : `${Math.round(snapshot.enemy.hull)}%`}</strong><small>{snapshot.sensors.systemsMapped && enemyVisual.offlineSystems.length ? `${enemyVisual.offlineSystems.join(' • ').toUpperCase()} OFFLINE` : 'SYSTEM MAP NOMINAL / PENDING'}</small></div>}</>}
        {mode === 'mission' && <div><span>CURRENT GOAL</span><strong>{snapshot.currentObjective}</strong><small>{snapshot.missionStage.toUpperCase()} • {snapshot.missionStatus.toUpperCase()}</small></div>}
        {mode === 'communications' && <div><span>ACTIVE CHANNEL</span><strong>{activeTransmission?.sourceName ?? 'STANDBY'}</strong><small>{activeTransmission ? `${activeTransmission.kind.toUpperCase()} • ${activeTransmission.status.toUpperCase()}` : 'NO PRIORITY TRAFFIC'}</small></div>}
        <div className="dock-ship-condition"><span>USS PROTOTYPE</span><strong>SHLD {shipShieldPercent}% • HULL {shipHullPercent}%</strong><small>HDG {Math.round(snapshot.ship.heading).toString().padStart(3, '0')}° • SPEED {snapshot.ship.speed.toFixed(1)} • THR {Math.round(snapshot.ship.throttle)}%</small></div>
      </div>
    </main>
  </div>;
}
