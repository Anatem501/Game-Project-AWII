import * as THREE from "three";
import { resolveHitboxAgainstHurtboxes } from "../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createLaserHitSparkExplosionSystem } from "../effects/LaserHitSparkExplosionSystem";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import type { PlayerControllerState } from "./PlayerController";
import type { ProjectileFactory, ProjectileInstance } from "./projectiles/ProjectileTypes";

const DEFAULT_GUN_FIRE_INTERVAL_SECONDS = 0.5;
const MIN_AIM_DISTANCE_FROM_SHIP = 1;
const FULL_AIM_ARC_RADIANS = Math.PI;
const TURN_RATE_EPSILON_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(3);
const GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX = 5;

export type GunDefinition = {
  fireIntervalSeconds?: number;
  hardpoint: THREE.Object3D;
  projectileFactory: ProjectileFactory;
};

type GunControllerParams = {
  aimReticle: THREE.Object3D;
  canvas: HTMLCanvasElement;
  guns: readonly GunDefinition[];
  playerRoot: THREE.Group;
  scene: THREE.Scene;
  minAimDistanceFromShip?: number;
  maxAimAngleRadians?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
};

export type GunController = {
  update: (deltaTime: number, playerState: PlayerControllerState) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export function createGunController({
  aimReticle,
  canvas,
  guns,
  playerRoot,
  scene,
  minAimDistanceFromShip = MIN_AIM_DISTANCE_FROM_SHIP,
  maxAimAngleRadians = FULL_AIM_ARC_RADIANS,
  targetHurtboxes = []
}: GunControllerParams): GunController {
  const muzzleWorld = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const fallbackForward = new THREE.Vector3();
  const clampedForward = new THREE.Vector3();
  const crossForwardAim = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const shipToAim = new THREE.Vector3();
  const projectiles: ProjectileInstance[] = [];
  const sparkBursts = createShipGunSparkBurstSystem(scene);
  const hitSparkExplosions = createLaserHitSparkExplosionSystem(scene);
  const projectilesRoot = new THREE.Group();
  const gunCooldowns = guns.map(() => 0);
  const gunFireIntervals = guns.map((gun) =>
    Math.max(0.001, gun.fireIntervalSeconds ?? DEFAULT_GUN_FIRE_INTERVAL_SECONDS)
  );
  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);
  scene.add(projectilesRoot);

  let fireHeld = false;
  let enabled = true;
  let hasLastYaw = false;
  let lastYaw = 0;
  let turnDirection = 0;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    fireHeld = true;
    gunCooldowns.fill(0);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    fireHeld = false;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  const spawnShot = (gun: GunDefinition, playerState: PlayerControllerState): void => {
    fallbackForward.copy(playerState.forward).normalize();
    shipToAim.subVectors(aimReticle.position, playerRoot.position);
    const useForwardOnly = shipToAim.lengthSq() < minAimDistanceFromShip * minAimDistanceFromShip;

    gun.hardpoint.getWorldPosition(muzzleWorld);

    if (useForwardOnly) {
      aimDirection.copy(fallbackForward);
    } else {
      aimDirection.subVectors(aimReticle.position, muzzleWorld);
      if (aimDirection.lengthSq() < 0.000001) {
        aimDirection.copy(fallbackForward);
      } else {
        aimDirection.setY(0);
        aimDirection.normalize();
        const dot = THREE.MathUtils.clamp(aimDirection.dot(fallbackForward), -1, 1);
        const signedAngle = Math.atan2(
          crossForwardAim.copy(fallbackForward).cross(aimDirection).dot(up),
          dot
        );
        const minAllowedAngle = turnDirection < 0 ? -maxAimClampRadians : 0;
        const maxAllowedAngle = turnDirection > 0 ? maxAimClampRadians : 0;
        const clampedAngle = turnDirection === 0
          ? THREE.MathUtils.clamp(signedAngle, -maxAimClampRadians, maxAimClampRadians)
          : THREE.MathUtils.clamp(signedAngle, minAllowedAngle, maxAllowedAngle);

        if (clampedAngle !== signedAngle) {
          clampedForward.copy(fallbackForward).applyAxisAngle(up, clampedAngle).normalize();
          aimDirection.copy(clampedForward);
        }
      }
    }

    const projectile = gun.projectileFactory.spawn({
      direction: aimDirection,
      origin: muzzleWorld
    });

    if (projectile.object.parent) {
      projectile.object.parent.remove(projectile.object);
    }

    projectilesRoot.add(projectile.object);
    projectiles.push(projectile);
    sparkBursts.spawnBurst(muzzleWorld, aimDirection);
  };

  const update = (deltaTime: number, playerState: PlayerControllerState): void => {
    if (deltaTime <= 0) {
      return;
    }

    if (hasLastYaw) {
      const yawDelta = shortestAngleDelta(lastYaw, playerState.yaw);
      const yawRate = yawDelta / deltaTime;
      if (Math.abs(yawRate) <= TURN_RATE_EPSILON_RADIANS_PER_SECOND) {
        turnDirection = 0;
      } else {
        turnDirection = Math.sign(yawRate);
      }
    } else {
      turnDirection = 0;
      hasLastYaw = true;
    }
    lastYaw = playerState.yaw;

    const gamepadPrimaryFireHeld = isGamepadPrimaryFireHeld();
    if (enabled && (fireHeld || gamepadPrimaryFireHeld)) {
      for (let i = 0; i < guns.length; i += 1) {
        gunCooldowns[i] -= deltaTime;
        while (gunCooldowns[i] <= 0) {
          spawnShot(guns[i], playerState);
          gunCooldowns[i] += gunFireIntervals[i];
        }
      }
    } else {
      gunCooldowns.fill(0);
    }

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = projectiles[i];
      const collision = resolveHitboxAgainstHurtboxes(projectile.hitbox, targetHurtboxes);
      if (collision) {
        projectile.object.getWorldDirection(fallbackForward);
        hitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
        projectilesRoot.remove(projectile.object);
        projectile.dispose?.();
        projectiles.splice(i, 1);
        continue;
      }

      if (projectile.update(deltaTime)) {
        continue;
      }

      projectilesRoot.remove(projectile.object);
      projectile.dispose?.();
      projectiles.splice(i, 1);
    }

    sparkBursts.update(deltaTime);
    hitSparkExplosions.update(deltaTime);
  };

  const dispose = (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);

    for (const projectile of projectiles) {
      projectile.dispose?.();
    }
    sparkBursts.dispose();
    hitSparkExplosions.dispose();
    projectilesRoot.clear();
    scene.remove(projectilesRoot);

    const uniqueFactories = new Set<ProjectileFactory>(guns.map((gun) => gun.projectileFactory));
    for (const factory of uniqueFactories) {
      factory.dispose?.();
    }
  };

  return {
    update,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) {
        fireHeld = false;
        gunCooldowns.fill(0);
      }
    },
    dispose
  };
}

function isGamepadPrimaryFireHeld(): boolean {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) {
    return false;
  }

  for (const gamepad of gamepads) {
    if (!gamepad?.connected) {
      continue;
    }

    if (gamepad.buttons[GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX]?.pressed) {
      return true;
    }
  }

  return false;
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
