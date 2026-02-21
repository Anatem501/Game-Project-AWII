import * as THREE from "three";
import { createHurtboxComponent } from "../components/combat/HurtboxComponent";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import {
  createShipResourceComponent,
  type ShipResourceComponent,
  type ShipResourceConfig
} from "../components/ShipResourceComponent";
import enemyDualLaserTurretModelUrl from "../../assets/models/DualGunTurrretV1.glb?url";
import plasmaboltModelUrl from "../../assets/models/Plasmabolt-v01.glb?url";
import ionboltModelUrl from "../../assets/models/Ionbolt-v01.glb?url";
import { createCameraController } from "../controllers/CameraController";
import { createGunController } from "../controllers/GunController";
import {
  createMissileBayController,
  type MissileBayInstanceConfig
} from "../controllers/MissileBayController";
import { createPlayerController } from "../controllers/PlayerController";
import { createShipController } from "../controllers/ShipController";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createIonBoltFactory } from "../controllers/projectiles/IonBoltFactory";
import { createPlasmaBoltFactory } from "../controllers/projectiles/PlasmaBoltFactory";
import type { ProjectileFactory } from "../controllers/projectiles/ProjectileTypes";
import { createHealthComponent } from "../components/HealthComponent";
import { createCannonOverheatGlowEffect } from "../effects/CannonOverheatGlowEffect";
import { createCannonOverheatSteamEffect } from "../effects/CannonOverheatSteamEffect";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { EnemyDualLaserBoltTurret } from "../entities/EnemyDualLaserBoltTurret";
import { EnemyPlasmaboltTurret } from "../entities/EnemyPlasmaboltTurret";
import { getShipDefinition } from "../ships/ShipCatalog";
import {
  createDefaultShipSelection,
  resolveCannonPrimaryComponentId,
  resolveMissileBayComponentId,
  type ShipSelectionConfig
} from "../ships/ShipSelection";
import {
  getCannonPrimaryComponentDefinition,
  getMissileBayComponentDefinition
} from "../weapons/WeaponComponentCatalog";
import { createPlayerHealthHud, type HudMinimapSnapshot } from "../ui/PlayerHealthHud";
import { createEnvironment } from "./factories/EnvironmentFactory";
import { createShipRig } from "./factories/PlayerFactory";
import { createReticles } from "./factories/ReticleFactory";
import { snapToGrid } from "./utils/snapToGrid";

const GRID_TILE_SIZE = 22;
const GRID_DIVISIONS = 22;
const GRID_LINE_THICKNESS = 0.06;
const GRID_TILE_RADIUS = 1;
const GRID_Y = -0.96;
const FLOOR_Y = -1;
const RETICLE_HEIGHT = 0.03;
const RETICLE_MAX_DISTANCE_FROM_SHIP = 8;
const GUN_MIN_AIM_DISTANCE_FROM_SHIP = 2.5;
const GUN_MAX_AIM_ANGLE_RADIANS = THREE.MathUtils.degToRad(37.5);
const ENEMY_DUAL_TURRET_SPAWN = new THREE.Vector3(30, FLOOR_Y, -24);
const ENEMY_PLASMABOLT_TURRET_SPAWN = new THREE.Vector3(-34, FLOOR_Y, 28);
const PLAYER_HURTBOX_RADIUS = 1.05;
const ENEMY_DUAL_TURRET_HURTBOX_RADIUS = 1.3;
const ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET = new THREE.Vector3(0, 1, 0);
const TEST_MAP_TURRET_RESPAWN_SECONDS = 10;
const PLAYER_RESPAWN_SECONDS = 5;
const CAMERA_ARROW_KEY_ZOOM_ENABLED = true;
const LOCKING_RETICLE_SPIN_RATE_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(180);
const DEFAULT_PLAYER_THRUSTER_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.12, 0.58, 1.0),
  new THREE.Vector3(0.12, 0.58, 1.0)
];
const MAURADER_DEFAULT_MISSILE_CELL_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.42, 0.92, -0.34),
  new THREE.Vector3(-0.14, 0.9, -0.42),
  new THREE.Vector3(0.12, 0.9, -0.44),
  new THREE.Vector3(0.38, 0.92, -0.34)
];
const REPEATING_LASERBOLT_COMPONENT_ID = "repeating_laserbolt_fire";
const REPEATING_PLASMABOLT_COMPONENT_ID = "repeating_plasmabolt_fire";
const REPEATING_IONBOLT_COMPONENT_ID = "repeating_ionbolt_fire";
const CANNON_FIRE_INTERVAL_SECONDS = 0.5;
const HUD_MINIMAP_RANGE_METERS = 80;
const ENEMY_PLASMABOLT_EXTRA_HEAT_COST = 1;
const DEFAULT_PLAYER_RESOURCE_CONFIG: ShipResourceConfig = {
  maxHeat: 120,
  heatDissipationPerSecond: 14,
  maxEnergy: 100,
  energyRechargePerSecond: 11,
  minEnergyRatio: 0.5,
  plasmaHeatPerDamage: 0.7
};

