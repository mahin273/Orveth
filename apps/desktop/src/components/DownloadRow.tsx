import React from "react";
import { DownloadJob } from "../api";
import {
  Disc,
  Code,
  Box,
  FileText,
  File,
  Pause,
  Play,
  RotateCcw,
  FolderOpen,
  MoreHorizontal,
} from "lucide-react";

interface DownloadRowProps {
  job: DownloadJob;
  isSelected: boolean;
  onSelect: (job: DownloadJob) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onCancel: (id: string) => void;
  speedBytesPerSec?: number;
}

export const DownloadRow: React.FC<DownloadRowProps> = ({
  job,
  isSelected,
  onSelect,
  onPause,
  onResume,
  onRetry,
  onOpen,
  speedBytesPerSec = 0,
}) => {
  const getFileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "iso":
      case "img":
        return <Disc className="w-3.5 h-3.5 text-zinc-400" />;
      case "zip":
      case "tar":
      case "gz":
      case "xz":
      case "zst":
      case "7z":
        return <Box className="w-3.5 h-3.5 text-zinc-400" />;
      case "rs":
      case "ts":
      case "js":
      case "py":
      case "c":
      case "cpp":
        return <Code className="w-3.5 h-3.5 text-zinc-400" />;
      case "pdf":
      case "doc":
      case "txt":
        return <FileText className="w-3.5 h-3.5 text-zinc-400" />;
      default:
        return <File className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const getDomain = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url.split("/")[0] || url;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
  };

  const formatSpeed = (bytes: number) => {
    if (bytes <= 0) return "-";
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB/s`;
    }
    return `${bytes} B/s`;
  };

  const formatTimeLeft = () => {
    if (job.status === "completed") return "-";
    if (job.status !== "downloading" || speedBytesPerSec <= 0 || !job.total_bytes) {
      return "-";
    }
    const remaining = Math.max(0, job.total_bytes - job.downloaded_bytes);
    const seconds = Math.round(remaining / speedBytesPerSec);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const progressPercent = job.total_bytes
    ? Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100))
    : 0;

  // Render status pill matching reference screenshot
  const renderStatus = () => {
    switch (job.status) {
      case "downloading":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>Downloading</span>
          </div>
        );
      case "retrying":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Retrying</span>
          </div>
        );
      case "paused":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            <span>Paused</span>
          </div>
        );
      case "queued":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full border border-zinc-500" />
            <span>Queued</span>
          </div>
        );
      case "verifying":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>Verifying</span>
          </div>
        );
      case "completed":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Completed</span>
          </div>
        );
      case "failed":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>Failed</span>
          </div>
        );
      case "needs_attention":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Needs attention</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            <span className="capitalize">{job.status}</span>
          </div>
        );
    }
  };

  // Render progress bar with segments / dashes
  const renderProgressBar = () => {
    if (job.status === "completed") {
      return (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full w-full" />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>{job.total_bytes ? formatBytes(job.total_bytes) : formatBytes(job.downloaded_bytes)}</span>
            <span>100%</span>
          </div>
        </div>
      );
    }

    if (job.status === "retrying") {
      return (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full animate-stripes"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>
              {formatBytes(job.downloaded_bytes)}
              {job.total_bytes ? ` of ${formatBytes(job.total_bytes)}` : ""}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>
      );
    }

    if (job.status === "failed") {
      return (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-800/80 rounded-full overflow-hidden">
            <div className="h-full bg-red-400/80 rounded-full" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>
              {formatBytes(job.downloaded_bytes)}
              {job.total_bytes ? ` of ${formatBytes(job.total_bytes)}` : ""}
            </span>
            <span>{progressPercent}%</span>
          </div>
        </div>
      );
    }

    // Downloading, paused, or queued segmented block bar
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 w-full">
          {Array.from({ length: 8 }).map((_, i) => {
            const threshold = (i + 1) * 12.5;
            const isFilled = progressPercent >= threshold;
            return (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-sm transition-all ${
                  isFilled
                    ? "bg-white"
                    : i === Math.floor(progressPercent / 12.5) && job.status === "downloading"
                    ? "bg-zinc-600 animate-pulse"
                    : "bg-zinc-800"
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>
            {formatBytes(job.downloaded_bytes)}
            {job.total_bytes ? ` of ${formatBytes(job.total_bytes)}` : ""}
          </span>
          <span>{progressPercent}%</span>
        </div>
      </div>
    );
  };

  // Subtitle notes (domain, hash status, or errors)
  const renderSubtitle = () => {
    if (job.last_error_message) {
      return (
        <span className="text-red-400/90 truncate block text-[11px] font-mono">
          {getDomain(job.url)}, {job.last_error_message}
        </span>
      );
    }
    if (job.status === "completed" && job.verification_status === "matched") {
      return (
        <span className="text-zinc-500 truncate block text-[11px]">
          {getDomain(job.url)}, hash matches
        </span>
      );
    }
    if (job.status === "completed" && job.verification_status === "calculated") {
      return (
        <span className="text-zinc-500 truncate block text-[11px]">
          {getDomain(job.url)}, hash calculated only
        </span>
      );
    }
    return (
      <span className="text-zinc-500 truncate block text-[11px]">
        {getDomain(job.url)}
      </span>
    );
  };

  return (
    <div
      onClick={() => onSelect(job)}
      className={`px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center gap-4 text-xs select-none ${
        isSelected
          ? "bg-zinc-900/60 border-zinc-700/80 shadow-sm"
          : "bg-zinc-950/40 hover:bg-zinc-900/40 border-zinc-900 hover:border-zinc-800/80"
      }`}
    >
      {/* 1. Name & Domain */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          {getFileIcon(job.file_name)}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium text-zinc-100 truncate text-xs">{job.file_name}</div>
          {renderSubtitle()}
        </div>
      </div>

      {/* 2. Status Pill */}
      <div className="w-32 shrink-0">{renderStatus()}</div>

      {/* 3. Progress Bar */}
      <div className="w-48 shrink-0">{renderProgressBar()}</div>

      {/* 4. Speed */}
      <div className="w-24 shrink-0 text-right font-mono text-[11px] text-zinc-300">
        {job.status === "downloading" ? formatSpeed(speedBytesPerSec) : "-"}
      </div>

      {/* 5. Time left */}
      <div className="w-20 shrink-0 text-right font-mono text-[11px] text-zinc-400">
        {formatTimeLeft()}
      </div>

      {/* 6. Action buttons */}
      <div
        className="w-20 shrink-0 flex items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {job.status === "downloading" && (
          <button
            onClick={() => onPause(job.id)}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Pause"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        {(job.status === "paused" || job.status === "queued") && (
          <button
            onClick={() => onResume(job.id)}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Resume"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}

        {job.status === "completed" && (
          <button
            onClick={() => onOpen(job.id)}
            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Open folder"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        )}

        {(job.status === "failed" || job.status === "needs_attention") && (
          <button
            onClick={() => onRetry(job.id)}
            className="p-1 rounded text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 transition-colors"
            title="Retry"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => onSelect(job)}
          className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="More options"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
