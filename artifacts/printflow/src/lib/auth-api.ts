export type Role = "owner" | "supervisor" | "operator";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export function defaultPathForRole(role: Role): string {
  return role === "operator" ? "/floor/stations" : "/";
}

async function jsonRequest(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load session");
  const data = await res.json();
  return data.user as AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Login failed");
  }
  const data = await res.json();
  return data.user as AuthUser;
}

export async function logout(): Promise<void> {
  await jsonRequest("/api/auth/logout", { method: "POST" });
}
