# 第4章 核心功能深度解析

OpenClaw 作为一款先进的 AI Agent 平台，其核心竞争力不仅体现在架构设计的优雅性上，更在于一系列经过精心设计的核心功能模块。本章将深入剖析内存系统、多代理系统、技能系统以及安全权限机制四大核心功能，揭示其技术实现原理与最佳实践方法。

---

## 4.1 内存系统深度解析

内存系统是 OpenClaw 实现长期对话能力的关键基础设施。与简单的消息历史存储不同，OpenClaw 的内存系统采用分层架构设计，结合向量搜索技术与语义理解能力，为 Agent 提供了接近人类记忆的联想式回忆机制。

### 4.1.1 内存架构概览

OpenClaw 的内存系统遵循**"文件即真相"**（Files are the Source of Truth）的设计哲学。所有记忆以纯 Markdown 格式存储在 Agent 工作区中，模型仅"记忆"被写入磁盘的内容。

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory System Architecture               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Daily Logs  │    │ Long-term    │    │  Vector      │  │
│  │  (Short-term)│    │ Memory       │    │  Index       │  │
│  │              │    │ (Curated)    │    │              │  │
│  │ memory/      │    │ MEMORY.md    │    │ SQLite/      │  │
│  │ YYYY-MM-DD.md│    │              │    │ QMD Backend  │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         └───────────────────┼───────────────────┘          │
│                             │                              │
│                    ┌────────┴────────┐                     │
│                    │  Memory Tools   │                     │
│                    │                 │                     │
│                    │ • memory_search │                     │
│                    │ • memory_get    │                     │
│                    └────────┬────────┘                     │
│                             │                              │
│                    ┌────────┴────────┐                     │
│                    │   AI Agent      │                     │
│                    │   (LLM Core)    │                     │
│                    └─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**核心设计原则：**

| 原则 | 说明 | 技术实现 |
|------|------|----------|
| **持久化优先** | 所有重要信息必须写入文件 | Markdown 格式存储 |
| **分层存储** | 区分短期日志与长期记忆 | 每日日志 + MEMORY.md |
| **语义检索** | 支持概念联想而非关键词匹配 | 向量搜索 + 相似度计算 |
| **隐私可控** | 长期记忆仅在主会话加载 | 会话类型感知加载策略 |

### 4.1.2 内存文件组织结构

OpenClaw 采用双层级内存布局：

#### 4.1.2.1 每日日志（Daily Logs）

**文件路径：** `memory/YYYY-MM-DD.md`

每日日志采用**追加写入**模式，记录当天的所有对话摘要和关键信息：

```markdown
# 2026-02-27

## 上午会话
- 与用户讨论了 OpenClaw 内存系统架构
- 确定了文档章节结构：4.1 内存系统、4.2 多代理系统、4.3 技能系统、4.4 安全权限
- 用户偏好：代码引用需精确到文件级，包含架构图

## 下午会话  
- 查阅了官方文档 https://docs.openclaw.ai/concepts/memory
- 获取了向量搜索配置的详细信息
- 开始撰写第4章内容

## 关键决策
- 使用 SQLite + sqlite-vec 作为默认向量存储
- QMD 作为可选的高级后端
```

**加载策略：**
- 会话启动时自动读取**今天**和**昨天**的日志
- 提供近期上下文的快速访问
- 适合记录临时的、有时间敏感性的信息

#### 4.1.2.2 长期记忆（Long-term Memory）

**文件路径：** `MEMORY.md`

长期记忆采用**精心策划**模式，仅保存经过提炼的重要信息：

```markdown
# MEMORY.md - 用户长期记忆

## 专业背景
- **姓名：** 星总
- **领域：** 自动驾驶算法专家
- **工作模式：** 处理复杂分析任务、开发与测试
- **沟通偏好：** 可使用专业术语，关注结果与逻辑严谨性

## 项目信息
- **当前项目：** 《OpenClaw 完全指南》技术书籍编写
- **目标：** 200页以内的专业 OpenClaw 技术指南
- **质量要求：** 所有内容必须有官方来源验证

## 技术偏好
- 代码示例需要精确的文件路径引用
- 偏好包含架构图和流程图的技术文档
- 重视官方文档和源码级别的准确性

## 安全注意事项
- 私人信息严格保密
- 外部操作前需要确认
- 不在公开场合代表用户发言
```

**加载策略：**
- **仅**在主会话（main session）中加载
- 在群组聊天等共享上下文中**绝不**加载
- 保护个人隐私和敏感信息

### 4.1.3 内存工具接口

OpenClaw 向 Agent 暴露两个核心内存工具：

#### 4.1.3.1 memory_search - 语义搜索

**功能：** 在索引的文本片段上执行语义召回，即使措辞不同也能找到相关笔记。

**调用示例：**
```typescript
// Agent 调用内存搜索
const results = await memory_search({
  query: "OpenClaw 的向量搜索是如何实现的？",
  limit: 5
});
```

**响应格式：**
```json
{
  "results": [
    {
      "text": "向量搜索使用 sqlite-vec 扩展加速...",
      "path": "memory/2026-02-27.md",
      "line": 45,
      "score": 0.89
    },
    {
      "text": "QMD 后端结合了 BM25 + 向量 + 重排序...",
      "path": "MEMORY.md", 
      "line": 23,
      "score": 0.85
    }
  ]
}
```

#### 4.1.3.2 memory_get - 定向读取

**功能：** 读取特定 Markdown 文件的指定行范围，支持优雅的降级处理（文件不存在时返回空文本而非抛出错误）。

**调用示例：**
```typescript
// 读取特定文件
const content = await memory_get({
  path: "memory/2026-02-27.md",
  offset: 1,
  limit: 50
});
```

### 4.1.4 向量搜索实现原理

OpenClaw 的向量搜索系统是其内存系统的核心技术亮点，支持多种嵌入提供商和存储后端。

#### 4.1.4.1 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                  Vector Search Architecture                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────┐                                           │
│   │ User Query  │                                           │
│   └──────┬──────┘                                           │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────────────────────────────┐                   │
│   │      Embedding Provider Selection   │                   │
│   │                                     │                   │
│   │  1. Local (node-llama-cpp)         │                   │
│   │  2. OpenAI (text-embedding-3)      │                   │
│   │  3. Gemini (gemini-embedding-001)  │                   │
│   │  4. Voyage AI                      │                   │
│   │  5. Mistral AI                     │                   │
│   └──────────┬──────────────────────────┘                   │
│              │                                               │
│              ▼                                               │
│   ┌─────────────────────────────────────┐                   │
│   │      Vector Embedding Generation    │                   │
│   │      (query → 1536-dim vector)     │                   │
│   └──────────┬──────────────────────────┘                   │
│              │                                               │
│              ▼                                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Similarity Computation                  │   │
│   │                                                     │   │
│   │   ┌─────────────┐         ┌─────────────────────┐   │   │
│   │   │  SQLite     │         │  QMD Backend        │   │   │
│   │   │  (Default)  │         │  (Experimental)     │   │   │
│   │   │             │         │                     │   │   │
│   │   │ • sqlite-vec│         │ • BM25 + Vector     │   │   │
│   │   │ • Cosine    │         │ • Reranking         │   │   │
│   │   │   Similarity│         │ • Query Expansion   │   │   │
│   │   └─────────────┘         └─────────────────────┘   │   │
│   │                                                     │   │
│   │   Similarity Score = cos(θ) = (A·B) / (‖A‖ × ‖B‖)  │   │
│   └─────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Ranked Results                          │   │
│   │   Top-K most similar chunks with metadata           │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 4.1.4.2 相似度计算算法

OpenClaw 使用**余弦相似度**（Cosine Similarity）作为默认的相似度度量：

