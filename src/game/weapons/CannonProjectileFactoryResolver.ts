import { createIonBoltFactory } from "../controllers/projectiles/IonBoltFactory";
import { createIonArcFactory } from "../controllers/projectiles/IonArcFactory";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createPlasmaBoltFactory } from "../controllers/projectiles/PlasmaBoltFactory";
import { createSolarSeekerFactory } from "../controllers/projectiles/SolarSeekerFactory";
import { createVoidSeekerFactory } from "../controllers/projectiles/VoidSeekerFactory";
import { createChaingunBulletFactory } from "../controllers/projectiles/ChaingunBulletFactory";
import type { ProjectileFactory } from "../controllers/projectiles/ProjectileTypes";
import {
  getCannonPrimaryComponentDefinition,
  type CannonPrimaryComponentId
} from "./WeaponComponentCatalog";

export type CannonProjectileFactoryAssets = {
  arcModelUrl?: string;
  arcV01ModelUrl?: string;
  arcV02ModelUrl?: string;
  cryoshardModelUrl?: string;
  ionboltModelUrl?: string;
  orbModelUrl?: string;
  orbV02ModelUrl?: string;
  plasmaboltModelUrl?: string;
};

export type CannonProjectileFactoryResolverConfig = {
  faction: string | null;
  assets?: CannonProjectileFactoryAssets;
};

const warnedGenericFallbackComponentIds = new Set<string>();

