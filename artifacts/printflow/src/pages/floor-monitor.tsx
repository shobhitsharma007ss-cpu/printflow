import React from "react";
import { useMachines } from "@/hooks/use-machines";
import { Card } from "@/components/ui-elements";
import { getStatusColor, getStatusDotColor, isAnimatedStatus } from "@/lib/utils";
import { Factory, AlertCircle, Maximize2 } from "lucide-react";

export default function FloorMonitor() {
  const { data: machines, isLoading } = useMachines();

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;

  if (!machines) return null;

  // Group machines by type
  const groupedMachines = machines.reduce((acc, machine) => {
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
        <button className="p-3 bg-muted rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Maximize2 size={20} />
        </button>
      </div>

      {Object.entries(groupedMachines).map(([type, typeMachines]) => (
        <div key={type} className="space-y-4">
          <h2 className="text-xl font-bold uppercase tracking-widest text-muted-foreground px-2 border-b border-border pb-2">
            {type} Area
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {typeMachines.map((machine) => (
              <Card 
                key={machine.id} 
                className="overflow-hidden border-t-4 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                style={{ borderTopColor: getMachineColorCode(machine.status) }}
              >
                <div className="p-6 relative">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight">{machine.machineCode}</h3>
                      <p className="font-semibold text-muted-foreground mt-1">{machine.machineName}</p>
                    </div>
                    <div className="relative flex h-5 w-5">
                      {isAnimatedStatus(machine.status) && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
                      )}
                      <span className={`relative inline-flex rounded-full h-5 w-5 ${getStatusDotColor(machine.status)}`}></span>
                    </div>
                  </div>

                  <div className="space-y-4 mt-6">
                    <div className="bg-muted rounded-lg p-3">
                      <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground block mb-1">Current Job</span>
                      <span className="text-lg font-bold text-primary truncate block">
                        {machine.currentJobName || "--- IDLE ---"}
                      </span>
                    </div>

                    <div className="flex justify-between items-end border-t border-border pt-4">
                      <div>
                        <span className="text-xs text-muted-foreground block mb-0.5">Operator</span>
                        <span className="font-bold">{machine.operatorName}</span>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(machine.status)}`}>
                        {machine.status}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

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
    case 'running': return '#22c55e'; // green-500
    case 'idle': return '#9ca3af'; // gray-400
    case 'maintenance': return '#ef4444'; // red-500
    default: return '#9ca3af'; // gray-400
  }
}
