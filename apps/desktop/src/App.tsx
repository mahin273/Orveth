import React, { useEffect, useState, useMemo } from "react";
import { api, DownloadJob, EngineSettings } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { OverviewCards } from "./components/OverviewCards";
import { DownloadList } from "./components/DownloadList";
import { AddDownloadDialog } from "./components/AddDownloadDialog";
import { JobDetailDrawer } from "./components/JobDetailDrawer";
import { SettingsModal } from "./components/SettingsModal";

export const App: React.FC = () => {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [settings, setSettings] = useState<EngineSettings>({
    default_destination: "~/Downloads",
    ask_destination_each_time: false,
    max_active_downloads: 3,
    default_segment_count: 8,
    max_segment_count: 16,
    retry_limit: 5,
    collision_policy: "rename",
    theme: "dark",
    clipboard_monitoring_enabled: false,
    notification_enabled: true,
  });

  const [currentTab, setCurrentTab] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<DownloadJob | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Live speed tracking
  const [speedsById, setSpeedsById] = useState<Record<string, number>>({});
  const [peakSpeedsById, setPeakSpeedsById] = useState<Record<string, number>>({});
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const lastSpeedEventTimeRef = React.useRef<Record<string, number>>({});

  const prevBytesRef = React.useRef<{ time: number; bytesById: Record<string, number> }>({
    time: Date.now(),
    bytesById: {},
  });

  const fetchJobs = async () => {
    try {
      const list = await api.listDownloads();
      setJobs(list);

      // Compute fallback speed from polling delta
      const now = Date.now();
      const prev = prevBytesRef.current;
      const elapsedSec = Math.max(0.5, (now - prev.time) / 1000);
      list.forEach((job) => {
        const prevBytes = prev.bytesById[job.id] ?? job.downloaded_bytes;
        const deltaBytes = Math.max(0, job.downloaded_bytes - prevBytes);
        const polledSpeed = Math.round(deltaBytes / elapsedSec);
        if (["downloading", "retrying"].includes(job.status)) {
          const lastEventTime = lastSpeedEventTimeRef.current[job.id] || 0;
          const isEventFresh = now - lastEventTime < 2000;
          setSpeedsById((prevSpeeds) => {
            const currentSpeed = prevSpeeds[job.id] || 0;
            const effectiveSpeed = isEventFresh && currentSpeed > 0 ? currentSpeed : polledSpeed;
            return { ...prevSpeeds, [job.id]: effectiveSpeed };
          });
          const maxSpeed = Math.max(polledSpeed, isEventFresh ? (speedsById[job.id] || 0) : 0);
          if (maxSpeed > 0) {
            setPeakSpeedsById((prev) => ({
              ...prev,
              [job.id]: Math.max(prev[job.id] || 0, maxSpeed),
            }));
          }
        } else {
          setSpeedsById((prevSpeeds) => {
            if (prevSpeeds[job.id]) {
              const copy = { ...prevSpeeds };
              delete copy[job.id];
              return copy;
            }
            return prevSpeeds;
          });
        }
      });
      prevBytesRef.current = {
        time: now,
        bytesById: Object.fromEntries(list.map((j) => [j.id, j.downloaded_bytes])),
      };
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

    const interval = setInterval(fetchJobs, 2000);

    let unlisten: (() => void) | undefined;
    api
      .onEngineEvent((event: any) => {
        const type = event.event_type;
        const payload = event.payload;

        if (type === "download_progress") {
          setJobs((prevJobs) =>
            prevJobs.map((j) =>
              j.id === payload.download_id
                ? {
                    ...j,
                    downloaded_bytes: payload.downloaded_bytes,
                    total_bytes: payload.total_bytes ?? j.total_bytes,
                  }
                : j
            )
          );
        } else if (type === "download_speed") {
          const speed = payload.bytes_per_sec;
          lastSpeedEventTimeRef.current[payload.download_id] = Date.now();
          setSpeedsById((prev) => ({
            ...prev,
            [payload.download_id]: speed,
          }));
          setPeakSpeedsById((prev) => ({
            ...prev,
            [payload.download_id]: Math.max(prev[payload.download_id] || 0, speed),
          }));
        } else if (
          type === "download_state_changed" ||
          type === "download_completed" ||
          type === "download_failed" ||
          type === "queue_changed"
        ) {
          if (payload?.new_status && ["paused", "completed", "failed"].includes(payload.new_status)) {
            setSpeedsById((prev) => ({ ...prev, [payload.download_id]: 0 }));
          }
          fetchJobs();
        }
      })
      .then((unsub) => {
        unlisten = unsub;
      })
      .catch((e) => {
        console.error("Failed setting up event listener:", e);
      });

    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, []);

  // Compute total real-time download speed
  const totalSpeed = useMemo(() => {
    let sum = 0;
    jobs.forEach((j) => {
      if (["downloading", "retrying"].includes(j.status)) {
        sum += speedsById[j.id] || 0;
      }
    });
    return sum;
  }, [jobs, speedsById]);

  // Sample speed history every 500ms without getting reset by rapid speed updates
  const totalSpeedRef = React.useRef(totalSpeed);
  totalSpeedRef.current = totalSpeed;

  useEffect(() => {
    const timer = setInterval(() => {
      const mbps = +(totalSpeedRef.current / (1024 * 1024)).toFixed(1);
      setSpeedHistory((prev) => [...prev.slice(-59), mbps]);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut Ctrl+K to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder="Search downloads"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Compute counts
  const counts = useMemo(() => {
    const isDisk = (n: string) => /\.(iso|img)$/i.test(n);
    const isCode = (n: string) => /\.(tar\.[a-z0-9]+|zip|gz|xz|zst|rs|py|c|cpp|js|ts)$/i.test(n);
    const isApp = (n: string) => /\.(appimage|deb|rpm|exe|flatpakref)$/i.test(n);
    const isData = (n: string) => /\.(csv|parquet|zst|bin|dat|sqlite|json)$/i.test(n);

    return {
      all: jobs.length,
      active: jobs.filter((j) =>
        ["preparing", "downloading", "pausing", "retrying", "verifying"].includes(j.status)
      ).length,
      downloading: jobs.filter((j) => j.status === "downloading").length,
      retrying: jobs.filter((j) => j.status === "retrying").length,
      queued: jobs.filter((j) => j.status === "queued").length,
      completed: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed" || j.status === "needs_attention").length,
      diskImages: jobs.filter((j) => isDisk(j.file_name)).length,
      sourceCode: jobs.filter((j) => isCode(j.file_name)).length,
      applications: jobs.filter((j) => isApp(j.file_name)).length,
      datasets: jobs.filter((j) => isData(j.file_name)).length,
    };
  }, [jobs]);

  // Compute left to download
  const { leftToDownloadBytes, unfinishedCount, nextQueuedFileName } = useMemo(() => {
    const unfinished = jobs.filter((j) => j.status !== "completed");
    const bytes = unfinished.reduce((acc, j) => {
      const total = j.total_bytes || 0;
      return acc + Math.max(0, total - j.downloaded_bytes);
    }, 0);
    const nextQueued = jobs.find((j) => j.status === "queued")?.file_name;
    return {
      leftToDownloadBytes: bytes,
      unfinishedCount: unfinished.length,
      nextQueuedFileName: nextQueued,
    };
  }, [jobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Category filter
      if (selectedCategory === "disk" && !/\.(iso|img)$/i.test(job.file_name)) return false;
      if (selectedCategory === "code" && !/\.(tar\.[a-z0-9]+|zip|gz|xz|zst|rs|py|c|cpp|js|ts)$/i.test(job.file_name)) return false;
      if (selectedCategory === "apps" && !/\.(appimage|deb|rpm|exe|flatpakref)$/i.test(job.file_name)) return false;
      if (selectedCategory === "data" && !/\.(csv|parquet|zst|bin|dat|sqlite|json)$/i.test(job.file_name)) return false;

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
  }, [jobs, currentTab, selectedCategory, searchQuery]);

  // Auto-select first job if none selected and jobs exist
  useEffect(() => {
    if (selectedJob) {
      const fresh = filteredJobs.find((j) => j.id === selectedJob.id);
      if (fresh) {
        setSelectedJob(fresh);
      } else if (filteredJobs.length > 0) {
        setSelectedJob(filteredJobs[0]);
      } else {
        setSelectedJob(null);
      }
    } else if (filteredJobs.length > 0) {
      setSelectedJob(filteredJobs[0]);
    }
  }, [filteredJobs]);

  // Toggle pause all
  const isAllPaused = counts.downloading === 0 && counts.active > 0;
  const handleTogglePauseAll = async () => {
    const activeJobs = jobs.filter((j) =>
      ["downloading", "preparing", "retrying"].includes(j.status)
    );
    const pausedJobs = jobs.filter((j) => j.status === "paused");

    if (activeJobs.length > 0) {
      for (const j of activeJobs) {
        await api.pauseDownload(j.id);
      }
    } else if (pausedJobs.length > 0) {
      for (const j of pausedJobs) {
        await api.resumeDownload(j.id);
      }
    }
    await fetchJobs();
  };

  const handleDelete = async (id: string) => {
    try {
      await api.cancelDownload(id, true);
    } catch {
      // Ignored if already canceled/finished
    }
    try {
      await api.removeDownload(id, true);
    } catch (e) {
      console.error("Failed to remove download:", e);
    }
    if (selectedJob?.id === id) {
      setSelectedJob(null);
    }
    await fetchJobs();
  };

  const handleSetPriority = async (id: string, priority: number) => {
    try {
      await api.setJobPriority(id, priority);
      await fetchJobs();
    } catch (e) {
      console.error("Failed to update priority:", e);
    }
  };

  const handleBatchPause = async (ids: string[]) => {
    for (const id of ids) {
      await api.pauseDownload(id);
    }
    await fetchJobs();
  };

  const handleBatchResume = async (ids: string[]) => {
    for (const id of ids) {
      await api.resumeDownload(id);
    }
    await fetchJobs();
  };

  const handleBatchDelete = async (ids: string[]) => {
    for (const id of ids) {
      try {
        await api.cancelDownload(id, true);
      } catch {}
      try {
        await api.removeDownload(id, true);
      } catch {}
    }
    if (selectedJob && ids.includes(selectedJob.id)) {
      setSelectedJob(null);
    }
    await fetchJobs();
  };

  const handleBatchSetPriority = async (ids: string[], priority: number) => {
    for (const id of ids) {
      try {
        await api.setJobPriority(id, priority);
      } catch (e) {
        console.error("Failed to set priority:", e);
      }
    }
    await fetchJobs();
  };

  const breadcrumb = useMemo(() => {
    if (selectedCategory) {
      const catMap: Record<string, string> = {
        disk: "Disk images",
        code: "Source code",
        apps: "Applications",
        data: "Datasets",
      };
      return `Categories / ${catMap[selectedCategory] || selectedCategory}`;
    }
    const tabMap: Record<string, string> = {
      all: "All downloads",
      active: "Active",
      queued: "Queued",
      completed: "Completed",
      failed: "Failed",
      overview: "Overview",
    };
    return tabMap[currentTab] || "All downloads";
  }, [selectedCategory, currentTab]);

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-foreground overflow-hidden font-sans select-none antialiased">
      {/* 3-Column Workspace Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 1. Left Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          defaultDestination={settings.default_destination}
          counts={counts}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />

        {/* 2. Middle Main Panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-black">
          <Toolbar
            breadcrumb={breadcrumb}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            isAllPaused={isAllPaused}
            onTogglePauseAll={handleTogglePauseAll}
          />

          <OverviewCards
            activeCount={counts.active}
            downloadingCount={counts.downloading}
            retryingCount={counts.retrying}
            queuedCount={counts.queued}
            nextQueuedFileName={nextQueuedFileName}
            totalSpeedBytesPerSec={totalSpeed}
            bandwidthCap={settings.global_bandwidth_limit_bytes_per_sec}
            leftToDownloadBytes={leftToDownloadBytes}
            unfinishedCount={unfinishedCount}
            speedHistory={speedHistory}
          />

          <DownloadList
            jobs={filteredJobs}
            selectedJobId={selectedJob?.id || null}
            onSelectJob={(j) => setSelectedJob(j)}
            onPause={(id) => api.pauseDownload(id)}
            onResume={(id) => api.resumeDownload(id)}
            onRetry={(id) => api.retryDownload(id)}
            onCancel={(id) => api.cancelDownload(id, true)}
            onDelete={handleDelete}
            onOpen={(id) => api.openFile(id)}
            onReveal={(id) => api.revealFile(id)}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            activeFilter={currentTab}
            onFilterChange={setCurrentTab}
            counts={counts}
            speedsById={speedsById}
            onSetPriority={handleSetPriority}
            onBatchPause={handleBatchPause}
            onBatchResume={handleBatchResume}
            onBatchDelete={handleBatchDelete}
            onBatchSetPriority={handleBatchSetPriority}
          />
        </div>

        {/* 3. Right Inspector / Detail Panel */}
        {selectedJob && (
          <JobDetailDrawer
            job={selectedJob}
            onClose={() => setSelectedJob(null)}
            onPause={(id) => api.pauseDownload(id)}
            onResume={(id) => api.resumeDownload(id)}
            onDelete={handleDelete}
            onOpen={(id) => api.openFile(id)}
            onReveal={(id) => api.revealFile(id)}
            onSetPriority={handleSetPriority}
            speedBytesPerSec={speedsById[selectedJob.id] || 0}
            peakSpeedBytesPerSec={peakSpeedsById[selectedJob.id] || speedsById[selectedJob.id] || 0}
            speedHistory={speedHistory}
          />
        )}
      </div>

      {/* Persistent Bottom Status Bar */}
      <footer className="h-7 border-t border-zinc-900 bg-black px-4 flex items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-sans text-xs">Engine running</span>
          </span>
          <span className="text-zinc-400">
            ↓ {(totalSpeed / (1024 * 1024)).toFixed(1)} MB/s
          </span>
          <span>
            {settings.global_bandwidth_limit_bytes_per_sec
              ? `Limit: ${(settings.global_bandwidth_limit_bytes_per_sec / 1024 / 1024).toFixed(1)} MB/s`
              : "Global limit off"}
          </span>
          <span>
            {settings.default_segment_count} segments per file by default, up to {settings.max_segment_count}
          </span>
          {settings.proxy_url && (
            <span className="text-amber-400 font-mono text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              Proxy: {settings.proxy_url.replace(/:[^:@]+@/, ":***@")}
            </span>
          )}
          {settings.bridge_enabled !== false && (
            <span className="text-blue-400 font-mono text-[10px] bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
              Bridge: :{settings.bridge_port || 41527}
            </span>
          )}
        </div>

        <div className="text-zinc-500">
          Orveth 0.2.4
        </div>
      </footer>

      {/* Add Download Modal */}
      <AddDownloadDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        defaultDestination={settings.default_destination}
        onAdd={async (url, dest, filename, hash) => {
          await api.addDownload(url, dest, filename, hash);
          await fetchJobs();
        }}
        onAddBatch={async (urls, dest) => {
          await api.addDownloadsBatch(urls, dest);
          await fetchJobs();
        }}
      />

      {/* Settings Preferences Modal */}
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
