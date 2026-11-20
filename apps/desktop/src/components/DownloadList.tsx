import React from "react";
import { DownloadJob } from "../api";
import { DownloadRow } from "./DownloadRow";
import { Inbox } from "lucide-react";

interface DownloadListProps {
  jobs: DownloadJob[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onSelectJob: (job: DownloadJob) => void;
}

export const DownloadList: React.FC<DownloadListProps> = ({
  jobs,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onOpen,
  onReveal,
  onSelectJob,
}) => {
  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-12">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-600">
          <Inbox className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-medium text-slate-400">No downloads found</h3>
        <p className="text-xs text-slate-600 mt-1">Add a URL to begin downloading files</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {jobs.map((job) => (
        <DownloadRow
          key={job.id}
          job={job}
          onPause={onPause}
          onResume={onResume}
          onRetry={onRetry}
          onCancel={onCancel}
          onOpen={onOpen}
          onReveal={onReveal}
          onSelect={onSelectJob}
        />
      ))}
    </div>
  );
};
