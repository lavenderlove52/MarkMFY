# 功能执行清单（Roadmap Tasks）

任务格式：输入 / 输出 / 验收 / 依赖 / 状态。状态取值：`未开始` / `进行中` / `已完成`。

每次开始一个 Task 时，AI 必须先阅读本文件确认该 Task 定义与依赖状态，完成后必须回写状态并补充"实现说明"。V0.6 及以后版本的任务将在到达该阶段时按相同颗粒度补充拆解到本文件。

---

## V0.1 项目骨架

### Task001 创建 Tauri+Vue3+TS 项目骨架
- 输入：无
- 输出：可运行的空 Tauri 窗口应用（集成 Vue3+TS+Vite）
- 验收：`npm run tauri dev` 可启动窗口无报错
- 依赖：无
- 状态：已完成
- 实现说明：使用 `npm create tauri-app@latest` 脚手架生成（--manager npm --template vue-ts --tauri-version 2），项目直接生成在仓库根目录。

### Task002 建立项目目录结构与基础规范文件
- 输入：Task001 项目
- 输出：按 [ARCHITECTURE.md](ARCHITECTURE.md) 目录设计建好骨架目录；ESLint/Prettier/.editorconfig 配置；README
- 验收：目录结构与设计一致，lint 命令可运行
- 依赖：Task001
- 状态：已完成
- 实现说明：建立 `src/modules/*`、`src/ipc`、`src/stores`、`src/styles`、`src-tauri/src/{commands,core}`；配置 ESLint flat config、Prettier、.editorconfig；重写 README。

### Task003 实现"打开文件夹"功能（Tauri dialog API）
- 输入：Task001 骨架
- 输出：触发系统文件夹选择对话框，选中后界面显示路径
- 验收：能弹出系统目录选择框并正确显示所选路径
- 依赖：Task001
- 状态：已完成
- 实现说明：接入 `tauri-plugin-dialog`，ipc 封装 `pickFolder`，工具栏按钮触发并在界面显示路径。

### Task004 建立 Pinia 状态管理骨架与 Workspace Store
- 输入：Task003
- 输出：workspaceStore 保存当前打开的文件夹路径
- 验收：打开文件夹后状态正确更新，其他组件可读取
- 依赖：Task003
- 状态：已完成
- 实现说明：`src/modules/filesystem/store.ts` 中 `useWorkspaceStore` 保存 `rootPath` 与文件树。

### Task005 建立 Rust 侧文件系统命令 `list_dir`
- 输入：Task001
- 输出：Tauri command 返回目录下文件/文件夹列表（名称/类型/路径）
- 验收：前端调用可拿到正确的目录结构 JSON
- 依赖：Task001
- 状态：已完成
- 实现说明：`core::fs::list_dir` + `commands::fs::fs_list_dir`，跳过隐藏项，目录优先排序。

---

## V0.2 文件树与纯文本编辑

### Task006 实现侧边栏文件树组件
- 输入：Task004, Task005
- 输出：递归渲染文件树，支持展开/折叠
- 验收：打开文件夹后侧边栏正确显示嵌套结构
- 依赖：Task004, Task005
- 状态：已完成
- 实现说明：`FileTree.vue` 懒加载子节点，首次展开才调用 `list_dir`。

### Task007 实现文件打开事件与 Tab 状态模型
- 输入：Task006
- 输出：tabsStore（打开文件列表、当前激活 tab），点击文件树节点新增/切换 tab
- 验收：点击不同文件正确新增/切换 tab，无重复打开
- 依赖：Task006
- 状态：已完成
- 实现说明：`useTabsStore` 以文件路径为 id，重复打开仅切换激活 tab。

### Task008 Rust 侧文件读写命令 `read_file`/`write_file`
- 输入：Task001
- 输出：正确处理 UTF-8/BOM 的读写命令
- 验收：含中文文件读写无损无乱码
- 依赖：Task001
- 状态：已完成
- 实现说明：`fs_read_file`/`fs_write_file`，读取时剥离 UTF-8 BOM；含基础单元测试。

### Task009 接入 CodeMirror6 基础实例（纯文本模式）
- 输入：Task007, Task008
- 输出：Editor 组件挂载 CM6，绑定当前激活 tab 内容
- 验收：打开文件后正确显示与编辑内容
- 依赖：Task007, Task008
- 状态：已完成
- 实现说明：`Editor.vue` 挂载 CM6，切换 tab 时重建 EditorState。

