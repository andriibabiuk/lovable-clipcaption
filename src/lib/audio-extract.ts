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

/**
 * Extract audio from a video File into a compact Opus/Ogg blob at 16kHz mono.
 * The video is never uploaded — this runs entirely in the browser tab.
 */
export async function extractAudio(
  file: File,
  onProgress?: ExtractProgress,
): Promise<{ blob: Blob; mimeType: string; filename: string }> {
  onProgress?.({ ratio: 0, stage: "Loading audio engine" });
  const ff = await getFFmpeg();

  const inName = "in" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
  const outName = "out.ogg";

  ff.on("progress", ({ progress }) => {
    onProgress?.({ ratio: Math.min(0.95, Math.max(0.05, progress)), stage: "Extracting audio" });
  });

  try {
    await ff.writeFile(inName, await fetchFile(file));
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
    throw new Error(errorMessage(err));
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
  return { blob, mimeType: "audio/ogg", filename: "audio.ogg" };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}