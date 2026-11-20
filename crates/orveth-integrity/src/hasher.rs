use hex;
use orveth_core::error::{OrvethError, Result};
use orveth_core::state::VerificationStatus;
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerificationOutcome {
    pub status: VerificationStatus,
    pub computed_hash: String,
    pub expected_hash: Option<String>,
}

pub struct FileHasher;

impl FileHasher {
    /// Computes the SHA-256 hex digest of a file asynchronously by reading in chunks.
    pub async fn compute_sha256(path: impl AsRef<Path>) -> Result<String> {
        let path_ref = path.as_ref();
        let mut file = File::open(path_ref).await.map_err(|e| {
            OrvethError::Storage(format!("Failed to open file {}: {e}", path_ref.display()))
        })?;

        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 64 * 1024]; // 64 KiB read buffer

        loop {
            let bytes_read = file.read(&mut buffer).await.map_err(|e| {
                OrvethError::Storage(format!("Failed reading file {}: {e}", path_ref.display()))
            })?;

            if bytes_read == 0 {
                break;
            }

            hasher.update(&buffer[..bytes_read]);
        }

        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    /// Verifies a file against an optional expected SHA-256 hash.
    /// Strictly distinguishes "calculated" from "matched" vs "mismatch".
    pub async fn verify_sha256(
        path: impl AsRef<Path>,
        expected_hash: Option<&str>,
    ) -> Result<VerificationOutcome> {
        let computed = Self::compute_sha256(path).await?;

        match expected_hash {
            None => Ok(VerificationOutcome {
                status: VerificationStatus::Calculated,
                computed_hash: computed,
                expected_hash: None,
            }),
            Some(expected) => {
                let exp_clean = expected.trim().to_ascii_lowercase();
                let comp_clean = computed.to_ascii_lowercase();

                if exp_clean == comp_clean {
                    Ok(VerificationOutcome {
                        status: VerificationStatus::Matched,
                        computed_hash: comp_clean,
                        expected_hash: Some(exp_clean),
                    })
                } else {
                    Ok(VerificationOutcome {
                        status: VerificationStatus::Mismatch,
                        computed_hash: comp_clean,
                        expected_hash: Some(exp_clean),
                    })
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn test_compute_sha256() {
        let mut file = NamedTempFile::new().unwrap();
        write!(file, "hello world").unwrap();

        // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        let hash = FileHasher::compute_sha256(file.path()).await.unwrap();
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[tokio::test]
    async fn test_verify_matched() {
        let mut file = NamedTempFile::new().unwrap();
        write!(file, "hello world").unwrap();

        let outcome = FileHasher::verify_sha256(
            file.path(),
            Some("B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9"),
        )
        .await
        .unwrap();

        assert_eq!(outcome.status, VerificationStatus::Matched);
        assert_eq!(
            outcome.expected_hash.unwrap(),
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[tokio::test]
    async fn test_verify_mismatch() {
        let mut file = NamedTempFile::new().unwrap();
        write!(file, "hello world").unwrap();

        let outcome = FileHasher::verify_sha256(
            file.path(),
            Some("0000000000000000000000000000000000000000000000000000000000000000"),
        )
        .await
        .unwrap();

        assert_eq!(outcome.status, VerificationStatus::Mismatch);
    }

    #[tokio::test]
    async fn test_verify_calculated_only() {
        let mut file = NamedTempFile::new().unwrap();
        write!(file, "hello world").unwrap();

        let outcome = FileHasher::verify_sha256(file.path(), None).await.unwrap();

        assert_eq!(outcome.status, VerificationStatus::Calculated);
        assert!(outcome.expected_hash.is_none());
    }
}
