import * as THREE from "three";
import type {
  DamageBreakdown,
  HealthComponent,
  HealthSnapshot
} from "../HealthComponent";
import type { CollisionArea, DamagePacket } from "./CombatTypes";

export type HurtboxHitResult = {
  breakdown: DamageBreakdown;
  damagePacket: DamagePacket;
  snapshot: HealthSnapshot;
};

export type HurtboxHitEvent = HurtboxHitResult & {
  hurtboxId: string;
};

export type HurtboxConfig = {
  owner: THREE.Object3D;
  health: HealthComponent;
  collisionArea: CollisionArea;
  faction?: string | null;
  id?: string;
  enabled?: boolean;
  transformIncomingDamagePacket?: (damagePacket: DamagePacket) => DamagePacket;
  onHit?: (event: HurtboxHitEvent) => void;
};

export type HurtboxComponent = {
  readonly id: string;
  readonly owner: THREE.Object3D;
  readonly health: HealthComponent;
  readonly faction: string | null;
  readonly collisionArea: Readonly<CollisionArea>;
  setCollisionArea: (collisionArea: CollisionArea) => void;
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
  canReceiveDamage: () => boolean;
  getWorldCenter: (out: THREE.Vector3) => THREE.Vector3;
  receiveDamage: (damagePacket: DamagePacket) => HurtboxHitResult | null;
};

let nextHurtboxId = 0;

export function createHurtboxComponent(config: HurtboxConfig): HurtboxComponent {
  const localOffset = config.collisionArea.localOffset?.clone() ?? new THREE.Vector3();
  const collisionArea: CollisionArea = {
    radius: Math.max(0, config.collisionArea.radius),
    localOffset
  };
  const id = config.id ?? `hurtbox_${nextHurtboxId++}`;
  const faction = config.faction ?? null;
  let enabled = config.enabled ?? true;

  const getWorldCenter = (out: THREE.Vector3): THREE.Vector3 => {
    if (localOffset.lengthSq() <= 0.000001) {
      return config.owner.getWorldPosition(out);
    }
    return out.copy(localOffset).applyMatrix4(config.owner.matrixWorld);
  };

  const receiveDamage = (damagePacket: DamagePacket): HurtboxHitResult | null => {
    if (!enabled) {
      return null;
    }
    const transformedDamagePacket = config.transformIncomingDamagePacket
      ? config.transformIncomingDamagePacket(damagePacket)
      : damagePacket;
    const validSegments = (transformedDamagePacket.segments ?? []).filter(
      (segment) => segment.amount > 0
    );
    const totalIncomingRequested =
      Math.max(0, transformedDamagePacket.amount) +
      validSegments.reduce((sum, segment) => sum + Math.max(0, segment.amount), 0);
    if (totalIncomingRequested <= 0) {
      return null;
    }

    const firstBreakdown = config.health.applyDamage(
      Math.max(0, transformedDamagePacket.amount),
      transformedDamagePacket.damageType
    );
    const breakdown = {
      ...firstBreakdown,
      incomingBaseDamage: firstBreakdown.incomingBaseDamage,
      toShield: firstBreakdown.toShield,
      toArmor: firstBreakdown.toArmor,
      toHull: firstBreakdown.toHull,
      unabsorbedBaseDamage: firstBreakdown.unabsorbedBaseDamage
    };
    for (const segment of validSegments) {
      const segmentBreakdown = config.health.applyDamage(segment.amount, segment.damageType);
      breakdown.incomingBaseDamage += segmentBreakdown.incomingBaseDamage;
      breakdown.toShield += segmentBreakdown.toShield;
      breakdown.toArmor += segmentBreakdown.toArmor;
      breakdown.toHull += segmentBreakdown.toHull;
      breakdown.unabsorbedBaseDamage += segmentBreakdown.unabsorbedBaseDamage;
      breakdown.destroyed = segmentBreakdown.destroyed;
    }
    const snapshot = config.health.getSnapshot();
    const event: HurtboxHitEvent = {
      breakdown,
      damagePacket: transformedDamagePacket,
      snapshot,
      hurtboxId: id
    };
    config.onHit?.(event);
    return { breakdown, damagePacket: transformedDamagePacket, snapshot };
  };

  return {
    id,
    owner: config.owner,
    health: config.health,
    faction,
    collisionArea,
    setCollisionArea: (nextCollisionArea: CollisionArea) => {
      collisionArea.radius = Math.max(0, nextCollisionArea.radius);
      if (nextCollisionArea.localOffset) {
        localOffset.copy(nextCollisionArea.localOffset);
      } else {
        localOffset.set(0, 0, 0);
      }
    },
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    isEnabled: () => enabled,
    canReceiveDamage: () => enabled && !config.health.getSnapshot().destroyed,
    getWorldCenter,
    receiveDamage
  };
}
