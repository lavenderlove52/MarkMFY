//! 文件系统相关的纯业务逻辑，不依赖 tauri，方便单测。

use crate::error::AppError;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// 列出目录下的文件/文件夹（不递归），跳过以 `.` 开头的隐藏文件/目录。
/// 目录优先，其余按名称（忽略大小写）排序。
pub fn list_dir(dir_path: &str) -> Result<Vec<FileEntry>, AppError> {
    let path = Path::new(dir_path);
    if !path.is_dir() {
        return Err(AppError::new(format!("{} 不是一个有效的文件夹", dir_path)));
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type()?;
        entries.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// 读取文本文件内容，自动去除 UTF-8 BOM，并将 CRLF/CR 规范为 LF。
/// Windows 下 CRLF 会导致 GFM 表格等语法无法被 @lezer/markdown 正确识别。
pub fn read_file(file_path: &str) -> Result<String, AppError> {
    let bytes = fs::read(file_path)?;
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        &bytes[..]
    };
    let text = String::from_utf8(bytes.to_vec()).map_err(|e| AppError::new(e.to_string()))?;
    Ok(text.replace("\r\n", "\n").replace('\r', "\n"))
}

/// 写入文本文件内容（UTF-8，不带 BOM）。
pub fn write_file(file_path: &str, content: &str) -> Result<(), AppError> {
    fs::write(file_path, content)?;
    Ok(())
}

/// 创建空文件；若已存在则报错（避免覆盖）。
pub fn create_file(file_path: &str, content: &str) -> Result<(), AppError> {
    let path = Path::new(file_path);
    if path.exists() {
        return Err(AppError::new(format!("已存在：{}", file_path)));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err(AppError::new(format!(
                "父目录不存在：{}",
                parent.display()
            )));
        }
    }
    fs::write(path, content)?;
    Ok(())
}

/// 创建空目录；若已存在则报错。
pub fn create_dir(dir_path: &str) -> Result<(), AppError> {
    let path = Path::new(dir_path);
    if path.exists() {
        return Err(AppError::new(format!("已存在：{}", dir_path)));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.is_dir() {
            return Err(AppError::new(format!(
                "父目录无效：{}",
                parent.display()
            )));
        }
    }
    fs::create_dir(path)?;
    Ok(())
}

/// 将图片二进制数据保存到指定 markdown 文件同级的 assets 目录，返回相对路径。
pub fn save_pasted_image(
    markdown_file_path: &str,
    file_name: &str,
    data: &[u8],
) -> Result<String, AppError> {
    let name = file_name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::new("图片文件名不合法"));
    }
    let md_path = Path::new(markdown_file_path);
    let parent = md_path
        .parent()
        .ok_or_else(|| AppError::new("无法确定 markdown 文件所在目录".to_string()))?;
    let assets_dir = parent.join("assets");
    fs::create_dir_all(&assets_dir)?;

    let target_path = assets_dir.join(name);
    fs::write(&target_path, data)?;

    Ok(format!("assets/{}", name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(prefix: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("markmfy_{}_{}", prefix, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_write_roundtrip_utf8_chinese() {
        let dir = temp_dir("rw");
        let file = dir.join("笔记.md");
        let content = "你好，世界\n第二行";
        write_file(file.to_str().unwrap(), content).unwrap();
        let read = read_file(file.to_str().unwrap()).unwrap();
        assert_eq!(read, content);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn read_strips_utf8_bom() {
        let dir = temp_dir("bom");
        let file = dir.join("bom.md");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("带BOM".as_bytes());
        fs::write(&file, bytes).unwrap();
        let read = read_file(file.to_str().unwrap()).unwrap();
        assert_eq!(read, "带BOM");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn read_normalizes_crlf_to_lf() {
        let dir = temp_dir("crlf");
        let file = dir.join("crlf.md");
        fs::write(&file, b"| a | b |\r\n| --- | --- |\r\n| 1 | 2 |\r\n").unwrap();
        let read = read_file(file.to_str().unwrap()).unwrap();
        assert!(!read.contains('\r'));
        assert!(read.contains("| a | b |\n| --- | --- |\n"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn create_file_and_dir_ok() {
        let dir = temp_dir("create");
        let sub = dir.join("notes");
        create_dir(sub.to_str().unwrap()).unwrap();
        assert!(sub.is_dir());
        let file = sub.join("a.md");
        create_file(file.to_str().unwrap(), "# hi\n").unwrap();
        assert_eq!(read_file(file.to_str().unwrap()).unwrap(), "# hi\n");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn create_file_rejects_existing() {
        let dir = temp_dir("create_exist");
        let file = dir.join("a.md");
        create_file(file.to_str().unwrap(), "").unwrap();
        assert!(create_file(file.to_str().unwrap(), "").is_err());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn save_pasted_image_rejects_path_like_file_name() {
        let dir = temp_dir("image_name");
        let file = dir.join("a.md");
        create_file(file.to_str().unwrap(), "").unwrap();
        assert!(save_pasted_image(file.to_str().unwrap(), "../bad.png", b"img").is_err());
        assert!(save_pasted_image(file.to_str().unwrap(), "nested/bad.png", b"img").is_err());
        let _ = fs::remove_dir_all(dir);
    }
}
