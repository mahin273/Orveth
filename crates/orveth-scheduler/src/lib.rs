pub mod bridge;
pub mod coordinator;
pub mod facade;
pub mod limiter;
pub mod queue;

pub use bridge::LocalBridgeServer;
pub use coordinator::DownloadCoordinator;
pub use facade::OrvethEngine;
pub use limiter::BandwidthLimiter;
pub use queue::QueueManager;

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_engine_add_and_execute_download() {
        // Mock server delivering a small file
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            // First request: HEAD probe
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut req_buf = vec![0u8; 1024];
                let _ = socket.read(&mut req_buf).await.unwrap();
                let head_resp = "HTTP/1.1 200 OK\r\n\
                    Content-Length: 11\r\n\
                    Accept-Ranges: bytes\r\n\
                    Connection: close\r\n\r\n";
                let _ = socket.write_all(head_resp.as_bytes()).await;
            }

            // Second request: GET file
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut req_buf = vec![0u8; 1024];
                let _ = socket.read(&mut req_buf).await.unwrap();
                let get_resp = "HTTP/1.1 200 OK\r\n\
                    Content-Length: 11\r\n\
                    Connection: close\r\n\r\n\
                    Hello World";
                let _ = socket.write_all(get_resp.as_bytes()).await;
            }
        });

        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("engine.db");
        let temp_dir = tmp.path().join("temp");
        let dest_dir = tmp.path().join("downloads");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();
        let mut rx = engine.subscribe();

        let job = engine
            .add_download(
                format!("http://{addr}/test.txt"),
                Some(dest_dir.clone()),
                Some("test.txt".to_string()),
                None,
            )
            .await
            .unwrap();

        assert_eq!(job.file_name, "test.txt");

        // Wait for completed event
        let mut completed = false;
        for _ in 0..20 {
            if let Ok(orveth_core::EngineEvent::DownloadCompleted { download_id, .. }) =
                rx.try_recv()
            {
                if download_id == job.id {
                    completed = true;
                    break;
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        // Verify the file was written to final destination
        assert!(completed);
        let final_file = dest_dir.join("test.txt");
        assert!(final_file.exists());
        let content = tokio::fs::read_to_string(&final_file).await.unwrap();
        assert_eq!(content, "Hello World");
    }

    #[tokio::test]
    async fn test_engine_batch_add_and_priority() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("batch.db");
        let temp_dir = tmp.path().join("temp");
        let dest_dir = tmp.path().join("downloads");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();

        let urls = vec![
            "https://example.com/file1.zip".to_string(),
            "https://example.com/file2.zip".to_string(),
            "https://example.com/file3.zip".to_string(),
        ];

        let added = engine
            .add_downloads_batch(urls, Some(dest_dir))
            .await
            .unwrap();
        assert_eq!(added.len(), 3);

        // Adjust priority of file3 to 10
        engine.set_job_priority(added[2].id, 10).await.unwrap();

        let list = engine.list_downloads(&Default::default()).await.unwrap();
        assert_eq!(list.len(), 3);
        // file3 should be ordered first
        assert_eq!(list[0].id, added[2].id);
        assert_eq!(list[0].priority, 10);
    }

    #[tokio::test]
    async fn test_engine_media_ytdlp_status_check() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("media_test.db");
        let temp_dir = tmp.path().join("temp");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();
        let status = engine.check_ytdlp_status().await.unwrap();
        // Even if not installed on host, it gracefully returns YtDlpStatus without panicking
        assert!(!status.available || status.path.is_some());
    }
}