export function createCannonPrimaryProjectileFactory(
  componentId: CannonPrimaryComponentId,
  config: CannonProjectileFactoryResolverConfig
): ProjectileFactory {
  const component = getCannonPrimaryComponentDefinition(componentId);
  const projectile = component.projectile;
  const { faction, assets } = config;

  switch (componentId) {
    case "solar_seeker_shots":
      return createSolarSeekerFactory({
        faction,
        modelUrl: assets?.orbModelUrl,
        ...projectile
      });
    case "void_seeker_fire":
      return createVoidSeekerFactory({
        faction,
        modelUrl: assets?.orbModelUrl,
        ...projectile
      });
    case "rapid_chaingun_fire":
      return createChaingunBulletFactory({
        faction,
        speed: projectile.speed,
        lifetimeSeconds: projectile.lifetimeSeconds,
        damage: projectile.damage,
        damageType: projectile.damageType,
        collisionRadius: 0.06,
        bulletLength: 0.315,
        bulletRadius: 0.054,
        bulletColor: 0xf0c35a,
        tailLength: 0.4,
        tailWidth: 0.082,
        tailHeadColor: 0xffe662,
        tailTipColor: 0xff3a1a,
        tailOpacity: 0.86
      });
    case "explosive_shell_fire":
      return createChaingunBulletFactory({
        faction,
        speed: projectile.speed,
        lifetimeSeconds: projectile.lifetimeSeconds,
        damage: projectile.damage,
        damageType: projectile.damageType,
        collisionRadius: projectile.collisionRadius,
        bulletLength: 0.26,
        bulletRadius: 0.062,
        bulletColor: 0xd7ad4a,
        tailLength: 1.84,
        tailWidth: 0.045,
        tailHeadColor: 0xcfd4da,
        tailTipColor: 0x4a4f56,
        tailOpacity: 0.62,
        smokeTailLength: 2.96,
        smokeTailWidth: 0.085,
        smokeTailHeadColor: 0xd6dbe1,
        smokeTailTipColor: 0x26282c,
        smokeTailOpacity: 0.64,
        effectScale: 1.15,
        muzzleEffectId: "explosive_shell_muzzle",
        hitEffectId: "explosive_shell_blast",
        suppressMuzzleFx: true,
        suppressHitFx: false,
        explosionRadius: 0.75,
        explosionDamageAmount: 20
      });
    case "repeating_plasmabolt_fire":
      return createPlasmaBoltFactory({
        faction,
        modelUrl: assets?.plasmaboltModelUrl,
        ...projectile
      });
    case "burst_acid_fire":
      return createPlasmaBoltFactory({
        faction,
        modelUrl: assets?.orbV02ModelUrl ?? assets?.orbModelUrl,
        coreColor: 0x84c414,
        hotColor: 0xc4ff52,
        rimColor: 0x58a912,
        shellColor: 0xeeff98,
        glowColor: 0xb8ff36,
        glowLayerStyle: "outline",
        glowOpacity: 0.22,
        glowScale: 1.2,
        surfacePatternScale: 0.74,
        surfaceStripeStrength: 0.52,
        trailingModelCount: 2,
        trailingModelSpacing: 0.14,
        trailingModelScaleStep: 0.17,
        trailingModelOpacity: 0.16,
        trailGlobColor: 0x79d71f,
        trailGlobOpacity: 0.52,
        trailGlobOutlineColor: 0xf0ffaf,
        trailGlobOutlineOpacity: 0.18,
        trailGlobOutlineScale: 1.18,
        trailGlobCount: 7,
        trailGlobSpawnIntervalSeconds: 0.03,
        trailGlobLifetimeSeconds: 0.12,
        trailGlobUseParticleSockets: false,
        bridgeParticleCount: 0,
        orbitShardCount: 0,
        muzzleEffectId: "acid_splash",
        hitEffectId: "acid_splash",
        selfMergeGroupId: "acid_glob",
        selfMergeScaleStepMultiplier: 1.25,
        selfMergeForwardVisualScaleStepMultiplier: 1.5,
        selfMergeRadialVisualScaleStepMultiplier: 1.25,
        maxSelfMergeScaleMultiplier: 4,
        ...projectile
      });
    case "repeating_voidbolt_fire":
      return createPlasmaBoltFactory({
        faction,
        modelUrl: assets?.ionboltModelUrl,
        reverseModelForward: true,
        shaderVariant: "void",
        coreColor: 0x24103a,
        hotColor: 0x341652,
        rimColor: 0x4a2d73,
        shellColor: 0xf4edff,
        glowColor: 0x8ca2ff,
        glowOpacity: 0.3,
        glowScale: 1.28,
        glowLayerStyle: "outline",
        surfacePatternScale: 0.86,
        surfaceStripeStrength: 0.62,
        trailingModelCount: 2,
        trailingModelSpacing: 0.14,
        trailingModelScaleStep: 0.2,
        trailingModelOpacity: 0.16,
        trailGlobColor: 0x160a26,
        trailGlobOpacity: 0.58,
        trailGlobOutlineColor: 0x7f7cff,
        trailGlobOutlineOpacity: 0.24,
        trailGlobOutlineScale: 1.24,
        trailGlobCount: 4,
        trailGlobSpawnIntervalSeconds: 0.012,
        trailGlobLifetimeSeconds: 0.055,
        trailGlobUseParticleSockets: true,
        bridgeParticleCount: 0,
        orbitShardCount: 16,
        orbitShardColor: 0x98a4ff,
        orbitShardOpacity: 0.82,
        orbitShardRadius: 0.085,
        orbitShardSpeed: 10.2,
        orbitShardTrailLengthMultiplier: 0.5,
        ...projectile
      });
    case "repeating_cryoshard_fire":
      return createPlasmaBoltFactory({
        faction,
        modelUrl: assets?.cryoshardModelUrl,
        coreColor: 0xa7e8ff,
        hotColor: 0xddf8ff,
        rimColor: 0x1f4f9d,
        shellColor: 0xf3fdff,
        glowColor: 0x255fb8,
        glowLayerStyle: "outline",
        glowOpacity: 0.16,
        glowScale: 1.045,
        trailGlobColor: 0x9ce7ff,
        trailGlobOpacity: 0.34,
        trailGlobOutlineColor: 0xf4feff,
        trailGlobOutlineOpacity: 0.24,
        trailGlobOutlineScale: 1.14,
        trailGlobCount: 4,
        trailGlobSpawnIntervalSeconds: 0.02,
        trailGlobLifetimeSeconds: 0.055,
        ...projectile
      });
    case "burst_ion_arc_fire":
      return createIonArcFactory({
        faction,
        modelUrl: assets?.arcModelUrl,
        coreColor: 0x3f7dff,
        arcColor: 0x7cb8ff,
        rimColor: 0x2e6dff,
        shadowGlowColor: 0x4d7dff,
        shadowGlowOpacity: 0.2,
        surfaceOpacity: 0.58,
        ...projectile
      });
    case "plasma_arc_shots":
      return createPlasmaBoltFactory({
        faction,
        modelUrl: assets?.arcModelUrl,
        modelYawRadians: -Math.PI * 0.5,
        coreColor: 0xff5a42,
        hotColor: 0xff9369,
        rimColor: 0x8d1f14,
        shellColor: 0xffc99c,
        surfacePatternScale: 0.52,
        surfaceStripeStrength: 0.38,
        fadeStartSeconds: 1.0,
        fadeDurationSeconds: 0.22,
        glowColor: 0x7a221f,
        glowLayerStyle: "shell",
        glowOpacity: 0.18,
        glowScale: 1.14,
        trailingModelCount: 4,
        trailingModelSpacing: 0.2,
        trailingModelScaleStep: 0.14,
        trailingModelOpacity: 0.9,
        hitEffectId: "plasma_arc_red_spark",
        trailGlobColor: 0xff8c61,
        trailGlobOpacity: 0.4,
        trailGlobOutlineColor: 0xffddb8,
        trailGlobOutlineOpacity: 0.16,
        trailGlobOutlineScale: 1.14,
        trailGlobCount: 0,
        trailGlobUseParticleSockets: false,
        pierceOnCollision: true,
        maxPierceHits: 12,
        bridgeParticleCount: 0,
        ...projectile
      });
    case "cryowave_fire":
      return createIonArcFactory({
        faction,
        modelUrl: assets?.arcV02ModelUrl ?? assets?.arcV01ModelUrl ?? assets?.arcModelUrl,
        coreColor: 0x87d7ff,
        arcColor: 0xbfeeff,
        rimColor: 0xbfeeff,
        surfaceOpacity: 0.5,
        enableSpiralBridgeParticles: false,
        surfacePulseStrength: 0,
        outlineLayerColor: 0x143f8f,
        outlineLayerOpacity: 0.85,
        outlineLayerScale: 1.035,
        glowLayerOpacity: 0,
        pierceOnCollision: false,
        maxPierceHits: 1,
        baseForwardScale: 0.42,
        baseHeightScale: 0.44,
        baseWidthScale: 0.36,
        widthGrowMax: 1.02,
        heightGrowMax: 0.88,
        lengthScaleEnd: 0.97,
        socketTrailLengthMultiplier: 2.55,
        socketTrailParticleSizeMultiplier: 5.8,
        socketTrailParticlesPerSocket: 5,
        socketTrailFlowSpeedMin: 1.4,
        socketTrailFlowSpeedMax: 3.1,
        socketTrailMirrorSeeds: true,
        useIndexedParticleTrailSockets: true,
        indexedParticleTrailSocketIds: [1, 2, 3],
        indexedParticleTrailSocketLengthMultipliers: {
          2: 0.58,
          3: 0.58
        },
        indexedParticleTrailSocketSizeMultipliers: {
          2: 0.55,
          3: 0.55
        },
        includePrimaryMarkerTrails: false,
        autoCenterByWidth: true,
        startAtFullScale: true,
        fadeStartT: 0.5,
        fadeEndT: 0.98,
        ...projectile
      });
    case "repeating_ionbolt_fire":
      return createIonBoltFactory({
        faction,
        modelUrl: assets?.ionboltModelUrl,
        ...projectile
      });
    default:
      if (import.meta.env.DEV && !warnedGenericFallbackComponentIds.has(componentId)) {
        warnedGenericFallbackComponentIds.add(componentId);
        console.warn(
          `[CannonProjectileFactoryResolver] Using generic laser bolt fallback for cannon component '${componentId}'.`
        );
      }
      return createLaserBoltFactory({
        faction,
        ...projectile
      });
  }
}

export type CachedCannonProjectileFactoryResolver = {
  resolve: (componentId: CannonPrimaryComponentId) => ProjectileFactory;
  dispose: () => void;
};

export function createCachedCannonPrimaryProjectileFactoryResolver(
  config: CannonProjectileFactoryResolverConfig
): CachedCannonProjectileFactoryResolver {
  const cache = new Map<CannonPrimaryComponentId, ProjectileFactory>();

  return {
    resolve: (componentId: CannonPrimaryComponentId) => {
      const cached = cache.get(componentId);
      if (cached) {
        return cached;
      }

      const factory = createCannonPrimaryProjectileFactory(componentId, config);
      cache.set(componentId, factory);
      return factory;
    },
    dispose: () => {
      for (const factory of cache.values()) {
        factory.dispose?.();
      }
      cache.clear();
    }
  };
}
