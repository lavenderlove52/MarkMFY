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
