import { createFileRoute } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Download, Trash2, Search, FileText, Copy, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check, X } from "lucide-react";
import { deleteMetadata, deleteMetadataBatch, listMyMetadata, renameMetadata } from "@/lib/video.functions";
import {
  baseFilename,
  buildCombinedText,
  downloadBlob,
  parsePlatformMetadata,
} from "@/lib/export";
import { ExportButtons } from "@/components/export-buttons";

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

type SortKey = "created_at" | "video_name" | "length";
type SortDir = "asc" | "desc";

// Parse the last SRT timestamp (HH:MM:SS,mmm) to get an approximate video length in seconds.
function srtLengthSeconds(srt: string | null): number {
  if (!srt) return 0;
  let last = 0;
  const re = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(srt)) !== null) {
    const sec = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    if (sec > last) last = sec;
  }
  return last;
}

function formatLength(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const qc = useQueryClient();
  const listFn = useServerFn(listMyMetadata);
  const delFn = useServerFn(deleteMetadata);
  const delBatchFn = useServerFn(deleteMetadataBatch);
  const renameFn = useServerFn(renameMetadata);

  const items = useQuery({ queryKey: ["my-videos"], queryFn: () => listFn() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["my-videos"] });
    },
  });

  const delBatch = useMutation({
    mutationFn: (ids: string[]) => delBatchFn({ data: { ids } }),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.count} item${res.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["my-videos"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to delete"),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; videoName: string }) => renameFn({ data: v }),
    onSuccess: () => {
      toast.success("Renamed");
      qc.invalidateQueries({ queryKey: ["my-videos"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to rename"),
  });

  const handleDelete = useCallback((id: string) => del.mutate(id), [del]);
  const handleOpenDetail = useCallback((row: VideoRow) => setDetailItem(row), []);
  const handleRename = useCallback(
    (id: string, videoName: string) => rename.mutate({ id, videoName }),
    [rename],
  );
  const handleToggle = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const filtered = useMemo<VideoRow[]>(() => {
    const term = q.trim().toLowerCase();
    const list = (items.data ?? []) as VideoRow[];
    const searched = !term
      ? list
      : list.filter(
          (r) =>
            r.video_name.toLowerCase().includes(term) ||
            (r.topic ?? "").toLowerCase().includes(term) ||
            (r.keywords ?? []).some((k: string) => k.toLowerCase().includes(term)),
        );
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...searched].sort((a, b) => {
      if (sortKey === "video_name") return a.video_name.localeCompare(b.video_name) * dir;
      if (sortKey === "length")
        return (srtLengthSeconds(a.subtitle_srt) - srtLengthSeconds(b.subtitle_srt)) * dir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });
    return sorted;
  }, [items.data, q, sortKey, sortDir]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, re-export, or remove previously processed videos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, topic, or keyword"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Creation date</SelectItem>
                <SelectItem value="video_name">Name</SelectItem>
                <SelectItem value="length">Length</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/40">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Select all"
              />
              <span className="text-sm text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </span>
            </div>
            {selected.size > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={delBatch.isPending}>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete selected
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selected.size} item{selected.size === 1 ? "" : "s"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the selected metadata and subtitles. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => delBatch.mutate(Array.from(selected))}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        {items.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!items.isLoading && filtered.length === 0 && (
          <div className="border rounded-lg py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {items.data?.length ? "No results." : "No videos processed yet."}
            </p>
          </div>
        )}

        <div className="grid gap-4">
          {filtered.map((r) => (
            <HistoryCard
              key={r.id}
              row={r}
              selected={selected.has(r.id)}
              onToggleSelect={handleToggle}
              onOpenDetail={handleOpenDetail}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      </div>

      <MetadataDialog item={detailItem} onClose={() => setDetailItem(null)} />
    </AppShell>
  );
}

const HistoryCard = memo(function HistoryCard({
  row,
  selected,
  onToggleSelect,
  onOpenDetail,
  onDelete,
  onRename,
}: {
  row: VideoRow;
  selected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onOpenDetail: (row: VideoRow) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, videoName: string) => void;
}) {
  // Derive presentation data once per row (not once per HistoryPage render).
  const { meta, status, hasMeta, lengthLabel } = useMemo(() => {
    const status = (row.status ?? "completed") as Status;
    const meta = status === "completed" ? parsePlatformMetadata(row.metadata_json) : null;
    const lengthLabel = formatLength(srtLengthSeconds(row.subtitle_srt));
    return { meta, status, hasMeta: !!meta, lengthLabel };
  }, [row.metadata_json, row.status, row.subtitle_srt]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.video_name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(row.video_name);
  }, [row.video_name]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const v = draft.trim();
    if (!v || v === row.video_name) {
      setEditing(false);
      setDraft(row.video_name);
      return;
    }
    onRename(row.id, v);
    setEditing(false);
  }

  return (
    <Card className={`overflow-hidden ${selected ? "ring-1 ring-primary" : ""}`}>
      <CardHeader className="p-4">
        <div className="flex items-start gap-3">
          <div className="pt-1">
            <Checkbox
              checked={selected}
              onCheckedChange={(c) => onToggleSelect(row.id, c === true)}
              aria-label={`Select ${row.video_name}`}
            />
          </div>
          <div className="h-14 w-24 rounded-md bg-secondary overflow-hidden shrink-0 border">
            {row.thumbnail_url ? (
              <img src={row.thumbnail_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <FileText className="h-5 w-5" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") {
                      setEditing(false);
                      setDraft(row.video_name);
                    }
                  }}
                  maxLength={200}
                  className="h-8 text-sm"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={commit} aria-label="Save">
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    setEditing(false);
                    setDraft(row.video_name);
                  }}
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-sm font-medium truncate">{row.video_name}</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Badge variant={statusBadgeVariant(status)} className="w-fit text-[10px] uppercase">
                  {status}
                </Badge>
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {new Date(row.created_at).toLocaleString()} · {row.language ?? "—"} · {lengthLabel}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-wrap gap-2">
          <ExportButtons
            videoName={row.video_name}
            metadata={meta}
            srt={row.subtitle_srt}
            disabled={!hasMeta}
          />

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMeta}
            onClick={() => hasMeta && onOpenDetail(row)}
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
                  This removes the saved metadata and subtitles for "{row.video_name}". This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(row.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
});

function MetadataDialog({ item, onClose }: { item: VideoRow | null; onClose: () => void }) {
  if (!item) return null;
  const video = item;
  const meta = parsePlatformMetadata(video.metadata_json);
  const base = baseFilename(video.video_name);

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
