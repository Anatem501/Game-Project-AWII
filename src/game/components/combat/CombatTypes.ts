import * as THREE from "three";
import type { DamageType } from "./DamageTypes";

export type CollisionArea = {
  radius: number;
  localOffset?: THREE.Vector3;
};

export type DamagePacket = {
  amount: number;
  damageType: DamageType;
  segments?: readonly DamagePacketSegment[];
  sourceId?: string;
  sourceFaction?: string | null;
};

export type DamagePacketSegment = {
  amount: number;
  damageType: DamageType;
};
