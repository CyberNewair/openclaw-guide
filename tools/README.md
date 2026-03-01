# OpenClaw 完全指南 - PDF 生成工具 v7

本工具用于将 Markdown 格式的文档转换为专业排版的 PDF 文件。

## 📋 功能特性

- ✅ 自动合并多个 Markdown 文件（chapter01.md ~ chapter07.md, appendix.md）
- ✅ 精美渐变封面（含标题、作者、邮箱、版本、日期）
- ✅ 自动生成目录（可点击跳转）
- ✅ 代码块语法高亮（支持嵌套代码块）
- ✅ **正确处理嵌套代码块**（遵循 CommonMark 规范）
- ✅ **保护 Shell 变量**（`${VAR}`、`$var` 不被误识别为 LaTeX）
- ✅ KaTeX 公式渲染
- ✅ 表格美化（表头渐变色、斑马纹）
- ✅ 图片居中显示
- ✅ 章节自动分页
- ✅ 中文排版优化（首行缩进、分页控制）

## 🔧 环境要求

### 必需依赖

1. **Node.js 18+**
2. **Playwright**（内置 Chromium）

### 安装依赖

```bash
cd tools
npm install
```

这会安装：
- `playwright` - 用于生成 PDF
- `katex` - 用于渲染 LaTeX 公式
- `marked` - 用于解析 Markdown

## 🚀 使用方法

### 快速开始

```bash
cd tools
node generate-pdf-v7.js
```

PDF 将生成到 `../output/OpenClaw_完全指南_v1.0.1.pdf`

### 自定义配置

编辑 `generate-pdf-v7.js` 中的 `CONFIG` 对象：

```javascript
const CONFIG = {
  inputDir: path.join(__dirname, '../src'),
  outputFile: path.join(__dirname, '../output/OpenClaw_完全指南_v1.0.1.pdf'),
  title: 'OpenClaw 完全指南',
  subtitle: '从原理到实现的专家级解析',
  author: '减肥的拉格朗日',
  email: 'cyber_newair@163.com'
};
```

## 📁 文件结构

```
openclaw_完全指南/
├── src/                    # 源 Markdown 文件
│   ├── chapter01.md        # 第1章 - OpenClaw 概述
│   ├── chapter02.md        # 第2章 - 核心架构
│   ├── chapter03.md        # 第3章 - 工作原理
│   ├── chapter04.md        # 第4章 - 核心功能深度解析
│   ├── chapter05.md        # 第5章 - 进阶主题
│   ├── chapter06.md        # 第6章 - 实践指南
│   ├── chapter07.md        # 第7章 - 生态与创业
│   └── appendix.md         # 附录
├── output/                 # PDF 输出目录
│   ├── OpenClaw_完全指南_v1.0.1.pdf
│   └── debug_v7.html       # 调试 HTML 文件
├── tools/                  # 生成工具
│   ├── generate-pdf-v7.js  # Node.js 生成脚本（推荐）
│   ├── generate-pdf-v3.js  # 旧版本（不再维护）
│   ├── pdf-styles-optimized.css  # 优化样式
│   ├── package.json
│   └── README.md           # 本文件
└── ...
```

## 🛠️ 技术实现

### v7 版本核心改进

#### 1. 嵌套代码块处理

**问题**：Markdown 嵌套代码块使用相同长度围栏会解析错误

**解决方案**：
- 外层使用 4 个反引号 ````markdown`
- 内层使用 3 个反引号 ```bash`
- 遵循 CommonMark 规范

```javascript
function protectCodeBlocksV7(content) {
  // 检测围栏：最多3个空格缩进 + 3+个 ` 或 ~
  const match = line.match(/^(\s{0,3})(`{3,}|~{3,})([^`]*)$/);
  // ... 栈算法处理嵌套
}
```

#### 2. Shell 变量保护

**问题**：`${VAR}` 和 `$var` 被误识别为 LaTeX 公式

**解决方案**：使用占位符保护

```javascript
const varPlaceholders = [];
content = content.replace(/\$\{([^}]+)\}/g, (match) =>> {
  const placeholder = `__SHELL_VAR_${varPlaceholders.length}__`;
  varPlaceholders.push(match);
  return placeholder;
});
// 渲染公式后恢复
```

#### 3. 直接生成 HTML

**问题**：`marked.parse()` 会重新解析还原后的代码块

**解决方案**：直接生成 HTML

```javascript
function restoreCodeBlocks(content, codeBlocks) {
  const html = `<pre><code class="language-${lang}">${escaped}</code></pre>`;
  // ... 替换占位符
}
```

## 📄 输出文件

默认输出文件：`output/OpenClaw_完全指南_v1.0.1.pdf`

PDF 特性：
- 📖 **精美封面** - 渐变背景、龙虾logo🦞、作者信息
- 📑 **自动目录** - 可点击跳转，三级标题层次
- 🔖 **专业排版** - 章节自动分页、代码高亮
- 💻 **代码美化** - 语法高亮、圆角边框、支持嵌套
- 📊 **表格美化** - 表头渐变色、斑马纹、悬停效果
- 🖼️ **图片居中** - 自适应宽度、圆角边框
- 🔗 **链接可点击** - 目录支持页内跳转
- 📐 **公式渲染** - KaTeX 服务器端预渲染

## 🐛 故障排除

### 错误：未找到 Chrome 浏览器

Playwright 会自动下载 Chromium，无需手动安装。

如遇到问题：
```bash
npx playwright install chromium
```

### 错误：缺少 Node 模块

```bash
cd tools
npm install
```

### 嵌套代码块显示错误

确保源文件遵循 CommonMark 规范：
- 外层代码块使用 4 个反引号 ````markdown`
- 内层代码块使用 3 个反引号 ```bash`

可使用扫描脚本检查：
```bash
node scan_and_fix_nesting.js
```

### PDF 中文显示异常

Mac 系统通常自带中文字体。如遇到问题，确保 CSS 中使用系统安全字体栈：
```css
body {
  font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif;
}
```

## 📝 更新日志

### v1.0.1 (2026-03-01)
- ✨ 修复嵌套代码块渲染问题
- ✨ 修复 Shell 变量被误识别为 LaTeX 的问题
- ✨ 正确处理带缩进的代码块围栏
- ✨ 直接生成 HTML 避免二次解析

### v1.0.0 (2026-02-28)
- ✨ 初始版本发布
- ✨ 使用 Playwright + Node.js 生成 PDF
- ✨ 精美渐变封面设计
- ✨ 专业 PDF 排版

## 👤 作者信息

- **作者**: 减肥的拉格朗日
- **邮箱**: cyber_newair@163.com
- **项目**: OpenClaw 完全指南

## 📄 许可证

MIT License

---

## 旧版本说明

- `generate-pdf-v3.js` - 旧版本，不再维护
- `generate-pdf.py` - Python 版本，不再维护
- `generate-pdf.sh` / `generate-pdf.bat` - 旧脚本，不再维护

推荐使用 **v7 版本** (`generate-pdf-v7.js`)
