import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

export function AuthShell({
  title, subtitle, children, footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8">
        <div className="flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 grid place-items-center py-10">
          <div className="w-full max-w-sm animate-fade-up">
            <h1 className="font-display text-3xl font-bold mb-2">{title}</h1>
            <p className="text-ink-soft mb-8">{subtitle}</p>
            {children}
            <div className="mt-6 text-sm text-ink-soft">{footer}</div>
          </div>
        </div>
      </div>

      {/* Story side — hidden on mobile, where it would just push the form down */}
      <div className="hidden lg:flex relative items-center justify-center overflow-hidden border-l border-line/40">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent-2/10" />
        <div className="relative max-w-md px-12">
          <p className="font-bn text-3xl leading-loose mb-8">
            বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে
          </p>
          <div className="h-px w-16 bg-gradient-to-r from-accent to-accent-2 mb-8" />
          <div className="space-y-3 text-sm">
            {[
              ["OUTLET", "Bijoy Store"],
              ["PRODUCT", "PRAN Mango Juice 250ml"],
              ["QUANTITY", "18 piece"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6">
                <span className="text-ink-muted tracking-wider text-xs pt-0.5">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-ink-muted">
            Fifteen seconds of speech, structured.
          </p>
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-5 rounded-xl border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
      {message}
    </div>
  );
}
