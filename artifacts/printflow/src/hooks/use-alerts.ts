import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface AlertConfig {
  id: number;
  eventType: string;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string;
}

export interface AlertProvider {
  id: number;
  channel: string;
  provider: string | null;
  apiKey: string | null;
  apiSid: string | null;
  fromAddress: string | null;
  enabled: boolean;
  updatedAt: string;
}

export interface AlertRecipient {
  id: number;
  channel: string;
  address: string;
  label: string | null;
  createdAt: string;
}

export interface AlertLogEntry {
  id: number;
  eventType: string;
  channel: string;
  recipient: string;
  status: string;
  errorMessage: string | null;
  messageBody: string | null;
  sentAt: string;
}

export function useAlertConfig() {
  return useQuery<AlertConfig[]>({
    queryKey: ["/api/alert-config"],
    queryFn: () => customFetch<AlertConfig[]>("/api/alert-config", { method: "GET" }),
  });
}

export function useUpdateAlertConfig() {
  const queryClient = useQueryClient();
  return useMutation<AlertConfig, Error, { eventType: string; whatsappEnabled: boolean; emailEnabled: boolean }>({
    mutationFn: ({ eventType, whatsappEnabled, emailEnabled }) =>
      customFetch<AlertConfig>(`/api/alert-config/${eventType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappEnabled, emailEnabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-config"] });
    },
  });
}

export function useAlertProviders() {
  return useQuery<AlertProvider[]>({
    queryKey: ["/api/alert-providers"],
    queryFn: () => customFetch<AlertProvider[]>("/api/alert-providers", { method: "GET" }),
  });
}

export function useUpdateAlertProvider() {
  const queryClient = useQueryClient();
  return useMutation<AlertProvider, Error, { channel: string; data: Partial<AlertProvider> & { apiKey?: string } }>({
    mutationFn: ({ channel, data }) =>
      customFetch<AlertProvider>(`/api/alert-providers/${channel}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-providers"] });
    },
  });
}

export function useAlertRecipients() {
  return useQuery<AlertRecipient[]>({
    queryKey: ["/api/alert-recipients"],
    queryFn: () => customFetch<AlertRecipient[]>("/api/alert-recipients", { method: "GET" }),
  });
}

export function useAddAlertRecipient() {
  const queryClient = useQueryClient();
  return useMutation<AlertRecipient, Error, { channel: string; address: string; label?: string }>({
    mutationFn: (data) =>
      customFetch<AlertRecipient>("/api/alert-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-recipients"] });
    },
  });
}

export function useDeleteAlertRecipient() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      customFetch<void>(`/api/alert-recipients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-recipients"] });
    },
  });
}

export function useAlertLog() {
  return useQuery<AlertLogEntry[]>({
    queryKey: ["/api/alert-log"],
    queryFn: () => customFetch<AlertLogEntry[]>("/api/alert-log", { method: "GET" }),
  });
}

export function useSendTestAlert() {
  const queryClient = useQueryClient();
  return useMutation<{ sent: boolean; message: string }, Error, { channel: string; eventType: string }>({
    mutationFn: (data) =>
      customFetch<{ sent: boolean; message: string }>("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-log"] });
    },
  });
}
