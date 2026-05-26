import React, { useState, useMemo } from "react";
import { Calculator, Save, Copy, Info } from "lucide-react";
import { Card, Button, Input, Label, Select } from "@/components/ui-elements";
import { useMachines } from "@/hooks/use-machines";
import { useMaterials } from "@/hooks/use-inventory";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import type { ListMachinesResponseItem } from "@workspace/api-zod";

type MachineRow = z.infer<typeof ListMachinesResponseItem>;

const STYLE_FACTORS: Record<string, number> = {
  straight_tuck: 1.0,
  reverse_tuck: 0.85,
  auto_bottom: 0.60,
  crash_lock: 0.55,
};

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmt = (v: number) => INR.format(Math.round(v));
const dec = (v: number, d = 2) => v.toFixed(d);

function n(val: string | undefined, fallback = 0): number {
  if (val === undefined || val === "") return fallback;
  const v = parseFloat(val);
  return isNaN(v) ? fallback : v;
}

interface CostForm {
  qtyRequired: string;
  cartonLengthMm: string;
  cartonWidthMm: string;
  cartonHeightMm: string;
  cartonStyle: string;
  upsPerSheet: string;
  materialId: string;
  sheetLengthIn: string;
  sheetBreadthIn: string;
  gsm: string;
  ratePerKg: string;
  processColors: string;
  spotColors: string;
  printPassCount: string;
  coatingType: string;
  isNewDie: boolean;
  dieFabCost: string;
  selectedMachineId: string;
  handworkPer1000: string;
  runningWastePct: string;
  makereadyOverride: string;
  ohPct: string;
  adminOhPct: string;
  profitPct: string;
  gstPct: string;
  plateRate: string;
  cmykInkRate: string;
  spotInkRate: string;
  aqueousRate: string;
}

const DEFAULTS: CostForm = {
  qtyRequired: "25000",
  cartonLengthMm: "100",
  cartonWidthMm: "80",
  cartonHeightMm: "40",
  cartonStyle: "straight_tuck",
  upsPerSheet: "6",
  materialId: "",
  sheetLengthIn: "23",
  sheetBreadthIn: "36",
  gsm: "300",
  ratePerKg: "85",
  processColors: "4",
  spotColors: "1",
  printPassCount: "1",
  coatingType: "aqueous",
  isNewDie: false,
  dieFabCost: "0",
  selectedMachineId: "",
  handworkPer1000: "250",
  runningWastePct: "3",
  makereadyOverride: "",
  ohPct: "10",
  adminOhPct: "5",
  profitPct: "0",
  gstPct: "12",
  plateRate: "1200",
  cmykInkRate: "420",
  spotInkRate: "650",
  aqueousRate: "230",
};

