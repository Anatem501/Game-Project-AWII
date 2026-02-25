import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import { type DamageType } from "../../components/combat/DamageTypes";
import type { LaserBoltFactoryOptions } from "./LaserBoltFactory";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSpawnParams
} from "./ProjectileTypes";

const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const TRAIL_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTailFade;

varying vec2 vUv;

void main() {
  float widthMask = 1.0 - abs(vUv.x * 2.0 - 1.0);
  widthMask = pow(clamp(widthMask, 0.0, 1.0), 0.75);

  float headToTail = clamp(1.0 - vUv.y, 0.0, 1.0);
  float tailShape = pow(headToTail, 0.58);
  float alpha = uOpacity * widthMask * tailShape * uTailFade;
  if (alpha <= 0.001) {
    discard;
  }

  vec3 color = uColor * (0.55 + 0.45 * pow(headToTail, 0.35));
  gl_FragColor = vec4(color, alpha);
}
`;

const TRAIL_OUTLINE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTailFade;

varying vec2 vUv;

void main() {
  float edge = abs(vUv.x * 2.0 - 1.0);
  float edgeMask = smoothstep(0.7, 0.93, edge);
  edgeMask *= (1.0 - smoothstep(0.985, 1.0, edge));

  float headToTail = clamp(1.0 - vUv.y, 0.0, 1.0);
  float tailShape = pow(headToTail, 0.62);
  float alpha = uOpacity * edgeMask * tailShape * uTailFade;
  if (alpha <= 0.001) {
    discard;
  }

  vec3 color = uColor * (0.82 + 0.18 * pow(headToTail, 0.4));
  gl_FragColor = vec4(color, alpha);
}
`;

const ORB_RIM_OUTLINE_VERTEX_SHADER = `
varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const ORB_RIM_OUTLINE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uRimPower;
uniform float uRimThreshold;

varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  vec3 n = normalize(vViewNormal);
  vec3 v = normalize(vViewDir);
  float rim = 1.0 - abs(dot(n, v));
  rim = pow(clamp(rim, 0.0, 1.0), uRimPower);
  rim = smoothstep(uRimThreshold, 1.0, rim);
  float alpha = rim * uOpacity;
  if (alpha <= 0.002) {
    discard;
  }

  vec3 color = uColor * (0.9 + 0.1 * rim);
  gl_FragColor = vec4(color, alpha);
}
`;

const SPIRAL_VORTEX_VERTEX_SHADER = `
uniform float uTime;
uniform float uTwistStrength;
uniform float uDepthWarp;

varying vec2 vUv;
varying float vRadius;
varying float vAngle;
varying float vBandMask;
varying float vSpiral;

void main() {
  vUv = uv;

  vec2 p = (uv - vec2(0.5)) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float radius = max(r, 0.001);
  float t = uTime;

  float innerMask = smoothstep(0.12, 0.2, r);
  float outerMask = 1.0 - smoothstep(0.86, 1.0, r);
  float bandMask = innerMask * outerMask;

  vec2 tangent = radius > 0.0001 ? vec2(-p.y, p.x) / radius : vec2(0.0, 1.0);
  float spiral = angle * 7.5 + log(max(radius, 0.06)) * 11.0 - t * 4.6;
  float twistWave = sin(spiral) * 0.06 + sin(spiral * 1.9 + t * 1.7) * 0.025;
  float radialPulse = sin(spiral * 0.7 - t * 2.4) * 0.035;

  p += tangent * twistWave * uTwistStrength * bandMask;
  p *= 1.0 + radialPulse * bandMask;

  vec3 displaced = position;
  displaced.xy = p * 0.5;

  float funnel = -(1.0 - smoothstep(0.16, 0.72, r)) * uDepthWarp * 0.35;
  float ripple = sin(spiral * 1.35 + radius * 9.0 - t * 6.4) * uDepthWarp * 0.32 * bandMask;
  displaced.z += funnel + ripple;

  vRadius = r;
  vAngle = angle;
  vBandMask = bandMask;
  vSpiral = spiral;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const SPIRAL_VORTEX_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uDarkColor;
uniform vec3 uMidColor;
uniform vec3 uBrightColor;

varying vec2 vUv;
varying float vRadius;
varying float vAngle;
varying float vBandMask;
varying float vSpiral;

void main() {
  if (vRadius > 1.0) {
    discard;
  }

  float t = uTime;
  float band = vBandMask;
  if (band <= 0.001) {
    discard;
  }

  float armA = pow(max(0.0, 0.5 + 0.5 * sin(vSpiral * 0.95)), 3.1);
  float armB = pow(max(0.0, 0.5 + 0.5 * sin(vSpiral * 1.45 + t * 1.6)), 3.6);
  float arms = max(armA, armB * 0.82);

  float filament = 0.5 + 0.5 * sin(vAngle * 14.0 - vRadius * 30.0 - t * 8.5);
  filament *= 0.6 + 0.4 * (0.5 + 0.5 * sin(vSpiral * 0.9 + t * 4.2));
  filament = pow(max(0.0, filament), 3.0);

  float ring = smoothstep(0.68, 0.85, vRadius) * (1.0 - smoothstep(0.88, 1.0, vRadius));
  float innerEnergy = smoothstep(0.15, 0.42, vRadius) * (1.0 - smoothstep(0.42, 0.68, vRadius));
  float pulse = 0.88 + 0.12 * sin(t * 4.8 + vAngle * 2.0 - vRadius * 6.0);

  float energy = band * (arms * 0.95 + filament * 0.85 + innerEnergy * 0.25 + ring * 0.34);
  float alpha = energy * uOpacity * pulse * 1.18;
  alpha *= (1.0 - smoothstep(0.0, 0.12, vRadius) * 0.95);
  if (alpha <= 0.002) {
    discard;
  }

  float armHighlight = pow(max(0.0, arms), 1.25);
  float mixA = clamp(arms * 0.72 + filament * 0.28, 0.0, 1.0);
  float mixB = clamp(filament * 0.6 + ring * 0.2 + armHighlight * 0.45, 0.0, 1.0);
  vec3 color = mix(uDarkColor, uMidColor, mixA);
  color = mix(color, uBrightColor, mixB);

  gl_FragColor = vec4(color, alpha);
}
`;

