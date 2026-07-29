/* Dimension unit switching.
   Storage stays canonical (carton dims in mm, sheet dims in inches) so every
   validated calculation — costing compute(), imposition.ts, Layout→Costing
   handoff — keeps working untouched. Only the display/input layer converts.

   Prakash's floor thinks in cm, so cm is the default everywhere. */

export type DimUnit = "cm" | "mm" | "in";

export const DIM_UNITS: DimUnit[] = ["cm", "mm", "in"];

/** Default unit for dimension entry. Prakash's floor works in cm. */
export const DEFAULT_DIM_UNIT: DimUnit = "cm";

const MM_PER: Record<DimUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/** Canonical millimetres → the chosen display unit. */
export function mmToUnit(mm: number, unit: DimUnit): number {
  if (!isFinite(mm)) return 0;
  return mm / MM_PER[unit];
}

/** A value typed in the chosen unit → canonical millimetres. */
export function unitToMm(value: number, unit: DimUnit): number {
  if (!isFinite(value)) return 0;
  return value * MM_PER[unit];
}

/** Canonical inches → the chosen display unit (sheet sizes are stored in inches). */
export function inToUnit(inches: number, unit: DimUnit): number {
  return mmToUnit(inches * 25.4, unit);
}

/** A value typed in the chosen unit → canonical inches. */
export function unitToIn(value: number, unit: DimUnit): number {
  return unitToMm(value, unit) / 25.4;
}

/** Sensible decimals per unit: mm whole-ish, cm one place, inches two. */
export function dimDecimals(unit: DimUnit): number {
  return unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
}

/** Format a canonical-mm value for showing inside an input, in the given unit. */
export function fmtMmIn(mm: number, unit: DimUnit): string {
  const v = mmToUnit(mm, unit);
  if (!v) return "";
  return String(Number(v.toFixed(dimDecimals(unit))));
}

/** Format a canonical-inches value for showing inside an input, in the given unit. */
export function fmtInIn(inches: number, unit: DimUnit): string {
  const v = inToUnit(inches, unit);
  if (!v) return "";
  return String(Number(v.toFixed(dimDecimals(unit))));
}

/** Short label, e.g. for "295 × 170 mm". */
export function unitLabel(unit: DimUnit): string {
  return unit;
}
