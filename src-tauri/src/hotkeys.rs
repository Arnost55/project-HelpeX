use std::str::FromStr;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
  let global_shortcut = app.global_shortcut();
  let toggle = Shortcut::from_str("Ctrl+Space")
    .map_err(|e| format!("Failed to parse hotkey: {e}"))?;
  global_shortcut
    .register(toggle)
    .map_err(|e| format!("Failed to register hotkey: {e}"))?;
  Ok(())
}

pub fn on_hotkey_pressed(app: &AppHandle, shortcut: &Shortcut) {
  if shortcut == &Shortcut::from_str("Ctrl+Space").unwrap_or_else(|_| shortcut.clone()) {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.show();
      let _ = window.set_focus();
    }
  }
}