$$
similarity(A, B) = \cos(\theta) = \frac{A \cdot B}{\|A\| \times \|B\|} = \frac{\sum_{i=1}^{n} A_i \times B_i}{\sqrt{\sum_{i=1}^{n} A_i^2} \times \sqrt{\sum_{i=1}^{n} B_i^2}}$$

**算法特性：**

| 特性 | 说明 |
|------|------|
| **值域** | 理论上为 [-1, 1]；实际应用中，现代嵌入模型（OpenAI text-embedding-3、Gemini embedding-001 等）输出的向量经过归一化处理，相似度计算结果通常分布在 [0, 1] 区间 |
| **实际分布** | 现代嵌入模型（OpenAI、Gemini 等）输出的向量经过归一化和训练优化，实际相似度通常分布在 [0, 1] 区间 |
| **归一化** | 自动处理向量长度差异，仅比较方向 |
| **计算效率** | O(n) 时间复杂度，适合大规模索引 |

> **💡 理论与实践的差异**
>
> 虽然余弦相似度的数学值域是 [-1, 1]，但在 OpenClaw 的实际应用中，你很少看到负值。这是因为：
>
> 1. **嵌入模型训练特性**：现代嵌入模型（如 OpenAI 的 text-embedding-3 系列、Gemini 的 embedding-001）在训练过程中优化的是语义相关性，生成的向量在语义空间中趋向于同一象限
> 2. **归一化处理**：大多数嵌入 API 默认返回 L2 归一化后的向量，使得相似度计算结果集中在 [0, 1] 区间
> 3. **实际应用验证**：在 OpenClaw 的语义搜索实现中，典型查询结果的相关性分数通常在 0.6-0.95 之间，低于 0.5 的结果通常被视为不相关
>
> 因此，在配置相似度阈值时，建议以 0.7-0.8 作为"高相关性"的参考基准，而非以 0 作为中性点。

**代码实现参考：**

```typescript
// 源码位置: src/memory/vector-search.ts
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

#### 4.1.4.3 嵌入提供商自动选择

OpenClaw 实现了智能的嵌入提供商自动选择机制：

```typescript
// 配置位置: agents.defaults.memorySearch
// 自动选择优先级（从高到低）：
const providerPriority = [
  { type: 'local', condition: () => config.local?.modelPath && fs.existsSync(config.local.modelPath) },
  { type: 'openai', condition: () => resolveApiKey('openai') },
  { type: 'gemini', condition: () => resolveApiKey('google') },
  { type: 'voyage', condition: () => resolveApiKey('voyage') },
  { type: 'mistral', condition: () => resolveApiKey('mistral') }
];
```

**配置示例：**

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    defaults: {
      memorySearch: {
        provider: "gemini",              // 显式指定提供商
        model: "gemini-embedding-001",   // 嵌入模型
        remote: {
          apiKey: "${GEMINI_API_KEY}",   // API 密钥
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          headers: { "X-Custom-Header": "value" }
        },
        fallback: "openai"               // 故障转移提供商
      }
    }
  }
}
```

### 4.1.4.4 混合搜索（Hybrid Search）

**注意**: 混合搜索默认禁用，需要显式启用：

OpenClaw 内置后端支持混合搜索模式，结合向量相似度和 BM25 关键词相关性，实现更全面的语义检索：

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        query: {
          hybrid: {
            enabled: true,
            vectorWeight: 0.7,
            textWeight: 0.3,
            candidateMultiplier: 4,
            // 多样性优化 - MMR 重排序（默认禁用）
            mmr: {
              enabled: true,  // 默认: false
              lambda: 0.7  // 相关性 vs 多样性平衡参数
            },
            // 时间衰减（新鲜度提升）（默认禁用）
            temporalDecay: {
              enabled: true,  // 默认: false
              halfLifeDays: 30  // 30天前的记忆分数减半
            }
          }
        }
      }
    }
  }
}
```

**混合搜索核心组件：**

| 组件 | 功能 | 配置参数 |
|------|------|----------|
| **向量相似度** | 语义匹配，理解概念关联 | `vectorWeight` (0-1) |
| **BM25 关键词** | 精确匹配，处理术语和专有名词 | `textWeight` (0-1) |
| **MMR 重排序** | Maximal Marginal Relevance，平衡相关性与多样性 | `lambda` (0-1) |
| **时间衰减** | 根据记忆年龄调整分数，新信息优先 | `halfLifeDays` |

**MMR（Maximal Marginal Relevance）算法：**

MMR 通过以下公式计算每个文档的得分：

$$
MMR = \lambda \times Sim(d, q) - (1 - \lambda) \times \max_{d' \in S} Sim(d, d')$$

- **$Sim(d, q)$**: 文档与查询的相似度
- **$\max Sim(d, d')$**: 文档与已选结果的最大相似度
- **$\lambda$**: 平衡参数（0.7 表示侧重相关性，0.3 表示侧重多样性）

**时间衰减计算（指数衰减）：**

$$
decayedScore = score \times e^{(-\lambda \times ageInDays)}
$$

其中 $\lambda = ln(2) / halfLifeDays$

这与半衰期公式等价：30天后分数减半。

### 4.1.4.5 嵌入缓存

OpenClaw 支持 chunk embeddings 缓存，避免重复计算嵌入向量，显著提升性能：

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        cache: {
          enabled: true,
          maxEntries: 50000  // 最大缓存条目数
        }
      }
    }
  }
}
```

**缓存机制特点：**
- 基于文件内容哈希，内容不变时复用缓存
- 自动淘汰旧条目（LRU 策略）
- 缓存持久化到 SQLite，重启后仍然有效
- 适用于频繁访问的长期记忆文件

### 4.1.5 QMD 高级后端（实验性）

QMD（Query Markdown）是一个本地优先的搜索辅助程序，结合了 BM25 文本搜索、向量语义搜索和重排序技术。

#### 4.1.5.1 QMD 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    QMD Backend Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │ Markdown Source │                                        │
│  │ (MEMORY.md +    │                                        │
│  │  memory/*.md)   │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────────────────────────┐                  │
│  │          QMD Index Pipeline           │                  │
│  │                                       │                  │
│  │  1. Chunking (configurable size)     │                  │
│  │  2. BM25 Index Build                 │                  │
│  │  3. Vector Embedding (local GGUF)    │                  │
│  │  4. SQLite Storage                   │                  │
│  └──────────┬───────────────────────────┘                  │
│             │                                               │
│             ▼                                               │
│  ┌──────────────────────────────────────┐                  │
│  │          Search Pipeline              │                  │
│  │                                       │                  │
│  │  Query ──► BM25 Retrieval ──► Top 100 │                  │
│  │                │                      │                  │
│  │                ▼                      │                  │
│  │         Vector Reranking              │                  │
│  │         (Cross-encoder)               │                  │
│  │                │                      │                  │
│  │                ▼                      │                  │
│  │         Final Ranking ──► Top K       │                  │
│  └──────────────────────────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1.5.2 QMD 配置

```json5
{
  memory: {
    backend: "qmd",                    // 启用 QMD 后端
    citations: "auto",                 // 自动添加引用标注
    
    qmd: {
      command: "qmd",                  // QMD 可执行文件路径
      searchMode: "search",            // search/vsearch/query
      includeDefaultMemory: true,      // 自动索引默认内存文件
      
      // 额外索引路径
      paths: [
        { name: "docs", path: "~/notes", pattern: "**/*.md" },
        { name: "projects", path: "~/projects", pattern: "**/*.md" }
      ],
      
      // 会话历史索引（可选）
      sessions: {
        enabled: true,
        retentionDays: 30,
        exportDir: "~/.openclaw/agents/main/qmd/sessions/"
      },
      
      // 更新配置
      update: {
        interval: "5m",                // 索引更新间隔
        debounceMs: 15000,             // 防抖时间
        onBoot: true,                  // 启动时更新
        waitForBootSync: false,        // 异步启动（不阻塞）
        embedInterval: "30m"           // 嵌入更新间隔
      },
      
      // 搜索限制
      limits: {
        maxResults: 6,                 // 最大返回结果数
        maxSnippetChars: 2000,         // 片段最大字符数
        maxInjectedChars: 8000,        // 注入上下文最大字符数
        timeoutMs: 4000                // 搜索超时
      },
      
      // 作用域控制（安全）
      scope: {
        default: "deny",
        rules: [
          { action: "allow", match: { chatType: "direct" } },
          { action: "deny", match: { keyPrefix: "discord:channel:" } }
        ]
      }
    }
  }
}
```

### 4.1.6 记忆压缩与清理

#### 4.1.6.1 自动记忆刷新机制

当会话接近自动压缩阈值时，OpenClaw 会触发**静默的 Agentic 轮次**，提醒模型在上下文被压缩前写入持久化记忆。

```
┌─────────────────────────────────────────────────────────────┐
│              Memory Flush (Pre-compaction)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Session Token Estimate                                     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Trigger Condition:                                 │   │
│  │  tokens > contextWindow - reserveTokensFloor       │   │
│  │                    - softThresholdTokens            │   │
│  │                                                     │   │
│  │  Example: 128k window, 20k reserve, 4k threshold   │   │
│  │  Trigger at: 128k - 20k - 4k = 104k tokens         │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Silent Agent Turn                                  │   │
│  │                                                     │   │
│  │  System: "Session nearing compaction.               │   │
│  │           Store durable memories now."              │   │
│  │                                                     │   │
│  │  Prompt: "Write any lasting notes to               │   │
│  │           memory/YYYY-MM-DD.md;                     │   │
│  │           reply with NO_REPLY..."                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│                    [Memory Written]                         │
│                           │                                 │
│                           ▼                                 │
│                    [Context Compacted]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**配置参数：**

