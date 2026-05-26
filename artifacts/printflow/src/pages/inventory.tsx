import React, { useState, useMemo } from "react";
import { useStockSummary } from "@/hooks/use-reports";
import { useCreateStockInward, useMaterialVendors, useMaterialInwardHistory, useMaterials } from "@/hooks/use-inventory";
import { useVendors, useCreateVendor } from "@/hooks/use-vendors";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { Package, AlertTriangle, Layers, X, Plus, ChevronLeft, Search, IndianRupee, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn, parseDim, formatDim, dimToCm } from "@/lib/utils";
import { format } from "date-fns";
import type { StockSummaryRow } from "@workspace/api-client-react";
import { AddStockWizard } from "@/components/add-stock-wizard";
import { toast } from "sonner";

// ─── Dual-unit helpers ──────────────────────────────────────────────────────

type DimUnitStr = "in" | "cm" | "mm";

function sheetWeightKgFromItem(item: StockSummaryRow): number | null {
  if (!item.dimensions || !item.gsm) return null;
  const p = parseDim(item.dimensions);
  if (!p) return null;
  const lCm = dimToCm(p.w, p.unit as DimUnitStr);
  const bCm = dimToCm(p.h, p.unit as DimUnitStr);
  const w = (lCm * bCm * item.gsm) / 10_000_000;
  return w > 0 ? w : null;
}

function dualUnits(item: StockSummaryRow): { sheets: number | null; kg: number | null } {
  const swKg = sheetWeightKgFromItem(item);
  if (!swKg) return { sheets: null, kg: null };
  if (item.unit === "sheets") {
    return { sheets: item.currentQty, kg: item.currentQty * swKg };
  }
  if (item.unit === "kg") {
    return { sheets: Math.round(item.currentQty / swKg), kg: item.currentQty };
  }
  return { sheets: null, kg: null };
}

function fmtKg(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
  if (n >= 100) return `${Math.round(n)} kg`;
  return `${n.toFixed(1)} kg`;
}

function batchAgeColor(days: number): string {
  if (days < 30) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (days < 60) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  if (days < 90) return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Inventory() {
  const { data: stock, isLoading } = useStockSummary();
  const { data: allMaterials } = useMaterials();
  const [activeTab, setActiveTab] = useState<"boards" | "consumables">("boards");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isInwardOpen, setIsInwardOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  if (isLoading) return (
    <div className="flex justify-center p-12">
      <div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" />
    </div>
  );

  const vendorMap = new Map<number, string>(
    (allMaterials ?? [])
      .filter(m => (m as Record<string, unknown>)["vendorName"])
      .map(m => [m.id, (m as Record<string, unknown>)["vendorName"] as string])
  );

  const boards = stock?.filter(s => s.materialType === "board" || s.materialType === "paper") || [];
  const consumables = stock?.filter(s => s.materialType === "consumable") || [];
  const selectedMaterial = stock?.find(s => s.id === selectedMaterialId) ?? null;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground mt-1 font-medium">Visual stock levels and reorder alerts</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setIsInwardOpen(true)}>
            <Package size={18} />
            Record Inward Stock
          </Button>
          <Button className="flex items-center gap-2" onClick={() => setIsWizardOpen(true)}>
            <Plus size={18} />
            Add New Material
          </Button>
        </div>
      </div>

      <div className="flex space-x-1 p-1 bg-muted rounded-xl w-full max-w-md">
        {(["boards", "consumables"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 text-sm font-bold rounded-lg transition-all",
              activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "boards" ? "Boards & Paper" : "Consumables"}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {activeTab === "boards" && (
            <Card className="p-8">
              <div className="flex items-center gap-2 mb-8 border-b border-border pb-4">
                <Layers className="text-primary" size={24} />
                <h2 className="text-xl font-bold">Paper & Board Stocks</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-12">
                {boards.map(item => (
                  <StackVisual
                    key={item.id}
                    item={item}
                    isSelected={selectedMaterialId === item.id}
                    onClick={() => setSelectedMaterialId(selectedMaterialId === item.id ? null : item.id)}
                  />
                ))}
                {boards.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-10">No boards or paper in inventory.</p>
                )}
              </div>
            </Card>
          )}

          {activeTab === "consumables" && (
            <Card className="p-8">
              <div className="flex items-center gap-2 mb-8 border-b border-border pb-4">
                <Package className="text-primary" size={24} />
                <h2 className="text-xl font-bold">Consumables (Inks, Glues, Plates)</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-12">
                {consumables.map(item => (
                  <CylinderVisual
                    key={item.id}
                    item={item}
                    vendorName={vendorMap.get(item.id)}
                    isSelected={selectedMaterialId === item.id}
                    onClick={() => setSelectedMaterialId(selectedMaterialId === item.id ? null : item.id)}
                  />
                ))}
                {consumables.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-10">No consumables in inventory.</p>
                )}
              </div>
            </Card>
          )}
        </div>

        {selectedMaterialId && selectedMaterial && (
          <MaterialDetailPanel
            materialId={selectedMaterialId}
            material={selectedMaterial}
            onClose={() => setSelectedMaterialId(null)}
          />
        )}
      </div>

      <AddStockWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
      <InwardStockWizard isOpen={isInwardOpen} onClose={() => setIsInwardOpen(false)} />
    </div>
  );
}

