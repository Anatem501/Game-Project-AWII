import * as THREE from "three";

type ActiveSolarHitFlash = {
  age: number;
  duration: number;
  tendrils: HitFlashTendril[];
  root: THREE.Group;
  core: THREE.Sprite;
  glow: THREE.Sprite;
  star: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
  glowMaterial: THREE.SpriteMaterial;
  starMaterial: THREE.SpriteMaterial;
  baseSize: number;
};

type HitFlashTendril = {
  amplitude: number;
  material: THREE.SpriteMaterial;
  phase: number;
  rotationBias: number;
  speed: number;
  sprite: THREE.Sprite;
  stretch: number;
  widthScale: number;
};

export type SolarHitFlashSystem = {
  spawnFlash: (origin: THREE.Vector3, scaleMultiplier?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type SolarHitFlashSystemConfig = {
  lifetimeSeconds?: number;
};

export function createSolarHitFlashSystem(
  scene: THREE.Scene,
  config: SolarHitFlashSystemConfig = {}
): SolarHitFlashSystem {
  const lifetimeSeconds = Math.max(0.03, config.lifetimeSeconds ?? 0.16);
  const root = new THREE.Group();
  scene.add(root);

  const coreTexture = createRadialFlashTexture(256);
  const glowTexture = createRadialFlashTexture(256);
  const starTexture = createStarFlashTexture(256);
  const flameTexture = createFlameTendrilTexture(256);

  const coreMaterialTemplate = new THREE.SpriteMaterial({
    map: coreTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const glowMaterialTemplate = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xff8f28,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const starMaterialTemplate = new THREE.SpriteMaterial({
    map: starTexture,
    color: 0xffc56a,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const flameMaterialTemplate = new THREE.SpriteMaterial({
    map: flameTexture,
    color: 0xff7a1b,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });

  const flashes: ActiveSolarHitFlash[] = [];

  const spawnFlash = (origin: THREE.Vector3, scaleMultiplier = 1): void => {
    const duration = lifetimeSeconds * randomRange(0.9, 1.15);
    const baseSize = Math.max(0.25, 0.55 * Math.max(0.1, scaleMultiplier));

    const flashRoot = new THREE.Group();
    flashRoot.position.copy(origin);
    flashRoot.renderOrder = 18;

    const coreMaterial = coreMaterialTemplate.clone();
    const glowMaterial = glowMaterialTemplate.clone();
    const starMaterial = starMaterialTemplate.clone();
    const tendrils: HitFlashTendril[] = [];
    coreMaterial.opacity = 1;
    glowMaterial.opacity = 0.78;
    starMaterial.opacity = 0.68;

    const core = new THREE.Sprite(coreMaterial);
    const glow = new THREE.Sprite(glowMaterial);
    const star = new THREE.Sprite(starMaterial);
    core.renderOrder = 21;
    glow.renderOrder = 19;
    star.renderOrder = 20;
    core.center.set(0.5, 0.5);
    glow.center.set(0.5, 0.5);
    star.center.set(0.5, 0.5);
    star.material.rotation = Math.random() * Math.PI;

    core.scale.setScalar(baseSize * 0.8);
    glow.scale.setScalar(baseSize * 1.15);
    star.scale.setScalar(baseSize * 1.8);

    flashRoot.add(glow);
    flashRoot.add(star);
    flashRoot.add(core);
    for (let i = 0; i < 4; i += 1) {
      const material = flameMaterialTemplate.clone();
      material.color = material.color.clone();
      material.color.offsetHSL(
        randomRange(-0.015, 0.015),
        randomRange(-0.05, 0.05),
        randomRange(-0.03, 0.04)
      );
      material.opacity = randomRange(0.42, 0.68);
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0.78);
      sprite.renderOrder = 20;
      sprite.material.rotation = (Math.PI * 2 * i) / 4 + randomRange(-0.18, 0.18);
      flashRoot.add(sprite);
      tendrils.push({
        amplitude: baseSize * randomRange(0.18, 0.36),
        material,
        phase: Math.random() * Math.PI * 2,
        rotationBias: sprite.material.rotation,
        speed: randomRange(8.2, 13.5),
        sprite,
        stretch: randomRange(1.2, 2.05),
        widthScale: randomRange(0.22, 0.38)
      });
    }
    root.add(flashRoot);

    flashes.push({
      age: 0,
      duration,
      tendrils,
      root: flashRoot,
      core,
      glow,
      star,
      coreMaterial,
      glowMaterial,
      starMaterial,
      baseSize
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const flash = flashes[i];
      flash.age += deltaTime;
      const t = THREE.MathUtils.clamp(flash.age / Math.max(0.0001, flash.duration), 0, 1);
      const fade = 1 - t;
      const easeOut = 1 - Math.pow(1 - t, 3);

      flash.coreMaterial.opacity = 1.25 * Math.pow(fade, 1.9);
      flash.glowMaterial.opacity = 0.78 * Math.pow(fade, 1.08);
      flash.starMaterial.opacity = 0.68 * Math.pow(fade, 1.18);

      flash.core.scale.setScalar(flash.baseSize * THREE.MathUtils.lerp(0.75, 1.7, easeOut));
      flash.glow.scale.setScalar(flash.baseSize * THREE.MathUtils.lerp(1.0, 2.9, easeOut));
      flash.star.scale.setScalar(flash.baseSize * THREE.MathUtils.lerp(1.35, 3.55, easeOut));
      flash.star.material.rotation += deltaTime * 4.4;
      for (const tendril of flash.tendrils) {
        const sway = Math.sin(flash.age * tendril.speed + tendril.phase);
        const swayPerp = Math.sin(flash.age * (tendril.speed * 0.6) + tendril.phase * 1.4);
        tendril.sprite.position.set(
          Math.cos(tendril.rotationBias) * tendril.amplitude * sway * (0.4 + fade * 0.6),
          Math.sin(tendril.rotationBias) * tendril.amplitude * swayPerp * (0.4 + fade * 0.6),
          0
        );
        tendril.sprite.scale.set(
          flash.baseSize * tendril.widthScale * (0.85 + 0.55 * easeOut),
          flash.baseSize * tendril.stretch * (0.9 + 1.5 * easeOut),
          1
        );
        tendril.material.opacity = (0.26 + 0.52 * Math.abs(sway)) * Math.pow(fade, 1.05);
        tendril.sprite.material.rotation =
          tendril.rotationBias + sway * 0.45 + flash.age * 0.75;
      }

      if (flash.age < flash.duration) {
        continue;
      }

      flash.root.removeFromParent();
      flash.coreMaterial.dispose();
      flash.glowMaterial.dispose();
      flash.starMaterial.dispose();
      for (const tendril of flash.tendrils) {
        tendril.material.dispose();
      }
      flashes.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const flash of flashes) {
      flash.root.removeFromParent();
      flash.coreMaterial.dispose();
      flash.glowMaterial.dispose();
      flash.starMaterial.dispose();
      for (const tendril of flash.tendrils) {
        tendril.material.dispose();
      }
    }
    flashes.length = 0;
    root.removeFromParent();
    coreMaterialTemplate.dispose();
    glowMaterialTemplate.dispose();
    starMaterialTemplate.dispose();
    flameMaterialTemplate.dispose();
    coreTexture.dispose();
    glowTexture.dispose();
    starTexture.dispose();
    flameTexture.dispose();
  };

  return { spawnFlash, update, dispose };
}

function createRadialFlashTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  const cx = size * 0.5;
  const cy = size * 0.5;
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, size * 0.48);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.58, "rgba(255,188,110,0.55)");
  gradient.addColorStop(1, "rgba(255,110,32,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStarFlashTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  const cx = size * 0.5;
  const cy = size * 0.5;
  context.clearRect(0, 0, size, size);

  const radial = context.createRadialGradient(cx, cy, 0, cx, cy, size * 0.45);
  radial.addColorStop(0, "rgba(255,255,255,1)");
  radial.addColorStop(0.2, "rgba(255,236,180,0.95)");
  radial.addColorStop(0.55, "rgba(255,150,65,0.4)");
  radial.addColorStop(1, "rgba(255,100,28,0)");
  context.fillStyle = radial;
  context.fillRect(0, 0, size, size);

  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < 8; i += 1) {
    context.rotate(Math.PI / 4);
    const length = i % 2 === 0 ? size * 0.48 : size * 0.33;
    const width = i % 2 === 0 ? size * 0.022 : size * 0.015;
    const gradient = context.createLinearGradient(0, -length, 0, length);
    gradient.addColorStop(0, "rgba(255,150,70,0)");
    gradient.addColorStop(0.48, "rgba(255,220,150,0.95)");
    gradient.addColorStop(0.52, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,120,40,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, -length);
    context.lineTo(width, 0);
    context.lineTo(0, length);
    context.lineTo(-width, 0);
    context.closePath();
    context.fill();
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createFlameTendrilTexture(size: number): THREE.CanvasTexture {
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
  const topY = size * 0.06;
  const bottomY = size * 0.94;
  const width = size * 0.16;

  const outer = context.createLinearGradient(0, topY, 0, bottomY);
  outer.addColorStop(0, "rgba(255,255,255,0)");
  outer.addColorStop(0.16, "rgba(255,235,180,0.9)");
  outer.addColorStop(0.46, "rgba(255,160,70,0.85)");
  outer.addColorStop(0.78, "rgba(255,95,24,0.62)");
  outer.addColorStop(1, "rgba(255,70,18,0)");
  context.fillStyle = outer;

  context.beginPath();
  context.moveTo(cx, topY);
  for (let i = 1; i <= 12; i += 1) {
    const t = i / 12;
    const y = THREE.MathUtils.lerp(topY, bottomY, t);
    const wobble = Math.sin(t * Math.PI * 2.5) * width * (1 - t) * 0.85;
    const halfWidth = width * (0.18 + (1 - Math.abs(t - 0.45) * 1.5));
    context.lineTo(cx + wobble + halfWidth, y);
  }
  for (let i = 12; i >= 1; i -= 1) {
    const t = i / 12;
    const y = THREE.MathUtils.lerp(topY, bottomY, t);
    const wobble = Math.sin(t * Math.PI * 2.5) * width * (1 - t) * 0.85;
    const halfWidth = width * (0.18 + (1 - Math.abs(t - 0.45) * 1.5));
    context.lineTo(cx + wobble - halfWidth, y);
  }
  context.closePath();
  context.fill();

  const inner = context.createLinearGradient(0, topY, 0, bottomY);
  inner.addColorStop(0, "rgba(255,255,255,0)");
  inner.addColorStop(0.22, "rgba(255,250,230,0.88)");
  inner.addColorStop(0.52, "rgba(255,215,155,0.66)");
  inner.addColorStop(1, "rgba(255,150,80,0)");
  context.fillStyle = inner;
  context.beginPath();
  context.moveTo(cx, topY + size * 0.02);
  for (let i = 1; i <= 10; i += 1) {
    const t = i / 10;
    const y = THREE.MathUtils.lerp(topY + size * 0.02, bottomY - size * 0.08, t);
    const wobble = Math.sin(t * Math.PI * 3.0 + 0.8) * width * (1 - t) * 0.34;
    const halfWidth = width * (0.08 + (1 - Math.abs(t - 0.42) * 1.8)) * 0.46;
    context.lineTo(cx + wobble + halfWidth, y);
  }
  for (let i = 10; i >= 1; i -= 1) {
    const t = i / 10;
    const y = THREE.MathUtils.lerp(topY + size * 0.02, bottomY - size * 0.08, t);
    const wobble = Math.sin(t * Math.PI * 3.0 + 0.8) * width * (1 - t) * 0.34;
    const halfWidth = width * (0.08 + (1 - Math.abs(t - 0.42) * 1.8)) * 0.46;
    context.lineTo(cx + wobble - halfWidth, y);
  }
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
