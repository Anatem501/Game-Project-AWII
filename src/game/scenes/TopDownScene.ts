import * as THREE from "three";
import { createHurtboxComponent } from "../components/combat/HurtboxComponent";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import enemyDualLaserTurretModelUrl from "../../assets/models/DualGunTurrretV1.glb?url";
import { createCameraController } from "../controllers/CameraController";
import { createGunController } from "../controllers/GunController";
import { createPlayerController } from "../controllers/PlayerController";
import { createShipController } from "../controllers/ShipController";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createHealthComponent } from "../components/HealthComponent";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { EnemyDualLaserBoltTurret } from "../entities/EnemyDualLaserBoltTurret";
import { getShipDefinition } from "../ships/ShipCatalog";
import { createPlayerHealthHud } from "../ui/PlayerHealthHud";
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
const ACTIVE_SHIP_ID = "test_fighter";
const PLAYER_HURTBOX_RADIUS = 1.05;
const ENEMY_DUAL_TURRET_HURTBOX_RADIUS = 1.3;
const TEST_MAP_TURRET_RESPAWN_SECONDS = 10;
const PLAYER_RESPAWN_SECONDS = 5;
const PLAYER_THRUSTER_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.12, 0.58, 1.0),
  new THREE.Vector3(0.12, 0.58, 1.0)
];

export type TopDownSceneController = {
  update: (deltaTime: number) => void;
  dispose: () => void;
};

