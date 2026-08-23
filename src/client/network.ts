import { Client, type Room } from '@colyseus/sdk';
import type { ClientCommand, GameSnapshot } from '../shared/protocol';

export type BridgeConnection = {
  room: Room;
  send: (command: ClientCommand) => void;
};

export async function connectBridge(onSnapshot: (snapshot: GameSnapshot) => void): Promise<BridgeConnection> {
  const host = window.location.hostname || 'localhost';
  const fallback = import.meta.env.DEV
    ? `${window.location.protocol}//${host}:2567`
    : window.location.origin;
  const endpoint = import.meta.env.VITE_SERVER_URL || fallback;
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('bridge');
  room.onMessage('snapshot', onSnapshot);
  return {
    room,
    send: (command) => room.send('command', command)
  };
}
