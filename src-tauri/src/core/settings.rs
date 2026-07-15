//! 应用设置：读写配置目录下的 settings.json（与 Tauri 无关，便于单测）。

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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "light".into(),
            editor_font_family: "\"Segoe UI\", system-ui, -apple-system, sans-serif".into(),
            editor_font_size: 15,
            keybindings: HashMap::new(),
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
        self
    }
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
        }
        .normalize();
        assert_eq!(s.theme, "dark");
        assert_eq!(s.editor_font_size, 28);
        assert!(!s.editor_font_family.is_empty());
    }
}
