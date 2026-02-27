import * as THREE from "three";
import type { HitboxComponent } from "./HitboxComponent";
import type { HurtboxComponent, HurtboxHitResult } from "./HurtboxComponent";

export type HitboxCollisionEvent = {
  hurtbox: HurtboxComponent;
  hitResult: HurtboxHitResult;
};

const hitboxCenter = new THREE.Vector3();
const hurtboxCenter = new THREE.Vector3();
const impactDirection = new THREE.Vector3();
const impactPoint = new THREE.Vector3();

export function resolveHitboxAgainstHurtboxes(
  hitbox: HitboxComponent | undefined,
  hurtboxes: readonly HurtboxComponent[]
): HitboxCollisionEvent | null {
  if (!hitbox || !hitbox.canStillDealDamage()) {
    return null;
  }

  const hitboxRadius = hitbox.collisionArea.radius;
  if (hitboxRadius <= 0 || hurtboxes.length === 0) {
    return null;
  }

  hitbox.getWorldCenter(hitboxCenter);

  for (const hurtbox of hurtboxes) {
    if (!hurtbox.canReceiveDamage()) {
      continue;
    }
    if (hurtbox.faction && hitbox.sourceFaction && hurtbox.faction === hitbox.sourceFaction) {
      continue;
    }
    if (hitbox.hasHitTarget(hurtbox.id)) {
      continue;
    }

    const combinedRadius = hitboxRadius + hurtbox.collisionArea.radius;
    if (combinedRadius <= 0) {
      continue;
    }

    hurtbox.getWorldCenter(hurtboxCenter);
    if (hitboxCenter.distanceToSquared(hurtboxCenter) > combinedRadius * combinedRadius) {
      continue;
    }

    impactDirection.subVectors(hitboxCenter, hurtboxCenter);
    if (impactDirection.lengthSq() <= 0.000001) {
      impactPoint.copy(hurtboxCenter);
    } else {
      impactPoint
        .copy(impactDirection)
        .normalize()
        .multiplyScalar(Math.max(0, hurtbox.collisionArea.radius))
        .add(hurtboxCenter);
    }

    const hitResult = hurtbox.receiveDamage(hitbox.getDamagePacket(), impactPoint);
    if (!hitResult) {
      continue;
    }

    hitbox.registerHitTarget(hurtbox.id);
    return { hurtbox, hitResult };
  }

  return null;
}
