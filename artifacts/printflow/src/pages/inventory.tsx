import React, { useState } from "react";
import { useStockSummary } from "@/hooks/use-reports";
import { useCreateStockInward, useMaterialVendors, useMaterialInwardHistory } from "@/hooks/use-inventory";
import { useVendors } from "@/hooks/use-vendors";
import { useMaterials } from "@/hooks/use-inventory";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { Package, AlertTriangle, Layers, X, Plus, ChevronLeft, ChevronRight, Check, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { StockSummaryRow } from "@workspace/api-client-react";
import { AddStockWizard } from "@/components/add-stock-wizard";

export default function Inventory() {
  const { data: stock, isLoading } = useStockSummary();
  const [activeTab, setActiveTab] = useState<"boards" | "consumables">("boards");
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isInwardOpen, setIsInwardOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  if (isLoading) return (
    <div className="flex justify-center p-12">
      <div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" />
    </div>
  );

  const boards = stock?.filter(s => s.materialType === 'board' || s.materialType === 'paper') || [];
  const consumables = stock?.filter(s => s.materialType === 'consumable') || [];
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
        <button
          onClick={() => setActiveTab("boards")}
          className={cn(
            "flex-1 py-2.5 text-sm font-bold rounded-lg transition-all",
            activeTab === "boards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Boards & Paper
        </button>
        <button
          onClick={() => setActiveTab("consumables")}
          className={cn(
            "flex-1 py-2.5 text-sm font-bold rounded-lg transition-all",
            activeTab === "consumables" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Consumables
        </button>
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

// ─── Inward Stock Wizard ───────────────────────────────────────────────────

type InwardForm = {
  category: 'board' | 'consumable' | '';
  materialId: string;
  vendorId: string;
  qtyReceived: string;
  ratePerUnit: string;
  batchRef: string;
  brand: string;
  receivedDate: string;
  notes: string;
};

const defaultInwardForm: InwardForm = {
  category: '',
  materialId: '',
  vendorId: '',
  qtyReceived: '',
  ratePerUnit: '',
  batchRef: '',
  brand: '',
  receivedDate: new Date().toISOString().split('T')[0],
  notes: '',
};

function InwardStockWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: vendors } = useVendors();
  const createInward = useCreateStockInward();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InwardForm>(defaultInwardForm);

  const totalSteps = 4;

  const handleClose = () => {
    setStep(1);
    setForm(defaultInwardForm);
    onClose();
  };

  const boardMats = materials?.filter(m => m.materialType === 'board' || m.materialType === 'paper') ?? [];
  const consumableMats = materials?.filter(m => m.materialType === 'consumable') ?? [];
  const filteredMats = form.category === 'board' ? boardMats : consumableMats;
  const selectedMaterial = materials?.find(m => m.id === parseInt(form.materialId));
  const linkedVendors = vendors ?? [];

  const canNext = () => {
    if (step === 1) return !!form.category;
    if (step === 2) return !!form.materialId;
    if (step === 3) return true; // vendor optional
    if (step === 4) return !!form.qtyReceived && parseFloat(form.qtyReceived) > 0;
    return false;
  };

  const handleSubmit = () => {
    if (!form.materialId || !form.qtyReceived) return;
    createInward.mutate({
      data: {
        materialId: parseInt(form.materialId),
        vendorId: form.vendorId ? parseInt(form.vendorId) : undefined,
        qtyReceived: parseFloat(form.qtyReceived),
        ratePerUnit: form.ratePerUnit ? parseFloat(form.ratePerUnit) : undefined,
        unit: selectedMaterial?.unit ?? 'units',
        batchRef: form.batchRef || '',
        brand: form.brand || undefined,
        receivedDate: form.receivedDate,
        notes: form.notes || undefined,
      } as any
    }, {
      onSuccess: () => handleClose(),
    });
  };

  const totalValue = form.qtyReceived && form.ratePerUnit
    ? (parseFloat(form.qtyReceived) * parseFloat(form.ratePerUnit)).toLocaleString('en-IN', { maximumFractionDigits: 2 })
    : null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Inward Stock">
      <div className="space-y-6">

        {/* Step indicator */}
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                i + 1 < step ? "bg-emerald-500 text-white" :
                i + 1 === step ? "bg-primary text-white" :
                "bg-muted text-muted-foreground"
              )}>
                {i + 1 < step ? <Check size={12} /> : i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className={cn("h-0.5 flex-1 transition-all", i + 1 < step ? "bg-emerald-500" : "bg-muted")} />
              )}
            </div>
          ))}
        </div>

        {/* Step labels */}
        <div className="flex justify-between text-xs text-muted-foreground font-medium px-0.5">
          <span>Category</span>
          <span>Material</span>
          <span>Vendor</span>
          <span>Qty & Rate</span>
        </div>

        {/* ── Step 1: Category ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">What type of stock arrived?</h3>
              <p className="text-sm text-muted-foreground">Select the category of material received</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setForm(f => ({ ...f, category: 'board', materialId: '' }))}
                className={cn(
                  "p-6 rounded-xl border-2 font-bold text-left transition-all space-y-2",
                  form.category === 'board'
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Layers size={28} className="mb-2" />
                <p className="text-base">Boards & Paper</p>
                <p className="text-xs font-normal text-muted-foreground">Duplex, FBB, Art Card, Maplitho etc.</p>
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, category: 'consumable', materialId: '' }))}
                className={cn(
                  "p-6 rounded-xl border-2 font-bold text-left transition-all space-y-2",
                  form.category === 'consumable'
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50"
                )}
              >
                <Package size={28} className="mb-2" />
                <p className="text-base">Consumables</p>
                <p className="text-xs font-normal text-muted-foreground">Inks, varnish, adhesives, chemicals etc.</p>
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Material ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Which material arrived?</h3>
              <p className="text-sm text-muted-foreground">
                {form.category === 'board' ? 'Boards & Paper' : 'Consumables'} · {filteredMats.length} materials
              </p>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {filteredMats.map(m => (
                <button
                  key={m.id}
                  onClick={() => setForm(f => ({ ...f, materialId: String(m.id) }))}
                  className={cn(
                    "w-full p-3 rounded-lg border-2 text-left transition-all",
                    form.materialId === String(m.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{m.materialName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current stock: {m.currentQty} {m.unit}
                        {parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty)) && (
                          <span className="ml-2 text-rose-500 font-medium">⚠ Low stock</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {m.gsm && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{m.gsm} GSM</span>}
                      {m.dimensions && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{m.dimensions}"</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Vendor ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Who supplied this delivery?</h3>
              <p className="text-sm text-muted-foreground">Select vendor — optional but recommended for costing</p>
            </div>

            {/* Selected material summary */}
            <div className="bg-muted/40 rounded-lg p-3 text-sm">
              <p className="font-semibold">{selectedMaterial?.materialName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Current stock: {selectedMaterial?.currentQty} {selectedMaterial?.unit}
              </p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {/* No vendor option */}
              <button
                onClick={() => setForm(f => ({ ...f, vendorId: '' }))}
                className={cn(
                  "w-full p-3 rounded-lg border-2 text-left transition-all",
                  form.vendorId === ''
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <p className="font-semibold text-sm text-muted-foreground">— Skip / Unknown vendor —</p>
              </button>

              {linkedVendors.map(v => (
                <button
                  key={v.id}
                  onClick={() => setForm(f => ({ ...f, vendorId: String(v.id) }))}
                  className={cn(
                    "w-full p-3 rounded-lg border-2 text-left transition-all",
                    form.vendorId === String(v.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                      {v.vendorName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{v.vendorName}</p>
                      <p className="text-xs text-muted-foreground">
                        {[v.contactPerson, v.city].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 4: Qty, Rate, Details ── */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Quantity & Rate</h3>
              <p className="text-sm text-muted-foreground">Enter delivery details</p>
            </div>

            {/* Summary card */}
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-0.5">
              <p className="font-bold">{selectedMaterial?.materialName}</p>
              <p className="text-muted-foreground text-xs">
                {vendors?.find(v => v.id === parseInt(form.vendorId))?.vendorName || 'No vendor'} · Current: {selectedMaterial?.currentQty} {selectedMaterial?.unit}
              </p>
            </div>

            {/* Qty + Rate — most important fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Qty Received <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={`e.g. 500`}
                    value={form.qtyReceived}
                    onChange={e => setForm(f => ({ ...f, qtyReceived: e.target.value }))}
                    className="pr-14"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                    {selectedMaterial?.unit}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rate per {selectedMaterial?.unit ?? 'unit'} (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 12.50"
                    value={form.ratePerUnit}
                    onChange={e => setForm(f => ({ ...f, ratePerUnit: e.target.value }))}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Updates material rate automatically</p>
              </div>
            </div>

            {/* Total value preview */}
            {totalValue && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Total Delivery Value</span>
                  <span className="font-black text-emerald-700 dark:text-emerald-400 text-base flex items-center gap-0.5">
                    <IndianRupee size={14} />
                    {totalValue}
                  </span>
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                  {form.qtyReceived} {selectedMaterial?.unit} × ₹{form.ratePerUnit}
                </p>
              </div>
            )}

            {/* Secondary fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Brand / Make</Label>
                <Input
                  placeholder="e.g. JK Paper, ITC"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Batch / Invoice Ref</Label>
                <Input
                  placeholder="e.g. INV-2024-001"
                  value={form.batchRef}
                  onChange={e => setForm(f => ({ ...f, batchRef: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Date Received <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.receivedDate}
                onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                rows={2}
                placeholder="Any notes about this delivery..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={step === 1 ? handleClose : () => setStep(s => s - 1)}
            className="flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>

          {step < totalSteps ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canNext() || createInward.isPending}
              isLoading={createInward.isPending}
            >
              Record Stock
            </Button>
          )}
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
  const { data: vendors, isLoading: loadingVendors } = useMaterialVendors(materialId);
  const { data: history, isLoading: loadingHistory } = useMaterialInwardHistory(materialId);
  const recentHistory = history?.slice(-5).reverse() ?? [];

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
            <p className="text-lg font-black">{material.currentQty}</p>
            <p className="text-xs text-muted-foreground">{material.unit}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Reorder Level</p>
            <p className="text-lg font-black">{material.minReorderQty}</p>
            <p className="text-xs text-muted-foreground">{material.unit}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {material.gsm && <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold">{material.gsm} GSM</span>}
          {material.dimensions && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{material.dimensions}"</span>}
          {material.grain && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs capitalize">{material.grain} grain</span>}
          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{material.materialType}</span>
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
          ) : vendors?.length === 0 ? (
            <p className="text-xs text-muted-foreground">No vendors linked</p>
          ) : (
            <div className="space-y-1.5">
              {vendors?.map(v => (
                <div key={v.id} className="flex items-center gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="font-medium">{v.vendorName}</span>
                  {v.city && <span className="text-muted-foreground text-xs">({v.city})</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Inward</h4>
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : recentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inward records yet</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map(h => (
                <div key={h.id} className="bg-muted/40 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-foreground">+{h.qtyReceived} {h.unit}</span>
                    <span className="text-muted-foreground">
                      {h.receivedDate ? format(new Date(h.receivedDate), "dd MMM yy") : '—'}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{h.vendorName || 'Unknown vendor'}</p>
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

// ─── Visuals ───────────────────────────────────────────────────────────────

function StackVisual({ item, isSelected, onClick }: { item: StockSummaryRow; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  const color = item.stockPct < 30 ? "bg-rose-500" : item.stockPct < 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className={cn("flex flex-col items-center group cursor-pointer")} onClick={onClick}>
      <div className={cn(
        "w-24 h-48 bg-muted rounded-md overflow-hidden flex flex-col justify-end relative shadow-inner border-2 transition-all",
        isSelected ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]" : "border-border group-hover:border-primary"
      )}>
        <div className={cn("w-full opacity-90 transition-all duration-1000 ease-out", color)} style={{ height: `${fillPct}%` }} />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSI0Ij48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMSIgZmlsbD0icmdiYSgwLDAsMCwwLjEpIi8+PC9zdmc+')] opacity-50" />
        {item.isLowStock && (
          <div className="absolute top-2 right-2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
        {isSelected && <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-primary" />}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.gsm ? `${item.gsm} GSM` : item.subType}</p>
        <Badge className="mt-2 bg-background border-border text-foreground">{item.currentQty} {item.unit}</Badge>
      </div>
    </div>
  );
}

function CylinderVisual({ item, isSelected, onClick }: { item: StockSummaryRow; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  const colorClass = item.stockPct < 30 ? "from-rose-400 to-rose-600" : item.stockPct < 60 ? "from-amber-400 to-amber-600" : "from-emerald-400 to-emerald-600";

  return (
    <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
      <div className={cn(
        "w-20 h-32 bg-muted rounded-[50%_50%_50%_50%/10%_10%_10%_10%] relative overflow-hidden border-2 shadow-inner transition-all",
        isSelected ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]" : "border-border group-hover:border-primary"
      )}>
        <div className={cn("absolute bottom-0 w-full bg-gradient-to-t transition-all duration-1000 ease-out", colorClass)} style={{ height: `${fillPct}%` }} />
        <div className="absolute top-0 left-2 w-2 h-full bg-white/20 blur-[2px]" />
        {item.isLowStock && (
          <div className="absolute top-2 right-1/2 translate-x-1/2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <Badge className="mt-2 bg-background border-border text-foreground">{item.currentQty} {item.unit}</Badge>
      </div>
    </div>
  );
}
```

---

**Commit message:**
```
feat: inward stock wizard with category/material/vendor/rate steps + ghost cleanup
```

Then in Replit Shell:
```
git pull
