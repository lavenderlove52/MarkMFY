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
- 实现说明：`core/settings.rs` + `commands/settings.rs`；配置写入**安装目录** `config/settings.json`（不再用 AppData）；若旧 AppData 有文件则首次自动迁移；含单元测试。

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

---

## V0.8 PDF/HTML 导出

> V0.7 已完成。本版本提供文档对外导出能力（markdown-it + Shiki，系统打印出 PDF）。

### Task044 接入 markdown-it / Shiki 并实现 HTML 渲染管线
- 输入：Task043（有活跃文档内容）
- 输出：`renderMarkdownDocument(markdown, options)` → 内嵌样式的完整 HTML 字符串；支持 GFM 表格/任务列表/代码高亮；相对图片按文档目录解析
- 验收：典型 md（标题/表格/代码/图片/任务列表）渲染可读；中文字体正常
- 依赖：无（规划依赖 markdown-it、Shiki，属 ARCHITECTURE 已列选型）
- 状态：已完成
- 实现说明：`renderHtml.ts` + `exportStyles.ts`；表格用 multimd-table，任务列表用 task-lists，代码用 Shiki github-light。

### Task045 实现导出 HTML 文件
- 输入：Task044
- 输出：另存为 `.html`（dialog save + writeFile）；注册 `export.html` 命令
- 验收：导出文件用浏览器打开效果基本正确
- 依赖：Task044
- 状态：已完成
- 实现说明：`exportHtmlFile` 经 `pickSaveFile` + `writeFile`；图片用 `file://`。

### Task046 实现导出 PDF（系统打印）
- 输入：Task044
- 输出：打开打印预览（用户可选“Microsoft Print to PDF”等）；注册 `export.pdf` 命令
- 验收：打印对话框可弹出，能保存为 PDF
- 依赖：Task044
- 状态：已完成
- 实现说明：隐藏 iframe + `window.print()`。

### Task047 导出入口接入命令面板 / 工具栏
- 输入：Task045, Task046
- 输出：命令面板可搜「导出 HTML / 导出 PDF」；工具栏提供导出入口
- 验收：无活跃 tab 时命令不可用；有内容时可成功触发
- 依赖：Task045, Task046
- 状态：已完成
- 实现说明：`registerCommands` 注册；App 工具栏按钮。

---

---

## V0.9 全文搜索

> V0.8 已完成。本版本提供单文件搜索替换与工作区跨文件搜索跳转。

### Task048 Rust 侧实现工作区搜索 `search_workspace`
- 输入：Task005（文件系统）
- 输出：递归扫描工作区 `.md`（跳过隐藏/`.git`/常见依赖目录），按关键字返回匹配行（path/line/column/preview）；支持大小写敏感与结果上限
- 验收：结果与手工在文件中查找一致；损坏/非 UTF-8 文件可跳过不崩溃
- 依赖：无
- 状态：已完成
- 实现说明：`core/search.rs` + `commands/search.rs`；`from`/`to` 为 UTF-16 偏移以便前端跳转。

### Task049 前端 ipc + Search Store
- 输入：Task048
- 输出：`searchWorkspace` ipc；Pinia store 保存查询、模式、结果、加载状态
- 验收：调用 ipc 可拿到结构化结果；模块经 `search/index.ts` 导出
- 依赖：Task048
- 状态：已完成
- 实现说明：`ipc/search.ts`；`modules/search/store.ts` + `textSearch.ts`。

### Task050 当前文件搜索与替换
- 输入：Task049
- 输出：对活跃 tab 做查找/下一个/全部替换；替换经 Editor 导航桥写回，不破坏未改动区域
- 验收：可高亮定位；全部替换后内容正确，isDirty 正确
- 依赖：Task049
- 状态：已完成
- 实现说明：`editor/navBridge.ts` + `textReplace.ts`；Editor 注册 navigate/replace；优先替换当前选中匹配。

### Task051 搜索面板 UI + 结果跳转
- 输入：Task049, Task050
- 输出：SearchPanel（当前文件 / 工作区切换）；结果列表点击打开文件并跳到匹配处
- 验收：跳转准确；无工作区时工作区搜索给出提示
- 依赖：Task049, Task050
- 状态：已完成
- 实现说明：`SearchPanel.vue` 挂入 App；工作区命中经 `tabsStore.openFile` + `navigateEditorSelection`。

### Task052 命令与快捷键接入
- 输入：Task051
- 输出：注册 `search.open`（Mod-f）、`search.openWorkspace`（Mod-Shift-f）；工具栏入口
- 验收：快捷键打开面板并切到对应模式
- 依赖：Task051
- 状态：已完成
- 实现说明：`registerCommands` 注册；工具栏「查找」按钮。

---

---

## V1.0 打磨与扩展点预留

> V0.9 已完成。本版本不做大功能，聚焦异常 UX、性能/体积基线、公共 API 冻结、Mac 构建文档与 1.0.0 收口。

### Task053 统一 IPC 错误与全局通知
- 输入：现有 `AppError`、`src/ipc/*`、各 store
- 输出：`normalizeInvokeError`；轻量全局 Toast；fs/tabs/git/export/search 等核心失败路径可读提示；Git 面板展示 error
- 验收：核心 IPC 失败有中文提示，不再出现 `[object Object]`；抽查路径无未处理 rejection
- 依赖：无
- 状态：已完成
- 实现说明：`ipc/errors.ts` 的 `normalizeInvokeError`；`notify` + `ToastHost`；fs/tabs/git/export/settings/search 失败路径接入；Git 面板展示 error；`executeCommand` 兜底。

### Task054 Windows 性能与体积基线落盘
- 输入：ROADMAP V0.1/V1.0、`PERF_TASK019.md`
- 输出：`docs/PERF_V1.md`（冷启动、闲置内存、产物体积、大文件滚动）；明确门槛与测得值
- 验收：步骤可复现；数字写入文档
- 依赖：无
- 状态：已完成
- 实现说明：`docs/PERF_V1.md` + `scripts/genLargeMarkdown.mjs`；主 chunk ~1MB / dist 含大量懒加载资源；Shiki 同步牵连列入 Task055。

### Task055 数据驱动性能优化
- 输入：Task054 未达标项
- 输出：针对未达标项的代码优化；若已达标则低风险清理并注明
- 验收：同一测量步骤相对基线改善或确认达标
- 依赖：Task054
- 状态：已完成
- 实现说明：Shiki / export 动态导入；editor 语言包裁剪；主 chunk 1012KB→665KB。

### Task056 稳定 Editor / FileSystem / Command 公共 API
- 输入：三模块 `index.ts`、ARCHITECTURE 扩展约定
- 输出：冻结导出清单 + JSDoc；ARCHITECTURE「扩展点」小节；必要时薄封装
- 验收：外部只经 `index.ts`；文档列出稳定导出
- 依赖：无
- 状态：已完成
- 实现说明：三模块 JSDoc；filesystem IO 门面；ARCHITECTURE「扩展点与稳定导出」。

### Task057 核心异常与回归清单
- 输入：Task053
- 输出：`docs/QA_V1.md`；必要时 Rust 单测补强
- 验收：清单项无阻塞 bug 或已记录已知限制
- 依赖：Task053
- 状态：已完成
- 实现说明：`docs/QA_V1.md`；`cargo test` 11 通过（fs/search/settings 已有基测）。

### Task058 Mac 构建文档与清单
- 输入：现有 `tauri.conf` + `icon.icns`
- 输出：`docs/BUILD_MAC.md`（toolchain、target、build、git2、公证后续）
- 验收：文档完整可移交；本机不强制出包
- 依赖：无
- 状态：已完成
- 实现说明：`docs/BUILD_MAC.md`。

### Task059 版本 bump 与 V1.0 收口
- 输入：Task053–058
- 输出：`package.json` / `tauri.conf.json` / `Cargo.toml` → 1.0.0；TASKS 全部标完成
- 验收：三处版本一致
- 依赖：Task053–058
- 状态：已完成
- 实现说明：版本同步为 1.0.0；建议验收后打 tag `v1.0.0`。

---

## V1.1 体验增强（非正式里程碑）

### Task060 代码块 Widget 直编 + 语言高亮 / 切换
- 输入：Task017、现有 block Widget（表格/Mermaid）基础设施
- 输出：非 Mermaid 围栏代码块用 `CodeBlockWidget` 整块替换；内嵌 CM6 直编；顶栏语言下拉切换并按语言高亮；「源码编辑」退回 Markdown；Mermaid 仍走原 Widget
- 验收：编辑时默认不露 ```；json/shell/java 等可高亮；切语言写回 info；源码态可改围栏；多块并存不崩
- 依赖：无（V1.0 已完成）
- 状态：已完成
- 实现说明：`codeBlockModel.ts` + `codeBlockWidget.ts`；`buildBlockDecorations` 接入；ViewPlugin 跳过已 Widget 化的围栏。

### Task061 修复块级 Widget 高度缓存过期导致点错行
- 输入：Task060（新增 CodeBlockWidget 后复现「点某行却点到下面几行」）
- 输出：`TableWidget` / `CodeBlockWidget` 增加 `ResizeObserver` 在 DOM 尺寸变化时调用 `view.requestMeasure()`；`ImageWidget` 在 `load`/`error` 时调用 `view.requestMeasure()`；`TableWidget` 补充 `destroy()` 断开观察器
- 根因：CM6 block Widget 的高度只在“主文档事务触发的渲染”时被测量并缓存；表格拖拽改列宽/行高、单元格直编换行、代码块内嵌编辑器随输入增减行、图片异步加载完成，都只改了 widget 内部 DOM、不触发主文档事务，主编辑器缓存的行高随之过期，导致 `posAtCoords` 命中错误的行（视觉上点 A 行，落笔到 A 行下方若干行）。`MermaidWidget` 此前已用同一模式修复过，本次补齐另外三处
- 验收：拖拽表格行高/列宽、代码块内连续换行、图片加载完成后，点击其下方任意一行都落在该行；`vue-tsc`/`eslint` 通过
- 依赖：Task060
- 状态：已完成
- 实现说明：`tableWidget.ts`、`codeBlockWidget.ts`、`widgets.ts`（ImageWidget）均补 `ResizeObserver`/`load` 监听 + `view.requestMeasure()`，模式对齐 `mermaidWidget.ts` 现有实现。

### Task062 修复行内隐藏标记（粗斜体/行内代码/引用/链接）导致点错行、方向键跳行
- 输入：Task061 之后用户仍复现「点普通段落某行，光标落到段落末尾；按上键直接跳过该行进入更上方内容」
- 输出：`hideRange()` 统一改用 `Decoration.mark({ class: "mm-hide-mark" })` 折叠隐藏的 Markdown 语法标记，不再用 `Decoration.replace({})`（无 widget 的空替换）；标题隐藏 `#` 复用同一 `hideRange()`，去掉重复实现
- 根因：`Decoration.replace({})` 会把该范围的 DOM 完全移除，不留任何可命中的锚点节点；当这类"空洞"出现在一行的开头（如行首的 `` ` `` 或 `**`）时，`posAtCoords`（点击定位）和 `moveVertically`（方向键上下）在该行失去锚点，点击会落到行尾、方向键会直接跨过整行。标题的 `HeaderMark` 此前已发现同一问题并改用 `mark` 折叠修复，但粗斜体/删除线/行内代码/引用前缀/链接方括号当时仍用旧的 `hideRange`（即 `Decoration.replace({})`），是同一根因在其它语法标记上的遗留
- 验收：段落以 `` `code` ``、`**bold**` 等开头时，点击行内任意位置光标落在点击处；在该行按上/下键正常逐行移动，不再跳过或落入相邻块
- 依赖：无
- 状态：已完成
- 实现说明：仅改 `livePreview.ts` 的 `hideRange()` 实现 + 移除 `handleHeading` 里重复的 mark 折叠代码，改调用共享 `hideRange()`；未引入新依赖。

### Task063 修复块级 Widget 邻近普通文本点击落到下方代码块
- 输入：用户截图复现「鼠标点击上方普通段落，光标仍落在下面代码块」
- 输出：普通文本行 `mousedown` 增加 DOM 命中校正：先用实际命中的 `.cm-line` 判断点击所在行，只有当 `posAtCoords` 映射到其它行时才接管，并用浏览器 caret hit-test 转回文档位置
- 根因：即使 Task061 已对块级 Widget 尺寸变化触发 `requestMeasure()`，在代码块/表格等 Widget 刚挂载、异步语言高亮或 WebView 布局测量尚未稳定的瞬间，CM6 的高度缓存仍可能短暂滞后，导致 `posAtCoords` 把 Widget 下方或邻近的普通段落映射到更下面的文档位置
- 验收：点击代码块上下相邻普通段落时，光标落在鼠标所在文本行；正常文本点击、标题点击、Widget 内按钮/下拉、Ctrl/Cmd+点击链接不受影响；`vue-tsc`/`eslint` 通过
- 依赖：Task061, Task062
- 状态：已完成
- 实现说明：`livePreview.ts` 新增 `handleTextLineMouseDown()`，仅在 DOM 行与坐标映射行不一致时阻止默认事件并派发正确选区；复用 Widget 目标过滤，避免影响代码块、表格、图片、Mermaid 等内部交互。

### Task064 图片 / Mermaid 在小窗口中按视口等比缩放
- 输入：用户截图复现「小窗时图片/流程图只能看到一部分；全屏时可以完整展示」
- 输出：图片 Widget、Mermaid Widget 与放大预览按当前窗口可用宽高等比缩放，优先完整展示；内嵌图片由 Widget 按编辑器滚动区域计算像素级最大宽高，Mermaid 默认按编辑器可用宽高计算适配倍率；窗口尺寸变化后触发主编辑器重新测量
- 根因：原图片样式仅 `max-width: 100%`，没有高度约束；补充 CSS 后仍会受 CodeMirror 行内 Widget 的行宽影响，百分比宽度参照到被图片自己撑大的行，导致宽图仍横向溢出、只能看到一部分。截图中的 Mermaid 另有独立根因：`mermaidWidget.ts` 明确把 `fitScale` 固定为 1，默认按原始 SVG 尺寸展示，只在画布内平移查看
- 验收：小窗口内图片和 Mermaid 会缩小到可用宽高内，尽量完整展示；全屏时按更大可用区域展示；放大预览同样尽量完整展示；`vue-tsc`/`eslint` 通过
- 依赖：Task020, Task061, Task060
- 状态：已完成
- 实现说明：`livePreview.ts` 为 `.mm-image` 增加 `max-height` / `object-fit: contain`；`lightbox.css` 为放大预览增加居中和高度约束；`ImageWidget` 根据 `view.scrollDOM.clientWidth/clientHeight` 写入像素级 `max-width` / `max-height`，并用 `ResizeObserver` 在编辑器尺寸变化时更新和重新测量；`MermaidWidget` 将默认 `fitScale` 改为按编辑器可用宽高动态计算，`zoom` 改为相对适配态的用户缩放。

### Task065 UI 与字体视觉优化
- 输入：用户要求参考优秀软件 UI 设计规范优化整体布局与字体美观度
- 输出：扩展主题 token；重做顶部 Command Bar、侧栏/Git/Search/命令面板/设置面板视觉层级；编辑器改为居中文档画布；Markdown Live Preview 的标题、引用、代码块、表格、图片、Mermaid 统一使用新 token；设置面板新增面向中文写作和技术文档的字体预设
- 设计依据：参考 Fluent 2 的 4px 间距和 command bar 思路、Material 3 的 token 化色彩/排版体系、Typora/iA Writer 的低干扰写作体验；不引入新依赖，保持 Tauri + Vue 轻量架构
- 验收：浅色/深色主题变量完整；主要组件不再依赖大量硬编码颜色；字体预设可立即生效；`npm run build` / `npm run lint` 通过
- 依赖：Task034, Task036, Task038, Task043
- 状态：已完成
- 实现说明：`applyTheme.ts` / `variables.css` 增加 surface、hover、active、shadow、radius、字体等 token；`App.vue` 改 command bar 与面板层级；`Editor.vue` 改文档画布和正文行高；`livePreview.ts` 统一 Markdown 装饰样式；`SettingsPanel.vue` / `types.ts` 更新字体预设与默认值；FileTree、Tabs、Git、Search、Command、Dialog、Lightbox 组件同步使用新 token。

### Task066 顶部功能分类下拉菜单
- 输入：用户选择 UI 方案 A，并要求去掉顶部平铺按钮/图标，将功能分类折叠为下拉选择
- 输出：顶部工具栏改为纯文字分类菜单：文件、视图、查找、导出、工具；菜单项点击后自动收起；工作区路径保留在右侧
- 验收：顶部不再平铺目录/Git/设置/导出等按钮；导出项在无活跃文档时禁用；点击工具栏外部关闭菜单；`npm run build` / `npm run lint` 通过
- 依赖：Task065
- 状态：已完成
- 实现说明：仅改 `App.vue` 外壳层，增加 `openToolbarMenu` 菜单状态和 `runToolbarAction()` 收起逻辑；使用现有命令/回调触发打开文件夹、面板显示、搜索、导出、命令面板和设置，不引入新依赖。

### Task067 自定义标题栏（菜单置顶）
- 输入：用户要求去掉系统标题栏中的应用图标与 MarkMFY 标题，并将菜单栏直接置顶到窗口最上方
- 输出：关闭系统窗口装饰；现有「文件/视图/查找/导出/工具」菜单作为自定义标题栏置顶；中间拖拽区域保留工作区路径；右侧提供最小化/最大化/关闭
- 验收：顶部不再显示应用图标与 MarkMFY 文字标题；菜单位于窗口最顶部；窗口可拖拽、最小化、最大化、关闭；`npm run build` / `npm run lint` 通过
- 依赖：Task066
- 状态：已完成
- 实现说明：`tauri.conf.json` 设置 `decorations: false`；`capabilities/default.json` 增加窗口控制权限；`App.vue` 将工具栏改为自定义标题栏（`data-tauri-drag-region` + 窗口按钮）。「设置」作为顶栏独立入口，不再放在「工具」下拉中。

### Task068 代码块语法高亮色盲友好配色
- 输入：用户反馈当前配色对色弱/色盲用户不友好，代码块（如截图中的 XML/drawio 内容）文字看不清
- 根因：`highlight.ts` 沿用 CodeMirror 默认高亮色（固定十六进制值），未跟随深浅主题调整，深色背景下暗红字对比度不足；且 `literal` 用绿、`string` 用红，是红绿色盲最难分辨的经典配色
- 输出：语法高亮改为读取 theme 模块提供的 `--mm-syntax-*` CSS 变量，配色参考 Okabe-Ito 色盲安全色板（蓝/橙/紫红/青绿），避开红绿对比；`invalid` 等关键状态额外叠加粗体 + 波浪下划线，不单独依赖颜色
- 验收：深浅主题下代码块文字对比度清晰；不再出现同时使用红、绿区分语法类别；`npm run build` / `npm run lint` 通过
- 依赖：Task065
- 状态：已完成
- 实现说明：`ThemeTokens` 新增 `syntaxKeyword/syntaxAtom/syntaxLiteral/syntaxString/syntaxType/syntaxComment/syntaxMeta`；`variables.css` / `applyTheme.ts` 补充浅色/深色两套取值；`highlight.ts` 的 `markmfyHighlightStyle` 改用这些 CSS 变量，`link` 复用 `--mm-color-accent` 保持与预览态链接色一致。

### Task069 非 Markdown 文件禁用 Live Preview
- 输入：用户反馈打开 JSON 文件显示异常（缩进处出现下划线/蓝色链接样式）
- 根因：所有文件都走 `createMarkdownExtensions`，Markdown Live Preview 把 JSON 中的 `_`、URL 等解析为斜体与自动链接
- 输出：按扩展名分流——`.md` 等继续 Markdown + Live Preview；`.json` 等走纯文本编辑，并按文件名异步挂载对应语言高亮
- 验收：打开 JSON 不再出现蓝色下划线/错误斜体；JSON 仍可正常编辑保存；Markdown 文件 Live Preview 不受影响；`npm run build` / `npm run lint` 通过
- 依赖：Task009, Task018
- 状态：已完成
- 实现说明：新增 `language/fileMode.ts`（`isMarkdownPath` / `resolveLanguageByFilename`）；`setup.ts` 提供 `createEditorExtensions`；`Editor.vue` 按 `filePath` 创建 state，非 Markdown 通过 `Compartment` 异步加载语言包。

### Task070 KaTeX 数学公式 Live Preview + 导出
- 输入：ARCHITECTURE 技术选型（KaTeX）；Task012 Live Preview / Task044 导出管线
- 输出：`$...$` 行内、`$$...$$` 块级公式解析与渲染；编辑器内 Widget 预览（光标进入显示源码）；HTML/PDF 导出含公式与 KaTeX CSS；直接依赖 `katex`（架构已列选型）
- 验收：行内/块级公式渲染正确；`$5` 等金额不被误解析；公式语法错误有可读降级；导出 HTML 打开后公式可见；`vue-tsc`/`eslint` 通过
- 依赖：Task012, Task044
- 状态：已完成
- 实现说明：`MathExtension`（lezer）+ `MathWidget`/`mathRender.ts`；`markdown.ts` 接入；导出 `renderHtml` 抽占位 + `renderKatexHtml`；`katex` 直接依赖 + 全局 CSS。

### Task071 Git 简单合并提示
- 输入：PRODUCT「简单合并提示」；现有 `git_status` / GitPanel
- 输出：Rust `git_status` 识别 `CONFLICTED` 与合并进行中状态；前端类型与 store 暴露冲突文件；Git 面板醒目提示 + 冲突文件列表；有冲突时禁用提交并说明原因
- 验收：模拟合并冲突仓库时面板提示清晰、冲突文件可见；无冲突时行为与原先一致；含 Rust 单测；`vue-tsc`/`eslint`/`cargo test` 通过
- 依赖：Task024, Task025
- 状态：已完成
- 实现说明：`core/git.rs` 增加 `merge_in_progress` + `conflicted` kind；ipc/store/GitPanel 合并横幅与提交拦截；`classify_*` 单测 3 项。

---

## V1.2 格式工具栏

> V1.1 已完成。本版本在 Tabs 下方提供 Typora 风格格式工具栏：标准 Markdown 用原生语法，字号/颜色/对齐等用受控 HTML。

### Task072 formatBridge + Markdown 格式命令
- 输入：Task009（EditorView）、Task069（`isMarkdownPath`）
- 输出：`formatBridge` 注册活跃 EditorView；`formatCommands` 支持 toggle wrap（斜体/删除线/行内代码）、设标题级别、无序/有序列表、增减缩进；经 `editor/index.ts` 导出
- 验收：无活跃编辑器时命令 no-op；有/无选区均可插入或切换；不破坏 Live Preview
- 依赖：无（V1.1 已完成）
- 状态：已完成
- 实现说明：`formatBridge.ts` + `formatCommands.ts`；Editor 挂载/卸载注册 view；同步实现了 HTML 样式命令供 Task074 复用。

### Task073 FormatToolbar UI 挂载
- 输入：Task072
- 输出：`FormatToolbar.vue`；App 在 TabsBar 下方挂载；仅活跃 Markdown tab 显示；控件含字号/标题/斜体/删除线/下划线/上下标/行内代码/颜色/对齐/列表/缩进/行高
- 验收：点击后焦点回到编辑器；非 md 文件不显示；视觉使用现有 `--mm-*` token
- 依赖：Task072
- 状态：已完成
- 实现说明：`components/FormatToolbar.vue`；App 用 `isMarkdownPath` 控制显示。

### Task074 HTML 样式命令 + Live Preview
- 输入：Task072, Task073
- 输出：HTML wrap（`<u>`/`<sup>`/`<sub>`/`<span style>`/行级 text-align）；Live Preview 光标离开时隐藏标签并应用样式
- 验收：下划线/上下标/颜色/字号预览可见；不破坏 mm-hide-mark 点击定位
- 依赖：Task072, Task073
- 状态：已完成
- 实现说明：`htmlPreview.ts` 在可见范围正则匹配受控 HTML；`livePreview` 叠加装饰与 `.mm-html-*` 样式。

### Task075 导出 HTML 白名单
- 输入：Task074, Task044
- 输出：`renderHtml` 启用受限 HTML（u/sup/sub/span/p/div + 白名单 style）；拒绝 script/事件属性
- 验收：含样式的 md 导出后样式保留；恶意标签被剥离或转义；`vue-tsc`/`eslint` 通过
- 依赖：Task074
- 状态：已完成
- 实现说明：`html: true` + `htmlSanitize.ts` 对 body 二次净化；`npm run build` / `lint` 通过。

---

## 增量补丁（侧栏文件操作）

### Task076 新建 Markdown 与文件夹
- 输入：Task006, Task008
- 输出：侧栏/菜单/右键可新建 `.md` 与文件夹；Rust `fs_create_file`/`fs_create_dir`；落点为选中目录或工作区根
- 验收：打开工作区后可新建并出现在文件树；新建 md 自动打开；重名提示；`vue-tsc`/`eslint` 与 Rust 单测通过
- 依赖：Task006, Task008
- 状态：已完成
- 实现说明：IPC `createFile`/`createDir`；`workspaceStore.createMarkdownFile`/`createFolder`；侧栏 `+md`/`+dir`、文件菜单与右键菜单；命令 `workspace.newFile`/`workspace.newFolder`。

### Task077 编辑器底部文档统计栏
- 输入：Task009, Task012
- 输出：打开 Markdown 时底部边框显示字数、行数、UTF-8 文件大小；编辑时防抖更新
- 验收：打开/切换 md 可见统计；输入后数字更新；非 md 或无 tab 不显示
- 依赖：Task009
- 状态：已完成
- 实现说明：`statusStats.ts` + `EditorStatusBar.vue`；`Editor.vue` 在 md 模式下监听 doc 变更；挂于 `App.vue` 编辑区底部。

### Task078 直接打开文件时使用文件所在目录作为工作区
- 输入：Task004, Task007, Task034
- 输出：启动参数/`fileAssociations` 传入文件时打开该文件；侧栏文件树为文件所在目录；无启动路径时仍恢复上次工作区
- 验收：`markmfy.exe path\to\file.md` 打开指定文件且树根为父目录；无参数时行为与改前一致；文件关联需重装后生效
- 依赖：Task004, Task007
- 状态：已完成
- 实现说明：Rust `app_startup_open_paths` + `ipc/app.ts`；`App.vue` 优先处理启动路径；`tauri.conf.json` 注册 md/txt 关联。

### Task079 标题行默认预览编辑，仅双击显示源码
- 输入：用户反馈打开文件后首行标题露出 `#`；希望预览态直接改字、双击才显示源码
- 输出：标题不再因光标在行内露出 `#`；双击标题行进入源码态（复用 `blockSourceEditField`）；预览态光标夹出 HeaderMark
- 验收：打开以 `# ` 开头的文件不显示 `#`；单击/键入可改正文并保持标题样式；双击该行可见 `#`；光标离开后恢复预览
- 依赖：Task013
- 状态：已完成
- 实现说明：改 `livePreview.ts` 的 `handleHeading` + `dblclick` + `transactionFilter` 夹光标。

