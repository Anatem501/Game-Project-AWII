import type { ShipController } from "../../controllers/ShipController";
import type { ShipDefinition } from "../../ships/ShipCatalog";
import { getMobilityEquipmentComponentDefinition } from "../mobility/MobilityEquipmentComponentCatalog";
import { createBoostThrustersBuiltInAbility } from "./BoostThrustersBuiltInAbility";
import type { PlayerBuiltInEquipmentAbility } from "./PlayerBuiltInEquipmentAbility";

type CreatePlayerMobilityEquipmentAbilityParams = {
  shipDefinition: ShipDefinition;
  shipController: ShipController;
};

export function createPlayerMobilityEquipmentAbility({
  shipDefinition,
  shipController
}: CreatePlayerMobilityEquipmentAbilityParams): PlayerBuiltInEquipmentAbility | null {
  if (!shipDefinition.mobilityEquipmentComponentId) {
    return null;
  }

  const mobilityComponent = getMobilityEquipmentComponentDefinition(
    shipDefinition.mobilityEquipmentComponentId
  );
  switch (mobilityComponent.id) {
    case "boost_thrusters":
      return createBoostThrustersBuiltInAbility({
        component: mobilityComponent,
        shipController
      });
    default:
      if (import.meta.env.DEV) {
        console.warn(
          `[PlayerMobilityEquipmentAbilityFactory] Unknown mobility component '${mobilityComponent.id}' for ship '${shipDefinition.id}'.`
        );
      }
      return null;
  }
}
