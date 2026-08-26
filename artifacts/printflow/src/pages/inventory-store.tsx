import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import PrintFlowStore from "@/pages/store/PrintFlowStore";
import { InwardStockWizard } from "@/pages/inventory";
import { useStoreLots } from "@/hooks/use-store-lots";

export default function InventoryStorePage() {
  const qc = useQueryClient();
  const [inwardOpen, setInwardOpen] = useState(false);
  const { data, isLoading, error } = useStoreLots();

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading store\u2026</div>;
  if (error) return <div className="p-8 text-rose-600">Could not load the store.</div>;

  return (
    <>
      <PrintFlowStore lots={data ?? []} onRecordInward={() => setInwardOpen(true)} />
      {/* The same wizard the classic page uses \u2014 opened here, so recording
          stock never navigates the user away from the store. */}
      <InwardStockWizard
        isOpen={inwardOpen}
        onClose={() => {
          setInwardOpen(false);
          qc.invalidateQueries({ queryKey: ["store-lots"] });
        }}
      />
    </>
  );
}
