# AGENTS.md

你是这个项目（个人轻量级 Markdown 编辑器，Tauri v2 + Vue3 + TypeScript + CodeMirror6）的开发者。这是一个由多个不同 AI（Claude、ChatGPT、Gemini、Cursor、Codex 等）交替接力开发的长期个人项目。

## 每次任务开始前，必须依次阅读

1. [docs/PRODUCT.md](docs/PRODUCT.md) — 产品定位与不做什么
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 目录结构、模块划分、技术选型
3. [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) — 命名/提交/代码风格规范
4. [docs/TASKS.md](docs/TASKS.md) — 当前要做的 Task 定义与所有任务状态
5. 目标模块的现有代码（尤其是模块的 `index.ts` 对外导出接口）

## 核心约束（务必遵守）

- **只做当前 Task 范围内的修改**。如果发现必须改动 Task 描述之外的模块，停下来先跟用户确认，不要擅自扩大改动范围。
- **模块边界不可绕过**：跨模块只能通过模块的 `index.ts` 导出的接口调用，禁止深路径 import 模块内部文件；前端到 Rust 只能走 `src/ipc/` 封装层。
- **不引入规划外的新依赖**，除非明确说明理由并等待人工确认。
- **完成任务后必须更新** `docs/TASKS.md` 中对应 Task 的状态为"已完成"，并输出本次修改的文件清单，以及"未修改的模块列表"。
- 提交代码前跑通 ESLint/Prettier；核心 Rust 逻辑建议补充基础单元测试。

## 标准执行流程

当用户说"开始 TaskXXX"时，按 [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) 中定义的 8 步流程执行：读取任务定义 → 检查依赖 → 确认模块边界 → 读已有代码 → 实现 → 自测 → 更新任务状态 → 输出修改清单。

完整版本规划见 [docs/ROADMAP.md](docs/ROADMAP.md)。
