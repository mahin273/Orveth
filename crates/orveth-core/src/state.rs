use crate::error::{OrvethError, Result};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Preparing,
    Downloading,
    Pausing,
    Paused,
    Retrying,
    Verifying,
    Completed,
    Failed,
    Canceled,
    NeedsAttention,
}

impl fmt::Display for DownloadStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Queued => "queued",
            Self::Preparing => "preparing",
            Self::Downloading => "downloading",
            Self::Pausing => "pausing",
            Self::Paused => "paused",
            Self::Retrying => "retrying",
            Self::Verifying => "verifying",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Canceled => "canceled",
            Self::NeedsAttention => "needs_attention",
        };
        write!(f, "{s}")
    }
}

impl DownloadStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Canceled)
    }

    pub fn is_active(&self) -> bool {
        matches!(
            self,
            Self::Preparing | Self::Downloading | Self::Pausing | Self::Retrying | Self::Verifying
        )
    }

    pub fn can_transition_to(&self, next: DownloadStatus) -> bool {
        if *self == next {
            return true;
        }

        match (self, next) {
            // From Queued
            (Self::Queued, Self::Preparing) => true,
            (Self::Queued, Self::Canceled) => true,
            (Self::Queued, Self::Paused) => true,

            // From Preparing
            (Self::Preparing, Self::Downloading) => true,
            (Self::Preparing, Self::Failed) => true,
            (Self::Preparing, Self::Canceled) => true,
            (Self::Preparing, Self::Pausing) => true,
            (Self::Preparing, Self::Paused) => true,
            (Self::Preparing, Self::NeedsAttention) => true,

            // From Downloading
            (Self::Downloading, Self::Pausing) => true,
            (Self::Downloading, Self::Paused) => true,
            (Self::Downloading, Self::Retrying) => true,
            (Self::Downloading, Self::Verifying) => true,
            (Self::Downloading, Self::Completed) => true, // when verification skipped
            (Self::Downloading, Self::Failed) => true,
            (Self::Downloading, Self::Canceled) => true,
            (Self::Downloading, Self::NeedsAttention) => true,

            // From Pausing
            (Self::Pausing, Self::Paused) => true,
            (Self::Pausing, Self::Failed) => true,
            (Self::Pausing, Self::Canceled) => true,

            // From Paused
            (Self::Paused, Self::Queued) => true,
            (Self::Paused, Self::Preparing) => true,
            (Self::Paused, Self::Downloading) => true,
            (Self::Paused, Self::Canceled) => true,
            (Self::Paused, Self::NeedsAttention) => true,

            // From Retrying
            (Self::Retrying, Self::Downloading) => true,
            (Self::Retrying, Self::Preparing) => true,
            (Self::Retrying, Self::Failed) => true,
            (Self::Retrying, Self::Canceled) => true,
            (Self::Retrying, Self::Pausing) => true,
            (Self::Retrying, Self::Paused) => true,

            // From Verifying
            (Self::Verifying, Self::Completed) => true,
            (Self::Verifying, Self::Failed) => true,
            (Self::Verifying, Self::Canceled) => true,

            // From Failed
            (Self::Failed, Self::Queued) => true, // manual retry
            (Self::Failed, Self::Preparing) => true,
            (Self::Failed, Self::Canceled) => true,

            // From NeedsAttention
            (Self::NeedsAttention, Self::Queued) => true,
            (Self::NeedsAttention, Self::Preparing) => true,
            (Self::NeedsAttention, Self::Canceled) => true,

            // Terminal states
            (Self::Completed, _) => false,
            (Self::Canceled, _) => false,

            // Any other unspecified transition is invalid
            _ => false,
        }
    }

    pub fn validate_transition(&self, next: DownloadStatus) -> Result<()> {
        if self.can_transition_to(next) {
            Ok(())
        } else {
            Err(OrvethError::InvalidStateTransition {
                from: self.to_string(),
                to: next.to_string(),
            })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SegmentStatus {
    Pending,
    Downloading,
    Paused,
    Retrying,
    Completed,
    Failed,
}

impl fmt::Display for SegmentStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Downloading => "downloading",
            Self::Paused => "paused",
            Self::Retrying => "retrying",
            Self::Completed => "completed",
            Self::Failed => "failed",
        };
        write!(f, "{s}")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VerificationStatus {
    NotRequested,
    Calculated,
    Matched,
    Mismatch,
    Error,
}

impl fmt::Display for VerificationStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::NotRequested => "not_requested",
            Self::Calculated => "calculated",
            Self::Matched => "matched",
            Self::Mismatch => "mismatch",
            Self::Error => "error",
        };
        write!(f, "{s}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        assert!(DownloadStatus::Queued
            .validate_transition(DownloadStatus::Preparing)
            .is_ok());
        assert!(DownloadStatus::Preparing
            .validate_transition(DownloadStatus::Downloading)
            .is_ok());
        assert!(DownloadStatus::Downloading
            .validate_transition(DownloadStatus::Pausing)
            .is_ok());
        assert!(DownloadStatus::Pausing
            .validate_transition(DownloadStatus::Paused)
            .is_ok());
        assert!(DownloadStatus::Paused
            .validate_transition(DownloadStatus::Preparing)
            .is_ok());
        assert!(DownloadStatus::Downloading
            .validate_transition(DownloadStatus::Verifying)
            .is_ok());
        assert!(DownloadStatus::Verifying
            .validate_transition(DownloadStatus::Completed)
            .is_ok());
        assert!(DownloadStatus::Failed
            .validate_transition(DownloadStatus::Queued)
            .is_ok());
    }

    #[test]
    fn test_invalid_transitions() {
        assert!(DownloadStatus::Completed
            .validate_transition(DownloadStatus::Downloading)
            .is_err());
        assert!(DownloadStatus::Canceled
            .validate_transition(DownloadStatus::Queued)
            .is_err());
        assert!(DownloadStatus::Queued
            .validate_transition(DownloadStatus::Completed)
            .is_err());
    }
}
