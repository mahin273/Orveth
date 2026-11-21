import React, { useState } from "react";
import { DownloadJob } from "../api";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Copy,
  Check,
  Layers,
  HardDrive,
  Globe,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface JobDetailDrawerProps {
  job: DownloadJob | null;
  onClose: () => void;
  onRetry: (id: string) => void;
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  job,
  onClose,
  onRetry,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!job) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <aside className="w-84 bg-black border-l border-border p-5 flex flex-col justify-between shrink-0 overflow-y-auto select-none">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
              Job Inspector
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        <Separator className="bg-border/60" />

        {/* Content */}
        <div className="space-y-4 text-xs">
          {/* File Name & Status */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              File Name
            </span>
            <div className="text-foreground font-semibold break-all leading-snug">
              {job.file_name}
            </div>
            <div className="pt-1">
              <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                {job.status.replace("_", " ")}
              </Badge>
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Transfer Info */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>Transfer Architecture</span>
            </span>
            <div className="p-2.5 rounded-md bg-secondary/40 border border-border/80 text-[11px] text-zinc-300">
              {job.segmented
                ? "Segmented multi-stream concurrent transfer"
                : "Single sequential byte stream"}
            </div>
          </div>

          {/* Destination */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                <span>Destination</span>
              </span>
              <button
                onClick={() => handleCopy(job.destination, "dest")}
                className="text-muted-foreground hover:text-foreground p-0.5"
                title="Copy Destination"
              >
                {copiedField === "dest" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div className="p-2.5 rounded-md bg-secondary/40 border border-border/80 font-mono text-[11px] text-zinc-300 break-all select-text">
              {job.destination}
            </div>
          </div>

          {/* Source URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-zinc-400" />
                <span>Source URL</span>
              </span>
              <button
                onClick={() => handleCopy(job.url, "url")}
                className="text-muted-foreground hover:text-foreground p-0.5"
                title="Copy URL"
              >
                {copiedField === "url" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div className="p-2.5 rounded-md bg-secondary/40 border border-border/80 font-mono text-[11px] text-zinc-400 break-all max-h-24 overflow-y-auto select-text">
              {job.url}
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Verification section */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Integrity Status
            </span>
            <div className="p-3 bg-secondary/40 border border-border/80 rounded-md space-y-1.5">
              {job.verification_status === "matched" && (
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>SHA-256 Checksum Match</span>
                </div>
              )}
              {job.verification_status === "mismatch" && (
                <div className="flex items-center gap-1.5 text-destructive font-semibold text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Checksum Mismatch</span>
                </div>
              )}
              {job.verification_status === "calculated" && (
                <div className="text-zinc-400 text-xs">
                  Digest calculated (no reference hash provided)
                </div>
              )}
              {job.verification_status === "not_requested" && (
                <div className="text-muted-foreground text-xs">No verification requested</div>
              )}

              {job.expected_hash && (
                <div className="text-[10px] text-muted-foreground font-mono break-all pt-1 select-text">
                  Expected: {job.expected_hash}
                </div>
              )}
            </div>
          </div>

          {/* Error Details */}
          {job.last_error_message && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md space-y-2">
              <div className="font-semibold text-destructive flex items-center gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Transfer Error</span>
              </div>
              <div className="text-zinc-300 font-mono text-[11px] break-all select-text">
                {job.last_error_message}
              </div>
              {job.status === "failed" && (
                <Button
                  onClick={() => onRetry(job.id)}
                  size="sm"
                  variant="destructive"
                  className="w-full h-7 text-xs gap-1.5 mt-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry Download</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