### Task080 修复分割线无法编辑及挡住下方标题点击
- 输入：用户反馈横线点不进编辑；下方标题「你需要准备什么」点不到，光标靠近会消失
- 根因：1) HR 靠 `isCursorOnLine` 切源码，但 block 装饰不随纯 selection 重建；2) `.mm-hr` 大 margin 盖住邻行；3) Widget `ignoreEvent` 导致编辑器侧 mousedown 收不到，须在 Widget DOM 上绑双击
- 输出：`HrWidget` 双击进入 `blockSourceEdit`；可点区域用 `.mm-hr-wrap`；缩小占位避免挡标题
- 验收：双击横线可编辑 `---`；光标离开恢复横线；下方标题可正常点击
- 依赖：Task016, Task079
- 状态：已完成
- 实现说明：`widgets.ts` 的 `HrWidget` 绑 dblclick；`livePreview.ts` 源码态与样式。

### Task081 打开文件时光标落在隐藏 `#` 导致无法编辑
- 输入：用户反馈新打开文档双击/编辑无响应，只有先双击首行标题后其它区域才能编辑
- 根因：`EditorState.create` 初始选区在 0，不走 `transactionFilter`；光标停在折叠的 HeaderMark 上（`caretColor: transparent`），看起来像只读；双击标题触发 selection dispatch 后才夹到正文
- 输出：Live Preview 挂载后补夹光标；打开/切 tab 后 `view.focus()`
- 验收：打开以 `# ` 开头的 md 立即可见光标并可单击改正文；无需先双击标题
- 依赖：Task079
- 状态：已完成
- 实现说明：`headingCaretBootstrap` ViewPlugin + `Editor.vue` focus。

### Task082 UI 清新主题包 + 经典主题可切换
- 输入：桌面感不足、紫雾默认偏网页工具；需雾蓝清新设计且保留原版
- 输出：`uiStyle: fresh|classic` 设置项；fresh 雾蓝+鼠尾草绿 token；classic 保留原紫雾；壳层/标签/文件树/编辑画布/Toast 用 token 降噪
- 验收：设置中可切换清新/经典与浅/深色；`vue-tsc`/`eslint`/`npm run build` 通过；业务功能不变
- 依赖：Task036, Task037
- 状态：已完成
- 实现说明：扩展 `applyTheme` 四套 token；settings/Rust 持久化 `uiStyle`；默认 fresh。

### Task083 导出 PDF：打印取消需点两次 + 宽表被裁切
- 输入：用户反馈打印对话框取消要点两次；宽表格右侧接口路径打印不完整
- 根因：1) iframe `onload` 触发两次导致 `print()` 叠两个对话框；2) `table { display:block; overflow-x:auto }` 在打印时裁切超出纸宽内容
- 输出：`srcdoc` + once/`printStarted` 只弹一次打印；导出 CSS 表格恢复 `display:table`，单元格 `overflow-wrap` 换行适配纸宽
- 验收：取消一次即可关闭；宽表列内容完整可见（可换行变高，不再横向裁切）；`vue-tsc`/`eslint` 通过
- 依赖：Task046
- 状态：已完成
- 实现说明：`exportActions.ts` 打印守卫；`exportStyles.ts` 表格/打印样式。

