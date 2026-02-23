import * as THREE from "three";

export function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}

export function normalizeAngle(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle, Math.PI * 2);
}

export function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
