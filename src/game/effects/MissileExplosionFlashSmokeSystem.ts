import * as THREE from "three";

type ActiveExplosionFlash = {
  age: number;
  maxScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
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

export type MissileExplosionFlashSmokeSystem = {
  spawnBurst: (origin: THREE.Vector3, blastRadius?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type MissileExplosionFlashSmokeSystemConfig = {
  opacityScale?: number;
  flashColor?: number;
  smokeColor?: number;
  smokeCountMin?: number;
  smokeCountMax?: number;
  smokeSpeedMultiplier?: number;
  smokeVerticalBiasMin?: number;
  smokeVerticalBiasMax?: number;
  smokeDragPerSecond?: number;
};

const FLASH_LIFETIME_SECONDS = 0.28;
const FLASH_BASE_RADIUS = 0.28;
const MAX_ACTIVE_FLASHES = 96;
const MAX_ACTIVE_SMOKE_PARTICLES = 320;
const SMOKE_DRAG_PER_SECOND = 2.6;

export function createMissileExplosionFlashSmokeSystem(
  scene: THREE.Scene,
  config: MissileExplosionFlashSmokeSystemConfig = {}
): MissileExplosionFlashSmokeSystem {
  const root = new THREE.Group();
  scene.add(root);

  const opacityScale = THREE.MathUtils.clamp(config.opacityScale ?? 1, 0, 1);
  const flashColor = config.flashColor ?? 0xff9248;
  const smokeColor = config.smokeColor ?? 0xffffff;
  const smokeCountMin = Math.max(1, Math.floor(config.smokeCountMin ?? 8));
  const smokeCountMax = Math.max(smokeCountMin, Math.floor(config.smokeCountMax ?? 16));
  const smokeSpeedMultiplier = Math.max(0, config.smokeSpeedMultiplier ?? 1);
  const smokeVerticalBiasMin = config.smokeVerticalBiasMin ?? 0.08;
  const smokeVerticalBiasMax = Math.max(smokeVerticalBiasMin, config.smokeVerticalBiasMax ?? 0.35);
  const smokeDragPerSecond = Math.max(0, config.smokeDragPerSecond ?? SMOKE_DRAG_PER_SECOND);

  const flashGeometry = new THREE.SphereGeometry(FLASH_BASE_RADIUS, 14, 12);
  const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
  const activeFlashes: ActiveExplosionFlash[] = [];
  const activeSmoke: ActiveSmokeParticle[] = [];

  const randomDirection = new THREE.Vector3();
  const smokeVelocity = new THREE.Vector3();

  const spawnBurst = (origin: THREE.Vector3, blastRadius?: number): void => {
    while (activeFlashes.length >= MAX_ACTIVE_FLASHES) {
      const oldest = activeFlashes.shift();
      oldest?.mesh.removeFromParent();
      oldest?.mesh.material.dispose();
    }

    const clampedRadius = Math.max(0.05, blastRadius ?? 0.6);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: flashColor,
      transparent: true,
      opacity: 0.72 * opacityScale,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const flashMesh = new THREE.Mesh(flashGeometry, flashMaterial);
    flashMesh.position.copy(origin);
    flashMesh.renderOrder = 23;
    root.add(flashMesh);
    activeFlashes.push({
      age: 0,
      maxScale: Math.max(0.25, clampedRadius * 0.92),
      mesh: flashMesh
    });

    const smokeCount = THREE.MathUtils.clamp(
      Math.round(THREE.MathUtils.lerp(smokeCountMin, smokeCountMax, Math.random())),
      smokeCountMin,
      smokeCountMax
    );
    const smokeSizeScale = THREE.MathUtils.lerp(0.9, 1.2, clampedRadius / 1.0);

    for (let i = 0; i < smokeCount; i += 1) {
      while (activeSmoke.length >= MAX_ACTIVE_SMOKE_PARTICLES) {
        const oldest = activeSmoke.shift();
        oldest?.mesh.removeFromParent();
        oldest?.mesh.material.dispose();
      }

      randomDirection.set(
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(1),
        THREE.MathUtils.randFloatSpread(1)
      );
      if (randomDirection.lengthSq() < 0.0001) {
        randomDirection.set(0, 1, 0);
      } else {
        randomDirection.normalize();
      }
      randomDirection.y += THREE.MathUtils.randFloat(smokeVerticalBiasMin, smokeVerticalBiasMax);
      randomDirection.normalize();

      smokeVelocity.copy(randomDirection).multiplyScalar(
        THREE.MathUtils.randFloat(0.45, 1.55) *
          THREE.MathUtils.lerp(0.8, 1.25, clampedRadius) *
          smokeSpeedMultiplier
      );

      const startScale = THREE.MathUtils.randFloat(0.04, 0.07) * smokeSizeScale;
      const endScale = THREE.MathUtils.randFloat(0.18, 0.34) * smokeSizeScale;
      const lifetime = THREE.MathUtils.randFloat(0.34, 0.62);
      const startOpacity = THREE.MathUtils.randFloat(0.14, 0.26) * opacityScale;

      const smokeMaterial = new THREE.MeshBasicMaterial({
        color: smokeColor,
        transparent: true,
        opacity: startOpacity,
        depthWrite: false,
        toneMapped: false
      });
      const smokeMesh = new THREE.Mesh(smokeGeometry, smokeMaterial);
      smokeMesh.position.copy(origin).addScaledVector(randomDirection, THREE.MathUtils.randFloat(0.0, clampedRadius * 0.08));
      smokeMesh.scale.setScalar(startScale);
      smokeMesh.renderOrder = 22;
      root.add(smokeMesh);

      activeSmoke.push({
        age: 0,
        endScale,
        lifetime,
        mesh: smokeMesh,
        startOpacity,
        startScale,
        velocity: smokeVelocity.clone()
      });
    }
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeFlashes.length - 1; i >= 0; i -= 1) {
      const flash = activeFlashes[i];
      flash.age += deltaTime;
      const t = THREE.MathUtils.clamp(flash.age / FLASH_LIFETIME_SECONDS, 0, 1);
      flash.mesh.scale.setScalar(THREE.MathUtils.lerp(0.25, flash.maxScale, t));
      flash.mesh.material.opacity = THREE.MathUtils.lerp(0.72 * opacityScale, 0, t);
      if (t < 1) {
        continue;
      }
      flash.mesh.removeFromParent();
      flash.mesh.material.dispose();
      activeFlashes.splice(i, 1);
    }

    for (let i = activeSmoke.length - 1; i >= 0; i -= 1) {
      const smoke = activeSmoke[i];
      smoke.age += deltaTime;
      const t = THREE.MathUtils.clamp(smoke.age / smoke.lifetime, 0, 1);
      smoke.mesh.position.addScaledVector(smoke.velocity, deltaTime);
      smoke.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * smokeDragPerSecond));
      smoke.mesh.scale.setScalar(THREE.MathUtils.lerp(smoke.startScale, smoke.endScale, t));
      smoke.mesh.material.opacity = THREE.MathUtils.lerp(smoke.startOpacity, 0, t);
      if (t < 1) {
        continue;
      }
      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
      activeSmoke.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const flash of activeFlashes) {
      flash.mesh.removeFromParent();
      flash.mesh.material.dispose();
    }
    activeFlashes.length = 0;
    for (const smoke of activeSmoke) {
      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
    }
    activeSmoke.length = 0;
    flashGeometry.dispose();
    smokeGeometry.dispose();
    root.removeFromParent();
  };

  return { spawnBurst, update, dispose };
}
