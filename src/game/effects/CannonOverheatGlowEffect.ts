import * as THREE from "three";

const MAX_HEAT_POINTS = 32;
const CANNON_HEAT_INNER_RADIUS = 1.0;
const CANNON_HEAT_OUTER_RADIUS = 3.4;
const HEAT_FADE_IN_SPEED = 6.8;
const HEAT_FADE_OUT_SPEED = 4.6;
const MIN_BASE_INTENSITY = 0.08;

const HEAT_VERTEX_SHADER = `
uniform vec3 uHeatPoints[${MAX_HEAT_POINTS}];
uniform float uHeatPointCount;
uniform float uInnerRadius;
uniform float uOuterRadius;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeatMask;

void main() {
  float mask = 0.0;
  for (int i = 0; i < ${MAX_HEAT_POINTS}; i++) {
    float enabled = step(float(i), uHeatPointCount - 0.5);
    float distToPoint = distance(position, uHeatPoints[i]);
    float localMask = 1.0 - smoothstep(uInnerRadius, uOuterRadius, distToPoint);
    mask = max(mask, localMask * enabled);
  }

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vHeatMask = clamp(mask, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const HEAT_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uBaseColor;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vHeatMask;

void main() {
  float intensity = clamp(uIntensity, 0.0, 1.0);
  float heat = clamp(vHeatMask * intensity, 0.0, 1.0);
  if (heat <= 0.001) {
    discard;
  }

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.15);
  float flicker = 0.84 + 0.16 * sin(uTime * 18.0 + vHeatMask * 14.0);

  vec3 darkMetal = uBaseColor * 0.3;
  vec3 hotMetal = vec3(1.0, 0.34, 0.1);
  vec3 superHot = vec3(1.0, 0.55, 0.2);
  vec3 heatedColor = mix(darkMetal, hotMetal, smoothstep(0.0, 0.8, heat));
  heatedColor = mix(heatedColor, superHot, smoothstep(0.65, 1.0, heat));

  vec3 emissive = heatedColor * (0.32 + heat * 0.95 + fresnel * 1.35) * flicker;
  float alpha = (0.04 + heat * 0.44 + fresnel * 0.32) * flicker;
  if (alpha <= 0.01) {
    discard;
  }

  gl_FragColor = vec4(emissive, alpha);
}
`;

type OverlayEntry = {
  overlayMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  sourceMesh: THREE.Mesh;
};

export type CannonOverheatGlowEffect = {
  update: (deltaTime: number, heat01: number, includeSecondaryHeatZones: boolean) => void;
  dispose: () => void;
};

export function createCannonOverheatGlowEffect(
  playerRoot: THREE.Object3D,
  cannonHardpoints: readonly THREE.Object3D[],
  secondaryHeatHardpoints: readonly THREE.Object3D[] = []
): CannonOverheatGlowEffect {
  const heatWorldPositions = Array.from({ length: MAX_HEAT_POINTS }, () => new THREE.Vector3());
  const heatLocalScratch = new THREE.Vector3();
  const defaultHeatPoint = new THREE.Vector3(9999, 9999, 9999);
  const overlayEntries: OverlayEntry[] = [];
  const linkedSourceMeshes = new Set<THREE.Mesh>();
  const activeHeatSources: THREE.Object3D[] = [];

  let time = 0;
  let currentIntensity = MIN_BASE_INTENSITY;

  const attachOverlaysToShipMeshes = (): void => {
    playerRoot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      if (linkedSourceMeshes.has(node)) {
        return;
      }
      if (Array.isArray(node.material)) {
        return;
      }
      if (!(node.material instanceof THREE.MeshStandardMaterial)) {
        return;
      }

      const overlayMaterial = new THREE.ShaderMaterial({
        vertexShader: HEAT_VERTEX_SHADER,
        fragmentShader: HEAT_FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: MIN_BASE_INTENSITY },
          uBaseColor: { value: node.material.color.clone() },
          uInnerRadius: { value: CANNON_HEAT_INNER_RADIUS },
          uOuterRadius: { value: CANNON_HEAT_OUTER_RADIUS },
          uHeatPointCount: { value: 0 },
          uHeatPoints: {
            value: Array.from({ length: MAX_HEAT_POINTS }, () => defaultHeatPoint.clone())
          }
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.FrontSide,
        toneMapped: false
      });

      const overlayMesh = new THREE.Mesh(node.geometry, overlayMaterial);
      overlayMesh.visible = false;
      overlayMesh.renderOrder = node.renderOrder + 1;
      node.add(overlayMesh);
      overlayEntries.push({
        overlayMesh,
        sourceMesh: node
      });
      linkedSourceMeshes.add(node);
    });
  };

  const buildActiveHeatSources = (includeSecondaryHeatZones: boolean): number => {
    activeHeatSources.length = 0;
    const maxPrimaryPoints = Math.min(cannonHardpoints.length, MAX_HEAT_POINTS);
    for (let i = 0; i < maxPrimaryPoints; i += 1) {
      activeHeatSources.push(cannonHardpoints[i]);
    }
    if (includeSecondaryHeatZones) {
      for (const hardpoint of secondaryHeatHardpoints) {
        if (activeHeatSources.length >= MAX_HEAT_POINTS) {
          break;
        }
        activeHeatSources.push(hardpoint);
      }
    }
    return activeHeatSources.length;
  };

  const updateHeatPointsForOverlay = (
    sourceMesh: THREE.Mesh,
    material: THREE.ShaderMaterial,
    activePointCount: number
  ): void => {
    for (let i = 0; i < MAX_HEAT_POINTS; i += 1) {
      if (i < activePointCount) {
        activeHeatSources[i].getWorldPosition(heatWorldPositions[i]);
        heatLocalScratch.copy(heatWorldPositions[i]);
        sourceMesh.worldToLocal(heatLocalScratch);
      } else {
        heatLocalScratch.copy(defaultHeatPoint);
      }
      const uniformPoint = (material.uniforms.uHeatPoints.value as THREE.Vector3[])[i];
      uniformPoint.copy(heatLocalScratch);
    }
    material.uniforms.uHeatPointCount.value = activePointCount;
  };

  const update = (
    deltaTime: number,
    heat01: number,
    includeSecondaryHeatZones: boolean
  ): void => {
    attachOverlaysToShipMeshes();
    const activePointCount = buildActiveHeatSources(includeSecondaryHeatZones);
    const targetIntensity =
      MIN_BASE_INTENSITY + THREE.MathUtils.clamp(heat01, 0, 1) * (1 - MIN_BASE_INTENSITY);

    if (deltaTime > 0) {
      time += deltaTime;
      const fadeSpeed =
        targetIntensity > currentIntensity ? HEAT_FADE_IN_SPEED : HEAT_FADE_OUT_SPEED;
      currentIntensity = THREE.MathUtils.damp(
        currentIntensity,
        targetIntensity,
        fadeSpeed,
        deltaTime
      );
    }

    const visible = activePointCount > 0;
    for (const overlayEntry of overlayEntries) {
      const material = overlayEntry.overlayMesh.material;
      material.uniforms.uTime.value = time;
      material.uniforms.uIntensity.value = currentIntensity;
      updateHeatPointsForOverlay(overlayEntry.sourceMesh, material, activePointCount);
      overlayEntry.overlayMesh.visible = visible;
    }
  };

  const dispose = (): void => {
    for (const overlayEntry of overlayEntries) {
      overlayEntry.overlayMesh.removeFromParent();
      overlayEntry.overlayMesh.material.dispose();
    }
    overlayEntries.length = 0;
    linkedSourceMeshes.clear();
  };

  return { update, dispose };
}
