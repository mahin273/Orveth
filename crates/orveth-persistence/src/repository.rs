use crate::db::DbPool;
use chrono::{DateTime, Utc};
use orveth_core::error::{OrvethError, Result};
use orveth_core::model::{DownloadFilter, DownloadJob, EngineSettings, Segment};
use orveth_core::state::{DownloadStatus, SegmentStatus, VerificationStatus};
use sqlx::Row;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct JobRepository;

impl JobRepository {
    pub async fn insert(pool: &DbPool, job: &DownloadJob) -> Result<()> {
        let id_str = job.id.to_string();
        let dest_str = job.destination.display().to_string();
        let temp_str = job.temp_path.as_ref().map(|p| p.display().to_string());
        let status_str = job.status.to_string();
        let verif_str = job.verification_status.to_string();
        let created_str = job.created_at.to_rfc3339();
        let updated_str = job.updated_at.to_rfc3339();
        let completed_str = job.completed_at.map(|t| t.to_rfc3339());
        let segmented_int = if job.segmented { 1i64 } else { 0i64 };
        let total_bytes_i64 = job.total_bytes.map(|b| b as i64);
        let downloaded_bytes_i64 = job.downloaded_bytes as i64;

        sqlx::query(
            r#"
            INSERT INTO downloads (
                id, url, final_url, file_name, destination, temp_path,
                total_bytes, downloaded_bytes, status, category, priority,
                created_at, updated_at, completed_at, retry_count, retry_limit,
                expected_hash, hash_algorithm, verification_status, segmented,
                last_error_code, last_error_message
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?
            )
            "#,
        )
        .bind(id_str)
        .bind(&job.url)
        .bind(&job.final_url)
        .bind(&job.file_name)
        .bind(dest_str)
        .bind(temp_str)
        .bind(total_bytes_i64)
        .bind(downloaded_bytes_i64)
        .bind(status_str)
        .bind(&job.category)
        .bind(job.priority as i64)
        .bind(created_str)
        .bind(updated_str)
        .bind(completed_str)
        .bind(job.retry_count as i64)
        .bind(job.retry_limit as i64)
        .bind(&job.expected_hash)
        .bind(&job.hash_algorithm)
        .bind(verif_str)
        .bind(segmented_int)
        .bind(&job.last_error_code)
        .bind(&job.last_error_message)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed to insert download job: {e}")))?;

        Ok(())
    }

