import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { platformMetadataSchema, type PlatformMetadata } from "@/lib/export";

const segmentSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string().min(1).max(2000),
});

const generateSchema = z.object({
  videoName: z.string().min(1).max(200),
  creator: z.string().max(120).optional().default(""),
  topic: z.string().max(300).optional().default(""),
  language: z.string().max(50).optional().default("English"),
  keywords: z.array(z.string().max(60)).max(30).default([]),
  thumbnailDataUrl: z.string().max(200000).nullable().optional(),
  transcript: z.string().max(500000).optional().default(""),
  segments: z.array(segmentSchema).max(5000).default([]),
  audioPath: z.string().max(500).nullable().optional(),
});

function buildMockMetadata(input: z.infer<typeof generateSchema>) {
  const topic = input.topic || input.videoName.replace(/\.[a-z0-9]+$/i, "");
  const kw = input.keywords.filter(Boolean);
  const hashtags = (extra: string[]) =>
    Array.from(
      new Set([...kw, ...extra].map((k) => "#" + k.replace(/[^a-z0-9]+/gi, "").toLowerCase()).filter((h) => h.length > 1)),
    ).slice(0, 12);

  const creatorLine = input.creator ? ` by ${input.creator}` : "";

  return {
    youtube: {
      title: `${topic} — Everything You Need to Know${creatorLine}`.slice(0, 100),
      description:
        `In this video${creatorLine}, we break down ${topic}. ` +
        `We cover the key ideas, practical tips, and takeaways so you can apply them right away.\n\n` +
        `Timestamps:\n00:00 Intro\n00:45 The main idea\n03:20 Practical examples\n06:10 Wrap-up\n\n` +
        `Language: ${input.language}.`,
      hashtags: hashtags(["youtube", "creator", "tutorial"]),
    },
    instagram: {
      caption:
        `${topic} in under 60 seconds${creatorLine}. ` +
        `Save this for later and share it with someone who needs it. ✨`,
      hashtags: hashtags(["reels", "instagram", "viral", "explore"]),
    },
    tiktok: {
      title: `${topic} 🔥`,
      description:
        `Quick ${topic} breakdown${creatorLine}. Follow for more!`,
      hashtags: hashtags(["fyp", "foryou", "tiktok", "viral"]),
    },
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");
function fmtTs(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)},${ms.toString().padStart(3, "0")}`;
}

type SrtCue = { start: number; end: number; text: string };

function cuesToSrt(cues: SrtCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${fmtTs(c.start)} --> ${fmtTs(c.end)}\n${c.text}\n`)
    .join("\n");
}

// Naive fallback: use Whisper segments directly, wrapping long lines.
function segmentsToSrt(segments: z.infer<typeof segmentSchema>[]): string {
  const cues: SrtCue[] = segments.map((s) => ({
    start: s.start,
    end: Math.max(s.end, s.start + 0.4),
    text: wrapCaptionText(s.text),
  }));
  return cuesToSrt(cues);
}

function wrapCaptionText(text: string, maxCharsPerLine = 42): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxCharsPerLine) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === 1 && cur.length > maxCharsPerLine) {
        // fall through, second line will still be too long — acceptable
      }
    }
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  return lines.slice(0, 2).join("\n");
}

function transcriptToSrt(transcript: string, language: string): string {
  const clean = transcript.trim();
  if (!clean) return buildMockSrt("your video", language);
  const words = clean.split(/\s+/);
  const cues: SrtCue[] = [];
  for (let i = 0; i < words.length; i += 10) {
    const start = (i / 10) * 4;
    cues.push({ start, end: start + 4, text: wrapCaptionText(words.slice(i, i + 10).join(" ")) });
  }
  return cuesToSrt(cues);
}

