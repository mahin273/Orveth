import React from "react";
import {
  Download,
  Clock,
  CheckCircle,
  AlertCircle,
  Layers,
  Settings,
  HardDriveDownload,
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  counts: Record<string, number>;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  counts,
  onOpenSettings,
}) => {
  const navItems = [
    { id: "all", label: "All Downloads", icon: Layers, count: counts.all || 0 },
    { id: "active", label: "Active", icon: Download, count: counts.active || 0 },
    { id: "queued", label: "Queued", icon: Clock, count: counts.queued || 0 },
    { id: "completed", label: "Completed", icon: CheckCircle, count: counts.completed || 0 },
    { id: "failed", label: "Failed", icon: AlertCircle, count: counts.failed || 0 },
  ];

  return (
    <aside className="w-64 bg-slate-900/60 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0 select-none">
      <div>
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <HardDriveDownload className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-100 tracking-tight leading-none">Orveth</h1>
            <span className="text-xs text-indigo-400 font-medium">Download Engine</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      isActive ? "bg-indigo-700 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Footer */}
      <div className="pt-4 border-t border-slate-800/80">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Preferences</span>
        </button>
      </div>
    </aside>
  );
};
