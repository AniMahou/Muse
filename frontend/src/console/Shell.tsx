import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/shared/lib/auth-store";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { Logo } from "@/shared/ui/Logo";

const NAV = [
  { to: "/console", label: "Today", end: true, icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { to: "/console/intelligence", label: "Intelligence", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { to: "/console/review", label: "Review", icon: "M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { to: "/console/aliases", label: "Teach", icon: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  { to: "/console/catalog", label: "Catalog", icon: "M4 7V4h16v3M9 20h6M12 4v16" },
  { to: "/console/team", label: "Team", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87" },
];

export function Shell() {
  const { user, company, logout } = useAuth();

  return (
    // Fixed-height app shell: the root is pinned to the viewport and clips,
    // so <main> is the ONE scroll container. Previously the root grew with its
    // content while main also declared overflow-y:auto — main sized itself to
    // fit and never scrolled, the body could not scroll either, and everything
    // below the fold was simply unreachable.
    <div className="h-dvh flex overflow-hidden">
      {/* Labelled, not icon-only. Six abstract glyphs with tooltips means the
          user has to hover each one to learn the app — 130px of width is a
          cheap price for never having to. */}
      <aside className="hidden md:flex w-[200px] shrink-0 flex-col gap-1 p-4 overflow-y-auto
                        border-r border-line/40 bg-raised/30">
        <div className="mb-5 px-2"><Logo size={28} /></div>

        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) =>
              `relative flex items-center gap-3 h-10 rounded-xl px-3 text-sm transition-colors ${
                isActive ? "text-accent bg-accent/12 font-medium" : "text-ink-soft hover:text-ink hover:bg-raised/60"
              }`
            }>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d={n.icon} />
            </svg>
            {n.label}
          </NavLink>
        ))}

        {/* The core interaction lives in the other app. Without this link an
            owner has no way to reach the recorder at all. */}
        {user?.repId && (
          <Link to="/app"
                className="mt-3 flex items-center gap-3 h-11 rounded-xl px-3 text-sm font-medium
                           text-white shadow-glow transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))" }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" className="shrink-0">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
            </svg>
            Record a clip
          </Link>
        )}

        <div className="mt-auto flex items-center gap-2">
          <ThemeToggle />
          <button onClick={logout}
                  className="flex-1 flex items-center gap-2 h-10 rounded-xl px-3 text-sm
                             text-ink-muted hover:text-ink hover:bg-raised/60 transition-colors">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-b border-line/40">
          <div className="min-w-0">
            <p className="font-display font-semibold truncate">{company?.name ?? "Muse"}</p>
            <p className="text-xs text-ink-muted truncate">{user?.email}</p>
          </div>
          <nav className="md:hidden flex gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ${
                    isActive ? "bg-accent/15 text-accent" : "text-ink-muted"
                  }`
                }>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="md:hidden"><ThemeToggle /></div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6"><Outlet /></main>
      </div>
    </div>
  );
}
