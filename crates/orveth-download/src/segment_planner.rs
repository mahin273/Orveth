use orveth_core::error::{OrvethError, Result};
use orveth_core::model::Segment;
use std::path::Path;
use uuid::Uuid;

pub struct SegmentPlanner;

impl SegmentPlanner {
    /// Plans non-overlapping contiguous byte segments for a file.
    /// Guarantees that:
    /// - Segments cover [0, total_bytes - 1] without gaps or overlaps.
    /// - Sum of segment lengths equals total_bytes.
    pub fn plan(
        download_id: Uuid,
        total_bytes: u64,
        target_segments: usize,
        temp_dir: &Path,
    ) -> Result<Vec<Segment>> {
        if total_bytes == 0 {
            return Err(OrvethError::SegmentPlanningError(0));
        }

        let min_segment_size = 256 * 1024; // 256 KiB minimum per segment
        let max_reasonable_segments = (total_bytes / min_segment_size).max(1) as usize;
        let segment_count = target_segments.clamp(1, max_reasonable_segments);

        if segment_count <= 1 {
            let part_path = temp_dir.join("part_0.bin");
            return Ok(vec![Segment::new(
                download_id,
                0,
                total_bytes - 1,
                part_path,
            )]);
        }

        let chunk_size = total_bytes / (segment_count as u64);
        let mut segments = Vec::with_capacity(segment_count);
        let mut current_start = 0u64;

        for i in 0..segment_count {
            let is_last = i == segment_count - 1;
            let current_end = if is_last {
                total_bytes - 1
            } else {
                current_start + chunk_size - 1
            };

            let part_path = temp_dir.join(format!("part_{i}.bin"));
            segments.push(Segment::new(
                download_id,
                current_start,
                current_end,
                part_path,
            ));

            current_start = current_end + 1;
        }

        // Strict verification of plan integrity
        let mut expected = 0u64;
        let mut sum_lengths = 0u64;
        for seg in &segments {
            if seg.start_byte != expected {
                return Err(OrvethError::SegmentPlanningError(seg.start_byte));
            }
            let len = seg.expected_length();
            sum_lengths += len;
            expected = seg.end_byte + 1;
        }

        if sum_lengths != total_bytes || expected != total_bytes {
            return Err(OrvethError::ContentLengthMismatch {
                expected: total_bytes,
                received: sum_lengths,
            });
        }

        Ok(segments)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_plan_even_split() {
        let tmp = tempdir().unwrap();
        let job_id = Uuid::new_v4();
        let total = 4 * 1024 * 1024; // 4 MiB
        let segments = SegmentPlanner::plan(job_id, total, 4, tmp.path()).unwrap();

        assert_eq!(segments.len(), 4);
        assert_eq!(segments[0].start_byte, 0);
        assert_eq!(segments[0].end_byte, 1024 * 1024 - 1);
        assert_eq!(segments[3].end_byte, total - 1);

        let total_planned: u64 = segments.iter().map(|s| s.expected_length()).sum();
        assert_eq!(total_planned, total);
    }

    #[test]
    fn test_plan_odd_split_no_gap_no_overlap() {
        let tmp = tempdir().unwrap();
        let job_id = Uuid::new_v4();
        let total = 10_000_003; // Odd prime-like number > 256k
        let segments = SegmentPlanner::plan(job_id, total, 4, tmp.path()).unwrap();

        assert_eq!(segments.len(), 4);

        for i in 0..segments.len() - 1 {
            assert_eq!(segments[i].end_byte + 1, segments[i + 1].start_byte);
        }

        assert_eq!(segments.last().unwrap().end_byte, total - 1);
        let total_planned: u64 = segments.iter().map(|s| s.expected_length()).sum();
        assert_eq!(total_planned, total);
    }

    #[test]
    fn test_plan_small_file_clamps_to_single() {
        let tmp = tempdir().unwrap();
        let job_id = Uuid::new_v4();
        let total = 50 * 1024; // 50 KiB
        let segments = SegmentPlanner::plan(job_id, total, 8, tmp.path()).unwrap();

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].start_byte, 0);
        assert_eq!(segments[0].end_byte, total - 1);
    }
}
