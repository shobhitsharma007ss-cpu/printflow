import React, { useState } from "react";
import { useMachines } from "@/hooks/use-machines";
import { useJobs, useUpdateJobRoutingStatus } from "@/hooks/use-jobs";
import { Card } from "@/components/ui-elements";
import { getStatusColor, getStatusDotColor, isAnimatedStatus, cn } from "@/lib/utils";
import { Factory, AlertCircle, Maximize2, Play, CheckCircle, ChevronRight, ArrowRight, Clock } from "lucide-react";

export default function FloorMonitor() {
  const { data: machines, isLoading: machinesLoading } = useMachines();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const updateRouting = useUpdateJobRoutingStatus();
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);

  const isLoading = machinesLoading || jobsLoading;

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;
  if (!machines) return null;

  const activeJobs = jobs?.filter((j: any) => j.status === "in-progress" || j.status === "pending") ?? [];

  const getMachineJobs = (machineId: number) => {
    return activeJobs.filter((j: any) => 
      j.routing?.some((r: any) => r.machineId === machineId && r.status !== "completed")
    );
  };

  const getMachineActiveStep = (machineId: number) => {
    for (const job of activeJobs) {
      const step = (job as any).routing?.find((r: any) => r.machineId === machineId && r.status === "in-progress");
      if (step) return { step, job };
    }
    return null;
  };

  const getMachinePendingStep = (machineId: number) => {
    for (const job of activeJobs) {
      const step = (job as any).routing?.find((r: any) => r.machineId === machineId && r.status === "pending");
      if (step) return { step, job };
    }
    return null;
  };

  const handleAdvanceStep = (routingId: number, newStatus: string) => {
    updateRouting.mutate(
      { id: routingId, data: { status: newStatus } },
      { onError: () => alert("Failed to update step status. Please try again.") }
    );
  };

  const groupedMachines = machines.reduce((acc: any, machine: any) => {
    if (!acc[machine.machineType]) acc[machine.machineType] = [];
    acc[machine.machineType].push(machine);
    return acc;
  }, {} as Record<string, typeof machines>);

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

      {Object.entries(groupedMachines).map(([type, typeMachines]: [string, any]) => (
        <div key={type} className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
            {type} Area
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {typeMachines.map((machine: any) => {
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

                    {/* Step advancement controls */}
                    {activeInfo && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 block">Step {activeInfo.step.stepNumber} — In Progress</span>
                            <span className="text-xs font-semibold text-foreground">{(activeInfo.job as any).jobCode}</span>
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
                      </div>
                    )}

                    {!activeInfo && pendingInfo && machine.status !== "maintenance" && (
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600 block">Step {pendingInfo.step.stepNumber} — Waiting</span>
                            <span className="text-xs font-semibold text-foreground">{(pendingInfo.job as any).jobCode} — {(pendingInfo.job as any).jobName}</span>
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
                        {machineJobs.slice(1).map((j: any) => (
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
            {activeJobs.map((job: any) => (
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
                  <div className="flex items-center gap-1 mt-4">
                    {job.routing.map((step: any, idx: number) => (
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
