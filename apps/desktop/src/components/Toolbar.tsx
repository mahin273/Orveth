import React from "react";
import { Plus, Search, Pause, Play, Magnet, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolbarProps {
  breadcrumb: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAddModal: (initialMode?: "single" | "batch" | "media" | "torrent") => void;
  isAllPaused?: boolean;
  onTogglePauseAll: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  breadcrumb,
  searchQuery,
  onSearchChange,
  onOpenAddModal,
  isAllPaused,
  onTogglePauseAll,
}) => {
  return (
    <header className="h-14 border-b border-zinc-900 bg-black px-6 flex items-center justify-between gap-4 shrink-0 select-none">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
        <span className="text-zinc-500">Downloads</span>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-200">{breadcrumb}</span>
      </div>

      {/* Right Action Elements */}
      <div className="flex items-center gap-2">
        {/* Search input with Ctrl K */}
        <div className="relative w-56 sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search downloads"
            className="w-full h-8 pl-8 pr-16 bg-zinc-950 border border-zinc-800/90 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors font-sans"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-500 pointer-events-none">
            Ctrl K
          </div>
        </div>

        {/* Pause all button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onTogglePauseAll}
          className="h-8 px-2.5 text-xs bg-zinc-950 hover:bg-zinc-900 text-zinc-300 border-zinc-800/90 hover:border-zinc-700 gap-1.5 font-normal"
        >
          {isAllPaused ? (
            <>
              <Play className="w-3.5 h-3.5 text-zinc-400" />
              <span>Resume all</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 text-zinc-400" />
              <span>Pause all</span>
            </>
          )}
        </Button>

        {/* Torrent / Magnet Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenAddModal("torrent")}
          className="h-8 px-2.5 text-xs bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border-cyan-800/70 hover:border-cyan-600 gap-1.5 font-medium transition-colors"
          title="Add BitTorrent file (.torrent) or Magnet link"
        >
          <Magnet className="w-3.5 h-3.5 text-cyan-400" />
          <span>Torrent</span>
        </Button>

        {/* Video / Media Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenAddModal("media")}
          className="h-8 px-2.5 text-xs bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-800/70 hover:border-purple-600 gap-1.5 font-medium transition-colors"
          title="Download streaming video or audio via yt-dlp"
        >
          <Film className="w-3.5 h-3.5 text-purple-400" />
          <span>Media</span>
        </Button>

        {/* Add URL button */}
        <Button
          onClick={() => onOpenAddModal("single")}
          size="sm"
          className="h-8 px-3 text-xs bg-white text-black hover:bg-zinc-200 font-semibold gap-1.5 shadow-sm rounded-lg"
        >
          <Plus className="w-3.5 h-3.5 text-black stroke-[2.5]" />
          <span>Add URL</span>
        </Button>
      </div>
    </header>
  );
};
