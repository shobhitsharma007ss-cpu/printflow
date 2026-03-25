import { useQueryClient } from "@tanstack/react-query";
import { 
  useListJobs, 
  useGetJob, 
  useCreateJob as useGeneratedCreateJob, 
  useUpdateJobStatus as useGeneratedUpdateJobStatus,
  getListJobsQueryKey,
  getGetDashboardMetricsQueryKey
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
