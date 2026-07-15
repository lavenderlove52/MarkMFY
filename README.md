# MarkMFY

个人轻量级 Markdown 桌面编辑器（Typora 风格所见即所得 + 内建可视化 Git 面板）。

技术栈：Tauri v2 + Vue3 + TypeScript + CodeMirror 6。

## 一键启动（推荐）

双击项目根目录的 **`start.bat`**（或在 PowerShell 中运行 `.\start.ps1`）。

脚本会：
1. 检查 Node / Rust 环境
2. 首次自动 `npm install`
3. 执行 `tauri dev`：自动编译前端 + Rust，并启动窗口；改代码后会热更新/自动重编

也可以在终端：

```bash
npm install
npm start
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `start.bat` / `npm start` | 编译并启动开发窗口 |
| `npm run tauri dev` | 同上 |
| `npm run build` | 类型检查 + 前端构建 |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化 |

## 文档

- [产品规划](docs/PRODUCT.md)
- [版本规划](docs/ROADMAP.md)
- [任务清单](docs/TASKS.md)
- [架构设计](docs/ARCHITECTURE.md)
- [开发规范](docs/CODING_STANDARDS.md)
- [AI 协作流程](docs/AI_WORKFLOW.md)
- [AGENTS.md](AGENTS.md)

## 推荐 IDE

VS Code + Vue - Official + Tauri + rust-analyzer
