import type { ClientCommand, CrewOrder, GameSnapshot, OperationalRole } from '../../shared/protocol';

type Props = { snapshot: GameSnapshot; send: (command: ClientCommand) => void };
const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const range = (s: GameSnapshot) => Math.hypot(s.ship.x - s.enemy.x, s.ship.y - s.enemy.y);

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><div className="meter-label"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track"><div className="meter-fill" style={{ width: pct(value) }} /></div></div>;
}

function UnknownMeter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <div className="unknown-readout"><span>{label}</span><strong>UNKNOWN</strong></div>;
  return <Meter label={label} value={value} />;
}

function TacticalPlot({ snapshot, large = false }: { snapshot: GameSnapshot; large?: boolean }) {
  const sx = 50 + snapshot.ship.x * 1.25;
  const sy = 50 - snapshot.ship.y * 1.25;
  const ex = 50 + snapshot.enemy.x * 1.25;
  const ey = 50 - snapshot.enemy.y * 1.25;
  return <div className={`tactical-plot ${large ? 'viewscreen-plot' : ''}`}>
    <div className="grid-ring ring-one"/><div className="grid-ring ring-two"/><div className="crosshair x"/><div className="crosshair y"/>
    <div className="contact friendly" style={{ left: `${sx}%`, top: `${sy}%` }}><span>▲</span><small>YOU</small></div>
    {snapshot.enemy.alive && <div className="contact hostile" style={{ left: `${ex}%`, top: `${ey}%` }}><span>◆</span><small>{snapshot.sensors.intelLevel >= 1 ? snapshot.enemy.name.toUpperCase() : 'UNKNOWN'}</small></div>}
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

export function CaptainStation({ snapshot, send }: Props) {
  return <main className="station-grid captain-layout v03-captain">
    <section className="panel mission-card"><div className="panel-title"><span>{snapshot.missionTitle.toUpperCase()}</span><strong>ENCOUNTER {snapshot.encounter}/2</strong></div><h2>{snapshot.currentObjective}</h2><div className="stage-line"><span>MISSION STAGE</span><strong>{snapshot.missionStage.toUpperCase()}</strong></div><div className="captain-mission-actions">{snapshot.missionStatus === 'briefing' && <button className="primary" onClick={() => send({ type: 'startMission' })}>START MISSION</button>}{snapshot.missionStatus !== 'briefing' && <button className="secondary" onClick={() => send({ type: 'resetMission' })}>RESET TO BRIEFING</button>}</div></section>
    <section className="panel hero-panel"><div className="panel-title"><span>TACTICAL OVERVIEW</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel"><h3>Ship Status</h3><Meter label="Hull Integrity" value={snapshot.ship.hull}/><Meter label="Shields" value={snapshot.ship.shields}/><div className="readout-grid"><div><span>Heading</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</strong></div><div><span>Speed</span><strong>{snapshot.ship.speed.toFixed(1)}</strong></div><div><span>Torpedoes</span><strong>{snapshot.ship.torpedoes}</strong></div><div><span>Beam</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong></div></div></section>
    <section className="panel"><h3>Crew Stations</h3><div className="crew-list">{snapshot.roles.map(r => <div key={r.role} className="crew-row crew-row-detailed"><div><span className="crew-role">{r.role.toUpperCase()}</span><small>{r.status}{r.captainOrder && r.captainOrder !== 'auto' ? ` • Order: ${r.captainOrder}` : ''}</small></div><strong className={r.controller}>{r.controller === 'human' ? r.playerName : `AI • ${r.aiOfficerName}`}</strong></div>)}</div></section>
    <CaptainOrders snapshot={snapshot} send={send}/>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function HelmStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'helm');
  return <main className="station-grid helm-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>NAVIGATION</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel controls-panel"><h3>Heading</h3>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className="incoming-order">CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()}</div>}<div className="heading-readout">{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</div><input type="range" min="0" max="359" value={snapshot.ship.requestedHeading} onChange={(e) => send({ type:'setHeading', heading:Number(e.target.value) })}/><div className="quick-buttons"><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading - 15})}>−15°</button><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading + 15})}>+15°</button></div><h3>Throttle</h3><div className="heading-readout">{Math.round(snapshot.ship.throttle)}%</div><input type="range" min="0" max="100" value={snapshot.ship.throttle} onChange={(e) => send({ type:'setThrottle', throttle:Number(e.target.value) })}/><div className="quick-buttons"><button onClick={() => send({type:'setThrottle', throttle:0})}>STOP</button><button onClick={() => send({type:'setThrottle', throttle:50})}>HALF</button><button onClick={() => send({type:'setThrottle', throttle:100})}>FULL</button></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function TacticalStation({ snapshot, send }: Props) {
  const assignment = snapshot.roles.find((r) => r.role === 'tactical');
  return <main className="station-grid tactical-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>WEAPONS TRACKING</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel"><h3>Target: {snapshot.enemy.name}</h3>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className="incoming-order">CAPTAIN ORDER: {assignment.captainOrder.replace(/([A-Z])/g, ' $1').toUpperCase()}</div>}<UnknownMeter label="Enemy Shields" value={snapshot.enemy.shields}/><UnknownMeter label="Enemy Hull" value={snapshot.enemy.hull}/>{snapshot.sensors.intelLevel < 1 && <div className="intel-warning">SCIENCE IDENTIFICATION REQUIRED FOR FIRING SOLUTION</div>}<div className="weapon-grid"><button className="weapon-button" disabled={snapshot.ship.beamCharge < 25 || !snapshot.enemy.alive || snapshot.sensors.intelLevel < 1} onClick={() => send({type:'fireBeam'})}><span>BEAM ARRAY</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong><small>25% per shot • 15 km range</small></button><button className="weapon-button torpedo" disabled={snapshot.ship.torpedoes <= 0 || !snapshot.enemy.alive || snapshot.sensors.intelLevel < 1} onClick={() => send({type:'fireTorpedo'})}><span>TORPEDO</span><strong>{snapshot.ship.torpedoes}</strong><small>24 km effective range</small></button></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function EngineeringStation({ snapshot, send }: Props) {
  const ship = snapshot.ship;
  const assignment = snapshot.roles.find((r) => r.role === 'engineering');
  const set = (system: 'engines'|'shields'|'weapons', value: number) => send({type:'setPower', system, value});
  return <main className="station-grid engineering-layout">
    <section className="panel power-panel"><div className="panel-title"><span>POWER DISTRIBUTION</span><strong>TOTAL 100%</strong></div>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className="incoming-order">CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()}</div>}{([['engines', ship.enginePower], ['shields', ship.shieldPower], ['weapons', ship.weaponPower]] as const).map(([system,value]) => <div className="power-control" key={system}><div className="power-heading"><span>{system.toUpperCase()}</span><strong>{Math.round(value)}%</strong></div><input type="range" min="0" max="100" value={value} onChange={(e)=>set(system,Number(e.target.value))}/></div>)}</section>
    <section className="panel"><h3>System Condition</h3><Meter label="Hull Integrity" value={ship.hull}/><Meter label="Shield Strength" value={ship.shields}/><Meter label="Beam Capacitor" value={ship.beamCharge}/><div className="readout-grid"><div><span>Engine Output</span><strong>{ship.enginePower.toFixed(0)}%</strong></div><div><span>Shield Output</span><strong>{ship.shieldPower.toFixed(0)}%</strong></div><div><span>Weapon Output</span><strong>{ship.weaponPower.toFixed(0)}%</strong></div><div><span>Speed</span><strong>{ship.speed.toFixed(1)}</strong></div></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function ScienceStation({ snapshot, send }: Props) {
  const sensor = snapshot.sensors;
  const assignment = snapshot.roles.find((r) => r.role === 'science');
  return <main className="station-grid science-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>LONG-RANGE SENSORS</span><strong>CONTACT RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel science-console"><h3>Contact Analysis</h3>{assignment?.captainOrder && assignment.captainOrder !== 'auto' && <div className="incoming-order">CAPTAIN ORDER: {assignment.captainOrder.toUpperCase()}</div>}<div className="scan-progress"><div className="scan-ring"><strong>{Math.round(sensor.scanProgress)}%</strong><span>SCAN</span></div></div><Meter label="Scan Resolution" value={sensor.scanProgress}/><div className="science-readouts"><div><span>IDENTITY</span><strong>{snapshot.enemy.name}</strong></div><div><span>CLASS</span><strong>{sensor.contactClass}</strong></div><div><span>WEAPONS</span><strong>{sensor.weaponsEstimate}</strong></div><div><span>SHIELDS</span><strong>{sensor.shieldEstimate}</strong></div><div><span>HULL</span><strong>{sensor.hullEstimate}</strong></div></div><button className="primary full" disabled={snapshot.missionStatus !== 'running' || !snapshot.enemy.alive || sensor.intelLevel >= 2 || sensor.scanActive} onClick={() => send({ type: 'scanTarget' })}>{sensor.intelLevel >= 2 ? 'SCAN COMPLETE' : sensor.scanActive ? 'SCANNING…' : 'BEGIN ACTIVE SCAN'}</button></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function Viewscreen({ snapshot }: { snapshot: GameSnapshot }) {
  return <div className={`viewscreen-shell stage-${snapshot.missionStage}`}>
    <header className="viewscreen-header"><div><span>USS PROTOTYPE • MAIN VIEWSCREEN</span><h1>{snapshot.missionTitle}</h1></div><div className={`status-chip ${snapshot.missionStatus}`}>{snapshot.missionStage.toUpperCase()}</div></header>
    <main className="viewscreen-main">
      <section className="viewscreen-objective"><span>CAPTAIN'S OBJECTIVE</span><strong>{snapshot.currentObjective}</strong></section>
      <TacticalPlot snapshot={snapshot} large/>
      <div className="viewscreen-hud">
        <div><span>CONTACT</span><strong>{snapshot.enemy.alive ? snapshot.enemy.name : 'NO ACTIVE CONTACT'}</strong></div>
        <div><span>RANGE</span><strong>{range(snapshot).toFixed(1)} km</strong></div>
        <div><span>SENSOR RESOLUTION</span><strong>{Math.round(snapshot.sensors.scanProgress)}%</strong></div>
        <div><span>SHIELDS / HULL</span><strong>{Math.round(snapshot.ship.shields)}% / {Math.round(snapshot.ship.hull)}%</strong></div>
        <div><span>ENCOUNTER</span><strong>{snapshot.encounter}/2</strong></div>
      </div>
    </main>
  </div>;
}
