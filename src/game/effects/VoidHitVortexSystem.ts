import * as THREE from "three";

type ActiveVortex = {
  age: number;
  baseScale: number;
  coreMaterial: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  group: THREE.Group;
  lifetime: number;
  shards: VortexShard[];
  swirlBackMaterial: THREE.ShaderMaterial;
  swirlBackMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  swirlBackSpinDirection: number;
  swirlMaterial: THREE.ShaderMaterial;
  swirlMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  swirlSpinDirection: number;
};

type VortexShard = {
  angle: number;
  angularSpeed: number;
  axialBurst: number;
  axialOffset: number;
  axialWobblePhase: number;
  baseOpacity: number;
  burstDirection: THREE.Vector3;
  endRadius: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  peakRadius: number;
  pulsePhase: number;
  radialScale: number;
  startRadius: number;
  tangentialScale: number;
};

export type VoidHitVortexSystem = {
  spawnVortex: (origin: THREE.Vector3, forwardHint?: THREE.Vector3, boltRadius?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type VoidHitVortexConfig = {
  lifetimeSeconds?: number;
  radius?: number;
};

const DEFAULT_LIFETIME_SECONDS = 0.34;
const DEFAULT_RADIUS = 0.08;

const PLANE_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANE_FRAGMENT_SHADER = `
uniform float uAge;
uniform float uLifetime;
uniform float uSeed;

varying vec2 vUv;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  if (r > 1.0) {
    discard;
  }

  float angle = atan(p.y, p.x);
  float swirlPhaseA = angle * 6.0 - r * 26.0 - t * 15.2 + uSeed * 1.1;
  float swirlPhaseB = angle * 4.2 - r * 18.0 - t * 11.1 - uSeed * 0.8;
  float armA = pow(0.5 + 0.5 * sin(swirlPhaseA), 2.8);
  float armB = pow(0.5 + 0.5 * sin(swirlPhaseB), 2.2);
  float arm = max(armA, armB * 0.82);

  float bodyMask = smoothstep(1.0, 0.09, r);
  float centerHole = 1.0 - smoothstep(0.035, 0.22, r);
  float rimFade = 1.0 - smoothstep(0.78, 1.0, r);
  float spiralMask = arm * bodyMask * rimFade;

  vec3 deepVoid = vec3(0.06, 0.03, 0.13);
  vec3 midVoid = vec3(0.18, 0.11, 0.34);
  vec3 blueViolet = vec3(0.47, 0.54, 0.98);
  vec3 paleGlow = vec3(0.73, 0.79, 1.0);
  vec3 vortexColor = mix(deepVoid, midVoid, spiralMask * 0.9 + bodyMask * 0.08);
  vortexColor = mix(vortexColor, blueViolet, spiralMask * 0.34 + rimFade * 0.08);
  vortexColor = mix(vortexColor, paleGlow, spiralMask * 0.1);

  float pulse = 0.88 + 0.12 * sin(uSeed * 0.7 + t * 21.0);
  float fade = 1.0 - smoothstep(0.72, 1.0, t);
  float alpha = (spiralMask * 1.06 + bodyMask * 0.05) * fade * pulse;
  alpha *= (1.0 - centerHole * 0.97);
  if (alpha <= 0.01) {
    discard;
  }

  gl_FragColor = vec4(vortexColor * (0.75 + spiralMask * 1.15 + rimFade * 0.06), alpha);
}
`;

export function createVoidHitVortexSystem(
  scene: THREE.Scene,
  config: VoidHitVortexConfig = {}
): VoidHitVortexSystem {
  const lifetimeSeconds = Math.max(0.01, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const radius = Math.max(0.01, config.radius ?? DEFAULT_RADIUS);

  const root = new THREE.Group();
  scene.add(root);

  const planeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const coreGeometry = new THREE.CircleGeometry(1, 28);
  const activeVortices: ActiveVortex[] = [];

  const defaultForward = new THREE.Vector3(0, 0, 1);
  const impactForward = new THREE.Vector3();
  const alignQuat = new THREE.Quaternion();
  const shardGeometry = new THREE.ConeGeometry(0.06, 0.196, 6, 1);
  const shardMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x98a4ff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const shardTangent = new THREE.Vector3();
  const shardOutward = new THREE.Vector3();
  const shardDirection = new THREE.Vector3();
  const shardBaseAxis = new THREE.Vector3(0, 1, 0);
  const shardOrientation = new THREE.Quaternion();

  const spawnVortex = (origin: THREE.Vector3, forwardHint?: THREE.Vector3, boltRadius?: number): void => {
    impactForward.copy(forwardHint ?? defaultForward);
    if (impactForward.lengthSq() <= 0.000001) {
      impactForward.copy(defaultForward);
    } else {
      impactForward.normalize();
    }

    const group = new THREE.Group();
    group.position.copy(origin);
    alignQuat.setFromUnitVectors(defaultForward, impactForward);
    group.quaternion.copy(alignQuat);

    const swirlMaterial = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX_SHADER,
      fragmentShader: PLANE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetimeSeconds },
        uSeed: { value: Math.random() * Math.PI * 2 }
      }
    });
    const swirlMesh = new THREE.Mesh(planeGeometry, swirlMaterial);
    swirlMesh.rotation.z = Math.random() * Math.PI * 2;
    group.add(swirlMesh);

    const swirlBackMaterial = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX_SHADER,
      fragmentShader: PLANE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetimeSeconds },
        uSeed: { value: Math.random() * Math.PI * 2 }
      }
    });
    const swirlBackMesh = new THREE.Mesh(planeGeometry, swirlBackMaterial);
    swirlBackMesh.rotation.set(
      THREE.MathUtils.degToRad(66 + Math.random() * 18),
      THREE.MathUtils.degToRad(-22 + Math.random() * 44),
      Math.random() * Math.PI * 2
    );
    swirlBackMesh.scale.setScalar(0.98);
    swirlBackMesh.position.z = -0.028;
    group.add(swirlBackMesh);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x140a26,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.position.z = 0.003;
    group.add(coreMesh);

    const baseScale = Math.max(0.01, (boltRadius ?? radius) * 6.8);
    const shardCount = THREE.MathUtils.clamp(
      Math.round(10 + baseScale * 1.35 + Math.random() * 3),
      10,
      20
    );
    const shards: VortexShard[] = [];
    for (let i = 0; i < shardCount; i += 1) {
      const material = shardMaterialTemplate.clone();
      material.opacity *= THREE.MathUtils.lerp(0.8, 1, Math.random());
      const mesh = new THREE.Mesh(shardGeometry, material);
      mesh.renderOrder = 9;
      group.add(mesh);
      shards.push({
        angle: Math.random() * Math.PI * 2,
        angularSpeed: THREE.MathUtils.lerp(7.5, 15.5, Math.random()) * (Math.random() < 0.5 ? -1 : 1),
        axialBurst: THREE.MathUtils.lerp(0.14, 0.28, Math.random()),
        axialOffset: THREE.MathUtils.lerp(-0.012, 0.012, Math.random()),
        axialWobblePhase: Math.random() * Math.PI * 2,
        baseOpacity: material.opacity,
        burstDirection: randomBurstDirection3D(),
        endRadius: THREE.MathUtils.lerp(1.15, 2.1, Math.random()),
        material,
        mesh,
        peakRadius: THREE.MathUtils.lerp(0.9, 1.45, Math.random()),
        pulsePhase: Math.random() * Math.PI * 2,
        radialScale: THREE.MathUtils.lerp(0.22, 0.43, Math.random()),
        startRadius: THREE.MathUtils.lerp(0.0, 0.05, Math.random()),
        tangentialScale: THREE.MathUtils.lerp(0.41, 0.71, Math.random())
      });
    }

    group.scale.setScalar(baseScale);
    root.add(group);

    activeVortices.push({
      age: 0,
      baseScale,
      coreMaterial,
      coreMesh,
      group,
      lifetime: lifetimeSeconds,
      shards,
      swirlBackMaterial,
      swirlBackMesh,
      swirlBackSpinDirection: Math.random() < 0.5 ? -1 : 1,
      swirlMaterial,
      swirlMesh,
      swirlSpinDirection: Math.random() < 0.5 ? -1 : 1
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeVortices.length - 1; i >= 0; i -= 1) {
      const vortex = activeVortices[i];
      vortex.age += deltaTime;
      const t = THREE.MathUtils.clamp(vortex.age / Math.max(0.0001, vortex.lifetime), 0, 1);
      vortex.swirlMaterial.uniforms.uAge.value = vortex.age;
      vortex.swirlBackMaterial.uniforms.uAge.value = vortex.age;

      const shrinkEase = THREE.MathUtils.smoothstep(t, 0, 1);
      const scale = THREE.MathUtils.lerp(vortex.baseScale, vortex.baseScale * 0.12, shrinkEase);
      vortex.group.scale.setScalar(scale);
      const groupScaleRatio = scale / Math.max(0.0001, vortex.baseScale);
      const shardExplosionCompensation = Math.pow(Math.max(0.12, groupScaleRatio), -0.9);

      const spinRate = THREE.MathUtils.lerp(10, 26, shrinkEase);
      vortex.swirlMesh.rotation.z += deltaTime * spinRate * vortex.swirlSpinDirection;
      const backSpinRate = THREE.MathUtils.lerp(7, 20, shrinkEase);
      vortex.swirlBackMesh.rotation.z += deltaTime * backSpinRate * vortex.swirlBackSpinDirection;
      vortex.swirlBackMesh.rotation.y += deltaTime * 0.9 * vortex.swirlBackSpinDirection;
      vortex.swirlBackMesh.rotation.x += deltaTime * 0.55;

      const fade = 1 - THREE.MathUtils.smoothstep(t, 0.42, 1);
      vortex.coreMaterial.opacity = 0.72 * (1 - THREE.MathUtils.smoothstep(t, 0.16, 0.86));
      vortex.coreMesh.scale.setScalar(THREE.MathUtils.lerp(0.28, 0.06, shrinkEase));
      vortex.swirlMesh.scale.setScalar(THREE.MathUtils.lerp(1.14, 0.32, shrinkEase));
      vortex.swirlMaterial.opacity = 1.08 * fade;
      vortex.swirlBackMesh.scale.setScalar(THREE.MathUtils.lerp(1.04, 0.28, shrinkEase));
      vortex.swirlBackMaterial.opacity = 0.8 * fade;
      const shardFade = 1 - THREE.MathUtils.smoothstep(t, 0.12, 1);
      const burstOutT = THREE.MathUtils.smoothstep(t, 0, 0.1);
      const driftT = THREE.MathUtils.smoothstep(t, 0.08, 1);
      const explodeT = 1 - Math.pow(1 - driftT, 2.2);
      const burstBoost = 1 - THREE.MathUtils.smoothstep(t, 0, 0.16);
      for (const shard of vortex.shards) {
        shard.angle += shard.angularSpeed * deltaTime * (1 - t * 0.65);
        let shardRadius = THREE.MathUtils.lerp(shard.startRadius, shard.peakRadius, burstOutT);
        shardRadius = THREE.MathUtils.lerp(shardRadius, shard.endRadius, explodeT);
        const burstDistance =
          shardRadius + shard.axialBurst * (burstOutT + explodeT * 0.7) + shard.axialOffset * driftT;
        shardOutward.copy(shard.burstDirection).multiplyScalar(burstDistance);
        const wobble =
          Math.sin(vortex.age * 18 + shard.axialWobblePhase) *
          THREE.MathUtils.lerp(0.03, 0.006, t) *
          driftT;
        shardTangent
          .set(-shard.burstDirection.y, shard.burstDirection.x, shard.burstDirection.z * 0.25)
          .normalize()
          .multiplyScalar(wobble);
        shard.mesh.position
          .copy(shardOutward)
          .add(shardTangent)
          .multiplyScalar(shardExplosionCompensation);

        shardOutward.copy(shard.mesh.position);
        if (shardOutward.lengthSq() <= 0.000001) {
          shardOutward.set(1, 0, 0);
        } else {
          shardOutward.normalize();
        }
        shardDirection.copy(shardOutward);
        if (shardDirection.lengthSq() <= 0.000001) {
          shardDirection.set(0, 1, 0);
        } else {
          shardDirection.normalize();
        }
        shardOrientation.setFromUnitVectors(shardBaseAxis, shardDirection);
        shard.mesh.quaternion.copy(shardOrientation);
        shard.mesh.rotateY(vortex.age * 9 + shard.pulsePhase);

        const pulse = 0.72 + 0.28 * Math.sin(vortex.age * 24 + shard.pulsePhase);
        shard.material.opacity =
          shard.baseOpacity * shardFade * (1 + burstBoost * 0.85) * Math.max(0, pulse);
        const radiusScale =
          shard.radialScale *
          THREE.MathUtils.lerp(2.2, 0.95, driftT) *
          (1 + burstBoost * 0.45) *
          Math.pow(shardExplosionCompensation, 0.2);
        const lengthScale =
          shard.tangentialScale *
          THREE.MathUtils.lerp(2.15, 1.05, driftT) *
          (1 + burstBoost * 0.55) *
          Math.pow(shardExplosionCompensation, 0.15);
        shard.mesh.scale.set(radiusScale, lengthScale, radiusScale);
      }

      if (t < 1) {
        continue;
      }

      vortex.group.removeFromParent();
      for (const shard of vortex.shards) {
        shard.material.dispose();
      }
      vortex.swirlBackMaterial.dispose();
      vortex.swirlMaterial.dispose();
      vortex.coreMaterial.dispose();
      activeVortices.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const vortex of activeVortices) {
      vortex.group.removeFromParent();
      for (const shard of vortex.shards) {
        shard.material.dispose();
      }
      vortex.swirlBackMaterial.dispose();
      vortex.swirlMaterial.dispose();
      vortex.coreMaterial.dispose();
    }
    activeVortices.length = 0;
    planeGeometry.dispose();
    coreGeometry.dispose();
    shardGeometry.dispose();
    shardMaterialTemplate.dispose();
    root.removeFromParent();
  };

  return { spawnVortex, update, dispose };
}

function randomBurstDirection3D(): THREE.Vector3 {
  const z = THREE.MathUtils.lerp(-1, 1, Math.random());
  const theta = Math.random() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  const direction = new THREE.Vector3(radial * Math.cos(theta), radial * Math.sin(theta), z);
  // Slightly emphasize depth so the burst reads less flat.
  direction.z *= 1.25;
  if (direction.lengthSq() <= 0.000001) {
    return new THREE.Vector3(0, 0, 1);
  }
  return direction.normalize();
}
