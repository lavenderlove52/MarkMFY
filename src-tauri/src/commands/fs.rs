//! 文件系统相关 tauri command，只做参数转发，逻辑见 core::fs。

use crate::core::fs as fs_core;
use crate::error::AppError;

#[tauri::command]
pub fn fs_list_dir(dir_path: String) -> Result<Vec<fs_core::FileEntry>, AppError> {
    fs_core::list_dir(&dir_path)
}

#[tauri::command]
pub fn fs_read_file(file_path: String) -> Result<String, AppError> {
    fs_core::read_file(&file_path)
}

#[tauri::command]
pub fn fs_write_file(file_path: String, content: String) -> Result<(), AppError> {
    fs_core::write_file(&file_path, &content)
}

#[tauri::command]
pub fn fs_create_file(file_path: String, content: String) -> Result<(), AppError> {
    fs_core::create_file(&file_path, &content)
}

#[tauri::command]
pub fn fs_create_dir(dir_path: String) -> Result<(), AppError> {
    fs_core::create_dir(&dir_path)
}

/// 获取文件最后修改时间（epoch 毫秒），文件不存在时返回 `null`；用于检测文件是否被其它程序修改过。
#[tauri::command]
pub fn fs_get_mtime(file_path: String) -> Result<Option<i64>, AppError> {
    fs_core::get_mtime(&file_path)
}

#[tauri::command]
pub fn fs_save_pasted_image(
    markdown_file_path: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, AppError> {
    fs_core::save_pasted_image(&markdown_file_path, &file_name, &data)
}
