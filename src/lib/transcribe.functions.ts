import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1).max(100),
  filename: z.string().min(1).max(200),
  language: z.string().max(50).optional(),
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
    if (data.language) formData.append("language", data.language);
    formData.append("response_format", "json");

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
    const json = (await res.json()) as { text?: string };
    return { text: json.text?.trim() ?? "" };
  });