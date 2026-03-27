import React, { useState, useMemo } from "react";
import { useMaterials } from "@/hooks/use-inventory";
import { useJobTemplates } from "@/hooks/use-templates";
import { useMachines } from "@/hooks/use-machines";
import { useCreateJob } from "@/hooks/use-jobs";
import { Card, Button, Modal, Input, Label, Select } from "@/components/ui-elements";
import { AddStockWizard } from "@/components/add-stock-wizard";
import { cn } from "@/lib/utils";
import {
  ArrowRight, ArrowLeft, Check, AlertTriangle, Plus, X,
  Printer, Droplets, Scissors, Package, Info, GripVertical,
  Zap, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import type { Machine, Material } from "@workspace/api-client-react";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS = [
  "Job Basics",
  "Board / Paper",
  "Finish & Coating",
  "Ink & Consumables",
  "Routing",
  "Review & Confirm",
];

const COATING_TYPES = [
  { value: "none", label: "No Coating", icon: X },
  { value: "varnish", label: "Varnish", icon: Droplets },
  { value: "uv", label: "UV Coating", icon: Zap },
  { value: "aqueous", label: "Aqueous", icon: Droplets },
  { value: "texture", label: "Texture", icon: Droplets },
  { value: "drip-off", label: "Drip-off", icon: Droplets },
  { value: "led-uv", label: "LED UV", icon: Zap },
];

const FINISH_OPTIONS = [
  { value: "die-cutting", label: "Die Cutting", icon: Scissors },
  { value: "folder-gluing", label: "Folder Gluing", icon: Package },
  { value: "foil-stamping", label: "Foil Stamping", icon: Zap },
  { value: "embossing", label: "Embossing", icon: Zap },
];

type InkEntry = { materialId: number; name: string; unit: string; planned: string; available: number };

interface JobForm {
  clientName: string;
  jobName: string;
  scheduledDate: string;
  materialId: string;
  qtySheets: string;
  coatingType: string;
  finishRequirements: string[];
  printMachineId: string;
  inks: InkEntry[];
  routing: { machineId: number; machineName: string }[];
  templateId: string;
}

export function CreateJobWizard({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: templates } = useJobTemplates();
  const { data: machines } = useMachines();
  const createMutation = useCreateJob();
  const [step, setStep] = useState<WizardStep>(1);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [existingClients, setExistingClients] = useState<string[]>([]);

  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<JobForm>({
    clientName: "",
    jobName: "",
    scheduledDate: today,
    materialId: "",
    qtySheets: "",
    coatingType: "none",
    finishRequirements: [],
    printMachineId: "",
    inks: [],
    routing: [],
    templateId: "",
  });

  const boardsMats = useMemo(
    () => materials?.filter((m) => m.materialType === "board" || m.materialType === "paper") || [],
    [materials]
  );

  const selectedMaterial = materials?.find((m) => m.id === parseInt(form.materialId)) ?? null;

  const printingMachines = useMemo(
    () => machines?.filter((m) => m.machineType === "printing") || [],
    [machines]
  );

  const cuttingMachines = useMemo(
    () => machines?.filter((m) => m.machineType === "cutting") || [],
    [machines]
  );

  const gluingMachines = useMemo(
    () => machines?.filter((m) => m.machineType === "gluing") || [],
    [machines]
  );

  const coatingMachines = useMemo(
    () => machines?.filter((m) => m.machineType === "coating") || [],
    [machines]
  );

  const wohlenberg = useMemo(
    () => machines?.find((m) => m.machineName === "Wohlenberg Cutter"),
    [machines]
  );

  const recommendedMachine = useMemo(() => {
    if (!printingMachines.length) return null;
    const coating = form.coatingType;
    if (coating === "varnish") {
      const gl = printingMachines.find((m) => m.capabilities.includes("varnish-single-pass"));
      return gl ? { machine: gl, reason: "Can apply varnish in single pass, saves Single Coater machine time" } : null;
    }
    if (coating === "uv" || coating === "texture" || coating === "drip-off" || coating === "led-uv") {
      const la = printingMachines.find((m) => m.capabilities.includes("uv-single-pass"));
      return la ? { machine: la, reason: `Can apply ${coating.replace("-", " ")} in single pass` } : null;
    }
    if (form.finishRequirements.includes("non-woven") || coating === "none") {
      const idle = printingMachines.find((m) => m.status === "idle" && m.capabilities.includes("print"));
      return idle ? { machine: idle, reason: "Currently idle and available" } : { machine: printingMachines[0], reason: "Default printing machine" };
    }
    return { machine: printingMachines[0], reason: "Default printing machine" };
  }, [form.coatingType, form.finishRequirements, printingMachines]);

  const buildInkEstimates = () => {
    if (!materials) return;
    const qty = parseInt(form.qtySheets) || 0;
    const defaultEstimate = qty * 0.002;
    const coating = form.coatingType;

    const inkMap: { subType: string; name: string }[] = [
      { subType: "cyan-ink", name: "Cyan Ink" },
      { subType: "magenta-ink", name: "Magenta Ink" },
      { subType: "yellow-ink", name: "Yellow Ink" },
      { subType: "black-ink", name: "Black Ink (K)" },
    ];

    if (coating === "uv" || coating === "texture" || coating === "drip-off") {
      inkMap.push({ subType: "uv-ink", name: "UV Ink" });
    }
    if (coating === "led-uv") {
      inkMap.push({ subType: "led-uv-ink", name: "LED UV Ink" });
    }
    if (coating === "varnish") {
      inkMap.push({ subType: "varnish", name: "Varnish" });
    }
    if (coating === "aqueous") {
      inkMap.push({ subType: "aqueous-coating", name: "Aqueous Coating" });
    }
    if (form.finishRequirements.includes("folder-gluing")) {
      inkMap.push({ subType: "gum", name: "Gum/Adhesive" });
    }

    const newInks: InkEntry[] = [];
    for (const ink of inkMap) {
      const mat = materials.find((m) => m.subType === ink.subType);
      if (mat) {
        const existing = form.inks.find((i) => i.materialId === mat.id);
        newInks.push({
          materialId: mat.id,
          name: ink.name,
          unit: mat.unit,
          planned: existing?.planned || defaultEstimate.toFixed(2),
          available: parseFloat(String(mat.currentQty)),
        });
      }
    }
    setForm((prev) => ({ ...prev, inks: newInks }));
  };

  const buildRouting = () => {
    const steps: { machineId: number; machineName: string }[] = [];
    const printMId = parseInt(form.printMachineId);
    const printMachine = machines?.find((m) => m.id === printMId);

    if (wohlenberg) {
      steps.push({ machineId: wohlenberg.id, machineName: wohlenberg.machineName });
    }

    if (printMachine) {
      steps.push({ machineId: printMachine.id, machineName: printMachine.machineName });
    }

    const coating = form.coatingType;
    const needsStandaloneCoat =
      coating !== "none" &&
      printMachine &&
      !(
        (coating === "varnish" && printMachine.capabilities.includes("varnish-single-pass")) ||
        (["uv", "texture", "drip-off", "led-uv"].includes(coating) && printMachine.capabilities.includes("uv-single-pass"))
      );
    if (needsStandaloneCoat && coatingMachines.length > 0) {
      steps.push({ machineId: coatingMachines[0].id, machineName: coatingMachines[0].machineName });
    }

    if (form.finishRequirements.includes("die-cutting")) {
      const dc = cuttingMachines.find((m) => m.machineName.includes("Bobst Die Cutter") && m.status !== "maintenance");
      if (dc) steps.push({ machineId: dc.id, machineName: dc.machineName });
    }

    if (form.finishRequirements.includes("folder-gluing")) {
      const fg = gluingMachines.find((m) => m.status === "idle");
      if (fg) steps.push({ machineId: fg.id, machineName: fg.machineName });
    }

    setForm((prev) => ({ ...prev, routing: steps }));
  };

  const goNext = () => {
    if (step === 3) {
      if (recommendedMachine && !form.printMachineId) {
        setForm((prev) => ({ ...prev, printMachineId: String(recommendedMachine.machine.id) }));
      }
    }
    if (step === 3) {
      setTimeout(() => buildInkEstimates(), 0);
    }
    if (step === 4) {
      setTimeout(() => buildRouting(), 0);
    }
    setStep((s) => Math.min(6, s + 1) as WizardStep);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1) as WizardStep);

  const toggleFinish = (val: string) => {
    setForm((prev) => ({
      ...prev,
      finishRequirements: prev.finishRequirements.includes(val)
        ? prev.finishRequirements.filter((f) => f !== val)
        : [...prev.finishRequirements, val],
    }));
  };

  const qtyNum = parseInt(form.qtySheets) || 0;
  const plannedSheets = Math.ceil(qtyNum * 1.04);
  const stockAvailable = selectedMaterial ? parseFloat(String(selectedMaterial.currentQty)) : 0;
  const stockInsufficient = selectedMaterial && qtyNum > 0 && qtyNum > stockAvailable;

  const canGoNext = () => {
    switch (step) {
      case 1: return form.clientName.trim() && form.jobName.trim();
      case 2: return form.materialId && qtyNum > 0;
      case 3: return true;
      case 4: return true;
      case 5: return form.routing.length > 0;
      case 6: return true;
      default: return false;
    }
  };

  const handleSubmit = () => {
    const jobMaterials = [
      ...(selectedMaterial
        ? [{
            materialId: selectedMaterial.id,
            plannedQty: plannedSheets,
            unit: selectedMaterial.unit,
          }]
        : []),
      ...form.inks
        .filter((i) => parseFloat(i.planned) > 0)
        .map((i) => ({
          materialId: i.materialId,
          plannedQty: parseFloat(i.planned),
          unit: i.unit,
        })),
    ];

    createMutation.mutate(
      {
        data: {
          clientName: form.clientName.trim(),
          jobName: form.jobName.trim(),
          materialId: selectedMaterial?.id ?? undefined,
          materialGsm: selectedMaterial?.gsm ?? undefined,
          qtySheets: qtyNum,
          plannedSheets,
          customRouting: form.routing.map((r) => r.machineId),
          scheduledDate: form.scheduledDate || undefined,
          coatingType: form.coatingType !== "none" ? form.coatingType : undefined,
          finishRequirements: form.finishRequirements.length > 0 ? form.finishRequirements : undefined,
          materials: jobMaterials.length > 0 ? jobMaterials : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Job created", { description: `New job created successfully.` });
          handleClose();
        },
        onError: () => {
          toast.error("Failed to create job");
        },
      }
    );
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setForm({
      clientName: "",
      jobName: "",
      scheduledDate: today,
      materialId: "",
      qtySheets: "",
      coatingType: "none",
      finishRequirements: [],
      printMachineId: "",
      inks: [],
      routing: [],
      templateId: "",
    });
  };

  const removeRoutingStep = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      routing: prev.routing.filter((_, i) => i !== idx),
    }));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= form.routing.length) return;
    const newRouting = [...form.routing];
    const [moved] = newRouting.splice(from, 1);
    newRouting.splice(to, 0, moved);
    setForm((prev) => ({ ...prev, routing: newRouting }));
  };

  const addRoutingMachine = (machineId: number) => {
    const machine = machines?.find((m) => m.id === machineId);
    if (!machine) return;
    if (form.routing.some((r) => r.machineId === machineId)) return;
    setForm((prev) => ({
      ...prev,
      routing: [...prev.routing, { machineId: machine.id, machineName: machine.machineName }],
    }));
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Create New Production Job">
        <div className="min-h-[450px] flex flex-col">
          <div className="flex items-center justify-between mb-6 px-1">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = (idx + 1) as WizardStep;
              const isActive = step === stepNum;
              const isDone = step > stepNum;
              return (
                <React.Fragment key={idx}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActive
                          ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isDone ? <Check size={14} strokeWidth={3} /> : stepNum}
                    </div>
                    <span className={cn("text-[10px] font-medium whitespace-nowrap", isActive ? "text-primary" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </div>
                  {idx < STEP_LABELS.length - 1 && (
                    <div className={cn("flex-1 h-0.5 mx-1 mt-[-12px]", step > stepNum ? "bg-emerald-500" : "bg-muted")} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="flex-1">
            {step === 1 && (
              <Step1Basics form={form} setForm={setForm} />
            )}

            {step === 2 && (
              <Step2Material
                form={form}
                setForm={setForm}
                boardsMats={boardsMats}
                selectedMaterial={selectedMaterial}
                stockInsufficient={!!stockInsufficient}
                stockAvailable={stockAvailable}
                qtyNum={qtyNum}
                plannedSheets={plannedSheets}
                onAddMaterial={() => setIsWizardOpen(true)}
              />
            )}

            {step === 3 && (
              <Step3Coating
                form={form}
                setForm={setForm}
                toggleFinish={toggleFinish}
                printingMachines={printingMachines}
                recommendedMachine={recommendedMachine}
              />
            )}

            {step === 4 && (
              <Step4Inks form={form} setForm={setForm} qtyNum={qtyNum} />
            )}

            {step === 5 && (
              <Step5Routing
                form={form}
                routing={form.routing}
                machines={machines || []}
                removeStep={removeRoutingStep}
                moveStep={moveStep}
                addMachine={addRoutingMachine}
              />
            )}

            {step === 6 && (
              <Step6Review
                form={form}
                selectedMaterial={selectedMaterial}
                plannedSheets={plannedSheets}
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            {step > 1 ? (
              <Button type="button" variant="ghost" onClick={goBack} className="gap-1">
                <ArrowLeft size={14} /> Back
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
            )}
            {step < 6 ? (
              <Button type="button" onClick={goNext} disabled={!canGoNext()} className="gap-1">
                Next <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                isLoading={createMutation.isPending}
                className="gap-1"
              >
                <Check size={14} /> Confirm & Create Job
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <AddStockWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
    </>
  );
}

function Step1Basics({ form, setForm }: { form: JobForm; setForm: React.Dispatch<React.SetStateAction<JobForm>> }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Client Name <span className="text-destructive">*</span></Label>
        <Input
          required
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          placeholder="e.g. Tiranga Packaging"
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label>Job Name <span className="text-destructive">*</span></Label>
        <Input
          required
          value={form.jobName}
          onChange={(e) => setForm({ ...form, jobName: e.target.value })}
          placeholder="e.g. Carton Box 350gsm"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Scheduled Date</Label>
        <Input
          type="date"
          value={form.scheduledDate}
          onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
        />
      </div>
    </div>
  );
}

function Step2Material({
  form, setForm, boardsMats, selectedMaterial, stockInsufficient, stockAvailable, qtyNum, plannedSheets, onAddMaterial,
}: {
  form: JobForm;
  setForm: React.Dispatch<React.SetStateAction<JobForm>>;
  boardsMats: Material[];
  selectedMaterial: Material | null;
  stockInsufficient: boolean;
  stockAvailable: number;
  qtyNum: number;
  plannedSheets: number;
  onAddMaterial: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block">Select Board / Paper <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
          {boardsMats.map((m) => {
            const isSelected = form.materialId === String(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setForm({ ...form, materialId: String(m.id) })}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-sm">{m.materialName}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {m.gsm && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{m.gsm} GSM</span>}
                      {m.dimensions && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{m.dimensions}"</span>}
                      {m.grain && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded capitalize">{m.grain} Grain</span>}
                      {m.vendorName && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{m.vendorName}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold">{parseFloat(String(m.currentQty)).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{m.unit} available</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onAddMaterial} className="text-xs text-primary font-semibold hover:underline mt-2">
          + Add new material to inventory
        </button>
      </div>

      <div className="space-y-1.5">
        <Label>Quantity (Sheets) <span className="text-destructive">*</span></Label>
        <Input
          type="number"
          required
          min="1"
          value={form.qtySheets}
          onChange={(e) => setForm({ ...form, qtySheets: e.target.value })}
          placeholder="e.g. 5000"
        />
      </div>

      {stockInsufficient && (
        <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-400">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Only <strong>{stockAvailable.toLocaleString()}</strong> {selectedMaterial?.unit} available, you need <strong>{qtyNum.toLocaleString()}</strong>
          </span>
        </div>
      )}

      {qtyNum > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
          Planned sheets (with 4% setup wastage): <strong>{plannedSheets.toLocaleString()}</strong>
        </div>
      )}
    </div>
  );
}

function Step3Coating({
  form, setForm, toggleFinish, printingMachines, recommendedMachine,
}: {
  form: JobForm;
  setForm: React.Dispatch<React.SetStateAction<JobForm>>;
  toggleFinish: (val: string) => void;
  printingMachines: Machine[];
  recommendedMachine: { machine: Machine; reason: string } | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Printing Machine</Label>
        <div className="grid grid-cols-1 gap-2">
          {printingMachines.map((m) => {
            const isSelected = form.printMachineId === String(m.id);
            const isRecommended = recommendedMachine?.machine.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setForm({ ...form, printMachineId: String(m.id) })}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{m.machineName}</span>
                      {isRecommended && (
                        <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {m.capabilities.join(", ")} | {m.speedPerHour?.toLocaleString()} sheets/hr
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    m.status === "idle" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                    m.status === "running" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                  )}>
                    {m.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {recommendedMachine && (
          <div className="flex items-start gap-2 mt-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              <strong>Recommended: {recommendedMachine.machine.machineName}</strong> — {recommendedMachine.reason}
            </span>
          </div>
        )}
      </div>

      <div>
        <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Coating Type</Label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {COATING_TYPES.map((ct) => {
            const isSelected = form.coatingType === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => setForm({ ...form, coatingType: ct.value })}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl border p-3 text-xs font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <ct.icon size={16} />
                {ct.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Finishing (multi-select)</Label>
        <div className="grid grid-cols-2 gap-2">
          {FINISH_OPTIONS.map((fo) => {
            const isSelected = form.finishRequirements.includes(fo.value);
            return (
              <button
                key={fo.value}
                type="button"
                onClick={() => toggleFinish(fo.value)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <fo.icon size={16} />
                {fo.label}
                {isSelected && <Check size={14} className="ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step4Inks({ form, setForm, qtyNum }: { form: JobForm; setForm: React.Dispatch<React.SetStateAction<JobForm>>; qtyNum: number }) {
  const updateInk = (idx: number, value: string) => {
    const newInks = [...form.inks];
    newInks[idx] = { ...newInks[idx], planned: value };
    setForm((prev) => ({ ...prev, inks: newInks }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
        <Info size={12} className="inline mr-1" />
        Default estimate: {qtyNum.toLocaleString()} sheets x 0.002 kg = {(qtyNum * 0.002).toFixed(2)} kg per ink
      </div>
      <div className="space-y-3">
        {form.inks.map((ink, idx) => {
          const insufficient = parseFloat(ink.planned) > ink.available;
          return (
            <div key={ink.materialId} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-sm font-semibold">{ink.name}</Label>
                  <span className={cn("text-[10px] font-medium",
                    insufficient ? "text-rose-500" : "text-muted-foreground"
                  )}>
                    {ink.available} {ink.unit} in stock
                  </span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ink.planned}
                    onChange={(e) => updateInk(idx, e.target.value)}
                    className={cn(insufficient && "border-rose-300 dark:border-rose-700")}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{ink.unit}</span>
                </div>
                {insufficient && (
                  <p className="text-[10px] text-rose-500 mt-0.5 flex items-center gap-1">
                    <AlertTriangle size={10} /> Insufficient stock
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {form.inks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No ink or consumable estimates needed for this configuration.
        </div>
      )}
    </div>
  );
}

function Step5Routing({
  form, routing, machines, removeStep, moveStep, addMachine,
}: {
  form: JobForm;
  routing: { machineId: number; machineName: string }[];
  machines: Machine[];
  removeStep: (idx: number) => void;
  moveStep: (from: number, to: number) => void;
  addMachine: (machineId: number) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const unusedMachines = machines.filter(
    (m) => !routing.some((r) => r.machineId === m.id) && m.status !== "maintenance"
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {routing.map((r, idx) => {
          const machine = machines.find((m) => m.id === r.machineId);
          return (
            <div key={`${r.machineId}-${idx}`} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => moveStep(idx, idx - 1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronRight size={12} className="-rotate-90" />
                </button>
                <button type="button" onClick={() => moveStep(idx, idx + 1)} disabled={idx === routing.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronRight size={12} className="rotate-90" />
                </button>
              </div>
              <span className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{r.machineName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {machine?.machineType} | {machine?.operatorName}
                  {machine?.speedPerHour ? ` | ${machine.speedPerHour.toLocaleString()} sph` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeStep(idx)}
                className="p-1.5 text-muted-foreground hover:text-rose-500 transition-colors rounded-md hover:bg-muted"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {routing.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No routing steps yet. Add machines below.
        </div>
      )}

      <div className="relative">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className="w-full gap-1"
        >
          <Plus size={14} /> Add Machine Step
        </Button>
        {addMenuOpen && unusedMachines.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
            {unusedMachines.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { addMachine(m.id); setAddMenuOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors border-b border-border last:border-0 flex items-center justify-between"
              >
                <span className="font-medium">{m.machineName}</span>
                <span className="text-[10px] text-muted-foreground">{m.machineType}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {routing.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {routing.map((r, idx) => (
            <React.Fragment key={`flow-${idx}`}>
              <span className="bg-muted px-2 py-1 rounded text-xs font-medium">{r.machineName}</span>
              {idx < routing.length - 1 && <ArrowRight size={14} className="text-muted-foreground" />}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function Step6Review({
  form, selectedMaterial, plannedSheets,
}: {
  form: JobForm;
  selectedMaterial: Material | null;
  plannedSheets: number;
}) {
  const qtyNum = parseInt(form.qtySheets) || 0;

  const allInksAvailable = form.inks.every((i) => parseFloat(i.planned) <= i.available);
  const stockAvailable = selectedMaterial ? parseFloat(String(selectedMaterial.currentQty)) : 0;
  const paperAvailable = !selectedMaterial || qtyNum <= stockAvailable;

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-border p-4 space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Job Details</h4>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Client</p>
            <p className="font-semibold">{form.clientName}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Job Name</p>
            <p className="font-semibold">{form.jobName}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Scheduled</p>
            <p className="font-semibold">{form.scheduledDate || "Not set"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Quantity</p>
            <p className="font-semibold">{qtyNum.toLocaleString()} sheets (planned: {plannedSheets.toLocaleString()})</p>
          </div>
        </div>
      </div>

      {selectedMaterial && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Material</h4>
          <p className="font-semibold">{selectedMaterial.materialName}</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedMaterial.gsm && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{selectedMaterial.gsm} GSM</span>}
            {selectedMaterial.vendorName && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{selectedMaterial.vendorName}</span>}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border p-4 space-y-2">
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Coating & Finish</h4>
        <p className="font-semibold capitalize">{form.coatingType === "none" ? "No coating" : form.coatingType.replace("-", " ")}</p>
        {form.finishRequirements.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.finishRequirements.map((f) => (
              <span key={f} className="text-[10px] bg-muted px-1.5 py-0.5 rounded capitalize">{f.replace("-", " ")}</span>
            ))}
          </div>
        )}
      </div>

      {form.inks.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Ink & Consumables</h4>
          <div className="space-y-1">
            {form.inks.filter((i) => parseFloat(i.planned) > 0).map((i) => (
              <div key={i.materialId} className="flex justify-between text-xs">
                <span>{i.name}</span>
                <span className="font-mono">{parseFloat(i.planned).toFixed(2)} {i.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {form.routing.length > 0 && (
        <div className="rounded-xl border border-border p-4 space-y-2">
          <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Routing</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {form.routing.map((r, idx) => (
              <React.Fragment key={idx}>
                <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2.5 py-1">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                  <span className="text-xs font-semibold">{r.machineName}</span>
                </div>
                {idx < form.routing.length - 1 && <ArrowRight size={14} className="text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className={cn("rounded-xl border p-3 text-xs flex items-center gap-2",
        paperAvailable && allInksAvailable
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
          : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400"
      )}>
        {paperAvailable && allInksAvailable ? (
          <>
            <Check size={14} className="shrink-0" />
            <span className="font-semibold">All materials available</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} className="shrink-0" />
            <span className="font-semibold">Some materials have insufficient stock — job will be created but stock warnings apply</span>
          </>
        )}
      </div>
    </div>
  );
}
