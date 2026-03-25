import { useQueryClient } from "@tanstack/react-query";
import { 
  useListJobs, 
  useGetJob, 
  useCreateJob as useGeneratedCreateJob, 
  useUpdateJobStatus as useGeneratedUpdateJobStatus,
  useUpdateJobRoutingStatus as useGeneratedUpdateRoutingStatus,
  getListJobsQueryKey,
  getGetDashboardMetricsQueryKey,
  getListMachinesQueryKey,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";

export function useJobs(status?: any) {
  return useListJobs({ status });
}

export function useJob(id: number) {
  return useGetJob(id);
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  
  return useGeneratedCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
      }
    }
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  
  return useGeneratedUpdateJobStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
      }
    }
  });
}

export function useUpdateJobRoutingStatus() {
  const queryClient = useQueryClient();
  
  return useGeneratedUpdateRoutingStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMachinesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    }
  });
}
