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

export type SolarSeekerFactoryOptions = LaserBoltFactoryOptions & {
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

type FlameTendrilVisual = {
  amplitude: number;
  material: THREE.SpriteMaterial;
  phase: number;
  pulseScale: number;
  rotationBias: number;
  scaleX: number;
  scaleY: number;
  speed: number;
  sprite: THREE.Sprite;
};

export function createSolarSeekerFactory(
  options: SolarSeekerFactoryOptions = {}
): ProjectileFactory {
  const speed = Math.max(0.1, options.speed ?? 14);
  const lifetimeSeconds = Math.max(0.05, options.lifetimeSeconds ?? 2.8);
  const visualLength = Math.max(0.05, options.length ?? 0.52);
  const thickness = Math.max(0.02, options.thickness ?? 0.12);
  const damage = Math.max(0, options.damage ?? 14);
  const damageType: DamageType = options.damageType ?? "Solar";
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
  const trailWidth = Math.max(0.02, options.trailWidth ?? thickness * 1.8);
  const trailGlowWidthMultiplier = Math.max(1, options.trailGlowWidthMultiplier ?? 1.65);
  const trailOpacity = THREE.MathUtils.clamp(options.trailOpacity ?? 0.72, 0.01, 1);
  const trailGlowOpacity = THREE.MathUtils.clamp(options.trailGlowOpacity ?? 0.36, 0.01, 1);
  const flareOpacity = THREE.MathUtils.clamp(options.flareOpacity ?? 0.96, 0.01, 1);
  const flareSizeMultiplier = Math.max(0.5, options.flareSizeMultiplier ?? 4.4);

  const orbCoreColor = new THREE.Color(0xffefd6);
  const orbShellColor = new THREE.Color(0xff9728);
  const orbGlowColor = new THREE.Color(0xff5a17);
  const trailColor = new THREE.Color(0xff8f20);
  const trailGlowColor = new THREE.Color(0xffc46a);

  const fallbackGeometry = new THREE.SphereGeometry(Math.max(0.01, thickness * 0.1), 16, 12);
  const coreMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbCoreColor,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const shellMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbShellColor,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const glowMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbGlowColor,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const trailGlowMaterialTemplate = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX_SHADER,
    fragmentShader: TRAIL_FRAGMENT_SHADER,
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

  const flareTexture = createSolarFlareTexture();
  const flameTendrilTexture = createSolarFlameTendrilTexture();
  const flareMaterialTemplate = new THREE.SpriteMaterial({
    map: flareTexture,
    color: 0xffb24b,
    transparent: true,
    opacity: flareOpacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const flareTendrilMaterialTemplate = new THREE.SpriteMaterial({
    map: flameTendrilTexture,
    color: 0xff8c22,
    transparent: true,
    opacity: flareOpacity * 0.88,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
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
        modelTemplate = normalizeTemplateToDiameter(gltf.scene, Math.max(0.018, thickness * 0.32));
      },
      undefined,
      (error) => {
        console.warn("Solar seeker model failed to load, using fallback orb.", error);
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
    headVisualRoot.scale.setScalar(0.5);
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

    const coreVisual = modelTemplate ? modelTemplate.clone(true) : new THREE.Mesh(fallbackGeometry, coreMaterial);
    assignMaterialToMeshes(coreVisual, coreMaterial);
    setRenderOrderRecursive(coreVisual, 10);
    headVisualRoot.add(coreVisual);

    const shellVisual = coreVisual.clone(true);
    assignMaterialToMeshes(shellVisual, shellMaterial);
    shellVisual.scale.multiplyScalar(1.02);
    setRenderOrderRecursive(shellVisual, 9);
    headVisualRoot.add(shellVisual);

    const glowVisual = coreVisual.clone(true);
    assignMaterialToMeshes(glowVisual, glowMaterial);
    glowVisual.scale.multiplyScalar(1.045);
    setRenderOrderRecursive(glowVisual, 8);
    headVisualRoot.add(glowVisual);
    const coreBaseScale = coreVisual.scale.clone();
    const shellBaseScale = shellVisual.scale.clone();
    const glowBaseScale = glowVisual.scale.clone();

    const flareMaterialA = flareMaterialTemplate.clone();
    const flareMaterialB = flareMaterialTemplate.clone();
    flareMaterialB.color = flareMaterialB.color.clone();
    flareMaterialB.color.set(0xfff2c4);
    flareMaterialB.opacity = flareOpacity * 0.54;
    const flareA = new THREE.Sprite(flareMaterialA);
    const flareB = new THREE.Sprite(flareMaterialB);
    const flareSize = Math.max(0.2, thickness * flareSizeMultiplier);
    flareA.scale.set(flareSize, flareSize, 1);
    flareB.scale.set(flareSize * 1.28, flareSize * 1.28, 1);
    flareA.center.set(0.5, 0.5);
    flareB.center.set(0.5, 0.5);
    flareB.material.rotation = Math.PI * 0.125;
    flareA.renderOrder = 14;
    flareB.renderOrder = 13;
    headVisualRoot.add(flareA);
    headVisualRoot.add(flareB);

    const flameTendrils: FlameTendrilVisual[] = [];
    for (let i = 0; i < 4; i += 1) {
      const tendrilMaterial = flareTendrilMaterialTemplate.clone();
      tendrilMaterial.color = tendrilMaterial.color.clone();
      tendrilMaterial.color.offsetHSL(randomRange(-0.015, 0.015), randomRange(-0.03, 0.03), randomRange(-0.02, 0.06));
      tendrilMaterial.opacity = flareOpacity * randomRange(0.46, 0.74);
      const tendrilSprite = new THREE.Sprite(tendrilMaterial);
      tendrilSprite.center.set(0.5, 0.5);
      tendrilSprite.renderOrder = 12;
      headVisualRoot.add(tendrilSprite);
      flameTendrils.push({
        amplitude: flareSize * randomRange(0.12, 0.26),
        material: tendrilMaterial,
        phase: Math.random() * Math.PI * 2,
        pulseScale: randomRange(0.88, 1.22),
        rotationBias: (Math.PI * 2 * i) / 4 + randomRange(-0.18, 0.18),
        scaleX: randomRange(0.28, 0.42),
        scaleY: randomRange(1.15, 1.7),
        speed: randomRange(4.5, 8.2),
        sprite: tendrilSprite
      });
    }

    const trailRoot = new THREE.Group();
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
        coreMaterial.opacity = 0.76 + 0.18 * pulse;
        shellMaterial.opacity = 0.42 + 0.22 * pulse;
        glowMaterial.opacity = (0.18 + 0.16 * pulse) * endFade;
        flareMaterialA.opacity = flareOpacity * (0.8 + 0.2 * pulse) * endFade;
        flareMaterialB.opacity = flareOpacity * 0.54 * (0.72 + 0.28 * pulse) * endFade;

        const corePulseScale = 0.98 + pulse * 0.06;
        coreVisual.scale.copy(coreBaseScale).multiplyScalar(corePulseScale);
        shellVisual.scale.copy(shellBaseScale).multiplyScalar(0.996 + pulse * 0.012);
        glowVisual.scale.copy(glowBaseScale).multiplyScalar(0.992 + pulse * 0.016);
        flareA.scale.setScalar(flareSize * (0.92 + pulse * 0.16));
        flareB.scale.setScalar(flareSize * 1.28 * (0.88 + pulse * 0.2));
        flareA.material.rotation += deltaTime * 1.9;
        flareB.material.rotation -= deltaTime * 1.2;
        for (const tendril of flameTendrils) {
          const sway = Math.sin(ageSeconds * tendril.speed + tendril.phase);
          const swayPerp = Math.sin(ageSeconds * (tendril.speed * 0.65) + tendril.phase * 1.7);
          tendril.sprite.position.set(
            Math.cos(tendril.rotationBias) * tendril.amplitude * sway,
            Math.sin(tendril.rotationBias) * tendril.amplitude * swayPerp,
            0
          );
          tendril.sprite.scale.set(
            flareSize * tendril.scaleX * (0.9 + pulse * 0.2) * tendril.pulseScale,
            flareSize * tendril.scaleY * (0.9 + Math.abs(sway) * 0.45) * tendril.pulseScale,
            1
          );
          tendril.material.opacity =
            flareOpacity * (0.38 + 0.36 * Math.abs(sway)) * (0.84 + pulse * 0.18) * endFade;
          tendril.sprite.material.rotation =
            tendril.rotationBias + sway * 0.38 + ageSeconds * (0.35 + tendril.pulseScale * 0.18);
        }

        syncTrail(endFade);
        return lifeRemaining > 0;
      },
      dispose: () => {
        coreMaterial.dispose();
        shellMaterial.dispose();
        glowMaterial.dispose();
        flareMaterialA.dispose();
        flareMaterialB.dispose();
        for (const tendril of flameTendrils) {
          tendril.material.dispose();
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
      trailCoreMaterialTemplate.dispose();
      trailGlowMaterialTemplate.dispose();
      flareMaterialTemplate.dispose();
      flareTendrilMaterialTemplate.dispose();
      flareTexture.dispose();
      flameTendrilTexture.dispose();
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

function createSolarFlareTexture(): THREE.CanvasTexture {
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

  const radial = context.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.22, "rgba(255,236,185,0.95)");
  radial.addColorStop(0.45, "rgba(255,165,70,0.6)");
  radial.addColorStop(1, "rgba(255,110,20,0)");
  context.fillStyle = radial;
  context.fillRect(0, 0, size, size);

  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < 8; i += 1) {
    context.rotate(Math.PI / 4);
    const spikeLength = i % 2 === 0 ? size * 0.47 : size * 0.34;
    const spikeWidth = i % 2 === 0 ? size * 0.028 : size * 0.02;
    const gradient = context.createLinearGradient(0, -spikeLength, 0, spikeLength);
    gradient.addColorStop(0, "rgba(255,160,70,0)");
    gradient.addColorStop(0.46, "rgba(255,224,160,0.95)");
    gradient.addColorStop(0.54, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,140,50,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, -spikeLength);
    context.lineTo(spikeWidth, 0);
    context.lineTo(0, spikeLength);
    context.lineTo(-spikeWidth, 0);
    context.closePath();
    context.fill();
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
