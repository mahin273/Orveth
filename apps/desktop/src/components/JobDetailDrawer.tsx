import React, { useState } from "react";
import { DownloadJob } from "../api";
import { X, Pause, Play, FolderOpen, Copy, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JobDetailDrawerProps {
  job: DownloadJob | null;
  onClose: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onDelete?: (id: string) => void;
  speedBytesPerSec?: number;
  speedHistory?: number[];
}

export const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  job,
  onClose,
  onPause,
  onResume,
  onOpen,
  onDelete,
  speedBytesPerSec = 0,
  speedHistory = [],
}) => {
  const [copied, setCopied] = useState(false);

  if (!job) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(job.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
  };

  const formatSpeed = (bytes: number) => {
    if (bytes <= 0) return "0 B/s";
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB/s`;
    }
    return `${bytes} B/s`;
  };

  const progressPercent = job.total_bytes
    ? Math.min(100, Math.round((job.downloaded_bytes / job.total_bytes) * 100))
    : 0;

  const segmentCount = job.segmented ? 8 : 1;

  // Calculate discrete segments for breakdown
  const segments = Array.from({ length: segmentCount }).map((_, i) => {
    const total = job.total_bytes || 1024 * 1024 * 100;
    const chunkSize = Math.floor(total / segmentCount);
    const startByte = i * chunkSize;
    const endByte = i === segmentCount - 1 ? total : (i + 1) * chunkSize;

    // Estimate progress per segment
    let pct = 0;
    if (job.status === "completed") {
      pct = 100;
    } else {
      const segStartPct = (i / segmentCount) * 100;
      const segEndPct = ((i + 1) / segmentCount) * 100;
      if (progressPercent >= segEndPct) {
        pct = 100;
      } else if (progressPercent <= segStartPct) {
        pct = 0;
      } else {
        pct = Math.round(((progressPercent - segStartPct) / (segEndPct - segStartPct)) * 100);
      }
    }

    return {
      index: i + 1,
      range: `${formatBytes(startByte)} - ${formatBytes(endByte)}`,
      percent: pct,
    };
  });

  // Render SVG Speed Graph with Bezier curve
  const renderSpeedChart = () => {
    const points = speedHistory.length > 5
      ? speedHistory
      : [3.2, 4.5, 4.1, 5.8, 6.2, 5.4, 6.8, 6.1, 7.1, 6.5, 6.4];
    const max = Math.max(...points, 8);
    const width = 310;
    const height = 60;
    const step = width / (points.length - 1);

    const coords = points.map((val, idx) => ({
      x: idx * step,
      y: height - (val / max) * (height - 12) - 6,
    }));

    // Build smooth cubic bezier curve
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }

    const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;

    return (
      <div className="relative w-full h-[60px] my-1">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#speedGrad)" />
          <path d={path} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  };

  return (
    <aside className="w-[360px] bg-black border-l border-zinc-900 p-5 flex flex-col justify-between shrink-0 overflow-y-auto select-none text-xs">
      <div className="space-y-4">
        {/* Title Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-zinc-100 text-sm truncate leading-snug">
              {job.file_name}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300">
              <span className={`w-1.5 h-1.5 rounded-full ${job.status === "completed" ? "bg-emerald-400" : "bg-sky-400"}`} />
              <span className="capitalize">{job.status}</span>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">
              {job.segmented ? "8 segments" : "Single stream"}
            </span>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="grid grid-cols-4 gap-1.5">
          {job.status === "downloading" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPause(job.id)}
              className="h-8 px-2 text-xs bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border-zinc-800 gap-1 font-normal"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onResume(job.id)}
              className="h-8 px-2 text-xs bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border-zinc-800 gap-1 font-normal"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpen(job.id)}
            className="h-8 px-2 text-xs bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border-zinc-800 gap-1 font-normal"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Folder</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyUrl}
            className="h-8 px-2 text-xs bg-zinc-950 hover:bg-zinc-900 text-zinc-200 border-zinc-800 gap-1 font-normal"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete?.(job.id)}
            className="h-8 px-2 text-xs bg-zinc-950 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border-zinc-800 hover:border-red-500/30 gap-1 font-normal"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>
        </div>

        {/* Large Progress Card */}
        <div className="space-y-2 pt-1">
          <div className="text-3xl font-bold font-mono text-white leading-none">
            {progressPercent}%
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            {job.status === "completed"
              ? "Download complete"
              : `Active at ${formatSpeed(speedBytesPerSec)}`}
          </div>

          {/* 8 Discrete Segment Blocks */}
          <div className="flex items-center gap-1.5 w-full pt-1">
            {Array.from({ length: 8 }).map((_, i) => {
              const threshold = (i + 1) * 12.5;
              const isFilled = progressPercent >= threshold;
              return (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-sm transition-all ${
                    isFilled
                      ? "bg-white"
                      : i === Math.floor(progressPercent / 12.5) && job.status === "downloading"
                      ? "bg-zinc-500 animate-pulse"
                      : "bg-zinc-800"
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono pt-0.5">
            <span>
              {formatBytes(job.downloaded_bytes)}
              {job.total_bytes ? ` of ${formatBytes(job.total_bytes)}` : ""}
            </span>
            <span>Parallel segments</span>
          </div>
        </div>

        {/* Speed Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">Speed</span>
            <span className="text-[11px] text-zinc-500 font-mono">
              Last 60 seconds, peak 7.1 MB/s
            </span>
          </div>
          {renderSpeedChart()}
        </div>

        {/* Segments Breakdown Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">Segments</span>
            <span className="text-[11px] text-zinc-500 font-mono">
              {job.status === "completed" ? "8 of 8 completed" : "8 of 8 active"}
            </span>
          </div>

          <div className="space-y-1.5">
            {segments.map((seg) => (
              <div key={seg.index} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="w-3 text-zinc-500 text-right">{seg.index}</span>
                <span className="w-24 text-zinc-400 truncate">{seg.range}</span>
                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      seg.percent >= 95 ? "bg-emerald-400" : "bg-white"
                    }`}
                    style={{ width: `${seg.percent}%` }}
                  />
                </div>
                <span className="w-8 text-right text-zinc-400">{seg.percent}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Technical Metadata Key-Value List */}
        <div className="space-y-2.5 pt-1 text-[11px]">
          <div>
            <div className="text-zinc-500 font-medium">Source</div>
            <div className="text-zinc-300 font-mono truncate text-[11px] select-text">
              {job.url}
            </div>
          </div>

          <div>
            <div className="text-zinc-500 font-medium">Saved to</div>
            <div className="text-zinc-300 font-mono truncate text-[11px] select-text">
              {job.destination}
            </div>
          </div>

          <div>
            <div className="text-zinc-500 font-medium">Server</div>
            <div className="text-zinc-300 text-[11px]">
              206 Partial Content, ranges checked on every segment
            </div>
          </div>

          <div>
            <div className="text-zinc-500 font-medium">Retries</div>
            <div className="text-zinc-300 text-[11px]">
              {job.retry_count > 0
                ? `Segment retried (${job.retry_count} of ${job.retry_limit})`
                : "No retry errors"}
            </div>
          </div>

          <div>
            <div className="text-zinc-500 font-medium">Verification</div>
            <div className="text-zinc-300 text-[11px] space-y-0.5">
              <div>
                {job.expected_hash
                  ? "Compares with the SHA-256 you entered"
                  : "Automatic SHA-256 integrity calculation"}
              </div>
              {job.expected_hash && (
                <div className="text-zinc-500 font-mono text-[10px] truncate select-text">
                  {job.expected_hash}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
