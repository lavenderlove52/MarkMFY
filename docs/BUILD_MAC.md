# Mac 构建说明（Task058）

MarkMFY 优先 Windows；Mac 为后续正式支持目标。本文件提供可复现构建清单。V1.0 **不要求**在 Windows 开发机产出 `.app`/`.dmg`，也不包含 Apple 公证/签名流水线。

## 前置条件

- macOS（建议 13+）
- Xcode Command Line Tools：`xcode-select --install`
- Node.js（与 Windows 开发同主版本即可）与 npm
- Rust：`rustup`；按需安装目标：
  - Apple Silicon：`rustup target add aarch64-apple-darwin`
  - Intel：`rustup target add x86_64-apple-darwin`
- [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)（含 WebKit）

## 依赖注意点（git2 / libgit2）

本项目 Rust 侧使用 git 相关 crate。在 Mac 上若链接失败：

1. 确认 Xcode CLT 已装。  
2. 按 git2/libgit2 官方说明安装系统库或启用 `vendored` feature（若日后 Cargo.toml 调整，以仓库当时配置为准）。  
3. 清理后重试：`cd src-tauri && cargo clean && cargo build`

## 构建步骤

```bash
git clone <repo> && cd MarkMFY
npm install
# 开发
npm run tauri -- dev
# 发行（当前机器架构）
npm run tauri -- build
# 指定目标示例（Apple Silicon）
npm run tauri -- build -- --target aarch64-apple-darwin
```

产物通常位于：

- `src-tauri/target/release/bundle/macos/*.app`
- `src-tauri/target/release/bundle/dmg/*.dmg`（若 targets 含 dmg）

图标：仓库已含 `src-tauri/icons/icon.icns`；`tauri.conf.json` 的 `bundle.targets` 为 `"all"`。

## 快捷键

前端快捷键使用 `Mod`：Windows/Linux 为 Ctrl，Mac 为 Meta（⌘）。无需为 Mac 单独改命令 id。

## 签名与公证（后续）

正式分发需要：

1. Apple Developer 证书  
2. `codesign` 签名 `.app`  
3. `notarytool` / `altool` 公证与 stapler  

V1.0 明确**未做**上述步骤；个人本机 `tauri build` 的未签名包仅供自测。

## 验收清单

- [ ] 按本文在一台 Mac 上 `tauri dev` 可启动  
- [ ] `tauri build` 产出 `.app`（或记录 git2/工具链阻塞原因）  
- [ ] 打开文件夹、编辑保存、Git 面板基础操作冒烟通过  
- [ ] 已知：未公证应用首次打开需在「隐私与安全性」中允许
