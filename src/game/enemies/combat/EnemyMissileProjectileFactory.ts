import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import type { DamageType } from "../../components/combat/DamageTypes";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSpawnParams
} from "../../controllers/projectiles/ProjectileTypes";

const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const MISSILE_BODY_LENGTH = 0.42;
const MISSILE_BODY_RADIUS = 0.075;
const MISSILE_NOSE_LENGTH = 0.2;
const MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS = 0.065;
const MISSILE_MAX_TRAIL_SMOKE_SPAWNS_PER_FRAME = 4;
const MISSILE_MAX_ACTIVE_SMOKE_PARTICLES = 220;
const MISSILE_MAX_ACTIVE_EXPLOSION_FLASHES = 48;
const SMOKE_DRAG_PER_SECOND = 2.6;
const LAUNCH_SMOKE_COUNT = 6;
const EXPLOSION_FLASH_LIFETIME_SECONDS = 0.28;
const EXPLOSION_FLASH_BASE_RADIUS = 0.28;
const SPLINE_MIN_TRAVEL_DURATION_SECONDS = 0.22;
const SPLINE_MAX_TRAVEL_DURATION_SECONDS = 2.8;
const UNLOCKED_RETICLE_OVERSHOOT_DISTANCE = 2;
const ENEMY_MISSILE_OUTLINE_COLOR = 0xff2323;
const ENEMY_MISSILE_OUTLINE_OPACITY = 0.56;
const ENEMY_MISSILE_OUTLINE_SCALE = 1.08;
const ENEMY_MISSILE_OUTER_OUTLINE_OPACITY = 0.22;
const ENEMY_MISSILE_OUTER_OUTLINE_SCALE = 1.18;
const MISSILE_THRUSTER_SOCKET_PREFIX = "thruster";
const MINI_THRUSTER_CORE_COLOR = 0xffd48a;
const MINI_THRUSTER_GLOW_COLOR = 0xff8a2a;
const MINI_THRUSTER_SOCKET_BACK_OFFSET = 0.055;

export type EnemyMissileProjectileFactoryOptions = {
  speed: number;
  lifetimeSeconds: number;
  damage: number;
  damageType?: DamageType;
  collisionRadius?: number;
  faction?: string | null;
  homingTurnRateRadians?: number;
  getTarget?: () => THREE.Object3D | null;
  meshScale?: number;
  bodyColor?: number;
  glowColor?: number;
  modelUrl?: string;
  modelDesiredSize?: number;
  modelYawOffset?: number;
  modelLocalOffset?: THREE.Vector3;
  flightMode?: "homing" | "spline";
  splineWildness?: number;
  reticleScatterRadius?: number;
  fallbackAimDistance?: number;
};

type ActiveSmokeParticle = {
  age: number;
  endScale: number;
  lifetime: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startOpacity: number;
  startScale: number;
  velocity: THREE.Vector3;
};

