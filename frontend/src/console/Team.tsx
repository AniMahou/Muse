import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@shared/auth.schema";
import { api, ApiError } from "@/shared/lib/api";

/**
 * Provisioning, not sign-up.
 *
 * Field reps are invited here and nowhere else. A rep's brand portfolio is set
 * at the same time because it scopes the resolver's candidate set — creating
 * an account without one quietly makes that rep's matching worse.
 */
export function Team() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "rep" as "rep" | "admin", brandPortfolio: "",
  });

  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: PublicUser[] }>("/auth/users"),
  });

  const invite = useMutation({
    mutationFn: () =>
      api.post("/auth/invite", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        brandPortfolio: form.brandPortfolio.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "rep", brandPortfolio: "" });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not invite"),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    invite.mutate();
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1">Team</h1>
          <p className="text-ink-soft">
            Reps don't sign up — you provision them here.
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Invite"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="glass p-6 mb-8 grid md:grid-cols-2 gap-4 animate-fade-up">
          {error && (
            <p className="md:col-span-2 text-sm text-critical">{error}</p>
          )}
          <div>
            <label className="label">Name</label>
            <input required className="field" value={form.name} onChange={set("name")} />
          </div>
          <div>
            <label className="label">Email</label>
            <input required type="email" className="field" value={form.email} onChange={set("email")} />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input required minLength={8} className="field" value={form.password}
                   onChange={set("password")} placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="field" value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "rep" | "admin" }))}>
              <option value="rep">Field representative</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {form.role === "rep" && (
            <div className="md:col-span-2">
              <label className="label">Brand portfolio</label>
              <input className="field" value={form.brandPortfolio} onChange={set("brandPortfolio")}
                     placeholder="PRAN, Lux, Surf Excel" />
              <p className="mt-2 text-xs text-ink-muted leading-relaxed">
                Narrows product matching from the whole catalogue to what this rep
                actually carries. It raises accuracy — it isn't bookkeeping.
              </p>
            </div>
          )}
          <div className="md:col-span-2">
            <button className="btn-primary" disabled={invite.isPending}>
              {invite.isPending ? "Inviting…" : "Send invite"}
            </button>
          </div>
        </form>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data?.users ?? []).map((u) => (
          <div key={u.userId} className="glass p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full grid place-items-center text-white font-semibold
                              bg-gradient-to-br from-accent to-accent-2">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{u.name}</p>
                <p className="text-xs text-ink-muted truncate">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${
                u.role === "rep"
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-confident/15 text-confident border-confident/30"
              }`}>
                {u.role}
              </span>
              <span className="text-[11px] text-ink-muted">
                {u.lastLoginAt ? "active" : "never signed in"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
