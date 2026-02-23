import * as THREE from "three";

export type EnemyShipMuzzleRigConfig = {
  localOffsets: readonly THREE.Vector3[];
  outerColorHex: number;
  innerBaseColorHex: number;
  innerPeakColorHex: number;
};

export type EnemyShipMuzzleChargeVisualState = {
  active: boolean;
  telegraphSecondsRemaining: number;
  telegraphDurationSeconds: number;
  pulseSeconds: number;
};

export class EnemyShipMuzzleRig {
  private readonly muzzleObjects: THREE.Object3D[] = [];
  private readonly muzzleChargeInnerMeshes: THREE.Mesh[] = [];
  private readonly muzzleChargeOuterMeshes: THREE.Mesh[] = [];
  private readonly innerBaseColor: THREE.Color;
  private readonly innerPeakColor: THREE.Color;
  private readonly outerColorHex: number;

  constructor(parent: THREE.Object3D, config: EnemyShipMuzzleRigConfig) {
    this.outerColorHex = config.outerColorHex;
    this.innerBaseColor = new THREE.Color(config.innerBaseColorHex);
    this.innerPeakColor = new THREE.Color(config.innerPeakColorHex);

    for (const offset of config.localOffsets) {
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(offset);
      parent.add(muzzle);
      this.muzzleObjects.push(muzzle);

      const chargeMeshes = this.createMuzzleChargeMeshes(muzzle);
      this.muzzleChargeInnerMeshes.push(chargeMeshes.inner);
      this.muzzleChargeOuterMeshes.push(chargeMeshes.outer);
    }
  }

  get muzzles(): readonly THREE.Object3D[] {
    return this.muzzleObjects;
  }

  setMuzzleOffsets(socketOffsets: readonly THREE.Vector3[]): void {
    const count = Math.min(this.muzzleObjects.length, socketOffsets.length);
    for (let i = 0; i < count; i += 1) {
      this.muzzleObjects[i].position.copy(socketOffsets[i]);
    }
  }

  updateChargeEffect(state: EnemyShipMuzzleChargeVisualState): void {
    if (!state.active || state.telegraphSecondsRemaining <= 0) {
      this.hideAllChargeMeshes();
      return;
    }

    const duration = Math.max(0.001, state.telegraphDurationSeconds);
    const progress = THREE.MathUtils.clamp(1 - state.telegraphSecondsRemaining / duration, 0, 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    const pulse = 0.88 + Math.sin(state.pulseSeconds * 20) * 0.12;
    const flare = 0.8 + Math.sin(state.pulseSeconds * 34 + 0.65) * 0.2;
    const outerOpacity = THREE.MathUtils.clamp(0.025 + easedProgress * 0.13, 0, 0.18) * pulse;
    const innerOpacity = THREE.MathUtils.clamp(0.16 + easedProgress * 0.9, 0, 1) * flare;
    const outerScale = 0.48 + easedProgress * 1.95;
    const innerScale = 0.34 + easedProgress * 0.96;
    const innerColorLerp = THREE.MathUtils.clamp(easedProgress * 0.65, 0, 1);

    for (const chargeMesh of this.muzzleChargeOuterMeshes) {
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(outerScale);
      const material = chargeMesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = outerOpacity;
        material.color.setHex(this.outerColorHex);
      }
    }

    for (const chargeMesh of this.muzzleChargeInnerMeshes) {
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(innerScale);
      const material = chargeMesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = innerOpacity;
        material.color.lerpColors(this.innerBaseColor, this.innerPeakColor, innerColorLerp);
      }
    }
  }

  private createMuzzleChargeMeshes(parent: THREE.Object3D): {
    inner: THREE.Mesh;
    outer: THREE.Mesh;
  } {
    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({
        color: this.outerColorHex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    outer.visible = false;
    outer.position.z = 0.03;
    parent.add(outer);

    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 10),
      new THREE.MeshBasicMaterial({
        color: this.innerBaseColor.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    inner.visible = false;
    inner.position.z = 0.045;
    parent.add(inner);

    return { inner, outer };
  }

  private hideAllChargeMeshes(): void {
    for (const mesh of this.muzzleChargeInnerMeshes) {
      hideChargeMesh(mesh);
    }
    for (const mesh of this.muzzleChargeOuterMeshes) {
      hideChargeMesh(mesh);
    }
  }
}

function hideChargeMesh(mesh: THREE.Mesh): void {
  mesh.visible = false;
  mesh.scale.setScalar(0.001);
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    material.opacity = 0;
  }
}
