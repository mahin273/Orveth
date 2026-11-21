import React, { useEffect, useState, useMemo } from "react";
import { api, DownloadJob, EngineSettings } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { OverviewCards } from "./components/OverviewCards";
import { DownloadList } from "./components/DownloadList";
import { AddDownloadDialog } from "./components/AddDownloadDialog";
import { JobDetailDrawer } from "./components/JobDetailDrawer";
import { SettingsModal } from "./components/SettingsModal";
import { HardDrive, ShieldCheck } from "lucide-react";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [settings, setSettings] = useState<EngineSettings>({
    default_destination: "~/Downloads",
    ask_destination_each_time: false,
    max_active_downloads: 3,
    default_segment_count: 4,
    max_segment_count: 16,
    retry_limit: 5,
    collision_policy: "rename",
    theme: "dark",
    clipboard_monitoring_enabled: false,
    notification_enabled: true,
  });

  const [currentTab, setCurrentTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<DownloadJob | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const fetchJobs = async () => {
    try {
      const list = await api.listDownloads();
      setJobs(list);
    } catch (e) {
      console.error("Failed fetching downloads:", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch (e) {
      console.error("Failed fetching settings:", e);
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchSettings();

    // Poll periodically for UI update sync
    const interval = setInterval(fetchJobs, 1000);

    // Listen for live engine events
    let unlisten: (() => void) | undefined;
    api.onEngineEvent((_) => {
      fetchJobs();
    }).then((unsub) => {
      unlisten = unsub;
    }).catch((e) => {
      console.error("Failed setting up event listener:", e);
    });

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, []);

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      active: jobs.filter((j) =>
        ["preparing", "downloading", "pausing", "retrying", "verifying"].includes(j.status)
      ).length,
      queued: jobs.filter((j) => j.status === "queued").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed" || j.status === "needs_attention").length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Tab filter
      if (currentTab === "active") {
        if (!["preparing", "downloading", "pausing", "retrying", "verifying"].includes(job.status)) {
          return false;
        }
      } else if (currentTab === "queued") {
        if (job.status !== "queued") return false;
      } else if (currentTab === "completed") {
        if (job.status !== "completed") return false;
      } else if (currentTab === "failed") {
        if (job.status !== "failed" && job.status !== "needs_attention") return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          job.file_name.toLowerCase().includes(q) ||
          job.url.toLowerCase().includes(q) ||
          job.destination.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [jobs, currentTab, searchQuery]);

  return (
    <div className="flex h-screen w-screen bg-black text-foreground overflow-hidden font-sans select-none antialiased">
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        counts={counts}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-black">
        <Toolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenAddModal={() => setIsAddModalOpen(true)}
          bandwidthCap={settings.global_bandwidth_limit_bytes_per_sec}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />

        <OverviewCards
          activeCount={counts.active}
          queuedCount={counts.queued}
          completedCount={counts.completed}
          totalSpeedBytesPerSec={0}
        />

        <div className="flex-1 flex min-h-0 bg-black">
          <DownloadList
            jobs={filteredJobs}
            onPause={(id) => api.pauseDownload(id)}
            onResume={(id) => api.resumeDownload(id)}
            onRetry={(id) => api.retryDownload(id)}
            onCancel={(id) => api.cancelDownload(id, true)}
            onOpen={(id) => api.openFile(id)}
            onReveal={(id) => api.revealFile(id)}
            onSelectJob={(j) => setSelectedJob(j)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />

          {selectedJob && (
            <JobDetailDrawer
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              onRetry={(id) => api.retryDownload(id)}
            />
          )}
        </div>

        {/* Minimalist bottom status bar */}
        <footer className="h-6 border-t border-border bg-black px-4 flex items-center justify-between text-[11px] font-mono text-muted-foreground shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Engine Online</span>
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-zinc-500" />
              <span className="truncate max-w-[200px]">{settings.default_destination}</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-zinc-500" />
              <span>SHA-256 Enabled</span>
            </span>
            <span className="text-border">|</span>
            <span>Orveth v0.1.0</span>
          </div>
        </footer>
      </div>

      <AddDownloadDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultDestination={settings.default_destination}
        onAdd={async (url, dest, filename, hash) => {
          await api.addDownload(url, dest, filename, hash);
          await fetchJobs();
        }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSave={async (newSettings) => {
          await api.updateSettings(newSettings);
          setSettings(newSettings);
        }}
      />
    </div>
  );
};

export default App;
