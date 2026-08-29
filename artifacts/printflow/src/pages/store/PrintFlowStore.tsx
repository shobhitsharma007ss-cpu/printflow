import React, { useMemo, useState } from "react";
import { Package, Plus, Lock, AlertTriangle, X, Search, LayoutGrid, Table2, Wand2, Trash2, Save } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Button, Badge, Modal, Input } from "@/components/ui-elements";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   THE STORE — the godown, drawn in our own design system.

   Answers the two questions a store keeper actually asks:
     1. Which lot do I take?  -> vendor colour, brand, product, held state
     2. How much is left?     -> the pile inside its outline, read as a gap

   Quantity alone cannot answer #2: 820 sheets may be three months' cover while
   3,200 is gone by Friday. So every lot is a solid pile sitting inside a dashed
   outline of the FULL delivery. You read the GAP, not the number.

   Tailwind tokens only, no separate stylesheet — the previous build declared
   CSS variables at :root and repainted headings across the whole app.
   ───────────────────────────────────────────────────────────────────────────── */

export type Lot = {
  id: string;
  category: "paper" | "inks" | "coatings" | "chemicals";
  vendor: string;
  vendorKey: string;
  brand: string;
  product: string;
  shortProduct?: string;
  size?: string;
  qty: number;
  unit: string;
  full: number;
  ratePerDay?: number;
  heldFor?: string;
  receivedDate?: string;
  price?: number;
  invoice?: string;
  jobs?: string[];
  rateUnit?: string;
  value?: number;
  ageDays?: number;
  basisUnknown?: boolean;
  batchId?: number;
};

