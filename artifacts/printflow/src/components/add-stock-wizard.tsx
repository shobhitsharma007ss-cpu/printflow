import React, { useState, useCallback, useEffect } from "react";
import { Button, Input, Label, Modal, Select } from "@/components/ui-elements";
import { useCreateMaterial, useAddMaterialVendor } from "@/hooks/use-inventory";
import { useVendors, useCreateVendor } from "@/hooks/use-vendors";
import { Layers, FileText, Droplets, ChevronDown, ChevronUp } from "lucide-react";
import { cn, parseDim, dimToCm } from "@/lib/utils";
import { toast } from "sonner";

type MatCategory = "board" | "paper" | "consumable";
type DimUnit = "in" | "cm";

const BOARD_TYPES: Record<string, string> = {
  "grey-back": "Grey Back Duplex",
  "white-back": "White Back Duplex",
  "fbb": "FBB Board",
  "sbs": "SBS Board",
  "kraft": "Kraft Board",
  "other-board": "Other Board",
};

const PAPER_TYPES: Record<string, string> = {
  "art-card": "Art Card",
  "maplitho": "Maplitho",
  "non-woven": "Non Woven",
  "other-paper": "Other Paper",
};

const CONSUMABLE_TYPES: Record<string, string> = {
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
const DIM_PRESETS_IN = ["20×30", "23×36", "25×35", "26×38", "28×40"];

function getAutoUnit(cat: MatCategory, subType: string): "sheets" | "kg" | "litre" | "reams" {
  if (cat === "consumable") {
    if (subType.includes("ink")) return "kg";
    if (["varnish", "aqueous-coating", "lubricant"].includes(subType)) return "litre";
    return "kg";
  }
  if (subType === "maplitho") return "reams";
  return "sheets";
}

function computeSheetWeightKg(w: number, h: number, dimUnit: DimUnit, gsm: number): number {
  const wCm = dimUnit === "in" ? w * 2.54 : w;
  const hCm = dimUnit === "in" ? h * 2.54 : h;
  return (wCm * hCm * gsm) / 10_000_000;
}

function buildDimensionString(w: string, h: string, dimUnit: DimUnit): string | undefined {
  const wn = parseFloat(w);
  const hn = parseFloat(h);
  if (!wn || !hn) return undefined;
  const wCm = dimToCm(wn, dimUnit);
  const hCm = dimToCm(hn, dimUnit);
  return `${wCm.toFixed(2)}x${hCm.toFixed(2)} cm`;
}

function buildAutoName(cat: MatCategory, subType: string, gsm: number, w: string, h: string, dimUnit: DimUnit): string {
  if (cat === "consumable") return CONSUMABLE_TYPES[subType] || subType;
  const typeMap = cat === "board" ? BOARD_TYPES : PAPER_TYPES;
  const typeName = typeMap[subType] || subType;
  if (!typeName) return "";
  const parts: string[] = [typeName];
  if (gsm) parts.push(`${gsm}gsm`);
  const wn = parseFloat(w);
  const hn = parseFloat(h);
  if (wn && hn) parts.push(`${w}×${h}${dimUnit}`);
  return parts.join(" ");
}

interface FormState {
  category: MatCategory;
  subType: string;
  gsm: number;
  width: string;
  height: string;
  dimUnit: DimUnit;
  grain: "long" | "short" | "";
  openingQtyKg: string;
  reorderKg: string;
  ratePerKg: string;
  vendorId: string;
  newVendorName: string;
  newVendorPhone: string;
  showNewVendor: boolean;
  customName: string;
  nameOverridden: boolean;
  showAdvanced: boolean;
}

const blank: FormState = {
  category: "board",
  subType: "",
  gsm: 250,
  width: "",
  height: "",
  dimUnit: "in",
  grain: "",
  openingQtyKg: "",
  reorderKg: "",
  ratePerKg: "",
  vendorId: "",
  newVendorName: "",
  newVendorPhone: "",
  showNewVendor: false,
  customName: "",
  nameOverridden: false,
  showAdvanced: false,
};

export function AddStockWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState<FormState>({ ...blank });
  const [saving, setSaving] = useState(false);

  const { data: vendors } = useVendors();
  const createMaterial = useCreateMaterial();
  const addVendor = useAddMaterialVendor();
  const createVendor = useCreateVendor();

  const update = useCallback((partial: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...partial }));
  }, []);

  const autoName = buildAutoName(form.category, form.subType, form.gsm, form.width, form.height, form.dimUnit);
  const displayName = form.nameOverridden ? form.customName : autoName;

  useEffect(() => {
    if (!form.nameOverridden) {
      setForm(prev => ({ ...prev, customName: autoName }));
    }
  }, [autoName, form.nameOverridden]);

  const isBoardOrPaper = form.category !== "consumable";

  const sheetWtKg = isBoardOrPaper && form.width && form.height && form.gsm
    ? computeSheetWeightKg(parseFloat(form.width) || 0, parseFloat(form.height) || 0, form.dimUnit, form.gsm)
    : null;

  const openingKgNum = parseFloat(form.openingQtyKg) || 0;
  const openingSheets = sheetWtKg && sheetWtKg > 0 && openingKgNum > 0
    ? Math.round(openingKgNum / sheetWtKg)
    : null;

  const canSave =
    !!form.subType &&
    !!displayName.trim() &&
    (isBoardOrPaper ? !!(form.gsm) : true) &&
    parseFloat(form.openingQtyKg) >= 0;

  const handleClose = () => {
    setForm({ ...blank });
    setSaving(false);
    onClose();
  };

  const doSave = async (): Promise<boolean> => {
    const materialName = displayName.trim() || autoName;
    if (!materialName) { toast.error("Material name required"); return false; }

    const unit = getAutoUnit(form.category, form.subType);
    const dimensions = isBoardOrPaper ? buildDimensionString(form.width, form.height, form.dimUnit) : undefined;

    const rateNum = parseFloat(form.ratePerKg);

    let openingQty = openingKgNum;
    let openingUnit: "sheets" | "kg" | "litre" | "reams" = unit;

    if (isBoardOrPaper && sheetWtKg && sheetWtKg > 0 && openingKgNum > 0) {
      openingQty = Math.round(openingKgNum / sheetWtKg);
      openingUnit = "sheets";
    } else if (isBoardOrPaper) {
      openingQty = openingKgNum;
      openingUnit = "kg";
    }

    const reorderNum = parseFloat(form.reorderKg) || 0;
    let reorderQty = reorderNum;
    if (isBoardOrPaper && sheetWtKg && sheetWtKg > 0 && reorderNum > 0) {
      reorderQty = Math.round(reorderNum / sheetWtKg);
    }

    setSaving(true);
    try {
      let vendorIdToLink: number | null = null;
      if (form.showNewVendor && form.newVendorName) {
        const newV = await createVendor.mutateAsync({
          data: { vendorName: form.newVendorName, contactPerson: "", phone: form.newVendorPhone, city: "" },
        });
        vendorIdToLink = newV.id;
      } else if (form.vendorId) {
        vendorIdToLink = parseInt(form.vendorId);
      }

      const material = await createMaterial.mutateAsync({
        data: {
          materialName,
          materialType: form.category as "board" | "paper" | "consumable",
          subType: form.subType,
          gsm: isBoardOrPaper ? form.gsm : undefined,
          unit: openingUnit as "sheets" | "reams" | "kg" | "litre",
          currentQty: openingQty,
          minReorderQty: reorderQty,
          ratePerUnit: !isNaN(rateNum) && rateNum > 0 ? rateNum : undefined,
          dimensions,
          grain: form.grain || undefined,
        },
      });

      if (vendorIdToLink && material?.id) {
        await addVendor.mutateAsync({ id: material.id, data: { vendorId: vendorIdToLink } });
      }

      toast.success(`${materialName} added to inventory`);
      return true;
    } catch {
      toast.error("Failed to save material");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const ok = await doSave();
    if (ok) handleClose();
  };

  const handleSaveAndAnother = async () => {
    const ok = await doSave();
    if (ok) {
      setForm(prev => ({
        ...blank,
        category: prev.category,
        vendorId: prev.vendorId,
        dimUnit: prev.dimUnit,
      }));
    }
  };

  const subTypes = form.category === "board" ? BOARD_TYPES : form.category === "paper" ? PAPER_TYPES : CONSUMABLE_TYPES;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Material">
      <div className="space-y-5 pb-2">

        {/* Category selector */}
        <div className="flex gap-2">
          {([
            { value: "board" as const, label: "Board", icon: Layers },
            { value: "paper" as const, label: "Paper", icon: FileText },
            { value: "consumable" as const, label: "Consumable", icon: Droplets },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ category: opt.value, subType: "", nameOverridden: false, customName: "" })}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                form.category === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/30 text-muted-foreground"
              )}
            >
              <opt.icon size={18} />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sub-type grid */}
        <div>
          <Label className="mb-2 block">
            {form.category === "board" ? "Board Type" : form.category === "paper" ? "Paper Type" : "Consumable Type"}
            {" "}<span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(subTypes).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ subType: value, nameOverridden: false })}
                className={cn(
                  "p-3 rounded-lg border-2 text-xs font-semibold transition-all text-left",
                  form.subType === value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/30"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Board/Paper specific fields */}
        {isBoardOrPaper && (
          <>
            {/* GSM */}
            <div>
              <Label className="mb-1 block">GSM</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={50}
                  max={450}
                  step={5}
                  value={form.gsm}
                  onChange={e => update({ gsm: parseInt(e.target.value) || 250, nameOverridden: false })}
                  className="w-28 text-center text-lg font-bold"
                />
                <div className="flex flex-wrap gap-1.5">
                  {GSM_PRESETS.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => update({ gsm: g, nameOverridden: false })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        form.gsm === g ? "bg-primary text-white" : "bg-muted hover:bg-muted/70"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dimensions */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Dimensions</Label>
                <div className="flex gap-1">
                  {(["in", "cm"] as const).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => update({ dimUnit: u, width: "", height: "", nameOverridden: false })}
                      className={cn(
                        "px-3 py-1 rounded text-xs font-bold transition-all",
                        form.dimUnit === u ? "bg-primary text-white" : "bg-muted hover:bg-muted/70"
                      )}
                    >
                      {u.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step={form.dimUnit === "in" ? "1" : "0.1"}
                  value={form.width}
                  onChange={e => update({ width: e.target.value, nameOverridden: false })}
                  placeholder={form.dimUnit === "in" ? "25" : "63.5"}
                  className="w-24 text-center font-bold"
                />
                <span className="text-lg font-bold text-muted-foreground">×</span>
                <Input
                  type="number"
                  step={form.dimUnit === "in" ? "1" : "0.1"}
                  value={form.height}
                  onChange={e => update({ height: e.target.value, nameOverridden: false })}
                  placeholder={form.dimUnit === "in" ? "35" : "88.9"}
                  className="w-24 text-center font-bold"
                />
                <span className="text-sm text-muted-foreground">{form.dimUnit}</span>
                {form.dimUnit === "in" && (
                  <div className="flex flex-wrap gap-1 ml-2">
                    {DIM_PRESETS_IN.map(d => {
                      const [w, h] = d.split("×");
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => update({ width: w, height: h, nameOverridden: false })}
                          className={cn(
                            "px-2 py-1 rounded text-xs font-bold transition-all",
                            form.width === w && form.height === h ? "bg-primary text-white" : "bg-muted hover:bg-muted/70"
                          )}
                        >
                          {d}"
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {sheetWtKg && sheetWtKg > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Sheet weight: <span className="font-semibold">{(sheetWtKg * 1000).toFixed(1)} g</span>
                </p>
              )}
            </div>

            {/* Grain */}
            <div>
              <Label className="mb-1 block">Grain Direction</Label>
              <div className="flex gap-2">
                {(["long", "short", ""] as const).map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => update({ grain: g })}
                    className={cn(
                      "px-4 py-2 rounded-lg border text-sm font-semibold transition-all",
                      form.grain === g
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    {g === "" ? "Not specified" : g === "long" ? "Long Grain" : "Short Grain"}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Auto-generated name */}
        <div>
          <Label className="mb-1 block">Material Name</Label>
          <Input
            value={displayName}
            onChange={e => update({ customName: e.target.value, nameOverridden: true })}
            placeholder="Auto-generated from selections above"
          />
          {form.nameOverridden && (
            <button
              type="button"
              onClick={() => update({ nameOverridden: false, customName: autoName })}
              className="text-xs text-primary hover:underline mt-1"
            >
              Reset to auto-name
            </button>
          )}
        </div>

        {/* Stock & Rate */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="mb-1 block">
              Opening Stock {isBoardOrPaper ? "(kg)" : `(${getAutoUnit(form.category, form.subType)})`}
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.openingQtyKg}
              onChange={e => update({ openingQtyKg: e.target.value })}
              placeholder="0"
            />
            {openingSheets !== null && openingSheets > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ {openingSheets.toLocaleString("en-IN")} sheets
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1 block">
              Reorder Level {isBoardOrPaper ? "(kg)" : ""}
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.reorderKg}
              onChange={e => update({ reorderKg: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <Label className="mb-1 block">
              {isBoardOrPaper ? "Rate (₹/kg)" : `Rate (₹/${getAutoUnit(form.category, form.subType)})`}
            </Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.ratePerKg}
                onChange={e => update({ ratePerKg: e.target.value })}
                placeholder="0.00"
                className="pl-6"
              />
            </div>
          </div>
        </div>

        {/* Vendor */}
        <div>
          <Label className="mb-1 block">Vendor / Supplier</Label>
          {!form.showNewVendor ? (
            <div className="flex items-center gap-2">
              <Select
                value={form.vendorId}
                onChange={e => update({ vendorId: e.target.value })}
                className="flex-1"
              >
                <option value="">— Optional —</option>
                {vendors?.map((v: { id: number; vendorName: string; city: string }) => (
                  <option key={v.id} value={v.id}>{v.vendorName}{v.city ? ` (${v.city})` : ""}</option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => update({ showNewVendor: true, vendorId: "" })}
                className="text-sm text-primary font-semibold whitespace-nowrap hover:underline"
              >
                + New
              </button>
            </div>
          ) : (
            <div className="space-y-2 bg-muted/50 p-3 rounded-xl">
              <Input
                value={form.newVendorName}
                onChange={e => update({ newVendorName: e.target.value })}
                placeholder="Vendor name"
              />
              <Input
                value={form.newVendorPhone}
                onChange={e => update({ newVendorPhone: e.target.value })}
                placeholder="Phone (optional)"
              />
              <button
                type="button"
                onClick={() => update({ showNewVendor: false, newVendorName: "", newVendorPhone: "" })}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel — use existing
              </button>
            </div>
          )}
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => update({ showAdvanced: !form.showAdvanced })}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {form.showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {form.showAdvanced ? "Hide" : "Show"} advanced options
        </button>

        {form.showAdvanced && (
          <div className="bg-muted/30 p-3 rounded-xl space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Dimensions are stored in cm internally. The display above converts from your selected unit.
            </p>
            {isBoardOrPaper && form.width && form.height && (
              <p className="font-mono text-xs">
                Stored: {buildDimensionString(form.width, form.height, form.dimUnit) ?? "—"}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveAndAnother}
            disabled={!canSave || saving}
            className="flex-1"
          >
            Save & Add Another
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1"
          >
            {saving ? "Saving…" : "Save Material"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
