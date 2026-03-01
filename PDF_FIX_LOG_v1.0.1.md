# PDF生成修复记录 v1.0.1

## 修复日期
2026-03-01

## 修复内容汇总

### 1. 嵌套代码块修复

#### 问题描述
源文件使用相同长度的围栏（3个反引号）嵌套代码块，违反CommonMark规范，导致内层标题被误识别为正文标题。

#### 修复原则
- 外层代码块使用4个反引号 ````markdown`
- 内层代码块保持3个反引号 ```bash`

#### 修复位置

**chapter04.md**
| 行号 | 修复前 | 修复后 | 说明 |
|------|--------|--------|------|
| 1098 | ```markdown | ````markdown | 4.3.2.1外层开始 |
| 1183 | ``` | ```` | 4.3.2.1外层结束 |
| 1229 | ```markdown | ````markdown | 4.3.2.3示例1开始 |
| 1299 | ``` | ```` | 4.3.2.3示例1结束 |
| 1303 | ```markdown | ````markdown | 4.3.2.3示例2开始 |
| 1338 | ``` | ```` | 4.3.2.3示例2结束 |
| 1542 | ```markdown | ````markdown | 4.3.5.3第2点外层开始 |
| 1556 | ``` | ```` | 4.3.5.3第2点外层结束 |
| 1559 | ```markdown | ````markdown | 4.3.5.3第3点外层开始 |
| 1569 | ``` | ```` | 4.3.5.3第3点外层结束 |

**chapter06.md**
| 行号 | 修复前 | 修复后 | 说明 |
|------|--------|--------|------|
| 1333 | ```markdown | ````markdown | Issue模板外层开始 |
| 1356 | ``` | ```` | Issue模板外层结束 |

**chapter07.md**
| 行号 | 修复前 | 修复后 | 说明 |
|------|--------|--------|------|
| 373 | ```markdown | ````markdown | References外层开始 |
| 400 | ``` | ```` | References外层结束 |
| 426 | ```markdown | ````markdown | 正文示例外层开始 |
| 458 | ``` | ```` | 正文示例外层结束 |

### 2. Shell变量修复

#### 问题描述
Shell环境变量如 `${VAR}`、`$f` 被误识别为LaTeX公式，导致渲染错误。

#### 解决方案
使用占位符保护Shell变量：
1. 替换 `${VAR}` 和 `$var` 为占位符
2. 渲染LaTeX公式
3. 恢复Shell变量

#### 代码实现
```javascript
const varPlaceholders = [];
content = content.replace(/\$\{([^}]+)\}/g, (match) => {
  const placeholder = `__SHELL_VAR_${varPlaceholders.length}__`;
  varPlaceholders.push(match);
  return placeholder;
});
content = content.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match) => {
  const placeholder = `__SHELL_VAR_${varPlaceholders.length}__`;
  varPlaceholders.push(match);
  return placeholder;
});
// ... 渲染公式后恢复
```

### 3. 带缩进代码块修复

#### 问题描述
CommonMark允许代码块围栏有0-3个空格缩进，但原算法未正确处理。

#### 解决方案
使用正则 `/^(\s{0,3})(`{3,}|~{3,})/` 检测围栏，保留原始缩进。

### 4. 代码块HTML直接生成

#### 问题描述
`marked.parse()` 会重新解析还原后的代码块，导致嵌套结构被破坏。

#### 解决方案
`restoreCodeBlocks` 直接生成HTML而非还原markdown：
```javascript
const html = `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`;
```

## 验证清单

- [x] 4.3.2.1 完整格式定义 - 代码块正确闭合
- [x] 4.3.2.3 典型SKILL.md示例 - 示例1和示例2正确分离
- [x] 4.3.5.3 开发最佳实践 - 4个小标题正确显示为正文
- [x] 6.4.4 获取帮助 - Issue模板正确嵌套
- [x] 7.1.3 References编写 - 代码块正确嵌套
- [x] 7.1.3 正文示例 - 代码块正确嵌套
- [x] 目录完整性 - 无内层标题混入
- [x] Shell变量 - `${VAR}`、`$f` 正确显示

## 文件变更

### 源文件
- `src/chapter04.md` - 10处修复
- `src/chapter06.md` - 2处修复
- `src/chapter07.md` - 4处修复

### 生成脚本
- `tools/generate-pdf-v7.js` - 新增嵌套代码块处理、Shell变量保护

### 输出文件
- `output/OpenClaw_完全指南_v1.0.1.pdf` - 9.27 MB
- `output/debug_v7.html` - 调试文件

## 技术债务

1. **手动修复源文件** - 需要检查其他章节是否有类似问题
2. **正则表达式依赖** - 复杂的嵌套结构可能需要更健壮的解析器
3. **代码块直接生成HTML** - 跳过了marked的语法高亮，需确保转义正确

## 经验总结

1. **CommonMark规范** - 嵌套代码块必须使用更长的围栏
2. **占位符保护** - 预处理阶段保护特殊语法，避免被后续处理破坏
3. **逐行调试** - 使用 `od -c` 和 `hexdump` 检查隐藏字符
4. **分层验证** - 先验证代码块提取，再验证HTML生成
