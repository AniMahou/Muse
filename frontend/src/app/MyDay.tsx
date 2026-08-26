import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clipQueue, type QueuedClip } from "./lib/queue";
import { WaveThumb } from "./Waveform";
import { useAuth } from "@/shared/lib/auth-store";
import { api } from "@/shared/lib/api";

interface Impact {
  observations: number;
  outletsCovered: number;
  alertsContributed: number;
  alertsActioned: number;
}

export function MyDay() {
  const user = useAuth((s) => s.user);
  const [clips, setClips] = useState<QueuedClip[]>([]);

  useEffect(() => {
    void clipQueue.all().then(setClips);
  }, []);

  const today = clips.filter(
    (c) => new Date(c.recordedAt).toDateString() === new Date().toDateString(),
  );
  const seconds = today.reduce((a, c) => a + c.durationSec, 0);

  return (
    <div className="px-5 py-6">
      <p className="text-sm text-ink-muted mb-1">
        {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="font-display text-2xl font-bold mb-6">{user?.name}</h1>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <Stat label="ক্লিপ" value={today.length} />
        <Stat label="সেকেন্ড" value={seconds} />
        <Stat label="পাঠানো" value={today.filter((c) => c.status === "sent").length} />
      </div>

      <Impact />

      <p className="label mb-3">আজকের রেকর্ড</p>
      <div className="space-y-2">
        {today.length === 0 && (
          <p className="text-sm text-ink-muted bn py-6 text-center">আজ এখনো কিছু রেকর্ড করা হয়নি</p>
        )}
        {today.map((c) => (
          <div key={c.clientUuid} className="glass flex items-center gap-3 px-4 py-3">
            <WaveThumb seed={c.clientUuid} className="text-accent shrink-0" />
            <div className="flex-1">
              <p className="text-sm tabular-nums">
                {new Date(c.recordedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
              <p className="text-xs text-ink-muted tabular-nums">{c.durationSec}s</p>
            </div>
            <span className={`h-2 w-2 rounded-full ${
              c.status === "sent" ? "bg-confident"
              : c.status === "failed" ? "bg-uncertain" : "bg-ink-muted"
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What this rep's reports changed.
 *
 * Everything above this counts effort — clips, seconds, uploads — and the
 * clarification prompts cost them more of it. Without something coming back,
 * a field tool is pure extraction, and reps stop using those in about two
 * weeks. This is the only part of the app that is about them.
 */
function Impact() {
  const { data } = useQuery({
    queryKey: ["me-impact"],
    queryFn: () => api.get<Impact>("/me/impact"),
    refetchInterval: 120_000,
  });

  // Nothing has landed yet. A row of zeroes reads like a reprimand, so say
  // nothing at all until there is something to report.
  if (!data || data.observations === 0) return null;

  return (
    <div className="glass px-5 py-4 mb-8">
      <p className="label mb-3">এই সপ্তাহে তোমার রিপোর্ট</p>
      <p className="text-sm leading-relaxed bn">
        <b className="stat-number text-accent">{data.observations}</b> টি তথ্য,{" "}
        <b className="stat-number text-accent">{data.outletsCovered}</b> টি দোকান থেকে।
      </p>
      {data.alertsContributed > 0 && (
        <p className="text-sm leading-relaxed bn mt-2 pt-2 border-t border-line/40">
          এর মধ্যে <b className="stat-number text-critical">{data.alertsContributed}</b> টি
          গুরুত্বপূর্ণ সংকেত তৈরি করেছে
          {data.alertsActioned > 0 && (
            <> — অফিস <b className="stat-number text-confident">{data.alertsActioned}</b> টিতে ব্যবস্থা নিয়েছে</>
          )}
          ।
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass px-4 py-4 text-center">
      <p className="stat-number text-2xl text-accent">{value}</p>
      <p className="text-[11px] text-ink-muted bn mt-1">{label}</p>
    </div>
  );
}
