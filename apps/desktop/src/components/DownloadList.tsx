import React, { useState, useRef } from "react";
import { DownloadJob } from "../api";
import { DownloadRow } from "./DownloadRow";
import {
  ArrowUpDown,
  Inbox,
  Plus,
  Play,
  Pause,
  Trash2,
  ArrowUp,
  X,
  Magnet,
  Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadListProps {
  jobs: DownloadJob[];
  selectedJobId: string | null;
  onSelectJob: (job: DownloadJob) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onOpenAddModal?: (mode?: "single" | "batch" | "media" | "torrent") => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  counts: {
    all: number;
    active: number;
    queued: number;
    completed: number;
    failed: number;
  };
  speedsById?: Record<string, number>;
  onSetPriority?: (id: string, priority: number) => void;
  onBatchPause?: (ids: string[]) => void;
  onBatchResume?: (ids: string[]) => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchSetPriority?: (ids: string[], priority: number) => void;
}

export const DownloadList: React.FC<DownloadListProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onDelete,
  onOpen,
  onReveal,
  onOpenAddModal,
  activeFilter,
  onFilterChange,
  counts,
  speedsById = {},
  onSetPriority,
  onBatchPause,
  onBatchResume,
  onBatchDelete,
  onBatchSetPriority,
}) => {
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const lastClickedIdRef = useRef<string | null>(null);

  const tabs = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "queued", label: "Queued", count: counts.queued },
    { id: "completed", label: "Completed", count: counts.completed },
    { id: "failed", label: "Failed", count: counts.failed },
  ];

  const visibleIds = jobs.map((j) => j.id);
  const isAllSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedRowIds.has(id));
  const isSomeSelected =
    visibleIds.some((id) => selectedRowIds.has(id)) && !isAllSelected;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(visibleIds));
    }
  };

  const handleToggleCheck = (id: string, e: React.MouseEvent) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedIdRef.current) {
        // Range select
        const lastIdx = visibleIds.indexOf(lastClickedIdRef.current);
        const curIdx = visibleIds.indexOf(id);
        if (lastIdx !== -1 && curIdx !== -1) {
          const start = Math.min(lastIdx, curIdx);
          const end = Math.max(lastIdx, curIdx);
          for (let i = start; i <= end; i++) {
            next.add(visibleIds[i]);
          }
          return next;
        }
      }

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastClickedIdRef.current = id;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black">
      {/* Sub-toolbar with filter pills and queue order */}
      <div className="px-6 py-3 flex items-center justify-between gap-4 border-b border-zinc-900 select-none">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 border border-zinc-800/80 rounded-xl">
          {tabs.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onFilterChange(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span>{tab.label}</span>
                <span className="font-mono text-[11px] opacity-75">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Queue Order Info */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 text-xs font-medium text-zinc-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <span>Priority Queue</span>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (Visible when >= 1 rows selected) */}
      {selectedRowIds.size > 0 && (
        <div className="mx-6 my-2 px-4 py-2 bg-zinc-900/90 border border-zinc-700/80 rounded-xl flex items-center justify-between shadow-xl text-xs select-none">
          <div className="flex items-center gap-3">
            <span className="font-medium text-white">
              <span className="font-mono text-sky-400">{selectedRowIds.size}</span> selected
            </span>
            <button
              onClick={() => setSelectedRowIds(new Set())}
              className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Deselect</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchResume?.(Array.from(selectedRowIds))}
              className="h-7 px-2.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border-zinc-700 gap-1.5 font-normal"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>Resume</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchPause?.(Array.from(selectedRowIds))}
              className="h-7 px-2.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-zinc-200 border-zinc-700 gap-1.5 font-normal"
            >
              <Pause className="w-3 h-3 text-amber-400" />
              <span>Pause</span>
            </Button>

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            {/* Bulk Priority */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchSetPriority?.(Array.from(selectedRowIds), 10)}
              className="h-7 px-2 text-xs bg-zinc-950 hover:bg-zinc-800 text-amber-400 border-zinc-700 gap-1 font-normal"
              title="Set High Priority (+10)"
            >
              <ArrowUp className="w-3 h-3 text-amber-400" />
              <span>High</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchSetPriority?.(Array.from(selectedRowIds), 0)}
              className="h-7 px-2 text-xs bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-700 font-normal"
              title="Set Normal Priority (0)"
            >
              <span>Normal</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onBatchSetPriority?.(Array.from(selectedRowIds), -10)}
              className="h-7 px-2 text-xs bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-700 font-normal"
              title="Set Low Priority (-10)"
            >
              <span>Low</span>
            </Button>

            <div className="h-4 w-px bg-zinc-800 mx-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onBatchDelete?.(Array.from(selectedRowIds));
                setSelectedRowIds(new Set());
              }}
              className="h-7 px-2.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30 gap-1.5 font-normal"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              <span>Delete</span>
            </Button>
          </div>
        </div>
      )}

      {/* Table Column Header */}
      <div className="px-10 py-2 flex items-center gap-3.5 text-[11px] font-medium text-zinc-500 select-none border-b border-zinc-900/60">
        <div className="w-4 shrink-0 flex items-center justify-center">
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-white accent-white cursor-pointer"
            title="Select all visible"
          />
        </div>
        <div className="flex-1">Name</div>
        <div className="w-32">Status</div>
        <div className="w-48">Progress</div>
        <div className="w-24 text-right">Speed</div>
        <div className="w-20 text-right">Time left</div>
        <div className="w-24" />
      </div>

      {/* Rows Container */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1.5">
        {jobs.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center select-none max-w-xl mx-auto px-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-400 shadow-inner">
              <Inbox className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="text-sm font-semibold text-zinc-200">No downloads queued</div>
            <div className="text-xs text-zinc-500 mt-1 max-w-md">
              Start downloads using accelerated multi-segment HTTP, BitTorrent swarm, or media extraction:
            </div>
            {onOpenAddModal && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-6 w-full">
                {/* 1. Direct / Multi-segment */}
                <button
                  type="button"
                  onClick={() => onOpenAddModal("single")}
                  className="flex flex-col items-center p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-center transition-all group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white mb-2 group-hover:scale-105 transition-transform">
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-zinc-200">Direct / Batch</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Multi-segment HTTP engine</span>
                </button>

                {/* 2. BitTorrent / Magnet */}
                <button
                  type="button"
                  onClick={() => onOpenAddModal("torrent")}
                  className="flex flex-col items-center p-3 rounded-xl bg-cyan-950/20 hover:bg-cyan-950/40 border border-cyan-800/50 hover:border-cyan-600/70 text-center transition-all group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700 flex items-center justify-center text-cyan-400 mb-2 group-hover:scale-105 transition-transform">
                    <Magnet className="w-4 h-4 text-cyan-400" />
                  </div>
                  <span className="text-xs font-semibold text-cyan-300">BitTorrent</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5 leading-tight">Magnets & .torrent files</span>
                </button>

                {/* 3. Media Stream */}
                <button
                  type="button"
                  onClick={() => onOpenAddModal("media")}
                  className="flex flex-col items-center p-3 rounded-xl bg-purple-950/20 hover:bg-purple-950/40 border border-purple-800/50 hover:border-purple-600/70 text-center transition-all group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-950 border border-purple-700 flex items-center justify-center text-purple-400 mb-2 group-hover:scale-105 transition-transform">
                    <Film className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-xs font-semibold text-purple-300">Video / Media</span>
                  <span className="text-[10px] text-zinc-500 mt-0.5 leading-tight">yt-dlp stream extraction</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          jobs.map((job) => (
            <DownloadRow
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.id}
              isChecked={selectedRowIds.has(job.id)}
              onSelect={onSelectJob}
              onToggleCheck={handleToggleCheck}
              onPause={onPause}
              onResume={onResume}
              onRetry={onRetry}
              onCancel={onCancel}
              onDelete={onDelete}
              onOpen={onOpen}
              onReveal={onReveal}
              onSetPriority={onSetPriority}
              speedBytesPerSec={speedsById[job.id] || 0}
            />
          ))
        )}
      </div>
    </div>
  );
};
