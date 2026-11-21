import React from "react";
import { DownloadJob } from "../api";
import { DownloadRow } from "./DownloadRow";
import { ArrowUpDown, Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadListProps {
  jobs: DownloadJob[];
  selectedJobId: string | null;
  onSelectJob: (job: DownloadJob) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onOpenAddModal?: () => void;
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
}

export const DownloadList: React.FC<DownloadListProps> = ({
  jobs,
  selectedJobId,
  onSelectJob,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onOpen,
  onReveal,
  onOpenAddModal,
  activeFilter,
  onFilterChange,
  counts,
  speedsById = {},
}) => {
  const tabs = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "queued", label: "Queued", count: counts.queued },
    { id: "completed", label: "Completed", count: counts.completed },
    { id: "failed", label: "Failed", count: counts.failed },
  ];

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

        {/* Queue Order button */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700/80 text-xs font-medium text-zinc-300 hover:text-white transition-colors">
          <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
          <span>Queue order</span>
        </button>
      </div>

      {/* Table Column Header */}
      <div className="px-10 py-2 flex items-center gap-4 text-[11px] font-medium text-zinc-500 select-none border-b border-zinc-900/60">
        <div className="flex-1">Name</div>
        <div className="w-32">Status</div>
        <div className="w-48">Progress</div>
        <div className="w-24 text-right">Speed</div>
        <div className="w-20 text-right">Time left</div>
        <div className="w-20" />
      </div>

      {/* Rows Container */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1.5">
        {jobs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-zinc-500 select-none">
            <div className="w-12 h-12 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-500">
              <Inbox className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="text-xs font-medium text-zinc-300">No downloads found</div>
            <div className="text-[11px] text-zinc-600 mt-1">Queue a new download with a direct URL</div>
            {onOpenAddModal && (
              <Button
                onClick={onOpenAddModal}
                size="sm"
                className="mt-4 h-8 text-xs bg-white text-black hover:bg-zinc-200 font-medium"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>Add URL</span>
              </Button>
            )}
          </div>
        ) : (
          jobs.map((job) => (
            <DownloadRow
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.id}
              onSelect={onSelectJob}
              onPause={onPause}
              onResume={onResume}
              onRetry={onRetry}
              onCancel={onCancel}
              onOpen={onOpen}
              onReveal={onReveal}
              speedBytesPerSec={speedsById[job.id] || 0}
            />
          ))
        )}
      </div>
    </div>
  );
};
