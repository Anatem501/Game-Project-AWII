export type GameModeId = "testing_mode" | "rogue_pilot_mode";

export type GameMapId = "test_map" | "rogue_pilot_map";

export function resolveGameMapFromMode(modeId: GameModeId): GameMapId {
  return modeId === "rogue_pilot_mode" ? "rogue_pilot_map" : "test_map";
}

export function getGameModeLabel(modeId: GameModeId): string {
  return modeId === "rogue_pilot_mode" ? "Rogue Pilot Mode" : "Testing Mode";
}
