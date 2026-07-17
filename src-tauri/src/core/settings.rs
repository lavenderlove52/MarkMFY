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
    pub editor_font_family: String,
    pub editor_font_size: u32,
    #[serde(default)]
    pub keybindings: HashMap<String, String>,
    /// 上次打开的工作区路径；空表示无
    #[serde(default)]
    pub last_workspace_path: String,
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

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            editor_font_family: "\"Segoe UI\", system-ui, -apple-system, sans-serif".into(),
            editor_font_size: 15,
            keybindings: HashMap::new(),
            last_workspace_path: String::new(),
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
        if self.editor_font_family.trim().is_empty() {
            self.editor_font_family = Self::default().editor_font_family;
        }
        self.editor_font_size = self.editor_font_size.clamp(10, 28);
        self.keybindings
            .retain(|k, v| !k.trim().is_empty() && !v.trim().is_empty());
        self.last_workspace_path = self.last_workspace_path.trim().to_string();
        self.sidebar_width = self.sidebar_width.clamp(160, 480);
        self.git_panel_width = self.git_panel_width.clamp(220, 560);
        self.last_font_color = normalize_color(&self.last_font_color, "#000000");
        self.last_background_color =
            normalize_color(&self.last_background_color, "#fef3c7");
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
        s.keybindings.insert("file.save".into(), "Mod-Shift-s".into());
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
            editor_font_family: "".into(),
            editor_font_size: 99,
            keybindings: HashMap::new(),
            last_workspace_path: "  D:\\notes  ".into(),
            sidebar_width: 999,
            git_panel_width: 10,
            sidebar_open: true,
            git_panel_open: false,
            last_font_color: "RED".into(),
            last_background_color: "#0f0".into(),
        }
        .normalize();
        assert_eq!(s.theme, "dark");
        assert_eq!(s.editor_font_size, 28);
        assert!(!s.editor_font_family.is_empty());
        assert_eq!(s.last_workspace_path, "D:\\notes");
        assert_eq!(s.sidebar_width, 480);
        assert_eq!(s.git_panel_width, 220);
        assert!(!s.git_panel_open);
        assert_eq!(s.last_font_color, "#000000");
        assert_eq!(s.last_background_color, "#00ff00");
    }
}
