import React from "react";
import { ArrowDownCircle, Clock, CheckCircle2 } from "lucide-react";

interface OverviewCardsProps {
  activeCount: number;
  queuedCount: number;
  completedCount: number;
  totalSpeedBytesPerSec: number;
}

export const OverviewCards: React.FC<OverviewCardsProps> = ({
  activeCount,
  queuedCount,
  completedCount,
  totalSpeedBytesPerSec,
}) => {
  const formatSpeed = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB/s`;
    }
    return `${bytes} B/s`;
  };

  return (
    <div className="grid grid-cols-4 gap-4 p-6 pb-2">
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
          <ArrowDownCircle className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active</div>
          <div className="text-xl font-bold text-slate-100">{activeCount}</div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Queued</div>
          <div className="text-xl font-bold text-slate-100">{queuedCount}</div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Completed</div>
          <div className="text-xl font-bold text-slate-100">{completedCount}</div>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
          <ArrowDownCircle className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Download Speed</div>
          <div className="text-xl font-bold text-slate-100">{formatSpeed(totalSpeedBytesPerSec)}</div>
        </div>
      </div>
    </div>
  );
};
