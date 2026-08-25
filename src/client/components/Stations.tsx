import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { ClientCommand, CrewOrder, EngineeringPuzzleState, GameSnapshot, HelmManeuver, OperationalRole, SpaceObjectState, SystemName, TacticalTarget } from '../../shared/protocol';

type Props = { snapshot: GameSnapshot; send: (command: ClientCommand) => void };
const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const range = (s: GameSnapshot) => Math.hypot(s.ship.x - s.enemy.x, s.ship.y - s.enemy.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;
const objectRange = (snapshot: GameSnapshot, object: SpaceObjectState) => Math.hypot(object.x - snapshot.ship.x, object.y - snapshot.ship.y);
const objectBearing = (snapshot: GameSnapshot, object: SpaceObjectState) => normalizeHeading(Math.atan2(object.x - snapshot.ship.x, object.y - snapshot.ship.y) * 180 / Math.PI);
const withinArc = (heading: number, bearing: number, arcDegrees: number) => arcDegrees >= 359.9 || Math.abs(((bearing - heading + 540) % 360) - 180) <= arcDegrees / 2;

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><div className="meter-label"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track"><div className="meter-fill" style={{ width: pct(value) }} /></div></div>;
}

function UnknownMeter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <div className="unknown-readout"><span>{label}</span><strong>UNKNOWN</strong></div>;
  return <Meter label={label} value={value} />;
}

