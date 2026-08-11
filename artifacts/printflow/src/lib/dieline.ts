import { type Allowances, DEFAULT_ALLOWANCES } from "@/lib/imposition";

/* Parametric carton dielines.
   ─────────────────────────────────────────────────────────────────
   The blank bounding box MUST match flatBlank() in imposition.ts:
     blankW = 2L + 2W + glueFlap
     blankH = H + 2W + 2·TF          (tuck styles, TF = min(W, tuckFlapCap))
   Same Allowances object in → drawing and ups math can never disagree.

   Drawing convention (decoded from EaseDraw's PDFs):
     red   = cut lines
     green = crease/fold lines
   Panel order left→right: [glue][L back][W side][L front][W side]
   Straight tuck: both lids+tucks on the BACK (L1) panel.
   Reverse tuck : top lid on L1, bottom lid on L2 (opposite faces).
   Auto-bottom / crash-lock: not yet supported (angled glue panels —
   built after the tuck styles are verified against a real die). */

export interface DieSeg { x1: number; y1: number; x2: number; y2: number }

export interface Dieline {
  supported: boolean;
  note?: string;
  blankW: number;
  blankH: number;
  cuts: DieSeg[];
  creases: DieSeg[];
  labels: Array<{ x: number; y: number; text: string; rotate?: boolean }>;
}

const seg = (x1: number, y1: number, x2: number, y2: number): DieSeg => ({ x1, y1, x2, y2 });

