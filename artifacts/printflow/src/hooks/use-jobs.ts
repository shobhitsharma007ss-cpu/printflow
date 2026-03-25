import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  useListJobs, 
  useGetJob, 
  useCreateJob as useGeneratedCreateJob, 
  useUpdateJobStatus as useGeneratedUpdateJobStatus,
  useUpdateJobRoutingStatus as useGeneratedUpdateRoutingStatus,
  useUpdateJobRoutingNotes as useGeneratedUpdateRoutingNotes,
  getListJobsQueryKey,
  getGetDashboardMetricsQueryKey,
  getListMachinesQueryKey,
  getListNotificationsQueryKey,
  getGetStockSummaryQueryKey,
} from "@workspace/api-client-react";

export function useJobs(status?: string) {
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
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });

        if (data?.deductions && data.deductions.length > 0) {
          for (const d of data.deductions) {
            toast.success("Stock updated", {
              description: `${d.qty} ${d.unit} deducted from ${d.materialName}`,
              duration: 5000,
            });
          }
        }
      },
      onError: () => {
        toast.error("Failed to update job status. Please try again.");
      }
    }
  });
}

export function useUpdateJobRoutingStatus() {
  const queryClient = useQueryClient();
  
  return useGeneratedUpdateRoutingStatus({
    mutation: {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListMachinesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardMetricsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStockSummaryQueryKey() });

        const status = variables.data?.status;
        if (status === "in-progress") {
          toast.success("Step started", { description: "Machine is now running." });
          if (data?.deductions && data.deductions.length > 0) {
            for (const d of data.deductions) {
              toast.success("Stock updated", {
                description: `${d.qty} ${d.unit} deducted from ${d.materialName}`,
                duration: 5000,
              });
            }
          }
        } else if (status === "completed") {
          toast.success("Step completed", { description: "Next step will start automatically." });
        }
      },
      onError: () => {
        toast.error("Failed to update step status. Please try again.");
      }
    }
  });
}

export function useUpdateJobRoutingNotes() {
  const queryClient = useQueryClient();

  return useGeneratedUpdateRoutingNotes({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast.success("Issue reported", { description: "Notes saved for this step." });
      },
      onError: () => {
        toast.error("Failed to save notes. Please try again.");
      }
    }
  });
}
