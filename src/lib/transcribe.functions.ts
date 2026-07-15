import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(100),
  filename: z.string().min(1).max(200),
});

export const transcribeAudioChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Convert base64 audio to a Blob for the OpenAI audio transcriptions API.
    const binary = Buffer.from(data.audioBase64, "base64");
    const blob = new Blob([binary], { type: data.mimeType });
    const formData = new FormData();
    formData.append("file", blob, data.filename);
    formData.append("model", "openai/gpt-4o-transcribe");
    // Omit `language` so Whisper auto-detects the spoken language.
    // Use verbose_json to receive the detected language code alongside the transcript.
    formData.append("response_format", "verbose_json");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Transcription rate limit reached. Please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`Transcription failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const segments = (json.segments ?? [])
      .map((s) => ({
        start: typeof s.start === "number" ? s.start : 0,
        end: typeof s.end === "number" ? s.end : 0,
        text: (s.text ?? "").trim(),
      }))
      .filter((s) => s.text.length > 0 && s.end > s.start);
    return {
      text: json.text?.trim() ?? "",
      language: json.language?.trim() || null,
      duration: typeof json.duration === "number" ? json.duration : null,
      segments,
    };
  });