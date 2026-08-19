/**
 * Microphone capture with a live level meter.
 *
 * Two things happen at once: MediaRecorder writes compressed audio, and an
 * AnalyserNode feeds the waveform. The waveform is not decoration — it is the
 * only feedback a rep gets that the microphone is actually hearing him, and in
 * a noisy market that matters more than any status text.
 */
export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
  levels: () => number[];
  mimeType: string;
}

const BAR_COUNT = 48;

/** Opus where available — roughly a tenth the bytes of WAV on a field connection. */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 24_000 } : {});
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);

  // Level metering
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);
  const buffer = new Uint8Array(analyser.frequencyBinCount);

  const teardown = () => {
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close().catch(() => undefined);
  };

  return {
    mimeType: recorder.mimeType || mimeType || "audio/webm",

    levels() {
      analyser.getByteFrequencyData(buffer);
      const step = Math.floor(buffer.length / BAR_COUNT) || 1;
      const out: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += buffer[i * step + j] ?? 0;
        out.push(Math.min(1, sum / step / 180));
      }
      return out;
    },

    stop() {
      return new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          teardown();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        if (recorder.state !== "inactive") recorder.stop();
        else resolve(new Blob(chunks, { type: "audio/webm" }));
      });
    },

    cancel() {
      if (recorder.state !== "inactive") recorder.stop();
      teardown();
    },
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read audio"));
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/** Best-effort position. Never blocks a recording — the clip matters more. */
export function getPosition(timeoutMs = 4000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
