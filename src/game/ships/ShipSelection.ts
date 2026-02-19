import { DEFAULT_SHIP_ID } from "./ShipCatalog";
import {
  CANNON_PRIMARY_COMPONENT_OPTIONS,
  CANNON_SECONDARY_COMPONENT_OPTIONS,
  ENERGY_LAUNCHER_COMPONENT_OPTIONS,
  MISSILE_BAY_COMPONENT_OPTIONS,
  DEFAULT_CANNON_PRIMARY_COMPONENT_ID,
  DEFAULT_CANNON_SECONDARY_COMPONENT_ID,
  DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID,
  DEFAULT_MISSILE_BAY_COMPONENT_ID,
  type CannonPrimaryComponentId,
  type CannonSecondaryComponentId,
  type EnergyLauncherComponentId,
  type MissileBayComponentId
} from "../weapons/WeaponComponentCatalog";

export const PRIMARY_FIRE_COMPONENT_OPTIONS = CANNON_PRIMARY_COMPONENT_OPTIONS;
export const SECONDARY_FIRE_COMPONENT_OPTIONS = CANNON_SECONDARY_COMPONENT_OPTIONS;
export const MISSILE_COMPONENT_OPTIONS = MISSILE_BAY_COMPONENT_OPTIONS;
export const ENERGY_COMPONENT_OPTIONS = ENERGY_LAUNCHER_COMPONENT_OPTIONS;

export type PrimaryFireComponentId = CannonPrimaryComponentId;
export type SecondaryFireComponentId = CannonSecondaryComponentId;
export type MissileComponentId = MissileBayComponentId;
export type EnergyComponentId = EnergyLauncherComponentId;

export type ShipSelectionConfig = {
  shipId: string;
  primaryFireComponentId: PrimaryFireComponentId;
  secondaryFireComponentId: SecondaryFireComponentId;
  missileComponentId: MissileComponentId;
  energyComponentId: EnergyComponentId;
};

export function createDefaultShipSelection(shipId = DEFAULT_SHIP_ID): ShipSelectionConfig {
  return {
    shipId,
    primaryFireComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID,
    secondaryFireComponentId: DEFAULT_CANNON_SECONDARY_COMPONENT_ID,
    missileComponentId: DEFAULT_MISSILE_BAY_COMPONENT_ID,
    energyComponentId: DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID
  };
}
