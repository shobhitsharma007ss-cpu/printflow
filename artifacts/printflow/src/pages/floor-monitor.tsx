import React, { useState, useEffect, useRef } from "react";
import { useMachines } from "@/hooks/use-machines";
import { useJobs, useUpdateJobRoutingStatus, useUpdateJobRoutingNotes } from "@/hooks/use-jobs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card } from "@/components/ui-elements";
import { getStatusColor, getStatusDotColor, cn } from "@/lib/utils";
import { Factory, AlertCircle, Maximize2, Play, CheckCircle, ChevronRight, ArrowRight, Clock, AlertTriangle, X, Pause, RotateCcw, Timer, Zap } from "lucide-react";
import type { Machine, JobWithDetails, JobRouting } from "@workspace/api-client-react";

// ─── Pause reasons ────────────────────────────────────────────────────────────
const PAUSE_REASONS = [
  { value: "blanket-wash", label: "🧹 Blanket Wash", avg: "15-20 mins" },
  { value: "plate-change", label: "🔄 Plate Change", avg: "25-35 mins" },
  { value: "ink-change", label: "🎨 Ink Change", avg: "10-15 mins" },
  { value: "paper-jam", label: "📄 Paper Jam / Feed Issue", avg: "5-15 mins" },
  { value: "breakdown", label: "🔧 Machine Breakdown", avg: "varies" },
  { value: "break", label: "☕ Operator Break", avg: "15-30 mins" },
  { value: "other", label: "⚙️ Other", avg: "" },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function usePauseRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, notes }: { id: number; reason: string; notes?: string }) =>
      apiClient.patch(`/job-routing/${id}/pause`, { reason, notes }).then(r => r.data),
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
      apiClient.patch(`/job-routing/${id}/resume`, {}).then(r => r.data),
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
      const now = Date.now();
      const total = Math.floor((now - start) / 1000);
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

  const handleAdvanceStep = (routingId: number, newStatus: "pending" | "in-progress" | "completed") => {
    updateRouting.mutate({ id: routingId, data: { status: newStatus } });
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
          <button className="p-3 bg-muted rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Maximize2 size={20} />
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
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="text-2xl font-black tracking-tight">{machine.machineCode}</h3>
                            <p className="font-semibold text-muted-foreground text-sm">{machine.machineName}</p>
                          </div>
                          <div className="relative flex h-5 w-5">
                            {machine.status === "running" && !isPaused && (
                              <>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" style={{ animationDelay: '0.3s' }}></span>
                              </>
                            )}
                            {isPaused && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-5 w-5 ${isPaused ? 'bg-amber-400' : getStatusDotColor(machine.status)}`}></span>
                          </div>
                        </div>

                        {/* Current Job */}
                        <div className="bg-muted rounded-lg p-3 mb-3">
                          <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Current Job</span>
                          <span className="text-base font-bold text-primary break-words block">
                            {machine.currentJobName || "--- IDLE ---"}
                          </span>
                        </div>

                        {/* Live Timer + ETA */}
                        {activeInfo && (
                          <MachineTimer
                            step={activeInfo.step}
                            job={activeInfo.job}
                            isPaused={isPaused}
                          />
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
                          <span className="text-sm font-semibold text-foreground break-words block">
                            {nextJob ? nextJob.jobName : "Queue empty"}
                          </span>
                        </div>

                        {/* Active Step Controls */}
                        {activeInfo && (
                          <div className={cn(
                            "border rounded-lg p-3 mb-3",
                            isPaused
                              ? "bg-amber-500/5 border-amber-500/30"
                              : "bg-emerald-500/5 border-emerald-500/20"
                          )}>
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className={cn(
                                  "text-[10px] uppercase tracking-wider font-bold block",
                                  isPaused ? "text-amber-600" : "text-emerald-600"
                                )}>
                                  Step {activeInfo.step.stepNumber} — {isPaused ? "⏸ Paused" : "In Progress"}
                                </span>
                                <span className="text-xs font-semibold text-foreground">{activeInfo.job.jobCode}</span>
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1.5">
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
                                  <>
                                    <button
                                      onClick={() => setPauseModal({ routingId: activeInfo.step.id, machineName: machine.machineName, jobCode: activeInfo.job.jobCode })}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs font-bold rounded-lg hover:bg-amber-500/20 transition-colors"
                                    >
                                      <Pause size={12} />
                                      Pause
                                    </button>
                                    <button
                                      onClick={() => handleAdvanceStep(activeInfo.step.id, "completed")}
                                      disabled={updateRouting.isPending}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                                    >
                                      <CheckCircle size={12} />
                                      Done
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {activeInfo.step.notes && (
                              <p className="text-[10px] text-amber-600 bg-amber-500/10 rounded px-2 py-1 mb-2 line-clamp-2">
                                ⚠ {activeInfo.step.notes}
                              </p>
                            )}

                            {!isPaused && (
                              <button
                                onClick={() => handleOpenIssue(activeInfo.step, activeInfo.job)}
                                className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 font-semibold transition-colors"
                              >
                                <AlertTriangle size={10} />
                                Report Issue
                              </button>
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
                            <ChevronRight size={10} className={cn("transition-transform", isExpande
