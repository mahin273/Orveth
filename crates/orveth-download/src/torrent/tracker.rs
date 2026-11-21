use crate::torrent::bencode::{BValue, BencodeParser};
use orveth_core::error::{OrvethError, Result};
use std::net::{Ipv4Addr, SocketAddrV4};
use std::time::Duration;
use tracing::debug;

#[derive(Debug, Clone)]
pub struct TrackerResponse {
    pub interval: u32,
    pub complete: Option<u32>,   // Seeders
    pub incomplete: Option<u32>, // Leechers
    pub peers: Vec<SocketAddrV4>,
}

#[derive(Debug, Clone, Copy)]
pub struct AnnounceParams<'a> {
    pub tracker_url: &'a str,
    pub info_hash_hex: &'a str,
    pub peer_id: &'a [u8; 20],
    pub port: u16,
    pub uploaded: u64,
    pub downloaded: u64,
    pub left: u64,
}

pub struct TrackerClient {
    client: reqwest::Client,
}

impl Default for TrackerClient {
    fn default() -> Self {
        Self::new(None)
    }
}

impl TrackerClient {
    pub fn new(proxy_url: Option<&str>) -> Self {
        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .connect_timeout(Duration::from_secs(10));

        if let Some(proxy_str) = proxy_url {
            if let Ok(proxy) = reqwest::Proxy::all(proxy_str) {
                builder = builder.proxy(proxy);
            }
        }

        let client = builder.build().unwrap_or_default();
        Self { client }
    }

