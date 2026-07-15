import React, { useState, useEffect } from "react";
import { useJobs, useJob, useUpdateJobStatus, useUpdateJobRoutingStatus } from "@/hooks/use-jobs";
import { useJobCostReport } from "@/hooks/use-reports";
import { Card, Button, Modal, Input, Label, Select } from "@/components/ui-elements";
import { format } from "date-fns";
import {
  Plus, Search, Filter, ChevronRight, X,
  CheckCircle, Play, AlertTriangle,
  Clock, User, TrendingDown, Check, Loader2, Timer, BarChart2,
  Truck, ExternalLink, PackageCheck
} from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import {
  useCreateWastageLog,
  useCreateJobDispatch,
  getGetJobQueryKey,
  getListJobsQueryKey,
  getListJobDispatchesQueryKey,
} from "@workspace/api-client-react";
import type { JobMaterial, CreateWastageLogRequestReason } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CreateJobWizard } from "@/components/create-job-wizard";
import { toast } from "sonner";

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: jobs, isLoading } = useJobs(statusFilter || undefined);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [wastageJobId, setWastageJobId] = useState<number | null>(null);

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
              <option value="dispatched">Dispatched</option>
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
                      <div className="flex items-center justify-end gap-2">
                        {job.status === "completed" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setWastageJobId(job.id); }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors whitespace-nowrap"
                          >
                            <TrendingDown size={12} />
                            Log Wastage
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedJobId && (
        <JobDetailPanel
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      {wastageJobId && (
        <StandaloneWastageModal
          jobId={wastageJobId}
          onClose={() => setWastageJobId(null)}
        />
      )}

      <CreateJobWizard isOpen={isNewJobOpen} onClose={() => setIsNewJobOpen(false)} />
    </div>
  );
}

function StandaloneWastageModal({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { data: job, isLoading } = useJob(jobId);
  if (isLoading) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Log Wastage">
        <div className="flex items-center justify-center py-10">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      </Modal>
    );
  }
  return (
    <LogWastageModal
      isOpen={true}
      onClose={onClose}
      jobId={jobId}
      jobMaterials={job?.materials ?? []}
    />
  );
}

