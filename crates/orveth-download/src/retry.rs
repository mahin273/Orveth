use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub backoff_factor: f64,
    pub jitter_factor: f64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 5,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            backoff_factor: 2.0,
            jitter_factor: 0.25,
        }
    }
}

impl RetryPolicy {
    pub fn is_retryable_status(status_code: u16) -> bool {
        matches!(
            status_code,
            408  // Request Timeout
            | 429 // Too Many Requests
            | 500 // Internal Server Error
            | 502 // Bad Gateway
            | 503 // Service Unavailable
            | 504 // Gateway Timeout
            | 520..=526 // Cloudflare transient errors
        )
    }

    pub fn compute_delay(&self, attempt: u32, retry_after: Option<Duration>) -> Duration {
        if let Some(explicit) = retry_after {
            return explicit.min(self.max_delay);
        }

        if attempt == 0 {
            return self.initial_delay;
        }

        let exponential =
            self.initial_delay.as_secs_f64() * self.backoff_factor.powi(attempt as i32);
        let capped = exponential.min(self.max_delay.as_secs_f64());

        // Fast pseudo-random jitter: +/- (jitter_factor * capped)
        let factor = (fastrand::f64() * 2.0) - 1.0; // [-1.0, 1.0]
        let jitter = factor * (capped * self.jitter_factor);
        let final_secs = (capped + jitter).max(0.1);

        Duration::from_secs_f64(final_secs).min(self.max_delay)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retryable_statuses() {
        assert!(RetryPolicy::is_retryable_status(429));
        assert!(RetryPolicy::is_retryable_status(503));
        assert!(RetryPolicy::is_retryable_status(504));
        assert!(!RetryPolicy::is_retryable_status(404));
        assert!(!RetryPolicy::is_retryable_status(401));
        assert!(!RetryPolicy::is_retryable_status(403));
    }

    #[test]
    fn test_compute_delay_bounds() {
        let policy = RetryPolicy::default();
        let d1 = policy.compute_delay(1, None);
        let d5 = policy.compute_delay(5, None);

        assert!(d5 >= d1);
        assert!(d5 <= policy.max_delay);

        let explicit = Duration::from_secs(7);
        let d_exp = policy.compute_delay(1, Some(explicit));
        assert_eq!(d_exp, explicit);
    }
}