type ActiveExplosion = {
  age: number;
  maxScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

type SplinePath = {
  controlA: THREE.Vector3;
  controlB: THREE.Vector3;
  destination: THREE.Vector3;
  durationSeconds: number;
  elapsedSeconds: number;
  start: THREE.Vector3;
};

export function createEnemyMissileProjectileFactory(
  options: EnemyMissileProjectileFactoryOptions
): ProjectileFactory {
  const speed = Math.max(0.01, options.speed);
  const lifetimeSeconds = Math.max(0.05, options.lifetimeSeconds);
  const damage = Math.max(0, options.damage);
  const damageType = options.damageType ?? "Concussive";
  const collisionRadius = Math.max(0.05, options.collisionRadius ?? 0.35);
  const sourceFaction = options.faction ?? "enemy";
  const homingTurnRateRadians = Math.max(0, options.homingTurnRateRadians ?? 0);
  const flightMode = options.flightMode === "spline" ? "spline" : "homing";
  const meshScale = Math.max(0.2, options.meshScale ?? 1);
  const bodyColor = options.bodyColor ?? 0xb9d0db;
  const glowColor = options.glowColor ?? 0xff7a5e;

  const missileBodyGeometry = new THREE.CylinderGeometry(
    MISSILE_BODY_RADIUS,
    MISSILE_BODY_RADIUS * 0.84,
    MISSILE_BODY_LENGTH,
    10
  );
  const missileBodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    emissive: 0x1b1f2b,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.62
  });
  const missileNoseGeometry = new THREE.ConeGeometry(MISSILE_BODY_RADIUS * 0.88, MISSILE_NOSE_LENGTH, 10);
  const missileNoseMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d828f,
    roughness: 0.4,
    metalness: 0.68
  });
  const thrusterCoreGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const thrusterGlowGeometry = new THREE.SphereGeometry(0.05, 10, 10);
  const guidanceGlowGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
  const explosionFlashGeometry = new THREE.SphereGeometry(EXPLOSION_FLASH_BASE_RADIUS, 14, 12);

  let projectileModelTemplate: THREE.Object3D | null = null;
  let disposed = false;
  if (options.modelUrl) {
    const loader = new GLTFLoader();
    loader.load(
      options.modelUrl,
      (gltf) => {
        if (disposed) {
          disposeObjectResources(gltf.scene);
          return;
        }
        const model = gltf.scene;
        alignModelLongestAxisToForward(model, PROJECTILE_FORWARD);
        model.rotation.y += options.modelYawOffset ?? 0;
        normalizeModelToSize(model, Math.max(0.05, options.modelDesiredSize ?? 0.55));
        centerModelOnOrigin(model);
        if (options.modelLocalOffset) {
          model.position.add(options.modelLocalOffset);
        }
        projectileModelTemplate = model;
      },
      undefined,
      (error) => {
        console.warn("Enemy missile projectile model failed to load. Using fallback visual.", error);
      }
    );
  }

  const tmpWorld = new THREE.Vector3();
  const smokeDriftVelocity = new THREE.Vector3();
  const smokeTrailDirection = new THREE.Vector3();
  const homingTargetWorld = new THREE.Vector3();
  const scratchSplineDestination = new THREE.Vector3();
  const scratchSplineDirection = new THREE.Vector3();
  const scratchSplinePerpendicular = new THREE.Vector3();
  const scratchSplineControlA = new THREE.Vector3();
  const scratchSplineControlB = new THREE.Vector3();
  const scratchBezierPosition = new THREE.Vector3();
  const scratchBezierDirection = new THREE.Vector3();
  const scratchReticleScatterOffset = new THREE.Vector3();
  const splineTangentQuaternion = new THREE.Quaternion();

  const spawn = ({ direction, origin }: ProjectileSpawnParams): ProjectileInstance => {
    const projectileRoot = new THREE.Group();
    const missile = new THREE.Group();
    projectileRoot.add(missile);

    const bodyVisual = createMissileBodyVisual(
      projectileModelTemplate,
      missileBodyGeometry,
      missileBodyMaterial,
      missileNoseGeometry,
      missileNoseMaterial
    );
    missile.add(bodyVisual);
    const missileOutlineShell = createMissileOutlineShell(bodyVisual);
    if (missileOutlineShell) {
      missile.add(missileOutlineShell.object);
    }
    const miniThrusterSockets = extractSocketOffsetsAndSizeScales(
      missile,
      bodyVisual,
      MISSILE_THRUSTER_SOCKET_PREFIX
    );

    const thrusterCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0a6,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const thrusterGlowMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const guidanceGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8cd7ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const thrusterCore = new THREE.Mesh(thrusterCoreGeometry, thrusterCoreMaterial);
    const thrusterGlow = new THREE.Mesh(thrusterGlowGeometry, thrusterGlowMaterial);
    const guidanceGlow = new THREE.Mesh(guidanceGlowGeometry, guidanceGlowMaterial);
    thrusterCore.position.z = -MISSILE_BODY_LENGTH * 0.58;
    thrusterGlow.position.z = -MISSILE_BODY_LENGTH * 0.62;
    guidanceGlow.position.z = MISSILE_BODY_LENGTH * 0.56;
    missile.add(thrusterCore);
    missile.add(thrusterGlow);
    missile.add(guidanceGlow);
    const miniThrusterCoreMaterial = new THREE.MeshBasicMaterial({
      color: MINI_THRUSTER_CORE_COLOR,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const miniThrusterGlowMaterial = new THREE.MeshBasicMaterial({
      color: MINI_THRUSTER_GLOW_COLOR,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const miniThrusters = miniThrusterSockets.map((socket, index) => {
      const core = new THREE.Mesh(thrusterCoreGeometry, miniThrusterCoreMaterial);
      const glow = new THREE.Mesh(thrusterGlowGeometry, miniThrusterGlowMaterial);
      core.position.copy(socket.offset);
      glow.position.copy(socket.offset);
      core.position.z -= MINI_THRUSTER_SOCKET_BACK_OFFSET;
      glow.position.z -= MINI_THRUSTER_SOCKET_BACK_OFFSET * 1.05;
      core.renderOrder = 4;
      glow.renderOrder = 4;
      const baseScale = Math.max(0.3, socket.sizeScale * 0.55);
      core.scale.setScalar(baseScale);
      glow.scale.setScalar(baseScale * 2.25);
      missile.add(core);
      missile.add(glow);
      return {
        core,
        glow,
        baseScale,
        phaseOffset: index * 0.55 + Math.random() * 0.35
      };
    });

    missile.scale.setScalar(meshScale);
    missile.position.copy(origin);

    const shotQuaternion = new THREE.Quaternion();
    const currentDirection = direction.clone();
    const desiredDirection = new THREE.Vector3();
    if (currentDirection.lengthSq() <= 0.000001) {
      currentDirection.copy(PROJECTILE_FORWARD);
    } else {
      currentDirection.normalize();
    }

    let splinePath: SplinePath | null = null;
    if (flightMode === "spline") {
      const target = options.getTarget?.() ?? null;
      if (target) {
        target.getWorldPosition(scratchSplineDestination);
        scratchSplineDirection.subVectors(scratchSplineDestination, origin).setY(0);
        if (scratchSplineDirection.lengthSq() > 0.000001) {
          scratchSplineDirection.normalize();
          scratchSplineDestination.addScaledVector(
            scratchSplineDirection,
            UNLOCKED_RETICLE_OVERSHOOT_DISTANCE
          );
        } else {
          scratchSplineDestination.addScaledVector(
            currentDirection,
            UNLOCKED_RETICLE_OVERSHOOT_DISTANCE
          );
        }
        const reticleScatterRadius = Math.max(0, options.reticleScatterRadius ?? 2.5);
        if (reticleScatterRadius > 0) {
          randomCircleOffsetXZ(reticleScatterRadius, scratchReticleScatterOffset);
          scratchSplineDestination.add(scratchReticleScatterOffset);
        }
      } else {
        scratchSplineDestination
          .copy(origin)
          .addScaledVector(currentDirection, Math.max(8, options.fallbackAimDistance ?? 40));
      }
      scratchSplineDestination.y = origin.y;

      scratchSplineDirection.subVectors(scratchSplineDestination, origin).setY(0);
      if (scratchSplineDirection.lengthSq() <= 0.000001) {
        scratchSplineDirection.copy(currentDirection);
      } else {
        scratchSplineDirection.normalize();
      }
      scratchSplinePerpendicular.crossVectors(scratchSplineDirection, WORLD_UP);
      if (scratchSplinePerpendicular.lengthSq() <= 0.000001) {
        scratchSplinePerpendicular.set(1, 0, 0);
      } else {
        scratchSplinePerpendicular.normalize();
      }

      const splineWildness = THREE.MathUtils.clamp(options.splineWildness ?? 1.35, 0.5, 2.5);
      const splineDistance = Math.max(1.25, origin.distanceTo(scratchSplineDestination));
      const lateralSign = Math.random() < 0.5 ? -1 : 1;
      const lateralOffset =
        splineDistance * THREE.MathUtils.randFloat(0.14, 0.26) * lateralSign * splineWildness;

      scratchSplineControlA
        .copy(origin)
        .addScaledVector(scratchSplineDirection, splineDistance * THREE.MathUtils.randFloat(0.22, 0.38))
        .addScaledVector(scratchSplinePerpendicular, lateralOffset)
        .addScaledVector(WORLD_UP, THREE.MathUtils.randFloat(-0.11, 0.16) * splineWildness);
      scratchSplineControlB
        .copy(origin)
        .addScaledVector(scratchSplineDirection, splineDistance * THREE.MathUtils.randFloat(0.56, 0.9))
        .addScaledVector(
          scratchSplinePerpendicular,
          -lateralOffset * THREE.MathUtils.randFloat(0.28, 0.9) * splineWildness
        )
        .addScaledVector(WORLD_UP, THREE.MathUtils.randFloat(-0.11, 0.16) * splineWildness);

      const approxLength =
        origin.distanceTo(scratchSplineControlA) +
        scratchSplineControlA.distanceTo(scratchSplineControlB) +
        scratchSplineControlB.distanceTo(scratchSplineDestination);
      const splineDuration = THREE.MathUtils.clamp(
        approxLength / Math.max(0.001, speed),
        SPLINE_MIN_TRAVEL_DURATION_SECONDS,
        SPLINE_MAX_TRAVEL_DURATION_SECONDS
      );
      splinePath = {
        controlA: scratchSplineControlA.clone(),
        controlB: scratchSplineControlB.clone(),
        destination: scratchSplineDestination.clone(),
        durationSeconds: splineDuration,
        elapsedSeconds: 0,
        start: origin.clone()
      };

      scratchBezierDirection.subVectors(splinePath.controlA, splinePath.start).setY(0);
      if (scratchBezierDirection.lengthSq() <= 0.000001) {
        scratchBezierDirection.copy(currentDirection);
      } else {
        scratchBezierDirection.normalize();
      }
      currentDirection.copy(scratchBezierDirection);
    }
    shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, currentDirection);
    missile.quaternion.copy(shotQuaternion);

    const hitbox = createHitboxComponent({
      owner: missile,
      collisionArea: { radius: collisionRadius * meshScale },
      damageAmount: damage,
      damageType,
      sourceFaction
    });

    const activeSmokeParticles: ActiveSmokeParticle[] = [];
    const activeExplosions: ActiveExplosion[] = [];

    let lifeRemaining = lifetimeSeconds;
    let trailSpawnSeconds = 0;
    let ageSeconds = 0;
    let exploding = false;

    const spawnExplosionFlash = (position: THREE.Vector3): void => {
      while (activeExplosions.length >= MISSILE_MAX_ACTIVE_EXPLOSION_FLASHES) {
        const oldest = activeExplosions.shift();
        oldest?.mesh.removeFromParent();
        oldest?.mesh.material.dispose();
      }
      const flash = new THREE.Mesh(
        explosionFlashGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xff9248,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      );
      flash.position.copy(position);
      projectileRoot.add(flash);
      activeExplosions.push({
        age: 0,
        maxScale: Math.max(0.5, collisionRadius * meshScale * 4.5),
        mesh: flash
      });
    };

    const spawnSmokeParticle = (params: {
      originWorld: THREE.Vector3;
      velocity: THREE.Vector3;
      lifetime: number;
      startScale: number;
      endScale: number;
      startOpacity: number;
    }): void => {
      while (activeSmokeParticles.length >= MISSILE_MAX_ACTIVE_SMOKE_PARTICLES) {
        const oldest = activeSmokeParticles.shift();
        oldest?.mesh.removeFromParent();
        oldest?.mesh.material.dispose();
      }
      const smokeMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: params.startOpacity,
        depthWrite: false,
        toneMapped: false
      });
      const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
      smoke.position.copy(projectileRoot.worldToLocal(params.originWorld.clone()));
      smoke.scale.setScalar(params.startScale);
      projectileRoot.add(smoke);
      activeSmokeParticles.push({
        age: 0,
        endScale: params.endScale,
        lifetime: Math.max(0.05, params.lifetime),
        mesh: smoke,
        startOpacity: params.startOpacity,
        startScale: params.startScale,
        velocity: params.velocity.clone()
      });
    };

    const spawnLaunchSmoke = (): void => {
      thrusterGlow.getWorldPosition(tmpWorld);
      for (let i = 0; i < LAUNCH_SMOKE_COUNT; i += 1) {
        smokeDriftVelocity
          .copy(currentDirection)
          .multiplyScalar(-0.9 - Math.random() * 0.9)
          .addScaledVector(WORLD_UP, 0.22 + Math.random() * 0.48)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.55, 0, (Math.random() - 0.5) * 0.55));
        spawnSmokeParticle({
          originWorld: tmpWorld,
          velocity: smokeDriftVelocity,
          lifetime: THREE.MathUtils.randFloat(0.4, 0.72),
          startScale: THREE.MathUtils.randFloat(0.05, 0.085),
          endScale: THREE.MathUtils.randFloat(0.24, 0.4),
          startOpacity: THREE.MathUtils.randFloat(0.34, 0.46)
        });
      }
    };

    const spawnTrailSmoke = (): void => {
      thrusterGlow.getWorldPosition(tmpWorld);
      smokeTrailDirection.copy(currentDirection);
      if (smokeTrailDirection.lengthSq() <= 0.000001) {
        smokeTrailDirection.copy(PROJECTILE_FORWARD);
      } else {
        smokeTrailDirection.normalize();
      }
      smokeDriftVelocity
        .copy(smokeTrailDirection)
        .multiplyScalar(-0.45 - Math.random() * 0.45)
        .addScaledVector(WORLD_UP, 0.12 + Math.random() * 0.22)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.24, 0, (Math.random() - 0.5) * 0.24));
      spawnSmokeParticle({
        originWorld: tmpWorld,
        velocity: smokeDriftVelocity,
        lifetime: THREE.MathUtils.randFloat(0.34, 0.58),
        startScale: THREE.MathUtils.randFloat(0.032, 0.048),
        endScale: THREE.MathUtils.randFloat(0.12, 0.19),
        startOpacity: THREE.MathUtils.randFloat(0.18, 0.28)
      });
    };

    const updateExplosions = (deltaTime: number): void => {
      for (let i = activeExplosions.length - 1; i >= 0; i -= 1) {
        const explosion = activeExplosions[i];
        explosion.age += deltaTime;
        const t = THREE.MathUtils.clamp(explosion.age / EXPLOSION_FLASH_LIFETIME_SECONDS, 0, 1);
        const scale = THREE.MathUtils.lerp(0.25, explosion.maxScale, t);
        explosion.mesh.scale.setScalar(scale);
        explosion.mesh.material.opacity = THREE.MathUtils.lerp(0.72, 0, t);
        if (t < 1) {
          continue;
        }
        explosion.mesh.removeFromParent();
        explosion.mesh.material.dispose();
        activeExplosions.splice(i, 1);
      }
    };

    const updateSmokeParticles = (deltaTime: number): void => {
      for (let i = activeSmokeParticles.length - 1; i >= 0; i -= 1) {
        const smoke = activeSmokeParticles[i];
        smoke.age += deltaTime;
        const t = THREE.MathUtils.clamp(smoke.age / smoke.lifetime, 0, 1);
        smoke.mesh.position.addScaledVector(smoke.velocity, deltaTime);
        smoke.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * SMOKE_DRAG_PER_SECOND));
        smoke.mesh.scale.setScalar(THREE.MathUtils.lerp(smoke.startScale, smoke.endScale, t));
        smoke.mesh.material.opacity = THREE.MathUtils.lerp(smoke.startOpacity, 0, t);
        if (t < 1) {
          continue;
        }
        smoke.mesh.removeFromParent();
        smoke.mesh.material.dispose();
        activeSmokeParticles.splice(i, 1);
      }
    };

    const triggerExplosion = (): void => {
      if (exploding) {
        return;
      }
      exploding = true;
      hitbox.setEnabled(false);
      missile.visible = false;
      spawnExplosionFlash(missile.position);
    };

    spawnLaunchSmoke();

    return {
      object: projectileRoot,
      hitbox,
      beginDestroy: () => {
        if (!exploding) {
          triggerExplosion();
          return true;
        }
        return activeExplosions.length > 0 || activeSmokeParticles.length > 0;
      },
      update: (deltaTime: number): boolean => {
        if (deltaTime <= 0) {
          return true;
        }

        ageSeconds += deltaTime;
        updateSmokeParticles(deltaTime);
        updateExplosions(deltaTime);

        if (!exploding) {
          lifeRemaining -= deltaTime;

          if (splinePath) {
            splinePath.elapsedSeconds = Math.min(splinePath.durationSeconds, splinePath.elapsedSeconds + deltaTime);
            const t = THREE.MathUtils.clamp(
              splinePath.durationSeconds > 0 ? splinePath.elapsedSeconds / splinePath.durationSeconds : 1,
              0,
              1
            );
            evaluateCubicBezier(
              splinePath.start,
              splinePath.controlA,
              splinePath.controlB,
              splinePath.destination,
              t,
              scratchBezierPosition
            );
            evaluateCubicBezierTangent(
              splinePath.start,
              splinePath.controlA,
              splinePath.controlB,
              splinePath.destination,
              t,
              scratchBezierDirection
            );
            if (scratchBezierDirection.lengthSq() <= 0.000001) {
              scratchBezierDirection.copy(currentDirection);
            } else {
              scratchBezierDirection.normalize();
            }
            currentDirection.copy(scratchBezierDirection);
            splineTangentQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, scratchBezierDirection);
            missile.quaternion.slerp(
              splineTangentQuaternion,
              THREE.MathUtils.clamp(deltaTime * 14, 0, 1)
            );
            missile.position.copy(scratchBezierPosition);
          } else {
            const target = options.getTarget?.() ?? null;
            if (target && homingTurnRateRadians > 0) {
              target.getWorldPosition(homingTargetWorld);
              desiredDirection.subVectors(homingTargetWorld, missile.position).setY(0);
              if (desiredDirection.lengthSq() > 0.000001) {
                desiredDirection.normalize();
                const maxTurnStep = homingTurnRateRadians * deltaTime;
                const angle = currentDirection.angleTo(desiredDirection);
                if (angle > 0.0001) {
                  const t = THREE.MathUtils.clamp(maxTurnStep / angle, 0, 1);
                  currentDirection.lerp(desiredDirection, t).normalize();
                } else {
                  currentDirection.copy(desiredDirection);
                }
                shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, currentDirection);
                missile.quaternion.copy(shotQuaternion);
              }
            }

            missile.position.addScaledVector(currentDirection, speed * deltaTime);
          }

          const flamePulse = 0.9 + Math.sin(ageSeconds * 28) * 0.1;
          thrusterCore.scale.setScalar(flamePulse);
          thrusterGlow.scale.setScalar(0.95 + flamePulse * 0.35);
          thrusterGlow.material.opacity = THREE.MathUtils.clamp(0.14 + flamePulse * 0.16, 0, 1);
          if (miniThrusters.length > 0) {
            for (const mini of miniThrusters) {
              const miniPulse = 0.82 + Math.sin(ageSeconds * 26 + mini.phaseOffset) * 0.18;
              mini.core.scale.setScalar(mini.baseScale * (0.85 + miniPulse * 0.35));
              mini.glow.scale.setScalar(mini.baseScale * (1.45 + miniPulse * 0.9));
            }
            miniThrusterCoreMaterial.opacity = THREE.MathUtils.clamp(0.5 + flamePulse * 0.22, 0, 1);
            miniThrusterGlowMaterial.opacity = THREE.MathUtils.clamp(0.18 + flamePulse * 0.18, 0, 1);
          }
          if (missileOutlineShell) {
            missileOutlineShell.setIntensity(0.88 + flamePulse * 0.22);
          }
          missile.rotateZ(deltaTime * 5.4);
          const nosePulse = 0.72 + Math.sin(ageSeconds * 18) * 0.22;
          guidanceGlow.scale.setScalar(0.85 + nosePulse * 0.45);
          guidanceGlow.material.opacity = THREE.MathUtils.clamp(0.5 + nosePulse * 0.38, 0, 1);

          trailSpawnSeconds += deltaTime;
          let trailSpawnsThisFrame = 0;
          while (trailSpawnSeconds >= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS) {
            if (trailSpawnsThisFrame >= MISSILE_MAX_TRAIL_SMOKE_SPAWNS_PER_FRAME) {
              trailSpawnSeconds %= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS;
              break;
            }
            trailSpawnSeconds -= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS;
            spawnTrailSmoke();
            trailSpawnsThisFrame += 1;
          }

          if (splinePath && splinePath.elapsedSeconds >= splinePath.durationSeconds) {
            triggerExplosion();
          } else if (lifeRemaining <= 0) {
            triggerExplosion();
          }
        }

        return !exploding || activeExplosions.length > 0 || activeSmokeParticles.length > 0;
      },
      dispose: () => {
        for (const smoke of activeSmokeParticles) {
          smoke.mesh.removeFromParent();
          smoke.mesh.material.dispose();
        }
        activeSmokeParticles.length = 0;
        for (const explosion of activeExplosions) {
          explosion.mesh.removeFromParent();
          explosion.mesh.material.dispose();
        }
        activeExplosions.length = 0;
        thrusterCoreMaterial.dispose();
        thrusterGlowMaterial.dispose();
        guidanceGlowMaterial.dispose();
        miniThrusterCoreMaterial.dispose();
        miniThrusterGlowMaterial.dispose();
        missileOutlineShell?.dispose();
        projectileRoot.clear();
      }
    };
  };

  return {
    spawn,
    dispose: () => {
      disposed = true;
      missileBodyGeometry.dispose();
      missileBodyMaterial.dispose();
      missileNoseGeometry.dispose();
      missileNoseMaterial.dispose();
      thrusterCoreGeometry.dispose();
      thrusterGlowGeometry.dispose();
      guidanceGlowGeometry.dispose();
      smokeGeometry.dispose();
      explosionFlashGeometry.dispose();
      if (projectileModelTemplate) {
        disposeObjectResources(projectileModelTemplate);
        projectileModelTemplate = null;
      }
    }
  };
}

