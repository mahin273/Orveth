use crate::facade::OrvethEngine;
use orveth_core::error::{OrvethError, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;
use tracing::{error, info, warn};

#[derive(Debug, Deserialize)]
struct SingleDownloadRequest {
    url: String,
    filename: Option<String>,
    destination: Option<String>,
    expected_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BatchDownloadRequest {
    urls: Vec<String>,
    destination: Option<String>,
}

pub struct LocalBridgeServer {
    handle: JoinHandle<()>,
    shutdown: Arc<AtomicBool>,
    port: u16,
}

impl LocalBridgeServer {
    pub async fn start(engine: OrvethEngine, port: u16, token: Option<String>) -> Result<Self> {
        let listener = TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .map_err(|e| {
                OrvethError::Network(format!(
                    "Failed to bind bridge server to 127.0.0.1:{port}: {e}"
                ))
            })?;

        let actual_port = listener
            .local_addr()
            .map_err(|e| {
                OrvethError::Network(format!("Failed to inspect local socket address: {e}"))
            })?
            .port();

        info!(
            port = actual_port,
            "Orveth Browser Bridge listening on 127.0.0.1:{}", actual_port
        );

        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_loop = shutdown.clone();
        let token_loop = token.clone();

        let handle = tokio::spawn(async move {
            while !shutdown_loop.load(Ordering::Relaxed) {
                match listener.accept().await {
                    Ok((socket, _)) => {
                        let eng = engine.clone();
                        let tok = token_loop.clone();
                        tokio::spawn(async move {
                            if let Err(e) =
                                Self::handle_connection(socket, eng, tok.as_deref()).await
                            {
                                warn!("Error handling bridge request: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        if !shutdown_loop.load(Ordering::Relaxed) {
                            error!("Bridge accept error: {e}");
                        }
                        break;
                    }
                }
            }
        });

        Ok(Self {
            handle,
            shutdown,
            port: actual_port,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&self) {
        self.shutdown.store(true, Ordering::Relaxed);
        self.handle.abort();
    }

    async fn handle_connection(
        mut socket: TcpStream,
        engine: OrvethEngine,
        required_token: Option<&str>,
    ) -> Result<()> {
        let mut buffer = vec![0u8; 65536]; // 64KB max request buffer
        let n = socket
            .read(&mut buffer)
            .await
            .map_err(|e| OrvethError::Network(format!("Failed to read from bridge socket: {e}")))?;

        if n == 0 {
            return Ok(());
        }

        let request_str = String::from_utf8_lossy(&buffer[..n]);
        let mut lines = request_str.split("\r\n");

        let request_line = match lines.next() {
            Some(l) if !l.trim().is_empty() => l,
            _ => return Ok(()),
        };

        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("GET");
        let raw_path = parts.next().unwrap_or("/");

        // Parse query string if present
        let (path, query) = match raw_path.split_once('?') {
            Some((p, q)) => (p, Some(q)),
            None => (raw_path, None),
        };

        // Parse headers
        let mut headers = HashMap::new();
        for line in lines.by_ref() {
            if line.is_empty() {
                break; // Blank line marks end of headers
            }
            if let Some((k, v)) = line.split_once(':') {
                headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
            }
        }

        // 1. CORS Preflight
        if method == "OPTIONS" {
            let resp = "HTTP/1.1 204 No Content\r\n\
                Access-Control-Allow-Origin: *\r\n\
                Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                Access-Control-Allow-Headers: Content-Type, Authorization, X-Orveth-Token\r\n\
                Access-Control-Max-Age: 86400\r\n\
                Connection: close\r\n\r\n";
            let _ = socket.write_all(resp.as_bytes()).await;
            return Ok(());
        }

        // 2. DNS Rebinding / Host check
        if let Some(host) = headers.get("host") {
            let h = host.to_ascii_lowercase();
            if !h.starts_with("127.0.0.1") && !h.starts_with("localhost") {
                let resp =
                    Self::make_json_response(403, r#"{"error":"Forbidden: Invalid Host header"}"#);
                let _ = socket.write_all(resp.as_bytes()).await;
                return Ok(());
            }
        }

        // 3. Token Authentication (if configured)
        if let Some(req_tok) = required_token {
            let trimmed = req_tok.trim();
            if !trimmed.is_empty() {
                let mut authorized = false;

                // Check header
                if let Some(provided) = headers.get("x-orveth-token") {
                    if provided == trimmed {
                        authorized = true;
                    }
                }

                // Check query string ?token=...
                if !authorized {
                    if let Some(q) = query {
                        for pair in q.split('&') {
                            if let Some((k, v)) = pair.split_once('=') {
                                if k == "token" && v == trimmed {
                                    authorized = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                if !authorized {
                    let resp = Self::make_json_response(
                        401,
                        r#"{"error":"Unauthorized: Missing or invalid X-Orveth-Token"}"#,
                    );
                    let _ = socket.write_all(resp.as_bytes()).await;
                    return Ok(());
                }
            }
        }

        // 4. Extract body
        let body_str = if let Some(idx) = request_str.find("\r\n\r\n") {
            &request_str[idx + 4..]
        } else {
            ""
        };

        // 5. Route handling
        match (method, path) {
            ("GET", "/health") | ("GET", "/api/v1/health") | ("GET", "/api/v1/status") => {
                let json = serde_json::json!({
                    "status": "ok",
                    "app": "Orveth",
                    "version": env!("CARGO_PKG_VERSION"),
                });
                let resp = Self::make_json_response(200, &json.to_string());
                let _ = socket.write_all(resp.as_bytes()).await;
            }

            ("POST", "/api/v1/download") => {
                match serde_json::from_str::<SingleDownloadRequest>(body_str) {
                    Ok(req) => {
                        let dest_path = req.destination.map(PathBuf::from);
                        match engine
                            .add_download(req.url, dest_path, req.filename, req.expected_hash)
                            .await
                        {
                            Ok(job) => {
                                let json = serde_json::json!({
                                    "status": "queued",
                                    "job_id": job.id.to_string(),
                                    "filename": job.file_name,
                                });
                                let resp = Self::make_json_response(201, &json.to_string());
                                let _ = socket.write_all(resp.as_bytes()).await;
                            }
                            Err(e) => {
                                let json = serde_json::json!({
                                    "error": format!("Failed to queue download: {e}")
                                });
                                let resp = Self::make_json_response(500, &json.to_string());
                                let _ = socket.write_all(resp.as_bytes()).await;
                            }
                        }
                    }
                    Err(e) => {
                        let json = serde_json::json!({
                            "error": format!("Invalid JSON payload: {e}")
                        });
                        let resp = Self::make_json_response(400, &json.to_string());
                        let _ = socket.write_all(resp.as_bytes()).await;
                    }
                }
            }

            ("POST", "/api/v1/batch") => {
                match serde_json::from_str::<BatchDownloadRequest>(body_str) {
                    Ok(req) => {
                        let dest_path = req.destination.map(PathBuf::from);
                        match engine.add_downloads_batch(req.urls, dest_path).await {
                            Ok(jobs) => {
                                let json = serde_json::json!({
                                    "status": "queued",
                                    "count": jobs.len(),
                                });
                                let resp = Self::make_json_response(201, &json.to_string());
                                let _ = socket.write_all(resp.as_bytes()).await;
                            }
                            Err(e) => {
                                let json = serde_json::json!({
                                    "error": format!("Failed to queue batch: {e}")
                                });
                                let resp = Self::make_json_response(500, &json.to_string());
                                let _ = socket.write_all(resp.as_bytes()).await;
                            }
                        }
                    }
                    Err(e) => {
                        let json = serde_json::json!({
                            "error": format!("Invalid JSON payload: {e}")
                        });
                        let resp = Self::make_json_response(400, &json.to_string());
                        let _ = socket.write_all(resp.as_bytes()).await;
                    }
                }
            }

            _ => {
                let json = serde_json::json!({
                    "error": "Not Found",
                    "path": path,
                });
                let resp = Self::make_json_response(404, &json.to_string());
                let _ = socket.write_all(resp.as_bytes()).await;
            }
        }

        Ok(())
    }

    fn make_json_response(status_code: u16, json_body: &str) -> String {
        let status_text = match status_code {
            200 => "OK",
            201 => "Created",
            204 => "No Content",
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            _ => "Internal Server Error",
        };

        format!(
            "HTTP/1.1 {status_code} {status_text}\r\n\
            Content-Type: application/json; charset=utf-8\r\n\
            Content-Length: {}\r\n\
            Access-Control-Allow-Origin: *\r\n\
            Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
            Access-Control-Allow-Headers: Content-Type, Authorization, X-Orveth-Token\r\n\
            Connection: close\r\n\r\n\
            {}",
            json_body.len(),
            json_body
        )
    }

    /// Installs Native Messaging Hosts for Chrome, Chromium, Brave, Edge, and Firefox.
    pub async fn install_native_manifests(token: Option<&str>) -> Result<Vec<PathBuf>> {
        let home = std::env::var("HOME")
            .map_err(|_| OrvethError::Storage("HOME environment variable not set".to_string()))?;

        let bin_dir = PathBuf::from(&home).join(".local/share/orveth/bin");
        tokio::fs::create_dir_all(&bin_dir).await.map_err(|e| {
            OrvethError::Storage(format!("Failed to create Orveth bin directory: {e}"))
        })?;

        let bridge_script_path = bin_dir.join("orveth-bridge");
        let token_arg = token.unwrap_or("").trim();

        let bridge_script_content = format!(
            r#"#!/usr/bin/env python3
import sys, struct, json, urllib.request

TOKEN = "{token_arg}"

def read_msg():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len: return None
    msg_len = struct.unpack("=I", raw_len)[0]
    return json.loads(sys.stdin.buffer.read(msg_len).decode("utf-8"))

def send_msg(msg):
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def main():
    while True:
        data = read_msg()
        if data is None: break
        url = data.get("url")
        if not url:
            send_msg({{"status": "error", "message": "Missing url"}})
            continue
        req = urllib.request.Request(
            "http://127.0.0.1:41527/api/v1/download",
            data=json.dumps(data).encode("utf-8"),
            headers={{"Content-Type": "application/json", "X-Orveth-Token": TOKEN}}
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                send_msg(json.loads(resp.read().decode("utf-8")))
        except Exception as e:
            send_msg({{"status": "error", "message": str(e)}})

if __name__ == "__main__":
    main()
"#
        );

        tokio::fs::write(&bridge_script_path, bridge_script_content)
            .await
            .map_err(|e| OrvethError::Storage(format!("Failed to write bridge script: {e}")))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(&bridge_script_path, permissions).map_err(|e| {
                OrvethError::Storage(format!("Failed to set permissions on bridge script: {e}"))
            })?;
        }

        let chrome_manifest = serde_json::json!({
            "name": "com.orveth.downloader",
            "description": "Orveth Download Manager Native Messaging Host",
            "path": bridge_script_path.to_string_lossy().to_string(),
            "type": "stdio",
            "allowed_origins": [
                "chrome-extension://*",
                "chrome-extension://orveth-downloader/"
            ]
        });

        let firefox_manifest = serde_json::json!({
            "name": "com.orveth.downloader",
            "description": "Orveth Download Manager Native Messaging Host",
            "path": bridge_script_path.to_string_lossy().to_string(),
            "type": "stdio",
            "allowed_extensions": [
                "orveth-downloader@orveth.com",
                "orveth@local"
            ]
        });

        let target_dirs = [
            // Google Chrome
            PathBuf::from(&home).join(".config/google-chrome/NativeMessagingHosts"),
            // Chromium
            PathBuf::from(&home).join(".config/chromium/NativeMessagingHosts"),
            // Brave Browser
            PathBuf::from(&home).join(".config/BraveSoftware/Brave-Browser/NativeMessagingHosts"),
            // Microsoft Edge
            PathBuf::from(&home).join(".config/microsoft-edge/NativeMessagingHosts"),
            // Mozilla Firefox
            PathBuf::from(&home).join(".mozilla/native-messaging-hosts"),
        ];

        let mut installed_paths = Vec::new();

        for dir in &target_dirs {
            let is_firefox = dir.to_string_lossy().contains(".mozilla");
            let manifest_content = if is_firefox {
                firefox_manifest.to_string()
            } else {
                chrome_manifest.to_string()
            };

            if tokio::fs::create_dir_all(dir).await.is_ok() {
                let manifest_path = dir.join("com.orveth.downloader.json");
                if tokio::fs::write(&manifest_path, manifest_content)
                    .await
                    .is_ok()
                {
                    installed_paths.push(manifest_path);
                }
            }
        }

        Ok(installed_paths)
    }

    /// Checks if any Native Messaging manifest is installed.
    pub fn check_native_manifests_installed() -> bool {
        if let Ok(home) = std::env::var("HOME") {
            let checks = [
                PathBuf::from(&home).join(".config/google-chrome/NativeMessagingHosts/com.orveth.downloader.json"),
                PathBuf::from(&home).join(".config/chromium/NativeMessagingHosts/com.orveth.downloader.json"),
                PathBuf::from(&home).join(".config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.orveth.downloader.json"),
                PathBuf::from(&home).join(".mozilla/native-messaging-hosts/com.orveth.downloader.json"),
            ];
            for p in &checks {
                if p.is_file() {
                    return true;
                }
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_bridge_options_cors() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("bridge_test.db");
        let temp_dir = tmp.path().join("temp");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();
        let server = LocalBridgeServer::start(engine, 0, None).await.unwrap();
        let port = server.port();

        let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        let req = "OPTIONS /api/v1/download HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        stream.write_all(req.as_bytes()).await.unwrap();

        let mut buf = vec![0u8; 1024];
        let n = stream.read(&mut buf).await.unwrap();
        let resp = String::from_utf8_lossy(&buf[..n]);

        assert!(resp.contains("204 No Content"));
        assert!(resp.contains("Access-Control-Allow-Origin: *"));
        assert!(resp.contains("Access-Control-Allow-Methods: GET, POST, OPTIONS"));

        server.stop();
    }

    #[tokio::test]
    async fn test_bridge_health_endpoint() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("bridge_test2.db");
        let temp_dir = tmp.path().join("temp");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();
        let server = LocalBridgeServer::start(engine, 0, None).await.unwrap();
        let port = server.port();

        let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        let req = "GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
        stream.write_all(req.as_bytes()).await.unwrap();

        let mut buf = vec![0u8; 1024];
        let n = stream.read(&mut buf).await.unwrap();
        let resp = String::from_utf8_lossy(&buf[..n]);

        assert!(resp.contains("200 OK"));
        assert!(resp.contains("\"status\":\"ok\""));
        assert!(resp.contains("\"app\":\"Orveth\""));

        server.stop();
    }

    #[tokio::test]
    async fn test_bridge_token_authentication() {
        let tmp = tempdir().unwrap();
        let db_path = tmp.path().join("bridge_test3.db");
        let temp_dir = tmp.path().join("temp");

        let engine = OrvethEngine::init(&db_path, &temp_dir).await.unwrap();
        let token = "secret_test_token_12345".to_string();
        let server = LocalBridgeServer::start(engine, 0, Some(token))
            .await
            .unwrap();
        let port = server.port();

        // 1. Without token -> 401 Unauthorized
        {
            let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
                .await
                .unwrap();
            let req = "GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n";
            stream.write_all(req.as_bytes()).await.unwrap();

            let mut buf = vec![0u8; 1024];
            let n = stream.read(&mut buf).await.unwrap();
            let resp = String::from_utf8_lossy(&buf[..n]);
            assert!(resp.contains("401 Unauthorized"));
        }

        // 2. With X-Orveth-Token header -> 200 OK
        {
            let mut stream = TcpStream::connect(format!("127.0.0.1:{port}"))
                .await
                .unwrap();
            let req = "GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Orveth-Token: secret_test_token_12345\r\n\r\n";
            stream.write_all(req.as_bytes()).await.unwrap();

            let mut buf = vec![0u8; 1024];
            let n = stream.read(&mut buf).await.unwrap();
            let resp = String::from_utf8_lossy(&buf[..n]);
            assert!(resp.contains("200 OK"));
        }

        server.stop();
    }
}
