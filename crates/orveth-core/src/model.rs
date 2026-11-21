use crate::sanitize::sanitize_filename;
use crate::state::{DownloadStatus, SegmentStatus, VerificationStatus};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DownloadJob {
    pub id: Uuid,
    pub url: String,
    pub final_url: Option<String>,
    pub file_name: String,
    pub destination: PathBuf,
    pub temp_path: Option<PathBuf>,
    pub total_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub status: DownloadStatus,
    pub category: Option<String>,
    pub priority: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub retry_count: u32,
    pub retry_limit: u32,
    pub expected_hash: Option<String>,
    pub hash_algorithm: Option<String>,
    pub verification_status: VerificationStatus,
    pub segmented: bool,
    pub last_error_code: Option<String>,
    pub last_error_message: Option<String>,
}

impl DownloadJob {
    pub fn new(
        url: impl Into<String>,
        destination_dir: impl AsRef<Path>,
        custom_file_name: Option<String>,
    ) -> Self {
        let url_str = url.into();
        let name = match custom_file_name {
            Some(n) if !n.trim().is_empty() => sanitize_filename(&n),
            _ => {
                let mut chosen: Option<String> = None;
                let generic_names = [
                    "download",
                    "download.php",
                    "get",
                    "file",
                    "index.html",
                    "index.php",
                    "view",
                ];

                if let Ok(parsed) = url::Url::parse(&url_str) {
                    // Check query parameters first if present
                    for (k, v) in parsed.query_pairs() {
                        let k_lower = k.to_ascii_lowercase();
                        if ["filename", "file", "name", "fn"].contains(&k_lower.as_str())
                            && !v.trim().is_empty()
                        {
                            chosen = Some(v.into_owned());
                            break;
                        }
                    }

                    // If not found in query, inspect path segments
                    if chosen.is_none() {
                        if let Some(segments) = parsed.path_segments() {
                            let segs: Vec<&str> = segments.filter(|s| !s.is_empty()).collect();
                            if let Some(last) = segs.last() {
                                if generic_names.contains(&last.to_ascii_lowercase().as_str())
                                    && segs.len() > 1
                                {
                                    for prev in segs.iter().rev().skip(1) {
                                        if !generic_names
                                            .contains(&prev.to_ascii_lowercase().as_str())
                                            && !prev.is_empty()
                                        {
                                            chosen = Some(prev.to_string());
                                            break;
                                        }
                                    }
                                }
                                if chosen.is_none() {
                                    chosen = Some(last.to_string());
                                }
                            }
                        }
                    }
                }

                let final_name = chosen.unwrap_or_else(|| "download".to_string());
                sanitize_filename(&final_name)
            }
        };

        let dest = destination_dir.as_ref().join(&name);
        let now = Utc::now();

        Self {
            id: Uuid::new_v4(),
            url: url_str,
            final_url: None,
            file_name: name,
            destination: dest,
            temp_path: None,
            total_bytes: None,
            downloaded_bytes: 0,
            status: DownloadStatus::Queued,
            category: None,
            priority: 0,
            created_at: now,
            updated_at: now,
            completed_at: None,
            retry_count: 0,
            retry_limit: 5,
            expected_hash: None,
            hash_algorithm: None,
            verification_status: VerificationStatus::NotRequested,
            segmented: false,
            last_error_code: None,
            last_error_message: None,
        }
    }

