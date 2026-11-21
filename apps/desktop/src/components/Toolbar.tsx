import React from "react";
import { Plus, Search, Gauge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <header className="h-14 border-b border-border bg-black px-6 flex items-center justify-between gap-4 shrink-0 select-none">
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <Button
          onClick={onOpenAddModal}
          size="sm"
          className="bg-white text-black hover:bg-zinc-200 font-medium shadow-none h-8 px-3 gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Download</span>
        </Button>

        <div className="relative w-full max-w-xs">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter downloads..."
            className="h-8 pl-8 pr-7 text-xs bg-secondary/30 border-border/80 focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="h-8 text-xs font-mono text-muted-foreground hover:text-foreground border-border/80 bg-secondary/20 hover:bg-secondary/40 gap-1.5"
          title="Configure bandwidth limit in Settings"
        >
          <Gauge className="w-3.5 h-3.5 text-zinc-400" />
          <span>
            {bandwidthCap
              ? `Limit: ${(bandwidthCap / 1024 / 1024).toFixed(1)} MB/s`
              : "Unlimited"}
          </span>
        </Button>
      </div>
    </header>
  );
};
