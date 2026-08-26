import type { MissionId, SpaceObjectState } from '../../shared/protocol.js';

export type WorldObjectDefinition = Omit<SpaceObjectState, 'alive' | 'identified'> & { alive?: boolean; identified?: boolean };

/**
 * Mission map content belongs here rather than inside the simulation loop.
 * Add stations, planets, moons, asteroids, anomalies, debris, or beacons by
 * adding another data object. Dynamic ships/mission contacts are layered on
 * top by BridgeGame.
 */
export const MISSION_WORLD_OBJECTS: Record<MissionId, WorldObjectDefinition[]> = {
  'signal-dark': [
    {
      id: 'nereid-iv', name: 'Nereid IV', objectType: 'planet', subtype: 'Uninhabited terrestrial planet',
      disposition: 'neutral', x: -38, y: 30, radius: 5.5, selectable: true, targetable: false
    },
    {
      id: 'kx-17', name: 'KX-17', objectType: 'asteroid', subtype: 'Large metallic asteroid',
      disposition: 'neutral', x: 18, y: -20, radius: 2.1, selectable: true, targetable: false
    }
  ],
  'meridian-distress': [
    {
      id: 'relay-6', name: 'Relay Six', objectType: 'station', subtype: 'Civilian navigation relay',
      disposition: 'neutral', x: -18, y: -12, radius: 2.4, selectable: true, targetable: false, hailPriority: 4
    },
    {
      id: 'meridian-beacon', name: 'Emergency Beacon', objectType: 'beacon', subtype: 'Automated distress transponder',
      disposition: 'friendly', x: 22, y: 7, radius: 0.4, selectable: true, targetable: false, hailPriority: 1
    }
  ]
};

export const instantiateMissionWorldObjects = (missionId: MissionId): SpaceObjectState[] =>
  MISSION_WORLD_OBJECTS[missionId].map((object) => ({ ...object, alive: object.alive ?? true, identified: object.identified ?? true }));
