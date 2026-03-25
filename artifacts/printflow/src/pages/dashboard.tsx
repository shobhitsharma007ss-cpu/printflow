import React, { useState, useEffect } from "react";
import { useDashboardMetrics } from "@/hooks/use-dashboard";
import { Card } from "@/components/ui-elements";
import { Activity, Briefcase, AlertTriangle, CheckCircle2, Factory, Clock } from "lucide-react";
import { getStatusColor, getStatusDotColor, isAnimatedStatus } from "@/lib/utils";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: metrics, isLoading, error, refetch } = useDashboardMetrics();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      setLastUpdated(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  if (error || !metrics) {
    return (
      <div className="p-8 text-center text-destructive">
        <AlertTriangle className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <h2 className="text-xl font-bold">Failed to load dashboard</h2>
        <p className="mt-2 text-muted-foreground">The API server might not be running or initialized yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Plant Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time metrics and operations status.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2 shrink-0">
          <Clock size={13} />
          <span>Updated {format(lastUpdated, "hh:mm a")}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <MetricCard 
          title="Active Jobs" 
          value={metrics.activeJobs.toString()} 
          icon={Briefcase} 
          color="text-blue-500" 
          bgColor="bg-blue-500/10"
        />
        <MetricCard 
          title="Machines Running" 
          value={metrics.machinesRunning.toString()} 
          icon={Activity} 
          color="text-emerald-500" 
          bgColor="bg-emerald-500/10"
        />
        <MetricCard 
          title="Low Stock Alerts" 
          value={metrics.lowStockAlerts.toString()} 
          icon={AlertTriangle} 
          color="text-amber-500" 
          bgColor="bg-amber-500/10"
        />
        <MetricCard 
          title="Completed Today" 
          value={metrics.jobsCompletedToday.toString()} 
          icon={CheckCircle2} 
          color="text-indigo-500" 
          bgColor="bg-indigo-500/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Machine Status Row */}
        <Card className="lg:col-span-2 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Factory className="text-primary" size={20} />
              Live Machine Status
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
            {metrics.machineStatuses.map(machine => (
              <div key={machine.id} className="border border-border rounded-xl p-4 flex flex-col justify-between bg-card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-foreground text-lg leading-none mb-1">{machine.machineName}</h3>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{machine.machineType}</span>
                  </div>
                  <StatusDot status={machine.status} />
                </div>
                <div className="pt-3 border-t border-border mt-auto flex justify-between items-end gap-2">
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground block">Current Job</span>
                    <span className="text-sm font-semibold block">
                      {machine.currentJobName || 'Idle'}
                    </span>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${getStatusColor(machine.status)}`}>
                    {machine.status}
                  </span>
                </div>
              </div>
            ))}
            {metrics.machineStatuses.length === 0 && (
               <div className="col-span-full py-8 text-center text-muted-foreground">No machines configured.</div>
            )}
          </div>
        </Card>

        {/* Recent Jobs */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Briefcase className="text-primary" size={20} />
            Recent Jobs
          </h2>
          <div className="space-y-4">
            {metrics.recentJobs.map(job => (
              <div key={job.id} className="flex items-start justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{job.jobCode}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{job.jobName}</p>
                  <p className="text-xs font-medium mt-1">{job.clientName}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ml-2 ${getStatusColor(job.status)}`}>
                  {job.status}
                </span>
              </div>
            ))}
            {metrics.recentJobs.length === 0 && (
               <div className="py-8 text-center text-muted-foreground text-sm">No recent jobs found.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const isRunning = status.toLowerCase() === 'running';
  const isMaintenance = status.toLowerCase() === 'maintenance';

  if (isRunning) {
    return (
      <div className="relative flex h-5 w-5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#22c55e' }} />
        <span className="relative inline-flex rounded-full h-5 w-5" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 12px 3px rgba(34,197,94,0.6)' }} />
      </div>
    );
  }
  if (isMaintenance) {
    return (
      <div className="relative flex h-5 w-5 shrink-0">
        <span className="relative inline-flex rounded-full h-5 w-5" style={{ backgroundColor: '#ef4444', boxShadow: '0 0 10px 2px rgba(239,68,68,0.5)' }} />
      </div>
    );
  }
  return (
    <div className="relative flex h-5 w-5 shrink-0">
      <span className="relative inline-flex rounded-full h-5 w-5 bg-gray-400" />
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, bgColor }: { title: string; value: string | number; icon: React.ElementType; color: string; bgColor: string }) {
  return (
    <Card className="p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${bgColor} ${color}`}>
        <Icon size={28} strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground">{title}</p>
        <h3 className="text-3xl font-black text-foreground mt-1 tracking-tight">{value}</h3>
      </div>
    </Card>
  );
}
