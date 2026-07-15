import React, { useState, useMemo, useEffect } from "react";
import { Calculator, Save, Copy, Info, Printer, Link2, FileText, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, Button, Input, Label, Select } from "@/components/ui-elements";
import { useMachines } from "@/hooks/use-machines";
import { useMaterials } from "@/hooks/use-inventory";
import { useJobs } from "@/hooks/use-jobs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useListJobQuotes, useConvertJobQuote, getListJobQuotesQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import type { Machine } from "@workspace/api-client-react";

type MachineRow = Machine;

const STYLE_FACTORS: Record<string, number> = {
  straight_tuck: 1.0,
  reverse_tuck: 0.85,
  auto_bottom: 0.60,
  crash_lock: 0.55,
};

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmt = (v: number) => INR.format(Math.round(v));
const dec = (v: number | string | null | undefined, d = 2) => Number(v || 0).toFixed(d);

function n(val: string | undefined, fallback = 0): number {
  if (val === undefined || val === "") return fallback;
  const v = parseFloat(val);
  return isNaN(v) ? fallback : v;
}

interface CostForm {
  jobName: string;
  clientName: string;
  linkedJobId: string;
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
  selectedDieCutterId: string;
  selectedGluerId: string;
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
  uvRate: string;
  varnishRate: string;
}

const DEFAULTS: CostForm = {
  jobName: "",
  clientName: "",
  linkedJobId: "",
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
  selectedDieCutterId: "",
  selectedGluerId: "",
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
  uvRate: "380",
  varnishRate: "180",
};

function coatingLabel(type: string) {
  if (type === "aqueous") return "Coating (Aqueous)";
  if (type === "uv") return "Coating (UV)";
  if (type === "varnish") return "Coating (Varnish)";
  return "Coating";
}

