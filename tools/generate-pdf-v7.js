const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

/**
 * OpenClaw 完全指南 - PDF生成脚本 v7
 * 修复：正确处理带缩进的代码块围栏
 */

const CONFIG = {
  inputDir: path.join(__dirname, '../src'),
  outputFile: path.join(__dirname, '../output/OpenClaw_完全指南_v1.0.1.pdf'),
  title: 'OpenClaw 完全指南',
  subtitle: '从原理到实现的专家级解析',
  author: '减肥的拉格朗日',
  email: 'cyber_newair@163.com'
};

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

const PDF_STYLES = `
@page { size: A4; margin: 2.5cm 2cm; @bottom-center { content: counter(page); font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 9pt; color: #666; } }
@page :first { margin: 0; @bottom-center { content: none; } }
@page cover { margin: 0; @bottom-center { content: none; } }
@page toc { @bottom-center { content: counter(page, lower-roman); font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 9pt; color: #666; } }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", serif; font-size: 11pt; line-height: 1.8; color: #333; text-align: justify; }
.cover { page: cover; width: 210mm; height: 297mm; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fff; position: relative; text-align: center; margin: 0 auto; break-after: page; page-break-after: always; }
.cover::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #1a365d 0%, #2563eb 50%, #1a365d 100%); }
.cover-main { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; max-width: 170mm; margin: 0 auto; padding: 40px; }
.cover-icon { font-size: 72pt; margin-bottom: 40px; }
.cover-title { font-family: "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif; font-size: 36pt; font-weight: 700; color: #1a365d; letter-spacing: 0.08em; margin-bottom: 20px; text-align: center; }
.cover-subtitle { font-size: 14pt; color: #4a5568; margin-bottom: 20px; text-align: center; }
.cover-bottom { position: absolute; bottom: 80px; left: 0; right: 0; text-align: center; width: 100%; }
.cover-author { font-size: 11pt; color: #2d3748; margin-bottom: 4px; }
.cover-email { font-size: 9pt; color: #718096; margin-bottom: 20px; }
.cover-version { font-size: 10pt; color: #a0aec0; }
.toc-page { page: toc; break-after: page; page-break-after: always; padding: 40px 60px; }
.toc-title { font-family: "Noto Sans SC", "Source Han Sans SC", sans-serif; font-size: 24pt; color: #1a365d; text-align: center; margin: 0 0 50px; font-weight: 600; }
.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-item { margin: 0; line-height: 2; }
.toc-chapter { font-weight: 600; font-size: 12pt; margin-top: 16px; }
.toc-chapter a { color: #1a365d; text-decoration: none; display: flex; align-items: baseline; }
.toc-section { padding-left: 2em; font-size: 11pt; }
.toc-section a { color: #4a5568; text-decoration: none; display: flex; align-items: baseline; }
.toc-text { flex-shrink: 0; }
.toc-dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 8px; min-width: 20px; position: relative; top: -4px; }
h1 { font-family: "Noto Sans SC", "Source Han Sans SC", sans-serif; font-size: 22pt; font-weight: 700; color: #1a365d; margin: 0 0 30px; padding-bottom: 15px; border-bottom: 2px solid #2563eb; break-before: page; page-break-before: always; }
h1:first-of-type { break-before: auto; page-break-before: auto; }
h2 { font-family: "Noto Sans SC", "Source Han Sans SC", sans-serif; font-size: 16pt; font-weight: 600; color: #2d3748; margin: 30px 0 15px; break-after: avoid; page-break-after: avoid; }
h3 { font-family: "Noto Sans SC", "Source Han Sans SC", sans-serif; font-size: 13pt; font-weight: 600; color: #4a5568; margin: 20px 0 10px; break-after: avoid; page-break-after: avoid; }
p { text-indent: 2em; margin: 0 0 12px; orphans: 3; widows: 3; }
pre { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px 16px; margin: 16px 0; font-family: "SF Mono", "Consolas", "Monaco", monospace; font-size: 9.5pt; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; break-inside: avoid; page-break-inside: avoid; }
code { font-family: "SF Mono", "Consolas", "Monaco", monospace; font-size: 9.5pt; background: #f7fafc; padding: 2px 6px; border-radius: 3px; }
pre code { background: none; padding: 0; }
img { max-width: 100%; height: auto; display: block; margin: 20px auto; }
figure { margin: 20px 0; text-align: center; break-inside: avoid !important; page-break-inside: avoid !important; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt; break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
th { background: #f7fafc; font-weight: 600; color: #2d3748; }
tr { break-inside: avoid; page-break-inside: avoid; }
ul, ol { margin: 12px 0; padding-left: 2em; }
li { margin: 6px 0; }
blockquote { border-left: 3px solid #2563eb; margin: 16px 0; padding: 12px 20px; background: #f7fafc; color: #4a5568; break-inside: avoid; page-break-inside: avoid; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 30px 0; }
strong { font-weight: 600; color: #1a202c; }
a { color: #2563eb; text-decoration: none; }
.katex { font-size: 1.1em; }
.katex-display { margin: 1.5em 0; overflow-x: auto; overflow-y: hidden; }
.katex-display .katex { font-size: 1.2em; }
.footnotes { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
.footnotes li { font-size: 9pt; color: #666; margin: 6px 0; list-style: decimal; text-indent: 0; margin-left: 2em; }
.footnote-ref { font-size: 9pt; color: #2563eb; text-decoration: none; vertical-align: super; }
`;