    pub fn progress_ratio(&self) -> Option<f64> {
        self.total_bytes.map(|total| {
            if total == 0 {
                0.0
            } else {
                (self.downloaded_bytes as f64 / total as f64).min(1.0)
            }
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Segment {
    pub id: Uuid,
    pub download_id: Uuid,
    pub start_byte: u64,
    pub end_byte: u64, // inclusive
    pub received_bytes: u64,
    pub status: SegmentStatus,
    pub temp_path: PathBuf,
    pub retry_count: u32,
    pub updated_at: DateTime<Utc>,
}

impl Segment {
    pub fn new(
        download_id: Uuid,
        start_byte: u64,
        end_byte: u64,
        temp_path: impl Into<PathBuf>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            download_id,
            start_byte,
            end_byte,
            received_bytes: 0,
            status: SegmentStatus::Pending,
            temp_path: temp_path.into(),
            retry_count: 0,
            updated_at: Utc::now(),
        }
    }

    pub fn expected_length(&self) -> u64 {
        if self.end_byte >= self.start_byte {
            self.end_byte - self.start_byte + 1
        } else {
            0
        }
    }

    pub fn is_completed(&self) -> bool {
        self.status == SegmentStatus::Completed || self.received_bytes >= self.expected_length()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CollisionPolicy {
    Rename,
    Overwrite,
    Prompt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineSettings {
    pub default_destination: PathBuf,
    pub ask_destination_each_time: bool,
    pub max_active_downloads: usize,
    pub default_segment_count: usize,
    pub max_segment_count: usize,
    pub retry_limit: u32,
    pub global_bandwidth_limit_bytes_per_sec: Option<u64>,
    pub collision_policy: CollisionPolicy,
    pub theme: String,
    pub clipboard_monitoring_enabled: bool,
    pub notification_enabled: bool,
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub ytdlp_path: Option<String>,
    #[serde(default = "default_bridge_enabled")]
    pub bridge_enabled: bool,
    #[serde(default = "default_bridge_port")]
    pub bridge_port: u16,
    #[serde(default)]
    pub bridge_token: Option<String>,
}

fn default_bridge_enabled() -> bool {
    true
}

fn default_bridge_port() -> u16 {
    41527
}

impl Default for EngineSettings {
    fn default() -> Self {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let default_dest = PathBuf::from(home).join("Downloads");

        Self {
            default_destination: default_dest,
            ask_destination_each_time: false,
            max_active_downloads: 3,
            default_segment_count: 8,
            max_segment_count: 16,
            retry_limit: 5,
            global_bandwidth_limit_bytes_per_sec: None,
            collision_policy: CollisionPolicy::Rename,
            theme: "system".to_string(),
            clipboard_monitoring_enabled: false,
            notification_enabled: true,
            proxy_url: None,
            ytdlp_path: None,
            bridge_enabled: true,
            bridge_port: 41527,
            bridge_token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BridgeStatus {
    pub running: bool,
    pub port: u16,
    pub token: Option<String>,
    pub native_hosts_installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TorrentFileInfo {
    pub path: String,
    pub length: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TorrentMetadata {
    pub name: String,
    pub info_hash: String,
    pub total_length: u64,
    pub piece_length: u64,
    pub piece_count: usize,
    pub files: Vec<TorrentFileInfo>,
    pub announce_urls: Vec<String>,
    pub is_magnet: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct YtDlpStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaFormatInfo {
    pub format_id: String,
    pub ext: String,
    pub resolution: Option<String>,
    pub note: Option<String>,
    pub filesize_approx: Option<u64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub is_video: bool,
    pub is_audio: bool,
    pub direct_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MediaInspectionResult {
    pub url: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
    pub formats: Vec<MediaFormatInfo>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DownloadFilter {
    pub status: Option<DownloadStatus>,
    pub category: Option<String>,
    pub query: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_download_job_infer_filename_sourceforge() {
        let job = DownloadJob::new(
            "https://sourceforge.net/projects/ghosuto/files/ghosuto-linux-v0.1.iso/download",
            "/tmp",
            None,
        );
        assert_eq!(job.file_name, "ghosuto-linux-v0.1.iso");
    }

    #[test]
    fn test_download_job_infer_filename_query() {
        let job = DownloadJob::new(
            "https://example.com/download.php?file=archive.tar.gz",
            "/tmp",
            None,
        );
        assert_eq!(job.file_name, "archive.tar.gz");
    }

    #[test]
    fn test_download_job_custom_filename() {
        let job = DownloadJob::new(
            "https://example.com/download",
            "/tmp",
            Some("custom.iso".to_string()),
        );
        assert_eq!(job.file_name, "custom.iso");
    }
}
