import React from "react";
import { DownloadJob } from "../api";
import { DownloadRow } from "./DownloadRow";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadListProps {
  jobs: DownloadJob[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onSelectJob: (job: DownloadJob) => void;
  onOpenAddModal?: () => void;
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
  onOpenAddModal,
}) => {
  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 select-none">
        <div className="w-12 h-12 rounded-xl bg-secondary/60 border border-border flex items-center justify-center mb-3 text-muted-foreground">
          <Inbox className="w-6 h-6 stroke-[1.5]" />
        </div>
        <h3 className="text-sm font-semibold text-foreground tracking-tight">No downloads in queue</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs text-center">
          Start a new download task by providing a direct URL or file link.
        </p>
        {onOpenAddModal && (
          <Button
            onClick={onOpenAddModal}
            size="sm"
            variant="outline"
            className="mt-4 h-8 text-xs gap-1.5 border-border/80 bg-secondary/30 hover:bg-secondary text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Download</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
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