function createMissileOutlineShell(
  sourceVisual: THREE.Object3D
): { object: THREE.Object3D; dispose: () => void; setIntensity: (intensity: number) => void } | null {
  const shellContainer = new THREE.Group();
  const shellMaterials: Array<{ material: THREE.MeshBasicMaterial; baseOpacity: number }> = [];

  const createShellLayer = (scale: number, baseOpacity: number): boolean => {
    const shellRoot = sourceVisual.clone(true);
    let layerHasMesh = false;
    shellRoot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      layerHasMesh = true;
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: ENEMY_MISSILE_OUTLINE_COLOR,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false
      });
      shellMaterials.push({ material: outlineMaterial, baseOpacity });
      node.material = outlineMaterial;
      node.renderOrder = Math.max(node.renderOrder, 2);
    });
    if (!layerHasMesh) {
      return false;
    }
    shellRoot.scale.multiplyScalar(scale);
    shellContainer.add(shellRoot);
    return true;
  };

  const hasInnerShell = createShellLayer(ENEMY_MISSILE_OUTLINE_SCALE, ENEMY_MISSILE_OUTLINE_OPACITY);
  const hasOuterShell = createShellLayer(
    ENEMY_MISSILE_OUTER_OUTLINE_SCALE,
    ENEMY_MISSILE_OUTER_OUTLINE_OPACITY
  );

  if (!hasInnerShell && !hasOuterShell) {
    for (const entry of shellMaterials) {
      entry.material.dispose();
    }
    return null;
  }

  return {
    object: shellContainer,
    setIntensity: (intensity: number): void => {
      const clamped = THREE.MathUtils.clamp(intensity, 0, 2);
      for (const entry of shellMaterials) {
        entry.material.opacity = THREE.MathUtils.clamp(
          entry.baseOpacity * clamped,
          0,
          0.9
        );
      }
    },
    dispose: (): void => {
      for (const entry of shellMaterials) {
        entry.material.dispose();
      }
    }
  };
}

