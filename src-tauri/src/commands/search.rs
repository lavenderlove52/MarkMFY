//! 搜索相关 tauri command。

use crate::core::search::{self, SearchHit, SearchRequest};
use crate::error::AppError;

#[tauri::command]
pub fn search_workspace(request: SearchRequest) -> Result<Vec<SearchHit>, AppError> {
    search::search_workspace(&request)
}
