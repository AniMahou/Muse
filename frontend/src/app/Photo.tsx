import { useEffect, useRef, useState } from "react";
import { api } from "@/shared/lib/api";
import { getPosition } from "./lib/recorder";

const SAMPLES = [
  { src: "/samples/note-1.svg", label: "বিজয় স্টোর" },
  { src: "/samples/note-2.svg", label: "রহমান স্টোর" },
  { src: "/samples/note-3.svg", label: "নিউ আলম" },
];

type Phase = "idle" | "reading" | "processing" | "done" | "error";

/**
 * Photographed order notes.
 *
 * The same pipeline as voice — quantity grammar, phonetic resolver, assembly,
 * confidence gate — with a different first stage. Only text extraction differs
 * between a spoken sentence and a photographed one, so everything after it is
 * shared code rather than a parallel implementation.
 *
 * Text extraction itself is SIMULATED for now, and the interface says so
 * plainly wherever a result appears.
 */
export function Photo() {
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [clipId, setClipId] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** null until a clip has been processed; then whatever actually read it. */
  const [simulated, setSimulated] = useState<boolean | null>(null);
  const [extractor, setExtractor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  async function submit(blob: Blob, previewUrl: string) {
    setPreview(previewUrl);
    setPhase("reading");
    setError(null);
    setText(null);
    setCount(0);
    setSimulated(null);
    setExtractor(null);

    try {
      const base64 = await toBase64(blob);
      const geo = await getPosition();

      const res = await api.post<{ clipId: string }>("/observations", {
        clientUuid: crypto.randomUUID(),
        audioBase64: base64,
        mimeType: blob.type || "image/png",
        source: "photo",
        geo,
        declaredOutletId: null,
        recordedAt: new Date().toISOString(),
      });
      setClipId(res.clipId);
      setPhase("processing");

      poll.current = window.setInterval(async () => {
        const clip = await api.get<{
          status: string; transcriptText: string | null; observationCount: number; error: string | null;
          simulated: boolean; extractor: string | null; extractorModel: string | null;
        }>(`/clips/${res.clipId}`);

        if (clip.status === "processed") {
          if (poll.current) clearInterval(poll.current);
          setText(clip.transcriptText);
          setCount(clip.observationCount);
          setSimulated(clip.simulated);
          setExtractor(clip.extractorModel ?? clip.extractor);
          setPhase("done");
        } else if (clip.status === "failed") {
          if (poll.current) clearInterval(poll.current);
          setError(clip.error ?? "প্রক্রিয়াকরণ ব্যর্থ");
          setPhase("error");
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "আপলোড ব্যর্থ");
      setPhase("error");
    }
  }

  async function useSample(src: string) {
    const blob = await (await fetch(src)).blob();
    void submit(blob, src);
  }

  function reset() {
    if (poll.current) clearInterval(poll.current);
    setPreview(null); setPhase("idle"); setText(null); setCount(0);
    setError(null); setClipId(null);
  }

  return (
    <div className="px-5 py-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-bn text-xl">নোটের ছবি</h1>
        {simulated !== false && (
          <span className="shrink-0 rounded-full border border-uncertain/40 bg-uncertain/10
                           px-2.5 py-1 text-[10px] font-medium text-uncertain">
            {simulated === null ? "OCR" : "SIMULATED OCR"}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted bn mb-6">
        হাতে লেখা অর্ডার নোটের ছবি তুলুন
      </p>

      {phase === "idle" && (
        <>
          <button onClick={() => fileRef.current?.click()}
                  className="glass w-full border-2 border-dashed border-line p-8 mb-5
                             hover:border-accent/50 transition-colors">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
                 strokeWidth="1.5" className="mx-auto mb-3 text-accent"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p className="font-bn text-base">ছবি তুলুন বা বেছে নিন</p>
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only"
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   if (f) void submit(f, URL.createObjectURL(f));
                 }} />

          <p className="label mb-3">নমুনা</p>
          <div className="grid grid-cols-3 gap-3">
            {SAMPLES.map((s) => (
              <button key={s.src} onClick={() => void useSample(s.src)}
                      className="glass overflow-hidden p-0 hover:border-accent/50 transition-colors">
                <img src={s.src} alt={s.label} className="w-full aspect-[4/3] object-cover" />
                <span className="block px-2 py-2 text-[11px] bn text-ink-muted truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {phase !== "idle" && (
        <div className="space-y-4">
          {preview && (
            <div className="glass overflow-hidden p-0 relative">
              <img src={preview} alt="" className="w-full" />
              {(phase === "reading" || phase === "processing") && (
                // A scan line moving down the image, so the wait reads as work
                // being done rather than as the app having stalled.
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute inset-x-0 h-24 animate-[scan_1.8s_ease-in-out_infinite]"
                       style={{ background: "linear-gradient(180deg, transparent, rgb(var(--accent)/0.35), transparent)" }} />
                </div>
              )}
            </div>
          )}

          {(phase === "reading" || phase === "processing") && (
            <div className="glass px-4 py-3 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm bn">
                {phase === "reading" ? "লেখা পড়া হচ্ছে…" : "বিশ্লেষণ করা হচ্ছে…"}
              </span>
            </div>
          )}

          {phase === "done" && text && (
            <>
              <div className="glass p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="label !mb-0">যা পড়া হয়েছে</p>
                  <span className="text-[10px] text-uncertain">
                    {simulated ? "simulated" : (extractor ?? "")}
                  </span>
                </div>
                <p className="font-bn text-lg leading-loose">{text}</p>
              </div>

              <div className="glass p-5">
                <p className="label">পাইপলাইন</p>
                <p className="text-sm bn">
                  {count}টি তথ্য পাওয়া গেছে — দোকান, পণ্য আর পরিমাণ শনাক্ত করা হয়েছে
                </p>
                <p className="mt-3 text-xs text-ink-muted leading-relaxed">
                  {simulated
                    ? "Extraction is simulated. Everything after it — the Bangla quantity grammar, product matching and confidence scoring — is the same code that runs on voice."
                    : "Read by our own recogniser, trained on Bangla type. Finding the lines in a photograph is not a trained model yet, so expect misreadings — everything after extraction is the same code that runs on voice."}
                </p>
              </div>
            </>
          )}

          {phase === "error" && (
            <div className="glass p-4 text-sm text-critical bn">{error}</div>
          )}

          <button onClick={reset} className="btn-ghost w-full">
            <span className="bn">আরেকটি ছবি</span>
          </button>
        </div>
      )}

      {clipId && phase === "done" && (
        <p className="mt-4 text-center text-[11px] text-ink-muted font-mono">{clipId.slice(0, 18)}…</p>
      )}
    </div>
  );
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("could not read image"));
    r.onload = () => {
      const s = r.result as string;
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.readAsDataURL(blob);
  });
}
