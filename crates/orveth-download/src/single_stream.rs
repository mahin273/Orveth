use futures_util::StreamExt;
use orveth_core::error::{OrvethError, Result};
use reqwest::header::{CONTENT_LENGTH, RANGE};
use reqwest::{Client, StatusCode};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;
use tracing::debug;

pub struct SingleStreamWorker;

impl SingleStreamWorker {
    /// Downloads a resource via single-stream HTTP GET.
    /// Resumes if temp_file already exists and has size > 0 (by sending Range header).
    pub async fn download<F>(
        client: &Client,
        url: &str,
        temp_file: &Path,
        cancel_token: Arc<AtomicBool>,
        mut on_progress: F,
    ) -> Result<u64>
    where
        F: FnMut(u64, Option<u64>), // (downloaded_bytes_delta, total_bytes)
    {
        if let Some(parent) = temp_file.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                OrvethError::Storage(format!("Failed creating single-stream temp dir: {e}"))
            })?;
        }

        let existing_bytes = if temp_file.exists() {
            fs::metadata(temp_file).await.map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        let mut req = client.get(url);
        let resuming = existing_bytes > 0;
        if resuming {
            req = req.header(RANGE, format!("bytes={existing_bytes}-"));
        }

        debug!(
            url = %url,
            existing_bytes = %existing_bytes,
            resuming = %resuming,
            "Starting single stream download"
        );

        let resp = req
            .send()
            .await
            .map_err(|e| OrvethError::Network(format!("Single stream request failed: {e}")))?;

        let status = resp.status();
        let (mut file, total_bytes, can_resume) = if resuming {
            if status == StatusCode::PARTIAL_CONTENT {
                // Resume accepted
                let total = resp
                    .headers()
                    .get("content-range")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.rsplit('/').next())
                    .and_then(|t| t.trim().parse::<u64>().ok());

                let file = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .append(true)
                    .open(temp_file)
                    .await
                    .map_err(|e| OrvethError::Storage(e.to_string()))?;

                (file, total, true)
            } else if status == StatusCode::OK {
                // Server ignored Range header, starting from scratch
                let total = resp
                    .headers()
                    .get(CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|t| t.trim().parse::<u64>().ok());

                let file = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(temp_file)
                    .await
                    .map_err(|e| OrvethError::Storage(e.to_string()))?;

                (file, total, false)
            } else {
                return Err(OrvethError::HttpStatus {
                    status_code: status.as_u16(),
                    retryable: status.is_server_error(),
                });
            }
        } else if status.is_success() {
            let total = resp
                .headers()
                .get(CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|t| t.trim().parse::<u64>().ok());

            let file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(temp_file)
                .await
                .map_err(|e| OrvethError::Storage(e.to_string()))?;

            (file, total, false)
        } else {
            return Err(OrvethError::HttpStatus {
                status_code: status.as_u16(),
                retryable: status.is_server_error(),
            });
        };

        let mut stream = resp.bytes_stream();
        let mut total_downloaded = if can_resume { existing_bytes } else { 0 };

        while let Some(chunk_res) = stream.next().await {
            if cancel_token.load(Ordering::Relaxed) {
                file.flush()
                    .await
                    .map_err(|e| OrvethError::Storage(e.to_string()))?;
                return Err(OrvethError::Canceled);
            }

            let chunk = chunk_res.map_err(|e| {
                OrvethError::Network(format!("Error reading single-stream chunk: {e}"))
            })?;

            let n = chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .map_err(|e| OrvethError::Storage(format!("Error writing chunk: {e}")))?;

            total_downloaded += n;
            on_progress(n, total_bytes);
        }

        file.flush().await.map_err(|e| {
            OrvethError::Storage(format!("Failed flushing single stream temp file: {e}"))
        })?;

        if let Some(expected) = total_bytes {
            if total_downloaded != expected {
                return Err(OrvethError::ContentLengthMismatch {
                    expected,
                    received: total_downloaded,
                });
            }
        }

        Ok(total_downloaded)
    }
}
