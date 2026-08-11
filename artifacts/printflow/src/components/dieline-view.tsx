import React, { useMemo } from "react";
import { Download } from "lucide-react";
import { buildDieline, dielineSvgString } from "@/lib/dieline";
import { type Allowances } from "@/lib/imposition";

/* Inline dieline preview + download.
   Red = cut, green = crease — the industry (and EaseDraw) convention.
   The geometry shares the same Allowances as flatBlank/upsOnSheet, so the
   drawn blank always equals the blank used in the ups math. */

export function DielineView({
  L, W, H, style, styleLabel, allow,
}: {
  L: number; W: number; H: number;
  style: string; styleLabel: string;
  allow: Allowances;
}) {
  const die = useMemo(() => buildDieline(L, W, H, style, allow), [L, W, H, style, allow]);

  if (!die.supported) {
    return (
      <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2.5">
        {die.note}
      </p>
    );
  }

  // Fit the blank into a display box, preserving mm aspect ratio.
  const PADW = 26;                       // room for side labels
  const vw = die.blankW + PADW * 2;
  const vh = die.blankH + PADW * 2;

  const download = () => {
    const svg = dielineSvgString(die, `${styleLabel.toUpperCase()} ${L}x${W}x${H}`);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dieline_${style}_${L}x${W}x${H}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${vw} ${vh}`}
        className="w-full h-auto rounded-lg border border-border bg-white dark:bg-zinc-900"
        role="img"
        aria-label={`${styleLabel} dieline ${die.blankW} by ${die.blankH} mm`}
      >
        {die.creases.map((s, i) => (
          <line key={`c${i}`} x1={s.x1 + PADW} y1={s.y1 + PADW} x2={s.x2 + PADW} y2={s.y2 + PADW}
            stroke="#00A651" strokeWidth={Math.max(0.6, die.blankW / 400)} strokeDasharray="3 2" />
        ))}
        {die.cuts.map((s, i) => (
          <line key={`k${i}`} x1={s.x1 + PADW} y1={s.y1 + PADW} x2={s.x2 + PADW} y2={s.y2 + PADW}
            stroke="#ED1C24" strokeWidth={Math.max(0.8, die.blankW / 300)} />
        ))}
        {die.labels.map((l, i) => (
          <text key={`t${i}`} x={l.x + PADW} y={l.y + PADW}
            fontSize={Math.max(4, die.blankW / 60)} fill="currentColor" className="text-muted-foreground"
            textAnchor="middle"
            transform={l.rotate ? `rotate(-90 ${l.x + PADW} ${l.y + PADW})` : undefined}>
            {l.text}
          </text>
        ))}
      </svg>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          <span className="text-rose-500 font-semibold">— cut</span>{" "}
          <span className="text-emerald-600 font-semibold">‑ ‑ crease</span>{" "}
          · blank {die.blankW}×{die.blankH} mm
        </p>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted transition-colors"
        >
          <Download size={13} /> SVG
        </button>
      </div>
    </div>
  );
}
