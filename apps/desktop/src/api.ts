import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export type DownloadStatus =
  | "queued"
  | "preparing"
  | "downloading"
  | "pausing"
  | "paused"
  | "retrying"
  | "verifying"
  | "completed"
  | "failed"
  | "canceled"
  | "needs_attention";

export type VerificationStatus =
  | "not_requested"
  | "calculated"
  | "matched"
  | "mismatch"
  | "error";

export interface Segment {
  id: string;
  download_id: string;
  start_byte: number;
  end_byte: number;
  received_bytes: number;
  status: "pending" | "downloading" | "paused" | "retrying" | "completed" | "failed";
  retry_count: number;
  updated_at: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  final_url?: string;
  file_name: string;
  destination: string;
  temp_path?: string;
  total_bytes?: number;
  downloaded_bytes: number;
  status: DownloadStatus;
  category?: string;
  priority: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  retry_count: number;
  retry_limit: number;
  expected_hash?: string;
  hash_algorithm?: string;
  verification_status: VerificationStatus;
  segmented: boolean;
  last_error_code?: string;
  last_error_message?: string;
}

export interface EngineSettings {
  default_destination: string;
  ask_destination_each_time: boolean;
  max_active_downloads: number;
  default_segment_count: number;
  max_segment_count: number;
  retry_limit: number;
  global_bandwidth_limit_bytes_per_sec?: number;
  collision_policy: "rename" | "overwrite" | "prompt";
  theme: string;
  clipboard_monitoring_enabled: boolean;
  notification_enabled: boolean;
  proxy_url?: string;
  ytdlp_path?: string;
  bridge_enabled?: boolean;
  bridge_port?: number;
  bridge_token?: string;
}

export interface BridgeStatus {
  running: boolean;
  port: number;
  token?: string;
  native_hosts_installed: boolean;
}

export interface YtDlpStatus {
  available: boolean;
  path?: string;
  version?: string;
}

export interface MediaFormatInfo {
  format_id: string;
  ext: string;
  resolution?: string;
  note?: string;
  filesize_approx?: number;
  vcodec?: string;
  acodec?: string;
  is_video: boolean;
  is_audio: boolean;
  direct_url?: string;
}

export interface MediaInspectionResult {
  url: string;
  title: string;
  uploader?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  formats: MediaFormatInfo[];
}

export interface TorrentFileInfo {
  path: string;
  length: number;
}

export interface TorrentMetadata {
  name: string;
  info_hash: string;
  total_length: number;
  piece_length: number;
  piece_count: number;
  files: TorrentFileInfo[];
  announce_urls: string[];
  is_magnet: boolean;
}

export interface DownloadFilter {
  status?: DownloadStatus;
  category?: string;
  query?: string;
}

export const api = {
  async addDownload(
    url: string,
    destinationDir?: string,
    customFileName?: string,
    expectedHash?: string
  ): Promise<DownloadJob> {
    return invoke("add_download", {
      url,
      destinationDir,
      customFileName,
      expectedHash,
    });
  },

  async addDownloadsBatch(
    urls: string[],
    destinationDir?: string
  ): Promise<DownloadJob[]> {
    return invoke("add_downloads_batch", { urls, destinationDir });
  },

  async setJobPriority(id: string, priority: number): Promise<void> {
    return invoke("set_job_priority", { id, priority });
  },

  async pauseDownload(id: string): Promise<void> {
    return invoke("pause_download", { id });
  },

  async resumeDownload(id: string): Promise<void> {
    return invoke("resume_download", { id });
  },

  async cancelDownload(id: string, deletePartial: boolean): Promise<void> {
    return invoke("cancel_download", { id, deletePartial });
  },

  async retryDownload(id: string): Promise<void> {
    return invoke("retry_download", { id });
  },

  async removeDownload(id: string, removeFile: boolean): Promise<void> {
    return invoke("remove_download", { id, removeFile });
  },

  async listDownloads(filter?: DownloadFilter): Promise<DownloadJob[]> {
    return invoke("list_downloads", { filter: filter || {} });
  },

  async getDownload(id: string): Promise<DownloadJob> {
    return invoke("get_download", { id });
  },

  async getSegments(id: string): Promise<Segment[]> {
    return invoke("get_segments", { id });
  },

  async getSettings(): Promise<EngineSettings> {
    return invoke("get_settings");
  },

  async updateSettings(settings: EngineSettings): Promise<void> {
    return invoke("update_settings", { settings });
  },

  async setGlobalBandwidthLimit(limit?: number): Promise<void> {
    return invoke("set_global_bandwidth_limit", { limitBytesPerSec: limit || null });
  },

  async openFile(id: string): Promise<void> {
    return invoke("open_file", { id });
  },

  async revealFile(id: string): Promise<void> {
    return invoke("reveal_file", { id });
  },

  async checkYtDlpStatus(): Promise<YtDlpStatus> {
    return invoke("check_ytdlp_status");
  },

  async installYtDlp(): Promise<YtDlpStatus> {
    return invoke("install_ytdlp");
  },

  async inspectMedia(url: string): Promise<MediaInspectionResult> {
    return invoke("inspect_media", { url });
  },

  async resolveMediaStream(url: string, formatId: string): Promise<string> {
    return invoke("resolve_media_stream", { url, formatId });
  },

  async getBridgeStatus(): Promise<BridgeStatus> {
    return invoke("get_bridge_status");
  },

  async installNativeManifests(): Promise<string[]> {
    return invoke("install_native_manifests");
  },

  async inspectTorrent(bytes: number[]): Promise<TorrentMetadata> {
    return invoke("inspect_torrent", { bytes });
  },

  async inspectMagnet(uri: string): Promise<TorrentMetadata> {
    return invoke("inspect_magnet", { uri });
  },

  async onEngineEvent(cb: (event: any) => void): Promise<UnlistenFn> {
    return listen("engine_event", (e) => cb(e.payload));
  },
};