function createMissileBodyVisual(
  modelTemplate: THREE.Object3D | null,
  missileBodyGeometry: THREE.CylinderGeometry,
  missileBodyMaterial: THREE.MeshStandardMaterial,
  missileNoseGeometry: THREE.ConeGeometry,
  missileNoseMaterial: THREE.MeshStandardMaterial
): THREE.Object3D {
  if (modelTemplate) {
    return modelTemplate.clone(true);
  }

  const fallbackVisual = new THREE.Group();
  const body = new THREE.Mesh(missileBodyGeometry, missileBodyMaterial);
  body.rotation.x = Math.PI * 0.5;
  fallbackVisual.add(body);

  const nose = new THREE.Mesh(missileNoseGeometry, missileNoseMaterial);
  nose.rotation.x = Math.PI * 0.5;
  nose.position.z = MISSILE_BODY_LENGTH * 0.5 + MISSILE_NOSE_LENGTH * 0.5 - 0.02;
  fallbackVisual.add(nose);
  return fallbackVisual;
}

function evaluateCubicBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const oneMinusT = 1 - clampedT;
  const oneMinusTSq = oneMinusT * oneMinusT;
  const tSq = clampedT * clampedT;
  const a = oneMinusTSq * oneMinusT;
  const b = 3 * oneMinusTSq * clampedT;
  const c = 3 * oneMinusT * tSq;
  const d = tSq * clampedT;
  return out
    .copy(p0)
    .multiplyScalar(a)
    .addScaledVector(p1, b)
    .addScaledVector(p2, c)
    .addScaledVector(p3, d);
}

