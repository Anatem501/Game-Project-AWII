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
const GAMEPAD_SECONDARY_FIRE_BUTTON_INDEX = 4;
const PLAYER_CANNON_MUZZLE_SPARK_COUNT = 18;
const PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS = 0.11;
const PLAYER_CANNON_MUZZLE_SPEED_MIN = 1.5;
const PLAYER_CANNON_MUZZLE_SPEED_MAX = 5.1;
const PLAYER_CANNON_MUZZLE_SPREAD_RADIANS = THREE.MathUtils.degToRad(9);

type GunFireModeDefinition = {
  fireIntervalSeconds?: number;
  projectileFactory: ProjectileFactory;
};

export type GunDefinition = {
  hardpoint: THREE.Object3D;
  fireIntervalSeconds?: number;
  projectileFactory?: ProjectileFactory;
  primary?: GunFireModeDefinition;
  secondary?: GunFireModeDefinition;
};

type NormalizedGunDefinition = {
  hardpoint: THREE.Object3D;
  primary: Required<GunFireModeDefinition>;
  secondary?: Required<GunFireModeDefinition>;
};

type GunControllerParams = {
  aimReticle: THREE.Object3D;
  canvas: HTMLCanvasElement;
  guns: readonly GunDefinition[];
  playerRoot: THREE.Group;
  scene: THREE.Scene;
  enablePointerSecondaryFire?: boolean;
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
  enablePointerSecondaryFire = true,
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
  const sparkBursts = createShipGunSparkBurstSystem(scene, {
    sparkCountPerBurst: PLAYER_CANNON_MUZZLE_SPARK_COUNT,
    burstLifetimeSeconds: PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS,
    speedMin: PLAYER_CANNON_MUZZLE_SPEED_MIN,
    speedMax: PLAYER_CANNON_MUZZLE_SPEED_MAX,
    spreadRadians: PLAYER_CANNON_MUZZLE_SPREAD_RADIANS
  });
  const hitSparkExplosions = createLaserHitSparkExplosionSystem(scene);
  const projectilesRoot = new THREE.Group();
  const normalizedGuns = normalizeGunDefinitions(guns);
  const primaryCooldowns = normalizedGuns.map(() => 0);
  const secondaryCooldowns = normalizedGuns.map(() => 0);
  const primaryFireIntervals = normalizedGuns.map((gun) =>
    Math.max(0.001, gun.primary.fireIntervalSeconds)
  );
  const secondaryFireIntervals = normalizedGuns.map((gun) =>
    gun.secondary ? Math.max(0.001, gun.secondary.fireIntervalSeconds) : Number.POSITIVE_INFINITY
  );
  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);
  scene.add(projectilesRoot);

  let primaryFireHeld = false;
  let secondaryFireHeld = false;
  let enabled = true;
  let hasLastYaw = false;
  let lastYaw = 0;
  let turnDirection = 0;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) {
      primaryFireHeld = true;
      primaryCooldowns.fill(0);
      event.preventDefault();
      return;
    }

    if (enablePointerSecondaryFire && event.button === 2) {
      secondaryFireHeld = true;
      secondaryCooldowns.fill(0);
      event.preventDefault();
      return;
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) {
      primaryFireHeld = false;
      event.preventDefault();
      return;
    }

    if (enablePointerSecondaryFire && event.button === 2) {
      secondaryFireHeld = false;
      event.preventDefault();
      return;
    }
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", onContextMenu);

  const spawnShot = (
    gun: NormalizedGunDefinition,
    projectileFactory: ProjectileFactory,
    playerState: PlayerControllerState
  ): void => {
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

    const projectile = projectileFactory.spawn({
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

    const gamepadPrimaryFireHeld = isGamepadFireButtonHeld(GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX);
    const gamepadSecondaryFireHeld = isGamepadFireButtonHeld(GAMEPAD_SECONDARY_FIRE_BUTTON_INDEX);

    if (enabled && (primaryFireHeld || gamepadPrimaryFireHeld)) {
      for (let i = 0; i < normalizedGuns.length; i += 1) {
        const gun = normalizedGuns[i];
        primaryCooldowns[i] -= deltaTime;
        while (primaryCooldowns[i] <= 0) {
          spawnShot(gun, gun.primary.projectileFactory, playerState);
          primaryCooldowns[i] += primaryFireIntervals[i];
        }
      }
    } else {
      primaryCooldowns.fill(0);
    }

    if (enabled && (secondaryFireHeld || gamepadSecondaryFireHeld)) {
      for (let i = 0; i < normalizedGuns.length; i += 1) {
        const gun = normalizedGuns[i];
        if (!gun.secondary) {
          continue;
        }

        secondaryCooldowns[i] -= deltaTime;
        while (secondaryCooldowns[i] <= 0) {
          spawnShot(gun, gun.secondary.projectileFactory, playerState);
          secondaryCooldowns[i] += secondaryFireIntervals[i];
        }
      }
    } else {
      secondaryCooldowns.fill(0);
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
    canvas.removeEventListener("contextmenu", onContextMenu);

    for (const projectile of projectiles) {
      projectile.dispose?.();
    }
    sparkBursts.dispose();
    hitSparkExplosions.dispose();
    projectilesRoot.clear();
    scene.remove(projectilesRoot);

    const uniqueFactories = new Set<ProjectileFactory>();
    for (const gun of normalizedGuns) {
      uniqueFactories.add(gun.primary.projectileFactory);
      if (gun.secondary) {
        uniqueFactories.add(gun.secondary.projectileFactory);
      }
    }
    for (const factory of uniqueFactories) {
      factory.dispose?.();
    }
  };

  return {
    update,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) {
        primaryFireHeld = false;
        secondaryFireHeld = false;
        primaryCooldowns.fill(0);
        secondaryCooldowns.fill(0);
      }
    },
    dispose
  };
}

function isGamepadFireButtonHeld(buttonIndex: number): boolean {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) {
    return false;
  }

  for (const gamepad of gamepads) {
    if (!gamepad?.connected) {
      continue;
    }

    if (gamepad.buttons[buttonIndex]?.pressed) {
      return true;
    }
  }

  return false;
}

function normalizeGunDefinitions(guns: readonly GunDefinition[]): NormalizedGunDefinition[] {
  return guns
    .map((gun) => {
      const primaryProfile =
        gun.primary ??
        (gun.projectileFactory
          ? {
              fireIntervalSeconds: gun.fireIntervalSeconds,
              projectileFactory: gun.projectileFactory
            }
          : undefined);
      if (!primaryProfile) {
        return null;
      }

      return {
        hardpoint: gun.hardpoint,
        primary: {
          fireIntervalSeconds:
            primaryProfile.fireIntervalSeconds ?? DEFAULT_GUN_FIRE_INTERVAL_SECONDS,
          projectileFactory: primaryProfile.projectileFactory
        },
        secondary: gun.secondary
          ? {
              fireIntervalSeconds:
                gun.secondary.fireIntervalSeconds ?? DEFAULT_GUN_FIRE_INTERVAL_SECONDS,
              projectileFactory: gun.secondary.projectileFactory
            }
          : undefined
      };
    })
    .filter((gun): gun is NormalizedGunDefinition => gun !== null);
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
