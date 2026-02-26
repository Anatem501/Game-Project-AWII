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
  const abilityId = shipDefinition.builtInEquipmentAbilityId;
  switch (abilityId) {
    case "aerobatic_roll":
      return createAerobaticRollBuiltInAbility({ shipController });
    default:
      if (import.meta.env.DEV && abilityId !== null && abilityId !== undefined) {
        console.warn(
          `[PlayerBuiltInEquipmentAbilityFactory] Unknown built-in ability '${abilityId}' for ship '${shipDefinition.id}'.`
        );
      }
      return null;
  }
}