function compute(form: CostForm, machine: MachineRow | null) {
  const qty        = n(form.qtyRequired);
  const L_cm       = n(form.sheetLengthIn) * 2.54;
  const B_cm       = n(form.sheetBreadthIn) * 2.54;
  const gsm        = n(form.gsm);
  const ratePerKg  = n(form.ratePerKg);
  const ups        = Math.max(1, n(form.upsPerSheet, 1));
  const procC      = Math.max(0, n(form.processColors, 4));
  const spotC      = Math.max(0, n(form.spotColors));
  const totalC     = procC + spotC;
  const passes     = Math.max(1, n(form.printPassCount, 1));
  const coating    = form.coatingType;
  const isNewDie   = form.isNewDie;
  const dieFab     = n(form.dieFabCost);
  const hwPer1k    = n(form.handworkPer1000, 250);
  const wastePct   = n(form.runningWastePct, 3);
  const mkOverride = n(form.makereadyOverride);
  const ohPct      = n(form.ohPct, 10);
  const adminOhPct = n(form.adminOhPct, 5);
  const profitPct  = n(form.profitPct);
  const gstPct     = n(form.gstPct, 12);
  const plateEach  = n(form.plateRate, 1200);
  const cmykRate   = n(form.cmykInkRate, 420);
  const spotRate   = n(form.spotInkRate, 650);
  const aqRate     = n(form.aqueousRate, 230);
  const clMm       = Math.max(1, n(form.cartonLengthMm, 100));

  // Press params from machine row (DB seeded values)
  const ratedSph   = machine?.ratedSph ?? 12000;
  const oee        = machine?.oeeDefault != null ? parseFloat(String(machine.oeeDefault)) : 0.70;
  const setupMin   = machine?.setupMinRepeat ?? 30;
  const hrRate     = machine?.hourRate != null ? parseFloat(String(machine.hourRate)) : 2800;

  // Sheet
  const sheetWtKg   = (L_cm * B_cm * gsm) / 10_000_000;
  const sheetCostEa = sheetWtKg * ratePerKg;
  const sheetAreaM2 = (L_cm * B_cm) / 10_000;

  // Quantities
  const reqSheets   = Math.ceil(qty / ups);
  const makeready   = mkOverride > 0 ? mkOverride : totalC >= 5 ? 500 : 400;
  const planSheets  = Math.ceil((reqSheets + makeready) * (1 + wastePct / 100));

  // Paper
  const paperCost = planSheets * sheetCostEa;

  // Plates: total_colors × passes + passes (if inline coating)
  const plateCnt  = totalC * passes + (coating !== "none" ? passes : 0);
  const plateCost = plateCnt * plateEach;

  // Press
  const effSph      = ratedSph * oee;
  const pressRunMin = effSph > 0 ? (planSheets / effSph) * 60 * passes : 0;
  const pressCost   = ((setupMin + pressRunMin) / 60) * hrRate;

  // Ink
  const imgAreaM2      = sheetAreaM2 * 0.75;
  const cmykKgPerColor = (imgAreaM2 * 0.35 * planSheets * 1.3) / 1000;
  const spotKgPerColor = (imgAreaM2 * 0.60 * planSheets * 1.5) / 1000;
  const cmykCost       = procC * cmykKgPerColor * cmykRate;
  const spotCostAmt    = spotC * spotKgPerColor * spotRate;
  const inkCost        = cmykCost + spotCostAmt;

  // Coating (aqueous inline only for v1)
  let coatingCost = 0;
  if (coating === "aqueous") {
    const aqKg = (planSheets * sheetAreaM2 * 2) / 1000;
    coatingCost = aqKg * aqRate;
  }

  // Die cutter
  const dieSetupMin = isNewDie ? 105 : 10;
  const dieRunMin   = (planSheets / 5200) * 60;
  let dieCutCost    = ((dieSetupMin + dieRunMin) / 60) * 1500;
  if (isNewDie) dieCutCost += dieFab;

  // Folder-gluer (carton units)
  const styleFact  = STYLE_FACTORS[form.cartonStyle] ?? 1.0;
  const ratedCph   = (350 * 60 * 1000) / clMm;
  const effCph     = ratedCph * 0.65 * styleFact;
  const glueRunMin = qty > 0 && effCph > 0 ? (qty / effCph) * 60 : 0;
  const gluerCost  = ((25 + glueRunMin) / 60) * 1200;
  const glueCost   = (qty * 0.4 / 1000) * 150;

  // Handwork
  const hwCost = (qty / 1000) * hwPer1k;

  // Totals
  const directCost = paperCost + plateCost + pressCost + inkCost + coatingCost
    + dieCutCost + gluerCost + glueCost + hwCost;
  const factoryOh  = directCost * (ohPct / 100);
  const adminOh    = directCost * (adminOhPct / 100);
  const subtotal   = directCost + factoryOh + adminOh;
  const profit     = subtotal * (profitPct / 100);
  const preGst     = subtotal + profit;
  const gstAmt     = preGst * (gstPct / 100);
  const finalTotal = preGst + gstAmt;
  const per1kRate  = qty > 0 ? (preGst / qty) * 1000 : 0;

  return {
    qty, sheetWtKg, sheetCostEa, sheetAreaM2,
    reqSheets, makeready, planSheets,
    paperCost, plateCnt, plateCost,
    ratedSph, oee, setupMin, hrRate, pressRunMin, pressCost,
    cmykCost, spotCostAmt, inkCost,
    coatingCost, dieSetupMin, dieRunMin, dieCutCost,
    ratedCph, effCph, glueRunMin, gluerCost, glueCost,
    hwCost, directCost, factoryOh, adminOh,
    subtotal, profit, preGst, gstAmt, finalTotal, per1kRate,
    procC, spotC, totalC,
  };
}