function evaluateCubicBezierTangent(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const oneMinusT = 1 - clampedT;
  const a = 3 * oneMinusT * oneMinusT;
  const b = 6 * oneMinusT * clampedT;
  const c = 3 * clampedT * clampedT;
  return out.set(
    a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
    a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z)
  );
}

function randomCircleOffsetXZ(radius: number, out: THREE.Vector3): THREE.Vector3 {
  const clampedRadius = Math.max(0, radius);
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * clampedRadius;
  out.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
  return out;
}

function extractSocketOffsetsAndSizeScales(
  ownerRoot: THREE.Object3D,
  modelRoot: THREE.Object3D,
  socketPrefix: string
): Array<{ offset: THREE.Vector3; sizeScale: number }> {
  const normalizedPrefix = socketPrefix.trim().toLowerCase();
  if (!normalizedPrefix) {
    return [];
  }

  const results: Array<{ index: number; offset: THREE.Vector3; sizeScale: number }> = [];
  const worldPosition = new THREE.Vector3();
  ownerRoot.updateWorldMatrix(true, true);

  modelRoot.traverse((node) => {
    const nodeName = node.name?.trim().toLowerCase();
    if (!nodeName || !nodeName.startsWith(normalizedPrefix)) {
      return;
    }
    const suffix = nodeName.slice(normalizedPrefix.length);
    const parsedIndex = suffix ? Number.parseInt(suffix, 10) : Number.NaN;
    const sortIndex = Number.isFinite(parsedIndex) ? parsedIndex : Number.MAX_SAFE_INTEGER;
    node.getWorldPosition(worldPosition);
    const offset = ownerRoot.worldToLocal(worldPosition.clone());
    const sizeScale = Math.max(0.25, Math.max(node.scale.x, node.scale.y, node.scale.z, 1));
    results.push({ index: sortIndex, offset, sizeScale });
  });

  results.sort((a, b) => a.index - b.index);
  return results.map(({ offset, sizeScale }) => ({ offset, sizeScale }));
}

