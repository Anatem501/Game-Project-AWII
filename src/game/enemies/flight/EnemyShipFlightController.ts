import * as THREE from "three";

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const FALLBACK_FORWARD = new THREE.Vector3(0, 0, 1);

export type EnemyShipFlightControllerConfig = {
  root: THREE.Object3D;
  minForwardSpeed: number;
  maxForwardSpeed: number;
  forwardAccel: number;
  forwardDecel: number;
  maxStrafeSpeed: number;
  strafeAccel: number;
  strafeDamping: number;
  maxBankAngleRadians: number;
  bankInRateRadians: number;
  bankOutRateRadians: number;
  maxTurnRateAtMinSpeed: number;
  maxTurnRateAtMaxSpeed: number;
};

export type EnemyShipFlightIntent = {
  desiredHeadingWorld: THREE.Vector3;
  desiredForwardSpeed: number;
  desiredStrafe: number;
};

export class EnemyShipFlightController {
  private readonly root: THREE.Object3D;
  private readonly minForwardSpeed: number;
  private readonly maxForwardSpeed: number;
  private readonly forwardAccel: number;
  private readonly forwardDecel: number;
  private readonly maxStrafeSpeed: number;
  private readonly strafeAccel: number;
  private readonly strafeDamping: number;
  private readonly maxBankAngleRadians: number;
  private readonly bankInRateRadians: number;
  private readonly bankOutRateRadians: number;
  private readonly maxTurnRateAtMinSpeed: number;
  private readonly maxTurnRateAtMaxSpeed: number;

  private readonly worldForward = new THREE.Vector3();
  private readonly worldRight = new THREE.Vector3();
  private readonly desiredHeading = new THREE.Vector3();
  private readonly movementVelocity = new THREE.Vector3();

  private currentForwardSpeed = 0;
  private currentStrafeSpeed = 0;
  private currentBankRadians = 0;

  constructor(config: EnemyShipFlightControllerConfig) {
    this.root = config.root;
    this.minForwardSpeed = Math.max(0, config.minForwardSpeed);
    this.maxForwardSpeed = Math.max(this.minForwardSpeed, config.maxForwardSpeed);
    this.forwardAccel = Math.max(0.001, config.forwardAccel);
    this.forwardDecel = Math.max(0.001, config.forwardDecel);
    this.maxStrafeSpeed = Math.max(0, config.maxStrafeSpeed);
    this.strafeAccel = Math.max(0.001, config.strafeAccel);
    this.strafeDamping = Math.max(0.001, config.strafeDamping);
    this.maxBankAngleRadians = Math.max(0, config.maxBankAngleRadians);
    this.bankInRateRadians = Math.max(0.001, config.bankInRateRadians);
    this.bankOutRateRadians = Math.max(0.001, config.bankOutRateRadians);
    this.maxTurnRateAtMinSpeed = Math.max(0.001, config.maxTurnRateAtMinSpeed);
    this.maxTurnRateAtMaxSpeed = Math.max(0.001, config.maxTurnRateAtMaxSpeed);
  }

  step(deltaTime: number, intent: EnemyShipFlightIntent): boolean {
    if (deltaTime <= 0) {
      return false;
    }

    const aligned = this.rotateToward(deltaTime, intent.desiredHeadingWorld);
    this.updateForwardSpeed(deltaTime, intent.desiredForwardSpeed);
    this.updateStrafeSpeed(deltaTime, intent.desiredStrafe);
    this.applyTranslation(deltaTime);
    return aligned;
  }

  rotateToward(deltaTime: number, desiredHeadingWorld: THREE.Vector3): boolean {
    if (deltaTime <= 0) {
      return false;
    }

    this.desiredHeading.copy(desiredHeadingWorld).setY(0);
    if (this.desiredHeading.lengthSq() <= 0.000001) {
      this.relaxBank(deltaTime);
      return true;
    }
    this.desiredHeading.normalize();

    const desiredYaw = Math.atan2(this.desiredHeading.x, this.desiredHeading.z);
    const currentYaw = this.root.rotation.y;
    const yawDelta = shortestAngleDelta(currentYaw, desiredYaw);
    const speed01 = this.getSpeed01();
    const maxTurnRate = THREE.MathUtils.lerp(
      this.maxTurnRateAtMinSpeed,
      this.maxTurnRateAtMaxSpeed,
      speed01
    );

    let desiredBankRadians = 0;
    if (this.maxBankAngleRadians > 0) {
      const bankHeadingScale = Math.max(THREE.MathUtils.degToRad(10), maxTurnRate * 0.8);
      const bank01 = THREE.MathUtils.clamp(yawDelta / bankHeadingScale, -1, 1);
      desiredBankRadians = -bank01 * this.maxBankAngleRadians;
    }

    this.updateBank(deltaTime, desiredBankRadians, speed01);

    const bankAuthority =
      this.maxBankAngleRadians <= 0
        ? 1
        : THREE.MathUtils.clamp(
            0.18 + Math.abs(this.currentBankRadians) / this.maxBankAngleRadians * 0.82,
            0.18,
            1
          );
    const maxYawStep = maxTurnRate * bankAuthority * deltaTime;
    this.root.rotation.y += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);
    this.root.rotation.z = this.currentBankRadians;

