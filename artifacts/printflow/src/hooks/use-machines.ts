import { useQueryClient } from "@tanstack/react-query";
import { 
  useListMachines, 
  usePatchMachineStatus as useGeneratedPatchMachineStatus,
  useUpdateMachine as useGeneratedUpdateMachine,
  getListMachinesQueryKey,
  getGetDashboardMetricsQueryKey
} from "@workspace/api-client-react";

export function useMachines() {
  return useListMachines();
}

export function usePatchMachineStatus() {
  const queryClient = useQueryClient();
  return useGeneratedPatchMachineStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMachinesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
      }
    }
  });
}

export function useUpdateMachine() {
  const queryClient = useQueryClient();
  return useGeneratedUpdateMachine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMachinesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
      }
    }
  });
}
