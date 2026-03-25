import React, { useState } from "react";
import { useStockSummary } from "@/hooks/use-reports";
import { Card, Button, Badge } from "@/components/ui-elements";
import { Package, AlertTriangle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Inventory() {
  const { data: stock, isLoading } = useStockSummary();
  const [activeTab, setActiveTab] = useState<"boards" | "consumables">("boards");

  if (isLoading) return <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" /></div>;

  const boards = stock?.filter(s => s.materialType === 'board' || s.materialType === 'paper') || [];
  const consumables = stock?.filter(s => s.materialType === 'consumable') || [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground mt-1 font-medium">Visual stock levels and reorder alerts</p>
        </div>
        <Button className="flex items-center gap-2">
          <Package size={18} />
          Record Inward Stock
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 p-1 bg-muted rounded-xl w-full max-w-md">
        <button
          onClick={() => setActiveTab("boards")}
          className={cn(
            "flex-1 py-2.5 text-sm font-bold rounded-lg transition-all",
            activeTab === "boards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Boards & Paper
        </button>
        <button
          onClick={() => setActiveTab("consumables")}
          className={cn(
            "flex-1 py-2.5 text-sm font-bold rounded-lg transition-all",
            activeTab === "consumables" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Consumables
        </button>
      </div>

      {activeTab === "boards" && (
        <Card className="p-8">
          <div className="flex items-center gap-2 mb-8 border-b border-border pb-4">
            <Layers className="text-primary" size={24} />
            <h2 className="text-xl font-bold">Paper & Board Stocks</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-x-8 gap-y-12">
            {boards.map(item => (
              <StackVisual key={item.id} item={item} />
            ))}
            {boards.length === 0 && <p className="col-span-full text-center text-muted-foreground py-10">No boards or paper in inventory.</p>}
          </div>
        </Card>
      )}

      {activeTab === "consumables" && (
        <Card className="p-8">
           <div className="flex items-center gap-2 mb-8 border-b border-border pb-4">
            <Package className="text-primary" size={24} />
            <h2 className="text-xl font-bold">Consumables (Inks, Glues, Plates)</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-x-8 gap-y-12">
            {consumables.map(item => (
              <CylinderVisual key={item.id} item={item} />
            ))}
            {consumables.length === 0 && <p className="col-span-full text-center text-muted-foreground py-10">No consumables in inventory.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function StackVisual({ item }: { item: any }) {
  // Cap at 100% for visual purposes
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  
  let color = "bg-emerald-500";
  if (item.stockPct < 30) color = "bg-rose-500";
  else if (item.stockPct < 60) color = "bg-amber-500";

  return (
    <div className="flex flex-col items-center group cursor-pointer">
      <div className="w-24 h-48 bg-muted rounded-md overflow-hidden flex flex-col justify-end relative shadow-inner border border-border group-hover:border-primary transition-colors">
        {/* Fill layer */}
        <div 
          className={cn("w-full opacity-90 transition-all duration-1000 ease-out stack-fill", color)} 
          style={{ height: `${fillPct}%` }} 
        />
        
        {/* Layer lines overlay for "stack" effect */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSI0Ij48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMSIgZmlsbD0icmdiYSgwLDAsMCwwLjEpIi8+PC9zdmc+')] opacity-50" />
        
        {item.isLowStock && (
          <div className="absolute top-2 right-2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.gsm ? `${item.gsm} GSM` : item.subType}</p>
        <Badge className="mt-2 bg-background border-border text-foreground">
          {item.currentQty} {item.unit}
        </Badge>
      </div>
    </div>
  );
}

function CylinderVisual({ item }: { item: any }) {
  const fillPct = Math.min(Math.max(item.stockPct, 5), 100);
  
  let colorClass = "from-emerald-400 to-emerald-600";
  if (item.stockPct < 30) colorClass = "from-rose-400 to-rose-600";
  else if (item.stockPct < 60) colorClass = "from-amber-400 to-amber-600";

  return (
    <div className="flex flex-col items-center group cursor-pointer">
      <div className="w-20 h-32 bg-muted rounded-[50%_50%_50%_50%/10%_10%_10%_10%] relative overflow-hidden border-2 border-border shadow-inner group-hover:border-primary transition-colors">
        <div 
          className={cn("absolute bottom-0 w-full bg-gradient-to-t transition-all duration-1000 ease-out stack-fill", colorClass)} 
          style={{ height: `${fillPct}%` }} 
        />
        {/* Gloss highlight */}
        <div className="absolute top-0 left-2 w-2 h-full bg-white/20 blur-[2px]" />
        
        {item.isLowStock && (
          <div className="absolute top-2 right-1/2 translate-x-1/2 text-rose-500 bg-white rounded-full p-0.5 shadow-sm">
            <AlertTriangle size={14} strokeWidth={3} />
          </div>
        )}
      </div>
      <div className="mt-4 text-center w-full">
        <h4 className="font-bold text-foreground text-sm truncate px-1" title={item.materialName}>{item.materialName}</h4>
        <Badge className="mt-2 bg-background border-border text-foreground">
          {item.currentQty} {item.unit}
        </Badge>
      </div>
    </div>
  );
}
