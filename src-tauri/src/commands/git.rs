//! Git 相关 tauri command，只做参数转发，逻辑见 core::git。

use crate::core::git as git_core;
use crate::error::AppError;

#[tauri::command]
pub fn git_status(workspace_path: String) -> Result<git_core::GitStatusResult, AppError> {
    git_core::status(&workspace_path)
}

#[tauri::command]
pub fn git_diff(
    workspace_path: String,
    file_path: String,
    staged: bool,
) -> Result<Vec<git_core::DiffLine>, AppError> {
    git_core::diff_file(&workspace_path, &file_path, staged)
}

#[tauri::command]
pub fn git_stage(workspace_path: String, file_path: String) -> Result<(), AppError> {
    git_core::stage(&workspace_path, &file_path)
}

#[tauri::command]
pub fn git_unstage(workspace_path: String, file_path: String) -> Result<(), AppError> {
    git_core::unstage(&workspace_path, &file_path)
}

#[tauri::command]
pub fn git_commit(workspace_path: String, message: String) -> Result<String, AppError> {
    git_core::commit(&workspace_path, &message)
}

#[tauri::command]
pub fn git_log(workspace_path: String, limit: usize) -> Result<Vec<git_core::CommitInfo>, AppError> {
    git_core::log(&workspace_path, limit)
}

#[tauri::command]
pub fn git_commit_diff(
    workspace_path: String,
    commit_hash: String,
) -> Result<Vec<git_core::DiffLine>, AppError> {
    git_core::commit_diff(&workspace_path, &commit_hash)
}

#[tauri::command]
pub fn git_branches(workspace_path: String) -> Result<Vec<git_core::BranchInfo>, AppError> {
    git_core::branches(&workspace_path)
}

#[tauri::command]
pub fn git_checkout(workspace_path: String, branch_name: String) -> Result<(), AppError> {
    git_core::checkout(&workspace_path, &branch_name)
}