function StationFocusOverlay({ title, status, accent = 'blue', onClose, children }: { title: string; status?: string; accent?: 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'teal'; onClose: () => void; children: ReactNode }) {
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
    {visibleObjects.map((object) => {
      const dx = object.x - effectiveCenter.x;
      const dy = object.y - effectiveCenter.y;
      const x = 50 + dx / scopeRange * plotRadius;
      const y = 50 - dy / scopeRange * plotRadius;
      const selected = selectedId === object.id;
      const canSelect = Boolean(selectionMode && send && object.selectable);
      const label = object.disposition === 'unknown' ? 'UNKNOWN' : object.name.toUpperCase();
      const className = `contact object-${object.objectType} ${object.disposition} ${selected ? 'selected-contact' : ''} ${canSelect ? 'selectable-contact' : ''} ${attentionIds.includes(object.id) ? 'attention-contact' : ''}`;
      const glyphStyle = object.disposition === 'player' ? { transform: `rotate(${snapshot.ship.heading}deg)` } : undefined;
      const content = <><span className={object.disposition === 'player' ? 'player-map-glyph' : ''} style={glyphStyle}>{spaceObjectGlyph(object)}</span><small>{label}</small></>;
      if (canSelect) {
        const commandType = selectionMode === 'science' ? 'selectScienceContact' : selectionMode === 'helm' ? 'selectHelmContact' : 'selectTacticalContact';
        return <button key={object.id} type="button" className={className} style={{ left: `${x}%`, top: `${y}%` }} onClick={(event) => { event.stopPropagation(); onSelection?.(object); send({ type: commandType, contactId: object.id } as ClientCommand); }}>{content}</button>;
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
      if (canSelect) return <button key={`edge-${object.id}`} className={className} style={{left:`${x}%`,top:`${y}%`}} onClick={() => { onSelection?.(object); send({type:'selectTacticalContact',contactId:object.id}); }}>{content}</button>;
      return <div key={`edge-${object.id}`} className={className} style={{left:`${x}%`,top:`${y}%`}}>{content}</div>;
    })}
    <div className="map-scope-label">{mode === 'science' && snapshot.shipCapabilities.stationSensors.scienceRange === null && zoom <= 1 ? 'FULL SENSOR MAP' : `${mode.toUpperCase()} SCOPE • ${scopeRange.toFixed(0)} km${mode === 'science' && zoom > 1 ? ` • ${zoom.toFixed(1).replace('.0','')}× ZOOM` : ''}`}{mode === 'science' && mapCenter ? ' • FREE PAN' : ''}{mode === 'helm' && send ? ' • CLICK MAP TO STEER' : ''}</div>
  </div>;
}

function MissionLog({ snapshot }: { snapshot: GameSnapshot }) {
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

type CaptainOverlay = 'navigation' | 'orders' | 'command' | 'comms' | 'log' | null;

export function CaptainStation({ snapshot, send }: Props) {
  const missionAttentionKey = `${snapshot.missionStage}|${snapshot.currentObjective}`;
  const [ackMissionKey, setAckMissionKey] = useState(snapshot.missionStatus === 'briefing' ? missionAttentionKey : '');
  const captainDamageSeverity = snapshot.ship.hull < 35 ? 3 : snapshot.ship.shields <= 0 || snapshot.ship.hull < 60 ? 2 : snapshot.ship.shields < 40 || snapshot.ship.hull < 85 ? 1 : 0;
  const [ackDamageSeverity, setAckDamageSeverity] = useState(0);
  const [overlay, setOverlay] = useState<CaptainOverlay>(null);
  const latestCommsKey = snapshot.commsLog[0]?.id ?? 'none';
  const [ackCommsKey, setAckCommsKey] = useState(latestCommsKey);
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
      <div className="captain-command-deck-heading"><div><span>COMMAND DECK</span><strong>FOCUSED CONTROLS</strong></div><small>Open detailed controls only when you need them.</small></div>
      <div className="captain-command-deck-actions">
        <button className={activeOrders ? 'captain-deck-button active' : 'captain-deck-button'} onClick={() => setOverlay('orders')}><span>CREW ORDERS</span><strong>{activeOrders ? `${activeOrders} ACTIVE` : 'STANDING ORDERS'}</strong><small>Helm • Tactical • Engineering • Science • Comms</small></button>
        <button className="captain-deck-button" onClick={() => setOverlay('command')}><span>COMMAND CONSOLE</span><strong>VOICE / TEXT</strong><small>Issue natural-language bridge orders</small></button>
        <button className={`captain-deck-button ${commsNeedsAck ? 'attention-pulse attention-yellow' : ''}`} onClick={openComms}><span>BRIDGE COMMS</span><strong>{latestComms ? latestComms.speaker.toUpperCase() : 'STANDBY'}</strong><small>{latestComms ? latestComms.message : 'No current bridge traffic'}</small></button>
        <button className="captain-deck-button" onClick={() => setOverlay('log')}><span>BRIDGE LOG</span><strong>{snapshot.eventLog.length} ENTRIES</strong><small>Review mission and ship events</small></button>
      </div>
    </section>
  </main>

  {overlay === 'navigation' && <StationFocusOverlay title="NAVIGATION ORDERS" status={activeNavTarget ? `TRACKING ${activeNavTarget.name.toUpperCase()}` : snapshot.captainHeadingOrder === null ? 'NO ACTIVE COURSE' : `${Math.round(snapshot.captainHeadingOrder).toString().padStart(3,'0')}° FIXED`} accent="yellow" onClose={() => setOverlay(null)}><CaptainHeadingOrderPanel snapshot={snapshot} send={send}/></StationFocusOverlay>}
  {overlay === 'orders' && <StationFocusOverlay title="CREW STANDING ORDERS" status={activeOrders ? `${activeOrders} ACTIVE` : 'ALL STATIONS AUTO'} accent="yellow" onClose={() => setOverlay(null)}><CaptainOrders snapshot={snapshot} send={send}/></StationFocusOverlay>}
  {overlay === 'command' && <StationFocusOverlay title="CAPTAIN COMMAND CONSOLE" status="VOICE / TEXT ORDERS" accent="yellow" onClose={() => setOverlay(null)}><CaptainCommandConsole send={send}/></StationFocusOverlay>}
  {overlay === 'comms' && <StationFocusOverlay title="BRIDGE COMMUNICATIONS" status={snapshot.commsLog.length ? `${snapshot.commsLog.length} MESSAGES` : 'STANDBY'} accent="yellow" onClose={() => setOverlay(null)}><BridgeCommsPanel snapshot={snapshot}/></StationFocusOverlay>}
  {overlay === 'log' && <StationFocusOverlay title="BRIDGE LOG" status={`${snapshot.eventLog.length} ENTRIES`} accent="yellow" onClose={() => setOverlay(null)}><MissionLog snapshot={snapshot}/></StationFocusOverlay>}
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
  const [showShipLog, setShowShipLog] = useState(false);
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
  const enemyManeuverLabel = snapshot.helm.enemyManeuver === 'attackRun' ? 'ATTACK RUN' : snapshot.helm.enemyManeuver === 'extend' ? 'EXTENDING' : snapshot.helm.enemyManeuver === 'reposition' ? 'REPOSITIONING' : snapshot.helm.enemyManeuver === 'approach' ? 'APPROACHING' : 'UNKNOWN';
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
    <section className="panel hero-panel helm-navigation-map"><div className="panel-title helm-map-title"><span>NAVIGATION / FLIGHT DIRECTOR</span><div className="helm-map-title-actions"><strong>{snapshot.shipCapabilities.stationSensors.helmRange} km SCOPE</strong><button className="secondary helm-log-button" onClick={() => setShowShipLog(true)}>SHIP LOG</button></div></div><TacticalPlot snapshot={snapshot} send={send} selectionMode="helm" mapMode="helm"/></section>
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
  {showShipLog && <StationFocusOverlay title="SHIP / BRIDGE LOG" status={`${snapshot.eventLog.length} ENTRIES`} accent="blue" onClose={() => setShowShipLog(false)}><MissionLog snapshot={snapshot}/></StationFocusOverlay>}
  </>
}

const tacticalTargets: TacticalTarget[] = ['hull', 'shields', 'weapons', 'engines', 'sensors', 'communications'];

function TargetLockPanel({ snapshot, send }: Props) {
  const target = snapshot.tactical.selectedTarget;
  const lock = snapshot.tactical.lock;
  if (target === 'hull') {
    return <section className="precision-lock-card idle"><div className="precision-lock-title"><span>PRECISION TARGETING</span><strong>GENERAL FIRE</strong></div><p>General hull fire requires no subsystem lock. Select a mapped enemy subsystem to begin precision alignment.</p></section>;
  }
  if (!snapshot.sensors.systemsMapped) {
    return <section className="precision-lock-card locked-out"><div className="precision-lock-title"><span>PRECISION TARGETING</span><strong>SCIENCE DATA REQUIRED</strong></div><p>Science must complete tactical subsystem mapping before precision targeting is available.</p></section>;
  }
  return <section className={`precision-lock-card status-${lock.status}`}>
    <div className="precision-lock-title"><span>PRECISION TARGETING • {target.toUpperCase()}</span><strong>{lock.status === 'locked' ? `${lock.quality}% LOCK` : lock.status.toUpperCase()}</strong></div>
    {lock.status === 'idle' && <button className="primary full" disabled={!snapshot.enemy.alive} onClick={() => send({type:'startTargetLock'})}>BEGIN PRECISION LOCK</button>}
    {lock.status === 'aligning' && <>
      <p className="muted compact-copy">Align each tracking channel inside ±8 of the Science-derived target value, then verify the solution.</p>
      <div className="lock-axis-stack">{lock.axes.map((axis) => <div className="lock-axis" key={axis.axis}>
        <div><span>{axis.axis.toUpperCase()}</span><strong>{Math.round(axis.value)} / TARGET {axis.target}</strong></div>
        <input type="range" min="0" max="100" value={axis.value} onChange={(e) => send({type:'setTargetLockAxis', axis:axis.axis, value:Number(e.target.value)})}/>
      </div>)}</div>
      <button className="primary full" onClick={() => send({type:'verifyTargetLock'})}>VERIFY ALIGNMENT</button>
      {lock.strikes > 0 && <div className="lock-strikes">ALIGNMENT FAULTS: {lock.strikes}</div>}
    </>}
    {lock.status === 'locked' && <div className="lock-confirmed"><strong>PRECISION SOLUTION LINKED</strong><span>Hits that penetrate the target's defenses will concentrate damage on {target.toUpperCase()}.</span><button className="secondary" onClick={() => send({type:'startTargetLock'})}>RECALIBRATE</button></div>}
  </section>;
}

function BeamTimingPanel({ snapshot, send }: Props) {
  const timing = snapshot.tactical.beamTiming;
  const ready = timing.status === 'synced';
  return <section className={`panel tactical-skill-panel beam-timing-panel ${ready ? 'ready' : ''}`}>
    <div className="panel-title"><span>BEAM CAPACITOR TIMING</span><strong>{ready ? `${timing.quality}% SYNC` : 'OPTIONAL BOOST'}</strong></div>
    <p className="muted compact-copy">Synchronize the beam discharge while the moving capacitor marker is inside the optimal window. A good sync boosts the <strong>next beam shot only</strong>; basic beam fire remains available without it.</p>
    <div className="timing-track beam-track">
      <div className="timing-sweet-zone" style={{left:`${timing.sweetSpot - timing.window}%`,width:`${timing.window * 2}%`}}/>
      <div className="timing-center-line" style={{left:`${timing.sweetSpot}%`}}/>
      <div className="timing-marker" style={{left:`${timing.phase}%`}}/>
    </div>
    <div className="tactical-skill-readouts"><span>CAPACITOR PHASE <strong>{Math.round(timing.phase)}</strong></span><span>FAULTS <strong>{timing.strikes}</strong></span><span>NEXT SHOT <strong>{ready ? `${timing.bonusMultiplier.toFixed(2)}×` : '1.00×'}</strong></span></div>
    {ready ? <div className="tactical-skill-ready"><strong>CAPACITOR SYNCHRONIZED</strong><span>Fire the beam to consume the timing bonus.</span></div> : <button className="primary full" disabled={!snapshot.enemy.alive || snapshot.systems.weapons <= 0 || snapshot.ship.beamCharge < 25} onClick={() => send({type:'syncBeamCapacitor'})}>SYNC CAPACITOR</button>}
  </section>;
}

function TorpedoGuidancePanel({ snapshot, send }: Props) {
  const guidance = snapshot.tactical.torpedoGuidance;
  const gate = guidance.gates[guidance.stage];
  const targetChanged = guidance.target !== snapshot.tactical.selectedTarget;
  return <section className={`panel tactical-skill-panel torpedo-guidance-panel status-${guidance.status}`}>
    <div className="panel-title"><span>TORPEDO GUIDANCE</span><strong>{guidance.status === 'ready' ? `${guidance.quality}% SOLUTION` : guidance.status.toUpperCase()}</strong></div>
    <p className="muted compact-copy">Build an optional three-point intercept solution. Mark each guidance gate when the moving flight cursor crosses it. The completed solution boosts the <strong>next torpedo</strong> and follows the currently selected target.</p>
    {guidance.status === 'idle' && <button className="primary full" disabled={!snapshot.enemy.alive || snapshot.systems.weapons <= 0 || snapshot.ship.torpedoes <= 0 || snapshot.sensors.intelLevel < 1} onClick={() => send({type:'startTorpedoGuidance'})}>OPEN GUIDANCE PACKAGE</button>}
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
    {targetChanged && guidance.status !== 'idle' && <div className="intel-warning">TARGET CHANGED — OPEN A NEW GUIDANCE PACKAGE</div>}
  </section>;
}

function TacticalSkillDock({ title, status, detail, ready = false, attention = false, onOpen }: { title: string; status: string; detail: string; ready?: boolean; attention?: boolean; onOpen: () => void }) {
  return <section className={`panel tactical-skill-dock ${ready ? 'ready' : ''} ${attention ? 'attention-pulse attention-orange' : ''}`}>
    <div className="panel-title"><span>{title}</span><strong>{status}</strong></div>
    <p>{detail}</p>
    <button className={ready ? 'primary full' : 'secondary full'} onClick={onOpen}>OPEN CONSOLE</button>
  </section>;
}

function TargetLockDock({ snapshot, onOpen, attention }: { snapshot: GameSnapshot; onOpen: () => void; attention: boolean }) {
  const target = snapshot.tactical.selectedTarget;
  const lock = snapshot.tactical.lock;
  const status = target === 'hull' ? 'GENERAL FIRE' : !snapshot.sensors.systemsMapped ? 'SCIENCE DATA REQUIRED' : lock.status === 'locked' ? `${lock.quality}% LOCK` : lock.status.toUpperCase();
  return <div className={`target-lock-dock ${attention ? 'attention-pulse attention-yellow' : ''}`}>
    <div><span>PRECISION TARGETING</span><strong>{status}</strong></div>
    <button className="secondary" disabled={target === 'hull'} onClick={onOpen}>{lock.status === 'locked' ? 'REVIEW / RECALIBRATE' : 'OPEN PRECISION CONSOLE'}</button>
  </div>;
}

export function TacticalStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'tactical');
  const shieldSolution = snapshot.sensors.shieldSolution;
  const selectedContact = snapshot.spaceObjects.find((object) => object.id === snapshot.stationSelections.tacticalContactId) ?? null;
  const hostileSelected = selectedContact?.id === snapshot.enemy.id && selectedContact.disposition === 'hostile';
  const selectedRange = selectedContact ? objectRange(snapshot, selectedContact) : Infinity;
  const selectedBearing = selectedContact ? objectBearing(snapshot, selectedContact) : 0;
  const beamInArc = selectedContact ? withinArc(snapshot.ship.heading, selectedBearing, snapshot.shipCapabilities.weapons.beamArcDegrees) : false;
  const torpedoInArc = selectedContact ? withinArc(snapshot.ship.heading, selectedBearing, snapshot.shipCapabilities.weapons.torpedoArcDegrees) : false;
  const inTacticalScope = selectedRange <= snapshot.shipCapabilities.stationSensors.tacticalRange;
  const beamAvailable = hostileSelected && selectedRange <= snapshot.shipCapabilities.weapons.beamRange && beamInArc;
  const torpedoAvailable = hostileSelected && selectedRange <= snapshot.shipCapabilities.weapons.torpedoRange && torpedoInArc;
  const [focusConsole, setFocusConsole] = useState<'lock' | 'beam' | 'torpedo' | null>(null);
  const [ackScienceMilestone, setAckScienceMilestone] = useState(0);
  const [ackCaptainOrder, setAckCaptainOrder] = useState('auto');
  const [ackLockKey, setAckLockKey] = useState('');
  const scienceMilestone = snapshot.sensors.systemsMapped ? 2 : shieldSolution ? 1 : 0;
  const orderKey = assignment?.captainOrder ?? 'auto';
  const lockKey = snapshot.sensors.systemsMapped && snapshot.tactical.selectedTarget !== 'hull' ? `${snapshot.enemy.id}|${snapshot.tactical.selectedTarget}` : '';
  const shieldAttention = scienceMilestone >= 1 && ackScienceMilestone < 1;
  const mapAttention = scienceMilestone >= 2 && ackScienceMilestone < 2;
  const orderAttention = orderKey !== 'auto' && orderKey !== ackCaptainOrder;
  const lockAttention = !!lockKey && snapshot.tactical.lock.status === 'idle' && ackLockKey !== lockKey;
  const guidanceTargetChanged = snapshot.tactical.torpedoGuidance.status !== 'idle' && snapshot.tactical.torpedoGuidance.target !== snapshot.tactical.selectedTarget;
  useEffect(() => { if (scienceMilestone === 0) setAckScienceMilestone(0); }, [scienceMilestone]);
  useEffect(() => { if (orderKey === 'auto') setAckCaptainOrder('auto'); }, [orderKey]);

  const openLock = () => { setAckScienceMilestone(Math.max(ackScienceMilestone, 2)); setAckLockKey(lockKey); setFocusConsole('lock'); };
  return <>
    <main className="station-grid tactical-layout tactical-teamwork-layout">
      <section className="panel hero-panel"><div className="panel-title"><span>WEAPONS TRACKING</span><strong>{snapshot.shipCapabilities.stationSensors.tacticalRange} km TACTICAL SCOPE</strong></div><TacticalPlot snapshot={snapshot} send={send} selectionMode="tactical" mapMode="tactical"/></section>
      <section className="panel tactical-fire-control"><div className="panel-title"><span>FIRE CONTROL</span><strong>{snapshot.tactical.weaponOutputMultiplier.toFixed(2)}× OUTPUT</strong></div>
        <h3>Selected Contact: {selectedContact?.name ?? 'NONE'}</h3>{selectedContact && <div className={`contact-selection-banner ${selectedContact.disposition}`}><span>{selectedContact.objectType.toUpperCase()} • {selectedContact.subtype}</span><strong>{selectedContact.disposition.toUpperCase()}</strong></div>}{selectedContact && !hostileSelected && <div className="intel-warning">{selectedContact.disposition === 'friendly' ? 'FRIENDLY CONTACT — WEAPONS INTERLOCK ACTIVE' : 'NO HOSTILE FIRING SOLUTION FOR SELECTED OBJECT'}</div>}
        {assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order ${orderAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCaptainOrder(orderKey)}>CAPTAIN ORDER: {assignment.captainOrder.replace(/([A-Z])/g, ' $1').toUpperCase()} {orderAttention && <small> • CLICK TO ACK</small>}</div>}
        <UnknownMeter label="Enemy Shields" value={snapshot.enemy.shields}/><UnknownMeter label="Enemy Hull" value={snapshot.enemy.hull}/>
        <div className={`science-link-card ${shieldSolution ? 'resolved' : 'pending'} ${shieldAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckScienceMilestone(Math.max(ackScienceMilestone, 1))}><div><span>SCIENCE SHIELD SOLUTION</span><strong>{shieldSolution ? snapshot.sensors.shieldFrequency : 'PENDING'}</strong></div><em>{shieldSolution ? `SHIELD COUPLING ${snapshot.tactical.shieldDamageMultiplier.toFixed(2)}×` : 'NORMAL SHIELD EFFECTIVENESS'}</em></div>
        {snapshot.enemy.alive && snapshot.sensors.intelLevel < 1 && <div className="intel-warning">SCIENCE IDENTIFICATION REQUIRED FOR FIRING SOLUTION</div>}
        {hostileSelected && !inTacticalScope && <div className="intel-warning">HOSTILE OUTSIDE TACTICAL SCOPE • EDGE BEARING ONLY</div>}
        {hostileSelected && <div className="weapon-geometry-status"><div><span>TARGET RANGE / BEARING</span><strong>{selectedRange.toFixed(1)} km • {Math.round(selectedBearing).toString().padStart(3,'0')}°</strong></div><div className={beamAvailable ? 'available' : 'blocked'}><span>BEAM GEOMETRY</span><strong>{beamAvailable ? 'IN FIRING ENVELOPE' : selectedRange > snapshot.shipCapabilities.weapons.beamRange ? 'OUT OF RANGE' : 'OUTSIDE FIRING ARC'}</strong></div><div className={torpedoAvailable ? 'available' : 'blocked'}><span>TORPEDO GEOMETRY</span><strong>{torpedoAvailable ? 'IN FIRING ENVELOPE' : selectedRange > snapshot.shipCapabilities.weapons.torpedoRange ? 'OUT OF RANGE' : 'OUTSIDE LAUNCH ARC'}</strong></div></div>}
        <div className="weapon-grid"><button className={`weapon-button ${snapshot.tactical.beamTiming.status === 'synced' ? 'skill-ready' : ''}`} disabled={snapshot.ship.beamCharge < 25 || !snapshot.enemy.alive || !beamAvailable || snapshot.sensors.intelLevel < 1 || snapshot.systems.weapons <= 0} onClick={() => send({type:'fireBeam'})}><span>BEAM ARRAY</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong><small>25% capacitor • {snapshot.shipCapabilities.weapons.beamRange} km • {snapshot.shipCapabilities.weapons.beamArcDegrees}° arc • output {snapshot.tactical.weaponOutputMultiplier.toFixed(2)}×{snapshot.tactical.beamTiming.status === 'synced' ? ` • timing ${snapshot.tactical.beamTiming.bonusMultiplier.toFixed(2)}×` : ''}</small></button><button className={`weapon-button torpedo ${snapshot.tactical.torpedoGuidance.status === 'ready' ? 'skill-ready' : ''}`} disabled={snapshot.ship.torpedoes <= 0 || !snapshot.enemy.alive || !torpedoAvailable || snapshot.sensors.intelLevel < 1 || snapshot.systems.weapons <= 0} onClick={() => send({type:'fireTorpedo'})}><span>TORPEDO</span><strong>{snapshot.ship.torpedoes}</strong><small>{snapshot.shipCapabilities.weapons.torpedoRange} km • {snapshot.shipCapabilities.weapons.torpedoArcDegrees}° arc • warhead output {snapshot.tactical.weaponOutputMultiplier.toFixed(2)}×{snapshot.tactical.torpedoGuidance.status === 'ready' ? ` • guidance ${snapshot.tactical.torpedoGuidance.bonusMultiplier.toFixed(2)}×` : ''}</small></button></div>
      </section>
      <section className={`panel tactical-targeting-panel ${mapAttention ? 'attention-pulse attention-orange' : ''}`} onClick={() => { if (mapAttention) setAckScienceMilestone(2); }}><div className="panel-title"><span>SUBSYSTEM TARGETING</span><strong>{snapshot.sensors.systemsMapped ? 'MAP LINKED' : 'AWAITING SCIENCE'}</strong></div><div className="enemy-system-target-grid">{tacticalTargets.map((target) => {
        const mappedHealth = target === 'hull' ? snapshot.enemy.hull : snapshot.enemy.systems[target];
        const disabled = target !== 'hull' && !snapshot.sensors.systemsMapped;
        return <button key={target} disabled={disabled || !snapshot.enemy.alive || !hostileSelected} className={`${snapshot.tactical.selectedTarget === target ? 'active' : ''} ${mappedHealth === 0 ? 'disabled-system' : ''}`} onClick={() => send({type:'selectEnemyTarget',target})}><span>{target.toUpperCase()}</span><strong>{mappedHealth === null ? 'UNKNOWN' : `${Math.round(mappedHealth)}%`}</strong>{target !== 'hull' && <small>{disabled ? 'SCIENCE MAP REQUIRED' : mappedHealth === 0 ? 'DISABLED' : 'TARGETABLE'}</small>}</button>;
      })}</div><TargetLockDock snapshot={snapshot} onOpen={openLock} attention={lockAttention}/></section>
      <TacticalSkillDock title="BEAM CAPACITOR" status={snapshot.tactical.beamTiming.status === 'synced' ? `${snapshot.tactical.beamTiming.quality}% SYNC` : 'OPTIONAL BOOST'} detail={snapshot.tactical.beamTiming.status === 'synced' ? `Next beam ${snapshot.tactical.beamTiming.bonusMultiplier.toFixed(2)}×.` : 'Open the timing console when you have bandwidth for a stronger next beam shot.'} ready={snapshot.tactical.beamTiming.status === 'synced'} onOpen={() => setFocusConsole('beam')}/>
      <TacticalSkillDock title="TORPEDO GUIDANCE" status={snapshot.tactical.torpedoGuidance.status === 'ready' ? `${snapshot.tactical.torpedoGuidance.quality}% SOLUTION` : snapshot.tactical.torpedoGuidance.status.toUpperCase()} detail={guidanceTargetChanged ? 'Selected target changed. Guidance package must be recalculated.' : snapshot.tactical.torpedoGuidance.status === 'ready' ? `Next torpedo ${snapshot.tactical.torpedoGuidance.bonusMultiplier.toFixed(2)}×.` : 'Open the guidance console to build a three-gate intercept solution.'} ready={snapshot.tactical.torpedoGuidance.status === 'ready'} attention={guidanceTargetChanged} onOpen={() => setFocusConsole('torpedo')}/>
      <MissionLog snapshot={snapshot}/>
    </main>
    {focusConsole === 'lock' && <StationFocusOverlay title="Precision Targeting" status={snapshot.tactical.selectedTarget.toUpperCase()} accent="red" onClose={() => setFocusConsole(null)}><TargetLockPanel snapshot={snapshot} send={send}/></StationFocusOverlay>}
    {focusConsole === 'beam' && <StationFocusOverlay title="Beam Capacitor Timing" status={`${Math.round(snapshot.ship.beamCharge)}% CHARGE`} accent="red" onClose={() => setFocusConsole(null)}><BeamTimingPanel snapshot={snapshot} send={send}/></StationFocusOverlay>}
    {focusConsole === 'torpedo' && <StationFocusOverlay title="Torpedo Guidance" status={`${snapshot.ship.torpedoes} TORPEDOES`} accent="red" onClose={() => setFocusConsole(null)}><TorpedoGuidancePanel snapshot={snapshot} send={send}/></StationFocusOverlay>}
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

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
      <MissionLog snapshot={snapshot}/>
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
    <section className={`panel tactical-analysis-panel ${sensor.systemsMapped ? 'complete' : ''} ${resultAttention ? `attention-pulse ${tacticalMilestone >= 2 ? 'attention-orange' : 'attention-yellow'}` : ''}`} onClick={() => setAckTacticalMilestone(tacticalMilestone)}><div className="panel-title"><span>TACTICAL ANALYSIS</span><strong>{sensor.systemsMapped ? 'WEAPONS LINK ACTIVE' : `${Math.round(sensor.tacticalAnalysisProgress)}%`}</strong></div><p className="muted compact-copy">Primary scan unlocks deeper tactical analysis. Shield resonance resolves at 45%; subsystem geometry at 100%.</p><Meter label="Tactical Analysis" value={sensor.tacticalAnalysisProgress}/><div className="science-tactical-results"><div className={sensor.shieldSolution ? 'resolved' : ''}><span>SHIELD RESONANCE</span><strong>{sensor.shieldSolution ? sensor.shieldFrequency : 'UNRESOLVED'}</strong><small>{sensor.shieldSolution ? 'TACTICAL +40% SHIELD COUPLING' : 'RESOLVES AT 45%'}</small></div><div className={sensor.systemsMapped ? 'resolved' : ''}><span>SUBSYSTEM GEOMETRY</span><strong>{sensor.systemsMapped ? 'MAPPED' : 'UNRESOLVED'}</strong><small>{sensor.systemsMapped ? 'PRECISION TARGETING ENABLED' : 'RESOLVES AT 100%'}</small></div></div><button className="primary full" disabled={snapshot.missionStatus !== 'running' || !snapshot.enemy.alive || !enemySelected || sensor.intelLevel < 2 || sensor.systemsMapped || sensor.tacticalAnalysisActive} onClick={() => send({type:'beginTacticalAnalysis'})}>{sensor.systemsMapped ? 'TACTICAL PROFILE COMPLETE' : sensor.tacticalAnalysisActive ? 'ANALYZING…' : sensor.intelLevel < 2 ? 'COMPLETE PRIMARY SCAN FIRST' : 'BEGIN TACTICAL ANALYSIS'}</button>{sensor.systemsMapped && <div className="enemy-system-map"><h4>ENEMY SYSTEM MAP</h4>{(Object.entries(snapshot.enemy.systems) as Array<[SystemName, number | null]>).map(([system,health]) => <div key={system}><span>{system.toUpperCase()}</span><strong>{health === null ? 'UNKNOWN' : `${Math.round(health)}%`}</strong><div className="mini-health-track"><div style={{width:pct(health ?? 0)}}/></div></div>)}</div>}</section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}


function CommunicationsWorkbench({ snapshot, send }: Props) {
  const comms = snapshot.communications;
  const active = comms.transmissions.find((entry) => entry.id === comms.activeTransmissionId) ?? null;
  const communicationsOnline = snapshot.systems.communications > 0;
  return <section className="panel comms-signal-console focused-workbench">
    <div className="panel-title"><span>SIGNAL ACQUISITION / CHANNEL</span><strong>{communicationsOnline ? (active ? active.status.toUpperCase() : 'STANDBY') : 'COMMS OFFLINE'}</strong></div>
    {!communicationsOnline && <div className="comms-offline-warning"><strong>COMMUNICATIONS ARRAY OFFLINE</strong><span>Engineering restoration required before tuning, hailing, interception, or jamming.</span></div>}
    {active ? <>
      <div className="comms-active-header"><span>{active.encrypted ? 'ENCRYPTED / ' : ''}{active.kind.toUpperCase()}</span><h2>{active.sourceName}</h2><p>{active.subject}</p></div>
      {active.status !== 'open' && active.status !== 'resolved' ? <>
        <div className="signal-spectrum" aria-label="Signal spectrum"><div className="spectrum-noise"/><div className="carrier-peak" style={{left:`${active.frequency}%`}}/><div className="tuner-cursor" style={{left:`${active.tuner}%`}}><span>TUNER</span></div></div>
        <div className="comms-control-row"><div><span>CARRIER TUNING</span><strong>{Math.round(active.tuner)}</strong></div><input type="range" min="0" max="100" value={active.tuner} onChange={(event) => send({type:'setCommsTuner', value:Number(event.target.value)})}/></div>
        <div className="filter-alignment"><div className="filter-scale"><span className="filter-target" style={{left:`${active.filterTarget}%`}}/><span className="filter-cursor" style={{left:`${active.filter}%`}}/></div><div className="comms-control-row"><div><span>NOISE FILTER</span><strong>{Math.round(active.filter)}</strong></div><input type="range" min="0" max="100" value={active.filter} onChange={(event) => send({type:'setCommsFilter', value:Number(event.target.value)})}/></div></div>
        <Meter label="Signal Quality" value={active.signalQuality}/>
        <button className="primary full" disabled={!communicationsOnline} onClick={() => send({type:'verifyCommsSignal'})}>{active.encrypted ? 'LOCK + DECODE CARRIER' : 'LOCK CARRIER'}</button>
        <small className="comms-hint">Align the tuner with the spectrum peak and center the filter cursor on the diagnostic notch. Encrypted traffic requires a cleaner lock.</small>
      </> : <div className="open-transmission"><div className="open-channel-label">CHANNEL OPEN • QUALITY {active.signalQuality}%</div><blockquote>{active.message}</blockquote>{active.responses.length > 0 && active.status !== 'resolved' && <div className="structured-response-grid">{active.responses.map((response) => <button key={response.id} className={response.id === 'decline' ? 'danger' : response.id === 'acknowledge' ? 'primary' : ''} onClick={() => send({type:'sendTransmissionResponse', transmissionId:active.id, responseId:response.id})}>{response.label}</button>)}</div>}</div>}
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
  const hostileSelected = selectedContact?.id === snapshot.enemy.id && selectedContact.disposition === 'hostile' && selectedContact.identified;
  const canHail = !!selectedContact && communicationsOnline && selectedContact.identified && ['ship', 'station', 'beacon'].includes(selectedContact.objectType);
  const unresolvedCount = comms.transmissions.filter((entry) => entry.status !== 'resolved').length;
  const [signalOverlayOpen, setSignalOverlayOpen] = useState(false);
  const [acknowledgedTransmissions, setAcknowledgedTransmissions] = useState<Record<string, boolean>>({});
  const [ackCaptainOrder, setAckCaptainOrder] = useState('auto');
  const [ackInterceptIntel, setAckInterceptIntel] = useState('');
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false);
  const orderKey = assignment?.captainOrder ?? 'auto';
  const orderAttention = orderKey !== 'auto' && orderKey !== ackCaptainOrder;
  const interceptAttention = !!ew.interceptIntel && ew.interceptIntel !== ackInterceptIntel;
  const offlineAttention = !communicationsOnline && !offlineAcknowledged;
  useEffect(() => { if (orderKey === 'auto') setAckCaptainOrder('auto'); }, [orderKey]);
  useEffect(() => { if (communicationsOnline) setOfflineAcknowledged(false); }, [communicationsOnline]);
  const priorityColor = (priority: string) => priority === 'urgent' ? 'red' : priority === 'hostile' ? 'orange' : 'yellow';
  const selectTransmission = (id: string) => {
    setAcknowledgedTransmissions((current) => ({ ...current, [id]: true }));
    setSignalOverlayOpen(false);
    send({type:'selectTransmission', transmissionId:id});
  };

  return <>
    <main className="station-grid communications-layout communications-depth-layout">
      <section className="panel comms-traffic-queue">
        <div className="panel-title"><span>TRANSMISSION QUEUE</span><strong>{unresolvedCount} ACTIVE</strong></div>
        {assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className={`incoming-order ${orderAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => setAckCaptainOrder(orderKey)}>CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()} {orderAttention && <small> • CLICK TO ACK</small>}</div>}
        <p className="muted compact-copy">New traffic flashes until selected. Selection acknowledges it without forcing a work console over whatever you are doing.</p>
        <div className="transmission-list">
          {comms.transmissions.length ? comms.transmissions.map((entry) => {
            const needsAck = entry.status !== 'resolved' && !acknowledgedTransmissions[entry.id];
            return <button key={entry.id} disabled={entry.status === 'resolved'} className={`transmission-card priority-${entry.priority} ${entry.id === comms.activeTransmissionId ? 'active' : ''} status-${entry.status} ${needsAck ? `attention-pulse attention-${priorityColor(entry.priority)}` : ''}`} onClick={() => selectTransmission(entry.id)}>
              <div><span>{entry.priority.toUpperCase()} • {entry.kind.toUpperCase()}</span><strong>{entry.sourceName}</strong></div>
              <p>{entry.subject}</p>
              <em>{entry.status === 'resolved' ? 'LOGGED' : needsAck ? 'CLICK TO ACK' : entry.status === 'open' ? 'CHANNEL OPEN' : entry.status === 'tuning' ? 'ACQUIRING' : 'ACKNOWLEDGED'}</em>
            </button>;
          }) : <div className="comms-idle"><strong>NO PRIORITY TRAFFIC</strong><span>Monitoring civilian, emergency, fleet, and hostile bands.</span></div>}
        </div>
      </section>

      <section className={`panel comms-signal-dock ${offlineAttention ? 'attention-pulse attention-red' : ''}`} onClick={() => { if (!communicationsOnline) setOfflineAcknowledged(true); }}>
        <div className="panel-title"><span>ACTIVE COMMUNICATIONS</span><strong>{communicationsOnline ? (active ? active.status.toUpperCase() : 'STANDBY') : 'ARRAY OFFLINE'}</strong></div>
        {!communicationsOnline ? <div className="comms-offline-warning compact"><strong>COMMUNICATIONS ARRAY OFFLINE</strong><span>Engineering restoration required.</span></div> : active ? <>
          <div className="comms-active-summary"><div><span>{active.encrypted ? 'ENCRYPTED / ' : ''}{active.kind.toUpperCase()}</span><strong>{active.sourceName}</strong><small>{active.subject}</small></div><div><span>SIGNAL</span><strong>{Math.round(active.signalQuality)}%</strong><small>{active.status === 'open' ? 'CHANNEL OPEN' : active.status === 'resolved' ? 'LOGGED' : 'WORK REQUIRED'}</small></div></div>
          <button className={active.status === 'open' && active.responses.length > 0 ? 'primary full' : 'secondary full'} disabled={active.status === 'resolved'} onClick={(event) => { event.stopPropagation(); setSignalOverlayOpen(true); }}>{active.status === 'open' && active.responses.length > 0 ? 'OPEN CHANNEL / RESPOND' : active.status === 'resolved' ? 'TRANSMISSION LOGGED' : 'OPEN SIGNAL CONSOLE'}</button>
        </> : <div className="comms-idle"><strong>RECEIVER STANDBY</strong><span>Select a queued transmission or hail a contact.</span></div>}
      </section>

      <section className={`panel comms-contact-panel ${interceptAttention ? 'attention-pulse attention-yellow' : ''}`} onClick={() => { if (ew.interceptIntel) setAckInterceptIntel(ew.interceptIntel); }}>
        <div className="panel-title"><span>CONTACTS / ELECTRONIC WARFARE</span><strong>{selectedContact ? selectedContact.name.toUpperCase() : 'NO CONTACT'}</strong></div>
        <div className="comms-contact-list">{contactOptions.map((object) => <button key={object.id} className={`${comms.selectedContactId === object.id ? 'active' : ''} disposition-${object.disposition}`} onClick={() => send({type:'selectCommunicationsContact', contactId:object.id})}><span>{spaceObjectGlyph(object)} {object.name}</span><strong>{object.identified ? object.disposition.toUpperCase() : 'UNRESOLVED'}</strong><small>{object.subtype}</small></button>)}</div>
        {selectedContact && <div className="selected-comms-contact"><span>SELECTED CONTACT</span><strong>{selectedContact.name}</strong><small>{selectedContact.objectType.toUpperCase()} • {objectRange(snapshot, selectedContact).toFixed(1)} km • bearing {Math.round(objectBearing(snapshot, selectedContact)).toString().padStart(3,'0')}°</small></div>}
        <div className="communications-actions"><button className="primary" disabled={!canHail} onClick={() => send({type:'hailContact'})}>HAIL SELECTED</button>{hostileSelected && <button disabled={!communicationsOnline || ew.interceptActive} onClick={() => send({type:'startCommsIntercept', contactId:selectedContact!.id})}>{ew.interceptActive ? 'INTERCEPTING…' : 'INTERCEPT TRAFFIC'}</button>}{hostileSelected && <button className={ew.jammingActive && ew.jamTargetId === selectedContact!.id ? 'danger' : ''} disabled={!communicationsOnline} onClick={() => send({type:'toggleCommsJamming', contactId:ew.jammingActive && ew.jamTargetId === selectedContact!.id ? null : selectedContact!.id})}>{ew.jammingActive && ew.jamTargetId === selectedContact!.id ? 'STOP JAMMING' : 'JAM TARGET'}</button>}</div>
        {hostileSelected && <div className="ew-status-grid"><div><span>INTERCEPT</span><strong>{ew.interceptActive ? `${Math.round(ew.interceptProgress)}%` : ew.interceptIntel ? 'INTEL ACQUIRED' : 'STANDBY'}</strong>{ew.interceptActive && <div className="mini-health-track"><div style={{width:pct(ew.interceptProgress)}}/></div>}</div><div><span>JAMMING</span><strong>{ew.jammingActive ? `${ew.jammingStrength}%` : 'OFF'}</strong><small>{ew.jammingActive ? 'DEGRADING HOSTILE TARGETING' : 'NO ACTIVE INTERFERENCE'}</small></div></div>}
        {ew.interceptIntel && <div className="intercept-intel"><span>INTERCEPT INTELLIGENCE</span><p>{ew.interceptIntel}</p></div>}
      </section>

      <BridgeCommsPanel snapshot={snapshot}/>
      <MissionLog snapshot={snapshot}/>
    </main>
    {signalOverlayOpen && active && <StationFocusOverlay title="Communications Workbench" status={active.sourceName.toUpperCase()} accent="purple" onClose={() => setSignalOverlayOpen(false)}><CommunicationsWorkbench snapshot={snapshot} send={send}/></StationFocusOverlay>}
  </>;
}


