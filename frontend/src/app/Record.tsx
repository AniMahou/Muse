import { useCallback, useEffect, useRef, useState } from "react";
import { startRecording, getPosition, type RecorderHandle } from "./lib/recorder";
import { clipQueue, drainQueue, type QueuedClip } from "./lib/queue";
import { WaveRing, WaveThumb } from "./Waveform";

const BUTTON = 236;
const MIN_DURATION_MS = 900;
/** Release inside this window means "tap", so recording stays on until tapped again. */
const TAP_THRESHOLD_MS = 400;

const STATUS_BN: Record<QueuedClip["status"], string> = {
  pending: "অপেক্ষমাণ",
  uploading: "পাঠানো হচ্ছে",
  sent: "পাঠানো হয়েছে",
  failed: "আবার চেষ্টা হবে",
};

/**
 * The screen the whole product depends on.
 *
 * Press, speak, release. Nothing blocks: the clip goes to IndexedDB first and
 * uploads in the background, so a dead connection is invisible to the rep and
 * he can walk to the next shop immediately.
 */
export function Record() {
  const [recording, setRecording] = useState(false);
  /** True when a short tap started the recording, so a second tap stops it. */
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(Array(48).fill(0));
  const [elapsed, setElapsed] = useState(0);
  const [clips, setClips] = useState<QueuedClip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  const handle = useRef<RecorderHandle | null>(null);
  const startedAt = useRef(0);
  const raf = useRef(0);

  const refresh = useCallback(async () => setClips(await clipQueue.all()), []);

  useEffect(() => {
    void refresh();
    void drainQueue(refresh);

    const goOnline = () => { setOnline(true); void drainQueue(refresh); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // A slow sweep, not a busy poll — this runs on a phone battery all day.
    const timer = setInterval(() => void drainQueue(refresh), 20_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
      cancelAnimationFrame(raf.current);
    };
  }, [refresh]);

  const tick = useCallback(() => {
    if (handle.current) {
      setLevels(handle.current.levels());
      setElapsed(Date.now() - startedAt.current);
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  async function begin() {
    if (recording) return;
    setError(null);
    setNotice(null);
    try {
      handle.current = await startRecording();
      startedAt.current = Date.now();
      setRecording(true);
      raf.current = requestAnimationFrame(tick);
    } catch (err) {
      // Distinguish the failure modes. "Permission denied" and "no microphone
      // found" need completely different actions from the user, and a single
      // generic message leaves them with nothing to try.
      const name = err instanceof Error ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "মাইক্রোফোনের অনুমতি দেওয়া হয়নি — ব্রাউজারের ঠিকানা বারে অনুমতি দিন"
          : name === "NotFoundError"
            ? "কোনো মাইক্রোফোন পাওয়া যায়নি"
            : "রেকর্ড শুরু করা গেল না",
      );
    }
  }

  async function finish() {
    if (!recording || !handle.current) return;
    cancelAnimationFrame(raf.current);
    setRecording(false);
    setLocked(false);
    setLevels(Array(48).fill(0));

    const duration = Date.now() - startedAt.current;
    const rec = handle.current;
    handle.current = null;

    // Too short to contain anything. Discard rather than upload noise — but
    // SAY SO. Silently dropping the clip is indistinguishable from a broken
    // button, which is exactly how this failed before.
    if (duration < MIN_DURATION_MS) {
      rec.cancel();
      setElapsed(0);
      setNotice("খুব ছোট — একটু ধরে রাখুন");
      setTimeout(() => setNotice(null), 2500);
      return;
    }

    const blob = await rec.stop();
    // Position is captured HERE, at record time. It cannot be recovered later
    // because the rep has already walked to the next shop.
    const geo = await getPosition();

    await clipQueue.add({
      clientUuid: crypto.randomUUID(),
      blob,
      mimeType: blob.type || rec.mimeType,
      geo,
      declaredOutletId: null,
      recordedAt: new Date().toISOString(),
      durationSec: Math.round(duration / 1000),
      attempts: 0,
      status: "pending",
    });

    setElapsed(0);
    await refresh();
    void drainQueue(refresh);
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] px-5 pb-4">
      {!online && (
        <div className="glass mt-3 px-4 py-2.5 text-sm text-uncertain flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-uncertain" />
          <span className="bn">ইন্টারনেট নেই — রেকর্ড চালিয়ে যান, পরে যাবে</span>
        </div>
      )}
      {error && (
        <div className="glass mt-3 px-4 py-2.5 text-sm text-critical bn">{error}</div>
      )}

      {/* Hero */}
      <div className="flex-1 grid place-items-center py-6">
        <div className="relative grid place-items-center" style={{ width: BUTTON, height: BUTTON }}>
          {recording && (
            <>
              <span className="absolute rounded-full bg-accent/20 animate-pulse-ring"
                    style={{ width: BUTTON * 0.78, height: BUTTON * 0.78 }} />
              <span className="absolute rounded-full bg-accent/20 animate-pulse-ring"
                    style={{ width: BUTTON * 0.78, height: BUTTON * 0.78, animationDelay: "700ms" }} />
            </>
          )}

          <WaveRing levels={levels} size={BUTTON} active={recording} />

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              // Pointer capture keeps every subsequent event on THIS element
              // even once the finger or cursor drifts off it. Without it the
              // press-scale animation moves the button's edge under the
              // cursor, fires pointerleave, and ends the recording instantly.
              e.currentTarget.setPointerCapture(e.pointerId);
              if (locked) { void finish(); return; }
              void begin();
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              if (locked) return;
              // A quick tap LOCKS recording so a second tap stops it; holding
              // longer behaves as push-to-talk. Hold-only is unusable with a
              // mouse and awkward one-handed on a phone.
              if (Date.now() - startedAt.current < TAP_THRESHOLD_MS) {
                setLocked(true);
                return;
              }
              void finish();
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={recording ? "রেকর্ড বন্ধ করুন" : "ধরে বলুন"}
            className={`relative rounded-full grid place-items-center select-none touch-none
                        text-white transition-transform duration-150
                        ${recording ? "scale-[0.97]" : "active:scale-[0.97]"}`}
            style={{
              width: BUTTON * 0.72,
              height: BUTTON * 0.72,
              background: "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))",
              boxShadow: recording
                ? "0 0 70px rgb(var(--accent) / 0.55)"
                : "0 0 40px rgb(var(--accent) / 0.35)",
            }}
          >
            <svg viewBox="0 0 24 24" width="46" height="46" fill="none"
                 stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
            </svg>
            <span className="absolute bottom-8 bn text-sm font-medium">
              {recording ? formatDuration(elapsed) : "ধরে বলুন"}
            </span>
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-ink-muted bn max-w-[17rem] min-h-[2.5rem]">
          {notice
            ? <span className="text-uncertain">{notice}</span>
            : recording
              ? locked ? "থামাতে আবার চাপুন" : "ছেড়ে দিলে পাঠানো হবে"
              : "চেপে ধরে বলুন, বা একবার চাপুন"}
        </p>
      </div>

      {/* Local queue */}
      <div className="space-y-2">
        {clips.slice(0, 4).map((clip) => (
          <div key={clip.clientUuid} className="glass flex items-center gap-3 px-4 py-3">
            <WaveThumb seed={clip.clientUuid} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium bn truncate">
                {new Date(clip.recordedAt).toLocaleTimeString("bn-BD", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
              <p className="text-xs text-ink-muted tabular-nums">{clip.durationSec}s</p>
            </div>
            <StatusChip status={clip.status} />
          </div>
        ))}
        {clips.length === 0 && (
          <p className="text-center text-sm text-ink-muted bn py-4">এখনো কোনো রেকর্ড নেই</p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: QueuedClip["status"] }) {
  // Amber for "sending" — it is normal progress, not a failure. Red here would
  // teach a rep that the app is broken every time the network is slow.
  const cls: Record<QueuedClip["status"], string> = {
    sent: "bg-confident/15 text-confident border-confident/30",
    uploading: "bg-uncertain/15 text-uncertain border-uncertain/30",
    pending: "bg-line/40 text-ink-muted border-line",
    failed: "bg-uncertain/10 text-uncertain border-uncertain/25",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] bn ${cls[status]}`}>
      {STATUS_BN[status]}
    </span>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
