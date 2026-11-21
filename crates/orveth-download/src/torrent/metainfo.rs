use crate::torrent::bencode::BencodeParser;
use orveth_core::error::{OrvethError, Result};
use orveth_core::model::{TorrentFileInfo, TorrentMetadata};
use sha1::{Digest, Sha1};
use url::Url;

pub struct TorrentParser;

impl TorrentParser {
    /// Parses raw `.torrent` file bytes into structured metadata.
    pub fn parse_torrent(bytes: &[u8]) -> Result<TorrentMetadata> {
        let root = BencodeParser::parse(bytes)?;
        let dict = root.as_dict().ok_or_else(|| {
            OrvethError::Torrent("Torrent root must be a bencoded dictionary".to_string())
        })?;

        // Extract raw "info" slice for SHA-1 info_hash calculation
        let raw_info_slice =
            BencodeParser::extract_raw_dict_value(bytes, b"info").ok_or_else(|| {
                OrvethError::Torrent("Missing 'info' dictionary in torrent".to_string())
            })?;

        let mut hasher = Sha1::new();
        hasher.update(raw_info_slice);
        let info_hash_bytes = hasher.finalize();
        let info_hash = hex::encode(info_hash_bytes);

        let info_val = dict
            .get(b"info".as_slice())
            .and_then(|v| v.as_dict())
            .ok_or_else(|| OrvethError::Torrent("Invalid 'info' value in torrent".to_string()))?;

        let name = info_val
            .get(b"name".as_slice())
            .and_then(|v| v.as_str())
            .unwrap_or("Unnamed Torrent")
            .to_string();

        let piece_length = info_val
            .get(b"piece length".as_slice())
            .and_then(|v| v.as_int())
            .ok_or_else(|| OrvethError::Torrent("Missing 'piece length' in torrent".to_string()))?
            as u64;

        let pieces_bytes = info_val
            .get(b"pieces".as_slice())
            .and_then(|v| v.as_bytes())
            .ok_or_else(|| {
                OrvethError::Torrent("Missing 'pieces' hash blob in torrent".to_string())
            })?;

        let piece_count = pieces_bytes.len() / 20;

        // Files and total length
        let mut files = Vec::new();
        let mut total_length = 0u64;

        if let Some(raw_files) = info_val.get(b"files".as_slice()).and_then(|v| v.as_list()) {
            // Multi-file torrent
            for f in raw_files {
                let f_dict = match f.as_dict() {
                    Some(d) => d,
                    None => continue,
                };

                let length = f_dict
                    .get(b"length".as_slice())
                    .and_then(|v| v.as_int())
                    .unwrap_or(0) as u64;

                let mut path_segments = Vec::new();
                if let Some(path_list) = f_dict.get(b"path".as_slice()).and_then(|v| v.as_list()) {
                    for p in path_list {
                        if let Some(s) = p.as_str() {
                            path_segments.push(s);
                        }
                    }
                }

                let full_path = if path_segments.is_empty() {
                    format!("{}/file_{}", name, files.len())
                } else {
                    format!("{}/{}", name, path_segments.join("/"))
                };

                total_length += length;
                files.push(TorrentFileInfo {
                    path: full_path,
                    length,
                });
            }
        } else {
            // Single-file torrent
            let length = info_val
                .get(b"length".as_slice())
                .and_then(|v| v.as_int())
                .unwrap_or(0) as u64;

            total_length = length;
            files.push(TorrentFileInfo {
                path: name.clone(),
                length,
            });
        }

        // Trackers
        let mut announce_urls = Vec::new();
        if let Some(main_announce) = dict.get(b"announce".as_slice()).and_then(|v| v.as_str()) {
            announce_urls.push(main_announce.to_string());
        }

        if let Some(announce_list) = dict
            .get(b"announce-list".as_slice())
            .and_then(|v| v.as_list())
        {
            for tier in announce_list {
                if let Some(tier_list) = tier.as_list() {
                    for tracker in tier_list {
                        if let Some(t_str) = tracker.as_str() {
                            if !announce_urls.contains(&t_str.to_string()) {
                                announce_urls.push(t_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        Ok(TorrentMetadata {
            name,
            info_hash,
            total_length,
            piece_length,
            piece_count,
            files,
            announce_urls,
            is_magnet: false,
        })
    }

    /// Parses a standard `magnet:?xt=urn:btih:...` link.
    pub fn parse_magnet(uri: &str) -> Result<TorrentMetadata> {
        let trimmed = uri.trim();
        if !trimmed.starts_with("magnet:?") {
            return Err(OrvethError::Torrent("Not a valid magnet URI".to_string()));
        }

        let parsed = Url::parse(trimmed)
            .map_err(|e| OrvethError::Torrent(format!("Failed to parse magnet URL: {e}")))?;

        let mut info_hash = None;
        let mut name = None;
        let mut announce_urls = Vec::new();
        let mut total_length = 0u64;

        for (k, v) in parsed.query_pairs() {
            match k.as_ref() {
                "xt" => {
                    if let Some(hash_part) = v.strip_prefix("urn:btih:") {
                        let h = hash_part.to_ascii_lowercase();
                        // 40-character hex string
                        if h.len() == 40 && h.chars().all(|c| c.is_ascii_hexdigit()) {
                            info_hash = Some(h);
                        } else if h.len() == 32 {
                            // Base32 encoded hash -> decode to 20 bytes -> hex
                            if let Ok(decoded) = Self::decode_base32(&h) {
                                info_hash = Some(hex::encode(decoded));
                            }
                        }
                    }
                }
                "dn" => {
                    name = Some(v.into_owned());
                }
                "tr" => {
                    let tr_url = v.into_owned();
                    if !announce_urls.contains(&tr_url) {
                        announce_urls.push(tr_url);
                    }
                }
                "xl" => {
                    if let Ok(len) = v.parse::<u64>() {
                        total_length = len;
                    }
                }
                _ => {}
            }
        }

        let final_hash = info_hash.ok_or_else(|| {
            OrvethError::Torrent("Magnet link does not contain a valid urn:btih hash".to_string())
        })?;

        let final_name = name.unwrap_or_else(|| format!("Magnet_{}", &final_hash[..8]));

        let files = if total_length > 0 {
            vec![TorrentFileInfo {
                path: final_name.clone(),
                length: total_length,
            }]
        } else {
            Vec::new()
        };

        Ok(TorrentMetadata {
            name: final_name,
            info_hash: final_hash,
            total_length,
            piece_length: 262144, // Default 256KB
            piece_count: if total_length > 0 {
                total_length.div_ceil(262144) as usize
            } else {
                0
            },
            files,
            announce_urls,
            is_magnet: true,
        })
    }

    fn decode_base32(input: &str) -> Result<[u8; 20]> {
        const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz234567";
        let mut bits = 0u64;
        let mut bit_count = 0;
        let mut bytes = Vec::new();

        for c in input.to_ascii_lowercase().bytes() {
            let val = ALPHABET
                .iter()
                .position(|&b| b == c)
                .ok_or_else(|| OrvethError::Torrent("Invalid base32 character".to_string()))?
                as u64;

            bits = (bits << 5) | val;
            bit_count += 5;

            while bit_count >= 8 {
                bit_count -= 8;
                bytes.push(((bits >> bit_count) & 0xff) as u8);
            }
        }

        if bytes.len() < 20 {
            return Err(OrvethError::Torrent(
                "Decoded base32 length under 20 bytes".to_string(),
            ));
        }

        let mut res = [0u8; 20];
        res.copy_from_slice(&bytes[..20]);
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_magnet_hex() {
        let uri = "magnet:?xt=urn:btih:4a65494f6c12ecb2732924376c965b50d5351a9a&dn=Ubuntu+24.04&tr=http%3A%2F%2Ftorrent.ubuntu.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&xl=6000000000";
        let meta = TorrentParser::parse_magnet(uri).unwrap();

        assert_eq!(meta.info_hash, "4a65494f6c12ecb2732924376c965b50d5351a9a");
        assert_eq!(meta.name, "Ubuntu 24.04");
        assert_eq!(meta.total_length, 6000000000);
        assert_eq!(meta.announce_urls.len(), 2);
        assert!(meta.is_magnet);
    }

    #[test]
    fn test_parse_torrent_single_file() {
        // Construct a mini synthetic bencoded .torrent payload
        let raw = b"d8:announce26:http://tracker.example.com4:infod6:lengthi1048576e4:name8:test.iso12:piece lengthi262144e6:pieces80:11111111111111111111222222222222222222223333333333333333333344444444444444444444ee";

        let meta = TorrentParser::parse_torrent(raw).unwrap();
        assert_eq!(meta.name, "test.iso");
        assert_eq!(meta.total_length, 1048576);
        assert_eq!(meta.piece_length, 262144);
        assert_eq!(meta.piece_count, 4);
        assert_eq!(meta.files.len(), 1);
        assert_eq!(meta.files[0].path, "test.iso");
        assert_eq!(meta.announce_urls, vec!["http://tracker.example.com"]);
        assert!(!meta.is_magnet);
        assert_eq!(meta.info_hash.len(), 40);
    }
}
