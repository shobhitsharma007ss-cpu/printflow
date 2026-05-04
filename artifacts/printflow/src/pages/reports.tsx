import React, { useState } from "react";
import { useWastageReport, useStockSummary, useMachineDowntime } from "@/hooks/use-reports";
import { Card } from "@/components/ui-elements";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { FileBarChart2, Trash2, Clock, ChevronDown, ChevronUp } from "lucide-react";
import type { MachineDowntimeRow } from "@workspace/api-client-react";

const REASON_LABELS: Record<string, string> = {
  "blanket-wash": "Blanket Wash",
  "plate-change": "Plate Change",
  "ink-change": "Ink Change",
  "paper-jam": "Paper Jam",
  "breakdown": "Breakdown",
  "break": "Break",
  "other": "Other",
};

const REASON_COLORS: Record<string, string> = {
  "blanket-wash": "#3b82f6",
  "plate-change": "#8b5cf6",
  "ink-change": "#06b6d4",
  "paper-jam": "#f59e0b",
  "breakdown": "#ef4444",
  "break": "#22c55e",
  "other": "#94a3b8",
};

const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#94a3b8"];

function formatMachineName(name: string): string {
  if (name.length > 14) {
    const parts = name.split(" ");
    return parts.length > 1 ? `${parts[0]} ${parts[1]}` : name.slice(0, 14);
  }
  return name;
}

function buildReasonSummary(rows: MachineDowntimeRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const rb of row.reasonBreakdown) {
      totals.set(rb.reason, (totals.get(rb.reason) ?? 0) + rb.count);
    }
  }
  return Array.from(totals.entries())
    .map(([reason, count]) => ({
      name: REASON_LABELS[reason] ?? reason,
      value: count,
      reason,
    }))
    .sort((a, b) => b.value - a.value);
}

