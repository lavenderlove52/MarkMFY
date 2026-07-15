use serde::Serialize;

/// 统一的 Tauri command 错误类型，序列化后传给前端。
/// 所有 commands/ 下的命令应返回 `Result<T, AppError>`。
#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::new(err.to_string())
    }
}
