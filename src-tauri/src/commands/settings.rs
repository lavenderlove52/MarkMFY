//! 设置相关 tauri command：解析配置路径并转发到 core::settings。

use crate::core::settings::{self, AppSettings};
use crate::error::AppError;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn settings_file(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::new(format!("app config dir: {e}")))?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<AppSettings, AppError> {
    let path = settings_file(&app)?;
    settings::load(&path)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: AppSettings) -> Result<(), AppError> {
    let path = settings_file(&app)?;
    settings::save(&path, &settings)
}
