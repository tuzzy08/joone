#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Serialize)]
struct DesktopBridgeStatus {
    mode: String,
    backend: String,
    healthy: bool,
    #[serde(rename = "baseUrl")]
    base_url: String,
}

#[derive(Serialize, Deserialize)]
struct DesktopConfig {
    provider: String,
    model: String,
    streaming: bool,
}

#[tauri::command]
fn runtime_base_url() -> String {
    std::env::var("JOONE_DESKTOP_RUNTIME_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:3011".to_string())
}

#[tauri::command]
fn runtime_status() -> DesktopBridgeStatus {
    let base_url = runtime_base_url();
    let healthy = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()
        .and_then(|client| client.get(format!("{base_url}/health")).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false);

    DesktopBridgeStatus {
        mode: "tauri".to_string(),
        backend: "runtime".to_string(),
        healthy,
        base_url,
    }
}

#[tauri::command]
fn runtime_load_config() -> DesktopConfig {
    let mut config = DesktopConfig {
        provider: "anthropic".to_string(),
        model: "claude-sonnet-4-20250514".to_string(),
        streaming: true,
    };

    let Some(config_path) = joone_config_path() else {
        return config;
    };

    let Ok(raw) = fs::read_to_string(config_path) else {
        return config;
    };

    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return config;
    };

    if let Some(provider) = parsed.get("provider").and_then(Value::as_str) {
        config.provider = provider.to_string();
    }
    if let Some(model) = parsed.get("model").and_then(Value::as_str) {
        config.model = model.to_string();
    }
    if let Some(streaming) = parsed.get("streaming").and_then(Value::as_bool) {
        config.streaming = streaming;
    }

    config
}

fn joone_config_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".joone").join("config.json"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            runtime_base_url,
            runtime_status,
            runtime_load_config
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Joone Desktop");
}
