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
  Trash2,
  ArrowUp,
  Magnet,
  Film,
} from "lucide-react";

interface DownloadRowProps {
  job: DownloadJob;
  isSelected: boolean;
  isChecked?: boolean;
  onSelect: (job: DownloadJob) => void;
  onToggleCheck?: (id: string, e: React.MouseEvent) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete?: (id: string) => void;
  onSetPriority?: (id: string, priority: number) => void;
  speedBytesPerSec?: number;
}

export const DownloadRow: React.FC<DownloadRowProps> = ({
  job,
  isSelected,
  isChecked = false,
  onSelect,
  onToggleCheck,
  onPause,
  onResume,
  onRetry,
  onOpen,
  onDelete,
  onSetPriority,
  speedBytesPerSec = 0,
}) => {
  const isTorrent = job.url.startsWith("magnet:") || /\.torrent$/i.test(job.file_name) || job.category === "torrent";
  const isMedia = job.category === "media" || /\.(mp4|mkv|webm|avi|mov|mp3|m4a|flac|wav|aac|opus)$/i.test(job.file_name);

  const getFileIcon = (name: string) => {
    if (isTorrent) {
      return <Magnet className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (isMedia) {
      return <Film className="w-3.5 h-3.5 text-purple-400" />;
    }
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
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>Failed</span>
          </div>
        );
      case "needs_attention":
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Attention</span>
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <span className="capitalize">{job.status}</span>
          </div>
        );
    }
  };

  // Render multi-segment segmented bar or smooth progress
  const renderProgressBar = () => {
    if (job.status === "completed") {
      return (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full w-full" />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-zinc-500">
            <span>{formatBytes(job.downloaded_bytes)} of {formatBytes(job.total_bytes || job.downloaded_bytes)}</span>
            <span>100%</span>
          </div>
        </div>
      );
    }

    if (!job.total_bytes) {
      return (
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-sky-400 rounded-full animate-pulse w-full" />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-zinc-500">
            <span>{formatBytes(job.downloaded_bytes)}</span>
            <span>Streaming</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {/* Render discrete segment dash segments */}
        <div className="flex items-center gap-1 h-1.5 w-full">
          {Array.from({ length: 8 }).map((_, i) => {
            const blockWeight = 100 / 8;
            const blockStart = i * blockWeight;
            const blockEnd = (i + 1) * blockWeight;

            let fillClass = "bg-zinc-800/80";
            if (progressPercent >= blockEnd) {
              fillClass = "bg-zinc-200";
            } else if (progressPercent > blockStart) {
              fillClass = "bg-zinc-400";
            }

            return (
              <div
                key={i}
                className={`flex-1 h-full rounded-sm transition-all duration-300 ${fillClass}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
          <span>
            {formatBytes(job.downloaded_bytes)} of {formatBytes(job.total_bytes)}
          </span>
          <span>{progressPercent}%</span>
        </div>
      </div>
    );
  };

  const renderSubtitle = () => {
    const domain = getDomain(job.url);
    if (job.status === "failed" && job.last_error_message) {
      return <div className="text-[11px] text-red-400/90 truncate">{job.last_error_message}</div>;
    }
    return <div className="text-[11px] text-zinc-500 truncate">{domain}</div>;
  };

  return (
    <div
      onClick={() => onSelect(job)}
      className={`px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3.5 text-xs select-none ${
        isSelected
          ? "bg-zinc-900/60 border-zinc-700/80 shadow-sm"
          : isChecked
          ? "bg-zinc-900/40 border-zinc-800"
          : "bg-zinc-950/40 hover:bg-zinc-900/40 border-zinc-900 hover:border-zinc-800/80"
      }`}
    >
      {/* 0. Row Checkbox */}
      <div
        className="flex items-center justify-center shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck?.(job.id, e);
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {}}
          className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-white accent-white cursor-pointer"
        />
      </div>

      {/* 1. Name & Domain */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          {getFileIcon(job.file_name)}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-zinc-100 truncate text-xs">{job.file_name}</span>
            {isTorrent && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-950/70 text-cyan-300 border border-cyan-800/60 font-semibold shrink-0 uppercase flex items-center gap-1">
                <Magnet className="w-2.5 h-2.5" />
                <span>Torrent</span>
              </span>
            )}
            {isMedia && !isTorrent && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-950/70 text-purple-300 border border-purple-800/60 font-semibold shrink-0 uppercase flex items-center gap-1">
                <Film className="w-2.5 h-2.5" />
                <span>Media</span>
              </span>
            )}
            {job.priority > 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold shrink-0">
                HIGH
              </span>
            )}
            {job.priority < 0 && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/40 shrink-0">
                LOW
              </span>
            )}
          </div>
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
        className="w-24 shrink-0 flex items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {job.status === "queued" && onSetPriority && (
          <button
            onClick={() => onSetPriority(job.id, job.priority > 0 ? 0 : 10)}
            className={`p-1 rounded transition-colors ${
              job.priority > 0
                ? "text-amber-400 bg-amber-500/10"
                : "text-zinc-500 hover:text-amber-400 hover:bg-zinc-800"
            }`}
            title={job.priority > 0 ? "High priority (click to reset)" : "Promote to High priority"}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}

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

        {onDelete && (
          <button
            onClick={() => onDelete(job.id)}
            className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete download"
          >
            <Trash2 className="w-3.5 h-3.5" />
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
