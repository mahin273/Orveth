use crate::limiter::BandwidthLimiter;
use chrono::Utc;
use orveth_core::error::{OrvethError, Result};
use orveth_core::event::EngineEvent;
use orveth_core::model::{DownloadJob, EngineSettings};
use orveth_core::state::{DownloadStatus, SegmentStatus};
use orveth_download::{CapabilityDetector, SegmentPlanner, SegmentWorker, SingleStreamWorker};
use orveth_integrity::FileHasher;
use orveth_persistence::{DbPool, JobRepository, SegmentRepository};
use orveth_storage::StorageManager;
use reqwest::Client;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
pub struct JobExecutionContext {
    pub pool: DbPool,
    pub storage: StorageManager,
    pub client: Client,
    pub job_id: Uuid,
    pub settings: EngineSettings,
    pub limiter: BandwidthLimiter,
    pub event_sender: broadcast::Sender<EngineEvent>,
    pub cancel_token: Arc<AtomicBool>,
}

pub struct DownloadCoordinator;

impl DownloadCoordinator {
    pub async fn run_job(ctx: JobExecutionContext) -> Result<()> {
        let job = match JobRepository::get(&ctx.pool, ctx.job_id).await? {
            Some(j) => j,
            None => return Err(OrvethError::JobNotFound(ctx.job_id.to_string())),
        };

        if ctx.cancel_token.load(Ordering::Relaxed) {
            return Ok(());
        }

        // 1. Transition to Preparing
        let _ =
            JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Preparing).await;
        let _ = ctx.event_sender.send(EngineEvent::DownloadStateChanged {
            download_id: ctx.job_id,
            previous_status: job.status,
            new_status: DownloadStatus::Preparing,
            timestamp: Utc::now(),
        });

        // Initialize temp storage for job
        let _temp_dir = ctx.storage.init_job_storage(ctx.job_id).await?;

        // 2. Probe server capabilities
        let caps = match CapabilityDetector::detect(&ctx.client, &job.url).await {
            Ok(c) => c,
            Err(e) => {
                Self::handle_job_error(&ctx.pool, &ctx.event_sender, ctx.job_id, &e).await;
                return Err(e);
            }
        };

