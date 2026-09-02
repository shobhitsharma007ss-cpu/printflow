import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import PrintFlowStore from "@/pages/store/PrintFlowStore";
import { InwardStockWizard } from "@/pages/inventory";
import { AddStockWizard } from "@/components/add-stock-wizard";
import { useStoreLots } from "@/hooks/use-store-lots";

export default function InventoryStorePage() {
  const qc = useQueryClient();
  const [inwardOpen, setInwardOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading, error } = useStoreLots();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["store-lots"] });
    qc.invalidateQueries({ queryKey: ["materials"] });
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading store\u2026</div>;
  if (error) return <div className="p-8 text-rose-600">Could not load the store.</div>;

  return (
    <>
      <PrintFlowStore
        lots={data ?? []}
        onRecordInward={() => setInwardOpen(true)}
        onAddMaterial={() => setAddOpen(true)}
      />
      <InwardStockWizard
        isOpen={inwardOpen}
        onClose={() => { setInwardOpen(false); refresh(); }}
        onAddMaterial={() => setAddOpen(true)}
      />
      <AddStockWizard
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); refresh(); }}
      />
    </>
  );
}
