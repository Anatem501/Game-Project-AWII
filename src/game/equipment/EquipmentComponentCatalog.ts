import {
  MOBILITY_EQUIPMENT_COMPONENT_OPTIONS,
  getMobilityEquipmentComponentDefinition,
  type MobilityEquipmentComponentDefinition,
  type MobilityEquipmentComponentId
} from "./mobility/MobilityEquipmentComponentCatalog";
import {
  DEFENSE_EQUIPMENT_COMPONENT_OPTIONS,
  getDefenseEquipmentComponentDefinition,
  type DefenseEquipmentComponentDefinition,
  type DefenseEquipmentComponentId
} from "./defense/DefenseEquipmentComponentCatalog";

export type EquipmentComponentId = MobilityEquipmentComponentId | DefenseEquipmentComponentId;
export type EquipmentComponentDefinition =
  | MobilityEquipmentComponentDefinition
  | DefenseEquipmentComponentDefinition;

export const EQUIPMENT_COMPONENT_OPTIONS: readonly EquipmentComponentId[] = [
  ...MOBILITY_EQUIPMENT_COMPONENT_OPTIONS,
  ...DEFENSE_EQUIPMENT_COMPONENT_OPTIONS
];

export function isMobilityEquipmentComponentId(
  componentId: string
): componentId is MobilityEquipmentComponentId {
  return (MOBILITY_EQUIPMENT_COMPONENT_OPTIONS as readonly string[]).includes(componentId);
}

export function isDefenseEquipmentComponentId(
  componentId: string
): componentId is DefenseEquipmentComponentId {
  return (DEFENSE_EQUIPMENT_COMPONENT_OPTIONS as readonly string[]).includes(componentId);
}

export function isEquipmentComponentId(componentId: string): componentId is EquipmentComponentId {
  return (EQUIPMENT_COMPONENT_OPTIONS as readonly string[]).includes(componentId);
}

export function getEquipmentComponentDefinition(
  componentId: EquipmentComponentId
): EquipmentComponentDefinition {
  if (isMobilityEquipmentComponentId(componentId)) {
    return getMobilityEquipmentComponentDefinition(componentId);
  }
  return getDefenseEquipmentComponentDefinition(componentId);
}