/** Chain of points → consecutive cut segments. */
function chain(pts: Array<[number, number]>): DieSeg[] {
  const out: DieSeg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push(seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return out;
}

export function buildDieline(
  L: number,
  W: number,
  H: number,
  style: string,
  a: Allowances = DEFAULT_ALLOWANCES,
): Dieline {
  const TF = Math.min(W, a.tuckFlapCap);
  const blankW = 2 * L + 2 * W + a.glueFlap;

  if (style === "auto_bottom" || style === "crash_lock") {
    return {
      supported: false,
      note: "Auto-bottom / crash-lock dieline coming next — tuck styles first, then the angled glue panels.",
      blankW,
      blankH: H + 2.25 * W + TF,
      cuts: [], creases: [], labels: [],
    };
  }

  const blankH = H + 2 * W + 2 * TF;
  const reverse = style === "reverse_tuck";

  // Dust flap depth: shorter than the lid so it clears when the tuck closes.
  const DF = Math.max(6, Math.min(15, W * 0.7, TF - 2));
  const SHOULDER = Math.min(4, TF / 3);   // tuck corner chamfer
  const TAPER = 3;                         // glue-flap end taper
  const INSET = 2;                         // dust-flap side inset

  // Column x positions: [glue][L1][W1][L2][W2]
  const x0 = 0;
  const x1 = a.glueFlap;
  const x2 = x1 + L;
  const x3 = x2 + W;
  const x4 = x3 + L;
  const x5 = x4 + W; // = blankW

  // Rows (y down): tuck | lid | body | lid | tuck
  const yT = 0;
  const yLidTop = TF;
  const yBodyTop = TF + W;
  const yBodyBot = yBodyTop + H;
  const yLidBot = yBodyBot + W;
  const yB = yLidBot + TF; // = blankH

  const cuts: DieSeg[] = [];
  const creases: DieSeg[] = [];

  // ── Glue flap (body band only, tapered ends) ──
  cuts.push(...chain([
    [x1, yBodyTop], [x0, yBodyTop + TAPER], [x0, yBodyBot - TAPER], [x1, yBodyBot],
  ]));
  creases.push(seg(x1, yBodyTop, x1, yBodyBot));

  // ── Vertical panel creases (body band) ──
  for (const x of [x2, x3, x4]) creases.push(seg(x, yBodyTop, x, yBodyBot));

  // ── Right outer edge (W2 side, body band) ──
  cuts.push(seg(x5, yBodyTop, x5, yBodyBot));

  /** Lid + tuck assembly above/below an L column [xa..xb]. dir=-1 up, +1 down. */
  function lidTuck(xa: number, xb: number, dir: -1 | 1) {
    const yBody = dir === -1 ? yBodyTop : yBodyBot;
    const yLid = yBody + dir * W;
    const yTip = yLid + dir * TF;
    creases.push(seg(xa, yBody, xb, yBody));           // lid root
    cuts.push(seg(xa, yBody, xa, yLid));               // lid sides
    cuts.push(seg(xb, yBody, xb, yLid));
    creases.push(seg(xa, yLid, xb, yLid));             // tuck root
    cuts.push(...chain([                                // tuck with shoulders
      [xa, yLid],
      [xa, yTip - dir * SHOULDER],
      [xa + SHOULDER, yTip],
      [xb - SHOULDER, yTip],
      [xb, yTip - dir * SHOULDER],
      [xb, yLid],
    ]));
  }

  /** Dust flap above/below a W column [xa..xb]. */
  function dust(xa: number, xb: number, dir: -1 | 1) {
    const yBody = dir === -1 ? yBodyTop : yBodyBot;
    const yTip = yBody + dir * DF;
    creases.push(seg(xa, yBody, xb, yBody));
    cuts.push(...chain([
      [xa, yBody],
      [xa + INSET, yTip],
      [xb - INSET, yTip],
      [xb, yBody],
    ]));
  }

  /** Plain body edge (no flap) along a column. */
  const plainEdge = (xa: number, xb: number, y: number) => cuts.push(seg(xa, y, xb, y));

  // ── TOP: lid+tuck on L1 always; dust on both W columns ──
  lidTuck(x1, x2, -1);
  dust(x2, x3, -1);
  plainEdge(x3, x4, yBodyTop);   // L2 (front) top edge: plain in both tuck styles
  dust(x4, x5, -1);

  // ── BOTTOM ──
  if (reverse) {
    plainEdge(x1, x2, yBodyBot);   // L1 bottom plain
    dust(x2, x3, 1);
    lidTuck(x3, x4, 1);            // bottom lid on L2 (opposite face)
    dust(x4, x5, 1);
  } else {
    lidTuck(x1, x2, 1);            // straight: both lids on L1
    dust(x2, x3, 1);
    plainEdge(x3, x4, yBodyBot);
    dust(x4, x5, 1);
  }

  // ── Dimension labels (EaseDraw style: value(MM)) ──
  const mid = (p: number, q: number) => (p + q) / 2;
  const labels = [
    { x: mid(x0, x1), y: yBodyTop - 3, text: `${a.glueFlap}` },
    { x: mid(x1, x2), y: yBodyTop - 3, text: `${L}` },
    { x: mid(x2, x3), y: yBodyTop - 3, text: `${W}` },
    { x: mid(x3, x4), y: yBodyTop - 3, text: `${L}` },
    { x: mid(x4, x5), y: yBodyTop - 3, text: `${W}` },
    { x: x5 + 4, y: mid(yBodyTop, yBodyBot), text: `${H}`, rotate: true },
    { x: x5 + 4, y: mid(yT, yLidTop) + (reverse ? 0 : 0), text: `TF ${TF}`, rotate: true },
  ];

  return { supported: true, blankW, blankH, cuts, creases, labels };
}

/** Standalone SVG string (mm-true) for download — opens in Corel/Illustrator. */
export function dielineSvgString(d: Dieline, title: string): string {
  const pad = 12;
  const wMm = d.blankW + pad * 2;
  const hMm = d.blankH + pad * 2 + 8;
  const line = (s: DieSeg, col: string, dash: string) =>
    `<line x1="${(s.x1 + pad).toFixed(2)}" y1="${(s.y1 + pad).toFixed(2)}" x2="${(s.x2 + pad).toFixed(2)}" y2="${(s.y2 + pad).toFixed(2)}" stroke="${col}" stroke-width="0.5" ${dash}/>`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm}mm" height="${hMm}mm" viewBox="0 0 ${wMm} ${hMm}">`,
    `<rect width="${wMm}" height="${hMm}" fill="white"/>`,
    ...d.creases.map((s) => line(s, "#00A651", 'stroke-dasharray="2 1.5"')),
    ...d.cuts.map((s) => line(s, "#ED1C24", "")),
    ...d.labels.map((l) =>
      `<text x="${(l.x + pad).toFixed(1)}" y="${(l.y + pad).toFixed(1)}" font-family="Arial" font-size="3.2" fill="#333"${l.rotate ? ` transform="rotate(-90 ${(l.x + pad).toFixed(1)} ${(l.y + pad).toFixed(1)})"` : ""} text-anchor="middle">${l.text}(MM)</text>`),
    `<text x="${pad}" y="${hMm - 4}" font-family="Arial" font-size="3.5" fill="#666">${title} · blank ${d.blankW}×${d.blankH} mm · red=CUT green=CREASE · PrintFlow</text>`,
    `</svg>`,
  ];
  return parts.join("\n");
}
