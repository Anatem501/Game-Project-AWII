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
