use crate::bridge::LocalBridgeServer;
use crate::limiter::BandwidthLimiter;
use crate::queue::QueueManager;
use orveth_core::error::{OrvethError, Result};
use orveth_core::event::EngineEvent;
use orveth_core::model::{
    BridgeStatus, DownloadFilter, DownloadJob, EngineSettings, MediaInspectionResult, Segment,
    TorrentMetadata, YtDlpStatus,
};
use orveth_core::state::{DownloadStatus, VerificationStatus};
use orveth_download::{
    AnnounceParams, MediaExtractor, TorrentParser, TrackerClient, TrackerResponse,
};
use orveth_integrity::FileHasher;
use orveth_persistence::{
    init_db_pool, DbPool, JobRepository, SegmentRepository, SettingsRepository, StateReconciler,
};
use orveth_storage::StorageManager;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct OrvethEngine {
    pool: DbPool,
    storage: StorageManager,
    queue: Arc<QueueManager>,
    limiter: BandwidthLimiter,
    event_sender: broadcast::Sender<EngineEvent>,
    bridge_server: Arc<Mutex<Option<LocalBridgeServer>>>,
}

impl OrvethEngine {
    pub async fn init(db_path: impl AsRef<Path>, temp_dir: impl AsRef<Path>) -> Result<Self> {
        let pool = init_db_pool(db_path).await?;
        let storage = StorageManager::new(temp_dir.as_ref());

        // Startup recovery & reconciliation
        let reconciled = StateReconciler::reconcile_on_startup(&pool, &storage).await?;
        info!(
            reconciled_jobs = reconciled,
            "Startup state reconciliation finished"
        );

        let settings = SettingsRepository::get_settings(&pool).await?;
        let limiter = BandwidthLimiter::new(settings.global_bandwidth_limit_bytes_per_sec);

        let (event_sender, _) = broadcast::channel(2048);
        let queue = Arc::new(QueueManager::new(
            pool.clone(),
            storage.clone(),
            limiter.clone(),
            event_sender.clone(),
        ));

        // Start processing any queued jobs from previous run
        queue.pump_queue().await?;

        let bridge_server = Arc::new(Mutex::new(None));
        let engine = Self {
            pool,
            storage,
            queue,
            limiter,
            event_sender,
            bridge_server,
        };

        if settings.bridge_enabled {
            if let Ok(server) = LocalBridgeServer::start(
                engine.clone(),
                settings.bridge_port,
                settings.bridge_token.clone(),
            )
            .await
            {
                *engine.bridge_server.lock().await = Some(server);
            }
        }

        Ok(engine)
    }

    pub fn storage(&self) -> &StorageManager {
        &self.storage
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.event_sender.subscribe()
    }

    pub async fn add_download(
        &self,
        url: impl Into<String>,
        destination_dir: Option<PathBuf>,
        custom_file_name: Option<String>,
        expected_hash: Option<String>,
    ) -> Result<DownloadJob> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let dest_dir = destination_dir.unwrap_or(settings.default_destination);

        let mut job = DownloadJob::new(url, dest_dir, custom_file_name);
        if let Some(hash) = expected_hash {
            job.expected_hash = Some(hash);
            job.hash_algorithm = Some("SHA-256".to_string());
        }

