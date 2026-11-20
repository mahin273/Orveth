use crate::coordinator::{DownloadCoordinator, JobExecutionContext};
use crate::limiter::BandwidthLimiter;
use orveth_core::error::Result;
use orveth_core::event::EngineEvent;
use orveth_core::model::DownloadFilter;
use orveth_core::state::DownloadStatus;
use orveth_persistence::{DbPool, JobRepository, SettingsRepository};
use orveth_storage::StorageManager;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;
use tracing::info;
use uuid::Uuid;

pub type ActiveJobMap = Arc<Mutex<HashMap<Uuid, (JoinHandle<()>, Arc<AtomicBool>)>>>;

pub struct QueueManager {
    pool: DbPool,
    storage: StorageManager,
    client: Client,
    limiter: BandwidthLimiter,
    event_sender: broadcast::Sender<EngineEvent>,
    active_jobs: ActiveJobMap,
}

impl QueueManager {
    pub fn new(
        pool: DbPool,
        storage: StorageManager,
        limiter: BandwidthLimiter,
        event_sender: broadcast::Sender<EngineEvent>,
    ) -> Self {
        Self {
            pool,
            storage,
            client: Client::builder().build().unwrap(),
            limiter,
            event_sender,
            active_jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn pump_queue(&self) -> Result<()> {
        let settings = SettingsRepository::get_settings(&self.pool).await?;
        let mut active = self.active_jobs.lock().await;

        // Clean finished handles
        active.retain(|_, (handle, _)| !handle.is_finished());

        let available_slots = settings.max_active_downloads.saturating_sub(active.len());
        if available_slots == 0 {
            self.emit_queue_stats(active.len()).await?;
            return Ok(());
        }

        let queued_filter = DownloadFilter {
            status: Some(DownloadStatus::Queued),
            ..Default::default()
        };
        let candidates = JobRepository::list(&self.pool, &queued_filter).await?;

        for job in candidates.into_iter().take(available_slots) {
            let job_id = job.id;
            let cancel_token = Arc::new(AtomicBool::new(false));
            let cancel_token_clone = cancel_token.clone();

            let ctx = JobExecutionContext {
                pool: self.pool.clone(),
                storage: self.storage.clone(),
                client: self.client.clone(),
                job_id,
                settings: settings.clone(),
                limiter: self.limiter.clone(),
                event_sender: self.event_sender.clone(),
                cancel_token: cancel_token_clone,
            };

            let handle = tokio::spawn(async move {
                let _ = DownloadCoordinator::run_job(ctx).await;
            });

            active.insert(job_id, (handle, cancel_token));
            info!(job_id = %job_id, "Dispatched queued job to worker");
        }

        self.emit_queue_stats(active.len()).await?;
        Ok(())
    }

    pub async fn pause_job(&self, id: Uuid) -> Result<()> {
        let mut active = self.active_jobs.lock().await;
        if let Some((handle, cancel_token)) = active.remove(&id) {
            cancel_token.store(true, Ordering::Relaxed);
            let _ = handle.await;
        } else {
            JobRepository::update_status(&self.pool, id, DownloadStatus::Paused).await?;
        }
        drop(active);
        self.pump_queue().await?;
        Ok(())
    }

    pub async fn resume_job(&self, id: Uuid) -> Result<()> {
        JobRepository::update_status(&self.pool, id, DownloadStatus::Queued).await?;
        self.pump_queue().await?;
        Ok(())
    }

    pub async fn cancel_job(&self, id: Uuid, delete_partial: bool) -> Result<()> {
        let mut active = self.active_jobs.lock().await;
        if let Some((handle, cancel_token)) = active.remove(&id) {
            cancel_token.store(true, Ordering::Relaxed);
            let _ = handle.await;
        }

        JobRepository::update_status(&self.pool, id, DownloadStatus::Canceled).await?;

        if delete_partial {
            let _ = self.storage.cleanup_job(id).await;
        }

        drop(active);
        self.pump_queue().await?;
        Ok(())
    }

    async fn emit_queue_stats(&self, active_count: usize) -> Result<()> {
        let queued = JobRepository::list(
            &self.pool,
            &DownloadFilter {
                status: Some(DownloadStatus::Queued),
                ..Default::default()
            },
        )
        .await?
        .len();

        let completed = JobRepository::list(
            &self.pool,
            &DownloadFilter {
                status: Some(DownloadStatus::Completed),
                ..Default::default()
            },
        )
        .await?
        .len();

        let _ = self.event_sender.send(EngineEvent::QueueChanged {
            active_count,
            queued_count: queued,
            completed_count: completed,
        });

        Ok(())
    }
}
