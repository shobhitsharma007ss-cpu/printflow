import { useQueryClient } from "@tanstack/react-query";
import { 
  useListVendors,
  useCreateVendor as useGeneratedCreateVendor,
  useDeleteVendor as useGeneratedDeleteVendor,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";

export function useVendors() {
  return useListVendors();
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useGeneratedCreateVendor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      }
    }
  });
}

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useGeneratedDeleteVendor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      }
    }
  });
}