### Task084 文件菜单「最近打开」工作区目录（最多 50）
- 输入：用户需求：文件菜单增加最近打开；记录最近 50 个目录；去重；重新打开置顶；配置落在安装目录
- 输出：`recentWorkspacePaths` 写入安装目录 `config/settings.json`；文件菜单子项「最近打开」；打开成功即 MRU 更新
- 验收：打开不同目录后菜单按新→旧列出；重复打开不增加条目且置顶；超过 50 条裁掉最旧；失效路径点击后从列表移除；`vue-tsc`/`eslint`/`cargo test` 通过
- 依赖：Task003, Task034
- 状态：已完成
- 实现说明：settings 类型/store/Rust 持久化；`App.vue` 子菜单与 `rootPath` watch 写入。
- 修复（用户反馈"历史目录打不开，鼠标移过去就折叠回去了"）：根因是触发按钮和子菜单列表之间用 `left: calc(100% + 4px)` 隔了 4px 间隙，鼠标从按钮移向子菜单要跨过这段不属于悬停容器的空白区域，一进入间隙就先触发了 `mouseleave` 关闭。改为 `createSubmenuHover` 延迟关闭（220ms 内重新进入——包括进入子菜单本身，会取消关闭），「打开」「最近打开」两个子菜单一并修复。

### Task085 文件「打开」支持文件夹与文件
- 输入：用户需求：原「打开文件夹」既可开目录也可开文件
- 说明：系统原生对话框无法一次同时选文件/文件夹，故菜单改为「打开」子项：打开文件夹 / 打开文件
- 输出：`pickOpenFile`；`openFileAsWorkspace`；命令 `workspace.openFile`（Ctrl+O）；打开文件时以父目录为工作区并打开该文件
- 验收：可选文件夹作工作区；可选文件并打开编辑；取消无副作用；`vue-tsc`/`eslint` 通过
- 依赖：Task003, Task007
- 状态：已完成
- 实现说明：`ipc/dialog.ts` + filesystem store + `registerCommands` + `App.vue` 子菜单。

### Task086 代码块 / 流程图工具栏新增「复制源码」「复制内容」
- 输入：用户需求：代码块与 Mermaid 流程图工具栏增加复制源码、复制内容按钮
- 设计确认（与用户核对后）：
  - 代码块：复制源码=含 ` ```lang ` 围栏的完整 Markdown 片段；复制内容=仅代码正文（不含围栏），可直接粘到终端/IDE
  - 流程图：复制源码=围栏原文（不含缩放/字号 meta 注释）；复制内容为小菜单，含「复制为图片」（PNG 写入系统剪贴板，可粘到聊天工具/Word/PPT）「复制为 SVG」「复制为源码文本」（不含围栏）
- 输出：`widgetDom.ts` 新增 `copyTextToClipboard` / `copySvgAsPngToClipboard` / `createToolbarMenuButton`；`codeBlockWidget.ts`、`mermaidWidget.ts` 接入按钮；复制结果走现有 Toast 提示
- 验收：代码块两个按钮分别复制围栏文本/纯正文；流程图「复制源码」得到围栏文本；「复制内容」菜单三项分别得到图片(剪贴板可粘为图)/SVG 文本/纯源码文本；失败有 Toast；`vue-tsc`/`eslint` 通过
- 依赖：Task016（代码块）、Task070 附近的 Mermaid Widget（既有实现）
- 状态：已完成
- 实现说明：不引入新依赖，直接用浏览器原生 `navigator.clipboard` + Canvas 栅格化；小菜单为纯 DOM 悬浮列表，样式加在 `livePreview.ts` baseTheme。
- 修复（用户反馈"复制为图片"很慢且点击无反应）：根因两点——① `img.onload` 内 `drawImage`/`toBlob` 若抛错不会被外层 `try/catch` 捕获，Promise 永不 settle，导致挂起；② 原先「先 await 转成 PNG，再调用 `clipboard.write()`」，多个异步跳步后浏览器/WebView 的"用户激活态"可能已过期，导致 `write()` 静默失败。改为：`copySvgAsPngToClipboard` 一进入就同步调用 `navigator.clipboard.write()`，把耗时的栅格化过程放进 `ClipboardItem` 接受的 `Promise<Blob>` 里；栅格化步骤全部改为 reject 而非吞掉错误；加 8s 超时兜底；限制输出长边像素（大图自动降倍）避免过慢；点击后先弹「正在生成图片…」提示避免看起来无响应。
- 二次修复（用户反馈：①复制图片仍报错；②鼠标一放到图上，「复制内容」菜单就自动打开了）：
  - 根因②：`.mm-widget-toolbar` 不可见时（`opacity:0`）没有禁用 pointer-events，仍能拦截点击；新增按钮变多后工具栏换行变高，覆盖住了更多图表区域，用户在图上点击/拖拽时实际点在了这个隐形按钮上。修复：默认 `pointer-events:none`，hover 时才 `auto`；代码块工具栏本来就是半透明常显，用更高特异性选择器单独保证其始终可点；下拉菜单本身固定 `pointer-events:auto`（避免打开后鼠标移出主体就点不到）。
  - 根因①排查：暂无法在当前环境复现具体报错原因，先把 `copySvgAsPngToClipboard` 改为不吞错误（`catch` 后 `console.error` 并 `throw`），调用处用真实错误消息（`toastError(err, ...)`）展示，而不是笼统的"图表可能过大"文案，方便下次直接看到浏览器/WebView 报的具体原因再定位。
- 三次修复（靠上面暴露的真实报错定位到了）：报错为 `Failed to execute 'toBlob' on 'HTMLCanvasElement': Tainted canvases may not be exported.`。根因：Mermaid 默认用 `<foreignObject>` 承载文字标签（HTML label），Chromium 对「含 `<foreignObject>` 的 SVG 通过 `blob:` URL 加载后画到 canvas」会把画布标记为"脏"（即使内容完全同源、无跨域资源），导出必然抛 SecurityError；这是 Chromium 已知且长期存在的行为差异（`data:` URI 加载则不受此限制）。修复：`rasterizeSvgToPngBlob` 改用 `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}` 加载 SVG，不再经过 `URL.createObjectURL`。
- 四次修复（用户反馈：鼠标只是移到图表上悬停，「复制内容」的下拉菜单就自动展开了，并非点击）：根因是 CSS 特异性问题——`.mm-widget-menu__list` 这条类选择器规则里写了 `display: flex`，其特异性和浏览器 UA 样式的 `[hidden]{display:none}` 相同，作者样式在层叠中优先于 UA 样式，所以 JS 用 `menu.hidden = true` 关闭菜单时该元素其实一直是 `display:flex`（只是因为父级 `.mm-widget-toolbar` 悬停前 `opacity:0` 才看不见）；一旦鼠标移到图表上让工具栏 `opacity` 变成 1，这个「已关闭」的菜单也跟着露出来，看起来像"一悬停就展开"。修复：新增 `.mm-widget-menu__list[hidden] { display: none }`（属性选择器提高特异性）显式覆盖，`hidden` 时强制不渲染。

### Task087 阅读区域宽度可调 + 内部组件宽度跟随
- 输入：用户需求："中间的阅读区域，我希望可以调整宽度，同时也可以调整内部组件的最大宽度，即表格、图、代码块等，所有组件都可以调整到阅读区域最大宽度"
- 背景：`.cm-content` 原有 `max-width` 由主题 token（`ThemeTokens.editorContentWidth`）固定写死（fresh 820px / classic 980px），用户无法调整；表格/图片/流程图/代码块的宽度样式（`.mm-table` `width:100%`、`.mm-image-wrap` `max-width:100%`、`.mm-mermaid` 内部按 `wrap.clientWidth` 自适应）本就以 `.cm-content` 为基准做百分比/自适应，因此只要把阅读区域宽度做成可调，内部组件会自动跟随，无需分别改造。
- 输出：
  - `settings/types.ts`：`AppSettings` 新增 `editorContentWidth`（px，默认 820），新增 `EDITOR_CONTENT_WIDTH_MIN`(640)/`MAX`(1800)/`UNLIMITED`(0) 常量与 `normalizeEditorContentWidth`（0 表示不限宽度撑满可用空间，否则夹紧范围）
  - `settings/store.ts`：state/getters/load/patch 接入新字段；新增 `setEditorContentWidth` action
  - `theme/applyTheme.ts`：移除主题 token 里写死的 `editorContentWidth`，改为 `applyTheme(theme, editor?, uiStyle?, contentWidth?)` 第四参数，写入 CSS 变量 `--mm-editor-content-width`（`contentWidth<=0` 时写 `none` 即不限宽度）
  - `App.vue`：`syncThemeFromSettings` 传入 `settingsStore.editorContentWidth`；监听该字段变化实时生效
  - `settings/components/SettingsPanel.vue`：「编辑器」分组新增"阅读区域宽度"滑杆（640–1800px，步进 20）+「不限宽度」开关 chip，改动即时生效并按现有 400ms 防抖持久化
- 验收：设置面板拖动滑杆时编辑区 `.cm-content` 最大宽度实时变化；表格/图片/Mermaid/代码块最大宽度随之同步变宽变窄；勾选「不限宽度」时阅读区撑满编辑器可用宽度；刷新/重启后设置保留；`vue-tsc`/`eslint` 通过
- 依赖：Task036（Theme 模块）、Task082（主题包）
- 状态：已完成
- 实现说明：未改动表格/图片/Mermaid/代码块自身的 CSS（它们已是相对 `.cm-content` 的 `100%`/自适应布局，天然跟随），只新增了「阅读区域宽度」这一个可调变量作为唯一控制点，符合最小改动原则。

### Task088 富文本粘贴（飞书/Word/网页）：图片与表格保真转换
- 输入：用户反馈"飞书复制过来的图片无法展示"+"表格样式也没了"
- 根因排查：项目原先**没有** HTML→Markdown 的粘贴管线，`paste` 事件只识别剪贴板里的 `image/*` 文件（Task022），其余一律走浏览器/CM6 默认的 `text/plain` 粘贴。飞书等站点复制内容时，`text/plain` 会把图片退化成"[图片]"占位文字、把 `<table>` 拍扁成缩进列表——这正是截图里看到的现象。真正的图片链接和表格结构其实都在剪贴板的 `text/html` 里，但代码从未读取过它。
- 输出：
  - 新增 `src/modules/editor/core/htmlPaste.ts`：不引入第三方库（如 turndown），自己写 HTML→Markdown 转换器
    - `isRichHtmlFragment(html)`：粗筛该 HTML 是否含真实语义标签（`table/img/ul/ol/h1-6/blockquote/pre/a[href]/strong/b/em/i/del/s`）。编辑器内部复制粘贴自身内容时浏览器也会附带一份 `text/html`（纯文本套 `<span style>`，无真实语义标签），这一步保证内部复制粘贴行为不受影响，只有外部富文本才走新逻辑
    - `convertHtmlToMarkdown(html, ctx)`：按块级/行内边界递归转换——标题/段落/粗斜体删除线/行内代码/链接/列表（含嵌套）/引用块/分割线/围栏代码块/表格（复用 `tableModel.ts` 的 `serializeTable`/`escapeTableCell`，与既有可视化表格模型保持一致）
    - 图片：`data:` 直接解码落盘到 assets；`http(s)` 尝试 `fetch` 下载落盘（8s 超时，多图并发），失败（防盗链/需登录态等）时退回保留原始外链让 `<img>` 直接展示；两种情况都调用既有 `savePastedImage` IPC，不新增 Rust 侧改动
  - `src/modules/editor/core/setup.ts`：`EditorCallbacks` 新增 `onPasteHtml`；`paste` 事件优先读 `text/html`，命中 `isRichHtmlFragment` 才走新逻辑，否则保持原有图片文件/默认文本粘贴顺序
  - `src/modules/editor/Editor.vue`：新增 `onPasteHtml` 实现，转换失败或没有可用内容时退回浏览器提供的 `text/plain`，避免粘贴看起来没反应；插入时正确替换当前选区（原 `onPasteImage` 只在光标处插入，未处理有选区的情况，这次顺带按正确语义实现新路径，不改动旧路径）
- 验收：从飞书文档复制一段包含图片和表格的内容粘贴进编辑器——图片能正常显示（本地落盘或保留可用外链），表格转换为可被 Live Preview 识别的 GFM 管道表格并保留表格 Widget 编辑能力；从编辑器内部复制粘贴文本行为不受影响；`vue-tsc`/`eslint` 通过
- 已知局限（转换器 MVP 范围，见文件顶部注释）：不处理合并单元格（colspan/rowspan）、不支持嵌套表格、不识别仅靠行内 `style` 模拟的标题/加粗（没有真实语义标签时退化为纯文本）
- 依赖：Task021/Task022（`save_pasted_image` 与既有图片粘贴）、`tableModel.ts`（既有 GFM 表格模型）
- 状态：已完成
- 实现说明：未新增依赖、未改动 Rust 侧；仅新增一个内部文件 + 在既有粘贴管线里插入一个更高优先级的分支，不影响原有图片粘贴/纯文本粘贴路径。
- 追加修复（用户反馈："1.标题格式没有识别，应该是连续的1级标题，2，表格中的图片无法显示，并且格式丢失"）：
  1. **标题被识别成列表**：飞书文档"标题自动编号"在导出剪贴板 HTML 时不会稳定序列化成 `<h1>`~`<h6>`，而是拍扁成"只有一个 `<li>`"的独立 `<ol>/<ul>`（装饰性序号，且每个标题各自独立从 1 开始——这也是截图里两个标题都显示"1."而非"1./2."的原因）。`htmlPaste.ts` 新增 `looksLikeFeishuHtml`（粗筛剪贴板 HTML 是否带 `lark`/`feishu` 字样）+ `tryPromoteSingletonListToHeading`：仅在飞书来源、且列表恰好只有一个 `<li>`、该 `<li>` 不含嵌套子列表时，才把它当作被拍扁的标题还原成 `# 文本`；命中条件很窄，避免误伤其它站点真实的单条目列表
  2. **表格里的图片/格式丢失**：原实现用 `inlineToMarkdown` 抽取单元格内容，遇到单元格内"多段落/多张图片各占一段/嵌套列表"（飞书表格单元格常见）时，会把它们当行内内容硬拼在一起，导致列表序号丢失、多张图片的 `![]()` 语法无分隔地挤成一串。改为 `cellToMarkdown`：先用 `collectBlocks` 按块级边界正确切分（保留列表序号、每张图片独立），再用 `<br>` 拼接多个块（GFM 表格单元格不能有真实换行，`<br>` 是通用兼容写法）
  3. **表格单元格不渲染图片/`<br>`/链接**：即使 Markdown 源码已经正确，`TableWidget` 一直用 `appendInlineMarkdown` 把单元格内容渲染成 DOM，而该函数只认识 `**/*/~~/`` 这四种行内语法，`![]()`/`[]()`/`<br>` 一律按纯文本原样显示（这才是截图里看到"一串裸露 `![](assets/...)` 文字"的直接原因）。给 `appendInlineMarkdown`（`widgetDom.ts`）新增可选的 `resolveImageSrc` 选项，支持把 `<br>` 转成真实换行、`![alt](src)` 转成真实 `<img>`（走与正文图片相同的 `resolveImageSrc` 路径解析）、`[text](href)` 转成可点击链接；`TableWidget` 构造函数新增可选 `resolveImageSrc` 参数并透传下去；`livePreview.ts` 新增 `resolveTableImageSrcFacet`（`blockDecorationsField` 是模块级 StateField、拿不到 `livePreviewExtension` 的闭包参数，用 Facet 传递）把正文已有的 `resolveImageSrc` 一并喂给表格 Widget
  - 涉及文件：`src/modules/editor/core/htmlPaste.ts`、`src/modules/editor/decorations/widgetDom.ts`、`src/modules/editor/decorations/tableWidget.ts`、`src/modules/editor/decorations/livePreview.ts`
  - 已知局限：标题级别统一按 H1 还原（目前只观察到一级标题被拍扁成单条目列表的样本，无法从文本内容可靠推断原始标题层级）；`<br>` 换行在表格单元格"直接编辑"态仍显示原始 `<br>` 文本（编辑态本就是展示 Markdown 源码，与其它行内语法编辑体验一致，非本次改动引入的新行为）
  - `vue-tsc`/`eslint` 通过

