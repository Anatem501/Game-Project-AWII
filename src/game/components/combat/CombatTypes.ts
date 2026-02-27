import * as THREE from "three";
import type { DamageType } from "./DamageTypes";

export type CollisionArea = {
  radius: number;
  localOffset?: THREE.Vector3;
};

export type StatusPayload =
  | {
      kind: "cryo_buildup";
      amount: number;
    }
  | {
      kind: "electroshock_on_hit";
      chance01: number;
    };

export type DamagePacket = {
  amount: number;
  damageType: DamageType;
  segments?: readonly DamagePacketSegment[];
  statusPayloads?: readonly StatusPayload[];
  sourceId?: string;
  sourceFaction?: string | null;
};

export type DamagePacketSegment = {
  amount: number;
  damageType: DamageType;
};
