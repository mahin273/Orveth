use futures_util::StreamExt;
use orveth_core::error::{OrvethError, Result};
use orveth_core::model::Segment;
use reqwest::header::{CONTENT_LENGTH, CONTENT_RANGE, RANGE};
use reqwest::{Client, StatusCode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use tracing::debug;

pub struct SegmentWorker;

impl SegmentWorker {
    /// Downloads a segment with strict range and size validation.
    /// Resumes an existing partial segment if bytes were already received.
    pub async fn download<F>(
        client: &Client,
        url: &str,
        segment: &mut Segment,
        cancel_token: Arc<AtomicBool>,
        mut on_progress: F,
    ) -> Result<()>
    where
        F: FnMut(u64), // reports newly received bytes delta
    {
        let expected_total_segment_len = segment.expected_length();
        if segment.received_bytes >= expected_total_segment_len {
            // Already complete
            return Ok(());
        }

        let request_start = segment.start_byte + segment.received_bytes;
        let request_end = segment.end_byte;
        let bytes_to_fetch = request_end - request_start + 1;

        let range_header_val = format!("bytes={request_start}-{request_end}");
        debug!(
            segment_id = %segment.id,
            range = %range_header_val,
            "Sending segment request"
        );

        let resp = client
            .get(url)
            .header(RANGE, range_header_val)
            .send()
            .await
            .map_err(|e| OrvethError::Network(format!("Segment HTTP request failed: {e}")))?;

        let status = resp.status();
        if status != StatusCode::PARTIAL_CONTENT {
            if status == StatusCode::OK {
                return Err(OrvethError::SegmentValidationFailed(
                    "Server returned 200 OK instead of 206 Partial Content for segmented transfer"
                        .to_string(),
                ));
            } else {
                return Err(OrvethError::HttpStatus {
                    status_code: status.as_u16(),
                    retryable: status.is_server_error(),
                });
            }
        }

        // Validate Content-Range header: format should match "bytes start-end/total"
        let headers = resp.headers();
        if let Some(cr_val) = headers.get(CONTENT_RANGE).and_then(|v| v.to_str().ok()) {
            Self::validate_content_range(cr_val, request_start, request_end)?;
        } else {
            return Err(OrvethError::InvalidContentRange(
                "Missing Content-Range header in 206 Partial Content response".to_string(),
            ));
        }

        // Validate Content-Length if present
        if let Some(cl_val) = headers.get(CONTENT_LENGTH).and_then(|v| v.to_str().ok()) {
            if let Ok(cl) = cl_val.trim().parse::<u64>() {
                if cl != bytes_to_fetch {
                    return Err(OrvethError::ContentLengthMismatch {
                        expected: bytes_to_fetch,
                        received: cl,
                    });
                }
            }
        }

        // Ensure parent directory exists
        if let Some(parent) = segment.temp_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| OrvethError::Storage(format!("Failed to create segment dir: {e}")))?;
        }

        // Open in append mode if resuming, create/truncate if start == 0 and received == 0
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .append(segment.received_bytes > 0)
            .truncate(segment.received_bytes == 0)
            .open(&segment.temp_path)
            .await
            .map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed opening segment file {}: {e}",
                    segment.temp_path.display()
                ))
            })?;
        let mut file = tokio::io::BufWriter::with_capacity(256 * 1024, file);

        let mut stream = resp.bytes_stream();
        let mut downloaded_in_request = 0u64;

        while let Some(chunk_res) = stream.next().await {
            if cancel_token.load(Ordering::Relaxed) {
                file.flush()
                    .await
                    .map_err(|e| OrvethError::Storage(e.to_string()))?;
                return Err(OrvethError::Canceled);
            }

            let chunk = chunk_res
                .map_err(|e| OrvethError::Network(format!("Error reading chunk stream: {e}")))?;

            let n = chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .map_err(|e| OrvethError::Storage(format!("Error writing segment chunk: {e}")))?;

            downloaded_in_request += n;
            segment.received_bytes += n;
            on_progress(n);

            if downloaded_in_request > bytes_to_fetch {
                return Err(OrvethError::SegmentValidationFailed(format!(
                    "Segment received more bytes ({downloaded_in_request}) than requested ({bytes_to_fetch})"
                )));
            }
        }

        file.flush()
            .await
            .map_err(|e| OrvethError::Storage(format!("Failed to flush segment file: {e}")))?;

        if downloaded_in_request != bytes_to_fetch {
            return Err(OrvethError::ContentLengthMismatch {
                expected: bytes_to_fetch,
                received: downloaded_in_request,
            });
        }

        Ok(())
    }

    /// Validates that Content-Range matches bytes {expected_start}-{expected_end}/*
    fn validate_content_range(
        content_range: &str,
        expected_start: u64,
        expected_end: u64,
    ) -> Result<()> {
        // Example: "bytes 0-1023/4096"
        let trimmed = content_range.trim();
        if !trimmed.starts_with("bytes ") {
            return Err(OrvethError::InvalidContentRange(trimmed.to_string()));
        }

        let range_part = trimmed["bytes ".len()..]
            .split('/')
            .next()
            .unwrap_or("")
            .trim();

        let mut bounds = range_part.split('-');
        let start_str = bounds.next().unwrap_or("");
        let end_str = bounds.next().unwrap_or("");

        let start: u64 = start_str
            .parse()
            .map_err(|_| OrvethError::InvalidContentRange(trimmed.to_string()))?;
        let end: u64 = end_str
            .parse()
            .map_err(|_| OrvethError::InvalidContentRange(trimmed.to_string()))?;

        if start != expected_start || end != expected_end {
            return Err(OrvethError::SegmentValidationFailed(format!(
                "Content-Range bytes {start}-{end} did not match expected {expected_start}-{expected_end}"
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_content_range_valid() {
        assert!(SegmentWorker::validate_content_range("bytes 0-1023/4096", 0, 1023).is_ok());
        assert!(SegmentWorker::validate_content_range("bytes 1024-2047/*", 1024, 2047).is_ok());
    }

    #[test]
    fn test_validate_content_range_mismatch() {
        assert!(SegmentWorker::validate_content_range("bytes 0-500/4096", 0, 1023).is_err());
        assert!(SegmentWorker::validate_content_range("bytes 50-1023/4096", 0, 1023).is_err());
        assert!(SegmentWorker::validate_content_range("invalid", 0, 1023).is_err());
    }
}
