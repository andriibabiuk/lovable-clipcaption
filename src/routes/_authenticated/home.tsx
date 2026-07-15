import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UploadCloud, X, Copy, Download, CheckCircle2, Languages } from "lucide-react";
import { captureThumbnail } from "@/lib/thumbnail";
import { supabase } from "@/integrations/supabase/client";
import { useUserQuota } from "@/hooks/use-role";
import { generateMetadata, listMyMetadata } from "@/lib/video.functions";
import { transcribeAudioChunk } from "@/lib/transcribe.functions";
import {
  buildCombinedText,
  buildCsv,
  downloadBlob,
  safeFilename,
  type PlatformMetadata,
} from "@/lib/export";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Upload — ClipCaption" },
      { name: "description", content: "Upload a video and generate AI subtitles and metadata." },
    ],
  }),
  component: HomePage,
});

type Stage =
  | "Reading video"
  | "Extracting audio"
  | "Transcribing audio"
  | "Ready"
  | "Failed";

type QueuedFile = {
  id: string;
  file: File;
  name: string;
  thumbnail: string | null;
  stage: Stage;
  progress: number;
  transcript?: string;
  detectedLanguage?: string | null;
  error?: string;
};

function prettyLanguage(lang?: string | null): string {
  if (!lang) return "";
  const s = lang.trim();
  if (!s) return "";
  // Whisper returns full names ("english") or ISO codes ("en").
  if (s.length <= 3) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function HomePage() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [creator, setCreator] = useState("");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [output, setOutput] = useState<{
    videoName: string;
    metadata: PlatformMetadata;
    srt: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: quota, refetch: refetchQuota } = useUserQuota();
  const qc = useQueryClient();
  const generateFn = useServerFn(generateMetadata);
  const listFn = useServerFn(listMyMetadata);
  const transcribeFn = useServerFn(transcribeAudioChunk);

  const recent = useQuery({
    queryKey: ["my-videos"],
    queryFn: () => listFn(),
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .maybeSingle();
      if (p?.display_name) setCreator(p.display_name);
    })();
  }, []);

  function addFiles(list: FileList | File[]) {
    const accepted = Array.from(list).filter((f) => /video\/(mp4|quicktime|x-msvideo)|\.mov|\.mp4|\.avi/i.test(f.type + " " + f.name));
    if (!accepted.length) {
      toast.error("Only MP4, MOV, or AVI files are supported.");
      return;
    }
    const queued: QueuedFile[] = accepted.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      thumbnail: null,
      stage: "Reading video",
      progress: 5,
    }));
    setFiles((prev) => [...prev, ...queued]);
    queued.forEach((q) => processFile(q.id, q.file));
  }

  async function processFile(id: string, file: File) {
    const update = (patch: Partial<QueuedFile>) =>
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

    try {
      // 1. Thumbnail (from video element — no upload).
      const thumb = await captureThumbnail(file);
      update({ thumbnail: thumb, progress: 10, stage: "Extracting audio" });

      // 2. Extract audio via ffmpeg.wasm (browser only).
      const { extractAudio, chunkBlob, blobToBase64 } = await import("@/lib/audio-extract");
      const { blob, mimeType, filename } = await extractAudio(file, ({ ratio, stage }) => {
        update({ progress: Math.round(10 + ratio * 40), stage: stage === "Loading audio engine" ? "Extracting audio" : "Extracting audio" });
      });

      // 3. Chunk and transcribe (~10MB each, well under Whisper's 25MB limit).
      update({ progress: 55, stage: "Transcribing audio" });
      const chunks = chunkBlob(blob, 10 * 1024 * 1024);
      const parts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const b64 = await blobToBase64(chunks[i]);
        const { text, language: detected } = await transcribeFn({
          data: {
            audioBase64: b64,
            mimeType,
            filename: `${filename.replace(/\.ogg$/, "")}-${i}.ogg`,
          },
        });
        parts.push(text);
        if (i === 0 && detected) update({ detectedLanguage: detected });
        update({ progress: Math.round(55 + ((i + 1) / chunks.length) * 40) });
      }
      const transcript = parts.join(" ").trim();
      update({ progress: 100, stage: "Ready", transcript });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Processing failed";
      update({ stage: "Failed", error: msg });
      toast.error(msg);
    }
  }

  const generate = useMutation({
    mutationFn: async (target: QueuedFile) => {
      const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
      const detected = prettyLanguage(target.detectedLanguage) || "English";
      const { row } = await generateFn({
        data: {
          videoName: target.name,
          creator,
          topic,
          language: detected,
          keywords: kw,
          thumbnailDataUrl: target.thumbnail,
          transcript: target.transcript ?? "",
        },
      });
      return row as unknown as { video_name: string; metadata_json: PlatformMetadata; subtitle_srt: string };
    },
    onSuccess: (row) => {
      setOutput({
        videoName: row.video_name,
        metadata: row.metadata_json,
        srt: row.subtitle_srt,
      });
      toast.success("Metadata generated — saved to History");
      refetchQuota();
      qc.invalidateQueries({ queryKey: ["my-videos"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg.includes("limit") ? "Monthly generation limit reached." : msg);
    },
  });

  const ready = files.filter((f) => f.stage === "Ready");
  const limitReached =
    quota?.monthly_limit != null && (quota?.remaining ?? 0) <= 0;
  const canGenerate = ready.length > 0 && !limitReached && !generate.isPending;

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h1 className="text-2xl font-semibold tracking-tight">Upload a video</h1>
            <p className="text-sm text-muted-foreground mt-1">
              MP4, MOV, or AVI. Files are never stored — only your generated metadata is saved.
            </p>
          </section>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={
              "border-2 border-dashed rounded-lg py-12 px-6 text-center cursor-pointer transition-colors " +
              (dragOver ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/50")
            }
          >
            <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Drop videos here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Batch upload supported</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
              We do not store or play your videos. Only a single-frame thumbnail is extracted so you can identify the file.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-msvideo,.mp4,.mov,.avi"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Thumbnails only — videos are not previewed or stored.
              </p>
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 border rounded-lg p-3">
                  <div className="h-12 w-20 rounded bg-secondary overflow-hidden flex-shrink-0">
                    {f.thumbnail ? (
                      <img src={f.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <button
                        onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className={"mt-0.5 text-xs " + (f.stage === "Failed" ? "text-destructive" : "text-muted-foreground")}>
                      {f.stage === "Failed" && f.error ? f.error : f.stage}
                    </p>
                    {f.detectedLanguage && f.stage !== "Failed" && (
                      <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                        <Languages className="h-3 w-3" />
                        Detected language: {prettyLanguage(f.detectedLanguage)}
                      </p>
                    )}
                    <Progress value={f.progress} className="mt-2 h-1.5" />
                  </div>
                  {f.stage === "Ready" && (
                    <Button size="sm" disabled={!canGenerate} onClick={() => generate.mutate(f)}>
                      {generate.isPending ? "Generating…" : "Generate"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <section className="border rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold">Metadata inputs</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="creator">Creator's name</Label>
                  <Input id="creator" value={creator} onChange={(e) => setCreator(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="topic">Video topic</Label>
                  <Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. 5-minute pasta recipe" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                  <Input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="cooking, pasta, quick" className="mt-1" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5" />
                Language is auto-detected from the video's audio — transcription and metadata are generated in the spoken language.
              </p>
              {limitReached && (
                <p className="text-sm text-destructive">
                  Monthly generation limit reached.{" "}
                  <Link to="/settings" className="underline">Upgrade to Premium →</Link>
                </p>
              )}
            </section>
          )}

          {output && (
            <OutputPanel output={output} />
          )}
        </div>

        <aside className="space-y-4">
          <div className="border rounded-lg p-5">
            <p className="text-xs text-muted-foreground">Your plan</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-lg font-semibold capitalize">{quota?.tier ?? "…"}</p>
              {quota?.tier === "admin" && <Badge variant="secondary">Unlimited</Badge>}
            </div>
            {quota?.monthly_limit != null && (
              <>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">This month</span>
                  <span className="tabular-nums">{quota.used} / {quota.monthly_limit}</span>
                </div>
                <Progress value={(quota.used / quota.monthly_limit) * 100} className="mt-2 h-1.5" />
              </>
            )}
          </div>

          <div className="border rounded-lg p-5">
            <p className="text-sm font-medium">Tips</p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
              <li>Add specific keywords for sharper hashtags.</li>
              <li>Describe your topic in one clear sentence.</li>
              <li>Language is detected automatically — no need to pick.</li>
            </ul>
          </div>

          <div className="border rounded-lg p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent activity</p>
              <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">All →</Link>
            </div>
            <ul className="mt-3 space-y-2">
              {(recent.data ?? []).slice(0, 5).map((r) => (
                <li key={r.id} className="text-xs truncate">
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>{" "}
                  {r.video_name}
                </li>
              ))}
              {(!recent.data || recent.data.length === 0) && (
                <li className="text-xs text-muted-foreground">No videos yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function OutputPanel({
  output,
}: {
  output: { videoName: string; metadata: PlatformMetadata; srt: string };
}) {
  const [meta, setMeta] = useState(output.metadata);
  useEffect(() => setMeta(output.metadata), [output]);

  const combined = useMemo(() => buildCombinedText(output.videoName, meta), [output.videoName, meta]);
  const csv = useMemo(() => buildCsv(output.videoName, meta), [output.videoName, meta]);
  const json = useMemo(() => JSON.stringify({ video: output.videoName, metadata: meta }, null, 2), [output.videoName, meta]);

  const base = safeFilename(output.videoName.replace(/\.[a-z0-9]+$/i, ""));
  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <section className="border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          Generated metadata
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-normal">Saved to History</span>
        </h2>
      </div>

      <Tabs defaultValue="youtube">
        <TabsList>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok</TabsTrigger>
        </TabsList>

        <TabsContent value="youtube" className="space-y-3 pt-3">
          <Field label="Title" value={meta.youtube.title} onChange={(v) => setMeta({ ...meta, youtube: { ...meta.youtube, title: v } })} onCopy={copy} />
          <Field label="Description" value={meta.youtube.description} textarea onChange={(v) => setMeta({ ...meta, youtube: { ...meta.youtube, description: v } })} onCopy={copy} />
          <Field label="Hashtags" value={meta.youtube.hashtags.join(" ")} onChange={(v) => setMeta({ ...meta, youtube: { ...meta.youtube, hashtags: v.split(/\s+/).filter(Boolean) } })} onCopy={copy} />
        </TabsContent>

        <TabsContent value="instagram" className="space-y-3 pt-3">
          <Field label="Caption" value={meta.instagram.caption} textarea onChange={(v) => setMeta({ ...meta, instagram: { ...meta.instagram, caption: v } })} onCopy={copy} />
          <Field label="Hashtags" value={meta.instagram.hashtags.join(" ")} onChange={(v) => setMeta({ ...meta, instagram: { ...meta.instagram, hashtags: v.split(/\s+/).filter(Boolean) } })} onCopy={copy} />
        </TabsContent>

        <TabsContent value="tiktok" className="space-y-3 pt-3">
          <Field label="Title" value={meta.tiktok.title} onChange={(v) => setMeta({ ...meta, tiktok: { ...meta.tiktok, title: v } })} onCopy={copy} />
          <Field label="Description" value={meta.tiktok.description} textarea onChange={(v) => setMeta({ ...meta, tiktok: { ...meta.tiktok, description: v } })} onCopy={copy} />
          <Field label="Hashtags" value={meta.tiktok.hashtags.join(" ")} onChange={(v) => setMeta({ ...meta, tiktok: { ...meta.tiktok, hashtags: v.split(/\s+/).filter(Boolean) } })} onCopy={copy} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.txt`, "text/plain", combined)}>
          <Download className="h-4 w-4 mr-1.5" /> All metadata (.txt)
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.json`, "application/json", json)}>
          <Download className="h-4 w-4 mr-1.5" /> JSON
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.csv`, "text/csv", csv)}>
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}.srt`, "application/x-subrip", output.srt)}>
          <Download className="h-4 w-4 mr-1.5" /> SRT subtitles
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  onCopy,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: (t: string) => void;
  textarea?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button onClick={() => onCopy(value)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="mt-1" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      )}
    </div>
  );
}