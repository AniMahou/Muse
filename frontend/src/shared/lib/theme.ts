import { create } from "zustand";

export type Theme = "dark" | "light";

const KEY = "muse-theme";

function read(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0A0E1A" : "#FBFAF7");
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: read(),
  toggle: () => get().set(get().theme === "dark" ? "light" : "dark"),
  set: (theme) => {
    localStorage.setItem(KEY, theme);
    apply(theme);
    set({ theme });
  },
}));

/** Re-apply on load, since index.html set the attribute before React existed. */
export function initTheme(): void {
  apply(useTheme.getState().theme);
}