```json5
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,      // 保留令牌数下限
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,    // 软阈值令牌数
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      }
    }
  }
}
```

#### 4.1.6.2 会话压缩策略

当会话历史过长时，OpenClaw 会自动执行上下文压缩：

```
原始会话历史
     │
     ▼
┌────────────────────────────────────────┐
│  ┌────────────┐  ┌──────────────────┐  │
│  │ Recent N   │  │ Older Messages   │  │
│  │ (Keep)     │  │ (Compress)       │  │
│  │            │  │                  │  │
│  │ Full text  │  │ Summarized       │  │
│  │ preserved  │  │ into key points  │  │
│  └────────────┘  └──────────────────┘  │
└────────────────────────────────────────┘
     │
     ▼
压缩后的会话结构
```

**压缩规则：**

| 阶段 | 策略 | 说明 |
|------|------|------|
| **保留** | 最近 10-20 条消息 | 完整保留，确保即时上下文 |
| **压缩** | 早期对话 | 总结为关键信息点 |
| **存档** | 压缩内容 | 存入每日记忆文件 |

---

## 4.2 多代理系统

OpenClaw 的多代理系统允许在同一 Gateway 实例中运行多个完全隔离的 Agent，每个 Agent 拥有独立的工作区、配置和会话存储。这为团队协作、多场景应用提供了强大支持。

### 4.2.1 多代理架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Message Router                        │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │ Binding │  │ Binding │  │ Binding │  │ Binding │    │   │
│  │  │ Rules   │  │ Rules   │  │ Rules   │  │ Rules   │    │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │   │
│  │       │            │            │            │          │   │
│  │       └────────────┴────────────┴────────────┘          │   │
│  │                      │                                   │   │
│  │                      ▼                                   │   │
│  │              ┌───────────────┐                          │   │
│  │              │ Route Decision│                          │   │
│  │              │ (Most Specific│                          │   │
│  │              │  Match Wins)  │                          │   │
│  │              └───────┬───────┘                          │   │
│  └──────────────────────┼──────────────────────────────────┘   │
│                         │                                       │
│         ┌───────────────┼───────────────┐                      │
│         │               │               │                      │
│         ▼               ▼               ▼                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│  │ Agent A  │    │ Agent B  │    │ Agent C  │                 │
│  │          │    │          │    │          │                 │
│  │ • Workspace│   │ • Workspace│   │ • Workspace│                │
│  │ • AgentDir │   │ • AgentDir │   │ • AgentDir │                │
│  │ • Sessions │   │ • Sessions │   │ • Sessions │                │
│  │ • Auth     │   │ • Auth     │   │ • Auth     │                │
│  │ • Skills   │   │ • Skills   │   │ • Skills   │                │
│  └──────────┘    └──────────┘    └──────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2.2 "一个代理"的定义

在 OpenClaw 中，一个 **Agent** 是一个完全独立的作用域"大脑"，包含：

| 组件 | 路径 | 说明 |
|------|------|------|
| **Workspace** | `~/.openclaw/workspace-<agentId>` | 文件、AGENTS.md、SOUL.md、USER.md |
| **AgentDir** | `~/.openclaw/agents/<agentId>/agent` | 认证配置、模型注册表、Agent 配置 |
| **Sessions** | `~/.openclaw/agents/<agentId>/sessions` | 聊天历史、路由状态 |
| **Auth Profiles** | `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` | 每 Agent 独立的认证信息 |

**重要原则：** 永远不要跨 Agent 重用 `agentDir`，这会导致认证/会话冲突。

### 4.2.3 路由机制详解

OpenClaw 采用**确定性路由**，遵循"最具体匹配优先"原则：

#### 4.2.3.1 路由优先级（从高到低）

```
1. peer match (精确 DM/群组/频道 ID)
        ↓
2. parentPeer match (线程继承)
        ↓
3. guildId + roles (Discord 角色路由)
        ↓
4. guildId (Discord 服务器)
        ↓
5. teamId (Slack 团队)
        ↓
6. accountId match (频道账户)
        ↓
7. channel-level match (accountId: "*")
        ↓
8. fallback to default agent (`agents.list[].default`)，如果没有设置默认，则使用列表中的第一个 agent，默认为 `main`
```

**规则说明：**
- 优先级从高到低依次为：**peer > parentPeer > guildId+roles > guildId > teamId > accountId > channel > default**
- 同一优先级内，配置文件中**第一个**匹配的规则生效
- 绑定设置多个匹配字段时，所有字段必须同时满足（AND 语义）
- 省略 `accountId` 的绑定仅匹配默认账户
- 使用 `accountId: "*"` 匹配频道内所有账户

#### 4.2.3.2 绑定配置示例

```json5
{
  agents: {
    list: [
      {
        id: "main",
        default: true,
        workspace: "~/.openclaw/workspace",
        agentDir: "~/.openclaw/agents/main/agent"
      },
      {
        id: "work",
        workspace: "~/.openclaw/workspace-work",
        agentDir: "~/.openclaw/agents/work/agent"
      },
      {
        id: "family",
        workspace: "~/.openclaw/workspace-family",
        agentDir: "~/.openclaw/agents/family/agent"
      }
    ]
  },
  
  // 绑定规则（按优先级排序）
  bindings: [
    // 1. 特定 peer 路由（最高优先级）
    {
      agentId: "work",
      match: {
        channel: "whatsapp",
        peer: { kind: "direct", id: "+15551234567" }
      }
    },
    
    // 2. 特定群组路由
    {
      agentId: "family",
      match: {
        channel: "whatsapp",
        peer: { kind: "group", id: "1203630...@g.us" }
      }
    },
    
    // 3. Discord 服务器路由
    {
      agentId: "work",
      match: {
        channel: "discord",
        guildId: "123456789012345678"
      }
    },
    
    // 4. 账户级别路由
    {
      agentId: "work",
      match: {
        channel: "whatsapp",
        accountId: "biz"
      }
    },
    
    // 5. 频道默认路由（最低优先级）
    {
      agentId: "main",
      match: {
        channel: "telegram",
        accountId: "*"
      }
    }
  ]
}
```

