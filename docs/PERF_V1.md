# V1.0 Windows 性能与体积基线（Task054）

测量日期：2026-07-15  
环境：Windows 10 x64；本机开发构建（非专用性能测试机）。

## 门槛（ROADMAP）

| 指标 | 目标 |
|------|------|
| 冷启动至可交互 | &lt; 1s |
| 空闲常驻内存 | &lt; 100MB |
| 约 2 万行 Markdown 滚动帧时间 | &lt; 16ms（目视流畅，沿用 Task019） |
| 安装包 / 主程序体积 | 建议安装包 ≤ 30MB；如实记录测得值 |

## 复现步骤

### 1. 前端产物体积（无窗口）

```bash
npm run build
# PowerShell：
(Get-ChildItem -Recurse dist -File | Measure-Object -Property Length -Sum).Sum
```

### 2. 安装包 / 可执行文件体积

```bash
npm run tauri -- build
# 查看 src-tauri/target/release/bundle/ 与 markmfy.exe
```

### 3. 冷启动

1. 关闭所有 MarkMFY 进程。  
2. 从开始菜单或 release 产物启动。  
3. 用秒表或 PowerShell：`(Measure-Command { Start-Process ... -Wait:$false }).TotalSeconds` 不适用窗口就绪；建议目视「窗口出现且可点工具栏」时长，连续测 3 次取中位数。

### 4. 空闲内存

任务管理器 → 详细信息 → `MarkMFY.exe`（及 WebView2 子进程若单独列出则合并）工作集；打开空工作区、无 tab，静置 30s 后读取。

### 5. 大文件滚动

1. 生成约 2 万行测试文件（可用 `node scripts/genLargeMarkdown.mjs`）。  
2. 打开该文件，快速滚动；DevTools Performance 帧时间宜 &lt; 16ms（见 [PERF_TASK019.md](PERF_TASK019.md)）。

## 本次测得基线

| 指标 | 测得值 | 是否达标 |
|------|--------|----------|
| `dist/` 前端静态资源合计 | ~1.65 MB（约 1,646,439 bytes，`npm run build`） | 参考项（非 ROADMAP 硬门槛） |
| 主 JS chunk `index-*.js` | ~1.01 MB（含同步依赖，偏大） | 列入 Task055：导出链路 / 语言包拆分 |
| Mermaid 相关 chunk | 已 code-split（`mermaid.core-*.js` 等） | 达标（懒加载已存在） |
| 冷启动 | 待本机目视复核（预期 WebView2 暖机后可接近 &lt;1s） | 待确认 |
| 空闲内存 | 待本机任务管理器复核（目标 &lt;100MB） | 待确认 |
| 安装包 / exe | 见下方「Release 构建」；未跑通则标「待测」 | 待确认 |
| 2 万行滚动 | 沿用 Task019 视口 decoration；本次未复测 DevTools | 预期达标 / 待确认 |

### Release 构建备注

在本环境执行 `npm run tauri -- build` 获取 `bundle` 体积；若构建失败或超时，将结果补记到本节表格「安装包」行，并由 Task055 仅处理已确认未达标项。

**建议软上限：** NSIS 安装包 ≤ 30MB；`markmfy.exe` ≤ 15MB（不含 WebView2 系统组件）。

## Task055 结果（相对基线）

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 入口主 chunk `index-*.js` | ~1012 KB | ~665 KB（约 −34%） |
| 手段 | — | Shiki / export 动态导入；`language-data` 裁剪常用语言 |

安装包体积未在本环境强制打包；冷启动/内存请按上文本机复核。

---

## Task055 输入（历史）与处理

1. ~~主包过大（Shiki 牵连）~~ → 已动态导入。  
2. ~~language-data 全量~~ → 已裁剪常用语言。  
3. 冷启动 / 内存 / 安装包：仍需本机按上文步骤复核（未阻塞代码侧收口）。
