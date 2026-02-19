import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DamagePacket } from "../components/combat/CombatTypes";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import {
  DEFAULT_MISSILE_BAY_COMPONENT_ID,
  getMissileBayComponentDefinition,
  type MissileBayComponentDefinition,
  type MissileModelAssetId
} from "../weapons/WeaponComponentCatalog";
import standardConcussiveMissileModelUrl from "../../assets/models/Standard-Concussive-Missile-v01.glb?url";
import microConcussiveMissileModelUrl from "../../assets/models/Micro-Concussive-Missile-v01.glb?url";

const MISSILE_FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const MISSILE_BODY_LENGTH = 0.42;
const MISSILE_BODY_RADIUS = 0.075;
const MISSILE_NOSE_LENGTH = 0.2;
const MISSILE_MODEL_SCALE_MULTIPLIER = 0.5;
const MISSILE_LIFETIME_FALLBACK_SECONDS = 4.5;
const MISSILE_AIM_MIN_DISTANCE_FROM_LAUNCHER = 1.25;
const MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS = 0.065;
const MISSILE_LAUNCHER_AIM_OFFSET_SCALE = 1;
const SMOKE_DRAG_PER_SECOND = 2.6;
const LAUNCH_SMOKE_COUNT = 6;
const FIRE_FLASH_DURATION_SECONDS = 0.2;
const DEFAULT_LOCK_ACQUIRE_SECONDS = 0.6;
const DEFAULT_LOCK_RETICLE_RADIUS_PADDING = 2.5;
const DEFAULT_LOCK_PROGRESS_DECAY_DELAY_SECONDS = 2;
const DEFAULT_LOCK_PROGRESS_DECAY_SECONDS = 2.5;
const MISSILE_HOMING_TURN_RATE_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(110);
const MISSILE_HOMING_DELAY_SECONDS = 0.5;
const UNLOCKED_RETICLE_OVERSHOOT_DISTANCE = 2;
const SWARM_DEFAULT_FALLBACK_AIM_ANGLE_RADIANS = THREE.MathUtils.degToRad(60);
const SWARM_DEFAULT_FALLBACK_AIM_DISTANCE = 40;
const SPLINE_MIN_TRAVEL_DURATION_SECONDS = 0.22;
const SPLINE_MAX_TRAVEL_DURATION_SECONDS = 2.8;
const TURN_RATE_EPSILON_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(3);
const EXPLOSION_FLASH_LIFETIME_SECONDS = 0.28;
const EXPLOSION_FLASH_BASE_RADIUS = 0.28;
const LOCKED_TARGET_INDICATOR_Y_OFFSET = 0;
const LOCKED_TARGET_INDICATOR_BASE_SCALE = 0.44;
const LOCKED_TARGET_INDICATOR_EXTRA_RADIUS = 0.32;
const LOCKED_TARGET_INDICATOR_INNER_SCALE_FACTOR = 0.84;
const LOCKED_TARGET_STACK_LABEL_SCALE_FACTOR = 0.36;
const LOCKED_TARGET_STACK_LABEL_X_OFFSET_FACTOR = 0.48;
const LOCKED_TARGET_STACK_LABEL_Y_OFFSET_FACTOR = -0.48;
const LOCKED_TARGET_OUTER_ROTATE_SPEED_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(44);
const LOCKED_TARGET_INNER_ROTATE_SPEED_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(-96);
const LOCK_OFFSCREEN_GRACE_SECONDS = 3;
const MISSILE_DEBUG_SPEED_OVERRIDE: number | null = null;
const FALLBACK_MISSILE_PAYLOAD = getMissileBayComponentDefinition(DEFAULT_MISSILE_BAY_COMPONENT_ID);

type ActiveMissile = {
  flightMode: "homing" | "spline";
  fuseRadius: number;
  guidanceGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  homingDelayRemaining: number;
  lifeRemaining: number;
  object: THREE.Group;
  payload: MissileBayComponentDefinition;
  splinePath: {
    controlA: THREE.Vector3;
    controlB: THREE.Vector3;
    destination: THREE.Vector3;
    durationSeconds: number;
    elapsedSeconds: number;
    start: THREE.Vector3;
  } | null;
  targetHurtboxId: string | null;
  trailSpawnSeconds: number;
  thrusterCore: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  thrusterGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
};

type ActiveExplosion = {
  age: number;
  maxScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

type ActiveSmokeParticle = {
  age: number;
  endScale: number;
  lifetime: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startOpacity: number;
  startScale: number;
  velocity: THREE.Vector3;
};

type TargetLockState = {
  decayDelaySeconds: number;
  hasVelocitySample: boolean;
  hurtbox: HurtboxComponent;
  lockSeconds: number;
  lockStacks: number;
  lockVelocity: THREE.Vector3;
  lockWorldCenter: THREE.Vector3;
  locked: boolean;
  offScreenSeconds: number;
};

type LockedTargetIndicator = {
  inner: THREE.Sprite;
  innerMaterial: THREE.SpriteMaterial;
  lockStackLabel: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D | null;
    lastRenderedValue: number;
    material: THREE.SpriteMaterial;
    sprite: THREE.Sprite;
    texture: THREE.CanvasTexture;
  };
  outer: THREE.Sprite;
  outerMaterial: THREE.SpriteMaterial;
};

type MissileBayControllerParams = {
  canvas: HTMLCanvasElement;
  playerRoot: THREE.Object3D;
  scene: THREE.Scene;
  missileBays?: readonly MissileBayInstanceConfig[];
  // Legacy single-bay params (kept for compatibility paths).
  cellsPerLauncherHint?: number;
  launcherCountHint?: number;
  missileCells?: readonly THREE.Object3D[];
  minAimDistanceFromShip?: number;
  maxAimAngleRadians?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
  payload?: MissileBayComponentDefinition;
};

export type MissileBayInstanceConfig = {
  cells: readonly THREE.Object3D[];
  id: string;
  payload: MissileBayComponentDefinition;
};

export type MissileBayStatus = {
  ammoCapacity: number;
  ammoLoaded: number;
  cellsPerLauncher: number;
  firedFlashSeconds: number;
  isLocking: boolean;
  launcherCount: number;
  launcherIds: string[];
  launcherLoadedCounts: number[];
  launcherPayloadNames: string[];
  launcherReloadingFlags: boolean[];
  isReloading: boolean;
  lockedTargetCount: number;
  lockingProgress01: number;
  reloadProgress01: number;
};

export type MissileBayController = {
  update: (
    deltaTime: number,
    shipForward: THREE.Vector3,
    shipYaw: number,
    camera: THREE.Camera,
    aimTargetWorldPosition?: THREE.Vector3
  ) => void;
  getStatus: () => MissileBayStatus;
  setEnabled: (enabled: boolean) => void;
  setMissileBays: (missileBays: readonly MissileBayInstanceConfig[]) => void;
  setMissileCells: (missileCells: readonly THREE.Object3D[]) => void;
  dispose: () => void;
};

