//! 应用设置：读写 settings.json（与 Tauri 无关，便于单测）。
//! 实际路径由 commands/settings 定为「安装目录/config/settings.json」。

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    /// classic=原版；fresh=清新（默认）
    #[serde(default = "default_ui_style")]
    pub ui_style: String,
    pub editor_font_family: String,
    pub editor_font_size: u32,
    /// 阅读区域最大宽度（px）；表格/图片/流程图/代码块均以此为 100% 基准。
    /// 0 表示不限宽度（撑满编辑器可用空间）。
    #[serde(default = "default_editor_content_width")]
    pub editor_content_width: u32,
    #[serde(default)]
    pub keybindings: HashMap<String, String>,
    /// 上次打开的工作区路径；空表示无
    #[serde(default)]
    pub last_workspace_path: String,
    /// 最近打开的工作区目录（MRU，去重，最多 50）
    #[serde(default)]
    pub recent_workspace_paths: Vec<String>,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u32,
    #[serde(default = "default_git_panel_width")]
    pub git_panel_width: u32,
    #[serde(default = "default_true")]
    pub sidebar_open: bool,
    #[serde(default = "default_true")]
    pub git_panel_open: bool,
    /// 格式工具栏上次字体颜色
    #[serde(default = "default_last_font_color")]
    pub last_font_color: String,
    /// 格式工具栏上次背景颜色
    #[serde(default = "default_last_background_color")]
    pub last_background_color: String,
}

fn default_sidebar_width() -> u32 {
    240
}
fn default_git_panel_width() -> u32 {
    320
}
fn default_true() -> bool {
    true
}
fn default_last_font_color() -> String {
    "#000000".into()
}
fn default_last_background_color() -> String {
    "#fef3c7".into()
}

fn default_ui_style() -> String {
    "fresh".into()
}
fn default_editor_content_width() -> u32 {
    820
}

const RECENT_WORKSPACE_LIMIT: usize = 50;

fn normalize_recent_workspace_paths(paths: Vec<String>, seed_last: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for p in paths {
        let t = p.trim().to_string();
        if t.is_empty() {
            continue;
        }
        let key = t.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        out.push(t);
        if out.len() >= RECENT_WORKSPACE_LIMIT {
            break;
        }
    }
    let seed = seed_last.trim();
    if out.is_empty() && !seed.is_empty() {
        out.push(seed.to_string());
    }
    out
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            ui_style: default_ui_style(),
            editor_font_family: "\"Segoe UI\", system-ui, -apple-system, sans-serif".into(),
            editor_font_size: 15,
            editor_content_width: default_editor_content_width(),
            keybindings: HashMap::new(),
            last_workspace_path: String::new(),
            recent_workspace_paths: Vec::new(),
            sidebar_width: default_sidebar_width(),
            git_panel_width: default_git_panel_width(),
            sidebar_open: true,
            git_panel_open: true,
            last_font_color: default_last_font_color(),
            last_background_color: default_last_background_color(),
        }
    }
}

impl AppSettings {
    pub fn normalize(mut self) -> Self {
        let theme = self.theme.to_lowercase();
        self.theme = if theme == "dark" {
            "dark".into()
        } else {
            "light".into()
        };
        let ui = self.ui_style.to_lowercase();
        self.ui_style = if ui == "classic" {
            "classic".into()
        } else {
            "fresh".into()
        };
        if self.editor_font_family.trim().is_empty() {
            self.editor_font_family = Self::default().editor_font_family;
        }
        self.editor_font_size = self.editor_font_size.clamp(10, 28);
        self.editor_content_width = if self.editor_content_width == 0 {
            0
        } else {
            self.editor_content_width.clamp(640, 1800)
        };
        self.keybindings
            .retain(|k, v| !k.trim().is_empty() && !v.trim().is_empty());
        self.last_workspace_path = self.last_workspace_path.trim().to_string();
        self.recent_workspace_paths = normalize_recent_workspace_paths(
            self.recent_workspace_paths,
            &self.last_workspace_path,
        );
        self.sidebar_width = self.sidebar_width.clamp(160, 480);
        self.git_panel_width = self.git_panel_width.clamp(220, 560);
        self.last_font_color = normalize_color(&self.last_font_color, "#000000");
        self.last_background_color = normalize_color(&self.last_background_color, "#fef3c7");
        self
    }
}

fn normalize_color(raw: &str, fallback: &str) -> String {
    let v = raw.trim().to_lowercase();
    if v == "transparent" {
        return "transparent".into();
    }
    if v.len() == 7 && v.starts_with('#') && v[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return v;
    }
    if v.len() == 4 && v.starts_with('#') && v[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        let chars: Vec<char> = v.chars().skip(1).collect();
        return format!(
            "#{}{}{}{}{}{}",
            chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]
        );
    }
    fallback.into()
}

