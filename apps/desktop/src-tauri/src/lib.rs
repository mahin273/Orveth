use orveth_core::model::{DownloadFilter, DownloadJob, EngineSettings};
use orveth_scheduler::OrvethEngine;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

pub struct AppState {
    pub engine: OrvethEngine,
}

#[tauri::command]
async fn add_download(
    state: State<'_, Arc<AppState>>,
    url: String,
    destination_dir: Option<String>,
    custom_file_name: Option<String>,
    expected_hash: Option<String>,
) -> Result<DownloadJob, String> {
    let dest_path = destination_dir.map(PathBuf::from);
    state
        .engine
        .add_download(url, dest_path, custom_file_name, expected_hash)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_downloads_batch(
    state: State<'_, Arc<AppState>>,
    urls: Vec<String>,
    destination_dir: Option<String>,
) -> Result<Vec<DownloadJob>, String> {
    let dest_path = destination_dir.map(PathBuf::from);
    state
        .engine
        .add_downloads_batch(urls, dest_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_job_priority(
    state: State<'_, Arc<AppState>>,
    id: String,
    priority: i32,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .engine
        .set_job_priority(uuid, priority)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn pause_download(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state.engine.pause_download(uuid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn resume_download(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state.engine.resume_download(uuid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel_download(
    state: State<'_, Arc<AppState>>,
    id: String,
    delete_partial: bool,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .engine
        .cancel_download(uuid, delete_partial)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn retry_download(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state.engine.retry_download(uuid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_download(
    state: State<'_, Arc<AppState>>,
    id: String,
    remove_file: bool,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state
        .engine
        .remove_download(uuid, remove_file)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_downloads(
    state: State<'_, Arc<AppState>>,
    filter: DownloadFilter,
) -> Result<Vec<DownloadJob>, String> {
    state.engine.list_downloads(&filter).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_download(state: State<'_, Arc<AppState>>, id: String) -> Result<DownloadJob, String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state.engine.get_download(uuid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_segments(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<orveth_core::model::Segment>, String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    state.engine.get_segments(uuid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_settings(state: State<'_, Arc<AppState>>) -> Result<EngineSettings, String> {
    state.engine.get_settings().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_settings(
    state: State<'_, Arc<AppState>>,
    settings: EngineSettings,
) -> Result<(), String> {
    state.engine.update_settings(&settings).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_global_bandwidth_limit(
    state: State<'_, Arc<AppState>>,
    limit_bytes_per_sec: Option<u64>,
) -> Result<(), String> {
    state
        .engine
        .set_global_bandwidth_limit(limit_bytes_per_sec)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_file(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let job = state.engine.get_download(uuid).await.map_err(|e| e.to_string())?;
    if job.destination.exists() {
        let _ = tokio::process::Command::new("xdg-open")
            .arg(&job.destination)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("File does not exist on disk".to_string())
    }
}

#[tauri::command]
async fn reveal_file(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let uuid = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let job = state.engine.get_download(uuid).await.map_err(|e| e.to_string())?;
    let parent = job.destination.parent().unwrap_or_else(|| Path::new("."));
    let _ = tokio::process::Command::new("xdg-open")
        .arg(parent)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let data_dir = PathBuf::from(home).join(".local/share/orveth");
    let db_path = data_dir.join("orveth.db");
    let temp_dir = data_dir.join("temp");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let handle = app.handle().clone();

            tauri::async_runtime::block_on(async move {
                let engine = OrvethEngine::init(&db_path, &temp_dir)
                    .await
                    .expect("Failed to initialize Orveth download engine");

                let mut rx = engine.subscribe();
                let emitter_handle = handle.clone();
                tokio::spawn(async move {
                    loop {
                        match rx.recv().await {
                            Ok(event) => {
                                let _ = emitter_handle.emit("engine_event", event);
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                                eprintln!("Event bridge lagged, skipped {skipped} messages");
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                                break;
                            }
                        }
                    }
                });

                handle.manage(Arc::new(AppState { engine }));
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_download,
            add_downloads_batch,
            set_job_priority,
            pause_download,
            resume_download,
            cancel_download,
            retry_download,
            remove_download,
            list_downloads,
            get_download,
            get_segments,
            get_settings,
            update_settings,
            set_global_bandwidth_limit,
            open_file,
            reveal_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
