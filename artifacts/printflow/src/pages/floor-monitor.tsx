import React, { useState, useEffect } from "react";
import { useMachines } from "@/hooks/use-machines";
import { useJobs, useUpdateJobRoutingStatus, useUpdateJobRoutingNotes } from "@/hooks/use-jobs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui-elements";
import { getStatusColor, getStatusDotColor, cn } from "@/lib/utils";
import { Factory, AlertCircle, Maximize2, Minimize2, Play, CheckCircle, ChevronRight, ArrowRight, Clock, AlertTriangle, X, Pause, Timer, Zap } from "lucide-react";
import type { Machine, JobWithDetails, JobRouting } from "@workspace/api-client-react";

// ─── Pause reasons ────────────────────────────────────────────────────────────
const PAUSE_REASONS = [
  { value: "blanket-wash",  label: "🧹 Blanket Wash",          avg: "15-20 mins" },
  { value: "plate-change",  label: "🔄 Plate Change",           avg: "25-35 mins" },
  { value: "ink-change",    label: "🎨 Ink Change",             avg: "10-15 mins" },
  { value: "paper-jam",     label: "📄 Paper Jam / Feed Issue", avg: "5-15 mins"  },
  { value: "breakdown",     label: "🔧 Machine Breakdown",      avg: "varies"     },
  { value: "break",         label: "☕ Operator Break",          avg: "15-30 mins" },
  { value: "other",         label: "⚙️ Other",                  avg: ""           },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function usePauseRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, notes }: { id: number; reason: string; notes?: string }) =>
      fetch(`/api/job-routing/${id}/pause`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      }).then(r => { if (!r.ok) throw new Error("Pause failed"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
  });
}

function useResumeRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) =>
      fetch(`/api/job-routing/${id}/resume`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(r => { if (!r.ok) throw new Error("Resume failed"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["machines"] });
    },
  });
}

// ─── Live timer hook ──────────────────────────────────────────────────────────
function useLiveTimer(startedAt: string | null, totalPausedSeconds: number, isPaused: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt || isPaused) return;
    const update = () => {
      const start = new Date(startedAt).getTime();
      const total = Math.floor((Date.now() - start) / 1000);
      setElapsed(Math.max(0, total - (totalPausedSeconds ?? 0)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, totalPausedSeconds, isPaused]);
  return elapsed;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Pause duration hook (counts up while paused) ─────────────────────────────
function usePauseDuration(pausedAt: string | null): number {
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!pausedAt) { setDuration(0); return; }
    const update = () => setDuration(Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [pausedAt]);
  return duration;
}

