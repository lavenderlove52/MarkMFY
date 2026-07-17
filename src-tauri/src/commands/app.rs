//! 应用级 command：启动参数等与具体业务模块无关的入口。

use crate::error::AppError;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartupOpenPath {
    pub path: String,
    pub is_dir: bool,
}

fn parse_arg_to_path(arg: &str) -> Option<PathBuf> {
    let trimmed = arg.trim().trim_matches('"');
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return None;
    }

    // Windows「打开方式」偶发传入 file:///C:/... 或 file://localhost/C:/...
    if let Some(rest) = trimmed.strip_prefix("file:///") {
        return Some(PathBuf::from(rest));
    }
    if let Some(rest) = trimmed.strip_prefix("file://") {
        let without_host = rest
            .strip_prefix("localhost/")
            .or_else(|| rest.strip_prefix("localhost\\"))
            .unwrap_or(rest);
        return Some(PathBuf::from(without_host));
    }

    Some(PathBuf::from(trimmed))
}

fn collect_startup_open_paths() -> Vec<StartupOpenPath> {
    let mut out = Vec::new();
    for arg in std::env::args().skip(1) {
        let Some(path) = parse_arg_to_path(&arg) else {
            continue;
        };
        if !path.exists() {
            continue;
        }
        let is_dir = path.is_dir();
        // 只接受普通文件或目录，跳过奇怪的特殊节点
        if !is_dir && !path.is_file() {
            continue;
        }
        out.push(StartupOpenPath {
            path: path.to_string_lossy().to_string(),
            is_dir,
        });
    }
    out
}

/// 返回本次进程启动时命令行里可打开的文件/目录路径（跳过 -flag）。
#[tauri::command]
pub fn app_startup_open_paths() -> Result<Vec<StartupOpenPath>, AppError> {
    Ok(collect_startup_open_paths())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn parse_plain_path() {
        let p = parse_arg_to_path(r"D:\notes\a.md").unwrap();
        assert_eq!(p, PathBuf::from(r"D:\notes\a.md"));
    }

    #[test]
    fn parse_file_url() {
        let p = parse_arg_to_path("file:///D:/notes/a.md").unwrap();
        assert_eq!(p, PathBuf::from("D:/notes/a.md"));
    }

    #[test]
    fn skip_flags() {
        assert!(parse_arg_to_path("--flag").is_none());
        assert!(parse_arg_to_path("-d").is_none());
        assert!(parse_arg_to_path("").is_none());
    }

    #[test]
    fn parent_of_file_is_dir_logic() {
        let file = Path::new(r"D:\notes\a.md");
        assert_eq!(file.parent().unwrap(), Path::new(r"D:\notes"));
    }
}
