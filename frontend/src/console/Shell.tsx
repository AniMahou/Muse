import { NavLink, Outlet } from "react-router-dom";
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
    <div className="min-h-dvh flex">
      <aside className="hidden md:flex w-[68px] shrink-0 flex-col items-center gap-1 py-5
                        border-r border-line/40 bg-raised/30">
        <div className="mb-5"><Logo size={30} withText={false} /></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} title={n.label}
            className={({ isActive }) =>
              `relative h-11 w-11 rounded-xl grid place-items-center transition-colors ${
                isActive ? "text-accent bg-accent/12" : "text-ink-muted hover:text-ink"
              }`
            }>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-[14px] h-6 w-[3px] rounded-full bg-accent" />}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d={n.icon} />
                </svg>
              </>
            )}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col items-center gap-2">
          <ThemeToggle />
          <button onClick={logout} title="Sign out"
                  className="h-11 w-11 rounded-xl grid place-items-center text-ink-muted hover:text-ink">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line/40">
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

        <main className="flex-1 p-6 overflow-x-hidden"><Outlet /></main>
      </div>
    </div>
  );
}
