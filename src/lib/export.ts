import { z } from "zod";

// Runtime-validated shape of the AI-generated per-platform metadata.
// Using a schema (instead of a bare TS type + `as unknown as ...` casts) means
// malformed responses from the AI degrade gracefully instead of crashing the
// UI with `undefined` field reads.
export const platformMetadataSchema = z.object({
  youtube: z.object({
    title: z.string().default(""),
    description: z.string().default(""),
    hashtags: z.array(z.string()).default([]),
  }),
  instagram: z.object({
    caption: z.string().default(""),
    hashtags: z.array(z.string()).default([]),
  }),
  tiktok: z.object({
    title: z.string().default(""),
    description: z.string().default(""),
    hashtags: z.array(z.string()).default([]),
  }),
});

export type PlatformMetadata = z.infer<typeof platformMetadataSchema>;

const EMPTY_METADATA: PlatformMetadata = {
  youtube: { title: "", description: "", hashtags: [] },
  instagram: { caption: "", hashtags: [] },
  tiktok: { title: "", description: "", hashtags: [] },
};

/** Safely coerce untrusted JSON (from DB/AI) into a `PlatformMetadata`. */
export function parsePlatformMetadata(input: unknown): PlatformMetadata {
  const result = platformMetadataSchema.safeParse(input);
  return result.success ? result.data : EMPTY_METADATA;
}

export function buildCombinedText(videoName: string, meta: PlatformMetadata): string {
  const lines: string[] = [];
  lines.push(`ClipCaption — Metadata Export`);
  lines.push(`Video: ${videoName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("=== YOUTUBE ===");
  lines.push(`Title: ${meta.youtube.title}`);
  lines.push(`Description:\n${meta.youtube.description}`);
  lines.push(`Hashtags: ${meta.youtube.hashtags.join(" ")}`);
  lines.push("");
  lines.push("=== INSTAGRAM ===");
  lines.push(`Caption:\n${meta.instagram.caption}`);
  lines.push(`Hashtags: ${meta.instagram.hashtags.join(" ")}`);
  lines.push("");
  lines.push("=== TIKTOK ===");
  lines.push(`Title: ${meta.tiktok.title}`);
  lines.push(`Description:\n${meta.tiktok.description}`);
  lines.push(`Hashtags: ${meta.tiktok.hashtags.join(" ")}`);
  return lines.join("\n");
}

export function buildCsv(videoName: string, meta: PlatformMetadata): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows: string[][] = [
    ["platform", "field", "value"],
    ["youtube", "title", meta.youtube.title],
    ["youtube", "description", meta.youtube.description],
    ["youtube", "hashtags", meta.youtube.hashtags.join(" ")],
    ["instagram", "caption", meta.instagram.caption],
    ["instagram", "hashtags", meta.instagram.hashtags.join(" ")],
    ["tiktok", "title", meta.tiktok.title],
    ["tiktok", "description", meta.tiktok.description],
    ["tiktok", "hashtags", meta.tiktok.hashtags.join(" ")],
  ];
  return `# video: ${videoName}\n` + rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadBlob(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 80) || "clipcaption";
}

/** Strip the file extension and sanitize — used for all export filenames. */
export function baseFilename(videoName: string): string {
  return safeFilename(videoName.replace(/\.[a-z0-9]+$/i, ""));
}