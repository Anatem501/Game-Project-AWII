import * as THREE from "three";

type ReticleParams = {
  reticleHeight: number;
  maxDistanceFromShip: number;
};

export type ReticleObjects = {
  inputAimReticle: THREE.Group;
  trueAimReticle: THREE.Group;
};

export function createReticles(
  scene: THREE.Scene,
  { reticleHeight, maxDistanceFromShip }: ReticleParams
): ReticleObjects {
  const trueAimReticle = createTrueAimReticle();
  trueAimReticle.position.set(0, reticleHeight, -maxDistanceFromShip);
  scene.add(trueAimReticle);

  const inputAimReticle = createInputAimReticle();
  inputAimReticle.position.set(0, reticleHeight, 0);
  scene.add(inputAimReticle);

  return { inputAimReticle, trueAimReticle };
}

function createTrueAimReticle(): THREE.Group {
  const reticle = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x7ce0ff,
    transparent: true,
    opacity: 0.95,
    toneMapped: false
  });

  const armLength = 0.11;
  const armThickness = 0.02;
  const centerGap = 0.045;

  const north = new THREE.Mesh(new THREE.BoxGeometry(armThickness, 0.002, armLength), material);
  north.position.set(0, 0.001, -(centerGap + armLength * 0.5));
  reticle.add(north);

  const south = new THREE.Mesh(new THREE.BoxGeometry(armThickness, 0.002, armLength), material);
  south.position.set(0, 0.001, centerGap + armLength * 0.5);
  reticle.add(south);

  const east = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.002, armThickness), material);
  east.position.set(centerGap + armLength * 0.5, 0.001, 0);
  reticle.add(east);

  const west = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.002, armThickness), material);
  west.position.set(-(centerGap + armLength * 0.5), 0.001, 0);
  reticle.add(west);

  const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), material);
  centerDot.rotation.x = -Math.PI / 2;
  centerDot.position.y = 0.0015;
  reticle.add(centerDot);

  return reticle;
}

function createInputAimReticle(): THREE.Group {
  const reticle = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ce0ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0x9feaff,
    transparent: true,
    opacity: 0.9,
    toneMapped: false
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.295, 48), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  reticle.add(ring);

  const markLength = 0.12;
  const markThickness = 0.015;
  const markRadius = 0.37;

  const north = new THREE.Mesh(
    new THREE.BoxGeometry(markThickness, 0.002, markLength),
    markMaterial
  );
  north.position.set(0, 0.001, -markRadius);
  reticle.add(north);

  const south = new THREE.Mesh(
    new THREE.BoxGeometry(markThickness, 0.002, markLength),
    markMaterial
  );
  south.position.set(0, 0.001, markRadius);
  reticle.add(south);

  const east = new THREE.Mesh(new THREE.BoxGeometry(markLength, 0.002, markThickness), markMaterial);
  east.position.set(markRadius, 0.001, 0);
  reticle.add(east);

  const west = new THREE.Mesh(new THREE.BoxGeometry(markLength, 0.002, markThickness), markMaterial);
  west.position.set(-markRadius, 0.001, 0);
  reticle.add(west);

  return reticle;
}
