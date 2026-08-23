import { useEffect, useMemo, useState } from 'react';
import { connectBridge, type BridgeConnection } from './network';
import type { GameSnapshot, Role } from '../shared/protocol';
import { EngineeringStation, HelmStation, ScienceStation, TacticalStation } from './components/Stations';
import { CaptainV04 } from './components/CaptainV04';
import { ViewscreenGraphics } from './components/ViewscreenGraphics';
import { HostLobby } from './components/HostLobby';

const roleLabels: Record<Role, string> = {
  captain: 'Captain',
  helm: 'Helm',
  tactical: 'Tactical',
  engineering: 'Engineering',
  science: 'Science'
};

export default function App() {
  const [connection, setConnection] = useState<BridgeConnection | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [name, setName] = useState(localStorage.getItem('bridge-name') || '');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  const isViewscreen = cleanPath === '/viewscreen';
  const isHostLobby = cleanPath === '/host';

  useEffect(() => {
    connectBridge(setSnapshot)
      .then(setConnection)
      .catch((e) => setError(`Unable to connect to bridge server: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  const myRole = useMemo(() => {
    if (!snapshot || !connection) return selectedRole;
    const assigned = snapshot.roles.find((r) => r.sessionId === connection.room.sessionId);
    return assigned?.role ?? null;
  }, [snapshot, connection, selectedRole]);

  const claim = (role: Role) => {
    if (!connection || !name.trim()) return;
    localStorage.setItem('bridge-name', name.trim());
    connection.send({ type: 'claimRole', role, playerName: name.trim() });
    setSelectedRole(role);
  };

  if (error) return <div className="center-screen"><div className="panel error"><h1>Connection Failed</h1><p>{error}</p><p>Make sure the host server is running on port 2567.</p></div></div>;
  if (!connection || !snapshot) return <div className="center-screen"><div className="boot">CONNECTING TO BRIDGE NETWORK…</div></div>;
  if (isViewscreen) return <ViewscreenGraphics snapshot={snapshot}/>;
  if (isHostLobby) return <HostLobby snapshot={snapshot}/>;

  if (!myRole) {
    return <div className="shell join-shell">
      <header className="masthead"><div><span className="eyebrow">MULTI-STATION STARSHIP SIMULATOR • v0.4</span><h1>Bridge Network</h1></div><div className="status-chip online">SERVER ONLINE</div></header>
      <main className="join-grid">
        <section className="panel identity-panel"><h2>Officer Identification</h2><label>Display name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" maxLength={24} /><p className="muted">Choose any bridge station. AI officers operate every empty operational station, including Science. A human can take over at any time without resetting the mission.</p><div className="viewscreen-link"><span>HOST LOBBY</span><code>{window.location.origin}/host</code></div><div className="viewscreen-link"><span>MAIN VIEWSCREEN</span><code>{window.location.origin}/viewscreen</code></div></section>
        <section className="role-grid">
          {snapshot.roles.map((slot) => <button key={slot.role} className="role-card" disabled={!!slot.sessionId || !name.trim()} onClick={() => claim(slot.role)}>
            <span className="role-name">{roleLabels[slot.role]}</span>
            <span className={`role-controller ${slot.sessionId ? 'human' : 'ai'}`}>{slot.sessionId ? `HUMAN • ${slot.playerName}` : `AI • ${slot.aiOfficerName}`}</span>
            <span className="role-status">{slot.status}</span>
            <span className="role-action">{slot.sessionId ? 'STATION OCCUPIED' : slot.role === 'captain' ? 'ASSUME COMMAND →' : 'TAKE FROM AI →'}</span>
          </button>)}
        </section>
      </main>
    </div>;
  }

  const myAssignment = snapshot.roles.find((r) => r.role === myRole);
  const props = { snapshot, send: connection.send };
  return <div className="shell">
    <header className="masthead compact"><div><span className="eyebrow">USS PROTOTYPE • BRIDGE NETWORK • v0.4</span><h1>{roleLabels[myRole]} Station</h1><div className="station-controller">HUMAN CONTROL • {myAssignment?.playerName ?? name}</div></div><div className="header-actions"><div className={`status-chip ${snapshot.missionStatus}`}>{snapshot.missionStage.toUpperCase()}</div><button className="secondary" onClick={() => connection.send({ type: 'releaseRole' })}>Return Station to AI</button></div></header>
    {myRole === 'captain' && <CaptainV04 {...props} />}
    {myRole === 'helm' && <HelmStation {...props} />}
    {myRole === 'tactical' && <TacticalStation {...props} />}
    {myRole === 'engineering' && <EngineeringStation {...props} />}
    {myRole === 'science' && <ScienceStation {...props} />}
  </div>;
}
