import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import { useAuth } from "@/shared/lib/auth-store";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { Logo } from "@/shared/ui/Logo";
import { Record } from "./Record";
import { Clarify } from "./Clarify";
import { MyDay } from "./MyDay";

/**
 * Mobile-first shell. Three destinations and no more — every extra screen in a
 * field app is one a rep has to think about, and thinking is what stops him
 * using it.
 */
export function FieldApp() {
  const logout = useAuth((s) => s.logout);

  const { data } = useQuery({
    queryKey: ["clarifications"],
    queryFn: () => api.get<{ clarifications: unknown[] }>("/clarifications"),
    refetchInterval: 60_000,
  });
  const pending = data?.clarifications.length ?? 0;

  return (
    <div className="min-h-dvh mx-auto max-w-md pb-24">
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 py-3
                         bg-base/80 backdrop-blur-glass border-b border-line/40">
        <Logo size={26} withText={false} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={logout}
                  className="glass h-10 w-10 rounded-xl grid place-items-center text-ink-soft"
                  aria-label="Sign out">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </header>

      <Routes>
        <Route index element={<Record />} />
        <Route path="clarify" element={<Clarify />} />
        <Route path="day" element={<MyDay />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>

      <nav className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-md">
        <div className="relative mx-4 mb-4 glass flex items-center justify-around py-2.5">
          <Tab to="/app/day" label="আমার দিন">
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          </Tab>

          <NavLink to="/app" end aria-label="রেকর্ড"
                   className="relative -mt-8 h-16 w-16 rounded-full grid place-items-center text-white shadow-glow"
                   style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
            </svg>
          </NavLink>

          <Tab to="/app/clarify" label="স্পষ্টীকরণ" badge={pending}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </Tab>
        </div>
      </nav>
    </div>
  );
}

function Tab({ to, label, badge, children }: {
  to: string; label: string; badge?: number; children: React.ReactNode;
}) {
  return (
    <NavLink to={to}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-1 px-5 py-1.5 transition-colors ${
          isActive ? "text-accent" : "text-ink-muted"
        }`
      }>
      <span className="relative">
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
             strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full
                           bg-uncertain text-[10px] font-semibold text-base grid place-items-center tabular-nums">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[10px] bn">{label}</span>
    </NavLink>
  );
}