### 4.2.4 代理间通信

#### 4.2.4.1 Agent-to-Agent 消息传递

OpenClaw 支持 Agent 之间的显式通信，但默认**关闭**，需要显式启用并配置白名单：

```json5
{
  tools: {
    agentToAgent: {
      enabled: true,           // 启用代理间通信
      allow: ["home", "work"]  // 允许通信的 Agent 白名单
    }
  }
}
```

**使用场景：**
- **任务委托：** 主 Agent 将特定任务委托给专业 Agent
- **信息查询：** 一个 Agent 向另一个 Agent 查询特定领域的知识
- **工作流编排：** 多个 Agent 协作完成复杂业务流程

#### 4.2.4.2 通信流程

```
┌──────────┐                    ┌──────────┐
│ Agent A  │                    │ Agent B  │
│ (主代理)  │                    │ (专业代理)│
└────┬─────┘                    └────┬─────┘
     │                              │
     │  1. Send Message             │
     │  "请分析这段代码的 bug"       │
     │ ────────────────────────────►│
     │                              │
     │                              │ 2. Process
     │                              │    (独立会话)
     │                              │
     │  3. Return Result            │
     │  "发现3个问题..."            │
     │ ◄────────────────────────────│
     │                              │
     │ 4. Continue Task             │
     │    (整合结果)                 │
     ▼                              ▼
```

### 4.2.5 负载均衡与资源管理

#### 4.2.5.1 会话隔离与并发控制

OpenClaw 通过**队列化执行**确保会话一致性：

```
┌─────────────────────────────────────────────────────────────┐
│                  Session Lane System                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Session Key: "agent:main:telegram:user123"                 │
│                                                             │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐      │
│  │ Msg 1  │───►│ Msg 2  │───►│ Msg 3  │───►│ Msg 4  │      │
│  │        │    │        │    │        │    │        │      │
│  │ Queue  │    │ Queue  │    │ Queue  │    │ Queue  │      │
│  └────┬───┘    └────┬───┘    └────┬───┘    └────┬───┘      │
│       │             │             │             │          │
│       └─────────────┴─────────────┴─────────────┘          │
│                         │                                   │
│                         ▼                                   │
│              ┌─────────────────────┐                       │
│              │   Sequential        │                       │
│              │   Execution         │                       │
│              │   (One at a time)   │                       │
│              └─────────────────────┘                       │
│                         │                                   │
│                         ▼                                   │
│              ┌─────────────────────┐                       │
│              │   Session State     │                       │
│              │   Consistency       │                       │
│              └─────────────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键机制：**
- 每个会话键（Session Key）拥有独立的执行队列
- 消息按到达顺序串行处理
- 防止工具/会话竞态条件
- 保持会话历史的一致性

#### 4.2.5.2 队列模式

消息通道可选择不同的队列模式：

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| **collect** | 收集模式，批量处理 | 低频高容量消息 |
| **steer** | 引导模式，允许干预 | 需要人工介入 |
| **followup** | 跟进模式，自动回复 | 标准对话场景 |

### 4.2.6 Per-Agent 沙盒配置

从 v2026.1.6 开始，OpenClaw 支持为每个 Agent 配置独立的沙盒和工具限制，实现更精细的安全隔离：

```json5
{
  agents: {
    list: [
      {
        id: "personal",
        sandbox: { 
          mode: "off"  // 无沙盒限制
        },
        // 无工具限制，可使用所有工具
      },
      {
        id: "family",
        sandbox: {
          mode: "all",           // 启用完整沙盒
          scope: "agent",        // 沙盒作用域
          docker: {
            setupCommand: "apt-get update && apt-get install -y git curl",
            image: "openclaw/sandbox:latest"
          }
        },
        tools: {
          allow: ["read", "memory_search"],  // 白名单
          deny: ["exec", "write", "edit", "browser"]   // 黑名单
        }
      },
      {
        id: "coding",
        sandbox: {
          mode: "all",
          scope: "session"       // 每会话独立沙盒
        },
        tools: {
          policy: {
            exec: { permission: "allow" },     // 允许执行
            write: { permission: "allow" },    // 允许写入
            browser: { permission: "deny" }    // 禁用浏览器
          }
        }
      }
    ]
  }
}
```

**Per-Agent 沙盒配置项：**

| 配置项 | 类型 | 说明 |
|--------|------|------|
| **sandbox.mode** | string | `off` / `read-only` / `all`，沙盒级别 |
| **sandbox.scope** | string | `agent`（Agent 级共享）/ `session`（会话级隔离） |
| **sandbox.docker** | object | Docker 沙盒配置 |
| **tools.allow** | array | 允许的工具列表（白名单模式） |
| **tools.deny** | array | 禁止的工具列表（黑名单模式） |
| **tools.policy** | object | 细粒度工具策略配置 |

**安全隔离层级：**

```
┌─────────────────────────────────────────────────────────────┐
│                    Per-Agent Isolation                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Agent A    │  │  Agent B    │  │  Agent C    │         │
│  │  (personal) │  │  (family)   │  │  (coding)   │         │
│  │             │  │             │  │             │         │
│  │ • No sandbox│  │ • Full      │  │ • Full      │         │
│  │ • All tools │  │   sandbox   │  │   sandbox   │         │
│  │             │  │ • Read-only │  │ • Exec      │         │
│  │             │  │   tools     │  │   allowed   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                │
│         └────────────────┼────────────────┘                │
│                          │                                 │
│                   ┌──────┴──────┐                         │
│                   │  Gateway    │                         │
│                   │  (Shared)   │                         │
│                   └─────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2.7 多平台多账户配置

#### 4.2.6.1 WhatsApp 多号码配置

```json5
{
  agents: {
    list: [
      { id: "home", workspace: "~/.openclaw/workspace-home" },
      { id: "work", workspace: "~/.openclaw/workspace-work" }
    ]
  },
  
  bindings: [
    { agentId: "home", match: { channel: "whatsapp", accountId: "personal" } },
    { agentId: "work", match: { channel: "whatsapp", accountId: "biz" } }
  ],
  
  channels: {
    whatsapp: {
      accounts: {
        personal: { /* 个人号配置 */ },
        biz: { /* 工作号配置 */ }
      }
    }
  }
}
```

**配置命令：**
```bash
# 分别登录两个 WhatsApp 账号
openclaw channels login --channel whatsapp --account personal
openclaw channels login --channel whatsapp --account biz
```

#### 4.2.6.2 Discord 多机器人配置

