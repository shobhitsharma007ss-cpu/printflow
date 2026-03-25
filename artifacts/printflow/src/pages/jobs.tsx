import React, { useState } from "react";
import { useJobs, useJob, useCreateJob, useUpdateJobStatus, useUpdateJobRoutingStatus } from "@/hooks/use-jobs";
import { useMaterials } from "@/hooks/use-inventory";
import { useJobTemplates } from "@/hooks/use-templates";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-elements";
import { format } from "date-fns";
import {
  Plus, Search, Filter, ChevronRight, ArrowRight, X,
  CheckCircle, Play, AlertTriangle, Package, FileText
} from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import {
  useListWastageLogs,
  useCreateWastageLog,
  useGetJobMaterials,
  getListWastageLogsQueryKey,
  getGetJobMaterialsQueryKey,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: jobs, isLoading } = useJobs(statusFilter || undefined);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Job Management</h1>
          <p className="text-muted-foreground mt-1">Track and schedule production orders</p>
        </div>
        <Button onClick={() => setIsNewJobOpen(true)} className="flex items-center gap-2 shadow-lg hover:shadow-primary/25">
          <Plus size={18} strokeWidth={3} />
          Create New Job
        </Button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Card className="overflow-hidden border border-border">
            <div className="p-4 border-b border-border bg-muted/30 flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input className="pl-9 bg-background" placeholder="Search job code or client..." />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={16} className="text-muted-foreground" />
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-background w-full sm:w-40"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-bold">Job Code</th>
                    <th className="px-6 py-4 font-bold">Client / Name</th>
                    <th className="px-6 py-4 font-bold">Material Details</th>
                    <th className="px-6 py-4 font-bold">Qty (Sheets)</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Scheduled Date</th>
                    <th className="px-6 py-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="inline-block animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></td></tr>
                  ) : jobs?.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No jobs found matching criteria.</td></tr>
                  ) : (
                    jobs?.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJobId(job.id)}
                        className={cn(
                          "bg-card border-b border-border hover:bg-muted/30 transition-colors cursor-pointer",
                          selectedJobId === job.id && "bg-primary/5"
                        )}
                      >
                        <td className="px-6 py-4 font-bold text-foreground whitespace-nowrap">{job.jobCode}</td>
                        <td className="px-6 py-4">
                          <div className="font-semibold">{job.clientName}</div>
                          <div className="text-muted-foreground text-xs mt-0.5">{job.jobName}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium">{job.materialName || 'Not specified'}</span>
                          {job.materialGsm && <span className="text-muted-foreground ml-1">({job.materialGsm} GSM)</span>}
                        </td>
                        <td className="px-6 py-4 font-mono font-medium">{job.qtySheets.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {job.scheduledDate ? format(new Date(job.scheduledDate), "dd MMM yyyy") : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id); }}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                          >
                            <ChevronRight size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {selectedJobId && (
          <JobDetailPanel jobId={selectedJobId} onClose={() => setSelectedJobId(null)} />
        )}
      </div>

      <NewJobModal isOpen={isNewJobOpen} onClose={() => setIsNewJobOpen(false)} />
    </div>
  );
}