### Task010 实现保存功能与未保存状态标识
- 输入：Task008, Task009
- 输出：内容变化时 tab 显示未保存标记，Ctrl+S 保存并清除标记
- 验收：编辑后有标记，保存后标记消失且磁盘内容更新
- 依赖：Task008, Task009
- 状态：已完成
- 实现说明：`isDirty` 标记 + Mod-s 快捷键调用 `writeFile`。

### Task011 关闭未保存文件的确认对话框
- 输入：Task010
- 输出：关闭有未保存修改的 tab 时弹出保存/不保存/取消确认
- 验收：三种选择行为均正确
- 依赖：Task010
- 状态：已完成
- 实现说明：`UnsavedChangesDialog.vue` 由 `TabsBar` 触发。

---

## V0.3 Markdown Live Preview

### Task012 接入 `@lezer/markdown` 解析器（含 GFM）
- 输入：Task009
- 输出：CM6 具备 markdown 语法树解析能力
- 验收：可用调试工具验证语法树节点正确
- 依赖：Task009
- 状态：已完成
- 实现说明：`@codemirror/lang-markdown` + `GFM` 扩展，节点名已用脚本验证。

### Task013 实现标题（H1-H6）渐进渲染
- 输入：Task012
- 输出：光标进入显示原始 # 号，离开渲染为对应大小样式
- 验收：级别渲染正确，大文件滚动无卡顿
- 依赖：Task012
- 状态：已完成
- 实现说明：`livePreview.ts` 中 ATXHeading1-6 + HeaderMark 隐藏。

### Task014 实现粗体/斜体/删除线/行内代码渲染
- 输入：Task012
- 输出：对应 inline 语法的 Decoration 渲染
- 验收：各语法渲染正确，光标进入显示原始符号
- 依赖：Task012
- 状态：已完成
- 实现说明：StrongEmphasis/Emphasis/Strikethrough/InlineCode 处理。

### Task015 实现列表（有序/无序/任务列表）渲染
- 输入：Task012
- 输出：项目符号/序号渲染，任务列表 checkbox 可点击切换
- 验收：缩进层级正确，checkbox 点击可正确改写文本
- 依赖：Task012
- 状态：已完成
- 实现说明：ListMark → BulletWidget；TaskMarker → CheckboxWidget。

### Task016 实现引用块与分割线渲染
- 输入：Task012
- 输出：引用竖线样式、分割线渲染
- 验收：嵌套引用与分割线渲染正确
- 依赖：Task012
- 状态：已完成
- 实现说明：QuoteMark 隐藏 + Blockquote 行样式；HorizontalRule → HrWidget。

### Task017 实现代码块语法高亮
- 输入：Task012
- 输出：按语言标识调用 CM6 language 包高亮
- 验收：常见语言代码块高亮正确
- 依赖：Task012
- 状态：已完成
- 实现说明：`codeLanguages: languages`（`@codemirror/language-data`）。

### Task018 实现链接渲染与交互
- 输入：Task012
- 输出：链接可点击样式，Ctrl+点击用系统浏览器打开
- 验收：渲染与交互正确
- 依赖：Task012
- 状态：已完成
- 实现说明：隐藏 markdown 链接语法；Ctrl/Cmd+点击调用 `openUrl`。

### Task019 大文件性能基准测试与优化
- 输入：Task013-018
- 输出：性能测试报告与针对性优化（如限制 Decoration 计算范围到 viewport）
- 验收：20000 行文档滚动帧时间 < 16ms，输入无可感知延迟
- 依赖：Task013, Task014, Task015, Task016, Task017, Task018
- 状态：已完成
- 实现说明：Decoration 仅遍历 `visibleRanges`；说明见 [PERF_TASK019.md](PERF_TASK019.md)。

---

## V0.4 图片与资源管理

### Task020 实现图片 Widget 渲染（懒加载）
- 输入：Task012
- 输出：图片语法渲染为 widget，viewport 外不渲染
- 验收：相对/绝对路径图片正确显示，大量图片不卡顿
- 依赖：Task012
- 状态：已完成
- 实现说明：Image → ImageWidget + `convertFileSrc`；loading=lazy。

### Task021 Rust 侧实现 `save_pasted_image` 命令
- 输入：Task008
- 输出：接收图片二进制数据保存到同级 assets 目录，返回相对路径
- 验收：调用后正确生成图片文件
- 依赖：Task008
- 状态：已完成
- 实现说明：`fs_save_pasted_image` 写入 `{md同级}/assets/`。

