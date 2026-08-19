/**
 * Every colour is a CSS custom property, never a literal.
 *
 * That is what makes one component tree serve both themes: the class
 * `bg-surface` resolves through `var(--surface)`, and flipping
 * `[data-theme]` on <html> reassigns it. A hard-coded hex anywhere in a
 * component is a bug — it will look correct in whichever theme it was written
 * in and wrong in the other.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--base) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-2": "rgb(var(--accent-2) / <alpha-value>)",
        confident: "rgb(var(--confident) / <alpha-value>)",
        uncertain: "rgb(var(--uncertain) / <alpha-value>)",
        critical: "rgb(var(--critical) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        bn: ["Hind Siliguri", "Noto Sans Bengali", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "16px", "2xl": "20px", "3xl": "28px" },
      boxShadow: {
        glass: "0 8px 32px rgb(var(--shadow) / 0.18)",
        float: "0 24px 60px rgb(var(--shadow) / 0.22)",
        glow: "0 0 40px rgb(var(--accent) / 0.35)",
      },
      backdropBlur: { glass: "20px" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-ring": { "0%": { transform: "scale(1)", opacity: "0.5" }, "100%": { transform: "scale(1.6)", opacity: "0" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-up": "fade-up 300ms cubic-bezier(0.22,1,0.36,1) both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.22,1,0.36,1) infinite",
      },
    },
  },
  plugins: [],
};
