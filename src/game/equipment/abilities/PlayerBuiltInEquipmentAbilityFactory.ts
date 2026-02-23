import type { ShipController } from "../../controllers/ShipController";
import type { ShipDefinition } from "../../ships/ShipCatalog";
import { createAerobaticRollBuiltInAbility } from "./AerobaticRollBuiltInAbility";
import type { PlayerBuiltInEquipmentAbility } from "./PlayerBuiltInEquipmentAbility";

type CreatePlayerBuiltInEquipmentAbilityParams = {
  shipDefinition: ShipDefinition;
  shipController: ShipController;
};

export function createPlayerBuiltInEquipmentAbility({
  shipDefinition,
  shipController
}: CreatePlayerBuiltInEquipmentAbilityParams): PlayerBuiltInEquipmentAbility | null {
  switch (shipDefinition.builtInEquipmentAbilityId) {
    case "aerobatic_roll":
      return createAerobaticRollBuiltInAbility({ shipController });
    default:
      return null;
  }
}

