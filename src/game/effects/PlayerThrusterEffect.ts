
import * as THREE from "three";

export type PlayerThrusterVisualPreset = "default" | "purple_rectangular";

export type PlayerThrusterEffectConfig = {
  thrusterLocalOffsets: readonly THREE.Vector3[];
  thrusterSizeScales?: readonly number[];
  effectScale?: number;
  trailLengthScale?: number;
  glowOpacityScale?: number;
  visualPreset?: PlayerThrusterVisualPreset;
};

export type PlayerThrusterEffect = {
  update: (deltaTime: number, intensityFactor: number) => void;
  dispose: () => void;
};

type ThrusterEmitter = {
  baseScale: number;
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  style: PlayerThrusterVisualPreset;
};

const CORE_RADIUS = 0.085;
const GLOW_RADIUS = 0.16;
const RECT_CORE_WIDTH = 0.11;
const RECT_CORE_HEIGHT = 0.22;
const RECT_CORE_LENGTH = 0.46;
const RECT_GLOW_WIDTH = 0.2;
const RECT_GLOW_HEIGHT = 0.34;
const RECT_GLOW_LENGTH = 0.76;
const PURPLE_RECT_GLOW_SCALE_MULTIPLIER = 0.62;
const PURPLE_RECT_GLOW_OPACITY_BASE = 0.12;
const PURPLE_RECT_GLOW_OPACITY_GAIN = 0.16;
const TRAIL_RADIUS_TOP = 0.08;
const TRAIL_RADIUS_BOTTOM = 0.22;
const TRAIL_ACTIVATION_THRESHOLD = 0.92;
const DEFAULT_EFFECT_SCALE = 1;
const DEFAULT_TRAIL_LENGTH_SCALE = 1;
const THRUSTER_PULSE_BASE = 1;
const THRUSTER_PULSE_AMPLITUDE = 0;

export function createPlayerThrusterEffect(
  shipRoot: THREE.Object3D,
  config: PlayerThrusterEffectConfig
): PlayerThrusterEffect {
  const root = new THREE.Group();
  shipRoot.add(root);
  const visualPreset = config.visualPreset ?? "default";
  const effectScale = Math.max(0.05, config.effectScale ?? DEFAULT_EFFECT_SCALE);
  const trailLengthScale = Math.max(0.05, config.trailLengthScale ?? DEFAULT_TRAIL_LENGTH_SCALE);
  const glowOpacityScale = Math.max(0.05, config.glowOpacityScale ?? 1);

  const coreGeometry =
    visualPreset === "purple_rectangular"
      ? new THREE.BoxGeometry(RECT_CORE_WIDTH, RECT_CORE_HEIGHT, RECT_CORE_LENGTH)
      : new THREE.SphereGeometry(CORE_RADIUS, 14, 14);
  const glowGeometry =
    visualPreset === "purple_rectangular"
      ? new THREE.BoxGeometry(RECT_GLOW_WIDTH, RECT_GLOW_HEIGHT, RECT_GLOW_LENGTH)
      : new THREE.SphereGeometry(GLOW_RADIUS, 12, 12);
  const trailGeometry = new THREE.CylinderGeometry(TRAIL_RADIUS_TOP, TRAIL_RADIUS_BOTTOM, 1, 14, 1, true);
  const emitters: ThrusterEmitter[] = [];

  for (let i = 0; i < config.thrusterLocalOffsets.length; i += 1) {
    const localOffset = config.thrusterLocalOffsets[i];
    const baseScale = Math.max(0.2, config.thrusterSizeScales?.[i] ?? 1) * effectScale;

    const emitterRoot = new THREE.Group();
    emitterRoot.position.copy(localOffset);
    root.add(emitterRoot);

    const coreColor = visualPreset === "purple_rectangular" ? 0xdf9bff : 0x9fe9ff;
    const glowColor = visualPreset === "purple_rectangular" ? 0x8f43ff : 0x2a8dff;
    const trailColor = visualPreset === "purple_rectangular" ? 0x7f35ff : 0x2a8dff;

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    const trailMaterial = new THREE.MeshBasicMaterial({
      color: trailColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.rotation.x = Math.PI * 0.5;
    trail.visible = false;
    emitterRoot.add(core);
    emitterRoot.add(glow);
    emitterRoot.add(trail);

    emitters.push({
      baseScale,
      core,
      glow,
      trail,
      style: visualPreset
    });
  }

  let time = 0;

  const update = (deltaTime: number, intensityFactor: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    time += deltaTime;
    const intensity = THREE.MathUtils.clamp(intensityFactor, 0, 1);

    for (let i = 0; i < emitters.length; i += 1) {
      const emitter = emitters[i];
      const pulse = THRUSTER_PULSE_BASE + Math.sin(time * 26 + i * 1.2) * THRUSTER_PULSE_AMPLITUDE;
      const coreScale = emitter.baseScale * (0.7 + intensity * 1.35) * pulse;
      let glowScale = emitter.baseScale * (1.1 + intensity * 1.7) * pulse;
      let glowOpacityBase = 0.28;
      let glowOpacityGain = 0.32;
      const trailVisibility = THREE.MathUtils.smoothstep(
        intensity,
        TRAIL_ACTIVATION_THRESHOLD,
        1
      );

      emitter.core.scale.setScalar(coreScale);
      if (emitter.style === "purple_rectangular") {
        glowScale *= PURPLE_RECT_GLOW_SCALE_MULTIPLIER;
        glowOpacityBase = PURPLE_RECT_GLOW_OPACITY_BASE;
        glowOpacityGain = PURPLE_RECT_GLOW_OPACITY_GAIN;
      }
      emitter.glow.scale.setScalar(glowScale);
      if (emitter.style === "purple_rectangular") {
        emitter.core.scale.y *= 1.2;
        emitter.glow.scale.y *= 1.12;
      }
      emitter.core.material.opacity = THREE.MathUtils.clamp(0.55 + intensity * 0.45, 0, 1);
      emitter.glow.material.opacity = THREE.MathUtils.clamp(
        (glowOpacityBase + intensity * glowOpacityGain) * glowOpacityScale,
        0,
        1
      );

      if (trailVisibility <= 0.001) {
        emitter.trail.visible = false;
      } else {
        const trailLength =
          emitter.baseScale * (0.55 + trailVisibility * 2.8) * pulse * trailLengthScale;
        const trailRadius = emitter.baseScale * (0.5 + trailVisibility * 0.5);
        emitter.trail.visible = true;
        emitter.trail.scale.set(trailRadius, trailLength, trailRadius);
        emitter.trail.position.set(0, 0, trailLength * 0.5);
        emitter.trail.material.opacity = THREE.MathUtils.clamp(0.08 + trailVisibility * 0.5, 0, 1);
      }
    }
  };

  const dispose = (): void => {
    for (const emitter of emitters) {
      emitter.core.material.dispose();
      emitter.glow.material.dispose();
      emitter.trail.material.dispose();
    }
    coreGeometry.dispose();
    glowGeometry.dispose();
    trailGeometry.dispose();
    root.removeFromParent();
  };

  return { update, dispose };
}
