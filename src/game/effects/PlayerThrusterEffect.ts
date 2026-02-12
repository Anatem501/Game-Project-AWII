import * as THREE from "three";

export type PlayerThrusterEffectConfig = {
  thrusterLocalOffsets: readonly THREE.Vector3[];
  flameLength?: number;
  flameWidth?: number;
  minIntensity?: number;
  maxIntensity?: number;
};

export type PlayerThrusterEffect = {
  update: (deltaTime: number, intensityFactor: number) => void;
  dispose: () => void;
};

const THRUSTER_VERTEX_SHADER = `
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying float vJitter;

void main() {
  vUv = uv;

  float wave = sin(uTime * 21.0 + position.x * 18.0) * 0.025;
  float flicker = sin(uTime * 37.0 + position.y * 24.0) * 0.012;
  float stretch = (1.0 + uIntensity * 0.75);

  vec3 displaced = position;
  displaced.x += wave * (1.0 - uv.y);
  displaced.y += flicker * (1.0 - uv.y);
  displaced.z *= stretch;

  vJitter = wave + flicker;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const THRUSTER_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying float vJitter;

void main() {
  vec2 centered = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float radial = 1.0 - smoothstep(0.0, 0.9, abs(centered.x) + centered.y * 0.2);
  float fade = 1.0 - smoothstep(0.72, 1.0, vUv.y);
  float pulse = 0.82 + 0.18 * sin(uTime * 24.0 + vUv.y * 35.0 + vJitter * 12.0);
  float alpha = radial * fade * pulse * (0.35 + uIntensity * 0.85);

  vec3 inner = vec3(0.9, 0.98, 1.0);
  vec3 mid = vec3(0.32, 0.72, 1.0);
  vec3 outer = vec3(0.08, 0.24, 0.95);
  vec3 color = mix(inner, mid, clamp(vUv.y * 1.3, 0.0, 1.0));
  color = mix(color, outer, clamp(vUv.y * 0.9, 0.0, 1.0));
  color *= (0.55 + uIntensity * 0.9);

  if (alpha <= 0.001) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;

export function createPlayerThrusterEffect(
  shipRoot: THREE.Object3D,
  config: PlayerThrusterEffectConfig
): PlayerThrusterEffect {
  const flameLength = config.flameLength ?? 0.4;
  const flameWidth = config.flameWidth ?? 0.24;
  const minIntensity = THREE.MathUtils.clamp(config.minIntensity ?? 0.55, 0, 2);
  const maxIntensity = Math.max(minIntensity, config.maxIntensity ?? 1.55);

  const group = new THREE.Group();
  shipRoot.add(group);

  const geometry = new THREE.PlaneGeometry(flameWidth, flameLength, 1, 10);
  geometry.translate(0, 0, -flameLength * 0.5);

  const thrusterMaterials: THREE.ShaderMaterial[] = [];

  for (const offset of config.thrusterLocalOffsets) {
    const material = new THREE.ShaderMaterial({
      vertexShader: THRUSTER_VERTEX_SHADER,
      fragmentShader: THRUSTER_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: minIntensity }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    const flame = new THREE.Mesh(geometry, material);
    flame.position.copy(offset);
    flame.rotation.x = -Math.PI * 0.5;
    flame.rotation.z = Math.PI;
    group.add(flame);
    thrusterMaterials.push(material);
  }

  let time = 0;

  const update = (deltaTime: number, intensityFactor: number): void => {
    if (deltaTime <= 0) {
      return;
    }
    time += deltaTime;
    const clampedIntensity = THREE.MathUtils.clamp(intensityFactor, 0, 1);
    const intensity = THREE.MathUtils.lerp(minIntensity, maxIntensity, clampedIntensity);
    for (const material of thrusterMaterials) {
      material.uniforms.uTime.value = time;
      material.uniforms.uIntensity.value = intensity;
    }
  };

  const dispose = (): void => {
    for (const material of thrusterMaterials) {
      material.dispose();
    }
    geometry.dispose();
    group.removeFromParent();
  };

  return { update, dispose };
}
