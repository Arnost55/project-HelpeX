import { invoke } from "@tauri-apps/api/core";



export function restartApplication() {
    invoke("restart_application");
}
