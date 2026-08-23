import type { ClientCommand, GameSnapshot } from '../../shared/protocol';

type Props = { snapshot: GameSnapshot; send: (command: ClientCommand) => void };
const pct = (value: number) => `${Math.max(0, Math.min(100, value))}%`;
const range = (s: GameSnapshot) => Math.hypot(s.ship.x - s.enemy.x, s.ship.y - s.enemy.y);

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><div className="meter-label"><span>{label}</span><strong>{Math.round(value)}%</strong></div><div className="meter-track"><div className="meter-fill" style={{ width: pct(value) }} /></div></div>;
}

function TacticalPlot({ snapshot }: { snapshot: GameSnapshot }) {
  const sx = 50 + snapshot.ship.x * 1.5;
  const sy = 50 - snapshot.ship.y * 1.5;
  const ex = 50 + snapshot.enemy.x * 1.5;
  const ey = 50 - snapshot.enemy.y * 1.5;
  return <div className="tactical-plot">
    <div className="grid-ring ring-one"/><div className="grid-ring ring-two"/><div className="crosshair x"/><div className="crosshair y"/>
    <div className="contact friendly" style={{ left: `${sx}%`, top: `${sy}%` }}><span>▲</span><small>YOU</small></div>
    {snapshot.enemy.alive && <div className="contact hostile" style={{ left: `${ex}%`, top: `${ey}%` }}><span>◆</span><small>RAIDER</small></div>}
  </div>;
}

function MissionLog({ snapshot }: { snapshot: GameSnapshot }) {
  return <section className="panel log-panel"><h3>Bridge Log</h3><div className="log-list">{snapshot.eventLog.map((event, i) => <div key={`${event}-${i}`} className="log-entry"><span>{i === 0 ? '●' : '·'}</span>{event}</div>)}</div></section>;
}

export function CaptainStation({ snapshot, send }: Props) {
  return <main className="station-grid captain-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>TACTICAL OVERVIEW</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel"><h3>Ship Status</h3><Meter label="Hull Integrity" value={snapshot.ship.hull}/><Meter label="Shields" value={snapshot.ship.shields}/><div className="readout-grid"><div><span>Heading</span><strong>{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</strong></div><div><span>Speed</span><strong>{snapshot.ship.speed.toFixed(1)}</strong></div><div><span>Torpedoes</span><strong>{snapshot.ship.torpedoes}</strong></div><div><span>Beam</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong></div></div>{snapshot.missionStatus === 'briefing' && <button className="primary full" onClick={() => send({ type: 'startMission' })}>START MISSION</button>}</section>
    <section className="panel"><h3>Crew Stations</h3><div className="crew-list">{snapshot.roles.map(r => <div key={r.role} className="crew-row crew-row-detailed"><div><span className="crew-role">{r.role.toUpperCase()}</span><small>{r.status}</small></div><strong className={r.controller}>{r.controller === 'human' ? r.playerName : `AI • ${r.aiOfficerName}`}</strong></div>)}</div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function HelmStation({ snapshot, send }: Props) {
  return <main className="station-grid helm-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>NAVIGATION</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel controls-panel"><h3>Heading</h3><div className="heading-readout">{Math.round(snapshot.ship.heading).toString().padStart(3,'0')}°</div><input type="range" min="0" max="359" value={snapshot.ship.requestedHeading} onChange={(e) => send({ type:'setHeading', heading:Number(e.target.value) })}/><div className="quick-buttons"><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading - 15})}>−15°</button><button onClick={() => send({type:'setHeading', heading:snapshot.ship.requestedHeading + 15})}>+15°</button></div><h3>Throttle</h3><div className="heading-readout">{Math.round(snapshot.ship.throttle)}%</div><input type="range" min="0" max="100" value={snapshot.ship.throttle} onChange={(e) => send({ type:'setThrottle', throttle:Number(e.target.value) })}/><div className="quick-buttons"><button onClick={() => send({type:'setThrottle', throttle:0})}>STOP</button><button onClick={() => send({type:'setThrottle', throttle:50})}>HALF</button><button onClick={() => send({type:'setThrottle', throttle:100})}>FULL</button></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function TacticalStation({ snapshot, send }: Props) {
  return <main className="station-grid tactical-layout">
    <section className="panel hero-panel"><div className="panel-title"><span>WEAPONS TRACKING</span><strong>RANGE {range(snapshot).toFixed(1)} km</strong></div><TacticalPlot snapshot={snapshot}/></section>
    <section className="panel"><h3>Target: {snapshot.enemy.name}</h3><Meter label="Enemy Shields" value={snapshot.enemy.shields}/><Meter label="Enemy Hull" value={snapshot.enemy.hull}/><div className="weapon-grid"><button className="weapon-button" disabled={snapshot.ship.beamCharge < 25 || !snapshot.enemy.alive} onClick={() => send({type:'fireBeam'})}><span>BEAM ARRAY</span><strong>{Math.round(snapshot.ship.beamCharge)}%</strong><small>25% per shot • 15 km range</small></button><button className="weapon-button torpedo" disabled={snapshot.ship.torpedoes <= 0 || !snapshot.enemy.alive} onClick={() => send({type:'fireTorpedo'})}><span>TORPEDO</span><strong>{snapshot.ship.torpedoes}</strong><small>24 km effective range</small></button></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}

export function EngineeringStation({ snapshot, send }: Props) {
  const ship = snapshot.ship;
  const set = (system: 'engines'|'shields'|'weapons', value: number) => send({type:'setPower', system, value});
  return <main className="station-grid engineering-layout">
    <section className="panel power-panel"><div className="panel-title"><span>POWER DISTRIBUTION</span><strong>TOTAL 100%</strong></div>{([['engines', ship.enginePower], ['shields', ship.shieldPower], ['weapons', ship.weaponPower]] as const).map(([system,value]) => <div className="power-control" key={system}><div className="power-heading"><span>{system.toUpperCase()}</span><strong>{Math.round(value)}%</strong></div><input type="range" min="0" max="100" value={value} onChange={(e)=>set(system,Number(e.target.value))}/></div>)}</section>
    <section className="panel"><h3>System Condition</h3><Meter label="Hull Integrity" value={ship.hull}/><Meter label="Shield Strength" value={ship.shields}/><Meter label="Beam Capacitor" value={ship.beamCharge}/><div className="readout-grid"><div><span>Engine Output</span><strong>{ship.enginePower.toFixed(0)}%</strong></div><div><span>Shield Output</span><strong>{ship.shieldPower.toFixed(0)}%</strong></div><div><span>Weapon Output</span><strong>{ship.weaponPower.toFixed(0)}%</strong></div><div><span>Speed</span><strong>{ship.speed.toFixed(1)}</strong></div></div></section>
    <MissionLog snapshot={snapshot}/>
  </main>;
}
