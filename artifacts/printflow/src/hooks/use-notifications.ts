import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkNotificationRead as useGeneratedMarkRead,
  useMarkAllNotificationsRead as useGeneratedMarkAllRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";

export function useNotifications() {
  return useListNotifications({ query: { refetchInterval: 15000 } });
}

export function usePlantAlerts() {
  return useListNotifications({ query: { refetchInterval: 60000 } });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useGeneratedMarkRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useGeneratedMarkAllRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });
}
