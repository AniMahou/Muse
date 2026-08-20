import { useQuery } from "@tanstack/react-query";
import type { Outlet, Sku } from "@shared/catalog";
import type { PublicUser } from "@shared/auth.schema";
import { api } from "@/shared/lib/api";

/**
 * Id → human name, for the whole console.
 *
 * The pipeline speaks in identifiers because they are stable and unambiguous;
 * a brand manager does not. Showing "SKU-404" and "OUT-1182" on a dashboard
 * makes it look like a database viewer, and worse, it hides whether the system
 * matched the RIGHT product — which is the one thing a reviewer is there to
 * judge.
 *
 * Fetched once and cached for the session: master data changes on import, not
 * on the timescale of a page view.
 */
export interface Directory {
  sku: (id: string | null) => string;
  outlet: (id: string | null) => string;
  rep: (id: string | null) => string;
  skus: Sku[];
  ready: boolean;
}

const HOUR = 60 * 60 * 1000;

export function useDirectory(): Directory {
  const skus = useQuery({
    queryKey: ["dir", "skus"],
    queryFn: () => api.get<{ skus: Sku[] }>("/admin/catalog/skus?limit=1000"),
    staleTime: HOUR,
  });
  const outlets = useQuery({
    queryKey: ["dir", "outlets"],
    queryFn: () => api.get<{ outlets: Outlet[] }>("/admin/catalog/outlets"),
    staleTime: HOUR,
  });
  const users = useQuery({
    queryKey: ["dir", "users"],
    queryFn: () => api.get<{ users: PublicUser[] }>("/auth/users"),
    staleTime: HOUR,
  });

  const skuMap = new Map((skus.data?.skus ?? []).map((s) => [s.skuId, s]));
  const outletMap = new Map((outlets.data?.outlets ?? []).map((o) => [o.outletId, o.name]));
  const repMap = new Map(
    (users.data?.users ?? []).filter((u) => u.repId).map((u) => [u.repId!, u.name]),
  );

  return {
    // Falls back to the id rather than rendering nothing. An unresolvable id
    // means the master data is out of sync, and hiding that helps nobody.
    sku: (id) => {
      if (!id) return "—";
      const s = skuMap.get(id);
      return s ? (s.pack ? `${s.name} ${s.pack}` : s.name) : id;
    },
    outlet: (id) => (id ? (outletMap.get(id) ?? id) : "—"),
    rep: (id) => (id ? (repMap.get(id) ?? id) : "—"),
    skus: skus.data?.skus ?? [],
    ready: skus.isSuccess && outlets.isSuccess,
  };
}

/** "৳5 less" reads as a price movement; "৳-5" reads as a broken number. */
export function formatDelta(delta: number): string {
  const abs = Math.abs(delta).toLocaleString("en-BD");
  return delta < 0 ? `৳${abs} less` : `৳${abs} more`;
}
