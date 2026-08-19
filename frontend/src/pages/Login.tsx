import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { homeFor } from "@shared/auth.schema";
import { useAuth } from "@/shared/lib/auth-store";
import { ApiError } from "@/shared/lib/api";
import { AuthShell, FormError } from "./AuthShell";

export function Login() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const role = await login(email, password);
      navigate(homeFor(role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Field reps and administrators use the same form."
      footer={
        <>
          No account?{" "}
          <Link to="/register" className="text-accent hover:underline">Create one</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormError message={error} />

        <div className="mb-4">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email" type="email" required autoComplete="email" autoFocus
            className="field" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <div className="mb-6">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password" type="password" required autoComplete="current-password"
            className="field" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
