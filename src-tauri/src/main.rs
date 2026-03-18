#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

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

#[derive(Serialize, Deserialize)]
struct DesktopMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
struct DesktopMetrics {
    #[serde(rename = "totalTokens")]
    total_tokens: u32,
    #[serde(rename = "cacheHitRate")]
    cache_hit_rate: u32,
    #[serde(rename = "toolCallCount")]
    tool_call_count: u32,
    #[serde(rename = "turnCount")]
    turn_count: u32,
    #[serde(rename = "totalCost")]
    total_cost: u32,
}

#[derive(Serialize, Deserialize)]
struct DesktopSessionSnapshot {
    #[serde(rename = "sessionId")]
    session_id: String,
    provider: String,
    model: String,
    messages: Vec<DesktopMessage>,
    metrics: DesktopMetrics,
}

#[derive(Deserialize)]
struct SessionHeader {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "lastSavedAt")]
    last_saved_at: u64,
    provider: String,
    model: String,
}

struct PersistedSessionSnapshot {
    snapshot: DesktopSessionSnapshot,
    last_saved_at: u64,
}

#[derive(Default)]
struct RuntimeSubscriptionState {
    subscriptions: Mutex<HashMap<String, mpsc::Sender<()>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIdArgs {
    session_id: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitMessageArgs {
    session_id: String,
    text: String,
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

#[tauri::command]
fn runtime_list_sessions() -> Vec<DesktopSessionSnapshot> {
    let Some(sessions_dir) = joone_sessions_dir() else {
        return Vec::new();
    };

    let Ok(entries) = fs::read_dir(sessions_dir) else {
        return Vec::new();
    };

    let mut sessions = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }

        if let Some(snapshot) = read_session_snapshot(&path) {
            sessions.push(snapshot);
        }
    }

    sessions.sort_by(|left, right| right.last_saved_at.cmp(&left.last_saved_at));
    sessions.into_iter().map(|item| item.snapshot).collect()
}

#[tauri::command]
fn runtime_start_session() -> Result<DesktopSessionSnapshot, String> {
    runtime_post("/sessions")
}

#[tauri::command]
fn runtime_resume_session(args: SessionIdArgs) -> Result<DesktopSessionSnapshot, String> {
    runtime_post(&format!("/sessions/{}/resume", args.session_id))
}

#[tauri::command]
fn runtime_submit_message(args: SubmitMessageArgs) -> Result<DesktopSessionSnapshot, String> {
    runtime_post_with_body(
        &format!("/sessions/{}/messages", args.session_id),
        serde_json::json!({ "text": args.text }),
    )
}

#[tauri::command]
fn runtime_close_session(
    state: State<RuntimeSubscriptionState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(&state, &args.session_id);
    runtime_delete(&format!("/sessions/{}", args.session_id))
}

#[tauri::command]
fn runtime_subscribe_session(
    app: AppHandle,
    state: State<RuntimeSubscriptionState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(&state, &args.session_id);

    let (stop_tx, stop_rx) = mpsc::channel();
    state
        .subscriptions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(args.session_id.clone(), stop_tx);

    let session_id = args.session_id.clone();
    let base_url = runtime_base_url();
    std::thread::spawn(move || {
        stream_runtime_events(app, &base_url, &session_id, stop_rx);
    });

    Ok(())
}

#[tauri::command]
fn runtime_unsubscribe_session(
    state: State<RuntimeSubscriptionState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(&state, &args.session_id);
    Ok(())
}

fn joone_config_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".joone").join("config.json"))
}

fn joone_sessions_dir() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".joone").join("sessions"))
}

fn read_session_snapshot(path: &PathBuf) -> Option<PersistedSessionSnapshot> {
    let raw = fs::read_to_string(path).ok()?;
    let mut lines = raw.lines();
    let header_line = lines.next()?;
    let header_json = serde_json::from_str::<Value>(header_line).ok()?;
    let header = serde_json::from_value::<SessionHeader>(header_json.get("header")?.clone()).ok()?;

    let messages = lines
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .map(|message| DesktopMessage {
            role: match message.get("type").and_then(Value::as_str) {
                Some("human") => "user".to_string(),
                Some("ai") => "agent".to_string(),
                _ => "system".to_string(),
            },
            content: message
                .get("content")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
        .collect();

    Some(PersistedSessionSnapshot {
        last_saved_at: header.last_saved_at,
        snapshot: DesktopSessionSnapshot {
            session_id: header.session_id,
            provider: header.provider,
            model: header.model,
            messages,
            metrics: DesktopMetrics {
                total_tokens: 0,
                cache_hit_rate: 0,
                tool_call_count: 0,
                turn_count: 0,
                total_cost: 0,
            },
        },
    })
}

fn stream_runtime_events(
    app: AppHandle,
    base_url: &str,
    session_id: &str,
    stop_rx: mpsc::Receiver<()>,
) {
    let client = match reqwest::blocking::Client::builder().build() {
        Ok(client) => client,
        Err(error) => {
            emit_runtime_error(&app, session_id, error.to_string());
            return;
        }
    };

    let response = match client
        .get(format!("{base_url}/sessions/{session_id}/events"))
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            emit_runtime_error(&app, session_id, error.to_string());
            return;
        }
    };

    let reader = BufReader::new(response);
    for line in reader.lines() {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        let Ok(line) = line else {
            break;
        };

        let Some(payload) = line.strip_prefix("data: ") else {
            continue;
        };

        if let Ok(parsed) = serde_json::from_str::<Value>(payload) {
            let _ = app.emit(&format!("runtime-event:{session_id}"), parsed);
        }
    }
}

fn emit_runtime_error(app: &AppHandle, session_id: &str, message: String) {
    let _ = app.emit(
        &format!("runtime-event:{session_id}"),
        serde_json::json!({
            "type": "session:error",
            "sessionId": session_id,
            "message": message,
        }),
    );
}

fn runtime_post(path: &str) -> Result<DesktopSessionSnapshot, String> {
    runtime_post_with_body(path, serde_json::json!({}))
}

fn runtime_delete(path: &str) -> Result<(), String> {
    let base_url = runtime_base_url();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .delete(format!("{base_url}{path}"))
        .send()
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Runtime returned {}", response.status()));
    }

    Ok(())
}

fn runtime_post_with_body(
    path: &str,
    body: serde_json::Value,
) -> Result<DesktopSessionSnapshot, String> {
    let base_url = runtime_base_url();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .post(format!("{base_url}{path}"))
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Runtime returned {}", response.status()));
    }

    response.json::<DesktopSessionSnapshot>().map_err(|error| error.to_string())
}

fn unsubscribe_session(state: &State<RuntimeSubscriptionState>, session_id: &str) {
    if let Ok(mut subscriptions) = state.subscriptions.lock() {
        if let Some(stop_tx) = subscriptions.remove(session_id) {
            let _ = stop_tx.send(());
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(RuntimeSubscriptionState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_base_url,
            runtime_status,
            runtime_load_config,
            runtime_list_sessions,
            runtime_start_session,
            runtime_resume_session,
            runtime_submit_message,
            runtime_close_session,
            runtime_subscribe_session,
            runtime_unsubscribe_session
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Joone Desktop");
}
