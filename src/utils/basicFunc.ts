import { invoke } from "@tauri-apps/api/core";



export function restartApplication() {
    if (window.confirm("Are you sure you want to restart the application?")) {
    invoke("restart_application").then(() => {
        // Optionally, you can add any cleanup code here before the app restarts
    });
    }
}
