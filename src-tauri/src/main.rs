#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn runtime_base_url() -> String {
    std::env::var("JOONE_DESKTOP_RUNTIME_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:3011".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_base_url])
        .run(tauri::generate_context!())
        .expect("failed to run Joone Desktop");
}