/// 从路径加载设置；文件不存在或损坏时返回默认值。
pub fn load(path: &Path) -> Result<AppSettings, AppError> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let raw = fs::read_to_string(path)?;
    match serde_json::from_str::<AppSettings>(&raw) {
        Ok(settings) => Ok(settings.normalize()),
        Err(_) => Ok(AppSettings::default()),
    }
}

/// 将设置写入路径（自动创建父目录）。
pub fn save(path: &Path, settings: &AppSettings) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let normalized = settings.clone().normalize();
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|e| AppError::new(format!("serialize settings: {e}")))?;
    fs::write(path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn load_missing_file_returns_default() {
        let path = env::temp_dir().join("markmfy-settings-missing-test.json");
        let _ = fs::remove_file(&path);
        let s = load(&path).unwrap();
        assert_eq!(s, AppSettings::default());
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = env::temp_dir().join("markmfy-settings-roundtrip-test.json");
        let _ = fs::remove_file(&path);
        let mut s = AppSettings::default();
        s.theme = "dark".into();
        s.editor_font_size = 18;
        s.keybindings
            .insert("file.save".into(), "Mod-Shift-s".into());
        save(&path, &s).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.editor_font_size, 18);
        assert_eq!(
            loaded.keybindings.get("file.save").map(String::as_str),
            Some("Mod-Shift-s")
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn load_without_keybindings_field_defaults_empty() {
        let path = env::temp_dir().join("markmfy-settings-legacy-test.json");
        fs::write(
            &path,
            r#"{"theme":"light","editorFontFamily":"Arial","editorFontSize":14}"#,
        )
        .unwrap();
        let s = load(&path).unwrap();
        assert!(s.keybindings.is_empty());
        assert_eq!(s.editor_font_size, 14);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn corrupt_file_falls_back_to_default() {
        let path = env::temp_dir().join("markmfy-settings-corrupt-test.json");
        fs::write(&path, "{not-json").unwrap();
        let s = load(&path).unwrap();
        assert_eq!(s, AppSettings::default());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn normalize_clamps_font_size_and_theme() {
        let s = AppSettings {
            theme: "DARK".into(),
            ui_style: "CLASSIC".into(),
            editor_font_family: "".into(),
            editor_font_size: 99,
            editor_content_width: 5000,
            keybindings: HashMap::new(),
            last_workspace_path: "  D:\\notes  ".into(),
            recent_workspace_paths: vec![
                " D:\\notes ".into(),
                "D:\\Notes".into(),
                "D:\\work".into(),
            ],
            sidebar_width: 999,
            git_panel_width: 10,
            sidebar_open: true,
            git_panel_open: false,
            last_font_color: "RED".into(),
            last_background_color: "#0f0".into(),
        }
        .normalize();
        assert_eq!(s.theme, "dark");
        assert_eq!(s.ui_style, "classic");
        assert_eq!(s.editor_font_size, 28);
        assert_eq!(s.editor_content_width, 1800);
        assert!(!s.editor_font_family.is_empty());
        assert_eq!(s.last_workspace_path, "D:\\notes");
        assert_eq!(
            s.recent_workspace_paths,
            vec!["D:\\notes".to_string(), "D:\\work".to_string()]
        );
        assert_eq!(s.sidebar_width, 480);
        assert_eq!(s.git_panel_width, 220);
        assert!(!s.git_panel_open);
        assert_eq!(s.last_font_color, "#000000");
        assert_eq!(s.last_background_color, "#00ff00");
    }

    #[test]
    fn editor_content_width_zero_means_unlimited() {
        let s = AppSettings {
            editor_content_width: 0,
            ..AppSettings::default()
        }
        .normalize();
        assert_eq!(s.editor_content_width, 0);
    }

    #[test]
    fn load_without_editor_content_width_field_defaults_to_820() {
        let path = env::temp_dir().join("markmfy-settings-legacy-content-width-test.json");
        fs::write(
            &path,
            r#"{"theme":"light","editorFontFamily":"Arial","editorFontSize":14}"#,
        )
        .unwrap();
        let s = load(&path).unwrap();
        assert_eq!(s.editor_content_width, 820);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn recent_paths_seed_from_last_when_empty() {
        let s = AppSettings {
            last_workspace_path: "D:\\only".into(),
            recent_workspace_paths: vec![],
            ..AppSettings::default()
        }
        .normalize();
        assert_eq!(s.recent_workspace_paths, vec!["D:\\only".to_string()]);
    }
}
