import type { SystemName, TorpedoTypeDefinition, TorpedoTypeId } from '../../shared/protocol.js';

const STANDARD_TORPEDO_TYPES: TorpedoTypeDefinition[] = [
  { id: 'photon', name: 'Photon Torpedo', shortName: 'PHOTON', description: 'Balanced anti-ship warhead.', color: '#ffb45f', baseDamage: 28, shieldMultiplier: 1, hullMultiplier: 1, subsystemMultiplier: 1 },
  { id: 'quantum', name: 'Quantum Torpedo', shortName: 'QUANTUM', description: 'High-yield warhead optimized for exposed hull.', color: '#70c8ff', baseDamage: 31, shieldMultiplier: .9, hullMultiplier: 1.45, subsystemMultiplier: 1.05 },
  { id: 'ion', name: 'Ion Torpedo', shortName: 'ION', description: 'Disruptor warhead optimized for shields and subsystems.', color: '#b790ff', baseDamage: 24, shieldMultiplier: 1.65, hullMultiplier: .5, subsystemMultiplier: 1.45 }
];

/**
 * Ship-specific tuning that should vary with hull layout rather than mission logic.
 *
 * To add a different playable ship, add another profile below and change
 * ACTIVE_SHIP_PROFILE_ID (later this can come from mission/lobby selection).
 */
export type ShipProfile = {
  id: string;
  displayName: string;
  stationSensors: {
    tacticalRange: number;
    helmRange: number;
    /** null means the Science station automatically fits the full known map. */
    scienceRange: number | null;
  };
  weapons: {
    beamRange: number;
    /** Total firing arc in degrees centered on the ship's current heading. */
    beamArcDegrees: number;
    torpedoRange: number;
    /** Total firing arc in degrees centered on the ship's current heading. */
    torpedoArcDegrees: number;
    torpedoTubes: Array<{ id: string; label: string; reloadSeconds: number }>;
    torpedoTypes: TorpedoTypeDefinition[];
    initialTorpedoInventory: Record<TorpedoTypeId, number>;
  };
  flight: {
    maxForwardSpeed: number;
    maxReverseSpeed: number;
    baseTurnRateDegreesPerSecond: number;
    enginePowerTurnBonusDegreesPerSecond: number;
    accelerationResponse: number;
    /** Maximum lateral velocity as a fraction of current effective forward speed. */
    lateralThrustFraction: number;
    /** Response rate for maneuvering-thruster velocity changes. */
    lateralAccelerationResponse: number;
    /** Speed band (fraction of effective forward speed) with maximum turn authority. */
    maneuverOptimalMinFraction: number;
    maneuverOptimalMaxFraction: number;
    /** Turn authority when nearly stopped and at maximum forward speed. */
    lowSpeedTurnFactor: number;
    highSpeedTurnFactor: number;
    defaultCombatOrbitRange: number;
  };
  repairCrews: {
    count: number;
    additionalCrewEfficiency: number;
    casualtyChance: number;
    /** Whether newly created repair crews begin in automatic damage-control mode. */
    autoDispatchDefault: boolean;
    transit: {
      /** Abstract compartment/deck coordinate used only for travel-time calculation. */
      standbyPosition: number;
      systemPosition: Record<SystemName, number>;
      /** Base delay when dispatching a crew from damage-control standby. */
      fromStandbyBaseSeconds: number;
      /** Extra seconds per position step when leaving standby. */
      fromStandbyPerStepSeconds: number;
      /** Base delay when moving directly from one subsystem compartment to another. */
      betweenSystemsBaseSeconds: number;
      /** Extra seconds per position step between subsystem compartments. */
      betweenSystemsPerStepSeconds: number;
      /** Optional ship-specific pair overrides, e.g. 'engines>weapons': 12. */
      routeOverridesSeconds?: Partial<Record<string, number>>;
    };
  };
};

