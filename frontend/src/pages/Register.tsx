import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homeFor } from "@shared/auth.schema";
import { useAuth } from "@/shared/lib/auth-store";
import { ApiError } from "@/shared/lib/api";
import { AuthShell, FormError } from "./AuthShell";

export function Register() {
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();

  const [form, setForm] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const role = await register(form);
      navigate(homeFor(role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="You'll own the company account and can invite your field team next."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-accent hover:underline">Sign in</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormError message={error} />

        <div className="mb-4">
          <label className="label" htmlFor="companyName">Company</label>
          <input id="companyName" required autoFocus className="field"
                 value={form.companyName} onChange={set("companyName")}
                 placeholder="Acme FMCG Ltd" />
        </div>

        <div className="mb-4">
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" required className="field"
                 value={form.name} onChange={set("name")} placeholder="Tabib Hassan" />
        </div>

        <div className="mb-4">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="field"
                 value={form.email} onChange={set("email")} placeholder="you@company.com" />
        </div>

        <div className="mb-6">
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required autoComplete="new-password"
                 className="field" value={form.password} onChange={set("password")}
                 placeholder="At least 8 characters" />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : "Create workspace"}
        </button>

        <p className="mt-5 text-xs text-ink-muted leading-relaxed">
          Signing up creates a company workspace with you as its owner. Field
          representatives don't sign up themselves — you invite them, so nobody
          can create an account and pull down your product or outlet data.
        </p>
      </form>
    </AuthShell>
  );
}
