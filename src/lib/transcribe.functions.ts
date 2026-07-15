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

    // Gemini transcribes via chat completions with inline audio input.
    // Derive audio format from the mime type (e.g. "audio/ogg" -> "ogg").
    const format = (data.mimeType.split("/")[1] ?? "ogg").split(";")[0];
    const instruction = data.language
      ? `Transcribe this audio in ${data.language} verbatim. Output only the transcript text, no commentary.`
      : "Transcribe this audio verbatim. Output only the transcript text, no commentary.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              {
                type: "input_audio",
                input_audio: { data: data.audioBase64, format },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Transcription rate limit reached. Please retry shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      throw new Error(`Transcription failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { text: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });