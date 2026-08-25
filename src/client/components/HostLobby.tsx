import { useState } from 'react';
import type { GameSnapshot, Role } from '../../shared/protocol';

const roleLabels: Record<Role, string> = {
  captain: 'Captain',
  helm: 'Helm',
  tactical: 'Tactical',
  engineering: 'Engineering',
  science: 'Science',
  communications: 'Communications'
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return <button className="secondary" onClick={copy}>{copied ? 'COPIED' : label}</button>;
}

export function HostLobby({ snapshot }: { snapshot: GameSnapshot }) {
  const host = window.location.hostname || 'localhost';
  const protocol = window.location.protocol;
  const devMode = window.location.port === '5173';
  const stationUrl = window.location.origin.replace(/\/$/, '');
  const viewscreenUrl = `${stationUrl}/viewscreen`;
  const hostUrl = `${stationUrl}/host`;
  const serverBase = devMode ? `${protocol}//${host}:2567` : stationUrl;
  const occupied = snapshot.roles.filter((role) => role.sessionId).length;

  return <div className="shell host-lobby-shell">
    <header className="masthead">
      <div><span className="eyebrow">SPACEBRIDGE HOST CONTROL • v0.5 alpha.29</span><h1>Bridge Lobby</h1></div>
      <div className={`status-chip ${snapshot.missionStatus}`}>{snapshot.missionStage.toUpperCase()}</div>
    </header>

    <main className="host-lobby-grid">
      <section className="panel host-join-card">
        <div className="panel-title"><span>JOIN THIS BRIDGE</span><strong>{occupied}/6 HUMAN STATIONS</strong></div>
        <h2>{stationUrl}</h2>
        <p className="muted">Open this address on laptops, tablets, or phones connected to the same LAN. Empty stations remain under AI control.</p>
        <div className="host-link-actions"><CopyButton value={stationUrl} label="COPY STATION URL"/><a className="button-link" href={stationUrl}>OPEN STATIONS</a></div>
      </section>

      <section className="panel host-mission-card">
        <div className="panel-title"><span>MISSION</span><strong>ENCOUNTER {snapshot.encounter}/2</strong></div>
        <h2>{snapshot.missionTitle}</h2>
        <p>{snapshot.currentObjective}</p>
        <div className="host-stage-readout"><span>STAGE</span><strong>{snapshot.missionStage.toUpperCase()}</strong></div>
      </section>

      <section className="panel host-roster-card">
        <div className="panel-title"><span>CREW ROSTER</span><strong>LIVE</strong></div>
        <div className="host-roster-list">{snapshot.roles.map((slot) => <div className="host-roster-row" key={slot.role}>
          <div><strong>{roleLabels[slot.role]}</strong><span>{slot.status}</span></div>
          <div className={slot.controller}>{slot.controller === 'human' ? slot.playerName : `AI • ${slot.aiOfficerName}`}</div>
        </div>)}</div>
      </section>

      <section className="panel host-display-card">
        <div className="panel-title"><span>DISPLAY & SERVER</span><strong>LAN TOOLS</strong></div>
        <div className="host-resource-row"><div><span>MAIN VIEWSCREEN</span><code>{viewscreenUrl}</code></div><div><CopyButton value={viewscreenUrl} label="COPY"/><a className="button-link" href={viewscreenUrl}>OPEN</a></div></div>
        <div className="host-resource-row"><div><span>HOST LOBBY</span><code>{hostUrl}</code></div><CopyButton value={hostUrl} label="COPY"/></div>
        <div className="host-resource-row"><div><span>SERVER HEALTH</span><code>{serverBase}/health</code></div><a className="button-link" href={`${serverBase}/health`}>CHECK</a></div>
        <p className="muted host-mode-note">{devMode ? 'Development mode: Vite serves the UI on 5173 and Colyseus runs on 2567.' : 'Built-host mode: stations, viewscreen, host lobby, health check, and Colyseus share one server port.'}</p>
      </section>
    </main>
  </div>;
}
