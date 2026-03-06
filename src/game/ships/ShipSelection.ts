import { DEFAULT_SHIP_ID, getShipDefinition } from "./ShipCatalog";
import {
  CANNON_PRIMARY_COMPONENT_OPTIONS,
  BEAM_PRIMARY_COMPONENT_OPTIONS,
  ENERGY_LAUNCHER_COMPONENT_OPTIONS,
  MISSILE_BAY_COMPONENT_OPTIONS,
  TORPEDO_COMPONENT_OPTIONS as WEAPON_TORPEDO_COMPONENT_OPTIONS,
  DEFAULT_CANNON_PRIMARY_COMPONENT_ID,
  DEFAULT_BEAM_PRIMARY_COMPONENT_ID,
  DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID,
  DEFAULT_MISSILE_BAY_COMPONENT_ID,
  DEFAULT_TORPEDO_COMPONENT_ID,
  type CannonPrimaryComponentId,
  type BeamPrimaryComponentId as WeaponBeamPrimaryComponentId,
  type EnergyLauncherComponentId,
  type MissileBayComponentId,
  type TorpedoComponentId
} from "../weapons/WeaponComponentCatalog";

export const PRIMARY_FIRE_COMPONENT_OPTIONS = CANNON_PRIMARY_COMPONENT_OPTIONS;
export const BEAM_PRIMARY_OPTIONS = BEAM_PRIMARY_COMPONENT_OPTIONS;
export const MISSILE_COMPONENT_OPTIONS = MISSILE_BAY_COMPONENT_OPTIONS;
export const ENERGY_COMPONENT_OPTIONS = ENERGY_LAUNCHER_COMPONENT_OPTIONS;
export const TORPEDO_COMPONENT_OPTIONS = WEAPON_TORPEDO_COMPONENT_OPTIONS;

export type PrimaryFireComponentId = CannonPrimaryComponentId;
export type BeamPrimaryComponentId = WeaponBeamPrimaryComponentId;
export type MissileComponentId = MissileBayComponentId;
export type EnergyComponentId = EnergyLauncherComponentId;
export type TorpedoFireComponentId = TorpedoComponentId;

export type ShipSelectionConfig = {
  shipId: string;
  cannonPrimaryComponentId: PrimaryFireComponentId;
  beamPrimaryComponentId: BeamPrimaryComponentId;
  missileBayComponentId: MissileComponentId;
  energyComponentId: EnergyComponentId;
  torpedoComponentId: TorpedoFireComponentId;
};

export function createDefaultShipSelection(shipId = DEFAULT_SHIP_ID): ShipSelectionConfig {
  return {
    shipId,
    cannonPrimaryComponentId: resolveCannonPrimaryComponentId(shipId),
    beamPrimaryComponentId: resolveBeamPrimaryComponentId(shipId),
    missileBayComponentId: resolveMissileBayComponentId(shipId),
    energyComponentId: DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID,
    torpedoComponentId: resolveTorpedoComponentId(shipId)
  };
}

export function resolveCannonPrimaryComponentId(
  shipId: string,
  componentId?: PrimaryFireComponentId
): PrimaryFireComponentId {
  const ship = getShipDefinition(shipId);
  return (
    componentId ??
    ship.cannonMounts?.[0]?.defaultPrimaryComponentId ??
    DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  );
}

export function resolveMissileBayComponentId(
  shipId: string,
  componentId?: MissileComponentId
): MissileComponentId {
  const ship = getShipDefinition(shipId);
  return (
    componentId ??
    ship.missileBays?.[0]?.defaultPayloadComponentId ??
    DEFAULT_MISSILE_BAY_COMPONENT_ID
  );
}

export function resolveBeamPrimaryComponentId(
  shipId: string,
  componentId?: BeamPrimaryComponentId
): BeamPrimaryComponentId {
  const ship = getShipDefinition(shipId);
  return (
    componentId ??
    ship.beamEmitters?.[0]?.defaultBeamPrimaryComponentId ??
    DEFAULT_BEAM_PRIMARY_COMPONENT_ID
  );
}

export function resolveTorpedoComponentId(
  shipId: string,
  componentId?: TorpedoFireComponentId
): TorpedoFireComponentId {
  const ship = getShipDefinition(shipId);
  return (
    componentId ??
    ship.torpedoLaunchers?.[0]?.defaultTorpedoComponentId ??
    DEFAULT_TORPEDO_COMPONENT_ID
  );
}
