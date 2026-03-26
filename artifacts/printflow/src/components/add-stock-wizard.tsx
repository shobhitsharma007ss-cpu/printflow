import React, { useState, useCallback } from "react";
import { Button, Input, Label, Modal, Select } from "@/components/ui-elements";
import { useCreateMaterial, useAddMaterialVendor } from "@/hooks/use-inventory";
import { useVendors, useCreateVendor } from "@/hooks/use-vendors";
import { Check, ChevronLeft, ChevronRight, Layers, FileText, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type WizardCategory = "board" | "paper" | "consumable" | "";
type PaperType = "grey-back" | "white-back" | "fbb" | "sbs" | "art-card" | "maplitho" | "non-woven" | "other" | "";
type ConsumableType = "cyan-ink" | "magenta-ink" | "yellow-ink" | "black-ink" | "uv-ink" | "led-uv-ink" | "varnish" | "aqueous-coating" | "gum" | "lubricant" | "other" | "";

const PAPER_TYPE_LABELS: Record<string, string> = {
  "grey-back": "Grey Back Duplex",
  "white-back": "White Back Duplex",
  "fbb": "FBB Board",
  "sbs": "SBS Board",
  "art-card": "Art Card",
  "maplitho": "Maplitho",
  "non-woven": "Non Woven",
  "other": "Other",
};

const CONSUMABLE_LABELS: Record<string, string> = {
  "cyan-ink": "Cyan Ink",
  "magenta-ink": "Magenta Ink",
  "yellow-ink": "Yellow Ink",
  "black-ink": "Black Ink (K)",
  "uv-ink": "UV Ink",
  "led-uv-ink": "LED UV Ink",
  "varnish": "Varnish",
  "aqueous-coating": "Aqueous Coating",
  "gum": "Gum/Adhesive",
  "lubricant": "Lubricant Oil",
  "other": "Other",
};

const GSM_PRESETS = [70, 90, 130, 170, 200, 250, 285, 300, 350, 400];
const DIMENSION_PRESETS = ["20×30", "23×36", "25×35", "26×38", "28×40"];

interface WizardState {
  category: WizardCategory;
  paperType: PaperType;
  consumableType: ConsumableType;
  gsm: number;
  width: string;
  height: string;
  grain: "long" | "short" | "";
  vendorId: string;
  newVendorName: string;
  newVendorPhone: string;
  showNewVendor: boolean;
  openingQty: string;
  unit: string;
  reorderLevel: string;
  notes: string;
}

const initialState: WizardState = {
  category: "",
  paperType: "",
  consumableType: "",
  gsm: 250,
  width: "",
  height: "",
  grain: "",
  vendorId: "",
  newVendorName: "",
  newVendorPhone: "",
  showNewVendor: false,
  openingQty: "",
  unit: "sheets",
  reorderLevel: "",
  notes: "",
};

function getStepsForCategory(cat: WizardCategory) {
  if (cat === "consumable") return ["Category", "Consumable Type", "Vendor", "Stock Details", "Review"];
  return ["Category", "Paper Type", "GSM", "Dimensions", "Grain", "Vendor", "Stock Details", "Review"];
}

function getMaterialName(state: WizardState): string {
  if (state.category === "consumable") {
    return CONSUMABLE_LABELS[state.consumableType] || state.consumableType;
  }
  const typeName = PAPER_TYPE_LABELS[state.paperType] || state.paperType;
  return `${typeName} ${state.gsm}gsm`;
}

function getAutoUnit(state: WizardState): string {
  if (state.category === "consumable") {
    const sub = state.consumableType;
    if (sub.includes("ink")) return "kg";
    if (["varnish", "aqueous-coating", "lubricant"].includes(sub)) return "litre";
    return "kg";
  }
  if (state.paperType === "maplitho") return "reams";
  return "sheets";
}

export function AddStockWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [state, setState] = useState<WizardState>({ ...initialState });
  const [step, setStep] = useState(0);
  const { data: vendors } = useVendors();
  const createMaterial = useCreateMaterial();
  const addVendor = useAddMaterialVendor();
  const createVendor = useCreateVendor();

  const steps = getStepsForCategory(state.category || "board");
  const totalSteps = steps.length;

  const update = useCallback((partial: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  const handleClose = () => {
    setState({ ...initialState });
    setStep(0);
    onClose();
  };

  const canProceed = (): boolean => {
    const stepName = steps[step];
    switch (stepName) {
      case "Category": return !!state.category;
      case "Paper Type": return !!state.paperType;
      case "Consumable Type": return !!state.consumableType;
      case "GSM": return state.gsm >= 50 && state.gsm <= 450;
      case "Dimensions": return true;
      case "Grain": return true;
      case "Vendor": return true;
      case "Stock Details": return !!state.openingQty && parseFloat(state.openingQty) > 0;
      case "Review": return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      if (steps[step] === "Category" && state.category === "consumable") {
        setStep(1);
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSave = async () => {
    const materialName = getMaterialName(state);
    const unit = state.unit || getAutoUnit(state);
    const dimensions = state.width && state.height ? `${state.width}x${state.height}` : undefined;

    try {
      let vendorIdToLink: number | null = null;

      if (state.showNewVendor && state.newVendorName) {
        const newV = await createVendor.mutateAsync({
          data: {
            vendorName: state.newVendorName,
            contactPerson: "",
            phone: state.newVendorPhone || "",
            city: "",
          }
        });
        vendorIdToLink = newV.id;
      } else if (state.vendorId) {
        vendorIdToLink = parseInt(state.vendorId);
      }

      const material = await createMaterial.mutateAsync({
        data: {
          materialName,
          materialType: state.category === "consumable" ? "consumable" : state.category,
          subType: state.category === "consumable" ? state.consumableType : state.paperType,
          gsm: state.category !== "consumable" ? state.gsm : undefined,
          unit: unit as any,
          currentQty: parseFloat(state.openingQty) || 0,
          minReorderQty: parseFloat(state.reorderLevel) || 0,
          dimensions: dimensions || undefined,
          grain: state.grain || undefined,
        }
      });

      if (vendorIdToLink && material?.id) {
        await addVendor.mutateAsync({
          id: material.id,
          data: { vendorId: vendorIdToLink },
        });
      }

      const vendorLabel = state.showNewVendor ? state.newVendorName :
        (state.vendorId ? vendors?.find(v => v.id === parseInt(state.vendorId))?.vendorName : "");
      toast.success(`${materialName}${vendorLabel ? ` (${vendorLabel})` : ""} added to inventory`);
      handleClose();
    } catch {
      toast.error("Failed to save material");
    }
  };

  const renderStep = () => {
    const stepName = steps[step];

    switch (stepName) {
      case "Category":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">What type of material?</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: "board" as const, label: "Board / Duplex", icon: Layers, desc: "Carton boards, duplex" },
                { value: "paper" as const, label: "Paper", icon: FileText, desc: "Maplitho, art card" },
                { value: "consumable" as const, label: "Consumable", icon: Droplets, desc: "Inks, varnish, glue" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    update({
                      category: opt.value,
                      unit: opt.value === "consumable" ? "kg" : (opt.value === "paper" ? "reams" : "sheets"),
                    });
                  }}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all min-h-[140px]",
                    state.category === opt.value
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <opt.icon size={32} className={state.category === opt.value ? "text-primary" : "text-muted-foreground"} />
                  <span className="font-bold text-sm">{opt.label}</span>
                  <span className="text-xs text-muted-foreground text-center">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case "Paper Type":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Select Paper Type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(PAPER_TYPE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => update({ paperType: value as PaperType })}
                  className={cn(
                    "p-4 rounded-xl border-2 text-sm font-semibold transition-all min-h-[60px]",
                    state.paperType === value
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        );

      case "Consumable Type":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Select Consumable Type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(CONSUMABLE_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    update({
                      consumableType: value as ConsumableType,
                      unit: getAutoUnit({ ...state, consumableType: value as ConsumableType }),
                    });
                  }}
                  className={cn(
                    "p-4 rounded-xl border-2 text-sm font-semibold transition-all min-h-[60px]",
                    state.consumableType === value
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        );

      case "GSM":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Select GSM</h3>
            <div className="flex flex-col items-center gap-4">
              <div className="text-5xl font-black text-primary">{state.gsm}</div>
              <input
                type="range"
                min={50}
                max={450}
                step={5}
                value={state.gsm}
                onChange={e => update({ gsm: parseInt(e.target.value) })}
                className="w-full h-3 rounded-full appearance-none bg-muted cursor-pointer accent-primary"
              />
              <div className="flex justify-between w-full text-xs text-muted-foreground">
                <span>50 GSM</span>
                <span>450 GSM</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {GSM_PRESETS.map(g => (
                <button
                  key={g}
                  onClick={() => update({ gsm: g })}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    state.gsm === g
                      ? "bg-primary text-white shadow-md"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        );

      case "Dimensions":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Dimensions (inches)</h3>
            <div className="flex items-center gap-3 justify-center">
              <div className="space-y-1.5 w-32">
                <Label className="text-xs text-center block">Width</Label>
                <Input
                  type="number"
                  value={state.width}
                  onChange={e => update({ width: e.target.value })}
                  placeholder="25"
                  className="text-center text-lg font-bold"
                />
              </div>
              <span className="text-2xl font-bold text-muted-foreground mt-5">×</span>
              <div className="space-y-1.5 w-32">
                <Label className="text-xs text-center block">Height</Label>
                <Input
                  type="number"
                  value={state.height}
                  onChange={e => update({ height: e.target.value })}
                  placeholder="35"
                  className="text-center text-lg font-bold"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {DIMENSION_PRESETS.map(d => {
                const [w, h] = d.split("×");
                const isActive = state.width === w && state.height === h;
                return (
                  <button
                    key={d}
                    onClick={() => update({ width: w, height: h })}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                      isActive ? "bg-primary text-white shadow-md" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "Grain":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Grain Direction</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: "long" as const, label: "Long Grain" },
                { value: "short" as const, label: "Short Grain" },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update({ grain: state.grain === opt.value ? "" : opt.value })}
                  className={cn(
                    "p-6 rounded-xl border-2 text-base font-bold transition-all",
                    state.grain === opt.value
                      ? "border-primary bg-primary/5 shadow-md text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground">Optional — skip if not applicable</p>
          </div>
        );

      case "Vendor":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Vendor / Supplier</h3>
            {!state.showNewVendor ? (
              <>
                <Select
                  value={state.vendorId}
                  onChange={e => update({ vendorId: e.target.value })}
                >
                  <option value="">— Select Vendor (optional) —</option>
                  {vendors?.map(v => (
                    <option key={v.id} value={v.id}>{v.vendorName} ({v.city})</option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => update({ showNewVendor: true, vendorId: "" })}
                  className="text-sm text-primary font-semibold hover:underline"
                >
                  + Add new vendor
                </button>
              </>
            ) : (
              <div className="space-y-4 bg-muted/50 p-4 rounded-xl">
                <div className="space-y-1.5">
                  <Label>Vendor Name</Label>
                  <Input
                    value={state.newVendorName}
                    onChange={e => update({ newVendorName: e.target.value })}
                    placeholder="e.g. Khanna Paper"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={state.newVendorPhone}
                    onChange={e => update({ newVendorPhone: e.target.value })}
                    placeholder="e.g. 9876543210"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => update({ showNewVendor: false, newVendorName: "", newVendorPhone: "" })}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Cancel — use existing vendor
                </button>
              </div>
            )}
          </div>
        );

      case "Stock Details":
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Stock Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Opening Quantity <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={state.openingQty}
                  onChange={e => update({ openingQty: e.target.value })}
                  placeholder="e.g. 500"
                  className="text-lg font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={state.unit} onChange={e => update({ unit: e.target.value })}>
                  <option value="sheets">Sheets</option>
                  <option value="reams">Reams</option>
                  <option value="kg">kg</option>
                  <option value="litre">Litre</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Alert Level</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={state.reorderLevel}
                onChange={e => update({ reorderLevel: e.target.value })}
                placeholder="e.g. 100"
              />
              <p className="text-xs text-muted-foreground">You'll get an alert when stock drops below this</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-none"
                rows={2}
                value={state.notes}
                onChange={e => update({ notes: e.target.value })}
                placeholder="Any notes..."
              />
            </div>
          </div>
        );

      case "Review":
        const materialName = getMaterialName(state);
        const vendorLabel = state.showNewVendor ? state.newVendorName :
          (state.vendorId ? vendors?.find(v => v.id === parseInt(state.vendorId))?.vendorName : "—");
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-center">Review & Confirm</h3>
            <div className="bg-muted/50 rounded-xl p-5 space-y-3">
              <div className="text-center mb-4">
                <p className="text-2xl font-black text-primary">{materialName}</p>
                {vendorLabel && vendorLabel !== "—" && (
                  <p className="text-sm text-muted-foreground mt-1">{vendorLabel}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                  <p className="font-bold capitalize">{state.category}</p>
                </div>
                {state.category !== "consumable" && (
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">GSM</p>
                    <p className="font-bold">{state.gsm}</p>
                  </div>
                )}
                {state.width && state.height && (
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Dimensions</p>
                    <p className="font-bold">{state.width}×{state.height}"</p>
                  </div>
                )}
                {state.grain && (
                  <div className="bg-background rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Grain</p>
                    <p className="font-bold capitalize">{state.grain}</p>
                  </div>
                )}
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Opening Qty</p>
                  <p className="font-bold">{state.openingQty} {state.unit}</p>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Reorder Level</p>
                  <p className="font-bold">{state.reorderLevel || "0"} {state.unit}</p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const isLastStep = step === totalSteps - 1;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Material to Inventory">
      <div className="min-h-[400px] flex flex-col">
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                i < step ? "bg-emerald-500 text-white" :
                  i === step ? "bg-primary text-white shadow-md" :
                    "bg-muted text-muted-foreground"
              )}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn("w-6 h-0.5", i < step ? "bg-emerald-500" : "bg-muted")} />
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-muted-foreground mb-4">
          Step {step + 1} of {totalSteps}
        </p>

        <div className="flex-1">
          {renderStep()}
        </div>

        <div className="flex justify-between pt-6 border-t border-border mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 0 ? handleClose : handleBack}
            className="gap-1"
          >
            <ChevronLeft size={16} />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {isLastStep ? (
            <Button
              onClick={handleSave}
              isLoading={createMaterial.isPending}
              className="gap-1"
            >
              Confirm & Save
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className="gap-1"
            >
              Next <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
