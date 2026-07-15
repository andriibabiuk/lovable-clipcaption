import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpegSingleton: FFmpeg | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const ff = new FFmpeg();
  if (onLog) ff.on("log", ({ message }) => onLog(message));
  // Load bundled core from CDN (single-threaded, works without COOP/COEP).
  const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
  await ff.load({
    coreURL: `${base}/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg-core.wasm`,
  });
  ffmpegSingleton = ff;
  return ff;
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

  await ff.writeFile(inName, await fetchFile(file));
  await ff.exec([
    "-i", inName,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "libopus",
    "-b:a", "24k",
    outName,
  ]);
  const data = await ff.readFile(outName);
  try {
    await ff.deleteFile(inName);
    await ff.deleteFile(outName);
  } catch { /* ignore */ }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const blob = new Blob([bytes], { type: "audio/ogg" });
  onProgress?.({ ratio: 1, stage: "Audio ready" });
  return { blob, mimeType: "audio/ogg", filename: "audio.ogg" };
}

/** Split a Blob into ~sizeBytes chunks. Byte-level split — fine for Whisper as separate calls. */
export function chunkBlob(blob: Blob, sizeBytes: number): Blob[] {
  if (blob.size <= sizeBytes) return [blob];
  const chunks: Blob[] = [];
  for (let start = 0; start < blob.size; start += sizeBytes) {
    chunks.push(blob.slice(start, Math.min(start + sizeBytes, blob.size), blob.type));
  }
  return chunks;
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