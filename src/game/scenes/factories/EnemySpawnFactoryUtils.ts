import * as THREE from "three";

export type OppositeHalfEdgeSpawnOptions = {
  arenaCenter: THREE.Vector3;
  arenaEdgeRadius: number;
};

export function resolveOppositeHalfEdgeSpawnPosition(
  playerTarget: THREE.Object3D,
  options: OppositeHalfEdgeSpawnOptions
): THREE.Vector3 {
  const playerWorldPosition = new THREE.Vector3();
  const playerForward = new THREE.Vector3();
  playerTarget.getWorldPosition(playerWorldPosition);

  const toPlayer = new THREE.Vector3(
    playerWorldPosition.x - options.arenaCenter.x,
    0,
    playerWorldPosition.z - options.arenaCenter.z
  );

  let referenceAngle: number;
  if (toPlayer.lengthSq() > 0.000001) {
    referenceAngle = Math.atan2(toPlayer.x, toPlayer.z);
  } else {
    playerTarget.getWorldDirection(playerForward);
    playerForward.setY(0);
    if (playerForward.lengthSq() <= 0.000001) {
      referenceAngle = Math.random() * Math.PI * 2;
    } else {
      playerForward.normalize();
      referenceAngle = Math.atan2(playerForward.x, playerForward.z);
    }
  }

  const spawnAngle = referenceAngle + Math.PI + randomRange(-Math.PI * 0.5, Math.PI * 0.5);
  return new THREE.Vector3(
    options.arenaCenter.x + Math.sin(spawnAngle) * options.arenaEdgeRadius,
    playerWorldPosition.y,
    options.arenaCenter.z + Math.cos(spawnAngle) * options.arenaEdgeRadius
  );
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