const katex = require('katex');

function readChapters() {
  const files = [
    'chapter01.md', 'chapter02.md', 'chapter03.md', 'chapter04.md',
    'chapter05.md', 'chapter06.md', 'chapter07.md', 'appendix.md'
  ];
  
  const chapters = [];
  for (const file of files) {
    const path_ = path.join(CONFIG.inputDir, file);
    if (fs.existsSync(path_)) {
      chapters.push({
        file: file,
        content: fs.readFileSync(path_, 'utf-8')
      });
    }
  }
  return chapters;
}

function extractTOC(chapters) {
  const toc = [];
  let chapterNum = 0;
  
  for (const chapter of chapters) {
    chapterNum++;
    const lines = chapter.content.split('\n');
    let inCodeBlock = false;
    
    for (const line of lines) {
      // 【修复】使用与 protectCodeBlocksV7 相同的逻辑检测代码块
      const fenceMatch = line.match(/^(\s{0,3})(`{3,}|~{3,})/);
      if (fenceMatch) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;
      
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        const title = h1Match[1].trim();
        if (!title.match(/^第\d+章/)) continue;
        toc.push({ level: 1, num: chapterNum, title, anchor: `ch${chapterNum}` });
        continue;
      }
      
      const h2Match = line.match(/^##\s+(\d+\.\d+)\s+(.+)$/);
      if (h2Match) {
        toc.push({
          level: 2, num: h2Match[1], title: h2Match[2].trim(),
          anchor: `sec${h2Match[1].replace('.', '-')}`
        });
      }
    }
  }
  return toc;
}

function renderFormula(formula) {
  try {
    const isDisplay = formula.startsWith('$$') || formula.startsWith('\\[');
    const cleanFormula = formula
      .replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '')
      .replace(/^\\\[|\\\]$/g, '').replace(/^\\\(|\\\)$/g, '').trim();
    
    return katex.renderToString(cleanFormula, {
      displayMode: isDisplay, throwOnError: false, strict: false
    });
  } catch (err) {
    console.warn(`公式渲染失败: ${formula}`, err.message);
    return formula;
  }
}

/**
 * 【v7核心修复】正确处理带缩进的代码块围栏
 * CommonMark规范：围栏可以有0-3个空格缩进
 */
function protectCodeBlocksV7(content) {
  const lines = content.split('\n');
  const result = [];
  const codeBlocks = [];
  let currentBlock = [];
  let openFence = null; // { char, length, indent }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 【关键修复】检测围栏：最多3个空格缩进 + 3+个 ` 或 ~
    // 注意：不使用 trim()，保留原始行用于恢复
    const match = line.match(/^(\s{0,3})(`{3,}|~{3,})([^`]*)$/);
    
    if (match) {
      const indent = match[1];
      const fence = match[2];
      const info = match[3].trim();
      
      if (!openFence) {
        // 开始新代码块
        openFence = { char: fence[0], length: fence.length, indent };
        currentBlock = [line];
      } else {
        // 检查是否结束当前代码块
        // 规则：相同字符 且 长度 >= 开启长度
        if (fence[0] === openFence.char && fence.length >= openFence.length) {
          currentBlock.push(line);
          const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
          codeBlocks.push(currentBlock.join('\n'));
          result.push(placeholder);
          openFence = null;
          currentBlock = [];
        } else {
          // 不满足结束条件，是内层围栏
          currentBlock.push(line);
        }
      }
    } else if (openFence) {
      // 在代码块内，保留原始行（包括缩进）
      currentBlock.push(line);
    } else {
      // 在代码块外
      result.push(line);
    }
  }
  
  // 处理未闭合的代码块
  if (openFence && currentBlock.length > 0) {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(currentBlock.join('\n'));
    result.push(placeholder);
  }
  
  return { content: result.join('\n'), codeBlocks };
}

function restoreCodeBlocks(content, codeBlocks) {
  let result = content;
  for (let i = 0; i < codeBlocks.length; i++) {
    const block = codeBlocks[i];
    // 解析代码块：提取语言信息和内容
    const lines = block.split('\n');
    const fenceMatch = lines[0].match(/^(\s*)(`{3,}|~{3,})(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[3] || '';
      // 移除首尾的围栏行
      const contentLines = lines.slice(1, -1);
      const codeContent = contentLines.join('\n');
      // 生成 HTML，转义特殊字符防止再次被解析
      const escaped = codeContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const html = `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escaped}</code></pre>`;
      result = result.replace(`__CODE_BLOCK_${i}__`, html);
    } else {
      // 回退：直接替换
      result = result.replace(`__CODE_BLOCK_${i}__`, block);
    }
  }
  return result;
}

function convertMarkdown(content, chapterNum) {
  const { content: protectedContent, codeBlocks } = protectCodeBlocksV7(content);
  content = protectedContent;
  
  // 收集脚注定义
  const footnotes = {};
  content = content.replace(/^\[(\^[^\]]+)\]:\s*(.+)$/gm, (match, id, text) => {
    footnotes[id] = text.trim();
    return '';
  });
  
  // 【修复】预处理：转义 Shell 变量语法，防止被识别为LaTeX
  // 包括：${VAR} 和 $var
  const varPlaceholders = [];
  content = content.replace(/\$\{([^}]+)\}/g, (match) => {
    const placeholder = `__SHELL_VAR_${varPlaceholders.length}__`;
    varPlaceholders.push(match);
    return placeholder;
  });
  // 【新增】保护 $var 格式的 shell 变量（如 $f）
  content = content.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match) => {
    const placeholder = `__SHELL_VAR_${varPlaceholders.length}__`;
    varPlaceholders.push(match);
    return placeholder;
  });
  
  // 预处理：渲染公式（现在 Shell 变量已被保护）
  content = content.replace(/\$\$[\s\S]*?\$\$/g, (match) => renderFormula(match));
  content = content.replace(/\$[^$\n]+\$/g, (match) => renderFormula(match));
  
  // 【修复】恢复 Shell 变量
  for (let i = 0; i < varPlaceholders.length; i++) {
    content = content.replace(`__SHELL_VAR_${i}__`, varPlaceholders[i]);
  }
  
  // 给标题添加锚点
  content = content.replace(/^##\s+(\d+\.\d+)\s+(.+)$/gm, (match, num, title) => {
    return `\n<h2 id="sec${num.replace('.', '-')}">${num} ${title}</h2>\n`;
  });
  
  content = content.replace(/^#\s+(.+)$/gm, (match, title) => {
    return `\n<h1 id="ch${chapterNum}">${title}</h1>\n`;
  });
  
  // 处理脚注引用
  content = content.replace(/\[(\^[^\]]+)\](?!:)/g, (match, id) => {
    return footnotes[id] ? `<sup class="footnote-ref">${id.replace('^', '')}</sup>` : match;
  });
  
  // 【关键】恢复代码块，然后再转换Markdown
  content = restoreCodeBlocks(content, codeBlocks);
  
  // 转换Markdown
  content = marked.parse(content);
  
  // 包裹图片防截断
  content = content.replace(/<img([^>]+)>/g, '<figure><img$1></figure>');
  
  // 添加脚注列表
  const footnoteIds = Object.keys(footnotes);
  if (footnoteIds.length > 0) {
    let footnotesHTML = '\n<div class="footnotes">\n<h3>参考来源</h3>\n<ol>';
    footnoteIds.forEach((id) => {
      footnotesHTML += `\n<li>${footnotes[id]}</li>`;
    });
    content += footnotesHTML + '\n</ol>\n</div>';
  }
  
  return content;
}

function generateHTML(chapters, toc) {
  let tocHTML = '<div class="toc-page"><h1 class="toc-title">目 录</h1><div class="toc-list">';
  
  for (const item of toc) {
    const link = `<a href="#${item.anchor}"><span class="toc-text">${item.level === 1 ? item.title : item.num + ' ' + item.title}</span></a>`;
    tocHTML += `<div class="toc-item ${item.level === 1 ? 'toc-chapter' : 'toc-section'}">${link}</div>`;
  }
  tocHTML += '</div></div>';
  
  let contentHTML = '';
  let chapterNum = 0;
  for (const chapter of chapters) {
    contentHTML += convertMarkdown(chapter.content, ++chapterNum);
  }
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${CONFIG.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${KATEX_CSS}">
  <style>${PDF_STYLES}</style>
</head>
<body>
  <div class="cover">
    <div class="cover-main">
      <div class="cover-icon">🦞</div>
      <h1 class="cover-title">${CONFIG.title}</h1>
      <p class="cover-subtitle">${CONFIG.subtitle}</p>
    </div>
    <div class="cover-bottom">
      <p class="cover-author">${CONFIG.author}</p>
      <p class="cover-email">${CONFIG.email}</p>
      <p class="cover-version">版本 1.0.1 | 2026年2月</p>
    </div>
  </div>
  ${tocHTML}
  ${contentHTML}
</body>
</html>`;
}

async function generatePDF() {
  console.log('═══════════════════════════════════════');
  console.log('  OpenClaw 完全指南 PDF 生成器 v7');
  console.log('  修复：正确处理带缩进的代码块');
  console.log('═══════════════════════════════════════\n');
  
  const chapters = readChapters();
  console.log(`✓ 读取 ${chapters.length} 个章节\n`);
  
  // 【调试】检查第7章的代码块
  const ch7 = chapters.find(c => c.file === 'chapter07.md');
  if (ch7) {
    const testContent = ch7.content.split('\n').slice(967, 976).join('\n');
    console.log('【调试】第7章 Line 968-976 原始内容:');
    console.log(testContent);
    console.log('\n【调试】调用 protectCodeBlocksV7 结果:');
    const result = protectCodeBlocksV7(testContent);
    console.log('代码块数量:', result.codeBlocks.length);
    if (result.codeBlocks.length > 0) {
      console.log('第一个代码块内容:');
      console.log(result.codeBlocks[0]);
    }
    console.log('\n' + '='.repeat(50) + '\n');
  }
  
  const toc = extractTOC(chapters);
  console.log(`✓ 提取 ${toc.length} 个目录项\n`);
  
  const html = generateHTML(chapters, toc);
  
  const debugPath = path.join(__dirname, '../output/debug_v7.html');
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.writeFileSync(debugPath, html);
  console.log(`✓ 调试HTML: ${debugPath}\n`);
  
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {
      waitUntil: 'networkidle', timeout: 120000
    });
    
    console.log('⏳ 等待字体和样式加载...');
    await page.waitForTimeout(2000);
    
    console.log('📄 生成PDF...');
    await page.pdf({
      path: CONFIG.outputFile, format: 'A4', printBackground: true,
      preferCSSPageSize: true, margin: { top: '2.5cm', right: '2cm', bottom: '2.5cm', left: '2cm' }
    });
    
    const stats = fs.statSync(CONFIG.outputFile);
    console.log(`\n✅ 完成!`);
    console.log(`   文件: ${CONFIG.outputFile}`);
    console.log(`   大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);
  } finally {
    await browser.close();
  }
}

generatePDF().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