        if ctx.cancel_token.load(Ordering::Relaxed) {
            let _ =
                JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Paused).await;
            return Ok(());
        }

        // Update total_bytes in DB if detected
        if let Some(len) = caps.content_length {
            let _ = JobRepository::update_progress(
                &ctx.pool,
                ctx.job_id,
                job.downloaded_bytes,
                Some(len),
            )
            .await;
        }

        let is_segmented =
            caps.range_supported && caps.content_length.map(|l| l > 256 * 1024).unwrap_or(false);

        // 3. Transition to Downloading
        let _ =
            JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Downloading).await;
        let _ = ctx.event_sender.send(EngineEvent::DownloadStateChanged {
            download_id: ctx.job_id,
            previous_status: DownloadStatus::Preparing,
            new_status: DownloadStatus::Downloading,
            timestamp: Utc::now(),
        });

        let download_result = if is_segmented {
            Self::execute_segmented(&ctx, &job, caps.content_length.unwrap()).await
        } else {
            Self::execute_single_stream(&ctx, &job).await
        };

        match download_result {
            Ok(assembled_file) => {
                // 4. Verification
                let _ =
                    JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Verifying)
                        .await;
                let _ = ctx.event_sender.send(EngineEvent::DownloadStateChanged {
                    download_id: ctx.job_id,
                    previous_status: DownloadStatus::Downloading,
                    new_status: DownloadStatus::Verifying,
                    timestamp: Utc::now(),
                });

                let verif_outcome =
                    FileHasher::verify_sha256(&assembled_file, job.expected_hash.as_deref())
                        .await?;

                let _ = ctx
                    .event_sender
                    .send(EngineEvent::VerificationStateChanged {
                        download_id: ctx.job_id,
                        status: verif_outcome.status,
                        computed_hash: Some(verif_outcome.computed_hash.clone()),
                        expected_hash: verif_outcome.expected_hash.clone(),
                    });

                // 5. Atomic Finalize
                let final_dest = StorageManager::finalize_file(
                    &assembled_file,
                    &job.destination,
                    ctx.settings.collision_policy,
                )
                .await?;

                let total_size = StorageManager::get_file_size(&final_dest).await?;
                let _ = JobRepository::update_completed(
                    &ctx.pool,
                    ctx.job_id,
                    &final_dest,
                    total_size,
                    verif_outcome.status,
                )
                .await;

                let _ = ctx.storage.cleanup_job(ctx.job_id).await;

                let _ = ctx.event_sender.send(EngineEvent::DownloadCompleted {
                    download_id: ctx.job_id,
                    file_name: job.file_name.clone(),
                    destination_path: final_dest.display().to_string(),
                    total_bytes: total_size,
                });

                info!(job_id = %ctx.job_id, final_path = %final_dest.display(), "Download completed successfully");
                Ok(())
            }
            Err(OrvethError::Canceled) => {
                info!(job_id = %ctx.job_id, "Download paused/canceled by request");
                let _ = JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Paused)
                    .await;
                let _ = ctx.event_sender.send(EngineEvent::DownloadStateChanged {
                    download_id: ctx.job_id,
                    previous_status: DownloadStatus::Downloading,
                    new_status: DownloadStatus::Paused,
                    timestamp: Utc::now(),
                });
                Ok(())
            }
            Err(e) => {
                Self::handle_job_error(&ctx.pool, &ctx.event_sender, ctx.job_id, &e).await;
                Err(e)
            }
        }
    }

    async fn execute_segmented(
        ctx: &JobExecutionContext,
        job: &DownloadJob,
        total_length: u64,
    ) -> Result<std::path::PathBuf> {
        let temp_dir = ctx.storage.temp_dir_for_job(job.id);
        let mut segments = SegmentRepository::get_for_job(&ctx.pool, job.id).await?;

        if segments.is_empty() {
            let planned = SegmentPlanner::plan(
                job.id,
                total_length,
                ctx.settings.default_segment_count,
                &temp_dir,
            )?;
            SegmentRepository::insert_batch(&ctx.pool, &planned).await?;
            segments = planned;
        }

        let mut set = tokio::task::JoinSet::new();

        for mut seg in segments.clone() {
            let client = ctx.client.clone();
            let url = job.url.clone();
            let cancel = ctx.cancel_token.clone();
            let _limiter = ctx.limiter.clone();
            let event_sender = ctx.event_sender.clone();
            let job_id = job.id;
            let pool = ctx.pool.clone();

            set.spawn(async move {
                if seg.is_completed() {
                    return Ok(seg);
                }

                let res = SegmentWorker::download(&client, &url, &mut seg, cancel, |delta| {
                    let _ = event_sender.send(EngineEvent::DownloadProgress {
                        download_id: job_id,
                        downloaded_bytes: delta,
                        total_bytes: Some(total_length),
                        progress_ratio: None,
                    });
                })
                .await;

                if res.is_ok() {
                    let _ = SegmentRepository::update_progress(
                        &pool,
                        seg.id,
                        seg.received_bytes,
                        SegmentStatus::Completed,
                    )
                    .await;
                }

                res.map(|_| seg)
            });
        }

        let mut completed_segments = Vec::new();
        while let Some(res) = set.join_next().await {
            match res {
                Ok(Ok(seg)) => completed_segments.push(seg),
                Ok(Err(e)) => return Err(e),
                Err(e) => return Err(OrvethError::Internal(e.to_string())),
            }
        }

        let assembled_path = temp_dir.join("assembled.tmp");
        ctx.storage
            .assemble_segments(job.id, &completed_segments, &assembled_path)
            .await?;

        Ok(assembled_path)
    }

    async fn execute_single_stream(
        ctx: &JobExecutionContext,
        job: &DownloadJob,
    ) -> Result<std::path::PathBuf> {
        let temp_file = ctx.storage.single_stream_temp_path(job.id, &job.file_name);
        let event_sender = ctx.event_sender.clone();
        let job_id = job.id;

        SingleStreamWorker::download(
            &ctx.client,
            &job.url,
            &temp_file,
            ctx.cancel_token.clone(),
            |delta, total| {
                let _ = event_sender.send(EngineEvent::DownloadProgress {
                    download_id: job_id,
                    downloaded_bytes: delta,
                    total_bytes: total,
                    progress_ratio: None,
                });
            },
        )
        .await?;

        Ok(temp_file)
    }

    async fn handle_job_error(
        pool: &DbPool,
        event_sender: &broadcast::Sender<EngineEvent>,
        job_id: Uuid,
        err: &OrvethError,
    ) {
        error!(job_id = %job_id, error = %err, "Job encountered error");
        let error_msg = err.to_string();
        let _ = JobRepository::update_failed(pool, job_id, "TRANSFER_ERROR", &error_msg).await;
        let _ = event_sender.send(EngineEvent::DownloadFailed {
            download_id: job_id,
            error_code: "TRANSFER_ERROR".to_string(),
            error_message: error_msg,
            retryable: false,
        });
        let _ = event_sender.send(EngineEvent::DownloadStateChanged {
            download_id: job_id,
            previous_status: DownloadStatus::Downloading,
            new_status: DownloadStatus::Failed,
            timestamp: Utc::now(),
        });
    }
}
