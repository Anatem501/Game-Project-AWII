import * as THREE from "three";

const BUBBLE_SEGMENTS_WIDTH = 52;
const BUBBLE_SEGMENTS_HEIGHT = 30;
const BUBBLE_PADDING = 0.22;
const BUBBLE_MIN_RADIUS = 0.7;
const BUBBLE_FIT_REFRESH_SECONDS = 0.3;
const BUBBLE_TRANSFORM_FOLLOW_SPEED = 9;
const BUBBLE_FADE_IN_SPEED = 11;
const BUBBLE_FADE_OUT_SPEED = 8;

const BUBBLE_VERTEX_SHADER = `
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

const BUBBLE_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uIntensity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  float intensity = clamp(uIntensity, 0.0, 1.0);
  if (intensity <= 0.001) {
    discard;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.25);

  float waveA = sin((vLocalPos.x + vLocalPos.y) * 15.0 + uTime * 2.4);
  float waveB = sin((vLocalPos.z - vLocalPos.y) * 19.0 - uTime * 1.7);
  float waveC = sin((vLocalPos.x - vLocalPos.z) * 23.0 + uTime * 1.35);
  float shardField = (waveA * 0.4 + waveB * 0.35 + waveC * 0.25) * 0.5 + 0.5;
  float shardMask = smoothstep(0.54, 0.98, shardField);

  vec3 deepBlue = vec3(0.03, 0.2, 0.58);
  vec3 brightBlue = vec3(0.36, 0.82, 1.0);
  vec3 color = mix(deepBlue, brightBlue, shardMask);
  vec3 emissive = color * (0.22 + fresnel * 0.68 + shardMask * 0.38);

  // Keep the surface visibly semi-transparent while active.
  float alpha = intensity * (0.18 + fresnel * 0.24 + shardMask * 0.14);
  alpha = min(alpha, 0.52);
  if (alpha <= 0.002) {
    discard;
  }

  gl_FragColor = vec4(emissive, alpha);
}
`;

export type BubbleShieldEquipmentEffect = {
  update: (deltaTime: number, active: boolean) => void;
  getCollisionArea: () => { localOffset: THREE.Vector3; radius: number };
  dispose: () => void;
};

export function createBubbleShieldEquipmentEffect(shipRoot: THREE.Object3D): BubbleShieldEquipmentEffect {
  const bubbleGeometry = new THREE.SphereGeometry(1, BUBBLE_SEGMENTS_WIDTH, BUBBLE_SEGMENTS_HEIGHT);
  const bubbleMaterial = new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERTEX_SHADER,
    fragmentShader: BUBBLE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 }
    },
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const bubbleMesh = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
  bubbleMesh.name = "BubbleShieldEquipmentMesh";
  bubbleMesh.userData.isBubbleShieldEquipmentEffect = true;
  bubbleMesh.visible = false;
  bubbleMesh.renderOrder = 62;
  shipRoot.add(bubbleMesh);

  const glowGeometry = new THREE.SphereGeometry(1, 36, 22);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4fc4ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.name = "BubbleShieldEquipmentGlowMesh";
  glowMesh.visible = false;
  glowMesh.renderOrder = 61;
  shipRoot.add(glowMesh);

  const localBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  const scratchSize = new THREE.Vector3();
  const targetCenter = new THREE.Vector3(0, 0.5, 0);
  const currentCenter = targetCenter.clone();
  let targetRadius = 1.25;
  let currentRadius = targetRadius;
  let collisionRadius = currentRadius;
  const inverseRootWorldMatrix = new THREE.Matrix4();
  const meshToRootLocalMatrix = new THREE.Matrix4();

  let elapsedTime = 0;
  let visibility = 0;
  let fitRefreshRemaining = 0;

  const refreshBubbleFit = (): void => {
    shipRoot.updateWorldMatrix(true, true);
    inverseRootWorldMatrix.copy(shipRoot.matrixWorld).invert();

    localBounds.makeEmpty();
    let hasBounds = false;

    shipRoot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      if (node === bubbleMesh || node === glowMesh || node.userData.isBubbleShieldEquipmentEffect) {
        return;
      }
      if (node.userData.isShieldBubbleEffect) {
        return;
      }
      if (hasExcludedShieldFitAncestor(node, shipRoot)) {
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
    const longestAxis = Math.max(scratchSize.x, scratchSize.y, scratchSize.z);
    targetRadius = Math.max(BUBBLE_MIN_RADIUS, longestAxis * 0.5 + BUBBLE_PADDING);
  };

  const update = (deltaTime: number, active: boolean): void => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    elapsedTime += deltaTime;
    fitRefreshRemaining -= deltaTime;
    if (fitRefreshRemaining <= 0) {
      refreshBubbleFit();
      fitRefreshRemaining = BUBBLE_FIT_REFRESH_SECONDS;
    }

    const followBlend = 1 - Math.exp(-BUBBLE_TRANSFORM_FOLLOW_SPEED * deltaTime);
    currentCenter.lerp(targetCenter, followBlend);
    currentRadius = THREE.MathUtils.lerp(currentRadius, targetRadius, followBlend);
    collisionRadius = Math.max(BUBBLE_MIN_RADIUS, currentRadius);

    bubbleMesh.position.copy(currentCenter);
    bubbleMesh.scale.setScalar(currentRadius);
    glowMesh.position.copy(currentCenter);
    glowMesh.scale.setScalar(currentRadius * 1.03);

    const targetVisibility = active ? 1 : 0;
    const fadeSpeed = active ? BUBBLE_FADE_IN_SPEED : BUBBLE_FADE_OUT_SPEED;
    visibility = THREE.MathUtils.damp(visibility, targetVisibility, fadeSpeed, deltaTime);

    const pulse = 0.78 + 0.22 * Math.sin(elapsedTime * 7.2);
    bubbleMaterial.uniforms.uTime.value = elapsedTime;
    bubbleMaterial.uniforms.uIntensity.value = visibility;
    glowMaterial.opacity = visibility * 0.3 * pulse;

    const isVisible = visibility > 0.01;
    bubbleMesh.visible = isVisible;
    glowMesh.visible = isVisible;
  };

  const dispose = (): void => {
    bubbleMesh.removeFromParent();
    glowMesh.removeFromParent();
    bubbleGeometry.dispose();
    bubbleMaterial.dispose();
    glowGeometry.dispose();
    glowMaterial.dispose();
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

function hasExcludedShieldFitAncestor(node: THREE.Object3D, stopNode: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current && current !== stopNode) {
    if (current.userData.excludeFromShieldBubbleFit) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
