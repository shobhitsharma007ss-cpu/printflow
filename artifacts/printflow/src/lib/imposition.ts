// PrintFlow imposition engine — pure math, no React.
// All dimensions in mm unless suffixed otherwise.
//
// Flat-blank model (folding cartons):
//   body band wraps Back-Side-Front-Side => widths L,W,L,W + glue flap
//   blankW = 2L + 2W + glueFlap                (all tuck/lock styles)
//   blankH depends on closure style:
//     straight_tuck / reverse_tuck : H + 2W + 2*TF
//     auto_bottom / crash_lock     : H + 2.25W + TF
//   where TF = min(W, tuckFlapCap)

export interface Allowances {
  glueFlap: number;     // mm — glue seam flap on body band
  tuckFlapCap: number;  // mm — tuck flap depth cap (TF = min(W, cap))
  gripper: number;      // mm — press gripper margin, one LONG edge
  tail: number;         // mm — opposite long-edge margin
  side: number;         // mm — each short-edge margin
  gutter: number;       // mm — between adjacent blanks (die rule + bleed)
}

export const DEFAULT_ALLOWANCES: Allowances = {
  glueFlap: 15,
  tuckFlapCap: 25,
  gripper: 10,
  tail: 5,
  side: 5,
  gutter: 3,
};

export const CARTON_STYLES = [
  { value: "straight_tuck", label: "Straight Tuck" },
  { value: "reverse_tuck", label: "Reverse Tuck" },
  { value: "auto_bottom", label: "Auto Bottom" },
  { value: "crash_lock", label: "Crash Lock" },
] as const;

export interface FlatBlank {
  blankW: number;
  blankH: number;
  tuckFlap: number;
  formula: string;
}

export function flatBlank(
  L: number,
  W: number,
  H: number,
  style: string,
  a: Allowances = DEFAULT_ALLOWANCES,
): FlatBlank {
  const TF = Math.min(W, a.tuckFlapCap);
  const blankW = 2 * L + 2 * W + a.glueFlap;
  let blankH: number;
  let formula: string;
  if (style === "auto_bottom" || style === "crash_lock") {
    blankH = H + 2.25 * W + TF;
    formula = `W: 2×${L} + 2×${W} + ${a.glueFlap} · H: ${H} + 2.25×${W} + ${TF}`;
  } else {
    // straight_tuck, reverse_tuck (and safe fallback for unknown styles)
    blankH = H + 2 * W + 2 * TF;
    formula = `W: 2×${L} + 2×${W} + ${a.glueFlap} · H: ${H} + 2×${W} + 2×${TF}`;
  }
  return {
    blankW: round1(blankW),
    blankH: round1(blankH),
    tuckFlap: TF,
    formula,
  };
}

export interface OrientationFit {
  cols: number;
  rows: number;
  ups: number;
}

export interface UpsResult {
  // orientation A: blankW along the sheet's LONG edge
  a: OrientationFit;
  // orientation B: blank rotated 90° (blankH along the long edge)
  b: OrientationFit;
  winner: "A" | "B";
  ups: number;
  cols: number;   // of winner
  rows: number;   // of winner
  usableW: number; // along long edge, after gripper+tail
  usableH: number; // along short edge, after 2×side
  yieldPct: number;
}

/**
 * Fit blanks on a sheet. Gripper is taken off the sheet's LONG edge
 * (Indian sheetfed convention), tail off the opposite long edge,
 * side margins off both short edges. Gutter between adjacent blanks.
 */
