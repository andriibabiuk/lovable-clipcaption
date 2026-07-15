import { memo, useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  baseFilename,
  buildCombinedText,
  buildCsv,
  downloadBlob,
  type PlatformMetadata,
} from "@/lib/export";

type Props = {
  videoName: string;
  metadata: PlatformMetadata | null | undefined;
  srt?: string | null;
  disabled?: boolean;
  size?: "sm" | "default";
};

/**
 * Standard row of "download all metadata as X" buttons shared by the Home
 * output panel and each History card so the export surface stays consistent.
 */
function ExportButtonsInner({ videoName, metadata, srt, disabled, size = "sm" }: Props) {
  const base = useMemo(() => baseFilename(videoName), [videoName]);
  const hasMeta = !!metadata && !disabled;

  return (
    <>
      <Button
        variant="outline"
        size={size}
        disabled={!hasMeta}
        onClick={() =>
          metadata && downloadBlob(`${base}-metadata.txt`, "text/plain", buildCombinedText(videoName, metadata))
        }
      >
        <Download className="h-4 w-4 mr-1.5" /> .txt
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={!hasMeta}
        onClick={() =>
          metadata &&
          downloadBlob(
            `${base}-metadata.json`,
            "application/json",
            JSON.stringify({ video: videoName, metadata }, null, 2),
          )
        }
      >
        <Download className="h-4 w-4 mr-1.5" /> JSON
      </Button>
      <Button
        variant="outline"
        size={size}
        disabled={!hasMeta}
        onClick={() => metadata && downloadBlob(`${base}-metadata.csv`, "text/csv", buildCsv(videoName, metadata))}
      >
        <Download className="h-4 w-4 mr-1.5" /> CSV
      </Button>
      {srt && (
        <Button
          variant="outline"
          size={size}
          onClick={() => downloadBlob(`${base}.srt`, "application/x-subrip", srt)}
        >
          <Download className="h-4 w-4 mr-1.5" /> SRT
        </Button>
      )}
    </>
  );
}

export const ExportButtons = memo(ExportButtonsInner);