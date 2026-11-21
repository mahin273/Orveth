pub mod db;
pub mod recovery;
pub mod repository;

pub use db::{init_db_pool, DbPool};
pub use recovery::StateReconciler;
pub use repository::{JobRepository, SegmentRepository, SettingsRepository};

#[cfg(test)]
mod tests {
    use super::*;
    use orveth_core::model::{DownloadJob, Segment};
    use orveth_core::state::{DownloadStatus, SegmentStatus};
    use orveth_storage::StorageManager;
    use tempfile::tempdir;
    use tokio::fs;

    #[tokio::test]
    async fn test_db_init_and_job_crud() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("test_orveth.db");
        let pool = init_db_pool(&db_path).await.unwrap();

        let job = DownloadJob::new("https://example.com/test.iso", tmp.path(), None);
        let id = job.id;

        // Insert
        JobRepository::insert(&pool, &job).await.unwrap();

        // Get
        let fetched = JobRepository::get(&pool, id).await.unwrap().unwrap();
        assert_eq!(fetched.id, id);
        assert_eq!(fetched.file_name, "test.iso");
        assert_eq!(fetched.status, DownloadStatus::Queued);

        // Update status Queued -> Preparing -> Downloading
        JobRepository::update_status(&pool, id, DownloadStatus::Preparing)
            .await
            .unwrap();
        JobRepository::update_status(&pool, id, DownloadStatus::Downloading)
            .await
            .unwrap();

        // Update progress
        JobRepository::update_progress(&pool, id, 1024, Some(2048))
            .await
            .unwrap();

        let updated = JobRepository::get(&pool, id).await.unwrap().unwrap();
        assert_eq!(updated.status, DownloadStatus::Downloading);
        assert_eq!(updated.downloaded_bytes, 1024);
        assert_eq!(updated.total_bytes, Some(2048));

        // List
        let list = JobRepository::list(&pool, &Default::default())
            .await
            .unwrap();
        assert_eq!(list.len(), 1);

        // Delete
        JobRepository::delete(&pool, id).await.unwrap();
        assert!(JobRepository::get(&pool, id).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_state_reconciler_startup() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("reconcile.db");
        let pool = init_db_pool(&db_path).await.unwrap();
        let storage = StorageManager::new(tmp.path());

        let mut job = DownloadJob::new("https://example.com/movie.mp4", tmp.path(), None);
        job.segmented = true;
        job.status = DownloadStatus::Downloading; // Interrupted abruptly!
        let job_id = job.id;
        JobRepository::insert(&pool, &job).await.unwrap();

        // Create segments on disk
        let p1 = tmp.path().join("seg1.bin");
        let p2 = tmp.path().join("seg2.bin");
        fs::write(&p1, vec![0u8; 500]).await.unwrap();
        fs::write(&p2, vec![0u8; 300]).await.unwrap();

        let s1 = Segment {
            id: uuid::Uuid::new_v4(),
            download_id: job_id,
            start_byte: 0,
            end_byte: 499,
            received_bytes: 500,
            status: SegmentStatus::Downloading,
            temp_path: p1,
            retry_count: 0,
            updated_at: chrono::Utc::now(),
        };

        let s2 = Segment {
            id: uuid::Uuid::new_v4(),
            download_id: job_id,
            start_byte: 500,
            end_byte: 999,
            received_bytes: 300,
            status: SegmentStatus::Downloading,
            temp_path: p2,
            retry_count: 0,
            updated_at: chrono::Utc::now(),
        };

        SegmentRepository::insert_batch(&pool, &[s1, s2])
            .await
            .unwrap();

        // Run recovery reconciliation
        let reconciled = StateReconciler::reconcile_on_startup(&pool, &storage)
            .await
            .unwrap();
        assert_eq!(reconciled, 1);

        // Job should be reconciled to Paused with 800 bytes verified on disk
        let job_after = JobRepository::get(&pool, job_id).await.unwrap().unwrap();
        assert_eq!(job_after.status, DownloadStatus::Paused);
        assert_eq!(job_after.downloaded_bytes, 800);
    }

    #[tokio::test]
    async fn test_job_update_metadata() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("metadata_test.db");
        let pool = init_db_pool(&db_path).await.unwrap();

        let job = DownloadJob::new("https://example.com/download", tmp.path(), None);
        let id = job.id;
        assert!(!job.segmented);

        JobRepository::insert(&pool, &job).await.unwrap();

        let new_dest = tmp.path().join("ubuntu-26.04.iso");
        JobRepository::update_metadata(
            &pool,
            id,
            "ubuntu-26.04.iso",
            &new_dest,
            Some("https://releases.ubuntu.com/ubuntu-26.04.iso"),
            Some(6_000_000_000),
            Some(true),
        )
        .await
        .unwrap();

        let updated = JobRepository::get(&pool, id).await.unwrap().unwrap();
        assert_eq!(updated.file_name, "ubuntu-26.04.iso");
        assert_eq!(updated.destination, new_dest);
        assert_eq!(
            updated.final_url.as_deref(),
            Some("https://releases.ubuntu.com/ubuntu-26.04.iso")
        );
        assert_eq!(updated.total_bytes, Some(6_000_000_000));
        assert!(updated.segmented);
    }
}
