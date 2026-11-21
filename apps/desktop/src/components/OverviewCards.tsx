import React from "react";
import { Activity, Gauge, Clock, ArrowDownToLine } from "lucide-react";

interface OverviewCardsProps {
  activeCount: number;
  downloadingCount: number;
  retryingCount: number;
  queuedCount: number;
  nextQueuedFileName?: string;
  totalSpeedBytesPerSec: number;
  bandwidthCap?: number;
  leftToDownloadBytes: number;
  unfinishedCount: number;
  speedHistory?: number[];
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({
  activeCount,
  downloadingCount,
  retryingCount,
  queuedCount,
  nextQueuedFileName,
  totalSpeedBytesPerSec,
  bandwidthCap,
  leftToDownloadBytes,
  unfinishedCount,
  speedHistory = [],
}) => {
  const formatSpeed = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(0)} KB/s`;
    }
    return `${bytes} B/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  // Generate an SVG path for the speed mini-sparkline inside Card 2
  const renderSparkline = () => {
    const points = speedHistory.length >= 2 ? speedHistory : [0, 0];
    const max = Math.max(...points, 0.1);
    const width = 80;
    const height = 24;
    const step = width / (points.length - 1);

    const pathData = points
      .map((val, idx) => {
        const x = idx * step;
        const y = max > 0 ? height - (val / max) * (height - 4) - 2 : height - 2;
        return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

    return (
      <svg width={width} height={height} className="overflow-visible opacity-80">
        <path
          d={pathData}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="grid grid-cols-4 gap-3 px-6 pt-4 pb-2">
      {/* Card 1: Active */}
      <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400">
          <span className="text-xs font-medium">Active</span>
          <Activity className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="my-1.5">
          <div className="text-2xl font-bold font-mono tracking-tight text-white leading-none">
            {activeCount}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {downloadingCount > 0 || retryingCount > 0
            ? `${downloadingCount} downloading${retryingCount > 0 ? `, ${retryingCount} retrying` : ""}`
            : activeCount > 0
            ? `${activeCount} in progress`
            : "No active transfers"}
        </div>
      </div>

      {/* Card 2: Speed */}
      <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400">
          <span className="text-xs font-medium">Speed</span>
          <Gauge className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="my-1.5 flex items-center justify-between">
          <div className="text-2xl font-bold font-mono tracking-tight text-white leading-none">
            {formatSpeed(totalSpeedBytesPerSec)}
          </div>
          <div className="shrink-0 pl-2">{renderSparkline()}</div>
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {bandwidthCap
            ? `Limit: ${(bandwidthCap / 1024 / 1024).toFixed(1)} MB/s`
            : "No global limit"}
        </div>
      </div>

      {/* Card 3: Queued */}
      <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400">
          <span className="text-xs font-medium">Queued</span>
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="my-1.5">
          <div className="text-2xl font-bold font-mono tracking-tight text-white leading-none">
            {queuedCount}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {nextQueuedFileName ? `Next: ${nextQueuedFileName}` : "Queue is empty"}
        </div>
      </div>

      {/* Card 4: Left to download */}
      <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400">
          <span className="text-xs font-medium">Left to download</span>
          <ArrowDownToLine className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="my-1.5">
          <div className="text-2xl font-bold font-mono tracking-tight text-white leading-none">
            {formatBytes(leftToDownloadBytes)}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 truncate">
          {unfinishedCount > 0
            ? `Across ${unfinishedCount} unfinished jobs`
            : "All downloads finished"}
        </div>
      </div>
    </div>
  );
};
