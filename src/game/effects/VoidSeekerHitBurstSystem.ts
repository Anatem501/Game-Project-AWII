import * as THREE from "three";

type VoidSeekerHitShard = {
  angularSpeed: number;
  baseOpacity: number;
  endLengthScale: number;
  endRadiusScale: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  startLengthScale: number;
  startRadiusScale: number;
  velocity: THREE.Vector3;
};

type ActiveVoidSeekerHitBurst = {
  age: number;
  baseRadius: number;
  blackOutlineMaterial: THREE.MeshBasicMaterial;
  blackOutlineMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  coreMaterial: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  lifetime: number;
  whiteOutlineMaterial: THREE.MeshBasicMaterial;
  whiteOutlineMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  shards: VoidSeekerHitShard[];
};

export type VoidSeekerHitBurstSystem = {
  spawnBurst: (origin: THREE.Vector3, direction: THREE.Vector3, boltRadius?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type VoidSeekerHitBurstConfig = {
  lifetimeSeconds?: number;
  maxShards?: number;
  minShards?: number;
};

const DEFAULT_LIFETIME_SECONDS = 0.24;
const DEFAULT_MIN_SHARDS = 14;
const DEFAULT_MAX_SHARDS = 20;

export function createVoidSeekerHitBurstSystem(
  scene: THREE.Scene,
  config: VoidSeekerHitBurstConfig = {}
): VoidSeekerHitBurstSystem {
  const lifetimeSeconds = Math.max(0.05, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const minShards = Math.max(1, Math.floor(config.minShards ?? DEFAULT_MIN_SHARDS));
  const maxShards = Math.max(minShards, Math.floor(config.maxShards ?? DEFAULT_MAX_SHARDS));

  const root = new THREE.Group();
  scene.add(root);

  const sphereGeometry = new THREE.SphereGeometry(1, 18, 14);
  const shardGeometry = new THREE.ConeGeometry(1, 1, 7, 1);

  const coreMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.95,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const blackOutlineMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x120a1f,
    transparent: true,
    opacity: 0.92,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    toneMapped: false
  });
  const whiteOutlineMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    toneMapped: false
  });
  const shardMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x030303,
    transparent: true,
    opacity: 0.9,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });

  const activeBursts: ActiveVoidSeekerHitBurst[] = [];

  const burstDir = new THREE.Vector3();
  const shardDir = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const shardAxis = new THREE.Vector3(0, 1, 0);
  const fallbackForward = new THREE.Vector3(0, 0, 1);

  const spawnBurst = (origin: THREE.Vector3, direction: THREE.Vector3, boltRadius?: number): void => {
    burstDir.copy(direction);
    if (burstDir.lengthSq() <= 0.000001) {
      burstDir.copy(fallbackForward);
    } else {
      burstDir.normalize();
    }

    const baseRadius = THREE.MathUtils.clamp((boltRadius ?? 0.06) * 1.35, 0.045, 0.14);

    const coreMaterial = coreMaterialTemplate.clone();
    const blackOutlineMaterial = blackOutlineMaterialTemplate.clone();
    const whiteOutlineMaterial = whiteOutlineMaterialTemplate.clone();
    const coreMesh = new THREE.Mesh(sphereGeometry, coreMaterial);
    const blackOutlineMesh = new THREE.Mesh(sphereGeometry, blackOutlineMaterial);
    const whiteOutlineMesh = new THREE.Mesh(sphereGeometry, whiteOutlineMaterial);
    coreMesh.position.copy(origin);
    blackOutlineMesh.position.copy(origin);
    whiteOutlineMesh.position.copy(origin);
    coreMesh.renderOrder = 20;
    blackOutlineMesh.renderOrder = 19;
    whiteOutlineMesh.renderOrder = 18;
    coreMesh.scale.setScalar(baseRadius * 1.3);
    blackOutlineMesh.scale.setScalar(baseRadius * 1.9);
    whiteOutlineMesh.scale.setScalar(baseRadius * 2.12);
    root.add(whiteOutlineMesh);
    root.add(blackOutlineMesh);
    root.add(coreMesh);

    const shardCount = Math.floor(randomRange(minShards, maxShards + 1));
    const shards: VoidSeekerHitShard[] = [];
    for (let i = 0; i < shardCount; i += 1) {
      const material = shardMaterialTemplate.clone();
      material.color = material.color.clone();
      if (Math.random() < 0.24) {
        material.color.set(0xffffff);
      } else {
        material.color
          .set(0x000000)
          .lerp(new THREE.Color(0x120f18), randomRange(0.08, 0.35));
      }
      material.opacity = randomRange(0.72, 1.0);

      const mesh = new THREE.Mesh(shardGeometry, material);
      mesh.renderOrder = 21;
      mesh.frustumCulled = false;

      shardDir.copy(randomUnitVector());
      shardDir.addScaledVector(burstDir, randomRange(0.08, 0.42));
      if (shardDir.lengthSq() <= 0.000001) {
        shardDir.copy(burstDir);
      } else {
        shardDir.normalize();
      }

      tangent.copy(randomUnitVector()).cross(shardDir);
      if (tangent.lengthSq() <= 0.000001) {
        tangent.set(1, 0, 0);
      } else {
        tangent.normalize();
      }
      shardDir.addScaledVector(tangent, randomRange(-0.2, 0.2)).normalize();

      quat.setFromUnitVectors(shardAxis, shardDir);
      mesh.quaternion.copy(quat);
      mesh.position.copy(origin).addScaledVector(shardDir, baseRadius * randomRange(0.04, 0.16));

      const startRadiusScale = baseRadius * randomRange(0.22, 0.44);
      const startLengthScale = baseRadius * randomRange(0.4, 0.85);
      mesh.scale.set(startRadiusScale, startLengthScale, startRadiusScale);
      root.add(mesh);

      shards.push({
        angularSpeed: randomRange(6, 16) * (Math.random() < 0.5 ? -1 : 1),
        baseOpacity: material.opacity,
        endLengthScale: startLengthScale * randomRange(0.55, 0.85),
        endRadiusScale: startRadiusScale * randomRange(0.65, 0.95),
        material,
        mesh,
        startLengthScale,
        startRadiusScale,
        velocity: shardDir.clone().multiplyScalar(randomRange(1.8, 5.4))
      });
    }

    activeBursts.push({
      age: 0,
      baseRadius,
      blackOutlineMaterial,
      blackOutlineMesh,
      coreMaterial,
      coreMesh,
      lifetime: lifetimeSeconds,
      whiteOutlineMaterial,
      whiteOutlineMesh,
      shards
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeBursts.length - 1; i >= 0; i -= 1) {
      const burst = activeBursts[i];
      burst.age += deltaTime;
      const t = THREE.MathUtils.clamp(burst.age / burst.lifetime, 0, 1);
      const fade = 1 - t;
      const pulse = 0.86 + 0.14 * Math.sin(t * Math.PI * 7.5);

      const implodeT = THREE.MathUtils.smootherstep(t, 0, 0.45);
      const coreScale = THREE.MathUtils.lerp(burst.baseRadius * 1.3, burst.baseRadius * 0.12, implodeT);
      burst.coreMesh.scale.setScalar(coreScale);
      burst.coreMaterial.opacity = 0.92 * fade * fade;

      const blackOutlineScale = THREE.MathUtils.lerp(
        burst.baseRadius * 2.05,
        burst.baseRadius * 0.32,
        THREE.MathUtils.smootherstep(t, 0, 0.6)
      );
      burst.blackOutlineMesh.scale.setScalar(blackOutlineScale * (0.99 + pulse * 0.04));
      burst.blackOutlineMaterial.opacity = 0.95 * fade * (0.9 + pulse * 0.12);

      const whiteOutlineScale = THREE.MathUtils.lerp(
        burst.baseRadius * 2.22,
        burst.baseRadius * 0.38,
        THREE.MathUtils.smootherstep(t, 0, 0.62)
      );
      burst.whiteOutlineMesh.scale.setScalar(whiteOutlineScale * (1.0 + pulse * 0.06));
      burst.whiteOutlineMaterial.opacity = 0.9 * fade * (0.9 + pulse * 0.22);

      for (const shard of burst.shards) {
        shard.mesh.position.addScaledVector(shard.velocity, deltaTime);
        shard.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * 4.8));

        shardDir.copy(shard.velocity);
        if (shardDir.lengthSq() <= 0.000001) {
          shardDir.copy(fallbackForward);
        } else {
          shardDir.normalize();
        }
        quat.setFromUnitVectors(shardAxis, shardDir);
        shard.mesh.quaternion.copy(quat);
        shard.mesh.rotateY(burst.age * shard.angularSpeed);

        const scaleT = THREE.MathUtils.smootherstep(t, 0, 1);
        const radialScale = THREE.MathUtils.lerp(shard.startRadiusScale, shard.endRadiusScale, scaleT);
        const lengthScale = THREE.MathUtils.lerp(shard.startLengthScale, shard.endLengthScale, scaleT);
        shard.mesh.scale.set(radialScale, lengthScale, radialScale);
        shard.material.opacity = shard.baseOpacity * (fade * fade) * (0.9 + pulse * 0.16);
      }

      if (t < 1) {
        continue;
      }

      burst.coreMesh.removeFromParent();
      burst.blackOutlineMesh.removeFromParent();
      burst.whiteOutlineMesh.removeFromParent();
      for (const shard of burst.shards) {
        shard.mesh.removeFromParent();
        shard.material.dispose();
      }
      burst.coreMaterial.dispose();
      burst.blackOutlineMaterial.dispose();
      burst.whiteOutlineMaterial.dispose();
      activeBursts.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const burst of activeBursts) {
      burst.coreMesh.removeFromParent();
      burst.blackOutlineMesh.removeFromParent();
      burst.whiteOutlineMesh.removeFromParent();
      for (const shard of burst.shards) {
        shard.mesh.removeFromParent();
        shard.material.dispose();
      }
      burst.coreMaterial.dispose();
      burst.blackOutlineMaterial.dispose();
      burst.whiteOutlineMaterial.dispose();
    }
    activeBursts.length = 0;
    sphereGeometry.dispose();
    shardGeometry.dispose();
    coreMaterialTemplate.dispose();
    blackOutlineMaterialTemplate.dispose();
    whiteOutlineMaterialTemplate.dispose();
    shardMaterialTemplate.dispose();
    root.removeFromParent();
  };

  return { spawnBurst, update, dispose };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function randomUnitVector(): THREE.Vector3 {
  const z = randomRange(-1, 1);
  const theta = randomRange(0, Math.PI * 2);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(Math.cos(theta) * r, z, Math.sin(theta) * r).normalize();
}
