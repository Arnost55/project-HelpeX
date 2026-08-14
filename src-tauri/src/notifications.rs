use tauri::AppHandle;

pub fn notify_info(_app: &AppHandle, _title: &str, _body: &str) {
  // Placeholder notification hook. Wire to platform notifications as needed.
}

pub fn notify_success(app: &AppHandle, title: &str, body: &str) {
  notify_info(app, title, body);
}
