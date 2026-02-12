import * as THREE from "three";
import type { HitboxComponent } from "./HitboxComponent";
import type { HurtboxComponent, HurtboxHitResult } from "./HurtboxComponent";

export type HitboxCollisionEvent = {
  hurtbox: HurtboxComponent;
  hitResult: HurtboxHitResult;
};

const hitboxCenter = new THREE.Vector3();
const hurtboxCenter = new THREE.Vector3();

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

    const hitResult = hurtbox.receiveDamage(hitbox.getDamagePacket());
    if (!hitResult) {
      continue;
    }

    hitbox.registerHitTarget(hurtbox.id);
    return { hurtbox, hitResult };
  }

  return null;
}
