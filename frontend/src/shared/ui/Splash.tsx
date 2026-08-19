import { Logo } from "./Logo";

/** Shown only while an existing token is being validated. */
export function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="animate-pulse opacity-60">
        <Logo size={48} withText={false} />
      </div>
    </div>
  );
}
