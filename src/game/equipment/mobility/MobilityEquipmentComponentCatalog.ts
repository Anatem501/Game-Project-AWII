export const MOBILITY_EQUIPMENT_COMPONENT_OPTIONS = ["boost_thrusters"] as const;

export type MobilityEquipmentComponentId = (typeof MOBILITY_EQUIPMENT_COMPONENT_OPTIONS)[number];

export type MobilityEquipmentComponentDefinition = {
  id: MobilityEquipmentComponentId;
  name: string;
  equipmentClass: "Mobility";
  description: string;
  fuelPoints: number;
  boostMillisecondsPerPoint: number;
  forwardThrustSpeedRatio: number;
  rechargeDelaySeconds: number;
  rechargeMillisecondsPerPoint: number;
};

const MOBILITY_EQUIPMENT_COMPONENTS: Record<
  MobilityEquipmentComponentId,
  MobilityEquipmentComponentDefinition
> = {
  boost_thrusters: {
    id: "boost_thrusters",
    name: "Boost Thrusters",
    equipmentClass: "Mobility",
    description:
      "Integrated thrust overdrive that adds a sustained forward boost while fuel lasts, then recharges after a short delay.",
    fuelPoints: 10,
    boostMillisecondsPerPoint: 400,
    forwardThrustSpeedRatio: 0.4,
    rechargeDelaySeconds: 1,
    rechargeMillisecondsPerPoint: 500
  }
};

export function getMobilityEquipmentComponentDefinition(
  componentId: MobilityEquipmentComponentId
): MobilityEquipmentComponentDefinition {
  return MOBILITY_EQUIPMENT_COMPONENTS[componentId] ?? MOBILITY_EQUIPMENT_COMPONENTS.boost_thrusters;
}