export const SHIP_PROFILES = {
  prototype: {
    id: 'prototype',
    displayName: 'USS Prototype',
    stationSensors: { tacticalRange: 24, helmRange: 48, scienceRange: null },
    weapons: {
      beamRange: 15,
      beamArcDegrees: 180,
      torpedoRange: 24,
      torpedoArcDegrees: 360,
      torpedoTubes: [
        { id: 'tube-1', label: 'TUBE 1', reloadSeconds: 5 },
        { id: 'tube-2', label: 'TUBE 2', reloadSeconds: 5 }
      ],
      torpedoTypes: STANDARD_TORPEDO_TYPES,
      initialTorpedoInventory: { photon: 6, quantum: 2, ion: 2 }
    },
    flight: {
      maxForwardSpeed: 4.8,
      maxReverseSpeed: 2.2,
      baseTurnRateDegreesPerSecond: 16,
      enginePowerTurnBonusDegreesPerSecond: 20,
      accelerationResponse: 1.55,
      lateralThrustFraction: 0.27,
      lateralAccelerationResponse: 2.35,
      maneuverOptimalMinFraction: 0.20,
      maneuverOptimalMaxFraction: 0.65,
      lowSpeedTurnFactor: 0.58,
      highSpeedTurnFactor: 0.60,
      defaultCombatOrbitRange: 11
    },
    repairCrews: {
      count: 3,
      additionalCrewEfficiency: 0.75,
      casualtyChance: 0.08,
      autoDispatchDefault: true,
      transit: {
        standbyPosition: 2,
        systemPosition: {
          sensors: 0,
          weapons: 1,
          communications: 2,
          shields: 3,
          engines: 4
        },
        fromStandbyBaseSeconds: 5,
        fromStandbyPerStepSeconds: 0.75,
        betweenSystemsBaseSeconds: 4,
        betweenSystemsPerStepSeconds: 1.5,
        routeOverridesSeconds: {}
      }
    }
  },

  // Example of how a physically larger future ship can be tuned without
  // changing Engineering/game logic. This profile is not selectable yet.
  heavyCruiserExample: {
    id: 'heavy-cruiser-example',
    displayName: 'Heavy Cruiser Example',
    stationSensors: { tacticalRange: 32, helmRange: 70, scienceRange: null },
    weapons: {
      beamRange: 18,
      beamArcDegrees: 360,
      torpedoRange: 32,
      torpedoArcDegrees: 360,
      torpedoTubes: [
        { id: 'tube-1', label: 'FORE 1', reloadSeconds: 3.2 },
        { id: 'tube-2', label: 'FORE 2', reloadSeconds: 3.2 },
        { id: 'tube-3', label: 'AFT 1', reloadSeconds: 3.8 },
        { id: 'tube-4', label: 'AFT 2', reloadSeconds: 3.8 }
      ],
      torpedoTypes: STANDARD_TORPEDO_TYPES,
      initialTorpedoInventory: { photon: 12, quantum: 5, ion: 5 }
    },
    flight: {
      maxForwardSpeed: 3.7,
      maxReverseSpeed: 1.5,
      baseTurnRateDegreesPerSecond: 10,
      enginePowerTurnBonusDegreesPerSecond: 14,
      accelerationResponse: 1.0,
      lateralThrustFraction: 0.19,
      lateralAccelerationResponse: 1.45,
      maneuverOptimalMinFraction: 0.18,
      maneuverOptimalMaxFraction: 0.58,
      lowSpeedTurnFactor: 0.52,
      highSpeedTurnFactor: 0.48,
      defaultCombatOrbitRange: 14
    },
    repairCrews: {
      count: 4,
      additionalCrewEfficiency: 0.65,
      casualtyChance: 0.08,
      autoDispatchDefault: true,
      transit: {
        standbyPosition: 3,
        systemPosition: {
          sensors: 0,
          weapons: 2,
          communications: 3,
          shields: 5,
          engines: 7
        },
        fromStandbyBaseSeconds: 7,
        fromStandbyPerStepSeconds: 1.2,
        betweenSystemsBaseSeconds: 5,
        betweenSystemsPerStepSeconds: 2.0,
        routeOverridesSeconds: {
          'sensors>engines': 20,
          'engines>sensors': 20
        }
      }
    }
  }
} as const satisfies Record<string, ShipProfile>;

export type ShipProfileId = keyof typeof SHIP_PROFILES;

// Single backend switch for the current prototype. Future lobby/mission ship
// selection can choose this dynamically instead of changing this constant.
export const ACTIVE_SHIP_PROFILE_ID: ShipProfileId = 'prototype';
export const ACTIVE_SHIP_PROFILE: ShipProfile = SHIP_PROFILES[ACTIVE_SHIP_PROFILE_ID];

export function repairCrewTransitSeconds(
  profile: ShipProfile,
  fromSystem: SystemName | null,
  destination: SystemName
): number {
  const transit = profile.repairCrews.transit;

  if (fromSystem) {
    const override = transit.routeOverridesSeconds?.[`${fromSystem}>${destination}`];
    if (override !== undefined) return Math.max(0, override);

    const distance = Math.abs(transit.systemPosition[destination] - transit.systemPosition[fromSystem]);
    return Math.max(0, transit.betweenSystemsBaseSeconds + distance * transit.betweenSystemsPerStepSeconds);
  }

  const distance = Math.abs(transit.systemPosition[destination] - transit.standbyPosition);
  return Math.max(0, transit.fromStandbyBaseSeconds + distance * transit.fromStandbyPerStepSeconds);
}
