import { useLocation } from "wouter";
import PrintFlowStore from "@/pages/store/PrintFlowStore";
import { useStoreLots } from "@/hooks/use-store-lots";

export default function InventoryStorePage() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = useStoreLots();

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading store\u2026</div>;
  if (error) return <div className="p-8 text-rose-600">Could not load the store.</div>;

  return (
    <PrintFlowStore
      lots={data ?? []}
      /* The old inventory page carries the working inward wizard. Until that
         wizard is ported into the store shell, send the user there. */
      onRecordInward={() => navigate("/inventory-classic")}
    />
  );
}
