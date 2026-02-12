import * as THREE from "three";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import { LASER_DAMAGE_TYPE, type DamageType } from "../../components/combat/DamageTypes";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSpawnParams
} from "./ProjectileTypes";

const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);

export type LaserBoltFactoryOptions = {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  length?: number;
  lifetimeSeconds?: number;
  metalness?: number;
  roughness?: number;
  speed?: number;
  thickness?: number;
  damage?: number;
  damageType?: DamageType;
  collisionRadius?: number;
  faction?: string | null;
};

export function createLaserBoltFactory(options: LaserBoltFactoryOptions = {}): ProjectileFactory {
  const speed = options.speed ?? 28;
  const lifetimeSeconds = options.lifetimeSeconds ?? 2;
  const length = options.length ?? 0.44;
  const thickness = options.thickness ?? 0.06;
  const damage = Math.max(0, options.damage ?? 8);
  const damageType = options.damageType ?? LASER_DAMAGE_TYPE;
  const collisionRadius = Math.max(0.01, options.collisionRadius ?? Math.max(0.08, thickness * 0.9));
  const faction = options.faction ?? null;

  const geometry = new THREE.BoxGeometry(thickness, thickness, length);
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0x72ff9a,
    emissive: options.emissive ?? 0x2dff55,
    emissiveIntensity: options.emissiveIntensity ?? 2.25,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.35,
    toneMapped: false
  });

  const shotQuaternion = new THREE.Quaternion();

  const spawn = ({ direction, origin }: ProjectileSpawnParams): ProjectileInstance => {
    const projectileMesh = new THREE.Mesh(geometry, material);
    const projectileDirection = direction.clone();

    if (projectileDirection.lengthSq() <= 0.000001) {
      projectileDirection.copy(PROJECTILE_FORWARD);
    } else {
      projectileDirection.normalize();
    }

    projectileMesh.position.copy(origin);
    shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, projectileDirection);
    projectileMesh.quaternion.copy(shotQuaternion);

    const velocity = projectileDirection.multiplyScalar(speed);
    const hitbox = createHitboxComponent({
      owner: projectileMesh,
      collisionArea: { radius: collisionRadius },
      damageAmount: damage,
      damageType,
      sourceFaction: faction
    });
    let lifeRemaining = lifetimeSeconds;

    return {
      object: projectileMesh,
      hitbox,
      update: (deltaTime: number): boolean => {
        lifeRemaining -= deltaTime;
        projectileMesh.position.addScaledVector(velocity, deltaTime);
        return lifeRemaining > 0;
      }
    };
  };

  return {
    spawn,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    }
  };
}
