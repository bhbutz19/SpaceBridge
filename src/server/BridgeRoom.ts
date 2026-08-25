import { Room, Client } from 'colyseus';
import { BridgeGame } from './game.js';
import type { ClientCommand, Role, StationCommand } from '../shared/protocol.js';

export class BridgeRoom extends Room {
  maxClients = 16;
  private game = new BridgeGame();
  private broadcastAccumulator = 0;

  onCreate() {
    this.setSimulationInterval((deltaMs) => {
      this.game.tick(deltaMs / 1000);
      this.broadcastAccumulator += deltaMs;
      if (this.broadcastAccumulator >= 100) {
        this.broadcastAccumulator = 0;
        this.broadcastSnapshot();
      }
    }, 50);

    this.setPatchRate(100);
    this.onMessage('command', (client, command: ClientCommand) => this.handleCommand(client, command));
  }

  onJoin(client: Client) {
    client.send('snapshot', this.game.safeSnapshot());
  }

  onLeave(client: Client) {
    this.game.releaseRole(client.sessionId);
    this.broadcastSnapshot();
  }

  private handleCommand(client: Client, command: ClientCommand) {
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') return;

    switch (command.type) {
      case 'claimRole':
        this.game.claimRole(command.role as Role, client.sessionId, command.playerName);
        break;
      case 'releaseRole':
        this.game.releaseRole(client.sessionId);
        break;
      default:
        this.game.executeCommand({ kind: 'human', sessionId: client.sessionId }, command as StationCommand);
        break;
    }

    this.broadcastSnapshot();
  }

  private broadcastSnapshot() {
    this.broadcast('snapshot', this.game.safeSnapshot());
  }

  onDispose() {}
}