    /// Percent-encode binary bytes as %XX for BitTorrent tracker queries.
    pub fn url_encode_bytes(bytes: &[u8]) -> String {
        let mut result = String::with_capacity(bytes.len() * 3);
        for &b in bytes {
            // BEP 3 allows unreserved characters [0-9a-zA-Z._~-], but encoding all bytes as %XX is universally accepted
            if b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_' || b == b'~' {
                result.push(b as char);
            } else {
                result.push_str(&format!("%{:02X}", b));
            }
        }
        result
    }

    /// Parse compact binary peer format (6 bytes per peer: 4 bytes IPv4 + 2 bytes port in network order).
    pub fn parse_compact_peers(bytes: &[u8]) -> Vec<SocketAddrV4> {
        let (chunks, _) = bytes.as_chunks::<6>();
        let mut peers = Vec::with_capacity(chunks.len());
        for chunk in chunks {
            let ip = Ipv4Addr::new(chunk[0], chunk[1], chunk[2], chunk[3]);
            let port = u16::from_be_bytes([chunk[4], chunk[5]]);
            peers.push(SocketAddrV4::new(ip, port));
        }
        peers
    }

    /// Announces to an HTTP or HTTPS tracker and parses the response.
    pub async fn announce_http(&self, params: &AnnounceParams<'_>) -> Result<TrackerResponse> {
        let info_hash_bytes = hex::decode(params.info_hash_hex)
            .map_err(|e| OrvethError::Torrent(format!("Invalid infohash hex string: {}", e)))?;

        if info_hash_bytes.len() != 20 {
            return Err(OrvethError::Torrent(
                "Infohash must be exactly 20 bytes (40 hex characters)".to_string(),
            ));
        }

        let sep = if params.tracker_url.contains('?') {
            "&"
        } else {
            "?"
        };
        let encoded_info_hash = Self::url_encode_bytes(&info_hash_bytes);
        let encoded_peer_id = Self::url_encode_bytes(params.peer_id);

        let full_url = format!(
            "{}{}info_hash={}&peer_id={}&port={}&uploaded={}&downloaded={}&left={}&compact=1",
            params.tracker_url,
            sep,
            encoded_info_hash,
            encoded_peer_id,
            params.port,
            params.uploaded,
            params.downloaded,
            params.left
        );

        debug!(url = %full_url, "Querying HTTP tracker announce");

        let response = self
            .client
            .get(&full_url)
            .send()
            .await
            .map_err(|e| OrvethError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(OrvethError::Network(format!(
                "Tracker returned HTTP status {}",
                response.status()
            )));
        }

        let body_bytes = response
            .bytes()
            .await
            .map_err(|e| OrvethError::Network(e.to_string()))?;

        Self::parse_tracker_response(&body_bytes)
    }

    /// Parse bencoded tracker response body.
    pub fn parse_tracker_response(body_bytes: &[u8]) -> Result<TrackerResponse> {
        let bval = BencodeParser::parse(body_bytes)?;
        let dict = bval.as_dict().ok_or_else(|| {
            OrvethError::Torrent("Tracker response is not a bencoded dictionary".to_string())
        })?;

        // Check for "failure reason"
        if let Some(failure) = dict
            .get(b"failure reason".as_slice())
            .and_then(|v| v.as_str())
        {
            return Err(OrvethError::Torrent(format!(
                "Tracker announce failed: {}",
                failure
            )));
        }

        let interval = dict
            .get(b"interval".as_slice())
            .and_then(|v| v.as_int())
            .unwrap_or(1800) as u32;

        let complete = dict
            .get(b"complete".as_slice())
            .and_then(|v| v.as_int())
            .map(|v| v as u32);

        let incomplete = dict
            .get(b"incomplete".as_slice())
            .and_then(|v| v.as_int())
            .map(|v| v as u32);

        let mut peers = Vec::new();

        if let Some(peers_val) = dict.get(b"peers".as_slice()) {
            match peers_val {
                BValue::Bytes(compact_bytes) => {
                    peers = Self::parse_compact_peers(compact_bytes);
                }
                BValue::List(peer_list) => {
                    for p in peer_list {
                        if let Some(p_dict) = p.as_dict() {
                            let ip_str = p_dict
                                .get(b"ip".as_slice())
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let port_val = p_dict
                                .get(b"port".as_slice())
                                .and_then(|v| v.as_int())
                                .unwrap_or(0) as u16;

                            if let Ok(ip) = ip_str.parse::<Ipv4Addr>() {
                                if port_val > 0 {
                                    peers.push(SocketAddrV4::new(ip, port_val));
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        Ok(TrackerResponse {
            interval,
            complete,
            incomplete,
            peers,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn test_url_encode_bytes() {
        let input = b"\x12\x34\x56\x78\x9a\xbc\xde\xf0";
        let encoded = TrackerClient::url_encode_bytes(input);
        assert_eq!(encoded, "%124Vx%9A%BC%DE%F0");
    }

    #[test]
    fn test_parse_compact_peers() {
        // 127.0.0.1:8080 (0x1f90) and 192.168.1.50:6881 (0x1ae1)
        let bytes = vec![127, 0, 0, 1, 0x1f, 0x90, 192, 168, 1, 50, 0x1a, 0xe1];
        let peers = TrackerClient::parse_compact_peers(&bytes);
        assert_eq!(peers.len(), 2);
        assert_eq!(peers[0].ip(), &Ipv4Addr::new(127, 0, 0, 1));
        assert_eq!(peers[0].port(), 8080);
        assert_eq!(peers[1].ip(), &Ipv4Addr::new(192, 168, 1, 50));
        assert_eq!(peers[1].port(), 6881);
    }

    #[test]
    fn test_parse_tracker_response_compact() {
        let mut dict = BTreeMap::new();
        dict.insert(b"interval".to_vec(), BValue::Int(900));
        dict.insert(b"complete".to_vec(), BValue::Int(42));
        dict.insert(b"incomplete".to_vec(), BValue::Int(7));
        dict.insert(
            b"peers".to_vec(),
            BValue::Bytes(vec![10, 0, 0, 1, 0x1a, 0xe1]),
        );

        let encoded = BValue::Dict(dict).encode();
        let res = TrackerClient::parse_tracker_response(&encoded).unwrap();

        assert_eq!(res.interval, 900);
        assert_eq!(res.complete, Some(42));
        assert_eq!(res.incomplete, Some(7));
        assert_eq!(res.peers.len(), 1);
        assert_eq!(res.peers[0], "10.0.0.1:6881".parse().unwrap());
    }

    #[test]
    fn test_parse_tracker_response_failure() {
        let mut dict = BTreeMap::new();
        dict.insert(
            b"failure reason".to_vec(),
            BValue::Bytes(b"Invalid torrent infohash".to_vec()),
        );

        let encoded = BValue::Dict(dict).encode();
        let res = TrackerClient::parse_tracker_response(&encoded);
        assert!(res.is_err());
        assert!(res
            .unwrap_err()
            .to_string()
            .contains("Invalid torrent infohash"));
    }

    #[tokio::test]
    async fn test_announce_http_mock() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 1024];
            let n = socket.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]);

            assert!(req.contains("GET /announce?"));
            assert!(req.contains("compact=1"));

            let mut dict = BTreeMap::new();
            dict.insert(b"interval".to_vec(), BValue::Int(1200));
            dict.insert(b"complete".to_vec(), BValue::Int(15));
            dict.insert(b"incomplete".to_vec(), BValue::Int(3));
            dict.insert(
                b"peers".to_vec(),
                BValue::Bytes(vec![127, 0, 0, 1, 0x1a, 0xe1]),
            );

            let body = BValue::Dict(dict).encode();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );

            socket.write_all(response.as_bytes()).await.unwrap();
            socket.write_all(&body).await.unwrap();
        });

        let client = TrackerClient::default();
        let tracker_url = format!("http://127.0.0.1:{}/announce", addr.port());
        let info_hash = "0123456789abcdef0123456789abcdef01234567";
        let peer_id = b"-OV0240-123456789012";

        let params = AnnounceParams {
            tracker_url: &tracker_url,
            info_hash_hex: info_hash,
            peer_id,
            port: 6881,
            uploaded: 0,
            downloaded: 0,
            left: 1000,
        };

        let res = client.announce_http(&params).await.unwrap();

        assert_eq!(res.interval, 1200);
        assert_eq!(res.complete, Some(15));
        assert_eq!(res.peers.len(), 1);
        assert_eq!(res.peers[0], "127.0.0.1:6881".parse().unwrap());
    }
}