export function createMissileBayController({
  canvas,
  missileBays = [],
  cellsPerLauncherHint,
  launcherCountHint,
  playerRoot,
  scene,
  missileCells = [],
  minAimDistanceFromShip = MISSILE_AIM_MIN_DISTANCE_FROM_LAUNCHER,
  maxAimAngleRadians = Math.PI,
  targetHurtboxes = [],
  payload
}: MissileBayControllerParams): MissileBayController {
  const root = new THREE.Group();
  scene.add(root);

  const missileBodyGeometry = new THREE.CylinderGeometry(
    MISSILE_BODY_RADIUS,
    MISSILE_BODY_RADIUS * 0.84,
    MISSILE_BODY_LENGTH,
    10
  );
  const missileBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f636f,
    emissive: 0x1b1f2b,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.62
  });
  const missileNoseGeometry = new THREE.ConeGeometry(MISSILE_BODY_RADIUS * 0.88, MISSILE_NOSE_LENGTH, 10);
  const missileNoseMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d828f,
    roughness: 0.4,
    metalness: 0.68
  });
  const thrusterCoreGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const thrusterGlowGeometry = new THREE.SphereGeometry(0.05, 10, 10);
  const guidanceGlowGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
  const explosionFlashGeometry = new THREE.SphereGeometry(EXPLOSION_FLASH_BASE_RADIUS, 14, 12);
  const modelLoader = new GLTFLoader();

  const missileDirection = new THREE.Vector3();
  const missileVelocity = new THREE.Vector3();
  const missileAimVector = new THREE.Vector3();
  const shipToAim = new THREE.Vector3();
  const smokeSpawnPosition = new THREE.Vector3();
  const smokeDriftVelocity = new THREE.Vector3();
  const smokeTrailDirection = new THREE.Vector3();
  const lockTargetCenter = new THREE.Vector3();
  const currentMissileDirection = new THREE.Vector3();
  const desiredMissileDirection = new THREE.Vector3();
  const homingQuaternion = new THREE.Quaternion();
  const projectedTargetNdc = new THREE.Vector3();
  const clampedForward = new THREE.Vector3();
  const crossForwardAim = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const shotQuaternion = new THREE.Quaternion();
  const modelAlignQuaternion = new THREE.Quaternion();
  const splineTangentQuaternion = new THREE.Quaternion();
  const scratchHurtboxCenter = new THREE.Vector3();
  const scratchExplosionCenter = new THREE.Vector3();
  const scratchAimTargetWorld = new THREE.Vector3();
  const launcherLocalOffset = new THREE.Vector3();
  const launcherWorldOffset = new THREE.Vector3();
  const scratchLaunchDirection = new THREE.Vector3();
  const scratchSplineControlA = new THREE.Vector3();
  const scratchSplineControlB = new THREE.Vector3();
  const scratchSplineDestination = new THREE.Vector3();
  const scratchSplinePerpendicular = new THREE.Vector3();
  const scratchSplineDirection = new THREE.Vector3();
  const scratchReticleScatterOffset = new THREE.Vector3();
  const scratchPredictedVelocity = new THREE.Vector3();
  const scratchCameraRight = new THREE.Vector3();
  const scratchCameraUp = new THREE.Vector3();
  const scratchPreviousPosition = new THREE.Vector3();
  const scratchBezierPosition = new THREE.Vector3();
  const scratchBezierDirection = new THREE.Vector3();
  const scratchModelSize = new THREE.Vector3();
  const scratchModelCenter = new THREE.Vector3();
  const scratchModelForward = new THREE.Vector3();

  const missileModelTemplates: Partial<Record<MissileModelAssetId, THREE.Object3D>> = {};

  const loadMissileModelTemplate = (
    modelAssetId: MissileModelAssetId,
    modelUrl: string,
    warningLabel: string
  ): void => {
    modelLoader.load(
      modelUrl,
    (gltf) => {
      const template = gltf.scene;
      const box = new THREE.Box3().setFromObject(template);
      box.getSize(scratchModelSize);
      box.getCenter(scratchModelCenter);

      let longestAxisIndex = 0;
      if (scratchModelSize.y > scratchModelSize.x && scratchModelSize.y >= scratchModelSize.z) {
        longestAxisIndex = 1;
      } else if (scratchModelSize.z > scratchModelSize.x && scratchModelSize.z > scratchModelSize.y) {
        longestAxisIndex = 2;
      }

      const positiveExtent =
        longestAxisIndex === 0
          ? box.max.x - scratchModelCenter.x
          : longestAxisIndex === 1
            ? box.max.y - scratchModelCenter.y
            : box.max.z - scratchModelCenter.z;
      const negativeExtent =
        longestAxisIndex === 0
          ? scratchModelCenter.x - box.min.x
          : longestAxisIndex === 1
            ? scratchModelCenter.y - box.min.y
            : scratchModelCenter.z - box.min.z;
      const forwardSign = positiveExtent >= negativeExtent ? 1 : -1;

      scratchModelForward.set(0, 0, 0);
      if (longestAxisIndex === 0) {
        scratchModelForward.x = forwardSign;
      } else if (longestAxisIndex === 1) {
        scratchModelForward.y = forwardSign;
      } else {
        scratchModelForward.z = forwardSign;
      }

      modelAlignQuaternion.setFromUnitVectors(scratchModelForward, MISSILE_FORWARD_AXIS);
      template.applyQuaternion(modelAlignQuaternion);

      const alignedBox = new THREE.Box3().setFromObject(template);
      const alignedSize = alignedBox.getSize(scratchModelSize);
      const maxDimension = Math.max(alignedSize.x, alignedSize.y, alignedSize.z) || 1;
      const normalizedScale = (MISSILE_BODY_LENGTH / maxDimension) * MISSILE_MODEL_SCALE_MULTIPLIER;
      template.scale.setScalar(normalizedScale);

      const scaledBox = new THREE.Box3().setFromObject(template);
      scaledBox.getCenter(scratchModelCenter);
      template.position.sub(scratchModelCenter);
      template.position.z += MISSILE_BODY_LENGTH * 0.1;
      missileModelTemplates[modelAssetId] = template;
    },
    undefined,
    (error) => {
      console.warn(`Failed to load ${warningLabel} missile model, using fallback missile mesh.`, error);
    }
  );
  };

  loadMissileModelTemplate(
    "standard_concussive",
    standardConcussiveMissileModelUrl,
    "standard concussive"
  );
  loadMissileModelTemplate(
    "micro_concussive",
    microConcussiveMissileModelUrl,
    "micro concussive"
  );

  const activeMissiles: ActiveMissile[] = [];
  const activeExplosions: ActiveExplosion[] = [];
  const activeSmokeParticles: ActiveSmokeParticle[] = [];
  const targetLockStates = new Map<string, TargetLockState>();
  const activeVolleyTargetIds = new Set<string>();
  const activeVolleyTargetLockCounts = new Map<string, number>();
  const lockedTargetIndicators = new Map<string, LockedTargetIndicator>();

  let missileBayInstances: MissileBayInstanceConfig[] = [];
  let missileLauncherGroups: THREE.Object3D[][] = [];
  let launcherPayloads: MissileBayComponentDefinition[] = [];
  let launcherIds: string[] = [];
  let launcherNextCellIndices: number[] = [];
  let launcherRoundsRemaining: number[] = [];
  let launcherReloadProgressSeconds: number[] = [];
  let launcherReloadingFlags: boolean[] = [];
  let roundsRemaining = 0;
  let queuedShots = 0;
  let burstShotCooldownSeconds = 0;
  let firedFlashSeconds = 0;
  let triggerFireCooldownSeconds = 0;
  let hasLastYaw = false;
  let lastYaw = 0;
  let turnDirection = 0;
  let isLocking = false;
  let lockingProgress01 = 0;
  let enabled = true;

  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);

  const buildBayInstances = (
    nextBayConfigs: readonly MissileBayInstanceConfig[] | undefined,
    nextLegacyCells: readonly THREE.Object3D[],
    nextLegacyPayload: MissileBayComponentDefinition
  ): MissileBayInstanceConfig[] => {
    if (nextBayConfigs && nextBayConfigs.length > 0) {
      return nextBayConfigs.map((bay, index) => ({
        id: bay.id || `missile_bay_${index + 1}`,
        cells: [...bay.cells],
        payload: bay.payload
      }));
    }

    if (nextLegacyCells.length <= 0) {
      return [];
    }

    const configuredLauncherCount = Math.max(1, Math.floor(launcherCountHint ?? 1));
    if (configuredLauncherCount <= 1) {
      return [
        {
          id: "missile_bay_1",
          cells: [...nextLegacyCells],
          payload: nextLegacyPayload
        }
      ];
    }

    const configuredCellsPerLauncher = Math.max(
      1,
      Math.floor(cellsPerLauncherHint ?? Math.ceil(nextLegacyCells.length / configuredLauncherCount))
    );
    const bays: MissileBayInstanceConfig[] = [];
    for (let launcherIndex = 0; launcherIndex < configuredLauncherCount; launcherIndex += 1) {
      const start = launcherIndex * configuredCellsPerLauncher;
      const end = start + configuredCellsPerLauncher;
      const cells = nextLegacyCells.slice(start, end);
      if (cells.length <= 0) {
        continue;
      }
      bays.push({
        id: `missile_bay_${launcherIndex + 1}`,
        cells,
        payload: nextLegacyPayload
      });
    }
    return bays;
  };

  const initializeLauncherGroups = (): void => {
    missileLauncherGroups = missileBayInstances.map((bay) => [...bay.cells]);
    launcherPayloads = missileBayInstances.map((bay) => bay.payload);
    launcherIds = missileBayInstances.map((bay) => bay.id);

    launcherNextCellIndices = missileLauncherGroups.map(() => 0);
    launcherRoundsRemaining = missileLauncherGroups.map((group) => group.length);
    launcherReloadProgressSeconds = missileLauncherGroups.map(() => 0);
    launcherReloadingFlags = missileLauncherGroups.map(() => false);
    roundsRemaining = launcherRoundsRemaining.reduce((sum, count) => sum + count, 0);
  };

  const getMagazineCapacity = (): number =>
    missileLauncherGroups.reduce((sum, group) => sum + group.length, 0);

  const canFireSalvo = (): boolean => {
    if (missileLauncherGroups.length === 0) {
      return false;
    }

    for (let i = 0; i < missileLauncherGroups.length; i += 1) {
      if (missileLauncherGroups[i].length > 0 && launcherRoundsRemaining[i] > 0) {
        return true;
      }
    }

    return false;
  };

  const getAvailableSalvoCount = (): number => {
    if (!canFireSalvo()) {
      return 0;
    }

    let remaining = 0;
    for (let i = 0; i < missileLauncherGroups.length; i += 1) {
      if (missileLauncherGroups[i].length === 0) {
        continue;
      }
      remaining = Math.max(remaining, launcherRoundsRemaining[i]);
    }

    return Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0;
  };

  const getVolleyMissileCount = (): number => {
    let missileCount = 0;
    for (let launcherIndex = 0; launcherIndex < missileLauncherGroups.length; launcherIndex += 1) {
      const group = missileLauncherGroups[launcherIndex];
      if (group.length === 0 || launcherRoundsRemaining[launcherIndex] <= 0) {
        continue;
      }
      const launcherPayload = launcherPayloads[launcherIndex] ?? resolvedLegacyPayload;
      const missilesPerShot = Math.max(1, Math.floor(launcherPayload.missilesPerShot ?? 1));
      missileCount += missilesPerShot;
    }
    return Math.max(1, missileCount);
  };

  const startLauncherReload = (launcherIndex: number): void => {
    if (launcherIndex < 0 || launcherIndex >= missileLauncherGroups.length) {
      return;
    }
    if (missileLauncherGroups[launcherIndex].length <= 0) {
      return;
    }
    launcherReloadingFlags[launcherIndex] = true;
    launcherReloadProgressSeconds[launcherIndex] = 0;
    queuedShots = 0;
  };

  const updateLauncherReloads = (deltaTime: number): void => {
    roundsRemaining = 0;

    for (let launcherIndex = 0; launcherIndex < missileLauncherGroups.length; launcherIndex += 1) {
      const launcherPayload = launcherPayloads[launcherIndex] ?? FALLBACK_MISSILE_PAYLOAD;
      const reloadPerMissileSeconds = Math.max(0.001, launcherPayload.reloadSeconds);
      const groupCapacity = missileLauncherGroups[launcherIndex].length;
      if (groupCapacity <= 0) {
        launcherRoundsRemaining[launcherIndex] = 0;
        launcherReloadProgressSeconds[launcherIndex] = 0;
        launcherReloadingFlags[launcherIndex] = false;
        continue;
      }

      if (launcherRoundsRemaining[launcherIndex] >= groupCapacity) {
        launcherRoundsRemaining[launcherIndex] = groupCapacity;
        launcherReloadProgressSeconds[launcherIndex] = 0;
        launcherReloadingFlags[launcherIndex] = false;
      } else if (launcherReloadingFlags[launcherIndex]) {
        launcherReloadProgressSeconds[launcherIndex] += deltaTime;
        if (launcherPayload.reloadMode === "full_magazine") {
          if (launcherReloadProgressSeconds[launcherIndex] >= reloadPerMissileSeconds) {
            launcherRoundsRemaining[launcherIndex] = groupCapacity;
            launcherReloadProgressSeconds[launcherIndex] = 0;
            launcherReloadingFlags[launcherIndex] = false;
          }
        } else {
          while (
            launcherReloadProgressSeconds[launcherIndex] >= reloadPerMissileSeconds &&
            launcherRoundsRemaining[launcherIndex] < groupCapacity
          ) {
            launcherReloadProgressSeconds[launcherIndex] -= reloadPerMissileSeconds;
            launcherRoundsRemaining[launcherIndex] += 1;
          }
        }

        if (launcherRoundsRemaining[launcherIndex] >= groupCapacity) {
          launcherRoundsRemaining[launcherIndex] = groupCapacity;
          launcherReloadProgressSeconds[launcherIndex] = 0;
          launcherReloadingFlags[launcherIndex] = false;
        }
      } else {
        launcherReloadProgressSeconds[launcherIndex] = 0;
      }

      roundsRemaining += launcherRoundsRemaining[launcherIndex];
    }
  };

  const getMissileTravelSpeed = (launcherPayload: MissileBayComponentDefinition): number => {
    if (MISSILE_DEBUG_SPEED_OVERRIDE !== null) {
      return Math.max(0, MISSILE_DEBUG_SPEED_OVERRIDE);
    }
    return Math.max(0, launcherPayload.missileSpeed);
  };

  const getMissileModelAssetId = (
    launcherPayload: MissileBayComponentDefinition
  ): MissileModelAssetId => launcherPayload.missileModelAssetId ?? "standard_concussive";

  const resolvedLegacyPayload = payload ?? FALLBACK_MISSILE_PAYLOAD;
  missileBayInstances = buildBayInstances(missileBays, missileCells, resolvedLegacyPayload);
  initializeLauncherGroups();

  const getActiveTargetLockingConfig = () => {
    const activePayloads = launcherPayloads.filter(
      (_, launcherIndex) =>
        (missileLauncherGroups[launcherIndex]?.length ?? 0) > 0 && launcherRoundsRemaining[launcherIndex] > 0
    );
    const referencePayload = activePayloads[0] ?? launcherPayloads[0] ?? resolvedLegacyPayload;
    const configuredLocking = referencePayload.targetLocking;
    const useLockStacks = activePayloads.some((payloadDef) => Boolean(payloadDef.useLockStacks));
    const maxLockStacksTotal = useLockStacks
      ? getVolleyMissileCount()
      : Math.max(1, Math.floor(configuredLocking?.maxLocksPerTarget ?? 1));
    const configuredMaxLocksPerTarget = Math.max(
      1,
      Math.floor(configuredLocking?.maxLocksPerTarget ?? 1)
    );
    return {
      acquireSeconds: Math.max(0.05, configuredLocking?.acquireSeconds ?? DEFAULT_LOCK_ACQUIRE_SECONDS),
      maxLocksPerTarget: Math.max(1, Math.min(configuredMaxLocksPerTarget, maxLockStacksTotal)),
      maxLockStacksTotal,
      useLockStacks,
      progressDecayDelaySeconds: Math.max(
        0,
        configuredLocking?.progressDecayDelaySeconds ?? DEFAULT_LOCK_PROGRESS_DECAY_DELAY_SECONDS
      ),
      progressDecaySeconds: Math.max(
        0.05,
        configuredLocking?.progressDecaySeconds ?? DEFAULT_LOCK_PROGRESS_DECAY_SECONDS
      ),
      reticleRadiusPadding: Math.max(
        0,
        configuredLocking?.reticleRadiusPadding ?? DEFAULT_LOCK_RETICLE_RADIUS_PADDING
      )
    };
  };

  const createLockedTargetIndicatorTexture = (variant: "outer" | "inner"): THREE.CanvasTexture => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      const fallback = new THREE.CanvasTexture(canvas);
      fallback.needsUpdate = true;
      return fallback;
    }

    const center = size * 0.5;
    context.clearRect(0, 0, size, size);
    context.strokeStyle = "rgba(255,78,78,0.72)";
    context.lineWidth = variant === "outer" ? 6 : 4;
    context.beginPath();
    context.arc(center, center, variant === "outer" ? 92 : 64, 0, Math.PI * 2);
    context.stroke();

    if (variant === "outer") {
      context.lineWidth = 3;
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const inner = 102;
        const outer = i % 2 === 0 ? 122 : 116;
        context.beginPath();
        context.moveTo(center + cos * inner, center + sin * inner);
        context.lineTo(center + cos * outer, center + sin * outer);
        context.stroke();
      }
      context.lineWidth = 2;
      context.strokeStyle = "rgba(255,126,126,0.46)";
      context.beginPath();
      context.arc(center, center, 104, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.lineWidth = 2.5;
      context.strokeStyle = "rgba(255,132,132,0.72)";
      for (let i = 0; i < 4; i += 1) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        context.beginPath();
        context.moveTo(center + cos * 36, center + sin * 36);
        context.lineTo(center + cos * 52, center + sin * 52);
        context.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    return texture;
  };
  const lockedTargetOuterTexture = createLockedTargetIndicatorTexture("outer");
  const lockedTargetInnerTexture = createLockedTargetIndicatorTexture("inner");
  const createLockStackLabel = (): LockedTargetIndicator["lockStackLabel"] => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.86,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = 22;
    return {
      canvas,
      context,
      lastRenderedValue: -1,
      material,
      sprite,
      texture
    };
  };

  const drawLockStackLabel = (
    label: LockedTargetIndicator["lockStackLabel"],
    lockCount: number
  ): void => {
    const nextValue = Math.max(0, Math.floor(lockCount));
    if (label.lastRenderedValue === nextValue) {
      return;
    }
    label.lastRenderedValue = nextValue;

    const { canvas, context } = label;
    if (!context) {
      label.texture.needsUpdate = true;
      return;
    }

    const size = canvas.width;
    const center = size * 0.5;
    context.clearRect(0, 0, size, size);
    context.strokeStyle = "rgba(255, 90, 90, 0.9)";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(center, center, 28, 0, Math.PI * 2);
    context.stroke();

    context.strokeStyle = "rgba(255, 126, 126, 0.9)";
    context.lineWidth = 1.5;
    const cornerLength = 8;
    const cornerRadius = 34;
    // Top-right corner notch
    context.beginPath();
    context.moveTo(center + cornerRadius - cornerLength, center - cornerRadius);
    context.lineTo(center + cornerRadius, center - cornerRadius);
    context.lineTo(center + cornerRadius, center - cornerRadius + cornerLength);
    context.stroke();
    // Bottom-right corner notch
    context.beginPath();
    context.moveTo(center + cornerRadius - cornerLength, center + cornerRadius);
    context.lineTo(center + cornerRadius, center + cornerRadius);
    context.lineTo(center + cornerRadius, center + cornerRadius - cornerLength);
    context.stroke();
    // Bottom-left corner notch
    context.beginPath();
    context.moveTo(center - cornerRadius + cornerLength, center + cornerRadius);
    context.lineTo(center - cornerRadius, center + cornerRadius);
    context.lineTo(center - cornerRadius, center + cornerRadius - cornerLength);
    context.stroke();
    // Top-left corner notch
    context.beginPath();
    context.moveTo(center - cornerRadius + cornerLength, center - cornerRadius);
    context.lineTo(center - cornerRadius, center - cornerRadius);
    context.lineTo(center - cornerRadius, center - cornerRadius + cornerLength);
    context.stroke();

    context.fillStyle = "rgba(255, 194, 194, 0.98)";
    context.font = "500 34px 'Arial Narrow', 'Segoe UI', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${nextValue}`, center, center + 1);

    label.texture.needsUpdate = true;
  };

  const removeLockedTargetIndicator = (hurtboxId: string): void => {
    const indicator = lockedTargetIndicators.get(hurtboxId);
    if (!indicator) {
      return;
    }
    indicator.outer.removeFromParent();
    indicator.inner.removeFromParent();
    indicator.lockStackLabel.sprite.removeFromParent();
    indicator.outerMaterial.dispose();
    indicator.innerMaterial.dispose();
    indicator.lockStackLabel.material.dispose();
    indicator.lockStackLabel.texture.dispose();
    lockedTargetIndicators.delete(hurtboxId);
  };

  const clearLockedTargetIndicators = (): void => {
    for (const [hurtboxId] of lockedTargetIndicators) {
      removeLockedTargetIndicator(hurtboxId);
    }
  };
  const clearCurrentLocks = (): void => {
    targetLockStates.clear();
    clearLockedTargetIndicators();
    isLocking = false;
    lockingProgress01 = 0;
    activeVolleyTargetLockCounts.clear();
  };

  const syncLockedTargetIndicators = (deltaTime: number, camera: THREE.Camera): void => {
    const activeLockedIds = new Set<string>();
    for (const [hurtboxId, state] of targetLockStates) {
      if (!state.locked || !state.hurtbox.canReceiveDamage()) {
        continue;
      }
      activeLockedIds.add(hurtboxId);

      let indicator = lockedTargetIndicators.get(hurtboxId);
      if (!indicator) {
        const outerMaterial = new THREE.SpriteMaterial({
          color: 0xff5a5a,
          map: lockedTargetOuterTexture,
          transparent: true,
          opacity: 0.58,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const innerMaterial = new THREE.SpriteMaterial({
          color: 0xff8a8a,
          map: lockedTargetInnerTexture,
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const lockStackLabel = createLockStackLabel();
        indicator = {
          inner: new THREE.Sprite(innerMaterial),
          innerMaterial,
          lockStackLabel,
          outer: new THREE.Sprite(outerMaterial),
          outerMaterial
        };
        lockedTargetIndicators.set(hurtboxId, indicator);
        root.add(indicator.outer);
        root.add(indicator.inner);
        root.add(indicator.lockStackLabel.sprite);
      }

      state.hurtbox.getWorldCenter(lockTargetCenter);
      lockTargetCenter.y += LOCKED_TARGET_INDICATOR_Y_OFFSET;
      indicator.outer.position.copy(lockTargetCenter);
      indicator.inner.position.copy(lockTargetCenter);

      const currentLocking = getActiveTargetLockingConfig();
      const indicatorRadius =
        LOCKED_TARGET_INDICATOR_BASE_SCALE +
        Math.max(0, state.hurtbox.collisionArea.radius + currentLocking.reticleRadiusPadding) +
        LOCKED_TARGET_INDICATOR_EXTRA_RADIUS;
      indicator.outer.scale.set(indicatorRadius, indicatorRadius, 1);
      indicator.inner.scale.set(
        indicatorRadius * LOCKED_TARGET_INDICATOR_INNER_SCALE_FACTOR,
        indicatorRadius * LOCKED_TARGET_INDICATOR_INNER_SCALE_FACTOR,
        1
      );

      indicator.outerMaterial.rotation +=
        LOCKED_TARGET_OUTER_ROTATE_SPEED_RADIANS_PER_SECOND * deltaTime;
      indicator.innerMaterial.rotation +=
        LOCKED_TARGET_INNER_ROTATE_SPEED_RADIANS_PER_SECOND * deltaTime;

      const pulse = 0.78 + Math.sin(performance.now() * 0.0075 + indicatorRadius) * 0.22;
      indicator.outerMaterial.opacity = THREE.MathUtils.clamp(0.28 + pulse * 0.34, 0, 1);
      indicator.innerMaterial.opacity = THREE.MathUtils.clamp(0.12 + pulse * 0.16, 0, 1);

      const showLockStackCounter =
        currentLocking.useLockStacks && currentLocking.maxLocksPerTarget > 1;
      if (showLockStackCounter) {
        drawLockStackLabel(indicator.lockStackLabel, state.lockStacks);
        indicator.lockStackLabel.sprite.visible = true;
        indicator.lockStackLabel.sprite.position.copy(lockTargetCenter);
        scratchCameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        scratchCameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        indicator.lockStackLabel.sprite.position
          .addScaledVector(scratchCameraRight, indicatorRadius * LOCKED_TARGET_STACK_LABEL_X_OFFSET_FACTOR)
          .addScaledVector(scratchCameraUp, indicatorRadius * LOCKED_TARGET_STACK_LABEL_Y_OFFSET_FACTOR);
        const lockLabelScale = indicatorRadius * LOCKED_TARGET_STACK_LABEL_SCALE_FACTOR;
        indicator.lockStackLabel.sprite.scale.set(lockLabelScale, lockLabelScale, 1);
        indicator.lockStackLabel.material.opacity = THREE.MathUtils.clamp(0.74 + pulse * 0.16, 0, 1);
      } else {
        indicator.lockStackLabel.sprite.visible = false;
      }
    }

    for (const [hurtboxId] of lockedTargetIndicators) {
      if (activeLockedIds.has(hurtboxId)) {
        continue;
      }
      removeLockedTargetIndicator(hurtboxId);
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) {
      return;
    }
    if (!enabled) {
      return;
    }
    if (triggerFireCooldownSeconds > 0) {
      return;
    }
    if (roundsRemaining <= 0) {
      event.preventDefault();
      return;
    }
    if (getAvailableSalvoCount() <= 0) {
      event.preventDefault();
      return;
    }
    queuedShots = Math.min(getAvailableSalvoCount(), queuedShots + 1);
    const triggerIntervalSeconds = launcherPayloads.reduce(
      (minSeconds, launcherPayload) =>
        Math.min(minSeconds, Math.max(0, launcherPayload.triggerFireIntervalSeconds)),
      Math.max(0, resolvedLegacyPayload.triggerFireIntervalSeconds)
    );
    triggerFireCooldownSeconds = Math.max(0, triggerIntervalSeconds);
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onContextMenu);

  const setMissileBays = (nextBays: readonly MissileBayInstanceConfig[]): void => {
    missileBayInstances = buildBayInstances(nextBays, [], resolvedLegacyPayload);
    initializeLauncherGroups();
    queuedShots = 0;
    burstShotCooldownSeconds = 0;
    firedFlashSeconds = 0;
    triggerFireCooldownSeconds = 0;
    clearCurrentLocks();
    activeVolleyTargetIds.clear();
    activeVolleyTargetLockCounts.clear();
  };

  const setMissileCells = (nextCells: readonly THREE.Object3D[]): void => {
    setMissileBays(
      buildBayInstances(
        [],
        nextCells,
        launcherPayloads[0] ?? resolvedLegacyPayload
      )
    );
  };

  const update = (
    deltaTime: number,
    shipForward: THREE.Vector3,
    shipYaw: number,
    camera: THREE.Camera,
    aimTargetWorldPosition?: THREE.Vector3
  ): void => {
    if (deltaTime <= 0) {
      return;
    }

    const ammoCapacity = getMagazineCapacity();
    updateLauncherReloads(deltaTime);

    burstShotCooldownSeconds = Math.max(0, burstShotCooldownSeconds - deltaTime);
    firedFlashSeconds = Math.max(0, firedFlashSeconds - deltaTime);
    triggerFireCooldownSeconds = Math.max(0, triggerFireCooldownSeconds - deltaTime);
    if (ammoCapacity <= 0) {
      clearCurrentLocks();
    } else {
      updateTargetLocks(deltaTime, camera, aimTargetWorldPosition);
    }

    if (hasLastYaw) {
      const yawDelta = shortestAngleDelta(lastYaw, shipYaw);
      const yawRate = yawDelta / deltaTime;
      if (Math.abs(yawRate) <= TURN_RATE_EPSILON_RADIANS_PER_SECOND) {
        turnDirection = 0;
      } else {
        turnDirection = Math.sign(yawRate);
      }
    } else {
      turnDirection = 0;
      hasLastYaw = true;
    }
    lastYaw = shipYaw;

    if (!enabled || queuedShots <= 0 || ammoCapacity === 0) {
      updateMissiles(deltaTime);
      updateExplosions(deltaTime);
      updateSmokeParticles(deltaTime);
      return;
    }

    pruneActiveVolleyTargets();

    while (
      queuedShots > 0 &&
      burstShotCooldownSeconds <= 0 &&
      canFireSalvo()
    ) {
      if (!fireQueuedSalvo(shipForward, aimTargetWorldPosition)) {
        break;
      }

      queuedShots -= 1;
      const burstIntervalSeconds = launcherPayloads.reduce(
        (minSeconds, launcherPayload) =>
          Math.min(minSeconds, Math.max(0.001, launcherPayload.burstFireIntervalSeconds)),
        Math.max(0.001, resolvedLegacyPayload.burstFireIntervalSeconds)
      );
      burstShotCooldownSeconds += burstIntervalSeconds;
    }

    pruneActiveVolleyTargets();

    updateMissiles(deltaTime);
    updateExplosions(deltaTime);
    updateSmokeParticles(deltaTime);
  };

  const updateTargetLocks = (
    deltaTime: number,
    camera: THREE.Camera,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): void => {
    isLocking = false;
    lockingProgress01 = 0;
    const trackedIds = new Set<string>();
    const targetLocking = getActiveTargetLockingConfig();
    const maxLocksPerTarget = Math.max(1, targetLocking.maxLocksPerTarget);
    const maxLockStacksTotal = Math.max(1, targetLocking.maxLockStacksTotal);

    const getOtherLockedStacks = (excludeHurtboxId: string): number => {
      let total = 0;
      for (const [hurtboxId, lockState] of targetLockStates) {
        if (hurtboxId === excludeHurtboxId || !lockState.locked) {
          continue;
        }
        total += Math.max(1, lockState.lockStacks);
      }
      return total;
    };

    for (const hurtbox of targetHurtboxes) {
      trackedIds.add(hurtbox.id);
      if (!hurtbox.canReceiveDamage()) {
        targetLockStates.delete(hurtbox.id);
        removeLockedTargetIndicator(hurtbox.id);
        continue;
      }

      const onScreen = isTargetOnScreen(hurtbox, camera);
      const state =
        targetLockStates.get(hurtbox.id) ??
        {
          decayDelaySeconds: 0,
          hasVelocitySample: false,
          hurtbox,
          lockSeconds: 0,
          lockStacks: 0,
          lockVelocity: new THREE.Vector3(),
          lockWorldCenter: new THREE.Vector3(),
          locked: false,
          offScreenSeconds: 0
        };
      state.hurtbox = hurtbox;
      const otherLockedStacks = getOtherLockedStacks(hurtbox.id);
      const maxLocksForState = Math.max(
        0,
        Math.min(maxLocksPerTarget, maxLockStacksTotal - otherLockedStacks)
      );
      hurtbox.getWorldCenter(lockTargetCenter);
      if (state.hasVelocitySample) {
        scratchPredictedVelocity
          .subVectors(lockTargetCenter, state.lockWorldCenter)
          .multiplyScalar(1 / Math.max(0.0001, deltaTime));
        state.lockVelocity.copy(scratchPredictedVelocity);
      } else {
        state.lockVelocity.set(0, 0, 0);
        state.hasVelocitySample = true;
      }
      state.lockWorldCenter.copy(lockTargetCenter);

      const isHovering =
        Boolean(aimTargetWorldPosition) && onScreen && isReticleOverTarget(aimTargetWorldPosition, hurtbox);

      if (state.locked) {
        if (maxLocksForState <= 0) {
          targetLockStates.delete(hurtbox.id);
          removeLockedTargetIndicator(hurtbox.id);
          continue;
        }
        state.lockStacks = THREE.MathUtils.clamp(state.lockStacks, 1, maxLocksForState);
        if (!onScreen) {
          state.offScreenSeconds += deltaTime;
          if (state.offScreenSeconds >= LOCK_OFFSCREEN_GRACE_SECONDS) {
            targetLockStates.delete(hurtbox.id);
            removeLockedTargetIndicator(hurtbox.id);
            continue;
          }
        } else {
          state.offScreenSeconds = 0;
        }

        if (isHovering && state.lockStacks < maxLocksForState) {
          state.lockSeconds += deltaTime;
          while (
            state.lockSeconds >= targetLocking.acquireSeconds &&
            state.lockStacks < maxLocksForState
          ) {
            state.lockSeconds -= targetLocking.acquireSeconds;
            state.lockStacks += 1;
          }
          if (state.lockStacks < maxLocksForState && state.lockSeconds > 0) {
            isLocking = true;
            lockingProgress01 = Math.max(
              lockingProgress01,
              state.lockSeconds / targetLocking.acquireSeconds
            );
          }
        } else {
          state.lockSeconds = 0;
        }

        targetLockStates.set(hurtbox.id, state);
        continue;
      }

      if (isHovering) {
        if (maxLocksForState <= 0) {
          targetLockStates.delete(hurtbox.id);
          removeLockedTargetIndicator(hurtbox.id);
          continue;
        }
        state.lockSeconds = Math.min(targetLocking.acquireSeconds, state.lockSeconds + deltaTime);
        state.decayDelaySeconds = targetLocking.progressDecayDelaySeconds;
        if (state.lockSeconds >= targetLocking.acquireSeconds) {
          state.locked = true;
          state.lockStacks = 1;
          state.lockSeconds = 0;
        } else {
          isLocking = true;
          lockingProgress01 = Math.max(
            lockingProgress01,
            state.lockSeconds / targetLocking.acquireSeconds
          );
        }
      } else if (state.lockSeconds > 0) {
        if (state.decayDelaySeconds > 0) {
          state.decayDelaySeconds = Math.max(0, state.decayDelaySeconds - deltaTime);
        } else {
          const decayRatePerSecond = targetLocking.acquireSeconds / targetLocking.progressDecaySeconds;
          state.lockSeconds = Math.max(0, state.lockSeconds - decayRatePerSecond * deltaTime);
        }
        if (state.lockSeconds > 0) {
          isLocking = true;
          lockingProgress01 = Math.max(
            lockingProgress01,
            state.lockSeconds / targetLocking.acquireSeconds
          );
        }
      }

      if (!state.locked && state.lockSeconds <= 0) {
        targetLockStates.delete(hurtbox.id);
        removeLockedTargetIndicator(hurtbox.id);
      } else {
        targetLockStates.set(hurtbox.id, state);
      }
    }

    for (const [hurtboxId] of targetLockStates) {
      if (!trackedIds.has(hurtboxId)) {
        targetLockStates.delete(hurtboxId);
        removeLockedTargetIndicator(hurtboxId);
      }
    }

    syncLockedTargetIndicators(deltaTime, camera);
  };

  const isReticleOverTarget = (aimTargetWorldPosition: THREE.Vector3, hurtbox: HurtboxComponent): boolean => {
    const targetLocking = getActiveTargetLockingConfig();
    hurtbox.getWorldCenter(lockTargetCenter);
    lockTargetCenter.y = aimTargetWorldPosition.y;
    const targetRadius = hurtbox.collisionArea.radius + targetLocking.reticleRadiusPadding;
    return aimTargetWorldPosition.distanceToSquared(lockTargetCenter) <= targetRadius * targetRadius;
  };

  const isTargetOnScreen = (hurtbox: HurtboxComponent, camera: THREE.Camera): boolean => {
    hurtbox.getWorldCenter(projectedTargetNdc);
    projectedTargetNdc.project(camera);
    return (
      projectedTargetNdc.z >= -1 &&
      projectedTargetNdc.z <= 1 &&
      projectedTargetNdc.x >= -1 &&
      projectedTargetNdc.x <= 1 &&
      projectedTargetNdc.y >= -1 &&
      projectedTargetNdc.y <= 1
    );
  };

  const consumeCurrentLocksIntoVolleyTargets = (): void => {
    activeVolleyTargetIds.clear();
    activeVolleyTargetLockCounts.clear();
    for (const [hurtboxId, state] of targetLockStates) {
      if (!state.locked || !state.hurtbox.canReceiveDamage()) {
        continue;
      }
      activeVolleyTargetIds.add(hurtboxId);
      activeVolleyTargetLockCounts.set(hurtboxId, Math.max(1, state.lockStacks));
    }
  };

  const resolveTargetHurtboxById = (hurtboxId: string): HurtboxComponent | null => {
    for (const hurtbox of targetHurtboxes) {
      if (hurtbox.id === hurtboxId) {
        return hurtbox;
      }
    }
    return null;
  };

  const selectNearestVolleyTargetId = (origin: THREE.Vector3): string | null => {
    let nearestId: string | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const targetId of activeVolleyTargetIds) {
      const hurtbox = resolveTargetHurtboxById(targetId);
      if (!hurtbox || !hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(lockTargetCenter);
      const distanceSq = origin.distanceToSquared(lockTargetCenter);
      if (distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearestDistanceSq = distanceSq;
      nearestId = targetId;
    }

    return nearestId;
  };

  const consumeNearestLockStackTargetId = (origin: THREE.Vector3): string | null => {
    let selectedId: string | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const [targetId, lockCount] of activeVolleyTargetLockCounts) {
      if (lockCount <= 0) {
        continue;
      }
      const hurtbox = resolveTargetHurtboxById(targetId);
      if (!hurtbox || !hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(lockTargetCenter);
      const distanceSq = origin.distanceToSquared(lockTargetCenter);
      if (distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearestDistanceSq = distanceSq;
      selectedId = targetId;
    }

    if (!selectedId) {
      return null;
    }

    const remainingLocks = Math.max(0, (activeVolleyTargetLockCounts.get(selectedId) ?? 0) - 1);
    if (remainingLocks <= 0) {
      activeVolleyTargetLockCounts.delete(selectedId);
      activeVolleyTargetIds.delete(selectedId);
    } else {
      activeVolleyTargetLockCounts.set(selectedId, remainingLocks);
    }
    return selectedId;
  };

  const pruneActiveVolleyTargets = (): void => {
    for (const targetId of activeVolleyTargetIds) {
      const hurtbox = resolveTargetHurtboxById(targetId);
      const lockState = targetLockStates.get(targetId);
      if (hurtbox && hurtbox.canReceiveDamage() && lockState?.locked) {
        continue;
      }
      activeVolleyTargetIds.delete(targetId);
      activeVolleyTargetLockCounts.delete(targetId);
    }

    for (const [targetId, remainingLocks] of activeVolleyTargetLockCounts) {
      if (remainingLocks > 0 && activeVolleyTargetIds.has(targetId)) {
        continue;
      }
      activeVolleyTargetLockCounts.delete(targetId);
    }

    if (activeMissiles.length === 0 && queuedShots <= 0) {
      activeVolleyTargetIds.clear();
      activeVolleyTargetLockCounts.clear();
    }
  };

  const fireQueuedSalvo = (
    shipForward: THREE.Vector3,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): boolean => {
    if (!canFireSalvo()) {
      return false;
    }

    if (activeVolleyTargetIds.size === 0) {
      consumeCurrentLocksIntoVolleyTargets();
    }
    let missilesFired = 0;
    let usedLockStackingPayload = false;
    for (let groupIndex = 0; groupIndex < missileLauncherGroups.length; groupIndex += 1) {
      const group = missileLauncherGroups[groupIndex];
      const launcherPayload = launcherPayloads[groupIndex] ?? resolvedLegacyPayload;
      if (group.length === 0 || launcherRoundsRemaining[groupIndex] <= 0) {
        continue;
      }

      const missilesPerShot = Math.max(1, Math.floor(launcherPayload.missilesPerShot ?? 1));
      usedLockStackingPayload = usedLockStackingPayload || Boolean(launcherPayload.useLockStacks);
      const launcherCellIndices =
        launcherPayload.randomizeCellSelection
          ? selectRandomIndices(group.length, missilesPerShot)
          : selectSequentialIndices(
              group.length,
              launcherNextCellIndices[groupIndex] % group.length,
              missilesPerShot
            );

      launcherNextCellIndices[groupIndex] = (launcherNextCellIndices[groupIndex] + 1) % group.length;
      launcherRoundsRemaining[groupIndex] = Math.max(0, launcherRoundsRemaining[groupIndex] - 1);
      roundsRemaining = Math.max(0, roundsRemaining - 1);
      if (launcherRoundsRemaining[groupIndex] <= 0) {
        startLauncherReload(groupIndex);
      }

      for (const launcherCellIndex of launcherCellIndices) {
        const launcher = group[launcherCellIndex % group.length];
        spawnMissile(launcher, launcherPayload, shipForward, aimTargetWorldPosition);
        missilesFired += 1;
      }
    }
    if (missilesFired <= 0) {
      return false;
    }

    firedFlashSeconds = FIRE_FLASH_DURATION_SECONDS;
    if (usedLockStackingPayload) {
      clearCurrentLocks();
      activeVolleyTargetIds.clear();
      activeVolleyTargetLockCounts.clear();
    }

    return true;
  };

  const spawnMissile = (
    launcher: THREE.Object3D,
    launcherPayload: MissileBayComponentDefinition,
    shipForward: THREE.Vector3,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): void => {
    const flightMode = launcherPayload.flightMode === "spline" ? "spline" : "homing";
    launcher.getWorldPosition(scratchExplosionCenter);
    const missileAimTargetWorld =
      aimTargetWorldPosition !== undefined ? scratchAimTargetWorld.copy(aimTargetWorldPosition) : undefined;
    if (missileAimTargetWorld && MISSILE_LAUNCHER_AIM_OFFSET_SCALE !== 0) {
      launcherLocalOffset.copy(scratchExplosionCenter);
      playerRoot.worldToLocal(launcherLocalOffset);
      launcherLocalOffset.y = 0;
      if (launcherLocalOffset.lengthSq() > 0.000001) {
        launcherWorldOffset.copy(launcherLocalOffset).applyQuaternion(playerRoot.quaternion);
        launcherWorldOffset.y = 0;
        missileAimTargetWorld.addScaledVector(launcherWorldOffset, MISSILE_LAUNCHER_AIM_OFFSET_SCALE);
      }
    }

    // Launch clamping only affects initial trajectory.
    missileDirection.copy(shipForward).setY(0);
    if (missileDirection.lengthSq() <= 0.000001) {
      missileDirection.copy(MISSILE_FORWARD_AXIS);
    } else {
      missileDirection.normalize();
    }

    if (missileAimTargetWorld) {
      shipToAim.subVectors(missileAimTargetWorld, playerRoot.position);
      const useForwardOnly =
        shipToAim.lengthSq() < minAimDistanceFromShip * minAimDistanceFromShip;

      if (!useForwardOnly) {
        missileAimVector.subVectors(missileAimTargetWorld, scratchExplosionCenter).setY(0);
        if (missileAimVector.lengthSq() > 0.000001) {
          missileAimVector.normalize();
          const dot = THREE.MathUtils.clamp(missileAimVector.dot(missileDirection), -1, 1);
          const signedAngle = Math.atan2(
            crossForwardAim.copy(missileDirection).cross(missileAimVector).dot(worldUp),
            dot
          );
          const minAllowedAngle = turnDirection < 0 ? -maxAimClampRadians : 0;
          const maxAllowedAngle = turnDirection > 0 ? maxAimClampRadians : 0;
          const clampedAngle =
            turnDirection === 0
              ? THREE.MathUtils.clamp(signedAngle, -maxAimClampRadians, maxAimClampRadians)
              : THREE.MathUtils.clamp(signedAngle, minAllowedAngle, maxAllowedAngle);

          if (clampedAngle !== signedAngle) {
            clampedForward.copy(missileDirection).applyAxisAngle(worldUp, clampedAngle).normalize();
            missileDirection.copy(clampedForward);
          } else {
            missileDirection.copy(missileAimVector);
          }
        }
      }
    }

    const launchTargetHurtboxId = launcherPayload.useLockStacks
      ? consumeNearestLockStackTargetId(scratchExplosionCenter) ?? selectNearestVolleyTargetId(scratchExplosionCenter)
      : selectNearestVolleyTargetId(scratchExplosionCenter);

    let splinePath: ActiveMissile["splinePath"] = null;
    if (flightMode === "spline") {
      const splineWildness = THREE.MathUtils.clamp(launcherPayload.splineWildness ?? 1, 0.5, 2.5);
      const fallbackAimAngleRadians = THREE.MathUtils.degToRad(
        launcherPayload.fallbackAimMaxAngleDegrees ??
          THREE.MathUtils.radToDeg(SWARM_DEFAULT_FALLBACK_AIM_ANGLE_RADIANS)
      );
      const fallbackAimDistance = Math.max(
        1,
        launcherPayload.fallbackAimDistance ?? SWARM_DEFAULT_FALLBACK_AIM_DISTANCE
      );

      scratchSplineDestination.copy(scratchExplosionCenter);
      if (launchTargetHurtboxId) {
        const targetHurtbox = resolveTargetHurtboxById(launchTargetHurtboxId);
        const targetState = targetLockStates.get(launchTargetHurtboxId);
        if (targetHurtbox?.canReceiveDamage() && targetState) {
          targetHurtbox.getWorldCenter(scratchSplineDestination);
          const launchDistance = scratchExplosionCenter.distanceTo(scratchSplineDestination);
          const predictedLeadSeconds = THREE.MathUtils.clamp(
            (launchDistance / Math.max(0.001, getMissileTravelSpeed(launcherPayload))) *
              Math.max(0, launcherPayload.predictiveLeadFactor ?? 0.9),
            0.05,
            1.5
          );
          scratchSplineDestination.addScaledVector(targetState.lockVelocity, predictedLeadSeconds);
        }
      } else {
        let useAimTarget = false;
        if (missileAimTargetWorld) {
          shipToAim.subVectors(missileAimTargetWorld, playerRoot.position).setY(0);
          if (shipToAim.lengthSq() > 0.000001) {
            shipToAim.normalize();
            scratchLaunchDirection.copy(shipForward).setY(0);
            if (scratchLaunchDirection.lengthSq() <= 0.000001) {
              scratchLaunchDirection.copy(MISSILE_FORWARD_AXIS);
            } else {
              scratchLaunchDirection.normalize();
            }
            const dot = THREE.MathUtils.clamp(shipToAim.dot(scratchLaunchDirection), -1, 1);
            const angle = Math.acos(dot);
            useAimTarget = angle <= fallbackAimAngleRadians;
          } else {
            useAimTarget = true;
          }
        }

        if (useAimTarget && missileAimTargetWorld) {
          scratchSplineDestination.copy(missileAimTargetWorld);
          scratchLaunchDirection.subVectors(missileAimTargetWorld, scratchExplosionCenter).setY(0);
          if (scratchLaunchDirection.lengthSq() > 0.000001) {
            scratchLaunchDirection.normalize();
            scratchSplineDestination.addScaledVector(
              scratchLaunchDirection,
              UNLOCKED_RETICLE_OVERSHOOT_DISTANCE
            );
          } else {
            scratchSplineDestination.addScaledVector(
              missileDirection,
              UNLOCKED_RETICLE_OVERSHOOT_DISTANCE
            );
          }
          const reticleScatterRadius = Math.max(0, launcherPayload.reticleScatterRadius ?? 0);
          if (reticleScatterRadius > 0) {
            randomCircleOffsetXZ(reticleScatterRadius, scratchReticleScatterOffset);
            scratchSplineDestination.add(scratchReticleScatterOffset);
          }
        } else {
          scratchSplineDestination
            .copy(playerRoot.position)
            .addScaledVector(missileDirection, fallbackAimDistance);
        }
      }
      scratchSplineDestination.y = scratchExplosionCenter.y;

      scratchSplineDirection.subVectors(scratchSplineDestination, scratchExplosionCenter).setY(0);
      if (scratchSplineDirection.lengthSq() <= 0.000001) {
        scratchSplineDirection.copy(missileDirection);
      } else {
        scratchSplineDirection.normalize();
      }
      scratchSplinePerpendicular.crossVectors(scratchSplineDirection, worldUp);
      if (scratchSplinePerpendicular.lengthSq() <= 0.000001) {
        scratchSplinePerpendicular.set(1, 0, 0);
      } else {
        scratchSplinePerpendicular.normalize();
      }

      const splineDistance = Math.max(
        1.25,
        scratchExplosionCenter.distanceTo(scratchSplineDestination)
      );
      const lateralSign = Math.random() < 0.5 ? -1 : 1;
      const lateralOffset =
        splineDistance * THREE.MathUtils.randFloat(0.14, 0.26) * lateralSign * splineWildness;

      scratchSplineControlA
        .copy(scratchExplosionCenter)
        .addScaledVector(
          scratchSplineDirection,
          splineDistance * THREE.MathUtils.randFloat(0.22, 0.38)
        )
        .addScaledVector(scratchSplinePerpendicular, lateralOffset)
        .addScaledVector(worldUp, THREE.MathUtils.randFloat(-0.11, 0.16) * splineWildness);
      scratchSplineControlB
        .copy(scratchExplosionCenter)
        .addScaledVector(
          scratchSplineDirection,
          splineDistance * THREE.MathUtils.randFloat(0.56, 0.9)
        )
        .addScaledVector(
          scratchSplinePerpendicular,
          -lateralOffset * THREE.MathUtils.randFloat(0.28, 0.9) * splineWildness
        )
        .addScaledVector(worldUp, THREE.MathUtils.randFloat(-0.11, 0.16) * splineWildness);

      const approxLength =
        scratchExplosionCenter.distanceTo(scratchSplineControlA) +
        scratchSplineControlA.distanceTo(scratchSplineControlB) +
        scratchSplineControlB.distanceTo(scratchSplineDestination);
      const splineDuration = THREE.MathUtils.clamp(
        approxLength / Math.max(0.001, getMissileTravelSpeed(launcherPayload)),
        SPLINE_MIN_TRAVEL_DURATION_SECONDS,
        SPLINE_MAX_TRAVEL_DURATION_SECONDS
      );
      splinePath = {
        controlA: scratchSplineControlA.clone(),
        controlB: scratchSplineControlB.clone(),
        destination: scratchSplineDestination.clone(),
        durationSeconds: splineDuration,
        elapsedSeconds: 0,
        start: scratchExplosionCenter.clone()
      };

      scratchBezierDirection
        .subVectors(splinePath.controlA, splinePath.start)
        .setY(0);
      if (scratchBezierDirection.lengthSq() <= 0.000001) {
        scratchBezierDirection.copy(missileDirection);
      } else {
        scratchBezierDirection.normalize();
      }
      missileDirection.copy(scratchBezierDirection);
    }

    const missile = new THREE.Group();
    missile.position.copy(scratchExplosionCenter);

    shotQuaternion.setFromUnitVectors(MISSILE_FORWARD_AXIS, missileDirection);
    missile.quaternion.copy(shotQuaternion);
    missile.add(createMissileBodyVisual(launcherPayload));

    const thrusterCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0a6,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const thrusterGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9a3d,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const guidanceGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8cd7ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const thrusterCore = new THREE.Mesh(thrusterCoreGeometry, thrusterCoreMaterial);
    const thrusterGlow = new THREE.Mesh(thrusterGlowGeometry, thrusterGlowMaterial);
    const guidanceGlow = new THREE.Mesh(guidanceGlowGeometry, guidanceGlowMaterial);
    thrusterCore.position.z = -MISSILE_BODY_LENGTH * 0.58;
    thrusterGlow.position.z = -MISSILE_BODY_LENGTH * 0.62;
    guidanceGlow.position.z = MISSILE_BODY_LENGTH * 0.56;
    missile.add(thrusterCore);
    missile.add(thrusterGlow);
    missile.add(guidanceGlow);

    root.add(missile);

    missileVelocity.copy(missileDirection).multiplyScalar(getMissileTravelSpeed(launcherPayload));
    activeMissiles.push({
      flightMode,
      fuseRadius: Math.max(0, launcherPayload.proximityFuseRadius),
      guidanceGlow,
      homingDelayRemaining: flightMode === "homing" ? MISSILE_HOMING_DELAY_SECONDS : 0,
      lifeRemaining: Math.max(
        0.01,
        launcherPayload.missileLifetimeSeconds ?? MISSILE_LIFETIME_FALLBACK_SECONDS
      ),
      object: missile,
      payload: launcherPayload,
      splinePath,
      targetHurtboxId: launchTargetHurtboxId,
      trailSpawnSeconds: 0,
      thrusterCore,
      thrusterGlow,
      velocity: missileVelocity.clone()
    });

    thrusterGlow.getWorldPosition(smokeSpawnPosition);
    spawnLaunchSmoke(smokeSpawnPosition, missileDirection);
  };

  const updateMissiles = (deltaTime: number): void => {
    for (let i = activeMissiles.length - 1; i >= 0; i -= 1) {
      const missile = activeMissiles[i];
      missile.lifeRemaining -= deltaTime;

      if (missile.flightMode === "spline" && missile.splinePath) {
        const spline = missile.splinePath;
        spline.elapsedSeconds = Math.min(spline.durationSeconds, spline.elapsedSeconds + deltaTime);
        const t = THREE.MathUtils.clamp(
          spline.durationSeconds > 0 ? spline.elapsedSeconds / spline.durationSeconds : 1,
          0,
          1
        );

        scratchPreviousPosition.copy(missile.object.position);
        evaluateCubicBezier(
          spline.start,
          spline.controlA,
          spline.controlB,
          spline.destination,
          t,
          scratchBezierPosition
        );
        evaluateCubicBezierTangent(
          spline.start,
          spline.controlA,
          spline.controlB,
          spline.destination,
          t,
          scratchBezierDirection
        );
        if (scratchBezierDirection.lengthSq() <= 0.000001) {
          scratchBezierDirection.copy(missile.velocity).setY(0);
        }
        if (scratchBezierDirection.lengthSq() > 0.000001) {
          scratchBezierDirection.normalize();
          splineTangentQuaternion.setFromUnitVectors(MISSILE_FORWARD_AXIS, scratchBezierDirection);
          missile.object.quaternion.slerp(splineTangentQuaternion, THREE.MathUtils.clamp(deltaTime * 14, 0, 1));
          missile.velocity
            .copy(scratchBezierDirection)
            .multiplyScalar(getMissileTravelSpeed(missile.payload));
        } else if (deltaTime > 0) {
          missile.velocity
            .subVectors(scratchBezierPosition, scratchPreviousPosition)
            .multiplyScalar(1 / deltaTime);
        }
        missile.object.position.copy(scratchBezierPosition);
      } else {
        if (missile.homingDelayRemaining > 0) {
          missile.homingDelayRemaining = Math.max(0, missile.homingDelayRemaining - deltaTime);
        } else {
          applyMissileHoming(deltaTime, missile);
        }
        missile.object.position.addScaledVector(missile.velocity, deltaTime);
      }

      const flamePulse = 0.9 + Math.sin((performance.now() * 0.001 + i) * 28) * 0.1;
      missile.thrusterCore.scale.setScalar(flamePulse);
      missile.thrusterGlow.scale.setScalar(0.95 + flamePulse * 0.35);
      missile.thrusterGlow.material.opacity = THREE.MathUtils.clamp(0.14 + flamePulse * 0.16, 0, 1);
      missile.object.rotateZ(deltaTime * 5.4);
      const nosePulse = 0.72 + Math.sin((performance.now() * 0.001 + i * 0.7) * 18) * 0.22;
      missile.guidanceGlow.scale.setScalar(0.85 + nosePulse * 0.45);
      missile.guidanceGlow.material.opacity = THREE.MathUtils.clamp(0.5 + nosePulse * 0.38, 0, 1);
      missile.trailSpawnSeconds += deltaTime;
      while (missile.trailSpawnSeconds >= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS) {
        missile.trailSpawnSeconds -= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS;
        missile.thrusterGlow.getWorldPosition(smokeSpawnPosition);
        smokeTrailDirection.copy(missile.velocity).normalize();
        spawnTrailSmoke(smokeSpawnPosition, smokeTrailDirection);
      }

      if (shouldDetonateMissile(missile)) {
        detonateMissile(i, missile);
        continue;
      }

      if (missile.flightMode === "spline" && missile.splinePath) {
        if (missile.splinePath.elapsedSeconds >= missile.splinePath.durationSeconds) {
          detonateMissile(i, missile);
          continue;
        }
      }

      if (missile.lifeRemaining > 0) {
        continue;
      }

      detonateMissile(i, missile);
    }
  };

  const applyMissileHoming = (deltaTime: number, missile: ActiveMissile): void => {
    if (activeVolleyTargetIds.size <= 0) {
      missile.targetHurtboxId = null;
      return;
    }

    let targetHurtbox: HurtboxComponent | null = null;
    if (missile.targetHurtboxId) {
      const resolved = resolveTargetHurtboxById(missile.targetHurtboxId);
      if (resolved?.canReceiveDamage()) {
        targetHurtbox = resolved;
      }
    }

    if (!targetHurtbox) {
      const nearestTargetId = selectNearestVolleyTargetId(missile.object.position);
      missile.targetHurtboxId = nearestTargetId;
      if (!nearestTargetId) {
        return;
      }
      const resolved = resolveTargetHurtboxById(nearestTargetId);
      if (!resolved?.canReceiveDamage()) {
        return;
      }
      targetHurtbox = resolved;
    }

    targetHurtbox.getWorldCenter(lockTargetCenter);
    desiredMissileDirection.subVectors(lockTargetCenter, missile.object.position).setY(0);
    if (desiredMissileDirection.lengthSq() <= 0.000001) {
      return;
    }
    desiredMissileDirection.normalize();

    currentMissileDirection.copy(missile.velocity).setY(0);
    if (currentMissileDirection.lengthSq() <= 0.000001) {
      currentMissileDirection.copy(desiredMissileDirection);
    } else {
      currentMissileDirection.normalize();
    }

    const dot = THREE.MathUtils.clamp(currentMissileDirection.dot(desiredMissileDirection), -1, 1);
    const angularDelta = Math.acos(dot);
    if (angularDelta > 0.000001) {
      const maxTurnAngle = MISSILE_HOMING_TURN_RATE_RADIANS_PER_SECOND * deltaTime;
      const blend = THREE.MathUtils.clamp(maxTurnAngle / angularDelta, 0, 1);
      currentMissileDirection.lerp(desiredMissileDirection, blend).normalize();
    }

    missile.velocity
      .copy(currentMissileDirection)
      .multiplyScalar(getMissileTravelSpeed(missile.payload));
    homingQuaternion.setFromUnitVectors(MISSILE_FORWARD_AXIS, currentMissileDirection);
    missile.object.quaternion.slerp(homingQuaternion, THREE.MathUtils.clamp(deltaTime * 9, 0, 1));
  };

  const shouldDetonateMissile = (missile: ActiveMissile): boolean => {
    const fuseRadius = Math.max(0, missile.fuseRadius);
    if (fuseRadius <= 0) {
      return false;
    }

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(scratchHurtboxCenter);
      const combinedRadius = fuseRadius + Math.max(0, hurtbox.collisionArea.radius);
      if (
        missile.object.position.distanceToSquared(scratchHurtboxCenter) <=
        combinedRadius * combinedRadius
      ) {
        return true;
      }
    }

    return false;
  };

  const detonateMissile = (missileIndex: number, missile: ActiveMissile): void => {
    const explosionCenter = missile.object.position.clone();
    applyExplosionDamage(explosionCenter, missile.payload);
    spawnExplosionFlash(explosionCenter, missile.payload);
    disposeMissile(missileIndex);
  };

  const applyExplosionDamage = (
    origin: THREE.Vector3,
    launcherPayload: MissileBayComponentDefinition
  ): void => {
    const blastRadius = Math.max(0, launcherPayload.explosionRadius);
    if (blastRadius <= 0) {
      return;
    }

    const damagePacket: DamagePacket = {
      amount: Math.max(0, launcherPayload.missileDamage),
      damageType: launcherPayload.damageType,
      sourceFaction: "player"
    };

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(scratchHurtboxCenter);
      const combinedRadius = blastRadius + Math.max(0, hurtbox.collisionArea.radius);
      if (origin.distanceToSquared(scratchHurtboxCenter) > combinedRadius * combinedRadius) {
        continue;
      }
      hurtbox.receiveDamage(damagePacket);
    }
  };

  const spawnExplosionFlash = (
    origin: THREE.Vector3,
    launcherPayload: MissileBayComponentDefinition
  ): void => {
    const flash = new THREE.Mesh(
      explosionFlashGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xff9248,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    flash.position.copy(origin);
    root.add(flash);
    activeExplosions.push({
      age: 0,
      maxScale: Math.max(0.5, launcherPayload.explosionRadius * 0.92),
      mesh: flash
    });
  };

  const updateExplosions = (deltaTime: number): void => {
    for (let i = activeExplosions.length - 1; i >= 0; i -= 1) {
      const explosion = activeExplosions[i];
      explosion.age += deltaTime;
      const t = THREE.MathUtils.clamp(explosion.age / EXPLOSION_FLASH_LIFETIME_SECONDS, 0, 1);
      const scale = THREE.MathUtils.lerp(0.25, explosion.maxScale, t);
      explosion.mesh.scale.setScalar(scale);
      explosion.mesh.material.opacity = THREE.MathUtils.lerp(0.72, 0, t);

      if (t < 1) {
        continue;
      }

      explosion.mesh.removeFromParent();
      explosion.mesh.material.dispose();
      activeExplosions.splice(i, 1);
    }
  };

  const spawnLaunchSmoke = (origin: THREE.Vector3, direction: THREE.Vector3): void => {
    for (let i = 0; i < LAUNCH_SMOKE_COUNT; i += 1) {
      smokeDriftVelocity
        .copy(direction)
        .multiplyScalar(-0.9 - Math.random() * 0.9)
        .addScaledVector(worldUp, 0.22 + Math.random() * 0.48)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.55, 0, (Math.random() - 0.5) * 0.55));
      spawnSmokeParticle({
        origin,
        velocity: smokeDriftVelocity,
        lifetime: THREE.MathUtils.randFloat(0.4, 0.72),
        startScale: THREE.MathUtils.randFloat(0.05, 0.085),
        endScale: THREE.MathUtils.randFloat(0.24, 0.4),
        startOpacity: THREE.MathUtils.randFloat(0.34, 0.46)
      });
    }
  };

  const spawnTrailSmoke = (origin: THREE.Vector3, direction: THREE.Vector3): void => {
    smokeDriftVelocity
      .copy(direction)
      .multiplyScalar(-0.45 - Math.random() * 0.45)
      .addScaledVector(worldUp, 0.12 + Math.random() * 0.22)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.24, 0, (Math.random() - 0.5) * 0.24));
    spawnSmokeParticle({
      origin,
      velocity: smokeDriftVelocity,
      lifetime: THREE.MathUtils.randFloat(0.34, 0.58),
      startScale: THREE.MathUtils.randFloat(0.032, 0.048),
      endScale: THREE.MathUtils.randFloat(0.12, 0.19),
      startOpacity: THREE.MathUtils.randFloat(0.18, 0.28)
    });
  };

  const spawnSmokeParticle = ({
    origin,
    velocity,
    lifetime,
    startScale,
    endScale,
    startOpacity
  }: {
    endScale: number;
    lifetime: number;
    origin: THREE.Vector3;
    startOpacity: number;
    startScale: number;
    velocity: THREE.Vector3;
  }): void => {
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: startOpacity,
      depthWrite: false
    });
    const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
    smoke.position.copy(origin);
    smoke.scale.setScalar(startScale);
    root.add(smoke);
    activeSmokeParticles.push({
      age: 0,
      endScale,
      lifetime: Math.max(0.05, lifetime),
      mesh: smoke,
      startOpacity,
      startScale,
      velocity: velocity.clone()
    });
  };

  const updateSmokeParticles = (deltaTime: number): void => {
    for (let i = activeSmokeParticles.length - 1; i >= 0; i -= 1) {
      const smoke = activeSmokeParticles[i];
      smoke.age += deltaTime;
      const t = THREE.MathUtils.clamp(smoke.age / smoke.lifetime, 0, 1);
      smoke.mesh.position.addScaledVector(smoke.velocity, deltaTime);
      smoke.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * SMOKE_DRAG_PER_SECOND));
      smoke.mesh.scale.setScalar(THREE.MathUtils.lerp(smoke.startScale, smoke.endScale, t));
      smoke.mesh.material.opacity = THREE.MathUtils.lerp(smoke.startOpacity, 0, t);

      if (t < 1) {
        continue;
      }

      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
      activeSmokeParticles.splice(i, 1);
    }
  };

  const disposeMissile = (index: number): void => {
    const missile = activeMissiles[index];
    missile.object.removeFromParent();
    missile.guidanceGlow.material.dispose();
    missile.thrusterCore.material.dispose();
    missile.thrusterGlow.material.dispose();
    activeMissiles.splice(index, 1);
  };

  const dispose = (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("contextmenu", onContextMenu);

    for (let i = activeMissiles.length - 1; i >= 0; i -= 1) {
      disposeMissile(i);
    }
    for (const explosion of activeExplosions) {
      explosion.mesh.removeFromParent();
      explosion.mesh.material.dispose();
    }
    activeExplosions.length = 0;
    for (const smoke of activeSmokeParticles) {
      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
    }
    activeSmokeParticles.length = 0;
    clearLockedTargetIndicators();

    missileBodyGeometry.dispose();
    missileBodyMaterial.dispose();
    missileNoseGeometry.dispose();
    missileNoseMaterial.dispose();
    thrusterCoreGeometry.dispose();
    thrusterGlowGeometry.dispose();
    guidanceGlowGeometry.dispose();
    smokeGeometry.dispose();
    explosionFlashGeometry.dispose();
    lockedTargetOuterTexture.dispose();
    lockedTargetInnerTexture.dispose();
    for (const template of Object.values(missileModelTemplates)) {
      if (!template) {
        continue;
      }
      disposeObjectResources(template);
    }

    root.removeFromParent();
  };

  const createMissileBodyVisual = (launcherPayload: MissileBayComponentDefinition): THREE.Object3D => {
    const modelAssetId = getMissileModelAssetId(launcherPayload);
    const template =
      missileModelTemplates[modelAssetId] ?? missileModelTemplates.standard_concussive;
    if (template) {
      return template.clone(true);
    }

    const fallbackVisual = new THREE.Group();
    const body = new THREE.Mesh(missileBodyGeometry, missileBodyMaterial);
    body.rotation.x = Math.PI * 0.5;
    fallbackVisual.add(body);

    const nose = new THREE.Mesh(missileNoseGeometry, missileNoseMaterial);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.z = MISSILE_BODY_LENGTH * 0.5 + MISSILE_NOSE_LENGTH * 0.5 - 0.02;
    fallbackVisual.add(nose);
    return fallbackVisual;
  };

  const disposeObjectResources = (object: THREE.Object3D): void => {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }

      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          material.dispose();
        }
        return;
      }

      node.material.dispose();
    });
  };

  const getStatus = (): MissileBayStatus => {
    const ammoCapacity = getMagazineCapacity();
    const isReloading = launcherReloadingFlags.some((flag) => flag);
    const launcherCount = Math.max(1, missileLauncherGroups.length);
    const cellsPerLauncher = Math.max(
      1,
      Math.floor(
        cellsPerLauncherHint ??
          Math.max(
            ...missileLauncherGroups.map((group) => group.length),
            Math.ceil(Math.max(1, ammoCapacity) / launcherCount)
          )
      )
    );
    let lockedTargetCount = 0;
    for (const [, state] of targetLockStates) {
      if (state.locked) {
        lockedTargetCount += 1;
      }
    }
    const maxReloadProgress01 = Math.max(
      0,
      ...launcherReloadProgressSeconds.map((seconds, index) => {
        if (!launcherReloadingFlags[index]) {
          return 0;
        }
        const launcherPayload = launcherPayloads[index] ?? resolvedLegacyPayload;
        const reloadSeconds = Math.max(0.001, launcherPayload.reloadSeconds);
        if (launcherPayload.reloadMode === "full_magazine") {
          return seconds / reloadSeconds;
        }
        return seconds / reloadSeconds;
      })
    );

    return {
      ammoCapacity,
      ammoLoaded: roundsRemaining,
      cellsPerLauncher,
      firedFlashSeconds,
      isLocking,
      launcherCount,
      launcherIds: [...launcherIds],
      launcherLoadedCounts: launcherRoundsRemaining.map((count) => Math.max(0, count)),
      launcherPayloadNames: launcherPayloads.map((launcherPayload) => launcherPayload.name),
      launcherReloadingFlags: launcherReloadingFlags.map((flag) => flag),
      isReloading,
      lockedTargetCount,
      lockingProgress01,
      reloadProgress01: isReloading
        ? THREE.MathUtils.clamp(maxReloadProgress01, 0, 1)
        : 0
    };
  };

  return {
    getStatus,
    update,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (enabled) {
        return;
      }

      queuedShots = 0;
      burstShotCooldownSeconds = 0;
      triggerFireCooldownSeconds = 0;
      hasLastYaw = false;
      turnDirection = 0;
      clearCurrentLocks();
      activeVolleyTargetIds.clear();
      activeVolleyTargetLockCounts.clear();
    },
    setMissileBays,
    setMissileCells,
    dispose
  };
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}