### Task089 外部修改检测（文件在编辑器外被改动后提示保存/加载）
- 输入：用户需求："新增一个功能，打开文件后，若是其他地方修改了，能够检测，提示用户是保存已经打开的还是加载其它地方修改后的"
- 方案取舍：没有引入 `notify` 一类文件系统监听 crate（会新增依赖，且个人单文件场景没必要常驻监听线程）。改用最小侵入的 mtime 比对方案：打开/保存/重新加载文件时记录磁盘 `mtime`，窗口重新获得焦点时（最常见触发场景——切到别的程序改完文件再切回来）用一次轻量 `stat` 调用比对，检测到不一致再弹窗，不做常驻轮询
- 输出：
  - `src-tauri/src/core/fs.rs`：新增 `get_mtime(file_path) -> Result<Option<i64>, AppError>`，返回 epoch 毫秒；文件不存在返回 `Ok(None)`（不当报错，避免打断使用）；补充单测（文件不存在 / 改写后 mtime 变化）
  - `src-tauri/src/commands/fs.rs` + `lib.rs`：新增 `fs_get_mtime` command 并注册
  - `src/ipc/fs.ts`：新增 `getFileMtime(filePath)` 封装
  - `src/modules/tabs/types.ts`：`TabItem` 新增 `diskMtimeMs`（打开/保存/重新加载那一刻记录的磁盘 mtime）；新增 `ExternalChangeConflict` 类型（`tabId`/`fileName`/`hasLocalEdits`）
  - `src/modules/tabs/store.ts`：
    - `openFile`/`saveTab` 成功后记录 `diskMtimeMs`
    - 新增 `checkExternalChanges()`：遍历所有已打开 tab，对比磁盘当前 mtime 与记录值，命中不一致则把冲突写入新状态 `externalConflict`（一次只展示一个，不自动覆盖任何一侧）
    - 新增 `keepCurrentOverDisk(tabId)`（保存已经打开的，即用编辑器内容覆盖磁盘）、`loadDiskVersion(tabId)`（放弃编辑器内容，重新从磁盘读取并通过既有 `applyStoreContentToActiveEditor` 桥刷新编辑器）、`dismissExternalConflict()`（暂不处理，下次窗口聚焦重新检测）；两个处理动作后会链式再检查一次，一次聚焦命中多个 tab 冲突时可连续处理
  - `src/modules/tabs/components/ExternalChangeDialog.vue`（新增，参照既有 `UnsavedChangesDialog.vue` 的结构/样式）：根据 `hasLocalEdits` 展示"保存已经打开的/加载外部修改后的/暂不处理"（无本地未保存修改时只展示"加载外部修改后的/暂不处理"，因为没有需要保护的本地内容）
  - `src/modules/tabs/index.ts`：导出 `ExternalChangeDialog` 与 `ExternalChangeConflict`
  - `src/App.vue`：全局挂载一个 `<ExternalChangeDialog>`（与 `<ToastHost/>` 同级，跟随 `tabsStore.externalConflict` 显示，不需要在 Editor/GitPanel/TabsBar 等多处各自接一份弹窗）；监听 `window` 的 `focus` 事件调用 `tabsStore.checkExternalChanges()`
- 验收：用外部程序（如记事本）修改一个已在 MarkMFY 打开的文件后切回窗口——若编辑器内有未保存修改，弹窗提供"保存已经打开的/加载外部修改后的/暂不处理"三个选项；若编辑器内容与打开时一致，弹窗只提供"加载外部修改后的/暂不处理"；两种"处理"操作后编辑区内容与磁盘状态一致；未触发外部修改时不受任何影响；`vue-tsc`/`eslint`/`cargo test` 均通过
- 已知局限：仅在窗口重新获得焦点时检测，不做常驻文件监听或定时轮询（不修改的时段内无法实时感知，符合个人轻量编辑器"启动快、内存低"的定位，多数场景下"切回窗口时检测"已经覆盖）；不处理文件被外部删除的场景（`get_mtime` 返回 `None` 时当前实现直接跳过，不弹窗，超出本次需求范围）
- 依赖：Task013（打开文件/多标签基础）
- 状态：已完成
- 实现说明：未引入新依赖（notify/filetime 等），复用 Rust 标准库 `fs::metadata` 与既有 `applyStoreContentToActiveEditor` 内容回填桥；未改动 `saveTab` 之外任何已有保存/关闭流程的调用方式，`Editor.vue`/`GitPanel.vue`/`TabsBar.vue`/`registerCommands.ts` 里现有的 `saveTab` 调用均无需改动。

