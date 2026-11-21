use orveth_core::error::{OrvethError, Result};
use orveth_core::model::{MediaFormatInfo, MediaInspectionResult, YtDlpStatus};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{info, warn};
use url::Url;

pub struct MediaExtractor;

impl MediaExtractor {
    /// Resolves the yt-dlp executable path if present.
    pub fn resolve_binary(custom_path: Option<&str>) -> Option<PathBuf> {
        if let Some(custom) = custom_path {
            let trimmed = custom.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                if p.is_file() {
                    return Some(p);
                }
                return None;
            }
        }

        // Check standard user directory ~/.local/share/orveth/bin/yt-dlp
        let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"));
        if let Ok(h) = home {
            let orveth_bin = PathBuf::from(&h).join(".local/share/orveth/bin/yt-dlp");
            if orveth_bin.is_file() {
                return Some(orveth_bin);
            }

            let local_bin = PathBuf::from(&h).join(".local/bin/yt-dlp");
            if local_bin.is_file() {
                return Some(local_bin);
            }
        }

        #[cfg(windows)]
        {
            if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
                let orveth_bin = PathBuf::from(local_app)
                    .join("Orveth")
                    .join("bin")
                    .join("yt-dlp.exe");
                if orveth_bin.is_file() {
                    return Some(orveth_bin);
                }
            }
        }

        // Check system locations
        let common_paths = ["/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", "/bin/yt-dlp"];
        for cp in &common_paths {
            let p = PathBuf::from(cp);
            if p.is_file() {
                return Some(p);
            }
        }

        // Search PATH environment variable
        if let Ok(path_var) = std::env::var("PATH") {
            for entry in std::env::split_paths(&path_var) {
                let candidate = entry.join("yt-dlp");
                if candidate.is_file() {
                    return Some(candidate);
                }
                #[cfg(windows)]
                {
                    let candidate_win = entry.join("yt-dlp.exe");
                    if candidate_win.is_file() {
                        return Some(candidate_win);
                    }
                }
            }
        }

        None
    }

    /// Checks whether yt-dlp is available and returns version info.
    pub async fn check_status(custom_path: Option<&str>) -> YtDlpStatus {
        let binary = match Self::resolve_binary(custom_path) {
            Some(b) => b,
            None => {
                return YtDlpStatus {
                    available: false,
                    path: None,
                    version: None,
                }
            }
        };

        let output = tokio::time::timeout(
            Duration::from_secs(4),
            tokio::process::Command::new(&binary)
                .arg("--version")
                .output(),
        )
        .await;

        match output {
            Ok(Ok(out)) if out.status.success() => {
                let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
                YtDlpStatus {
                    available: true,
                    path: Some(binary.to_string_lossy().to_string()),
                    version: if ver.is_empty() { None } else { Some(ver) },
                }
            }
            _ => YtDlpStatus {
                available: false,
                path: Some(binary.to_string_lossy().to_string()),
                version: None,
            },
        }
    }

    /// Downloads and installs official standalone yt-dlp binary into target directory.
    pub async fn install_ytdlp(client: &reqwest::Client, target_dir: &Path) -> Result<YtDlpStatus> {
        tokio::fs::create_dir_all(target_dir).await.map_err(|e| {
            OrvethError::Storage(format!("Failed to create directory for yt-dlp: {e}"))
        })?;

        #[cfg(windows)]
        let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
        #[cfg(not(windows))]
        let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

        let binary_name = if cfg!(windows) {
            "yt-dlp.exe"
        } else {
            "yt-dlp"
        };
        let final_path = target_dir.join(binary_name);
        let tmp_path = target_dir.join(format!("{binary_name}.tmp"));

        info!(url = %download_url, target = %target_dir.display(), "Downloading standalone yt-dlp binary");

        let response =
            client.get(download_url).send().await.map_err(|e| {
                OrvethError::Network(format!("Failed to download yt-dlp binary: {e}"))
            })?;

        if !response.status().is_success() {
            return Err(OrvethError::Network(format!(
                "Failed to download yt-dlp: HTTP status {}",
                response.status()
            )));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| OrvethError::Network(format!("Failed to read yt-dlp payload: {e}")))?;

        tokio::fs::write(&tmp_path, &bytes)
            .await
            .map_err(|e| OrvethError::Storage(format!("Failed to write yt-dlp temp file: {e}")))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&tmp_path, permissions).map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed to set executable permissions on yt-dlp: {e}"
                ))
            })?;
        }

        tokio::fs::rename(&tmp_path, &final_path)
            .await
            .map_err(|e| OrvethError::Storage(format!("Failed to rename yt-dlp binary: {e}")))?;

        let final_str = final_path.to_string_lossy().to_string();
        let status = Self::check_status(Some(&final_str)).await;
        if !status.available {
            warn!(path = %final_str, "yt-dlp binary was written but execution check failed");
        }

        Ok(status)
    }

    /// Parses yt-dlp single-json output into structured MediaInspectionResult.
    pub fn parse_ytdlp_json(json_str: &str, fallback_url: &str) -> Result<MediaInspectionResult> {
        let root: Value = serde_json::from_str(json_str)
            .map_err(|e| OrvethError::Media(format!("Failed to parse media metadata JSON: {e}")))?;

        let title = root
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Media Resource")
            .to_string();

        let uploader = root
            .get("uploader")
            .or_else(|| root.get("channel"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let duration_seconds = root
            .get("duration")
            .and_then(|v| v.as_f64())
            .map(|d| d as u64);

        let thumbnail_url = root
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let mut formats = Vec::new();

        if let Some(raw_formats) = root.get("formats").and_then(|v| v.as_array()) {
            for f in raw_formats {
                let format_id = match f.get("format_id").and_then(|v| v.as_str()) {
                    Some(id) if !id.trim().is_empty() => id.trim().to_string(),
                    _ => continue,
                };

                let ext = f
                    .get("ext")
                    .and_then(|v| v.as_str())
                    .unwrap_or("mp4")
                    .to_string();

                // Skip storyboards or internal formats
                if ext == "mhtml" || format_id.contains("storyboard") {
                    continue;
                }

                let vcodec = f
                    .get("vcodec")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let acodec = f
                    .get("acodec")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let has_video = vcodec.as_deref().is_some_and(|c| c != "none");
                let has_audio = acodec.as_deref().is_some_and(|c| c != "none");

                // Note or description
                let note = f
                    .get("format_note")
                    .or_else(|| f.get("format"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Resolution
                let resolution = if let (Some(w), Some(h)) = (
                    f.get("width").and_then(|v| v.as_u64()),
                    f.get("height").and_then(|v| v.as_u64()),
                ) {
                    Some(format!("{w}x{h}"))
                } else {
                    f.get("resolution")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                };

                // Approximate filesize
                let filesize_approx = f
                    .get("filesize")
                    .or_else(|| f.get("filesize_approx"))
                    .and_then(|v| v.as_u64());

                // Direct stream URL if exposed in dump-json
                let direct_url = f.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());

                formats.push(MediaFormatInfo {
                    format_id,
                    ext,
                    resolution,
                    note,
                    filesize_approx,
                    vcodec,
                    acodec,
                    is_video: has_video,
                    is_audio: has_audio,
                    direct_url,
                });
            }
        }

        // Sort formats: Video streams first (highest resolution/quality), then audio-only streams
        formats.sort_by(|a, b| {
            match (a.is_video, b.is_video) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => {
                    // Compare filesize or resolution
                    b.filesize_approx.cmp(&a.filesize_approx)
                }
            }
        });

        Ok(MediaInspectionResult {
            url: fallback_url.to_string(),
            title,
            uploader,
            duration_seconds,
            thumbnail_url,
            formats,
        })
    }

    /// Inspects media resources via yt-dlp CLI dump-json.
    pub async fn inspect_media(
        binary_path: &Path,
        url: &str,
        proxy_url: Option<&str>,
    ) -> Result<MediaInspectionResult> {
        let parsed = Url::parse(url)
            .map_err(|e| OrvethError::InvalidUrl(format!("Invalid media URL '{url}': {e}")))?;

        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(OrvethError::InvalidUrl(
                "Media extraction requires http or https URL".to_string(),
            ));
        }

        let mut cmd = tokio::process::Command::new(binary_path);
        cmd.arg("--dump-single-json")
            .arg("--no-warnings")
            .arg("--no-playlist")
            .arg("--skip-download");

        if let Some(proxy) = proxy_url {
            let trimmed = proxy.trim();
            if !trimmed.is_empty() {
                cmd.arg("--proxy").arg(trimmed);
            }
        }

        cmd.arg(url);

        let output = tokio::time::timeout(Duration::from_secs(35), cmd.output())
            .await
            .map_err(|_| {
                OrvethError::Network("Media inspection timed out after 35 seconds".to_string())
            })?
            .map_err(|e| OrvethError::Media(format!("Failed to execute yt-dlp: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let msg = if stderr.is_empty() {
                format!("yt-dlp failed with exit code {:?}", output.status.code())
            } else {
                stderr
            };
            return Err(OrvethError::Media(format!("Media extraction error: {msg}")));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Self::parse_ytdlp_json(&stdout, url)
    }

    /// Resolves direct downloadable media stream URL for the specified format.
    pub async fn resolve_stream_url(
        binary_path: &Path,
        url: &str,
        format_id: &str,
        proxy_url: Option<&str>,
    ) -> Result<String> {
        let parsed =
            Url::parse(url).map_err(|e| OrvethError::InvalidUrl(format!("Invalid URL: {e}")))?;

        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(OrvethError::InvalidUrl(
                "Media stream resolution requires http or https URL".to_string(),
            ));
        }

        let mut cmd = tokio::process::Command::new(binary_path);
        cmd.arg("-g").arg("-f").arg(format_id).arg("--no-warnings");

        if let Some(proxy) = proxy_url {
            let trimmed = proxy.trim();
            if !trimmed.is_empty() {
                cmd.arg("--proxy").arg(trimmed);
            }
        }

        cmd.arg(url);

        let output = tokio::time::timeout(Duration::from_secs(30), cmd.output())
            .await
            .map_err(|_| {
                OrvethError::Network("Stream resolution timed out after 30 seconds".to_string())
            })?
            .map_err(|e| OrvethError::Media(format!("Failed to execute yt-dlp: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(OrvethError::Media(format!(
                "Failed to resolve stream URL: {stderr}"
            )));
        }

        let stream_url = String::from_utf8_lossy(&output.stdout)
            .trim()
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if stream_url.is_empty() {
            return Err(OrvethError::Media(
                "yt-dlp returned an empty stream URL".to_string(),
            ));
        }

        Ok(stream_url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_binary_non_existent() {
        let non_existent = MediaExtractor::resolve_binary(Some("/path/to/definitely/fake/binary"));
        assert!(non_existent.is_none());
    }

    #[test]
    fn test_parse_ytdlp_json() {
        let mock_json = r#"{
            "title": "Big Buck Bunny 4K Test",
            "uploader": "Blender Foundation",
            "duration": 596.0,
            "thumbnail": "https://example.com/thumb.jpg",
            "formats": [
                {
                    "format_id": "137",
                    "ext": "mp4",
                    "format_note": "1080p",
                    "width": 1920,
                    "height": 1080,
                    "vcodec": "avc1.640028",
                    "acodec": "none",
                    "filesize": 154200000,
                    "url": "https://example.com/video_1080p.mp4"
                },
                {
                    "format_id": "140",
                    "ext": "m4a",
                    "format_note": "medium audio",
                    "vcodec": "none",
                    "acodec": "mp4a.40.2",
                    "filesize": 9400000,
                    "url": "https://example.com/audio_140.m4a"
                },
                {
                    "format_id": "storyboard-1",
                    "ext": "mhtml",
                    "format_note": "storyboard",
                    "vcodec": "none",
                    "acodec": "none"
                }
            ]
        }"#;

        let res =
            MediaExtractor::parse_ytdlp_json(mock_json, "https://example.com/watch?v=123").unwrap();
        assert_eq!(res.title, "Big Buck Bunny 4K Test");
        assert_eq!(res.uploader.as_deref(), Some("Blender Foundation"));
        assert_eq!(res.duration_seconds, Some(596));
        assert_eq!(
            res.thumbnail_url.as_deref(),
            Some("https://example.com/thumb.jpg")
        );

        // storyboard should have been excluded
        assert_eq!(res.formats.len(), 2);

        // Video format should be first
        let video = &res.formats[0];
        assert_eq!(video.format_id, "137");
        assert_eq!(video.ext, "mp4");
        assert_eq!(video.resolution.as_deref(), Some("1920x1080"));
        assert!(video.is_video);
        assert!(!video.is_audio);
        assert_eq!(video.filesize_approx, Some(154200000));
        assert_eq!(
            video.direct_url.as_deref(),
            Some("https://example.com/video_1080p.mp4")
        );

        // Audio format should be second
        let audio = &res.formats[1];
        assert_eq!(audio.format_id, "140");
        assert_eq!(audio.ext, "m4a");
        assert!(!audio.is_video);
        assert!(audio.is_audio);
        assert_eq!(audio.filesize_approx, Some(9400000));
    }

    #[tokio::test]
    async fn test_check_status_non_existent() {
        let status = MediaExtractor::check_status(Some("/tmp/definitely_not_a_binary_12345")).await;
        assert!(!status.available);
        assert!(status.path.is_none());
        assert!(status.version.is_none());
    }
}