// ─── 2-Step Inward Stock Wizard ─────────────────────────────────────────────

type InwardFilter = "all" | "board" | "ink" | "coating" | "glue";

interface InwardForm {
  materialId: string;
  vendorId: string;
  newVendorName: string;
  newVendorPhone: string;
  showNewVendor: boolean;
  brand: string;
  qtyKg: string;
  ratePerKg: string;
  batchRef: string;
  receivedDate: string;
  notes: string;
  showMore: boolean;
}

const defaultInward: InwardForm = {
  materialId: "",
  vendorId: "",
  newVendorName: "",
  newVendorPhone: "",
  showNewVendor: false,
  brand: "",
  qtyKg: "",
  ratePerKg: "",
  batchRef: "",
  receivedDate: new Date().toISOString().split("T")[0],
  notes: "",
  showMore: false,
};

function InwardStockWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: vendors } = useVendors();
  const createInward = useCreateStockInward();
  const createVendor = useCreateVendor();

  const [step, setStep] = useState<1 | 2>(1);
  const [filter, setFilter] = useState<InwardFilter>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<InwardForm>({ ...defaultInward });

  const handleClose = () => {
    setStep(1);
    setFilter("all");
    setSearch("");
    setForm({ ...defaultInward });
    onClose();
  };

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    return materials.filter(m => {
      const nameMatch = !search || m.materialName.toLowerCase().includes(search.toLowerCase());
      if (!nameMatch) return false;
      if (filter === "all") return true;
      if (filter === "board") return m.materialType === "board" || m.materialType === "paper";
      const sub = (m.subType ?? "").toLowerCase();
      if (filter === "ink") return sub.includes("ink");
      if (filter === "coating") return sub.includes("varnish") || sub.includes("aqueous") || sub.includes("coating");
      if (filter === "glue") return sub.includes("gum") || sub.includes("adhesive") || sub.includes("glue") || sub.includes("lubricant");
      return true;
    });
  }, [materials, filter, search]);

  const selectedMaterial = materials?.find(m => m.id === parseInt(form.materialId));
  const isBoard = selectedMaterial?.materialType === "board" || selectedMaterial?.materialType === "paper";

  const parsedDim = parseDim(selectedMaterial?.dimensions);
  const matGsm = selectedMaterial?.gsm;
  let sheetWeightKg: number | null = null;
  let ratePerSheet: number | null = null;

  if (isBoard && parsedDim && matGsm) {
    const lCm = dimToCm(parsedDim.w, parsedDim.unit as DimUnitStr);
    const bCm = dimToCm(parsedDim.h, parsedDim.unit as DimUnitStr);
    sheetWeightKg = (lCm * bCm * matGsm) / 10_000_000;
    const rKg = parseFloat(form.ratePerKg);
    if (!isNaN(rKg) && rKg > 0 && sheetWeightKg) {
      ratePerSheet = sheetWeightKg * rKg;
    }
  }

  const qtyNum = parseFloat(form.qtyKg) || 0;
  const rateNum = parseFloat(form.ratePerKg) || 0;
  const sheetsFromQty = sheetWeightKg && sheetWeightKg > 0 && qtyNum > 0
    ? Math.round(qtyNum / sheetWeightKg)
    : null;
  const totalValue = qtyNum > 0 && rateNum > 0 ? qtyNum * rateNum : null;

  const currentSheets = selectedMaterial && (selectedMaterial.unit === "sheets")
    ? parseFloat(String(selectedMaterial.currentQty)) : null;
  const newSheets = currentSheets !== null && sheetsFromQty !== null
    ? currentSheets + sheetsFromQty : null;

  const currentKg = selectedMaterial && sheetWeightKg
    ? (selectedMaterial.unit === "sheets"
        ? parseFloat(String(selectedMaterial.currentQty)) * sheetWeightKg
        : parseFloat(String(selectedMaterial.currentQty)))
    : null;
  const newKg = currentKg !== null && qtyNum > 0 ? currentKg + qtyNum : null;

  const handleSubmit = async () => {
    if (!form.materialId || !form.qtyKg) return;

    let vendorIdToUse: number | undefined;
    if (form.showNewVendor && form.newVendorName.trim()) {
      try {
        const newV = await createVendor.mutateAsync({
          data: { vendorName: form.newVendorName.trim(), contactPerson: "", phone: form.newVendorPhone, city: "" },
        });
        vendorIdToUse = newV.id;
      } catch {
        toast.error("Failed to create vendor");
        return;
      }
    } else if (form.vendorId) {
      vendorIdToUse = parseInt(form.vendorId);
    }

    const unit = isBoard ? "kg" : (selectedMaterial?.unit ?? "kg");

    createInward.mutate({
      data: {
        materialId: parseInt(form.materialId),
        vendorId: vendorIdToUse,
        qtyReceived: parseFloat(form.qtyKg),
        ratePerUnit: rateNum > 0 ? rateNum : undefined,
        unit,
        batchRef: form.batchRef || "",
        brand: form.brand || undefined,
        receivedDate: form.receivedDate,
        notes: form.notes || undefined,
      },
    }, {
      onSuccess: () => {
        toast.success(`Stock recorded for ${selectedMaterial?.materialName ?? "material"}`);
        handleClose();
      },
      onError: () => toast.error("Failed to record inward stock"),
    });
  };

  const handleSaveAndAnother = async () => {
    if (!form.materialId || !form.qtyKg) return;
    const prevVendorId = form.vendorId;
    await handleSubmit();
    setTimeout(() => {
      setStep(1);
      setForm({ ...defaultInward, vendorId: prevVendorId });
    }, 100);
  };

  const filterChips: { value: InwardFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "board", label: "Paper & Board" },
    { value: "ink", label: "Inks" },
    { value: "coating", label: "Coatings" },
    { value: "glue", label: "Glue & Other" },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Inward Stock">
      <div className="space-y-5">

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {([1, 2] as const).map((s, i) => (
            <React.Fragment key={s}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                s < step ? "bg-emerald-500 text-white" :
                s === step ? "bg-primary text-white" :
                "bg-muted text-muted-foreground"
              )}>
                {s < step ? <Check size={12} /> : s}
              </div>
              <span className={cn(
                "text-sm font-medium transition-colors",
                s === step ? "text-foreground" : "text-muted-foreground"
              )}>
                {s === 1 ? "What arrived?" : "From whom & how much?"}
              </span>
              {i < 1 && <div className={cn("flex-1 h-0.5 mx-1 transition-all", step > 1 ? "bg-emerald-500" : "bg-muted")} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: What arrived? ── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search materials…"
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2">
              {filterChips.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setFilter(c.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                    filter === c.value
                      ? "bg-primary text-white border-primary"
                      : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Material list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredMaterials.map(m => {
                const du = dualUnits(m as unknown as StockSummaryRow);
                const isLow = parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty));
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, materialId: String(m.id) }))}
                    className={cn(
                      "w-full p-3 rounded-lg border-2 text-left transition-all",
                      form.materialId === String(m.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{m.materialName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {du.kg !== null
                            ? <>{du.sheets?.toLocaleString("en-IN")} sheets · {fmtKg(du.kg)}</>
                            : <>{m.currentQty} {m.unit}</>
                          }
                          {isLow && <span className="ml-2 text-rose-500 font-semibold">⚠ Low</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end shrink-0">
                        {m.gsm && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{m.gsm} GSM</span>}
                        {m.dimensions && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{formatDim(m.dimensions) ?? m.dimensions}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredMaterials.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">No materials match.</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => { onClose(); }}
              className="text-xs text-primary hover:underline"
            >
              + Add a new material instead
            </button>
          </div>
        )}

        {/* ── STEP 2: From whom & how much? ── */}
        {step === 2 && selectedMaterial && (
          <div className="space-y-4">
            {/* Selected material summary */}
            <div className="bg-muted/40 rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-sm">{selectedMaterial.materialName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(() => {
                      const du = dualUnits(selectedMaterial as unknown as StockSummaryRow);
                      if (du.kg !== null) return `Current: ${du.sheets?.toLocaleString("en-IN")} sheets · ${fmtKg(du.kg)}`;
                      return `Current: ${selectedMaterial.currentQty} ${selectedMaterial.unit}`;
                    })()}
                  </p>
                </div>
                <button type="button" onClick={() => setStep(1)} className="text-xs text-primary hover:underline">Change</button>
              </div>
            </div>

            {/* Vendor */}
            <div>
              <Label className="mb-1 block">Vendor / Supplier</Label>
              {!form.showNewVendor ? (
                <div className="flex items-center gap-2">
                  <Select
                    value={form.vendorId}
                    onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}
                    className="flex-1"
                  >
                    <option value="">— Optional —</option>
                    {vendors?.map((v: { id: number; vendorName: string; city: string }) => (
                      <option key={v.id} value={v.id}>{v.vendorName}{v.city ? ` (${v.city})` : ""}</option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, showNewVendor: true, vendorId: "" }))}
                    className="text-sm text-primary font-semibold hover:underline whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              ) : (
                <div className="space-y-2 bg-muted/50 p-3 rounded-xl">
                  <Input
                    value={form.newVendorName}
                    onChange={e => setForm(f => ({ ...f, newVendorName: e.target.value }))}
                    placeholder="Vendor name"
                  />
                  <Input
                    value={form.newVendorPhone}
                    onChange={e => setForm(f => ({ ...f, newVendorPhone: e.target.value }))}
                    placeholder="Phone (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, showNewVendor: false, newVendorName: "", newVendorPhone: "" }))}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel — use existing
                  </button>
                </div>
              )}
            </div>

            {/* Brand */}
            <div className="space-y-1.5">
              <Label>Brand / Mill</Label>
              <Input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder={isBoard ? "e.g. JK Paper, ITC, Seshasayee" : "e.g. Huber, Siegwerk"}
              />
            </div>

            {/* Qty + Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>
                  Qty Received{" "}
                  <span className="text-muted-foreground font-normal">({isBoard ? "kg" : selectedMaterial.unit})</span>{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.qtyKg}
                    onChange={e => setForm(f => ({ ...f, qtyKg: e.target.value }))}
                    placeholder={isBoard ? "e.g. 500" : "e.g. 10"}
                    className="pr-12"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {isBoard ? "kg" : selectedMaterial.unit}
                  </span>
                </div>
                {sheetsFromQty !== null && (
                  <p className="text-xs text-muted-foreground">≈ {sheetsFromQty.toLocaleString("en-IN")} sheets</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Rate per {isBoard ? "kg" : selectedMaterial.unit} (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.ratePerKg}
                    onChange={e => setForm(f => ({ ...f, ratePerKg: e.target.value }))}
                    placeholder="e.g. 85.00"
                    className="pl-7"
                  />
                </div>
                {ratePerSheet !== null && (
                  <p className="text-xs text-muted-foreground">₹{ratePerSheet.toFixed(4)}/sheet</p>
                )}
              </div>
            </div>

            {/* Live preview */}
            {(totalValue !== null || newSheets !== null) && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-1">
                {totalValue !== null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">Invoice total</span>
                    <span className="font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                      <IndianRupee size={13} />
                      {totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {newSheets !== null && newKg !== null && (
                  <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-500">
                    <span>New stock after this delivery</span>
                    <span className="font-semibold">{newSheets.toLocaleString("en-IN")} sh · {fmtKg(newKg)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Show more toggle */}
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, showMore: !f.showMore }))}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {form.showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {form.showMore ? "Hide" : "Show"} batch & date details
            </button>

            {form.showMore && (
              <div className="space-y-3 bg-muted/30 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Batch / Invoice Ref</Label>
                    <Input
                      value={form.batchRef}
                      onChange={e => setForm(f => ({ ...f, batchRef: e.target.value }))}
                      placeholder="e.g. INV-2024-001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date Received</Label>
                    <Input
                      type="date"
                      value={form.receivedDate}
                      onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    rows={2}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any notes about this delivery…"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep(1)}
            className="flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          <div className="flex gap-2">
            {step === 1 && (
              <Button
                onClick={() => setStep(2)}
                disabled={!form.materialId}
              >
                Next →
              </Button>
            )}
            {step === 2 && (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveAndAnother}
                  disabled={!form.qtyKg || parseFloat(form.qtyKg) <= 0 || createInward.isPending}
                >
                  Save & Add Another
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!form.qtyKg || parseFloat(form.qtyKg) <= 0 || createInward.isPending}
                  isLoading={createInward.isPending}
                >
                  Record Stock
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Material Detail Panel ─────────────────────────────────────────────────

function MaterialDetailPanel({ materialId, material, onClose }: {
  materialId: number;
  material: StockSummaryRow;
  onClose: () => void;
}) {
  const { data: vendorsForMat, isLoading: loadingVendors } = useMaterialVendors(materialId);
  const { data: history, isLoading: loadingHistory } = useMaterialInwardHistory(materialId);
  const recentHistory = history?.slice(-5).reverse() ?? [];
  const du = dualUnits(material);

  return (
    <div className="w-80 shrink-0">
      <Card className="p-5 sticky top-0">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold text-base leading-tight pr-2">{material.materialName}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Current Stock</p>
            {du.kg !== null ? (
              <>
                <p className="text-base font-black">{du.sheets?.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground">sheets</p>
                <p className="text-xs font-semibold text-muted-foreground mt-0.5">{fmtKg(du.kg)}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-black">{material.currentQty}</p>
                <p className="text-xs text-muted-foreground">{material.unit}</p>
              </>
            )}
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Reorder Level</p>
            <p className="text-lg font-black">{material.minReorderQty}</p>
            <p className="text-xs text-muted-foreground">{material.unit}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {material.gsm && <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold">{material.gsm} GSM</span>}
          {material.dimensions && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{formatDim(material.dimensions) ?? material.dimensions}</span>}
          {material.grain && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs capitalize">{material.grain} grain</span>}
          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{material.materialType}</span>
          {(material as unknown as Record<string, unknown>)["oldestBatchDays"] != null && (() => {
            const days = (material as unknown as Record<string, unknown>)["oldestBatchDays"] as number;
            return (
              <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", batchAgeColor(days))}>
                {days}d old
              </span>
            );
          })()}
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-xs mb-1 font-medium">
            <span className="text-muted-foreground">Stock Level</span>
            <span>{material.stockPct?.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all",
                material.stockPct < 30 ? "bg-rose-500" :
                material.stockPct < 60 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${material.stockPct}%` }}
            />
          </div>
          {material.isLowStock && (
            <p className="text-xs text-rose-500 font-semibold mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Below reorder level
            </p>
          )}
        </div>

        <div className="mb-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Vendors</h4>
          {loadingVendors ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : vendorsForMat?.length === 0 ? (
            <p className="text-xs text-muted-foreground">No vendors linked</p>
          ) : (
            <div className="space-y-1.5">
              {vendorsForMat?.map((v: { id: number; vendorName: string; city: string }) => (
                <div key={v.id} className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="font-medium">{v.vendorName}</span>
                  {v.city && <span className="text-muted-foreground text-xs">({v.city})</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {history && history.length > 0 && (() => {
          const brandMap = new Map<string, { qty: number; unit: string }>();
          for (const h of history) {
            const brand = h.brand || "Unbranded";
            const existing = brandMap.get(brand);
            const qty = parseFloat(String(h.qtyReceived)) || 0;
            if (existing) { existing.qty += qty; }
            else { brandMap.set(brand, { qty, unit: h.unit }); }
          }
          const brands = Array.from(brandMap.entries())
            .map(([brand, data]) => ({ brand, ...data }))
            .sort((a, b) => b.qty - a.qty);
          return brands.length > 1 ? (
            <div className="mb-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">By Brand / Mill</h4>
              <div className="space-y-1.5">
                {brands.map(b => (
                  <div key={b.brand} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold text-foreground">{b.brand}</span>
                    <span className="text-muted-foreground font-medium">{b.qty.toLocaleString("en-IN")} {b.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Inward</h4>
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : recentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inward records yet</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((h: { id: number; qtyReceived: number | string; unit: string; receivedDate?: string; vendorName?: string; brand?: string; batchRef?: string }) => (
                <div key={h.id} className="bg-muted/40 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-foreground">+{h.qtyReceived} {h.unit}</span>
                    <span className="text-muted-foreground">
                      {h.receivedDate ? format(new Date(h.receivedDate), "dd MMM yy") : "—"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{h.vendorName || "Unknown vendor"}</p>
                  {h.brand && <p className="text-primary font-semibold">{h.brand}</p>}
                  {h.batchRef && <p className="text-muted-foreground">Ref: {h.batchRef}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Visuals ────────────────────────────────────────────────────────────────

function StackVisual({ item, isSelected, onClick }: { item: StockSummaryRow; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  const fillColor = item.stockPct < 30 ? "bg-rose-500" : item.stockPct < 60 ? "bg-amber-500" : "bg-emerald-500";
  const du = dualUnits(item);
  const oldestDays = (item as unknown as Record<string, unknown>)["oldestBatchDays"] as number | null | undefined;

  return (
    <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
      <div className={cn(
        "w-24 h-48 bg-muted rounded-md overflow-hidden flex flex-col justify-end relative shadow-inner border-2 transition-all",
        item.isLowStock
          ? "border-rose-500 shadow-[0_0_0_2px_rgba(239,68,68,0.25)]"
          : isSelected
            ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]"
            : "border-border group-hover:border-primary"
      )}>
        <div className={cn("w-full opacity-90 transition-all duration-1000 ease-out", fillColor)} style={{ height: `${fillPct}%` }} />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSI0Ij48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMSIgZmlsbD0icmdiYSgwLDAsMCwwLjEpIi8+PC9zdmc+')] opacity-50" />
        {item.isLowStock && (
          <div className="absolute top-2 right-2 text-rose-500 bg-white dark:bg-background rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
        {isSelected && !item.isLowStock && <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-primary" />}
        {oldestDays != null && (
          <div className={cn("absolute bottom-1 left-1 right-1 rounded text-center text-[9px] font-bold py-0.5", batchAgeColor(oldestDays))}>
            {oldestDays}d
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.gsm ? `${item.gsm} GSM` : item.subType}</p>
        {du.kg !== null ? (
          <div className="mt-2 space-y-0.5">
            <Badge className="bg-background border-border text-foreground text-xs">
              {du.sheets?.toLocaleString("en-IN")} sh
            </Badge>
            <p className="text-[10px] text-muted-foreground font-medium">{fmtKg(du.kg)}</p>
          </div>
        ) : (
          <Badge className="mt-2 bg-background border-border text-foreground">{item.currentQty} {item.unit}</Badge>
        )}
      </div>
    </div>
  );
}

function CylinderVisual({ item, vendorName, isSelected, onClick }: { item: StockSummaryRow; vendorName?: string; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  const colorClass = item.stockPct < 30 ? "from-rose-400 to-rose-600" : item.stockPct < 60 ? "from-amber-400 to-amber-600" : "from-emerald-400 to-emerald-600";
  const oldestDays = (item as unknown as Record<string, unknown>)["oldestBatchDays"] as number | null | undefined;

  return (
    <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
      <div className={cn(
        "w-20 h-32 bg-muted rounded-[50%_50%_50%_50%/10%_10%_10%_10%] relative overflow-hidden border-2 shadow-inner transition-all",
        item.isLowStock
          ? "border-rose-500 shadow-[0_0_0_2px_rgba(239,68,68,0.25)]"
          : isSelected
            ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]"
            : "border-border group-hover:border-primary"
      )}>
        <div className={cn("absolute bottom-0 w-full bg-gradient-to-t transition-all duration-1000 ease-out", colorClass)} style={{ height: `${fillPct}%` }} />
        <div className="absolute top-0 left-2 w-2 h-full bg-white/20 blur-[2px]" />
        {item.isLowStock && (
          <div className="absolute top-2 right-1/2 translate-x-1/2 text-rose-500 bg-white dark:bg-background rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        {vendorName && (
          <p className="text-[10px] text-muted-foreground truncate px-1 mt-0.5" title={vendorName}>{vendorName}</p>
        )}
        {oldestDays != null && (
          <span className={cn("inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold", batchAgeColor(oldestDays))}>
            {oldestDays}d
          </span>
        )}
        <Badge className="mt-1 bg-background border-border text-foreground">
          {item.currentQty} {item.unit}
        </Badge>
      </div>
    </div>
  );
}