const DEFAULT_ENEMY_RESOURCE_CONFIG: ShipResourceConfig = {
  maxHeat: 90,
  heatDissipationPerSecond: 10,
  maxEnergy: 0,
  energyRechargePerSecond: 0,
  plasmaHeatPerDamage: 0.75
};
const DEFAULT_ENEMY_PLASMABOLT_RESOURCE_CONFIG: ShipResourceConfig = {
  ...DEFAULT_ENEMY_RESOURCE_CONFIG,
  heatDissipationPerSecond: 6
};

export type TopDownSceneController = {
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type TopDownSceneOptions = {
  selection?: ShipSelectionConfig;
};

export function setupTopDownScene(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  options: TopDownSceneOptions = {}
): TopDownSceneController {
  const selection = options.selection ?? createDefaultShipSelection();
  const selectedShip = getShipDefinition(selection.shipId);
  const selectedCannonPrimaryComponentId = resolveCannonPrimaryComponentId(
    selectedShip.id,
    selection.cannonPrimaryComponentId
  );
  const shipMissileBays = selectedShip.missileBays ?? [];
  const selectedMissilePayloadComponentId = resolveMissileBayComponentId(
    selectedShip.id,
    selection.missileBayComponentId
  );
  const selectedMissilePayload = getMissileBayComponentDefinition(selectedMissilePayloadComponentId);
  const playerResources = createShipResourceComponent(DEFAULT_PLAYER_RESOURCE_CONFIG);
  let enemyDualTurretResources: ShipResourceComponent | null = null;
  let enemyPlasmaboltTurretResources: ShipResourceComponent | null = null;
  let playerThrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;
  let cannonOverheatGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect> | null = null;
  let cannonOverheatSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null = null;
  let missileBayController: ReturnType<typeof createMissileBayController> | null = null;

  const { floor, gridRoot } = createEnvironment(scene, {
    floorY: FLOOR_Y,
    gridDivisions: GRID_DIVISIONS,
    gridLineThickness: GRID_LINE_THICKNESS,
    gridTileRadius: GRID_TILE_RADIUS,
    gridTileSize: GRID_TILE_SIZE,
    gridY: GRID_Y
  });

  const missileCellLaunchers: THREE.Object3D[] = [];
  const missileBayLaunchers: MissileBayInstanceConfig[] = [];
  const rebuildMissileBayLaunchers = (bayLocalOffsets: readonly THREE.Vector3[][]): void => {
    for (const launcher of missileCellLaunchers) {
      launcher.removeFromParent();
    }
    missileCellLaunchers.length = 0;
    missileBayLaunchers.length = 0;

    for (let bayIndex = 0; bayIndex < shipMissileBays.length; bayIndex += 1) {
      const bayDefinition = shipMissileBays[bayIndex];
      const offsetsForBay = bayLocalOffsets[bayIndex] ?? [];
      const launchersForBay: THREE.Object3D[] = [];
      for (const localOffset of offsetsForBay) {
        const launcher = new THREE.Object3D();
        launcher.position.copy(localOffset);
        playerRoot.add(launcher);
        missileCellLaunchers.push(launcher);
        launchersForBay.push(launcher);
      }
      missileBayLaunchers.push({
        id: bayDefinition.id,
        payload: selectedMissilePayload,
        cells: launchersForBay
      });
    }

    missileBayController?.setMissileBays(missileBayLaunchers);
  };

  const applyMissileCellSockets = (
    missileCellSockets: Array<{ bayIndex: number; cellIndex: number; localOffset: THREE.Vector3 }>
  ): void => {
    const bayLocalOffsets = shipMissileBays.map((bayDefinition, bayOffsetIndex) => {
      const bayIndex = bayOffsetIndex + 1;
      const socketsForBay = missileCellSockets
        .filter((socket) => socket.bayIndex === bayIndex)
        .sort((a, b) => a.cellIndex - b.cellIndex);
      const limitedSockets =
        bayDefinition.maxCells !== undefined
          ? socketsForBay.filter((socket) => socket.cellIndex <= bayDefinition.maxCells!)
          : socketsForBay;
      return limitedSockets.map((socket) => socket.localOffset);
    });

    const hasSocketOffsets = bayLocalOffsets.some((offsets) => offsets.length > 0);
    if (
      !hasSocketOffsets &&
      selectedShip.id === "swift_interceptor" &&
      bayLocalOffsets.length > 0
    ) {
      bayLocalOffsets[0] = [...MAURADER_DEFAULT_MISSILE_CELL_LOCAL_OFFSETS];
    }

    rebuildMissileBayLaunchers(bayLocalOffsets);
  };

  const { gunHardpoints, playerRoot } = createShipRig(scene, {
    autoAlignGunHardpointsToModel: selectedShip.autoAlignGunHardpointsToModel,
    gunHardpointLocalOffsets: selectedShip.gunHardpointLocalOffsets,
    modelLocalOffset: selectedShip.modelLocalOffset,
    modelSizeMultiplier: selectedShip.modelSizeMultiplier,
    modelUrl: selectedShip.modelUrl,
    modelYawOffset: selectedShip.modelYawOffset,
    onThrusterSocketsResolved: (thrusterLocalOffsets, thrusterSizeScales) => {
      if (thrusterLocalOffsets.length === 0) {
        return;
      }
      playerThrusterEffect?.dispose();
      playerThrusterEffect = createPlayerThrusterEffect(playerRoot, {
        thrusterLocalOffsets,
        visualPreset: selectedShip.thrusterVisualPreset,
        effectScale: selectedShip.thrusterEffectScale,
        trailLengthScale: selectedShip.thrusterTrailLengthScale,
        glowOpacityScale: selectedShip.thrusterGlowOpacityScale,
        thrusterSizeScales:
          thrusterSizeScales.length === thrusterLocalOffsets.length
            ? thrusterSizeScales
            : undefined
      });
    },
    onMissileCellSocketsResolved: (missileCellSockets) => {
      applyMissileCellSockets(missileCellSockets);
    }
  });
  if (shipMissileBays.length > 0) {
    const fallbackOffsets = shipMissileBays.map(() => [] as THREE.Vector3[]);
    if (selectedShip.id === "swift_interceptor" && fallbackOffsets.length > 0) {
      fallbackOffsets[0] = [...MAURADER_DEFAULT_MISSILE_CELL_LOCAL_OFFSETS];
    }
    rebuildMissileBayLaunchers(fallbackOffsets);
  }
  cannonOverheatGlowEffect = createCannonOverheatGlowEffect(
    playerRoot,
    gunHardpoints,
    missileCellLaunchers
  );
  cannonOverheatSteamEffect = createCannonOverheatSteamEffect(scene, gunHardpoints);

  const { inputAimReticle, trueAimReticle } = createReticles(scene, {
    maxDistanceFromShip: RETICLE_MAX_DISTANCE_FROM_SHIP,
    reticleHeight: RETICLE_HEIGHT
  });
  const inputReticleMaterials: THREE.MeshBasicMaterial[] = [];
  inputAimReticle.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    if (!(node.material instanceof THREE.MeshBasicMaterial)) {
      return;
    }
    inputReticleMaterials.push(node.material);
  });
  playerThrusterEffect = createPlayerThrusterEffect(playerRoot, {
    thrusterLocalOffsets: DEFAULT_PLAYER_THRUSTER_LOCAL_OFFSETS,
    visualPreset: selectedShip.thrusterVisualPreset,
    effectScale: selectedShip.thrusterEffectScale,
    trailLengthScale: selectedShip.thrusterTrailLengthScale,
    glowOpacityScale: selectedShip.thrusterGlowOpacityScale
  });

  const shipController = createShipController({
    handling: selectedShip.handling,
    shipRoot: playerRoot
  });
  const playerSpawnPosition = playerRoot.position.clone();
  const playerSpawnYaw = shipController.getState().yaw;

  const playerController = createPlayerController({
    canvas,
    inputAimReticle,
    shipController,
    trueAimReticle
  });

  const playerHealth = createHealthComponent(selectedShip.health);
  const playerHurtbox = createHurtboxComponent({
    collisionArea: { radius: PLAYER_HURTBOX_RADIUS },
    faction: "player",
    health: playerHealth,
    owner: playerRoot
  });

  const primaryCannonProjectileFactoryByComponentId = new Map<string, ProjectileFactory>();
  const resolvePrimaryCannonProjectileFactory = (componentId: string) => {
    const cachedFactory = primaryCannonProjectileFactoryByComponentId.get(componentId);
    if (cachedFactory) {
      return cachedFactory;
    }

    const component = getCannonPrimaryComponentDefinition(componentId);
    const factory =
      componentId === REPEATING_PLASMABOLT_COMPONENT_ID
        ? createPlasmaBoltFactory({
            faction: "player",
            modelUrl: plasmaboltModelUrl,
            ...component.projectile
          })
        : componentId === REPEATING_IONBOLT_COMPONENT_ID
          ? createIonBoltFactory({
              faction: "player",
              modelUrl: ionboltModelUrl,
              ...component.projectile
            })
          : createLaserBoltFactory({
              faction: "player",
              ...component.projectile
            });
    primaryCannonProjectileFactoryByComponentId.set(componentId, factory);
    return factory;
  };
  const enemyTargetHurtboxes: HurtboxComponent[] = [];
  const minimapEnemyPosition = new THREE.Vector3();
  let enemyDualTurretHealth: ReturnType<typeof createHealthComponent> | null = null;
  let enemyDualLaserBoltTurret: EnemyDualLaserBoltTurret | null = null;
  let enemyDualTurretHurtbox: HurtboxComponent | null = null;
  let enemyDualTurretRespawnSecondsRemaining = 0;
  let enemyPlasmaboltTurretHealth: ReturnType<typeof createHealthComponent> | null = null;
  let enemyPlasmaboltTurret: EnemyPlasmaboltTurret | null = null;
  let enemyPlasmaboltTurretHurtbox: HurtboxComponent | null = null;
  let enemyPlasmaboltTurretRespawnSecondsRemaining = 0;
  let enemyPlasmaboltTurretProjectileFactory: ProjectileFactory | null = null;
  let enemyPlasmaboltTurretGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect> | null =
    null;
  let enemyPlasmaboltTurretSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null =
    null;

  const createEnemyTurretHealth = () =>
    createHealthComponent({
      maxArmor: 50,
      maxHull: 70,
      maxShield: 0,
      shieldChargeRate: 0,
      armorRepairRate: 0,
      hullRepairRate: 0,
      damageMultipliers: {
        default: {
          armor: 1,
          hull: 1,
          shield: 1
        },
        Laser: {
          armor: 1.05,
          hull: 1,
          shield: 1
        }
      }
    });

  const updateEnemyTargetHurtboxes = (): void => {
    enemyTargetHurtboxes.length = 0;
    if (enemyDualTurretHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyDualTurretHurtbox);
    }
    if (enemyPlasmaboltTurretHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyPlasmaboltTurretHurtbox);
    }
  };

  const buildMinimapSnapshot = (
    playerPosition: THREE.Vector3,
    playerYawRadians: number
  ): HudMinimapSnapshot => {
    const enemies: Array<{ x: number; z: number }> = [];
    for (const hurtbox of enemyTargetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(minimapEnemyPosition);
      enemies.push({
        x: minimapEnemyPosition.x,
        z: minimapEnemyPosition.z
      });
    }
    return {
      playerPosition: {
        x: playerPosition.x,
        z: playerPosition.z
      },
      playerYawRadians,
      enemies,
      range: HUD_MINIMAP_RANGE_METERS
    };
  };

  const enemyPlasmaboltPrimaryComponent = getCannonPrimaryComponentDefinition(
    REPEATING_PLASMABOLT_COMPONENT_ID
  );
  const enemyPlasmaboltHeatCost = Math.max(
    0,
    (enemyPlasmaboltPrimaryComponent.heatCost ?? 0) + ENEMY_PLASMABOLT_EXTRA_HEAT_COST
  );
  const enemyPlasmaboltEnergyCost = Math.max(0, enemyPlasmaboltPrimaryComponent.energyCost ?? 0);

  const spawnEnemyDualLaserBoltTurret = (): void => {
    enemyDualTurretResources = createShipResourceComponent(DEFAULT_ENEMY_RESOURCE_CONFIG);
    enemyDualTurretHealth = createEnemyTurretHealth();

    enemyDualLaserBoltTurret = new EnemyDualLaserBoltTurret(scene, {
      aimYawOffsetRadians: -Math.PI * 0.5,
      burstCooldownMaxSeconds: 5,
      burstCooldownMinSeconds: 2,
      burstShotCount: 6,
      burstWindupMaxSeconds: 0.35,
      burstWindupMinSeconds: 0.2,
      detectionRange: 20,
      leadFactor: 0.6,
      aimUpdateIntervalSeconds: 0.2,
      perGunFireIntervalSeconds: 0.3,
      horizontalSpreadRadians: THREE.MathUtils.degToRad(5),
      additionalSpreadAtMaxSpeedRadians: THREE.MathUtils.degToRad(4),
      fireRange: 34,
      modelDesiredSize: 1.95,
      modelHeightOffset: -1,
      modelUrl: enemyDualLaserTurretModelUrl,
      modelYawOffset: Math.PI,
      playerTarget: playerRoot,
      position: ENEMY_DUAL_TURRET_SPAWN,
      targetHurtboxes: [playerHurtbox],
      turnSpeedRadians: THREE.MathUtils.degToRad(150)
    });

    enemyDualTurretHurtbox = createHurtboxComponent({
      collisionArea: {
        radius: ENEMY_DUAL_TURRET_HURTBOX_RADIUS,
        localOffset: ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET
      },
      faction: "enemy",
      health: enemyDualTurretHealth,
      owner: enemyDualLaserBoltTurret.root,
      onHit: (hitEvent) => {
        enemyDualTurretResources?.applyIncomingDamageHeat(
          hitEvent.damagePacket.damageType,
          hitEvent.damagePacket.amount
        );
      }
    });

    updateEnemyTargetHurtboxes();
  };

  const despawnEnemyDualLaserBoltTurret = (): void => {
    enemyDualTurretHurtbox?.setEnabled(false);
    enemyDualLaserBoltTurret?.dispose();
    enemyDualLaserBoltTurret = null;
    enemyDualTurretHurtbox = null;
    enemyDualTurretResources = null;
    enemyDualTurretHealth = null;
    updateEnemyTargetHurtboxes();
  };

  const spawnEnemyPlasmaboltTurret = (): void => {
    enemyPlasmaboltTurretResources = createShipResourceComponent(
      DEFAULT_ENEMY_PLASMABOLT_RESOURCE_CONFIG
    );
    enemyPlasmaboltTurretHealth = createEnemyTurretHealth();
    enemyPlasmaboltTurretProjectileFactory = createPlasmaBoltFactory({
      faction: "enemy",
      modelUrl: plasmaboltModelUrl,
      ...enemyPlasmaboltPrimaryComponent.projectile
    });

    enemyPlasmaboltTurret = new EnemyPlasmaboltTurret(scene, {
      aimYawOffsetRadians: -Math.PI * 0.5,
      burstCooldownMaxSeconds: 5,
      burstCooldownMinSeconds: 2,
      burstShotCount: 6,
      burstWindupMaxSeconds: 0.35,
      burstWindupMinSeconds: 0.2,
      detectionRange: 20,
      leadFactor: 0.6,
      aimUpdateIntervalSeconds: 0.2,
      perGunFireIntervalSeconds: 0.3,
      horizontalSpreadRadians: THREE.MathUtils.degToRad(5),
      additionalSpreadAtMaxSpeedRadians: THREE.MathUtils.degToRad(4),
      fireRange: 34,
      modelDesiredSize: 1.95,
      modelHeightOffset: -1,
      modelUrl: enemyDualLaserTurretModelUrl,
      modelYawOffset: Math.PI,
      playerTarget: playerRoot,
      position: ENEMY_PLASMABOLT_TURRET_SPAWN,
      projectileFactory: enemyPlasmaboltTurretProjectileFactory,
      targetHurtboxes: [playerHurtbox],
      turnSpeedRadians: THREE.MathUtils.degToRad(150),
      consumeShotCost: () => {
        if (!enemyPlasmaboltTurretResources?.canFireCannons()) {
          return false;
        }
        return (
          enemyPlasmaboltTurretResources?.tryConsumeWeaponCost({
            heatCost: enemyPlasmaboltHeatCost,
            energyCost: enemyPlasmaboltEnergyCost
          }) ?? false
        );
      },
      getFireIntervalMultiplier: () =>
        enemyPlasmaboltTurretResources?.getWeaponFireIntervalMultiplier() ?? 1
    });

    enemyPlasmaboltTurretHurtbox = createHurtboxComponent({
      collisionArea: {
        radius: ENEMY_DUAL_TURRET_HURTBOX_RADIUS,
        localOffset: ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET
      },
      faction: "enemy",
      health: enemyPlasmaboltTurretHealth,
      owner: enemyPlasmaboltTurret.root,
      onHit: (hitEvent) => {
        enemyPlasmaboltTurretResources?.applyIncomingDamageHeat(
          hitEvent.damagePacket.damageType,
          hitEvent.damagePacket.amount
        );
      }
    });

    enemyPlasmaboltTurretGlowEffect = createCannonOverheatGlowEffect(
      enemyPlasmaboltTurret.root,
      enemyPlasmaboltTurret.getMuzzleObjects()
    );
    enemyPlasmaboltTurretSteamEffect = createCannonOverheatSteamEffect(
      scene,
      enemyPlasmaboltTurret.getMuzzleObjects()
    );
    updateEnemyTargetHurtboxes();
  };

  const despawnEnemyPlasmaboltTurret = (): void => {
    enemyPlasmaboltTurretHurtbox?.setEnabled(false);
    enemyPlasmaboltTurret?.dispose();
    enemyPlasmaboltTurret = null;
    enemyPlasmaboltTurretHurtbox = null;
    enemyPlasmaboltTurretHealth = null;
    enemyPlasmaboltTurretResources = null;
    enemyPlasmaboltTurretProjectileFactory?.dispose?.();
    enemyPlasmaboltTurretProjectileFactory = null;
    enemyPlasmaboltTurretGlowEffect?.dispose();
    enemyPlasmaboltTurretGlowEffect = null;
    enemyPlasmaboltTurretSteamEffect?.dispose();
    enemyPlasmaboltTurretSteamEffect = null;
    updateEnemyTargetHurtboxes();
  };

  spawnEnemyDualLaserBoltTurret();
  spawnEnemyPlasmaboltTurret();

  const primaryComponent = getCannonPrimaryComponentDefinition(selectedCannonPrimaryComponentId);
  const primaryHeatCost = Math.max(0, primaryComponent.heatCost ?? 0);
  const primaryEnergyCost = Math.max(0, primaryComponent.energyCost ?? 0);
  const primaryFireIntervalSeconds = CANNON_FIRE_INTERVAL_SECONDS;
  const primaryPhaseOffsets = resolveCannonPrimaryPhaseOffsets(
    selectedShip.id,
    selectedCannonPrimaryComponentId,
    gunHardpoints.length,
    primaryFireIntervalSeconds
  );
  const guns = gunHardpoints.map((hardpoint, hardpointIndex) => {
    return {
      primary: {
        fireIntervalSeconds: primaryFireIntervalSeconds,
        phaseOffsetSeconds: primaryPhaseOffsets[hardpointIndex] ?? 0,
        projectileFactory: resolvePrimaryCannonProjectileFactory(selectedCannonPrimaryComponentId),
        heatCost: primaryHeatCost,
        energyCost: primaryEnergyCost
      },
      hardpoint
    };
  });
  const gunController = createGunController({
    aimReticle: inputAimReticle,
    canvas,
    guns,
    maxAimAngleRadians: GUN_MAX_AIM_ANGLE_RADIANS,
    minAimDistanceFromShip: GUN_MIN_AIM_DISTANCE_FROM_SHIP,
    playerRoot,
    scene,
    consumePrimaryFireCost: (cost) => {
      if (!playerResources.canFireCannons()) {
        return false;
      }
      return playerResources.tryConsumeWeaponCost(cost);
    },
    getPrimaryFireIntervalMultiplier: () => playerResources.getWeaponFireIntervalMultiplier(),
    targetHurtboxes: enemyTargetHurtboxes
  });
  missileBayController = createMissileBayController({
    canvas,
    missileBays: missileBayLaunchers,
    minAimDistanceFromShip: GUN_MIN_AIM_DISTANCE_FROM_SHIP,
    maxAimAngleRadians: GUN_MAX_AIM_ANGLE_RADIANS,
    playerRoot,
    scene,
    consumeLauncherFireCost: (launcherPayload) => {
      const heatCost = launcherPayload.heatCost ?? 0;
      if (heatCost > 0 && !playerResources.canUseHeatEquipment()) {
        return false;
      }
      return playerResources.tryConsumeWeaponCost({
        heatCost,
        energyCost: launcherPayload.energyCost ?? 0
      });
    },
    getWeaponFireIntervalMultiplier: () =>
      playerResources.getWeaponFireIntervalMultiplier(),
    targetHurtboxes: enemyTargetHurtboxes
  });
  let playerIsDestroyed = false;
  let playerRespawnSecondsRemaining = 0;

  const cameraController = createCameraController({
    arrowKeyZoomEnabled: CAMERA_ARROW_KEY_ZOOM_ENABLED,
    camera,
    initialTargetPosition: shipController.getState().position,
    initialYaw: shipController.getState().yaw,
    maneuveringSpeed: selectedShip.handling.topManeuveringSpeed,
    thrustSpeed: selectedShip.handling.thrustSpeed
  });
  const hudRoot = canvas.parentElement ?? document.body;
  const playerHealthHud = createPlayerHealthHud(hudRoot);
  playerHealthHud.update(
    playerHealth.getSnapshot(),
    missileBayController?.getStatus(),
    playerResources.getSnapshot(),
    buildMinimapSnapshot(playerRoot.position, playerSpawnYaw)
  );
  const previousPlayerPosition = playerRoot.position.clone();
  const playerVelocity = new THREE.Vector3();
  const enemyTurretForward = new THREE.Vector3();
  let reticleLockSpinYaw = 0;
  const defaultInputReticleColor = new THREE.Color(0x7ce0ff);
  const lockingInputReticleColor = new THREE.Color(0xff6666);

  const update = (deltaTime: number): void => {
    let playerState = shipController.getState();
    playerResources.update(deltaTime);
    enemyDualTurretResources?.update(deltaTime);
    enemyPlasmaboltTurretResources?.update(deltaTime);
    if (!playerIsDestroyed) {
      playerState = playerController.update(deltaTime, camera);
    }
    gunController.update(deltaTime, playerState);
    missileBayController?.update(
      deltaTime,
      playerState.forward,
      playerState.yaw,
      camera,
      inputAimReticle.position
    );
    const missileStatus = missileBayController?.getStatus();
    const resourceSnapshot = playerResources.getSnapshot();
    const heat01 =
      resourceSnapshot.heat.max > 0
        ? THREE.MathUtils.clamp(resourceSnapshot.heat.current / resourceSnapshot.heat.max, 0, 1)
        : 0;
    const missilePayloadUsesHeat = (selectedMissilePayload.heatCost ?? 0) > 0;
    cannonOverheatGlowEffect?.update(
      deltaTime,
      heat01,
      resourceSnapshot.heat.overheated && missilePayloadUsesHeat
    );
    cannonOverheatSteamEffect?.update(
      deltaTime,
      resourceSnapshot.heat.overheated,
      playerState.forward
    );
    if (enemyPlasmaboltTurretResources) {
      const enemyResourceSnapshot = enemyPlasmaboltTurretResources.getSnapshot();
      const enemyHeat01 =
        enemyResourceSnapshot.heat.max > 0
          ? THREE.MathUtils.clamp(
              enemyResourceSnapshot.heat.current / enemyResourceSnapshot.heat.max,
              0,
              1
            )
          : 0;
      enemyPlasmaboltTurretGlowEffect?.update(deltaTime, enemyHeat01, false);

      if (enemyPlasmaboltTurret) {
        const enemyMuzzles = enemyPlasmaboltTurret.getMuzzleObjects();
        if (enemyMuzzles.length > 0) {
          enemyMuzzles[0].getWorldDirection(enemyTurretForward);
          enemyTurretForward.multiplyScalar(-1);
        } else {
          enemyPlasmaboltTurret.root.getWorldDirection(enemyTurretForward);
          enemyTurretForward.multiplyScalar(-1);
        }
      } else {
        enemyTurretForward.set(0, 0, -1);
      }
      enemyTurretForward.setY(0);
      if (enemyTurretForward.lengthSq() <= 0.000001) {
        enemyTurretForward.set(0, 0, -1);
      } else {
        enemyTurretForward.normalize();
      }

      enemyPlasmaboltTurretSteamEffect?.update(
        deltaTime,
        enemyResourceSnapshot.heat.overheated,
        enemyTurretForward
      );
    }
    if (missileStatus?.isLocking) {
      reticleLockSpinYaw += LOCKING_RETICLE_SPIN_RATE_RADIANS_PER_SECOND * deltaTime;
      for (const material of inputReticleMaterials) {
        material.color.copy(lockingInputReticleColor);
      }
    } else if ((missileStatus?.lockedTargetCount ?? 0) > 0) {
      reticleLockSpinYaw = THREE.MathUtils.damp(reticleLockSpinYaw, 0, 22, deltaTime);
      for (const material of inputReticleMaterials) {
        material.color.copy(defaultInputReticleColor);
      }
    } else {
      reticleLockSpinYaw = THREE.MathUtils.damp(reticleLockSpinYaw, 0, 12, deltaTime);
      for (const material of inputReticleMaterials) {
        material.color.copy(defaultInputReticleColor);
      }
    }
    inputAimReticle.rotation.y = playerState.yaw + reticleLockSpinYaw;

    if (enemyDualLaserBoltTurret && enemyDualTurretHealth) {
      enemyDualTurretHealth.update(deltaTime);
      enemyDualLaserBoltTurret.update(deltaTime);

      if (enemyDualTurretHealth.getSnapshot().destroyed) {
        despawnEnemyDualLaserBoltTurret();
        enemyDualTurretRespawnSecondsRemaining = TEST_MAP_TURRET_RESPAWN_SECONDS;
      }
    } else if (enemyDualTurretRespawnSecondsRemaining > 0) {
      enemyDualTurretRespawnSecondsRemaining = Math.max(
        0,
        enemyDualTurretRespawnSecondsRemaining - deltaTime
      );
      if (enemyDualTurretRespawnSecondsRemaining <= 0) {
        spawnEnemyDualLaserBoltTurret();
      }
    }
    if (enemyPlasmaboltTurret && enemyPlasmaboltTurretHealth) {
      enemyPlasmaboltTurretHealth.update(deltaTime);
      enemyPlasmaboltTurret.update(deltaTime);

      if (enemyPlasmaboltTurretHealth.getSnapshot().destroyed) {
        despawnEnemyPlasmaboltTurret();
        enemyPlasmaboltTurretRespawnSecondsRemaining = TEST_MAP_TURRET_RESPAWN_SECONDS;
      }
    } else if (enemyPlasmaboltTurretRespawnSecondsRemaining > 0) {
      enemyPlasmaboltTurretRespawnSecondsRemaining = Math.max(
        0,
        enemyPlasmaboltTurretRespawnSecondsRemaining - deltaTime
      );
      if (enemyPlasmaboltTurretRespawnSecondsRemaining <= 0) {
        spawnEnemyPlasmaboltTurret();
      }
    }

    if (!playerIsDestroyed) {
      playerHealth.update(deltaTime);
      if (playerHealth.getSnapshot().destroyed) {
        playerIsDestroyed = true;
        playerRespawnSecondsRemaining = PLAYER_RESPAWN_SECONDS;
        playerHurtbox.setEnabled(false);
        gunController.setEnabled(false);
        missileBayController?.setEnabled(false);
      }
    } else {
      playerRespawnSecondsRemaining = Math.max(0, playerRespawnSecondsRemaining - deltaTime);
      if (playerRespawnSecondsRemaining <= 0) {
        playerHealth.reset();
        playerResources.reset();
        shipController.reset(playerSpawnPosition, playerSpawnYaw);
        playerHurtbox.setEnabled(true);
        gunController.setEnabled(true);
        missileBayController?.setEnabled(true);
        playerIsDestroyed = false;
        playerState = shipController.getState();
      }
    }

    playerHealthHud.update(
      playerHealth.getSnapshot(),
      missileStatus,
      resourceSnapshot,
      buildMinimapSnapshot(playerState.position, playerState.yaw)
    );
    if (deltaTime > 0) {
      playerVelocity
        .copy(playerState.position)
        .sub(previousPlayerPosition)
        .multiplyScalar(1 / deltaTime);
    }
    previousPlayerPosition.copy(playerState.position);
    const signedForwardSpeed = playerVelocity.dot(playerState.forward);
    const forwardSpeed = Math.max(0, signedForwardSpeed);
    const thrusterGrowth = THREE.MathUtils.clamp(
      forwardSpeed / Math.max(0.001, selectedShip.handling.thrustSpeed),
      0,
      1
    );
    playerThrusterEffect?.update(deltaTime, thrusterGrowth);

    floor.position.x = playerState.position.x;
    floor.position.z = playerState.position.z;
    gridRoot.position.x = snapToGrid(playerState.position.x, GRID_TILE_SIZE);
    gridRoot.position.z = snapToGrid(playerState.position.z, GRID_TILE_SIZE);

    cameraController.update(deltaTime, playerState.position, playerState.yaw);
  };

  const dispose = (): void => {
    playerController.dispose();
    gunController.dispose();
    missileBayController?.dispose();
    missileBayController = null;
    cannonOverheatGlowEffect?.dispose();
    cannonOverheatGlowEffect = null;
    cannonOverheatSteamEffect?.dispose();
    cannonOverheatSteamEffect = null;
    cameraController.dispose();
    despawnEnemyDualLaserBoltTurret();
    despawnEnemyPlasmaboltTurret();
    playerThrusterEffect?.dispose();
    playerThrusterEffect = null;
    playerHealthHud.dispose();
  };

  return { update, dispose };
}

