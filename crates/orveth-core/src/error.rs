use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum OrvethError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Invalid state transition from {from} to {to}")]
    InvalidStateTransition { from: String, to: String },

    #[error("Invalid filename: {0}")]
    InvalidFilename(String),

    #[error("Resource range not supported")]
    RangeNotSupported,

    #[error("Invalid Content-Range header: {0}")]
    InvalidContentRange(String),

    #[error("Content length mismatch: expected {expected}, received {received}")]
    ContentLengthMismatch { expected: u64, received: u64 },

    #[error("Segment validation failed: {0}")]
    SegmentValidationFailed(String),

    #[error("Segment gap or overlap detected at byte {0}")]
    SegmentPlanningError(u64),

    #[error("Job not found: {0}")]
    JobNotFound(String),

    #[error("Segment not found: {0}")]
    SegmentNotFound(String),

    #[error("Storage I/O error: {0}")]
    Storage(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("HTTP error status: {status_code}")]
    HttpStatus { status_code: u16, retryable: bool },

    #[error("Integrity check failed: expected {expected}, computed {computed}")]
    HashMismatch { expected: String, computed: String },

    #[error("File already exists: {0}")]
    FileAlreadyExists(String),

    #[error("Retry limit exceeded ({count}/{limit}): {message}")]
    RetryLimitExceeded {
        count: u32,
        limit: u32,
        message: String,
    },

    #[error("Rate limiter starvation or shutdown")]
    RateLimiterError,

    #[error("Operation canceled")]
    Canceled,

    #[error("Media extraction error: {0}")]
    Media(String),

    #[error("Torrent protocol error: {0}")]
    Torrent(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, OrvethError>;
