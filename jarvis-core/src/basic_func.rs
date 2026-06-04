pub fn app_restart() {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(&["TASKKILL", "/IM", "jarvis.exe", "/F", "&&", "start", "jarvis.exe"])
            .spawn()
            .expect("Failed to restart application");
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("sh")
            .arg("-c")
            .arg("nohup $0 &")
            .spawn()
            .expect("Failed to restart application");
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("sh")
            .arg("-c")
            .arg("nohup $0 &")
            .spawn()
            .expect("Failed to restart application");
    }
}
pub fn app_exit() {
    std::process::exit(0);
}