function PlayerShipGraphic() {
  return <svg viewBox="0 0 160 90" className="viewscreen-ship-svg" aria-hidden="true">
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

function EnemyShipGraphic({ wave, identified }: { wave: number; identified: boolean }) {
  if (wave === 2) {
    return <svg viewBox="0 0 160 110" className="viewscreen-enemy-svg" aria-hidden="true">
      <defs>
        <linearGradient id="enemyHullGradB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={identified ? '#ffd1d6' : '#c7959f'} />
          <stop offset="60%" stopColor="#c04d60" />
          <stop offset="100%" stopColor="#36131f" />
        </linearGradient>
      </defs>
      <path d="M80 8 L110 28 L144 48 L124 55 L148 72 L96 70 L80 102 L64 70 L12 72 L36 55 L16 48 L50 28 Z" fill="url(#enemyHullGradB)" stroke="#ff9caa" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M80 24 L96 37 L91 56 L80 62 L69 56 L64 37 Z" fill="#20070d" stroke="#ff9db3" strokeWidth="2"/>
      <path d="M48 55 H112" stroke="#ff7c96" strokeWidth="4" strokeLinecap="round" opacity="0.85"/>
      <circle cx="80" cy="55" r="5.2" fill="#ffdce2" opacity="0.95"/>
    </svg>;
  }

  return <svg viewBox="0 0 140 100" className="viewscreen-enemy-svg" aria-hidden="true">
    <defs>
      <linearGradient id="enemyHullGradA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={identified ? '#ffd2d8' : '#b4878d'} />
        <stop offset="55%" stopColor="#cc6571" />
        <stop offset="100%" stopColor="#3b1720" />
      </linearGradient>
    </defs>
    <path d="M70 8 L94 28 L126 44 L102 52 L116 72 L84 68 L70 92 L56 68 L24 72 L38 52 L14 44 L46 28 Z" fill="url(#enemyHullGradA)" stroke="#ff9aa6" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M70 24 L82 34 L79 50 L70 57 L61 50 L58 34 Z" fill="#1b0810" stroke="#ff9bb2" strokeWidth="2"/>
    <circle cx="70" cy="50" r="4.5" fill="#ffdbe2" opacity="0.9"/>
  </svg>;
}

function stageAlert(snapshot: GameSnapshot) {
  if (snapshot.missionStatus === 'victory') return { title: 'MISSION COMPLETE', detail: 'Relay lane secure. All hostiles neutralized.' };
  if (snapshot.missionStatus === 'defeat') return { title: 'HULL FAILURE', detail: 'The ship has been destroyed. Reset from Captain station.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'distress') return { title: 'CIVILIAN DISTRESS CALL', detail: 'CSV Meridian requests immediate assistance. Communications response required.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'rendezvous') return { title: 'RESCUE RENDEZVOUS', detail: 'Approach CSV Meridian and establish a close support position.' };
  if (snapshot.missionId === 'meridian-distress' && snapshot.missionStage === 'assist') return { title: 'EMERGENCY SUPPORT', detail: `Aid transfer ${Math.round(snapshot.friendlyContact?.aidProgress ?? 0)}% complete.` };
  if (!snapshot.enemy.alive && snapshot.missionStage === 'reinforcement') return { title: 'REINFORCEMENT CONTACT', detail: 'Long-range sensors report a second inbound hostile.' };
  if (snapshot.sensors.scanActive) return { title: 'ACTIVE SENSOR SWEEP', detail: `Science resolving contact • ${Math.round(snapshot.sensors.scanProgress)}% complete.` };
  if (snapshot.sensors.intelLevel === 0) return { title: 'UNKNOWN CONTACT', detail: 'No verified firing solution. Awaiting science identification.' };
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

  const alert = stageAlert(snapshot);
  const currentRange = snapshot.friendlyContact ? Math.hypot(snapshot.ship.x - snapshot.friendlyContact.x, snapshot.ship.y - snapshot.friendlyContact.y) : range(snapshot);
  const bearing = useMemo(() => {
    const targetX = snapshot.friendlyContact?.x ?? snapshot.enemy.x;
    const targetY = snapshot.friendlyContact?.y ?? snapshot.enemy.y;
    const dx = targetX - snapshot.ship.x;
    const dy = targetY - snapshot.ship.y;
    return normalizeHeading(Math.atan2(dx, dy) * 180 / Math.PI);
  }, [snapshot.enemy.x, snapshot.enemy.y, snapshot.friendlyContact?.x, snapshot.friendlyContact?.y, snapshot.ship.x, snapshot.ship.y]);

  const relativeBearing = useMemo(() => {
    const delta = ((bearing - snapshot.ship.heading + 540) % 360) - 180;
    return clamp(delta, -75, 75);
  }, [bearing, snapshot.ship.heading]);

  const contactX = 50 + relativeBearing * 0.28;
  const contactY = clamp(54 - currentRange * 1.05, 18, 62);
  const contactScale = clamp(1.34 - currentRange * 0.028, 0.45, 1.2);
  const shipShieldPercent = Math.round(snapshot.ship.shields);
  const shipHullPercent = Math.round(snapshot.ship.hull);
  const dangerLevel = shipShieldPercent < 35 || shipHullPercent < 50 ? 'danger' : shipShieldPercent < 65 ? 'caution' : 'stable';
  const alertClass = snapshot.missionStatus === 'victory'
    ? 'victory'
    : snapshot.missionStatus === 'defeat'
      ? 'defeat'
      : snapshot.missionStage === 'combat' || snapshot.missionStage === 'reinforcement'
        ? 'combat'
        : snapshot.sensors.scanActive
          ? 'scan'
          : 'neutral';
  const cinemaClass = [
    snapshot.ship.throttle > 65 && snapshot.missionStatus === 'running' ? 'high-throttle' : '',
    snapshot.sensors.scanActive ? 'scan-mode' : '',
    playerShake ? 'camera-shake' : '',
    playerImpactPulse ? `player-hit-${playerImpactPulse}` : '',
    snapshot.missionStatus === 'victory' ? 'victory-mode' : '',
    snapshot.missionStatus === 'defeat' ? 'defeat-mode' : ''
  ].filter(Boolean).join(' ');

  return <div className={`viewscreen-shell stage-${snapshot.missionStage} graphics-pass graphics-pass-two ${victoryPulse ? 'victory-pulse' : ''}`}>
    <header className="viewscreen-header">
      <div><span>USS PROTOTYPE • MAIN VIEWSCREEN • GRAPHICS PASS 2</span><h1>{snapshot.missionTitle}</h1></div>
      <div className={`status-chip ${snapshot.missionStatus}`}>{snapshot.missionStage.toUpperCase()}</div>
    </header>

    <main className="viewscreen-main cinematic-layout">
      <section className="viewscreen-objective"><span>CAPTAIN'S OBJECTIVE</span><strong>{snapshot.currentObjective}</strong></section>

      <section className={`viewscreen-alert-banner ${alertClass}`}>
        <span>{alert.title}</span>
        <strong>{alert.detail}</strong>
      </section>

      <section className="viewscreen-stage-grid">
        <div className={`viewscreen-cinema panel ${cinemaClass}`}>
          <div className="space-layer stars-near"/>
          <div className="space-layer stars-mid"/>
          <div className="space-layer stars-far"/>
          <div className="space-layer nebula-cloud"/>
          <div className="space-layer nebula-ribbon"/>
          <div className="space-layer horizon-glow"/>
          <div className="screen-vignette"/>
          <div className="screen-scanlines"/>
          {snapshot.ship.throttle > 65 && snapshot.missionStatus === 'running' && <div className="engine-streaks"/>}
          {snapshot.sensors.scanActive && <div className={`scan-sweep ${scanPing ? 'active' : ''}`}/>} 
          {playerImpactPulse && <div className={`player-impact-flash ${playerImpactPulse}`}/>} 
          {playerImpactPulse === 'shields' && <div className="shield-ripple-overlay"/>}
          {enemyShockwave && snapshot.enemy.alive === false && <div className="enemy-shockwave" style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%` } as CSSProperties }/>}
          {beamPulse && snapshot.enemy.alive && <div className="beam-lance" style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%` } as CSSProperties }/>}
          {torpedoTrails.map((trail, index) => <div key={trail.id} className={`torpedo-trail lane-${trail.lane}`} style={{ ['--impact-x' as string]: `${contactX}%`, ['--impact-y' as string]: `${contactY}%`, ['--trail-delay' as string]: `${index * 120}ms` } as CSSProperties }/>) }

          <div className={`target-bracket ${snapshot.friendlyContact || snapshot.enemy.alive ? 'tracked' : 'offline'} ${snapshot.friendlyContact ? 'civilian-track' : ''}`} style={{ left: `${contactX}%`, top: `${contactY}%` }}>
            {(snapshot.friendlyContact || snapshot.enemy.alive) && <>
              <span className="target-bracket-corner tl"/><span className="target-bracket-corner tr"/><span className="target-bracket-corner bl"/><span className="target-bracket-corner br"/>
            </>}
          </div>

          {snapshot.friendlyContact ? <div className="civilian-contact-layer" style={{ left: `${contactX}%`, top: `${contactY}%`, transform: `translate(-50%, -50%) scale(${contactScale})` }}>
            <div className="civilian-contact-glyph">◇</div>
            <div className="enemy-ship-caption">
              <strong>{snapshot.friendlyContact.name}</strong>
              <span>{snapshot.friendlyContact.type.toUpperCase()} • {snapshot.friendlyContact.status.toUpperCase()}</span>
            </div>
          </div> : <div className={`enemy-ship-layer intel-${snapshot.sensors.intelLevel} ${impactPulse ? 'impacting' : ''} ${!snapshot.enemy.alive ? 'destroyed' : ''}`} style={{ left: `${contactX}%`, top: `${contactY}%`, transform: `translate(-50%, -50%) scale(${contactScale}) rotate(${relativeBearing * 0.08}deg)` }}>
            {snapshot.enemy.alive ? <EnemyShipGraphic wave={snapshot.enemy.wave} identified={snapshot.sensors.intelLevel >= 1}/> : <div className="enemy-detonation"><div/><div/><div/></div>}
            <div className="enemy-ship-caption">
              <strong>{snapshot.enemy.alive ? snapshot.enemy.name : 'HOSTILE DESTROYED'}</strong>
              <span>{snapshot.sensors.intelLevel >= 1 ? snapshot.sensors.contactClass : 'UNRESOLVED SIGNATURE'}</span>
            </div>
          </div>}

          <div className={`friendly-hud-card ${dangerLevel}`}>
            <div className="friendly-hud-header"><span>USS PROTOTYPE</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3, '0')}°</strong></div>
            <PlayerShipGraphic/>
            <div className="friendly-hud-status"><span>THROTTLE <strong>{Math.round(snapshot.ship.throttle)}%</strong></span><span>SPEED <strong>{snapshot.ship.speed.toFixed(1)}</strong></span></div>
            <div className="friendly-hud-bars">
              <div><label>SHIELDS</label><div className="hud-track"><div style={{ width: pct(shipShieldPercent) }}/></div></div>
              <div><label>HULL</label><div className="hud-track hull"><div style={{ width: pct(shipHullPercent) }}/></div></div>
            </div>
          </div>

          <div className="viewscreen-contact-stack">
            <div className="contact-pill"><span>CONTACT</span><strong>{snapshot.friendlyContact?.name ?? (snapshot.enemy.alive ? snapshot.enemy.name : 'CLEAR SPACE')}</strong></div>
            <div className="contact-pill"><span>RANGE</span><strong>{currentRange.toFixed(1)} km</strong></div>
            <div className="contact-pill"><span>BEARING</span><strong>{Math.round(bearing).toString().padStart(3, '0')}°</strong></div>
          </div>
        </div>

        <aside className="viewscreen-sidecar">
          <section className="panel info-card viewscreen-scan-panel">
            {snapshot.friendlyContact ? <>
              <div className="panel-title"><span>CIVILIAN CONTACT</span><strong>{Math.round(snapshot.friendlyContact.aidProgress)}% AID</strong></div>
              <div className="civilian-sidecar-icon">◇</div>
              <div className="sidecar-readouts">
                <div><span>IDENTITY</span><strong>{snapshot.friendlyContact.name}</strong></div>
                <div><span>TYPE</span><strong>{snapshot.friendlyContact.type}</strong></div>
                <div><span>STATUS</span><strong>{snapshot.friendlyContact.status.toUpperCase()}</strong></div>
                <div><span>CHANNEL</span><strong>{snapshot.friendlyContact.hailStatus.toUpperCase()}</strong></div>
                <div><span>DISTRESS</span><strong>{snapshot.friendlyContact.distress}</strong></div>
              </div>
            </> : <>
              <div className="panel-title"><span>SENSOR ANALYSIS</span><strong>{Math.round(snapshot.sensors.scanProgress)}%</strong></div>
              <div className={`mini-scan-ring ${snapshot.sensors.scanActive ? 'active' : ''}`}>
                <div className="mini-scan-core"><strong>{Math.round(snapshot.sensors.scanProgress)}%</strong><span>SCAN</span></div>
              </div>
              <div className="sidecar-readouts">
                <div><span>IDENTITY</span><strong>{snapshot.enemy.name}</strong></div>
                <div><span>CLASS</span><strong>{snapshot.sensors.contactClass}</strong></div>
                <div><span>WEAPONS</span><strong>{snapshot.sensors.weaponsEstimate}</strong></div>
                <div><span>ENEMY SHIELDS</span><strong>{snapshot.enemy.shields === null ? 'UNKNOWN' : `${Math.round(snapshot.enemy.shields)}%`}</strong></div>
                <div><span>ENEMY HULL</span><strong>{snapshot.enemy.hull === null ? 'UNKNOWN' : `${Math.round(snapshot.enemy.hull)}%`}</strong></div>
              </div>
            </>}
          </section>

          <section className="panel info-card tactical-inset-card">
            <div className="panel-title"><span>TACTICAL INSET</span><strong>ENCOUNTER {snapshot.encounter}/2</strong></div>
            <TacticalPlot snapshot={snapshot}/>
          </section>
        </aside>
      </section>

      <div className="viewscreen-hud cinematic-hud">
        <div><span>CONTACT STATUS</span><strong>{snapshot.friendlyContact ? `${snapshot.friendlyContact.name.toUpperCase()} • ${snapshot.friendlyContact.status.toUpperCase()}` : snapshot.enemy.alive ? (snapshot.sensors.intelLevel >= 1 ? 'FIRING SOLUTION ACTIVE' : 'SENSORS PENDING') : 'NO ACTIVE CONTACT'}</strong></div>
        <div><span>SENSOR RESOLUTION</span><strong>{Math.round(snapshot.sensors.scanProgress)}%</strong></div>
        <div><span>SHIP SHIELDS / HULL</span><strong>{shipShieldPercent}% / {shipHullPercent}%</strong></div>
        <div><span>BEAM / TORPEDOES</span><strong>{Math.round(snapshot.ship.beamCharge)}% / {snapshot.ship.torpedoes}</strong></div>
        <div><span>ENCOUNTER</span><strong>{snapshot.encounter}/2</strong></div>
      </div>
    </main>
  </div>;
}
