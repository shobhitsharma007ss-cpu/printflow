import React from "react";
import { useWastageReport, useStockSummary } from "@/hooks/use-reports";
import { Card } from "@/components/ui-elements";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { FileBarChart2, Trash2 } from "lucide-react";

export default function Reports() {
  const { data: wastageData, isLoading: loadingWastage } = useWastageReport();
  const { data: stockData, isLoading: loadingStock } = useStockSummary();

  const formattedWastage = wastageData?.map(w => ({
    name: w.jobCode,
    wastage: w.wastagePct,
    actual: w.actualQty
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
              <div className="flex h-full items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : formattedWastage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formattedWastage} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="wastage" radius={[4, 4, 0, 0]}>
                    {formattedWastage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.wastage > 10 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No wastage data available.</div>
            )}
          </div>
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
                  stockData?.filter(s => s.stockPct < 50).sort((a,b) => a.stockPct - b.stockPct).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-6 py-4 font-semibold text-foreground">{item.materialName}</td>
                      <td className="px-6 py-4 font-mono text-right">{item.currentQty} {item.unit}</td>
                      <td className="px-6 py-4 font-mono text-right text-muted-foreground">{item.minReorderQty}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${item.isLowStock ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
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
