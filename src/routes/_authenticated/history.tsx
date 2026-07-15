import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Trash2, Search, FileText, Copy } from "lucide-react";
import { deleteMetadata, listMyMetadata } from "@/lib/video.functions";
import {
  buildCombinedText,
  buildCsv,
  downloadBlob,
  safeFilename,
  type PlatformMetadata,
} from "@/lib/export";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "History — ClipCaption" },
      { name: "description", content: "Browse and re-export your generated metadata." },
    ],
  }),
  component: HistoryPage,
});

type Status = "processing" | "completed" | "failed";

type VideoRow = {
  id: string;
  created_at: string;
  video_name: string;
  thumbnail_url: string | null;
  language: string | null;
  topic: string | null;
  keywords: string[] | null;
  metadata_json: unknown;
  subtitle_srt: string | null;
  status?: Status;
};

function statusBadgeVariant(status: Status): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
      return "default";
    case "processing":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function HistoryPage() {
  const [q, setQ] = useState("");
  const [detailItem, setDetailItem] = useState<VideoRow | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listMyMetadata);
  const delFn = useServerFn(deleteMetadata);

  const items = useQuery({ queryKey: ["my-videos"], queryFn: () => listFn() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["my-videos"] });
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (items.data ?? []) as VideoRow[];
    if (!term) return list;
    return list.filter(
      (r) =>
        r.video_name.toLowerCase().includes(term) ||
        (r.topic ?? "").toLowerCase().includes(term) ||
        (r.keywords ?? []).some((k: string) => k.toLowerCase().includes(term)),
    );
  }, [items.data, q]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, re-export, or remove previously processed videos.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, topic, or keyword"
            className="pl-9"
          />
        </div>

        {items.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!items.isLoading && filtered.length === 0 && (
          <div className="border rounded-lg py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {items.data?.length ? "No results." : "No videos processed yet."}
            </p>
          </div>
        )}

        <div className="grid gap-4">
          {filtered.map((r) => {
            const meta = r.metadata_json as unknown as PlatformMetadata | undefined;
            const base = safeFilename(r.video_name.replace(/\.[a-z0-9]+$/i, ""));
            const status = (r.status ?? "completed") as Status;
            const hasMeta = status === "completed" && meta;

            return (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-24 rounded-md bg-secondary overflow-hidden shrink-0 border">
                      {r.thumbnail_url ? (
                        <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <h3 className="text-sm font-medium truncate">{r.video_name}</h3>
                        <Badge variant={statusBadgeVariant(status)} className="w-fit text-[10px] uppercase">
                          {status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {new Date(r.created_at).toLocaleString()} · {r.language ?? "—"}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-4 pt-0">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasMeta}
                      onClick={() =>
                        hasMeta && downloadBlob(`${base}-metadata.txt`, "text/plain", buildCombinedText(r.video_name, meta))
                      }
                    >
                      <Download className="h-4 w-4 mr-1.5" /> .txt
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasMeta}
                      onClick={() =>
                        hasMeta &&
                        downloadBlob(
                          `${base}-metadata.json`,
                          "application/json",
                          JSON.stringify({ video: r.video_name, metadata: meta }, null, 2),
                        )
                      }
                    >
                      <Download className="h-4 w-4 mr-1.5" /> JSON
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasMeta}
                      onClick={() => hasMeta && downloadBlob(`${base}-metadata.csv`, "text/csv", buildCsv(r.video_name, meta))}
                    >
                      <Download className="h-4 w-4 mr-1.5" /> CSV
                    </Button>
                    {r.subtitle_srt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadBlob(`${base}.srt`, "application/x-subrip", r.subtitle_srt!)}
                      >
                        <Download className="h-4 w-4 mr-1.5" /> SRT
                      </Button>
                    )}

                    <div className="flex-1" />

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!hasMeta}
                      onClick={() => hasMeta && setDetailItem(r)}
                    >
                      Details
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the saved metadata and subtitles for "{r.video_name}". This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <MetadataDialog item={detailItem} onClose={() => setDetailItem(null)} />
    </AppShell>
  );
}

function MetadataDialog({ item, onClose }: { item: VideoRow | null; onClose: () => void }) {
  if (!item) return null;
  const video = item;
  const meta = video.metadata_json as unknown as PlatformMetadata;
  const base = safeFilename(video.video_name.replace(/\.[a-z0-9]+$/i, ""));

  const keywords = video.keywords?.filter(Boolean).join(", ") ?? "";
  const summary = `This video explores ${video.topic || "the main topic"}, covering key strategies, practical tips, and actionable takeaways for content creators and marketers.`;

  function handleDownloadAll() {
    downloadBlob(`${base}-metadata.txt`, "text/plain", buildCombinedText(video.video_name, meta));
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-semibold tracking-tight">Video Metadata</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Generated content for your video
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadAll} className="shrink-0">
              <Download className="h-4 w-4 mr-1.5" /> Download All
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-6">
          <MetadataSection title="Original Video">
            <MetadataField label="Video Name" value={video.video_name} />
          </MetadataSection>

          <MetadataSection title="Common Metadata">
            <MetadataField label="Keywords" value={keywords} />
            <MetadataField label="Transcript Summary" value={summary} />
          </MetadataSection>

          <MetadataSection title="YouTube">
            <MetadataField label="Title" value={meta.youtube.title} />
            <MetadataField label="Description" value={meta.youtube.description} />
            <MetadataField label="Hashtags" value={meta.youtube.hashtags.join(" ")} />
          </MetadataSection>

          <MetadataSection title="Instagram">
            <MetadataField label="Caption" value={meta.instagram.caption} />
            <MetadataField label="Hashtags" value={meta.instagram.hashtags.join(" ")} />
          </MetadataSection>

          <MetadataSection title="TikTok">
            <MetadataField label="Title" value={meta.tiktok.title} />
            <MetadataField label="Description" value={meta.tiktok.description} />
            <MetadataField label="Hashtags" value={meta.tiktok.hashtags.join(" ")} />
          </MetadataSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetadataSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MetadataField({ label, value }: { label: string; value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copy} aria-label={`Copy ${label}`}>
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      <div className="rounded-md bg-muted/60 px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap break-words">
        {value || "—"}
      </div>
    </div>
  );
}
