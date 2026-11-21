pub mod capability;
pub mod media;
pub mod retry;
pub mod segment_planner;
pub mod segment_worker;
pub mod single_stream;
pub mod torrent;

pub use capability::{CapabilityDetector, ServerCapabilities};
pub use media::MediaExtractor;
pub use retry::RetryPolicy;
pub use segment_planner::SegmentPlanner;
pub use segment_worker::SegmentWorker;
pub use single_stream::SingleStreamWorker;
pub use torrent::{AnnounceParams, TorrentParser, TrackerClient, TrackerResponse};

#[cfg(test)]
mod tests {
    use super::*;
    use orveth_core::model::Segment;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tempfile::tempdir;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_segment_worker_with_mock_http_server() {
        // Spin up a mini mock HTTP server on localhost
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server_handle = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut req_buf = vec![0u8; 1024];
            let n = socket.read(&mut req_buf).await.unwrap();
            let req_str = String::from_utf8_lossy(&req_buf[..n]);

            assert!(req_str.to_ascii_lowercase().contains("range: bytes=0-4"));

            let response = "HTTP/1.1 206 Partial Content\r\n\
                Content-Range: bytes 0-4/10\r\n\
                Content-Length: 5\r\n\
                Connection: close\r\n\r\n\
                ABCDE";
            socket.write_all(response.as_bytes()).await.unwrap();
        });

        let tmp = tempdir().unwrap();
        let part_path = tmp.path().join("part_0.bin");
        let download_id = uuid::Uuid::new_v4();
        let mut segment = Segment::new(download_id, 0, 4, &part_path);

        let client = reqwest::Client::new();
        let url = format!("http://{addr}/test");
        let cancel = Arc::new(AtomicBool::new(false));

        let mut received_delta = 0u64;
        SegmentWorker::download(&client, &url, &mut segment, cancel, |delta| {
            received_delta += delta;
        })
        .await
        .unwrap();

        server_handle.await.unwrap();

        assert_eq!(received_delta, 5);
        assert_eq!(segment.received_bytes, 5);
        let content = tokio::fs::read_to_string(&part_path).await.unwrap();
        assert_eq!(content, "ABCDE");
    }

    #[tokio::test]
    async fn test_single_stream_with_mock_server() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut req_buf = vec![0u8; 1024];
            let _ = socket.read(&mut req_buf).await.unwrap();

            let response = "HTTP/1.1 200 OK\r\n\
                Content-Length: 6\r\n\
                Connection: close\r\n\r\n\
                FOOBAR";
            socket.write_all(response.as_bytes()).await.unwrap();
        });

        let tmp = tempdir().unwrap();
        let temp_file = tmp.path().join("single.part");
        let client = reqwest::Client::new();
        let url = format!("http://{addr}/file");
        let cancel = Arc::new(AtomicBool::new(false));

        let downloaded = SingleStreamWorker::download(&client, &url, &temp_file, cancel, |_, _| {})
            .await
            .unwrap();

        assert_eq!(downloaded, 6);
        let data = tokio::fs::read_to_string(&temp_file).await.unwrap();
        assert_eq!(data, "FOOBAR");
    }
}
