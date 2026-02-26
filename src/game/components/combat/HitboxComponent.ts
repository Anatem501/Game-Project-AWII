import * as THREE from "three";
import { DEFAULT_DAMAGE_TYPE, type DamageType } from "./DamageTypes";
import type {
  CollisionArea,
  DamagePacket,
  DamagePacketSegment,
  StatusPayload
} from "./CombatTypes";

export type HitboxConfig = {
  owner: THREE.Object3D;
  collisionArea: CollisionArea;
  damageAmount: number;
  damageType?: DamageType;
  additionalDamageSegments?: readonly DamagePacketSegment[];
  statusPayloads?: readonly StatusPayload[];
  sourceId?: string;
  sourceFaction?: string | null;
  maxHits?: number;
  enabled?: boolean;
};

export type HitboxComponent = {
  readonly id: string;
  readonly owner: THREE.Object3D;
  readonly sourceFaction: string | null;
  readonly sourceId?: string;
  readonly damageAmount: number;
  readonly damageType: DamageType;
  readonly collisionArea: Readonly<CollisionArea>;
  setDamageAmount: (damageAmount: number) => void;
  setCollisionRadius: (radius: number) => void;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  canStillDealDamage: () => boolean;
  hasHitTarget: (hurtboxId: string) => boolean;
  registerHitTarget: (hurtboxId: string) => void;
  getWorldCenter: (out: THREE.Vector3) => THREE.Vector3;
  getDamagePacket: () => DamagePacket;
};

let nextHitboxId = 0;

export function createHitboxComponent(config: HitboxConfig): HitboxComponent {
  const localOffset = config.collisionArea.localOffset?.clone() ?? new THREE.Vector3();
  const collisionArea: CollisionArea = {
    radius: Math.max(0, config.collisionArea.radius),
    localOffset
  };
  const sourceFaction = config.sourceFaction ?? null;
  const maxHits = Math.max(1, Math.floor(config.maxHits ?? 1));
  let damageAmount = Math.max(0, config.damageAmount);
  const damageType = config.damageType ?? DEFAULT_DAMAGE_TYPE;
  const hitTargets = new Set<string>();
  const additionalDamageSegments =
    config.additionalDamageSegments
      ?.map((segment) => ({
        amount: Math.max(0, segment.amount),
        damageType: segment.damageType
      }))
      .filter((segment) => segment.amount > 0) ?? [];
  const statusPayloads =
    config.statusPayloads
      ?.map((payload) =>
        payload.kind === "cryo_buildup"
          ? { kind: payload.kind, amount: Math.max(0, payload.amount) }
          : payload
      )
      .filter((payload) => payload.kind !== "cryo_buildup" || payload.amount > 0) ?? [];

  let enabled = config.enabled ?? true;
  let hitCount = 0;

  const getWorldCenter = (out: THREE.Vector3): THREE.Vector3 => {
    if (localOffset.lengthSq() <= 0.000001) {
      return config.owner.getWorldPosition(out);
    }
    return out.copy(localOffset).applyMatrix4(config.owner.matrixWorld);
  };

  return {
    id: `hitbox_${nextHitboxId++}`,
    owner: config.owner,
    sourceFaction,
    sourceId: config.sourceId,
    get damageAmount() {
      return damageAmount;
    },
    damageType,
    collisionArea,
    setDamageAmount: (value: number) => {
      damageAmount = Math.max(0, value);
    },
    setCollisionRadius: (value: number) => {
      collisionArea.radius = Math.max(0, value);
    },
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    isEnabled: () => enabled,
    canStillDealDamage: () => enabled && hitCount < maxHits && damageAmount > 0,
    hasHitTarget: (hurtboxId: string) => hitTargets.has(hurtboxId),
    registerHitTarget: (hurtboxId: string) => {
      if (hitTargets.has(hurtboxId)) {
        return;
      }
      hitTargets.add(hurtboxId);
      hitCount += 1;
    },
    getWorldCenter,
    getDamagePacket: () => ({
      amount: damageAmount,
      damageType,
      segments: additionalDamageSegments.length > 0 ? additionalDamageSegments : undefined,
      statusPayloads: statusPayloads.length > 0 ? statusPayloads : undefined,
      sourceId: config.sourceId,
      sourceFaction
    })
  };
}