function JobDetailPanel({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { data: job, isLoading } = useJob(jobId);
  const { data: costReport } = useJobCostReport(jobId);
  const updateRouting = useUpdateJobRoutingStatus();
  const updateStatus = useUpdateJobStatus();
  const [isWastageOpen, setIsWastageOpen] = useState(false);

  const materials = job?.materials ?? [];
  const wastageLogs = job?.wastageLogs ?? [];

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const completedSteps = job?.routing?.filter((r) => r.status === "completed").length ?? 0;
  const totalSteps = job?.routing?.length ?? 0;
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md z-50 shadow-2xl flex flex-col bg-background border-l border-border animate-slide-in-right overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !job ? null : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-border bg-muted/20 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-primary">{job.jobCode}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                <h3 className="font-bold text-lg leading-tight">{job.jobName}</h3>
                <p className="text-sm text-muted-foreground">{job.clientName}</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-3"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

              {/* Job info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Qty Ordered</p>
                  <p className="text-xl font-black">{job.qtySheets.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">sheets</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">Planned</p>
                  <p className="text-xl font-black">{(job.plannedSheets ?? job.qtySheets).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">incl. setup waste</p>
                </div>
                {job.scheduledDate && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Scheduled</p>
                    <p className="text-sm font-bold">{format(new Date(job.scheduledDate), "dd MMM yyyy")}</p>
                  </div>
                )}
                {job.materialName && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-0.5">Substrate</p>
                    <p className="text-sm font-bold truncate">{job.materialName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {[
                        job.materialGsm ? `${job.materialGsm} GSM` : null,
                        job.materialDimensions ? `${job.materialDimensions}"` : null,
                        job.materialGrain ? (job.materialGrain === "long" ? "LG" : "SG") : null,
                      ].filter(Boolean).join(" · ") || ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Routing Timeline */}
              {job.routing && job.routing.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Production Steps</h4>
                    <span className="text-xs font-medium text-muted-foreground">{completedSteps}/{totalSteps} done</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="space-y-2">
                    {job.routing.map((step, idx) => (
                      <div key={step.id} className={cn(
                        "rounded-xl border p-3 transition-all",
                        step.status === "completed" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800" :
                        step.status === "in-progress" ? "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 ring-1 ring-blue-300" :
                        "bg-muted/20 border-border"
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <span className={cn(
                              "w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5",
                              step.status === "completed" ? "bg-emerald-500 text-white" :
                              step.status === "in-progress" ? "bg-blue-500 text-white" :
                              "bg-muted-foreground/20 text-muted-foreground"
                            )}>
                              {step.status === "completed" ? <Check size={11} strokeWidth={3} /> :
                               step.status === "in-progress" ? <Loader2 size={11} className="animate-spin" /> :
                               <Timer size={11} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold">{step.machineName || `Machine ${step.machineId}`}</p>
                              {step.operatorName && (
                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <User size={9} /> {step.operatorName}
                                </p>
                              )}
                              {(step.startedAt || step.completedAt) && (
                                <div className="flex flex-col gap-0.5 mt-1">
                                  {step.startedAt && (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Clock size={9} /> Started: {format(new Date(step.startedAt), "dd MMM HH:mm")}
                                    </p>
                                  )}
                                  {step.completedAt && (
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                      <CheckCircle size={9} /> Done: {format(new Date(step.completedAt), "dd MMM HH:mm")}
                                    </p>
                                  )}
                                </div>
                              )}
                              {step.notes && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic flex items-start gap-1">
                                  <AlertTriangle size={9} className="shrink-0 mt-0.5" />
                                  {step.notes}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {step.status === "pending" && (
                              <button
                                onClick={() => updateRouting.mutate({ id: step.id, data: { status: "in-progress" } })}
                                disabled={updateRouting.isPending}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-bold hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Play size={9} /> Start
                              </button>
                            )}
                            {step.status === "in-progress" && (
                              <button
                                onClick={() => updateRouting.mutate({ id: step.id, data: { status: "completed" } })}
                                disabled={updateRouting.isPending}
                                className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-600 disabled:opacity-50 whitespace-nowrap"
                              >
                                <CheckCircle size={9} /> Done
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Material Usage */}
              {materials && materials.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Material Usage</h4>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-muted-foreground">Material</th>
                          <th className="px-3 py-2 text-right font-bold text-muted-foreground">Planned</th>
                          <th className="px-3 py-2 text-right font-bold text-muted-foreground">Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((m, idx) => (
                          <tr key={m.id} className={cn("border-t border-border", idx % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                            <td className="px-3 py-2 font-semibold">{m.materialName || `#${m.materialId}`}</td>
                            <td className="px-3 py-2 text-right font-mono">{m.plannedQty} {m.unit}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {m.actualQty != null ? (
                                <span className={cn(
                                  parseFloat(String(m.actualQty)) > parseFloat(String(m.plannedQty))
                                    ? "text-rose-500 font-bold"
                                    : "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {m.actualQty} {m.unit}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cost Breakdown */}
              {costReport && costReport.totalCost > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Cost Breakdown</h4>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-muted-foreground">Material</th>
                          <th className="px-3 py-2 text-right font-bold text-muted-foreground">Qty</th>
                          <th className="px-3 py-2 text-right font-bold text-muted-foreground">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costReport.materials?.map((m, idx) => (
                          <tr key={idx} className={cn("border-t border-border", idx % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                            <td className="px-3 py-2 font-semibold">{m.materialName}</td>
                            <td className="px-3 py-2 text-right font-mono">{m.plannedQty} {m.unit}</td>
                            <td className="px-3 py-2 text-right font-mono">₹{Number(m.totalCost ?? 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50">
                        <tr className="border-t border-border">
                          <td colSpan={2} className="px-3 py-2 font-bold text-right">Total</td>
                          <td className="px-3 py-2 text-right font-black text-primary">₹{Number(costReport.totalCost).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Budget vs Actual */}
              {job.quoteBudget && (() => {
                const snap = job.quoteBudget.costingSnapshot as Record<string, unknown>;
                const out = (snap?.outputs ?? {}) as Record<string, number>;
                const budgetPaper  = out.paperCost   ?? 0;
                const budgetPress  = out.pressCost   ?? 0;
                const budgetDie    = out.dieCutCost  ?? 0;
                const budgetGluer  = out.gluerCost   ?? 0;
                const budgetTotal  = Number(job.quoteBudget.preGstTotal ?? 0);
                const budgetFinal  = Number(job.quoteBudget.finalTotal  ?? 0);
                const budgetPer1k  = Number(job.quoteBudget.per1000Rate ?? 0);
                const actual = job.actualCostSummary;
                const hasActual = actual && actual.totalCost > 0;
                const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
                const fmtAmt = (v: number) => INR.format(Math.round(v));

                const VarCell = ({ budget, act }: { budget: number; act: number }) => {
                  if (!hasActual || act === 0) return <td className="px-3 py-2 text-right font-mono text-muted-foreground text-xs">—</td>;
                  const diff = act - budget;
                  const pct  = budget > 0 ? (diff / budget) * 100 : 0;
                  const over = diff > 0;
                  return (
                    <td className={cn("px-3 py-2 text-right font-mono text-xs font-bold", over ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                      {over ? "+" : ""}{fmtAmt(diff)}<br />
                      <span className="font-normal opacity-70">({over ? "+" : ""}{pct.toFixed(1)}%)</span>
                    </td>
                  );
                };

                const rows: { label: string; budget: number; act: number; alt?: boolean }[] = [
                  { label: "Paper / Board",  budget: budgetPaper,  act: actual?.paperCost   ?? 0 },
                  { label: "Press / Print",  budget: budgetPress,  act: actual?.pressCost   ?? 0, alt: true },
                  { label: "Die Cut",        budget: budgetDie,    act: actual?.dieCutCost  ?? 0 },
                  { label: "Folder Gluer",   budget: budgetGluer,  act: actual?.gluerCost   ?? 0, alt: true },
                ];
                const hasOther = (actual?.otherMachineCost ?? 0) > 0;

                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BarChart2 size={13} className="text-muted-foreground" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Budget vs Actual
                      </h4>
                      <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                        Quote v{job.quoteBudget.version}
                      </span>
                    </div>

                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold text-muted-foreground">Category</th>
                            <th className="px-3 py-2 text-right font-bold text-muted-foreground">Budget</th>
                            <th className="px-3 py-2 text-right font-bold text-muted-foreground">Actual</th>
                            <th className="px-3 py-2 text-right font-bold text-muted-foreground">Variance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ label, budget, act, alt }) => (
                            <tr key={label} className={cn("border-t border-border", alt ? "bg-muted/20" : "bg-background")}>
                              <td className="px-3 py-2 font-semibold">{label}</td>
                              <td className="px-3 py-2 text-right font-mono">{fmtAmt(budget)}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {hasActual && act > 0 ? fmtAmt(act) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <VarCell budget={budget} act={act} />
                            </tr>
                          ))}
                          {hasOther && (
                            <tr className="border-t border-border bg-background">
                              <td className="px-3 py-2 font-semibold text-muted-foreground">Other Machine</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                              <td className="px-3 py-2 text-right font-mono">{fmtAmt(actual!.otherMachineCost)}</td>
                              <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400 text-xs font-bold">unbudgeted</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot className="bg-muted/50">
                          <tr className="border-t-2 border-border">
                            <td className="px-3 py-2 font-black">Total (pre-GST)</td>
                            <td className="px-3 py-2 text-right font-black text-primary">{fmtAmt(budgetTotal)}</td>
                            <td className="px-3 py-2 text-right font-black">
                              {hasActual ? fmtAmt(actual!.totalCost) : <span className="text-muted-foreground font-normal">—</span>}
                            </td>
                            <VarCell budget={budgetTotal} act={actual?.totalCost ?? 0} />
                          </tr>
                          {budgetPer1k > 0 && (
                            <tr className="border-t border-border">
                              <td className="px-3 py-2 text-muted-foreground">Rate / 1k cartons</td>
                              <td className="px-3 py-2 text-right font-semibold font-mono">{fmtAmt(budgetPer1k)}</td>
                              <td colSpan={2} className="px-3 py-2 text-right text-muted-foreground text-[10px]">
                                {!hasActual && "Production not started"}
                              </td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                    </div>

                    {!hasActual && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        Actual costs populate as production starts and materials are logged.
                      </p>
                    )}

                    {/* Completed-job margin summary */}
                    {job.status === "completed" && hasActual && budgetFinal > 0 && (
                      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
                        <div className="px-3 py-2 bg-primary/10 border-b border-primary/20">
                          <h5 className="text-xs font-black uppercase tracking-wider text-primary">Job Margin Summary</h5>
                        </div>
                        <div className="p-3 space-y-2">
                          {(() => {
                            const revenue = budgetFinal;
                            const cost    = actual!.totalCost;
                            const profit  = revenue - cost;
                            const margin  = revenue > 0 ? (profit / revenue) * 100 : 0;
                            const positive = profit >= 0;
                            return (
                              <>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Quoted selling price</span>
                                  <span className="font-semibold font-mono">{fmtAmt(revenue)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Actual production cost</span>
                                  <span className="font-semibold font-mono">{fmtAmt(cost)}</span>
                                </div>
                                <div className={cn("flex justify-between text-sm font-black border-t border-primary/20 pt-2 mt-1", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                                  <span>{positive ? "Profit" : "Loss"}</span>
                                  <span className="font-mono">{positive ? "+" : ""}{fmtAmt(profit)} ({positive ? "+" : ""}{margin.toFixed(1)}%)</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dispatch Section */}
              {(job.status === "completed" || job.status === "dispatched") && (
                <DispatchSection job={job} />
              )}

              {/* Wastage Logs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Wastage Logs</h4>
                  <span className="text-xs text-muted-foreground">{wastageLogs?.length ?? 0} entries</span>
                </div>
                {(!wastageLogs || wastageLogs.length === 0) ? (
                  <div className="text-center py-6 text-muted-foreground text-xs bg-muted/20 rounded-xl border border-dashed border-border">
                    No wastage recorded for this job
                  </div>
                ) : (
                  <div className="space-y-2">
                    {wastageLogs.map((w) => (
                      <div key={w.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs">
                        <div className="flex justify-between items-start">
                          <span className="font-bold">{w.materialName || `Material #${w.materialId}`}</span>
                          <span className={cn("font-black text-sm", w.wastagePct > 5 ? "text-rose-500" : "text-amber-600 dark:text-amber-400")}>
                            {Number(w.wastagePct).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1 text-muted-foreground">
                          <span>{Number(w.wastageQty).toFixed(0)} wasted</span>
                          <span className="capitalize">{w.reason.replace(/-/g, " ")}</span>
                        </div>
                        <div className="flex justify-between items-center mt-0.5 text-muted-foreground">
                          <span>Plan: {Number(w.plannedQty).toFixed(0)} → Actual: {Number(w.actualQty).toFixed(0)}</span>
                          <span>{format(new Date(w.loggedAt), "dd MMM HH:mm")}</span>
                        </div>
                        {w.notes && (
                          <p className="mt-1.5 text-muted-foreground italic border-t border-amber-200 dark:border-amber-800 pt-1.5">
                            {w.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t border-border p-4 space-y-2 shrink-0 bg-background">
              <a
                href={`/job-card/${job.id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted transition-colors"
              >
                🖨 Print Job Card (QR)
              </a>
              {(job.status === "completed" || job.status === "dispatched") && (
                <Button
                  onClick={() => setIsWastageOpen(true)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white border-0"
                >
                  <TrendingDown size={14} className="mr-2" />
                  Log Wastage
                </Button>
              )}
              {job.status === "pending" && (
                <Button
                  onClick={() => updateStatus.mutate({ id: job.id, data: { status: "in-progress" } })}
                  className="w-full"
                  isLoading={updateStatus.isPending}
                >
                  <Play size={14} className="mr-2" /> Start Job
                </Button>
              )}
              {job.status === "in-progress" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => updateStatus.mutate({ id: job.id, data: { status: "on-hold" } })}
                    isLoading={updateStatus.isPending}
                  >
                    Hold
                  </Button>
                  <Button
                    onClick={() => updateStatus.mutate({ id: job.id, data: { status: "completed" } })}
                    isLoading={updateStatus.isPending}
                  >
                    <CheckCircle size={14} className="mr-1" /> Complete
                  </Button>
                </div>
              )}
              {job.status === "on-hold" && (
                <Button
                  onClick={() => updateStatus.mutate({ id: job.id, data: { status: "in-progress" } })}
                  className="w-full"
                  isLoading={updateStatus.isPending}
                >
                  Resume Job
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <LogWastageModal
        isOpen={isWastageOpen}
        onClose={() => setIsWastageOpen(false)}
        jobId={jobId}
        jobMaterials={materials ?? []}
      />
    </>
  );
}

function DispatchSection({ job }: { job: NonNullable<ReturnType<typeof useJob>["data"]> }) {
  const queryClient = useQueryClient();
  const summary = job.dispatchSummary ?? { dispatches: [], totalDispatched: 0, remaining: job.qtySheets };
  const { dispatches, totalDispatched, remaining } = summary;
  const dispatchedPct = job.qtySheets > 0 ? Math.min(100, (totalDispatched / job.qtySheets) * 100) : 0;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    dispatchQty: '',
    dispatchDate: new Date().toISOString().split('T')[0],
    vehicleNumber: '',
    lrNumber: '',
    transporterName: '',
    notes: '',
  });

  const createDispatch = useCreateJobDispatch({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(job.id) });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListJobDispatchesQueryKey(job.id) });
        toast.success("Dispatch recorded", {
          description: `${data.dispatchQty.toLocaleString("en-IN")} sheets dispatched. ${data.remaining} remaining.`,
        });
        setShowForm(false);
        setForm({ dispatchQty: '', dispatchDate: new Date().toISOString().split('T')[0], vehicleNumber: '', lrNumber: '', transporterName: '', notes: '' });
      },
      onError: (err: any) => {
        const msg = err?.message ?? "Failed to record dispatch.";
        toast.error(msg);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(form.dispatchQty, 10);
    if (!qty || qty <= 0) return;
    createDispatch.mutate({
      id: job.id,
      data: {
        dispatchQty: qty,
        dispatchDate: form.dispatchDate,
        vehicleNumber: form.vehicleNumber.trim() || undefined,
        lrNumber: form.lrNumber.trim() || undefined,
        transporterName: form.transporterName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Truck size={12} /> Dispatch & Delivery
        </h4>
        {remaining > 0 && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/40 transition-colors"
          >
            <Truck size={11} /> {showForm ? "Cancel" : "Record Dispatch"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Dispatched</span>
          <span className="font-bold font-mono">
            {totalDispatched.toLocaleString("en-IN")} / {job.qtySheets.toLocaleString("en-IN")} sheets
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", dispatchedPct >= 100 ? "bg-emerald-500" : "bg-blue-500")}
            style={{ width: `${dispatchedPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className={cn("font-medium", remaining === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {remaining === 0 ? (
              <span className="flex items-center gap-1"><PackageCheck size={10} /> Fully dispatched</span>
            ) : (
              `${remaining.toLocaleString("en-IN")} sheets remaining`
            )}
          </span>
          <span className="text-muted-foreground">{dispatchedPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Dispatch form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3 mb-3 space-y-3">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">New Dispatch Entry</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Qty (sheets) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                required
                min="1"
                max={remaining}
                value={form.dispatchQty}
                onChange={e => setForm({ ...form, dispatchQty: e.target.value })}
                placeholder={`max ${remaining.toLocaleString("en-IN")}`}
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                required
                value={form.dispatchDate}
                onChange={e => setForm({ ...form, dispatchDate: e.target.value })}
                className="text-sm h-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Vehicle No.</Label>
              <Input
                value={form.vehicleNumber}
                onChange={e => setForm({ ...form, vehicleNumber: e.target.value })}
                placeholder="e.g. MH-12-AB-1234"
                className="text-sm h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">LR No.</Label>
              <Input
                value={form.lrNumber}
                onChange={e => setForm({ ...form, lrNumber: e.target.value })}
                placeholder="e.g. LR-2024-0001"
                className="text-sm h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Transporter</Label>
            <Input
              value={form.transporterName}
              onChange={e => setForm({ ...form, transporterName: e.target.value })}
              placeholder="e.g. Shree Transport"
              className="text-sm h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Notes</Label>
            <Input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional note..."
              className="text-sm h-8"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              type="submit"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 border-0 text-white"
              isLoading={createDispatch.isPending}
              disabled={!form.dispatchQty || createDispatch.isPending}
            >
              <Truck size={11} className="mr-1" /> Confirm Dispatch
            </Button>
          </div>
        </form>
      )}

      {/* Dispatch history */}
      {dispatches.length > 0 && (
        <div className="space-y-2">
          {dispatches.map((d, idx) => (
            <div key={d.id} className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-sm font-mono">{d.dispatchQty.toLocaleString("en-IN")}</span>
                    <span className="text-muted-foreground">sheets</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{d.dispatchDate}</span>
                  </div>
                  {(d.vehicleNumber || d.lrNumber || d.transporterName) && (
                    <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      {d.vehicleNumber && <span>🚛 {d.vehicleNumber}</span>}
                      {d.lrNumber && <span>LR: {d.lrNumber}</span>}
                      {d.transporterName && <span>{d.transporterName}</span>}
                    </div>
                  )}
                  {d.notes && <p className="text-muted-foreground italic mt-1">{d.notes}</p>}
                </div>
                <a
                  href={`/delivery-challan/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap shrink-0"
                >
                  <ExternalLink size={9} /> Challan
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {dispatches.length === 0 && !showForm && (
        <div className="text-center py-5 text-muted-foreground text-xs bg-muted/20 rounded-xl border border-dashed border-border">
          No dispatches recorded yet
        </div>
      )}
    </div>
  );
}

type LogWastageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  jobMaterials: JobMaterial[];
};

function LogWastageModal({ isOpen, onClose, jobId, jobMaterials }: LogWastageModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    materialId: '',
    plannedQty: '',
    actualQty: '',
    reason: 'setup',
    notes: '',
  });

  const createWastage = useCreateWastageLog({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetJobQueryKey(jobId) });
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast.success("Wastage logged", { description: "Entry saved successfully." });
        handleClose();
      },
      onError: () => {
        toast.error("Failed to log wastage. Please try again.");
      }
    }
  });

  // When material selection changes, auto-fill planned qty (always from job materials, always read-only)
  const handleMaterialChange = (materialId: string) => {
    const jm = jobMaterials.find(m => String(m.materialId) === materialId);
    setForm(prev => ({
      ...prev,
      materialId,
      plannedQty: jm ? String(Number(jm.plannedQty)) : '',
      actualQty: '',
    }));
  };

  const plannedNum = parseFloat(form.plannedQty) || 0;
  const actualNum = parseFloat(form.actualQty) || 0;
  const wastageQty = Math.max(0, actualNum - plannedNum);
  const wastagePct = plannedNum > 0 ? (wastageQty / plannedNum) * 100 : 0;

  const selectedJobMat = jobMaterials.find(m => String(m.materialId) === form.materialId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialId || !form.plannedQty || !form.actualQty) return;

    createWastage.mutate({
      data: {
        jobId,
        materialId: parseInt(form.materialId),
        plannedQty: parseFloat(form.plannedQty),
        actualQty: parseFloat(form.actualQty),
        reason: form.reason as CreateWastageLogRequestReason,
        notes: form.notes.trim() || undefined,
      }
    });
  };

  const handleClose = () => {
    onClose();
    setForm({ materialId: '', plannedQty: '', actualQty: '', reason: 'setup', notes: '' });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Log Wastage">
      <form onSubmit={handleSubmit} className="space-y-4">
        {jobMaterials.length === 0 ? (
          <div className="rounded-lg p-4 bg-muted/50 border border-border text-sm text-muted-foreground text-center">
            No materials are assigned to this job. Assign materials before logging wastage.
          </div>
        ) : (
          <>
        <div className="space-y-1.5">
          <Label>Material <span className="text-destructive">*</span></Label>
          <Select required value={form.materialId} onChange={e => handleMaterialChange(e.target.value)}>
            <option value="">— Select from job materials —</option>
            {jobMaterials.map(m => (
              <option key={m.materialId} value={m.materialId}>
                {m.materialName || `Material #${m.materialId}`} [{m.unit}] — plan: {Number(m.plannedQty).toFixed(0)}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>
              Planned Qty <span className="text-destructive">*</span>
              {selectedJobMat && (
                <span className="ml-1 text-[10px] text-primary font-normal">(from job plan)</span>
              )}
            </Label>
            <Input
              type="number"
              required
              min="0"
              step="0.01"
              value={form.plannedQty}
              readOnly
              className="bg-muted cursor-not-allowed opacity-80"
              placeholder="Select a material first"
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
              <span className="font-bold">{Number(wastageQty || 0).toFixed(2)} units ({Number(wastagePct || 0).toFixed(1)}%)</span>
            </div>
            {wastagePct > 5 && (
              <p className="text-xs text-rose-500 mt-1 flex items-center gap-1">
                <AlertTriangle size={12} /> High wastage percentage
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
          <textarea
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder="Add any additional context about this wastage..."
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

          <div className="pt-2 flex justify-end gap-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button type="submit" isLoading={createWastage.isPending} disabled={!form.materialId || !form.plannedQty || !form.actualQty}>Log Wastage</Button>
          </div>
          </>
        )}
        {jobMaterials.length === 0 && (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={handleClose}>Close</Button>
          </div>
        )}
      </form>
    </Modal>
  );
}

