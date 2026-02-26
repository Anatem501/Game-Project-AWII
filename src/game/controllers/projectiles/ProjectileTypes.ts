import * as THREE from "three";
import type { HitboxComponent } from "../../components/combat/HitboxComponent";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";

export type ProjectileSpawnParams = {
  direction: THREE.Vector3;
  origin: THREE.Vector3;
  patternStepIndex?: number;
  homingTargetHurtbox?: HurtboxComponent | null;
};

export type ProjectileSelfMergePayload = {
  damageAmount: number;
  scaleMultiplier: number;
  velocity: THREE.Vector3;
};

export type ProjectileInstance = {
  object: THREE.Object3D;
  hitbox?: HitboxComponent;
  effectScale?: number;
  hitEffectId?: string;
  muzzleEffectId?: string;
  explosionRadius?: number;
  explosionDamageAmount?: number;
  suppressMuzzleFx?: boolean;
  suppressHitFx?: boolean;
  selfMergeGroupId?: string;
  getSelfMergeWorldCenter?: (out: THREE.Vector3) => THREE.Vector3;
  getSelfMergeRadius?: () => number;
  getSelfMergePayload?: () => ProjectileSelfMergePayload | null;
  absorbSelfMergePayload?: (payload: ProjectileSelfMergePayload) => boolean;
  update: (deltaTime: number) => boolean;
  beginDestroy?: (reason: "collision" | "expired") => boolean;
  dispose?: () => void;
};

export type ProjectileFactory = {
  spawn: (params: ProjectileSpawnParams) => ProjectileInstance;
  dispose?: () => void;
};