```json5
{
  agents: {
    list: [
      { id: "main", workspace: "~/.openclaw/workspace-main" },
      { id: "coding", workspace: "~/.openclaw/workspace-coding" }
    ]
  },
  
  bindings: [
    { agentId: "main", match: { channel: "discord", accountId: "default" } },
    { agentId: "coding", match: { channel: "discord", accountId: "coding" } }
  ],
  
  channels: {
    discord: {
      groupPolicy: "allowlist",
      accounts: {
        default: {
          token: "DISCORD_BOT_TOKEN_MAIN",
          guilds: {
            "123456789012345678": {
              channels: {
                "222222222222222222": { allow: true, requireMention: false }
              }
            }
          }
        },
        coding: {
          token: "DISCORD_BOT_TOKEN_CODING",
          guilds: {
            "123456789012345678": {
              channels: {
                "333333333333333333": { allow: true, requireMention: false }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 4.3 技能系统

技能系统（Skills System）是 OpenClaw 扩展能力的核心机制。通过标准化的 SKILL.md 格式，开发者可以为 Agent 添加新的能力，实现与外部工具、API 和服务的集成。

### 4.3.1 技能系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Skills System Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Skill Discovery                       │   │
│  │                                                          │   │
│  │   ┌──────────────┐      ┌──────────────┐               │   │
│  │   │ Local Skills │      │ Global Skills│               │   │
│  │   │              │      │              │               │   │
│  │   │ workspace/   │      │ ~/.openclaw/ │               │   │
│  │   │ skills/      │      │ skills/      │               │   │
│  │   └──────────────┘      └──────────────┘               │   │
│  │            │                   │                       │   │
│  │            └─────────┬─────────┘                       │   │
│  │                      ▼                                  │   │
│  │         ┌────────────────────────┐                     │   │
│  │         │   Skill Registry       │                     │   │
│  │         │   (Loading & Caching)  │                     │   │
│  │         └───────────┬────────────┘                     │   │
│  └─────────────────────┼──────────────────────────────────┘   │
│                        │                                       │
│                        ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Skill Resolution                         │   │
│  │                                                          │   │
│  │   User Query ──► Intent Detection ──► Skill Matching   │   │
│  │                                                          │   │
│  │   • Name matching       • Description similarity        │   │
│  │   • Keyword matching    • Capability matching           │   │
│  │                                                          │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Skill Execution                         │   │
│  │                                                          │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐         │   │
│  │   │ Parse    │───►│ Validate │───►│ Execute  │         │   │
│  │   │ SKILL.md │    │ Params   │    │ Tool     │         │   │
│  │   └──────────┘    └──────────┘    └──────────┘         │   │
│  │                                          │              │   │
│  │                                          ▼              │   │
│  │                              ┌─────────────────────┐    │   │
│  │                              │ Return Result to    │    │   │
│  │                              │ Agent               │    │   │
│  │                              └─────────────────────┘    │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3.2 SKILL.md 格式规范

SKILL.md 是 OpenClaw 技能的标准定义文件，采用 YAML Front Matter + Markdown 的混合格式。

#### 4.3.2.1 完整格式定义

````markdown
---
name: skill-name                    # 技能标识符（必填）
description: "简短描述"            # 技能描述（必填）
homepage: https://example.com      # 技能主页（可选）
metadata:                          # 元数据（可选）
  {
    "openclaw": {
      "emoji": "🔧",               # 技能图标
      "requires": {                # 依赖要求
        "bins": ["gh", "git"],     # 必需的二进制文件
        "env": ["GITHUB_TOKEN"],   # 必需的环境变量
        "node": ">=18.0.0"         # Node.js 版本要求
      },
      "install": [                 # 安装指令
        {
          "id": "brew",
          "kind": "brew",
          "formula": "gh",
          "bins": ["gh"],
          "label": "Install via Homebrew"
        },
        {
          "id": "apt",
          "kind": "apt",
          "package": "gh",
          "bins": ["gh"],
          "label": "Install via apt"
        }
      ],
      "primaryEnv": "GITHUB_TOKEN" # 主环境变量
    }
  }
---

# Skill Name

## When to Use

✅ **使用场景：**
- 场景1的具体描述
- 场景2的具体描述

❌ **不适用场景：**
- 不适用的场景1
- 不适用的场景2

## Usage

### 命令1

```bash
command1 arg1 arg2
```

参数说明：
- `arg1`: 参数1说明
- `arg2`: 参数2说明

### 命令2

```bash
command2 --option value
```

## Examples

### 示例1：xxx

```bash
# 具体命令
command --specific-args
```

### 示例2：yyy

```bash
# 具体命令
command --other-args
```

## Notes

- 注意事项1
- 注意事项2
````

#### 4.3.2.2 字段详解

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| **name** | string | ✅ | 技能唯一标识符，小写字母+连字符 |
| **description** | string | ✅ | 技能功能描述，用于匹配用户意图 |
| **homepage** | string | ❌ | 技能官方主页或文档链接 |
| **user-invocable** | boolean | ❌ | 是否作为用户斜杠命令暴露（默认 `true`） |
| **disable-model-invocation** | boolean | ❌ | 是否从模型提示中排除（默认 `false`） |
| **command-dispatch** | string | ❌ | 设为 `tool` 时斜杠命令直接分派到工具 |
| **command-tool** | string | ❌ | `command-dispatch: tool` 时调用的工具名 |
| **command-arg-mode** | string | ❌ | 参数转发模式，`raw`（默认）转发原始参数字符串 |
| **metadata.openclaw** | object | ❌ | OpenClaw 特定的元数据 |
| **metadata.openclaw.emoji** | string | ❌ | 技能图标，显示在对话中 |
| **metadata.openclaw.requires** | object | ❌ | 依赖要求定义 |
| **metadata.openclaw.requires.bins** | array | ❌ | 必需的可执行文件列表 |
| **metadata.openclaw.requires.env** | array | ❌ | 必需的环境变量列表 |
| **metadata.openclaw.install** | array | ❌ | 自动安装指令 |
| **metadata.openclaw.primaryEnv** | string | ❌ | 主要环境变量名称 |

**字段使用示例：**

```yaml
---
name: github
user-invocable: true              # 用户可用 /github 调用
disable-model-invocation: false   # 模型可以看到此技能
command-dispatch: tool            # 斜杠命令直接分派到工具
command-tool: gh                  # 调用 gh 工具
command-arg-mode: raw             # 原始参数传递
description: "GitHub operations via gh CLI..."
metadata:
  openclaw:
    emoji: "🐙"
    requires:
      bins: ["gh"]
      env: ["GITHUB_TOKEN"]
---
```

#### 4.3.2.3 典型 SKILL.md 示例

**示例1：GitHub Skill**

````markdown
---
name: github
description: "GitHub operations via `gh` CLI: issues, PRs, CI runs, code review, API queries. Use when: (1) checking PR status or CI, (2) creating/commenting on issues, (3) listing/filtering PRs or issues, (4) viewing run logs. NOT for: complex web UI interactions requiring manual browser flows, bulk operations across many repos, or when gh auth is not configured."
metadata:
  {
    "openclaw":
      {
        "emoji": "🐙",
        "requires": { "bins": ["gh"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (brew)",
            },
            {
              "id": "apt",
              "kind": "apt",
              "package": "gh",
              "bins": ["gh"],
              "label": "Install GitHub CLI (apt)",
            },
          ],
      },
  }
---

# GitHub Skill

## When to Use

✅ **USE this skill when:**
- Checking PR status, reviews, or merge readiness
- Viewing CI/workflow run status and logs
- Creating, closing, or commenting on issues
- Creating or merging pull requests

❌ **DON'T use this skill when:**
- Local git operations (commit, push, pull) → use `git` directly
- Non-GitHub repos (GitLab, Bitbucket) → different CLIs
- Cloning repositories → use `git clone`

## Setup

```bash
# Authenticate (one-time)
gh auth login

# Verify
gh auth status
```

## Common Commands

### Pull Requests

```bash
# List PRs
gh pr list --repo owner/repo

# Check CI status
gh pr checks 55 --repo owner/repo

