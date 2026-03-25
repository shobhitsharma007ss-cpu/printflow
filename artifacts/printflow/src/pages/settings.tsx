import React, { useState } from "react";
import { useMachines, usePatchMachineStatus, useUpdateMachine } from "@/hooks/use-machines";
import { useMaterials, useUpdateMaterial } from "@/hooks/use-inventory";
import { useVendors, useCreateVendor, useDeleteVendor } from "@/hooks/use-vendors";
import { useJobTemplates } from "@/hooks/use-templates";
import { Card, Button, Input, Label, Select } from "@/components/ui-elements";
import { Settings as SettingsIcon, Cpu, Package, Users, Briefcase, Save, Plus, Trash2, ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

      {/* Section tabs */}
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

  const startEdit = (machine: any) => {
    setEditing(machine.id);
    setEditOperator(machine.operatorName ?? '');
  };

  const saveOperator = (machine: any) => {
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

  const toggleStatus = (machine: any) => {
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

function MaterialsSection() {
  const { data: materials, isLoading } = useMaterials();
  const updateMaterial = useUpdateMaterial();
  const [editing, setEditing] = useState<number | null>(null);
  const [editReorder, setEditReorder] = useState('');
  const [saved, setSaved] = useState<number | null>(null);

  const startEdit = (m: any) => {
    setEditing(m.id);
    setEditReorder(String(m.minReorderQty));
  };

  const save = (m: any) => {
    updateMaterial.mutate({
      id: m.id,
      data: {
        materialName: m.materialName,
        materialType: m.materialType,
        subType: m.subType ?? '',
        gsm: m.gsm ?? undefined,
        unit: m.unit,
        currentQty: parseFloat(String(m.currentQty)) || 0,
        minReorderQty: parseFloat(editReorder) || 0,
      }
    }, {
      onSuccess: () => {
        setEditing(null);
        setSaved(m.id);
        setTimeout(() => setSaved(null), 2000);
      }
    });
  };

  if (isLoading) return <LoadingSpinner />;

  const grouped = {
    board: materials?.filter(m => m.materialType === 'board') ?? [],
    paper: materials?.filter(m => m.materialType === 'paper') ?? [],
    consumable: materials?.filter(m => m.materialType === 'consumable') ?? [],
  };

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, items]) => (
        items.length > 0 && (
          <Card key={type} className="overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30">
              <h2 className="font-bold capitalize">{type === 'board' ? 'Boards' : type === 'paper' ? 'Paper' : 'Consumables'}</h2>
            </div>
            <div className="divide-y divide-border">
              {items.map(m => (
                <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="font-semibold">{m.materialName}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.gsm ? `${m.gsm} GSM · ` : ''}{m.unit}
                      {saved === m.id && <span className="text-emerald-500 ml-2 font-medium">Saved ✓</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs block">Current Qty</span>
                      <span className="font-bold">{m.currentQty} {m.unit}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Reorder Level</span>
                      {editing === m.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            value={editReorder}
                            onChange={e => setEditReorder(e.target.value)}
                            className="h-7 w-24 text-sm"
                          />
                          <button onClick={() => save(m)} className="p-1 bg-emerald-500 text-white rounded transition-colors hover:bg-emerald-600"><Check size={12} /></button>
                          <button onClick={() => setEditing(null)} className="p-1 bg-muted text-muted-foreground rounded hover:bg-muted/80"><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(m)} className="font-bold hover:text-primary transition-colors">
                          {m.minReorderQty} {m.unit}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )
      ))}
    </div>
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
    } }, {
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
            <Plus size={16} />
            Add Vendor
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
                onClick={() => {
                  if (confirm(`Delete vendor "${v.vendorName}"?`)) {
                    deleteVendor.mutate({ id: v.id });
                  }
                }}
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
              {(t as any).machineNames?.length ?? t.routingSteps?.length ?? 0} steps
            </span>
          </div>

          {(t as any).machineNames && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {((t as any).machineNames as string[]).map((name: string, idx: number) => (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5 text-sm">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="font-medium">{name}</span>
                  </div>
                  {idx < (t as any).machineNames.length - 1 && (
                    <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                  )}
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