### Task022 实现粘贴图片自动插入
- 输入：Task020, Task021
- 输出：监听粘贴事件，检测图片数据并插入对应语法
- 验收：截图 Ctrl+V 自动保存插入并立即渲染
- 依赖：Task020, Task021
- 状态：已完成
- 实现说明：CM6 paste handler 检测 image/* 并插入 `![](assets/...)`。

### Task023 实现拖拽图片文件插入
- 输入：Task020, Task021
- 输出：支持拖拽本地图片文件插入
- 验收：拖拽插入效果与粘贴一致
- 依赖：Task020, Task021
- 状态：已完成
- 实现说明：CM6 drop handler 复用同一套图片保存逻辑。

---

## V0.5 可视化 Git 面板

### Task024 Rust 侧集成 git2，实现 `git_status` 命令
- 输入：Task001
- 输出：返回是否是 git 仓库、改动文件分类列表
- 验收：结果与 `git status` 一致
- 依赖：Task001
- 状态：已完成
- 实现说明：`core::git::status` 基于 git2，区分 staged/unstaged。

### Task025 实现 Git 面板 UI 骨架与状态展示
- 输入：Task024
- 输出：GitPanel 展示改动文件分类列表
- 验收：正确展示 git_status 数据
- 依赖：Task024
- 状态：已完成
- 实现说明：`GitPanel.vue` + `useGitStore`。

### Task026 Rust 侧实现 `git_diff` 命令
- 输入：Task024
- 输出：返回逐行 diff 数据
- 验收：结果与 `git diff` 一致
- 依赖：Task024
- 状态：已完成
- 实现说明：`git_diff` 支持 staged/workdir 两种对比。

### Task027 实现 Diff 查看器组件
- 输入：Task026
- 输出：高亮展示增删行
- 验收：点击改动文件正确展示 diff
- 依赖：Task026
- 状态：已完成
- 实现说明：`DiffViewer.vue` 按 origin 着色。

### Task028 Rust 侧实现 stage/unstage/commit 命令
- 输入：Task024
- 输出：add/reset/commit 操作命令
- 验收：调用后 git 状态正确变化，commit 可在 `git log` 看到
- 依赖：Task024
- 状态：已完成
- 实现说明：`git_stage`/`git_unstage`/`git_commit`。

### Task029 实现暂存与提交 UI 交互
- 输入：Task025, Task028
- 输出：文件勾选暂存，message 输入与提交按钮
- 验收：完整"改动-暂存-填写 message-提交"流程结果正确
- 依赖：Task025, Task028
- 状态：已完成
- 实现说明：GitPanel 改动页提供 +/- 与提交框。

### Task030 Rust 侧实现 `git_log` 历史查询命令
- 输入：Task024
- 输出：返回 commit 历史（hash/作者/时间/message）
- 验收：结果与 `git log` 一致
- 依赖：Task024
- 状态：已完成
- 实现说明：`git_log` + `git_commit_diff`。

### Task031 实现历史记录面板
- 输入：Task030, Task027
- 输出：commit 列表展示，点击查看对应 diff
- 验收：历史与 diff 展示正确
- 依赖：Task030, Task027
- 状态：已完成
- 实现说明：`CommitHistory.vue` 接入 GitPanel 历史页。

### Task032 Rust 侧实现分支查询与切换命令
- 输入：Task024
- 输出：`git_branches` 列出分支，`git_checkout` 切换分支
- 验收：切换后文件状态正确
- 依赖：Task024
- 状态：已完成
- 实现说明：`git_branches`/`git_checkout`。

### Task033 实现分支切换 UI 与刷新联动
- 输入：Task032, Task006, Task007
- 输出：分支选择器，切换后触发文件树重载与 tab 状态校验
- 验收：全流程数据一致无脏读
- 依赖：Task032, Task006, Task007
- 状态：已完成
- 实现说明：`BranchSelector` 切换后 `workspaceStore.refresh()` 并关闭已打开 tabs。

---

---

## V0.6 设置系统与主题

> MVP（V0.1–V0.5）已完成。本版本补齐个性化与配置持久化。

### Task034 定义设置 Schema 与 Settings Store
- 输入：Task001（Pinia 已就绪）
- 输出：`AppSettings` 类型、默认值、`useSettingsStore`（内存态：theme / editorFontFamily / editorFontSize）
- 验收：store 可读写设置项，默认值合理；模块仅通过 `settings/index.ts` 对外导出
- 依赖：无（V0.5 全部完成后进入）
- 状态：已完成
- 实现说明：`types.ts` + `store.ts`，导出经 `settings/index.ts`。

### Task035 Rust 侧设置持久化 `settings_load` / `settings_save`
- 输入：Task034
- 输出：将设置 JSON 读写到应用配置目录；前端经 `src/ipc/settings.ts` 调用
- 验收：修改设置后重启应用仍保留；文件损坏时回退默认值不崩溃
- 依赖：Task034
- 状态：已完成
- 实现说明：`core/settings.rs` + `commands/settings.rs`，配置写入 `app_config_dir/settings.json`；含单元测试。

### Task036 实现 Theme 模块（明暗主题 CSS 变量）
- 输入：Task034
- 输出：根据 `settings.theme` 注入/切换 `:root` CSS 变量；切换立即生效无需重启
- 验收：亮/暗主题下工具栏、侧栏、编辑区、Git 面板对比可读；仅依赖 settings，不反向依赖
- 依赖：Task034
- 状态：已完成
- 实现说明：`theme/applyTheme.ts` 写入 CSS 变量；App 与 GitPanel 改用变量。

### Task037 实现设置面板 UI
- 输入：Task034, Task035, Task036
- 输出：设置面板（主题、编辑器字体、字号）；工具栏入口；改动即时生效并防抖持久化
- 验收：可切换主题与字体字号；关闭重开面板显示当前值
- 依赖：Task034, Task035, Task036
- 状态：已完成
- 实现说明：`SettingsPanel.vue` + 工具栏「设置」按钮；改动防抖 400ms 写盘。

### Task038 编辑器接入字体/字号设置
- 输入：Task034, Task036
- 输出：CodeMirror 编辑区字体族与字号跟随 settings，变更后即时更新
- 验收：改字号后编辑器内文字同步变化；不破坏 Live Preview 布局
- 依赖：Task034, Task036
- 状态：已完成
- 实现说明：Editor 使用 `--mm-editor-font-family` / `--mm-editor-font-size`。

---

---

## V0.7 命令面板与快捷键系统

> V0.6 已完成。本版本建立 Command 抽象层，已有操作统一可搜索、可绑定快捷键。

### Task039 实现 Command 注册中心
- 输入：无（架构已预留 `modules/command`）
- 输出：`registerCommand` / `unregisterCommand` / `executeCommand` / `listCommands`；Command 定义含 id/title/shortcut/run
- 验收：可注册与执行命令；Command 模块不 import 业务模块内部实现
- 依赖：无
- 状态：已完成
- 实现说明：`registry.ts` + `types.ts`；业务注册在 `src/registerCommands.ts`。

### Task040 实现命令模糊搜索
- 输入：Task039
- 输出：按标题/关键字子序列匹配并排序的纯函数（不引入新依赖）
- 验收：输入部分字符能命中对应命令；空查询返回全部
- 依赖：Task039
- 状态：已完成
- 实现说明：`fuzzy.ts` 子序列评分，无新依赖。

### Task041 实现命令面板 UI
- 输入：Task039, Task040
- 输出：CommandPalette 组件（搜索框 + 列表 + 键盘上下/回车/Esc）；默认快捷键打开
- 验收：可搜索并执行命令；打开时焦点在输入框
- 依赖：Task039, Task040
- 状态：已完成
- 实现说明：`CommandPalette.vue`；默认 `Mod-Shift-p`。

### Task042 实现全局快捷键绑定（含自定义覆盖）
- 输入：Task039, Task038（设置持久化）
- 输出：根据命令 defaultShortcut + settings.keybindings 覆盖监听全局快捷键；设置面板可改绑定
- 验收：默认快捷键可用；自定义后重启仍保留；冲突时后注册/覆盖生效明确
- 依赖：Task039, Task038
- 状态：已完成
- 实现说明：`keymap.ts` + settings.`keybindings`；`KeybindingEditor` 嵌入设置面板。

### Task043 迁移已有操作为 Command 并接入 App
- 输入：Task039–042
- 输出：打开文件夹/保存/设置/主题切换/Git 刷新/打开命令面板等注册为命令；工具栏按钮走 executeCommand
- 验收：上述操作均可从命令面板触发；保存快捷键在编辑器内外均可工作
- 依赖：Task039, Task040, Task041, Task042
- 状态：已完成
- 实现说明：`registerCommands.ts` 注册；App 工具栏与全局 keymap 统一走 Command。

---

V0.8 起（导出/搜索/1.0 打磨）将在进入对应版本时按同一颗粒度补充拆解为 Task044 及以后。
