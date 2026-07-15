# 开发规范

## Git Commit 规范

Conventional Commits，格式 `<type>(<module>): <description>`，module 对应 [ARCHITECTURE.md](ARCHITECTURE.md) 中的模块名。

示例：`feat(git-panel): add commit history viewer`

常用 type：`feat` / `fix` / `refactor` / `docs` / `chore` / `perf` / `test`

## Branch 规范

- `main` 为稳定主线
- 每个 Version 完成后打 tag（如 `v0.3-live-preview`）
- 个人项目可简化为直接在 main 上按 Task 提交，但 Version 边界必须打 tag

## 命名规范

- 组件文件：PascalCase（如 `FileTree.vue`）
- 非组件 TS 文件：camelCase（如 `fileSystem.ts`），全项目统一使用 camelCase，不与 kebab-case 混用
- Rust 文件：snake_case（遵循 Rust 惯例）
- 类型/接口：PascalCase，不加 `I` 前缀（如 `FileNode` 而非 `IFileNode`）
- Tauri command：`模块前缀_动作` 的 snake_case（如 `fs_read_file`、`git_status`），避免跨模块命名冲突

## 文件组织规范

模块目录统一子结构：

```
modules/<module-name>/
├── components/
├── composables/
├── store.ts
├── types.ts
└── index.ts
```

模块对外只能通过 `index.ts` 导出的内容被引用，**禁止外部模块深路径 import 模块内部文件**。这是防止隐性耦合、保障"不推倒重构"的关键规则。

## TypeScript 规范

- 开启 `strict` 模式
- 禁止显式 `any`（除非有注释说明原因）
- 优先使用 `interface` 定义对象结构
- 导出函数必须显式声明返回类型
- 不使用 namespace，模块边界用 ES Module

## Vue 编码规范

- 统一使用 `<script setup lang="ts">`
- Composition API 为主，不用 Options API
- Props/Emits 使用类型化写法：`defineProps<T>()` / `defineEmits<T>()`
- 避免在模板中写复杂表达式，逻辑提到 computed 或函数中

## 注释规范

- 只在"为什么"而不是"做什么"处写注释
- 模块对外导出的函数/类型需要写 JSDoc 说明用途和参数含义
- 禁止大段注释掉的死代码留在仓库里

## AI 编写代码规范（保证不同 AI 写出的代码风格一致）

- 每次任务开始前必须先读本文件和目标模块已有代码作为风格参照，不允许引入新的代码风格
- 禁止引入本规划未列出的新依赖库，除非在任务输出里明确说明理由并等待人工确认
- 统一用 ESLint + Prettier，提交代码前必须保证 lint 通过
- 每个 Task 完成后必须在对应模块补充/更新简单的使用说明或类型注释；核心 Rust 逻辑（如 git 操作、文件解析）建议补充基础单元测试
