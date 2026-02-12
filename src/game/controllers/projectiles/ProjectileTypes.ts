import * as THREE from "three";
import type { HitboxComponent } from "../../components/combat/HitboxComponent";

export type ProjectileSpawnParams = {
  direction: THREE.Vector3;
  origin: THREE.Vector3;
};

export type ProjectileInstance = {
  object: THREE.Object3D;
  hitbox?: HitboxComponent;
  update: (deltaTime: number) => boolean;
  dispose?: () => void;
};

export type ProjectileFactory = {
  spawn: (params: ProjectileSpawnParams) => ProjectileInstance;
  dispose?: () => void;
};