    pub async fn get(pool: &DbPool, id: Uuid) -> Result<Option<DownloadJob>> {
        let id_str = id.to_string();
        let row_opt = sqlx::query(
            r#"
            SELECT id, url, final_url, file_name, destination, temp_path,
                   total_bytes, downloaded_bytes, status, category, priority,
                   created_at, updated_at, completed_at, retry_count, retry_limit,
                   expected_hash, hash_algorithm, verification_status, segmented,
                   last_error_code, last_error_message
            FROM downloads WHERE id = ?
            "#,
        )
        .bind(id_str)
        .fetch_optional(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed to fetch download job: {e}")))?;

        match row_opt {
            Some(row) => {
                let status_str: String = row.get("status");
                let verif_str: String = row.get("verification_status");
                let created_at_str: String = row.get("created_at");
                let updated_at_str: String = row.get("updated_at");
                let completed_at_str: Option<String> = row.get("completed_at");
                let dest_str: String = row.get("destination");
                let temp_str: Option<String> = row.get("temp_path");
                let total_bytes: Option<i64> = row.get("total_bytes");
                let downloaded_bytes: i64 = row.get("downloaded_bytes");
                let segmented: i64 = row.get("segmented");
                let retry_count: i64 = row.get("retry_count");
                let retry_limit: i64 = row.get("retry_limit");
                let priority: i64 = row.get("priority");

                let status = parse_download_status(&status_str)?;
                let verification_status = parse_verification_status(&verif_str)?;
                let created_at = parse_datetime(&created_at_str)?;
                let updated_at = parse_datetime(&updated_at_str)?;
                let completed_at = completed_at_str
                    .as_deref()
                    .map(parse_datetime)
                    .transpose()?;

                Ok(Some(DownloadJob {
                    id,
                    url: row.get("url"),
                    final_url: row.get("final_url"),
                    file_name: row.get("file_name"),
                    destination: PathBuf::from(dest_str),
                    temp_path: temp_str.map(PathBuf::from),
                    total_bytes: total_bytes.map(|b| b as u64),
                    downloaded_bytes: downloaded_bytes as u64,
                    status,
                    category: row.get("category"),
                    priority: priority as i32,
                    created_at,
                    updated_at,
                    completed_at,
                    retry_count: retry_count as u32,
                    retry_limit: retry_limit as u32,
                    expected_hash: row.get("expected_hash"),
                    hash_algorithm: row.get("hash_algorithm"),
                    verification_status,
                    segmented: segmented != 0,
                    last_error_code: row.get("last_error_code"),
                    last_error_message: row.get("last_error_message"),
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn update_status(pool: &DbPool, id: Uuid, new_status: DownloadStatus) -> Result<()> {
        let current_job = Self::get(pool, id)
            .await?
            .ok_or_else(|| OrvethError::JobNotFound(id.to_string()))?;

        current_job.status.validate_transition(new_status)?;

        let id_str = id.to_string();
        let status_str = new_status.to_string();
        let now_str = Utc::now().to_rfc3339();

        sqlx::query("UPDATE downloads SET status = ?, updated_at = ? WHERE id = ?")
            .bind(status_str)
            .bind(now_str)
            .bind(id_str)
            .execute(pool)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed to update job status: {e}")))?;

        Ok(())
    }

    pub async fn update_progress(
        pool: &DbPool,
        id: Uuid,
        downloaded_bytes: u64,
        total_bytes: Option<u64>,
    ) -> Result<()> {
        let id_str = id.to_string();
        let down_i64 = downloaded_bytes as i64;
        let tot_i64 = total_bytes.map(|t| t as i64);
        let now_str = Utc::now().to_rfc3339();

        sqlx::query("UPDATE downloads SET downloaded_bytes = ?, total_bytes = COALESCE(?, total_bytes), updated_at = ? WHERE id = ?")
            .bind(down_i64)
            .bind(tot_i64)
            .bind(now_str)
            .bind(id_str)
            .execute(pool)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed to update job progress: {e}")))?;

        Ok(())
    }

    pub async fn update_metadata(
        pool: &DbPool,
        id: Uuid,
        file_name: &str,
        destination: &Path,
        final_url: Option<&str>,
        total_bytes: Option<u64>,
    ) -> Result<()> {
        let id_str = id.to_string();
        let dest_str = destination.display().to_string();
        let now_str = Utc::now().to_rfc3339();
        let tot_i64 = total_bytes.map(|t| t as i64);

        sqlx::query(
            "UPDATE downloads SET file_name = ?, destination = ?, final_url = COALESCE(?, final_url), total_bytes = COALESCE(?, total_bytes), updated_at = ? WHERE id = ?"
        )
        .bind(file_name)
        .bind(dest_str)
        .bind(final_url)
        .bind(tot_i64)
        .bind(now_str)
        .bind(id_str)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed to update job metadata: {e}")))?;

        Ok(())
    }

    pub async fn update_completed(
        pool: &DbPool,
        id: Uuid,
        final_destination: &Path,
        total_bytes: u64,
        verification_status: VerificationStatus,
    ) -> Result<()> {
        let id_str = id.to_string();
        let dest_str = final_destination.display().to_string();
        let now = Utc::now();
        let now_str = now.to_rfc3339();
        let total_i64 = total_bytes as i64;
        let verif_str = verification_status.to_string();
        let completed_status = DownloadStatus::Completed.to_string();

        sqlx::query(
            r#"
            UPDATE downloads SET
                status = ?,
                destination = ?,
                downloaded_bytes = ?,
                total_bytes = ?,
                verification_status = ?,
                completed_at = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(completed_status)
        .bind(dest_str)
        .bind(total_i64)
        .bind(total_i64)
        .bind(verif_str)
        .bind(now_str.clone())
        .bind(now_str)
        .bind(id_str)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed to update completed job: {e}")))?;

        Ok(())
    }

    pub async fn update_failed(
        pool: &DbPool,
        id: Uuid,
        error_code: &str,
        error_message: &str,
    ) -> Result<()> {
        let id_str = id.to_string();
        let now_str = Utc::now().to_rfc3339();
        let failed_status = DownloadStatus::Failed.to_string();

        sqlx::query(
            r#"
            UPDATE downloads SET
                status = ?,
                last_error_code = ?,
                last_error_message = ?,
                updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(failed_status)
        .bind(error_code)
        .bind(error_message)
        .bind(now_str)
        .bind(id_str)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed to record job failure: {e}")))?;

        Ok(())
    }

    pub async fn list(pool: &DbPool, filter: &DownloadFilter) -> Result<Vec<DownloadJob>> {
        let mut query_str = String::from(
            "SELECT id, url, final_url, file_name, destination, temp_path,
                    total_bytes, downloaded_bytes, status, category, priority,
                    created_at, updated_at, completed_at, retry_count, retry_limit,
                    expected_hash, hash_algorithm, verification_status, segmented,
                    last_error_code, last_error_message
             FROM downloads WHERE 1=1",
        );

        let mut binds = Vec::new();

        if let Some(status) = filter.status {
            query_str.push_str(" AND status = ?");
            binds.push(status.to_string());
        }

        if let Some(ref cat) = filter.category {
            query_str.push_str(" AND category = ?");
            binds.push(cat.clone());
        }

        if let Some(ref q) = filter.query {
            query_str.push_str(" AND (file_name LIKE ? OR url LIKE ?)");
            let pattern = format!("%{q}%");
            binds.push(pattern.clone());
            binds.push(pattern);
        }

        query_str.push_str(" ORDER BY priority DESC, created_at ASC");

        let mut query = sqlx::query(&query_str);
        for bind_val in binds {
            query = query.bind(bind_val);
        }

        let rows = query
            .fetch_all(pool)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed to query downloads: {e}")))?;

        let mut jobs = Vec::with_capacity(rows.len());
        for row in rows {
            let id: String = row.get("id");
            let uuid = Uuid::parse_str(&id).map_err(|e| OrvethError::Internal(e.to_string()))?;
            let status_str: String = row.get("status");
            let verif_str: String = row.get("verification_status");
            let created_at_str: String = row.get("created_at");
            let updated_at_str: String = row.get("updated_at");
            let completed_at_str: Option<String> = row.get("completed_at");
            let dest_str: String = row.get("destination");
            let temp_str: Option<String> = row.get("temp_path");
            let total_bytes: Option<i64> = row.get("total_bytes");
            let downloaded_bytes: i64 = row.get("downloaded_bytes");
            let segmented: i64 = row.get("segmented");
            let retry_count: i64 = row.get("retry_count");
            let retry_limit: i64 = row.get("retry_limit");
            let priority: i64 = row.get("priority");

            jobs.push(DownloadJob {
                id: uuid,
                url: row.get("url"),
                final_url: row.get("final_url"),
                file_name: row.get("file_name"),
                destination: PathBuf::from(dest_str),
                temp_path: temp_str.map(PathBuf::from),
                total_bytes: total_bytes.map(|b| b as u64),
                downloaded_bytes: downloaded_bytes as u64,
                status: parse_download_status(&status_str)?,
                category: row.get("category"),
                priority: priority as i32,
                created_at: parse_datetime(&created_at_str)?,
                updated_at: parse_datetime(&updated_at_str)?,
                completed_at: completed_at_str
                    .as_deref()
                    .map(parse_datetime)
                    .transpose()?,
                retry_count: retry_count as u32,
                retry_limit: retry_limit as u32,
                expected_hash: row.get("expected_hash"),
                hash_algorithm: row.get("hash_algorithm"),
                verification_status: parse_verification_status(&verif_str)?,
                segmented: segmented != 0,
                last_error_code: row.get("last_error_code"),
                last_error_message: row.get("last_error_message"),
            });
        }

        Ok(jobs)
    }

    pub async fn delete(pool: &DbPool, id: Uuid) -> Result<()> {
        let id_str = id.to_string();
        let _ = sqlx::query("DELETE FROM segments WHERE download_id = ?")
            .bind(&id_str)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM download_events WHERE download_id = ?")
            .bind(&id_str)
            .execute(pool)
            .await;
        sqlx::query("DELETE FROM downloads WHERE id = ?")
            .bind(id_str)
            .execute(pool)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed to delete job: {e}")))?;
        Ok(())
    }
}

pub struct SegmentRepository;

impl SegmentRepository {
    pub async fn insert_batch(pool: &DbPool, segments: &[Segment]) -> Result<()> {
        let mut tx = pool
            .begin()
            .await
            .map_err(|e| OrvethError::Database(format!("Failed to start transaction: {e}")))?;

        for seg in segments {
            let id_str = seg.id.to_string();
            let dl_id_str = seg.download_id.to_string();
            let start_i64 = seg.start_byte as i64;
            let end_i64 = seg.end_byte as i64;
            let rec_i64 = seg.received_bytes as i64;
            let status_str = seg.status.to_string();
            let temp_str = seg.temp_path.display().to_string();
            let retry_i64 = seg.retry_count as i64;
            let now_str = seg.updated_at.to_rfc3339();

            sqlx::query(
                r#"
                INSERT INTO segments (
                    id, download_id, start_byte, end_byte, received_bytes,
                    status, temp_path, retry_count, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(id_str)
            .bind(dl_id_str)
            .bind(start_i64)
            .bind(end_i64)
            .bind(rec_i64)
            .bind(status_str)
            .bind(temp_str)
            .bind(retry_i64)
            .bind(now_str)
            .execute(&mut *tx)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed inserting segment: {e}")))?;
        }

        tx.commit()
            .await
            .map_err(|e| OrvethError::Database(format!("Failed committing segment batch: {e}")))?;

        Ok(())
    }

    pub async fn get_for_job(pool: &DbPool, job_id: Uuid) -> Result<Vec<Segment>> {
        let dl_id_str = job_id.to_string();
        let rows = sqlx::query(
            r#"
            SELECT id, download_id, start_byte, end_byte, received_bytes,
                   status, temp_path, retry_count, updated_at
            FROM segments WHERE download_id = ?
            ORDER BY start_byte ASC
            "#,
        )
        .bind(dl_id_str)
        .fetch_all(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed fetching segments: {e}")))?;

        let mut segments = Vec::with_capacity(rows.len());
        for row in rows {
            let id_str: String = row.get("id");
            let id = Uuid::parse_str(&id_str)
                .map_err(|e| OrvethError::Internal(format!("Invalid segment UUID: {e}")))?;
            let status_str: String = row.get("status");
            let status = parse_segment_status(&status_str)?;
            let updated_at_str: String = row.get("updated_at");
            let updated_at = parse_datetime(&updated_at_str)?;
            let start_byte: i64 = row.get("start_byte");
            let end_byte: i64 = row.get("end_byte");
            let received_bytes: i64 = row.get("received_bytes");
            let temp_path: String = row.get("temp_path");
            let retry_count: i64 = row.get("retry_count");

            segments.push(Segment {
                id,
                download_id: job_id,
                start_byte: start_byte as u64,
                end_byte: end_byte as u64,
                received_bytes: received_bytes as u64,
                status,
                temp_path: PathBuf::from(temp_path),
                retry_count: retry_count as u32,
                updated_at,
            });
        }

        Ok(segments)
    }

    pub async fn update_progress(
        pool: &DbPool,
        segment_id: Uuid,
        received_bytes: u64,
        status: SegmentStatus,
    ) -> Result<()> {
        let id_str = segment_id.to_string();
        let rec_i64 = received_bytes as i64;
        let status_str = status.to_string();
        let now_str = Utc::now().to_rfc3339();

        sqlx::query(
            "UPDATE segments SET received_bytes = ?, status = ?, updated_at = ? WHERE id = ?",
        )
        .bind(rec_i64)
        .bind(status_str)
        .bind(now_str)
        .bind(id_str)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed updating segment progress: {e}")))?;

        Ok(())
    }
}

pub struct SettingsRepository;

impl SettingsRepository {
    pub async fn get_settings(pool: &DbPool) -> Result<EngineSettings> {
        let row_opt = sqlx::query("SELECT value_json FROM settings WHERE key = 'engine'")
            .fetch_optional(pool)
            .await
            .map_err(|e| OrvethError::Database(format!("Failed fetching settings: {e}")))?;

        match row_opt {
            Some(row) => {
                let json_str: String = row.get("value_json");
                let s: EngineSettings = serde_json::from_str(&json_str).map_err(|e| {
                    OrvethError::Database(format!("Failed parsing stored settings JSON: {e}"))
                })?;
                Ok(s)
            }
            None => Ok(EngineSettings::default()),
        }
    }

    pub async fn save_settings(pool: &DbPool, settings: &EngineSettings) -> Result<()> {
        let json_str = serde_json::to_string(settings)
            .map_err(|e| OrvethError::Database(format!("Failed serializing settings: {e}")))?;

        sqlx::query(
            "INSERT INTO settings (key, value_json) VALUES ('engine', ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
        )
        .bind(json_str)
        .execute(pool)
        .await
        .map_err(|e| OrvethError::Database(format!("Failed saving settings: {e}")))?;

        Ok(())
    }
}

fn parse_download_status(s: &str) -> Result<DownloadStatus> {
    match s {
        "queued" => Ok(DownloadStatus::Queued),
        "preparing" => Ok(DownloadStatus::Preparing),
        "downloading" => Ok(DownloadStatus::Downloading),
        "pausing" => Ok(DownloadStatus::Pausing),
        "paused" => Ok(DownloadStatus::Paused),
        "retrying" => Ok(DownloadStatus::Retrying),
        "verifying" => Ok(DownloadStatus::Verifying),
        "completed" => Ok(DownloadStatus::Completed),
        "failed" => Ok(DownloadStatus::Failed),
        "canceled" => Ok(DownloadStatus::Canceled),
        "needs_attention" => Ok(DownloadStatus::NeedsAttention),
        _ => Err(OrvethError::Internal(format!(
            "Unknown download status: {s}"
        ))),
    }
}

fn parse_segment_status(s: &str) -> Result<SegmentStatus> {
    match s {
        "pending" => Ok(SegmentStatus::Pending),
        "downloading" => Ok(SegmentStatus::Downloading),
        "paused" => Ok(SegmentStatus::Paused),
        "retrying" => Ok(SegmentStatus::Retrying),
        "completed" => Ok(SegmentStatus::Completed),
        "failed" => Ok(SegmentStatus::Failed),
        _ => Err(OrvethError::Internal(format!(
            "Unknown segment status: {s}"
        ))),
    }
}

fn parse_verification_status(s: &str) -> Result<VerificationStatus> {
    match s {
        "not_requested" => Ok(VerificationStatus::NotRequested),
        "calculated" => Ok(VerificationStatus::Calculated),
        "matched" => Ok(VerificationStatus::Matched),
        "mismatch" => Ok(VerificationStatus::Mismatch),
        "error" => Ok(VerificationStatus::Error),
        _ => Err(OrvethError::Internal(format!(
            "Unknown verification status: {s}"
        ))),
    }
}

fn parse_datetime(s: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| OrvethError::Internal(format!("Invalid datetime '{s}': {e}")))
}
