import React, { useState } from "react";
import { EngineSettings } from "../api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EngineSettings;
  onSave: (settings: EngineSettings) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings: initialSettings,
  onSave,
}) => {
  const [settings, setSettings] = useState<EngineSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(settings);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px] bg-black border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
            Preferences
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure download engine behavior, network limits, and directory options.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <Tabs defaultValue="engine" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50 border border-border/60">
              <TabsTrigger value="engine" className="text-xs">
                Engine & Concurrency
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs">
                Storage & Bandwidth
              </TabsTrigger>
            </TabsList>

            {/* Engine Tab */}
            <TabsContent value="engine" className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="max-active" className="text-xs text-muted-foreground">
                    Max Active Downloads
                  </Label>
                  <Input
                    id="max-active"
                    type="number"
                    min="1"
                    max="10"
                    value={settings.max_active_downloads}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        max_active_downloads: parseInt(e.target.value) || 1,
                      })
                    }
                    className="bg-secondary/40 border-border/80 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Simultaneous downloading tasks</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="segment-count" className="text-xs text-muted-foreground">
                    Segments per Job
                  </Label>
                  <Input
                    id="segment-count"
                    type="number"
                    min="1"
                    max="16"
                    value={settings.default_segment_count}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        default_segment_count: parseInt(e.target.value) || 1,
                      })
                    }
                    className="bg-secondary/40 border-border/80 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Parallel chunk connections</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="retry-limit" className="text-xs text-muted-foreground">
                  Automatic Retry Attempts
                </Label>
                <Input
                  id="retry-limit"
                  type="number"
                  min="0"
                  max="20"
                  value={settings.retry_limit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      retry_limit: parseInt(e.target.value) || 0,
                    })
                  }
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />
              </div>
            </TabsContent>

            {/* Storage Tab */}
            <TabsContent value="storage" className="space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="default-dest" className="text-xs text-muted-foreground">
                  Default Destination Directory
                </Label>
                <Input
                  id="default-dest"
                  type="text"
                  value={settings.default_destination}
                  onChange={(e) =>
                    setSettings({ ...settings, default_destination: e.target.value })
                  }
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collision" className="text-xs text-muted-foreground">
                  Filename Collision Policy
                </Label>
                <select
                  id="collision"
                  value={settings.collision_policy}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      collision_policy: e.target.value as "rename" | "overwrite" | "prompt",
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-border/80 bg-secondary/40 px-3 py-1 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="rename" className="bg-black text-foreground">Auto-rename (e.g. file (1).iso)</option>
                  <option value="overwrite" className="bg-black text-foreground">Overwrite existing file</option>
                  <option value="prompt" className="bg-black text-foreground">Prompt / Fail on duplicate</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bandwidth-limit" className="text-xs text-muted-foreground">
                  Global Bandwidth Cap (KB/s, 0 for unlimited)
                </Label>
                <Input
                  id="bandwidth-limit"
                  type="number"
                  min="0"
                  step="100"
                  value={
                    settings.global_bandwidth_limit_bytes_per_sec
                      ? Math.round(settings.global_bandwidth_limit_bytes_per_sec / 1024)
                      : 0
                  }
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setSettings({
                      ...settings,
                      global_bandwidth_limit_bytes_per_sec: val > 0 ? val * 1024 : undefined,
                    });
                  }}
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-border/80 bg-secondary/20 hover:bg-secondary/50 text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="text-xs bg-white text-black hover:bg-zinc-200"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