const VORTEX_BILLBOARD_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VORTEX_BILLBOARD_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uOpacity;
uniform float uArms;
uniform vec3 uDarkColor;
uniform vec3 uLightColor;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  if (r > 1.0) {
    discard;
  }

  float t = uTime;
  float angle = atan(p.y, p.x);
  float radius = max(r, 0.02);
  float warp =
    sin(angle * 3.7 - t * 2.8 + radius * 11.0) * 0.16 +
    sin(angle * 8.3 + t * 4.1 - radius * 19.0) * 0.06;
  float warpedAngle = angle + warp * (1.0 - smoothstep(0.2, 0.95, r));

  // Dense inward spiral arms with turbulent dark-energy filament breakup.
  float spiralA = warpedAngle * uArms + log(radius) * 15.5 - t * 5.8;
  float spiralB = warpedAngle * (uArms * 0.66) + log(radius) * 10.4 + t * 4.4;
  float spiralC = warpedAngle * (uArms * 1.38) + log(radius) * 20.5 - t * 7.3;
  float armA = pow(max(0.0, 0.5 + 0.5 * sin(spiralA)), 4.2);
  float armB = pow(max(0.0, 0.5 + 0.5 * sin(spiralB)), 3.2);
  float armC = pow(max(0.0, 0.5 + 0.5 * sin(spiralC)), 5.0);
  float arms = max(max(armA, armB * 0.78), armC * 0.55);

  float filamentNoise =
    0.5 + 0.5 * sin(warpedAngle * (uArms * 1.9) - radius * 31.0 - t * 11.5);
  filamentNoise *= 0.65 + 0.35 * (0.5 + 0.5 * sin(warpedAngle * 9.0 + radius * 18.0 + t * 7.2));
  float filament = pow(max(0.0, filamentNoise), 4.0);

  float inwardMask = 1.0 - smoothstep(0.14, 0.98, r);
  float rimMask = smoothstep(0.12, 0.82, r) * (1.0 - smoothstep(0.86, 1.0, r));
  float centerHole = 1.0 - smoothstep(0.02, 0.13, r);
  float swirlMask = arms * (inwardMask * 0.9 + rimMask * 0.5);
  float filamentMask = filament * (inwardMask * 0.72 + rimMask * 0.84);

  float ring = smoothstep(0.68, 0.8, r) * (1.0 - smoothstep(0.84, 0.97, r));
  float shearPulse = 0.5 + 0.5 * sin(t * 12.5 - warpedAngle * 3.0 + radius * 14.0);
  float pulse = 0.82 + 0.18 * sin(t * 10.5 + warpedAngle * 2.0);
  float alpha = (swirlMask * 0.95 + filamentMask * 1.05 + ring * 0.24) * uOpacity * pulse;
  alpha *= (0.84 + 0.16 * shearPulse);
  alpha *= (1.0 - centerHole * 0.96);
  if (alpha <= 0.003) {
    discard;
  }

  float energyMix = min(1.0, swirlMask * 0.55 + filamentMask * 1.1 + ring * 0.45);
  vec3 energyColor = mix(uLightColor, vec3(1.0), min(1.0, filamentMask * 0.35 + ring * 0.4));
  vec3 color = mix(uDarkColor, energyColor, energyMix);
  gl_FragColor = vec4(color, alpha);
}
`;

export type VoidSeekerFactoryOptions = LaserBoltFactoryOptions & {
  modelUrl?: string;
  homingTurnRateRadiansPerSecond?: number;
  homingStrength?: number;
  trailPointCount?: number;
  trailMaxLength?: number;
  trailMinSampleDistance?: number;
  trailWidth?: number;
  trailGlowWidthMultiplier?: number;
  trailOpacity?: number;
  trailGlowOpacity?: number;
  flareOpacity?: number;
  flareSizeMultiplier?: number;
};

type RibbonTrailRenderable = {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  uvs: Float32Array;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  positionsAttribute: THREE.BufferAttribute;
  uvsAttribute: THREE.BufferAttribute;
};

type RibbonSideMode = "primary" | "cross";

type VoidOrbitalShardVisual = {
  axialAmplitude: number;
  axialPhase: number;
  axialSpeed: number;
  baseRadiusScale: number;
  baseLengthScale: number;
  flickerOpacityScale: number;
  flickerTimer: number;
  material: THREE.MeshBasicMaterial;
  orbitAxis: THREE.Vector3;
  orbitBasisU: THREE.Vector3;
  orbitBasisV: THREE.Vector3;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  spinSpeed: number;
  trailPhaseOffset: number;
  trailStrength: number;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
};

type VoidLaunchBurstParticle = {
  age: number;
  baseLengthScale: number;
  baseRadiusScale: number;
  lifetime: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  opacityScale: number;
  spinSpeed: number;
  velocityLocal: THREE.Vector3;
};

type BillboardVortexLayer = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  material: THREE.ShaderMaterial;
  baseScale: number;
  spinSpeed: number;
  spin: number;
};

export function createVoidSeekerFactory(
  options: VoidSeekerFactoryOptions = {}
): ProjectileFactory {
  const speed = Math.max(0.1, options.speed ?? 14);
  const lifetimeSeconds = Math.max(0.05, options.lifetimeSeconds ?? 2.8);
  const visualLength = Math.max(0.05, options.length ?? 0.52);
  const thickness = Math.max(0.02, options.thickness ?? 0.12);
  const damage = Math.max(0, options.damage ?? 14);
  const damageType: DamageType = options.damageType ?? "Void";
  const collisionRadius = Math.max(0.01, options.collisionRadius ?? Math.max(0.12, thickness * 0.95));
  const faction = options.faction ?? null;
  const homingTurnRateRadiansPerSecond = Math.max(
    THREE.MathUtils.degToRad(15),
    options.homingTurnRateRadiansPerSecond ?? THREE.MathUtils.degToRad(140)
  );
  const homingStrength = THREE.MathUtils.clamp(options.homingStrength ?? 1, 0, 1);
  const trailPointCount = Math.max(6, Math.floor(options.trailPointCount ?? 14));
  const trailMaxLength = Math.max(visualLength * 2, options.trailMaxLength ?? visualLength * 6.8);
  const trailMinSampleDistance = Math.max(
    0.005,
    options.trailMinSampleDistance ?? Math.max(0.012, speed * 0.008)
  );
  const trailWidth = Math.max(0.012, options.trailWidth ?? thickness * 0.95);
  const trailGlowWidthMultiplier = Math.max(1, options.trailGlowWidthMultiplier ?? 1.18);
  const trailOpacity = THREE.MathUtils.clamp(options.trailOpacity ?? 0.72, 0.01, 1);
  const trailGlowOpacity = THREE.MathUtils.clamp(options.trailGlowOpacity ?? 0.78, 0.01, 1);
  const flareOpacity = THREE.MathUtils.clamp(options.flareOpacity ?? 0.82, 0.01, 1);
  const flareSizeMultiplier = Math.max(0.5, options.flareSizeMultiplier ?? 4.4);
  const headVisualScale = 0.5;
  const orbDiameterWorld = 0.05;
  const orbDiameterLocal = orbDiameterWorld / headVisualScale;
  const outlineThicknessWorld = 0.1;
  const outlineDiameterWorld = orbDiameterWorld + outlineThicknessWorld * 2;
  const outlineScaleRelativeToOrb = outlineDiameterWorld / Math.max(0.0001, orbDiameterWorld);

  // Match the voidbolt palette: dark void core + violet shell + blue-violet highlights.
  const orbCoreColor = new THREE.Color(0x09050f);
  const orbShellColor = new THREE.Color(0x130a22);
  const orbGlowColor = new THREE.Color(0x8ca2ff);
  const trailColor = new THREE.Color(0x000000);
  const trailGlowColor = new THREE.Color(0xefe6ff);
  const voidOrbitalShardColor = new THREE.Color(0x32204c);

  const fallbackGeometry = new THREE.SphereGeometry(Math.max(0.01, orbDiameterLocal * 0.5), 16, 12);
  const coreMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbCoreColor,
    transparent: true,
    opacity: 0.92,
    blending: THREE.NormalBlending,
    depthWrite: false,
    toneMapped: false
  });
  const shellMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbShellColor,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const glowMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.08,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    toneMapped: false
  });
  const glowOutlineMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: ORB_RIM_OUTLINE_VERTEX_SHADER,
    fragmentShader: ORB_RIM_OUTLINE_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uOpacity: { value: 0.8 },
      uRimPower: { value: 1.45 },
      uRimThreshold: { value: 0.2 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false
  });

  const trailCoreMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX_SHADER,
    fragmentShader: TRAIL_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Vector3(trailColor.r, trailColor.g, trailColor.b) },
      uOpacity: { value: trailOpacity },
      uTailFade: { value: 1 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const trailGlowMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX_SHADER,
    fragmentShader: TRAIL_OUTLINE_FRAGMENT_SHADER,
    uniforms: {
      uColor: { value: new THREE.Vector3(trailGlowColor.r, trailGlowColor.g, trailGlowColor.b) },
      uOpacity: { value: trailGlowOpacity },
      uTailFade: { value: 1 }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide
  });

  const flareTexture = createVoidVortexTexture();
  const flareMaterialTemplate = new THREE.SpriteMaterial({
    map: flareTexture,
    color: 0x2a123f,
    transparent: true,
    opacity: flareOpacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const voidShardGeometry = new THREE.ConeGeometry(
    Math.max(0.014, thickness * 0.36),
    Math.max(0.03, visualLength * 0.28),
    7,
    1
  );
  const voidLaunchBurstGeometry = new THREE.ConeGeometry(
    Math.max(0.004, thickness * 0.12),
    Math.max(0.015, visualLength * 0.18),
    6,
    1
  );
  const voidShardMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x3a2356,
    transparent: true,
    opacity: 0.9,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const voidLaunchBurstMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x09060f,
    transparent: true,
    opacity: 0.7,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const vortexPlaneGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const vortexMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: VORTEX_BILLBOARD_VERTEX_SHADER,
    fragmentShader: VORTEX_BILLBOARD_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: flareOpacity * 0.9 },
      uArms: { value: 22 },
      uDarkColor: { value: new THREE.Vector3(0.04, 0.02, 0.08) },
      uLightColor: { value: new THREE.Vector3(0.40, 0.22, 0.72) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const vortexOutlineMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: VORTEX_BILLBOARD_VERTEX_SHADER,
    fragmentShader: VORTEX_BILLBOARD_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: flareOpacity * 0.34 },
      uArms: { value: 28 },
      uDarkColor: { value: new THREE.Vector3(0.18, 0.14, 0.26) },
      uLightColor: { value: new THREE.Vector3(0.98, 0.96, 1.0) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const spiralVortexBillboardGeometry = new THREE.PlaneGeometry(1, 1, 44, 44);
  const spiralVortexMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: SPIRAL_VORTEX_VERTEX_SHADER,
    fragmentShader: SPIRAL_VORTEX_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1.05 },
      uTwistStrength: { value: 1.25 },
      uDepthWarp: { value: 0.16 },
      uDarkColor: { value: new THREE.Vector3(0.07, 0.02, 0.12) },
      uMidColor: { value: new THREE.Vector3(0.42, 0.14, 0.60) },
      uBrightColor: { value: new THREE.Vector3(0.92, 0.68, 1.0) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const loader = new GLTFLoader();
  const shotQuaternion = new THREE.Quaternion();
  let modelTemplate: THREE.Object3D | null = null;
  let disposed = false;

  if (options.modelUrl) {
    loader.load(
      options.modelUrl,
      (gltf) => {
        if (disposed) {
          disposeObjectResources(gltf.scene);
          return;
        }
        modelTemplate = normalizeTemplateToDiameter(gltf.scene, orbDiameterLocal);
      },
      undefined,
      (error) => {
        console.warn("Void seeker model failed to load, using fallback orb.", error);
      }
    );
  }

  const spawn = ({
    direction,
    origin,
    homingTargetHurtbox = null
  }: ProjectileSpawnParams): ProjectileInstance => {
    const projectileGroup = new THREE.Group();
    const headVisualRoot = new THREE.Group();
    headVisualRoot.scale.setScalar(headVisualScale);
    projectileGroup.add(headVisualRoot);
    const projectileDirection = direction.clone();
    if (projectileDirection.lengthSq() <= 0.000001) {
      projectileDirection.copy(PROJECTILE_FORWARD);
    } else {
      projectileDirection.normalize();
    }

    projectileGroup.position.copy(origin);
    shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, projectileDirection);
    projectileGroup.quaternion.copy(shotQuaternion);

    const coreMaterial = coreMaterialTemplate.clone();
    const shellMaterial = shellMaterialTemplate.clone();
    const glowMaterial = glowMaterialTemplate.clone();
    const glowOutlineMaterial = glowOutlineMaterialTemplate.clone();

    const coreVisual = modelTemplate ? modelTemplate.clone(true) : new THREE.Mesh(fallbackGeometry, coreMaterial);
    assignMaterialToMeshes(coreVisual, coreMaterial);
    setRenderOrderRecursive(coreVisual, 10);
    headVisualRoot.add(coreVisual);

    const shellVisual = coreVisual.clone(true);
    assignMaterialToMeshes(shellVisual, shellMaterial);
    shellVisual.scale.multiplyScalar(1.01);
    setRenderOrderRecursive(shellVisual, 9);
    headVisualRoot.add(shellVisual);
    shellVisual.visible = false;

    const glowVisual = coreVisual.clone(true);
    assignMaterialToMeshes(glowVisual, glowMaterial);
    glowVisual.scale.multiplyScalar(1.016);
    setRenderOrderRecursive(glowVisual, 8);
    headVisualRoot.add(glowVisual);
    glowVisual.visible = false;
    const glowOutlineVisual = coreVisual.clone(true);
    assignMaterialToMeshes(glowOutlineVisual, glowOutlineMaterial);
    glowOutlineVisual.scale.multiplyScalar(outlineScaleRelativeToOrb);
    setRenderOrderRecursive(glowOutlineVisual, 7);
    headVisualRoot.add(glowOutlineVisual);
    glowOutlineVisual.visible = true;
    const coreBaseScale = coreVisual.scale.clone();
    const shellBaseScale = shellVisual.scale.clone();
    const glowBaseScale = glowVisual.scale.clone();
    const glowOutlineBaseScale = glowOutlineVisual.scale.clone();

    const flareMaterialA = flareMaterialTemplate.clone();
    flareMaterialA.color = flareMaterialA.color.clone();
    flareMaterialA.color.set(0xb178ff);
    const flareMaterialB = flareMaterialTemplate.clone();
    flareMaterialB.color = flareMaterialB.color.clone();
    flareMaterialB.color.set(0xffffff);
    flareMaterialB.opacity = flareOpacity * 0.38;
    const flareA = new THREE.Sprite(flareMaterialA);
    const flareB = new THREE.Sprite(flareMaterialB);
    const flareSize = Math.max(0.2, thickness * flareSizeMultiplier);
    const spiralOutlineSize = (outlineDiameterWorld / headVisualScale) * 1.08;
    flareA.scale.set(spiralOutlineSize, spiralOutlineSize, 1);
    flareB.scale.set(flareSize * 1.28, flareSize * 1.28, 1);
    flareA.center.set(0.5, 0.5);
    flareB.center.set(0.5, 0.5);
    flareA.material.rotation = Math.PI * 0.08;
    flareB.material.rotation = Math.PI * 0.17;
    flareA.renderOrder = 14;
    flareB.renderOrder = 13;
    flareA.visible = false;
    flareB.visible = false;
    headVisualRoot.add(flareA);
    headVisualRoot.add(flareB);

    const spiralVortexMaterial = spiralVortexMaterialTemplate.clone();
    spiralVortexMaterial.uniforms = THREE.UniformsUtils.clone(spiralVortexMaterialTemplate.uniforms);
    const spiralVortexMesh = new THREE.Mesh(spiralVortexBillboardGeometry, spiralVortexMaterial);
    spiralVortexMesh.renderOrder = 15;
    spiralVortexMesh.frustumCulled = false;
    let spiralVortexSpin = 0;
    spiralVortexMesh.onBeforeRender = (_renderer, _scene, camera) => {
      spiralVortexMesh.quaternion.copy(camera.quaternion);
      spiralVortexMesh.rotateZ(spiralVortexSpin);
    };
    const spiralVortexBaseScale = (outlineDiameterWorld / headVisualScale) * 1.42;
    spiralVortexMesh.scale.setScalar(spiralVortexBaseScale);
    headVisualRoot.add(spiralVortexMesh);
    spiralVortexMesh.visible = false;
    const outlineOuterRadiusLocal = (outlineDiameterWorld / headVisualScale) * 0.5;
    const shardArmMinRadiusLocal = outlineOuterRadiusLocal + 0.09;
    const shardArmMaxRadiusLocal = outlineOuterRadiusLocal + 0.42;

    const vortexLayers: BillboardVortexLayer[] = [];
    const createBillboardVortexLayer = (
      materialTemplate: THREE.ShaderMaterial,
      scaleMultiplier: number,
      spinSpeed: number,
      renderOrder: number
    ): BillboardVortexLayer => {
      const material = materialTemplate.clone();
      material.uniforms = THREE.UniformsUtils.clone(materialTemplate.uniforms);
      const mesh = new THREE.Mesh(vortexPlaneGeometry, material);
      mesh.renderOrder = renderOrder;
      mesh.frustumCulled = false;
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        mesh.quaternion.copy(camera.quaternion);
        mesh.rotateZ(layer.spin);
      };
      const layer: BillboardVortexLayer = {
        mesh,
        material,
        baseScale: flareSize * scaleMultiplier,
        spinSpeed,
        spin: 0
      };
      return layer;
    };
    const vortexLayerA = createBillboardVortexLayer(vortexMaterialTemplate, 1.1, 4.8, 15);
    const vortexLayerB = createBillboardVortexLayer(vortexOutlineMaterialTemplate, 1.34, -3.4, 16);
    vortexLayers.push(vortexLayerA, vortexLayerB);
    headVisualRoot.add(vortexLayerA.mesh);
    headVisualRoot.add(vortexLayerB.mesh);
    vortexLayerA.mesh.visible = false;
    vortexLayerB.mesh.visible = false;

    const shardBaseAxis = new THREE.Vector3(0, 1, 0);
    const shardHelperAxisA = new THREE.Vector3(0, 1, 0);
    const shardHelperAxisB = new THREE.Vector3(1, 0, 0);
    const shardDirection = new THREE.Vector3();
    const shardOrbitPlanar = new THREE.Vector3();
    const shardOrbitPosition = new THREE.Vector3();
    const shardFallbackDirection = new THREE.Vector3(0, 1, 0);
    const shardQuat = new THREE.Quaternion();
    const voidOrbitalShards: VoidOrbitalShardVisual[] = [];
    const launchBurstParticles: VoidLaunchBurstParticle[] = [];
    const launchBurstRoot = new THREE.Group();
    projectileGroup.add(launchBurstRoot);
    const launchBurstCount = 0;
    for (let i = 0; i < launchBurstCount; i += 1) {
      const burstMaterial = voidLaunchBurstMaterialTemplate.clone();
      burstMaterial.color = burstMaterial.color.clone();
      if (Math.random() < 0.34) {
        burstMaterial.color.set(0xf2eeff);
      } else {
        burstMaterial.color.set(0x150d22);
        burstMaterial.color.lerp(new THREE.Color(0x352050), randomRange(0.18, 0.62));
      }
      burstMaterial.opacity = randomRange(0.58, 0.95);
      const burstMesh = new THREE.Mesh(voidLaunchBurstGeometry, burstMaterial);
      burstMesh.renderOrder = 16;
      burstMesh.frustumCulled = false;
      burstMesh.position.set(
        randomRange(-0.05, 0.05),
        randomRange(-0.05, 0.05),
        randomRange(-0.08, 0.02)
      );
      launchBurstRoot.add(burstMesh);

      const velocityLocal = new THREE.Vector3(
        randomRange(-0.32, 0.32),
        randomRange(-0.32, 0.32),
        randomRange(speed * 0.35, speed * 1.05)
      );
      launchBurstParticles.push({
        age: 0,
        baseLengthScale: randomRange(0.95, 1.7),
        baseRadiusScale: randomRange(0.9, 1.55),
        lifetime: randomRange(0.12, 0.24),
        material: burstMaterial,
        mesh: burstMesh,
        opacityScale: randomRange(0.7, 1.0),
        spinSpeed: randomRange(4, 12) * (Math.random() < 0.5 ? -1 : 1),
        velocityLocal
      });
    }
    const voidShardCount = 16;
    const orbitStartLengthOffset = visualLength * 0.3;
    const orbitShardSpeedBase = 10.2;
    const orbitShardTrailLengthMultiplier = 0.5;
    const orbitShardSizeMultiplier = 1.14;
    const orbitShardThicknessMultiplier = 1.2;
    for (let i = 0; i < voidShardCount; i += 1) {
      const shardMaterial = voidShardMaterialTemplate.clone();
      shardMaterial.color = shardMaterial.color.clone();
      shardMaterial.color.copy(voidOrbitalShardColor);
      shardMaterial.color.offsetHSL(
        randomRange(-0.012, 0.012),
        randomRange(-0.02, 0.02),
        randomRange(-0.045, 0.02)
      );
      shardMaterial.opacity = randomRange(0.7, 1.0);
      const shardMesh = new THREE.Mesh(voidShardGeometry, shardMaterial);
      shardMesh.renderOrder = 8;
      shardMesh.frustumCulled = false;
      headVisualRoot.add(shardMesh);
      const orbitAxis = randomUnitVector();
      const helperAxis = Math.abs(orbitAxis.y) < 0.92 ? shardHelperAxisA : shardHelperAxisB;
      const orbitBasisU = helperAxis.clone().cross(orbitAxis).normalize();
      const orbitBasisV = orbitAxis.clone().cross(orbitBasisU).normalize();
      voidOrbitalShards.push({
        axialAmplitude: randomRange(0.01, 0.04),
        axialPhase: Math.random() * Math.PI * 2,
        axialSpeed: randomRange(7.5, 13.5),
        baseRadiusScale: randomRange(1.0, 1.7),
        baseLengthScale: randomRange(0.42, 0.86),
        flickerOpacityScale: randomRange(0.65, 1),
        flickerTimer: randomRange(0.015, 0.085),
        material: shardMaterial,
        orbitAxis,
        orbitBasisU,
        orbitBasisV,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: randomRange(shardArmMinRadiusLocal * 0.95, shardArmMaxRadiusLocal * 0.9),
        orbitSpeed: orbitShardSpeedBase * randomRange(0.75, 1.3),
        phase: Math.random() * Math.PI * 2,
        spinSpeed: randomRange(5, 12),
        trailPhaseOffset: Math.random(),
        trailStrength: randomRange(1.0, 1.55),
        mesh: shardMesh
      });
      shardDirection.copy(orbitBasisU);
      shardQuat.setFromUnitVectors(shardBaseAxis, shardDirection);
      shardMesh.quaternion.copy(shardQuat);
    }

    const trailRoot = new THREE.Group();
    trailRoot.visible = true;
    projectileGroup.add(trailRoot);
    const trailCoreMaterialA = trailCoreMaterialTemplate.clone();
    const trailGlowMaterialA = trailGlowMaterialTemplate.clone();
    const trailCoreMaterialB = trailCoreMaterialTemplate.clone();
    const trailGlowMaterialB = trailGlowMaterialTemplate.clone();
    trailCoreMaterialB.uniforms.uOpacity.value = trailOpacity * 0.8;
    trailGlowMaterialB.uniforms.uOpacity.value = trailGlowOpacity * 0.9;
    const trailCoreA = createRibbonTrailRenderable(trailPointCount, trailCoreMaterialA);
    const trailGlowA = createRibbonTrailRenderable(trailPointCount, trailGlowMaterialA);
    const trailCoreB = createRibbonTrailRenderable(trailPointCount, trailCoreMaterialB);
    const trailGlowB = createRibbonTrailRenderable(trailPointCount, trailGlowMaterialB);
    trailCoreA.mesh.renderOrder = 4;
    trailGlowA.mesh.renderOrder = 3;
    trailCoreB.mesh.renderOrder = 4;
    trailGlowB.mesh.renderOrder = 3;
    trailRoot.add(trailGlowA.mesh);
    trailRoot.add(trailGlowB.mesh);
    trailRoot.add(trailCoreA.mesh);
    trailRoot.add(trailCoreB.mesh);

    const historyWorld: THREE.Vector3[] = [
      origin.clone(),
      origin.clone().addScaledVector(projectileDirection, -Math.max(trailMinSampleDistance * 0.9, visualLength * 0.22)),
      origin.clone().addScaledVector(projectileDirection, -Math.max(trailMinSampleDistance * 1.8, visualLength * 0.5))
    ];
    let currentDirection = projectileDirection.clone();
    let velocity = currentDirection.clone().multiplyScalar(speed);
    const homingTarget: HurtboxComponent | null = homingTargetHurtbox?.canReceiveDamage()
      ? homingTargetHurtbox
      : null;
    const targetCenterWorld = new THREE.Vector3();
    const desiredDirection = new THREE.Vector3();
    const localPoint = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const crossSide = new THREE.Vector3();
    const prevPoint = new THREE.Vector3();
    const nextPoint = new THREE.Vector3();
    const fallbackSide = new THREE.Vector3(1, 0, 0);
    let lifeRemaining = lifetimeSeconds;
    let pulseOffset = Math.random() * Math.PI * 2;

    const hitbox = createHitboxComponent({
      owner: projectileGroup,
      collisionArea: { radius: collisionRadius },
      damageAmount: damage,
      damageType,
      additionalDamageSegments: options.additionalDamageSegments,
      sourceFaction: faction
    });

    const syncTrail = (visualFade: number): void => {
      projectileGroup.getWorldPosition(targetCenterWorld);
      if (historyWorld.length <= 0) {
        historyWorld.push(targetCenterWorld.clone());
      }

      const head = historyWorld[0];
      if (!head || head.distanceToSquared(targetCenterWorld) >= trailMinSampleDistance * trailMinSampleDistance) {
        historyWorld.unshift(targetCenterWorld.clone());
      } else {
        head.copy(targetCenterWorld);
      }

      for (let i = 0; i < historyWorld.length - 1; i += 1) {
        const a = historyWorld[i];
        const b = historyWorld[i + 1];
        if (!a || !b) {
          continue;
        }
      }
      let cumulative = 0;
      for (let i = 0; i < historyWorld.length - 1; i += 1) {
        cumulative += historyWorld[i].distanceTo(historyWorld[i + 1]);
        if (cumulative <= trailMaxLength) {
          continue;
        }
        const keepTo = i + 1;
        historyWorld.length = keepTo + 1;
        break;
      }
      while (historyWorld.length < 3) {
        historyWorld.push(
          historyWorld[historyWorld.length - 1]
            .clone()
            .addScaledVector(currentDirection, -Math.max(0.03, trailMinSampleDistance))
        );
      }

      updateRibbonTrail(
        trailCoreA,
        historyWorld,
        projectileGroup,
        currentDirection,
        "primary",
        trailWidth,
        localPoint,
        tangent,
        side,
        crossSide,
        prevPoint,
        nextPoint,
        fallbackSide
      );
      updateRibbonTrail(
        trailGlowA,
        historyWorld,
        projectileGroup,
        currentDirection,
        "primary",
        trailWidth * trailGlowWidthMultiplier,
        localPoint,
        tangent,
        side,
        crossSide,
        prevPoint,
        nextPoint,
        fallbackSide
      );
      updateRibbonTrail(
        trailCoreB,
        historyWorld,
        projectileGroup,
        currentDirection,
        "cross",
        trailWidth,
        localPoint,
        tangent,
        side,
        crossSide,
        prevPoint,
        nextPoint,
        fallbackSide
      );
      updateRibbonTrail(
        trailGlowB,
        historyWorld,
        projectileGroup,
        currentDirection,
        "cross",
        trailWidth * trailGlowWidthMultiplier,
        localPoint,
        tangent,
        side,
        crossSide,
        prevPoint,
        nextPoint,
        fallbackSide
      );
      trailCoreMaterialA.uniforms.uTailFade.value = visualFade;
      trailGlowMaterialA.uniforms.uTailFade.value = visualFade;
      trailCoreMaterialB.uniforms.uTailFade.value = visualFade;
      trailGlowMaterialB.uniforms.uTailFade.value = visualFade;
    };

    syncTrail(1);

    return {
      object: projectileGroup,
      hitbox,
      effectScale: 1.15,
      hitEffectId: "voidseeker_orb_implosion_shards",
      muzzleEffectId: "voidseeker_shadow_burst",
      suppressMuzzleFx: true,
      suppressHitFx: false,
      update: (deltaTime: number): boolean => {
        if (deltaTime <= 0) {
          return lifeRemaining > 0;
        }
        lifeRemaining -= deltaTime;

        if (homingTarget && homingTarget.canReceiveDamage()) {
          homingTarget.getWorldCenter(targetCenterWorld);
          targetCenterWorld.y = projectileGroup.position.y;
          desiredDirection.subVectors(targetCenterWorld, projectileGroup.position);
          if (desiredDirection.lengthSq() > 0.000001) {
            desiredDirection.normalize();
            const angle = currentDirection.angleTo(desiredDirection);
            if (angle > 0.00001) {
              const maxStep = homingTurnRateRadiansPerSecond * homingStrength * deltaTime;
              if (angle > maxStep && maxStep > 0) {
                currentDirection.lerp(desiredDirection, THREE.MathUtils.clamp(maxStep / angle, 0, 1)).normalize();
              } else {
                currentDirection.copy(desiredDirection);
              }
              shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, currentDirection);
              projectileGroup.quaternion.copy(shotQuaternion);
              velocity.copy(currentDirection).multiplyScalar(speed);
            }
          }
        }

        projectileGroup.position.addScaledVector(velocity, deltaTime);

        const ageSeconds = Math.max(0, lifetimeSeconds - lifeRemaining);
        const endFade = THREE.MathUtils.clamp(lifeRemaining / Math.max(0.001, Math.min(0.35, lifetimeSeconds)), 0, 1);
        const pulse = 0.78 + 0.22 * Math.sin(ageSeconds * 18 + pulseOffset);
        coreMaterial.opacity = (0.68 + 0.12 * pulse) * endFade;
        shellMaterial.opacity = 0;
        glowMaterial.opacity = 0;
        glowOutlineMaterial.uniforms.uOpacity.value = (0.72 + 0.4 * pulse) * endFade;
        flareMaterialA.opacity = 0;
        flareMaterialB.opacity = 0;
        spiralVortexMaterial.uniforms.uTime.value = ageSeconds;
        spiralVortexMaterial.uniforms.uOpacity.value = 0;
        spiralVortexMaterial.uniforms.uTwistStrength.value = 0;
        spiralVortexMaterial.uniforms.uDepthWarp.value = 0;

        const corePulseScale = 0.98 + pulse * 0.06;
        coreVisual.scale.copy(coreBaseScale).multiplyScalar(corePulseScale);
        shellVisual.scale.copy(shellBaseScale).multiplyScalar(0.998 + pulse * 0.006);
        glowVisual.scale.copy(glowBaseScale).multiplyScalar(0.998 + pulse * 0.004);
        glowOutlineVisual.scale.copy(glowOutlineBaseScale);
        spiralVortexMesh.scale.setScalar(spiralVortexBaseScale);
        flareA.material.rotation = ageSeconds * 1.6;
        flareA.scale.setScalar(spiralOutlineSize * (0.99 + pulse * 0.02));
        flareB.scale.setScalar(flareSize);
        const vortexPulse = 0.88 + pulse * 0.18;
        for (const layer of vortexLayers) {
          layer.spin += deltaTime * layer.spinSpeed;
          layer.material.uniforms.uTime.value = ageSeconds;
          layer.material.uniforms.uOpacity.value = 0;
          const scale = layer.baseScale * vortexPulse * (layer === vortexLayerB ? 1.03 : 0.98);
          layer.mesh.scale.setScalar(scale);
        }
        for (const burst of launchBurstParticles) {
          burst.age += deltaTime;
          const t = THREE.MathUtils.clamp(burst.age / Math.max(0.0001, burst.lifetime), 0, 1);
          const alive = t < 1;
          burst.mesh.visible = alive;
          if (!alive) {
            burst.material.opacity = 0;
            continue;
          }

          const fade = 1 - t;
          burst.velocityLocal.multiplyScalar(Math.max(0, 1 - deltaTime * 7.5));
          burst.mesh.position.addScaledVector(burst.velocityLocal, deltaTime);

          shardDirection.copy(burst.velocityLocal);
          if (shardDirection.lengthSq() <= 0.000001) {
            shardDirection.set(0, 0, 1);
          } else {
            shardDirection.normalize();
          }
          shardQuat.setFromUnitVectors(shardBaseAxis, shardDirection);
          burst.mesh.quaternion.copy(shardQuat);
          burst.mesh.rotateY(ageSeconds * burst.spinSpeed);

          const burstScale = 1.18 + t * 1.1;
          burst.mesh.scale.set(
            burst.baseRadiusScale * burstScale,
            burst.baseLengthScale * (1.35 + t * 1.05),
            burst.baseRadiusScale * burstScale
          );
          burst.material.opacity = burst.opacityScale * (fade * fade) * (0.9 + 0.22 * pulse) * endFade;
        }
        if (voidOrbitalShards.length > 0) {
          const projectileSpeed = velocity.length();
          const velocityTrailBase =
            visualLength *
            (0.56 + 1.95 * THREE.MathUtils.clamp(projectileSpeed / 18, 0, 2)) *
            orbitShardTrailLengthMultiplier;
          for (const shard of voidOrbitalShards) {
            shard.orbitAngle += shard.orbitSpeed * deltaTime;
            const radialCos = Math.cos(shard.orbitAngle) * shard.orbitRadius;
            const radialSin = Math.sin(shard.orbitAngle) * shard.orbitRadius;
            const axial = Math.sin(ageSeconds * shard.axialSpeed + shard.axialPhase) * shard.axialAmplitude;

            shardOrbitPlanar
              .copy(shard.orbitBasisU)
              .multiplyScalar(radialCos)
              .addScaledVector(shard.orbitBasisV, radialSin);
            shardOrbitPosition.copy(shardOrbitPlanar).addScaledVector(shard.orbitAxis, axial);
            shardOrbitPosition.z += orbitStartLengthOffset;
            const spiral01 = THREE.MathUtils.euclideanModulo(
              shard.orbitAngle / (Math.PI * 2) + shard.trailPhaseOffset,
              1
            );
            shardOrbitPosition.z -= velocityTrailBase * spiral01 * shard.trailStrength;
            shard.mesh.position.copy(shardOrbitPosition);

            shardDirection.copy(shardOrbitPosition);
            if (shardDirection.lengthSq() <= 0.000001) {
              shardDirection.copy(shardFallbackDirection);
            } else {
              shardDirection.normalize();
            }
            shardQuat.setFromUnitVectors(shardBaseAxis, shardDirection);
            shard.mesh.quaternion.copy(shardQuat);
            shard.mesh.rotateY(ageSeconds * shard.spinSpeed + shard.phase);

            shard.flickerTimer -= deltaTime;
            if (shard.flickerTimer <= 0) {
              shard.flickerTimer = randomRange(0.015, 0.085);
              shard.flickerOpacityScale =
                Math.random() > 0.35 ? randomRange(0.62, 1.0) : randomRange(0.08, 0.3);
            }

            const shardPulse = 0.55 + 0.45 * Math.abs(Math.sin(ageSeconds * 15.5 + shard.phase));
            const radialScale =
              shard.baseRadiusScale *
              (1.02 + shardPulse * 0.78) *
              orbitShardSizeMultiplier *
              (orbitShardThicknessMultiplier * 1.28);
            const lengthScale =
              shard.baseLengthScale *
              (0.58 + shardPulse * 0.38) *
              (orbitShardSizeMultiplier * 1.04);
            shard.mesh.scale.set(radialScale, lengthScale, radialScale);
            shard.material.opacity = Math.min(0.95, shard.flickerOpacityScale * (0.72 + 0.16 * pulse) * endFade);
          }
        }

        syncTrail(endFade);
        return lifeRemaining > 0;
      },
      dispose: () => {
        coreMaterial.dispose();
        shellMaterial.dispose();
        glowMaterial.dispose();
        glowOutlineMaterial.dispose();
        for (const layer of vortexLayers) {
          layer.material.dispose();
        }
        spiralVortexMaterial.dispose();
        flareMaterialA.dispose();
        flareMaterialB.dispose();
        for (const burst of launchBurstParticles) {
          burst.material.dispose();
        }
        for (const shard of voidOrbitalShards) {
          shard.material.dispose();
        }
        trailCoreA.geometry.dispose();
        trailGlowA.geometry.dispose();
        trailCoreB.geometry.dispose();
        trailGlowB.geometry.dispose();
        trailCoreMaterialA.dispose();
        trailGlowMaterialA.dispose();
        trailCoreMaterialB.dispose();
        trailGlowMaterialB.dispose();
      }
    };
  };

  return {
    spawn,
    dispose: () => {
      disposed = true;
      if (modelTemplate) {
        disposeObjectResources(modelTemplate);
      }
      fallbackGeometry.dispose();
      coreMaterialTemplate.dispose();
      shellMaterialTemplate.dispose();
      glowMaterialTemplate.dispose();
      glowOutlineMaterialTemplate.dispose();
      trailCoreMaterialTemplate.dispose();
      trailGlowMaterialTemplate.dispose();
      flareMaterialTemplate.dispose();
      voidShardGeometry.dispose();
      voidLaunchBurstGeometry.dispose();
      voidShardMaterialTemplate.dispose();
      voidLaunchBurstMaterialTemplate.dispose();
      vortexPlaneGeometry.dispose();
      vortexMaterialTemplate.dispose();
      vortexOutlineMaterialTemplate.dispose();
      spiralVortexBillboardGeometry.dispose();
      spiralVortexMaterialTemplate.dispose();
      flareTexture.dispose();
    }
  };
}

function createRibbonTrailRenderable(
  maxPoints: number,
  material: THREE.ShaderMaterial
): RibbonTrailRenderable {
  const vertexCount = maxPoints * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  for (let i = 0; i < maxPoints; i += 1) {
    const vertexOffset = i * 2;
    const uvOffset = i * 4;
    const t = maxPoints <= 1 ? 0 : i / (maxPoints - 1);
    uvs[uvOffset + 0] = 0;
    uvs[uvOffset + 1] = t;
    uvs[uvOffset + 2] = 1;
    uvs[uvOffset + 3] = t;

    if (i >= maxPoints - 1) {
      continue;
    }
    const nextOffset = vertexOffset + 2;
    indices.push(
      vertexOffset,
      nextOffset,
      vertexOffset + 1,
      vertexOffset + 1,
      nextOffset,
      nextOffset + 1
    );
  }

  const geometry = new THREE.BufferGeometry();
  const positionsAttribute = new THREE.BufferAttribute(positions, 3);
  const uvsAttribute = new THREE.BufferAttribute(uvs, 2);
  geometry.setAttribute("position", positionsAttribute);
  geometry.setAttribute("uv", uvsAttribute);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    geometry,
    positions,
    uvs,
    mesh,
    positionsAttribute,
    uvsAttribute
  };
}

function updateRibbonTrail(
  ribbon: RibbonTrailRenderable,
  historyWorld: readonly THREE.Vector3[],
  projectileGroup: THREE.Group,
  forwardFallback: THREE.Vector3,
  sideMode: RibbonSideMode,
  baseWidth: number,
  localPoint: THREE.Vector3,
  tangent: THREE.Vector3,
  side: THREE.Vector3,
  crossSide: THREE.Vector3,
  prevPoint: THREE.Vector3,
  nextPoint: THREE.Vector3,
  fallbackSide: THREE.Vector3
): void {
  const maxPoints = ribbon.positions.length / 6;
  const pointCount = Math.max(2, Math.min(historyWorld.length, maxPoints));

  for (let i = 0; i < pointCount; i += 1) {
    const current = historyWorld[i] ?? historyWorld[historyWorld.length - 1];
    const prev = historyWorld[Math.max(0, i - 1)] ?? current;
    const next = historyWorld[Math.min(historyWorld.length - 1, i + 1)] ?? current;
    prevPoint.copy(prev);
    nextPoint.copy(next);
    tangent.subVectors(prevPoint, nextPoint);
    if (tangent.lengthSq() <= 0.000001) {
      tangent.copy(forwardFallback);
    }
    tangent.normalize();

    side.copy(WORLD_UP).cross(tangent);
    if (side.lengthSq() <= 0.000001) {
      side.copy(fallbackSide);
    } else {
      side.normalize();
    }
    if (sideMode === "cross") {
      crossSide.copy(tangent).cross(side);
      if (crossSide.lengthSq() > 0.000001) {
        crossSide.normalize();
        side.copy(crossSide);
      }
    }

    localPoint.copy(current);
    projectileGroup.worldToLocal(localPoint);

    const t = pointCount <= 1 ? 0 : i / (pointCount - 1);
    const width = Math.max(baseWidth * 0.14, baseWidth * Math.pow(1 - t, 0.72));
    const left = localPoint.clone().addScaledVector(side, width * 0.5);
    const right = localPoint.clone().addScaledVector(side, -width * 0.5);

    const posOffset = i * 6;
    ribbon.positions[posOffset + 0] = left.x;
    ribbon.positions[posOffset + 1] = left.y;
    ribbon.positions[posOffset + 2] = left.z;
    ribbon.positions[posOffset + 3] = right.x;
    ribbon.positions[posOffset + 4] = right.y;
    ribbon.positions[posOffset + 5] = right.z;
  }

  const tailAnchor = historyWorld[Math.min(pointCount - 1, historyWorld.length - 1)] ?? historyWorld[0];
  if (tailAnchor) {
    localPoint.copy(tailAnchor);
    projectileGroup.worldToLocal(localPoint);
    for (let i = pointCount; i < maxPoints; i += 1) {
      const posOffset = i * 6;
      ribbon.positions[posOffset + 0] = localPoint.x;
      ribbon.positions[posOffset + 1] = localPoint.y;
      ribbon.positions[posOffset + 2] = localPoint.z;
      ribbon.positions[posOffset + 3] = localPoint.x;
      ribbon.positions[posOffset + 4] = localPoint.y;
      ribbon.positions[posOffset + 5] = localPoint.z;
    }
  }

  ribbon.positionsAttribute.needsUpdate = true;
  ribbon.geometry.setDrawRange(0, Math.max(0, (pointCount - 1) * 6));
}

function createVoidVortexTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  context.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  const drawSpiral = (rotation: number, color: string, lineWidth: number, alphaScale = 1): void => {
    context.save();
    context.rotate(rotation);
    context.strokeStyle = color;
    context.globalAlpha = alphaScale;
    context.lineWidth = lineWidth;
    context.beginPath();
    for (let s = 0; s <= 140; s += 1) {
      const t = s / 140;
      const a = t * Math.PI * 5.2;
      const r = size * (0.16 + t * 0.23);
      const wobble = Math.sin(t * Math.PI * 8.0) * size * 0.004;
      const x = Math.cos(a) * (r + wobble);
      const y = Math.sin(a) * (r + wobble);
      if (s === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
    context.restore();
  };

  for (let i = 0; i < 3; i += 1) {
    const rotation = (Math.PI * 2 * i) / 3;
    drawSpiral(rotation, "rgba(160,92,255,1.0)", size * 0.028, 0.75);
    drawSpiral(rotation, "rgba(255,255,255,1.0)", size * 0.008, 0.95);
  }

  context.globalAlpha = 1;
  context.strokeStyle = "rgba(210,180,255,0.85)";
  context.lineWidth = size * 0.012;
  context.beginPath();
  context.arc(0, 0, size * 0.39, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(255,255,255,0.7)";
  context.lineWidth = size * 0.005;
  context.beginPath();
  context.arc(0, 0, size * 0.39, 0, Math.PI * 2);
  context.stroke();

  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(0, 0, size * 0.14, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const edgeFade = context.createRadialGradient(cx, cy, size * 0.28, cx, cy, size * 0.5);
  edgeFade.addColorStop(0, "rgba(0,0,0,0)");
  edgeFade.addColorStop(0.82, "rgba(0,0,0,0)");
  edgeFade.addColorStop(1, "rgba(0,0,0,0.95)");
  context.fillStyle = edgeFade;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createSolarFlameTendrilTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  context.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const topY = size * 0.08;
  const bottomY = size * 0.92;
  const maxWidth = size * 0.15;

  const flameGradient = context.createLinearGradient(0, topY, 0, bottomY);
  flameGradient.addColorStop(0, "rgba(255,255,255,0)");
  flameGradient.addColorStop(0.18, "rgba(255,245,200,0.9)");
  flameGradient.addColorStop(0.45, "rgba(255,185,90,0.85)");
  flameGradient.addColorStop(0.78, "rgba(255,110,24,0.65)");
  flameGradient.addColorStop(1, "rgba(255,80,18,0)");

  context.fillStyle = flameGradient;
  context.beginPath();
  context.moveTo(cx, topY);
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12;
    const y = THREE.MathUtils.lerp(topY, bottomY, t);
    const wobble = Math.sin(t * Math.PI * 2.4) * maxWidth * (1 - t) * 0.7;
    const width = maxWidth * (0.25 + (1 - Math.abs(t - 0.45) * 1.4));
    context.lineTo(cx + wobble + width, y);
  }
  for (let i = 12; i >= 1; i -= 1) {
    const t = i / 12;
    const y = THREE.MathUtils.lerp(topY, bottomY, t);
    const wobble = Math.sin(t * Math.PI * 2.4) * maxWidth * (1 - t) * 0.7;
    const width = maxWidth * (0.25 + (1 - Math.abs(t - 0.45) * 1.4));
    context.lineTo(cx + wobble - width, y);
  }
  context.closePath();
  context.fill();

  const coreGradient = context.createLinearGradient(0, topY, 0, bottomY);
  coreGradient.addColorStop(0, "rgba(255,255,255,0)");
  coreGradient.addColorStop(0.2, "rgba(255,255,245,0.9)");
  coreGradient.addColorStop(0.5, "rgba(255,230,170,0.75)");
  coreGradient.addColorStop(1, "rgba(255,180,110,0)");
  context.fillStyle = coreGradient;
  context.beginPath();
  context.moveTo(cx, topY + size * 0.02);
  for (let i = 1; i <= 10; i += 1) {
    const t = i / 10;
    const y = THREE.MathUtils.lerp(topY + size * 0.02, bottomY - size * 0.06, t);
    const wobble = Math.sin(t * Math.PI * 2.8 + 0.9) * maxWidth * (1 - t) * 0.34;
    const width = maxWidth * (0.1 + (1 - Math.abs(t - 0.4) * 1.9)) * 0.48;
    context.lineTo(cx + wobble + width, y);
  }
  for (let i = 10; i >= 1; i -= 1) {
    const t = i / 10;
    const y = THREE.MathUtils.lerp(topY + size * 0.02, bottomY - size * 0.06, t);
    const wobble = Math.sin(t * Math.PI * 2.8 + 0.9) * maxWidth * (1 - t) * 0.34;
    const width = maxWidth * (0.1 + (1 - Math.abs(t - 0.4) * 1.9)) * 0.48;
    context.lineTo(cx + wobble - width, y);
  }
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function normalizeTemplateToDiameter(template: THREE.Object3D, targetDiameter: number): THREE.Object3D {
  const bounds = new THREE.Box3().setFromObject(template);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);
  template.scale.setScalar(targetDiameter / maxDimension);

  const centeredBounds = new THREE.Box3().setFromObject(template);
  const centered = centeredBounds.getCenter(new THREE.Vector3());
  template.position.sub(centered);
  return template;
}

function assignMaterialToMeshes(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.material = material;
  });
}

function setRenderOrderRecursive(object: THREE.Object3D, renderOrder: number): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Sprite) {
      node.renderOrder = renderOrder;
    }
  });
}

function disposeObjectResources(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.geometry.dispose();
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        material.dispose();
      }
    } else {
      node.material.dispose();
    }
  });
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
