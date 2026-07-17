//! 与 tauri 无关的纯业务逻辑层，方便单元测试与未来复用。
//! 按模块拆分子文件（如 fs.rs、git.rs），commands/ 下的 tauri command
//! 只做参数校验和调用转发到这里的函数。

pub mod fs;
pub mod git;
pub mod search;
pub mod settings;