function compute(
  form: CostForm,
  machine: MachineRow | null,
  dieMachine: MachineRow | null,
  gluerMachine: MachineRow | null,
) {
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
  const uvRate     = n(form.uvRate, 380);
  const varnishRate = n(form.varnishRate, 180);
  const clMm       = Math.max(1, n(form.cartonLengthMm, 100));

  // Press params from machine row (DB seeded values)
  const ratedSph = machine?.ratedSph ?? 12000;
  const oee      = machine?.oeeDefault != null ? parseFloat(String(machine.oeeDefault)) : 0.70;
  const setupMin = machine?.setupMinRepeat ?? 30;
  const hrRate   = machine?.hourRate != null ? parseFloat(String(machine.hourRate)) : 2800;

  // Sheet
  const sheetWtKg   = (L_cm * B_cm * gsm) / 10_000_000;
  const sheetCostEa = sheetWtKg * ratePerKg;
  const sheetAreaM2 = (L_cm * B_cm) / 10_000;

  // Quantities — makeready doubles when passes >= 2
  const reqSheets    = Math.ceil(qty / ups);
  const baseReady    = totalC >= 5 ? 500 : 400;
  const makeready    = mkOverride > 0 ? mkOverride : passes >= 2 ? baseReady * 2 : baseReady;
  const planSheets   = Math.ceil((reqSheets + makeready) * (1 + wastePct / 100));
  const makereadyAuto = passes >= 2 ? baseReady * 2 : baseReady;

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

  // Coating
  let coatingCost = 0;
  let coatingKg   = 0;
  let coatingRate = 0;
  if (coating === "aqueous") {
    coatingKg   = (planSheets * sheetAreaM2 * 2) / 1000;
    coatingRate = aqRate;
    coatingCost = coatingKg * aqRate;
  } else if (coating === "uv") {
    coatingKg   = (planSheets * sheetAreaM2 * 1.8) / 1000;
    coatingRate = uvRate;
    coatingCost = coatingKg * uvRate;
  } else if (coating === "varnish") {
    coatingKg   = (planSheets * sheetAreaM2 * 1.5) / 1000;
    coatingRate = varnishRate;
    coatingCost = coatingKg * varnishRate;
  }

  // Die cutter — params from selected machine row, fallbacks = legacy hardcodes
  const dieRunSph   = dieMachine?.peakRunningSph ?? 5200;
  const dieSetupMin = isNewDie
    ? (dieMachine?.setupMinNew ?? 105)
    : (dieMachine?.setupMinRepeat ?? 10);
  const dieHrRate   = dieMachine?.hourRate != null ? parseFloat(String(dieMachine.hourRate)) : 1500;
  const dieRunMin   = dieRunSph > 0 ? (planSheets / dieRunSph) * 60 : 0;
  let dieCutCost    = ((dieSetupMin + dieRunMin) / 60) * dieHrRate;
  if (isNewDie) dieCutCost += dieFab;

  // Folder-gluer (carton units) — params from selected machine row, fallbacks = legacy hardcodes
  const styleFact  = STYLE_FACTORS[form.cartonStyle] ?? 1.0;
  const glFeedM    = gluerMachine?.ratedSpeedMPerMin ?? 350;
  const glEff      = gluerMachine?.oeeDefault != null ? parseFloat(String(gluerMachine.oeeDefault)) : 0.65;
  const glSetupMin = gluerMachine?.setupMinRepeat ?? 25;
  const glHrRate   = gluerMachine?.hourRate != null ? parseFloat(String(gluerMachine.hourRate)) : 1200;
  const ratedCph   = (glFeedM * 60 * 1000) / clMm;
  const effCph     = ratedCph * glEff * styleFact;
  const glueRunMin = qty > 0 && effCph > 0 ? (qty / effCph) * 60 : 0;
  const gluerCost  = ((glSetupMin + glueRunMin) / 60) * glHrRate;
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
    reqSheets, makeready, makereadyAuto, planSheets,
    paperCost, plateCnt, plateCost,
    ratedSph, oee, setupMin, hrRate, pressRunMin, pressCost,
    cmykCost, spotCostAmt, inkCost,
    coatingCost, coatingKg, coatingRate,
    dieRunSph, dieSetupMin, dieHrRate, dieRunMin, dieCutCost,
    glFeedM, glEff, glSetupMin, glHrRate, ratedCph, effCph, glueRunMin, gluerCost, glueCost,
    hwCost, directCost, factoryOh, adminOh,
    subtotal, profit, preGst, gstAmt, finalTotal, per1kRate,
    procC, spotC, totalC, passes,
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
  const [form, setForm]     = useState<CostForm>(DEFAULTS);
  const [view, setView]     = useState<"detailed" | "customer">("detailed");
  const [saving, setSaving] = useState(false);
  const [linkSummary, setLinkSummary] = useState("");
  const [expandedQuoteId, setExpandedQuoteId] = useState<number | null>(null);
  const [convertForm, setConvertForm] = useState({ jobName: "", clientName: "" });

  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: savedQuotes } = useListJobQuotes();
  const convertMutation = useConvertJobQuote();

  const { data: machines }  = useMachines();
  const { data: materials } = useMaterials();
  const { data: jobs }      = useJobs();

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
  const dieOptions = useMemo(
    () => (machines ?? []).filter(
      m => m.machineType === "cutting" && (m.capabilities ?? []).includes("die-cutting"),
    ),
    [machines],
  );
  const gluerOptions = useMemo(
    () => (machines ?? []).filter(
      m => m.machineType === "gluing" && (m.capabilities ?? []).includes("folder-gluing"),
    ),
    [machines],
  );
  const selDieMachine = useMemo(
    () => dieOptions.find(m => String(m.id) === form.selectedDieCutterId) ?? null,
    [dieOptions, form.selectedDieCutterId],
  );
  const selGluerMachine = useMemo(
    () => gluerOptions.find(m => String(m.id) === form.selectedGluerId) ?? null,
    [gluerOptions, form.selectedGluerId],
  );
  const activeJobs = useMemo(
    () => (jobs ?? []).filter(j => j.status !== "completed"),
    [jobs],
  );

  // Default the die-cutter / folder-gluer pickers to the first available machine.
  useEffect(() => {
    setForm(p => {
      let next = p;
      if (!p.selectedDieCutterId && dieOptions[0]) {
        next = { ...next, selectedDieCutterId: String(dieOptions[0].id) };
      }
      if (!p.selectedGluerId && gluerOptions[0]) {
        next = { ...next, selectedGluerId: String(gluerOptions[0].id) };
      }
      return next;
    });
  }, [dieOptions, gluerOptions]);

  const c = useMemo(
    () => compute(form, selMachine, selDieMachine, selGluerMachine),
    [form, selMachine, selDieMachine, selGluerMachine],
  );

  // Receive a layout handed off from the Layout Planner (sessionStorage, one-shot).
  useEffect(() => {
    const raw = sessionStorage.getItem("pf.layoutHandoff");
    if (!raw) return;
    sessionStorage.removeItem("pf.layoutHandoff");
    try {
      const h = JSON.parse(raw) as Partial<CostForm> & { _label?: string };
      const { _label, ...fields } = h;
      const allowed: (keyof CostForm)[] = [
        "qtyRequired", "cartonLengthMm", "cartonWidthMm", "cartonHeightMm",
        "cartonStyle", "upsPerSheet", "sheetLengthIn", "sheetBreadthIn",
        "materialId", "gsm", "ratePerKg",
      ];
      setForm(p => {
        const next = { ...p };
        for (const k of allowed) {
          const v = fields[k];
          if (typeof v === "string" && v !== "") (next as Record<string, unknown>)[k] = v;
        }
        return next;
      });
      const label = _label ?? "layout";
      setLinkSummary(`Layout loaded: ${label}`);
      toast.success("Layout loaded from planner", { description: label });
    } catch {
      /* corrupt payload — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleJobLink(jobId: string) {
    const job = (jobs ?? []).find(j => String(j.id) === jobId);
    if (!job) {
      setForm(p => ({ ...p, linkedJobId: "" }));
      setLinkSummary("");
      return;
    }
    const mat = boardMats.find(m => m.id === job.materialId);

    // Sheet dimensions live on the material as a string like "23x36".
    // Values are treated as inches unless the string explicitly carries a cm/mm unit.
    let sheetDims: { sheetLengthIn: string; sheetBreadthIn: string } | undefined;
    if (mat?.dimensions) {
      const raw = mat.dimensions.toLowerCase();
      const parts = raw.split(/[x×*]/i).map(s => parseFloat(s.trim()));
      if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
        const toIn = raw.includes("mm") ? 1 / 25.4 : raw.includes("cm") ? 1 / 2.54 : 1;
        sheetDims = {
          sheetLengthIn: String(+(parts[0] * toIn).toFixed(4)),
          sheetBreadthIn: String(+(parts[1] * toIn).toFixed(4)),
        };
      }
    }

    const procC  = job.processColors;
    const spotC  = job.spotColors;
    const passes = job.printPassCount;

    setForm(p => ({
      ...p,
      linkedJobId: jobId,
      qtyRequired: String(job.qtySheets),
      ...(job.materialId != null && { materialId: String(job.materialId) }),
      ...(job.materialGsm != null && { gsm: String(job.materialGsm) }),
      ...(mat?.ratePerUnit != null && { ratePerKg: String(mat.ratePerUnit) }),
      ...(job.coatingType && ["none", "aqueous", "uv", "varnish"].includes(job.coatingType)
        ? { coatingType: job.coatingType }
        : {}),
      ...(procC != null && { processColors: String(procC) }),
      ...(spotC != null && { spotColors: String(spotC) }),
      ...(passes != null && { printPassCount: String(passes) }),
      ...(job.cartonStyle && STYLE_FACTORS[job.cartonStyle] != null
        ? { cartonStyle: job.cartonStyle }
        : {}),
      ...(job.upsPerSheet != null && job.upsPerSheet > 0 && { upsPerSheet: String(job.upsPerSheet) }),
      ...(job.isNewDie != null && { isNewDie: job.isNewDie }),
      dieFabCost: job.dieCost != null ? String(job.dieCost) : "0",
      ...(sheetDims ?? {}),
    }));

    const nColours = (procC ?? n(DEFAULTS.processColors)) + (spotC ?? 0);
    const nPasses  = passes ?? Number(DEFAULTS.printPassCount);
    const matName  = mat?.materialName ?? "material n/a";
    setLinkSummary(
      `Loaded from ${job.jobCode}: ${job.qtySheets.toLocaleString("en-IN")} qty, ${matName}, `
      + `${nColours} colour${nColours !== 1 ? "s" : ""}, ${nPasses} pass${nPasses !== 1 ? "es" : ""}`,
    );
    toast.success(`Loaded: ${job.jobName}`, {
      description: "Qty, material, colours, passes & finishing filled from job.",
    });
  }

  async function saveQuote() {
    setSaving(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${base}/api/job-quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: form.linkedJobId ? Number(form.linkedJobId) : null,
          costingSnapshot: {
            inputs: form,
            outputs: c,
            machines: {
              pressId: form.selectedMachineId ? Number(form.selectedMachineId) : null,
              dieCutterId: form.selectedDieCutterId ? Number(form.selectedDieCutterId) : null,
              gluerId: form.selectedGluerId ? Number(form.selectedGluerId) : null,
            },
          },
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

  function handleConvert(quoteId: number) {
    if (!convertForm.jobName.trim() || !convertForm.clientName.trim()) {
      toast.error("Job name and client name are required");
      return;
    }
    convertMutation.mutate(
      { id: quoteId, data: { jobName: convertForm.jobName.trim(), clientName: convertForm.clientName.trim() } },
      {
        onSuccess: (data) => {
          toast.success(`Job ${data.jobCode} created from quote!`, {
            description: "Opening the Jobs page…",
            duration: 4000,
          });
          setExpandedQuoteId(null);
          setConvertForm({ jobName: "", clientName: "" });
          queryClient.invalidateQueries({ queryKey: getListJobQuotesQueryKey() });
          setTimeout(() => navigate("/jobs"), 800);
        },
        onError: () => {
          toast.error("Failed to convert quote. Please try again.");
        },
      }
    );
  }

  function copyCustomer() {
    const coatingLine = form.coatingType !== "none"
      ? `\nCoating:         ${coatingLabel(form.coatingType)}`
      : "";
    const text = [
      "PrintFlow — Cost Estimate",
      "",
      `Quantity: ${c.qty.toLocaleString("en-IN")} cartons`,
      "",
      `Plate Charges:   ${fmt(c.plateCost)}${coatingLine}`,
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

  function exportPdf() {
    const prev = document.title;
    document.title = `PrintFlow Quote — ${c.qty.toLocaleString("en-IN")} cartons`;
    window.print();
    document.title = prev;
  }

  const coatingRateLabel = form.coatingType === "aqueous"
    ? `₹${n(form.aqueousRate)}/kg inline`
    : form.coatingType === "uv"
    ? `₹${n(form.uvRate)}/kg UV`
    : form.coatingType === "varnish"
    ? `₹${n(form.varnishRate)}/kg varnish`
    : "";

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #costing-print-area, #costing-print-area * { visibility: visible !important; }
          #costing-print-area { position: fixed; inset: 0; padding: 32px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
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

        {/* ── Saved Quotes ── */}
        {savedQuotes && savedQuotes.length > 0 && (
          <Card className="overflow-hidden no-print">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <FileText size={14} className="text-primary" />
                Saved Quotes
              </h3>
              <span className="text-xs text-muted-foreground">{savedQuotes.length} quote{savedQuotes.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-border">
              {savedQuotes.map(q => (
                <div key={q.id}>
                  <div className="px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-muted-foreground font-mono">v{q.version}</span>
                        {q.jobId && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Job linked</span>
                        )}
                        {q.isConverted && (
                          <span className="text-xs bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                            <CheckCircle2 size={10} /> Converted
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>{format(new Date(q.createdAt), "dd MMM yyyy, HH:mm")}</span>
                        {q.preGstTotal && (
                          <span className="font-semibold text-foreground">
                            ₹{Number(q.preGstTotal).toLocaleString("en-IN", { maximumFractionDigits: 0 })} pre-GST
                          </span>
                        )}
                        {q.per1000Rate && (
                          <span>
                            ₹{Number(q.per1000Rate).toLocaleString("en-IN", { maximumFractionDigits: 0 })}/1k
                          </span>
                        )}
                      </div>
                    </div>
                    {!q.isConverted && (
                      <button
                        onClick={() => {
                          if (expandedQuoteId === q.id) {
                            setExpandedQuoteId(null);
                          } else {
                            setExpandedQuoteId(q.id);
                            const snap = q.costingSnapshot as Record<string, unknown> | undefined | null;
                            const snapInputs = (snap?.inputs ?? {}) as Record<string, unknown>;
                            const linkedJob = q.jobId ? (jobs ?? []).find(j => j.id === q.jobId) : null;
                            setConvertForm({
                              jobName:    (typeof snapInputs.jobName    === "string" ? snapInputs.jobName.trim()    : "") || `Quote v${q.version}`,
                              clientName: (typeof snapInputs.clientName === "string" ? snapInputs.clientName.trim() : "") || linkedJob?.clientName || "",
                            });
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <ArrowRight size={12} />
                        Convert to Job
                      </button>
                    )}
                  </div>
                  {expandedQuoteId === q.id && (
                    <div className="px-4 py-4 bg-primary/5 border-t border-primary/20 space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Creates a new pending job pre-filled from this quote. The quote will be locked once converted.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <Label className="text-xs mb-1 block">Job Name <span className="text-rose-500">*</span></Label>
                          <Input
                            value={convertForm.jobName}
                            onChange={e => setConvertForm(p => ({ ...p, jobName: e.target.value }))}
                            placeholder="e.g. Pharma Carton – Batch 3"
                            className="text-sm"
                            onKeyDown={e => e.key === "Enter" && handleConvert(q.id)}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs mb-1 block">Client Name <span className="text-rose-500">*</span></Label>
                          <Input
                            value={convertForm.clientName}
                            onChange={e => setConvertForm(p => ({ ...p, clientName: e.target.value }))}
                            placeholder="e.g. Sun Pharma Ltd."
                            className="text-sm"
                            onKeyDown={e => e.key === "Enter" && handleConvert(q.id)}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleConvert(q.id)}
                          disabled={convertMutation.isPending || !convertForm.jobName.trim() || !convertForm.clientName.trim()}
                          className="text-sm"
                        >
                          {convertMutation.isPending ? "Converting…" : "Confirm Convert"}
                        </Button>
                        <button
                          onClick={() => setExpandedQuoteId(null)}
                          className="text-sm text-muted-foreground hover:text-foreground px-2 py-1.5 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

          {/* ════ LEFT: INPUTS ════ */}
          <div className="space-y-4 no-print">

            {/* Job / Client Details */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText size={12} />
                Job Details (saved with quote)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Job Name</Label>
                  <Input
                    value={form.jobName}
                    onChange={field("jobName")}
                    placeholder="e.g. Pharma Carton – Batch 3"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Client Name</Label>
                  <Input
                    value={form.clientName}
                    onChange={field("clientName")}
                    placeholder="e.g. Sun Pharma Ltd."
                    className="text-sm"
                  />
                </div>
              </div>
            </Card>

            {/* Link to Job */}
            <Card className="p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Link2 size={12} />
                Link to Job (optional)
              </h3>
              <Select
                value={form.linkedJobId}
                onChange={e => handleJobLink(e.target.value)}
                className="w-full"
              >
                <option value="">— Standalone quote —</option>
                {activeJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.jobCode} · {j.jobName} ({j.clientName})
                  </option>
                ))}
              </Select>
              {form.linkedJobId && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Info size={11} className="shrink-0" />
                  {linkSummary || "Auto-filled from job. Edit below to override."}
                </p>
              )}
            </Card>

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
                  <span className="font-medium">{dec(c.setupMin, 0)} + {dec(c.pressRunMin, 1)} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Press hour rate</span>
                  <span className="font-medium">₹{c.hrRate.toLocaleString("en-IN")}/hr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Makeready sheets</span>
                  <span className={cn("font-medium", form.makereadyOverride ? "text-amber-500" : "")}>
                    {form.makereadyOverride ? `${n(form.makereadyOverride)} (override)` : `${c.makereadyAuto}${c.passes >= 2 ? " (×2 for 2-pass)" : ""}`}
                  </span>
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
                  <option value="aqueous">Aqueous (Inline) — ₹230/kg</option>
                  <option value="uv">UV (Inline) — ₹380/kg</option>
                  <option value="varnish">Varnish (Inline) — ₹180/kg</option>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Die Cutter</Label>
                <Select value={form.selectedDieCutterId} onChange={field("selectedDieCutterId")} className="w-full">
                  <option value="">— Default die-cutter params —</option>
                  {dieOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.machineName}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Folder Gluer</Label>
                <Select value={form.selectedGluerId} onChange={field("selectedGluerId")} className="w-full">
                  <option value="">— Default folder-gluer params —</option>
                  {gluerOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.machineName}</option>
                  ))}
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

                {/* Coating rate input — shown per coating type */}
                {form.coatingType === "aqueous" && (
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">Aqueous Rate (₹/kg)</Label>
                    <Input type="number" value={form.aqueousRate} onChange={field("aqueousRate")} min={0} />
                  </div>
                )}
                {form.coatingType === "uv" && (
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">UV Lacquer Rate (₹/kg)</Label>
                    <Input type="number" value={form.uvRate} onChange={field("uvRate")} min={0} />
                  </div>
                )}
                {form.coatingType === "varnish" && (
                  <div className="col-span-2">
                    <Label className="text-xs mb-1 block">Varnish Rate (₹/kg)</Label>
                    <Input type="number" value={form.varnishRate} onChange={field("varnishRate")} min={0} />
                  </div>
                )}

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
                      <Row label={coatingLabel(form.coatingType)} value={c.coatingCost}
                        sub={coatingRateLabel} />
                    )}
                    <Row label="Die Cutting" value={c.dieCutCost}
                      sub={`${form.isNewDie ? "New die" : "Existing die"} — ${c.dieSetupMin}m setup + ${dec(c.dieRunMin, 0)}m run`} />
                    <Row label="Folder-Gluer" value={c.gluerCost}
                      sub={`${dec(c.glSetupMin, 0)}m setup + ${dec(c.glueRunMin, 0)}m run @ ₹${c.glHrRate.toLocaleString("en-IN")}/hr`} />
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
              <div id="costing-print-area">
                <Card className="overflow-hidden border-primary/20 border-2">
                  <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-sm">Customer Quote</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={copyCustomer}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                      >
                        <Copy size={12} />
                        Copy
                      </button>
                      <button
                        onClick={exportPdf}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                      >
                        <Printer size={12} />
                        Export PDF
                      </button>
                    </div>
                  </div>
                  <div className="p-6 space-y-5">
                    {form.linkedJobId && (() => {
                      const job = (jobs ?? []).find(j => String(j.id) === form.linkedJobId);
                      return job ? (
                        <div className="bg-primary/5 rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                          <Link2 size={11} className="text-primary" />
                          <span>Linked to <span className="font-semibold text-foreground">{job.jobName}</span> ({job.jobCode})</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="text-center pb-4 border-b border-border">
                      <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                      <p className="text-3xl font-black">{c.qty.toLocaleString("en-IN")} cartons</p>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { label: "Plate Charges", val: c.plateCost },
                        ...(c.coatingCost > 0 ? [{ label: coatingLabel(form.coatingType), val: c.coatingCost }] : []),
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
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
