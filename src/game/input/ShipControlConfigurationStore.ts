export type ControlConfigurationTab = "kbm" | "controller";

export type ControlConfigurationControlSocket = {
  id: string;
  label: string;
};

export type ControlConfigurationConnectionsByTab = Record<
  ControlConfigurationTab,
  Record<string, string[]>
>;

export type ControlConfigurationControlsByTab = Record<
  ControlConfigurationTab,
  ControlConfigurationControlSocket[]
>;

export type ShipControlConfiguration = {
  connectionsByTab: ControlConfigurationConnectionsByTab;
  controlsByTab: ControlConfigurationControlsByTab;
};

export const GENERAL_COMPONENT_SOCKET_IDS = {
  cannonPrimaryFire: "general:cannon_primary_fire",
  beamEmitterPrimary: "general:beam_emitter_primary",
  missileBayPayload: "general:missile_payload",
  torpedoLauncherPayload: "general:torpedo_payload",
  builtInEquipment: "general:built_in_equipment"
} as const;

const shipControlConfigurations = new Map<string, ShipControlConfiguration>();

function cloneConnectionsByTab(
  connectionsByTab: ControlConfigurationConnectionsByTab
): ControlConfigurationConnectionsByTab {
  return {
    kbm: Object.fromEntries(
      Object.entries(connectionsByTab.kbm).map(([componentSocketId, controlSocketIds]) => [
        componentSocketId,
        [...controlSocketIds]
      ])
    ),
    controller: Object.fromEntries(
      Object.entries(connectionsByTab.controller).map(([componentSocketId, controlSocketIds]) => [
        componentSocketId,
        [...controlSocketIds]
      ])
    )
  };
}

function cloneControlsByTab(
  controlsByTab: ControlConfigurationControlsByTab
): ControlConfigurationControlsByTab {
  return {
    kbm: controlsByTab.kbm.map((controlSocket) => ({ ...controlSocket })),
    controller: controlsByTab.controller.map((controlSocket) => ({ ...controlSocket }))
  };
}

function cloneConfiguration(configuration: ShipControlConfiguration): ShipControlConfiguration {
  return {
    connectionsByTab: cloneConnectionsByTab(configuration.connectionsByTab),
    controlsByTab: cloneControlsByTab(configuration.controlsByTab)
  };
}

export function setShipControlConfiguration(
  shipId: string,
  configuration: ShipControlConfiguration
): void {
  shipControlConfigurations.set(shipId, cloneConfiguration(configuration));
}

export function getShipControlConfiguration(shipId: string): ShipControlConfiguration | null {
  const configuration = shipControlConfigurations.get(shipId);
  if (!configuration) {
    return null;
  }
  return cloneConfiguration(configuration);
}
