import React from "react";
import { DownloadJob } from "../api";
import {
  FileText,
  FileArchive,
  Film,
  Music,
  Code,
  File,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  FolderOpen,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface DownloadRowProps {
  job: DownloadJob;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onSelect: (job: DownloadJob) => void;
}

export const DownloadRow: React.FC<DownloadRowProps> = ({
  job,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onOpen,
  onReveal,
  onSelect,
}) => {
  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "zip":
      case "tar":
      case "gz":
      case "xz":
      case "7z":
      case "iso":
        return <FileArchive className="w-4 h-4 text-zinc-300" />;
      case "mp4":
      case "mkv":
      case "webm":
      case "avi":
        return <Film className="w-4 h-4 text-zinc-300" />;
      case "mp3":
      case "flac":
      case "wav":
        return <Music className="w-4 h-4 text-zinc-300" />;
      case "rs":
      case "ts":
      case "js":
      case "py":
      case "json":
        return <Code className="w-4 h-4 text-zinc-300" />;
      case "pdf":
      case "doc":
      case "docx":
      case "txt":
        return <FileText className="w-4 h-4 text-zinc-300" />;
      default:
        return <File className="w-4 h-4 text-zinc-400" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
  };

  const progressPercent = job.total_bytes
    ? Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100))
    : 0;

  const renderStatusBadge = () => {
    switch (job.status) {
      case "downloading":
        return (
          <Badge variant="default" className="bg-white text-black font-mono text-[10px] h-5 hover:bg-white">
            Downloading
          </Badge>
        );
      case "preparing":
        return (
          <Badge variant="secondary" className="font-mono text-[10px] h-5">
            Preparing
          </Badge>
        );
      case "paused":
        return (
          <Badge variant="outline" className="font-mono text-[10px] h-5 text-muted-foreground border-border">
            Paused
          </Badge>
        );
      case "queued":
        return (
          <Badge variant="warning" className="font-mono text-[10px] h-5">
            Queued
          </Badge>
        );
      case "verifying":
        return (
          <Badge variant="info" className="font-mono text-[10px] h-5">
            Verifying
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="success" className="font-mono text-[10px] h-5">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="font-mono text-[10px] h-5">
            Failed
          </Badge>
        );
      case "needs_attention":
        return (
          <Badge variant="warning" className="font-mono text-[10px] h-5">
            Action Needed
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="font-mono text-[10px] h-5">
            {job.status}
          </Badge>
        );
    }
  };

  return (
    <div
      onClick={() => onSelect(job)}
      className="p-3.5 bg-card/60 hover:bg-card border border-border/80 hover:border-zinc-700/90 rounded-lg transition-all cursor-pointer flex flex-col gap-2.5 group select-none shadow-sm"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: icon + filename + destination */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-secondary/80 border border-border/60 flex items-center justify-center shrink-0">
            {getFileIcon(job.file_name)}
          </div>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors tracking-tight">
              {job.file_name}
            </h3>
            <p className="text-[11px] font-mono text-muted-foreground truncate max-w-md">
              {job.destination}
            </p>
          </div>
        </div>

        {/* Right: Badges & Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {renderStatusBadge()}

          {job.segmented && (
            <Badge variant="outline" className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] h-5 border-border/80 text-muted-foreground">
              <Layers className="w-2.5 h-2.5" />
              <span>Multi-part</span>
            </Badge>
          )}

          {job.verification_status === "matched" && (
            <Badge variant="success" className="items-center gap-1 font-mono text-[10px] h-5">
              <ShieldCheck className="w-3 h-3" />
              <span>Verified</span>
            </Badge>
          )}

          {job.verification_status === "mismatch" && (
            <Badge variant="destructive" className="items-center gap-1 font-mono text-[10px] h-5">
              <ShieldAlert className="w-3 h-3" />
              <span>Mismatch</span>
            </Badge>
          )}

          {/* Action icon buttons */}
          <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
            {job.status === "downloading" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onPause(job.id)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Pause"
              >
                <Pause className="w-3.5 h-3.5" />
              </Button>
            )}

            {(job.status === "paused" || job.status === "queued") && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onResume(job.id)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Resume"
              >
                <Play className="w-3.5 h-3.5" />
              </Button>
            )}

            {job.status === "failed" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRetry(job.id)}
                className="h-7 w-7 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                title="Retry"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            )}

            {job.status === "completed" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpen(job.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Open File"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onReveal(job.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Reveal in Folder"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </Button>
              </>
            )}

            {job.status !== "completed" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCancel(job.id)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Cancel download"
              >
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress & metrics */}
      <div className="space-y-1">
        <Progress
          value={job.status === "completed" ? 100 : progressPercent}
          className="h-1 bg-secondary/80"
          indicatorClassName={
            job.status === "completed"
              ? "bg-emerald-400"
              : job.status === "failed"
              ? "bg-destructive"
              : "bg-white"
          }
        />

        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
          <span>
            {formatBytes(job.downloaded_bytes)}
            {job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ""}
          </span>
          <span>
            {job.status === "completed"
              ? "100%"
              : job.total_bytes
              ? `${progressPercent}%`
              : "Streaming..."}
          </span>
        </div>
      </div>
    </div>
  );
};