async function polishSrtWithAI(
  segments: z.infer<typeof segmentSchema>[],
  language: string,
): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || segments.length === 0) return null;

  // Keep the prompt bounded — sample if there are too many segments.
  const trimmed = segments.slice(0, 800);
  const compact = trimmed.map((s) => ({
    s: Math.round(s.start * 100) / 100,
    e: Math.round(s.end * 100) / 100,
    t: s.text.replace(/\s+/g, " ").trim(),
  }));

  const system =
    "You are a professional subtitle editor. You receive Whisper transcription segments " +
    "with start/end timestamps (seconds) and must produce subtitle cues optimized for on-screen reading. " +
    "Rules: preserve the ORIGINAL spoken language of the segments exactly as-is; NEVER translate to any " +
    "other language regardless of any language hint provided; fix obvious punctuation and casing; " +
    "merge or split segments so each cue is 1.0-6.0 seconds long with a natural reading pace " +
    "(~17 chars/sec, max ~84 chars total); wrap text into at most 2 lines of ~42 chars each using a single \\n; " +
    "avoid cues shorter than 0.8s; keep timings within the original segment range; " +
    "cues must not overlap and must be strictly ordered. " +
    "Return STRICT JSON: { \"cues\": [ { \"start\": number, \"end\": number, \"text\": string } ] }.";

  const user = `Language hint (may be wrong — keep the segments' original language): ${language}\nSegments:\n${JSON.stringify(compact)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { cues?: Array<{ start?: number; end?: number; text?: string }> };
    const cues: SrtCue[] = (parsed.cues ?? [])
      .map((c) => ({
        start: Number(c.start) || 0,
        end: Number(c.end) || 0,
        text: (c.text ?? "").toString().trim(),
      }))
      .filter((c) => c.text && c.end > c.start);
    if (cues.length === 0) return null;
    // Enforce ordering + non-overlap defensively.
    cues.sort((a, b) => a.start - b.start);
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].end) cues[i].start = cues[i - 1].end;
      if (cues[i].end <= cues[i].start) cues[i].end = cues[i].start + 0.8;
    }
    return cuesToSrt(cues);
  } catch {
    return null;
  }
}

function buildMockSrt(topic: string, language: string): string {
  const lines = [
    `Welcome — today we're talking about ${topic}.`,
    `This transcript is a demo generated by ClipCaption.`,
    `Language preference: ${language}.`,
    `Let's dive in and cover the essentials.`,
    `Thanks for watching — see you in the next one.`,
  ];
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmt = (s: number) => `00:${pad(Math.floor(s / 60))}:${pad(s % 60)},000`;
  return lines
    .map((text, i) => {
      const start = i * 4;
      const end = start + 4;
      return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${text}\n`;
    })
    .join("\n");
}

async function generateMetadataWithAI(
  input: z.infer<typeof generateSchema>,
): Promise<{ metadata: PlatformMetadata; detectedLanguage: string | null } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const transcript = input.transcript.trim().slice(0, 12000);
  if (!transcript) return null;

  const system =
    "You generate social media metadata for a video based on its transcript. " +
    "First, detect the primary spoken language of the transcript. " +
    "Then write EVERY title, description, caption, and hashtag in that SAME language — " +
    "do NOT translate to English. Hashtags are single words prefixed with '#' (transliterate if the " +
    "script has no hashtag convention, but keep the language). " +
    "Return STRICT JSON matching the requested schema, no prose.";
  const user = `Video name: ${input.videoName}
Creator: ${input.creator || "(unknown)"}
Topic hint: ${input.topic || "(infer from transcript)"}
Language hint (may be wrong — trust the transcript): ${input.language}
User keywords: ${input.keywords.join(", ") || "(none)"}

Transcript:
"""
${transcript}
"""

Return JSON with this exact shape:
{
  "detectedLanguage": string (English name of the detected transcript language, e.g. "Ukrainian"),
  "youtube": { "title": string (<=100 chars), "description": string, "hashtags": string[] (<=12) },
  "instagram": { "caption": string, "hashtags": string[] (<=15) },
  "tiktok": { "title": string, "description": string, "hashtags": string[] (<=12) }
}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsedJson = JSON.parse(content) as { detectedLanguage?: unknown };
    const detectedLanguage =
      typeof parsedJson.detectedLanguage === "string" && parsedJson.detectedLanguage.trim()
        ? parsedJson.detectedLanguage.trim().slice(0, 50)
        : null;
    const result = platformMetadataSchema.safeParse(parsedJson);
    return result.success ? { metadata: result.data, detectedLanguage } : null;
  } catch {
    return null;
  }
}

export const generateMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => generateSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Enforce quota + increment atomically.
    const { data: quotaRows, error: quotaErr } = await context.supabase.rpc("record_generation");
    if (quotaErr) throw new Error(quotaErr.message);
    const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;

    const [aiMetadata, polishedSrt] = await Promise.all([
      generateMetadataWithAI(data),
      data.segments.length > 0 ? polishSrtWithAI(data.segments, data.language) : Promise.resolve(null),
    ]);
    const metadata = aiMetadata ?? buildMockMetadata(data);
    const srt =
      polishedSrt ??
      (data.segments.length > 0
        ? segmentsToSrt(data.segments)
        : data.transcript
          ? transcriptToSrt(data.transcript, data.language)
          : buildMockSrt(data.topic || data.videoName, data.language));

    const { data: row, error } = await context.supabase
      .from("video_metadata")
      .insert({
        user_id: context.userId,
        video_name: data.videoName,
        thumbnail_url: data.thumbnailDataUrl ?? null,
        language: data.language,
        topic: data.topic,
        keywords: data.keywords,
        metadata_json: metadata,
        subtitle_srt: srt,
        transcript: data.transcript || null,
        audio_path: data.audioPath ?? null,
        status: "completed",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return { row, quota };
  });

export const listMyMetadata = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("video_metadata")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("video_metadata")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteMetadataBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("video_metadata")
      .delete()
      .in("id", data.ids)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, count: data.ids.length };
  });

export const renameMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), videoName: z.string().trim().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("video_metadata")
      .update({ video_name: data.videoName })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });