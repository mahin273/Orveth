import React from "react";
import { Plus, Search, Gauge } from "lucide-react";

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAddModal: () => void;
  bandwidthCap?: number;
  onOpenSettings: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenAddModal,
  bandwidthCap,
  onOpenSettings,
}) => {
  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 px-6 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm shadow-indigo-600/30 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Download</span>
        </button>

        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search downloads..."
            className="w-full bg-slate-800/80 border border-slate-700/60 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700/60 transition-colors"
          title="Configure bandwidth limit in Settings"
        >
          <Gauge className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            {bandwidthCap
              ? `Cap: ${(bandwidthCap / 1024 / 1024).toFixed(1)} MB/s`
              : "Unlimited Speed"}
          </span>
        </button>
      </div>
    </header>
  );
};