function resolveCannonPrimaryPhaseOffsets(
  shipId: string,
  primaryComponentId: string,
  cannonCount: number,
  fireIntervalSeconds: number
): number[] {
  if (cannonCount <= 0) {
    return [];
  }
  if (
    primaryComponentId !== REPEATING_LASERBOLT_COMPONENT_ID &&
    primaryComponentId !== REPEATING_PLASMABOLT_COMPONENT_ID &&
    primaryComponentId !== REPEATING_IONBOLT_COMPONENT_ID
  ) {
    return new Array(cannonCount).fill(0);
  }

  const phaseSlots = resolveRepeatingLaserboltPhaseSlots(shipId, cannonCount);
  const phaseCount = Math.max(1, ...phaseSlots) + 1;
  const clampedInterval = Math.max(0.001, fireIntervalSeconds);
  return phaseSlots.map((phaseSlot) => (phaseSlot / phaseCount) * clampedInterval);
}

function resolveRepeatingLaserboltPhaseSlots(shipId: string, cannonCount: number): number[] {
  if (shipId === "swift_interceptor") {
    if (cannonCount === 4) {
      return [0, 0, 1, 1];
    }
    if (cannonCount === 2) {
      return [0, 1];
    }
  }

  if (shipId === "test_fighter" || shipId === "vanguard_mk2" || shipId === "mx4_lancer") {
    return Array.from({ length: cannonCount }, (_, index) => index % 2);
  }

  // Default all other ships to alternating fire slots so repeating
  // plasmabolt fire inherits the same alternating behavior as laserbolt.
  return Array.from({ length: cannonCount }, (_, index) => index % 2);
}