export function upsOnSheet(
  blankW: number,
  blankH: number,
  sheetLongMm: number,
  sheetShortMm: number,
  a: Allowances = DEFAULT_ALLOWANCES,
): UpsResult {
  const usableW = sheetLongMm - a.gripper - a.tail;
  const usableH = sheetShortMm - 2 * a.side;

  const fit = (bw: number, bh: number): OrientationFit => {
    if (bw <= 0 || bh <= 0 || usableW < bw || usableH < bh) {
      // quick reject when a single blank can't fit
      const cols = usableW >= bw && bw > 0 ? Math.floor((usableW + a.gutter) / (bw + a.gutter)) : 0;
      const rows = usableH >= bh && bh > 0 ? Math.floor((usableH + a.gutter) / (bh + a.gutter)) : 0;
      return { cols, rows, ups: cols * rows };
    }
    const cols = Math.floor((usableW + a.gutter) / (bw + a.gutter));
    const rows = Math.floor((usableH + a.gutter) / (bh + a.gutter));
    return { cols, rows, ups: cols * rows };
  };

  const A = fit(blankW, blankH);
  const B = fit(blankH, blankW);
  const winner: "A" | "B" = B.ups > A.ups ? "B" : "A";
  const win = winner === "A" ? A : B;
  const sheetArea = sheetLongMm * sheetShortMm;
  const yieldPct = sheetArea > 0 ? (win.ups * blankW * blankH * 100) / sheetArea : 0;

  return {
    a: A,
    b: B,
    winner,
    ups: win.ups,
    cols: win.cols,
    rows: win.rows,
    usableW: round1(usableW),
    usableH: round1(usableH),
    yieldPct: Math.round(yieldPct * 10) / 10,
  };
}

/** Parse a material `dimensions` string like "23x36", "58.4×91.4 cm", "584x914 mm".
 *  Default unit is INCHES (matches costing.tsx handleJobLink behaviour).
 *  Returns dims in mm, long edge first, or null if unparseable. */
export function parseSheetDimsMm(dimensions: string | null | undefined): { longMm: number; shortMm: number; label: string } | null {
  if (!dimensions) return null;
  const raw = dimensions.toLowerCase();
  const parts = raw.split(/[x×*]/i).map((s) => parseFloat(s.trim()));
  if (parts.length < 2 || !(parts[0] > 0) || !(parts[1] > 0)) return null;
  const toMm = raw.includes("mm") ? 1 : raw.includes("cm") ? 10 : 25.4;
  const d1 = parts[0] * toMm;
  const d2 = parts[1] * toMm;
  const longMm = Math.max(d1, d2);
  const shortMm = Math.min(d1, d2);
  return { longMm, shortMm, label: dimensions.trim() };
}

export const STANDARD_PARENTS_IN: Array<[number, number]> = [
  [28, 40],
  [25, 36],
  [23, 36],
  [22, 28],
  [20, 30],
];

export type GrainStatus = "ok" | "risk" | "unknown";

/**
 * Grain rule for folding cartons: paper grain should run PARALLEL to the
 * carton's height axis (the vertical scores), so the tuck/body creases fold
 * across the grain cleanly.
 *
 * Orientation A places blankH along the sheet's SHORT edge  -> needs grain "short".
 * Orientation B places blankH along the sheet's LONG edge   -> needs grain "long".
 *
 * Heavy board (gsm >= 300) or tall cartons (H > 150mm) make a mismatch a
 * genuine cracking risk; lighter jobs get a soft note only. We WARN, never block.
 */
export function grainCheck(
  winner: "A" | "B",
  sheetGrain: string | null | undefined,
  gsm: number,
  cartonH: number,
): { status: GrainStatus; needed: "long" | "short"; heavy: boolean } {
  const needed: "long" | "short" = winner === "A" ? "short" : "long";
  const heavy = gsm >= 300 || cartonH > 150;
  if (sheetGrain !== "long" && sheetGrain !== "short") {
    return { status: "unknown", needed, heavy };
  }
  return { status: sheetGrain === needed ? "ok" : "risk", needed, heavy };
}

/** Sheet weight in kg from mm dims + gsm: (L_cm × B_cm × gsm) / 10,000,000 */
export function sheetWeightKg(longMm: number, shortMm: number, gsm: number): number {
  return ((longMm / 10) * (shortMm / 10) * gsm) / 10_000_000;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
