use crate::state::{DownloadStatus, SegmentStatus, VerificationStatus};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "payload", rename_all = "snake_case")]
pub enum EngineEvent {
    DownloadStateChanged {
        download_id: Uuid,
        previous_status: DownloadStatus,
        new_status: DownloadStatus,
        timestamp: DateTime<Utc>,
    },
    DownloadProgress {
        download_id: Uuid,
        downloaded_bytes: u64,
        total_bytes: Option<u64>,
        progress_ratio: Option<f64>,
    },
    DownloadSpeed {
        download_id: Uuid,
        bytes_per_sec: u64,
        eta_seconds: Option<u64>,
    },
    SegmentStateChanged {
        download_id: Uuid,
        segment_id: Uuid,
        status: SegmentStatus,
        received_bytes: u64,
        expected_bytes: u64,
    },
    DownloadCompleted {
        download_id: Uuid,
        file_name: String,
        destination_path: String,
        total_bytes: u64,
    },
    DownloadFailed {
        download_id: Uuid,
        error_code: String,
        error_message: String,
        retryable: bool,
    },
    VerificationStateChanged {
        download_id: Uuid,
        status: VerificationStatus,
        computed_hash: Option<String>,
        expected_hash: Option<String>,
    },
    QueueChanged {
        active_count: usize,
        queued_count: usize,
        completed_count: usize,
    },
    EngineStatusChanged {
        is_running: bool,
        global_bandwidth_limit: Option<u64>,
    },
}
