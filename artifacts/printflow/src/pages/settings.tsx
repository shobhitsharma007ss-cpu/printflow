import React, { useState } from "react";
import { useMachines, usePatchMachineStatus, useUpdateMachine } from "@/hooks/use-machines";
import { useMaterials, useUpdateMaterial, useCreateMaterial, useDeleteMaterial } from "@/hooks/use-inventory";
import { useVendors, useCreateVendor, useDeleteVendor } from "@/hooks/use-vendors";
import { useJobTemplates } from "@/hooks/use-templates";
import { Card, Button, Input, Label, Select, Modal } from "@/components/ui-elements";
import { Settings as SettingsIcon, Cpu, Package, Users, Briefcase, Save, Plus, Trash2, ArrowRight, Check, X, ChevronLeft, ChevronRight, Layers, IndianRupee, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddMaterialVendor } from "@/hooks/use-inventory";
import type { Machine, Material, CreateMaterialRequestUnit, JobTemplate } from "@workspace/api-client-react";

type Section = "machines" | "materials" | "vendors" | "templates";

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>("machines");

  const sections = [
    { key: "machines" as Section, label: "Machines", icon: Cpu },
    { key: "materials" as Section, label: "Materials", icon: Package },
    { key: "vendors" as Section, label: "Vendors", icon: Users },
    { key: "templates" as Section, label: "Job Templates", icon: Briefcase },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <SettingsIcon className="text-primary" size={30} />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 font-medium">Manage machines, materials, vendors, and job templates</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeSection === s.key
                ? "bg-primary text-white shadow-md"
                : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
            )}
          >
            <s.icon size={16} />
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === "machines" && <MachinesSection />}
      {activeSection === "materials" && <MaterialsSection />}
      {activeSection === "vendors" && <VendorsSection />}
      {activeSection === "templates" && <TemplatesSection />}
    </div>
  );
}

