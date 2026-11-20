use crate::db::DbPool;
use crate::repository::{JobRepository, SegmentRepository};
use orveth_core::error::Result;
use orveth_core::state::{DownloadStatus, SegmentStatus};
use orveth_storage::StorageManager;
use tracing::{info, warn};

pub struct StateReconciler;

impl StateReconciler {
    /// Reconciles database state with actual files on disk on application startup.
    /// Incomplete active jobs are verified against existing files, byte counters
    /// are corrected, and irrecoverable jobs are marked NeedsAttention.
    pub async fn reconcile_on_startup(pool: &DbPool, _storage: &StorageManager) -> Result<usize> {
        let all_jobs = JobRepository::list(pool, &Default::default()).await?;
        let mut reconciled_count = 0;

        for job in all_jobs {
            if !job.status.is_active() && job.status != DownloadStatus::NeedsAttention {
                continue;
            }

            info!(
                job_id = %job.id,
                file_name = %job.file_name,
                current_status = %job.status,
                "Reconciling job state on startup"
            );

            if job.segmented {
                let segments = SegmentRepository::get_for_job(pool, job.id).await?;
                if segments.is_empty() {
                    warn!(job_id = %job.id, "Segmented job has no recorded segments; marking NeedsAttention");
                    let _ =
                        JobRepository::update_status(pool, job.id, DownloadStatus::NeedsAttention)
                            .await;
                    reconciled_count += 1;
                    continue;
                }

                let mut total_actual_bytes = 0u64;
                let mut all_segments_valid = true;

                for seg in segments {
                    if seg.temp_path.exists() {
                        match StorageManager::get_file_size(&seg.temp_path).await {
                            Ok(disk_size) => {
                                // Cap to expected length
                                let actual_bytes = disk_size.min(seg.expected_length());
                                total_actual_bytes += actual_bytes;

                                let new_seg_status = if actual_bytes >= seg.expected_length() {
                                    SegmentStatus::Completed
                                } else {
                                    SegmentStatus::Paused
                                };

                                let _ = SegmentRepository::update_progress(
                                    pool,
                                    seg.id,
                                    actual_bytes,
                                    new_seg_status,
                                )
                                .await;
                            }
                            Err(_) => {
                                all_segments_valid = false;
                            }
                        }
                    } else if seg.received_bytes > 0 {
                        // File went missing!
                        all_segments_valid = false;
                    }
                }

                if all_segments_valid {
                    let _ = JobRepository::update_progress(
                        pool,
                        job.id,
                        total_actual_bytes,
                        job.total_bytes,
                    )
                    .await;
                    let _ =
                        JobRepository::update_status(pool, job.id, DownloadStatus::Paused).await;
                } else {
                    let _ =
                        JobRepository::update_status(pool, job.id, DownloadStatus::NeedsAttention)
                            .await;
                }
            } else {
                // Single stream download
                if let Some(ref temp_path) = job.temp_path {
                    if temp_path.exists() {
                        let disk_size = StorageManager::get_file_size(temp_path).await.unwrap_or(0);
                        let _ = JobRepository::update_progress(
                            pool,
                            job.id,
                            disk_size,
                            job.total_bytes,
                        )
                        .await;
                        let _ = JobRepository::update_status(pool, job.id, DownloadStatus::Paused)
                            .await;
                    } else if job.downloaded_bytes > 0 {
                        let _ = JobRepository::update_status(
                            pool,
                            job.id,
                            DownloadStatus::NeedsAttention,
                        )
                        .await;
                    } else {
                        let _ = JobRepository::update_status(pool, job.id, DownloadStatus::Paused)
                            .await;
                    }
                } else {
                    let _ =
                        JobRepository::update_status(pool, job.id, DownloadStatus::Paused).await;
                }
            }

            reconciled_count += 1;
        }

        Ok(reconciled_count)
    }
}
