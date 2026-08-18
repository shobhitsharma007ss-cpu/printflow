import type { Machine } from "@workspace/api-client-react";

/* Which presses can actually run a given sheet?

   Two different limits matter:
   • max SHEET  — what the machine can physically grip and feed
   • max PRINT  — usable image area after gripper + side margins

   Prakash's floor (migration 18):
     Komori LA37 / GL37   sheet 640×940   print 620×930
     Planeta Super Variant sheet 711×1016  print 685×965   (overflow press —
       mostly non-woven, but takes paper jobs when the Komoris are packed)

   The Planeta accepts sheets the Komoris cannot, so we warn rather than block:
   the estimator decides whether that job can wait for the one machine. */

/* ── DISABLED 2026-08-17 ─────────────────────────────────────────────────────
   Press-fit checking is suppressed pending a post-trim size model.

   WHY: sheets are routinely trimmed on the Wohlenberg before loading (see
   DOMAIN-RULES.md → Sheet handling → Trimming before press). These checks read
   the material's STORED dimensions, which are the PURCHASED size, so any job on
   trimmed stock is measured against a sheet the plant never loads. T-35 Dibbi
   (93.5 x 106 cm) is the proof case: 1060 mm exceeds every press here, yet the
   plant runs it routinely after trimming. The warnings therefore produce false
   negatives on real production work, and a supervised pilot is imminent.

   RE-ENABLE WHEN: a post-trim sheet size exists to validate against — i.e. the
   material-received-vs-material-consumed model is built. Flip this one flag and
   point checkPressFit() at the post-trim size instead of material.dimensions.
   The validation logic below is deliberately left intact and unmodified.        */
export const PRESS_FIT_CHECK_ENABLED = false;

export type PressFit = {
  fits: Machine[];        // presses that can feed this sheet
  cannot: Machine[];      // presses that cannot
  allFit: boolean;
  noneFit: boolean;
};

/** Does a sheet (mm, either orientation) fit within a machine limit? */
function within(sheetA: number, sheetB: number, limitA?: number | null, limitB?: number | null): boolean {
  if (!limitA || !limitB) return true;           // unknown limits → don't warn
  const [sMin, sMax] = [Math.min(sheetA, sheetB), Math.max(sheetA, sheetB)];
  const [lMin, lMax] = [Math.min(limitA, limitB), Math.max(limitA, limitB)];
  return sMin <= lMin && sMax <= lMax;
}

/** Presses only — die cutters/gluers don't constrain the sheet choice here. */
export function pressesFor(machines: Machine[] | undefined): Machine[] {
  return (machines ?? []).filter((m) => m.machineType === "printing");
}

export function checkPressFit(
  sheetLongMm: number,
  sheetShortMm: number,
  machines: Machine[] | undefined,
): PressFit {
  // Suppressed until a post-trim size exists — see PRESS_FIT_CHECK_ENABLED above.
  if (!PRESS_FIT_CHECK_ENABLED) {
    return { fits: [], cannot: [], allFit: true, noneFit: false };
  }
  const presses = pressesFor(machines).filter(
    (m) => m.maxSheetWidthMm && m.maxSheetLengthMm,
  );
  const fits: Machine[] = [];
  const cannot: Machine[] = [];
  for (const m of presses) {
    if (within(sheetLongMm, sheetShortMm, m.maxSheetWidthMm, m.maxSheetLengthMm)) fits.push(m);
    else cannot.push(m);
  }
  return {
    fits,
    cannot,
    allFit: presses.length > 0 && cannot.length === 0,
    noneFit: presses.length > 0 && fits.length === 0,
  };
}

/** Short human label, e.g. "Planeta only — Komoris can't feed this". */
export function pressFitLabel(fit: PressFit): string | null {
  if (fit.noneFit) return "Exceeds every press — cannot be printed in-house";
  if (fit.allFit || fit.fits.length === 0) return null;
  const names = fit.fits.map((m) => m.machineName).join(", ");
  const blocked = fit.cannot.map((m) => m.machineName).join(", ");
  return `${names} only — ${blocked} cannot feed this sheet`;
}