### Task090 修复新建 Markdown 文件输入 1–6 个 `#` 后字符不显示
- 输入：用户反馈新打开的 Markdown 文件中输入 6 个及以下 `#` 会不显示
- 根因：Lezer 将只有 `#`～`######` 的行也解析为 ATX 标题；Live Preview 无条件折叠 `HeaderMark`，导致行上暂时没有任何可见字符
- 输出：单独输入 `#`～`######` 时保留原始字符；输入空格后立即切换为标题预览样式，不要求先输入正文
- 验收：新建 Markdown 文件依次输入 `#` 到 `######` 时字符均可见；输入空格后立即渲染 H1–H6；双击标题行仍可进入源码编辑态；`vue-tsc`/`eslint` 通过
- 依赖：Task013（标题 Live Preview）
- 状态：已完成
- 实现说明：`headingContentStart` 仅在标题标记后尚无空格且无正文时返回 `null`，并由 `handleHeading` 在创建标题装饰前直接退出；输入空格后标题语法完成，立即应用标题样式并折叠标记。

### Task091 未打开工作区时无法点击新建 Markdown
- 输入：用户反馈启动后“新建 Markdown”按钮不可点击
- 根因：菜单、侧栏与命令均要求 `workspaceStore.isOpen`，未打开文件夹时直接禁用；但界面上没有把用户引导到目录选择流程
- 输出：未打开工作区时点击新建入口会先选择文件夹，成功后继续新建；菜单、侧栏、命令面板使用同一行为
- 验收：未打开工作区时“新建 Markdown”和“新建文件夹”均可点击；取消目录选择无副作用；选择目录后继续完成新建；已有工作区时保持原有选中目录落点规则；`vue-tsc`/`eslint` 通过
- 依赖：Task003, Task076
- 状态：已完成
- 实现说明：新建动作在无工作区时复用已有 `openFolder()` 选择目录；移除菜单、侧栏与命令的新建禁用条件。未新增 Store action，避免热更新时旧 Pinia 实例缺少新方法。

### Task092 块级 Markdown 空格触发与代码块退出边界
- 输入：用户希望标题、引用、列表等块级样式在输入分隔空格后才渲染；输入三个反引号时不应立即进入代码块，并且应能在代码块下方继续编辑
- 根因：Lezer 会把单独的块级标记也解析成对应节点，Live Preview 立即应用装饰；未闭合代码围栏又被当前 Widget 整体替换到文档末尾，导致外层编辑器没有可放置光标的后续段落
- 输出：
  - 标题、引用块和列表标记在分隔空格出现后才进入预览；裸代码围栏 ` ``` ` 在输入空格后才进入代码块 Widget，已闭合围栏及带语言信息的围栏保持原行为
  - 输入裸围栏后按空格时自动补成闭合代码块，并在文档中留下真实空段落；代码框下方直接点击即可编辑，不需要额外按钮或隐藏点击区
  - 代码块生成后焦点自动进入代码框内部并落在正文末尾；代码框外的后续空段落仍可直接点击编辑，同时保留末行按 `↓`、任意位置按 `Ctrl+Enter` / `Esc` 的退出方式
  - 退出时自动补全闭合围栏，不会把后续正文继续包进代码块
- 验收：输入 `#`、`>`、`-`、` ``` ` 时暂不预览，输入分隔空格后渲染；代码块下方可立即输入普通段落；已打开的历史 Markdown 代码块显示不受影响；`vue-tsc`/`eslint` 通过
- 依赖：Task013, Task015, Task016, Task060
- 状态：已完成
- 实现说明：`livePreview.ts` 增加块级语法完成度判断，并在空格输入时补全裸围栏、创建后续空段落并发送一次性焦点信号；`codeBlockWidget.ts` 按该信号聚焦到代码块正文末尾，同时保留键盘退出。

### Task093 代码块边界按 Backspace 应删除整个代码块
- 输入：光标在代码块后的空白边界继续按 Backspace 时，当前会拆除 Widget 并显露 Markdown 源码
- 根因：默认删除只移除代码块后的分隔换行，选区随之进入 FencedCode 范围，源码态渲染取代预览
- 输出：当光标位于代码块后的空白边界且中间只有空白/换行时，Backspace 一次删除整个代码块及其分隔区域
- 验收：代码块下方空段落按 Backspace 直接移除整个代码块；代码块内部 Backspace 仍正常逐字删除；普通段落之间 Backspace 行为不变；`vue-tsc`/`eslint` 通过
- 依赖：Task060, Task092
- 状态：已完成
- 实现说明：`livePreview.ts` 增加最高优先级 Backspace 键位，查找光标前最近的 FencedCode 并整体删除。

### Task094 代码块位于首行时支持临时前置输入
- 输入：代码块位于文档第一行时，上方没有可点击的 CodeMirror 行，无法把光标移到代码块之前；直接插入空行又会留下无内容的永久空行
- 输出：首行代码块上方提供透明的临时输入层；未输入时不改变文档，输入首段文字后才把文字插入代码块前并让代码块下移
- 验收：点击后可直接输入，输入文字时代码块才移到第二行；没有输入时离开不会留下空行；删除临时前置文字后代码块自动回到第一行；非首行代码块无额外输入层；`vue-tsc`/`eslint` 通过
- 依赖：Task060, Task092
- 状态：已完成
- 实现说明：`CodeBlockWidget` 仅在 `from === 0` 时创建透明输入层并在首次输入时写入文档；`livePreview.ts` 在临时前置段落变空时自动删除首行空段落。

### Task095 优化代码块视觉与紧凑留白
- 输入：用户反馈代码块样式粗糙，参考编辑器的代码块希望左右文字留白更小
- 输出：代码块采用顶部独立工具栏、强调色边框、紧凑行号和代码区内边距；取消嵌套编辑器继承外层文章的 48px 左右留白
- 验收：代码块工具栏与代码区层次清晰；代码正文左右间距明显收紧；多行代码显示行号；深色和浅色主题下可读；`vue-tsc`/`eslint` 通过
- 依赖：Task060, Task092
- 状态：已完成
- 实现说明：`codeBlockWidget.ts` 增加行号与紧凑嵌套编辑器主题；`livePreview.ts` 重做代码块/工具栏样式；`Editor.vue` 覆盖嵌套编辑器的外层内容宽度与 padding。

### Task096 修复代码语言下拉白色弹层刺眼
- 输入：代码块语言下拉使用 Windows 原生 `select`，弹层为白色且文字对比度异常
- 输出：语言选择改为应用内自绘深色菜单，支持限高滚动与当前语言回显，不再使用系统白色弹层
- 验收：深浅主题下语言菜单与编辑器表面一致；长语言列表可滚动选择；切换语言后高亮和围栏信息正确更新；`vue-tsc`/`eslint` 通过
- 依赖：Task060, Task095
- 状态：已完成
- 实现说明：`codeBlockWidget.ts` 用 `createToolbarMenuButton` 替换原生 select；`livePreview.ts` 增加语言菜单宽度、滚动和文字截断样式。

### Task097 拉开代码行号与正文间距
- 输入：代码块行号与正文距离过近，影响辨识
- 输出：增大代码区上下留白、行号槽左右留白和正文起始缩进，正文右侧不额外扩张
- 验收：代码正文不再顶到代码区顶部或分隔线；行号与正文有明显间隔；多位数行号仍右对齐；`vue-tsc`/`eslint` 通过
- 依赖：Task095
- 状态：已完成
- 实现说明：`codeBlockWidget.ts` 将代码区 padding 调为 14/16/18px、行号槽宽度调到 54px；`Editor.vue` 以更高优先级覆盖嵌套编辑器样式，移除行号槽右边框并同步行号与正文间距。

### Task098 修复代码块下方文本行无法精确定位和拖选
- 输入：代码块后的普通文本行无法把光标点到中间，也无法用鼠标拖选前面的文字
- 根因：块级 Widget 高度缓存变化后，该行的原生坐标命中可能退化到行尾；原有修正只在映射到其它行时接管，未覆盖同一行内错误定位
- 输出：只在 CodeMirror 坐标命中落到错误行时接管鼠标定位；同一行内的点击与拖拽完全使用原生选区
- 验收：普通文本行、标题和带行内装饰的文本保持原生拖选；代码块高度缓存导致跨行误命中时仍能落到实际文本行；`vue-tsc`/`eslint` 通过
- 依赖：Task063, Task092
- 状态：已完成
- 实现说明：`livePreview.ts` 仅在 `posAtCoords` 映射到其它行时修正，同一行交回 CodeMirror 原生拖选；字符定位先遍历真实可见文本节点并排除 `.mm-hide-mark`，再使用 DOM Range / 字符二分兜底。

### Task099 修复含行内代码的标题从正文中间拖选时带上左侧内容
- 输入：`#### ① `t_sp_customer`：客户身份及主档` 从 `t` 开始向右拖动时，左侧序号和 Markdown 标记被一起选中；普通标题没有此问题
- 根因：标题鼠标处理器在旧选区不在该行时无条件接管，再把锚点夹到标题正文起点，导致行内装饰标题的精确落点丢失
- 输出：可见标题正文且坐标行正确时完全使用 CodeMirror 原生选择；仅点击隐藏 `#` 区域或坐标落到邻行时执行标题命中修正
- 验收：含行内代码的标题可从任意可见字符开始向前/向后拖选；普通标题和正文选择保持原生行为；`vue-tsc`/`eslint` 通过
- 依赖：Task013, Task081, Task098
- 状态：已完成
- 实现说明：`livePreview.ts` 在 `handleHeadingMouseDown` 中优先用可见文本节点定位锚点，并在坐标行正确时放行原生鼠标事件。

### Task100 行内代码单击不再显示反引号源码
- 输入：单击标题中的 `t_sp_customer` 行内代码时立即显露出反引号，而既有交互约定是双击才显示源码
- 根因：`handleInlineMarks` 在光标进入行内代码时调用了通用 `isCursorTouching` 逻辑，普通单击也会撤掉装饰
- 输出：行内代码单击保持渲染，双击时才把对应 InlineCode 节点切到源码态显示反引号
- 验收：单击 `t_sp_customer` 不显示反引号；双击显示该行内代码源码；拖动选择不受影响；`vue-tsc`/`eslint` 通过
- 依赖：Task014, Task018, Task099
- 状态：已完成
- 实现说明：`livePreview.ts` 为行内代码关闭光标触发源码态，并新增双击行内代码的显式源码编辑入口。