export function setupTopDownScene(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
): TopDownSceneController {
  const selectedShip = getShipDefinition(ACTIVE_SHIP_ID);

  const { floor, gridRoot } = createEnvironment(scene, {
    floorY: FLOOR_Y,
    gridDivisions: GRID_DIVISIONS,
    gridLineThickness: GRID_LINE_THICKNESS,
    gridTileRadius: GRID_TILE_RADIUS,
    gridTileSize: GRID_TILE_SIZE,
    gridY: GRID_Y
  });

  const { gunHardpoints, playerRoot } = createShipRig(scene, {
    autoAlignGunHardpointsToModel: selectedShip.autoAlignGunHardpointsToModel,
    gunHardpointLocalOffsets: selectedShip.gunHardpointLocalOffsets,
    modelUrl: selectedShip.modelUrl,
    modelYawOffset: selectedShip.modelYawOffset
  });

  const { inputAimReticle, trueAimReticle } = createReticles(scene, {
    maxDistanceFromShip: RETICLE_MAX_DISTANCE_FROM_SHIP,
    reticleHeight: RETICLE_HEIGHT
  });
  const playerThrusterEffect = createPlayerThrusterEffect(playerRoot, {
    thrusterLocalOffsets: PLAYER_THRUSTER_LOCAL_OFFSETS
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

  const laserBoltFactory = createLaserBoltFactory({ faction: "player" });
  const enemyTargetHurtboxes: HurtboxComponent[] = [];
  let enemyDualTurretHealth: ReturnType<typeof createHealthComponent> | null = null;
  let enemyDualLaserBoltTurret: EnemyDualLaserBoltTurret | null = null;
  let enemyDualTurretHurtbox: HurtboxComponent | null = null;
  let turretRespawnSecondsRemaining = 0;

  const spawnEnemyDualLaserBoltTurret = (): void => {
    enemyDualTurretHealth = createHealthComponent({
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
      collisionArea: { radius: ENEMY_DUAL_TURRET_HURTBOX_RADIUS },
      faction: "enemy",
      health: enemyDualTurretHealth,
      owner: enemyDualLaserBoltTurret.root
    });

    enemyTargetHurtboxes.length = 0;
    enemyTargetHurtboxes.push(enemyDualTurretHurtbox);
  };

  const despawnEnemyDualLaserBoltTurret = (): void => {
    enemyDualTurretHurtbox?.setEnabled(false);
    enemyTargetHurtboxes.length = 0;
    enemyDualLaserBoltTurret?.dispose();
    enemyDualLaserBoltTurret = null;
    enemyDualTurretHurtbox = null;
    enemyDualTurretHealth = null;
  };

  spawnEnemyDualLaserBoltTurret();

  const guns = gunHardpoints.map((hardpoint) => ({
    fireIntervalSeconds: selectedShip.defaultGunFireIntervalSeconds,
    hardpoint,
    projectileFactory: laserBoltFactory
  }));
  const gunController = createGunController({
    aimReticle: inputAimReticle,
    canvas,
    guns,
    maxAimAngleRadians: GUN_MAX_AIM_ANGLE_RADIANS,
    minAimDistanceFromShip: GUN_MIN_AIM_DISTANCE_FROM_SHIP,
    playerRoot,
    scene,
    targetHurtboxes: enemyTargetHurtboxes
  });
  let playerIsDestroyed = false;
  let playerRespawnSecondsRemaining = 0;

  const cameraController = createCameraController({
    camera,
    initialTargetPosition: shipController.getState().position,
    initialYaw: shipController.getState().yaw
  });
  const hudRoot = canvas.parentElement ?? document.body;
  const playerHealthHud = createPlayerHealthHud(hudRoot);
  playerHealthHud.update(playerHealth.getSnapshot());
  const previousPlayerPosition = playerRoot.position.clone();
  const playerVelocity = new THREE.Vector3();

  const update = (deltaTime: number): void => {
    let playerState = shipController.getState();
    if (!playerIsDestroyed) {
      playerState = playerController.update(deltaTime, camera);
    }
    gunController.update(deltaTime, playerState);

    if (enemyDualLaserBoltTurret && enemyDualTurretHealth) {
      enemyDualTurretHealth.update(deltaTime);
      enemyDualLaserBoltTurret.update(deltaTime);

      if (enemyDualTurretHealth.getSnapshot().destroyed) {
        despawnEnemyDualLaserBoltTurret();
        turretRespawnSecondsRemaining = TEST_MAP_TURRET_RESPAWN_SECONDS;
      }
    } else if (turretRespawnSecondsRemaining > 0) {
      turretRespawnSecondsRemaining = Math.max(0, turretRespawnSecondsRemaining - deltaTime);
      if (turretRespawnSecondsRemaining <= 0) {
        spawnEnemyDualLaserBoltTurret();
      }
    }

    if (!playerIsDestroyed) {
      playerHealth.update(deltaTime);
      if (playerHealth.getSnapshot().destroyed) {
        playerIsDestroyed = true;
        playerRespawnSecondsRemaining = PLAYER_RESPAWN_SECONDS;
        playerHurtbox.setEnabled(false);
        gunController.setEnabled(false);
      }
    } else {
      playerRespawnSecondsRemaining = Math.max(0, playerRespawnSecondsRemaining - deltaTime);
      if (playerRespawnSecondsRemaining <= 0) {
        playerHealth.reset();
        shipController.reset(playerSpawnPosition, playerSpawnYaw);
        playerHurtbox.setEnabled(true);
        gunController.setEnabled(true);
        playerIsDestroyed = false;
        playerState = shipController.getState();
      }
    }

    playerHealthHud.update(playerHealth.getSnapshot());
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
    playerThrusterEffect.update(deltaTime, thrusterGrowth, signedForwardSpeed < -0.001);

    floor.position.x = playerState.position.x;
    floor.position.z = playerState.position.z;
    gridRoot.position.x = snapToGrid(playerState.position.x, GRID_TILE_SIZE);
    gridRoot.position.z = snapToGrid(playerState.position.z, GRID_TILE_SIZE);

    cameraController.update(deltaTime, playerState.position, playerState.yaw);
  };

  const dispose = (): void => {
    playerController.dispose();
    gunController.dispose();
    despawnEnemyDualLaserBoltTurret();
    playerThrusterEffect.dispose();
    playerHealthHud.dispose();
  };

  return { update, dispose };
}
