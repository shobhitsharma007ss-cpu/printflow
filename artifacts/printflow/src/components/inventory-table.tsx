import React, { useMemo, useState } from "react";
import { Search, ArrowDownUp, PackagePlus, SlidersHorizontal } from "lucide-react";
import { useMaterials } from "@/hooks/use-inventory";
import { useListStockInward } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import type { StockSummaryRow } from "@workspace/api-client-react";

/* Data-dense inventory: KPI strip + sortable table + brand chips.
   Pure frontend — combines /reports/stock-summary + /materials + /stock-inward. */

const INR0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function parseDimsCm(dimensions?: string | null): { l: number; w: number } | null {
  if (!dimensions) return null;
  const raw = dimensions.toLowerCase();
  const p = raw.split(/[x×*]/).map((s) => parseFloat(s));
  if (p.length < 2 || !(p[0] > 0) || !(p[1] > 0)) return null;
  const f = raw.includes("mm") ? 0.1 : raw.includes("cm") ? 1 : 2.54;
  return { l: p[0] * f, w: p[1] * f };
}

type SortKey = "value" | "age" | "qty" | "name";

export function InventoryTable({
  stock,
  onSelect,
  onInward,
  onAdjust,
}: {
  stock: StockSummaryRow[];
  onSelect: (id: number) => void;
  onInward?: (id: number) => void;
  onAdjust?: (id: number) => void;
}) {
  const { data: materials } = useMaterials();
  const { data: inwards } = useListStockInward();

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "board" | "consumable" | "low">("all");
  const [sortKey, setSortKey] = useState<SortKey>("value");

  const matById = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m])), [materials]);

  const brandsByMat = useMemo(() => {
    const map = new Map<number, Map<string, number>>();
    for (const r of inwards ?? []) {
      const b = (r.brand ?? "").trim();
      if (!b) continue;
      if (!map.has(r.materialId)) map.set(r.materialId, new Map());
      const inner = map.get(r.materialId)!;
      inner.set(b, (inner.get(b) ?? 0) + Number(r.qtyReceived || 0));
    }
    return map;
  }, [inwards]);

  const lastInwardByMat = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of inwards ?? []) {
      const prev = map.get(r.materialId);
      if (!prev || r.receivedDate > prev) map.set(r.materialId, r.receivedDate);
    }
    return map;
  }, [inwards]);

  const rows = useMemo(() => {
    return stock.map((s) => {
      const m = matById.get(s.id);
      const isBoard = s.materialType === "board" || s.materialType === "paper";
      const dims = parseDimsCm(s.dimensions);
      const shWtKg = isBoard && dims && s.gsm ? (dims.l * dims.w * s.gsm) / 10_000_000 : null;

      // currentQty unit: boards tracked in sheets
      const sheets = isBoard ? s.currentQty : null;
      const kg = isBoard ? (shWtKg ? s.currentQty * shWtKg : null) : (s.unit === "kg" ? s.currentQty : null);

      const rateKg = m?.ratePerUnit != null ? Number(m.ratePerUnit) : null;
      const rateSheet = m?.ratePerSheet != null ? Number(m.ratePerSheet) : null;
      const value = isBoard
        ? (rateSheet != null && sheets != null ? sheets * rateSheet : null)
        : (rateKg != null ? s.currentQty * rateKg : null);

      const ageDays = (s as unknown as { oldestBatchDays?: number | null }).oldestBatchDays ?? null;
      const brands = Array.from(brandsByMat.get(s.id)?.entries() ?? []).sort((a, b) => b[1] - a[1]);

      return {
        s, isBoard, sheets, kg, rateKg, rateSheet, value, ageDays, brands,
        lastInward: lastInwardByMat.get(s.id) ?? null,
      };
    });
  }, [stock, matById, brandsByMat, lastInwardByMat]);

  const filtered = useMemo(() => {
    let r = rows;
    if (typeFilter === "board") r = r.filter((x) => x.isBoard);
    if (typeFilter === "consumable") r = r.filter((x) => !x.isBoard);
    if (typeFilter === "low") r = r.filter((x) => x.s.isLowStock);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) =>
        x.s.materialName.toLowerCase().includes(t)
        || x.brands.some(([b]) => b.toLowerCase().includes(t)),
      );
    }
    const sorters: Record<SortKey, (a: typeof r[0], b: typeof r[0]) => number> = {
      value: (a, b) => (b.value ?? -1) - (a.value ?? -1),
      age: (a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1),
      qty: (a, b) => b.s.currentQty - a.s.currentQty,
      name: (a, b) => a.s.materialName.localeCompare(b.s.materialName),
    };
    return [...r].sort(sorters[sortKey]);
  }, [rows, q, typeFilter, sortKey]);

  // KPI strip
  const kpi = useMemo(() => {
    const totalValue = rows.reduce((acc, r) => acc + (r.value ?? 0), 0);
    const low = rows.filter((r) => r.s.isLowStock).length;
    const aging = rows.filter((r) => (r.ageDays ?? 0) > 90).length;
    const lastDates = rows.map((r) => r.lastInward).filter(Boolean) as string[];
    const lastInward = lastDates.length ? lastDates.sort().at(-1)! : null;
    return { totalValue, low, aging, lastInward };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Stock Value" value={INR0.format(Math.round(kpi.totalValue))} accent="text-primary" />
        <Kpi label="Low Stock Items" value={String(kpi.low)} accent={kpi.low > 0 ? "text-rose-600" : "text-emerald-600"} />
        <Kpi label="Stock > 90 Days Old" value={String(kpi.aging)} accent={kpi.aging > 0 ? "text-amber-600" : "text-emerald-600"} />
        <Kpi label="Last Inward" value={kpi.lastInward ?? "—"} accent="text-foreground" />
      </div>

      {/* controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search material or brand…"
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([["all","All"],["board","Paper"],["consumable","Consumables"],["low","Low stock"]] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold border",
                typeFilter === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground",
              )}
            >
              {l}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground"><ArrowDownUp size={14} /></span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-semibold"
          >
            <option value="value">Sort: Value ₹</option>
            <option value="age">Sort: Oldest stock</option>
            <option value="qty">Sort: Quantity</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </div>

      {/* table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-bold">Material</th>
              <th className="px-4 py-3 text-right font-bold">Stock</th>
              <th className="px-4 py-3 text-right font-bold">Rate/kg</th>
              <th className="px-4 py-3 text-right font-bold">Rate/sheet</th>
              <th className="px-4 py-3 text-right font-bold">Value</th>
              <th className="px-4 py-3 text-left font-bold">Brands</th>
              <th className="px-4 py-3 text-center font-bold">Age</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No materials match</td></tr>
            )}
            {filtered.map((r) => (
              <tr
                key={r.s.id}
                onClick={() => onSelect(r.s.id)}
                className={cn(
                  "border-t border-border cursor-pointer hover:bg-muted/30 transition-colors",
                  r.s.isLowStock && "bg-rose-50/50 dark:bg-rose-950/10",
                )}
              >
                <td className="px-4 py-3">
                  <p className="font-bold leading-tight">{r.s.materialName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[r.s.gsm ? `${r.s.gsm} GSM` : null, r.s.dimensions || null, r.s.grain ? (r.s.grain === "long" ? "LG" : "SG") : null]
                      .filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <p className="font-bold">
                    {r.s.currentQty.toLocaleString("en-IN")} <span className="text-[11px] font-semibold text-muted-foreground">{r.isBoard ? "sh" : r.s.unit}</span>
                  </p>
                  {r.isBoard && r.kg != null && (
                    <p className="text-[11px] text-muted-foreground">{Math.round(r.kg).toLocaleString("en-IN")} kg</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.rateKg != null ? `₹${r.rateKg.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.rateSheet != null ? `₹${Number(r.rateSheet).toFixed(2)}` : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-bold">{r.value != null ? INR0.format(Math.round(r.value)) : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {r.brands.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                    {r.brands.slice(0, 3).map(([b, qty]) => (
                      <span key={b} className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold">
                        {b} <span className="text-muted-foreground">{Math.round(qty).toLocaleString("en-IN")}</span>
                      </span>
                    ))}
                    {r.brands.length > 3 && <span className="text-[11px] text-muted-foreground">+{r.brands.length - 3}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <AgeBadge days={r.ageDays} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onAdjust && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAdjust(r.s.id); }}
                        title="Adjust stock"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <SlidersHorizontal size={15} />
                      </button>
                    )}
                    {onInward && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onInward(r.s.id); }}
                        title="Record inward"
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <PackagePlus size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-black tabular-nums mt-0.5 truncate", accent)}>{value}</p>
    </div>
  );
}

function AgeBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = days > 90 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
    : days > 60 ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
    : days > 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  return <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold", cls)}>{days}d</span>;
}
