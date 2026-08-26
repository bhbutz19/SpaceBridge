import { defineRoom, defineServer } from 'colyseus';
import { listen } from '@colyseus/tools';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BridgeRoom } from './BridgeRoom.js';

const clientDist = resolve(process.cwd(), 'dist');
const clientIndex = resolve(clientDist, 'index.html');

const server = defineServer({
  rooms: {
    bridge: defineRoom(BridgeRoom)
  },
  express: (app) => {
    app.get('/health', (_req, res) => res.json({ ok: true, game: 'spacebridge', version: '0.5.0-alpha.40' }));

    // Production/packaged-host groundwork: after `npm run build`, the same
    // Colyseus process can serve the browser UI, host lobby, and viewscreen.
    if (existsSync(clientIndex)) {
      app.use(express.static(clientDist));
      app.get(['/', '/viewscreen', '/host'], (_req, res) => res.sendFile(clientIndex));
    }
  }
});

listen(server, Number(process.env.PORT ?? 2567));