function Row({
  label, value, sub, bold, large,
}: { label: string; value: number; sub?: string; bold?: boolean; large?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-2.5", bold && "bg-muted/20")}>
      <div className="flex-1 min-w-0 pr-3">
        <p className={cn("leading-tight text-sm", bold && "font-semibold", large && "text-base font-bold")}>{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <span className={cn("font-semibold tabular-nums whitespace-nowrap text-sm",
        bold && "font-bold", large && "text-lg text-primary")}>
        {fmt(value)}
      </span>
    </div>
  );
}

export default function CostingPage() {
  const [form, setForm]         = useState<CostForm>(DEFAULTS);
  const [view, setView]         = useState<"detailed" | "customer">("detailed");
  const [saving, setSaving]     = useState(false);

  const { data: machines } = useMachines();
  const { data: materials } = useMaterials();

  const field = (k: keyof CostForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const pressOptions = useMemo(
    () => (machines ?? []).filter(m => m.machineType === "printing"),
    [machines],
  );
  const boardMats = useMemo(
    () => (materials ?? []).filter(m => m.materialType === "board" || m.materialType === "paper"),
    [materials],
  );
  const selMachine = useMemo(
    () => pressOptions.find(m => String(m.id) === form.selectedMachineId) ?? null,
    [pressOptions, form.selectedMachineId],
  );

  const c = useMemo(() => compute(form, selMachine), [form, selMachine]);

  async function saveQuote() {
    setSaving(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${base}/api/job-quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: null,
          costingSnapshot: { inputs: form, outputs: c },
          preGstTotal: c.preGst,
          finalTotal: c.finalTotal,
          per1000Rate: c.per1kRate,
        }),
      });
      if (!r.ok) throw new Error("save failed");
      const d = await r.json() as { id: number; version: number };
      toast.success(`Quote saved — v${d.version} (ID #${d.id})`);
    } catch {
      toast.error("Could not save quote — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function copyCustomer() {
    const text = [
      "PrintFlow — Cost Estimate",
      "",
      `Quantity: ${c.qty.toLocaleString("en-IN")} cartons`,
      "",
      `Plate Charges:   ${fmt(c.plateCost)}`,
      `Pre-GST Total:   ${fmt(c.preGst)}`,
      `GST (${form.gstPct}%):         ${fmt(c.gstAmt)}`,
      `Final Total:     ${fmt(c.finalTotal)}`,
      "",
      `Rate / 1,000 cartons (pre-GST): ${fmt(c.per1kRate)}`,
    ].join("\n");
    navigator.clipboard.writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy"));
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Calculator size={28} className="text-primary" />
            Costing Calculator
          </h1>
          <p className="text-muted-foreground mt-1">Live job cost estimate — all values update in real time</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {(["detailed", "customer"] as const).map(m => (
              <button key={m} onClick={() => setView(m)}
                className={cn("px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all",
                  view === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m}
              </button>
            ))}
          </div>
          <Button onClick={saveQuote} disabled={saving} className="gap-2 shadow">
            <Save size={15} />
            {saving ? "Saving…" : "Save Quote"}
          </Button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

        {/* ════ LEFT: INPUTS ════ */}
        <div className="space-y-4">

          {/* Job Quantity */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Job Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Qty Required (cartons)</Label>
                <Input type="number" value={form.qtyRequired} onChange={field("qtyRequired")} min={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Ups per Sheet</Label>
                <Input type="number" value={form.upsPerSheet} onChange={field("upsPerSheet")} min={1} />
              </div>
            </div>
          </Card>

          {/* Carton */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Carton Dimensions</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs mb-1 block">L (mm)</Label>
                <Input type="number" value={form.cartonLengthMm} onChange={field("cartonLengthMm")} min={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">W (mm)</Label>
                <Input type="number" value={form.cartonWidthMm} onChange={field("cartonWidthMm")} min={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">H (mm)</Label>
                <Input type="number" value={form.cartonHeightMm} onChange={field("cartonHeightMm")} min={1} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Carton Style</Label>
              <Select value={form.cartonStyle} onChange={field("cartonStyle")} className="w-full">
                <option value="straight_tuck">Straight Tuck (×1.00)</option>
                <option value="reverse_tuck">Reverse Tuck (×0.85)</option>
                <option value="auto_bottom">Auto Bottom (×0.60)</option>
                <option value="crash_lock">Crash Lock (×0.55)</option>
              </Select>
            </div>
          </Card>

          {/* Paper / Board */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Paper / Board</h3>
            <div>
              <Label className="text-xs mb-1 block">Material (auto-fills rate)</Label>
              <Select
                value={form.materialId}
                onChange={e => {
                  const mat = boardMats.find(m => String(m.id) === e.target.value);
                  setForm(p => ({
                    ...p,
                    materialId: e.target.value,
                    ratePerKg: mat?.ratePerUnit != null ? String(mat.ratePerUnit) : p.ratePerKg,
                  }));
                }}
                className="w-full"
              >
                <option value="">— Manual entry —</option>
                {boardMats.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.materialName}{m.ratePerUnit ? ` · ₹${m.ratePerUnit}/kg` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Sheet Length (in)</Label>
                <Input type="number" value={form.sheetLengthIn} onChange={field("sheetLengthIn")} step={0.5} min={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Sheet Breadth (in)</Label>
                <Input type="number" value={form.sheetBreadthIn} onChange={field("sheetBreadthIn")} step={0.5} min={1} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">GSM</Label>
                <Input type="number" value={form.gsm} onChange={field("gsm")} min={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Rate per kg (₹)</Label>
                <Input type="number" value={form.ratePerKg} onChange={field("ratePerKg")} min={0} />
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sheet weight</span>
                <span className="font-medium">{dec(c.sheetWtKg, 5)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sheet cost</span>
                <span className="font-medium">₹{dec(c.sheetCostEa, 4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Planned sheets</span>
                <span className="font-medium">{c.planSheets.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </Card>

          {/* Colours & Press */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Colours & Press</h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs mb-1 block">Process (CMYK)</Label>
                <Select value={form.processColors} onChange={field("processColors")} className="w-full">
                  {[1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Spot colours</Label>
                <Select value={form.spotColors} onChange={field("spotColors")} className="w-full">
                  {[0,1,2,3,4].map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Print passes</Label>
                <Select value={form.printPassCount} onChange={field("printPassCount")} className="w-full">
                  {[1,2,3].map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Press Machine</Label>
              <Select value={form.selectedMachineId} onChange={field("selectedMachineId")} className="w-full">
                <option value="">— Default (Komori LA37 params) —</option>
                {pressOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.machineName}</option>
                ))}
              </Select>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Effective SPH</span>
                <span className="font-medium">{Math.round(c.ratedSph * c.oee).toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Setup + Run</span>
                <span className="font-medium">{dec(c.setupMin, 0)} + {dec(c.pressRunMin, 0)} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Press hour rate</span>
                <span className="font-medium">₹{c.hrRate.toLocaleString("en-IN")}/hr</span>
              </div>
            </div>
          </Card>

          {/* Coating & Die */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coating & Finishing</h3>
            <div>
              <Label className="text-xs mb-1 block">Coating Type</Label>
              <Select value={form.coatingType} onChange={field("coatingType")} className="w-full">
                <option value="none">None</option>
                <option value="aqueous">Aqueous (Inline)</option>
                <option value="uv">UV (Inline)</option>
                <option value="varnish">Varnish (Inline)</option>
              </Select>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="text-xs font-medium">New Die Required?</Label>
              <button
                onClick={() => setForm(p => ({ ...p, isNewDie: !p.isNewDie }))}
                className={cn("w-10 h-6 rounded-full relative transition-colors",
                  form.isNewDie ? "bg-primary" : "bg-muted-foreground/30")}
              >
                <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                  form.isNewDie ? "left-[18px]" : "left-0.5")} />
              </button>
            </div>
            {form.isNewDie && (
              <div>
                <Label className="text-xs mb-1 block">Die Fabrication Cost (₹)</Label>
                <Input type="number" value={form.dieFabCost} onChange={field("dieFabCost")} min={0} />
              </div>
            )}
          </Card>

          {/* Cost Parameters */}
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cost Parameters</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Plate Rate (₹ each)</Label>
                <Input type="number" value={form.plateRate} onChange={field("plateRate")} min={0} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Handwork per 1,000 (₹)</Label>
                <Input type="number" value={form.handworkPer1000} onChange={field("handworkPer1000")} min={0} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">CMYK Ink Rate (₹/kg)</Label>
                <Input type="number" value={form.cmykInkRate} onChange={field("cmykInkRate")} min={0} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Spot Ink Rate (₹/kg)</Label>
                <Input type="number" value={form.spotInkRate} onChange={field("spotInkRate")} min={0} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Running Waste (%)</Label>
                <Input type="number" value={form.runningWastePct} onChange={field("runningWastePct")} min={0} step={0.5} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Makeready Override</Label>
                <Input type="number" value={form.makereadyOverride} onChange={field("makereadyOverride")} placeholder="Auto" min={0} />
              </div>
            </div>
            <div className="border-t border-border pt-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Factory OH (%)</Label>
                <Input type="number" value={form.ohPct} onChange={field("ohPct")} min={0} step={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Admin OH (%)</Label>
                <Input type="number" value={form.adminOhPct} onChange={field("adminOhPct")} min={0} step={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Profit Margin (%)</Label>
                <Input type="number" value={form.profitPct} onChange={field("profitPct")} min={0} step={1} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">GST (%)</Label>
                <Select value={form.gstPct} onChange={field("gstPct")} className="w-full">
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                </Select>
              </div>
            </div>
          </Card>
        </div>

        {/* ════ RIGHT: BREAKDOWN ════ */}
        <div className="xl:sticky xl:top-6 space-y-4">

          {view === "detailed" ? (
            <>
              {/* Line items card */}
              <Card className="overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-sm">Detailed Cost Breakdown</h3>
                  <span className="text-xs text-muted-foreground">{c.qty.toLocaleString("en-IN")} cartons</span>
                </div>
                <div className="divide-y divide-border/60">
                  <Row label="Paper / Board" value={c.paperCost}
                    sub={`${c.planSheets.toLocaleString("en-IN")} sheets × ₹${dec(c.sheetCostEa, 4)}/sheet`} />
                  <Row label="Plates" value={c.plateCost}
                    sub={`${c.plateCnt} plates × ₹${n(form.plateRate).toLocaleString("en-IN")}`} />
                  <Row label="Press / Machine" value={c.pressCost}
                    sub={`${dec(c.setupMin, 0)}m setup + ${dec(c.pressRunMin, 1)}m run @ ₹${c.hrRate.toLocaleString("en-IN")}/hr`} />
                  <Row label="Ink — CMYK" value={c.cmykCost}
                    sub={`${c.procC} process colour${c.procC !== 1 ? "s" : ""}`} />
                  {c.spotC > 0 && (
                    <Row label="Ink — Spot" value={c.spotCostAmt}
                      sub={`${c.spotC} spot colour${c.spotC !== 1 ? "s" : ""}`} />
                  )}
                  {c.coatingCost > 0 && (
                    <Row label="Coating (Aqueous)" value={c.coatingCost}
                      sub={`₹${n(form.aqueousRate)}/kg inline`} />
                  )}
                  <Row label="Die Cutting" value={c.dieCutCost}
                    sub={`${form.isNewDie ? "New die" : "Existing die"} — ${c.dieSetupMin}m setup + ${dec(c.dieRunMin, 0)}m run`} />
                  <Row label="Folder-Gluer" value={c.gluerCost}
                    sub={`25m setup + ${dec(c.glueRunMin, 0)}m run @ ₹1,200/hr`} />
                  <Row label="Glue" value={c.glueCost}
                    sub={`${dec(c.qty * 0.4 / 1000, 2)} kg × ₹150/kg`} />
                  <Row label="Handwork" value={c.hwCost}
                    sub={`₹${n(form.handworkPer1000)} per 1,000`} />
                </div>
                <div className="divide-y divide-border/60 border-t border-border bg-muted/10">
                  <Row label="Direct Cost" value={c.directCost} bold />
                  <Row label={`Factory Overhead (${form.ohPct}%)`} value={c.factoryOh} />
                  <Row label={`Admin Overhead (${form.adminOhPct}%)`} value={c.adminOh} />
                  <Row label="Subtotal" value={c.subtotal} bold />
                  {c.profit > 0 && (
                    <Row label={`Profit Margin (${form.profitPct}%)`} value={c.profit} />
                  )}
                </div>
              </Card>

              {/* Totals card */}
              <Card className="overflow-hidden border-primary/20 border-2">
                <div className="divide-y divide-border/60">
                  <Row label="Pre-GST Total" value={c.preGst} bold large />
                  <Row label={`GST (${form.gstPct}%)`} value={c.gstAmt} />
                  <Row label="Final Total (incl. GST)" value={c.finalTotal} bold large />
                </div>
                <div className="px-4 py-6 bg-primary/5 text-center">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
                    <Info size={11} />
                    Rate per 1,000 cartons (pre-GST)
                  </p>
                  <p className="text-5xl font-black text-primary tracking-tight tabular-nums">
                    {fmt(c.per1kRate)}
                  </p>
                </div>
              </Card>
            </>
          ) : (
            /* Customer view */
            <Card className="overflow-hidden border-primary/20 border-2">
              <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-sm">Customer Quote</h3>
                <button
                  onClick={copyCustomer}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                >
                  <Copy size={12} />
                  Copy
                </button>
              </div>
              <div className="p-6 space-y-5">
                <div className="text-center pb-4 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                  <p className="text-3xl font-black">{c.qty.toLocaleString("en-IN")} cartons</p>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: "Plate Charges", val: c.plateCost },
                    { label: "Pre-GST Total", val: c.preGst },
                    { label: `GST (${form.gstPct}%)`, val: c.gstAmt },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold">{fmt(val)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                    <span>Final Total</span>
                    <span className="text-primary">{fmt(c.finalTotal)}</span>
                  </div>
                </div>
                <div className="bg-primary/5 rounded-xl px-4 py-5 text-center mt-2">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
                    <Info size={11} />
                    Rate per 1,000 cartons (pre-GST)
                  </p>
                  <p className="text-5xl font-black text-primary tabular-nums">{fmt(c.per1kRate)}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
