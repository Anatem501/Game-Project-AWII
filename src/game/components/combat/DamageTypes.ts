export const DAMAGE_TYPES = [
  "Laser",
  "Ion",
  "Plasma",
  "Solar",
  "Cryo",
  "Void",
  "Acid",
  "Kinetic",
  "Concussive"
] as const;

export type BuiltInDamageType = (typeof DAMAGE_TYPES)[number];
export type DamageType = BuiltInDamageType | (string & {});

export const DEFAULT_DAMAGE_TYPE: DamageType = "Kinetic";
export const LASER_DAMAGE_TYPE: DamageType = "Laser";

export function normalizeDamageTypeKey(value: string): string {
  return value.trim().toLowerCase();
}