// ─── Inline pause badge (reason + live duration) ──────────────────────────────
function PauseBadge({ pauseReason, pausedAt }: { pauseReason: string | null; pausedAt: string | null }) {
  const duration = usePauseDuration(pausedAt);
  const label = PAUSE_REASONS.find(r => r.value === pauseReason)?.label ?? pauseReason ?? "Paused";
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{label}</p>
      <p className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-500">
        Paused {formatSeconds(duration)}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FloorMonitor() {
  const { data: machines, isLoading: machinesLoading } = useMachines();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const updateRouting = useUpdateJobRoutingStatus();
  const updateNotes = useUpdateJobRoutingNotes();
  const pauseRouting = usePauseRouting();
  const resumeRouting = useResumeRouting();

  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);
  const [issueModal, setIssueModal] = useState<{ routingId: number; stepNumber: number; jobCode: string } | null>(null);
  const [issueText, setIssueText] = useState("");
  const [pauseModal, setPauseModal] = useState<{ routingId: number; machineName: string; jobCode: string } | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseNotes, setPauseNotes] = useState("");
  const [completeModal, setCompleteModal] = useState<{ routingId: number; plannedQty: number; jobCode: string } | null>(null);
  const [actualQtyInput, setActualQtyInput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clockTime, setClockTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }));
    };
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const isLoading = machinesLoading || jobsLoading;
  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;
  if (!machines) return null;

  const activeJobs: JobWithDetails[] = jobs?.filter((j) => j.status === "in-progress" || j.status === "pending") ?? [];

  const getMachineActiveStep = (machineId: number): { step: JobRouting; job: JobWithDetails } | null => {
    for (const job of activeJobs) {
      const step = job.routing?.find((r) => r.machineId === machineId && (r.status === "in-progress" || r.status === "paused"));
      if (step) return { step, job };
    }
    return null;
  };

  const getMachinePendingStep = (machineId: number): { step: JobRouting; job: JobWithDetails } | null => {
    for (const job of activeJobs) {
      const step = job.routing?.find((r) => r.machineId === machineId && r.status === "pending");
      if (step) return { step, job };
    }
    return null;
  };

  const getMachineJobs = (machineId: number) =>
    activeJobs.filter((j) => j.routing?.some((r) => r.machineId === machineId && r.status !== "completed"));

  const getNextPendingJob = (machineId: number): JobWithDetails | null => {
    for (const job of activeJobs) {
      if (job.routing?.some((r) => r.machineId === machineId && r.status === "pending")) return job;
    }
    return null;
  };

  const handleAdvanceStep = (routingId: number, newStatus: "pending" | "in-progress" | "completed", actualQty?: number) => {
    updateRouting.mutate({ id: routingId, data: { status: newStatus, ...(actualQty !== undefined ? { actualQty } : {}) } });
  };

  const handleOpenCompleteModal = (step: { id: number }, job: JobWithDetails) => {
    setActualQtyInput(String(job.qtySheets));
    setCompleteModal({ routingId: step.id, plannedQty: job.qtySheets, jobCode: job.jobCode });
  };

  const handleSaveAndComplete = () => {
    if (!completeModal) return;
    const qty = parseInt(actualQtyInput, 10);
    if (isNaN(qty) || qty < 0 || actualQtyInput.trim() === "") return;
    handleAdvanceStep(completeModal.routingId, "completed", qty);
    setCompleteModal(null);
    setActualQtyInput("");
  };

  const handleSkipAndComplete = () => {
    if (!completeModal) return;
    handleAdvanceStep(completeModal.routingId, "completed");
    setCompleteModal(null);
    setActualQtyInput("");
  };

  const handleOpenIssue = (step: JobRouting, job: JobWithDetails) => {
    setIssueText(step.notes ?? "");
    setIssueModal({ routingId: step.id, stepNumber: step.stepNumber, jobCode: job.jobCode });
  };

  const handleSubmitIssue = () => {
    if (!issueModal || !issueText.trim()) return;
    updateNotes.mutate(
      { id: issueModal.routingId, data: { notes: issueText.trim() } },
      { onSettled: () => { setIssueModal(null); setIssueText(""); } }
    );
  };

  const handlePause = () => {
    if (!pauseModal || !pauseReason) return;
    pauseRouting.mutate(
      { id: pauseModal.routingId, reason: pauseReason, notes: pauseNotes || undefined },
      { onSettled: () => { setPauseModal(null); setPauseReason(""); setPauseNotes(""); } }
    );
  };

  const handleResume = (routingId: number) => {
    resumeRouting.mutate({ id: routingId });
  };

  const groupedMachines = machines.reduce((acc, machine) => {
    const key = machine.machineName === "Wohlenberg Cutter" ? "Pre-Press" : machine.machineType;
    if (!acc[key]) acc[key] = [];
    acc[key].push(machine);
    return acc;
  }, {} as Record<string, Machine[]>);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center bg-card p-6 rounded-xl border border-border shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Factory className="text-primary" size={32} />
            Live Floor Monitor
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">Real-time status of all factory equipment</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-3xl font-black text-primary tabular-nums">{clockTime}</span>
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              Running
            </span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400" /> Paused</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400" /> Idle</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> Maintenance</span>
          </div>
          <button
            onClick={handleFullscreen}
            className="p-3 bg-muted rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
        </div>
      </div>

      {/* Machine Groups */}
      {Object.entries(groupedMachines)
        .sort(([a], [b]) => a === "Pre-Press" ? -1 : b === "Pre-Press" ? 1 : 0)
        .map(([type, typeMachines]) => (
          <div key={type} className="space-y-4">
            <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
              {type === "Pre-Press" ? "Pre-Press" : `${type} Area`}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {typeMachines.map((machine) => {
                const activeInfo = getMachineActiveStep(machine.id);
                const pendingInfo = getMachinePendingStep(machine.id);
                const machineJobs = getMachineJobs(machine.id);
                const isExpanded = expandedMachine === machine.id;
                const nextJob = getNextPendingJob(machine.id);
                const isPaused = activeInfo?.step.status === "paused";

                return (
                  <div key={machine.id} className="relative">
                    {machine.status === "running" && !isPaused && (
                      <>
                        <div className="absolute -inset-1 rounded-xl bg-emerald-500/20 blur-lg animate-pulse pointer-events-none" />
                        <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/10 animate-pulse pointer-events-none" style={{ animationDelay: '0.5s' }} />
                      </>
                    )}
                    {isPaused && (
                      <div className="absolute -inset-1 rounded-xl bg-amber-500/20 blur-lg animate-pulse pointer-events-none" />
                    )}
                    <Card
                      className={cn(
                        "overflow-hidden border-t-4 hover:shadow-xl transition-all duration-300 relative z-10",
                        isExpanded && "ring-2 ring-primary/30",
                        machine.status === "running" && !isPaused && "ring-2 ring-emerald-500/50 shadow-emerald-500/20 shadow-lg",
                        isPaused && "ring-2 ring-amber-400/50 shadow-amber-400/20 shadow-lg"
                      )}
                      style={{ borderTopColor: isPaused ? '#f59e0b' : getMachineColorCode(machine.status) }}
                    >
                      <div className="p-5 relative">
                        {/* Machine header — NAME big, CODE small */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="text-2xl font-black tracking-tight">{machine.machineName}</h3>
                            <p className="text-xs text-muted-foreground font-medium">{machine.machineCode}</p>
                          </div>
                          <div className="relative flex h-6 w-6">
                            {machine.status === "running" && !isPaused && (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" style={{ animationDelay: '0.3s' }}></span>
                              </>
                            )}
                            {isPaused && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-6 w-6 ${isPaused ? 'bg-amber-400' : getStatusDotColor(machine.status)}`}></span>
                          </div>
                        </div>

                        {/* Current Job */}
                        <div className="bg-muted rounded-lg p-3 mb-3">
                          <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Current Job</span>
                          <span className="text-xl font-black text-primary break-words block">
                            {machine.currentJobName || "— IDLE —"}
                          </span>
                        </div>

                        {/* Live Timer */}
                        {activeInfo && (
                          <MachineTimer step={activeInfo.step} job={activeInfo.job} isPaused={isPaused} />
                        )}

                        {/* Job Progress Bar */}
                        {activeInfo && activeInfo.job.routing && activeInfo.job.routing.length > 0 && (() => {
                          const total = activeInfo.job.routing.length;
                          const completed = activeInfo.job.routing.filter(r => r.status === "completed").length;
                          const inProgress = activeInfo.job.routing.filter(r => r.status === "in-progress" || r.status === "paused").length;
                          const pct = Math.round(((completed + inProgress * 0.5) / total) * 100);
                          return (
                            <div className="mb-3 bg-muted/50 rounded-lg p-3">
                              <div className="flex justify-between text-[10px] font-bold mb-1.5">
                                <span className="text-muted-foreground uppercase tracking-wider">Job Progress</span>
                                <span className="text-emerald-600 font-black">{pct}%</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                                <div
                                  className="h-2.5 rounded-full transition-all duration-700 relative overflow-hidden"
                                  style={{ width: `${pct}%`, background: isPaused ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #22c55e, #16a34a)' }}
                                >
                                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-1">{completed} of {total} steps complete</div>
                            </div>
                          );
                        })()}

                        {/* Up Next */}
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Up Next</span>
                          <span className="text-base font-bold text-foreground break-words block">
                            {nextJob ? nextJob.jobName : "Queue empty"}
                          </span>
                        </div>

                        {/* Active Step Controls */}
                        {activeInfo && (
                          <div className={cn(
                            "border rounded-lg p-3 mb-3",
                            isPaused ? "bg-amber-500/5 border-amber-500/30" : "bg-emerald-500/5 border-emerald-500/20"
                          )}>
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold block",
                                  isPaused ? "text-amber-600" : "text-emerald-600"
                                )}>
                                  Step {activeInfo.step.stepNumber} — {isPaused ? "⏸ Paused" : "In Progress"}
                                </span>
                                <span className="text-xs font-semibold text-foreground">{activeInfo.job.jobCode}</span>
                                {isPaused && (
                                  <PauseBadge
                                    pauseReason={activeInfo.step.pauseReason ?? null}
                                    pausedAt={activeInfo.step.pausedAt ?? null}
                                  />
                                )}
                              </div>
                              {/* Pause / Resume button */}
                              {isPaused ? (
                                <button
                                  onClick={() => handleResume(activeInfo.step.id)}
                                  disabled={resumeRouting.isPending}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
                                >
                                  <Play size={12} />
                                  Resume
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPauseModal({ routingId: activeInfo.step.id, machineName: machine.machineName, jobCode: activeInfo.job.jobCode })}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs font-bold rounded-lg hover:bg-amber-500/20 transition-colors"
                                >
                                  <Pause size={12} />
                                  Pause
                                </button>
                              )}
                            </div>

                            {activeInfo.step.notes && (
                              <p className="text-[10px] text-amber-600 bg-amber-500/10 rounded px-2 py-1 mb-2 line-clamp-2">
                                ⚠ {activeInfo.step.notes}
                              </p>
                            )}

                            {/* Full-width Mark Complete */}
                            {!isPaused && (
                              <>
                                <button
                                  onClick={() => handleOpenCompleteModal(activeInfo.step, activeInfo.job)}
                                  disabled={updateRouting.isPending}
                                  className="w-full flex items-center justify-center gap-2 min-h-[48px] bg-emerald-500 text-white text-base font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 mb-2"
                                >
                                  <CheckCircle size={18} />
                                  Mark Complete
                                </button>
                                <button
                                  onClick={() => handleOpenIssue(activeInfo.step, activeInfo.job)}
                                  className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 font-semibold transition-colors"
                                >
                                  <AlertTriangle size={10} />
                                  Report Issue
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Pending Step — Start button */}
                        {!activeInfo && pendingInfo && machine.status !== "maintenance" && (
                          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600 block">Step {pendingInfo.step.stepNumber} — Waiting</span>
                                <span className="text-xs font-semibold text-foreground">{pendingInfo.job.jobCode} — {pendingInfo.job.jobName}</span>
                              </div>
                              <button
                                onClick={() => handleAdvanceStep(pendingInfo.step.id, "in-progress")}
                                disabled={updateRouting.isPending}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                              >
                                <Play size={12} />
                                Start
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Queue */}
                        {machineJobs.length > 1 && (
                          <button
                            onClick={() => setExpandedMachine(isExpanded ? null : machine.id)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3"
                          >
                            <Clock size={10} />
                            {machineJobs.length - 1} more queued
                            <ChevronRight size={10} className={cn("transition-transform", isExpanded && "rotate-90")} />
                          </button>
                        )}
                        {isExpanded && machineJobs.length > 1 && (
                          <div className="space-y-1.5 mb-3">
                            {machineJobs.slice(1).map((j) => (
                              <div key={j.id} className="text-xs bg-muted/50 rounded px-2 py-1.5 flex items-center gap-1.5">
                                <span className="font-mono font-bold">{j.jobCode}</span>
                                <span className="text-muted-foreground truncate">{j.jobName}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Operator + Status */}
                        <div className="flex justify-between items-end border-t border-border pt-3">
                          <div>
                            <span className="text-xs text-muted-foreground block mb-0.5">Operator</span>
                            <span className="text-base font-bold">{machine.operatorName}</span>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider border",
                            isPaused ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800" : getStatusColor(machine.status)
                          )}>
                            {isPaused ? "Paused" : machine.status}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {/* Active Job Progress */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
            Active Job Progress
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeJobs.map((job) => {
              const total = job.routing?.length ?? 0;
              const completed = job.routing?.filter(r => r.status === "completed").length ?? 0;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <Card key={job.id} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="font-mono text-sm font-bold text-primary">{job.jobCode}</span>
                      <h3 className="font-bold text-lg">{job.jobName}</h3>
                      <p className="text-xs text-muted-foreground">{job.clientName}</p>
                    </div>
                    <span className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-bold uppercase",
                      job.status === "in-progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    )}>
                      {job.status}
                    </span>
                  </div>
                  {total > 0 && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground font-medium">{completed} of {total} steps</span>
                        <span className="font-bold text-emerald-600">{pct}% complete</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-3 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #22c55e)' }}
                        />
                      </div>
                    </div>
                  )}
                  {job.routing && job.routing.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {job.routing.map((step, idx) => (
                        <React.Fragment key={step.id}>
                          <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            step.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                            step.status === "in-progress" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300" :
                            step.status === "paused" ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" :
                            "bg-muted text-muted-foreground"
                          )}>
                            <span className={cn(
                              "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                              step.status === "completed" ? "bg-emerald-500 text-white" :
                              step.status === "in-progress" ? "bg-blue-500 text-white" :
                              step.status === "paused" ? "bg-amber-500 text-white" :
                              "bg-muted-foreground/20 text-muted-foreground"
                            )}>
                              {step.status === "completed" ? "✓" : step.status === "paused" ? "⏸" : step.stepNumber}
                            </span>
                            <span className="hidden sm:inline truncate max-w-[80px]">{step.machineName}</span>
                            {step.notes && <AlertTriangle size={10} className="text-amber-500 shrink-0" />}
                          </div>
                          {idx < job.routing.length - 1 && <ArrowRight size={12} className="text-muted-foreground shrink-0" />}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!machines || machines.length === 0) && (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-bold">No Machines Found</h3>
          <p className="text-muted-foreground">Add machines to monitor them here.</p>
        </div>
      )}

      {/* Issue Modal */}
      {issueModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <h2 className="font-bold text-lg">Report Issue</h2>
              </div>
              <button onClick={() => setIssueModal(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">Step {issueModal.stepNumber} — </span>
                <span className="font-bold">{issueModal.jobCode}</span>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">Describe the issue</label>
                <textarea
                  value={issueText}
                  onChange={(e) => setIssueText(e.target.value)}
                  placeholder="e.g. Ink density inconsistent, roller pressure off, colour shift detected..."
                  rows={4}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setIssueModal(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-muted hover:bg-secondary rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmitIssue}
                disabled={!issueText.trim() || updateNotes.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <AlertTriangle size={14} />
                {updateNotes.isPending ? "Saving..." : "Submit Issue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Complete Modal */}
      {completeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" />
                <h2 className="font-bold text-lg">Mark Step Complete</h2>
              </div>
              <button onClick={() => setCompleteModal(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="font-bold">{completeModal.jobCode}</span>
                <span className="text-muted-foreground"> — step completed</span>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">
                  Actual sheets run
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={actualQtyInput}
                    onChange={(e) => setActualQtyInput(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-muted/50 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    placeholder={String(completeModal.plannedQty)}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">sheets</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Planned: <span className="font-semibold tabular-nums">{completeModal.plannedQty.toLocaleString()}</span> sheets
                  {(() => {
                    const qty = parseInt(actualQtyInput, 10);
                    if (!isNaN(qty) && qty < completeModal.plannedQty) {
                      return <span className="text-amber-600 font-semibold"> · {(completeModal.plannedQty - qty).toLocaleString()} wasted — will be logged</span>;
                    }
                    return null;
                  })()}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 p-5 pt-0">
              <button
                onClick={handleSaveAndComplete}
                disabled={updateRouting.isPending || actualQtyInput.trim() === "" || isNaN(parseInt(actualQtyInput, 10)) || parseInt(actualQtyInput, 10) < 0}
                className="w-full px-4 py-2.5 text-sm font-bold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={14} />
                {updateRouting.isPending ? "Saving..." : "Save & Complete"}
              </button>
              <button
                onClick={handleSkipAndComplete}
                disabled={updateRouting.isPending}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Mark complete without counting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {pauseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Pause size={18} className="text-amber-500" />
                <h2 className="font-bold text-lg">Pause Machine</h2>
              </div>
              <button onClick={() => setPauseModal(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="font-bold">{pauseModal.machineName}</span>
                <span className="text-muted-foreground"> — {pauseModal.jobCode}</span>
              </div>
              <div>
                <p className="text-sm font-bold mb-2">Why is the machine stopping?</p>
                <div className="space-y-2">
                  {PAUSE_REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => setPauseReason(r.value)}
                      className={cn(
                        "w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between",
                        pauseReason === r.value
                          ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                          : "border-border hover:border-amber-300"
                      )}
                    >
                      <span className="text-sm font-semibold">{r.label}</span>
                      {r.avg && <span className="text-xs text-muted-foreground">~{r.avg}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1.5">Notes (optional)</label>
                <textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="Any additional details..."
                  rows={2}
                  className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setPauseModal(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold bg-muted hover:bg-secondary rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handlePause}
                disabled={!pauseReason || pauseRouting.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Pause size={14} />
                {pauseRouting.isPending ? "Pausing..." : "Pause Machine"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Machine Timer Component ──────────────────────────────────────────────────
function MachineTimer({ step, job, isPaused }: { step: JobRouting; job: JobWithDetails; isPaused: boolean }) {
  const elapsed = useLiveTimer(
    step.startedAt ?? null,
    step.totalPausedSeconds ?? 0,
    isPaused
  );
  const etaSeconds = step.etaSeconds ?? 0;
  const remaining = Math.max(0, etaSeconds - elapsed);
  const pct = etaSeconds > 0 ? Math.min(100, Math.round((elapsed / etaSeconds) * 100)) : 0;
  const isOvertime = elapsed > etaSeconds && etaSeconds > 0;

  if (!step.startedAt) return null;

  return (
    <div className={cn(
      "rounded-lg p-3 mb-3 border",
      isPaused ? "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" :
      isOvertime ? "bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800" :
      "bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Timer size={12} className={isPaused ? "text-amber-600" : isOvertime ? "text-rose-600" : "text-blue-600"} />
          <span className={cn("text-[10px] uppercase tracking-wider font-bold",
            isPaused ? "text-amber-600" : isOvertime ? "text-rose-600" : "text-blue-600"
          )}>
            {isPaused ? "Paused" : isOvertime ? "Overtime" : "Running"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Zap size={10} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">
            ETA: {step.etaFormatted ?? "—"}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <span className="text-[10px] text-muted-foreground block">Elapsed</span>
          <span className={cn("text-sm font-black", isPaused ? "text-amber-600" : "text-foreground")}>
            {formatSeconds(elapsed)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Remaining</span>
          <span className={cn("text-sm font-black", isOvertime ? "text-rose-600" : "text-foreground")}>
            {isOvertime ? `+${formatSeconds(elapsed - etaSeconds)}` : formatSeconds(remaining)}
          </span>
        </div>
      </div>
      {etaSeconds > 0 && (
        <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
          <div
            className={cn("h-1.5 rounded-full transition-all duration-1000",
              isPaused ? "bg-amber-400" : isOvertime ? "bg-rose-500" : "bg-blue-500"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {isPaused && step.pausedAt && (
        <p className="text-[10px] text-amber-600 mt-1.5 font-medium tabular-nums">
          ⏸ Since {new Date(step.pausedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

function getMachineColorCode(status: string) {
  switch (status.toLowerCase()) {
    case 'running':     return '#22c55e';
    case 'idle':        return '#9ca3af';
    case 'maintenance': return '#ef4444';
    default:            return '#9ca3af';
  }
}
