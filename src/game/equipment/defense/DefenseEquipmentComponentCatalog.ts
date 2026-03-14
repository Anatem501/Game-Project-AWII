export const DEFENSE_EQUIPMENT_COMPONENT_OPTIONS = ["bubble_shield"] as const;

export type DefenseEquipmentComponentId = (typeof DEFENSE_EQUIPMENT_COMPONENT_OPTIONS)[number];

export type DefenseEquipmentComponentDefinition = {
  id: DefenseEquipmentComponentId;
  name: string;
  equipmentClass: "Defense";
  description: string;
  durationSeconds: number;
  maxCharges: number;
  rechargeSecondsPerCharge: number;
};

const DEFENSE_EQUIPMENT_COMPONENTS: Record<
  DefenseEquipmentComponentId,
  DefenseEquipmentComponentDefinition
> = {
  bubble_shield: {
    id: "bubble_shield",
    name: "Bubble Shield",
    equipmentClass: "Defense",
    description:
      "Projects an impenetrable blue energy bubble around the ship for a short duration. Blocks all incoming damage while active.",
    durationSeconds: 3,
    maxCharges: 3,
    rechargeSecondsPerCharge: 30
  }
};

export function getDefenseEquipmentComponentDefinition(
  componentId: DefenseEquipmentComponentId
): DefenseEquipmentComponentDefinition {
  return DEFENSE_EQUIPMENT_COMPONENTS[componentId] ?? DEFENSE_EQUIPMENT_COMPONENTS.bubble_shield;
}
