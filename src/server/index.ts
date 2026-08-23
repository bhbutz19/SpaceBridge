import { defineRoom, defineServer } from 'colyseus';
import { listen } from '@colyseus/tools';
import { BridgeRoom } from './BridgeRoom.js';

const server = defineServer({
  rooms: {
    bridge: defineRoom(BridgeRoom)
  },
  express: (app) => {
    app.get('/health', (_req, res) => res.json({ ok: true, game: 'bridge-simulator' }));
  }
});

listen(server, Number(process.env.PORT ?? 2567));