export default function Reports() {
  const { data: wastageData, isLoading: loadingWastage } = useWastageReport();
  const { data: stockData, isLoading: loadingStock } = useStockSummary();
  const { data: downtimeData, isLoading: loadingDowntime } = useMachineDowntime();
  const [downtimeOpen, setDowntimeOpen] = useState(true);

  const formattedWastage = wastageData?.map(w => ({
    name: w.jobCode ?? `Job ${w.jobId}`,
    label: `${w.jobCode} — ${w.jobName}`,
    wastage: w.wastagePct,
    client: w.clientName,
  })) || [];

  const hasAnyDowntime = downtimeData?.some(d => d.totalPausedMinutes > 0) ?? false;

  const machinesWithDowntime = downtimeData?.filter(d => d.totalPausedMinutes > 0) ?? [];

  const chartDowntime = (downtimeData ?? []).map(d => ({
    name: formatMachineName(d.machineName),
    fullName: d.machineName,
    minutes: d.totalPausedMinutes,
    machineType: d.machineType,
  }));

  const reasonSummary = buildReasonSummary(downtimeData ?? []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Factory Reports</h1>
        <p className="text-muted-foreground mt-1 font-medium">Analytics and historical performance data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Wastage Analytics */}
        <Card className="p-6 flex flex-col h-[500px]">
          <div className="flex items-center gap-2 mb-6">
            <Trash2 className="text-rose-500" size={24} />
            <h2 className="text-xl font-bold">Wastage % by Job</h2>
          </div>

          <div className="flex-1 min-h-0 w-full">
            {loadingWastage ? (
              <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : formattedWastage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formattedWastage} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    unit="%"
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'hsl(var(--card))' }}
                    formatter={(value: number, _name: string, props: { payload?: { label?: string } }) => [
                      `${value.toFixed(2)}%`,
                      props.payload?.label ?? 'Wastage'
                    ]}
                    labelFormatter={(label) => {
                      const entry = formattedWastage.find(f => f.name === label);
                      return entry?.label ?? label;
                    }}
                  />
                  <Bar dataKey="wastage" radius={[6, 6, 0, 0]} maxBarSize={80}>
                    {formattedWastage.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.wastage > 10 ? '#ef4444' : entry.wastage > 5 ? '#f59e0b' : 'hsl(var(--primary))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No wastage data available.</div>
            )}
          </div>

          {formattedWastage.length > 0 && (
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary inline-block" /> &lt;5% (Normal)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> 5–10% (Watch)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500 inline-block" /> &gt;10% (Critical)</span>
            </div>
          )}
        </Card>

        {/* Low Stock Report Table */}
        <Card className="p-0 overflow-hidden flex flex-col h-[500px]">
          <div className="p-6 border-b border-border flex items-center gap-2 bg-card">
            <FileBarChart2 className="text-amber-500" size={24} />
            <h2 className="text-xl font-bold">Reorder Watchlist</h2>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-6 py-3 font-bold">Material</th>
                  <th className="px-6 py-3 font-bold text-right">Current Qty</th>
                  <th className="px-6 py-3 font-bold text-right">Reorder At</th>
                  <th className="px-6 py-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingStock ? (
                  <tr><td colSpan={4} className="p-8 text-center">Loading...</td></tr>
                ) : stockData?.filter(s => s.stockPct < 50).length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">All stocks are healthy!</td></tr>
                ) : (
                  stockData?.filter(s => s.stockPct < 50).sort((a, b) => a.stockPct - b.stockPct).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-foreground">{item.materialName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.materialType}</p>
                      </td>
                      <td className="px-6 py-4 font-mono text-right">{item.currentQty} {item.unit}</td>
                      <td className="px-6 py-4 font-mono text-right text-muted-foreground">{item.minReorderQty} {item.unit}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.isLowStock ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                          {item.isLowStock ? 'CRITICAL' : 'LOW'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {/* Machine Downtime Section */}
      <div className="border border-border rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setDowntimeOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 bg-card hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="text-violet-500" size={22} />
            <div className="text-left">
              <h2 className="text-xl font-bold">Machine Downtime</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total pause time and reason breakdown per machine
              </p>
            </div>
            {!loadingDowntime && hasAnyDowntime && (
              <span className="ml-2 text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-bold px-2.5 py-0.5 rounded-full">
                {machinesWithDowntime.length} machine{machinesWithDowntime.length !== 1 ? "s" : ""} affected
              </span>
            )}
          </div>
          {downtimeOpen ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        {downtimeOpen && (
          <div className="p-6 border-t border-border bg-background">
            {loadingDowntime ? (
              <div className="flex h-48 items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : !hasAnyDowntime ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Clock size={40} className="opacity-20" />
                <p className="text-sm font-medium">No downtime data yet</p>
                <p className="text-xs">Paused machine steps will appear here once jobs are in progress.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Bar chart: downtime per machine */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                    Total Paused Time per Machine
                  </h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartDowntime}
                        layout="vertical"
                        margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                          unit=" min"
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={90}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
                        />
                        <Tooltip
                          cursor={{ fill: 'hsl(var(--muted))' }}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid hsl(var(--border))',
                            backgroundColor: 'hsl(var(--card))',
                          }}
                          formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) => [
                            `${value} min`,
                            props.payload?.fullName ?? "Downtime",
                          ]}
                          labelFormatter={() => ""}
                        />
                        <Bar dataKey="minutes" radius={[0, 6, 6, 0]} maxBarSize={28}>
                          {chartDowntime.map((entry, index) => (
                            <Cell
                              key={`bar-${index}`}
                              fill={entry.minutes > 60 ? '#ef4444' : entry.minutes > 20 ? '#f59e0b' : '#8b5cf6'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-500 inline-block" /> &lt;20 min</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> 20–60 min</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> &gt;60 min</span>
                  </div>
                </div>

                {/* Pie chart: reason breakdown */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                    Pause Reason Breakdown (All Machines)
                  </h3>
                  {reasonSummary.length === 0 ? (
                    <div className="flex h-[300px] items-center justify-center text-muted-foreground text-sm">
                      No reason data available.
                    </div>
                  ) : (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={reasonSummary}
                            cx="50%"
                            cy="45%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                          >
                            {reasonSummary.map((entry, index) => (
                              <Cell
                                key={`pie-${index}`}
                                fill={REASON_COLORS[entry.reason] ?? PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              borderRadius: '8px',
                              border: '1px solid hsl(var(--border))',
                              backgroundColor: 'hsl(var(--card))',
                            }}
                            formatter={(value: number, name: string) => [`${value} occurrence${value !== 1 ? "s" : ""}`, name]}
                          />
                          <Legend
                            iconType="circle"
                            iconSize={10}
                            formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Per-machine detail table */}
                <div className="lg:col-span-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    Per-Machine Breakdown
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 font-bold">Machine</th>
                          <th className="px-4 py-3 font-bold">Type</th>
                          <th className="px-4 py-3 font-bold text-right">Total Downtime</th>
                          <th className="px-4 py-3 font-bold">Top Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {machinesWithDowntime.map((m) => {
                          const topReason = m.reasonBreakdown[0];
                          return (
                            <tr key={m.machineId} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-semibold">{m.machineName}</td>
                              <td className="px-4 py-3 capitalize text-muted-foreground text-xs font-medium">{m.machineType}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold">
                                <span className={
                                  m.totalPausedMinutes > 60 ? "text-rose-600 dark:text-rose-400"
                                  : m.totalPausedMinutes > 20 ? "text-amber-600 dark:text-amber-400"
                                  : "text-violet-600 dark:text-violet-400"
                                }>
                                  {m.totalPausedMinutes} min
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {topReason ? (
                                  <span
                                    className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                                    style={{ backgroundColor: REASON_COLORS[topReason.reason] ?? "#94a3b8" }}
                                  >
                                    {REASON_LABELS[topReason.reason] ?? topReason.reason} ×{topReason.count}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
