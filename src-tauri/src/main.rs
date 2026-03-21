#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const DEV_RUNTIME_PORT: u16 = 3011;

#[derive(Default)]
struct ManagedRuntimeState {
    // The packaged desktop app owns one local runtime process and can relay
    // multiple live session streams through native Tauri events at once.
    subscriptions: Mutex<HashMap<String, mpsc::Sender<()>>>,
    process: Mutex<Option<Child>>,
    base_url: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeStatus {
    mode: String,
    backend: String,
    healthy: bool,
    #[serde(rename = "runtimeOwner")]
    runtime_owner: String,
    base_url: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopNotificationSettings {
    permissions: bool,
    completion_summary: bool,
    needs_attention: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateSettings {
    auto_check: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct DesktopProviderConnection {
    api_key: Option<String>,
    base_url: Option<String>,
    connected: Option<bool>,
    default_model: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    provider: String,
    model: String,
    streaming: bool,
    permission_mode: Option<String>,
    appearance: Option<String>,
    notifications: DesktopNotificationSettings,
    updates: DesktopUpdateSettings,
    provider_connections: HashMap<String, DesktopProviderConnection>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopWorkspaceContext {
    git_branch: Option<String>,
    permission_mode: String,
    execution_mode: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct DesktopProviderConnectionResult {
    ok: bool,
    message: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateCheckResult {
    checked_at: u64,
    available: bool,
    current_version: String,
    latest_version: Option<String>,
    download_url: Option<String>,
    message: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopMetrics {
    total_tokens: u32,
    cache_hit_rate: u32,
    tool_call_count: u32,
    turn_count: u32,
    total_cost: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSessionSnapshot {
    session_id: String,
    provider: String,
    model: String,
    description: Option<String>,
    last_saved_at: Option<u64>,
    messages: Vec<DesktopMessage>,
    metrics: DesktopMetrics,
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnswerHitlArgs {
    id: String,
    answer: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestProviderConnectionArgs {
    provider: String,
    connection: DesktopProviderConnection,
}

#[tauri::command]
fn runtime_base_url(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<String, String> {
    ensure_runtime_url(&app, state.inner())
}

#[tauri::command]
fn runtime_status(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<DesktopBridgeStatus, String> {
    let base_url = ensure_runtime_url(&app, state.inner())?;
    Ok(DesktopBridgeStatus {
        mode: "tauri".to_string(),
        backend: "runtime".to_string(),
        healthy: check_runtime_health(&base_url),
        runtime_owner: resolve_runtime_owner().to_string(),
        base_url,
    })
}

#[tauri::command]
fn runtime_workspace_context(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<DesktopWorkspaceContext, String> {
    runtime_get_json(&app, state.inner(), "/workspace/context")
}

#[tauri::command]
fn runtime_load_config(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<DesktopConfig, String> {
    runtime_get_json(&app, state.inner(), "/config")
}

#[tauri::command]
fn runtime_save_config(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    config: DesktopConfig,
) -> Result<(), String> {
    runtime_post_no_content(&app, state.inner(), "/config", serde_json::to_value(config).map_err(|error| error.to_string())?)
}

#[tauri::command]
fn runtime_test_provider_connection(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: TestProviderConnectionArgs,
) -> Result<DesktopProviderConnectionResult, String> {
    runtime_post_with_body(
        &app,
        state.inner(),
        &format!("/providers/{}/test", args.provider),
        serde_json::to_value(args.connection).map_err(|error| error.to_string())?,
    )
}

#[tauri::command]
fn runtime_check_updates(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<DesktopUpdateCheckResult, String> {
    runtime_get_json(&app, state.inner(), "/updates/check")
}

#[tauri::command]
fn runtime_answer_hitl(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: AnswerHitlArgs,
) -> Result<(), String> {
    runtime_post_no_content(
        &app,
        state.inner(),
        &format!("/hitl/{}/answer", args.id),
        serde_json::json!({ "answer": args.answer }),
    )
}

#[tauri::command]
fn runtime_list_sessions(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<Vec<DesktopSessionSnapshot>, String> {
    runtime_get_json(&app, state.inner(), "/sessions")
}

#[tauri::command]
fn runtime_start_session(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
) -> Result<DesktopSessionSnapshot, String> {
    runtime_post_with_body(&app, state.inner(), "/sessions", serde_json::json!({}))
}

#[tauri::command]
fn runtime_resume_session(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: SessionIdArgs,
) -> Result<DesktopSessionSnapshot, String> {
    runtime_post_with_body(
        &app,
        state.inner(),
        &format!("/sessions/{}/resume", args.session_id),
        serde_json::json!({}),
    )
}

#[tauri::command]
fn runtime_submit_message(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: SubmitMessageArgs,
) -> Result<DesktopSessionSnapshot, String> {
    runtime_post_with_body(
        &app,
        state.inner(),
        &format!("/sessions/{}/messages", args.session_id),
        serde_json::json!({ "text": args.text }),
    )
}

#[tauri::command]
fn runtime_close_session(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(state.inner(), &args.session_id);
    runtime_delete(&app, state.inner(), &format!("/sessions/{}", args.session_id))
}

#[tauri::command]
fn runtime_subscribe_session(
    app: AppHandle,
    state: State<ManagedRuntimeState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(state.inner(), &args.session_id);

    let (stop_tx, stop_rx) = mpsc::channel();
    state
        .subscriptions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(args.session_id.clone(), stop_tx);

    let session_id = args.session_id.clone();
    let base_url = ensure_runtime_url(&app, state.inner())?;
    std::thread::spawn(move || {
        stream_runtime_events(app, &base_url, &session_id, stop_rx);
    });

    Ok(())
}

#[tauri::command]
fn runtime_unsubscribe_session(
    state: State<ManagedRuntimeState>,
    args: SessionIdArgs,
) -> Result<(), String> {
    unsubscribe_session(state.inner(), &args.session_id);
    Ok(())
}

fn ensure_runtime_url(app: &AppHandle, state: &ManagedRuntimeState) -> Result<String, String> {
    if let Ok(url) = std::env::var("JOONE_DESKTOP_RUNTIME_URL") {
        return Ok(url);
    }

    if cfg!(debug_assertions) {
        return Ok(format!("http://127.0.0.1:{}", DEV_RUNTIME_PORT));
    }

    if let Ok(guard) = state.base_url.lock() {
        if let Some(url) = guard.as_ref() {
            if check_runtime_health(url) {
                return Ok(url.clone());
            }
        }
    }

    spawn_managed_runtime(app, state)
}

fn spawn_managed_runtime(app: &AppHandle, state: &ManagedRuntimeState) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;

    // Installed desktop builds boot a bundled Node sidecar instead of assuming
    // an external runtime is already listening on a fixed port.
    let script_path = resource_dir.join("dist").join("desktop").join("runtimeEntry.js");
    if !script_path.exists() {
        return Err(format!(
            "Missing packaged desktop runtime entry at {}",
            script_path.display()
        ));
    }

    let port = pick_runtime_port()?;
    let base_url = format!("http://127.0.0.1:{port}");
    let node_path = resolve_bundled_node(&resource_dir)?;
    let workspace_dir = default_workspace_dir();

    let child = Command::new(node_path)
        .arg(script_path)
        .env("JOONE_DESKTOP_RUNTIME_PORT", port.to_string())
        .env("JOONE_DESKTOP_WORKSPACE", workspace_dir)
        .current_dir(&resource_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| error.to_string())?;

    wait_for_runtime_health(&base_url)?;

    if let Ok(mut process) = state.process.lock() {
        if let Some(existing) = process.as_mut() {
            let _ = existing.kill();
        }
        *process = Some(child);
    }
    if let Ok(mut stored_base_url) = state.base_url.lock() {
        *stored_base_url = Some(base_url.clone());
    }

    Ok(base_url)
}

fn wait_for_runtime_health(base_url: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if check_runtime_health(base_url) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    Err(format!("Timed out waiting for desktop runtime at {base_url}"))
}

fn check_runtime_health(base_url: &str) -> bool {
    Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()
        .and_then(|client| client.get(format!("{base_url}/health")).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn resolve_runtime_owner() -> &'static str {
    if std::env::var("JOONE_DESKTOP_RUNTIME_URL").is_ok() || cfg!(debug_assertions) {
        "external"
    } else {
        "managed"
    }
}

fn resolve_bundled_node(resource_dir: &PathBuf) -> Result<PathBuf, String> {
    let candidate = resource_dir.join(node_sidecar_name());
    if candidate.exists() {
        return Ok(candidate);
    }

    let fallback = resource_dir
        .join("binaries")
        .join(node_sidecar_name());
    if fallback.exists() {
        return Ok(fallback);
    }

    Err(format!(
        "Bundled desktop runtime sidecar not found at {}",
        candidate.display()
    ))
}

fn node_sidecar_name() -> &'static str {
    if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "node-runtime-x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "windows") && cfg!(target_arch = "aarch64") {
        "node-runtime-aarch64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "node-runtime-x86_64-unknown-linux-gnu"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        "node-runtime-aarch64-unknown-linux-gnu"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "node-runtime-aarch64-apple-darwin"
    } else {
        "node-runtime-x86_64-apple-darwin"
    }
}

fn pick_runtime_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    drop(listener);
    Ok(port)
}

fn default_workspace_dir() -> String {
    std::env::var("JOONE_DESKTOP_WORKSPACE")
        .or_else(|_| std::env::var("USERPROFILE"))
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

fn runtime_get_json<T: for<'de> Deserialize<'de>>(
    app: &AppHandle,
    state: &ManagedRuntimeState,
    path: &str,
) -> Result<T, String> {
    let base_url = ensure_runtime_url(app, state)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!("{base_url}{path}"))
        .send()
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Runtime returned {}", response.status()));
    }

    response.json::<T>().map_err(|error| error.to_string())
}

fn runtime_post_no_content(
    app: &AppHandle,
    state: &ManagedRuntimeState,
    path: &str,
    body: Value,
) -> Result<(), String> {
    let base_url = ensure_runtime_url(app, state)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
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

    Ok(())
}

fn runtime_post_with_body<T: for<'de> Deserialize<'de>>(
    app: &AppHandle,
    state: &ManagedRuntimeState,
    path: &str,
    body: Value,
) -> Result<T, String> {
    let base_url = ensure_runtime_url(app, state)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
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

    response.json::<T>().map_err(|error| error.to_string())
}

fn runtime_delete(
    app: &AppHandle,
    state: &ManagedRuntimeState,
    path: &str,
) -> Result<(), String> {
    let base_url = ensure_runtime_url(app, state)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
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

fn stream_runtime_events(
    app: AppHandle,
    base_url: &str,
    session_id: &str,
    stop_rx: mpsc::Receiver<()>,
) {
    let client = match Client::builder().build() {
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

fn unsubscribe_session(state: &ManagedRuntimeState, session_id: &str) {
    if let Ok(mut subscriptions) = state.subscriptions.lock() {
        if let Some(stop_tx) = subscriptions.remove(session_id) {
            let _ = stop_tx.send(());
        }
    }
}

fn kill_runtime_process(state: &ManagedRuntimeState) {
    if let Ok(mut process) = state.process.lock() {
        if let Some(child) = process.as_mut() {
            let _ = child.kill();
        }
        *process = None;
    }

    if let Ok(mut base_url) = state.base_url.lock() {
        *base_url = None;
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(ManagedRuntimeState::default())
        .setup(|app| {
            if !cfg!(debug_assertions) && std::env::var("JOONE_DESKTOP_RUNTIME_URL").is_err() {
                let state: State<ManagedRuntimeState> = app.state();
                spawn_managed_runtime(&app.handle(), state.inner())?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_base_url,
            runtime_status,
            runtime_workspace_context,
            runtime_load_config,
            runtime_save_config,
            runtime_test_provider_connection,
            runtime_check_updates,
            runtime_answer_hitl,
            runtime_list_sessions,
            runtime_start_session,
            runtime_resume_session,
            runtime_submit_message,
            runtime_close_session,
            runtime_subscribe_session,
            runtime_unsubscribe_session
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Joone Desktop");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            let state: State<ManagedRuntimeState> = app_handle.state();
            kill_runtime_process(state.inner());
        }
        _ => {}
    });
}
