/**
 * Record evaluation clips from this machine's microphone.
 *
 *   npm run mic                    interactive — record clip after clip
 *   npm run mic -- 1a              record one clip and exit
 *   npm run mic -- --devices       list input devices
 *   npm run mic -- 1a --device "Microphone (Realtek)"
 *
 * scripts/record.sh is the other microphone tool and does something different:
 * it records once and pushes the result through a RUNNING api to debug the
 * pipeline. This one is for building the evaluation set — it needs no server,
 * no database and no API key, it writes straight into datasets/clips/, and it
 * is the same on Windows, Linux and macOS. Collecting forty clips should not
 * require anything else to be up.
 *
 * ffmpeg names its capture backend differently per platform (dshow, pulse,
 * avfoundation) and on Windows needs the device's literal name, so the tool
 * detects rather than asks. A collector who has to work out what their own
 * microphone is called has already lost twenty minutes.
 */
import { spawn, execFile } from "node:child_process";
import readline from "node:readline/promises";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);
const OUT_DIR = path.resolve(process.cwd(), "datasets/clips");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

/** ffmpeg prints device lists to stderr and exits non-zero. That is not a failure. */
async function ffmpegStderr(args: string[]): Promise<string> {
  try {
    const { stderr } = await exec("ffmpeg", args);
    return stderr;
  } catch (err) {
    return (err as { stderr?: string }).stderr ?? "";
  }
}

async function listDevices(): Promise<string[]> {
  const platform = os.platform();

  if (platform === "win32") {
    const out = await ffmpegStderr(["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
    const names: string[] = [];
    // Lines look like:  [dshow @ ...] "Microphone (Realtek(R) Audio)" (audio)
    const re = /"([^"]+)"\s*\((audio)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) names.push(m[1]!);
    return names;
  }

  if (platform === "darwin") {
    const out = await ffmpegStderr(["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
    const names: string[] = [];
    let inAudio = false;
    for (const line of out.split("\n")) {
      if (/AVFoundation audio devices/i.test(line)) { inAudio = true; continue; }
      if (/AVFoundation video devices/i.test(line)) { inAudio = false; continue; }
      const m = /\[(\d+)\]\s+(.+?)\s*$/.exec(line.replace(/^\[[^\]]*\]\s*/, ""));
      if (inAudio && m) names.push(`${m[1]}: ${m[2]}`);
    }
    return names;
  }

  const out = await exec("pactl", ["list", "sources", "short"]).then((r) => r.stdout).catch(() => "");
  return out.split("\n").filter(Boolean).map((l) => l.split("\t")[1] ?? l);
}

/** ffmpeg input arguments for this platform's default (or chosen) microphone. */
function inputArgs(device: string | undefined): string[] {
  switch (os.platform()) {
    case "win32":
      return ["-f", "dshow", "-i", `audio=${device ?? "default"}`];
    case "darwin":
      return ["-f", "avfoundation", "-i", `:${device ?? "0"}`];
    default:
      // pulse covers essentially every modern desktop Linux and WSLg.
      return ["-f", device === undefined ? "pulse" : "pulse", "-i", device ?? "default"];
  }
}

async function defaultDevice(): Promise<string | undefined> {
  if (os.platform() !== "win32") return undefined;
  // dshow has no "default" alias — it needs the literal name.
  const devices = await listDevices();
  return devices[0];
}

function normaliseClipId(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/^clip-\d{2}-[a-z]$/.test(s)) return s;
  const m = /^(\d{1,2})\s*([a-z])?$/.exec(s);
  if (!m) return null;
  const card = m[1]!.padStart(2, "0");
  return `clip-${card}-${m[2] ?? "a"}`;
}

