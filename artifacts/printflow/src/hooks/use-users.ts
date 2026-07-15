import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import type { StaffUser, CreateUserRequest, UpdateUserRequest, ResetUserPasswordRequest } from "@workspace/api-client-react";

export const getUsersQueryKey = () => ["/api/users"] as const;

export function useUsers() {
  return useQuery<StaffUser[]>({
    queryKey: getUsersQueryKey(),
    queryFn: () => customFetch<StaffUser[]>("/api/users", { method: "GET" }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<StaffUser, Error, CreateUserRequest>({
    mutationFn: (data) =>
      customFetch<StaffUser>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getUsersQueryKey() });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation<StaffUser, Error, { id: number; data: UpdateUserRequest }>({
    mutationFn: ({ id, data }) =>
      customFetch<StaffUser>(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getUsersQueryKey() });
    },
  });
}

export function useResetUserPassword() {
  return useMutation<{ ok: boolean }, Error, { id: number; data: ResetUserPasswordRequest }>({
    mutationFn: ({ id, data }) =>
      customFetch<{ ok: boolean }>(`/api/users/${id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}
