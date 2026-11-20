use orveth_core::error::{OrvethError, Result};
use orveth_core::model::{CollisionPolicy, Segment};
use std::path::{Path, PathBuf};
use tokio::fs::{self, File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct StorageManager {
    base_temp_dir: PathBuf,
}

impl StorageManager {
    pub fn new(base_temp_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_temp_dir: base_temp_dir.into(),
        }
    }

    pub fn default_temp_dir() -> PathBuf {
        std::env::temp_dir().join("orveth")
    }

    pub fn temp_dir_for_job(&self, job_id: Uuid) -> PathBuf {
        self.base_temp_dir.join(format!("job_{job_id}"))
    }

    pub async fn init_job_storage(&self, job_id: Uuid) -> Result<PathBuf> {
        let dir = self.temp_dir_for_job(job_id);
        fs::create_dir_all(&dir).await.map_err(|e| {
            OrvethError::Storage(format!(
                "Failed to create job temp directory {}: {e}",
                dir.display()
            ))
        })?;
        Ok(dir)
    }

    pub fn segment_path(&self, job_id: Uuid, segment_index: usize) -> PathBuf {
        self.temp_dir_for_job(job_id)
            .join(format!("part_{segment_index}.bin"))
    }

    pub fn single_stream_temp_path(&self, job_id: Uuid, file_name: &str) -> PathBuf {
        self.temp_dir_for_job(job_id)
            .join(format!("single_{file_name}.part"))
    }

    /// Resolves destination collisions according to policy
    pub async fn resolve_destination(
        destination: &Path,
        policy: CollisionPolicy,
    ) -> Result<PathBuf> {
        if !destination.exists() {
            return Ok(destination.to_path_buf());
        }

        match policy {
            CollisionPolicy::Overwrite => Ok(destination.to_path_buf()),
            CollisionPolicy::Prompt => Err(OrvethError::FileAlreadyExists(
                destination.display().to_string(),
            )),
            CollisionPolicy::Rename => {
                let parent = destination.parent().unwrap_or_else(|| Path::new("."));
                let file_stem = destination
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("download");
                let extension = destination.extension().and_then(|e| e.to_str());

                let mut counter = 1;
                loop {
                    let new_name = match extension {
                        Some(ext) => format!("{file_stem} ({counter}).{ext}"),
                        None => format!("{file_stem} ({counter})"),
                    };
                    let candidate = parent.join(new_name);
                    if !candidate.exists() {
                        return Ok(candidate);
                    }
                    counter += 1;
                    if counter > 10_000 {
                        return Err(OrvethError::Storage(
                            "Too many filename collisions encountered".to_string(),
                        ));
                    }
                }
            }
        }
    }

    /// Assembles verified segments sequentially into an assembled temporary complete file.
    pub async fn assemble_segments(
        &self,
        _job_id: Uuid,
        segments: &[Segment],
        assembled_path: &Path,
    ) -> Result<u64> {
        if segments.is_empty() {
            return Err(OrvethError::SegmentValidationFailed(
                "Cannot assemble empty segments list".to_string(),
            ));
        }

        // Sort segments by start_byte to ensure strict sequential order
        let mut sorted = segments.to_vec();
        sorted.sort_by_key(|s| s.start_byte);

        // Verify no gaps or overlaps
        let mut expected_start = 0u64;
        for s in &sorted {
            if s.start_byte != expected_start {
                return Err(OrvethError::SegmentPlanningError(s.start_byte));
            }
            expected_start = s.end_byte + 1;
        }

        if let Some(parent) = assembled_path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                OrvethError::Storage(format!("Failed to create assembled parent dir: {e}"))
            })?;
        }

        let mut out_file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(assembled_path)
            .await
            .map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed opening assembled output file {}: {e}",
                    assembled_path.display()
                ))
            })?;

        let mut total_written = 0u64;
        let mut buffer = vec![0u8; 64 * 1024];

        for seg in &sorted {
            let mut seg_file = File::open(&seg.temp_path).await.map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed opening segment file {}: {e}",
                    seg.temp_path.display()
                ))
            })?;

            let mut seg_written = 0u64;
            let expected_len = seg.expected_length();

            loop {
                let n = seg_file.read(&mut buffer).await.map_err(|e| {
                    OrvethError::Storage(format!(
                        "Error reading segment {}: {e}",
                        seg.temp_path.display()
                    ))
                })?;

                if n == 0 {
                    break;
                }

                out_file.write_all(&buffer[..n]).await.map_err(|e| {
                    OrvethError::Storage(format!(
                        "Error writing to assembled output {}: {e}",
                        assembled_path.display()
                    ))
                })?;

                seg_written += n as u64;
            }

            if seg_written != expected_len {
                return Err(OrvethError::ContentLengthMismatch {
                    expected: expected_len,
                    received: seg_written,
                });
            }

            total_written += seg_written;
        }

        out_file
            .flush()
            .await
            .map_err(|e| OrvethError::Storage(format!("Failed to flush assembled file: {e}")))?;

        Ok(total_written)
    }

    /// Atomically finalizes a file by moving or copying it from temp to the resolved destination.
    pub async fn finalize_file(
        source_temp_path: &Path,
        target_destination: &Path,
        policy: CollisionPolicy,
    ) -> Result<PathBuf> {
        let final_dest = Self::resolve_destination(target_destination, policy).await?;

        if let Some(parent) = final_dest.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed to create destination directory {}: {e}",
                    parent.display()
                ))
            })?;
        }

        // Try atomic rename first (works on same filesystem)
        if fs::rename(source_temp_path, &final_dest).await.is_err() {
            // Fall back to copy + remove for cross-device/filesystem moves
            fs::copy(source_temp_path, &final_dest).await.map_err(|e| {
                OrvethError::Storage(format!(
                    "Failed copying from {} to {}: {e}",
                    source_temp_path.display(),
                    final_dest.display()
                ))
            })?;

            let _ = fs::remove_file(source_temp_path).await;
        }

        Ok(final_dest)
    }

    /// Cleans up temporary files and folder for a specific download job.
    pub async fn cleanup_job(&self, job_id: Uuid) -> Result<()> {
        let dir = self.temp_dir_for_job(job_id);
        if dir.exists() {
            fs::remove_dir_all(&dir).await.map_err(|e| {
                OrvethError::Storage(format!("Failed to remove temp dir {}: {e}", dir.display()))
            })?;
        }
        Ok(())
    }

    /// Queries the byte length of a file on disk.
    pub async fn get_file_size(path: &Path) -> Result<u64> {
        let meta = fs::metadata(path).await.map_err(|e| {
            OrvethError::Storage(format!("Failed to inspect {}: {e}", path.display()))
        })?;
        Ok(meta.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_resolve_destination_collision_rename() {
        let tmp = tempdir().unwrap();
        let target = tmp.path().join("archive.zip");

        // First time - file doesn't exist
        let res1 = StorageManager::resolve_destination(&target, CollisionPolicy::Rename)
            .await
            .unwrap();
        assert_eq!(res1, target);

        // Create the file
        fs::write(&target, b"original").await.unwrap();

        // Second time - collision resolved with rename
        let res2 = StorageManager::resolve_destination(&target, CollisionPolicy::Rename)
            .await
            .unwrap();
        assert_eq!(res2, tmp.path().join("archive (1).zip"));

        // Create archive (1).zip
        fs::write(&res2, b"part1").await.unwrap();

        // Third time - next counter
        let res3 = StorageManager::resolve_destination(&target, CollisionPolicy::Rename)
            .await
            .unwrap();
        assert_eq!(res3, tmp.path().join("archive (2).zip"));
    }

    #[tokio::test]
    async fn test_assemble_segments_strict_order() {
        let tmp = tempdir().unwrap();
        let storage = StorageManager::new(tmp.path());
        let job_id = Uuid::new_v4();
        storage.init_job_storage(job_id).await.unwrap();

        let p1 = storage.segment_path(job_id, 0);
        let p2 = storage.segment_path(job_id, 1);

        fs::write(&p1, b"Hello, ").await.unwrap();
        fs::write(&p2, b"World!").await.unwrap();

        let s1 = Segment {
            id: Uuid::new_v4(),
            download_id: job_id,
            start_byte: 0,
            end_byte: 6,
            received_bytes: 7,
            status: orveth_core::state::SegmentStatus::Completed,
            temp_path: p1,
            retry_count: 0,
            updated_at: chrono::Utc::now(),
        };

        let s2 = Segment {
            id: Uuid::new_v4(),
            download_id: job_id,
            start_byte: 7,
            end_byte: 12,
            received_bytes: 6,
            status: orveth_core::state::SegmentStatus::Completed,
            temp_path: p2,
            retry_count: 0,
            updated_at: chrono::Utc::now(),
        };

        let assembled = tmp.path().join("assembled.txt");
        let bytes_written = storage
            .assemble_segments(job_id, &[s2, s1], &assembled) // pass in reverse order to test sorting
            .await
            .unwrap();

        assert_eq!(bytes_written, 13);
        let content = fs::read_to_string(&assembled).await.unwrap();
        assert_eq!(content, "Hello, World!");
    }

    #[tokio::test]
    async fn test_assemble_segments_detects_gap() {
        let tmp = tempdir().unwrap();
        let storage = StorageManager::new(tmp.path());
        let job_id = Uuid::new_v4();

        let s1 = Segment::new(job_id, 0, 10, tmp.path().join("p1"));
        let s2 = Segment::new(job_id, 15, 20, tmp.path().join("p2")); // gap: 11-14

        let assembled = tmp.path().join("assembled.txt");
        let err = storage
            .assemble_segments(job_id, &[s1, s2], &assembled)
            .await
            .unwrap_err();

        match err {
            OrvethError::SegmentPlanningError(gap_byte) => assert_eq!(gap_byte, 15),
            _ => panic!("Expected SegmentPlanningError"),
        }
    }
}
