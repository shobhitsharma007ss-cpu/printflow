import React, { useState } from "react";
import { useStockSummary } from "@/hooks/use-reports";
import { useCreateStockInward, useMaterialVendors, useMaterialInwardHistory } from "@/hooks/use-inventory";
import { useVendors } from "@/hooks/use-vendors";
import { useMaterials } from "@/hooks/use-inventory";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { Package, AlertTriangle, Layers, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function Inventory() {
  const { data: stock, isLoading } = useStockSummary();
  const [activeTab, setActiveTab] = useState<"boards" | "consumables">("boards");
  const [isInwardOpen, setIsInwardOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;

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
        <Button className="flex items-center gap-2" onClick={() => setIsInwardOpen(true)}>
          <Package size={18} />
          Record Inward Stock
        </Button>
      </div>

      {/* Tabs */}
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
        {/* Main grid */}
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
                {boards.length === 0 && <p className="col-span-full text-center text-muted-foreground py-10">No boards or paper in inventory.</p>}
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
                {consumables.length === 0 && <p className="col-span-full text-center text-muted-foreground py-10">No consumables in inventory.</p>}
              </div>
            </Card>
          )}
        </div>

        {/* Side panel */}
        {selectedMaterialId && selectedMaterial && (
          <MaterialDetailPanel
            materialId={selectedMaterialId}
            material={selectedMaterial}
            onClose={() => setSelectedMaterialId(null)}
          />
        )}
      </div>

      {/* Record Inward Stock Modal */}
      <InwardStockModal isOpen={isInwardOpen} onClose={() => setIsInwardOpen(false)} />
    </div>
  );
}