# View PR details
gh pr view 55 --repo owner/repo
```
````

**示例2：Tavily Search Skill**

````markdown
---
name: tavily
description: AI-optimized web search via Tavily API. Returns concise, relevant results for AI agents.
homepage: https://tavily.com
metadata: {"openclaw":{"emoji":"🔍","requires":{"bins":["node"],"env":["TAVILY_API_KEY"]},"primaryEnv":"TAVILY_API_KEY"}}
---

# Tavily Search

AI-optimized web search using Tavily API. Designed for AI agents - returns clean, relevant content.

## Search

```bash
node {baseDir}/scripts/search.mjs "query"
node {baseDir}/scripts/search.mjs "query" -n 10
node {baseDir}/scripts/search.mjs "query" --deep
```

## Options

- `-n <count>`: Number of results (default: 5, max: 20)
- `--deep`: Use advanced search for deeper research
- `--topic <topic>`: Search topic - `general` or `news`

## Extract content from URL

```bash
node {baseDir}/scripts/extract.mjs "https://example.com/article"
```

Notes:
- Needs `TAVILY_API_KEY` from https://tavily.com
- Tavily is optimized for AI - returns clean, relevant snippets
````

### 4.3.3 技能加载机制

#### 4.3.3.1 技能搜索路径

OpenClaw 按以下顺序搜索技能：

```
1. **Workspace skills**: `{workspace}/skills/{skill-name}/SKILL.md` (最高优先级)
2. **Managed/Local skills**: `~/.openclaw/skills/{skill-name}/SKILL.md`
3. **Bundled skills**: `/opt/homebrew/lib/node_modules/openclaw/skills/{skill-name}/SKILL.md` (最低优先级)
```

**注意**: 如果技能名称冲突，优先级高的技能会覆盖优先级低的技能。

#### 4.3.3.2 技能加载流程

```
┌─────────────────────────────────────────────────────────────┐
│                  Skill Loading Pipeline                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. DISCOVERY                                               │
│     ├── Scan workspace/skills/                             │
│     ├── Scan ~/.openclaw/skills/                           │
│     └── Scan built-in skills directory                     │
│                          │                                  │
│                          ▼                                  │
│  2. PARSING                                                 │
│     ├── Read SKILL.md                                      │
│     ├── Parse YAML Front Matter                            │
│     └── Validate metadata schema                           │
│                          │                                  │
│                          ▼                                  │
│  3. RESOLUTION                                              │
│     ├── Check binary dependencies                          │
│     ├── Check environment variables                        │
│     └── Verify tool availability                           │
│                          │                                  │
│                          ▼                                  │
│  4. CACHING                                                 │
│     ├── Create skill snapshot                              │
│     ├── Index for quick lookup                             │
│     └── Store in memory cache                              │
│                          │                                  │
│                          ▼                                  │
│  5. INJECTION                                               │
│     ├── Add to system prompt                               │
│     ├── Register tool handlers                             │
│     └── Make available to agent                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3.4 Token 影响

技能列表注入系统提示会产生一定的 token 开销，了解其计算方式有助于优化 Agent 配置：

**Token 开销计算公式：**

```
total = 195 + Σ (97 + len(name_escaped) + len(description_escaped) + len(location_escaped))
```

**重要说明**:
- XML 转义会增加字符长度：`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&apos;`
- Token 估算基于模型分词器，OpenAI 风格约为 4 字符/token
- 实际开销可能因特殊字符而增加

| 组成部分 | 说明 |
|----------|------|
| **基础开销** | 195 字符（当 ≥1 个技能时） |
| **每个技能** | 97 字符 + 转义后的名称、描述、位置长度 |
| **估算** | 约 97 字符 ≈ 24 tokens（OpenAI 风格） |

**实际示例：**

```
10 个技能约增加：
195 + 10 × (97 + 20 + 50 + 15) = 约 2000 字符 ≈ 500 tokens
```

**优化建议：**
- 保持技能描述简洁，聚焦核心功能
- 使用 `disable-model-invocation: true` 隐藏不需要模型感知的技能
- 定期清理工作区中未使用的技能
- 对于高频场景，考虑合并相关技能

### 4.3.5 社区技能生态

#### 4.3.4.1 ClawHub 技能市场

ClawHub（https://clawhub.com）是 OpenClaw 的官方技能市场，提供技能的发现、安装和发布功能。

**常用命令：**

```bash
# 安装 ClawHub CLI
npm i -g clawhub

# 搜索技能
clawhub search "postgres backups"
clawhub search "github"

# 安装技能
clawhub install my-skill
clawhub install my-skill --version 1.2.3

# 更新技能
clawhub update my-skill
clawhub update --all

# 列出已安装技能
clawhub list

# 发布技能
clawhub publish ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --version 1.2.0 \
  --changelog "Fixes + docs"
```

#### 4.3.4.2 技能分类

| 类别 | 说明 | 示例 |
|------|------|------|
| **开发工具** | 代码管理、CI/CD | github, coding-agent, gh-issues |
| **生产力** | 笔记、任务、日历 | apple-notes, apple-reminders, things-mac |
| **通信** | 消息、邮件、通话 | imsg, himalaya, discord |
| **媒体** | 图片、视频、音频 | songsee, video-frames, gifgrep |
| **智能家居** | 设备控制 | openhue, eightctl, sonoscli |
| **搜索** | 信息检索 | tavily, web_search, web_fetch |

### 4.3.5 自定义技能开发

#### 4.3.5.1 开发流程

```
┌─────────────────────────────────────────────────────────────┐
│                 Custom Skill Development                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. PLAN                                                    │
│     └── Define skill scope and use cases                   │
│                          │                                  │
│                          ▼                                  │
│  2. STRUCTURE                                               │
│     └── Create skill directory structure                   │
│         my-skill/                                          │
│         ├── SKILL.md                                       │
│         ├── scripts/                                       │
│         └── README.md                                      │
│                          │                                  │
│                          ▼                                  │
│  3. IMPLEMENT                                               │
│     └── Write SKILL.md with:                               │
│         - Clear description                                │
│         - Usage examples                                   │
│         - Setup instructions                               │
│                          │                                  │
│                          ▼                                  │
│  4. TEST                                                    │
│     └── Validate skill functionality                       │
│         - Test in local workspace                          │
│         - Verify all examples work                         │
│                          │                                  │
│                          ▼                                  │
│  5. PUBLISH (Optional)                                      │
│     └── Share with community                               │
│         - Publish to ClawHub                               │
│         - Share on Discord                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.3.5.2 技能目录结构

```
my-skill/
├── SKILL.md              # 技能定义文件（必需）
├── README.md             # 详细文档（可选）
├── scripts/              # 辅助脚本（可选）
│   ├── search.mjs
│   └── extract.mjs
├── assets/               # 静态资源（可选）
│   └── icon.png
└── examples/             # 示例文件（可选）
    └── example1.md
```

#### 4.3.5.3 开发最佳实践

**1. 描述清晰具体**
```yaml
# ✅ 好的描述
"GitHub operations via `gh` CLI: issues, PRs, CI runs. Use when checking PR status, creating issues. NOT for local git operations."

# ❌ 差的描述
"A skill for GitHub"
```

**2. 提供完整示例**
````markdown
## Examples

### List open issues

```bash
gh issue list --repo owner/repo --state open
```

### Check PR CI status

```bash
gh pr checks 42 --repo owner/repo
```
````

**3. 明确边界条件**
````markdown
## When to Use

✅ **USE when:**
- Checking PR status or CI
- Creating/commenting on issues

❌ **DON'T use when:**
- Local git operations → use `git` directly
- Non-GitHub repos
````

**4. 声明依赖关系**
```yaml
metadata:
  openclaw:
    requires:
      bins: ["gh", "jq"]           # 必需命令
      env: ["GITHUB_TOKEN"]        # 必需环境变量
      node: ">=18.0.0"             # Node 版本
