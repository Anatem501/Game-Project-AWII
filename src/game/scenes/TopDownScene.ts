import * as THREE from "three";
import { createHurtboxComponent } from "../components/combat/HurtboxComponent";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import {
  createShipResourceComponent,
  type ShipResourceComponent,
  type ShipResourceConfig
} from "../components/ShipResourceComponent";
import { createShipStatusComponent } from "../components/ShipStatusComponent";
import enemyDualLaserTurretModelUrl from "../../assets/models/DualGunTurrretV1.glb?url";
import plasmaboltModelUrl from "../../assets/models/Plasmabolt-v01.glb?url";
import ionboltModelUrl from "../../assets/models/Ionbolt-v01.glb?url";
import arcV03ModelUrl from "../../assets/models/Arc-v03.glb?url";
import arcV01ModelUrl from "../../assets/models/Arc-v01.glb?url";
import arcV02ModelUrl from "../../assets/models/Arc-v02.glb?url";
import cryoshardModelUrl from "../../assets/models/Cryoshard-v01.glb?url";
import orbModelUrl from "../../assets/models/Orb-v01.glb?url";
import orbV02ModelUrl from "../../assets/models/Orb-v02.glb?url";
import { createCameraController } from "../controllers/CameraController";
import { createGunController } from "../controllers/GunController";
import {
  createMissileBayController,
  type MissileBayInstanceConfig
} from "../controllers/MissileBayController";
import { createPlayerController } from "../controllers/PlayerController";
import { createShipController } from "../controllers/ShipController";
import type { ProjectileFactory } from "../controllers/projectiles/ProjectileTypes";
import { createHealthComponent, type HealthSnapshot } from "../components/HealthComponent";
import { createCannonOverheatGlowEffect } from "../effects/CannonOverheatGlowEffect";
import { createCannonOverheatSteamEffect } from "../effects/CannonOverheatSteamEffect";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { createShieldBubbleEffect } from "../effects/ShieldBubbleEffect";
import { createShipCryoFreezeSurfaceEffect } from "../effects/ShipCryoFreezeSurfaceEffect";
import { createShipElectroshockArcEmitterEffect } from "../effects/ShipElectroshockArcEmitterEffect";
import { createShipElectroshockSurfaceEffect } from "../effects/ShipElectroshockSurfaceEffect";
import { createPlayerBuiltInEquipmentAbility } from "../equipment/abilities/PlayerBuiltInEquipmentAbilityFactory";
import { EnemyDualLaserBoltTurret } from "../entities/EnemyDualLaserBoltTurret";
import { EnemyPlasmaboltTurret } from "../entities/EnemyPlasmaboltTurret";
import { EnemyCannonShipController } from "../enemies/EnemyCannonShipController";
import { EnemyMissileShipController } from "../enemies/EnemyMissileShipController";
import type { GameMapId } from "../modes/GameMode";
import { getShipDefinition } from "../ships/ShipCatalog";
import {
  createDefaultShipSelection,
  resolveCannonPrimaryComponentId,
  resolveMissileBayComponentId,
  type ShipSelectionConfig
} from "../ships/ShipSelection";
import {
  createCachedCannonPrimaryProjectileFactoryResolver,
  createCannonPrimaryProjectileFactory
} from "../weapons/CannonProjectileFactoryResolver";
import {
  getCannonPrimaryComponentDefinition,
  getMissileBayComponentDefinition
} from "../weapons/WeaponComponentCatalog";
import {
  createPlayerHealthHud,
  type HudBoundarySnapshot,
  type HudMinimapSnapshot
} from "../ui/PlayerHealthHud";
import { createEnemyAiDebugPanel } from "../ui/EnemyAiDebugPanel";
import { createEnvironment } from "./factories/EnvironmentFactory";
import {
  disposeEnemyCannonShipFactoryResources,
  createRoguePilotEnemyCannonShip,
  createRoguePilotEnemyPlasmaCannonShip,
  ROGUE_PILOT_CANNON_SHIP_ARCHETYPE,
  ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE
} from "./factories/EnemyCannonShipFactory";
import {
  createRoguePilotEnemyMissileShip,
  ROGUE_PILOT_MISSILE_SHIP_ARCHETYPE
} from "./factories/EnemyMissileShipFactory";
import { createShipRig } from "./factories/PlayerFactory";
import { createReticles } from "./factories/ReticleFactory";

const GRID_TILE_SIZE = 22;
const GRID_DIVISIONS = 22;
const GRID_LINE_THICKNESS = 0.06;
const GRID_TILE_RADIUS = 1;
const GRID_Y = -0.96;
const FLOOR_Y = -1;
const RETICLE_HEIGHT = 0.03;
const RETICLE_MAX_DISTANCE_FROM_SHIP = 8;
const RETICLE_ENEMY_HOVER_PADDING = 0.3;
const CONCUSSIVE_BARRAGE_COMPONENT_ID = "concussive_barrage_missiles";
const CONCUSSIVE_SWARM_COMPONENT_ID = "concussive_swarm_missiles";
const GUN_MIN_AIM_DISTANCE_FROM_SHIP = 2.5;
const GUN_MAX_AIM_ANGLE_RADIANS = THREE.MathUtils.degToRad(37.5);
const ENEMY_DUAL_TURRET_SPAWN = new THREE.Vector3(30, FLOOR_Y, -24);
const ENEMY_PLASMABOLT_TURRET_SPAWN = new THREE.Vector3(-34, FLOOR_Y, 28);
const PLAYER_HURTBOX_RADIUS = 1.05;
const ENEMY_DUAL_TURRET_HURTBOX_RADIUS = 1.3;
const ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET = new THREE.Vector3(0, 1, 0);
const SHIELD_HURTBOX_RADIUS_PADDING = 0.08;
const TEST_MAP_TURRET_RESPAWN_SECONDS = 10;
const PLAYER_RESPAWN_SECONDS = 5;
const CAMERA_ARROW_KEY_ZOOM_ENABLED = true;
const ROGUE_ARENA_CENTER_X = 0;
const ROGUE_ARENA_CENTER_Z = 0;
const ROGUE_ARENA_SOFT_RADIUS = 164;
const ROGUE_ARENA_HARD_RADIUS = 188;
const ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND = 16;
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
const LASERBEAM_PULSE_COMPONENT_ID = "laserbeam_pulse_fire";
const ELECTROMAGNETIC_RAILGUN_COMPONENT_ID = "electromagnetic_railgun";
const EXPLOSIVE_SHELL_FIRE_COMPONENT_ID = "explosive_shell_fire";
const REPEATING_PLASMABOLT_COMPONENT_ID = "repeating_plasmabolt_fire";
const REPEATING_VOIDBOLT_COMPONENT_ID = "repeating_voidbolt_fire";
const REPEATING_IONBOLT_COMPONENT_ID = "repeating_ionbolt_fire";
const REPEATING_CRYOSHARD_COMPONENT_ID = "repeating_cryoshard_fire";
const SOLAR_SEEKER_SHOTS_COMPONENT_ID = "solar_seeker_shots";
const VOID_SEEKER_FIRE_COMPONENT_ID = "void_seeker_fire";
const PLASMA_ARC_SHOTS_COMPONENT_ID = "plasma_arc_shots";
const CRYOWAVE_FIRE_COMPONENT_ID = "cryowave_fire";
const CANNON_FIRE_INTERVAL_SECONDS = 0.5;
const HUD_MINIMAP_RANGE_METERS = 80;
const ENEMY_PLASMABOLT_EXTRA_HEAT_COST = 1;
const DEFAULT_PLAYER_RESOURCE_CONFIG: ShipResourceConfig = {
  maxHeat: 120,
  heatDissipationPerSecond: 14,
  maxEnergy: 100,
  energyRechargePerSecond: 14,
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
  mapId?: GameMapId;
};

type ReticleTintMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

