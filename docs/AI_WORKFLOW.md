# 后续 AI 开发流程

## 文档体系（AI 每次任务必读）

- [PRODUCT.md](PRODUCT.md)：产品定位
- [ARCHITECTURE.md](ARCHITECTURE.md)：模块与依赖关系、目录结构
- [CODING_STANDARDS.md](CODING_STANDARDS.md)：开发规范
- [TASKS.md](TASKS.md)：任务清单及状态
- [AGENTS.md](../AGENTS.md)：AI 入口说明，供 Cursor 等工具自动加载

## 当用户说"开始 TaskXXX"时，AI 应执行的标准流程

1. 读取 `docs/TASKS.md` 找到 TaskXXX 定义（输入/输出/验收/依赖）
2. 检查依赖任务是否已标记"已完成"，如果依赖未完成，先与用户确认
3. 读取 `docs/ARCHITECTURE.md` 确认该任务涉及的模块边界（应该改哪些目录，不应该动哪些目录）
4. 读取目标模块现有代码（如果模块已有代码，必须先理解现有的 `index.ts` 导出接口和既有实现风格）
5. 实现该任务（仅修改任务范围内涉及的文件，不允许"顺手"改动无关模块）
6. 自测（至少手动验证验收标准里列的每一条；如果是 Rust 逻辑，跑 `cargo test`；如果有 lint 配置，跑 lint）
7. 更新 `docs/TASKS.md` 里对应 Task 状态为"已完成"，并附一句话说明实际实现方式（如果和计划有出入）
8. 输出本次修改的文件清单和一句话总结，明确告知"本次未修改的模块列表"以增强用户对"没有影响其它模块"的信心

## 范围约束保障

若 AI 发现完成任务必须改动任务描述之外的模块，必须停下来先跟用户确认而不是擅自扩大改动范围——这通常意味着任务拆分有问题或该模块接口设计需要调整。

## 版本边界检查

每完成一个 Version 的所有 Task 后，AI 应主动提示"V0.X 所有 Task 已完成，建议做整体验收测试"，并列出该 Version 的验收标准清单供用户逐项确认，确认后才建议打 tag。

## 跨 AI 协作的关键保障

由于不同 AI（Claude/GPT/Gemini/Cursor/Codex）会交替开发，规范文档（`docs/*`）和 TypeScript 类型系统是"跨 AI 记忆传递"的唯一可靠载体——每个 AI 不能依赖"上一个 AI 跟我说了什么"，只能依赖读取仓库里的文档和代码本身。因此 `docs/TASKS.md` 的实时更新和 `CODING_STANDARDS.md` 的严格遵守是整套流程能跑起来的前提。
