import React, { useState, useEffect } from "react";
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
import {
  Globe,
  Shield,
  HardDrive,
  Cpu,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Compass,
  RefreshCw,
  Key,
} from "lucide-react";
import { api, YtDlpStatus, BridgeStatus } from "@/api";

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
  const [ytdlpStatus, setYtdlpStatus] = useState<YtDlpStatus | null>(null);
  const [installingYtDlp, setInstallingYtDlp] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [installingManifests, setInstallingManifests] = useState(false);
  const [manifestSuccess, setManifestSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.checkYtDlpStatus()
        .then(setYtdlpStatus)
        .catch(() => setYtdlpStatus({ available: false }));

      api.getBridgeStatus()
        .then(setBridgeStatus)
        .catch(() => setBridgeStatus(null));
    }
  }, [isOpen]);

  const handleInstallYtDlp = async () => {
    setInstallingYtDlp(true);
    try {
      const res = await api.installYtDlp();
      setYtdlpStatus(res);
      if (res.path) {
        setSettings({ ...settings, ytdlp_path: res.path });
      }
    } finally {
      setInstallingYtDlp(false);
    }
  };

  const handleInstallManifests = async () => {
    setInstallingManifests(true);
    setManifestSuccess(null);
    try {
      const paths = await api.installNativeManifests();
      setManifestSuccess(`Installed native manifests for ${paths.length} browser profiles.`);
      const updated = await api.getBridgeStatus();
      setBridgeStatus(updated);
    } catch (err: any) {
      setManifestSuccess(`Failed to install manifests: ${err?.toString() || "Unknown error"}`);
    } finally {
      setInstallingManifests(false);
    }
  };

  const handleGenerateToken = () => {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const token = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setSettings({ ...settings, bridge_token: token });
  };

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
      <DialogContent className="sm:max-w-[540px] bg-black border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
            Preferences
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure download engine behavior, network proxy, and storage paths.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <Tabs defaultValue="engine" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-secondary/50 border border-border/60">
              <TabsTrigger value="engine" className="text-xs flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                <span>Engine</span>
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Storage</span>
              </TabsTrigger>
              <TabsTrigger value="network" className="text-xs flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>Network</span>
              </TabsTrigger>
              <TabsTrigger value="bridge" className="text-xs flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>Bridge</span>
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
                  <p className="text-[10px] text-muted-foreground">Concurrent queue slots</p>
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
                  <p className="text-[10px] text-muted-foreground">Default parallel chunks</p>
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
                <p className="text-[10px] text-muted-foreground">
                  Exponential backoff with jitter on transient network errors
                </p>
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
                  <option value="rename" className="bg-black text-foreground">
                    Auto-rename (e.g. file (1).iso)
                  </option>
                  <option value="overwrite" className="bg-black text-foreground">
                    Overwrite existing file
                  </option>
                  <option value="prompt" className="bg-black text-foreground">
                    Prompt / Fail on duplicate
                  </option>
                </select>
              </div>
            </TabsContent>

            {/* Network & Proxy Tab */}
            <TabsContent value="network" className="space-y-4 pt-3">
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
                <p className="text-[10px] text-muted-foreground">
                  Limits aggregate transfer speed across all active connections
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label htmlFor="proxy-url" className="text-xs text-foreground font-medium flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Proxy & Tor Configuration</span>
                  </Label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {settings.proxy_url ? "Proxy active" : "Direct connection"}
                  </span>
                </div>

                <Input
                  id="proxy-url"
                  type="text"
                  placeholder="e.g. socks5://127.0.0.1:9050 or http://127.0.0.1:8080"
                  value={settings.proxy_url || ""}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setSettings({
                      ...settings,
                      proxy_url: val.length > 0 ? val : undefined,
                    });
                  }}
                  className="bg-secondary/40 border-border/80 text-xs font-mono"
                />

                {/* Preset shortcuts */}
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="text-zinc-500">Presets:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, proxy_url: "socks5://127.0.0.1:9050" })
                    }
                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors font-mono text-[10px]"
                  >
                    Tor (SOCKS5 9050)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, proxy_url: "http://127.0.0.1:8080" })
                    }
                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-colors font-mono text-[10px]"
                  >
                    Local HTTP (8080)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, proxy_url: undefined })
                    }
                    className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-red-300 transition-colors text-[10px]"
                  >
                    Direct (None)
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground pt-1">
                  Supports HTTP, HTTPS, and SOCKS5 (Tor). All outgoing requests and parallel segment workers will route through this proxy.
                </p>
              </div>

              {/* Media Extractor Engine Configuration */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ytdlp-path" className="text-xs text-foreground font-medium flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-purple-400" />
                    <span>Media Extractor Engine (yt-dlp)</span>
                  </Label>
                  {ytdlpStatus?.available ? (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{ytdlpStatus.version ? `v${ytdlpStatus.version}` : "Active"}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>Not detected</span>
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    id="ytdlp-path"
                    type="text"
                    placeholder="Auto-detected (~/.local/share/orveth/bin/yt-dlp or PATH)"
                    value={settings.ytdlp_path || ""}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setSettings({
                        ...settings,
                        ytdlp_path: val.length > 0 ? val : undefined,
                      });
                    }}
                    className="bg-secondary/40 border-border/80 text-xs font-mono flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={installingYtDlp}
                    onClick={handleInstallYtDlp}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white shrink-0"
                  >
                    {installingYtDlp ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        <span>Installing...</span>
                      </>
                    ) : (
                      <span>{ytdlpStatus?.available ? "Reinstall" : "Install Engine"}</span>
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Used by Orveth to probe video/audio qualities and extract direct streaming links.
                </p>
              </div>
            </TabsContent>

            {/* Browser Integration & Local Bridge Tab */}
            <TabsContent value="bridge" className="space-y-4 pt-3">
              {/* Bridge Server Status & Port */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="bridge-toggle" className="text-xs text-foreground font-medium">
                      Browser Integration Bridge
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Local loopback HTTP API allowing browser extensions to send downloads to Orveth
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {bridgeStatus?.running ? (
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Port {bridgeStatus.port}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-mono">Inactive</span>
                    )}
                    <input
                      id="bridge-toggle"
                      type="checkbox"
                      checked={settings.bridge_enabled !== false}
                      onChange={(e) =>
                        setSettings({ ...settings, bridge_enabled: e.target.checked })
                      }
                      className="rounded border-zinc-700 text-white focus:ring-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="bridge-port" className="text-xs text-muted-foreground">
                      Bridge Port (Loopback)
                    </Label>
                    <Input
                      id="bridge-port"
                      type="number"
                      min="1024"
                      max="65535"
                      value={settings.bridge_port || 41527}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bridge_port: parseInt(e.target.value, 10) || 41527,
                        })
                      }
                      className="bg-secondary/40 border-border/80 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bridge-token" className="text-xs text-muted-foreground flex items-center gap-1">
                        <Key className="w-3 h-3 text-zinc-400" />
                        <span>Security Token</span>
                      </Label>
                      <button
                        type="button"
                        onClick={handleGenerateToken}
                        className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-0.5 transition-colors"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>Generate</span>
                      </button>
                    </div>
                    <Input
                      id="bridge-token"
                      type="text"
                      placeholder="Optional (blank for direct)"
                      value={settings.bridge_token || ""}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setSettings({
                          ...settings,
                          bridge_token: val.length > 0 ? val : undefined,
                        });
                      }}
                      className="bg-secondary/40 border-border/80 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Native Messaging Manifests */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs text-foreground font-medium flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Native Messaging Hosts</span>
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Registers manifests in Chrome, Brave, Chromium, Edge, and Firefox profiles
                    </p>
                  </div>
                  {bridgeStatus?.native_hosts_installed ? (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Manifests Active</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-mono">Not installed</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={installingManifests}
                    onClick={handleInstallManifests}
                    className="text-xs bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-200 hover:text-white"
                  >
                    {installingManifests ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                        <span>Registering...</span>
                      </>
                    ) : (
                      <span>Install Browser Native Manifests</span>
                    )}
                  </Button>
                </div>

                {manifestSuccess && (
                  <p className="text-[11px] text-emerald-400 font-medium pt-1">
                    {manifestSuccess}
                  </p>
                )}
              </div>

              {/* WebExtension Guide */}
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <div className="text-xs font-medium text-white flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                  <span>Browser Extension Loading</span>
                </div>
                <p>
                  Unpacked extension located at <span className="font-mono text-zinc-300">extensions/browser/</span>.
                  Load it via <span className="font-mono text-zinc-300">chrome://extensions</span> (Developer Mode) or Firefox <span className="font-mono text-zinc-300">about:debugging</span>.
                </p>
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