export function setupTopDownScene(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  options: TopDownSceneOptions = {}
): TopDownSceneController {
  const selection = options.selection ?? createDefaultShipSelection();
  const mapId = options.mapId ?? "test_map";
  const selectedShip = getShipDefinition(selection.shipId);
  const selectedCannonPrimaryComponentId = resolveCannonPrimaryComponentId(
    selectedShip.id,
    selection.cannonPrimaryComponentId
  );
  const shipMissileBays = selectedShip.missileBays ?? [];
  const playerHasMissileBays = shipMissileBays.length > 0;
  const selectedMissilePayloadComponentId = resolveMissileBayComponentId(
    selectedShip.id,
    selection.missileBayComponentId
  );
  const selectedMissilePayload = getMissileBayComponentDefinition(selectedMissilePayloadComponentId);
  const playerResources = createShipResourceComponent(DEFAULT_PLAYER_RESOURCE_CONFIG);
  let enemyDualTurretResources: ShipResourceComponent | null = null;
  let enemyPlasmaboltTurretResources: ShipResourceComponent | null = null;
  let playerThrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;
  let playerShieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null = null;
  let cannonOverheatGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect> | null = null;
  let cannonOverheatSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null = null;
  let missileBayController: ReturnType<typeof createMissileBayController> | null = null;

  const environment = createEnvironment(scene, {
    mapId,
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

  const { gunHardpoints, playerRoot, dispose: disposePlayerRig } = createShipRig(scene, {
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

  const { inputAimReticle, trueAimReticle, dispose: disposeReticles } = createReticles(scene, {
    maxDistanceFromShip: RETICLE_MAX_DISTANCE_FROM_SHIP,
    reticleHeight: RETICLE_HEIGHT
  });
  const inputReticleMaterials: Array<{
    material: ReticleTintMaterial;
    defaultColor: THREE.Color;
    defaultEmissive: THREE.Color | null;
  }> = [];
  inputAimReticle.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (
        !(material instanceof THREE.MeshBasicMaterial) &&
        !(material instanceof THREE.MeshStandardMaterial)
      ) {
        continue;
      }
      inputReticleMaterials.push({
        material,
        defaultColor: material.color.clone(),
        defaultEmissive:
          material instanceof THREE.MeshStandardMaterial ? material.emissive.clone() : null
      });
    }
  });
  playerThrusterEffect = createPlayerThrusterEffect(playerRoot, {
    thrusterLocalOffsets: DEFAULT_PLAYER_THRUSTER_LOCAL_OFFSETS,
    visualPreset: selectedShip.thrusterVisualPreset,
    effectScale: selectedShip.thrusterEffectScale,
    trailLengthScale: selectedShip.thrusterTrailLengthScale,
    glowOpacityScale: selectedShip.thrusterGlowOpacityScale
  });
  const playerStatus = createShipStatusComponent();
  playerResources.setHeatAddedListener((amount) => {
    playerStatus.applyHeatGain(amount);
  });
  const playerCryoSurfaceEffect = createShipCryoFreezeSurfaceEffect(playerRoot);
  const playerElectroshockSurfaceEffect = createShipElectroshockSurfaceEffect(playerRoot);
  const playerElectroshockArcEmitterEffect = createShipElectroshockArcEmitterEffect(playerRoot);

  const shipController = createShipController({
    handling: selectedShip.handling,
    shipRoot: playerRoot,
    getMoveSpeedMultiplier: () => playerStatus.getMoveSpeedMultiplier(),
    getTurnRateMultiplier: () => playerStatus.getTurnRateMultiplier(),
    getFrozenDriftVelocity: (out) => playerStatus.getFrozenDriftVelocity(out)
  });
  const playerSpawnPosition = playerRoot.position.clone();
  const playerSpawnYaw = shipController.getState().yaw;
  const playerBuiltInEquipmentAbility = createPlayerBuiltInEquipmentAbility({
    shipDefinition: selectedShip,
    shipController
  });

  const playerController = createPlayerController({
    canvas,
    inputAimReticle,
    shipController,
    trueAimReticle,
    builtInEquipmentAbility: playerBuiltInEquipmentAbility,
    getLockedAimForward: (out) => playerStatus.getLockedAimForward(out),
    canUseBuiltInEquipment: () => playerStatus.canUseEquipment()
  });

  const playerHealth = createHealthComponent(selectedShip.health);
  if (selectedShip.health.maxShield > 0) {
    playerShieldBubbleEffect = createShieldBubbleEffect(playerRoot);
  }
  const handlePlayerIncomingHit = (damagePacket: Parameters<typeof playerStatus.applyHitStatusPayloads>[0], breakdown: Parameters<typeof playerStatus.applyHitStatusPayloads>[1]): void => {
    playerResources.applyIncomingDamageHeat(damagePacket.damageType, breakdown.incomingBaseDamage);
    playerStatus.applyHitStatusPayloads(damagePacket, breakdown);
  };
  const playerHurtbox = createHurtboxComponent({
    collisionArea: { radius: PLAYER_HURTBOX_RADIUS },
    faction: "player",
    health: playerHealth,
    owner: playerRoot,
    transformIncomingDamagePacket: (damagePacket) =>
      playerStatus.transformIncomingDamagePacket(damagePacket),
    onHit: (event) => {
      if (event.worldHitPosition) {
        playerElectroshockSurfaceEffect.registerImpact(event.worldHitPosition);
      }
      handlePlayerIncomingHit(event.damagePacket, event.breakdown);
    }
  });
  let playerShieldHurtbox: HurtboxComponent | null = null;
  const playerTargetHurtboxes: HurtboxComponent[] = [];
  const updatePlayerTargetHurtboxes = (): void => {
    playerTargetHurtboxes.length = 0;
    if (playerShieldHurtbox?.isEnabled()) {
      playerTargetHurtboxes.push(playerShieldHurtbox);
    }
    if (playerHurtbox.isEnabled()) {
      playerTargetHurtboxes.push(playerHurtbox);
    }
  };
  const syncShieldHurtboxCollision = (
    shieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null,
    shieldHurtbox: HurtboxComponent | null,
    snapshot: HealthSnapshot
  ): void => {
    if (!shieldBubbleEffect || !shieldHurtbox) {
      return;
    }

    const collisionArea = shieldBubbleEffect.getCollisionArea();
    shieldHurtbox.setCollisionArea({
      radius: collisionArea.radius + SHIELD_HURTBOX_RADIUS_PADDING,
      localOffset: collisionArea.localOffset
    });
    const shieldActive = snapshot.shield.max > 0 && snapshot.shield.current > 0 && !snapshot.destroyed;
    shieldHurtbox.setEnabled(shieldActive);
  };
  if (playerShieldBubbleEffect && selectedShip.health.maxShield > 0) {
    const shieldCollisionArea = playerShieldBubbleEffect.getCollisionArea();
    playerShieldHurtbox = createHurtboxComponent({
      collisionArea: {
        radius: shieldCollisionArea.radius + SHIELD_HURTBOX_RADIUS_PADDING,
        localOffset: shieldCollisionArea.localOffset
      },
      faction: "player",
      health: playerHealth,
      owner: playerRoot,
      enabled: playerHealth.getSnapshot().shield.current > 0,
      transformIncomingDamagePacket: (damagePacket) =>
        playerStatus.transformIncomingDamagePacket(damagePacket),
      onHit: (event) => {
        if (event.worldHitPosition) {
          playerElectroshockSurfaceEffect.registerImpact(event.worldHitPosition);
        }
        handlePlayerIncomingHit(event.damagePacket, event.breakdown);
      }
    });
  }
  updatePlayerTargetHurtboxes();

  const primaryCannonProjectileFactoryResolver = createCachedCannonPrimaryProjectileFactoryResolver({
    faction: "player",
    assets: {
      arcModelUrl: arcV03ModelUrl,
      arcV01ModelUrl: arcV01ModelUrl,
      arcV02ModelUrl: arcV02ModelUrl,
      cryoshardModelUrl: cryoshardModelUrl,
      ionboltModelUrl: ionboltModelUrl,
      orbModelUrl: orbModelUrl,
      orbV02ModelUrl: orbV02ModelUrl,
      plasmaboltModelUrl: plasmaboltModelUrl
    }
  });
  const enemyTargetHurtboxes: HurtboxComponent[] = [];
  const minimapEnemyPosition = new THREE.Vector3();
  const reticleEnemyCenter = new THREE.Vector3();
  let enemyDualTurretHealth: ReturnType<typeof createHealthComponent> | null = null;
  let enemyDualLaserBoltTurret: EnemyDualLaserBoltTurret | null = null;
  let enemyDualTurretStatus: ReturnType<typeof createShipStatusComponent> | null = null;
  let enemyDualTurretCryoSurfaceEffect: ReturnType<typeof createShipCryoFreezeSurfaceEffect> | null =
    null;
  let enemyDualTurretElectroshockSurfaceEffect: ReturnType<
    typeof createShipElectroshockSurfaceEffect
  > | null = null;
  let enemyDualTurretElectroshockArcEmitterEffect: ReturnType<
    typeof createShipElectroshockArcEmitterEffect
  > | null = null;
  let enemyDualTurretHurtbox: HurtboxComponent | null = null;
  let enemyDualTurretShieldHurtbox: HurtboxComponent | null = null;
  let enemyDualTurretRespawnSecondsRemaining = 0;
  let enemyPlasmaboltTurretHealth: ReturnType<typeof createHealthComponent> | null = null;
  let enemyPlasmaboltTurret: EnemyPlasmaboltTurret | null = null;
  let enemyPlasmaboltTurretStatus: ReturnType<typeof createShipStatusComponent> | null = null;
  let enemyPlasmaboltTurretCryoSurfaceEffect: ReturnType<typeof createShipCryoFreezeSurfaceEffect> | null =
    null;
  let enemyPlasmaboltTurretElectroshockSurfaceEffect: ReturnType<
    typeof createShipElectroshockSurfaceEffect
  > | null = null;
  let enemyPlasmaboltTurretElectroshockArcEmitterEffect: ReturnType<
    typeof createShipElectroshockArcEmitterEffect
  > | null = null;
  let enemyPlasmaboltTurretHurtbox: HurtboxComponent | null = null;
  let enemyPlasmaboltTurretShieldHurtbox: HurtboxComponent | null = null;
  let enemyPlasmaboltTurretRespawnSecondsRemaining = 0;
  let enemyPlasmaboltTurretProjectileFactory: ProjectileFactory | null = null;
  let enemyDualTurretShieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null = null;
  let enemyPlasmaboltTurretGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect> | null =
    null;
  let enemyPlasmaboltTurretSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null =
    null;
  let enemyPlasmaboltTurretShieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null =
    null;
  let rogueEnemyCannonShip: EnemyCannonShipController | null = null;
  let rogueEnemyCannonShipRespawnSecondsRemaining = 0;
  let rogueEnemyPlasmaCannonShip: EnemyCannonShipController | null = null;
  let rogueEnemyPlasmaCannonShipRespawnSecondsRemaining = 0;
  const ROGUE_MISSILE_SHIP_COUNT = 2;
  const rogueEnemyMissileShips: Array<EnemyMissileShipController | null> = Array.from(
    { length: ROGUE_MISSILE_SHIP_COUNT },
    () => null
  );
  const rogueEnemyMissileShipRespawnSecondsRemaining: number[] = Array.from(
    { length: ROGUE_MISSILE_SHIP_COUNT },
    () => 0
  );

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
    if (enemyDualTurretShieldHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyDualTurretShieldHurtbox);
    }
    if (enemyDualTurretHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyDualTurretHurtbox);
    }
    if (enemyPlasmaboltTurretShieldHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyPlasmaboltTurretShieldHurtbox);
    }
    if (enemyPlasmaboltTurretHurtbox?.isEnabled()) {
      enemyTargetHurtboxes.push(enemyPlasmaboltTurretHurtbox);
    }
    if (rogueEnemyCannonShip?.hurtbox.isEnabled()) {
      enemyTargetHurtboxes.push(rogueEnemyCannonShip.hurtbox);
    }
    if (rogueEnemyPlasmaCannonShip?.hurtbox.isEnabled()) {
      enemyTargetHurtboxes.push(rogueEnemyPlasmaCannonShip.hurtbox);
    }
    for (const missileShip of rogueEnemyMissileShips) {
      if (missileShip?.hurtbox.isEnabled()) {
        enemyTargetHurtboxes.push(missileShip.hurtbox);
      }
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
  const buildBoundarySnapshot = (playerPosition: THREE.Vector3): HudBoundarySnapshot | undefined => {
    if (mapId !== "rogue_pilot_map") {
      return undefined;
    }
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
      centerPosition: {
        x: ROGUE_ARENA_CENTER_X,
        z: ROGUE_ARENA_CENTER_Z
      },
      softRadius: ROGUE_ARENA_SOFT_RADIUS,
      hardRadius: ROGUE_ARENA_HARD_RADIUS,
      enemies,
      range: ROGUE_ARENA_HARD_RADIUS + 10
    };
  };

  const isReticleOverEnemy = (
    reticleWorldPosition: THREE.Vector3,
    extraRadiusPadding: number
  ): boolean => {
    for (const hurtbox of enemyTargetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(reticleEnemyCenter);
      reticleEnemyCenter.y = reticleWorldPosition.y;
      const hitRadius = Math.max(
        0,
        hurtbox.collisionArea.radius + extraRadiusPadding
      );
      if (
        reticleWorldPosition.distanceToSquared(reticleEnemyCenter) <=
        hitRadius * hitRadius
      ) {
        return true;
      }
    }
    return false;
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
    enemyDualTurretStatus = createShipStatusComponent();
    enemyDualTurretResources.setHeatAddedListener((amount) => {
      enemyDualTurretStatus?.applyHeatGain(amount);
    });
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
      targetHurtboxes: playerTargetHurtboxes,
      turnSpeedRadians: THREE.MathUtils.degToRad(150),
      consumeShotCost: () => enemyDualTurretStatus?.canFireWeapons() ?? true,
      getTurnRateMultiplier: () => enemyDualTurretStatus?.getTurnRateMultiplier() ?? 1,
      getLockedAimWorldDirection: (out) => enemyDualTurretStatus?.getLockedAimForward(out) ?? null
    });
    enemyDualTurretCryoSurfaceEffect = createShipCryoFreezeSurfaceEffect(enemyDualLaserBoltTurret.root);
    enemyDualTurretElectroshockSurfaceEffect = createShipElectroshockSurfaceEffect(
      enemyDualLaserBoltTurret.root
    );
    enemyDualTurretElectroshockArcEmitterEffect = createShipElectroshockArcEmitterEffect(
      enemyDualLaserBoltTurret.root
    );

    enemyDualTurretHurtbox = createHurtboxComponent({
      collisionArea: {
        radius: ENEMY_DUAL_TURRET_HURTBOX_RADIUS,
        localOffset: ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET
      },
      faction: "enemy",
      health: enemyDualTurretHealth,
      owner: enemyDualLaserBoltTurret.root,
      transformIncomingDamagePacket: (damagePacket) =>
        enemyDualTurretStatus?.transformIncomingDamagePacket(damagePacket) ?? damagePacket,
      onHit: (hitEvent) => {
        if (hitEvent.worldHitPosition) {
          enemyDualTurretElectroshockSurfaceEffect?.registerImpact(hitEvent.worldHitPosition);
        }
        enemyDualTurretResources?.applyIncomingDamageHeat(
          hitEvent.damagePacket.damageType,
          hitEvent.breakdown.incomingBaseDamage
        );
        enemyDualTurretStatus?.applyHitStatusPayloads(hitEvent.damagePacket, hitEvent.breakdown);
      }
    });
    if (enemyDualTurretHealth.getSnapshot().shield.max > 0) {
      enemyDualTurretShieldBubbleEffect = createShieldBubbleEffect(enemyDualLaserBoltTurret.root);
      const shieldCollisionArea = enemyDualTurretShieldBubbleEffect.getCollisionArea();
      enemyDualTurretShieldHurtbox = createHurtboxComponent({
        collisionArea: {
          radius: shieldCollisionArea.radius + SHIELD_HURTBOX_RADIUS_PADDING,
          localOffset: shieldCollisionArea.localOffset
        },
        faction: "enemy",
        health: enemyDualTurretHealth,
        owner: enemyDualLaserBoltTurret.root,
        enabled: enemyDualTurretHealth.getSnapshot().shield.current > 0,
        transformIncomingDamagePacket: (damagePacket) =>
          enemyDualTurretStatus?.transformIncomingDamagePacket(damagePacket) ?? damagePacket,
        onHit: (hitEvent) => {
          if (hitEvent.worldHitPosition) {
            enemyDualTurretElectroshockSurfaceEffect?.registerImpact(hitEvent.worldHitPosition);
          }
          enemyDualTurretResources?.applyIncomingDamageHeat(
            hitEvent.damagePacket.damageType,
            hitEvent.breakdown.incomingBaseDamage
          );
          enemyDualTurretStatus?.applyHitStatusPayloads(hitEvent.damagePacket, hitEvent.breakdown);
        }
      });
    }

    updateEnemyTargetHurtboxes();
  };

  const despawnEnemyDualLaserBoltTurret = (): void => {
    enemyDualTurretShieldHurtbox?.setEnabled(false);
    enemyDualTurretHurtbox?.setEnabled(false);
    enemyDualTurretCryoSurfaceEffect?.dispose();
    enemyDualTurretCryoSurfaceEffect = null;
    enemyDualTurretElectroshockSurfaceEffect?.dispose();
    enemyDualTurretElectroshockSurfaceEffect = null;
    enemyDualTurretElectroshockArcEmitterEffect?.dispose();
    enemyDualTurretElectroshockArcEmitterEffect = null;
    enemyDualTurretResources?.setHeatAddedListener(null);
    enemyDualLaserBoltTurret?.dispose();
    enemyDualLaserBoltTurret = null;
    enemyDualTurretStatus = null;
    enemyDualTurretHurtbox = null;
    enemyDualTurretShieldHurtbox = null;
    enemyDualTurretShieldBubbleEffect?.dispose();
    enemyDualTurretShieldBubbleEffect = null;
    enemyDualTurretResources = null;
    enemyDualTurretHealth = null;
    updateEnemyTargetHurtboxes();
  };

  const spawnEnemyPlasmaboltTurret = (): void => {
    enemyPlasmaboltTurretResources = createShipResourceComponent(
      DEFAULT_ENEMY_PLASMABOLT_RESOURCE_CONFIG
    );
    enemyPlasmaboltTurretStatus = createShipStatusComponent();
    enemyPlasmaboltTurretResources.setHeatAddedListener((amount) => {
      enemyPlasmaboltTurretStatus?.applyHeatGain(amount);
    });
    enemyPlasmaboltTurretHealth = createEnemyTurretHealth();
    enemyPlasmaboltTurretProjectileFactory = createCannonPrimaryProjectileFactory(
      REPEATING_PLASMABOLT_COMPONENT_ID,
      {
        faction: "enemy",
        assets: {
          plasmaboltModelUrl: plasmaboltModelUrl
        }
      }
    );

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
      targetHurtboxes: playerTargetHurtboxes,
      turnSpeedRadians: THREE.MathUtils.degToRad(150),
      consumeShotCost: () => {
        if (!enemyPlasmaboltTurretStatus?.canFireWeapons()) {
          return false;
        }
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
        enemyPlasmaboltTurretResources?.getWeaponFireIntervalMultiplier() ?? 1,
      getTurnRateMultiplier: () => enemyPlasmaboltTurretStatus?.getTurnRateMultiplier() ?? 1,
      getLockedAimWorldDirection: (out) =>
        enemyPlasmaboltTurretStatus?.getLockedAimForward(out) ?? null
    });
    enemyPlasmaboltTurretCryoSurfaceEffect = createShipCryoFreezeSurfaceEffect(
      enemyPlasmaboltTurret.root
    );
    enemyPlasmaboltTurretElectroshockSurfaceEffect = createShipElectroshockSurfaceEffect(
      enemyPlasmaboltTurret.root
    );
    enemyPlasmaboltTurretElectroshockArcEmitterEffect = createShipElectroshockArcEmitterEffect(
      enemyPlasmaboltTurret.root
    );

    enemyPlasmaboltTurretHurtbox = createHurtboxComponent({
      collisionArea: {
        radius: ENEMY_DUAL_TURRET_HURTBOX_RADIUS,
        localOffset: ENEMY_DUAL_TURRET_HURTBOX_LOCAL_OFFSET
      },
      faction: "enemy",
      health: enemyPlasmaboltTurretHealth,
      owner: enemyPlasmaboltTurret.root,
      transformIncomingDamagePacket: (damagePacket) =>
        enemyPlasmaboltTurretStatus?.transformIncomingDamagePacket(damagePacket) ?? damagePacket,
      onHit: (hitEvent) => {
        if (hitEvent.worldHitPosition) {
          enemyPlasmaboltTurretElectroshockSurfaceEffect?.registerImpact(hitEvent.worldHitPosition);
        }
        enemyPlasmaboltTurretResources?.applyIncomingDamageHeat(
          hitEvent.damagePacket.damageType,
          hitEvent.breakdown.incomingBaseDamage
        );
        enemyPlasmaboltTurretStatus?.applyHitStatusPayloads(
          hitEvent.damagePacket,
          hitEvent.breakdown
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
    if (enemyPlasmaboltTurretHealth.getSnapshot().shield.max > 0) {
      enemyPlasmaboltTurretShieldBubbleEffect = createShieldBubbleEffect(
        enemyPlasmaboltTurret.root
      );
      const shieldCollisionArea = enemyPlasmaboltTurretShieldBubbleEffect.getCollisionArea();
      enemyPlasmaboltTurretShieldHurtbox = createHurtboxComponent({
        collisionArea: {
          radius: shieldCollisionArea.radius + SHIELD_HURTBOX_RADIUS_PADDING,
          localOffset: shieldCollisionArea.localOffset
        },
        faction: "enemy",
        health: enemyPlasmaboltTurretHealth,
        owner: enemyPlasmaboltTurret.root,
        enabled: enemyPlasmaboltTurretHealth.getSnapshot().shield.current > 0,
        transformIncomingDamagePacket: (damagePacket) =>
          enemyPlasmaboltTurretStatus?.transformIncomingDamagePacket(damagePacket) ?? damagePacket,
        onHit: (hitEvent) => {
          if (hitEvent.worldHitPosition) {
            enemyPlasmaboltTurretElectroshockSurfaceEffect?.registerImpact(hitEvent.worldHitPosition);
          }
          enemyPlasmaboltTurretResources?.applyIncomingDamageHeat(
            hitEvent.damagePacket.damageType,
            hitEvent.breakdown.incomingBaseDamage
          );
          enemyPlasmaboltTurretStatus?.applyHitStatusPayloads(
            hitEvent.damagePacket,
            hitEvent.breakdown
          );
        }
      });
    }
    updateEnemyTargetHurtboxes();
  };

  const despawnEnemyPlasmaboltTurret = (): void => {
    enemyPlasmaboltTurretShieldHurtbox?.setEnabled(false);
    enemyPlasmaboltTurretHurtbox?.setEnabled(false);
    enemyPlasmaboltTurretCryoSurfaceEffect?.dispose();
    enemyPlasmaboltTurretCryoSurfaceEffect = null;
    enemyPlasmaboltTurretElectroshockSurfaceEffect?.dispose();
    enemyPlasmaboltTurretElectroshockSurfaceEffect = null;
    enemyPlasmaboltTurretElectroshockArcEmitterEffect?.dispose();
    enemyPlasmaboltTurretElectroshockArcEmitterEffect = null;
    enemyPlasmaboltTurretResources?.setHeatAddedListener(null);
    enemyPlasmaboltTurret?.dispose();
    enemyPlasmaboltTurret = null;
    enemyPlasmaboltTurretStatus = null;
    enemyPlasmaboltTurretHurtbox = null;
    enemyPlasmaboltTurretShieldHurtbox = null;
    enemyPlasmaboltTurretHealth = null;
    enemyPlasmaboltTurretResources = null;
    enemyPlasmaboltTurretProjectileFactory?.dispose?.();
    enemyPlasmaboltTurretProjectileFactory = null;
    enemyPlasmaboltTurretGlowEffect?.dispose();
    enemyPlasmaboltTurretGlowEffect = null;
    enemyPlasmaboltTurretSteamEffect?.dispose();
    enemyPlasmaboltTurretSteamEffect = null;
    enemyPlasmaboltTurretShieldBubbleEffect?.dispose();
    enemyPlasmaboltTurretShieldBubbleEffect = null;
    updateEnemyTargetHurtboxes();
  };

  const spawnRogueEnemyCannonShip = (): void => {
    if (mapId !== "rogue_pilot_map") {
      return;
    }
    rogueEnemyCannonShip = createRoguePilotEnemyCannonShip(scene, playerRoot, playerTargetHurtboxes, {
      arenaCenter: new THREE.Vector3(ROGUE_ARENA_CENTER_X, FLOOR_Y, ROGUE_ARENA_CENTER_Z),
      arenaEdgeRadius: ROGUE_ARENA_HARD_RADIUS - 3,
      playerManeuverSpeed: selectedShip.handling.topManeuveringSpeed
    });

    updateEnemyTargetHurtboxes();
  };

  const despawnRogueEnemyCannonShip = (): void => {
    rogueEnemyCannonShip?.hurtbox.setEnabled(false);
    rogueEnemyCannonShip?.dispose();
    rogueEnemyCannonShip = null;
    updateEnemyTargetHurtboxes();
  };

  const spawnRogueEnemyPlasmaCannonShip = (): void => {
    if (mapId !== "rogue_pilot_map") {
      return;
    }
    rogueEnemyPlasmaCannonShip = createRoguePilotEnemyPlasmaCannonShip(
      scene,
      playerRoot,
      playerTargetHurtboxes,
      {
        arenaCenter: new THREE.Vector3(ROGUE_ARENA_CENTER_X, FLOOR_Y, ROGUE_ARENA_CENTER_Z),
        arenaEdgeRadius: ROGUE_ARENA_HARD_RADIUS - 3,
        playerManeuverSpeed: selectedShip.handling.topManeuveringSpeed
      }
    );

    updateEnemyTargetHurtboxes();
  };

  const despawnRogueEnemyPlasmaCannonShip = (): void => {
    rogueEnemyPlasmaCannonShip?.hurtbox.setEnabled(false);
    rogueEnemyPlasmaCannonShip?.dispose();
    rogueEnemyPlasmaCannonShip = null;
    updateEnemyTargetHurtboxes();
  };

  const spawnRogueEnemyMissileShip = (slotIndex: number): void => {
    if (mapId !== "rogue_pilot_map") {
      return;
    }
    rogueEnemyMissileShips[slotIndex]?.hurtbox.setEnabled(false);
    rogueEnemyMissileShips[slotIndex]?.dispose();
    rogueEnemyMissileShips[slotIndex] = createRoguePilotEnemyMissileShip(scene, playerRoot, playerTargetHurtboxes, {
      arenaCenter: new THREE.Vector3(ROGUE_ARENA_CENTER_X, FLOOR_Y, ROGUE_ARENA_CENTER_Z),
      arenaEdgeRadius: ROGUE_ARENA_HARD_RADIUS - 3
    });
    updateEnemyTargetHurtboxes();
  };

  const despawnRogueEnemyMissileShip = (slotIndex: number): void => {
    rogueEnemyMissileShips[slotIndex]?.hurtbox.setEnabled(false);
    rogueEnemyMissileShips[slotIndex]?.dispose();
    rogueEnemyMissileShips[slotIndex] = null;
    updateEnemyTargetHurtboxes();
  };

  spawnEnemyDualLaserBoltTurret();
  spawnEnemyPlasmaboltTurret();
  spawnRogueEnemyCannonShip();
  spawnRogueEnemyPlasmaCannonShip();
  for (let i = 0; i < ROGUE_MISSILE_SHIP_COUNT; i += 1) {
    spawnRogueEnemyMissileShip(i);
  }

  const primaryComponent = getCannonPrimaryComponentDefinition(selectedCannonPrimaryComponentId);
  const primaryHeatCost = Math.max(0, primaryComponent.heatCost ?? 0);
  const primaryEnergyCost = Math.max(0, primaryComponent.energyCost ?? 0);
  const primaryFireIntervalSeconds = Math.max(
    0.001,
    primaryComponent.fireIntervalSeconds ?? CANNON_FIRE_INTERVAL_SECONDS
  );
  const primaryFireIntervalSequenceSeconds = (primaryComponent.fireIntervalSequenceSeconds ?? []).map(
    (interval) => Math.max(0.001, interval)
  );
  const primaryPhaseOffsets = resolveCannonPrimaryPhaseOffsets(
    selectedShip.id,
    selectedCannonPrimaryComponentId,
    gunHardpoints.length,
    primaryFireIntervalSeconds
  );
  const primaryHitscanPulseConfig = primaryComponent.hitscanPulse
    ? {
        maxDistance: primaryComponent.hitscanPulse.maxDistance,
        pulseDurationSeconds: primaryComponent.hitscanPulse.pulseDurationSeconds,
        beamThickness: primaryComponent.hitscanPulse.beamThickness,
        damageAmount: primaryComponent.hitscanPulse.damage,
        damageType: (primaryComponent.hitscanPulse.damageType ?? "Laser") as const,
        sourceFaction: "player",
        hitSparkIntervalSeconds: primaryComponent.hitscanPulse.hitSparkIntervalSeconds,
        beamColor: primaryComponent.hitscanPulse.beamColor ?? 0x40ff6b,
        beamCoreColor: primaryComponent.hitscanPulse.beamCoreColor ?? 0xeefff4,
        effectStyle: primaryComponent.hitscanPulse.effectStyle ?? "default",
        explosionRadius: primaryComponent.hitscanPulse.explosionRadius,
        explosionDamageAmount: primaryComponent.hitscanPulse.explosionDamage
      }
    : null;
  const guns = gunHardpoints.map((hardpoint, hardpointIndex) => {
    return {
      primary: {
        fireIntervalSeconds: primaryFireIntervalSeconds,
        fireIntervalSequenceSeconds: primaryFireIntervalSequenceSeconds,
        fireIntervalMultiplierScope: primaryComponent.fireIntervalMultiplierScope ?? "all_steps",
        completeBurstOnRelease: primaryComponent.completeBurstOnRelease ?? false,
        reloadAfterShots: primaryComponent.reloadAfterShots,
        reloadDurationSeconds: primaryComponent.reloadDurationSeconds,
        shareReloadAcrossHardpoints: primaryComponent.shareReloadAcrossHardpoints ?? true,
        burstPhaseGroupId: undefined,
        burstPhaseGroupPattern: undefined,
        phaseOffsetSeconds: primaryPhaseOffsets[hardpointIndex] ?? 0,
        projectileFactory: primaryHitscanPulseConfig
          ? undefined
          : primaryCannonProjectileFactoryResolver.resolve(selectedCannonPrimaryComponentId),
        hitscanPulse: primaryHitscanPulseConfig ?? undefined,
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
    reticleHomingTargetPadding: RETICLE_ENEMY_HOVER_PADDING,
    consumePrimaryFireCost: (cost) => {
      if (!playerStatus.canFireWeapons()) {
        return false;
      }
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
      if (!playerStatus.canUseEquipment()) {
        return false;
      }
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
    initialYaw: shipController.getState().yaw
  });
  const hudRoot = canvas.parentElement ?? document.body;
  const playerHealthHud = createPlayerHealthHud(hudRoot);
  const enemyAiDebugPanel = createEnemyAiDebugPanel(hudRoot);
  const missileWarningLabelStyle = {
    color: "#ffbf86",
    secondaryColor: "#fff0dd",
    outlineColor: "#06212a",
    glowColor: "#ff8a3d",
    fontFamily: "\"Rajdhani\", \"Exo 2\", \"Orbitron\", sans-serif",
    fontWeight: "300",
    fontSizeRatio: 0.3,
    outlineWidthRatio: 0.02,
    outlineMinPx: 0,
    shadowBlurRatio: 0.05,
    holographic: true,
    width: 768,
    height: 112
  } as const;
  const playerNotificationMissileLockingLabel = createWorldTextSprite(
    "MISSILE LOCKING",
    missileWarningLabelStyle
  );
  const playerNotificationMissileIncomingLabel = createWorldTextSprite("MISSILE INCOMING", {
    ...missileWarningLabelStyle,
    color: "#ffb38a",
    secondaryColor: "#ffe7d9",
    glowColor: "#ff6f3f"
  });
  const playerNotificationOverheatedLabel = createWorldTextSprite("OVERHEATED", {
    ...missileWarningLabelStyle,
    color: "#ffb066",
    secondaryColor: "#ffe3c0",
    glowColor: "#ff7a2d"
  });
  const playerNotificationLowEnergyLabel = createWorldTextSprite("LOW ENERGY", {
    ...missileWarningLabelStyle,
    color: "#ffe56e",
    secondaryColor: "#fff7be",
    glowColor: "#ffd22e"
  });
  const playerNotificationLabels = [
    playerNotificationMissileIncomingLabel,
    playerNotificationMissileLockingLabel,
    playerNotificationOverheatedLabel,
    playerNotificationLowEnergyLabel
  ] as const;
  for (const label of playerNotificationLabels) {
    label.sprite.position.set(0, -1.34, 0.35);
    label.sprite.scale.set(3.75, 0.62, 1);
    label.sprite.center.set(0.5, 0.5);
    label.sprite.visible = false;
    label.material.opacity = 0;
    playerRoot.add(label.sprite);
  }
  playerHealthHud.update(
    playerHealth.getSnapshot(),
    playerHasMissileBays ? missileBayController?.getStatus() : undefined,
    playerController.getBuiltInEquipmentAbilityHudSnapshot(),
    playerResources.getSnapshot(),
    buildMinimapSnapshot(playerRoot.position, playerSpawnYaw),
    buildBoundarySnapshot(playerRoot.position)
  );
  const previousPlayerPosition = playerRoot.position.clone();
  const playerVelocity = new THREE.Vector3();
  const enemyTurretForward = new THREE.Vector3();
  const reticleCameraAlignmentCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2
  );
  const reticleSpinAxis = new THREE.Vector3(0, 1, 0);
  const staticTurretAimDirection = new THREE.Vector3();
  const staticTurretZeroVelocity = new THREE.Vector3();
  const reticleSpinQuaternion = new THREE.Quaternion();
  let reticleLockSpinYaw = 0;
  const lockingInputReticleColor = new THREE.Color(0xff6666);
  const lockingInputReticleEmissive = new THREE.Color(0xff2d2d);

  const update = (deltaTime: number): void => {
    let playerState = shipController.getState();
    playerResources.update(deltaTime);
    enemyDualTurretResources?.update(deltaTime);
    enemyPlasmaboltTurretResources?.update(deltaTime);
    if (!playerIsDestroyed) {
      playerState = playerController.update(deltaTime, camera);
    }
    playerStatus.syncMotionSample(playerState.forward, playerState.velocity);
    playerCryoSurfaceEffect.update(
      deltaTime,
      playerStatus.getCryoVisualIntensity01(),
      playerStatus.isCryofrozen()
    );
    playerElectroshockSurfaceEffect.update(
      deltaTime,
      playerStatus.getElectroshockVisualIntensity01(),
      playerStatus.isElectroshocked()
    );
    playerElectroshockArcEmitterEffect.update(
      deltaTime,
      playerStatus.getElectroshockVisualIntensity01(),
      playerStatus.isElectroshocked()
    );
    cameraController.setYawLock(
      !playerIsDestroyed ? playerController.getTemporaryManeuverCameraLockYaw() : null
    );
    gunController.update(deltaTime, playerState);
    rogueEnemyCannonShip?.setPlayerPrimaryFireActive(gunController.isPrimaryFireInputActive());
    rogueEnemyPlasmaCannonShip?.setPlayerPrimaryFireActive(gunController.isPrimaryFireInputActive());
    for (const missileShip of rogueEnemyMissileShips) {
      missileShip?.setPlayerPrimaryFireActive(gunController.isPrimaryFireInputActive());
    }
    missileBayController?.update(
      deltaTime,
      playerState.forward,
      playerState.yaw,
      camera,
      inputAimReticle.position
    );
    const missileStatus = playerHasMissileBays ? missileBayController?.getStatus() : undefined;
    const usesMissileLockReticleFeedback =
      selectedMissilePayloadComponentId === CONCUSSIVE_BARRAGE_COMPONENT_ID ||
      selectedMissilePayloadComponentId === CONCUSSIVE_SWARM_COMPONENT_ID;
    const reticleHoverPadding = usesMissileLockReticleFeedback
      ? Math.max(RETICLE_ENEMY_HOVER_PADDING, selectedMissilePayload.targetLocking.reticleRadiusPadding)
      : RETICLE_ENEMY_HOVER_PADDING;
    const reticleHoveringEnemy = isReticleOverEnemy(inputAimReticle.position, reticleHoverPadding);
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
    if (usesMissileLockReticleFeedback && missileStatus?.isLocking) {
      reticleLockSpinYaw += LOCKING_RETICLE_SPIN_RATE_RADIANS_PER_SECOND * deltaTime;
    } else {
      reticleLockSpinYaw = THREE.MathUtils.damp(reticleLockSpinYaw, 0, 12, deltaTime);
    }
    const shouldShowLockingColor =
      usesMissileLockReticleFeedback && (reticleHoveringEnemy || missileStatus?.isLocking);
    for (const reticleMaterial of inputReticleMaterials) {
      reticleMaterial.material.color.copy(
        shouldShowLockingColor ? lockingInputReticleColor : reticleMaterial.defaultColor
      );
      if (reticleMaterial.material instanceof THREE.MeshStandardMaterial) {
        reticleMaterial.material.emissive.copy(
          shouldShowLockingColor
            ? lockingInputReticleEmissive
            : (reticleMaterial.defaultEmissive ?? reticleMaterial.material.emissive)
        );
      }
    }
    let enemyMissileLockActive = false;
    let enemyMissileLockProgress01 = 0;
    let enemyMissileIncomingActive = false;
    for (const missileShip of rogueEnemyMissileShips) {
      if (!missileShip) {
        continue;
      }
      if (missileShip.isLockingPlayer()) {
        enemyMissileLockActive = true;
        enemyMissileLockProgress01 = Math.max(
          enemyMissileLockProgress01,
          missileShip.getLockProgress01()
        );
      }
      if (missileShip.hasIncomingHomingMissileThreat()) {
        enemyMissileIncomingActive = true;
      }
    }
    for (const label of playerNotificationLabels) {
      label.sprite.visible = false;
      label.material.opacity = 0;
    }
    const activePlayerNotifications: Array<{
      label: (typeof playerNotificationLabels)[number];
      strength01: number;
      pulseSpeed: number;
    }> = [];
    if (enemyMissileIncomingActive) {
      activePlayerNotifications.push({
        label: playerNotificationMissileIncomingLabel,
        strength01: 1,
        pulseSpeed: 0.028
      });
    }
    if (enemyMissileLockActive) {
      activePlayerNotifications.push({
        label: playerNotificationMissileLockingLabel,
        strength01: THREE.MathUtils.clamp(enemyMissileLockProgress01, 0, 1),
        pulseSpeed: 0.02
      });
    }
    if (resourceSnapshot.heat.overheated) {
      activePlayerNotifications.push({
        label: playerNotificationOverheatedLabel,
        strength01: 1,
        pulseSpeed: 0.024
      });
    }
    if (resourceSnapshot.energy.lowPower) {
      activePlayerNotifications.push({
        label: playerNotificationLowEnergyLabel,
        strength01: 1,
        pulseSpeed: 0.018
      });
    }
    const notificationBaseY = -1.34;
    const notificationStepY = 0.46;
    for (let i = 0; i < activePlayerNotifications.length; i += 1) {
      const notification = activePlayerNotifications[i];
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * notification.pulseSpeed + i * 0.6);
      const y = notificationBaseY - i * notificationStepY;
      notification.label.sprite.visible = true;
      notification.label.sprite.position.set(0, y, 0.35);
      notification.label.sprite.scale.set(
        3.75 + notification.strength01 * 0.16 + pulse * 0.045,
        0.62 + notification.strength01 * 0.03 + pulse * 0.015,
        1
      );
      notification.label.material.opacity = THREE.MathUtils.clamp(
        0.3 + notification.strength01 * 0.28 + pulse * 0.22,
        0,
        0.9
      );
    }
    const playerShieldCollisionSnapshot = playerHealth.getSnapshot();
    syncShieldHurtboxCollision(
      playerShieldBubbleEffect,
      playerShieldHurtbox,
      playerShieldCollisionSnapshot
    );
    const playerManeuverInvulnerable =
      !playerIsDestroyed && playerController.isTemporaryManeuverInvulnerable();
    if (!playerIsDestroyed) {
      playerHurtbox.setEnabled(!playerManeuverInvulnerable);
      if (playerManeuverInvulnerable) {
        playerShieldHurtbox?.setEnabled(false);
      }
    }
    updatePlayerTargetHurtboxes();

    if (enemyDualLaserBoltTurret && enemyDualTurretHealth) {
      if (enemyDualTurretStatus) {
        enemyDualLaserBoltTurret.getAimWorldDirection(staticTurretAimDirection);
        enemyDualTurretStatus.syncMotionSample(staticTurretAimDirection, staticTurretZeroVelocity);
        enemyDualTurretStatus.update(deltaTime);
        enemyDualTurretCryoSurfaceEffect?.update(
          deltaTime,
          enemyDualTurretStatus.getCryoVisualIntensity01(),
          enemyDualTurretStatus.isCryofrozen()
        );
        enemyDualTurretElectroshockSurfaceEffect?.update(
          deltaTime,
          enemyDualTurretStatus.getElectroshockVisualIntensity01(),
          enemyDualTurretStatus.isElectroshocked()
        );
        enemyDualTurretElectroshockArcEmitterEffect?.update(
          deltaTime,
          enemyDualTurretStatus.getElectroshockVisualIntensity01(),
          enemyDualTurretStatus.isElectroshocked()
        );
      }
      enemyDualTurretHealth.setShieldRechargeRateMultiplier(
        enemyDualTurretStatus?.getShieldRechargeRateMultiplier() ?? 1
      );
      enemyDualTurretHealth.update(deltaTime);
      const enemyDualTurretHealthSnapshot = enemyDualTurretHealth.getSnapshot();
      enemyDualTurretShieldBubbleEffect?.update(deltaTime, enemyDualTurretHealthSnapshot);
      syncShieldHurtboxCollision(
        enemyDualTurretShieldBubbleEffect,
        enemyDualTurretShieldHurtbox,
        enemyDualTurretHealthSnapshot
      );
      enemyDualLaserBoltTurret.update(deltaTime);
      updateEnemyTargetHurtboxes();

      if (enemyDualTurretHealthSnapshot.destroyed) {
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
      if (enemyPlasmaboltTurretStatus) {
        enemyPlasmaboltTurret.getAimWorldDirection(staticTurretAimDirection);
        enemyPlasmaboltTurretStatus.syncMotionSample(
          staticTurretAimDirection,
          staticTurretZeroVelocity
        );
        enemyPlasmaboltTurretStatus.update(deltaTime);
        enemyPlasmaboltTurretCryoSurfaceEffect?.update(
          deltaTime,
          enemyPlasmaboltTurretStatus.getCryoVisualIntensity01(),
          enemyPlasmaboltTurretStatus.isCryofrozen()
        );
        enemyPlasmaboltTurretElectroshockSurfaceEffect?.update(
          deltaTime,
          enemyPlasmaboltTurretStatus.getElectroshockVisualIntensity01(),
          enemyPlasmaboltTurretStatus.isElectroshocked()
        );
        enemyPlasmaboltTurretElectroshockArcEmitterEffect?.update(
          deltaTime,
          enemyPlasmaboltTurretStatus.getElectroshockVisualIntensity01(),
          enemyPlasmaboltTurretStatus.isElectroshocked()
        );
      }
      enemyPlasmaboltTurretHealth.setShieldRechargeRateMultiplier(
        enemyPlasmaboltTurretStatus?.getShieldRechargeRateMultiplier() ?? 1
      );
      enemyPlasmaboltTurretHealth.update(deltaTime);
      const enemyPlasmaboltTurretHealthSnapshot = enemyPlasmaboltTurretHealth.getSnapshot();
      enemyPlasmaboltTurretShieldBubbleEffect?.update(deltaTime, enemyPlasmaboltTurretHealthSnapshot);
      syncShieldHurtboxCollision(
        enemyPlasmaboltTurretShieldBubbleEffect,
        enemyPlasmaboltTurretShieldHurtbox,
        enemyPlasmaboltTurretHealthSnapshot
      );
      enemyPlasmaboltTurret.update(deltaTime);
      updateEnemyTargetHurtboxes();

      if (enemyPlasmaboltTurretHealthSnapshot.destroyed) {
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
    if (rogueEnemyCannonShip) {
      rogueEnemyCannonShip.update(deltaTime);
      if (rogueEnemyCannonShip.isDestroyed()) {
        despawnRogueEnemyCannonShip();
        rogueEnemyCannonShipRespawnSecondsRemaining = ROGUE_PILOT_CANNON_SHIP_ARCHETYPE.respawnSeconds;
      }
    } else if (mapId === "rogue_pilot_map" && rogueEnemyCannonShipRespawnSecondsRemaining > 0) {
      rogueEnemyCannonShipRespawnSecondsRemaining = Math.max(
        0,
        rogueEnemyCannonShipRespawnSecondsRemaining - deltaTime
      );
      if (rogueEnemyCannonShipRespawnSecondsRemaining <= 0) {
        spawnRogueEnemyCannonShip();
      }
    }
    if (rogueEnemyPlasmaCannonShip) {
      rogueEnemyPlasmaCannonShip.update(deltaTime);
      if (rogueEnemyPlasmaCannonShip.isDestroyed()) {
        despawnRogueEnemyPlasmaCannonShip();
        rogueEnemyPlasmaCannonShipRespawnSecondsRemaining =
          ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE.respawnSeconds;
      }
    } else if (
      mapId === "rogue_pilot_map" &&
      rogueEnemyPlasmaCannonShipRespawnSecondsRemaining > 0
    ) {
      rogueEnemyPlasmaCannonShipRespawnSecondsRemaining = Math.max(
        0,
        rogueEnemyPlasmaCannonShipRespawnSecondsRemaining - deltaTime
      );
      if (rogueEnemyPlasmaCannonShipRespawnSecondsRemaining <= 0) {
        spawnRogueEnemyPlasmaCannonShip();
      }
    }
    for (let i = 0; i < rogueEnemyMissileShips.length; i += 1) {
      const missileShip = rogueEnemyMissileShips[i];
      if (missileShip) {
        missileShip.update(deltaTime);
        if (missileShip.isDestroyed()) {
          despawnRogueEnemyMissileShip(i);
          rogueEnemyMissileShipRespawnSecondsRemaining[i] =
            ROGUE_PILOT_MISSILE_SHIP_ARCHETYPE.respawnSeconds;
        }
        continue;
      }
      if (mapId !== "rogue_pilot_map" || rogueEnemyMissileShipRespawnSecondsRemaining[i] <= 0) {
        continue;
      }
      rogueEnemyMissileShipRespawnSecondsRemaining[i] = Math.max(
        0,
        rogueEnemyMissileShipRespawnSecondsRemaining[i] - deltaTime
      );
      if (rogueEnemyMissileShipRespawnSecondsRemaining[i] <= 0) {
        spawnRogueEnemyMissileShip(i);
      }
    }

    if (!playerIsDestroyed) {
      playerStatus.update(deltaTime);
      playerHealth.setShieldRechargeRateMultiplier(
        (resourceSnapshot.energy.lowPower ? 0.5 : 1) * playerStatus.getShieldRechargeRateMultiplier()
      );
      playerHealth.update(deltaTime);
      const playerHealthSnapshot = playerHealth.getSnapshot();
      if (playerHealthSnapshot.destroyed) {
        playerIsDestroyed = true;
        playerRespawnSecondsRemaining = PLAYER_RESPAWN_SECONDS;
        playerHurtbox.setEnabled(false);
        playerShieldHurtbox?.setEnabled(false);
        updatePlayerTargetHurtboxes();
        gunController.setEnabled(false);
        missileBayController?.setEnabled(false);
      }
    } else {
      playerRespawnSecondsRemaining = Math.max(0, playerRespawnSecondsRemaining - deltaTime);
      if (playerRespawnSecondsRemaining <= 0) {
        playerHealth.reset();
        playerResources.reset();
        playerStatus.reset();
        shipController.reset(playerSpawnPosition, playerSpawnYaw);
        cameraController.setYawLock(null);
        playerHurtbox.setEnabled(true);
        playerShieldHurtbox?.setEnabled(playerHealth.getSnapshot().shield.current > 0);
        updatePlayerTargetHurtboxes();
        gunController.setEnabled(true);
        missileBayController?.setEnabled(true);
        playerIsDestroyed = false;
        playerState = shipController.getState();
      }
    }
    if (mapId === "rogue_pilot_map") {
      applyCircularBoundary2D(
        playerState.position,
        deltaTime,
        ROGUE_ARENA_CENTER_X,
        ROGUE_ARENA_CENTER_Z,
        ROGUE_ARENA_SOFT_RADIUS,
        ROGUE_ARENA_HARD_RADIUS,
        ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND
      );
      if (enemyDualLaserBoltTurret) {
        applyCircularBoundary2D(
          enemyDualLaserBoltTurret.root.position,
          deltaTime,
          ROGUE_ARENA_CENTER_X,
          ROGUE_ARENA_CENTER_Z,
          ROGUE_ARENA_SOFT_RADIUS,
          ROGUE_ARENA_HARD_RADIUS,
          ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND * 0.6
        );
      }
      if (enemyPlasmaboltTurret) {
        applyCircularBoundary2D(
          enemyPlasmaboltTurret.root.position,
          deltaTime,
          ROGUE_ARENA_CENTER_X,
          ROGUE_ARENA_CENTER_Z,
          ROGUE_ARENA_SOFT_RADIUS,
          ROGUE_ARENA_HARD_RADIUS,
          ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND * 0.6
        );
      }
      if (rogueEnemyCannonShip) {
        applyCircularBoundary2D(
          rogueEnemyCannonShip.root.position,
          deltaTime,
          ROGUE_ARENA_CENTER_X,
          ROGUE_ARENA_CENTER_Z,
          ROGUE_ARENA_SOFT_RADIUS,
          ROGUE_ARENA_HARD_RADIUS,
          ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND * 0.75
        );
      }
      if (rogueEnemyPlasmaCannonShip) {
        applyCircularBoundary2D(
          rogueEnemyPlasmaCannonShip.root.position,
          deltaTime,
          ROGUE_ARENA_CENTER_X,
          ROGUE_ARENA_CENTER_Z,
          ROGUE_ARENA_SOFT_RADIUS,
          ROGUE_ARENA_HARD_RADIUS,
          ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND * 0.75
        );
      }
      for (const missileShip of rogueEnemyMissileShips) {
        if (!missileShip) {
          continue;
        }
        applyCircularBoundary2D(
          missileShip.root.position,
          deltaTime,
          ROGUE_ARENA_CENTER_X,
          ROGUE_ARENA_CENTER_Z,
          ROGUE_ARENA_SOFT_RADIUS,
          ROGUE_ARENA_HARD_RADIUS,
          ROGUE_ARENA_RETURN_SPEED_UNITS_PER_SECOND * 0.65
        );
      }
    }

    const playerHealthSnapshot = playerHealth.getSnapshot();
    playerShieldBubbleEffect?.update(deltaTime, playerHealthSnapshot);
    const rogueEnemyDebugSnapshot =
      rogueEnemyCannonShip?.getDebugSnapshot() ??
      rogueEnemyPlasmaCannonShip?.getDebugSnapshot() ??
      null;
    enemyAiDebugPanel.update(
      rogueEnemyDebugSnapshot
        ? {
            state: rogueEnemyDebugSnapshot.state,
            burstCooldownSecondsRemaining:
              rogueEnemyDebugSnapshot.burstCooldownSecondsRemaining
          }
        : null
    );
    playerHealthHud.update(
      playerHealthSnapshot,
      missileStatus,
      playerController.getBuiltInEquipmentAbilityHudSnapshot(),
      resourceSnapshot,
      buildMinimapSnapshot(playerState.position, playerState.yaw),
      buildBoundarySnapshot(playerState.position)
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
    const playerSpeed01 = THREE.MathUtils.clamp(
      playerVelocity.length() / Math.max(0.001, selectedShip.handling.thrustSpeed),
      0,
      1
    );
    playerThrusterEffect?.update(deltaTime, thrusterGrowth);
    cameraController.update(deltaTime, playerState.position, playerState.yaw);
    environment.update(deltaTime, {
      playerPosition: playerState.position,
      cameraPosition: camera.position,
      playerVelocity,
      playerSpeed01
    });
    trueAimReticle.quaternion.copy(camera.quaternion).multiply(reticleCameraAlignmentCorrection);
    inputAimReticle.quaternion.copy(trueAimReticle.quaternion);
    reticleSpinQuaternion.setFromAxisAngle(reticleSpinAxis, reticleLockSpinYaw);
    inputAimReticle.quaternion.multiply(reticleSpinQuaternion);
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
    primaryCannonProjectileFactoryResolver.dispose();
    cameraController.dispose();
    despawnEnemyDualLaserBoltTurret();
    despawnEnemyPlasmaboltTurret();
    despawnRogueEnemyCannonShip();
    despawnRogueEnemyPlasmaCannonShip();
    for (let i = 0; i < rogueEnemyMissileShips.length; i += 1) {
      despawnRogueEnemyMissileShip(i);
    }
    disposeEnemyCannonShipFactoryResources();
    playerThrusterEffect?.dispose();
    playerThrusterEffect = null;
    playerShieldBubbleEffect?.dispose();
    playerShieldBubbleEffect = null;
    playerCryoSurfaceEffect.dispose();
    playerElectroshockSurfaceEffect.dispose();
    playerElectroshockArcEmitterEffect.dispose();
    playerResources.setHeatAddedListener(null);
    playerNotificationMissileLockingLabel.dispose();
    playerNotificationMissileIncomingLabel.dispose();
    playerNotificationOverheatedLabel.dispose();
    playerNotificationLowEnergyLabel.dispose();
    disposeReticles();
    disposePlayerRig();
    environment.dispose();
    playerHealthHud.dispose();
    enemyAiDebugPanel.dispose();
  };

  return { update, dispose };
}

function applyCircularBoundary2D(
  position: THREE.Vector3,
  deltaTime: number,
  centerX: number,
  centerZ: number,
  softRadius: number,
  hardRadius: number,
  inwardSpeedUnitsPerSecond: number
): void {
  const dx = position.x - centerX;
  const dz = position.z - centerZ;
  const distanceSq = dx * dx + dz * dz;
  const softRadiusSq = softRadius * softRadius;
  if (distanceSq <= softRadiusSq) {
    return;
  }

  const distance = Math.sqrt(distanceSq);
  if (distance <= 0.000001) {
    return;
  }

  const outwardX = dx / distance;
  const outwardZ = dz / distance;
  const softToHardDistance = Math.max(0.001, hardRadius - softRadius);
  const penetration01 = THREE.MathUtils.clamp(
    (distance - softRadius) / softToHardDistance,
    0,
    1
  );
  const inwardStep =
    inwardSpeedUnitsPerSecond *
    penetration01 *
    penetration01 *
    Math.max(0, deltaTime);

  position.x -= outwardX * inwardStep;
  position.z -= outwardZ * inwardStep;

  const clampedDx = position.x - centerX;
  const clampedDz = position.z - centerZ;
  const clampedDistanceSq = clampedDx * clampedDx + clampedDz * clampedDz;
  const hardRadiusSq = hardRadius * hardRadius;
  if (clampedDistanceSq <= hardRadiusSq) {
    return;
  }

  const clampedDistance = Math.sqrt(clampedDistanceSq);
  if (clampedDistance <= 0.000001) {
    position.x = centerX;
    position.z = centerZ;
    return;
  }

  const scale = hardRadius / clampedDistance;
  position.x = centerX + clampedDx * scale;
  position.z = centerZ + clampedDz * scale;
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
    primaryComponentId !== LASERBEAM_PULSE_COMPONENT_ID &&
    primaryComponentId !== ELECTROMAGNETIC_RAILGUN_COMPONENT_ID &&
    primaryComponentId !== EXPLOSIVE_SHELL_FIRE_COMPONENT_ID &&
    primaryComponentId !== REPEATING_PLASMABOLT_COMPONENT_ID &&
    primaryComponentId !== REPEATING_VOIDBOLT_COMPONENT_ID &&
    primaryComponentId !== REPEATING_IONBOLT_COMPONENT_ID &&
    primaryComponentId !== REPEATING_CRYOSHARD_COMPONENT_ID &&
    primaryComponentId !== SOLAR_SEEKER_SHOTS_COMPONENT_ID &&
    primaryComponentId !== VOID_SEEKER_FIRE_COMPONENT_ID &&
    primaryComponentId !== PLASMA_ARC_SHOTS_COMPONENT_ID &&
    primaryComponentId !== CRYOWAVE_FIRE_COMPONENT_ID
  ) {
    return new Array(cannonCount).fill(0);
  }

  const phaseSlots = resolveRepeatingLaserboltPhaseSlots(shipId, cannonCount);
  const phaseCount = Math.max(1, ...phaseSlots) + 1;
  const clampedInterval = Math.max(0.001, fireIntervalSeconds);
  return phaseSlots.map((phaseSlot) => (phaseSlot / phaseCount) * clampedInterval);
}

function resolveRepeatingLaserboltPhaseSlots(shipId: string, cannonCount: number): number[] {
  if (shipId === "test_fighter" && cannonCount === 4) {
    return [0, 0, 1, 1];
  }

  if (shipId === "b2_sparrowhawk" && cannonCount === 3) {
    // Fire pattern: [1,2] together, then [3].
    return [0, 0, 1];
  }

  if (shipId === "test_fighter") {
    return Array.from({ length: cannonCount }, (_, index) => index % 2);
  }

  // Default all other ships to alternating fire slots so repeating
  // plasmabolt fire inherits the same alternating behavior as laserbolt.
  return Array.from({ length: cannonCount }, (_, index) => index % 2);
}

function createWorldTextSprite(
  text: string,
  options: {
    color: string;
    secondaryColor?: string;
    outlineColor?: string;
    glowColor?: string;
    fontFamily?: string;
    fontWeight?: string | number;
    fontSizeRatio?: number;
    outlineWidthRatio?: number;
    outlineMinPx?: number;
    shadowBlurRatio?: number;
    holographic?: boolean;
    width?: number;
    height?: number;
  }
): {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  dispose: () => void;
} {
  const width = Math.max(64, Math.floor(options.width ?? 512));
  const height = Math.max(32, Math.floor(options.height ?? 128));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, width, height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    const fontSize = Math.floor(height * (options.fontSizeRatio ?? 0.42));
    const fontWeight = options.fontWeight ?? "700";
    const fontFamily = options.fontFamily ?? "Arial";
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    context.lineJoin = "round";
    context.shadowColor = options.glowColor ?? options.color;
    context.shadowBlur = Math.max(0, Math.floor(height * (options.shadowBlurRatio ?? 0.16)));
    context.strokeStyle = options.outlineColor ?? "rgba(0,0,0,0.85)";
    context.lineWidth = Math.max(
      options.outlineMinPx ?? 2,
      Math.floor(height * (options.outlineWidthRatio ?? 0.08))
    );
    if (context.lineWidth > 0) {
      context.strokeText(text, width * 0.5, height * 0.54);
    }
    if (options.holographic) {
      const gradient = context.createLinearGradient(0, height * 0.2, 0, height * 0.85);
      gradient.addColorStop(0, options.secondaryColor ?? "#f4ffff");
      gradient.addColorStop(0.35, options.color);
      gradient.addColorStop(0.68, options.secondaryColor ?? "#d6ffff");
      gradient.addColorStop(1, options.color);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = options.color;
    }
    context.fillText(text, width * 0.5, height * 0.54);

    if (options.holographic) {
      context.save();
      context.globalCompositeOperation = "source-atop";
      context.fillStyle = "rgba(255,255,255,0.18)";
      for (let y = Math.floor(height * 0.18); y < height; y += 5) {
        context.fillRect(0, y, width, 1);
      }
      context.fillStyle = "rgba(255,255,255,0.08)";
      context.fillRect(0, Math.floor(height * 0.28), width, 2);
      context.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0,
    toneMapped: false,
    blending: options.holographic ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;

  return {
    sprite,
    material,
    texture,
    dispose: () => {
      sprite.removeFromParent();
      material.dispose();
      texture.dispose();
    }
  };
}
