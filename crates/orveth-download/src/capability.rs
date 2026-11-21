use orveth_core::error::{OrvethError, Result};
use reqwest::header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, RANGE};
use reqwest::{Client, Response, StatusCode};
use tracing::{debug, warn};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerCapabilities {
    pub range_supported: bool,
    pub content_length: Option<u64>,
    pub final_url: String,
    pub content_type: Option<String>,
    pub suggested_filename: Option<String>,
}

pub struct CapabilityDetector;

impl CapabilityDetector {
    /// Conservatively probes server capabilities for a given URL.
    /// Handles servers rejecting HEAD by falling back to a ranged GET for byte 0-0.
    pub async fn detect(client: &Client, url: &str) -> Result<ServerCapabilities> {
        debug!(url = %url, "Probing server capabilities via HEAD");

        let head_res = client.head(url).send().await;

        match head_res {
            Ok(resp) if resp.status().is_success() => Self::extract_from_response(resp, false),
            Ok(resp)
                if resp.status() == StatusCode::METHOD_NOT_ALLOWED
                    || resp.status() == StatusCode::NOT_IMPLEMENTED =>
            {
                debug!("HEAD not allowed; falling back to Range GET probe");
                Self::probe_range_get(client, url).await
            }
            Ok(resp) => {
                if resp.status().is_client_error() || resp.status().is_server_error() {
                    Err(OrvethError::HttpStatus {
                        status_code: resp.status().as_u16(),
                        retryable: resp.status().is_server_error(),
                    })
                } else {
                    Self::probe_range_get(client, url).await
                }
            }
            Err(e) => {
                warn!(error = %e, "HEAD request failed; trying GET probe");
                Self::probe_range_get(client, url).await
            }
        }
    }

    async fn probe_range_get(client: &Client, url: &str) -> Result<ServerCapabilities> {
        let resp = client
            .get(url)
            .header(RANGE, "bytes=0-0")
            .send()
            .await
            .map_err(|e| OrvethError::Network(format!("Range probe GET failed: {e}")))?;

        let status = resp.status();
        if status == StatusCode::PARTIAL_CONTENT {
            Self::extract_from_response(resp, true)
        } else if status.is_success() {
            // Server returned 200 OK ignoring Range header -> Range not supported
            Self::extract_from_response(resp, false)
        } else {
            Err(OrvethError::HttpStatus {
                status_code: status.as_u16(),
                retryable: status.is_server_error(),
            })
        }
    }

    fn extract_from_response(resp: Response, was_range_get: bool) -> Result<ServerCapabilities> {
        let final_url = resp.url().to_string();
        let headers = resp.headers();

        let content_type = headers
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let mut range_supported = false;
        let mut total_length = None;

        // Check Accept-Ranges header
        if let Some(ar) = headers.get(ACCEPT_RANGES).and_then(|v| v.to_str().ok()) {
            if ar.to_ascii_lowercase().contains("bytes") {
                range_supported = true;
            }
        }

        // If it was a 206 Partial Content, Content-Range tells us both total length and range support!
        if resp.status() == StatusCode::PARTIAL_CONTENT || was_range_get {
            if let Some(cr) = headers.get(CONTENT_RANGE).and_then(|v| v.to_str().ok()) {
                range_supported = true;
                if let Some(total_str) = cr.rsplit('/').next() {
                    if let Ok(total) = total_str.trim().parse::<u64>() {
                        total_length = Some(total);
                    }
                }
            }
        }

        // Check Content-Length if total_length is not yet known
        if total_length.is_none() {
            if let Some(cl) = headers.get(CONTENT_LENGTH).and_then(|v| v.to_str().ok()) {
                if let Ok(len) = cl.trim().parse::<u64>() {
                    total_length = Some(len);
                }
            }
        }

        // Extract suggested filename from Content-Disposition header or final URL
        let mut suggested_filename = None;
        if let Some(cd) = headers
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(fname) = Self::extract_filename_from_content_disposition(cd) {
                suggested_filename = Some(fname);
            }
        }

        if suggested_filename.is_none() {
            if let Ok(parsed_url) = url::Url::parse(&final_url) {
                if let Some(segments) = parsed_url.path_segments() {
                    let segs: Vec<&str> = segments.filter(|s| !s.is_empty()).collect();
                    let generic = [
                        "download",
                        "download.php",
                        "get",
                        "file",
                        "index.html",
                        "index.php",
                        "view",
                    ];
                    if let Some(last) = segs.last() {
                        if !generic.contains(&last.to_ascii_lowercase().as_str())
                            && last.contains('.')
                        {
                            suggested_filename =
                                Some(orveth_core::sanitize::sanitize_filename(last));
                        } else if generic.contains(&last.to_ascii_lowercase().as_str())
                            && segs.len() > 1
                        {
                            for prev in segs.iter().rev().skip(1) {
                                if !generic.contains(&prev.to_ascii_lowercase().as_str())
                                    && prev.contains('.')
                                {
                                    suggested_filename =
                                        Some(orveth_core::sanitize::sanitize_filename(prev));
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(ServerCapabilities {
            range_supported,
            content_length: total_length,
            final_url,
            content_type,
            suggested_filename,
        })
    }

    fn extract_filename_from_content_disposition(header: &str) -> Option<String> {
        if let Some(idx) = header.to_ascii_lowercase().find("filename*=") {
            let rest = &header[idx + 10..];
            let val = rest.split(';').next().unwrap_or(rest).trim();
            let encoded = val
                .strip_prefix("UTF-8''")
                .or_else(|| val.strip_prefix("utf-8''"))
                .unwrap_or(val);
            let decoded = url::form_urlencoded::parse(encoded.as_bytes())
                .map(|(k, _)| k.to_string())
                .collect::<Vec<_>>()
                .join("");
            let clean = decoded.trim().trim_matches('"').trim();
            if !clean.is_empty() {
                return Some(orveth_core::sanitize::sanitize_filename(clean));
            }
        }

        if let Some(idx) = header.to_ascii_lowercase().find("filename=") {
            let rest = &header[idx + 9..];
            let val = rest.split(';').next().unwrap_or(rest).trim();
            let clean = val.trim_matches('"').trim();
            if !clean.is_empty() {
                return Some(orveth_core::sanitize::sanitize_filename(clean));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_filename_content_disposition_standard() {
        let header = r#"attachment; filename="ghosuto-2024.iso""#;
        let fname = CapabilityDetector::extract_filename_from_content_disposition(header);
        assert_eq!(fname, Some("ghosuto-2024.iso".to_string()));
    }

    #[test]
    fn test_extract_filename_content_disposition_rfc5987() {
        let header = "attachment; filename*=UTF-8''document%20test.pdf";
        let fname = CapabilityDetector::extract_filename_from_content_disposition(header);
        assert_eq!(fname, Some("document test.pdf".to_string()));
    }
}
