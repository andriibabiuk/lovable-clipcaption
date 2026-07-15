import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Download, Trash2, Search } from "lucide-react";
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

function HistoryPage() {
  const [q, setQ] = useState("");
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
    const list = items.data ?? [];
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

        <Accordion type="multiple" className="space-y-2">
          {filtered.map((r) => {
            const meta = r.metadata_json as unknown as PlatformMetadata;
            const base = safeFilename(r.video_name.replace(/\.[a-z0-9]+$/i, ""));
            return (
              <AccordionItem
                key={r.id}
                value={r.id}
                className="border rounded-lg px-4 data-[state=open]:bg-secondary/30"
              >
                <AccordionTrigger className="hover:no-underline w-full">
                  <div className="flex items-center gap-3 w-full min-w-0 pr-2">
                    <div className="h-10 w-16 rounded bg-secondary overflow-hidden shrink-0">
                      {r.thumbnail_url && (
                        <img src={r.thumbnail_url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left overflow-hidden">
                      <p className="text-sm font-medium truncate">{r.video_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(r.created_at).toLocaleString()} · {r.language ?? "—"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <PlatformBlock title="YouTube" title2={meta.youtube.title} body={meta.youtube.description} tags={meta.youtube.hashtags} />
                  <PlatformBlock title="Instagram" body={meta.instagram.caption} tags={meta.instagram.hashtags} />
                  <PlatformBlock title="TikTok" title2={meta.tiktok.title} body={meta.tiktok.description} tags={meta.tiktok.hashtags} />

                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.txt`, "text/plain", buildCombinedText(r.video_name, meta))}>
                      <Download className="h-4 w-4 mr-1.5" /> .txt
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.json`, "application/json", JSON.stringify({ video: r.video_name, metadata: meta }, null, 2))}>
                      <Download className="h-4 w-4 mr-1.5" /> JSON
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}-metadata.csv`, "text/csv", buildCsv(r.video_name, meta))}>
                      <Download className="h-4 w-4 mr-1.5" /> CSV
                    </Button>
                    {r.subtitle_srt && (
                      <Button variant="outline" size="sm" onClick={() => downloadBlob(`${base}.srt`, "application/x-subrip", r.subtitle_srt!)}>
                        <Download className="h-4 w-4 mr-1.5" /> SRT
                      </Button>
                    )}
                    <div className="flex-1" />
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
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </AppShell>
  );
}

function PlatformBlock({
  title,
  title2,
  body,
  tags,
}: {
  title: string;
  title2?: string;
  body: string;
  tags: string[];
}) {
  return (
    <div className="border rounded-lg p-4 bg-background">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {title2 && <p className="mt-1 text-sm font-medium break-words">{title2}</p>}
      <p className="mt-1 text-sm whitespace-pre-wrap break-words">{body}</p>
      {tags.length > 0 && <p className="mt-2 text-xs text-muted-foreground break-words">{tags.join(" ")}</p>}
    </div>
  );
}