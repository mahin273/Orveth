import React from "react";
import { ArrowDown, Clock, CheckCircle2, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
      return `${(bytes / 1024).toFixed(0)} KB/s`;
    }
    return `${bytes} B/s`;
  };

  return (
    <div className="grid grid-cols-4 gap-3 px-6 pt-5 pb-1">
      <Card className="bg-card border-border/80 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Active Jobs
            </span>
            <div className="text-xl font-bold font-mono tracking-tight text-foreground">
              {activeCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-foreground">
            <ArrowDown className="w-4 h-4" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/80 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              In Queue
            </span>
            <div className="text-xl font-bold font-mono tracking-tight text-foreground">
              {queuedCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/80 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Finished
            </span>
            <div className="text-xl font-bold font-mono tracking-tight text-foreground">
              {completedCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border/80 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Throughput
            </span>
            <div className="text-xl font-bold font-mono tracking-tight text-foreground">
              {formatSpeed(totalSpeedBytesPerSec)}
            </div>
          </div>
          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center text-zinc-400">
            <Activity className={`w-4 h-4 ${totalSpeedBytesPerSec > 0 ? "text-emerald-400 animate-pulse" : ""}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
