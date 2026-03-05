import { create } from "zustand";
import { API_BASE } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  canvasUserId?: number;
  hasCanvas?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (token: string, user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (partial: Partial<User>) => void;
  /** Try to restore session from stored token */
  restoreSession: () => Promise<void>;
}

const TOKEN_KEY = "adiutask_token";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, isAuthenticated: false });
  },

  setLoading: (isLoading) => set({ isLoading }),

  updateUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),

  restoreSession: async () => {
    // Check URL for token from SSO callback redirect
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    if (urlToken) {
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname);
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${urlToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          get().login(urlToken, data.user);
          return;
        }
      } catch {
        // Token from URL was invalid, fall through
      }
    }

    // Try to restore from localStorage
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          get().login(storedToken, data.user);
          return;
        }
      } catch {
        // Token was invalid
      }
      localStorage.removeItem(TOKEN_KEY);
    }

    set({ isLoading: false });
  },
}));
