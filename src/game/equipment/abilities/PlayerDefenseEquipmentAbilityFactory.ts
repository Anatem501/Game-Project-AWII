import type { ShipController } from "../../controllers/ShipController";
import type { ShipDefinition } from "../../ships/ShipCatalog";
import { getDefenseEquipmentComponentDefinition } from "../defense/DefenseEquipmentComponentCatalog";
import { createBubbleShieldDefenseEquipmentAbility } from "./BubbleShieldDefenseEquipmentAbility";
import type { PlayerBuiltInEquipmentAbility } from "./PlayerBuiltInEquipmentAbility";

type CreatePlayerDefenseEquipmentAbilityParams = {
  shipDefinition: ShipDefinition;
  shipController: ShipController;
};

export function createPlayerDefenseEquipmentAbility({
  shipDefinition
}: CreatePlayerDefenseEquipmentAbilityParams): PlayerBuiltInEquipmentAbility | null {
  if (!shipDefinition.defenseEquipmentComponentId) {
    return null;
  }

  const defenseComponent = getDefenseEquipmentComponentDefinition(
    shipDefinition.defenseEquipmentComponentId
  );
  switch (defenseComponent.id) {
    case "bubble_shield":
      return createBubbleShieldDefenseEquipmentAbility({
        component: defenseComponent
      });
    default:
      if (import.meta.env.DEV) {
        console.warn(
          `[PlayerDefenseEquipmentAbilityFactory] Unknown defense component '${defenseComponent.id}' for ship '${shipDefinition.id}'.`
        );
      }
      return null;
  }
}
