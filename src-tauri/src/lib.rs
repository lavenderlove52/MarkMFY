mod commands;
mod core;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::fs::fs_list_dir,
            commands::fs::fs_read_file,
            commands::fs::fs_write_file,
            commands::fs::fs_save_pasted_image,
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_commit,
            commands::git::git_log,
            commands::git::git_commit_diff,
            commands::git::git_branches,
            commands::git::git_checkout,
            commands::settings::settings_load,
            commands::settings::settings_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
