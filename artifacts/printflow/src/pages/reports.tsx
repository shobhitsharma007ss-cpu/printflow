import React from "react";
import { useWastageReport, useStockSummary } from "@/hooks/use-reports";
import { Card } from "@/components/ui-elements";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { FileBarChart2, Trash2 } from "lucide-react";

export default function Reports() {
  const { data: wastageData, isLoading: loadingWastage } = useWastageReport();
  const { data: stockData, isLoading: loadingStock } = useStockSummary();

  // Each entry is now aggregated per job (grouped by jobId on backend)
  const formattedWastage = wastageData?.map(w => ({
    name: w.jobCode ?? `Job ${w.jobId}`,
    label: `${w.jobCode} — ${w.jobName}`,
    wastage: w.wastagePct,
    client: w.clientName,
  })) || [];

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

          {/* Legend */}
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
    </div>
  );
}
