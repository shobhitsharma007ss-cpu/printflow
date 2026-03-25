import React, { useState } from "react";
import { useMachines } from "@/hooks/use-machines";
import { useJobs, useUpdateJobRoutingStatus, useUpdateJobRoutingNotes } from "@/hooks/use-jobs";
import { Card } from "@/components/ui-elements";
import { getStatusColor, getStatusDotColor, isAnimatedStatus, cn } from "@/lib/utils";
import { Factory, AlertCircle, Maximize2, Play, CheckCircle, ChevronRight, ArrowRight, Clock, AlertTriangle, X } from "lucide-react";
import type { Machine, JobWithDetails, JobRouting } from "@workspace/api-client-react";

export default function FloorMonitor() {
  const { data: machines, isLoading: machinesLoading } = useMachines();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const updateRouting = useUpdateJobRoutingStatus();
  const updateNotes = useUpdateJobRoutingNotes();
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);
  const [issueModal, setIssueModal] = useState<{ routingId: number; stepNumber: number; jobCode: string } | null>(null);
  const [issueText, setIssueText] = useState("");

  const isLoading = machinesLoading || jobsLoading;

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;
  if (!machines) return null;

  const activeJobs: JobWithDetails[] = jobs?.filter((j) => j.status === "in-progress" || j.status === "pending") ?? [];

  const getMachineJobs = (machineId: number) => {
    return activeJobs.filter((j) => 
      j.routing?.some((r) => r.machineId === machineId && r.status !== "completed")
    );
  };

  const getMachineActiveStep = (machineId: number): { step: JobRouting; job: JobWithDetails } | null => {
    for (const job of activeJobs) {
      const step = job.routing?.find((r) => r.machineId === machineId && r.status === "in-progress");
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

  const handleAdvanceStep = (routingId: number, newStatus: string) => {
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
      {
        onSettled: () => {
          setIssueModal(null);
          setIssueText("");
        }
      }
    );
  };

  const groupedMachines = machines.reduce((acc, machine) => {
    if (!acc[machine.machineType]) acc[machine.machineType] = [];
    acc[machine.machineType].push(machine);
    return acc;
  }, {} as Record<string, Machine[]>);

  return (
    <div className="space-y-8 animate-fade-in">
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
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Running</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400" /> Idle</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> Maintenance</span>
          </div>
          <button className="p-3 bg-muted rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Maximize2 size={20} />
          </button>
        </div>
      </div>

      {Object.entries(groupedMachines).map(([type, typeMachines]) => (
        <div key={type} className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
            {type} Area
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {typeMachines.map((machine) => {
              const activeInfo = getMachineActiveStep(machine.id);
              const pendingInfo = getMachinePendingStep(machine.id);
              const machineJobs = getMachineJobs(machine.id);
              const isExpanded = expandedMachine === machine.id;

              return (
                <Card 
                  key={machine.id} 
                  className={cn(
                    "overflow-hidden border-t-4 hover:shadow-xl transition-all duration-300",
                    isExpanded && "ring-2 ring-primary/30"
                  )}
                  style={{ borderTopColor: getMachineColorCode(machine.status) }}
                >
                  <div className="p-5 relative">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">{machine.machineCode}</h3>
                        <p className="font-semibold text-muted-foreground text-sm">{machine.machineName}</p>
                      </div>
                      <div className="relative flex h-5 w-5">
                        {isAnimatedStatus(machine.status) && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-5 w-5 ${getStatusDotColor(machine.status)}`}></span>
                      </div>
                    </div>

                    <div className="bg-muted rounded-lg p-3 mb-3">
                      <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Current Job</span>
                      <span className="text-base font-bold text-primary break-words block">
                        {machine.currentJobName || "--- IDLE ---"}
                      </span>
                    </div>

                    {/* In-progress step: Complete + Report Issue buttons */}
                    {activeInfo && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 block">Step {activeInfo.step.stepNumber} — In Progress</span>
                            <span className="text-xs font-semibold text-foreground">{activeInfo.job.jobCode}</span>
                          </div>
                          <button
                            onClick={() => handleAdvanceStep(activeInfo.step.id, "completed")}
                            disabled={updateRouting.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={12} />
                            Complete
                          </button>
                        </div>
                        {activeInfo.step.notes && (
                          <p className="text-[10px] text-amber-600 bg-amber-500/10 rounded px-2 py-1 mb-2 line-clamp-2">
                            ⚠ {activeInfo.step.notes}
                          </p>
                        )}
                        <button
                          onClick={() => handleOpenIssue(activeInfo.step, activeInfo.job)}
                          className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 font-semibold transition-colors"
                        >
                          <AlertTriangle size={10} />
                          Report Issue
                        </button>
                      </div>
                    )}

                    {/* Pending step: Start button */}
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

                    {/* Queued jobs */}
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

                    <div className="flex justify-between items-end border-t border-border pt-3">
                      <div>
                        <span className="text-xs text-muted-foreground block mb-0.5">Operator</span>
                        <span className="font-bold text-sm">{machine.operatorName}</span>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(machine.status)}`}>
                        {machine.status}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Active Jobs Progress Section */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
            Active Job Progress
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeJobs.map((job) => (
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

                {job.routing && job.routing.length > 0 && (
                  <div className="flex items-center gap-1 mt-4 flex-wrap">
                    {job.routing.map((step, idx) => (
                      <React.Fragment key={step.id}>
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                          step.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                          step.status === "in-progress" ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300" :
                          "bg-muted text-muted-foreground"
                        )}>
                          <span className={cn(
                            "w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0",
                            step.status === "completed" ? "bg-emerald-500 text-white" :
                            step.status === "in-progress" ? "bg-blue-500 text-white" :
                            "bg-muted-foreground/20 text-muted-foreground"
                          )}>
                            {step.status === "completed" ? "✓" : step.stepNumber}
                          </span>
                          <span className="hidden sm:inline truncate max-w-[80px]">{step.machineName}</span>
                          {step.notes && <AlertTriangle size={10} className="text-amber-500 shrink-0" />}
                        </div>
                        {idx < job.routing.length - 1 && (
                          <ArrowRight size={12} className="text-muted-foreground shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {(!machines || machines.length === 0) && (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-bold">No Machines Found</h3>
          <p className="text-muted-foreground">Add machines to monitor them here.</p>
        </div>
      )}

      {/* Report Issue Modal */}
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
              <button
                onClick={() => setIssueModal(null)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-muted hover:bg-secondary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitIssue}
                disabled={!issueText.trim() || updateNotes.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-bold bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <AlertTriangle size={14} />
                {updateNotes.isPending ? "Saving..." : "Submit Issue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getMachineColorCode(status: string) {
  switch (status.toLowerCase()) {
    case 'running': return '#22c55e';
    case 'idle': return '#9ca3af';
    case 'maintenance': return '#ef4444';
    default: return '#9ca3af';
  }
}
