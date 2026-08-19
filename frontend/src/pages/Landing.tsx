import { Link } from "react-router-dom";
import { Logo } from "@/shared/ui/Logo";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

/**
 * The public front door.
 *
 * Leads with the loss, not the technology. Someone landing here should feel
 * the problem in the first screenful and only then be told there is a product.
 */
export function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login" className="btn-ghost !py-2 !px-4 text-sm">Sign in</Link>
            <Link to="/register" className="btn-primary !py-2 !px-4 text-sm">Get started</Link>
          </div>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <p className="font-bn text-2xl text-accent mb-6 animate-fade-up">মিউজ</p>

        <h1
          className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] animate-fade-up"
          style={{ animationDelay: "80ms" }}
        >
          Fifteen seconds of voice
          <br />
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            becomes field intelligence
          </span>
        </h1>

        <p
          className="mt-8 mx-auto max-w-2xl text-lg text-ink-soft animate-fade-up"
          style={{ animationDelay: "160ms" }}
        >
          A distribution rep speaks Bangla into a phone. Muse turns it into
          structured data a brand manager can act on — competitor promos,
          stock-outs, price changes — the same day, not six weeks later.
        </p>

        <div
          className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up"
          style={{ animationDelay: "240ms" }}
        >
          <Link to="/register" className="btn-primary">Start free</Link>
          <Link to="/login" className="btn-ghost">Sign in</Link>
        </div>
      </section>

      {/* ---- the loss ---- */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="glass p-10 md:p-14">
          <p className="text-sm uppercase tracking-wider text-ink-muted mb-6">The problem</p>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10">
            <div className="flex-1">
              <p className="text-2xl md:text-3xl font-display font-semibold leading-snug">
                A rep sees a competitor promo on Tuesday.
              </p>
            </div>
            <div className="hidden md:block h-px flex-1 bg-gradient-to-r from-accent/60 to-uncertain/60" />
            <div className="flex-1">
              <p className="text-2xl md:text-3xl font-display font-semibold leading-snug text-uncertain">
                The brand manager finds out in October.
              </p>
            </div>
          </div>
          <p className="mt-8 text-ink-soft max-w-2xl">
            Sales-force apps capture the order. They never capture the reason.
            Typing three sentences across forty outlets a day is impossible — so
            nobody does, and the most valuable data in the field dies on the road.
          </p>
        </div>
      </section>

      {/* ---- worked example ---- */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="font-display text-3xl font-bold text-center mb-3">
          The transcript is wrong. The data is right.
        </h2>
        <p className="text-center text-ink-soft mb-10 max-w-2xl mx-auto">
          Real speech recognition output from a real recording. Four words wrong —
          and every field still correct.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass p-6">
            <p className="label">What the model heard</p>
            <p className="font-bn text-lg leading-loose">
              <span className="text-uncertain">বজোই স্তোর</span> মে{" "}
              <span className="text-uncertain">প্রান</span> মাঙ্গো জুস{" "}
              <span className="text-uncertain">দের দর্জন</span> লাগবে
            </p>
            <p className="mt-4 text-xs text-ink-muted">
              Highlighted words are mis-transcribed.
            </p>
          </div>

          <div className="glass p-6">
            <p className="label">What Muse extracted</p>
            <dl className="space-y-3 text-sm">
              {[
                ["Outlet", "Bijoy Store", 0.79],
                ["Product", "PRAN Mango Juice 250ml", 0.98],
                ["Quantity", "18 piece", 0.85],
              ].map(([k, v, c]) => (
                <div key={k as string} className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">{k as string}</dt>
                  <dd className="flex items-center gap-3">
                    <span className="font-medium">{v as string}</span>
                    <span className="text-xs tabular-nums text-confident">
                      {((c as number) * 100).toFixed(0)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-ink-muted font-mono">দেড় ডজন = 1.5 × 12</p>
          </div>
        </div>
      </section>

      {/* ---- how ---- */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              t: "It knows when it doesn't know",
              d: "Confidence is derived from the audio, the resolver margin and the grammar — never self-reported by a model. Uncertain fields are flagged, never silently guessed.",
            },
            {
              t: "It cannot invent a product",
              d: "The response schema is rebuilt for every clip, with identity fields restricted to what the resolvers actually found. A product that was never resolved is not expressible.",
            },
            {
              t: "It learns from one correction",
              d: "An admin approves a misheard word once, and the resolver stops being uncertain about it — permanently, for every rep in the company.",
            },
          ].map((f, i) => (
            <div key={f.t} className="glass p-7 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent to-accent-2 mb-5" />
              <h3 className="font-display text-lg font-semibold mb-3">{f.t}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line/50">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <Logo size={24} />
          <p className="text-sm text-ink-muted">Built in Dhaka.</p>
        </div>
      </footer>
    </div>
  );
}
