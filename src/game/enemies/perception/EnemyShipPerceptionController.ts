import * as THREE from "three";

const FORWARD_FALLBACK = new THREE.Vector3(0, 0, 1);

export type EnemyShipPerceptionControllerConfig = {
  initialTarget?: THREE.Object3D | null;
  primaryFireThreatWindowSeconds?: number;
};

export class EnemyShipPerceptionController {
  private playerTarget: THREE.Object3D | null;
  private readonly primaryFireThreatWindowSeconds: number;

  private readonly currentTargetWorld = new THREE.Vector3();
  private readonly previousTargetWorld = new THREE.Vector3();
  private readonly targetVelocityWorld = new THREE.Vector3();
  private readonly lastKnownTargetWorld = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  private hasPreviousTargetWorld = false;
  private hasLastKnownTargetWorld = false;
  private playerPrimaryFireThreatSecondsRemaining = 0;

  constructor(config: EnemyShipPerceptionControllerConfig = {}) {
    this.playerTarget = config.initialTarget ?? null;
    this.primaryFireThreatWindowSeconds = Math.max(0, config.primaryFireThreatWindowSeconds ?? 0.18);
  }

  update(deltaTime: number): void {
    if (deltaTime > 0) {
      this.playerPrimaryFireThreatSecondsRemaining = Math.max(
        0,
        this.playerPrimaryFireThreatSecondsRemaining - deltaTime
      );
    }

    if (!this.playerTarget) {
      this.hasPreviousTargetWorld = false;
      this.targetVelocityWorld.set(0, 0, 0);
      return;
    }

    this.playerTarget.getWorldPosition(this.currentTargetWorld);
    if (!this.hasPreviousTargetWorld || deltaTime <= 0) {
      this.previousTargetWorld.copy(this.currentTargetWorld);
      this.targetVelocityWorld.set(0, 0, 0);
      this.hasPreviousTargetWorld = true;
      return;
    }

    this.targetVelocityWorld
      .subVectors(this.currentTargetWorld, this.previousTargetWorld)
      .multiplyScalar(1 / deltaTime)
      .setY(0);
    this.previousTargetWorld.copy(this.currentTargetWorld);
  }

  setTarget(target: THREE.Object3D | null): void {
    this.playerTarget = target;
    if (!target) {
      this.hasPreviousTargetWorld = false;
      this.targetVelocityWorld.set(0, 0, 0);
    }
  }

  hasTarget(): boolean {
    return this.playerTarget !== null;
  }

  signalTargetPrimaryFire(): void {
    this.playerPrimaryFireThreatSecondsRemaining = this.primaryFireThreatWindowSeconds;
  }

  getTargetDistance2DFrom(origin: THREE.Vector3, outTargetWorld?: THREE.Vector3): number | null {
    if (!this.refreshCurrentTargetWorld(outTargetWorld)) {
      return null;
    }

    this.toTarget.subVectors(this.currentTargetWorld, origin).setY(0);
    const distance = this.toTarget.length();
    return distance <= 0.000001 ? 0 : distance;
  }

  tryCopyCurrentTargetWorld(out: THREE.Vector3): boolean {
    return this.refreshCurrentTargetWorld(out);
  }

  hasPassiveSensorContact(origin: THREE.Vector3, maxRange: number, outTargetWorld?: THREE.Vector3): boolean {
    const distance = this.getTargetDistance2DFrom(origin, outTargetWorld);
    if (distance === null) {
      return false;
    }
    const hasContact = distance <= Math.max(0, maxRange);
    if (hasContact) {
      this.lastKnownTargetWorld.copy(this.currentTargetWorld);
      this.hasLastKnownTargetWorld = true;
    }
    return hasContact;
  }

  copyLastKnownTargetPosition(out: THREE.Vector3): boolean {
    if (!this.hasLastKnownTargetWorld) {
      return false;
    }
    out.copy(this.lastKnownTargetWorld);
    return true;
  }

  hasAimVisionContact(
    origin: THREE.Vector3,
    ownerForwardWorld: THREE.Vector3,
    maxRange: number,
    fovRadians: number
  ): boolean {
    if (!this.refreshCurrentTargetWorld()) {
      return false;
    }

    this.toTarget.subVectors(this.currentTargetWorld, origin).setY(0);
    const distance = this.toTarget.length();
    if (distance > Math.max(0, maxRange)) {
      return false;
    }
    if (distance <= 0.000001) {
      return true;
    }

    this.toTarget.multiplyScalar(1 / distance);
    this.forward.copy(ownerForwardWorld).setY(0);
    if (this.forward.lengthSq() <= 0.000001) {
      this.forward.copy(FORWARD_FALLBACK);
    } else {
      this.forward.normalize();
    }

    const halfFov = THREE.MathUtils.clamp(fovRadians * 0.5, 0, Math.PI * 0.5);
    const minDot = Math.cos(halfFov);
    return this.forward.dot(this.toTarget) >= minDot;
  }

  predictAimTarget(
    origin: THREE.Vector3,
    projectileSpeed: number,
    aimLeadFactor: number,
    out: THREE.Vector3
  ): boolean {
    if (!this.refreshCurrentTargetWorld()) {
      return false;
    }

    const distance = origin.distanceTo(this.currentTargetWorld);
    const travelTimeSeconds = THREE.MathUtils.clamp(
      distance / Math.max(0.001, projectileSpeed),
      0,
      1.75
    );
    out.copy(this.currentTargetWorld).addScaledVector(
      this.targetVelocityWorld,
      travelTimeSeconds * THREE.MathUtils.clamp(aimLeadFactor, 0, 1.25)
    );
    return true;
  }

  hasIncomingFireThreatWithinRange(origin: THREE.Vector3, maxRange: number): boolean {
    if (this.playerPrimaryFireThreatSecondsRemaining <= 0) {
      return false;
    }
    const distance = this.getTargetDistance2DFrom(origin);
    if (distance === null) {
      return false;
    }
    return distance > 0.000001 && distance <= Math.max(0, maxRange);
  }

  isTargetBehindWithinRadians(
    origin: THREE.Vector3,
    ownerForwardWorld: THREE.Vector3,
    halfAngleRadians: number,
    range: number
  ): boolean {
    if (!this.refreshCurrentTargetWorld()) {
      return false;
    }

    this.toTarget.subVectors(this.currentTargetWorld, origin).setY(0);
    const distance = this.toTarget.length();
    if (distance <= 0.000001 || distance > Math.max(0, range)) {
      return false;
    }
    this.toTarget.multiplyScalar(1 / distance);

    this.forward.copy(ownerForwardWorld).setY(0);
    if (this.forward.lengthSq() <= 0.000001) {
      this.forward.copy(FORWARD_FALLBACK);
    } else {
      this.forward.normalize();
    }

    const rearDirectionDot = this.forward.dot(this.toTarget);
    const rearThreshold = -Math.cos(THREE.MathUtils.clamp(halfAngleRadians, 0, Math.PI * 0.5));
    return rearDirectionDot <= rearThreshold;
  }

  private refreshCurrentTargetWorld(outTargetWorld?: THREE.Vector3): boolean {
    if (!this.playerTarget) {
      return false;
    }
    this.playerTarget.getWorldPosition(this.currentTargetWorld);
    outTargetWorld?.copy(this.currentTargetWorld);
    return true;
  }
}