function MaterialDetailPanel({ materialId, material, onClose }: {
  materialId: number;
  material: any;
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

        {/* Stock level */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Current Stock</p>
            <p className="text-lg font-black text-foreground">{material.currentQty}</p>
            <p className="text-xs text-muted-foreground">{material.unit}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Reorder Level</p>
            <p className="text-lg font-black text-foreground">{material.minReorderQty}</p>
            <p className="text-xs text-muted-foreground">{material.unit}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {material.gsm && (
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold">{material.gsm} GSM</span>
          )}
          {(material as any).dimensions && (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{(material as any).dimensions}&quot;</span>
          )}
          {(material as any).grain && (
            <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs capitalize">{(material as any).grain} grain</span>
          )}
          <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">{material.materialType}</span>
        </div>

        {/* Stock bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs mb-1 font-medium">
            <span className="text-muted-foreground">Stock Level</span>
            <span>{material.stockPct?.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", material.stockPct < 30 ? "bg-rose-500" : material.stockPct < 60 ? "bg-amber-500" : "bg-emerald-500")}
              style={{ width: `${material.stockPct}%` }}
            />
          </div>
          {material.isLowStock && (
            <p className="text-xs text-rose-500 font-semibold mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Below reorder level
            </p>
          )}
        </div>

        {/* Vendors */}
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

        {/* Last 5 inward entries */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Inward</h4>
          {loadingHistory ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : recentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inward records yet</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((h: any) => (
                <div key={h.id} className="bg-muted/40 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-foreground">+{h.qtyReceived} {h.unit}</span>
                    <span className="text-muted-foreground">{h.receivedDate ? format(new Date(h.receivedDate), "dd MMM yy") : '—'}</span>
                  </div>
                  <p className="text-muted-foreground">{h.vendorName || 'Unknown vendor'}</p>
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

function InwardStockModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: vendors } = useVendors();
  const createInward = useCreateStockInward();

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    materialId: '',
    vendorId: '',
    qtyReceived: '',
    batchRef: '',
    receivedDate: today,
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialId || !form.qtyReceived) return;

    const selectedMaterial = materials?.find(m => m.id === parseInt(form.materialId));

    createInward.mutate({
      data: {
        materialId: parseInt(form.materialId),
        vendorId: form.vendorId ? parseInt(form.vendorId) : 0,
        qtyReceived: parseFloat(form.qtyReceived) || 0,
        unit: selectedMaterial?.unit ?? 'units',
        batchRef: form.batchRef || '',
        receivedDate: form.receivedDate,
        notes: form.notes || undefined,
      }
    }, {
      onSuccess: () => {
        onClose();
        setForm({ materialId: '', vendorId: '', qtyReceived: '', batchRef: '', receivedDate: today, notes: '' });
      }
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ materialId: '', vendorId: '', qtyReceived: '', batchRef: '', receivedDate: today, notes: '' });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Inward Stock">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Material <span className="text-destructive">*</span></Label>
          <Select
            required
            value={form.materialId}
            onChange={e => setForm({ ...form, materialId: e.target.value })}
          >
            <option value="">— Select Material —</option>
            {materials?.map(m => (
              <option key={m.id} value={m.id}>
                {m.materialName} {m.gsm ? `(${m.gsm}gsm)` : ''} [{m.unit}]
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <Select value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })}>
            <option value="">— Select Vendor —</option>
            {vendors?.map(v => (
              <option key={v.id} value={v.id}>{v.vendorName} ({v.city})</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Quantity Received <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="e.g. 500"
              value={form.qtyReceived}
              onChange={e => setForm({ ...form, qtyReceived: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Batch Reference</Label>
            <Input
              placeholder="e.g. BATCH-001"
              value={form.batchRef}
              onChange={e => setForm({ ...form, batchRef: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Date Received <span className="text-destructive">*</span></Label>
          <Input
            type="date"
            required
            value={form.receivedDate}
            onChange={e => setForm({ ...form, receivedDate: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-none"
            rows={2}
            placeholder="Any notes about this delivery..."
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {/* Preview: current → new qty */}
        {form.materialId && form.qtyReceived && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm">
            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
              Stock will increase by <strong>{form.qtyReceived}</strong> {materials?.find(m => m.id === parseInt(form.materialId))?.unit}
            </p>
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={createInward.isPending}>Record Stock</Button>
        </div>
      </form>
    </Modal>
  );
}

function StackVisual({ item, isSelected, onClick }: { item: any; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  let color = "bg-emerald-500";
  if (item.stockPct < 30) color = "bg-rose-500";
  else if (item.stockPct < 60) color = "bg-amber-500";

  return (
    <div
      className={cn("flex flex-col items-center group cursor-pointer", isSelected && "opacity-100")}
      onClick={onClick}
    >
      <div className={cn(
        "w-24 h-48 bg-muted rounded-md overflow-hidden flex flex-col justify-end relative shadow-inner border-2 transition-all",
        isSelected ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]" : "border-border group-hover:border-primary"
      )}>
        <div
          className={cn("w-full opacity-90 transition-all duration-1000 ease-out", color)}
          style={{ height: `${fillPct}%` }}
        />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSI0Ij48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMSIgZmlsbD0icmdiYSgwLDAsMCwwLjEpIi8+PC9zdmc+')] opacity-50" />
        {item.isLowStock && (
          <div className="absolute top-2 right-2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
        {isSelected && (
          <div className="absolute top-2 left-2 w-3 h-3 rounded-full bg-primary" />
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.gsm ? `${item.gsm} GSM` : item.subType}</p>
        <Badge className="mt-2 bg-background border-border text-foreground">
          {item.currentQty} {item.unit}
        </Badge>
      </div>
    </div>
  );
}

function CylinderVisual({ item, isSelected, onClick }: { item: any; isSelected: boolean; onClick: () => void }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  let colorClass = "from-emerald-400 to-emerald-600";
  if (item.stockPct < 30) colorClass = "from-rose-400 to-rose-600";
  else if (item.stockPct < 60) colorClass = "from-amber-400 to-amber-600";

  return (
    <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
      <div className={cn(
        "w-20 h-32 bg-muted rounded-[50%_50%_50%_50%/10%_10%_10%_10%] relative overflow-hidden border-2 shadow-inner transition-all",
        isSelected ? "border-primary shadow-[0_0_0_3px_rgba(59,130,246,0.3)]" : "border-border group-hover:border-primary"
      )}>
        <div
          className={cn("absolute bottom-0 w-full bg-gradient-to-t transition-all duration-1000 ease-out", colorClass)}
          style={{ height: `${fillPct}%` }}
        />
        <div className="absolute top-0 left-2 w-2 h-full bg-white/20 blur-[2px]" />
        {item.isLowStock && (
          <div className="absolute top-2 right-1/2 translate-x-1/2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <Badge className="mt-2 bg-background border-border text-foreground">
          {item.currentQty} {item.unit}
        </Badge>
      </div>
    </div>
  );
}
