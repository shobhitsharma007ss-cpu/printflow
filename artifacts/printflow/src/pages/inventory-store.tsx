import PrintFlowStore from "@/pages/store/PrintFlowStore";
import { useStoreLots } from "@/hooks/use-store-lots";

export default function InventoryStorePage() {
  const { data, isLoading, error } = useStoreLots();
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading store…</div>;
  if (error) return <div className="p-8 text-rose-600">Could not load the store.</div>;
  return <PrintFlowStore lots={data ?? []} />;
}