        JobRepository::insert(&self.pool, &job).await?;
        self.queue.pump_queue().await?;
        Ok(job)
    }

    pub async fn add_downloads_batch(
        &self,
        urls: Vec<String>,
        destination_dir: Option<PathBuf>,
    ) -> Result<Vec<DownloadJob>> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let dest_dir = destination_dir.unwrap_or(settings.default_destination);

        let mut jobs = Vec::new();
        for url in urls {
            let trimmed = url.trim();
            if trimmed.is_empty() {
                continue;
            }
            let job = DownloadJob::new(trimmed, &dest_dir, None);
            if let Ok(()) = JobRepository::insert(&self.pool, &job).await {
                jobs.push(job);
            }
        }
        self.queue.pump_queue().await?;
        Ok(jobs)
    }

    pub async fn set_job_priority(&self, id: Uuid, priority: i32) -> Result<()> {
        JobRepository::update_priority(&self.pool, id, priority).await?;
        self.queue.pump_queue().await?;
        Ok(())
    }

    pub async fn pause_download(&self, id: Uuid) -> Result<()> {
        self.queue.pause_job(id).await
    }

    pub async fn resume_download(&self, id: Uuid) -> Result<()> {
        self.queue.resume_job(id).await
    }

    pub async fn cancel_download(&self, id: Uuid, delete_partial: bool) -> Result<()> {
        self.queue.cancel_job(id, delete_partial).await
    }

    pub async fn retry_download(&self, id: Uuid) -> Result<()> {
        JobRepository::update_status(&self.pool, id, DownloadStatus::Queued).await?;
        self.queue.pump_queue().await
    }

    pub async fn remove_download(&self, id: Uuid, remove_file: bool) -> Result<()> {
        let job_opt = JobRepository::get(&self.pool, id).await?;
        if let Some(job) = job_opt {
            self.queue.cancel_job(id, true).await?;
            if remove_file && job.destination.exists() {
                let _ = tokio::fs::remove_file(&job.destination).await;
            }
            JobRepository::delete(&self.pool, id).await?;
        }
        Ok(())
    }

    pub async fn list_downloads(&self, filter: &DownloadFilter) -> Result<Vec<DownloadJob>> {
        JobRepository::list(&self.pool, filter).await
    }

    pub async fn get_download(&self, id: Uuid) -> Result<DownloadJob> {
        JobRepository::get(&self.pool, id)
            .await?
            .ok_or_else(|| OrvethError::JobNotFound(id.to_string()))
    }

    pub async fn get_segments(&self, id: Uuid) -> Result<Vec<Segment>> {
        SegmentRepository::get_for_job(&self.pool, id).await
    }

    pub async fn get_settings(&self) -> Result<EngineSettings> {
        SettingsRepository::get_settings(&self.pool).await
    }

    pub async fn update_settings(&self, settings: &EngineSettings) -> Result<()> {
        SettingsRepository::save_settings(&self.pool, settings).await?;
        self.limiter
            .set_limit(settings.global_bandwidth_limit_bytes_per_sec);
        self.queue.pump_queue().await?;

        // Synchronize local bridge server state
        let mut server_guard = self.bridge_server.lock().await;
        if !settings.bridge_enabled {
            if let Some(s) = server_guard.take() {
                s.stop();
            }
        } else {
            let needs_restart = match server_guard.as_ref() {
                Some(s) => s.port() != settings.bridge_port,
                None => true,
            };
            if needs_restart {
                if let Some(s) = server_guard.take() {
                    s.stop();
                }
                if let Ok(s) = LocalBridgeServer::start(
                    self.clone(),
                    settings.bridge_port,
                    settings.bridge_token.clone(),
                )
                .await
                {
                    *server_guard = Some(s);
                }
            }
        }

        Ok(())
    }

    pub async fn set_global_bandwidth_limit(&self, limit_bytes_per_sec: Option<u64>) -> Result<()> {
        let mut settings = SettingsRepository::get_settings(&self.pool).await?;
        settings.global_bandwidth_limit_bytes_per_sec = limit_bytes_per_sec;
        SettingsRepository::save_settings(&self.pool, &settings).await?;
        self.limiter.set_limit(limit_bytes_per_sec);
        let _ = self.event_sender.send(EngineEvent::EngineStatusChanged {
            is_running: true,
            global_bandwidth_limit: limit_bytes_per_sec,
        });
        Ok(())
    }

    pub async fn verify_download(
        &self,
        id: Uuid,
        expected_hash: Option<String>,
    ) -> Result<VerificationStatus> {
        let job = self.get_download(id).await?;
        if !job.destination.exists() {
            return Err(OrvethError::Storage(
                "Target file does not exist".to_string(),
            ));
        }

        let hash_to_check = expected_hash.as_deref().or(job.expected_hash.as_deref());
        let outcome = FileHasher::verify_sha256(&job.destination, hash_to_check).await?;

        let _ = self
            .event_sender
            .send(EngineEvent::VerificationStateChanged {
                download_id: id,
                status: outcome.status,
                computed_hash: Some(outcome.computed_hash),
                expected_hash: outcome.expected_hash,
            });

        Ok(outcome.status)
    }

    pub async fn check_ytdlp_status(&self) -> Result<YtDlpStatus> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        Ok(MediaExtractor::check_status(settings.ytdlp_path.as_deref()).await)
    }

    pub async fn install_ytdlp(&self) -> Result<YtDlpStatus> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let client = QueueManager::build_client(settings.proxy_url.as_deref());
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let target_dir = PathBuf::from(home).join(".local/share/orveth/bin");

        let status = MediaExtractor::install_ytdlp(&client, &target_dir).await?;
        if let Some(ref path) = status.path {
            let mut updated_settings = settings;
            updated_settings.ytdlp_path = Some(path.clone());
            SettingsRepository::save_settings(&self.pool, &updated_settings).await?;
        }
        Ok(status)
    }

    pub async fn inspect_media(&self, url: &str) -> Result<MediaInspectionResult> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let binary =
            MediaExtractor::resolve_binary(settings.ytdlp_path.as_deref()).ok_or_else(|| {
                OrvethError::Media(
                    "yt-dlp engine is not installed or not found in PATH".to_string(),
                )
            })?;

        MediaExtractor::inspect_media(&binary, url, settings.proxy_url.as_deref()).await
    }

    pub async fn resolve_media_stream(&self, url: &str, format_id: &str) -> Result<String> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let binary =
            MediaExtractor::resolve_binary(settings.ytdlp_path.as_deref()).ok_or_else(|| {
                OrvethError::Media(
                    "yt-dlp engine is not installed or not found in PATH".to_string(),
                )
            })?;

        MediaExtractor::resolve_stream_url(&binary, url, format_id, settings.proxy_url.as_deref())
            .await
    }

    pub async fn get_bridge_status(&self) -> Result<BridgeStatus> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let guard = self.bridge_server.lock().await;
        let running = guard.is_some();
        let port = guard
            .as_ref()
            .map(|s| s.port())
            .unwrap_or(settings.bridge_port);
        let native_hosts_installed = LocalBridgeServer::check_native_manifests_installed();

        Ok(BridgeStatus {
            running,
            port,
            token: settings.bridge_token,
            native_hosts_installed,
        })
    }

    pub async fn install_native_manifests(&self) -> Result<Vec<String>> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let paths =
            LocalBridgeServer::install_native_manifests(settings.bridge_token.as_deref()).await?;
        Ok(paths
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect())
    }

    pub fn inspect_torrent(&self, bytes: &[u8]) -> Result<TorrentMetadata> {
        TorrentParser::parse_torrent(bytes)
    }

    pub fn inspect_magnet(&self, uri: &str) -> Result<TorrentMetadata> {
        TorrentParser::parse_magnet(uri)
    }

    pub async fn query_torrent_tracker(
        &self,
        tracker_url: &str,
        info_hash: &str,
    ) -> Result<TrackerResponse> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let client = TrackerClient::new(settings.proxy_url.as_deref());
        let peer_id = b"-OV0240-000000000000";
        let params = AnnounceParams {
            tracker_url,
            info_hash_hex: info_hash,
            peer_id,
            port: 6881,
            uploaded: 0,
            downloaded: 0,
            left: 0,
        };
        client.announce_http(&params).await
    }
}
