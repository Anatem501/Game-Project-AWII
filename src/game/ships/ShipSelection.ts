import { DEFAULT_SHIP_ID, getShipDefinition } from "./ShipCatalog";
import {
  MOBILITY_EQUIPMENT_COMPONENT_OPTIONS,
  type MobilityEquipmentComponentId
} from "../equipment/mobility/MobilityEquipmentComponentCatalog";
import {
  DEFENSE_EQUIPMENT_COMPONENT_OPTIONS,
  type DefenseEquipmentComponentId
} from "../equipment/defense/DefenseEquipmentComponentCatalog";
import {
  EQUIPMENT_COMPONENT_OPTIONS as ALL_EQUIPMENT_COMPONENT_OPTIONS,
  isDefenseEquipmentComponentId,
  isEquipmentComponentId,
  isMobilityEquipmentComponentId,
  type EquipmentComponentId as AnyEquipmentComponentId
} from "../equipment/EquipmentComponentCatalog";
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
export const MOBILITY_COMPONENT_OPTIONS = MOBILITY_EQUIPMENT_COMPONENT_OPTIONS;
export const DEFENSE_COMPONENT_OPTIONS = DEFENSE_EQUIPMENT_COMPONENT_OPTIONS;
export const EQUIPMENT_COMPONENT_OPTIONS = ALL_EQUIPMENT_COMPONENT_OPTIONS;

export type PrimaryFireComponentId = CannonPrimaryComponentId;
export type BeamPrimaryComponentId = WeaponBeamPrimaryComponentId;
export type MissileComponentId = MissileBayComponentId;
export type EnergyComponentId = EnergyLauncherComponentId;
export type TorpedoFireComponentId = TorpedoComponentId;
export type MobilityComponentId = MobilityEquipmentComponentId;
export type DefenseComponentId = DefenseEquipmentComponentId;
export type EquipmentComponentId = AnyEquipmentComponentId;

export type ShipSelectionConfig = {
  shipId: string;
  cannonPrimaryComponentId: PrimaryFireComponentId;
  beamPrimaryComponentId: BeamPrimaryComponentId;
  missileBayComponentId: MissileComponentId;
  energyComponentId: EnergyComponentId;
  torpedoComponentId: TorpedoFireComponentId;
  equipmentComponentIds: EquipmentComponentId[];
  mobilityEquipmentComponentId: MobilityComponentId | null;
  defenseEquipmentComponentId: DefenseComponentId | null;
};

export function createDefaultShipSelection(shipId = DEFAULT_SHIP_ID): ShipSelectionConfig {
  const equipmentComponentIds = resolveEquipmentComponentIds(shipId);
  return {
    shipId,
    cannonPrimaryComponentId: resolveCannonPrimaryComponentId(shipId),
    beamPrimaryComponentId: resolveBeamPrimaryComponentId(shipId),
    missileBayComponentId: resolveMissileBayComponentId(shipId),
    energyComponentId: DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID,
    torpedoComponentId: resolveTorpedoComponentId(shipId),
    equipmentComponentIds,
    mobilityEquipmentComponentId:
      resolveMobilityEquipmentComponentIdFromEquipmentList(equipmentComponentIds),
    defenseEquipmentComponentId:
      resolveDefenseEquipmentComponentIdFromEquipmentList(equipmentComponentIds)
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

export function resolveMobilityEquipmentComponentId(
  shipId: string,
  componentId?: MobilityComponentId | null,
  equipmentComponentIds?: readonly EquipmentComponentId[] | null
): MobilityComponentId | null {
  if (equipmentComponentIds) {
    return resolveMobilityEquipmentComponentIdFromEquipmentList(equipmentComponentIds);
  }
  const ship = getShipDefinition(shipId);
  const resolvedComponentId = componentId ?? ship.mobilityEquipmentComponentId ?? null;
  if (!resolvedComponentId) {
    return null;
  }
  if (MOBILITY_COMPONENT_OPTIONS.includes(resolvedComponentId)) {
    return resolvedComponentId;
  }
  return null;
}

export function resolveDefenseEquipmentComponentId(
  shipId: string,
  componentId?: DefenseComponentId | null,
  equipmentComponentIds?: readonly EquipmentComponentId[] | null
): DefenseComponentId | null {
  if (equipmentComponentIds) {
    return resolveDefenseEquipmentComponentIdFromEquipmentList(equipmentComponentIds);
  }
  const ship = getShipDefinition(shipId);
  const resolvedComponentId = componentId ?? ship.defenseEquipmentComponentId ?? null;
  if (!resolvedComponentId) {
    return null;
  }
  if (DEFENSE_COMPONENT_OPTIONS.includes(resolvedComponentId)) {
    return resolvedComponentId;
  }
  return null;
}

export function resolveEquipmentComponentIds(
  shipId: string,
  componentIds?: readonly EquipmentComponentId[] | null
): EquipmentComponentId[] {
  const ship = getShipDefinition(shipId);
  if (componentIds) {
    return componentIds.filter((componentId): componentId is EquipmentComponentId =>
      isEquipmentComponentId(componentId)
    );
  }

  const defaults: EquipmentComponentId[] = [];
  if (ship.mobilityEquipmentComponentId && isMobilityEquipmentComponentId(ship.mobilityEquipmentComponentId)) {
    defaults.push(ship.mobilityEquipmentComponentId);
  }
  if (ship.defenseEquipmentComponentId && isDefenseEquipmentComponentId(ship.defenseEquipmentComponentId)) {
    defaults.push(ship.defenseEquipmentComponentId);
  }
  return defaults;
}

export function resolveMobilityEquipmentComponentIdFromEquipmentList(
  componentIds: readonly EquipmentComponentId[]
): MobilityComponentId | null {
  for (const componentId of componentIds) {
    if (isMobilityEquipmentComponentId(componentId)) {
      return componentId;
    }
  }
  return null;
}

export function resolveDefenseEquipmentComponentIdFromEquipmentList(
  componentIds: readonly EquipmentComponentId[]
): DefenseComponentId | null {
  for (const componentId of componentIds) {
    if (isDefenseEquipmentComponentId(componentId)) {
      return componentId;
    }
  }
  return null;
}