```

---

## 4.4 安全与权限

安全是 OpenClaw 设计的核心考量。系统通过多层次的安全机制，确保 Agent 在执行任务时既能充分发挥能力，又不会造成意外的安全风险。

### 4.4.1 安全架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Policy Layers                           │   │
│  │                                                          │   │
│  │   Layer 1: Global Config          ~/.openclaw/          │   │
│  │   Layer 2: Agent Config           per-agent             │   │
│  │   Layer 3: Tool Policy            per-tool              │   │
│  │   Layer 4: Provider Policy        per-LLM               │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Protection Mechanisms                   │   │
│  │                                                          │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │   │   Sandbox    │  │  Allowlist   │  │ Confirmation │ │   │
│  │   │   Mode       │  │   Access     │  │   Required   │ │   │
│  │   │              │  │   Control    │  │              │ │   │
│  │   │ • File       │  │              │  │ • Destructive│ │   │
│  │   │   system     │  │ • Peer       │  │   ops        │ │   │
│  │   │ • Network    │  │   allowlist  │  │ • External   │ │   │
│  │   │ • Execution  │  │ • Channel    │  │   sends      │ │   │
│  │   │              │  │   policy     │  │ • Large      │ │   │
│  │   │              │  │              │  │   transfers  │ │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘ │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Audit & Monitoring                      │   │
│  │                                                          │   │
│  │   • Session Logging         • Tool Call Traces          │   │
│  │   • Message History         • Error Tracking            │   │
│  │   • Configuration Changes   • Access Attempts           │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4.2 工具权限控制

#### 4.4.2.1 工具策略配置

OpenClaw 允许在多个层级配置工具权限：

```json5
{
  // Layer 1: Global defaults
  tools: {
    defaults: {
      permission: "allow",           // 默认允许所有工具
      dangerousPermission: "confirm" // 危险操作需要确认
    },
    
    // Layer 3: Per-tool policy
    policy: {
      // 完全禁用某些工具
      exec: { permission: "deny" },
      process: { permission: "deny" },
      
      // 特定工具配置
      browser: {
        permission: "allow",
        dangerousPermission: "confirm",
        options: {
          allowedDomains: ["*.github.com", "*.openclaw.ai"]
        }
      },
      
      file: {
        permission: "allow",
        dangerousPermission: "confirm",
        options: {
          allowOutsideWorkspace: false
        }
      }
    }
  },
  
  // Layer 2: Per-agent override
  agents: {
    list: [
      {
        id: "coding",
        tools: {
          policy: {
            exec: { permission: "allow" }  // coding agent 允许 exec
          }
        }
      }
    ]
  }
}
```

**权限级别：**

| 级别 | 说明 | 适用场景 |
|------|------|----------|
| **allow** | 允许使用 | 安全工具（如 read、search） |
| **confirm** | 需要确认 | 危险操作（如 delete、exec） |
| **deny** | 完全禁用 | 高风险工具（如 rm -rf） |

#### 4.4.2.2 危险操作定义

以下操作被视为危险操作，默认需要确认：

```typescript
// 源码参考: src/tools/policy.ts
const DANGEROUS_OPERATIONS = [
  // 文件系统
  { tool: 'write', path: '/etc/*' },           // 写入系统目录
  { tool: 'edit', pathMatches: /\.env$/ },     // 编辑环境文件
  { tool: 'delete', recursive: true },          // 递归删除
  
  // 执行
  { tool: 'exec', command: /rm\s+.*-rf?/ },     // 强制删除
  { tool: 'exec', command: /sudo/ },            // 提权执行
  { tool: 'exec', command: /curl.*\|.*sh/ },    // 管道执行远程脚本
  
  // 网络
  { tool: 'fetch', protocol: 'http' },          // 非安全协议
  { tool: 'message', bulk: true },              // 批量消息发送
  
  // 系统
  { tool: 'process', action: 'kill' },          // 终止进程
];
```

### 4.4.3 敏感操作确认机制

#### 4.4.3.1 确认流程

```
┌─────────────────────────────────────────────────────────────┐
│               Sensitive Operation Confirmation              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Agent 请求执行危险操作                                     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Detect Dangerous Operation                       │   │
│  │                                                     │   │
│  │   Tool: exec                                        │   │
│  │   Command: "rm -rf /important/data"                │   │
│  │   Risk Level: HIGH                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 2. Pause Execution                                  │   │
│  │                                                     │   │
│  │   Status: WAITING_FOR_CONFIRMATION                  │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 3. Present to User                                  │   │
│  │                                                     │   │
│  │   ⚠️ 敏感操作需要确认                                │   │
│  │                                                     │   │
│  │   操作: 删除目录                                     │   │
│  │   路径: /important/data                             │   │
│  │   命令: rm -rf /important/data                      │   │
│  │                                                     │   │
│  │   [确认执行]  [取消]  [修改命令]                     │   │
│  └─────────────────────────────────────────────────────┘   │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 4. User Decision                                    │   │
│  │                                                     │   │
│  │   Option A: Confirm ──► Execute & Log              │   │
│  │   Option B: Cancel ───► Abort & Return Error       │   │
│  │   Option C: Modify ───► Update Command & Re-eval   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 4.4.3.2 配置确认行为

```json5
{
  tools: {
    defaults: {
      // 危险操作确认方式
      dangerousPermission: "confirm",  // confirm / allow / deny
      
      // 确认超时设置
      confirmationTimeout: "5m",
      
      // 批量确认阈值
      bulkConfirmationThreshold: 10
    }
  }
}
```

### 4.4.4 沙盒模式

#### 4.4.4.1 沙盒级别

OpenClaw 提供可选的沙盒来限制 Agent 权限：

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",  // "off" | "non-main" | "all"
        scope: "session",   // "session" | "agent" | "shared"
        workspaceAccess: "none"  // "none" | "ro" | "rw"
      }
    }
  }
}
```

**沙盒模式说明：**

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `"off"` | 不启用沙盒 | 完全信任环境 |
| `"non-main"` | 仅对非主会话启用沙盒（默认） | 日常聊天在主会话，其他会话沙盒化 |
| `"all"` | 所有会话都在沙盒中运行 | 高安全要求环境 |

**沙盒级别对比：**

| 级别 | 文件系统 | 网络 | 执行命令 | 适用场景 |
|------|----------|------|----------|----------|
| **off** | 无限制 | 无限制 | 无限制 | 完全信任环境 |
| **non-main** | 非主会话限制 | 非主会话限制 | 非主会话限制 | 日常开发（推荐） |
| **all** | 完全限制 | 完全限制 | 完全限制 | 高风险环境 |

#### 4.4.4.2 工作区隔离

每个 Agent 拥有独立的工作区，默认作为当前工作目录：

```
~/.openclaw/
├── workspace/              # 默认 Agent 工作区
│   ├── skills/            # Agent 专属技能
│   ├── memory/            # Agent 记忆文件
│   ├── AGENTS.md          # Agent 行为规范
│   ├── SOUL.md            # Agent 身份定义
│   └── USER.md            # 用户信息
│
├── workspace-work/        # "work" Agent 工作区
│   ├── skills/
│   └── ...
│
└── workspace-family/      # "family" Agent 工作区
    ├── skills/
    └── ...
```

**注意：** 相对路径在工作区内解析，但绝对路径可访问主机其他位置，除非启用沙盒。

### 4.4.5 访问控制

#### 4.4.5.1 配对机制（Pairing）

DM（私信）安全通过配对机制控制：

```json5
{
  channels: {
    telegram: {
      dmPolicy: "pairing",        // pairing / allowlist / allowall
      
      // 配对模式：需要用户先发消息才能回复
      // 适合：公共机器人，防止垃圾消息
    },
    
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+15551230001", "+15551230002"],
      
      // 白名单模式：只允许特定联系人
      // 适合：私人助理，限制访问范围
    }
  }
}
```

**DM 策略类型：**

| 策略 | 行为 | 安全级别 |
|------|------|----------|
| **pairing** | 用户先发消息后 Agent 才能回复 | 高 |
| **allowlist** | 仅白名单中的用户可以交互 | 很高 |
| **allowall** | 允许所有用户（不推荐用于生产） | 低 |

#### 4.4.5.2 DM 会话隔离（dmScope）

OpenClaw 支持通过 `dmScope` 配置控制私信会话的隔离级别，平衡安全性与连续性：

```json5
{
  session: {
    dmScope: "per-channel-peer"  // 或 "per-account-channel-peer" / "main"
  }
}
```

**dmScope 模式详解：**

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `"main"`（默认） | 所有 DM 共享一个主会话，保持长期连续性 | 个人助理，需要记忆历史对话 |
| `"per-channel-peer"` | 每个 channel + sender 组合拥有独立会话 | 安全 DM 模式，隔离不同来源的对话 |
| `"per-account-channel-peer"` | 多账户场景下，每个账户的 channel + sender 独立 | 多账号托管，严格隔离 |

**会话键格式：**

```
模式: "main"
键格式: agent:<agentId>:<mainKey>
示例: agent:main:telegram:user123

