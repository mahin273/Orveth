use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tokio::time::sleep;

#[derive(Debug, Clone)]
pub struct BandwidthLimiter {
    rate_bytes_per_sec: Arc<AtomicU64>, // 0 means unlimited
    state: Arc<Mutex<TokenBucketState>>,
}

#[derive(Debug)]
struct TokenBucketState {
    available_tokens: f64,
    last_refill: Instant,
}

impl BandwidthLimiter {
    pub fn new(bytes_per_sec: Option<u64>) -> Self {
        let rate = bytes_per_sec.unwrap_or(0);
        Self {
            rate_bytes_per_sec: Arc::new(AtomicU64::new(rate)),
            state: Arc::new(Mutex::new(TokenBucketState {
                available_tokens: rate as f64,
                last_refill: Instant::now(),
            })),
        }
    }

    pub fn set_limit(&self, bytes_per_sec: Option<u64>) {
        self.rate_bytes_per_sec
            .store(bytes_per_sec.unwrap_or(0), Ordering::Relaxed);
    }

    pub fn get_limit(&self) -> Option<u64> {
        let val = self.rate_bytes_per_sec.load(Ordering::Relaxed);
        if val == 0 {
            None
        } else {
            Some(val)
        }
    }

    /// Acquires permission to transfer `bytes` count.
    /// If throttled, sleeps asynchronously until enough tokens accumulate.
    pub async fn acquire(&self, bytes: usize) {
        let rate = self.rate_bytes_per_sec.load(Ordering::Relaxed);
        if rate == 0 || bytes == 0 {
            return;
        }

        let needed = bytes as f64;
        let rate_f64 = rate as f64;
        let max_bucket_capacity = rate_f64; // 1 second burst capacity

        loop {
            let delay_to_wait = {
                let mut state = self.state.lock().await;
                let now = Instant::now();
                let elapsed_secs = now.duration_since(state.last_refill).as_secs_f64();
                state.last_refill = now;

                // Refill tokens
                state.available_tokens =
                    (state.available_tokens + (elapsed_secs * rate_f64)).min(max_bucket_capacity);

                if state.available_tokens >= needed {
                    state.available_tokens -= needed;
                    return;
                }

                let missing = needed - state.available_tokens;
                std::time::Duration::from_secs_f64(missing / rate_f64)
            };

            sleep(delay_to_wait).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_unlimited_rate() {
        let limiter = BandwidthLimiter::new(None);
        let start = Instant::now();
        limiter.acquire(10_000_000).await;
        assert!(start.elapsed().as_millis() < 50);
    }

    #[tokio::test]
    async fn test_throttled_rate() {
        // Limit to 10,000 bytes per second
        let limiter = BandwidthLimiter::new(Some(10_000));
        // Empty bucket initially
        {
            let mut s = limiter.state.lock().await;
            s.available_tokens = 0.0;
            s.last_refill = Instant::now();
        }

        let start = Instant::now();
        // Request 1,000 bytes -> should wait approx 100ms
        limiter.acquire(1_000).await;
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() >= 80);
    }
}
