import * as THREE from "three";

const PARTICLE_SPAWN_INTERVAL_SECONDS = 0.055;
const PARTICLE_MAX_COUNT = 120;
const PARTICLE_LIFETIME_MIN_SECONDS = 0.55;
const PARTICLE_LIFETIME_MAX_SECONDS = 1.05;
const PARTICLE_START_SCALE_MIN = 0.045;
const PARTICLE_START_SCALE_MAX = 0.085;
const PARTICLE_END_SCALE_MIN = 0.22;
const PARTICLE_END_SCALE_MAX = 0.34;
const PARTICLE_START_OPACITY_MIN = 0.22;
const PARTICLE_START_OPACITY_MAX = 0.38;
const PARTICLE_DRAG_PER_SECOND = 1.8;
const PARTICLE_BUOYANCY = 0.22;
const PARTICLE_FORWARD_DRIFT = 0.22;
const PARTICLE_SIDE_SPREAD = 0.28;
const PARTICLE_UPWARD_SPEED_MIN = 0.24;
const PARTICLE_UPWARD_SPEED_MAX = 0.6;

type OverheatSteamParticle = {
  age: number;
  endScale: number;
  lifetime: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startOpacity: number;
  startScale: number;
  velocity: THREE.Vector3;
};

export type CannonOverheatSteamEffect = {
  update: (deltaTime: number, overheated: boolean, shipForward: THREE.Vector3) => void;
  dispose: () => void;
};

export function createCannonOverheatSteamEffect(
  scene: THREE.Scene,
  cannonHardpoints: readonly THREE.Object3D[]
): CannonOverheatSteamEffect {
  const root = new THREE.Group();
  scene.add(root);

  const particleGeometry = new THREE.SphereGeometry(1, 10, 8);
  const spawnPosition = new THREE.Vector3();
  const spawnVelocity = new THREE.Vector3();
  const randomOffset = new THREE.Vector3();
  const backwardDirection = new THREE.Vector3();

  const activeParticles: OverheatSteamParticle[] = [];
  let spawnAccumulator = 0;

  const spawnParticle = (hardpoint: THREE.Object3D, shipForward: THREE.Vector3): void => {
    if (activeParticles.length >= PARTICLE_MAX_COUNT) {
      return;
    }

    hardpoint.getWorldPosition(spawnPosition);
    randomOffset.set(
      (Math.random() - 0.5) * 0.12,
      (Math.random() - 0.5) * 0.08,
      (Math.random() - 0.5) * 0.12
    );
    spawnPosition.add(randomOffset);

    backwardDirection.copy(shipForward).multiplyScalar(-PARTICLE_FORWARD_DRIFT);
    spawnVelocity.set(
      backwardDirection.x + (Math.random() - 0.5) * PARTICLE_SIDE_SPREAD,
      randomRange(PARTICLE_UPWARD_SPEED_MIN, PARTICLE_UPWARD_SPEED_MAX),
      backwardDirection.z + (Math.random() - 0.5) * PARTICLE_SIDE_SPREAD
    );

    const startScale = randomRange(PARTICLE_START_SCALE_MIN, PARTICLE_START_SCALE_MAX);
    const endScale = randomRange(PARTICLE_END_SCALE_MIN, PARTICLE_END_SCALE_MAX);
    const lifetime = randomRange(PARTICLE_LIFETIME_MIN_SECONDS, PARTICLE_LIFETIME_MAX_SECONDS);
    const startOpacity = randomRange(PARTICLE_START_OPACITY_MIN, PARTICLE_START_OPACITY_MAX);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffc496,
      transparent: true,
      opacity: startOpacity,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(particleGeometry, material);
    mesh.position.copy(spawnPosition);
    mesh.scale.setScalar(startScale);
    root.add(mesh);

    activeParticles.push({
      age: 0,
      endScale,
      lifetime,
      material,
      mesh,
      startOpacity,
      startScale,
      velocity: spawnVelocity.clone()
    });
  };

  const update = (deltaTime: number, overheated: boolean, shipForward: THREE.Vector3): void => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (overheated && cannonHardpoints.length > 0) {
      spawnAccumulator += deltaTime;
      while (spawnAccumulator >= PARTICLE_SPAWN_INTERVAL_SECONDS) {
        spawnAccumulator -= PARTICLE_SPAWN_INTERVAL_SECONDS;
        for (const hardpoint of cannonHardpoints) {
          spawnParticle(hardpoint, shipForward);
        }
      }
    } else {
      spawnAccumulator = Math.min(spawnAccumulator, PARTICLE_SPAWN_INTERVAL_SECONDS);
    }

    for (let i = activeParticles.length - 1; i >= 0; i -= 1) {
      const particle = activeParticles[i];
      particle.age += deltaTime;
      const t = THREE.MathUtils.clamp(particle.age / particle.lifetime, 0, 1);

      particle.velocity.y += PARTICLE_BUOYANCY * deltaTime;
      particle.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * PARTICLE_DRAG_PER_SECOND));
      particle.mesh.position.addScaledVector(particle.velocity, deltaTime);

      const scale = THREE.MathUtils.lerp(particle.startScale, particle.endScale, t);
      particle.mesh.scale.setScalar(scale);
      particle.material.opacity = THREE.MathUtils.lerp(
        particle.startOpacity,
        0,
        THREE.MathUtils.smoothstep(t, 0, 1)
      );
      particle.material.color.setRGB(
        THREE.MathUtils.lerp(1.0, 0.74, t),
        THREE.MathUtils.lerp(0.77, 0.74, t),
        THREE.MathUtils.lerp(0.59, 0.78, t)
      );

      if (t < 1) {
        continue;
      }

      particle.mesh.removeFromParent();
      particle.material.dispose();
      activeParticles.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const particle of activeParticles) {
      particle.mesh.removeFromParent();
      particle.material.dispose();
    }
    activeParticles.length = 0;
    particleGeometry.dispose();
    root.removeFromParent();
  };

  return { update, dispose };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