function MachinesSection() {
  const { data: machines, isLoading } = useMachines();
  const patchStatus = usePatchMachineStatus();
  const updateMachine = useUpdateMachine();
  const [editing, setEditing] = useState<number | null>(null);
  const [editOperator, setEditOperator] = useState('');
  const [saved, setSaved] = useState<number | null>(null);

  const startEdit = (machine: Machine) => {
    setEditing(machine.id);
    setEditOperator(machine.operatorName ?? '');
  };

  const saveOperator = (machine: Machine) => {
    updateMachine.mutate({
      id: machine.id,
      data: {
        machineName: machine.machineName,
        machineCode: machine.machineCode,
        machineType: machine.machineType,
        operatorName: editOperator,
        status: machine.status,
        capabilities: machine.capabilities ?? [],
        speedPerHour: machine.speedPerHour ?? undefined,
        maxPaperWidth: machine.maxPaperWidth ?? undefined,
        maxPaperLength: machine.maxPaperLength ?? undefined,
        notes: machine.notes ?? undefined,
      }
    }, {
      onSuccess: () => {
        setEditing(null);
        setSaved(machine.id);
        setTimeout(() => setSaved(null), 2000);
      }
    });
  };

  const toggleStatus = (machine: Machine) => {
    const next = machine.status === 'maintenance' ? 'idle' : 'maintenance';
    patchStatus.mutate({ id: machine.id, data: { status: next } });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-border bg-muted/30">
        <h2 className="text-lg font-bold">Machine Fleet</h2>
        <p className="text-sm text-muted-foreground">Update operator assignments and machine status</p>
      </div>
      <div className="divide-y divide-border">
        {machines?.map(machine => (
          <div key={machine.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-bold text-foreground">{machine.machineName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{machine.machineCode} · {machine.machineType}</p>
                </div>
              </div>

              {editing === machine.id ? (
                <div className="flex items-center gap-2 mt-3">
                  <Input
                    value={editOperator}
                    onChange={e => setEditOperator(e.target.value)}
                    placeholder="Operator name"
                    className="h-8 text-sm max-w-xs"
                  />
                  <button
                    onClick={() => saveOperator(machine)}
                    className="p-1.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="p-1.5 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(machine)}
                  className="mt-1 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 group"
                >
                  <span>Operator: <span className="font-medium text-foreground">{machine.operatorName || 'Unassigned'}</span></span>
                  {saved === machine.id && <Check size={12} className="text-emerald-500" />}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <StatusPill status={machine.status} />
              <button
                onClick={() => toggleStatus(machine)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                  machine.status === 'maintenance'
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                )}
              >
                {machine.status === 'maintenance' ? 'Mark Idle' : 'Mark Maintenance'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Editable field type ───────────────────────────────────────────────────
type EditingField = "reorder" | "rate" | "wastage" | null;
type EditingState = { id: number; field: EditingField };

function MaterialsSection() {
  const { data: materials, isLoading } = useMaterials();
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showConsumableForm, setShowConsumableForm] = useState(false);

  const startEdit = (m: Material, field: EditingField) => {
    setEditing({ id: m.id, field });
    if (field === 'reorder') setEditValue(String(m.minReorderQty));
    if (field === 'rate') setEditValue(m.ratePerUnit ? String(m.ratePerUnit) : '');
    if (field === 'wastage') setEditValue(m.wastagePercent ? String(m.wastagePercent) : '5');
  };

  const save = (m: Material) => {
    if (!editing) return;
    const updateData: Record<string, unknown> = {
      materialName: m.materialName,
      materialType: m.materialType,
      subType: m.subType ?? '',
      gsm: m.gsm ?? undefined,
      unit: m.unit,
      currentQty: parseFloat(String(m.currentQty)) || 0,
      minReorderQty: parseFloat(String(m.minReorderQty)) || 0,
      dimensions: m.dimensions ?? undefined,
      grain: m.grain ?? undefined,
    };

    if (editing.field === 'reorder') updateData.minReorderQty = parseFloat(editValue) || 0;
    if (editing.field === 'rate') updateData.ratePerUnit = parseFloat(editValue) || null;
    if (editing.field === 'wastage') updateData.wastagePercent = parseFloat(editValue) || 5;

    updateMaterial.mutate({ id: m.id, data: updateData as any }, {
      onSuccess: () => {
        setEditing(null);
        setSaved(m.id);
        setTimeout(() => setSaved(null), 2000);
      }
    });
  };

  const isEditing = (m: Material, field: EditingField) =>
    editing?.id === m.id && editing?.field === field;

  if (isLoading) return <LoadingSpinner />;

  const grouped = {
    board: materials?.filter(m => m.materialType === 'board') ?? [],
    paper: materials?.filter(m => m.materialType === 'paper') ?? [],
    consumable: materials?.filter(m => m.materialType === 'consumable') ?? [],
  };

  // Stats for summary bar
  const totalMaterials = materials?.length ?? 0;
  const ratedMaterials = materials?.filter(m => m.ratePerUnit).length ?? 0;
  const lowStock = materials?.filter(m =>
    parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty))
  ).length ?? 0;

  return (
    <div className="space-y-6">

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-primary">{totalMaterials}</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Total Materials</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-black text-emerald-600">{ratedMaterials}</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Rates Set</p>
        </Card>
        <Card className={cn("p-4 text-center", lowStock > 0 && "border-rose-200 bg-rose-50/50")}>
          <p className={cn("text-2xl font-black", lowStock > 0 ? "text-rose-600" : "text-muted-foreground")}>{lowStock}</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Low Stock</p>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={() => setShowWizard(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Add Paper / Board
        </Button>
        <Button variant="outline" onClick={() => setShowConsumableForm(true)} className="flex items-center gap-2">
          <Plus size={16} />
          Add Consumable
        </Button>
      </div>

      {Object.entries(grouped).map(([type, items]) => (
        items.length > 0 && (
          <Card key={type} className="overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2">
              <Layers size={16} className="text-muted-foreground" />
              <h2 className="font-bold capitalize">
                {type === 'board' ? 'Boards' : type === 'paper' ? 'Paper' : 'Consumables'}
              </h2>
              <span className="text-xs text-muted-foreground ml-auto">{items.length} materials</span>
            </div>
            <div className="divide-y divide-border">
              {items.map(m => {
                const availableQty = parseFloat(String(m.currentQty)) - parseFloat(String(m.reservedQty ?? 0));
                const isLow = parseFloat(String(m.currentQty)) <= parseFloat(String(m.minReorderQty));
                const rateStale = m.rateUpdatedAt
                  ? (Date.now() - new Date(m.rateUpdatedAt).getTime()) > 30 * 24 * 60 * 60 * 1000
                  : false;

                return (
                  <div key={m.id} className={cn(
                    "p-4 flex flex-col gap-3",
                    isLow && "bg-rose-50/30"
                  )}>
                    {/* Row 1 — Name + badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{m.materialName}</p>
                          {isLow && (
                            <span className="flex items-center gap-1 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium">
                              <AlertTriangle size={10} />
                              Low Stock
                            </span>
                          )}
                          {saved === m.id && <span className="text-xs text-emerald-500 font-medium">Saved ✓</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {m.gsm && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{m.gsm} GSM</span>}
                          {m.dimensions && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{m.dimensions}&quot;</span>}
                          {m.grain && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded capitalize">{m.grain} grain</span>}
                          <span className="text-xs text-muted-foreground">{m.unit}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${m.materialName}"? This cannot be undone.`)) {
                            deleteMaterial.mutate({ id: m.id });
                          }
                        }}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Row 2 — All editable fields */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                      {/* Current Qty */}
                      <div className="bg-muted/40 rounded-lg p-2.5">
                        <span className="text-muted-foreground text-xs block mb-0.5">Current Stock</span>
                        <span className="font-bold text-sm">{m.currentQty} {m.unit}</span>
                        {parseFloat(String(m.reservedQty ?? 0)) > 0 && (
                          <span className="text-xs text-amber-600 block mt-0.5">
                            {availableQty} available
                          </span>
                        )}
                      </div>

                      {/* Reorder Level */}
                      <div className="bg-muted/40 rounded-lg p-2.5">
                        <span className="text-muted-foreground text-xs block mb-0.5">Reorder Level</span>
                        {isEditing(m, 'reorder') ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="0"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="h-6 w-20 text-xs px-1"
                              autoFocus
                            />
                            <button onClick={() => save(m)} className="p-0.5 bg-emerald-500 text-white rounded"><Check size={11} /></button>
                            <button onClick={() => setEditing(null)} className="p-0.5 bg-muted text-muted-foreground rounded"><X size={11} /></button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(m, 'reorder')} className="font-bold text-sm hover:text-primary transition-colors">
                            {m.minReorderQty} {m.unit}
                          </button>
                        )}
                      </div>

                      {/* Rate Per Unit */}
                      <div className="bg-muted/40 rounded-lg p-2.5">
                        <span className="text-muted-foreground text-xs block mb-0.5 flex items-center gap-1">
                          Rate / {m.unit}
                          {rateStale && m.ratePerUnit && (
                            <span title="Rate not updated in 30+ days">
                              <AlertTriangle size={10} className="text-amber-500" />
                            </span>
                          )}
                        </span>
                        {isEditing(m, 'rate') ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">₹</span>
                            <Input
                              type="number" min="0" step="0.01"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="h-6 w-20 text-xs px-1"
                              autoFocus
                            />
                            <button onClick={() => save(m)} className="p-0.5 bg-emerald-500 text-white rounded"><Check size={11} /></button>
                            <button onClick={() => setEditing(null)} className="p-0.5 bg-muted text-muted-foreground rounded"><X size={11} /></button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(m, 'rate')} className="font-bold text-sm hover:text-primary transition-colors flex items-center gap-0.5">
                            {m.ratePerUnit
                              ? <><IndianRupee size={12} />{parseFloat(String(m.ratePerUnit)).toLocaleString('en-IN')}</>
                              : <span className="text-muted-foreground font-normal text-xs">Set rate</span>
                            }
                          </button>
                        )}
                        {m.ratePerUnit && m.rateUpdatedAt && (
                          <span className="text-xs text-muted-foreground block mt-0.5">
                            {new Date(m.rateUpdatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>

                      {/* Wastage % */}
                      <div className="bg-muted/40 rounded-lg p-2.5">
                        <span className="text-muted-foreground text-xs block mb-0.5">Wastage %</span>
                        {isEditing(m, 'wastage') ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="0" max="50" step="0.5"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              className="h-6 w-16 text-xs px-1"
                              autoFocus
                            />
                            <span className="text-xs">%</span>
                            <button onClick={() => save(m)} className="p-0.5 bg-emerald-500 text-white rounded"><Check size={11} /></button>
                            <button onClick={() => setEditing(null)} className="p-0.5 bg-muted text-muted-foreground rounded"><X size={11} /></button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(m, 'wastage')} className="font-bold text-sm hover:text-primary transition-colors">
                            {m.wastagePercent ?? 5}%
                          </button>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )
      ))}

      <AddMaterialWizard isOpen={showWizard} onClose={() => setShowWizard(false)} />
      <AddConsumableForm isOpen={showConsumableForm} onClose={() => setShowConsumableForm(false)} />
    </div>
  );
}

const PAPER_TYPES = [
  'Grey Back Duplex',
  'White Back Duplex',
  'FBB Board',
  'SBS Board',
  'Art Card',
  'Maplitho',
  'Non Woven',
  'Other',
];

const GSM_PRESETS = [70, 90, 130, 170, 200, 250, 285, 300, 350, 400];
const DIM_PRESETS = ['20x30', '23x36', '25x35', '26x38', '28x40'];

function getMaterialMeta(paperType: string): { materialType: 'board' | 'paper' | 'consumable'; subType: string; unit: 'sheets' | 'reams' | 'kg' | 'litre' } {
  const map: Record<string, { materialType: 'board' | 'paper' | 'consumable'; subType: string; unit: 'sheets' | 'reams' | 'kg' | 'litre' }> = {
    'Grey Back Duplex': { materialType: 'board', subType: 'grey-back', unit: 'sheets' },
    'White Back Duplex': { materialType: 'board', subType: 'white-back', unit: 'sheets' },
    'FBB Board': { materialType: 'board', subType: 'fbb', unit: 'sheets' },
    'SBS Board': { materialType: 'board', subType: 'sbs', unit: 'sheets' },
    'Art Card': { materialType: 'paper', subType: 'art-card', unit: 'sheets' },
    'Maplitho': { materialType: 'paper', subType: 'maplitho', unit: 'reams' },
    'Non Woven': { materialType: 'paper', subType: 'non-woven', unit: 'sheets' },
  };
  return map[paperType] ?? { materialType: 'paper', subType: 'other', unit: 'sheets' };
}

type WizardState = {
  paperType: string;
  paperTypeOther: string;
  gsm: string;
  dimWidth: string;
  dimHeight: string;
  grain: 'long' | 'short' | '';
  vendorId: string;
  addingNewVendor: boolean;
  newVendorName: string;
  openingQty: string;
  unit: string;
  reorderLevel: string;
  ratePerUnit: string;
  wastagePercent: string;
};

const defaultWizard: WizardState = {
  paperType: '',
  paperTypeOther: '',
  gsm: '',
  dimWidth: '',
  dimHeight: '',
  grain: '',
  vendorId: '',
  addingNewVendor: false,
  newVendorName: '',
  openingQty: '0',
  unit: 'sheets',
  reorderLevel: '100',
  ratePerUnit: '',
  wastagePercent: '5',
};

function AddMaterialWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardState>(defaultWizard);

  const { data: vendors } = useVendors();
  const createVendor = useCreateVendor();
  const createMaterial = useCreateMaterial();
  const addVendorHook = useAddMaterialVendor();

  const totalSteps = 6;

  const handleClose = () => {
    setStep(1);
    setForm(defaultWizard);
    onClose();
  };

  const canNext = () => {
    if (step === 1) return !!form.paperType && (form.paperType !== 'Other' || !!form.paperTypeOther.trim());
    if (step === 2) return !!form.gsm && parseInt(form.gsm) >= 50 && parseInt(form.gsm) <= 450;
    if (step === 3) return !!form.dimWidth && !!form.dimHeight;
    if (step === 4) return !!form.grain;
    if (step === 5) return !form.addingNewVendor || !!form.newVendorName.trim();
    if (step === 6) return !!form.openingQty && !!form.unit && !!form.reorderLevel;
    return false;
  };

  const handleSubmit = async () => {
    const effectivePaperType = form.paperType === 'Other' ? form.paperTypeOther : form.paperType;
    const meta = getMaterialMeta(form.paperType);
    const dimensions = `${form.dimWidth}x${form.dimHeight}`;
    const materialName = `${effectivePaperType} ${form.gsm}gsm`;

    createMaterial.mutate({
      data: {
        materialName,
        materialType: meta.materialType,
        subType: meta.subType,
        gsm: parseInt(form.gsm),
        unit: form.unit as CreateMaterialRequestUnit,
        currentQty: parseFloat(form.openingQty) || 0,
        minReorderQty: parseFloat(form.reorderLevel) || 0,
        ratePerUnit: form.ratePerUnit ? parseFloat(form.ratePerUnit) : undefined,
        wastagePercent: parseFloat(form.wastagePercent) || 5,
        dimensions,
        grain: form.grain || undefined,
      } as any
    }, {
      onSuccess: async (newMaterial) => {
        const matId = newMaterial.id;
        let vendorIdToLink: number | null = null;

        if (form.addingNewVendor && form.newVendorName) {
          await new Promise<void>((resolve) => {
            createVendor.mutate({ data: { vendorName: form.newVendorName, contactPerson: '', phone: '', city: '' } }, {
              onSuccess: (v) => { vendorIdToLink = v.id; resolve(); },
              onError: () => resolve(),
            });
          });
        } else if (form.vendorId) {
          vendorIdToLink = parseInt(form.vendorId);
        }

        if (vendorIdToLink && matId) {
          addVendorHook.mutate({ id: matId, data: { vendorId: vendorIdToLink } }, {
            onSettled: () => handleClose(),
          });
        } else {
          handleClose();
        }
      }
    });
  };

  const setDimPreset = (preset: string) => {
    const [w, h] = preset.split('x');
    setForm(f => ({ ...f, dimWidth: w, dimHeight: h }));
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Material">
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

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Paper Type</h3>
              <p className="text-sm text-muted-foreground">Select the type of board or paper</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAPER_TYPES.map(pt => (
                <button
                  key={pt}
                  onClick={() => setForm(f => ({ ...f, paperType: pt }))}
                  className={cn(
                    "p-3 rounded-lg border-2 text-sm font-semibold text-left transition-all",
                    form.paperType === pt
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 text-foreground"
                  )}
                >
                  {pt}
                </button>
              ))}
            </div>
            {form.paperType === 'Other' && (
              <div className="space-y-1.5">
                <Label>Specify paper type</Label>
                <Input
                  placeholder="e.g. Kraft Board"
                  value={form.paperTypeOther}
                  onChange={e => setForm(f => ({ ...f, paperTypeOther: e.target.value }))}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">GSM</h3>
              <p className="text-sm text-muted-foreground">Grams per square metre</p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="number" min={50} max={450}
                  value={form.gsm}
                  onChange={e => setForm(f => ({ ...f, gsm: e.target.value }))}
                  placeholder="e.g. 300"
                  className="w-28 text-lg font-bold"
                />
                <span className="text-muted-foreground font-medium">GSM</span>
              </div>
              <input
                type="range" min={50} max={450} step={5}
                value={form.gsm || 200}
                onChange={e => setForm(f => ({ ...f, gsm: e.target.value }))}
                className="w-full h-2 rounded-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>50</span><span>250</span><span>450</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Quick select</p>
                <div className="flex flex-wrap gap-2">
                  {GSM_PRESETS.map(g => (
                    <button
                      key={g}
                      onClick={() => setForm(f => ({ ...f, gsm: String(g) }))}
                      className={cn(
                        "px-3 py-1 rounded-full text-sm font-semibold border transition-all",
                        form.gsm === String(g)
                          ? "bg-primary text-white border-primary"
                          : "border-border hover:border-primary/50 text-foreground"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Dimensions</h3>
              <p className="text-sm text-muted-foreground">Sheet size in inches (Width × Height)</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Width (in)</Label>
                <Input type="number" min={1} placeholder="e.g. 25" value={form.dimWidth}
                  onChange={e => setForm(f => ({ ...f, dimWidth: e.target.value }))}
                  className="w-24 text-center font-bold text-lg" />
              </div>
              <span className="text-2xl font-bold text-muted-foreground mt-5">×</span>
              <div className="space-y-1">
                <Label className="text-xs">Height (in)</Label>
                <Input type="number" min={1} placeholder="e.g. 35" value={form.dimHeight}
                  onChange={e => setForm(f => ({ ...f, dimHeight: e.target.value }))}
                  className="w-24 text-center font-bold text-lg" />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Common sizes</p>
              <div className="flex flex-wrap gap-2">
                {DIM_PRESETS.map(d => (
                  <button key={d} onClick={() => setDimPreset(d)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-semibold border transition-all",
                      `${form.dimWidth}x${form.dimHeight}` === d
                        ? "bg-primary text-white border-primary"
                        : "border-border hover:border-primary/50 text-foreground"
                    )}
                  >{d}&quot;</button>
                ))}
              </div>
            </div>
            {form.dimWidth && form.dimHeight && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-center font-semibold">
                {form.dimWidth}&quot; × {form.dimHeight}&quot;
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Grain Direction</h3>
              <p className="text-sm text-muted-foreground">Fibre alignment relative to longer edge</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(['long', 'short'] as const).map(g => (
                <button key={g} onClick={() => setForm(f => ({ ...f, grain: g }))}
                  className={cn(
                    "py-8 rounded-xl border-2 font-bold text-base uppercase tracking-wider transition-all",
                    form.grain === g
                      ? "border-primary bg-primary text-white shadow-lg scale-[1.02]"
                      : "border-border text-foreground hover:border-primary/50 hover:bg-muted/30"
                  )}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn("rounded", g === 'long' ? "w-6 h-12 bg-current opacity-30" : "w-12 h-6 bg-current opacity-30")} />
                    {g} grain
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Vendor</h3>
              <p className="text-sm text-muted-foreground">Primary supplier for this material (optional)</p>
            </div>
            {!form.addingNewVendor ? (
              <div className="space-y-3">
                <Select value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))}>
                  <option value="">— No vendor / Skip —</option>
                  {vendors?.map(v => (
                    <option key={v.id} value={v.id}>{v.vendorName} {v.city ? `(${v.city})` : ''}</option>
                  ))}
                </Select>
                <button onClick={() => setForm(f => ({ ...f, addingNewVendor: true, vendorId: '' }))}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium">
                  <Plus size={14} /> Add new vendor
                </button>
              </div>
            ) : (
              <div className="space-y-3 p-4 border border-border rounded-lg bg-muted/20">
                <p className="text-sm font-bold">New Vendor</p>
                <Input placeholder="Vendor name (required)" value={form.newVendorName}
                  onChange={e => setForm(f => ({ ...f, newVendorName: e.target.value }))} autoFocus />
                <button onClick={() => setForm(f => ({ ...f, addingNewVendor: false, newVendorName: '' }))}
                  className="text-xs text-muted-foreground hover:text-foreground">← Back to vendor list</button>
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-lg">Stock & Pricing</h3>
              <p className="text-sm text-muted-foreground">Set opening stock, rate and wastage</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-4 text-sm space-y-1">
              <p className="font-bold">{form.paperType === 'Other' ? form.paperTypeOther : form.paperType} {form.gsm}gsm</p>
              <p className="text-muted-foreground">{form.dimWidth}″ × {form.dimHeight}″ · {form.grain} grain</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Opening Stock Qty</Label>
                <Input type="number" min={0} value={form.openingQty}
                  onChange={e => setForm(f => ({ ...f, openingQty: e.target.value }))} placeholder="e.g. 500" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  <option value="sheets">Sheets</option>
                  <option value="reams">Reams</option>
                  <option value="kg">KG</option>
                  <option value="litre">Litre</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Reorder Level</Label>
                <Input type="number" min={0} value={form.reorderLevel}
                  onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} placeholder="e.g. 100" />
                <p className="text-xs text-muted-foreground">Alert when stock falls below this</p>
              </div>
              <div className="space-y-1.5">
                <Label>Rate per {form.unit || 'unit'} (₹)</Label>
                <Input type="number" min={0} step="0.01" value={form.ratePerUnit}
                  onChange={e => setForm(f => ({ ...f, ratePerUnit: e.target.value }))} placeholder="e.g. 12.50" />
                <p className="text-xs text-muted-foreground">Optional — for costing</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Wastage % (default 5%)</Label>
              <Input type="number" min={0} max={50} step="0.5" value={form.wastagePercent}
                onChange={e => setForm(f => ({ ...f, wastagePercent: e.target.value }))} placeholder="e.g. 5" />
              <p className="text-xs text-muted-foreground">Used in job costing calculations</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="ghost" onClick={step === 1 ? handleClose : () => setStep(s => s - 1)} className="flex items-center gap-1">
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < totalSteps ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="flex items-center gap-1">
              Next <ChevronRight size={16} />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canNext() || createMaterial.isPending} isLoading={createMaterial.isPending}>
              Create Material
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AddConsumableForm({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const createMaterial = useCreateMaterial();
  const [form, setForm] = useState({
    materialName: '',
    subType: '',
    unit: 'kg' as string,
    currentQty: '0',
    minReorderQty: '50',
    ratePerUnit: '',
    wastagePercent: '5',
  });

  const handleClose = () => {
    setForm({ materialName: '', subType: '', unit: 'kg', currentQty: '0', minReorderQty: '50', ratePerUnit: '', wastagePercent: '5' });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMaterial.mutate({
      data: {
        materialName: form.materialName,
        materialType: 'consumable',
        subType: form.subType || 'general',
        unit: form.unit as CreateMaterialRequestUnit,
        currentQty: parseFloat(form.currentQty) || 0,
        minReorderQty: parseFloat(form.minReorderQty) || 0,
        ratePerUnit: form.ratePerUnit ? parseFloat(form.ratePerUnit) : undefined,
        wastagePercent: parseFloat(form.wastagePercent) || 5,
      } as any
    }, {
      onSuccess: () => handleClose(),
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Consumable Material">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Material Name <span className="text-destructive">*</span></Label>
          <Input required placeholder="e.g. Black Ink, PVA Glue, Varnish"
            value={form.materialName} onChange={e => setForm(f => ({ ...f, materialName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Sub-type</Label>
          <Input placeholder="e.g. offset-ink, adhesive, coating"
            value={form.subType} onChange={e => setForm(f => ({ ...f, subType: e.target.value }))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              <option value="kg">KG</option>
              <option value="litre">Litre</option>
              <option value="sheets">Sheets</option>
              <option value="reams">Reams</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Opening Qty</Label>
            <Input type="number" min={0} value={form.currentQty}
              onChange={e => setForm(f => ({ ...f, currentQty: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Reorder Level</Label>
            <Input type="number" min={0} value={form.minReorderQty}
              onChange={e => setForm(f => ({ ...f, minReorderQty: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Rate per {form.unit} (₹)</Label>
            <Input type="number" min={0} step="0.01" placeholder="e.g. 850"
              value={form.ratePerUnit} onChange={e => setForm(f => ({ ...f, ratePerUnit: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Wastage %</Label>
            <Input type="number" min={0} max={50} step="0.5"
              value={form.wastagePercent} onChange={e => setForm(f => ({ ...f, wastagePercent: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={!form.materialName.trim() || createMaterial.isPending} isLoading={createMaterial.isPending}>
            Add Consumable
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function VendorsSection() {
  const { data: vendors, isLoading } = useVendors();
  const createVendor = useCreateVendor();
  const deleteVendor = useDeleteVendor();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ vendorName: '', contactPerson: '', phone: '', city: '' });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createVendor.mutate({ data: {
      vendorName: form.vendorName,
      contactPerson: form.contactPerson || '',
      phone: form.phone || '',
      city: form.city || '',
    }}, {
      onSuccess: () => {
        setShowAdd(false);
        setForm({ vendorName: '', contactPerson: '', phone: '', city: '' });
      }
    });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Vendors</h2>
            <p className="text-sm text-muted-foreground">{vendors?.length ?? 0} vendors registered</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2">
            <Plus size={16} /> Add Vendor
          </Button>
        </div>
        {showAdd && (
          <form onSubmit={handleAdd} className="p-5 bg-muted/20 border-b border-border">
            <p className="text-sm font-bold mb-4">New Vendor</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vendor Name <span className="text-destructive">*</span></Label>
                <Input required value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} placeholder="e.g. Khanna Paper" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="e.g. Rajesh Khanna" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="e.g. Delhi" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button type="submit" size="sm" isLoading={createVendor.isPending}>Add Vendor</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </form>
        )}
        <div className="divide-y divide-border">
          {vendors?.map(v => (
            <div key={v.id} className="p-4 flex items-center gap-4 hover:bg-muted/20 transition-colors">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {v.vendorName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{v.vendorName}</p>
                <p className="text-xs text-muted-foreground">
                  {[v.contactPerson, v.phone, v.city].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                onClick={() => { if (confirm(`Delete vendor "${v.vendorName}"?`)) deleteVendor.mutate({ id: v.id }); }}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TemplatesSection() {
  const { data: templates, isLoading } = useJobTemplates();
  if (isLoading) return <LoadingSpinner />;
  return (
    <div className="space-y-4">
      {templates?.map(t => (
        <Card key={t.id} className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-bold text-foreground text-lg">{t.templateName}</h3>
              {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded font-mono">
              {t.machineNames?.length ?? t.routingSteps?.length ?? 0} steps
            </span>
          </div>
          {t.machineNames && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {t.machineNames.map((name, idx) => (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5 text-sm">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="font-medium">{name}</span>
                  </div>
                  {idx < t.machineNames.length - 1 && <ArrowRight size={14} className="text-muted-foreground shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          )}
        </Card>
      ))}
      {templates?.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">No job templates configured yet.</Card>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  return (
    <span className={cn(
      "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
      s === 'running' ? "bg-emerald-100 text-emerald-700" :
      s === 'maintenance' ? "bg-rose-100 text-rose-700" :
      "bg-gray-100 text-gray-600"
    )}>
      {status}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" />
    </div>
  );
}
```

---

**Commit message:**
```
feat: material rates UI — rate per unit, wastage %, reserved qty, low stock alerts
```

Then in Replit Shell run:
```
git pull