function JobDetailPanel({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { data: job, isLoading } = useJob(jobId);
  const { data: materials } = useGetJobMaterials(jobId);
  const { data: wastageLogs } = useListWastageLogs({ jobId });
  const updateRouting = useUpdateJobRoutingStatus();
  const updateStatus = useUpdateJobStatus();
  const [isWastageOpen, setIsWastageOpen] = useState(false);

  if (isLoading) return (
    <div className="w-96 shrink-0">
      <Card className="p-6 sticky top-0">
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </Card>
    </div>
  );

  if (!job) return null;

  const completedSteps = (job as any).routing?.filter((r: any) => r.status === "completed").length ?? 0;
  const totalSteps = (job as any).routing?.length ?? 0;
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <div className="w-96 shrink-0">
      <Card className="p-5 sticky top-0 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="font-mono text-sm font-bold text-primary">{job.jobCode}</span>
            <h3 className="font-bold text-lg leading-tight">{job.jobName}</h3>
            <p className="text-sm text-muted-foreground">{job.clientName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
            {job.status}
          </span>
          {job.scheduledDate && (
            <span className="text-xs text-muted-foreground">
              Due: {format(new Date(job.scheduledDate), "dd MMM yyyy")}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Qty</p>
            <p className="text-lg font-black">{job.qtySheets.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">sheets</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Planned</p>
            <p className="text-lg font-black">{(job.plannedSheets ?? job.qtySheets).toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">sheets (incl. waste)</p>
          </div>
        </div>

        {job.materialName && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold">
              {job.materialName}
            </span>
            {job.materialGsm && (
              <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                {job.materialGsm} GSM
              </span>
            )}
          </div>
        )}

        {/* Routing Progress */}
        {(job as any).routing && (job as any).routing.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Routing Progress</h4>
              <span className="text-xs font-medium">{completedSteps}/{totalSteps}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="space-y-2">
              {(job as any).routing.map((step: any) => (
                <div key={step.id} className={cn(
                  "flex items-center justify-between rounded-lg p-2.5 text-xs border transition-all",
                  step.status === "completed" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" :
                  step.status === "in-progress" ? "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 ring-1 ring-blue-300" :
                  "bg-muted/30 border-border"
                )}>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                      step.status === "completed" ? "bg-emerald-500 text-white" :
                      step.status === "in-progress" ? "bg-blue-500 text-white" :
                      "bg-muted-foreground/20 text-muted-foreground"
                    )}>
                      {step.status === "completed" ? "✓" : step.stepNumber}
                    </span>
                    <div>
                      <span className="font-bold block">{step.machineName || `Machine ${step.machineId}`}</span>
                      <span className="text-muted-foreground capitalize">{step.status}</span>
                    </div>
                  </div>
                  {step.status === "pending" && (
                    <button
                      onClick={() => updateRouting.mutate({ id: step.id, data: { status: "in-progress" } })}
                      disabled={updateRouting.isPending}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded font-bold hover:bg-blue-600 disabled:opacity-50"
                    >
                      <Play size={10} /> Start
                    </button>
                  )}
                  {step.status === "in-progress" && (
                    <button
                      onClick={() => updateRouting.mutate({ id: step.id, data: { status: "completed" } })}
                      disabled={updateRouting.isPending}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded font-bold hover:bg-emerald-600 disabled:opacity-50"
                    >
                      <CheckCircle size={10} /> Done
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {materials && materials.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Materials</h4>
            <div className="space-y-1.5">
              {materials.map((m: any) => (
                <div key={m.id} className="bg-muted/40 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{m.materialName || `Material #${m.materialId}`}</span>
                    <span className="text-muted-foreground">{m.plannedQty} {m.unit}</span>
                  </div>
                  {m.actualQty != null && (
                    <div className="flex justify-between items-center mt-1 text-muted-foreground">
                      <span>Actual: {m.actualQty} {m.unit}</span>
                      {m.costPerUnit != null && <span>@ ₹{m.costPerUnit}/{m.unit}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Wastage Logs */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wastage Logs</h4>
            <button
              onClick={() => setIsWastageOpen(true)}
              className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
            >
              <Plus size={10} /> Log Wastage
            </button>
          </div>
          {(!wastageLogs || wastageLogs.length === 0) ? (
            <p className="text-xs text-muted-foreground">No wastage recorded yet</p>
          ) : (
            <div className="space-y-1.5">
              {wastageLogs.map((w: any) => (
                <div key={w.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{w.materialName || `Material #${w.materialId}`}</span>
                    <span className={cn("font-bold", parseFloat(w.wastagePct) > 5 ? "text-rose-500" : "text-amber-600")}>
                      {parseFloat(w.wastagePct).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-muted-foreground">
                    <span>{w.wastageQty} wasted (plan: {w.plannedQty}, actual: {w.actualQty})</span>
                    <span className="capitalize">{w.reason.replace("-", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="border-t border-border pt-3 space-y-2">
          {job.status === "pending" && (
            <Button
              onClick={() => updateStatus.mutate({ id: job.id, data: { status: "in-progress" } })}
              className="w-full text-xs"
              isLoading={updateStatus.isPending}
            >
              <Play size={12} className="mr-1" /> Start Job
            </Button>
          )}
          {job.status === "in-progress" && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => updateStatus.mutate({ id: job.id, data: { status: "on-hold" } })}
                className="text-xs"
                isLoading={updateStatus.isPending}
              >
                Hold
              </Button>
              <Button
                onClick={() => updateStatus.mutate({ id: job.id, data: { status: "completed" } })}
                className="text-xs"
                isLoading={updateStatus.isPending}
              >
                <CheckCircle size={12} className="mr-1" /> Complete
              </Button>
            </div>
          )}
          {job.status === "on-hold" && (
            <Button
              onClick={() => updateStatus.mutate({ id: job.id, data: { status: "in-progress" } })}
              className="w-full text-xs"
              isLoading={updateStatus.isPending}
            >
              Resume Job
            </Button>
          )}
        </div>

        <LogWastageModal isOpen={isWastageOpen} onClose={() => setIsWastageOpen(false)} jobId={jobId} />
      </Card>
    </div>
  );
}

function LogWastageModal({ isOpen, onClose, jobId }: { isOpen: boolean; onClose: () => void; jobId: number }) {
  const { data: allMaterials } = useMaterials();
  const queryClient = useQueryClient();
  const createWastage = useCreateWastageLog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWastageLogsQueryKey({ jobId }) });
        queryClient.invalidateQueries({ queryKey: getGetJobMaterialsQueryKey(jobId) });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        onClose();
        setForm({ materialId: '', plannedQty: '', actualQty: '', reason: 'setup' });
      },
      onError: () => {
        alert("Failed to log wastage. Please try again.");
      }
    }
  });

  const [form, setForm] = useState({
    materialId: '',
    plannedQty: '',
    actualQty: '',
    reason: 'setup',
  });

  const wastageQty = Math.max(0, (parseFloat(form.actualQty) || 0) - (parseFloat(form.plannedQty) || 0));
  const wastagePct = (parseFloat(form.plannedQty) || 0) > 0
    ? ((wastageQty / (parseFloat(form.plannedQty) || 1)) * 100)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialId || !form.plannedQty || !form.actualQty) return;

    createWastage.mutate({
      data: {
        jobId,
        materialId: parseInt(form.materialId),
        plannedQty: parseFloat(form.plannedQty),
        actualQty: parseFloat(form.actualQty),
        reason: form.reason as any,
      }
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ materialId: '', plannedQty: '', actualQty: '', reason: 'setup' });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Log Wastage">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Material <span className="text-destructive">*</span></Label>
          <Select required value={form.materialId} onChange={e => setForm({ ...form, materialId: e.target.value })}>
            <option value="">— Select Material —</option>
            {allMaterials?.map(m => (
              <option key={m.id} value={m.id}>{m.materialName} [{m.unit}]</option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Planned Qty <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.plannedQty}
              onChange={e => setForm({ ...form, plannedQty: e.target.value })}
              placeholder="e.g. 5000"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Actual Qty <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.actualQty}
              onChange={e => setForm({ ...form, actualQty: e.target.value })}
              placeholder="e.g. 5200"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Reason <span className="text-destructive">*</span></Label>
          <Select required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}>
            <option value="setup">Setup wastage</option>
            <option value="mis-registration">Mis-registration</option>
            <option value="client-correction">Client correction</option>
            <option value="plate-change">Plate change</option>
            <option value="other">Other</option>
          </Select>
        </div>

        {form.plannedQty && form.actualQty && (
          <div className={cn(
            "rounded-lg p-3 text-sm border",
            wastagePct > 5 ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
          )}>
            <div className="flex justify-between">
              <span className="font-medium">Wastage:</span>
              <span className="font-bold">{wastageQty.toFixed(2)} units ({wastagePct.toFixed(1)}%)</span>
            </div>
            {wastagePct > 5 && (
              <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> High wastage percentage
              </p>
            )}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={createWastage.isPending}>Log Wastage</Button>
        </div>
      </form>
    </Modal>
  );
}

function NewJobModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data: materials } = useMaterials();
  const { data: templates } = useJobTemplates();
  const createMutation = useCreateJob();

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    clientName: '',
    jobName: '',
    materialId: '',
    qtySheets: '',
    templateId: '',
    scheduledDate: today,
  });

  const selectedTemplate = templates?.find(t => t.id === parseInt(form.templateId)) ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        clientName: form.clientName,
        jobName: form.jobName,
        materialId: form.materialId ? parseInt(form.materialId) : undefined,
        materialGsm: form.materialId ? (materials?.find(m => m.id === parseInt(form.materialId))?.gsm ?? undefined) : undefined,
        qtySheets: parseInt(form.qtySheets) || 0,
        plannedSheets: Math.ceil((parseInt(form.qtySheets) || 0) * 1.04),
        templateId: form.templateId ? parseInt(form.templateId) : undefined,
        scheduledDate: form.scheduledDate || undefined,
      }
    }, {
      onSuccess: () => {
        onClose();
        setForm({ clientName: '', jobName: '', materialId: '', qtySheets: '', templateId: '', scheduledDate: today });
      }
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ clientName: '', jobName: '', materialId: '', qtySheets: '', templateId: '', scheduledDate: today });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create New Production Job">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Client Name <span className="text-destructive">*</span></Label>
            <Input
              required
              value={form.clientName}
              onChange={e => setForm({ ...form, clientName: e.target.value })}
              placeholder="e.g. Tiranga Packaging"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Job Name <span className="text-destructive">*</span></Label>
            <Input
              required
              value={form.jobName}
              onChange={e => setForm({ ...form, jobName: e.target.value })}
              placeholder="e.g. Carton Box 350gsm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Material</Label>
            <Select
              value={form.materialId}
              onChange={e => setForm({ ...form, materialId: e.target.value })}
            >
              <option value="">— No material selected —</option>
              {materials?.map(m => (
                <option key={m.id} value={m.id}>
                  {m.materialName}{m.gsm ? ` (${m.gsm}gsm)` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity (Sheets) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              required
              min="1"
              value={form.qtySheets}
              onChange={e => setForm({ ...form, qtySheets: e.target.value })}
              placeholder="e.g. 5000"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Job Template (Routing)</Label>
          <Select
            value={form.templateId}
            onChange={e => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">— Custom (no template) —</option>
            {templates?.map(t => (
              <option key={t.id} value={t.id}>{t.templateName}</option>
            ))}
          </Select>
        </div>

        {selectedTemplate && (selectedTemplate as any).machineNames && (
          <div className="bg-muted/50 rounded-xl p-4 border border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Routing Steps</p>
            <div className="flex flex-wrap items-center gap-2">
              {((selectedTemplate as any).machineNames as string[]).map((name: string, idx: number) => (
                <React.Fragment key={idx}>
                  <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-3 py-1.5 shadow-sm">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <span className="text-sm font-semibold">{name}</span>
                  </div>
                  {idx < (selectedTemplate as any).machineNames.length - 1 && (
                    <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
            {selectedTemplate.description && (
              <p className="text-xs text-muted-foreground mt-3">{selectedTemplate.description}</p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Scheduled Date</Label>
          <Input
            type="date"
            value={form.scheduledDate}
            onChange={e => setForm({ ...form, scheduledDate: e.target.value })}
          />
        </div>

        {form.qtySheets && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
            Planned sheets (with 4% setup wastage): <strong>{Math.ceil(parseInt(form.qtySheets) * 1.04).toLocaleString()}</strong>
          </div>
        )}

        <div className="pt-2 flex justify-end gap-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Job</Button>
        </div>
      </form>
    </Modal>
  );
}
