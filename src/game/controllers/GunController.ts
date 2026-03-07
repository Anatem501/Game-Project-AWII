import * as THREE from "three";
import type { DamagePacketSegment } from "../components/combat/CombatTypes";
import { LASER_DAMAGE_TYPE, type DamageType } from "../components/combat/DamageTypes";
import { resolveHitboxAgainstHurtboxes } from "../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createIonHitElectricBurstSystem } from "../effects/IonHitElectricBurstSystem";
import { createLaserHitSparkExplosionSystem } from "../effects/LaserHitSparkExplosionSystem";
import { createPlasmaHitImplosionSystem } from "../effects/PlasmaHitImplosionSystem";
import { createPlasmaMuzzleGlobBurstSystem } from "../effects/PlasmaMuzzleGlobBurstSystem";
import { createSolarHitFlashSystem } from "../effects/SolarHitFlashSystem";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import { createFrostHitCrystalBurstSystem } from "../effects/FrostHitCrystalBurstSystem";
import { createVoidHitVortexSystem } from "../effects/VoidHitVortexSystem";
import { createVoidSeekerHitBurstSystem } from "../effects/VoidSeekerHitBurstSystem";
import { createConcussiveBlastRingSystem } from "../effects/ConcussiveBlastRingSystem";
import { createMissileExplosionFlashSmokeSystem } from "../effects/MissileExplosionFlashSmokeSystem";
import type { PlayerControllerState } from "./PlayerController";
import type { ProjectileFactory, ProjectileInstance } from "./projectiles/ProjectileTypes";

const DEFAULT_GUN_FIRE_INTERVAL_SECONDS = 0.5;
const MIN_AIM_DISTANCE_FROM_SHIP = 1;
const FULL_AIM_ARC_RADIANS = Math.PI;
const TURN_RATE_EPSILON_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(3);
const DEFAULT_PRIMARY_FIRE_MOUSE_BUTTON = 0;
const GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX = 5;
const PLAYER_CANNON_MUZZLE_SPARK_COUNT = 18;
const PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS = 0.11;
const PLAYER_CANNON_MUZZLE_SPEED_MIN = 1.5;
const PLAYER_CANNON_MUZZLE_SPEED_MAX = 5.1;
const PLAYER_CANNON_MUZZLE_SPREAD_RADIANS = THREE.MathUtils.degToRad(9);
const ION_MUZZLE_BURST_COUNT = 24;
const ION_MUZZLE_BURST_LIFETIME_SECONDS = 0.12;
const ION_MUZZLE_BURST_SPEED_MIN = 0.7;
const ION_MUZZLE_BURST_SPEED_MAX = 2.8;
const DEFAULT_HITSCAN_BEAM_PULSE_DURATION_SECONDS = 0.6;
const DEFAULT_HITSCAN_BEAM_MAX_DISTANCE = 240;
const DEFAULT_HITSCAN_BEAM_THICKNESS = 0.08;
const DEFAULT_HITSCAN_BEAM_HIT_SPARK_INTERVAL_SECONDS = 0.08;
const HITSCAN_BEAM_FADE_START_RATIO = 0.45;
const HITSCAN_BEAM_OUTER_OPACITY = 0.34;
const HITSCAN_BEAM_INNER_OPACITY = 0.92;
const HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER = 1;
const HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER = 0.34;
const DEFAULT_RETICLE_HOMING_TARGET_PADDING = 0.3;
const HEAVY_BEAM_MUZZLE_FX_INTERVAL_SECONDS = 0.06;
const HEAVY_BEAM_HIT_FX_INTERVAL_SECONDS = 0.08;
const HEAVY_BEAM_EDGE_PARTICLE_POOL_MULTIPLIER = 2.5;
const HEAVY_BEAM_EDGE_PARTICLE_EMISSION_WINDOW_SECONDS = 0.7;
const HEAVY_BEAM_EDGE_PARTICLE_MIN_EMISSION_INTERVAL_SECONDS = 0.018;
const HEAVY_BEAM_EDGE_PARTICLE_EMISSION_JITTER_MIN = 0.62;
const HEAVY_BEAM_EDGE_PARTICLE_EMISSION_JITTER_MAX = 1.48;
const HEAVY_BEAM_EDGE_PARTICLE_LENGTH_MULTIPLIER_MIN = 0.95;
const HEAVY_BEAM_EDGE_PARTICLE_LENGTH_MULTIPLIER_MAX = 2.1;
const HEAVY_BEAM_EDGE_PARTICLE_BASE_RADIUS_SCALE = 0.84;
const HEAVY_BEAM_EDGE_PARTICLE_RADIUS_JITTER_MIN = 0.92;
const HEAVY_BEAM_EDGE_PARTICLE_RADIUS_JITTER_MAX = 1.03;
const HEAVY_BEAM_EDGE_PARTICLE_RADIAL_WOBBLE_SCALE = 0.06;
const HEAVY_BEAM_EDGE_PARTICLE_THICKNESS_MULTIPLIER = 0.58;
const HEAVY_BEAM_EDGE_PARTICLE_MUZZLE_FORWARD_OFFSET = 0.02;
const HEAVY_BEAM_EDGE_PARTICLE_MUZZLE_FORWARD_RANDOM_MAX = 0.16;
const HEAVY_BEAM_MAX_AIM_OFFSET_RADIANS = THREE.MathUtils.degToRad(5);
const HEAVY_BEAM_SPIKY_EMISSION_VERTEX_SHADER = `
uniform float uAge;
uniform float uLifetime;
uniform float uSpinSpeed;
uniform float uSpikeFrequency;
uniform float uSpikeStrength;
uniform float uConeStretch;
uniform float uSeed;

varying float vLife;
varying float vConeMask;
varying float vRadiusMask;

void main() {
  float t = clamp(uAge / max(0.0001, uLifetime), 0.0, 1.0);
  vec3 n = normalize(normal);
  vec3 p = position;
  float coneMask = clamp((n.y + 1.0) * 0.5, 0.0, 1.0);
  float spikeWave = sin((n.x + n.z) * uSpikeFrequency + uSeed * 17.0 + uAge * 24.0);
  float spike = (0.28 + coneMask * 0.72) * spikeWave * uSpikeStrength * (1.0 - t);
  p += n * spike;
  p.y *= mix(1.1, uConeStretch, coneMask);
  p.xz *= mix(1.0, 0.18, coneMask);

  float spin = uAge * uSpinSpeed + uSeed * 5.0;
  mat2 rotation = mat2(cos(spin), -sin(spin), sin(spin), cos(spin));
  p.xz = rotation * p.xz;

  vec4 modelPosition = modelMatrix * vec4(p, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  vLife = 1.0 - t;
  vConeMask = coneMask;
  vRadiusMask = clamp(1.0 - length(p.xz), 0.0, 1.0);
}
`;