### Task101 标题源码态应同时显露行内代码反引号
- 输入：双击 `#### ② \`t_sp_customer_number\`：客户号与 TA 号登记` 后只显示标题 `#`，行内代码反引号仍未显示
- 根因：行内代码装饰只检查自身范围是否被设为源码态，没有检查外层标题的源码编辑范围是否已经覆盖该节点
- 输出：外层标题进入源码态时，范围内所有行内代码、粗斜体等 Markdown 标记一并显露
- 验收：双击含行内代码的标题后同时看到 `#` 和反引号；普通单击仍保持渲染；退出源码态后恢复预览；`vue-tsc`/`eslint` 通过
- 依赖：Task013, Task100
- 状态：已完成
- 实现说明：`livePreview.ts` 在行内标记处理中检查 `blockSourceEditField` 的完整覆盖范围，而不是只检查节点自身是否被激活。

### Task102 所有行内样式统一改为双击显示源码
- 输入：用户要求粗体、斜体、删除线和行内代码都统一为单击保持渲染、双击显示原格式
- 输出：四类行内样式单击均保持预览；双击时进入对应 Markdown 节点的源码态；标题内的行内样式双击仍进入整行标题源码态
- 验收：`**粗体**`、`*斜体*`、`~~删除线~~`、`` `行内代码` `` 单击不显示标记，双击显示对应源码；标题双击同时显示 `#` 和内部行内标记；`vue-tsc`/`eslint` 通过
- 依赖：Task014, Task100, Task101
- 状态：已完成
- 实现说明：`livePreview.ts` 将 StrongEmphasis / Emphasis / Strikethrough / InlineCode 的光标触发全部关闭，并新增通用行内样式双击源码入口。

### Task103 代码块支持 One Dark Pro、Night Owl、Darcula 主题
- 输入：用户要求代码块支持 One Dark Pro、Night Owl、Darcula 三种高亮样式
- 输出：每个代码块工具栏提供独立的代码主题菜单；三套主题分别定义背景、工具栏、边框、正文、行号、光标和语法高亮配色；当前主题在菜单中显示勾选状态
- 验收：空白或已有代码块默认显示 Night Owl；切换主题立即更新；切换后的主题写入围栏扩展信息并在重新打开文档后保留；未切换主题的旧代码块保持 Night Owl 且不会自动改写源文档；语言菜单和代码主题菜单均可正常操作；`vue-tsc`/`eslint` 通过
- 依赖：Task017, Task095, Task096
- 状态：已完成
- 实现说明：`codeBlockModel.ts` 增加主题类型、选项、围栏 `theme=` 元数据解析与序列化；`codeBlockWidget.ts` 增加主题菜单和内嵌编辑器主题状态；`highlight.ts` 增加代码块专属高亮样式；`widgetDom.ts` 的菜单项支持当前项勾选；`livePreview.ts` 与 `Editor.vue` 增加三套作用域配色。