模式: "per-channel-peer"
键格式: agent:<agentId>:<channel>:<peer>
示例: agent:main:telegram:direct:user123

模式: "per-account-channel-peer"
键格式: agent:<agentId>:<account>:<channel>:<peer>
示例: agent:main:biz:telegram:direct:user123
```

**安全性对比：**

```
┌─────────────────────────────────────────────────────────────┐
│  DM Session Isolation Levels                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  main (低隔离)                                              │
│  ┌─────────────────────────────────────────────┐           │
│  │  User A  ◄───── 同一个会话 ─────►  User B   │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  per-channel-peer (中隔离)                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ User A -    │    │ User B -    │    │ User C -    │     │
│  │ Session 1   │    │ Session 2   │    │ Session 3   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                             │
│  per-account-channel-peer (高隔离)                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Acc1-U1  │ │Acc1-U2  │ │Acc2-U1  │ │Acc2-U3  │           │
│  │Session1 │ │Session2 │ │Session3 │ │Session4 │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**配置建议：**
- **个人使用**：`"main"` 保持对话连续性
- **公共服务**：`"per-channel-peer"` 隔离不同用户
- **多账号企业场景**：`"per-account-channel-peer"` 实现严格隔离

#### 4.4.5.3 群组访问控制

```json5
{
  channels: {
    discord: {
      groupPolicy: "allowlist",    // allowlist / denylist / allowall
      
      guilds: {
        "123456789012345678": {
          channels: {
            "222222222222222222": {
              allow: true,
              requireMention: true,  // 需要 @机器人
              allowedRoles: ["admin", "moderator"]
            }
          }
        }
      }
    }
  }
}
```

### 4.4.6 审计日志

#### 4.4.6.1 日志内容

OpenClaw 记录以下安全相关事件：

| 事件类型 | 记录内容 | 存储位置 |
|----------|----------|----------|
| **会话事件** | 会话创建、激活、关闭、异常 | `~/.openclaw/agents/<id>/sessions/` |
| **工具调用** | 工具名称、参数、结果、执行时间 | 会话历史 |
| **消息事件** | 发送/接收的消息元数据（不含内容） | 会话历史 |
| **配置变更** | 配置文件修改、权限变更 | 系统日志 |
| **安全事件** | 确认操作、权限拒绝、异常访问 | 审计日志 |

#### 4.4.6.2 日志格式

```json
{
  "timestamp": "2026-02-27T10:30:00Z",
  "level": "info",
  "event": "tool.execution",
  "agentId": "main",
  "sessionId": "sess_abc123",
  "tool": "exec",
  "params": {
    "command": "ls -la",
    "workdir": "/home/user/project"
  },
  "result": {
    "exitCode": 0,
    "duration": 150
  },
  "confirmation": {
    "required": false,
    "granted": null
  }
}
```

#### 4.4.6.3 会话历史查看

```bash
# 查看会话列表
openclaw sessions list

# 查看特定会话历史
openclaw sessions log <session-id>

# 导出会话为 JSONL
openclaw sessions export <session-id> --format jsonl
```

### 4.4.7 安全最佳实践

#### 4.4.7.1 配置检查清单

```markdown
## OpenClaw 安全配置检查清单

### 基础安全
- [ ] 启用沙盒模式 (`sandbox.enabled: true`)
- [ ] 配置 DM 配对或白名单 (`dmPolicy: "pairing"` 或 `"allowlist"`)
- [ ] 限制群组访问 (`groupPolicy: "allowlist"`)
- [ ] 禁用不需要的工具（如 `exec: { permission: "deny" }`）

### 数据保护
- [ ] 使用只读 API 密钥
- [ ] 敏感配置使用环境变量而非硬编码
- [ ] 定期备份 `~/.openclaw/` 目录
- [ ] 加密存储认证信息

### 监控审计
- [ ] 启用详细日志记录
- [ ] 定期检查会话历史
- [ ] 监控异常工具调用模式
- [ ] 配置告警机制

### 更新维护
- [ ] 保持 OpenClaw 为最新版本
- [ ] 定期审查技能权限
- [ ] 检查依赖项安全更新
```

#### 4.4.7.2 生产环境推荐配置

```json5
{
  // 安全沙盒
  sandbox: {
    enabled: true,
    mode: "limited",
    allowPaths: ["~/.openclaw/workspace"],
    denyPaths: ["/etc", "/usr", "/var", "~/.ssh"],
    network: "limited",
    exec: "sandboxed"
  },
  
  // 工具策略
  tools: {
    defaults: {
      permission: "allow",
      dangerousPermission: "confirm"
    },
    policy: {
      exec: { permission: "deny" },
      process: { permission: "deny" },
      write: {
        permission: "allow",
        options: { allowOutsideWorkspace: false }
      }
    }
  },
  
  // 通道安全
  channels: {
    telegram: {
      dmPolicy: "pairing"
    },
    discord: {
      groupPolicy: "allowlist",
      requireMention: true
    }
  },
  
  // 审计
  logging: {
    level: "info",
    audit: {
      enabled: true,
      retentionDays: 90
    }
  }
}
```

---

## 4.5 本章小结

本章深入剖析了 OpenClaw 的四大核心功能系统：

### 内存系统
- **文件即真相**的设计理念，所有记忆以 Markdown 格式持久化
- **双层级架构**：每日日志（短期）+ MEMORY.md（长期）
- **向量搜索**支持语义检索，使用余弦相似度计算
- **QMD 后端**提供 BM25 + 向量 + 重排序的高级检索能力
- **自动压缩**机制在上下文过长前触发记忆刷新

### 多代理系统
- **完全隔离**的 Agent 架构，每个 Agent 拥有独立工作区、认证和会话
- **确定性路由**遵循最具体匹配优先原则
- **队列化执行**确保会话一致性和并发安全
- **Agent-to-Agent 通信**支持任务委托和工作流编排
- **多平台多账户**配置实现一个 Gateway 托管多个号码/机器人

### 技能系统
- **SKILL.md** 标准格式，结合 YAML Front Matter 和 Markdown
- **三级搜索路径**：工作区技能 → 全局技能 → 内置技能
- **ClawHub 市场**提供技能的发现、安装和发布
- **自动依赖检查**支持二进制、环境变量和 Node 版本
- **自定义开发**遵循规划→实现→测试→发布的流程

### 安全与权限
- **四层策略**：全局 → Agent → 工具 → 提供商
- **沙盒模式**支持 limited/strict/none 三级隔离
- **敏感操作确认**机制保护危险操作
- **配对和白名单**控制 DM 访问
- **审计日志**记录所有安全相关事件

这些核心功能共同构成了 OpenClaw 强大而灵活的平台能力，使其既能满足个人用户的日常需求，也能支撑企业级的复杂应用场景。

---

## 参考来源

1. **官方文档**
   - Memory System: https://docs.openclaw.ai/concepts/memory
   - Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
   - Agent Loop: https://docs.openclaw.ai/concepts/agent-loop
   - Getting Started: https://docs.openclaw.ai/start/getting-started

2. **GitHub 源码**
   - 技能系统: https://github.com/openclaw/openclaw/tree/main/src/skills
   - 内存实现: https://github.com/openclaw/openclaw/tree/main/src/memory
   - 多代理路由: https://github.com/openclaw/openclaw/tree/main/src/agent

3. **技能市场**
   - ClawHub: https://clawhub.com

4. **本地安装**
   - 内置技能路径: `/opt/homebrew/lib/node_modules/openclaw/skills/`
   - 用户配置路径: `~/.openclaw/openclaw.json`
