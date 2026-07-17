//! 设置相关 tauri command：解析配置路径并转发到 core::settings。
//!
//! 配置落在**可执行文件同级目录**下的 `config/settings.json`（便携/安装目录），
//! 不再使用系统 AppData。若安装目录尚无配置而旧 AppData 有文件，则首次加载时复制迁移。

use crate::core::settings::{self, AppSettings};
use crate::error::AppError;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// `<exe_dir>/config/settings.json`
fn install_settings_file() -> Result<PathBuf, AppError> {
    let exe = std::env::current_exe().map_err(|e| AppError::new(format!("current_exe: {e}")))?;
    let dir = exe
        .parent()
        .ok_or_else(|| AppError::new("executable has no parent directory"))?;
    Ok(dir.join("config").join("settings.json"))
}

/// 旧版路径：`%AppData%/com.markmfy.app/settings.json`（仅用于迁移）。
fn legacy_appdata_settings_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("settings.json"))
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, AppError> {
    let path = install_settings_file()?;
    if path.exists() {
        return Ok(path);
    }

    // 首次切到安装目录：从旧 AppData 迁一次（失败则忽略，用默认配置）
    if let Some(legacy) = legacy_appdata_settings_file(app) {
        if legacy.exists() {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::copy(&legacy, &path).is_ok() {
                return Ok(path);
            }
        }
    }

    Ok(path)
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