const HEAVY_BEAM_SPIKY_EMISSION_FRAGMENT_SHADER = `
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;

varying float vLife;
varying float vConeMask;
varying float vRadiusMask;

void main() {
  float alpha = vLife * (0.2 + vConeMask * 0.8) * (0.28 + vRadiusMask * 0.72);
  if (alpha <= 0.001) {
    discard;
  }
  vec3 color = mix(uGlowColor, uCoreColor, clamp(vRadiusMask * 1.2, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

type WeaponResourceCost = {
  energyCost: number;
  heatCost: number;
};

type HitscanPulseEffectStyle =
  | "default"
  | "electromagnetic_railgun"
  | "explosive_shell_fire"
  | "heavy_laserbeam_pulse";

type HitscanPulseFireModeDefinition = {
  maxDistance?: number;
  pulseDurationSeconds?: number;
  beamThickness?: number;
  damageAmount: number;
  damageType?: DamageType;
  additionalDamageSegments?: readonly DamagePacketSegment[];
  sourceFaction?: string | null;
  hitSparkIntervalSeconds?: number;
  beamColor?: number;
  beamCoreColor?: number;
  effectStyle?: HitscanPulseEffectStyle;
  explosionRadius?: number;
  explosionDamageAmount?: number;
  edgeParticleCount?: number;
  edgeParticleSpeedUnitsPerSecond?: number;
  edgeParticleLength?: number;
  edgeParticleThickness?: number;
  edgeParticleOrbitRadiusMultiplier?: number;
};

type NormalizedHitscanPulseFireModeDefinition = {
  maxDistance: number;
  pulseDurationSeconds: number;
  beamThickness: number;
  damageAmount: number;
  damageType: DamageType;
  additionalDamageSegments: readonly DamagePacketSegment[];
  sourceFaction: string | null;
  hitSparkIntervalSeconds: number;
  beamColor: number;
  beamCoreColor: number;
  effectStyle: HitscanPulseEffectStyle;
  explosionRadius: number;
  explosionDamageAmount: number;
  edgeParticleCount: number;
  edgeParticleSpeedUnitsPerSecond: number;
  edgeParticleLength: number;
  edgeParticleThickness: number;
  edgeParticleOrbitRadiusMultiplier: number;
};

type ActiveHitscanEdgeParticle = {
  travelY: number;
  orbitAngle: number;
  baseOrbitRadius: number;
  orbitRadius: number;
  speedUnitsPerSecond: number;
  baseLength: number;
  length: number;
  baseThickness: number;
  isActive: boolean;
  focusOffset01: number;
  wobblePhase: number;
  wobbleSpeed: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
};

type ActiveChargeTelegraphMesh = {
  root: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
};

type ActiveHitscanBeamPulse = {
  age: number;
  duration: number;
  root: THREE.Group;
  outlineMaterial: THREE.MeshBasicMaterial | null;
  outlineBaseOpacity: number;
  outerMaterial: THREE.MeshBasicMaterial;
  outerBaseOpacity: number;
  innerMaterial: THREE.MeshBasicMaterial;
  innerBaseOpacity: number;
  railSlugCoreMaterial: THREE.MeshBasicMaterial | null;
  railSlugShellMaterial: THREE.MeshBasicMaterial | null;
  railSlugCoreMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null;
  railSlugShellMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null;
  railSlugBeamDistance: number;
  railSlugTravelDuration: number;
  edgeParticles: ActiveHitscanEdgeParticle[];
};

type ActiveHeavySustainedBeam = {
  root: THREE.Group;
  outerMaterial: THREE.MeshBasicMaterial;
  innerMaterial: THREE.MeshBasicMaterial;
  outerBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  innerBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  edgeParticles: ActiveHitscanEdgeParticle[];
  edgeParticleEmissionIntervalSeconds: number;
  edgeParticleEmissionCooldownSeconds: number;
  muzzleFxCooldownSeconds: number;
  hitFxCooldownSeconds: number;
};

type ActiveHeavySpikyEmission = {
  age: number;
  lifetime: number;
  startScale: number;
  endScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
};

type HeavySpikyEmissionSpawnOptions = {
  parent?: THREE.Object3D;
  localPosition?: THREE.Vector3;
  reverseDirection?: boolean;
};

type GunFireModeDefinition = {
  fireIntervalSeconds?: number;
  fireIntervalSequenceSeconds?: readonly number[];
  fireIntervalMultiplierScope?: "all_steps" | "burst_gap_only";
  completeBurstOnRelease?: boolean;
  reloadAfterShots?: number;
  reloadDurationSeconds?: number;
  shareReloadAcrossHardpoints?: boolean;
  burstPhaseGroupId?: number;
  burstPhaseGroupPattern?: readonly number[];
  phaseOffsetSeconds?: number;
  chargeDurationSeconds?: number;
  projectileFactory?: ProjectileFactory;
  hitscanPulse?: HitscanPulseFireModeDefinition;
  heatCost?: number;
  energyCost?: number;
};

export type GunDefinition = {
  hardpoint: THREE.Object3D;
  fireIntervalSeconds?: number;
  projectileFactory?: ProjectileFactory;
  primary?: GunFireModeDefinition;
};

type NormalizedGunDefinition = {
  hardpoint: THREE.Object3D;
  primary: {
    fireIntervalSeconds: number;
    fireIntervalSequenceSeconds: number[];
    fireIntervalMultiplierScope: "all_steps" | "burst_gap_only";
    completeBurstOnRelease: boolean;
    reloadAfterShots: number | null;
    reloadDurationSeconds: number;
    shareReloadAcrossHardpoints: boolean;
    burstPhaseGroupId: number | null;
    burstPhaseGroupPattern: number[];
    phaseOffsetSeconds: number;
    chargeDurationSeconds: number;
    projectileFactory: ProjectileFactory | null;
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition | null;
    heatCost: number;
    energyCost: number;
  };
};

type GunControllerParams = {
  aimReticle: THREE.Object3D;
  canvas: HTMLCanvasElement;
  viewCamera?: THREE.Camera;
  guns: readonly GunDefinition[];
  playerRoot: THREE.Group;
  scene: THREE.Scene;
  hardpointAimOffsetScale?: number;
  minAimDistanceFromShip?: number;
  maxAimAngleRadians?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
  interceptTargetHurtboxes?: readonly HurtboxComponent[];
  reticleHomingTargetPadding?: number;
  consumePrimaryFireCost?: (cost: WeaponResourceCost) => boolean;
  getPrimaryFireIntervalMultiplier?: () => number;
  resolvePrimaryFireInputForGun?: (gunIndex: number) => boolean;
  canPrimaryFireForGun?: (gunIndex: number) => boolean;
  disableDefaultPrimaryFireInput?: boolean;
  defaultPrimaryFireMouseButton?: number;
  defaultPrimaryFireGamepadButtonIndex?: number;
};

export type GunController = {
  update: (deltaTime: number, playerState: PlayerControllerState) => void;
  isPrimaryFireInputActive: () => boolean;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export function createGunController({
  aimReticle,
  canvas,
  viewCamera,
  guns,
  playerRoot,
  scene,
  hardpointAimOffsetScale = 1,
  minAimDistanceFromShip = MIN_AIM_DISTANCE_FROM_SHIP,
  maxAimAngleRadians = FULL_AIM_ARC_RADIANS,
  targetHurtboxes = [],
  interceptTargetHurtboxes = [],
  reticleHomingTargetPadding = DEFAULT_RETICLE_HOMING_TARGET_PADDING,
  consumePrimaryFireCost,
  getPrimaryFireIntervalMultiplier,
  resolvePrimaryFireInputForGun,
  canPrimaryFireForGun,
  disableDefaultPrimaryFireInput = false,
  defaultPrimaryFireMouseButton = DEFAULT_PRIMARY_FIRE_MOUSE_BUTTON,
  defaultPrimaryFireGamepadButtonIndex = GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX
}: GunControllerParams): GunController {
  const muzzleWorld = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const fallbackForward = new THREE.Vector3();
  const clampedForward = new THREE.Vector3();
  const crossForwardAim = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const shipToAim = new THREE.Vector3();
  const aimTargetWorld = new THREE.Vector3();
  const hardpointLocalOffset = new THREE.Vector3();
  const hardpointWorldOffset = new THREE.Vector3();
  const estimatedShipVelocity = new THREE.Vector3();
  const lastPlayerPosition = new THREE.Vector3();
  const playerPositionDelta = new THREE.Vector3();
  const beamMidpoint = new THREE.Vector3();
  const beamEndPoint = new THREE.Vector3();
  const beamHitPoint = new THREE.Vector3();
  const hurtboxCenter = new THREE.Vector3();
  const rayToCenter = new THREE.Vector3();
  const projectileMergeCenterA = new THREE.Vector3();
  const projectileMergeCenterB = new THREE.Vector3();
  const heavyEmissionLocalPosition = new THREE.Vector3();
  const beamSampleWorld = new THREE.Vector3();
  const beamSampleNdc = new THREE.Vector3();
  const unitCylinderAxis = new THREE.Vector3(0, 1, 0);
  const beamOrientation = new THREE.Quaternion();
  const projectiles: ProjectileInstance[] = [];
  const activeHitscanBeamPulses: ActiveHitscanBeamPulse[] = [];
  const sparkBursts = createShipGunSparkBurstSystem(scene, {
    sparkCountPerBurst: PLAYER_CANNON_MUZZLE_SPARK_COUNT,
    burstLifetimeSeconds: PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS,
    speedMin: PLAYER_CANNON_MUZZLE_SPEED_MIN,
    speedMax: PLAYER_CANNON_MUZZLE_SPEED_MAX,
    spreadRadians: PLAYER_CANNON_MUZZLE_SPREAD_RADIANS
  });
  const hitSparkExplosions = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 68
  });
  const heavyBeamHitSparks = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 40,
    lifetimeSeconds: 0.2,
    speedMin: 2.1,
    speedMax: 6.1,
    spreadRadians: THREE.MathUtils.degToRad(32),
    pointSizeScale: 1.75,
    coreColor: 0xf5fff8,
    glowColor: 0x41ff70,
    blobiness: 0.9
  });
  const plasmaArcHitSparkExplosions = createLaserHitSparkExplosionSystem(scene, {
    lifetimeSeconds: 0.38,
    sparkCount: 56,
    speedMin: 2.2,
    speedMax: 8.2,
    spreadRadians: THREE.MathUtils.degToRad(24),
    pointSizeScale: 1.45,
    coreColor: 0xffb06c,
    glowColor: 0xe13a26
  });
  const acidHitSparkExplosions = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 24,
    lifetimeSeconds: 0.24,
    speedMin: 1.2,
    speedMax: 4.6,
    spreadRadians: THREE.MathUtils.degToRad(46),
    pointSizeScale: 1.35,
    opacityScale: 0.78,
    coreColor: 0xf8ff9a,
    glowColor: 0xb5ee2f
  });
  const railgunBlueSparkBursts = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 26,
    lifetimeSeconds: 0.13,
    speedMin: 2.8,
    speedMax: 8.8,
    spreadRadians: THREE.MathUtils.degToRad(24),
    pointSizeScale: 0.85,
    coreColor: 0xcfeeff,
    glowColor: 0x2f8fff
  });
  const railgunImpactBlueSparkBursts = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 34,
    lifetimeSeconds: 0.17,
    speedMin: 3.4,
    speedMax: 10.6,
    spreadRadians: THREE.MathUtils.degToRad(34),
    pointSizeScale: 0.95,
    coreColor: 0xdbf2ff,
    glowColor: 0x3a9dff
  });
  const explosiveShellMuzzleOrangeSparks = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 30,
    lifetimeSeconds: 0.12,
    speedMin: 3.4,
    speedMax: 10.8,
    spreadRadians: THREE.MathUtils.degToRad(30),
    pointSizeScale: 0.9,
    coreColor: 0xffcf9a,
    glowColor: 0xff5a1f
  });
  const explosiveShellHitExplosionSparks = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 28,
    lifetimeSeconds: 0.2,
    speedMin: 1.1,
    speedMax: 4.2,
    spreadRadians: THREE.MathUtils.degToRad(32),
    pointSizeScale: 1.28,
    opacityScale: 0.82,
    coreColor: 0xffc287,
    glowColor: 0xff5b1a
  });
  const chaingunHitYellowSparks = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 20,
    lifetimeSeconds: 0.16,
    speedMin: 3.8,
    speedMax: 9.2,
    spreadRadians: THREE.MathUtils.degToRad(30),
    pointSizeScale: 0.6,
    coreColor: 0xffe7a2,
    glowColor: 0xd99a16
  });
  const chaingunMuzzleSparkFlashes = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 20,
    lifetimeSeconds: 0.07,
    speedMin: 2.2,
    speedMax: 7.1,
    spreadRadians: THREE.MathUtils.degToRad(18),
    pointSizeScale: 0.58,
    coreColor: 0xffdfa8,
    glowColor: 0xc97b2a
  });
  const ionMuzzleBursts = createIonHitElectricBurstSystem(scene, {
    burstCount: ION_MUZZLE_BURST_COUNT,
    lifetimeSeconds: ION_MUZZLE_BURST_LIFETIME_SECONDS,
    speedMin: ION_MUZZLE_BURST_SPEED_MIN,
    speedMax: ION_MUZZLE_BURST_SPEED_MAX
  });
  const ionHitBursts = createIonHitElectricBurstSystem(scene);
  const frostHitBursts = createFrostHitCrystalBurstSystem(scene);
  const plasmaHitImplosions = createPlasmaHitImplosionSystem(scene);
  const acidHitSplashes = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 28,
    burstLifetimeSeconds: 0.42,
    speedMin: 0.04,
    speedMax: 0.72,
    spreadRadians: THREE.MathUtils.degToRad(52),
    forwardVelocityBias: 0.04,
    motionHoldSeconds: 0.03,
    pointSizeScale: 3.5,
    opacityScale: 0.92,
    deepColor: 0x8ead14,
    coreColor: 0xfbff82,
    blending: THREE.NormalBlending
  });
  const explosiveShellHitImplosions = createPlasmaHitImplosionSystem(scene, {
    opacityScale: 0.16,
    globCount: 8,
    lifetimeSeconds: 0.2
  });
  const explosiveShellMissileExplosionBursts = createMissileExplosionFlashSmokeSystem(scene, {
    opacityScale: 0.62,
    smokeColor: 0xff8a52,
    smokeCountMin: 16,
    smokeCountMax: 28,
    smokeSpeedMultiplier: 1.9,
    smokeVerticalBiasMin: 0.0,
    smokeVerticalBiasMax: 0.12,
    smokeDragPerSecond: 1.45
  });
  const plasmaMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene);
  const acidMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 18,
    burstLifetimeSeconds: 0.22,
    speedMin: 0.22,
    speedMax: 1.1,
    spreadRadians: THREE.MathUtils.degToRad(18),
    forwardVelocityBias: 1.35,
    motionHoldSeconds: 0.01,
    pointSizeScale: 1.15,
    deepColor: 0x72c218,
    coreColor: 0xecff84
  });
  const voidMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 14,
    burstLifetimeSeconds: 0.2,
    speedMin: 0.25,
    speedMax: 1.15,
    spreadRadians: THREE.MathUtils.degToRad(13),
    deepColor: 0x180a28,
    coreColor: 0x4a2d73
  });
  const voidSeekerMuzzleShadowBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 22,
    burstLifetimeSeconds: 0.2,
    speedMin: 0.9,
    speedMax: 3.8,
    spreadRadians: THREE.MathUtils.degToRad(14),
    forwardVelocityBias: 2.4,
    motionHoldSeconds: 0.03,
    pointSizeScale: 1.35,
    deepColor: 0x08060d,
    coreColor: 0xf1ecff
  });
  const chaingunMuzzleSmokeBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 12,
    burstLifetimeSeconds: 0.14,
    speedMin: 0.05,
    speedMax: 0.55,
    spreadRadians: THREE.MathUtils.degToRad(24),
    forwardVelocityBias: 0.18,
    motionHoldSeconds: 0.012,
    pointSizeScale: 1.25,
    deepColor: 0x050505,
    coreColor: 0x303030,
    blending: THREE.NormalBlending
  });
  const explosiveShellBeamSmokeBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 16,
    burstLifetimeSeconds: 0.28,
    speedMin: 0.01,
    speedMax: 0.14,
    spreadRadians: THREE.MathUtils.degToRad(28),
    forwardVelocityBias: 0.04,
    motionHoldSeconds: 0.014,
    pointSizeScale: 2.6,
    deepColor: 0x1a1a1a,
    coreColor: 0xb4b8be,
    blending: THREE.NormalBlending
  });
  const explosiveShellHitSmokeBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 18,
    burstLifetimeSeconds: 0.52,
    speedMin: 0.01,
    speedMax: 0.16,
    spreadRadians: THREE.MathUtils.degToRad(22),
    forwardVelocityBias: 0.03,
    motionHoldSeconds: 0.04,
    pointSizeScale: 5.1,
    opacityScale: 0.3,
    deepColor: 0x1a1a1a,
    coreColor: 0xcfd4da,
    blending: THREE.NormalBlending
  });
  const explosiveShellMuzzleSmokeBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 24,
    burstLifetimeSeconds: 0.28,
    speedMin: 0.02,
    speedMax: 0.2,
    spreadRadians: THREE.MathUtils.degToRad(30),
    forwardVelocityBias: 0.08,
    motionHoldSeconds: 0.02,
    pointSizeScale: 3.4,
    deepColor: 0x171717,
    coreColor: 0xc2c6cc,
    blending: THREE.NormalBlending
  });
  const concussiveBlastRings = createConcussiveBlastRingSystem(scene, {
    color: 0xffaa4d,
    opacity: 0.3,
    lifetimeSeconds: 0.32
  });
  const frostMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 18,
    burstLifetimeSeconds: 0.26,
    speedMin: 0.18,
    speedMax: 0.85,
    spreadRadians: THREE.MathUtils.degToRad(20),
    forwardVelocityBias: 1.15,
    pointSizeScale: 1.2,
    deepColor: 0x4ca9e8,
    coreColor: 0xe9fbff
  });
  const solarHitFlashes = createSolarHitFlashSystem(scene);
  const voidHitVortices = createVoidHitVortexSystem(scene);
  const voidSeekerHitBursts = createVoidSeekerHitBurstSystem(scene);
  const projectilesRoot = new THREE.Group();
  const hitscanBeamPulsesRoot = new THREE.Group();
  const hitscanBeamOuterGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const hitscanBeamInnerGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const hitscanBeamEdgeParticleGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const heavyLaserChargeSphereGeometry = new THREE.SphereGeometry(1, 14, 10);
  const heavyBeamSpikyEmissionGeometry = new THREE.SphereGeometry(1, 20, 14);
  const railSlugGeometry = new THREE.SphereGeometry(1, 12, 10);
  const normalizedGuns = normalizeGunDefinitions(guns);
  const activeHeavyChargeTelegraphs: Array<ActiveChargeTelegraphMesh | null> = normalizedGuns.map(
    () => null
  );
  const activeHeavySpikyEmissions: ActiveHeavySpikyEmission[] = [];
  const activeHeavySustainedBeams: Array<ActiveHeavySustainedBeam | null> = normalizedGuns.map(
    () => null
  );
  const heavyBeamVisualHoldSeconds = normalizedGuns.map(() => 0);
  const primaryInitialCooldowns = normalizedGuns.map((gun) => {
    const sequence = gun.primary.fireIntervalSequenceSeconds;
    const interval =
      sequence.length > 0
        ? Math.max(0.001, sequence.reduce((sum, step) => sum + Math.max(0.001, step), 0))
        : Math.max(0.001, gun.primary.fireIntervalSeconds);
    const offset = gun.primary.phaseOffsetSeconds ?? 0;
    return THREE.MathUtils.euclideanModulo(offset, interval);
  });
  const primaryCooldowns = [...primaryInitialCooldowns];
  const primaryCooldownStepIndices = normalizedGuns.map(() => 0);
  const primaryBurstPhasePatternIndices = normalizedGuns.map(() => 0);
  const primaryBurstContinueUntilWrap = normalizedGuns.map(() => false);
  const primaryChargeElapsedSeconds = normalizedGuns.map(() => 0);
  const primaryReloadGroupIds = (() => {
    const groupIds = normalizedGuns.map(() => -1);
    const groupIdsByKey = new Map<string, number>();
    let nextGroupId = 0;
    for (let i = 0; i < normalizedGuns.length; i += 1) {
      const gun = normalizedGuns[i];
      const reloadAfterShots = gun.primary.reloadAfterShots;
      const reloadDurationSeconds = gun.primary.reloadDurationSeconds;
      const shareReloadAcrossHardpoints = gun.primary.shareReloadAcrossHardpoints;
      if (reloadAfterShots === null || reloadAfterShots <= 0 || reloadDurationSeconds <= 0) {
        continue;
      }
      const key = shareReloadAcrossHardpoints
        ? `${reloadAfterShots}:${reloadDurationSeconds}`
        : `gun:${i}:${reloadAfterShots}:${reloadDurationSeconds}`;
      const existingGroupId = groupIdsByKey.get(key);
      if (existingGroupId !== undefined) {
        groupIds[i] = existingGroupId;
        continue;
      }
      const groupId = nextGroupId;
      nextGroupId += 1;
      groupIdsByKey.set(key, groupId);
      groupIds[i] = groupId;
    }
    return groupIds;
  })();
  const primaryReloadGroupShotsFired = Array.from(
    { length: Math.max(0, ...primaryReloadGroupIds) + 1 },
    () => 0
  );
  const primaryReloadGroupRemainingSeconds = Array.from(
    { length: Math.max(0, ...primaryReloadGroupIds) + 1 },
    () => 0
  );
  const perGunPrimaryFireInputActive = normalizedGuns.map(() => false);
  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);
  scene.add(projectilesRoot);
  scene.add(hitscanBeamPulsesRoot);

  const resetPrimaryCooldowns = (): void => {
    for (let i = 0; i < primaryCooldowns.length; i += 1) {
      primaryCooldowns[i] = primaryInitialCooldowns[i] ?? 0;
      primaryCooldownStepIndices[i] = 0;
      primaryBurstPhasePatternIndices[i] = 0;
      primaryBurstContinueUntilWrap[i] = false;
      primaryChargeElapsedSeconds[i] = 0;
      heavyBeamVisualHoldSeconds[i] = 0;
    }
    for (let i = 0; i < primaryReloadGroupShotsFired.length; i += 1) {
      primaryReloadGroupShotsFired[i] = 0;
      primaryReloadGroupRemainingSeconds[i] = 0;
    }
  };

  const disposeActiveHeavySustainedBeam = (gunIndex: number): void => {
    const activeBeam = activeHeavySustainedBeams[gunIndex];
    if (!activeBeam) {
      return;
    }
    activeBeam.root.removeFromParent();
    activeBeam.outerMaterial.dispose();
    activeBeam.innerMaterial.dispose();
    for (const edgeParticle of activeBeam.edgeParticles) {
      edgeParticle.material.dispose();
    }
    activeHeavySustainedBeams[gunIndex] = null;
  };

  const ensureActiveHeavySustainedBeam = (
    gunIndex: number,
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition
  ): ActiveHeavySustainedBeam => {
    const existingBeam = activeHeavySustainedBeams[gunIndex];
    if (existingBeam) {
      return existingBeam;
    }

    const root = new THREE.Group();
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamColor,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamCoreColor,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const outerBeam = new THREE.Mesh(hitscanBeamOuterGeometry, outerMaterial);
    const innerBeam = new THREE.Mesh(hitscanBeamInnerGeometry, innerMaterial);
    outerBeam.renderOrder = 12;
    innerBeam.renderOrder = 13;
    outerBeam.frustumCulled = false;
    innerBeam.frustumCulled = false;
    root.add(outerBeam);
    root.add(innerBeam);

    const edgeParticles: ActiveHitscanEdgeParticle[] = [];
    const edgeParticleCount = Math.max(
      0,
      Math.floor(hitscanPulse.edgeParticleCount * HEAVY_BEAM_EDGE_PARTICLE_POOL_MULTIPLIER)
    );
    const edgeParticleSpeed = Math.max(0.1, hitscanPulse.edgeParticleSpeedUnitsPerSecond);
    const edgeParticleEmissionIntervalSeconds =
      edgeParticleCount > 0
        ? Math.max(
            HEAVY_BEAM_EDGE_PARTICLE_MIN_EMISSION_INTERVAL_SECONDS,
            HEAVY_BEAM_EDGE_PARTICLE_EMISSION_WINDOW_SECONDS / edgeParticleCount
          )
        : Number.POSITIVE_INFINITY;
    if (edgeParticleCount > 0) {
      const edgeParticleLength = Math.max(0.04, hitscanPulse.edgeParticleLength);
      const edgeParticleThickness = Math.max(
        0.002,
        hitscanPulse.edgeParticleThickness * HEAVY_BEAM_EDGE_PARTICLE_THICKNESS_MULTIPLIER
      );
      const edgeOrbitRadius = Math.max(
        hitscanPulse.beamThickness *
          Math.max(1, hitscanPulse.edgeParticleOrbitRadiusMultiplier) *
          HEAVY_BEAM_EDGE_PARTICLE_BASE_RADIUS_SCALE,
        hitscanPulse.beamThickness * 0.66
      );
      for (let i = 0; i < edgeParticleCount; i += 1) {
        const orbitAngle =
          (i / Math.max(1, edgeParticleCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
        const material = new THREE.MeshBasicMaterial({
          color: hitscanPulse.beamCoreColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(hitscanBeamEdgeParticleGeometry, material);
        mesh.scale.set(edgeParticleThickness, edgeParticleLength, edgeParticleThickness);
        mesh.renderOrder = 16;
        mesh.frustumCulled = false;
        root.add(mesh);
        edgeParticles.push({
          travelY: 0,
          orbitAngle,
          baseOrbitRadius: edgeOrbitRadius,
          orbitRadius: edgeOrbitRadius,
          speedUnitsPerSecond: edgeParticleSpeed,
          baseLength: edgeParticleLength,
          length: edgeParticleLength,
          baseThickness: edgeParticleThickness,
          isActive: false,
          focusOffset01: Math.random() * 2 - 1,
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleSpeed: THREE.MathUtils.lerp(2.2, 5.6, Math.random()),
          material,
          mesh
        });
      }
    }

    hitscanBeamPulsesRoot.add(root);
    const activeBeam: ActiveHeavySustainedBeam = {
      root,
      outerMaterial,
      innerMaterial,
      outerBeam,
      innerBeam,
      edgeParticles,
      edgeParticleEmissionIntervalSeconds,
      edgeParticleEmissionCooldownSeconds: 0,
      muzzleFxCooldownSeconds: 0,
      hitFxCooldownSeconds: 0
    };
    activeHeavySustainedBeams[gunIndex] = activeBeam;
    return activeBeam;
  };

  const ensureHeavyChargeTelegraph = (gunIndex: number): ActiveChargeTelegraphMesh => {
    const existingTelegraph = activeHeavyChargeTelegraphs[gunIndex];
    if (existingTelegraph) {
      return existingTelegraph;
    }
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xa8ffb9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const innerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5aff73,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x2ad34c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const root = new THREE.Group();
    root.renderOrder = 16;
    root.visible = false;
    const coreMesh = new THREE.Mesh(heavyLaserChargeSphereGeometry, coreMaterial);
    const innerGlowMesh = new THREE.Mesh(heavyLaserChargeSphereGeometry, innerGlowMaterial);
    const outerGlowMesh = new THREE.Mesh(heavyLaserChargeSphereGeometry, outerGlowMaterial);
    coreMesh.frustumCulled = false;
    innerGlowMesh.frustumCulled = false;
    outerGlowMesh.frustumCulled = false;
    coreMesh.scale.setScalar(0.75);
    innerGlowMesh.scale.setScalar(1.35);
    outerGlowMesh.scale.setScalar(2.05);
    root.add(coreMesh);
    root.add(innerGlowMesh);
    root.add(outerGlowMesh);
    scene.add(root);
    const telegraphMesh: ActiveChargeTelegraphMesh = {
      root,
      materials: [coreMaterial, innerGlowMaterial, outerGlowMaterial]
    };
    activeHeavyChargeTelegraphs[gunIndex] = telegraphMesh;
    return telegraphMesh;
  };

  const updateHeavyChargeTelegraphMesh = (
    gunIndex: number,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    chargeProgress01: number
  ): void => {
    const progress = THREE.MathUtils.clamp(chargeProgress01, 0, 1);
    const telegraph = ensureHeavyChargeTelegraph(gunIndex);
    telegraph.root.visible = true;
    telegraph.root.position.copy(origin).addScaledVector(direction, THREE.MathUtils.lerp(0.1, 0.28, progress));
    telegraph.root.scale.setScalar(THREE.MathUtils.lerp(0.06, 0.18, progress));
    telegraph.materials[0].opacity = THREE.MathUtils.lerp(0.45, 0.84, progress);
    telegraph.materials[1].opacity = THREE.MathUtils.lerp(0.28, 0.62, progress);
    telegraph.materials[2].opacity = THREE.MathUtils.lerp(0.12, 0.34, progress);
  };

  const spawnHeavyBeamSpikyEmission = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    mode: "muzzle" | "hit",
    options: HeavySpikyEmissionSpawnOptions = {}
  ): void => {
    const lifetime = mode === "muzzle" ? 0.14 : 0.18;
    const startScale = mode === "muzzle" ? 0.11 : 0.14;
    const endScale = mode === "muzzle" ? 0.62 : 0.74;
    const reverseDirection = options.reverseDirection ?? true;
    const material = new THREE.ShaderMaterial({
      vertexShader: HEAVY_BEAM_SPIKY_EMISSION_VERTEX_SHADER,
      fragmentShader: HEAVY_BEAM_SPIKY_EMISSION_FRAGMENT_SHADER,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetime },
        uSpinSpeed: { value: mode === "muzzle" ? 14 : 10 },
        uSpikeFrequency: { value: mode === "muzzle" ? 18 : 14 },
        uSpikeStrength: { value: mode === "muzzle" ? 0.46 : 0.38 },
        uConeStretch: { value: mode === "muzzle" ? 2.4 : 2.1 },
        uSeed: { value: Math.random() },
        uCoreColor: {
          value: new THREE.Vector3(
            mode === "muzzle" ? 0.92 : 0.84,
            1.0,
            mode === "muzzle" ? 0.9 : 0.82
          )
        },
        uGlowColor: { value: new THREE.Vector3(0.24, 0.95, 0.34) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(heavyBeamSpikyEmissionGeometry, material);
    mesh.renderOrder = 17;
    mesh.frustumCulled = false;
    if (options.parent) {
      mesh.position.copy(options.localPosition ?? new THREE.Vector3());
      const localDirection = reverseDirection
        ? new THREE.Vector3(0, -1, 0)
        : new THREE.Vector3(0, 1, 0);
      mesh.quaternion.setFromUnitVectors(unitCylinderAxis, localDirection);
      options.parent.add(mesh);
    } else {
      const emissionDirection = reverseDirection
        ? direction.clone().multiplyScalar(-1)
        : direction.clone();
      if (emissionDirection.lengthSq() <= 0.000001) {
        emissionDirection.copy(unitCylinderAxis);
      } else {
        emissionDirection.normalize();
      }
      mesh.position
        .copy(origin)
        .addScaledVector(direction, mode === "muzzle" ? 0.12 : 0.04);
      mesh.quaternion.setFromUnitVectors(unitCylinderAxis, emissionDirection);
      scene.add(mesh);
    }
    mesh.scale.setScalar(startScale);
    activeHeavySpikyEmissions.push({
      age: 0,
      lifetime,
      startScale,
      endScale,
      mesh,
      material
    });
  };

  const updateHeavyBeamSpikyEmissions = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }
    for (let i = activeHeavySpikyEmissions.length - 1; i >= 0; i -= 1) {
      const emission = activeHeavySpikyEmissions[i];
      emission.age += deltaTime;
      emission.material.uniforms.uAge.value = emission.age;
      const t = THREE.MathUtils.clamp(emission.age / Math.max(0.0001, emission.lifetime), 0, 1);
      const scale = THREE.MathUtils.lerp(emission.startScale, emission.endScale, t);
      emission.mesh.scale.setScalar(scale);
      emission.mesh.rotateY(deltaTime * 5.2);
      if (emission.age < emission.lifetime) {
        continue;
      }
      emission.mesh.removeFromParent();
      emission.material.dispose();
      activeHeavySpikyEmissions.splice(i, 1);
    }
  };

  const removeProjectileAtIndex = (index: number): void => {
    const projectile = projectiles[index];
    if (!projectile) {
      return;
    }
    projectilesRoot.remove(projectile.object);
    projectile.dispose?.();
    projectiles.splice(index, 1);
  };

  const mergeTouchingPlayerProjectiles = (): void => {
    for (let i = 0; i < projectiles.length; i += 1) {
      const receiver = projectiles[i];
      const receiverGroupId = receiver.selfMergeGroupId;
      if (
        !receiverGroupId ||
        !receiver.getSelfMergeWorldCenter ||
        !receiver.getSelfMergeRadius ||
        !receiver.absorbSelfMergePayload
      ) {
        continue;
      }

      let receiverRadius = Math.max(0, receiver.getSelfMergeRadius());
      if (receiverRadius <= 0) {
        continue;
      }
      receiver.getSelfMergeWorldCenter(projectileMergeCenterA);

      for (let j = projectiles.length - 1; j > i; j -= 1) {
        const other = projectiles[j];
        if (
          other.selfMergeGroupId !== receiverGroupId ||
          !other.getSelfMergeWorldCenter ||
          !other.getSelfMergeRadius ||
          !other.getSelfMergePayload
        ) {
          continue;
        }

        const otherRadius = Math.max(0, other.getSelfMergeRadius());
        if (otherRadius <= 0) {
          continue;
        }
        other.getSelfMergeWorldCenter(projectileMergeCenterB);
        const combinedRadius = receiverRadius + otherRadius;
        if (
          projectileMergeCenterA.distanceToSquared(projectileMergeCenterB) >
          combinedRadius * combinedRadius
        ) {
          continue;
        }

        const payload = other.getSelfMergePayload();
        if (!payload) {
          continue;
        }
        const merged = receiver.absorbSelfMergePayload(payload);
        if (!merged) {
          continue;
        }

        other.beginDestroy?.("collision");
        removeProjectileAtIndex(j);
        receiver.getSelfMergeWorldCenter(projectileMergeCenterA);
        receiverRadius = Math.max(0, receiver.getSelfMergeRadius());
      }
    }
  };

  let primaryFireHeld = false;
  let lastPrimaryFireInputActive = false;
  let enabled = true;
  let hasLastYaw = false;
  let hasLastPlayerPosition = false;
  let lastYaw = 0;
  let turnDirection = 0;

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button === defaultPrimaryFireMouseButton) {
      primaryFireHeld = true;
      event.preventDefault();
      return;
    }
  };

  const onMouseUp = (event: MouseEvent): void => {
    if (event.button === defaultPrimaryFireMouseButton) {
      primaryFireHeld = false;
      event.preventDefault();
      return;
    }
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  if (!disableDefaultPrimaryFireInput) {
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContextMenu);
  }

  const forEachDamageTargetHurtbox = (visitor: (hurtbox: HurtboxComponent) => void): void => {
    for (const hurtbox of targetHurtboxes) {
      visitor(hurtbox);
    }
    for (const hurtbox of interceptTargetHurtboxes) {
      visitor(hurtbox);
    }
  };

  const findReticleHomingTargetHurtbox = (
    reticleWorldPosition: THREE.Vector3
  ): HurtboxComponent | null => {
    let bestTarget: HurtboxComponent | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(hurtboxCenter);
      hurtboxCenter.y = reticleWorldPosition.y;
      const targetRadius = Math.max(0, hurtbox.collisionArea.radius + reticleHomingTargetPadding);
      if (targetRadius <= 0) {
        continue;
      }

      const distanceSq = reticleWorldPosition.distanceToSquared(hurtboxCenter);
      if (distanceSq > targetRadius * targetRadius || distanceSq >= bestDistanceSq) {
        continue;
      }

      bestDistanceSq = distanceSq;
      bestTarget = hurtbox;
    }

    return bestTarget;
  };

  const applyHitscanExplosionDamage = (
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition,
    explosionCenter: THREE.Vector3
  ): boolean => {
    const blastRadius = Math.max(0, hitscanPulse.explosionRadius);
    const damageAmount = Math.max(0, hitscanPulse.explosionDamageAmount);
    if (blastRadius <= 0 || damageAmount <= 0) {
      return false;
    }

    let appliedAnyDamage = false;
    forEachDamageTargetHurtbox((hurtbox) => {
      if (!hurtbox.canReceiveDamage()) {
        return;
      }
      if (
        hurtbox.faction &&
        hitscanPulse.sourceFaction &&
        hurtbox.faction === hitscanPulse.sourceFaction
      ) {
        return;
      }
      const targetRadius = Math.max(0, hurtbox.collisionArea.radius);
      hurtbox.getWorldCenter(hurtboxCenter);
      const combinedRadius = blastRadius + targetRadius;
      if (explosionCenter.distanceToSquared(hurtboxCenter) > combinedRadius * combinedRadius) {
        return;
      }

      const hitResult = hurtbox.receiveDamage({
        amount: damageAmount,
        damageType: hitscanPulse.damageType,
        segments:
          hitscanPulse.additionalDamageSegments.length > 0
            ? hitscanPulse.additionalDamageSegments
            : undefined,
        sourceFaction: hitscanPulse.sourceFaction
      });
      if (hitResult) {
        appliedAnyDamage = true;
      }
    });

    return appliedAnyDamage;
  };

  const applyProjectileExplosionDamage = (
    projectile: ProjectileInstance,
    explosionCenter: THREE.Vector3,
    excludeHurtboxId?: string
  ): boolean => {
    const blastRadius = Math.max(0, projectile.explosionRadius ?? 0);
    const damageAmount = Math.max(0, projectile.explosionDamageAmount ?? 0);
    const hitbox = projectile.hitbox;
    if (!hitbox || blastRadius <= 0 || damageAmount <= 0) {
      return false;
    }

    let appliedAnyDamage = false;
    forEachDamageTargetHurtbox((hurtbox) => {
      if (excludeHurtboxId && hurtbox.id === excludeHurtboxId) {
        return;
      }
      if (!hurtbox.canReceiveDamage()) {
        return;
      }
      if (hurtbox.faction && hitbox.sourceFaction && hurtbox.faction === hitbox.sourceFaction) {
        return;
      }

      const targetRadius = Math.max(0, hurtbox.collisionArea.radius);
      hurtbox.getWorldCenter(hurtboxCenter);
      const combinedRadius = blastRadius + targetRadius;
      if (explosionCenter.distanceToSquared(hurtboxCenter) > combinedRadius * combinedRadius) {
        return;
      }

      const hitResult = hurtbox.receiveDamage({
        amount: damageAmount,
        damageType: hitbox.damageType,
        sourceFaction: hitbox.sourceFaction
      });
      if (hitResult) {
        appliedAnyDamage = true;
      }
    });

    return appliedAnyDamage;
  };

  const resolveHitscanContact = (
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    outContactPoint: THREE.Vector3
  ): { hurtbox: HurtboxComponent | null; beamDistance: number } => {
    let nearestHurtbox: HurtboxComponent | null = null;
    let nearestHitDistance = Math.max(0.01, hitscanPulse.maxDistance);

    forEachDamageTargetHurtbox((hurtbox) => {
      if (!hurtbox.canReceiveDamage()) {
        return;
      }
      if (
        hurtbox.faction &&
        hitscanPulse.sourceFaction &&
        hurtbox.faction === hitscanPulse.sourceFaction
      ) {
        return;
      }
      const radius = Math.max(0, hurtbox.collisionArea.radius);
      if (radius <= 0) {
        return;
      }

      hurtbox.getWorldCenter(hurtboxCenter);
      rayToCenter.subVectors(hurtboxCenter, origin);
      const projectionDistance = rayToCenter.dot(direction);
      if (projectionDistance < -radius) {
        return;
      }

      const radiusSq = radius * radius;
      const perpendicularDistanceSq = rayToCenter.lengthSq() - projectionDistance * projectionDistance;
      if (perpendicularDistanceSq > radiusSq) {
        return;
      }

      const halfChord = Math.sqrt(Math.max(0, radiusSq - perpendicularDistanceSq));
      let hitDistance = projectionDistance - halfChord;
      if (hitDistance < 0) {
        hitDistance = projectionDistance + halfChord;
      }
      if (hitDistance < 0 || hitDistance > nearestHitDistance) {
        return;
      }

      nearestHitDistance = hitDistance;
      nearestHurtbox = hurtbox;
    });

    const beamDistance = Math.max(0.05, nearestHitDistance);
    outContactPoint.copy(origin).addScaledVector(direction, beamDistance);
    return {
      hurtbox: nearestHurtbox,
      beamDistance
    };
  };

  const resolveVisibleBeamSection = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    beamDistance: number
  ): { centerRatio: number; spanRatio: number } => {
    if (!viewCamera || beamDistance <= 0.0001) {
      return { centerRatio: 0.5, spanRatio: 1 };
    }
    const sampleCount = 24;
    let minVisibleT = Number.POSITIVE_INFINITY;
    let maxVisibleT = Number.NEGATIVE_INFINITY;
    let bestApproximateT = 0.5;
    let bestApproximateScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= sampleCount; i += 1) {
      const t = i / sampleCount;
      beamSampleWorld.copy(origin).addScaledVector(direction, beamDistance * t);
      beamSampleNdc.copy(beamSampleWorld).project(viewCamera);
      const inDepth = beamSampleNdc.z >= -1 && beamSampleNdc.z <= 1;
      const inScreenBounds = Math.abs(beamSampleNdc.x) <= 1.02 && Math.abs(beamSampleNdc.y) <= 1.02;
      if (inDepth && inScreenBounds) {
        minVisibleT = Math.min(minVisibleT, t);
        maxVisibleT = Math.max(maxVisibleT, t);
      } else {
        const distanceOutsideX = Math.max(0, Math.abs(beamSampleNdc.x) - 1);
        const distanceOutsideY = Math.max(0, Math.abs(beamSampleNdc.y) - 1);
        const distanceOutsideZ = inDepth
          ? 0
          : Math.min(Math.abs(beamSampleNdc.z - 1), Math.abs(beamSampleNdc.z + 1));
        const score =
          distanceOutsideX * distanceOutsideX +
          distanceOutsideY * distanceOutsideY +
          distanceOutsideZ * distanceOutsideZ;
        if (score < bestApproximateScore) {
          bestApproximateScore = score;
          bestApproximateT = t;
        }
      }
    }
    if (!Number.isFinite(minVisibleT) || !Number.isFinite(maxVisibleT)) {
      return { centerRatio: bestApproximateT, spanRatio: 0.16 };
    }
    const spanRatio = Math.max(0.04, Math.min(1, maxVisibleT - minVisibleT));
    return {
      centerRatio: (minVisibleT + maxVisibleT) * 0.5,
      spanRatio
    };
  };

  type HitscanPulseSpawnOptions = {
    suppressMuzzleFx?: boolean;
    suppressHitFx?: boolean;
    suppressBeamVisual?: boolean;
  };

  const spawnHitscanPulse = (
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    options: HitscanPulseSpawnOptions = {}
  ): void => {
    const isElectromagneticRailgun = hitscanPulse.effectStyle === "electromagnetic_railgun";
    const isExplosiveShellFire = hitscanPulse.effectStyle === "explosive_shell_fire";
    const isHeavyLaserbeamPulse = hitscanPulse.effectStyle === "heavy_laserbeam_pulse";
    const suppressMuzzleFx = options.suppressMuzzleFx ?? false;
    const suppressHitFx = options.suppressHitFx ?? false;
    const suppressBeamVisual = options.suppressBeamVisual ?? false;

    if (!suppressMuzzleFx && isElectromagneticRailgun) {
      railgunBlueSparkBursts.spawnExplosion(origin, direction);
      ionMuzzleBursts.spawnBurst(origin, direction, 0.6);
    } else if (!suppressMuzzleFx && isHeavyLaserbeamPulse) {
      spawnHeavyBeamSpikyEmission(origin, direction, "muzzle");
    } else if (!suppressMuzzleFx && isExplosiveShellFire) {
      explosiveShellMuzzleOrangeSparks.spawnExplosion(origin, direction);
    } else if (!suppressMuzzleFx) {
      sparkBursts.spawnBurst(origin, direction);
    }
    const contact = resolveHitscanContact(hitscanPulse, origin, direction, beamEndPoint);
    const nearestHurtbox = contact.hurtbox;
    const beamDistance = contact.beamDistance;

    if (nearestHurtbox) {
      beamHitPoint.copy(beamEndPoint);
      const hitResult = isExplosiveShellFire
        ? applyHitscanExplosionDamage(hitscanPulse, beamHitPoint)
        : nearestHurtbox.receiveDamage({
            amount: hitscanPulse.damageAmount,
            damageType: hitscanPulse.damageType,
            segments:
              hitscanPulse.additionalDamageSegments.length > 0
                ? hitscanPulse.additionalDamageSegments
                : undefined,
            sourceFaction: hitscanPulse.sourceFaction
          });
      if (!suppressHitFx && hitResult) {
        if (isElectromagneticRailgun) {
          const impactOffsetDistance = Math.min(0.3, Math.max(0.08, beamDistance * 0.012));
          beamEndPoint.copy(beamHitPoint).addScaledVector(direction, impactOffsetDistance);
          beamMidpoint.copy(beamHitPoint).addScaledVector(direction, -impactOffsetDistance);
          railgunImpactBlueSparkBursts.spawnExplosion(beamEndPoint, direction);
          railgunImpactBlueSparkBursts.spawnExplosion(beamMidpoint, direction.clone().multiplyScalar(-1));
          ionHitBursts.spawnBurst(beamHitPoint, direction, 0.95);
        } else if (isExplosiveShellFire) {
          explosiveShellHitExplosionSparks.spawnExplosion(beamHitPoint, direction);
          explosiveShellHitExplosionSparks.spawnExplosion(
            beamHitPoint,
            direction.clone().multiplyScalar(-1)
          );
          explosiveShellMissileExplosionBursts.spawnBurst(
            beamHitPoint,
            Math.max(0, hitscanPulse.explosionRadius) * 1.5
          );
          concussiveBlastRings.spawnRing(beamHitPoint, hitscanPulse.explosionRadius);
        } else if (isHeavyLaserbeamPulse) {
          heavyBeamHitSparks.spawnExplosion(beamHitPoint, direction);
        } else {
          hitSparkExplosions.spawnExplosion(beamHitPoint, direction);
        }
      }
    }

    if (isElectromagneticRailgun) {
      const beamParticleCount = THREE.MathUtils.clamp(Math.floor(beamDistance / 18), 3, 8);
      for (let i = 0; i < beamParticleCount; i += 1) {
        const t = (i + 1) / (beamParticleCount + 1);
        beamMidpoint.copy(origin).lerp(beamEndPoint, t);
        const beamJitterScale = 0.02;
        beamMidpoint.x += (Math.random() - 0.5) * beamJitterScale;
        beamMidpoint.y += (Math.random() - 0.5) * beamJitterScale;
        beamMidpoint.z += (Math.random() - 0.5) * beamJitterScale;
        ionHitBursts.spawnBurst(beamMidpoint, direction, 0.35);
      }
    } else if (isExplosiveShellFire) {
      const smokeBurstCount = THREE.MathUtils.clamp(Math.floor(beamDistance / 26), 2, 6);
      for (let i = 0; i < smokeBurstCount; i += 1) {
        const t = (i + 1) / (smokeBurstCount + 1);
        beamMidpoint.copy(origin).lerp(beamEndPoint, t);
        beamMidpoint.x += (Math.random() - 0.5) * 0.03;
        beamMidpoint.y += (Math.random() - 0.5) * 0.02;
        beamMidpoint.z += (Math.random() - 0.5) * 0.03;
        explosiveShellBeamSmokeBursts.spawnBurst(beamMidpoint, direction);
      }
    }
    if (suppressBeamVisual) {
      return;
    }

    const beamRoot = new THREE.Group();
    beamOrientation.setFromUnitVectors(unitCylinderAxis, direction);
    beamMidpoint.copy(origin).addScaledVector(direction, beamDistance * 0.5);
    beamRoot.position.copy(beamMidpoint);
    beamRoot.quaternion.copy(beamOrientation);
    const railgunOutlineColor = 0x4fb6ff;
    const outerOpacity = isElectromagneticRailgun
      ? 0.44
      : isHeavyLaserbeamPulse
        ? 0.46
        : HITSCAN_BEAM_OUTER_OPACITY;
    const innerOpacity = isElectromagneticRailgun
      ? 0.96
      : isHeavyLaserbeamPulse
        ? 0.98
        : HITSCAN_BEAM_INNER_OPACITY;

    const outerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamColor,
      transparent: true,
      opacity: outerOpacity,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamCoreColor,
      transparent: true,
      opacity: innerOpacity,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const outlineMaterial = isElectromagneticRailgun
      ? new THREE.MeshBasicMaterial({
          color: railgunOutlineColor,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending
        })
      : null;
    const outlineBaseOpacity = outlineMaterial?.opacity ?? 0;
    const railSlugCoreMaterial = isElectromagneticRailgun
      ? new THREE.MeshBasicMaterial({
          color: 0x070a12,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.NormalBlending
        })
      : null;
    const railSlugShellMaterial = isElectromagneticRailgun
      ? new THREE.MeshBasicMaterial({
          color: 0x6bc2ff,
          transparent: true,
          opacity: 0.46,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide
        })
      : null;
    const railSlugRadius = Math.max(hitscanPulse.beamThickness * 0.58, 0.018);
    const railSlugLength = Math.max(hitscanPulse.beamThickness * 3.6, 0.1);
    const railSlugCoreMesh =
      railSlugCoreMaterial ? new THREE.Mesh(railSlugGeometry, railSlugCoreMaterial) : null;
    const railSlugShellMesh =
      railSlugShellMaterial ? new THREE.Mesh(railSlugGeometry, railSlugShellMaterial) : null;
    const railSlugTravelDuration = isElectromagneticRailgun
      ? Math.max(0.02, Math.min(0.08, hitscanPulse.pulseDurationSeconds * 0.4))
      : 0;
    if (railSlugCoreMesh) {
      railSlugCoreMesh.scale.set(railSlugRadius, railSlugLength, railSlugRadius);
      railSlugCoreMesh.position.y = -beamDistance * 0.5;
      railSlugCoreMesh.renderOrder = 14;
      railSlugCoreMesh.frustumCulled = false;
      beamRoot.add(railSlugCoreMesh);
    }
    if (railSlugShellMesh) {
      railSlugShellMesh.scale.set(
        railSlugRadius * 1.55,
        railSlugLength * 1.06,
        railSlugRadius * 1.55
      );
      railSlugShellMesh.position.y = -beamDistance * 0.5;
      railSlugShellMesh.renderOrder = 15;
      railSlugShellMesh.frustumCulled = false;
      beamRoot.add(railSlugShellMesh);
    }

    const outlineBeam =
      outlineMaterial ? new THREE.Mesh(hitscanBeamOuterGeometry, outlineMaterial) : null;
    const outerBeam = new THREE.Mesh(hitscanBeamOuterGeometry, outerMaterial);
    const innerBeam = new THREE.Mesh(hitscanBeamInnerGeometry, innerMaterial);
    if (outlineBeam) {
      outlineBeam.scale.set(
        hitscanPulse.beamThickness * 1.55,
        beamDistance,
        hitscanPulse.beamThickness * 1.55
      );
    }
    outerBeam.scale.set(
      hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER,
      beamDistance,
      hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER
    );
    innerBeam.scale.set(
      hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER,
      beamDistance,
      hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER
    );
    if (outlineBeam) {
      outlineBeam.renderOrder = 11;
      outlineBeam.frustumCulled = false;
      beamRoot.add(outlineBeam);
    }
    outerBeam.renderOrder = 12;
    innerBeam.renderOrder = 13;
    outerBeam.frustumCulled = false;
    innerBeam.frustumCulled = false;
    beamRoot.add(outerBeam);
    beamRoot.add(innerBeam);
    const edgeParticles: ActiveHitscanEdgeParticle[] = [];
    const edgeParticleCount = Math.max(0, Math.floor(hitscanPulse.edgeParticleCount));
    if (edgeParticleCount > 0) {
      const edgeParticleLength = Math.max(0.04, hitscanPulse.edgeParticleLength);
      const edgeParticleThickness = Math.max(0.004, hitscanPulse.edgeParticleThickness);
      const edgeParticleSpeed = Math.max(0.1, hitscanPulse.edgeParticleSpeedUnitsPerSecond);
      const edgeOrbitRadius = Math.max(
        hitscanPulse.beamThickness * Math.max(1, hitscanPulse.edgeParticleOrbitRadiusMultiplier),
        hitscanPulse.beamThickness * 0.66
      );
      const edgeLowerBound = -beamDistance * 0.5 - edgeParticleLength * 0.5;
      const edgeUpperBound = beamDistance * 0.5 + edgeParticleLength * 0.5;
      for (let i = 0; i < edgeParticleCount; i += 1) {
        const orbitAngle =
          (i / Math.max(1, edgeParticleCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
        const travelY = THREE.MathUtils.lerp(edgeLowerBound, edgeUpperBound, Math.random());
        const material = new THREE.MeshBasicMaterial({
          color: hitscanPulse.beamCoreColor,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          toneMapped: false,
          blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Mesh(hitscanBeamEdgeParticleGeometry, material);
        mesh.scale.set(edgeParticleThickness, edgeParticleLength, edgeParticleThickness);
        mesh.position.set(
          Math.cos(orbitAngle) * edgeOrbitRadius,
          travelY,
          Math.sin(orbitAngle) * edgeOrbitRadius
        );
        mesh.renderOrder = 16;
        mesh.frustumCulled = false;
        beamRoot.add(mesh);
        edgeParticles.push({
          travelY,
          orbitAngle,
          baseOrbitRadius: edgeOrbitRadius,
          orbitRadius: edgeOrbitRadius,
          speedUnitsPerSecond: edgeParticleSpeed,
          baseLength: edgeParticleLength,
          length: edgeParticleLength,
          baseThickness: edgeParticleThickness,
          isActive: true,
          focusOffset01: Math.random() * 2 - 1,
          wobblePhase: Math.random() * Math.PI * 2,
          wobbleSpeed: THREE.MathUtils.lerp(2.2, 5.6, Math.random()),
          material,
          mesh
        });
      }
    }
    hitscanBeamPulsesRoot.add(beamRoot);

    activeHitscanBeamPulses.push({
      age: 0,
      duration: hitscanPulse.pulseDurationSeconds,
      root: beamRoot,
      outlineMaterial,
      outlineBaseOpacity,
      outerMaterial,
      outerBaseOpacity: outerOpacity,
      innerMaterial,
      innerBaseOpacity: innerOpacity,
      railSlugCoreMaterial,
      railSlugShellMaterial,
      railSlugCoreMesh,
      railSlugShellMesh,
      railSlugBeamDistance: beamDistance,
      railSlugTravelDuration,
      edgeParticles
    });
  };

  const resolvePrimaryFireMuzzleAndAim = (
    gun: NormalizedGunDefinition,
    playerState: PlayerControllerState
  ): void => {
    fallbackForward.copy(playerState.forward).normalize();
    gun.hardpoint.getWorldPosition(muzzleWorld);
    const isHeavyLaserbeamPulse = gun.primary.hitscanPulse?.effectStyle === "heavy_laserbeam_pulse";
    aimTargetWorld.copy(aimReticle.position);
    if (hardpointAimOffsetScale !== 0) {
      hardpointLocalOffset.copy(muzzleWorld);
      playerRoot.worldToLocal(hardpointLocalOffset);
      hardpointLocalOffset.y = 0;
      if (hardpointLocalOffset.lengthSq() > 0.000001) {
        hardpointWorldOffset.copy(hardpointLocalOffset).applyQuaternion(playerRoot.quaternion);
        hardpointWorldOffset.y = 0;
        aimTargetWorld.addScaledVector(hardpointWorldOffset, hardpointAimOffsetScale);
      }
    }

    shipToAim.subVectors(aimTargetWorld, playerRoot.position);
    const useForwardOnly = shipToAim.lengthSq() < minAimDistanceFromShip * minAimDistanceFromShip;

    if (useForwardOnly) {
      aimDirection.copy(fallbackForward);
    } else {
      aimDirection.subVectors(aimTargetWorld, muzzleWorld);
      if (aimDirection.lengthSq() < 0.000001) {
        aimDirection.copy(fallbackForward);
      } else {
        aimDirection.setY(0);
        aimDirection.normalize();
        const dot = THREE.MathUtils.clamp(aimDirection.dot(fallbackForward), -1, 1);
        const signedAngle = Math.atan2(
          crossForwardAim.copy(fallbackForward).cross(aimDirection).dot(up),
          dot
        );
        const clampedAngle = isHeavyLaserbeamPulse
          ? THREE.MathUtils.clamp(
              signedAngle,
              -HEAVY_BEAM_MAX_AIM_OFFSET_RADIANS,
              HEAVY_BEAM_MAX_AIM_OFFSET_RADIANS
            )
          : (() => {
              const minAllowedAngle = turnDirection < 0 ? -maxAimClampRadians : 0;
              const maxAllowedAngle = turnDirection > 0 ? maxAimClampRadians : 0;
              return turnDirection === 0
                ? THREE.MathUtils.clamp(signedAngle, -maxAimClampRadians, maxAimClampRadians)
                : THREE.MathUtils.clamp(signedAngle, minAllowedAngle, maxAllowedAngle);
            })();

        if (clampedAngle !== signedAngle) {
          clampedForward.copy(fallbackForward).applyAxisAngle(up, clampedAngle).normalize();
          aimDirection.copy(clampedForward);
        }
      }
    }
  };

  const firePrimaryShot = (
    gun: NormalizedGunDefinition,
    playerState: PlayerControllerState,
    patternStepIndex = 0
  ): void => {
    resolvePrimaryFireMuzzleAndAim(gun, playerState);

    if (gun.primary.hitscanPulse) {
      const isHeavyLaserbeamPulse =
        gun.primary.hitscanPulse.effectStyle === "heavy_laserbeam_pulse";
      spawnHitscanPulse(gun.primary.hitscanPulse, muzzleWorld, aimDirection, {
        suppressMuzzleFx: isHeavyLaserbeamPulse,
        suppressHitFx: isHeavyLaserbeamPulse,
        suppressBeamVisual: isHeavyLaserbeamPulse
      });
      return;
    }

    const projectileFactory = gun.primary.projectileFactory;
    if (!projectileFactory) {
      return;
    }

    const projectile = projectileFactory.spawn({
      direction: aimDirection,
      origin: muzzleWorld,
      patternStepIndex,
      homingTargetHurtbox: findReticleHomingTargetHurtbox(aimReticle.position)
    });

    if (projectile.object.parent) {
      projectile.object.parent.remove(projectile.object);
    }

    projectilesRoot.add(projectile.object);
    projectiles.push(projectile);
    const damageType = projectile.hitbox?.damageType;
    const effectScale = Math.max(0.1, projectile.effectScale ?? 1);
    if (projectile.muzzleEffectId === "voidseeker_shadow_burst") {
      voidSeekerMuzzleShadowBursts.spawnBurst(muzzleWorld, aimDirection);
    } else if (projectile.muzzleEffectId === "acid_splash") {
      acidMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection, estimatedShipVelocity);
    } else if (projectile.muzzleEffectId === "chaingun_muzzle_sparks_smoke") {
      chaingunMuzzleSparkFlashes.spawnExplosion(muzzleWorld, aimDirection);
      chaingunMuzzleSmokeBursts.spawnBurst(muzzleWorld, aimDirection);
    } else if (projectile.muzzleEffectId === "explosive_shell_muzzle") {
      explosiveShellMuzzleOrangeSparks.spawnExplosion(muzzleWorld, aimDirection);
    }
    if (!projectile.suppressMuzzleFx) {
      if (damageType === "Plasma") {
        plasmaMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection);
      } else if (damageType === "Acid" && projectile.muzzleEffectId !== "acid_splash") {
        acidMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection, estimatedShipVelocity);
      } else if (damageType === "Void") {
        voidMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection);
      } else if (damageType === "Frost" || damageType === "Cryo") {
        frostMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection, estimatedShipVelocity);
      } else if (damageType === "Ion") {
        ionMuzzleBursts.spawnBurst(muzzleWorld, aimDirection, effectScale);
      } else {
        sparkBursts.spawnBurst(muzzleWorld, aimDirection);
      }
    }
  };

  const update = (deltaTime: number, playerState: PlayerControllerState): void => {
    if (deltaTime <= 0) {
      return;
    }

    if (!hasLastPlayerPosition) {
      lastPlayerPosition.copy(playerState.position);
      estimatedShipVelocity.set(0, 0, 0);
      hasLastPlayerPosition = true;
    } else {
      playerPositionDelta.subVectors(playerState.position, lastPlayerPosition);
      estimatedShipVelocity.copy(playerPositionDelta).multiplyScalar(1 / Math.max(0.0001, deltaTime));
      lastPlayerPosition.copy(playerState.position);
    }

    if (hasLastYaw) {
      const yawDelta = shortestAngleDelta(lastYaw, playerState.yaw);
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
    lastYaw = playerState.yaw;
    for (let i = 0; i < heavyBeamVisualHoldSeconds.length; i += 1) {
      heavyBeamVisualHoldSeconds[i] = Math.max(0, (heavyBeamVisualHoldSeconds[i] ?? 0) - deltaTime);
    }
    for (const telegraph of activeHeavyChargeTelegraphs) {
      if (!telegraph) {
        continue;
      }
      telegraph.root.visible = false;
    }

    const gamepadPrimaryFireHeld =
      !disableDefaultPrimaryFireInput &&
      isGamepadFireButtonHeld(defaultPrimaryFireGamepadButtonIndex);
    const defaultPrimaryFireInputActive =
      enabled && !disableDefaultPrimaryFireInput && (primaryFireHeld || gamepadPrimaryFireHeld);
    const perGunFiringDeltaSeconds = normalizedGuns.map(() => deltaTime);
    let anyPrimaryInputActive = false;
    for (let gunIndex = 0; gunIndex < normalizedGuns.length; gunIndex += 1) {
      const gun = normalizedGuns[gunIndex];
      const canFireGun = canPrimaryFireForGun?.(gunIndex) ?? true;
      const perGunInputActive =
        enabled && canFireGun && (resolvePrimaryFireInputForGun?.(gunIndex) ?? defaultPrimaryFireInputActive);
      perGunPrimaryFireInputActive[gunIndex] = perGunInputActive;
      if (perGunInputActive) {
        anyPrimaryInputActive = true;
      }

      const chargeDuration = Math.max(0, gun.primary.chargeDurationSeconds);
      const hasCommittedBurst = primaryBurstContinueUntilWrap[gunIndex] ?? false;
      if (!perGunInputActive && !hasCommittedBurst) {
        primaryChargeElapsedSeconds[gunIndex] = 0;
        heavyBeamVisualHoldSeconds[gunIndex] = 0;
        continue;
      }
      if (!perGunInputActive || chargeDuration <= 0) {
        primaryChargeElapsedSeconds[gunIndex] = 0;
        if (!perGunInputActive) {
          heavyBeamVisualHoldSeconds[gunIndex] = 0;
        }
        continue;
      }

      const previousCharge = Math.max(0, primaryChargeElapsedSeconds[gunIndex] ?? 0);
      if (previousCharge >= chargeDuration) {
        primaryChargeElapsedSeconds[gunIndex] = chargeDuration;
        continue;
      }

      const nextCharge = previousCharge + deltaTime;
      if (gun.primary.hitscanPulse?.effectStyle === "heavy_laserbeam_pulse") {
        resolvePrimaryFireMuzzleAndAim(gun, playerState);
        const chargeProgress = THREE.MathUtils.clamp(nextCharge / Math.max(0.0001, chargeDuration), 0, 1);
        updateHeavyChargeTelegraphMesh(gunIndex, muzzleWorld, aimDirection, chargeProgress);
      }

      if (nextCharge < chargeDuration) {
        primaryChargeElapsedSeconds[gunIndex] = nextCharge;
        perGunFiringDeltaSeconds[gunIndex] = 0;
        continue;
      }

      primaryChargeElapsedSeconds[gunIndex] = chargeDuration;
      perGunFiringDeltaSeconds[gunIndex] = nextCharge - chargeDuration;
    }
    lastPrimaryFireInputActive = anyPrimaryInputActive;

    for (let i = 0; i < primaryReloadGroupRemainingSeconds.length; i += 1) {
      primaryReloadGroupRemainingSeconds[i] = Math.max(
        0,
        (primaryReloadGroupRemainingSeconds[i] ?? 0) - deltaTime
      );
    }

    const hasCommittedPrimaryBurstFire = primaryBurstContinueUntilWrap.some(Boolean);
    if (lastPrimaryFireInputActive || hasCommittedPrimaryBurstFire) {
      for (let i = 0; i < normalizedGuns.length; i += 1) {
        const gun = normalizedGuns[i];
        const chargeDuration = Math.max(0, gun.primary.chargeDurationSeconds);
        const chargeReady =
          chargeDuration <= 0 || (primaryChargeElapsedSeconds[i] ?? 0) >= chargeDuration;
        const gunFireRequested =
          ((perGunPrimaryFireInputActive[i] ?? false) && chargeReady) ||
          (primaryBurstContinueUntilWrap[i] ?? false);
        if (!gunFireRequested) {
          continue;
        }
        const fireDeltaSeconds = Math.max(0, perGunFiringDeltaSeconds[i] ?? deltaTime);
        if (fireDeltaSeconds <= 0) {
          continue;
        }
        const reloadGroupId = primaryReloadGroupIds[i] ?? -1;
        if (
          reloadGroupId >= 0 &&
          (primaryReloadGroupRemainingSeconds[reloadGroupId] ?? 0) > 0
        ) {
          continue;
        }
        primaryCooldowns[i] -= fireDeltaSeconds;
        while (primaryCooldowns[i] <= 0) {
          const patternStepIndex = primaryCooldownStepIndices[i] ?? 0;
          const sequence = gun.primary.fireIntervalSequenceSeconds;
          const sequenceLength = Math.max(1, sequence.length);
          const currentStepIndex = patternStepIndex % sequenceLength;
          const burstPhasePattern = gun.primary.burstPhaseGroupPattern;
          const burstPhaseGroupId = gun.primary.burstPhaseGroupId;
          const burstPhasePatternIndex = primaryBurstPhasePatternIndices[i] ?? 0;
          const activeBurstPhaseGroupId =
            burstPhasePattern.length > 0
              ? burstPhasePattern[burstPhasePatternIndex % burstPhasePattern.length] ?? null
              : null;
          const allowBurstPhaseFire =
            burstPhasePattern.length <= 0 ||
            burstPhaseGroupId === null ||
            activeBurstPhaseGroupId === null ||
            burstPhaseGroupId === activeBurstPhaseGroupId;
          const isHeavyLaserbeamPulse =
            gun.primary.hitscanPulse?.effectStyle === "heavy_laserbeam_pulse";

          if (allowBurstPhaseFire) {
            const consumedCost = consumePrimaryFireCost?.({
              heatCost: gun.primary.heatCost,
              energyCost: gun.primary.energyCost
            }) ?? true;

            if (consumedCost) {
              firePrimaryShot(gun, playerState, patternStepIndex);
              if (isHeavyLaserbeamPulse) {
                heavyBeamVisualHoldSeconds[i] = Math.max(
                  heavyBeamVisualHoldSeconds[i] ?? 0,
                  Math.max(0.02, gun.primary.fireIntervalSeconds + 0.08)
                );
              }
              if (
                gun.primary.completeBurstOnRelease &&
                sequence.length > 1 &&
                currentStepIndex === 0
              ) {
                primaryBurstContinueUntilWrap[i] = true;
              }
              const reloadAfterShots = gun.primary.reloadAfterShots;
              if (reloadAfterShots !== null && reloadAfterShots > 0) {
                const activeReloadGroupId = primaryReloadGroupIds[i] ?? -1;
                const useSharedReloadGroup = activeReloadGroupId >= 0;
                const shotsFired = useSharedReloadGroup
                  ? (primaryReloadGroupShotsFired[activeReloadGroupId] ?? 0) + 1
                  : 1;
                if (useSharedReloadGroup) {
                  primaryReloadGroupShotsFired[activeReloadGroupId] = shotsFired;
                }
                if (shotsFired >= reloadAfterShots) {
                  const reloadDurationSeconds = Math.max(0, gun.primary.reloadDurationSeconds ?? 0);
                  if (useSharedReloadGroup) {
                    primaryReloadGroupShotsFired[activeReloadGroupId] = 0;
                    primaryReloadGroupRemainingSeconds[activeReloadGroupId] = reloadDurationSeconds;
                    for (let gunIndex = 0; gunIndex < normalizedGuns.length; gunIndex += 1) {
                      if ((primaryReloadGroupIds[gunIndex] ?? -1) !== activeReloadGroupId) {
                        continue;
                      }
                      primaryCooldowns[gunIndex] = 0;
                    }
                  } else {
                    primaryCooldowns[i] = 0;
                  }
                }
              }
            } else if (isHeavyLaserbeamPulse) {
              heavyBeamVisualHoldSeconds[i] = 0;
            }
          }

          const currentStepInterval = Math.max(
            0.001,
            sequence[currentStepIndex] ?? gun.primary.fireIntervalSeconds
          );
          const nextPatternStepIndex = sequence.length > 0 ? (patternStepIndex + 1) % sequence.length : 0;
          primaryCooldownStepIndices[i] = nextPatternStepIndex;
          if (
            gun.primary.completeBurstOnRelease &&
            sequence.length > 0 &&
            nextPatternStepIndex === 0
          ) {
            primaryBurstContinueUntilWrap[i] = false;
          }
          if (burstPhasePattern.length > 0 && sequence.length > 0 && nextPatternStepIndex === 0) {
            primaryBurstPhasePatternIndices[i] =
              (burstPhasePatternIndex + 1) % Math.max(1, burstPhasePattern.length);
          }
          const applyIntervalMultiplier =
            gun.primary.fireIntervalMultiplierScope !== "burst_gap_only" ||
            sequence.length <= 1 ||
            (patternStepIndex % sequence.length) === sequence.length - 1;
          const intervalMultiplier = applyIntervalMultiplier
            ? Math.max(1, getPrimaryFireIntervalMultiplier?.() ?? 1)
            : 1;
          primaryCooldowns[i] += currentStepInterval * intervalMultiplier;
          if (
            reloadGroupId >= 0 &&
            (primaryReloadGroupRemainingSeconds[reloadGroupId] ?? 0) > 0
          ) {
            break;
          }
        }
      }
    } else {
      // Recover cooldowns while preserving phase spacing between guns.
      // Stop recovery once the next cannon in sequence becomes ready.
      let minCooldown = Number.POSITIVE_INFINITY;
      for (let i = 0; i < primaryCooldowns.length; i += 1) {
        minCooldown = Math.min(minCooldown, primaryCooldowns[i] ?? 0);
      }
      const recoverStep = Math.max(0, Math.min(deltaTime, minCooldown));
      for (let i = 0; i < primaryCooldowns.length; i += 1) {
        primaryCooldowns[i] = Math.max(0, primaryCooldowns[i] - recoverStep);
      }
    }

    for (let gunIndex = 0; gunIndex < normalizedGuns.length; gunIndex += 1) {
      const gun = normalizedGuns[gunIndex];
      const hitscanPulse = gun.primary.hitscanPulse;
      const isHeavyLaserbeamPulse = hitscanPulse?.effectStyle === "heavy_laserbeam_pulse";
      if (!isHeavyLaserbeamPulse || !hitscanPulse) {
        disposeActiveHeavySustainedBeam(gunIndex);
        continue;
      }

      const chargeDuration = Math.max(0, gun.primary.chargeDurationSeconds);
      const chargeReady =
        chargeDuration <= 0 || (primaryChargeElapsedSeconds[gunIndex] ?? 0) >= chargeDuration;
      const shouldRenderHeavyBeam =
        enabled &&
        (perGunPrimaryFireInputActive[gunIndex] ?? false) &&
        chargeReady &&
        (heavyBeamVisualHoldSeconds[gunIndex] ?? 0) > 0;
      if (!shouldRenderHeavyBeam) {
        disposeActiveHeavySustainedBeam(gunIndex);
        continue;
      }

      resolvePrimaryFireMuzzleAndAim(gun, playerState);
      const contact = resolveHitscanContact(hitscanPulse, muzzleWorld, aimDirection, beamEndPoint);
      const activeBeam = ensureActiveHeavySustainedBeam(gunIndex, hitscanPulse);
      beamOrientation.setFromUnitVectors(unitCylinderAxis, aimDirection);
      beamMidpoint.copy(muzzleWorld).addScaledVector(aimDirection, contact.beamDistance * 0.5);
      activeBeam.root.position.copy(beamMidpoint);
      activeBeam.root.quaternion.copy(beamOrientation);
      activeBeam.outerBeam.scale.set(
        hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER,
        contact.beamDistance,
        hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER
      );
      activeBeam.innerBeam.scale.set(
        hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER,
        contact.beamDistance,
        hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER
      );
      const halfBeamDistance = contact.beamDistance * 0.5;
      const travelMinBoundary = -halfBeamDistance;
      const travelMaxBoundary = halfBeamDistance;
      for (const edgeParticle of activeBeam.edgeParticles) {
        const travelMin =
          travelMinBoundary + edgeParticle.length * 0.5 + HEAVY_BEAM_EDGE_PARTICLE_MUZZLE_FORWARD_OFFSET;
        const travelMax = Math.max(travelMin + 0.01, travelMaxBoundary - edgeParticle.length * 0.5);
        if (edgeParticle.isActive) {
          edgeParticle.travelY += edgeParticle.speedUnitsPerSecond * deltaTime;
          if (edgeParticle.travelY > travelMax) {
            edgeParticle.isActive = false;
            edgeParticle.material.opacity = 0;
            continue;
          }
          edgeParticle.orbitAngle += deltaTime * 2.5;
          edgeParticle.wobblePhase += deltaTime * edgeParticle.wobbleSpeed;
          const radialWobble =
            Math.sin(edgeParticle.wobblePhase) *
            edgeParticle.baseOrbitRadius *
            HEAVY_BEAM_EDGE_PARTICLE_RADIAL_WOBBLE_SCALE;
          const dynamicOrbitRadius = Math.max(
            hitscanPulse.beamThickness * 0.4,
            edgeParticle.orbitRadius + radialWobble
          );
          edgeParticle.mesh.position.set(
            Math.cos(edgeParticle.orbitAngle) * dynamicOrbitRadius,
            edgeParticle.travelY,
            Math.sin(edgeParticle.orbitAngle) * dynamicOrbitRadius
          );
          edgeParticle.material.opacity = 0.82;
        }
      }

      if (activeBeam.edgeParticles.length > 0) {
        activeBeam.edgeParticleEmissionCooldownSeconds -= deltaTime;
        const emitInterval = activeBeam.edgeParticleEmissionIntervalSeconds;
        while (emitInterval > 0 && activeBeam.edgeParticleEmissionCooldownSeconds <= 0) {
          const initialCooldown =
            emitInterval *
            THREE.MathUtils.lerp(
              HEAVY_BEAM_EDGE_PARTICLE_EMISSION_JITTER_MIN,
              HEAVY_BEAM_EDGE_PARTICLE_EMISSION_JITTER_MAX,
              Math.random()
            );
          activeBeam.edgeParticleEmissionCooldownSeconds += Math.max(0.001, initialCooldown);
          const spawnIndex = Math.floor(Math.random() * activeBeam.edgeParticles.length);
          let spawnedEdgeParticle: ActiveHitscanEdgeParticle | null = null;
          for (let attempts = 0; attempts < activeBeam.edgeParticles.length; attempts += 1) {
            const index = (spawnIndex + attempts) % activeBeam.edgeParticles.length;
            const edgeParticle = activeBeam.edgeParticles[index];
            if (edgeParticle.isActive) {
              continue;
            }
            spawnedEdgeParticle = edgeParticle;
            break;
          }
          const edgeParticle = spawnedEdgeParticle ?? activeBeam.edgeParticles[spawnIndex];
          edgeParticle.isActive = true;
          edgeParticle.orbitAngle = Math.random() * Math.PI * 2;
          edgeParticle.orbitRadius =
            edgeParticle.baseOrbitRadius *
            THREE.MathUtils.lerp(
              HEAVY_BEAM_EDGE_PARTICLE_RADIUS_JITTER_MIN,
              HEAVY_BEAM_EDGE_PARTICLE_RADIUS_JITTER_MAX,
              Math.random()
            );
          edgeParticle.wobblePhase = Math.random() * Math.PI * 2;
          edgeParticle.wobbleSpeed = THREE.MathUtils.lerp(1.8, 4.2, Math.random());
          const randomizedLengthMultiplier = THREE.MathUtils.lerp(
            HEAVY_BEAM_EDGE_PARTICLE_LENGTH_MULTIPLIER_MIN,
            HEAVY_BEAM_EDGE_PARTICLE_LENGTH_MULTIPLIER_MAX,
            Math.random()
          );
          edgeParticle.length = edgeParticle.baseLength * randomizedLengthMultiplier;
          edgeParticle.mesh.scale.set(
            edgeParticle.baseThickness,
            edgeParticle.length,
            edgeParticle.baseThickness
          );
          const spawnTravelMin =
            travelMinBoundary + edgeParticle.length * 0.5 + HEAVY_BEAM_EDGE_PARTICLE_MUZZLE_FORWARD_OFFSET;
          edgeParticle.travelY =
            spawnTravelMin +
            THREE.MathUtils.lerp(0, HEAVY_BEAM_EDGE_PARTICLE_MUZZLE_FORWARD_RANDOM_MAX, Math.random());
          edgeParticle.mesh.position.set(
            Math.cos(edgeParticle.orbitAngle) * edgeParticle.orbitRadius,
            edgeParticle.travelY,
            Math.sin(edgeParticle.orbitAngle) * edgeParticle.orbitRadius
          );
          edgeParticle.material.opacity = 0.82;
        }
      }

      activeBeam.muzzleFxCooldownSeconds -= deltaTime;
      while (activeBeam.muzzleFxCooldownSeconds <= 0) {
        heavyEmissionLocalPosition.set(0, -contact.beamDistance * 0.5 + 0.16, 0);
        spawnHeavyBeamSpikyEmission(muzzleWorld, aimDirection, "muzzle", {
          parent: activeBeam.root,
          localPosition: heavyEmissionLocalPosition,
          reverseDirection: false
        });
        activeBeam.muzzleFxCooldownSeconds += HEAVY_BEAM_MUZZLE_FX_INTERVAL_SECONDS;
      }

      if (contact.hurtbox) {
        activeBeam.hitFxCooldownSeconds -= deltaTime;
        while (activeBeam.hitFxCooldownSeconds <= 0) {
          heavyBeamHitSparks.spawnExplosion(beamEndPoint, aimDirection);
          activeBeam.hitFxCooldownSeconds += HEAVY_BEAM_HIT_FX_INTERVAL_SECONDS;
        }
      } else {
        activeBeam.hitFxCooldownSeconds = 0;
      }
    }

    mergeTouchingPlayerProjectiles();

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = projectiles[i];
      let removedOnCollision = false;
      while (true) {
        const collision =
          resolveHitboxAgainstHurtboxes(projectile.hitbox, targetHurtboxes) ??
          resolveHitboxAgainstHurtboxes(projectile.hitbox, interceptTargetHurtboxes);
        if (!collision) {
          break;
        }
        const damageType = projectile.hitbox?.damageType;
        const hitEffectId = projectile.hitEffectId;
        const effectScale = Math.max(0.1, projectile.effectScale ?? 1);
        if (hitEffectId === "explosive_shell_blast") {
          applyProjectileExplosionDamage(projectile, projectile.object.position, collision.hurtbox.id);
        }
        if (!projectile.suppressHitFx) {
          if (hitEffectId === "explosive_shell_blast") {
            projectile.object.getWorldDirection(fallbackForward);
            explosiveShellHitExplosionSparks.spawnExplosion(projectile.object.position, fallbackForward);
            explosiveShellHitExplosionSparks.spawnExplosion(
              projectile.object.position,
              fallbackForward.clone().multiplyScalar(-1)
            );
            explosiveShellMissileExplosionBursts.spawnBurst(
              projectile.object.position,
              Math.max(0, projectile.explosionRadius ?? 0) * 1.5
            );
            concussiveBlastRings.spawnRing(
              projectile.object.position,
              Math.max(0, projectile.explosionRadius ?? 0)
            );
          } else if (damageType === "Plasma") {
            if (hitEffectId === "plasma_arc_red_spark") {
              projectile.object.getWorldDirection(fallbackForward);
              plasmaArcHitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
            } else {
              plasmaHitImplosions.spawnImplosion(
                projectile.object.position,
                projectile.hitbox?.collisionArea.radius
              );
            }
          } else {
            projectile.object.getWorldDirection(fallbackForward);
            if (hitEffectId === "chaingun_yellow_sparks") {
              chaingunHitYellowSparks.spawnExplosion(projectile.object.position, fallbackForward);
            } else if (damageType === "Ion") {
              ionHitBursts.spawnBurst(projectile.object.position, fallbackForward, effectScale);
            } else if (hitEffectId === "acid_splash" || damageType === "Acid") {
              acidHitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
              acidHitSplashes.spawnBurst(
                projectile.object.position,
                fallbackForward,
                fallbackForward.clone().multiplyScalar(
                  Math.max(0, projectile.hitbox?.collisionArea.radius ?? 0) * 0.8
                )
              );
            } else if (damageType === "Solar") {
              solarHitFlashes.spawnFlash(projectile.object.position, effectScale);
          } else if (damageType === "Frost" || damageType === "Cryo") {
            frostHitBursts.spawnBurst(projectile.object.position, fallbackForward, effectScale);
          } else if (damageType === "Void") {
            if (hitEffectId === "voidseeker_orb_implosion_shards") {
              voidSeekerHitBursts.spawnBurst(
                projectile.object.position,
                fallbackForward,
                projectile.hitbox?.collisionArea.radius
              );
            } else {
              voidHitVortices.spawnVortex(
                projectile.object.position,
                fallbackForward,
                projectile.hitbox?.collisionArea.radius
              );
            }
          } else {
            hitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
          }
        }
        }
        const shouldDestroy = projectile.beginDestroy?.("collision") ?? true;
        if (!shouldDestroy) {
          continue;
        }
        removeProjectileAtIndex(i);
        removedOnCollision = true;
        break;
      }
      if (removedOnCollision) {
        continue;
      }

      if (projectile.update(deltaTime)) {
        continue;
      }
      projectile.beginDestroy?.("expired");

      removeProjectileAtIndex(i);
    }

    for (let i = activeHitscanBeamPulses.length - 1; i >= 0; i -= 1) {
      const pulse = activeHitscanBeamPulses[i];
      pulse.age += deltaTime;

      const t = THREE.MathUtils.clamp(pulse.age / Math.max(0.0001, pulse.duration), 0, 1);
      const fadeStartT = HITSCAN_BEAM_FADE_START_RATIO;
      const fadeT =
        t <= fadeStartT ? 0 : THREE.MathUtils.clamp((t - fadeStartT) / Math.max(0.0001, 1 - fadeStartT), 0, 1);
      const fade = 1 - fadeT;
      const flicker = 0.92 + 0.08 * Math.sin((pulse.age / Math.max(0.0001, pulse.duration)) * 22);
      if (pulse.outlineMaterial) {
        pulse.outlineMaterial.opacity = Math.max(
          0,
          pulse.outlineBaseOpacity * fade * fade * (0.94 + flicker * 0.08)
        );
      }
      pulse.outerMaterial.opacity = Math.max(0, pulse.outerBaseOpacity * fade * fade * flicker);
      pulse.innerMaterial.opacity = Math.max(0, pulse.innerBaseOpacity * fade * flicker);
      if (pulse.railSlugCoreMesh && pulse.railSlugShellMesh) {
        const travelDuration = Math.max(0.0001, pulse.railSlugTravelDuration);
        const travelT = THREE.MathUtils.clamp(pulse.age / travelDuration, 0, 1);
        const easedTravelT = 1 - Math.pow(1 - travelT, 3);
        const slugY = THREE.MathUtils.lerp(
          -pulse.railSlugBeamDistance * 0.5,
          pulse.railSlugBeamDistance * 0.5,
          easedTravelT
        );
        pulse.railSlugCoreMesh.position.y = slugY;
        pulse.railSlugShellMesh.position.y = slugY;

        const postTravelFade =
          travelT < 1
            ? 1
            : 1 -
              THREE.MathUtils.clamp(
                (pulse.age - travelDuration) / Math.max(0.0001, pulse.duration - travelDuration),
                0,
                1
              );
        pulse.railSlugCoreMaterial!.opacity = Math.max(0, 0.92 * fade * postTravelFade);
        pulse.railSlugShellMaterial!.opacity = Math.max(
          0,
          0.46 * fade * (0.9 + flicker * 0.08) * postTravelFade
        );
      }
      if (pulse.edgeParticles.length > 0) {
        const halfBeamDistance = pulse.railSlugBeamDistance * 0.5;
        for (const edgeParticle of pulse.edgeParticles) {
          const travelMin = -halfBeamDistance - edgeParticle.length * 0.5;
          const travelMax = halfBeamDistance + edgeParticle.length * 0.5;
          const travelSpan = Math.max(0.001, travelMax - travelMin);
          edgeParticle.travelY =
            travelMin +
            THREE.MathUtils.euclideanModulo(
              edgeParticle.travelY - travelMin + edgeParticle.speedUnitsPerSecond * deltaTime,
              travelSpan
            );
          edgeParticle.orbitAngle += deltaTime * 2.5;
          edgeParticle.mesh.position.set(
            Math.cos(edgeParticle.orbitAngle) * edgeParticle.orbitRadius,
            edgeParticle.travelY,
            Math.sin(edgeParticle.orbitAngle) * edgeParticle.orbitRadius
          );
          edgeParticle.material.opacity = Math.max(
            0,
            0.78 * fade * (0.9 + flicker * 0.15)
          );
        }
      }

      if (pulse.age < pulse.duration) {
        continue;
      }

      pulse.root.removeFromParent();
      pulse.railSlugCoreMaterial?.dispose();
      pulse.railSlugShellMaterial?.dispose();
      pulse.outlineMaterial?.dispose();
      pulse.outerMaterial.dispose();
      pulse.innerMaterial.dispose();
      for (const edgeParticle of pulse.edgeParticles) {
        edgeParticle.material.dispose();
      }
      activeHitscanBeamPulses.splice(i, 1);
    }

    sparkBursts.update(deltaTime);
    ionMuzzleBursts.update(deltaTime);
    plasmaMuzzleGlobs.update(deltaTime);
    acidMuzzleGlobs.update(deltaTime);
    voidMuzzleGlobs.update(deltaTime);
    voidSeekerMuzzleShadowBursts.update(deltaTime);
    chaingunMuzzleSmokeBursts.update(deltaTime);
    frostMuzzleGlobs.update(deltaTime);
    hitSparkExplosions.update(deltaTime);
    heavyBeamHitSparks.update(deltaTime);
    plasmaArcHitSparkExplosions.update(deltaTime);
    acidHitSparkExplosions.update(deltaTime);
    railgunBlueSparkBursts.update(deltaTime);
    railgunImpactBlueSparkBursts.update(deltaTime);
    explosiveShellMuzzleOrangeSparks.update(deltaTime);
    explosiveShellHitExplosionSparks.update(deltaTime);
    explosiveShellMuzzleSmokeBursts.update(deltaTime);
    chaingunMuzzleSparkFlashes.update(deltaTime);
    chaingunHitYellowSparks.update(deltaTime);
    ionHitBursts.update(deltaTime);
    frostHitBursts.update(deltaTime);
    plasmaHitImplosions.update(deltaTime);
    acidHitSplashes.update(deltaTime);
    explosiveShellHitImplosions.update(deltaTime);
    explosiveShellMissileExplosionBursts.update(deltaTime);
    solarHitFlashes.update(deltaTime);
    voidHitVortices.update(deltaTime);
    voidSeekerHitBursts.update(deltaTime);
    explosiveShellBeamSmokeBursts.update(deltaTime);
    explosiveShellHitSmokeBursts.update(deltaTime);
    updateHeavyBeamSpikyEmissions(deltaTime);
    concussiveBlastRings.update(deltaTime);
  };

  const dispose = (): void => {
    if (!disableDefaultPrimaryFireInput) {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
    }

    for (const projectile of projectiles) {
      projectile.dispose?.();
    }
    for (const pulse of activeHitscanBeamPulses) {
      pulse.root.removeFromParent();
      pulse.railSlugCoreMaterial?.dispose();
      pulse.railSlugShellMaterial?.dispose();
      pulse.outlineMaterial?.dispose();
      pulse.outerMaterial.dispose();
      pulse.innerMaterial.dispose();
      for (const edgeParticle of pulse.edgeParticles) {
        edgeParticle.material.dispose();
      }
    }
    for (const telegraph of activeHeavyChargeTelegraphs) {
      if (!telegraph) {
        continue;
      }
      telegraph.root.removeFromParent();
      for (const material of telegraph.materials) {
        material.dispose();
      }
    }
    for (let gunIndex = 0; gunIndex < activeHeavyChargeTelegraphs.length; gunIndex += 1) {
      activeHeavyChargeTelegraphs[gunIndex] = null;
    }
    for (let gunIndex = 0; gunIndex < activeHeavySustainedBeams.length; gunIndex += 1) {
      disposeActiveHeavySustainedBeam(gunIndex);
    }
    for (const emission of activeHeavySpikyEmissions) {
      emission.mesh.removeFromParent();
      emission.material.dispose();
    }
    activeHeavySpikyEmissions.length = 0;
    activeHitscanBeamPulses.length = 0;
    sparkBursts.dispose();
    ionMuzzleBursts.dispose();
    plasmaMuzzleGlobs.dispose();
    acidMuzzleGlobs.dispose();
    voidMuzzleGlobs.dispose();
    voidSeekerMuzzleShadowBursts.dispose();
    chaingunMuzzleSmokeBursts.dispose();
    frostMuzzleGlobs.dispose();
    hitSparkExplosions.dispose();
    heavyBeamHitSparks.dispose();
    plasmaArcHitSparkExplosions.dispose();
    acidHitSparkExplosions.dispose();
    railgunBlueSparkBursts.dispose();
    railgunImpactBlueSparkBursts.dispose();
    explosiveShellMuzzleOrangeSparks.dispose();
    explosiveShellHitExplosionSparks.dispose();
    explosiveShellMuzzleSmokeBursts.dispose();
    chaingunMuzzleSparkFlashes.dispose();
    chaingunHitYellowSparks.dispose();
    ionHitBursts.dispose();
    frostHitBursts.dispose();
    plasmaHitImplosions.dispose();
    acidHitSplashes.dispose();
    explosiveShellHitImplosions.dispose();
    explosiveShellMissileExplosionBursts.dispose();
    solarHitFlashes.dispose();
    voidHitVortices.dispose();
    voidSeekerHitBursts.dispose();
    explosiveShellBeamSmokeBursts.dispose();
    explosiveShellHitSmokeBursts.dispose();
    concussiveBlastRings.dispose();
    projectilesRoot.clear();
    hitscanBeamPulsesRoot.clear();
    scene.remove(projectilesRoot);
    scene.remove(hitscanBeamPulsesRoot);
    hitscanBeamOuterGeometry.dispose();
    hitscanBeamInnerGeometry.dispose();
    hitscanBeamEdgeParticleGeometry.dispose();
    heavyLaserChargeSphereGeometry.dispose();
    heavyBeamSpikyEmissionGeometry.dispose();
    railSlugGeometry.dispose();

    const uniqueFactories = new Set<ProjectileFactory>();
    for (const gun of normalizedGuns) {
      if (gun.primary.projectileFactory) {
        uniqueFactories.add(gun.primary.projectileFactory);
      }
    }
    for (const factory of uniqueFactories) {
      factory.dispose?.();
    }
  };

  return {
    update,
    isPrimaryFireInputActive: () => lastPrimaryFireInputActive,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) {
        primaryFireHeld = false;
        lastPrimaryFireInputActive = false;
        resetPrimaryCooldowns();
        for (let gunIndex = 0; gunIndex < activeHeavySustainedBeams.length; gunIndex += 1) {
          disposeActiveHeavySustainedBeam(gunIndex);
        }
        for (let i = activeHeavyChargeTelegraphs.length - 1; i >= 0; i -= 1) {
          const telegraph = activeHeavyChargeTelegraphs[i];
          if (!telegraph) {
            continue;
          }
          telegraph.root.removeFromParent();
          for (const material of telegraph.materials) {
            material.dispose();
          }
          activeHeavyChargeTelegraphs[i] = null;
        }
        for (let i = activeHeavySpikyEmissions.length - 1; i >= 0; i -= 1) {
          const emission = activeHeavySpikyEmissions[i];
          emission.mesh.removeFromParent();
          emission.material.dispose();
          activeHeavySpikyEmissions.splice(i, 1);
        }
      }
    },
    dispose
  };
}

function isGamepadFireButtonHeld(buttonIndex: number): boolean {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) {
    return false;
  }

  for (const gamepad of gamepads) {
    if (!gamepad?.connected) {
      continue;
    }

    if (gamepad.buttons[buttonIndex]?.pressed) {
      return true;
    }
  }

  return false;
}

function normalizeGunDefinitions(guns: readonly GunDefinition[]): NormalizedGunDefinition[] {
  return guns
    .map((gun) => {
      const primaryProfile: GunFireModeDefinition | undefined =
        gun.primary ??
        (gun.projectileFactory
          ? {
              fireIntervalSeconds: gun.fireIntervalSeconds,
              projectileFactory: gun.projectileFactory,
              heatCost: 0,
              energyCost: 0
            }
          : undefined);
      if (!primaryProfile) {
        return null;
      }
      if (!primaryProfile.projectileFactory && !primaryProfile.hitscanPulse) {
        return null;
      }

      return {
        hardpoint: gun.hardpoint,
        primary: {
          fireIntervalSeconds:
            primaryProfile.fireIntervalSeconds ?? DEFAULT_GUN_FIRE_INTERVAL_SECONDS,
          fireIntervalSequenceSeconds:
            (primaryProfile.fireIntervalSequenceSeconds ?? []).map((interval) =>
              Math.max(0.001, interval)
            ),
          fireIntervalMultiplierScope: primaryProfile.fireIntervalMultiplierScope ?? "all_steps",
          completeBurstOnRelease: primaryProfile.completeBurstOnRelease ?? false,
          reloadAfterShots:
            typeof primaryProfile.reloadAfterShots === "number" &&
            Number.isFinite(primaryProfile.reloadAfterShots) &&
            primaryProfile.reloadAfterShots > 0
              ? Math.max(1, Math.floor(primaryProfile.reloadAfterShots))
              : null,
          reloadDurationSeconds: Math.max(0, primaryProfile.reloadDurationSeconds ?? 0),
          shareReloadAcrossHardpoints: primaryProfile.shareReloadAcrossHardpoints ?? true,
          burstPhaseGroupId:
            typeof primaryProfile.burstPhaseGroupId === "number"
              ? Math.floor(primaryProfile.burstPhaseGroupId)
              : null,
          burstPhaseGroupPattern: (primaryProfile.burstPhaseGroupPattern ?? [])
            .map((value) => Math.floor(value))
            .filter((value) => Number.isFinite(value)),
          phaseOffsetSeconds: primaryProfile.phaseOffsetSeconds ?? 0,
          chargeDurationSeconds: Math.max(0, primaryProfile.chargeDurationSeconds ?? 0),
          projectileFactory: primaryProfile.projectileFactory ?? null,
          hitscanPulse: primaryProfile.hitscanPulse
            ? {
                maxDistance: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.maxDistance ?? DEFAULT_HITSCAN_BEAM_MAX_DISTANCE
                ),
                pulseDurationSeconds: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.pulseDurationSeconds ??
                    DEFAULT_HITSCAN_BEAM_PULSE_DURATION_SECONDS
                ),
                beamThickness: Math.max(
                  0.005,
                  primaryProfile.hitscanPulse.beamThickness ?? DEFAULT_HITSCAN_BEAM_THICKNESS
                ),
                damageAmount: Math.max(0, primaryProfile.hitscanPulse.damageAmount),
                damageType: primaryProfile.hitscanPulse.damageType ?? LASER_DAMAGE_TYPE,
                additionalDamageSegments:
                  primaryProfile.hitscanPulse.additionalDamageSegments
                    ?.map((segment) => ({
                      amount: Math.max(0, segment.amount),
                      damageType: segment.damageType
                    }))
                    .filter((segment) => segment.amount > 0) ?? [],
                sourceFaction: primaryProfile.hitscanPulse.sourceFaction ?? null,
                hitSparkIntervalSeconds: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.hitSparkIntervalSeconds ??
                    DEFAULT_HITSCAN_BEAM_HIT_SPARK_INTERVAL_SECONDS
                ),
                beamColor: primaryProfile.hitscanPulse.beamColor ?? 0x40ff6b,
                beamCoreColor: primaryProfile.hitscanPulse.beamCoreColor ?? 0xeefff4,
                effectStyle: primaryProfile.hitscanPulse.effectStyle ?? "default",
                explosionRadius: Math.max(0, primaryProfile.hitscanPulse.explosionRadius ?? 0),
                explosionDamageAmount: Math.max(
                  0,
                  primaryProfile.hitscanPulse.explosionDamageAmount ??
                    primaryProfile.hitscanPulse.damageAmount
                ),
                edgeParticleCount: Math.max(
                  0,
                  Math.floor(primaryProfile.hitscanPulse.edgeParticleCount ?? 0)
                ),
                edgeParticleSpeedUnitsPerSecond: Math.max(
                  0,
                  primaryProfile.hitscanPulse.edgeParticleSpeedUnitsPerSecond ?? 0
                ),
                edgeParticleLength: Math.max(0, primaryProfile.hitscanPulse.edgeParticleLength ?? 0),
                edgeParticleThickness: Math.max(
                  0,
                  primaryProfile.hitscanPulse.edgeParticleThickness ?? 0
                ),
                edgeParticleOrbitRadiusMultiplier: Math.max(
                  0,
                  primaryProfile.hitscanPulse.edgeParticleOrbitRadiusMultiplier ?? 1
                )
              }
            : null,
          heatCost: Math.max(0, primaryProfile.heatCost ?? 0),
          energyCost: Math.max(0, primaryProfile.energyCost ?? 0)
        }
      };
    })
    .filter((gun): gun is NormalizedGunDefinition => gun !== null);
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
