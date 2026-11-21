import React from "react";
import {
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Layers,
  Settings,
  HardDriveDownload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
    { id: "completed", label: "Completed", icon: CheckCircle2, count: counts.completed || 0 },
    { id: "failed", label: "Failed", icon: AlertCircle, count: counts.failed || 0 },
  ];

  return (
    <aside className="w-60 bg-black border-r border-border flex flex-col justify-between p-3 shrink-0 select-none">
      <div className="space-y-4">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-md bg-white text-black flex items-center justify-center font-bold shadow-sm">
            <HardDriveDownload className="w-4 h-4 text-black" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm tracking-tight text-foreground">Orveth</span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Engine</span>
          </div>
        </div>

        <Separator className="bg-border/60" />

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className={`h-5 px-1.5 text-[11px] font-mono font-medium ${
                      isActive ? "bg-white text-black hover:bg-white" : ""
                    }`}
                  >
                    {item.count}
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Settings Footer */}
      <div className="space-y-2 pt-2 border-t border-border/60">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          className="w-full justify-start text-xs text-muted-foreground hover:text-foreground px-3 h-9"
        >
          <Settings className="w-4 h-4 mr-2.5 text-muted-foreground" />
          <span>Preferences</span>
        </Button>
      </div>
    </aside>
  );
};
