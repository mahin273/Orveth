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
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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

        let mut job = job;
        let generic_names = [
            "download",
            "download.php",
            "get",
            "file",
            "index.html",
            "index.php",
            "view",
        ];
        let is_generic = generic_names.contains(&job.file_name.to_ascii_lowercase().as_str())
            || !job.file_name.contains('.');

        if let Some(ref new_name) = caps.suggested_filename {
            if new_name != &job.file_name && (is_generic || new_name.contains('.')) {
                let parent = job.destination.parent().unwrap_or_else(|| Path::new("."));
                let new_dest = parent.join(new_name);
                job.file_name = new_name.clone();
                job.destination = new_dest;
            }
        }

        let is_segmented =
            caps.range_supported && caps.content_length.map(|l| l > 256 * 1024).unwrap_or(false);
        job.segmented = is_segmented;

        let _ = JobRepository::update_metadata(
            &ctx.pool,
            ctx.job_id,
            &job.file_name,
            &job.destination,
            Some(&caps.final_url),
            caps.content_length,
            Some(is_segmented),
        )
        .await;
        job.final_url = Some(caps.final_url.clone());
        if let Some(len) = caps.content_length {
            job.total_bytes = Some(len);
        }

        // 3. Transition to Downloading
        let _ =
            JobRepository::update_status(&ctx.pool, ctx.job_id, DownloadStatus::Downloading).await;
        let _ = ctx.event_sender.send(EngineEvent::DownloadStateChanged {
            download_id: ctx.job_id,
            previous_status: DownloadStatus::Preparing,
            new_status: DownloadStatus::Downloading,
            timestamp: Utc::now(),
        });

        let total_downloaded = Arc::new(AtomicU64::new(job.downloaded_bytes));
        let progress_job_id = ctx.job_id;
        let progress_sender = ctx.event_sender.clone();
        let progress_pool = ctx.pool.clone();
        let progress_cancel = ctx.cancel_token.clone();
        let progress_counter = total_downloaded.clone();
        let total_expected = caps.content_length;

        let reporter_handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
            interval.tick().await;

            let mut last_bytes = progress_counter.load(Ordering::Relaxed);
            let mut last_tick = tokio::time::Instant::now();
            let mut db_tick = 0u32;

            loop {
                interval.tick().await;
                if progress_cancel.load(Ordering::Relaxed) {
                    break;
                }

                let now = tokio::time::Instant::now();
                let current_bytes = progress_counter.load(Ordering::Relaxed);
                let elapsed = now.duration_since(last_tick).as_secs_f64();
                let delta = current_bytes.saturating_sub(last_bytes);
                let bytes_per_sec = if elapsed > 0.0 {
                    (delta as f64 / elapsed) as u64
                } else {
                    0
                };

                let eta_seconds = if bytes_per_sec > 0 {
                    total_expected.map(|total| {
                        let remaining = total.saturating_sub(current_bytes);
                        remaining / bytes_per_sec
                    })
                } else {
                    None
                };

                let _ = progress_sender.send(EngineEvent::DownloadProgress {
                    download_id: progress_job_id,
                    downloaded_bytes: current_bytes,
                    total_bytes: total_expected,
                    progress_ratio: total_expected.map(|tot| {
                        if tot > 0 {
                            current_bytes as f64 / tot as f64
                        } else {
                            0.0
                        }
                    }),
                });

                let _ = progress_sender.send(EngineEvent::DownloadSpeed {
                    download_id: progress_job_id,
                    bytes_per_sec,
                    eta_seconds,
                });

                last_bytes = current_bytes;
                last_tick = now;
                db_tick += 1;

                if db_tick.is_multiple_of(2) {
                    let _ = JobRepository::update_progress(
                        &progress_pool,
                        progress_job_id,
                        current_bytes,
                        total_expected,
                    )
                    .await;
                }
            }
        });

        let download_result = if is_segmented {
            Self::execute_segmented(
                &ctx,
                &job,
                caps.content_length.unwrap(),
                total_downloaded.clone(),
            )
            .await
        } else {
            Self::execute_single_stream(&ctx, &job, total_downloaded.clone()).await
        };

        reporter_handle.abort();

        let final_dl = total_downloaded.load(Ordering::Relaxed);
        let _ =
            JobRepository::update_progress(&ctx.pool, ctx.job_id, final_dl, caps.content_length)
                .await;

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
                let _ = ctx.event_sender.send(EngineEvent::DownloadSpeed {
                    download_id: ctx.job_id,
                    bytes_per_sec: 0,
                    eta_seconds: None,
                });
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
                let _ = ctx.event_sender.send(EngineEvent::DownloadSpeed {
                    download_id: ctx.job_id,
                    bytes_per_sec: 0,
                    eta_seconds: None,
                });
                Self::handle_job_error(&ctx.pool, &ctx.event_sender, ctx.job_id, &e).await;
                Err(e)
            }
        }
    }

    async fn execute_segmented(
        ctx: &JobExecutionContext,
        job: &DownloadJob,
        total_length: u64,
        total_downloaded: Arc<AtomicU64>,
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

        // Initialize total_downloaded counter with existing bytes from segments
        let existing_sum: u64 = segments.iter().map(|s| s.received_bytes).sum();
        total_downloaded.store(existing_sum, Ordering::Relaxed);

        let mut set = tokio::task::JoinSet::new();

        for mut seg in segments.clone() {
            let client = ctx.client.clone();
            let url = job.final_url.as_deref().unwrap_or(&job.url).to_string();
            let cancel = ctx.cancel_token.clone();
            let _limiter = ctx.limiter.clone();
            let event_sender = ctx.event_sender.clone();
            let job_id = job.id;
            let pool = ctx.pool.clone();
            let dl_counter = total_downloaded.clone();

            set.spawn(async move {
                if seg.is_completed() {
                    return Ok(seg);
                }

                let seg_id = seg.id;
                let seg_expected = seg.expected_length();
                let seg_received = Arc::new(AtomicU64::new(seg.received_bytes));
                let seg_received_cl = seg_received.clone();
                let seg_event_sender = event_sender.clone();
                let mut bytes_since_last_seg_event = 0u64;
                let mut bytes_since_last_db_flush = 0u64;
                let pool_cl = pool.clone();

                let res = SegmentWorker::download(&client, &url, &mut seg, cancel, move |delta| {
                    dl_counter.fetch_add(delta, Ordering::Relaxed);
                    let current = seg_received_cl.fetch_add(delta, Ordering::Relaxed) + delta;
                    bytes_since_last_seg_event += delta;
                    if bytes_since_last_seg_event >= 256 * 1024 {
                        bytes_since_last_seg_event = 0;
                        let _ = seg_event_sender.send(EngineEvent::SegmentStateChanged {
                            download_id: job_id,
                            segment_id: seg_id,
                            status: SegmentStatus::Downloading,
                            received_bytes: current,
                            expected_bytes: seg_expected,
                        });
                    }
                    bytes_since_last_db_flush += delta;
                    if bytes_since_last_db_flush >= 1024 * 1024 {
                        bytes_since_last_db_flush = 0;
                        let p = pool_cl.clone();
                        tokio::spawn(async move {
                            let _ = SegmentRepository::update_progress(
                                &p,
                                seg_id,
                                current,
                                SegmentStatus::Downloading,
                            )
                            .await;
                        });
                    }
                })
                .await;

                match res {
                    Ok(()) => {
                        let _ = SegmentRepository::update_progress(
                            &pool,
                            seg.id,
                            seg.received_bytes,
                            SegmentStatus::Completed,
                        )
                        .await;
                        let _ = event_sender.send(EngineEvent::SegmentStateChanged {
                            download_id: job_id,
                            segment_id: seg_id,
                            status: SegmentStatus::Completed,
                            received_bytes: seg.received_bytes,
                            expected_bytes: seg_expected,
                        });
                    }
                    Err(OrvethError::Canceled) => {
                        let _ = SegmentRepository::update_progress(
                            &pool,
                            seg.id,
                            seg.received_bytes,
                            SegmentStatus::Paused,
                        )
                        .await;
                    }
                    Err(ref _e) => {
                        let _ = SegmentRepository::update_progress(
                            &pool,
                            seg.id,
                            seg.received_bytes,
                            SegmentStatus::Failed,
                        )
                        .await;
                    }
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
        total_downloaded: Arc<AtomicU64>,
    ) -> Result<std::path::PathBuf> {
        let temp_file = ctx.storage.single_stream_temp_path(job.id, &job.file_name);
        let dl_counter = total_downloaded.clone();
        let target_url = job.final_url.as_deref().unwrap_or(&job.url);

        SingleStreamWorker::download(
            &ctx.client,
            target_url,
            &temp_file,
            ctx.cancel_token.clone(),
            move |delta, _| {
                dl_counter.fetch_add(delta, Ordering::Relaxed);
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