function selectSequentialIndices(length: number, startIndex: number, count: number): number[] {
  if (length <= 0 || count <= 0) {
    return [];
  }

  const indices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    indices.push((startIndex + i) % length);
  }
  return indices;
}

function selectRandomIndices(length: number, count: number): number[] {
  if (length <= 0 || count <= 0) {
    return [];
  }

  if (length >= count) {
    const bag = Array.from({ length }, (_, index) => index);
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(Math.random() * (i + 1));
      const temp = bag[i];
      bag[i] = bag[swapIndex];
      bag[swapIndex] = temp;
    }
    return bag.slice(0, count);
  }

  const indices: number[] = [];
  for (let i = 0; i < count; i += 1) {
    indices.push(Math.floor(Math.random() * length));
  }
  return indices;
}

function evaluateCubicBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const oneMinusT = 1 - clampedT;
  const oneMinusTSq = oneMinusT * oneMinusT;
  const tSq = clampedT * clampedT;
  const a = oneMinusTSq * oneMinusT;
  const b = 3 * oneMinusTSq * clampedT;
  const c = 3 * oneMinusT * tSq;
  const d = tSq * clampedT;
  return out
    .copy(p0)
    .multiplyScalar(a)
    .addScaledVector(p1, b)
    .addScaledVector(p2, c)
    .addScaledVector(p3, d);
}

function evaluateCubicBezierTangent(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const oneMinusT = 1 - clampedT;
  const a = 3 * oneMinusT * oneMinusT;
  const b = 6 * oneMinusT * clampedT;
  const c = 3 * clampedT * clampedT;
  return out.set(
    a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
    a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z)
  );
}

function randomCircleOffsetXZ(radius: number, out: THREE.Vector3): THREE.Vector3 {
  const clampedRadius = Math.max(0, radius);
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * clampedRadius;
  out.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  return out;
}
