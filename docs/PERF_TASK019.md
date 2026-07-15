# Task019 大文件性能基准与优化说明

## 已采取的优化措施

1. **视口限定**：`livePreview` 的 Decoration 计算只遍历 `view.visibleRanges`，不对全文档建 decoration。
2. **增量解析**：使用 CodeMirror 6 + `@lezer/markdown`，编辑时只重解析变更区域。
3. **图片懒加载**：`ImageWidget` 设置 `loading="lazy"`，viewport 外图片不抢占主线程。
4. **状态隔离**：编辑内容由 CM6 自己管理，不放入 Vue reactive，避免大字符串被代理。

## 手工验收建议

1. 生成约 20000 行 Markdown 测试文件（可用重复段落脚本）。
2. 在应用中打开该文件。
3. 快速滚动：目视应无明显掉帧；Chrome/WebView DevTools Performance 面板帧时间宜 < 16ms。
4. 在文中连续输入：应无可感知延迟。

## 后续可继续优化的方向

- 进一步拆分 decoration builder，按节点类型做独立 ViewPlugin（减少单次遍历成本）
- 对超大图片做缩略图缓存
- 对代码块高亮按需加载 language 包