function alignModelLongestAxisToForward(
  modelRoot: THREE.Object3D,
  targetForwardAxis: THREE.Vector3
): void {
  const box = new THREE.Box3().setFromObject(modelRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  let longestAxisIndex = 0;
  if (size.y > size.x && size.y >= size.z) {
    longestAxisIndex = 1;
  } else if (size.z > size.x && size.z > size.y) {
    longestAxisIndex = 2;
  }

  const positiveExtent =
    longestAxisIndex === 0
      ? box.max.x - center.x
      : longestAxisIndex === 1
        ? box.max.y - center.y
        : box.max.z - center.z;
  const negativeExtent =
    longestAxisIndex === 0
      ? center.x - box.min.x
      : longestAxisIndex === 1
        ? center.y - box.min.y
        : center.z - box.min.z;
  const forwardSign = positiveExtent >= negativeExtent ? 1 : -1;

  const modelForward = new THREE.Vector3(0, 0, 0);
  if (longestAxisIndex === 0) {
    modelForward.x = forwardSign;
  } else if (longestAxisIndex === 1) {
    modelForward.y = forwardSign;
  } else {
    modelForward.z = forwardSign;
  }

  const targetForward = targetForwardAxis.clone();
  if (targetForward.lengthSq() <= 0.000001 || modelForward.lengthSq() <= 0.000001) {
    return;
  }
  targetForward.normalize();
  modelForward.normalize();
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(modelForward, targetForward);
  modelRoot.applyQuaternion(alignQuaternion);
}

function normalizeModelToSize(modelRoot: THREE.Object3D, desiredSize: number): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension <= 0) {
    return;
  }
  modelRoot.scale.setScalar(desiredSize / maxDimension);
}

function centerModelOnOrigin(modelRoot: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new THREE.Vector3());
  modelRoot.position.sub(center);
}

function disposeObjectResources(object: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    if (!disposedGeometries.has(node.geometry)) {
      node.geometry.dispose();
      disposedGeometries.add(node.geometry);
    }
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        if (disposedMaterials.has(material)) {
          continue;
        }
        material.dispose();
        disposedMaterials.add(material);
      }
      return;
    }
    if (!disposedMaterials.has(node.material)) {
      node.material.dispose();
      disposedMaterials.add(node.material);
    }
  });
}
