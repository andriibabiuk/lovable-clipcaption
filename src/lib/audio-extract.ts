import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
  const ff = new FFmpeg();
  if (onLog) ff.on("log", ({ message }) => onLog(message));

  // Load the ESM core from CDN and convert it to same-origin blob URLs.
  // The ffmpeg worker runs as a module worker in Vite/TanStack Start; the UMD
  // core fails there because it does not export createFFmpegCore as default.
  const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  ]);
  await ff.load({ coreURL, wasmURL });
  ffmpegSingleton = ff;
    return ff;
  })().catch((err) => {
    ffmpegLoadPromise = null;
    throw err;
  });

  return ffmpegLoadPromise;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Audio extraction failed";
}

async function runFFmpeg(ff: FFmpeg, args: string[]) {
  const exitCode = await ff.exec(args);
  if (exitCode !== 0) {
    throw new Error(`Audio extraction failed with ffmpeg exit code ${exitCode}`);
  }
}

export type ExtractProgress = (info: { ratio: number; stage: string }) => void;

export type NormalizedAudio = {
  blob: Blob;
  mimeType: string;
  filename: string;
  /** Diagnostic metadata — logged internally, not shown to end users. */
  stats: {
    originalName: string;
    originalType: string;
    originalSize: number;
    convertedSize: number;
    kind: "video" | "audio";
  };
};

function detectKind(file: File): "video" | "audio" {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  // Fall back to extension sniffing when the browser omits a MIME type.
  return /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|wma)$/i.test(file.name) ? "audio" : "video";
}

/**
 * Normalize any uploaded media (video OR standalone audio) into a compact,
 * transcription-optimized Opus/Ogg blob at 16kHz mono, ~24kbps.
 *
 * This is the single shared pre-processing step for every upload path — video
 * or audio — so Whisper always receives a consistent minimal input. The
 * original file never leaves the browser tab; only the normalized Opus blob
 * is sent onward, and it is discarded once transcription returns.
 */
export async function normalizeToOpus(
  file: File,
  onProgress?: ExtractProgress,
): Promise<NormalizedAudio> {
  onProgress?.({ ratio: 0, stage: "Loading audio engine" });
  const ff = await getFFmpeg();

  const kind = detectKind(file);
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? (kind === "audio" ? ".bin" : ".mp4");
  const inName = "in" + ext;
  const outName = "out.ogg";

  ff.on("progress", ({ progress }) => {
    onProgress?.({ ratio: Math.min(0.95, Math.max(0.05, progress)), stage: "Optimizing audio" });
  });

  try {
    await ff.writeFile(inName, await fetchFile(file));
    // `-vn` is a no-op for audio-only inputs, so the same command handles both
    // videos (extract audio track, drop video) and standalone audio files
    // (downmix + resample + re-encode).
    await runFFmpeg(ff, [
      "-i", inName,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      "-b:a", "24k",
      outName,
    ]);
  } catch (err) {
    // Surface a consistent user-facing message regardless of the underlying
    // ffmpeg failure (corrupt file, unsupported codec, unreadable stream).
    const detail = errorMessage(err);
    console.warn("[normalizeToOpus] conversion failed", { file: file.name, type: file.type, detail });
    throw new Error("Couldn't process this file — try a different format");
  }

  const data = await ff.readFile(outName);
  void ff.deleteFile(inName).catch(() => {});
  void ff.deleteFile(outName).catch(() => {});

  const bytes: Uint8Array =
    typeof data === "string" ? new TextEncoder().encode(data) : (data as Uint8Array);
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: "audio/ogg" });
  onProgress?.({ ratio: 1, stage: "Audio ready" });

  const stats = {
    originalName: file.name,
    originalType: file.type || "(unknown)",
    originalSize: file.size,
    convertedSize: blob.size,
    kind,
  } as const;
  // Internal diagnostics only — never surfaced in the UI.
  console.info("[normalizeToOpus] converted", {
    ...stats,
    ratio: file.size > 0 ? +(blob.size / file.size).toFixed(3) : null,
  });

  return { blob, mimeType: "audio/ogg", filename: "audio.ogg", stats };
}

/** @deprecated Use `normalizeToOpus` — kept as an alias for older imports. */
export const extractAudio = normalizeToOpus;

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}