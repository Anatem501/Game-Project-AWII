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
  onHit?: (event: HurtboxHitEvent) => void;
};

export type HurtboxComponent = {
  readonly id: string;
  readonly owner: THREE.Object3D;
  readonly health: HealthComponent;
  readonly faction: string | null;
  readonly collisionArea: Readonly<CollisionArea>;
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
    if (!enabled || damagePacket.amount <= 0) {
      return null;
    }

    const breakdown = config.health.applyDamage(damagePacket.amount, damagePacket.damageType);
    const snapshot = config.health.getSnapshot();
    const event: HurtboxHitEvent = { breakdown, damagePacket, snapshot, hurtboxId: id };
    config.onHit?.(event);
    return { breakdown, damagePacket, snapshot };
  };

  return {
    id,
    owner: config.owner,
    health: config.health,
    faction,
    collisionArea,
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    isEnabled: () => enabled,
    canReceiveDamage: () => enabled && !config.health.getSnapshot().destroyed,
    getWorldCenter,
    receiveDamage
  };
}
