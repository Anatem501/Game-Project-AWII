import * as THREE from "three";
import type { HealthSnapshot } from "../components/HealthComponent";

const SHIELD_SEGMENTS_WIDTH = 44;
const SHIELD_SEGMENTS_HEIGHT = 28;
const SHIELD_PADDING_XZ = 0.12;
const SHIELD_PADDING_Y = 0.08;
const SHIELD_MIN_RADIUS_XZ = 0.55;
const SHIELD_MIN_RADIUS_Y = 0.4;
const SHIELD_FIT_REFRESH_SECONDS = 0.35;
const SHIELD_RECHARGE_PULSE_SECONDS = 1;
const SHIELD_DAMAGE_FLASH_SECONDS = 0.5;
const SHIELD_INTENSITY_FADE_IN_SPEED = 10;
const SHIELD_INTENSITY_FADE_OUT_SPEED = 7;
const SHIELD_TRANSFORM_FOLLOW_SPEED = 8;

const SHIELD_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const SHIELD_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uIntensity;
uniform float uDamageRatio;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  float intensity = clamp(uIntensity, 0.0, 1.0);
  if (intensity <= 0.001) {
    discard;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 1.7);

  float scanlineA = 0.5 + 0.5 * sin(vLocalPos.y * 24.0 + uTime * 2.2);
  float scanlineB = 0.5 + 0.5 * sin((vLocalPos.x + vLocalPos.z) * 16.0 - uTime * 1.6);
  float scanlines = smoothstep(0.3, 0.95, mix(scanlineA, scanlineB, 0.45));
  float interference = 0.5 + 0.5 * sin((vLocalPos.x - vLocalPos.z) * 11.0 + uTime * 1.25);
  float hologram = smoothstep(0.2, 0.95, mix(scanlines, interference, 0.35));

  vec3 deepBlue = vec3(0.06, 0.27, 0.62);
  vec3 brightBlue = vec3(0.24, 0.72, 0.95);
  vec3 shieldColor = mix(deepBlue, brightBlue, hologram);

  float damageBoost = clamp(uDamageRatio, 0.0, 1.0);
  vec3 emissive = shieldColor * (0.2 + fresnel * 0.48 + hologram * 0.36 + damageBoost * 0.28);
  float alpha = intensity * (0.045 + fresnel * 0.2 + hologram * 0.12 + damageBoost * 0.1);
  alpha = min(alpha, 0.34);
  if (alpha <= 0.01) {
    discard;
  }

  gl_FragColor = vec4(emissive, alpha);
}
`;

export type ShieldBubbleEffect = {
  update: (deltaTime: number, healthSnapshot: HealthSnapshot) => void;
  getCollisionArea: () => { localOffset: THREE.Vector3; radius: number };
  dispose: () => void;
};

export function createShieldBubbleEffect(shipRoot: THREE.Object3D): ShieldBubbleEffect {
  const geometry = new THREE.SphereGeometry(1, SHIELD_SEGMENTS_WIDTH, SHIELD_SEGMENTS_HEIGHT);
  const material = new THREE.ShaderMaterial({
    vertexShader: SHIELD_VERTEX_SHADER,
    fragmentShader: SHIELD_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uDamageRatio: { value: 0 }
    },
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const bubbleMesh = new THREE.Mesh(geometry, material);
  bubbleMesh.visible = false;
  bubbleMesh.name = "ShieldBubbleEffectMesh";
  bubbleMesh.userData.isShieldBubbleEffect = true;
  bubbleMesh.renderOrder = 60;
  shipRoot.add(bubbleMesh);

  const localBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  const scratchSize = new THREE.Vector3();
  const targetCenter = new THREE.Vector3(0, 0.5, 0);
  const currentCenter = targetCenter.clone();
  const targetScale = new THREE.Vector3(1.2, 0.7, 1.4);
  const currentScale = targetScale.clone();
  const inverseRootWorldMatrix = new THREE.Matrix4();
  const meshToRootLocalMatrix = new THREE.Matrix4();

  let elapsedTime = 0;
  let visibility = 0;
  let collisionRadius = Math.max(targetScale.x, targetScale.y, targetScale.z);
  let fitRefreshRemaining = 0;
  let rechargePulseRemaining = 0;
  let damageFlashRemaining = 0;
  let wasRecharging = false;
  let previousShield = Number.NaN;

  const refreshBubbleFit = (): void => {
    shipRoot.updateWorldMatrix(true, true);
    inverseRootWorldMatrix.copy(shipRoot.matrixWorld).invert();

    localBounds.makeEmpty();
    let hasBounds = false;

    shipRoot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      if (node === bubbleMesh || node.userData.isShieldBubbleEffect) {
        return;
      }
      if (!node.geometry) {
        return;
      }
      if (!node.geometry.boundingBox) {
        node.geometry.computeBoundingBox();
      }
      if (!node.geometry.boundingBox) {
        return;
      }

      meshBounds.copy(node.geometry.boundingBox);
      meshToRootLocalMatrix.multiplyMatrices(inverseRootWorldMatrix, node.matrixWorld);
      meshBounds.applyMatrix4(meshToRootLocalMatrix);
      if (!hasBounds) {
        localBounds.copy(meshBounds);
        hasBounds = true;
      } else {
        localBounds.union(meshBounds);
      }
    });

    if (!hasBounds) {
      return;
    }

    localBounds.getCenter(targetCenter);
    localBounds.getSize(scratchSize);
    targetScale.set(
      Math.max(SHIELD_MIN_RADIUS_XZ, scratchSize.x * 0.5 + SHIELD_PADDING_XZ),
      Math.max(SHIELD_MIN_RADIUS_Y, scratchSize.y * 0.5 + SHIELD_PADDING_Y),
      Math.max(SHIELD_MIN_RADIUS_XZ, scratchSize.z * 0.5 + SHIELD_PADDING_XZ)
    );
  };

  const update = (deltaTime: number, healthSnapshot: HealthSnapshot): void => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    elapsedTime += deltaTime;
    fitRefreshRemaining -= deltaTime;
    if (fitRefreshRemaining <= 0) {
      refreshBubbleFit();
      fitRefreshRemaining = SHIELD_FIT_REFRESH_SECONDS;
    }

    const followBlend = 1 - Math.exp(-SHIELD_TRANSFORM_FOLLOW_SPEED * deltaTime);
    currentCenter.lerp(targetCenter, followBlend);
    currentScale.lerp(targetScale, followBlend);
    collisionRadius = Math.max(currentScale.x, currentScale.y, currentScale.z);
    bubbleMesh.position.copy(currentCenter);
    bubbleMesh.scale.copy(currentScale);

    let targetVisibility = 0;
    let damageRatio = 0;
    const shieldMax = Math.max(0, healthSnapshot.shield.max);
    const shieldCurrent = Math.max(0, healthSnapshot.shield.current);
    if (shieldMax > 0 && !healthSnapshot.destroyed) {
      damageRatio = THREE.MathUtils.clamp((shieldMax - shieldCurrent) / shieldMax, 0, 1);
      const shieldDamaged = shieldCurrent < shieldMax - 0.001;
      if (!Number.isFinite(previousShield)) {
        previousShield = shieldCurrent;
      }
      if (shieldCurrent + 0.001 < previousShield) {
        damageFlashRemaining = SHIELD_DAMAGE_FLASH_SECONDS;
      }
      previousShield = shieldCurrent;
      const shieldRecharging =
        shieldDamaged &&
        healthSnapshot.shieldChargeRate > 0 &&
        healthSnapshot.shieldRechargeDelayRemaining <= 0.001;

      if (shieldRecharging && !wasRecharging) {
        rechargePulseRemaining = SHIELD_RECHARGE_PULSE_SECONDS;
      }
      wasRecharging = shieldRecharging;

      rechargePulseRemaining = Math.max(0, rechargePulseRemaining - deltaTime);
      damageFlashRemaining = Math.max(0, damageFlashRemaining - deltaTime);
      const rechargePulseProgress =
        SHIELD_RECHARGE_PULSE_SECONDS > 0
          ? 1 - rechargePulseRemaining / SHIELD_RECHARGE_PULSE_SECONDS
          : 1;
      const rechargePulse =
        rechargePulseRemaining > 0 ? Math.sin(rechargePulseProgress * Math.PI) : 0;
      const damageFlash =
        SHIELD_DAMAGE_FLASH_SECONDS > 0 ? damageFlashRemaining / SHIELD_DAMAGE_FLASH_SECONDS : 0;

      const damageVisibility = damageFlash * (0.32 + damageRatio * 0.42);
      const pulseVisibility = rechargePulse * 0.34;
      targetVisibility = Math.max(damageVisibility, pulseVisibility);
    } else {
      wasRecharging = false;
      rechargePulseRemaining = 0;
      damageFlashRemaining = 0;
      previousShield = Number.NaN;
    }

    const fadeSpeed =
      targetVisibility > visibility
        ? SHIELD_INTENSITY_FADE_IN_SPEED
        : SHIELD_INTENSITY_FADE_OUT_SPEED;
    visibility = THREE.MathUtils.damp(visibility, targetVisibility, fadeSpeed, deltaTime);

    material.uniforms.uTime.value = elapsedTime;
    material.uniforms.uIntensity.value = visibility;
    material.uniforms.uDamageRatio.value = damageRatio;
    bubbleMesh.visible = visibility > 0.01;
  };

  const dispose = (): void => {
    bubbleMesh.removeFromParent();
    geometry.dispose();
    material.dispose();
  };

  return {
    update,
    getCollisionArea: () => ({
      localOffset: currentCenter.clone(),
      radius: collisionRadius
    }),
    dispose
  };
}
