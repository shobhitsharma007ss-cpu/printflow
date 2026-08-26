import React, { useMemo, useState } from "react";
import { Package, Plus, Lock, AlertTriangle, X } from "lucide-react";
import { Card, Button, Badge, Modal } from "@/components/ui-elements";
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

  /* Most urgent first, then lots with no history, then held lots last — nothing
     consumes a held lot, so it can never be the thing about to run out. */
  const shown = useMemo(
    () =>
      lots
        .filter((l) => l.category === tab)
        .sort((a, b) => {
          if (!!a.heldFor !== !!b.heldFor) return a.heldFor ? 1 : -1;
          const A = daysLeft(a), B = daysLeft(b);
          if (A === null && B === null) return 0;
          if (A === null) return 1;
          if (B === null) return -1;
          return A - B;
        }),
    [lots, tab],
  );

  const critical = shown.filter((l) => {
    const d = daysLeft(l);
    return d !== null && d <= 7;
  });
  const countFor = (k: TabKey) => lots.filter((l) => l.category === k).length;

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
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Most urgent on the left · held lots last
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))] items-end">
            {shown.map((l) => (
              <LotTile key={l.id} lot={l} onOpen={() => setOpen(l)} />
            ))}
          </div>
        </>
      )}

      <LotDetail lot={open} onClose={() => setOpen(null)} />
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

        {!lot.ratePerDay ? (
          <p className="text-[13px] text-muted-foreground">
            Days of cover appear once this material has a few weeks of consumption recorded.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} className="flex items-center gap-1.5">
            <X size={15} /> Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
