import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMaterials, 
  useCreateMaterial as useGeneratedCreateMaterial,
  useCreateStockInward as useGeneratedCreateStockInward,
  useUpdateMaterial as useGeneratedUpdateMaterial,
  useGetMaterialVendors,
  useGetMaterialInwardHistory,
  getListMaterialsQueryKey,
  getGetStockSummaryQueryKey,
  getGetMaterialInwardHistoryQueryKey,
} from "@workspace/api-client-react";

export function useMaterials() {
  return useListMaterials();
}

export function useMaterialVendors(id: number) {
  return useGetMaterialVendors(id, { query: { enabled: !!id } });
}

export function useMaterialInwardHistory(id: number) {
  return useGetMaterialInwardHistory(id, { query: { enabled: !!id } });
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

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  return useGeneratedUpdateMaterial({
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
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() });
        if (variables?.data?.materialId) {
          queryClient.invalidateQueries({ 
            queryKey: getGetMaterialInwardHistoryQueryKey(variables.data.materialId) 
          });
        }
      }
    }
  });
}