const TABS = [
  { key: "paper",     en: "Paper & Board",    hi: "कागज़" },
  { key: "inks",      en: "Inks",             hi: "स्याही" },
  { key: "coatings",  en: "Coatings",         hi: "कोटिंग" },
  { key: "chemicals", en: "Chemicals & Glue", hi: "केमिकल व गोंद" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

/* Stable vendor colour — same vendor is the same colour forever, on every tab,
   so a supplier becomes recognisable rather than something to read. */
const PALETTE = ["#3B5BA5", "#7A4FA3", "#0F766E", "#B45309", "#9A3412", "#4D7C0F", "#9D174D", "#1D4ED8"];
function vendorColour(key: string): string {
  const k = key || "?";
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const nf = new Intl.NumberFormat("en-IN");
const money = (n: number) =>
  n >= 1e5 ? `₹${(n / 1e5).toFixed(2)}L` : `₹${nf.format(Math.round(n))}`;
const daysLeft = (l: Lot): number | null =>
  l.ratePerDay && l.ratePerDay > 0 ? l.qty / l.ratePerDay : null;

type Tone = "crit" | "warn" | "ok" | "held" | "unknown";
function cover(l: Lot): { tone: Tone; label: string } {
  if (l.heldFor) return { tone: "held", label: "Held" };
  const d = daysLeft(l);
  if (d === null) return { tone: "unknown", label: "History building" };
  if (d <= 7) return { tone: "crit", label: `${Math.round(d)} days left` };
  if (d <= 21) return { tone: "warn", label: `${Math.round(d)} days left` };
  return { tone: "ok", label: `${Math.round(d)} days left` };
}

const TONE: Record<Tone, string> = {
  crit:    "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  warn:    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  ok:      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  held:    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  unknown: "bg-muted text-muted-foreground border-border",
};

const STRAP = "repeating-linear-gradient(45deg,#E8A33D 0 4px,#B7791F 4px 8px)";

/* Outline height = the full delivery, square-root scaled so a small lot stays
   visible beside a large one. The fill inside is the true proportion left. */
function Pile({ lot, colour }: { lot: Lot; colour: string }) {
  const H_MIN = 34, H_MAX = 112, Q_CAP = 5000;
  const outline = Math.round(H_MIN + (H_MAX - H_MIN) * Math.sqrt(Math.min(lot.full, Q_CAP) / Q_CAP));
  const pct = lot.full > 0 ? Math.min(1, lot.qty / lot.full) : 0;
  const fill = Math.max(5, Math.round(outline * pct));
  const isPaper = lot.category === "paper";

  return (
    <div className="relative flex flex-col justify-end" style={{ height: outline + 14 }}>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-3 rounded-t border-x-2 border-t-2 border-dashed border-muted-foreground/30"
        style={{ height: outline }}
      />
      {isPaper ? (
        <>
          <div
            className="relative rounded-t-sm border-x border-t border-black/10 overflow-hidden"
            style={{
              height: fill,
              backgroundImage:
                "repeating-linear-gradient(180deg,#FAF7EF 0 2px,#EDE7D8 2px 3px,#FAF7EF 3px 5px,#DFD7C4 5px 6px)",
            }}
          >
            <div
              className="absolute inset-x-0 h-2"
              style={{ background: colour, bottom: Math.round(fill * 0.34) }}
            />
            {lot.heldFor && (
              <>
                <div className="absolute inset-y-0 w-1.5 left-[22%]" style={{ backgroundImage: STRAP }} />
                <div className="absolute inset-y-0 w-1.5 right-[22%]" style={{ backgroundImage: STRAP }} />
              </>
            )}
          </div>
          <div
            className="h-3 rounded-sm"
            style={{ backgroundImage: "repeating-linear-gradient(90deg,#8A6A44 0 8px,#6F5436 8px 11px)" }}
          />
        </>
      ) : (
        <>
          <div className="h-2 rounded-t-md border-x border-t border-black/15" style={{ background: colour }} />
          <div
            className="relative rounded-b-sm border-x border-b border-black/10"
            style={{
              height: Math.max(6, fill - 8),
              backgroundImage: "linear-gradient(90deg,#B9B2A6,#EDE8DE 42%,#C3BCB0 78%,#A79F92)",
            }}
          >
            {lot.heldFor && (
              <div className="absolute inset-y-0 inset-x-[28%]" style={{ backgroundImage: STRAP }} />
            )}
          </div>
          <div className="h-1.5" />
        </>
      )}
    </div>
  );
}

function LotTile({ lot, onOpen }: { lot: Lot; onOpen: () => void }) {
  const colour = vendorColour(lot.vendorKey || lot.vendor);
  const c = cover(lot);
  const pct = lot.full > 0 ? Math.round((lot.qty / lot.full) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${lot.product}, ${lot.vendor}, ${nf.format(lot.qty)} of ${nf.format(lot.full)} ${lot.unit}, ${c.label}`}
      className={cn(
        "group text-left rounded-xl border bg-card p-3 transition-all",
        "hover:shadow-md hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        c.tone === "crit" ? "border-rose-300 dark:border-rose-900" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge className={cn("border", TONE[c.tone])}>
          {lot.heldFor ? <Lock size={10} className="mr-1" /> : null}
          {c.label}
        </Badge>
        <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{pct}%</span>
      </div>

      <Pile lot={lot} colour={colour} />

      <div className="mt-2.5">
        <div className="text-xl font-black tracking-tight tabular-nums leading-none">
          {nf.format(lot.qty)} <span className="text-xs font-medium text-muted-foreground">{lot.unit}</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
          of {nf.format(lot.full)} delivered
        </div>
        <div className="text-[13px] font-semibold mt-1.5 leading-tight">{lot.product}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: colour }} />
          <span className="text-[11px] font-medium text-muted-foreground truncate">
            {lot.vendor} · {lot.brand}
          </span>
        </div>
        {lot.basisUnknown ? (
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span>No sheet size set — quantity may be kg</span>
          </div>
        ) : null}
        {lot.price ? (
          <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            ₹{nf.format(lot.price)}/{lot.rateUnit ?? "kg"}
            {lot.value ? <span className="font-semibold text-foreground"> · {money(lot.value)}</span> : null}
          </div>
        ) : null}
        {lot.heldFor ? (
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-1 truncate">
            🔒 {lot.heldFor}
          </div>
        ) : null}
      </div>
    </button>
  );
}

export default function PrintFlowStore({
  lots = [],
  onRecordInward,
}: {
  lots?: Lot[];
  onRecordInward?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("paper");
  const [open, setOpen] = useState<Lot | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"visual" | "table">("visual");

  /* Most urgent first, then lots with no history, then held lots last — nothing
     consumes a held lot, so it can never be the thing about to run out. */
  const shown = useMemo(
    () =>
      lots
        .filter((l) => l.category === tab)
        .filter((l) => {
          if (!query.trim()) return true;
          const q = query.toLowerCase();
          return `${l.product} ${l.vendor} ${l.brand} ${l.size ?? ""}`.toLowerCase().includes(q);
        })
        .sort((a, b) => {
          if (!!a.heldFor !== !!b.heldFor) return a.heldFor ? 1 : -1;
          const A = daysLeft(a), B = daysLeft(b);
          if (A === null && B === null) return 0;
          if (A === null) return 1;
          if (B === null) return -1;
          return A - B;
        }),
    [lots, tab, query],
  );

  const critical = shown.filter((l) => {
    const d = daysLeft(l);
    return d !== null && d <= 7;
  });
  const countFor = (k: TabKey) => lots.filter((l) => l.category === k).length;
  const stockValue = shown.reduce((t, l) => t + (l.value ?? 0), 0);
  const ages = shown.map((l) => l.ageDays).filter((d): d is number => typeof d === "number");
  const oldest = ages.length ? Math.max(...ages) : undefined;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Package className="text-primary" size={28} /> Store
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the lot you'll actually take. The dashed outline is the full delivery — the pile inside is what's left.
          </p>
        </div>
        <Button onClick={onRecordInward} className="flex items-center gap-2">
          <Plus size={16} /> Record stock inward
        </Button>
      </div>

      {critical.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="truncate">
            <b>{critical.length}</b> running out within a week — {critical.map((l) => l.product).join(", ")}
          </span>
        </div>
      )}

      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Stock value" value={money(stockValue)} />
        <Kpi label="Low / out" value={String(critical.length)} tone={critical.length ? "crit" : "ok"} />
        <Kpi label="Held for jobs" value={String(shown.filter((l) => l.heldFor).length)} />
        <Kpi
          label="Oldest stock"
          value={oldest === undefined ? "—" : `${oldest} days`}
          tone={oldest !== undefined && oldest > 90 ? "warn" : undefined}
        />
      </div>

      <div className="flex gap-1.5 flex-wrap border-b border-border pb-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.en} <span className="opacity-70 font-normal">{t.hi}</span>
            <span className="ml-1.5 opacity-60 tabular-nums">{countFor(t.key)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="mx-auto text-muted-foreground/40" size={34} />
          <p className="mt-3 font-semibold">Nothing recorded here yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Record a stock inward and it will appear on the floor.
          </p>
          <Button onClick={onRecordInward} className="mt-4 inline-flex items-center gap-2">
            <Plus size={15} /> Record stock inward
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search material, vendor or brand…"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([["visual", LayoutGrid, "Visual"], ["table", Table2, "Table"]] as const).map(([v, Icon, lbl]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-colors",
                    view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  <Icon size={14} /> {lbl}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-auto">
              Most urgent first · held lots last
            </p>
          </div>
          {view === "visual" ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))] items-end">
              {shown.map((l) => (
                <LotTile key={l.id} lot={l} onOpen={() => setOpen(l)} />
              ))}
            </div>
          ) : (
            <LotTable lots={shown} onOpen={setOpen} />
          )}
        </>
      )}

      <LotDetail lot={open} onClose={() => setOpen(null)} />
    </div>
  );
}

const API = import.meta.env.VITE_API_URL ?? "";

/* Correcting a lot. The kg figure was stored correctly even when the sheet
   conversion failed, so "Recompute from kg" fixes those lots exactly once the
   material has a sheet size. Manual entry and delete cover everything else. */
function CorrectLot({ lot, onDone }: { lot: Lot; onDone: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = lot.batchId;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["store-lots"] });
    qc.invalidateQueries({ queryKey: ["materials"] });
    onDone();
  };
  const fail = (e: Error) => toast.error(e.message, { duration: 8000 });
  const call = async (path: string, init: RequestInit) => {
    const r = await fetch(`${API}/api/store/lots/${id}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error ?? "That did not work");
    return body;
  };

  const recompute = useMutation({
    mutationFn: () => call("/recompute", { method: "POST" }),
    onSuccess: (d: { was: number; now: number }) => {
      toast.success(`Corrected — ${nf.format(d.was)} to ${nf.format(d.now)} sheets`);
      refresh();
    },
    onError: fail,
  });
  const setQtyM = useMutation({
    mutationFn: () => call("", { method: "PATCH", body: JSON.stringify({ qty: Number(qty) }) }),
    onSuccess: () => { toast.success("Quantity updated"); refresh(); },
    onError: fail,
  });
  const del = useMutation({
    mutationFn: () => call("", { method: "DELETE" }),
    onSuccess: () => { toast.success("Lot removed"); refresh(); },
    onError: fail,
  });

  if (!id) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Correct this lot
      </div>

      {lot.basisUnknown ? (
        <Button
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
          className="w-full flex items-center justify-center gap-2"
        >
          <Wand2 size={15} />
          {recompute.isPending ? "Recomputing…" : "Recompute sheets from the kg recorded"}
        </Button>
      ) : null}

      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={`Set remaining (now ${nf.format(lot.qty)})`}
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={() => setQtyM.mutate()}
          disabled={qty === "" || setQtyM.isPending}
          className="flex items-center gap-1.5"
        >
          <Save size={14} /> Save
        </Button>
      </div>

      {confirmDelete ? (
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending} className="flex-1">
            {del.isPending ? "Removing…" : "Yes, remove this lot"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-[13px] font-medium text-rose-600 hover:underline flex items-center gap-1.5 dark:text-rose-400"
        >
          <Trash2 size={13} /> Remove this lot
        </button>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "crit" | "warn" | "ok" }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div
        className={cn(
          "text-xl font-bold tabular-nums mt-0.5",
          tone === "crit" && "text-rose-600 dark:text-rose-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* Table view — the same lots as rows. The visual answers "how much is left";
   this answers "what is it worth" and "what is sitting too long". */
function LotTable({ lots, onOpen }: { lots: Lot[]; onOpen: (l: Lot) => void }) {
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            {["Material", "Vendor · Brand", "Left", "of full", "Rate", "Value", "Age", "Status"].map((h) => (
              <th key={h} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => {
            const c = cover(l);
            const pct = l.full > 0 ? Math.round((l.qty / l.full) * 100) : 0;
            return (
              <tr
                key={l.id}
                onClick={() => onOpen(l)}
                className="border-t border-border hover:bg-muted/40 cursor-pointer"
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold">{l.product}</div>
                  {l.size ? <div className="text-[11px] text-muted-foreground">{l.size}</div> : null}
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ background: vendorColour(l.vendorKey || l.vendor) }} />
                    <span className="text-[13px]">{l.vendor} · {l.brand}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 font-bold tabular-nums whitespace-nowrap">
                  {nf.format(l.qty)} <span className="text-[11px] font-normal text-muted-foreground">{l.unit}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">
                  {nf.format(l.full)} <span className="text-[11px]">({pct}%)</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {l.price ? `₹${nf.format(l.price)}/${l.rateUnit ?? "kg"}` : "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums font-semibold whitespace-nowrap">
                  {l.value ? money(l.value) : "—"}
                </td>
                <td className={cn("px-3 py-2.5 tabular-nums whitespace-nowrap",
                                  (l.ageDays ?? 0) > 90 && "text-amber-600 font-semibold dark:text-amber-400")}>
                  {l.ageDays === undefined ? "—" : `${l.ageDays}d`}
                </td>
                <td className="px-3 py-2.5">
                  <Badge className={cn("border whitespace-nowrap", TONE[c.tone])}>
                    {l.heldFor ? <Lock size={10} className="mr-1" /> : null}
                    {c.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

function LotDetail({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  if (!lot) return null;
  const colour = vendorColour(lot.vendorKey || lot.vendor);
  const c = cover(lot);
  const used = Math.max(0, lot.full - lot.qty);

  return (
    <Modal isOpen={!!lot} onClose={onClose} title={lot.product}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <span className="h-3 w-3 rounded-sm" style={{ background: colour }} />
            {lot.vendor} · {lot.brand}
          </span>
          <Badge className={cn("border", TONE[c.tone])}>{c.label}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[11px] text-muted-foreground font-medium">Remaining</div>
            <div className="text-base font-bold tabular-nums mt-0.5">{nf.format(lot.qty)} {lot.unit}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[11px] text-muted-foreground font-medium">Delivered</div>
            <div className="text-base font-bold tabular-nums mt-0.5">{nf.format(lot.full)} {lot.unit}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-[11px] text-muted-foreground font-medium">Used</div>
            <div className="text-base font-bold tabular-nums mt-0.5">{nf.format(used)} {lot.unit}</div>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          {lot.size ? <Row k="Size" v={lot.size} /> : null}
          <Row k="Lot" v={lot.id} />
          {lot.receivedDate ? <Row k="Received" v={lot.receivedDate} /> : null}
          {lot.invoice ? <Row k="Invoice" v={lot.invoice} /> : null}
          {lot.price ? <Row k="Rate" v={`₹${nf.format(lot.price)}`} /> : null}
          {lot.heldFor ? <Row k="Held for" v={lot.heldFor} /> : null}
        </div>

        {lot.heldFor ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/25 dark:border-amber-900">
            <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <Lock size={14} /> This lot is spoken for
            </div>
            <p className="text-amber-700 dark:text-amber-400/90 mt-1 text-[13px]">
              It was bought for <b>{lot.heldFor}</b>. You can still use it, but that job will go short by
              whatever you take.
            </p>
          </div>
        ) : null}

        {lot.basisUnknown ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/25 dark:border-amber-900">
            <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Sheet size missing
            </div>
            <p className="text-amber-700 dark:text-amber-400/90 mt-1 text-[13px]">
              This material has no sheet dimensions or GSM recorded, so kilograms could not be
              converted to sheets — the quantity above may actually be kg. Add the sheet size and
              GSM in <b>Settings → Materials</b>, then correct this lot.
            </p>
          </div>
        ) : null}

        {!lot.ratePerDay ? (
          <p className="text-[13px] text-muted-foreground">
            Days of cover appear once this material has a few weeks of consumption recorded.
          </p>
        ) : null}

        <CorrectLot lot={lot} onDone={onClose} />

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} className="flex items-center gap-1.5">
            <X size={15} /> Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
