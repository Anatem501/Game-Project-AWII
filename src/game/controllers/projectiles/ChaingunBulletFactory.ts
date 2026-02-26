import * as THREE from "three";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import { DEFAULT_DAMAGE_TYPE, type DamageType } from "../../components/combat/DamageTypes";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSpawnParams
} from "./ProjectileTypes";

const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);

const TAIL_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TAIL_FRAGMENT_SHADER = `
uniform vec3 uTailColor;
uniform vec3 uHeadColor;
uniform float uOpacity;

varying vec2 vUv;

void main() {
  float widthFade = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.35);
  float lengthFade = pow(clamp(vUv.y, 0.0, 1.0), 0.65);
  float alpha = widthFade * lengthFade * uOpacity;
  if (alpha <= 0.002) {
    discard;
  }

  vec3 color = mix(uTailColor, uHeadColor, clamp(pow(vUv.y, 0.8), 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

export type ChaingunBulletFactoryOptions = {
  speed?: number;
  lifetimeSeconds?: number;
  damage?: number;
  damageType?: DamageType;
  collisionRadius?: number;
  faction?: string | null;
  bulletLength?: number;
  bulletRadius?: number;
  bulletColor?: number;
  tailLength?: number;
  tailWidth?: number;
  tailHeadColor?: number;
  tailTipColor?: number;
  tailOpacity?: number;
  smokeTailLength?: number;
  smokeTailWidth?: number;
  smokeTailHeadColor?: number;
  smokeTailTipColor?: number;
  smokeTailOpacity?: number;
  effectScale?: number;
  hitEffectId?: string;
  muzzleEffectId?: string;
  suppressMuzzleFx?: boolean;
  suppressHitFx?: boolean;
  explosionRadius?: number;
  explosionDamageAmount?: number;
};

export function createChaingunBulletFactory(
  options: ChaingunBulletFactoryOptions = {}
): ProjectileFactory {
  const speed = options.speed ?? 34;
  const lifetimeSeconds = options.lifetimeSeconds ?? 1.2;
  const damage = Math.max(0, options.damage ?? 2);
  const damageType = options.damageType ?? DEFAULT_DAMAGE_TYPE;
  const bulletLength = Math.max(0.01, options.bulletLength ?? 0.07);
  const bulletRadius = Math.max(0.004, options.bulletRadius ?? 0.015);
  const tailLength = Math.max(0.02, options.tailLength ?? 0.22);
  const tailWidth = Math.max(0.005, options.tailWidth ?? 0.03);
  const smokeTailOpacity = Math.max(0, options.smokeTailOpacity ?? 0);
  const smokeTailLength = Math.max(0.02, options.smokeTailLength ?? tailLength * 1.35);
  const smokeTailWidth = Math.max(0.005, options.smokeTailWidth ?? tailWidth * 1.7);
  const collisionRadius = Math.max(
    0.008,
    options.collisionRadius ?? Math.max(bulletRadius * 1.15, tailWidth * 0.4)
  );
  const faction = options.faction ?? null;

  const bulletBodyGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  const bulletTipGeometry = new THREE.ConeGeometry(1, 1, 10, 1);
  const bulletMaterial = new THREE.MeshStandardMaterial({
    color: options.bulletColor ?? 0xe0b34b,
    emissive: 0x4a2e0e,
    emissiveIntensity: 0.3,
    metalness: 0.92,
    roughness: 0.2,
    toneMapped: false
  });

  const tailGeometry = new THREE.PlaneGeometry(tailWidth, tailLength, 1, 1);
  const tailMaterial = new THREE.ShaderMaterial({
    vertexShader: TAIL_VERTEX_SHADER,
    fragmentShader: TAIL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTailColor: { value: new THREE.Color(options.tailTipColor ?? 0xff3015) },
      uHeadColor: { value: new THREE.Color(options.tailHeadColor ?? 0xffe35a) },
      uOpacity: { value: Math.max(0.05, options.tailOpacity ?? 0.8) }
    }
  });
  const smokeTailGeometry =
    smokeTailOpacity > 0 ? new THREE.PlaneGeometry(smokeTailWidth, smokeTailLength, 1, 1) : null;
  const smokeTailMaterial =
    smokeTailOpacity > 0
      ? new THREE.ShaderMaterial({
          vertexShader: TAIL_VERTEX_SHADER,
          fragmentShader: TAIL_FRAGMENT_SHADER,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
          toneMapped: false,
          uniforms: {
            uTailColor: { value: new THREE.Color(options.smokeTailTipColor ?? 0x202224) },
            uHeadColor: { value: new THREE.Color(options.smokeTailHeadColor ?? 0xb6bcc4) },
            uOpacity: { value: Math.max(0.03, smokeTailOpacity) }
          }
        })
      : null;

  const shotQuaternion = new THREE.Quaternion();

  const spawn = ({ direction, origin }: ProjectileSpawnParams): ProjectileInstance => {
    const root = new THREE.Group();
    const projectileDirection = direction.clone();

    if (projectileDirection.lengthSq() <= 0.000001) {
      projectileDirection.copy(PROJECTILE_FORWARD);
    } else {
      projectileDirection.normalize();
    }

    const bodyLength = bulletLength * 0.62;
    const tipLength = bulletLength - bodyLength;

    const bulletBodyMesh = new THREE.Mesh(bulletBodyGeometry, bulletMaterial);
    bulletBodyMesh.rotation.x = Math.PI * 0.5;
    bulletBodyMesh.position.z = -tipLength * 0.5;
    bulletBodyMesh.scale.set(bulletRadius, bodyLength, bulletRadius);
    bulletBodyMesh.renderOrder = 14;
    root.add(bulletBodyMesh);

    const bulletTipMesh = new THREE.Mesh(bulletTipGeometry, bulletMaterial);
    bulletTipMesh.rotation.x = Math.PI * 0.5;
    bulletTipMesh.position.z = bodyLength * 0.5;
    bulletTipMesh.scale.set(bulletRadius * 1.02, tipLength, bulletRadius * 1.02);
    bulletTipMesh.renderOrder = 14;
    root.add(bulletTipMesh);

    const tailPlaneA = new THREE.Mesh(tailGeometry, tailMaterial);
    tailPlaneA.position.z = -tailLength * 0.5;
    tailPlaneA.rotation.x = Math.PI * 0.5;
    tailPlaneA.renderOrder = 13;
    tailPlaneA.frustumCulled = false;
    root.add(tailPlaneA);

    if (smokeTailGeometry && smokeTailMaterial) {
      const smokeTailPlane = new THREE.Mesh(smokeTailGeometry, smokeTailMaterial);
      smokeTailPlane.position.z = -smokeTailLength * 0.52;
      smokeTailPlane.rotation.x = Math.PI * 0.5;
      smokeTailPlane.renderOrder = 12;
      smokeTailPlane.frustumCulled = false;
      root.add(smokeTailPlane);
    }

    root.position.copy(origin);
    shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, projectileDirection);
    root.quaternion.copy(shotQuaternion);

    const velocity = projectileDirection.multiplyScalar(speed);
    const hitbox = createHitboxComponent({
      owner: root,
      collisionArea: { radius: collisionRadius },
      damageAmount: damage,
      damageType,
      sourceFaction: faction
    });
    let lifeRemaining = lifetimeSeconds;

    return {
      object: root,
      hitbox,
      effectScale: Math.max(0.1, options.effectScale ?? 0.65),
      hitEffectId: options.hitEffectId ?? "chaingun_yellow_sparks",
      muzzleEffectId: options.muzzleEffectId ?? "chaingun_muzzle_sparks_smoke",
      explosionRadius:
        options.explosionRadius !== undefined ? Math.max(0, options.explosionRadius) : undefined,
      explosionDamageAmount:
        options.explosionDamageAmount !== undefined
          ? Math.max(0, options.explosionDamageAmount)
          : undefined,
      suppressMuzzleFx: options.suppressMuzzleFx ?? true,
      suppressHitFx: options.suppressHitFx ?? false,
      update: (deltaTime: number): boolean => {
        lifeRemaining -= deltaTime;
        root.position.addScaledVector(velocity, deltaTime);
        return lifeRemaining > 0;
      }
    };
  };

  return {
    spawn,
    dispose: () => {
      bulletBodyGeometry.dispose();
      bulletTipGeometry.dispose();
      bulletMaterial.dispose();
      tailGeometry.dispose();
      tailMaterial.dispose();
      smokeTailGeometry?.dispose();
      smokeTailMaterial?.dispose();
    }
  };
}
