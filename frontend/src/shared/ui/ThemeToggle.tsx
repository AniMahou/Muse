import { useTheme } from "@/shared/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      className={`glass relative h-10 w-10 rounded-xl grid place-items-center
                  text-ink-soft hover:text-ink transition-colors ${className}`}
    >
      <span className="relative block h-5 w-5">
        {/* Both icons are always mounted and cross-fade, so the toggle never
            reflows the header on switch. */}
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`absolute inset-0 transition-all duration-300
                      ${dark ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"}`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`absolute inset-0 transition-all duration-300
                      ${dark ? "opacity-0 rotate-90" : "opacity-100 rotate-0"}`}
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
