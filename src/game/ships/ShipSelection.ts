import { DEFAULT_SHIP_ID } from "./ShipCatalog";

export const PRIMARY_FIRE_COMPONENT_OPTIONS = ["repeating_laserbolt_fire"] as const;

export type PrimaryFireComponentId = (typeof PRIMARY_FIRE_COMPONENT_OPTIONS)[number];

export type ShipSelectionConfig = {
  shipId: string;
  primaryFireComponentId: PrimaryFireComponentId;
};

export function createDefaultShipSelection(shipId = DEFAULT_SHIP_ID): ShipSelectionConfig {
  return {
    shipId,
    primaryFireComponentId: "repeating_laserbolt_fire"
  };
}
