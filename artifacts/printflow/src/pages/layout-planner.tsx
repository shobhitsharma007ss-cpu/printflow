import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LayoutGrid, ArrowRight, ChevronDown, ChevronUp, Ruler, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, Button, Input, Label, Select } from "@/components/ui-elements";
import { useMaterials } from "@/hooks/use-inventory";
import { useJobs } from "@/hooks/use-jobs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ALLOWANCES,
  CARTON_STYLES,
  STANDARD_PARENTS_IN,
  flatBlank,
  upsOnSheet,
  parseSheetDimsMm,
  grainCheck,
  sheetWeightKg,
  type Allowances,
  type UpsResult,
} from "@/lib/imposition";

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function num(v: string, fallback = 0): number {
  const x = parseFloat(v);
  return isNaN(x) ? fallback : x;
}

interface Recommendation {
  key: string;
  source: "stock" | "parent";
  materialId: number | null;
  name: string;
  dimsLabel: string;
  longMm: number;
  shortMm: number;
  gsm: number | null;
  grain: string | null;
  ratePerKg: number | null;
  ratePerSheet: number | null;
  stockQty: number | null;
  stockUnit: string | null;
  ups: UpsResult;
  sheetsNeeded: number;
  paperCost: number | null;
}

export default function LayoutPlanner() {
  const [, navigate] = useLocation();
  const { data: materials } = useMaterials();
  const { data: jobs } = useJobs();
  const [saveJobId, setSaveJobId] = useState<string>("");

  const [cartonL, setCartonL] = useState("100");
  const [cartonW, setCartonW] = useState("40");
  const [cartonH, setCartonH] = useState("40");
  const [style, setStyle] = useState("straight_tuck");
  const [qty, setQty] = useState("25000");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [allow, setAllow] = useState<Allowances>({ ...DEFAULT_ALLOWANCES });
  const [selectedKey, setSelectedKey] = useState<string>("");

  const L = num(cartonL);
  const W = num(cartonW);
  const H = num(cartonH);
  const qtyN = Math.max(1, num(qty, 25000));
  const validCarton = L > 0 && W > 0 && H > 0;

  const blank = useMemo(
    () => (validCarton ? flatBlank(L, W, H, style, allow) : null),
    [L, W, H, style, allow, validCarton],
  );

  const recommendations = useMemo<Recommendation[]>(() => {
    if (!blank) return [];
    const recs: Recommendation[] = [];

    const boards = (materials ?? []).filter(
      (m) => m.materialType === "board" || m.materialType === "paper",
    );
    for (const m of boards) {
      const dims = parseSheetDimsMm(m.dimensions);
      if (!dims) continue;
      const ups = upsOnSheet(blank.blankW, blank.blankH, dims.longMm, dims.shortMm, allow);
      if (ups.ups <= 0) continue;
      const sheetsNeeded = Math.ceil(qtyN / ups.ups);
      const gsm = m.gsm ?? null;
      const rateKg = m.ratePerUnit != null ? Number(m.ratePerUnit) : null;
      let rateSheet = m.ratePerSheet != null ? Number(m.ratePerSheet) : null;
      if ((rateSheet == null || rateSheet <= 0) && rateKg != null && gsm) {
        rateSheet = sheetWeightKg(dims.longMm, dims.shortMm, gsm) * rateKg;
      }
      recs.push({
        key: `mat-${m.id}`,
        source: "stock",
        materialId: m.id,
        name: m.materialName,
        dimsLabel: dims.label,
        longMm: dims.longMm,
        shortMm: dims.shortMm,
        gsm,
        grain: m.grain ?? null,
        ratePerKg: rateKg,
        ratePerSheet: rateSheet,
        stockQty: m.currentQty != null ? Number(m.currentQty) : null,
        stockUnit: m.unit ?? null,
        ups,
        sheetsNeeded,
        paperCost: rateSheet != null && rateSheet > 0 ? sheetsNeeded * rateSheet : null,
      });
    }

    recs.sort((x, y) =>
      y.ups.yieldPct - x.ups.yieldPct
      || (x.paperCost ?? Infinity) - (y.paperCost ?? Infinity),
    );
    if (recs.length > 0) return recs.slice(0, 3);

    // Fallback: no stock fits — suggest standard parent sizes
    const parents: Recommendation[] = [];
    for (const [aIn, bIn] of STANDARD_PARENTS_IN) {
      const longMm = Math.max(aIn, bIn) * 25.4;
      const shortMm = Math.min(aIn, bIn) * 25.4;
      const ups = upsOnSheet(blank.blankW, blank.blankH, longMm, shortMm, allow);
      if (ups.ups <= 0) continue;
      parents.push({
        key: `parent-${aIn}x${bIn}`,
        source: "parent",
        materialId: null,
        name: `${aIn}×${bIn} in (suggested parent)`,
        dimsLabel: `${aIn}x${bIn}`,
        longMm, shortMm,
        gsm: null, grain: null, ratePerKg: null, ratePerSheet: null,
        stockQty: null, stockUnit: null,
        ups,
        sheetsNeeded: Math.ceil(qtyN / ups.ups),
        paperCost: null,
      });
    }
    parents.sort((x, y) => y.ups.yieldPct - x.ups.yieldPct);
    return parents.slice(0, 3);
  }, [blank, materials, qtyN, allow]);

  const selected = useMemo(() => {
    if (recommendations.length === 0) return null;
    return recommendations.find((r) => r.key === selectedKey) ?? recommendations[0];
  }, [recommendations, selectedKey]);

  const grain = useMemo(() => {
    if (!selected || !blank) return null;
    return grainCheck(selected.ups.winner, selected.grain, selected.gsm ?? 0, H);
  }, [selected, blank, H]);

  function useInCosting() {
    if (!selected || !blank) return;
    const payload = {
      qtyRequired: String(qtyN),
      cartonLengthMm: String(L),
      cartonWidthMm: String(W),
      cartonHeightMm: String(H),
      cartonStyle: style,
      upsPerSheet: String(selected.ups.ups),
      // costing form takes inches; convert from mm. Long edge → length.
      sheetLengthIn: String(+(selected.shortMm / 25.4).toFixed(4)),
      sheetBreadthIn: String(+(selected.longMm / 25.4).toFixed(4)),
      ...(selected.materialId != null && { materialId: String(selected.materialId) }),
      ...(selected.gsm != null && { gsm: String(selected.gsm) }),
      ...(selected.ratePerKg != null && { ratePerKg: String(selected.ratePerKg) }),
      _label: `${selected.ups.ups}-up on ${selected.dimsLabel} (${selected.ups.yieldPct}% yield)`,
    };
    sessionStorage.setItem("pf.layoutHandoff", JSON.stringify(payload));
    navigate("/costing");
  }

  const allowField = (k: keyof Allowances) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setAllow((p) => ({ ...p, [k]: isNaN(v) ? 0 : v }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <LayoutGrid className="text-primary" size={28} />
          Layout Planner
        </h1>
        <p className="text-muted-foreground mt-1">
          Measure a carton → flat blank, best sheet, ups & dieline layout in seconds
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ------------ INPUTS ------------ */}
        <Card className="lg:col-span-2 p-5 space-y-5 h-fit">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Ruler size={14} /> Carton Dimensions (mm)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Length (L)</Label>
                <Input type="number" min="1" value={cartonL} onChange={(e) => setCartonL(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Width (W)</Label>
                <Input type="number" min="1" value={cartonW} onChange={(e) => setCartonW(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Height (H)</Label>
                <Input type="number" min="1" value={cartonH} onChange={(e) => setCartonH(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              L = front panel width · W = side depth · H = standing height
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Carton Style</Label>
              <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                {CARTON_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity (cartons)</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>

          {blank && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Flat Blank</p>
              <p className="text-2xl font-black tabular-nums">
                {blank.blankW} × {blank.blankH} <span className="text-sm font-semibold text-muted-foreground">mm</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{blank.formula}</p>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced allowances (mm)
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="space-y-1"><Label className="text-[11px]">Glue flap</Label>
                  <Input type="number" value={String(allow.glueFlap)} onChange={allowField("glueFlap")} /></div>
                <div className="space-y-1"><Label className="text-[11px]">Tuck flap cap</Label>
                  <Input type="number" value={String(allow.tuckFlapCap)} onChange={allowField("tuckFlapCap")} /></div>
                <div className="space-y-1"><Label className="text-[11px]">Gutter</Label>
                  <Input type="number" value={String(allow.gutter)} onChange={allowField("gutter")} /></div>
                <div className="space-y-1"><Label className="text-[11px]">Gripper</Label>
                  <Input type="number" value={String(allow.gripper)} onChange={allowField("gripper")} /></div>
                <div className="space-y-1"><Label className="text-[11px]">Tail</Label>
                  <Input type="number" value={String(allow.tail)} onChange={allowField("tail")} /></div>
                <div className="space-y-1"><Label className="text-[11px]">Side (each)</Label>
                  <Input type="number" value={String(allow.side)} onChange={allowField("side")} /></div>
              </div>
            )}
          </div>
        </Card>

        {/* ------------ RESULTS ------------ */}
        <div className="lg:col-span-3 space-y-4">
          {!validCarton || !blank ? (
            <Card className="p-10 text-center text-muted-foreground">
              Enter carton L, W and H to see layouts
            </Card>
          ) : (
            <>
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-2">
                  {recommendations.length > 0 && recommendations[0].source === "parent"
                    ? "No stock fits — suggested parent sizes"
                    : "Best sheets from your stock"}
                </h3>
                {recommendations.length === 0 ? (
                  <Card className="p-6 text-center text-sm text-muted-foreground">
                    This blank doesn't fit any stock sheet or standard parent — check the carton dimensions.
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {recommendations.map((r) => {
                      const isSel = selected?.key === r.key;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => setSelectedKey(r.key)}
                          className={cn(
                            "text-left rounded-xl border p-3.5 transition-all",
                            isSel
                              ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                              : "border-border bg-card hover:border-primary/40",
                          )}
                        >
                          <p className="font-bold text-sm leading-tight truncate">{r.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {r.dimsLabel}{r.gsm ? ` · ${r.gsm} GSM` : ""}
                          </p>
                          <p className="text-xl font-black mt-2 tabular-nums">
                            {r.ups.ups}<span className="text-xs font-bold">-up</span>
                            <span className="ml-2 text-sm font-bold text-primary">{r.ups.yieldPct}%</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {r.sheetsNeeded.toLocaleString("en-IN")} sheets
                            {r.paperCost != null && <> · <span className="font-semibold">{INR.format(Math.round(r.paperCost))}</span> paper</>}
                          </p>
                          {r.stockQty != null && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              stock: {r.stockQty.toLocaleString("en-IN")} {r.stockUnit}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selected && (
                <>
                  {/* grain */}
                  {grain && (
                    grain.status === "risk" ? (
                      <div className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
                        grain.heavy
                          ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300"
                          : "border-border bg-muted/30 text-muted-foreground",
                      )}>
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>
                          Grain runs across the carton height on this layout
                          {grain.heavy ? " — scoring may crack on heavy board." : "."}{" "}
                          This carton prefers <b>{grain.needed}-grain</b> stock.
                          {(() => {
                            const alt = selected.ups.winner === "A" ? selected.ups.b : selected.ups.a;
                            return alt.ups > 0
                              ? <> Grain-safe layout on this sheet: <b>{alt.ups}-up</b>.</>
                              : <> No grain-safe layout fits on this sheet.</>;
                          })()}
                        </p>
                      </div>
                    ) : grain.status === "ok" ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 size={16} /> Grain OK — runs parallel to carton height
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground px-1">
                        Grain unknown for this sheet — set grain on the material to check scoring risk.
                      </p>
                    )
                  )}

                  {/* SVG layout */}
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">
                        Sheet Layout
                      </h3>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {selected.dimsLabel} · blank {blank.blankW}×{blank.blankH}mm ·{" "}
                        <b>{selected.ups.cols}×{selected.ups.rows} = {selected.ups.ups}-up</b> · {selected.ups.yieldPct}% yield
                      </p>
                    </div>
                    <LayoutSvg
                      sheetLong={selected.longMm}
                      sheetShort={selected.shortMm}
                      blankW={blank.blankW}
                      blankH={blank.blankH}
                      ups={selected.ups}
                      allow={allow}
                    />
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <select
                        value={saveJobId}
                        onChange={(e) => setSaveJobId(e.target.value)}
                        className="rounded-lg border border-input bg-background px-2 py-2 text-sm"
                      >
                        <option value="">Save to job…</option>
                        {(jobs ?? []).filter((j) => j.status !== "completed").map((j) => (
                          <option key={j.id} value={j.id}>{j.jobCode} · {j.clientName}</option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        disabled={!saveJobId || !selected}
                        onClick={async () => {
                          if (!saveJobId || !selected) return;
                          const r = await fetch(`/api/jobs/${saveJobId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ cartonStyle: style, upsPerSheet: selected.ups.ups }),
                          });
                          if (r.ok) toast.success(`Saved ${selected.ups.ups}-up to job`);
                          else toast.error("Save failed");
                        }}
                      >
                        Save
                      </Button>
                      <Button onClick={useInCosting} className="flex items-center gap-2">
                        Use in Costing <ArrowRight size={16} />
                      </Button>
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Scaled SVG of the sheet with gripper band and the ups grid. */
function LayoutSvg({
  sheetLong, sheetShort, blankW, blankH, ups, allow,
}: {
  sheetLong: number; sheetShort: number;
  blankW: number; blankH: number;
  ups: UpsResult; allow: Allowances;
}) {
  const VIEW_W = 560;
  const scale = VIEW_W / sheetLong;
  const VIEW_H = sheetShort * scale;

  // winner orientation determines drawn blank dims
  const bw = (ups.winner === "A" ? blankW : blankH) * scale;
  const bh = (ups.winner === "A" ? blankH : blankW) * scale;
  const gutter = allow.gutter * scale;
  const startX = allow.gripper * scale;
  const startY = allow.side * scale;

  const rects: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < ups.rows; r++) {
    for (let c = 0; c < ups.cols; c++) {
      rects.push({ x: startX + c * (bw + gutter), y: startY + r * (bh + gutter) });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto rounded-lg border border-border bg-muted/20"
      role="img"
      aria-label="Sheet layout diagram"
    >
      <defs>
        <pattern id="grip" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="rgb(244 63 94 / 0.10)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(244 63 94 / 0.45)" strokeWidth="1.5" />
        </pattern>
      </defs>

      {/* sheet */}
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="white" stroke="rgb(100 116 139)" strokeWidth="1.5" className="dark:opacity-90" />

      {/* gripper band on the long edge (left) */}
      <rect x="0" y="0" width={allow.gripper * scale} height={VIEW_H} fill="url(#grip)" />
      <text x={allow.gripper * scale / 2} y={VIEW_H / 2}
        fontSize="9" fill="rgb(244 63 94)" textAnchor="middle"
        transform={`rotate(-90 ${allow.gripper * scale / 2} ${VIEW_H / 2})`}>
        GRIPPER
      </text>

      {/* blanks */}
      {rects.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x} y={p.y} width={bw} height={bh} rx="3"
            fill="rgb(59 130 246 / 0.12)"
            stroke="rgb(59 130 246)"
            strokeWidth="1.2"
          />
          {/* faint centre fold hint */}
          <line
            x1={p.x + bw / 2} y1={p.y + 3} x2={p.x + bw / 2} y2={p.y + bh - 3}
            stroke="rgb(59 130 246 / 0.35)" strokeWidth="0.8" strokeDasharray="4 3"
          />
        </g>
      ))}

      {/* dims annotation */}
      <text x={VIEW_W - 6} y={VIEW_H - 6} fontSize="10" fill="rgb(100 116 139)" textAnchor="end">
        {Math.round(sheetLong)} × {Math.round(sheetShort)} mm
      </text>
    </svg>
  );
}
