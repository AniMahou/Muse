import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import type { ClarificationOption } from "@shared/clarification.schema";

interface Prompt {
  clarificationId: string;
  clipId: string;
  kind: string;
  question: string;
  options: ClarificationOption[];
  confidence: number;
  createdAt: string;
}

/**
 * End-of-route questions, one tap each.
 *
 * Never a re-recording. By the time these arrive the rep is between outlets,
 * and asking him to record again means he simply never answers — which leaves
 * the record permanently uncertain.
 */
export function Clarify() {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["clarifications"],
    queryFn: () => api.get<{ clarifications: Prompt[] }>("/clarifications"),
  });

  const answer = useMutation({
    mutationFn: (v: { id: string; value: string | number }) =>
      api.post(`/clarifications/${v.id}/answer`, { value: v.value }),
    onSuccess: () => {
      setIndex((i) => i + 1);
      void qc.invalidateQueries({ queryKey: ["clarifications"] });
    },
  });

  const prompts = data?.clarifications ?? [];
  const current = prompts[index];

  if (isLoading) {
    return <div className="px-5 py-10 text-center text-ink-muted bn">লোড হচ্ছে…</div>;
  }

  if (!current) {
    return (
      <div className="px-5 py-16 text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-confident/15 grid place-items-center">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none"
               stroke="currentColor" strokeWidth="2" className="text-confident"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="font-bn text-xl mb-2">সব ঠিক আছে</p>
        <p className="text-sm text-ink-muted bn">কোনো প্রশ্ন নেই</p>
      </div>
    );
  }

  const remaining = prompts.length - index;

  return (
    <div className="px-5 py-6">
      <div className="flex items-center justify-between mb-6">
        <p className="font-bn text-lg">{toBengaliDigits(remaining)}টি বিষয় নিশ্চিত করুন</p>
        <div className="flex gap-1.5">
          {prompts.slice(0, 6).map((_, i) => (
            <span key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i < index ? "w-1.5 bg-confident" : i === index ? "w-5 bg-accent" : "w-1.5 bg-line"
                  }`} />
          ))}
        </div>
      </div>

      <div className="glass p-6 animate-fade-up" key={current.clarificationId}>
        <div className="flex items-center gap-2 mb-5 text-xs text-uncertain">
          <span className="h-1.5 w-1.5 rounded-full bg-uncertain" />
          <span className="tabular-nums">
            {Math.round(current.confidence * 100)}% — নিশ্চিত নয়
          </span>
        </div>

        <p className="font-bn text-2xl leading-relaxed mb-7">{current.question}</p>

        <div className="space-y-3">
          {current.options.map((opt) => (
            <button
              key={String(opt.value)}
              disabled={answer.isPending}
              onClick={() => answer.mutate({ id: current.clarificationId, value: opt.value })}
              className="w-full glass px-5 py-4 text-left transition-all
                         hover:border-accent/50 active:scale-[0.99] disabled:opacity-50"
            >
              <span className="flex items-center justify-between gap-4">
                <span className="font-medium">{opt.label}</span>
                {opt.score !== undefined && (
                  <span className="text-xs tabular-nums text-ink-muted shrink-0">
                    {Math.round(opt.score * 100)}
                  </span>
                )}
              </span>
              {opt.score !== undefined && (
                <span className="mt-2 block h-1 rounded-full bg-line/60 overflow-hidden">
                  <span className="block h-full rounded-full bg-accent/70"
                        style={{ width: `${Math.max(4, opt.score * 100)}%` }} />
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIndex((i) => i + 1)}
          className="mt-5 w-full text-center text-sm text-ink-muted bn hover:text-ink transition-colors"
        >
          পরে দেখব
        </button>
      </div>
    </div>
  );
}

function toBengaliDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]!);
}
