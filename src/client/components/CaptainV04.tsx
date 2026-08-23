import { useState } from 'react';
import type { ClientCommand, GameSnapshot } from '../../shared/protocol';
import { CaptainStation } from './Stations';

type Props = { snapshot: GameSnapshot; send: (command: ClientCommand) => void };

function BridgeCommsPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const entries = (snapshot.commsLog ?? []).slice(0, 12);
  return <section className="panel bridge-comms-panel">
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
    <p className="muted compact-copy">Give the crew natural-language orders. The interpreter converts them into the same validated standing orders used by the station controls.</p>
    <div className="captain-command-row">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} maxLength={220} placeholder="Try: Helm, intercept. Tactical, weapons free. Engineering, shields." />
      <button className="primary" onClick={submit} disabled={!text.trim()}>SEND ORDER</button>
    </div>
    <div className="captain-command-examples">
      <button onClick={() => quick('Status report, all stations.')}>STATUS REPORT</button>
      <button onClick={() => quick('Helm, intercept the contact.')}>HELM: INTERCEPT</button>
      <button onClick={() => quick('Tactical, hold fire.')}>TACTICAL: HOLD FIRE</button>
      <button onClick={() => quick('Engineering, prioritize shields.')}>ENGINEERING: SHIELDS</button>
      <button onClick={() => quick('Science, scan the target.')}>SCIENCE: SCAN</button>
    </div>
  </section>;
}

export function CaptainV04({ snapshot, send }: Props) {
  return <>
    <CaptainStation snapshot={snapshot} send={send}/>
    <div className="captain-v04-extras">
      <CaptainCommandConsole send={send}/>
      <BridgeCommsPanel snapshot={snapshot}/>
    </div>
  </>;
}
