import React from "react";
import {
  LayoutGrid,
  ListFilter,
  ArrowDownToLine,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Disc,
  Code,
  Box,
  Database,
  RotateCcw,
  Settings,
  HardDrive,
  ChevronsUpDown,
  HardDriveDownload,
  Magnet,
  Film,
  Globe,
  Shield,
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  defaultDestination?: string;
  counts: {
    all: number;
    active: number;
    queued: number;
    completed: number;
    failed: number;
    diskImages?: number;
    sourceCode?: number;
    applications?: number;
    datasets?: number;
    torrents?: number;
    media?: number;
  };
  onOpenSettings: () => void;
  onOpenAddModal?: (mode: "single" | "batch" | "media" | "torrent") => void;
  proxyUrl?: string;
  bridgeEnabled?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  selectedCategory,
  onCategoryChange,
  defaultDestination,
  counts,
  onOpenSettings,
  onOpenAddModal,
  proxyUrl,
  bridgeEnabled = true,
}) => {
  const mainNav = [
    { id: "overview", label: "Overview", icon: LayoutGrid, count: undefined },
    { id: "all", label: "All downloads", icon: ListFilter, count: counts.all },
    { id: "active", label: "Active", icon: ArrowDownToLine, count: counts.active },
    { id: "queued", label: "Queued", icon: Clock, count: counts.queued },
    { id: "completed", label: "Completed", icon: CheckCircle2, count: counts.completed },
    { id: "failed", label: "Failed", icon: AlertTriangle, count: counts.failed },
  ];

  const categories = [
    { id: "torrents", label: "BitTorrent", icon: Magnet, count: counts.torrents || 0, color: "text-cyan-400" },
    { id: "media", label: "Media & Streams", icon: Film, count: counts.media || 0, color: "text-purple-400" },
    { id: "disk", label: "Disk images", icon: Disc, count: counts.diskImages || 0 },
    { id: "code", label: "Source code", icon: Code, count: counts.sourceCode || 0 },
    { id: "apps", label: "Applications", icon: Box, count: counts.applications || 0 },
    { id: "data", label: "Datasets", icon: Database, count: counts.datasets || 0 },
  ];

  return (
    <aside className="w-[230px] bg-black border-r border-zinc-900 flex flex-col justify-between p-3 shrink-0 select-none text-xs">
      <div className="space-y-4">
        {/* Profile Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors rounded-xl p-2.5 flex items-center justify-between cursor-pointer group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700/70 flex items-center justify-center text-white shrink-0 group-hover:bg-zinc-800 transition-colors">
              <HardDriveDownload className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-semibold text-zinc-100 truncate text-xs">Orveth</div>
              <div className="text-[11px] text-zinc-400 truncate">Balanced profile</div>
            </div>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        </div>

        {/* Main Navigation */}
        <nav className="space-y-0.5">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const isActive = selectedCategory === null && currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onCategoryChange(null);
                  onTabChange(item.id);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  isActive
                    ? "bg-zinc-900 border border-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-zinc-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-mono text-[11px] text-zinc-500">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Categories */}
        <div className="space-y-0.5">
          <div className="px-2.5 py-1 text-[11px] font-medium text-zinc-500">Categories</div>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(isActive ? null : cat.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  isActive
                    ? "bg-zinc-900 border border-zinc-800 text-white font-medium"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : (cat.color || "text-zinc-400")}`} />
                  <span className={isActive ? "text-white font-medium" : (cat.color ? "text-zinc-200" : "")}>{cat.label}</span>
                </div>
                {cat.count > 0 && (
                  <span className="font-mono text-[11px] text-zinc-500">{cat.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* App Section */}
        <div className="space-y-0.5">
          <div className="px-2.5 py-1 text-[11px] font-medium text-zinc-500">App</div>
          <button
            onClick={() => onTabChange("completed")}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span>History</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      <div className="space-y-2 mt-auto pt-3">
        {/* Active Engines & Network Card */}
        <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-2.5 space-y-1.5 select-none">
          <div className="flex items-center justify-between text-[10px] font-medium text-zinc-500 uppercase tracking-wider px-1">
            <span>Engines & Network</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-1">
            {/* BitTorrent Engine */}
            <div
              onClick={() => onOpenAddModal?.("torrent")}
              className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors group"
              title="Click to add BitTorrent / Magnet link"
            >
              <div className="flex items-center gap-2">
                <Magnet className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] text-zinc-300 group-hover:text-white font-medium">BitTorrent</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">BEP 3</span>
            </div>

            {/* yt-dlp Media */}
            <div
              onClick={() => onOpenAddModal?.("media")}
              className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors group"
              title="Click to inspect & download streaming media"
            >
              <div className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] text-zinc-300 group-hover:text-white font-medium">yt-dlp Media</span>
              </div>
              <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/40">Ready</span>
            </div>

            {/* Browser Bridge */}
            <div
              onClick={onOpenSettings}
              className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors group"
              title="Browser Bridge API & WebExtension host"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] text-zinc-300 group-hover:text-white font-medium">Bridge Host</span>
              </div>
              <span className="text-[10px] font-mono text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
                {bridgeEnabled ? ":41527" : "Off"}
              </span>
            </div>

            {/* Proxy / Tor */}
            <div
              onClick={onOpenSettings}
              className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-zinc-900 cursor-pointer transition-colors group"
              title="Configure Proxy or Tor routing"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-zinc-300 group-hover:text-white font-medium">Network Proxy</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40 truncate max-w-[70px]">
                {proxyUrl ? "SOCKS5" : "Direct"}
              </span>
            </div>
          </div>
        </div>

        {/* Downloads folder widget at bottom */}
      <div
        onClick={onOpenSettings}
        className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-2.5 flex items-center gap-2.5 cursor-pointer hover:border-zinc-700/80 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
          <HardDrive className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="font-medium text-zinc-300 text-xs truncate">Downloads folder</div>
          <div className="text-[10px] font-mono text-zinc-500 truncate" title={defaultDestination || "~/Downloads"}>
            {defaultDestination || "~/Downloads"}
          </div>
        </div>
      </div>
      </div>
    </aside>
  );
};