async function durationOf(file: string): Promise<number | null> {
  try {
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Record until the operator presses Enter.
 *
 * A fixed -t duration forces every clip into the same length, which is wrong
 * for speech: the reports are naturally between eight and twenty seconds and
 * cutting one off mid-sentence produces a clip whose transcript can never be
 * right. ffmpeg finalises the container cleanly when it receives "q" on stdin,
 * so stopping this way leaves a valid file.
 */
async function recordOne(clipId: string, device: string | undefined, rl: readline.Interface): Promise<boolean> {
  const out = path.join(OUT_DIR, `${clipId}.wav`);

  if (await fs.access(out).then(() => true, () => false)) {
    const ans = (await rl.question(c.yellow(`  ${clipId} already exists. Overwrite? [y/N] `))).trim().toLowerCase();
    if (ans !== "y") return false;
  }

  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputArgs(device),
    "-ar", "16000", "-ac", "1",
    // A machine-readable position report every few hundred ms. It is the only
    // signal that says when capture actually began: the output file's size
    // lags by however long ffmpeg buffers before its first flush, which is
    // seconds, so polling the file would make the operator wait long after
    // the microphone was already live.
    "-progress", "pipe:1",
    out,
  ];

  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr?.on("data", (d) => { stderr += String(d); });
  const done = new Promise<number>((resolve) => proc.on("close", resolve));

  // Capture does not begin when ffmpeg starts. Opening the device costs about
  // a second on a warm system and several on the first run of the day, while
  // the OS initialises it or asks for microphone permission. Saying "speak
  // now" at spawn time silently loses the opening words of a clip — and a clip
  // missing its first three words has a transcript that can never be right,
  // which would then be scored as the pipeline's error rather than the
  // recorder's. So wait until bytes are actually landing in the file.
  const live = await waitForCapture(proc);
  if (!live) {
    proc.kill();
    console.log(c.red(`  the microphone did not start.\n${stderr.trim()}\n`) +
      c.dim("  try:  npm run mic -- --devices\n"));
    return false;
  }

  console.log(`  ${c.red("●")} ${c.bold("RECORDING")} ${clipId}   ${c.dim("— speak now, press ENTER to stop")}`);
  const started = Date.now();

  // "q" is what makes ffmpeg finalise the container; killing it instead leaves
  // a wav with a zero-length data chunk that every decoder reads as silence.
  // So Ctrl-C has to stop it the same way a keypress does.
  const stop = () => { try { proc.stdin?.write("q\n"); proc.stdin?.end(); } catch { /* already gone */ } };
  process.once("SIGINT", stop);

  // A closed stdin — piped input, a terminal going away — is a stop, not a crash.
  try { await rl.question(""); } catch { /* fall through to stop */ }
  stop();
  process.removeListener("SIGINT", stop);
  const code = await done;

  if (code !== 0 && !(await fs.access(out).then(() => true, () => false))) {
    console.log(c.red(`  ffmpeg failed:\n${stderr.trim()}\n`));
    return false;
  }

  const secs = await durationOf(out);
  const wall = (Date.now() - started) / 1000;
  const label = secs === null ? `${wall.toFixed(1)}s` : `${secs.toFixed(1)}s`;

  if (secs !== null && secs < 2) {
    console.log(`  ${c.red("thin")}  ${clipId}  ${c.dim(label)} — under two seconds, record it again\n`);
    return false;
  }
  console.log(`  ${c.green("saved")} ${clipId}  ${c.dim(label)}\n`);
  return true;
}

/**
 * Resolve once the capture device is genuinely producing audio.
 *
 * Opening a microphone is not instant — about a second on a warm system, and
 * several on the first run of the day while the OS initialises the device or
 * asks for permission. Announcing "speak now" at spawn time loses the opening
 * words, and a clip missing its first three words has a transcript that can
 * never be right, which the evaluation would then score as the pipeline's
 * error rather than the recorder's.
 */
function waitForCapture(proc: ReturnType<typeof spawn>): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: boolean) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(false), 15_000);

    let slow: NodeJS.Timeout | null = setTimeout(() => {
      process.stdout.write(c.dim("  opening the microphone... "));
    }, 1_500);

    proc.stdout?.on("data", (d) => {
      const m = /out_time_us=(\d+)/.exec(String(d));
      if (m && Number(m[1]) > 0) {
        if (slow) { clearTimeout(slow); slow = null; }
        finish(true);
      }
    });
    proc.once("close", () => { if (slow) clearTimeout(slow); finish(false); });
  });
}

async function total(): Promise<number> {
  const files = await fs.readdir(OUT_DIR).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".wav")).length;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  try {
    await exec("ffmpeg", ["-version"]);
    await exec("ffprobe", ["-version"]);
  } catch {
    console.error(c.red("\n  ffmpeg and ffprobe must both be installed and on PATH.\n") +
      "  Windows: winget install Gyan.FFmpeg   (then reopen the terminal)\n" +
      "  Linux:   sudo apt install ffmpeg\n  macOS:   brew install ffmpeg\n");
    process.exit(1);
  }

  if (argv.includes("--devices")) {
    const devices = await listDevices();
    console.log(`\n  Input devices on ${os.platform()}:\n`);
    if (devices.length === 0) console.log(c.yellow("    none detected — the platform default will be used"));
    for (const d of devices) console.log(`    ${d}`);
    console.log(c.dim(`\n  Use one with:  npm run mic -- 1a --device "<name>"\n`));
    return;
  }

  const di = argv.indexOf("--device");
  const device = di >= 0 ? argv[di + 1] : (process.env.MUSE_MIC ?? await defaultDevice());
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--device");

  await fs.mkdir(OUT_DIR, { recursive: true });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${c.bold("Muse — clip recorder")}`);
  console.log(c.dim(`  device: ${device ?? "platform default"}`));
  console.log(c.dim(`  writing to datasets/clips/  ·  ${await total()} clip(s) so far, target 40\n`));

  try {
    if (positional.length > 0) {
      const clipId = normaliseClipId(positional[0]!);
      if (!clipId) { console.error(c.red(`  "${positional[0]}" is not a clip id. Try 1a, or clip-01-a.\n`)); process.exit(1); }
      await rl.question(c.cyan(`  Ready for ${clipId} — press ENTER to start `));
      await recordOne(clipId, device, rl);
      return;
    }

    // Interactive. Recording forty clips one command at a time is the kind of
    // friction that quietly turns forty into twenty-five.
    console.log(c.dim("  Enter a card number (1a, 7, 16b) to record it. Blank line to finish.\n"));
    for (;;) {
      const raw = await rl.question(c.cyan("  clip > "));
      if (raw.trim() === "") break;
      const clipId = normaliseClipId(raw);
      if (!clipId) { console.log(c.yellow(`  "${raw.trim()}" is not a clip id — try 1a, 7, or clip-16-b\n`)); continue; }
      await rl.question(c.dim(`  press ENTER to start ${clipId} `));
      await recordOne(clipId, device, rl);
    }
    console.log(`\n  ${c.bold(String(await total()))} clip(s) in datasets/clips/  ${c.dim("(target: 40)")}`);
    console.log(c.dim("  next:  npm run labels:check\n"));
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
