import * as THREE from "three";
import type { DamageType } from "./DamageTypes";

export type CollisionArea = {
  radius: number;
  localOffset?: THREE.Vector3;
};

export type DamagePacket = {
  amount: number;
  damageType: DamageType;
  sourceId?: string;
  sourceFaction?: string | null;
};