    return Math.abs(shortestAngleDelta(this.root.rotation.y, desiredYaw)) <= THREE.MathUtils.degToRad(3);
  }

  getCurrentForwardSpeed(): number {
    return this.currentForwardSpeed;
  }

  private updateForwardSpeed(deltaTime: number, desiredForwardSpeed: number): void {
    const clampedDesired = THREE.MathUtils.clamp(
      desiredForwardSpeed,
      0,
      this.maxForwardSpeed
    );
    const accel = clampedDesired >= this.currentForwardSpeed ? this.forwardAccel : this.forwardDecel;
    const maxStep = accel * deltaTime;
    this.currentForwardSpeed = moveToward(this.currentForwardSpeed, clampedDesired, maxStep);
    if (clampedDesired > 0) {
      this.currentForwardSpeed = Math.max(
        Math.min(clampedDesired, this.currentForwardSpeed),
        Math.min(clampedDesired, this.minForwardSpeed)
      );
    }
  }

  private updateStrafeSpeed(deltaTime: number, desiredStrafe: number): void {
    const speed01 = this.getSpeed01();
    const effectiveMaxStrafeSpeed = this.maxStrafeSpeed * THREE.MathUtils.lerp(1, 0.55, speed01);
    const clampedStrafe = THREE.MathUtils.clamp(desiredStrafe, -1, 1);
    const targetStrafeSpeed = clampedStrafe * effectiveMaxStrafeSpeed;

    if (Math.abs(clampedStrafe) > 0.001) {
      this.currentStrafeSpeed = moveToward(
        this.currentStrafeSpeed,
        targetStrafeSpeed,
        this.strafeAccel * deltaTime
      );
      return;
    }

    this.currentStrafeSpeed = moveToward(
      this.currentStrafeSpeed,
      0,
      this.strafeDamping * deltaTime
    );
  }

  private applyTranslation(deltaTime: number): void {
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FALLBACK_FORWARD);
    } else {
      this.worldForward.normalize();
    }

    this.worldRight.crossVectors(this.worldForward, UP_AXIS).multiplyScalar(-1);
    if (this.worldRight.lengthSq() <= 0.000001) {
      this.worldRight.set(1, 0, 0);
    } else {
      this.worldRight.normalize();
    }

    this.movementVelocity
      .copy(this.worldForward)
      .multiplyScalar(this.currentForwardSpeed)
      .addScaledVector(this.worldRight, this.currentStrafeSpeed);
    this.root.position.addScaledVector(this.movementVelocity, deltaTime);
  }

  private updateBank(deltaTime: number, desiredBankRadians: number, speed01: number): void {
    const isBankingIntoTurn = Math.abs(desiredBankRadians) > Math.abs(this.currentBankRadians);
    const baseRate = isBankingIntoTurn ? this.bankInRateRadians : this.bankOutRateRadians;
    const speedScaledRate = baseRate * THREE.MathUtils.lerp(1, 0.45, speed01);
    this.currentBankRadians = moveToward(
      this.currentBankRadians,
      desiredBankRadians,
      speedScaledRate * deltaTime
    );
  }

  private relaxBank(deltaTime: number): void {
    this.currentBankRadians = moveToward(
      this.currentBankRadians,
      0,
      this.bankOutRateRadians * deltaTime
    );
    this.root.rotation.z = this.currentBankRadians;
  }

  private getSpeed01(): number {
    const denom = Math.max(0.001, this.maxForwardSpeed - this.minForwardSpeed);
    return THREE.MathUtils.clamp((this.currentForwardSpeed - this.minForwardSpeed) / denom, 0, 1);
  }
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (maxDelta <= 0) {
    return current;
  }
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }
  if (current > target) {
    return Math.max(current - maxDelta, target);
  }
  return current;
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
