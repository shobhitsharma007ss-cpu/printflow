import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMaterials, 
  useCreateMaterial as useGeneratedCreateMaterial,
  useCreateStockInward as useGeneratedCreateStockInward,
  getListMaterialsQueryKey,
  getGetStockSummaryQueryKey
} from "@workspace/api-client-react";

export function useMaterials() {
  return useListMaterials();
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  
  return useGeneratedCreateMaterial({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() });
      }
    }
  });
}

export function useCreateStockInward() {
  const queryClient = useQueryClient();
  
  return useGeneratedCreateStockInward({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() });
      }
    }
  });
}
