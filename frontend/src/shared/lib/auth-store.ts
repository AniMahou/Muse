import { create } from "zustand";
import type { PublicUser, Role } from "@shared/auth.schema";
import { api, setToken, getToken, onAuthFailure } from "./api";

interface AuthState {
  user: PublicUser | null;
  company: { companyId: string; name: string } | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Role>;
  register: (b: { companyName: string; name: string; email: string; password: string }) => Promise<Role>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  company: null,
  // Starts true when a token exists: the app must not flash the login screen
  // while it is still checking whether that token is good.
  loading: Boolean(getToken()),

  login: async (email, password) => {
    const res = await api.login({ email, password });
    setToken(res.token);
    set({ user: res.user, company: res.company, loading: false });
    return res.user.role;
  },

  register: async (body) => {
    const res = await api.register(body);
    setToken(res.token);
    set({ user: res.user, company: res.company, loading: false });
    return res.user.role;
  },

  logout: () => {
    setToken(null);
    set({ user: null, company: null, loading: false });
  },

  restore: async () => {
    if (!getToken()) {
      set({ loading: false });
      return;
    }
    try {
      const { user, company } = await api.me();
      set({ user, company, loading: false });
    } catch {
      // api.ts already cleared the token on a 401.
      set({ user: null, loading: false });
    }
  },
}));

onAuthFailure(() => useAuth.setState({ user: null, company: null, loading: false }));
