import { DEFAULT_SHIP_ID, getShipDefinition } from "./ShipCatalog";
import {
  CANNON_PRIMARY_COMPONENT_OPTIONS,
  ENERGY_LAUNCHER_COMPONENT_OPTIONS,
  MISSILE_BAY_COMPONENT_OPTIONS,
  DEFAULT_CANNON_PRIMARY_COMPONENT_ID,
  DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID,
  DEFAULT_MISSILE_BAY_COMPONENT_ID,
  type CannonPrimaryComponentId,
  type EnergyLauncherComponentId,
  type MissileBayComponentId
} from "../weapons/WeaponComponentCatalog";

export const PRIMARY_FIRE_COMPONENT_OPTIONS = CANNON_PRIMARY_COMPONENT_OPTIONS;
export const MISSILE_COMPONENT_OPTIONS = MISSILE_BAY_COMPONENT_OPTIONS;
export const ENERGY_COMPONENT_OPTIONS = ENERGY_LAUNCHER_COMPONENT_OPTIONS;

export type PrimaryFireComponentId = CannonPrimaryComponentId;
export type MissileComponentId = MissileBayComponentId;
export type EnergyComponentId = EnergyLauncherComponentId;

export type ShipSelectionConfig = {
  shipId: string;
  cannonPrimaryComponentId: PrimaryFireComponentId;
  missileBayComponentId: MissileComponentId;
  energyComponentId: EnergyComponentId;
};

export function createDefaultShipSelection(shipId = DEFAULT_SHIP_ID): ShipSelectionConfig {
  return {
    shipId,
    cannonPrimaryComponentId: resolveCannonPrimaryComponentId(shipId),
    missileBayComponentId: resolveMissileBayComponentId(shipId),
    energyComponentId: DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID
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