### Task104 修复代码块内空行按 Backspace 误删整个围栏
- 输入：输入三个反引号并按 Enter 后，在代码块内空行按 Backspace，三个反引号全部消失
- 根因：代码块边界删除逻辑在遍历到光标位置时裁剪语法树，把尚未遍历到的闭合围栏误判为光标前方已结束的代码块
- 输出：仅在光标位于代码块之后真正空白的段落时删除整个代码块；光标仍处于围栏范围内时交回 CodeMirror 的原生 Backspace 行为
- 验收：` ``` ` 后按 Enter 生成空代码块，在块内空行按 Backspace 只处理当前换行，不会删除整个代码块；代码块下方独立空段落按 Backspace 仍删除整个代码块；`vue-tsc`/`eslint` 通过
- 依赖：Task092, Task093
- 状态：已完成
- 实现说明：`deletePrecedingCodeBlockOnBackspace` 改为遍历完整语法树，检测光标是否仍位于任意 FencedCode 内，并要求当前行本身为空。

### Task105 代码块生成后支持 Ctrl+Z 撤销外层创建操作
- 输入：生成代码块并自动聚焦内嵌编辑器后，按 Ctrl+Z 无法撤销代码块创建
- 根因：代码块正文使用独立的内嵌 CodeMirror，快捷键先命中其历史栈；刚创建的代码块在内嵌编辑器里没有历史记录，快捷键没有继续传递到外层文档
- 输出：内嵌编辑器存在编辑历史时优先撤销块内修改；没有块内历史时，把 `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` 交给外层 Markdown 编辑器
- 验收：输入三个反引号生成代码块后立即按 Ctrl+Z 可撤销创建；在代码块中输入内容后 Ctrl+Z 先撤销块内输入；块内历史清空后继续按 Ctrl+Z 可回退外层创建；`vue-tsc`/`eslint` 通过
- 依赖：Task092, Task104
- 状态：已完成
- 实现说明：`codeBlockWidget.ts` 在嵌套编辑器 keymap 最前方增加撤销/重做处理，按内嵌与外部历史深度决定执行目标，并在交给外层前恢复主编辑器焦点。

### Task106 使用面板图标收起侧边栏
- 输入：用户要求把侧边栏标题栏中的箭头收起按钮替换为面板外框加内部侧栏块的图标
- 输出：展开状态下的侧边栏使用 SVG 面板图标作为收起按钮，保持原有点击行为、悬停样式和设置持久化
- 验收：点击图标可收起侧边栏；按钮视觉与应用面板类图标一致；按钮具有明确的无障碍名称和侧边栏关联；`vue-tsc`/`eslint` 通过
- 依赖：Task006, Task034
- 状态：已完成
- 实现说明：`App.vue` 将原 `⟨` 文本替换为内联 SVG，并补充图标按钮布局、`aria-label`、`aria-controls` 和 `aria-expanded`。

### Task107 优化新建文件弹窗与顶部导航布局
- 输入：新建 Markdown 时出现 `tauri.localhost` 原生输入框；侧边栏开关应移到顶部“文件”左侧；前进/后退应位于工具栏最左侧
- 输出：
  - 新建 Markdown 和新建文件夹统一使用应用内命名弹窗，支持输入、Enter 确认、Esc/取消关闭和遮罩关闭
  - 顶部工具栏顺序调整为“后退、前进、侧边栏开关、文件菜单”，移除侧边栏标题中的开关和收起后的“目录”竖条
  - 后退/前进按已打开文件的真实访问历史切换标签，并根据历史状态自动禁用
- 验收：从侧边栏、文件菜单或命令面板新建 Markdown/文件夹时均不出现系统原生 prompt；弹窗主题与应用一致；顶部按钮位置正确；在多个文件间切换后前进/后退可恢复访问顺序；关闭目标标签后历史会跳过无效项；`vue-tsc`/`eslint` 通过
- 依赖：Task003, Task006, Task039, Task106
- 状态：已完成
- 实现说明：新增通用 `InputDialog.vue`；`registerCommands.ts` 将新建命令委托给 App 层弹窗；`App.vue` 管理文件访问历史和顶部工具栏布局。

### Task108 文件树空白区域支持右键新建
- 输入：文件节点右键可新建 Markdown/文件夹，但文件树空白区域右键没有菜单
- 输出：文件树根容器的空白区域也可打开同一右键菜单；空白菜单仅显示新建 Markdown、新建文件夹，不显示与具体节点相关的打开目录操作
- 验收：右键任一文件节点仍显示原有三项菜单；右键文件列表下方空白区域显示新建菜单；工作区文件列表为空时，右键空状态区域同样可新建；创建流程继续复用当前选中目录规则和应用内命名弹窗；`vue-tsc`/`eslint` 通过
- 依赖：Task006, Task076, Task107
- 状态：已完成
- 实现说明：`FileTree.vue` 增加根容器事件承接与可空菜单节点，根容器占满侧边栏剩余高度；`App.vue` 改为始终挂载文件树并通过 `empty-text` 显示空状态。

### Task109 增加当前文件夹刷新按钮
- 输入：用户希望在文件侧边栏增加按钮，重新加载当前文件夹
- 输出：侧边栏“文件”标题栏的新建按钮旁增加刷新图标；点击后重新读取工作区根目录，并恢复原有已展开目录层级和选中路径；刷新期间按钮显示旋转状态并避免重复触发
- 验收：未打开工作区时刷新按钮禁用；打开工作区后可刷新当前目录；外部新增/删除文件后点击刷新能同步文件树；原本展开的目录和当前选中项仍保留，目标已被删除时清除失效选中；`vue-tsc`/`eslint` 通过
- 依赖：Task006, Task108
- 状态：已完成
- 实现说明：`App.vue` 增加刷新按钮和异步状态；`filesystem/store.ts` 的 `refresh()` 增加展开路径快照与递归恢复，避免重建根目录时丢失用户展开状态。

### Task110 优化新建文件与新建文件夹按钮图标
- 输入：侧边栏的 `+md`、`+dir` 文本按钮视觉粗糙，希望改为更好看的 SVG 矢量图
- 输出：两个按钮分别使用统一的“文件加号”和“文件夹加号”线性 SVG 图标，保留原有点击行为、尺寸、悬停效果与刷新按钮布局
- 验收：两个图标在深浅主题下均清晰可见；按钮仍可通过悬浮提示和无障碍名称识别；新建 Markdown 和新建文件夹行为不变；`vue-tsc`/`eslint` 通过
- 依赖：Task107, Task109
- 状态：已完成
- 实现说明：`App.vue` 用 Lucide 风格的内联 `file-plus` / `folder-plus` SVG 替换原文本，并统一描边、圆角和线条宽度。

### Task111 通过顶部按钮打开 Git 记录
- 输入：用户希望优化右侧 Git 面板的收起箭头，并提供一个按钮直接打开 Git 记录
- 输出：顶部工具栏增加 Git 分支图标按钮；点击后展开 Git 面板并切换到历史页，再次点击可收起；Git 面板内部箭头替换为与侧边栏一致的右栏收起图标；移除收起后的竖排 Git 入口
- 验收：打开工作区后可点击顶部 Git 按钮查看提交历史；点击后按钮呈激活状态；面板在历史页时再次点击可收起；面板内图标同样可收起；未打开工作区时按钮禁用；`vue-tsc`/`eslint` 通过
- 依赖：Task024, Task031, Task107
- 状态：已完成
- 实现说明：`App.vue` 引入 `useGitStore`，新增 Git 历史开关动作和顶部 SVG 按钮，并将 Git 面板内部箭头改为面板右栏图标。

### Task112 侧边栏拖拽到窄宽度时自动收起
- 输入：用户希望把左侧文件侧边栏向左拖窄到一定比例后直接关闭
- 输出：拖拽侧边栏分隔条时按拖动前宽度计算收起阈值（原宽度约 55%，限制在 104–140px）；拖到阈值以内立即结束拖拽并收起侧边栏
- 验收：正常向右拖拽仍可调整宽度并限制在 160–480px；向左拖过阈值后侧边栏立即消失；重新展开时恢复拖动前宽度，不会保留极窄状态；再次打开后宽度设置正常持久化；`vue-tsc`/`eslint` 通过
- 依赖：Task004, Task106
- 状态：已完成
- 实现说明：`App.vue` 调整侧边栏拖拽计算，增加收起阈值与统一的拖拽结束逻辑；自动收起时恢复拖拽前宽度再持久化布局。

### Task113 子代理评审与交互/渲染性能优化
- 输入：用户要求调用子代理评审当前未提交代码，检查 bug、卡顿和展示不流畅问题
- 评审批次：子代理对编辑器核心完成只读评审；主代理补充审查 App、文件树、Git 和近期交互改动
- 修复与优化：
  - 修复代码块输入在 220ms 防抖窗口内切换文件、保存或卸载时可能丢失的问题：新增代码块 flush，在失焦、切换标签、保存读取和 Editor 卸载前立即同步
  - 普通正文输入不再无条件重扫全文构建块级 Widget；只有变更碰到现有表格/代码块/Mermaid/公式/分割线，或插入删除相关 Markdown 起始字符时才全量重建
  - 标题点击坐标兜底的全文扫描限制到当前可见范围
  - 修复快速连续切换代码块语言时，较晚返回的旧语言包覆盖当前语言的竞态
  - 修复图片/富文本异步粘贴完成后可能写入其它标签的问题；发生标签或文档变化时取消本次粘贴，并补齐图片保存失败提示
  - 移除所有 Markdown 文件启动后的 Mermaid 全局预加载，改为实际出现 Mermaid Widget 时按需加载
  - 状态栏字数/字节统计按文档大小使用 120/400/800ms 自适应防抖
  - 代码块和内嵌 Widget 的 ResizeObserver 重测合并到单个动画帧；菜单销毁时主动移除 document 监听器
  - 侧边栏和 Git 面板拖拽使用 requestAnimationFrame 合并高频 mousemove；窗口失焦时可靠结束拖拽，避免卡在 resize 状态
  - Live Preview 大文档降级阈值从 20MB 调整为 2MB
  - 右键文件树空白区域时清除旧节点选中，确保新建落在工作区根目录
- 验收：`vue-tsc`、Vite production build、ESLint 均通过；未新增依赖；Rust 后端和无关注释流程不变
- 已知限制：代码块、表格或 Mermaid 自身发生变化时仍需要重建相关块级装饰；若单篇文档包含大量大型 Widget，后续可继续演进为按视口/变更范围增量更新
- 依赖：Task019, Task060, Task092, Task108, Task109
- 状态：已完成
- 实现说明：涉及 `App.vue`、`Editor.vue`、`livePreview.ts`、`codeBlockWidget.ts`、`statusStats.ts`、`setup.ts`、`mermaidRenderer.ts`、`mermaidWidget.ts`、`widgetDom.ts`、`FileTree.vue`。

### Task114 修复行内代码双击无法显示 Markdown 源格式
- 输入：双击正文中的行内代码 `t_sp_` 后只移动了光标，反引号仍未显示
- 根因：双击通过鼠标坐标反查语法节点，在行内代码末尾或边界容易命中失败；即使命中，选区也可能落在节点结束边界，被源码范围字段立即判定为“已离开节点”而清除
- 输出：行内代码及相关行内样式元素携带准确的 Markdown 源范围；双击优先使用该范围，并把光标夹在节点内部，确保源码态稳定保留
- 验收：双击 `**粗体**`、`*斜体*`、`~~删除线~~`、`` `行内代码` `` 均显示对应 Markdown 标记；标题内行内样式仍按双击整行标题源码态处理；单击保持预览；`vue-tsc`/`eslint` 通过
- 依赖：Task014, Task100, Task101, Task102
- 状态：已完成
- 实现说明：`livePreview.ts` 为行内装饰写入 `data-mm-inline-from/to`，双击处理优先读取精确范围，并将选区限制在 `(from, to)` 内。

### Task115 图片大图预览支持缩放
- 输入：双击图片打开大图后无法放大或缩小
- 输出：图片灯箱增加缩小、当前缩放比例/恢复适应、放大按钮；支持 `Ctrl+滚轮` 缩放、`+`/`-` 键缩放、`0` 恢复适应窗口；在大图上再次双击可在适应窗口与原始尺寸之间切换
- 验收：双击普通图片可打开大图；按钮和快捷键可连续缩放并显示实际百分比；放大后预览区域支持横向和纵向滚动；点击百分比或按 `0` 可恢复适应窗口；Mermaid 等非图片灯箱不显示图片缩放控件；`vue-tsc`/`eslint` 通过
- 依赖：Task020, Task060
- 状态：已完成
- 实现说明：`widgetDom.ts` 的通用灯箱增加图片专用缩放逻辑，`lightbox.css` 增加缩放工具栏和图片滚动布局。

### Task116 图片灯箱固定尺寸、鼠标锚点缩放与拖动
- 输入：图片窗口需要固定大小并支持手动调整；缩放应以鼠标所在位置为中心，鼠标不在图片上时以图片中心缩放；鼠标左键可拖动图片
- 输出：
  - 图片灯箱默认固定为窗口约 88% 的宽高，右下角可手动拉伸，最小尺寸受当前窗口约束
  - `Ctrl+滚轮`、双击切换缩放和缩放按钮均保留锚点：鼠标位于图片上时以鼠标位置为中心，否则以当前图片中心为中心
  - 图片左键按住并移动超过 3px 后进入拖动模式，通过调整预览滚动位置平移大图；未拖动时保留双击缩放
  - 手动调整窗口大小时按当前缩放倍率重新计算适应尺寸并保持中心位置
- 验收：图片预览默认固定大小；右下角可拖动调整；滚轮/按钮/双击缩放时指定锚点不跳变；图片放大后左键可平滑拖动；关闭灯箱或打开新灯箱时清理缩放观察器和全局监听；`vue-tsc`/`eslint` 通过
- 依赖：Task020, Task115
- 状态：已完成
- 实现说明：`widgetDom.ts` 重构图片灯箱缩放计算为容器坐标锚点模式，增加 Pointer Events 拖动和 ResizeObserver；`lightbox.css` 增加固定可调面板与拖动光标样式。

### Task117 区分格式工具栏上标与下标按钮
- 输入：格式工具栏中的上标、下标按钮视觉完全相同
- 根因：两个按钮虽然分别使用 `<sup>` 和 `<sub>`，但工具栏统一的 `line-height: 1` 让浏览器默认上下偏移不明显
- 输出：为两个按钮增加专用脚本文字容器，明确设置数字字号与上下偏移基线，并补充无障碍名称
- 验收：上标按钮清晰显示为 `X` 的右上角数字，下标按钮清晰显示为 `X` 的右下角数字；点击行为仍分别写入 `<sup>` / `<sub>`；`vue-tsc`/`eslint` 通过
- 依赖：Task037, Task060
- 状态：已完成
- 实现说明：`FormatToolbar.vue` 增加 `.mm-format-toolbar__script` 及 `sup`/`sub` 独立偏移样式。

### Task118 支持从文件树打开图片文件预览
- 输入：用户询问是否能兼容直接展示图片文件
- 输出：
  - `.png`、`.jpg/.jpeg`、`.gif`、`.webp`、`.svg`、`.bmp`、`.avif`、`.ico`、`.tif/.tiff`、`.apng` 作为图片标签打开
  - 图片文件不执行 UTF-8 文本读取、不进入 CodeMirror 文本编辑，也不参与文本保存、字数统计和外部修改冲突弹窗
  - 编辑区显示适应窗口的图片预览、文件名与原始尺寸；双击图片或点击“查看大图”复用可缩放、可拖动图片灯箱
  - 图片加载失败时显示明确提示；关闭图片标签后继续正常编辑文本标签
- 验收：从文件树点击常见图片可直接显示；不会出现乱码或保存覆盖原始图片；图片标签切换、关闭和访问历史工作正常；`vue-tsc`/`eslint` 通过
- 依赖：Task006, Task009, Task020, Task115, Task116
- 状态：已完成
- 实现说明：新增 `filesystem/fileTypes.ts` 与 `editor/components/ImageFileViewer.vue`；`TabItem` 增加 `kind`；Tabs Store 跳过图片文本读写；Editor 按标签类型在 CodeMirror 和图片预览之间切换。

### Task119 图片文件打开后直接在主编辑区缩放拖动
- 输入：打开图片文件后仍需双击或点击按钮弹出灯箱才能缩放，交互多一步
- 输出：
  - 图片标签页底部直接提供 `− / 缩放比例 / +` 控制，点击比例恢复适应窗口
  - 主编辑区支持 `Ctrl+滚轮`、`+` / `-` 键缩放和 `0` 恢复适应窗口
  - 鼠标位于图片上时以鼠标位置为锚点缩放，否则以图片中心缩放
  - 放大后可在主编辑区直接按住左键拖动图片
  - 双击图片在适应窗口和原始尺寸之间切换，不再弹出二次图片窗口
  - 调整侧边栏、Git 面板或窗口导致编辑区尺寸变化时重新计算适应比例
- 验收：打开图片文件后无需任何弹窗即可完成缩放和拖动；按钮、滚轮、键盘、双击行为一致；切换不同图片标签时缩放与滚动状态重置；`vue-tsc`/`eslint` 通过
- 依赖：Task115, Task116, Task118
- 状态：已完成
- 实现说明：`ImageFileViewer.vue` 改为自带锚点缩放、Pointer Events 拖动和 ResizeObserver 的主编辑区图片查看器，并移除灯箱入口。
