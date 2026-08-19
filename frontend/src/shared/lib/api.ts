import type { AuthResponse, PublicUser } from "@shared/auth.schema";

const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

let token: string | null = localStorage.getItem("muse-token");

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem("muse-token", next);
  else localStorage.removeItem("muse-token");
}
export function getToken(): string | null {
  return token;
}

/** Callers registered here are notified when the server rejects our token. */
const onUnauthorized: Array<() => void> = [];
export function onAuthFailure(fn: () => void): void {
  onUnauthorized.push(fn);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // An expired or invalid token must sign the user out everywhere at once,
    // rather than leaving each screen to fail on its own.
    if (res.status === 401) {
      setToken(null);
      for (const fn of onUnauthorized) fn();
    }
    throw new ApiError(
      res.status,
      body.error ?? "error",
      body.message ?? `Request failed (${res.status})`,
      body.details,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  postText: <T>(path: string, text: string) =>
    request<T>(path, { method: "POST", body: text, headers: { "Content-Type": "text/csv" } }),

  // -- auth ---------------------------------------------------------------
  register: (b: { companyName: string; name: string; email: string; password: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<{ user: PublicUser; company: { companyId: string; name: string } }>("/auth/me"),
};
