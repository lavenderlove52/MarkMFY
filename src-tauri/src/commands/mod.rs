//! Tauri command 层：按模块拆分子文件（fs.rs、git.rs、image.rs），
//! 每个 command 只做参数校验和调用转发，具体逻辑放在 core/ 下。

pub mod app;
pub mod fs;
pub mod git;
pub mod search;
pub mod settings;
