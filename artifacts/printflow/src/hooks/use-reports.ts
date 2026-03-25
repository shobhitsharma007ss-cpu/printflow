import { 
  useGetWastageReport,
  useGetStockSummary,
  useGetJobCostReport
} from "@workspace/api-client-react";

export function useWastageReport() {
  return useGetWastageReport();
}

export function useStockSummary() {
  return useGetStockSummary();
}

export function useJobCostReport(jobId: number) {
  return useGetJobCostReport(jobId, { query: { enabled: !!jobId } });
}
