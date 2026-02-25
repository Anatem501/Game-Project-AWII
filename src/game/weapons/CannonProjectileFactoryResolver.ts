import { createIonBoltFactory } from "../controllers/projectiles/IonBoltFactory";
import { createIonArcFactory } from "../controllers/projectiles/IonArcFactory";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createPlasmaBoltFactory } from "../controllers/projectiles/PlasmaBoltFactory";
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
  plasmaboltModelUrl?: string;
};

export type CannonProjectileFactoryResolverConfig = {
  faction: string | null;
  assets?: CannonProjectileFactoryAssets;
};

export function createCannonPrimaryProjectileFactory(
  componentId: CannonPrimaryComponentId,
  config: CannonProjectileFactoryResolverConfig
): ProjectileFactory {
  const component = getCannonPrimaryComponentDefinition(componentId);

  if (componentId === "repeating_plasmabolt_fire") {
    return createPlasmaBoltFactory({
      faction: config.faction,
      modelUrl: config.assets?.plasmaboltModelUrl,
      ...component.projectile
    });
  }

  if (componentId === "repeating_voidbolt_fire") {
    return createPlasmaBoltFactory({
      faction: config.faction,
      modelUrl: config.assets?.ionboltModelUrl,
      reverseModelForward: true,
      shaderVariant: "void",
      coreColor: 0x24103a,
      hotColor: 0x341652,
      rimColor: 0x4a2d73,
      shellColor: 0xf4edff,
      glowColor: 0xe3d1ff,
      glowOpacity: 0.26,
      glowScale: 1.24,
      glowLayerStyle: "outline",
      trailGlobColor: 0x160a26,
      trailGlobOpacity: 0.58,
      trailGlobOutlineColor: 0x5d3a93,
      trailGlobOutlineOpacity: 0.2,
      trailGlobOutlineScale: 1.22,
      trailGlobCount: 4,
      trailGlobLifetimeSeconds: 0.055,
      ...component.projectile
    });
  }

  if (componentId === "repeating_cryoshard_fire") {
    return createPlasmaBoltFactory({
      faction: config.faction,
      modelUrl: config.assets?.cryoshardModelUrl,
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
      ...component.projectile
    });
  }

  if (componentId === "burst_ion_arc_fire") {
    return createIonArcFactory({
      faction: config.faction,
      modelUrl: config.assets?.arcModelUrl,
      coreColor: 0x3f7dff,
      arcColor: 0x7cb8ff,
      rimColor: 0x2e6dff,
      shadowGlowColor: 0x4d7dff,
      shadowGlowOpacity: 0.2,
      surfaceOpacity: 0.58,
      ...component.projectile
    });
  }

  if (componentId === "plasma_arc_shots") {
    return createPlasmaBoltFactory({
      faction: config.faction,
      modelUrl: config.assets?.arcModelUrl,
      modelYawRadians: -Math.PI * 0.5,
      coreColor: 0xff5a42,
      hotColor: 0xff9369,
      rimColor: 0x8d1f14,
      shellColor: 0xffc99c,
      surfacePatternScale: 0.52,
      surfaceStripeStrength: 0.38,
      glowColor: 0xff8a4a,
      glowLayerStyle: "outline",
      glowOpacity: 0.14,
      glowScale: 1.06,
      trailGlobColor: 0xff8c61,
      trailGlobOpacity: 0.4,
      trailGlobOutlineColor: 0xffddb8,
      trailGlobOutlineOpacity: 0.16,
      trailGlobOutlineScale: 1.14,
      trailGlobCount: 6,
      trailGlobSpawnIntervalSeconds: 0.02,
      trailGlobLifetimeSeconds: 0.07,
      trailGlobUseParticleSockets: true,
      pierceOnCollision: true,
      maxPierceHits: 12,
      bridgeParticleCount: 0,
      ...component.projectile
    });
  }

  if (componentId === "cryowave_fire") {
    return createIonArcFactory({
      faction: config.faction,
      modelUrl: config.assets?.arcV02ModelUrl ?? config.assets?.arcV01ModelUrl ?? config.assets?.arcModelUrl,
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
      ...component.projectile
    });
  }

  if (componentId === "repeating_ionbolt_fire") {
    return createIonBoltFactory({
      faction: config.faction,
      modelUrl: config.assets?.ionboltModelUrl,
      ...component.projectile
    });
  }

  return createLaserBoltFactory({
    faction: config.faction,
    ...component.projectile
  });
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
