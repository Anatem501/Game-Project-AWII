import * as THREE from "three";
import { normalizeAngle, randomRange, shortestAngleDelta } from "../utils/EnemyShipMath";

export type CenterPassEdgePatrolPhase = "to_center_pass" | "to_edge" | "edge_traverse";

export type CenterPassEdgePatrolPlannerConfig = {
  center: THREE.Vector3;
  edgeRadius: number;
  centerPassOffsetMin: number;
  centerPassOffsetMax: number;
  centerPassArrivalRadius?: number;
  edgeArrivalRadius?: number;
  edgeAngleToleranceRadians?: number;
};

export class CenterPassEdgePatrolPlanner {
  private readonly center: THREE.Vector3;
  private readonly edgeRadius: number;
  private readonly centerPassOffsetMin: number;
  private readonly centerPassOffsetMax: number;
  private readonly centerPassArrivalRadius: number;
  private readonly edgeArrivalRadius: number;
  private readonly edgeAngleToleranceRadians: number;

  private readonly centerPassPoint = new THREE.Vector3();
  private readonly edgePoint = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();

  private routeInitialized = false;
  private phase: CenterPassEdgePatrolPhase = "to_center_pass";
  private edgeTraverseTargetAngle = 0;
  private edgeTraverseDirection: 1 | -1 = 1;
  private edgeCurrentAngle = 0;

  constructor(config: CenterPassEdgePatrolPlannerConfig) {
    this.center = config.center.clone();
    this.edgeRadius = Math.max(1, config.edgeRadius);
    this.centerPassOffsetMin = Math.max(0, config.centerPassOffsetMin);
    this.centerPassOffsetMax = Math.max(this.centerPassOffsetMin, config.centerPassOffsetMax);
    this.centerPassArrivalRadius = Math.max(0.1, config.centerPassArrivalRadius ?? 1.6);
    this.edgeArrivalRadius = Math.max(0.1, config.edgeArrivalRadius ?? 1.6);
    this.edgeAngleToleranceRadians = Math.max(0.001, config.edgeAngleToleranceRadians ?? 0.05);
  }

  ensureInitialized(currentPosition: THREE.Vector3): void {
    if (this.routeInitialized) {
      return;
    }

    this.edgeCurrentAngle = this.resolveCurrentEdgeAngle(currentPosition);
    if (!Number.isFinite(this.edgeCurrentAngle)) {
      this.edgeCurrentAngle = Math.random() * Math.PI * 2;
    }
    this.buildNextRoute(currentPosition);
  }

  reset(): void {
    this.routeInitialized = false;
    this.phase = "to_center_pass";
  }

  update(
    currentPosition: THREE.Vector3,
    patrolSpeed: number,
    deltaTime: number,
    outTarget: THREE.Vector3
  ): number | null {
    if (deltaTime <= 0 || patrolSpeed <= 0) {
      return null;
    }

    this.ensureInitialized(currentPosition);

    switch (this.phase) {
      case "to_center_pass": {
        outTarget.copy(this.centerPassPoint);
        if (isNearPoint2D(currentPosition, this.centerPassPoint, this.centerPassArrivalRadius)) {
          this.phase = "to_edge";
        }
        return 1.2;
      }
      case "to_edge": {
        outTarget.copy(this.edgePoint);
        if (isNearPoint2D(currentPosition, this.edgePoint, this.edgeArrivalRadius)) {
          this.phase = "edge_traverse";
        }
        return 1.2;
      }
      case "edge_traverse": {
        this.updateEdgeTraverse(currentPosition.y, patrolSpeed, deltaTime, outTarget);
        if (this.hasReachedTargetEdgeAngle()) {
          this.buildNextRoute(currentPosition);
        }
        return 0;
      }
    }
  }

  getPhase(): CenterPassEdgePatrolPhase {
    return this.phase;
  }

  private buildNextRoute(currentPosition: THREE.Vector3): void {
    this.routeInitialized = true;
    this.phase = "to_center_pass";

    const startAngle = this.resolveCurrentEdgeAngle(currentPosition);
    this.edgeCurrentAngle = startAngle;

    const oppositeAngle = startAngle + Math.PI + randomRange(-0.45, 0.45);
    this.edgePoint.set(
      this.center.x + Math.sin(oppositeAngle) * this.edgeRadius,
      currentPosition.y,
      this.center.z + Math.cos(oppositeAngle) * this.edgeRadius
    );

    const passAngle = oppositeAngle + randomRange(-1.2, 1.2);
    const passOffset = randomRange(this.centerPassOffsetMin, this.centerPassOffsetMax);
    this.centerPassPoint.set(
      this.center.x + Math.sin(passAngle) * passOffset,
      currentPosition.y,
      this.center.z + Math.cos(passAngle) * passOffset
    );

    this.edgeCurrentAngle = normalizeAngle(oppositeAngle);
    this.edgeTraverseDirection = Math.random() < 0.5 ? -1 : 1;
    const edgeArcTravel = randomRange(0.55, 1.35);
    this.edgeTraverseTargetAngle = normalizeAngle(
      this.edgeCurrentAngle + edgeArcTravel * this.edgeTraverseDirection
    );
  }

  private updateEdgeTraverse(
    y: number,
    patrolSpeed: number,
    deltaTime: number,
    outTarget: THREE.Vector3
  ): void {
    const angularSpeed = patrolSpeed / Math.max(0.001, this.edgeRadius);
    const remainingDelta = shortestAngleDelta(this.edgeCurrentAngle, this.edgeTraverseTargetAngle);

    this.edgeTraverseDirection = remainingDelta >= 0 ? 1 : -1;
    const maxStep = angularSpeed * deltaTime;
    const step = THREE.MathUtils.clamp(remainingDelta, -maxStep, maxStep);
    this.edgeCurrentAngle = normalizeAngle(this.edgeCurrentAngle + step);

    this.desiredPosition.set(
      this.center.x + Math.sin(this.edgeCurrentAngle) * this.edgeRadius,
      y,
      this.center.z + Math.cos(this.edgeCurrentAngle) * this.edgeRadius
    );
    outTarget.copy(this.desiredPosition);
  }

  private hasReachedTargetEdgeAngle(): boolean {
    return (
      Math.abs(shortestAngleDelta(this.edgeCurrentAngle, this.edgeTraverseTargetAngle)) <=
      this.edgeAngleToleranceRadians
    );
  }

  private resolveCurrentEdgeAngle(currentPosition: THREE.Vector3): number {
    const dx = currentPosition.x - this.center.x;
    const dz = currentPosition.z - this.center.z;
    if (dx * dx + dz * dz <= 0.000001) {
      return this.edgeCurrentAngle;
    }
    return normalizeAngle(Math.atan2(dx, dz));
  }
}

function isNearPoint2D(currentPosition: THREE.Vector3, target: THREE.Vector3, threshold: number): boolean {
  const dx = currentPosition.x - target.x;
  const dz = currentPosition.z - target.z;
  return dx * dx + dz * dz <= threshold * threshold;
}
