use crate::limiter::BandwidthLimiter;
use crate::queue::QueueManager;
use orveth_core::error::{OrvethError, Result};
use orveth_core::event::EngineEvent;
use orveth_core::model::{DownloadFilter, DownloadJob, EngineSettings};
use orveth_core::state::{DownloadStatus, VerificationStatus};
use orveth_integrity::FileHasher;
use orveth_persistence::{init_db_pool, DbPool, JobRepository, SettingsRepository, StateReconciler};
use orveth_storage::StorageManager;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::info;
use uuid::Uuid;

#[derive(Clone)]
pub struct OrvethEngine {
    pool: DbPool,
    storage: StorageManager,
    queue: Arc<QueueManager>,
    limiter: BandwidthLimiter,
    event_sender: broadcast::Sender<EngineEvent>,
}

impl OrvethEngine {
    pub async fn init(db_path: impl AsRef<Path>, temp_dir: impl AsRef<Path>) -> Result<Self> {
        let pool = init_db_pool(db_path).await?;
        let storage = StorageManager::new(temp_dir.as_ref());

        // Startup recovery & reconciliation
        let reconciled = StateReconciler::reconcile_on_startup(&pool, &storage).await?;
        info!(reconciled_jobs = reconciled, "Startup state reconciliation finished");

        let settings = SettingsRepository::get_settings(&pool).await?;
        let limiter = BandwidthLimiter::new(settings.global_bandwidth_limit_bytes_per_sec);

        let (event_sender, _) = broadcast::channel(256);
        let queue = Arc::new(QueueManager::new(
            pool.clone(),
            storage.clone(),
            limiter.clone(),
            event_sender.clone(),
        ));

        // Start processing any queued jobs from previous run
        queue.pump_queue().await?;

        Ok(Self {
            pool,
            storage,
            queue,
            limiter,
            event_sender,
        })
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

    pub async fn get_settings(&self) -> Result<EngineSettings> {
        SettingsRepository::get_settings(&self.pool).await
    }

    pub async fn update_settings(&self, settings: &EngineSettings) -> Result<()> {
        SettingsRepository::save_settings(&self.pool, settings).await?;
        self.limiter
            .set_limit(settings.global_bandwidth_limit_bytes_per_sec);
        self.queue.pump_queue().await?;
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

    pub async fn verify_download(&self, id: Uuid, expected_hash: Option<String>) -> Result<VerificationStatus> {
        let job = self.get_download(id).await?;
        if !job.destination.exists() {
            return Err(OrvethError::Storage("Target file does not exist".to_string()));
        }

        let hash_to_check = expected_hash.as_deref().or(job.expected_hash.as_deref());
        let outcome = FileHasher::verify_sha256(&job.destination, hash_to_check).await?;

        let _ = self.event_sender.send(EngineEvent::VerificationStateChanged {
            download_id: id,
            status: outcome.status,
            computed_hash: Some(outcome.computed_hash),
            expected_hash: outcome.expected_hash,
        });

        Ok(outcome.status)
    }
}
