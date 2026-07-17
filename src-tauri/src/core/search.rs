//! 工作区 Markdown 全文搜索（纯逻辑，不依赖 tauri）。

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    /// 1-based 行号
    pub line: u32,
    /// 0-based 列（该行内字符偏移）
    pub column: u32,
    /// 文档内绝对偏移（LF 规范化后，UTF-16 code unit，与 JS/CodeMirror 一致）
    pub from: u32,
    pub to: u32,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub root_path: String,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default = "default_max_results")]
    pub max_results: u32,
}

fn default_max_results() -> u32 {
    500
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".vscode" | ".idea" | "vendor"
    ) || name.starts_with('.')
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn collect_markdown_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if ft.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            collect_markdown_files(&path, out)?;
        } else if ft.is_file() && is_markdown(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn utf16_offset(text: &str, byte_offset: usize) -> u32 {
    text[..byte_offset]
        .chars()
        .map(|c| c.len_utf16())
        .sum::<usize>() as u32
}

fn push_hit(text: &str, path: &str, from: usize, to: usize, out: &mut Vec<SearchHit>) {
    let line_start = text[..from].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = text[from..]
        .find('\n')
        .map(|i| from + i)
        .unwrap_or(text.len());
    let line_no = text[..from].bytes().filter(|&b| b == b'\n').count() as u32 + 1;
    let column = text[line_start..from].chars().count() as u32;
    let preview = text[line_start..line_end].trim_end().to_string();
    out.push(SearchHit {
        path: path.to_string(),
        line: line_no,
        column,
        from: utf16_offset(text, from),
        to: utf16_offset(text, to),
        preview,
    });
}

fn find_in_text(
    text: &str,
    query: &str,
    case_sensitive: bool,
    path: &str,
    limit: usize,
    out: &mut Vec<SearchHit>,
) {
    if query.is_empty() || out.len() >= limit {
        return;
    }

    if case_sensitive {
        let mut start = 0usize;
        while out.len() < limit {
            let Some(rel) = text[start..].find(query) else {
                break;
            };
            let from = start + rel;
            let to = from + query.len();
            push_hit(text, path, from, to, out);
            start = to;
            if start >= text.len() {
                break;
            }
        }
        return;
    }

    // 大小写不敏感：按 Unicode 标量比较；push_hit 再转为 UTF-16 偏移
    let needle: Vec<char> = query.chars().collect();
    let needle_len = needle.len();
    if needle_len == 0 {
        return;
    }

    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let n = chars.len();
    let mut i = 0usize;
    while i + needle_len <= n && out.len() < limit {
        let mut matched = true;
        for j in 0..needle_len {
            if !chars[i + j]
                .1
                .to_lowercase()
                .eq(needle[j].to_lowercase())
            {
                matched = false;
                break;
            }
        }
        if matched {
            let from = chars[i].0;
            let last = chars[i + needle_len - 1];
            let to = last.0 + last.1.len_utf8();
            push_hit(text, path, from, to, out);
            i += needle_len;
        } else {
            i += 1;
        }
    }
}

/// 在工作区 Markdown 文件中搜索；`query` 为空返回空列表。
pub fn search_workspace(req: &SearchRequest) -> Result<Vec<SearchHit>, AppError> {
    let query = req.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let root = Path::new(&req.root_path);
    if !root.is_dir() {
        return Err(AppError::new(format!("{} 不是有效文件夹", req.root_path)));
    }

    let max = req.max_results.clamp(1, 2000) as usize;
    let mut files = Vec::new();
    collect_markdown_files(root, &mut files)?;
    files.sort();

    let mut hits = Vec::new();
    for path in files {
        if hits.len() >= max {
            break;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let Ok(raw) = std::str::from_utf8(bytes) else {
            continue;
        };
        let text = raw.replace("\r\n", "\n").replace('\r', "\n");
        let path_str = path.to_string_lossy().to_string();
        find_in_text(&text, query, req.case_sensitive, &path_str, max, &mut hits);
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn finds_matches_case_insensitive() {
        let dir = env::temp_dir().join("markmfy-search-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.md");
        fs::write(&file, "Hello MarkMFY\nhello again\n").unwrap();

        let hits = search_workspace(&SearchRequest {
            root_path: dir.to_string_lossy().to_string(),
            query: "hello".into(),
            case_sensitive: false,
            max_results: 50,
        })
        .unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[1].line, 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn skips_empty_query() {
        let dir = env::temp_dir().join("markmfy-search-empty");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let hits = search_workspace(&SearchRequest {
            root_path: dir.to_string_lossy().to_string(),
            query: "  ".into(),
            case_sensitive: false,
            max_results: 10,
        })
        .unwrap();
        assert!(hits.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn utf16_offsets_match_js_for_cjk() {
        let dir = env::temp_dir().join("markmfy-search-cjk");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("cjk.md");
        // "测" 在 UTF-8 为 3 字节，UTF-16 为 1 code unit
        fs::write(&file, "前缀测词后缀\n").unwrap();
        let hits = search_workspace(&SearchRequest {
            root_path: dir.to_string_lossy().to_string(),
            query: "测词".into(),
            case_sensitive: true,
            max_results: 10,
        })
        .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].from, 2); // 「前」「缀」各 1 UTF-16 unit
        assert_eq!(hits[0].to, 4);
        let _ = fs::remove_dir_all(&dir);
    }
}
