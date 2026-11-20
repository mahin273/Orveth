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
} from "lucide-react";

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
        return <FileArchive className="w-5 h-5 text-amber-400" />;
      case "mp4":
      case "mkv":
      case "webm":
      case "avi":
        return <Film className="w-5 h-5 text-purple-400" />;
      case "mp3":
      case "flac":
      case "wav":
        return <Music className="w-5 h-5 text-pink-400" />;
      case "rs":
      case "ts":
      case "js":
      case "py":
      case "json":
        return <Code className="w-5 h-5 text-emerald-400" />;
      case "pdf":
      case "doc":
      case "docx":
      case "txt":
        return <FileText className="w-5 h-5 text-sky-400" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
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

  const getStatusBadge = () => {
    switch (job.status) {
      case "downloading":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Downloading
          </span>
        );
      case "preparing":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Preparing
          </span>
        );
      case "paused":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Paused
          </span>
        );
      case "queued":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Queued
          </span>
        );
      case "verifying":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Verifying
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Completed
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
            Failed
          </span>
        );
      case "needs_attention":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Needs Attention
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-slate-500/10 text-slate-400">
            {job.status}
          </span>
        );
    }
  };

  return (
    <div
      onClick={() => onSelect(job)}
      className="p-4 bg-slate-900/40 hover:bg-slate-800/40 border border-slate-800/80 rounded-xl transition-all cursor-pointer flex flex-col gap-3 group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700/50">
            {getFileIcon(job.file_name)}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-400 transition-colors">
              {job.file_name}
            </h3>
            <p className="text-xs text-slate-500 truncate max-w-lg">{job.destination}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {getStatusBadge()}

          {job.verification_status === "matched" && (
            <span
              title="Integrity Verified (SHA-256 Match)"
              className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified</span>
            </span>
          )}

          {job.verification_status === "mismatch" && (
            <span
              title="Integrity Failure: SHA-256 Mismatch!"
              className="flex items-center gap-1 text-xs text-red-400 font-medium px-2 py-0.5 bg-red-500/10 rounded-md border border-red-500/20"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Mismatch</span>
            </span>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {job.status === "downloading" && (
              <button
                onClick={() => onPause(job.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                title="Pause"
              >
                <Pause className="w-4 h-4" />
              </button>
            )}

            {(job.status === "paused" || job.status === "queued") && (
              <button
                onClick={() => onResume(job.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
                title="Resume"
              >
                <Play className="w-4 h-4" />
              </button>
            )}

            {job.status === "failed" && (
              <button
                onClick={() => onRetry(job.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                title="Retry"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            {job.status === "completed" && (
              <>
                <button
                  onClick={() => onOpen(job.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                  title="Open File"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onReveal(job.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition-colors"
                  title="Reveal in Folder"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </>
            )}

            {job.status !== "completed" && (
              <button
                onClick={() => onCancel(job.id)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                title="Cancel"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress & Byte counts */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              job.status === "completed"
                ? "bg-emerald-500"
                : job.status === "failed"
                ? "bg-red-500"
                : "bg-indigo-500"
            }`}
            style={{ width: `${job.status === "completed" ? 100 : progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {formatBytes(job.downloaded_bytes)}
            {job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ""}
          </span>
          <span>
            {job.status === "completed"
              ? "100%"
              : job.total_bytes
              ? `${progressPercent}%`
              : "Calculating..."}
          </span>
        </div>
      </div>
    </div>
  );
};
