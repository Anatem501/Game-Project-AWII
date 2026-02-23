import { createIonBoltFactory } from "../controllers/projectiles/IonBoltFactory";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createPlasmaBoltFactory } from "../controllers/projectiles/PlasmaBoltFactory";
import type { ProjectileFactory } from "../controllers/projectiles/ProjectileTypes";
import {
  getCannonPrimaryComponentDefinition,
  type CannonPrimaryComponentId
} from "./WeaponComponentCatalog";

export type CannonProjectileFactoryAssets = {
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
      modelUrl: config.assets?.plasmaboltModelUrl,
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
