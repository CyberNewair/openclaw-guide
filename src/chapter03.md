# 第3章 OpenClaw 工作原理

本章深入剖析 OpenClaw 的内部工作机制，揭示其如何思考、记忆、行动。理解这些原理对于充分发挥 OpenClaw 的潜力至关重要。

## 3.1 Agent Loop 详解

Agent Loop 是 OpenClaw 的核心执行引擎，它定义了从接收用户输入到生成响应的完整流程。这是一个持续迭代的循环，使 Agent 能够感知环境、做出决策、执行动作并观察结果。

### 3.1.1 Agent Loop 概述

Agent Loop（智能体循环）是 OpenClaw 的"心跳"，它将消息转化为行动和最终响应，同时保持会话状态的一致性。每一次循环运行称为一个"回合"（turn），包含从用户输入到系统响应的完整处理流程[^agent-loop]。

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Loop 概览                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  输入    │───→│  上下文  │───→│  LLM推理 │───→│  决策    │  │
│  │  接收    │    │  组装    │    │  生成    │    │  执行    │  │
│  └──────────┘    └──────────┘    └──────────┘    └────┬─────┘  │
│       ↑                                               │        │
│       └───────────────────────────────────────────────┘        │
│                      观察结果反馈                               │
└─────────────────────────────────────────────────────────────────┘
```

Agent Loop 的核心特征：

- **序列化执行**：每个会话（session）的循环是序列化的，避免工具/会话竞态，保持会话历史一致性[^agent-loop]
- **事件驱动**：通过生命周期事件和流事件（stream events）与外部通信
- **状态持久化**：会话状态在每次循环后被保存，支持长对话历史
- **可中断性**：支持通过 abort 信号、超时或用户指令中断当前执行

### 3.1.2 Agent Loop 8 步骤完整流程

根据 OpenClaw 官方文档，Agent Loop 可分为以下 8 个关键步骤[^agent-loop]：

#### 步骤 1：RPC 调用与参数验证

当用户通过任何渠道（WhatsApp、Telegram、CLI 等）发送消息时，Gateway 接收请求并触发 `agent` RPC。

```typescript
// 概念示例：RPC 入口点
// 注意：此为示意代码，非 OpenClaw 实际源码

interface AgentRPCParams {
  message: string;           // 用户输入
  sessionKey?: string;       // 会话标识
  sessionId?: string;        // 可选：指定会话ID
  model?: string;            // 可选：模型覆盖
  thinking?: string;         // 可选：思考级别
  timeoutMs?: number;        // 可选：超时时间
}

// RPC 返回立即响应，包含 runId 和 acceptedAt
interface AgentRPCResponse {
  runId: string;             // 本次运行的唯一标识
  acceptedAt: number;        // 接受时间戳
}
```

此阶段执行的操作：
1. 验证传入参数的合法性
2. 解析会话标识（sessionKey 或 sessionId）
3. 持久化会话元数据
4. 立即返回 `{ runId, acceptedAt }`，不等待实际执行完成

#### 步骤 2：会话与工作区准备

在 `agentCommand` 函数中，OpenClaw 准备执行环境：

```typescript
// 概念示例：会话准备流程
// 注意：此为示意代码，非 OpenClaw 实际源码

async function agentCommand(params: AgentRPCParams) {
  // 1. 解析模型和默认配置
  const model = await resolveModel(params.model);
  const thinking = params.thinking ?? defaults.thinking;
  
  // 2. 加载技能快照
  const skillsSnapshot = await loadSkillsSnapshot();
  
  // 3. 解析工作区路径
  const workspace = resolveWorkspace(params.sessionKey);
  
  // 4. 获取会话写入锁
  const sessionLock = await acquireSessionLock(sessionKey);
  
  // 5. 准备 SessionManager
  const sessionManager = await openSession(sessionKey);
  
  // 6. 调用核心运行时
  return runEmbeddedPiAgent({
    model,
    thinking,
    skillsSnapshot,
    sessionManager,
    workspace,
    // ... 其他参数
  });
}
```

关键准备任务：
- **模型解析**：确定使用的 LLM 模型及其配置
- **技能加载**：加载当前可用的技能（Skills）快照
- **工作区解析**：确定文件操作的根目录
- **会话锁定**：获取写入锁，确保序列化执行
- **沙盒配置**：如启用沙盒，重定向到沙盒工作区

#### 步骤 3：队列与并发控制

OpenClaw 通过队列系统管理并发执行：

```typescript
// 概念示例：队列管理
// 注意：此为示意代码，非 OpenClaw 实际源码

async function runEmbeddedPiAgent(params: RunParams) {
  // 1. 通过 per-session 队列序列化
  const sessionLane = `session:${params.sessionKey}`;
  
  // 2. 通过 global 队列限制总体并发
  const globalLane = 'main'; // 或 'subagent' 对于子代理
  
  // 3. 排队等待执行
  return queue.enqueue({
    lanes: [sessionLane, globalLane],
    task: async () => {
      return executeAgentLoop(params);
    },
  });
}
```

队列特性：
- **Per-session 队列**：确保同一会话只有一个活跃运行
- **Global 队列**：通过 `agents.defaults.maxConcurrent` 限制总体并发数
- **Lane 系统**：支持不同优先级的执行通道（main, cron, subagent）[^queue]

#### 步骤 4：Prompt 组装与系统提示词构建

OpenClaw 为每次运行构建自定义系统提示词（System Prompt），该提示词包含：

```
┌────────────────────────────────────────────────────────────┐
│                  系统提示词结构                             │
├────────────────────────────────────────────────────────────┤
│ 1. Tooling（工具列表）                                      │
│    - 当前可用工具列表及简短描述                             │
│                                                            │
│ 2. Safety（安全提示）                                       │
│    - 避免权力寻求行为的简短提醒                             │
│                                                            │
│ 3. Skills（技能说明，如可用）                               │
│    - 技能名称、描述和位置                                   │
│                                                            │
│ 4. OpenClaw Self-Update                                     │
│    - 如何运行 config.apply 和 update.run                   │
│                                                            │
│ 5. Workspace（工作区）                                      │
│    - 工作目录路径                                           │
│                                                            │
│ 6. Documentation（文档位置）                                │
│    - 本地 OpenClaw 文档路径                                 │
│                                                            │
│ 7. Workspace Files（注入的上下文文件）                      │
│    - AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md    │
│                                                            │
│ 8. Sandbox（如启用）                                        │
│    - 沙盒路径和提升执行权限信息                             │
│                                                            │
│ 9. Current Date & Time                                      │
│    - 用户本地时间、时区                                     │
│                                                            │
│ 10. Reply Tags（可选）                                      │
│    - 回复标签语法说明                                       │
│                                                            │
│ 11. Heartbeats（心跳）                                      │
│    - 心跳提示和确认行为                                     │
│                                                            │
│ 12. Runtime（运行时信息）                                   │
│    - host, OS, node, model, repo, thinking level           │
│                                                            │
│ 13. Reasoning（推理）                                       │
│    - 推理可见性级别 + /reasoning 切换提示                  │
└────────────────────────────────────────────────────────────┘
```

系统提示词构建的关键代码逻辑：

```typescript
// 概念示例：系统提示词构建
// 注意：此为示意代码，非 OpenClaw 实际源码

function buildSystemPrompt(context: BuildContext): string {
  const sections: string[] = [];
  
  // 1. 工具列表
  sections.push(formatToolList(availableTools));
  
  // 2. 安全提示
  sections.push(SAFETY_GUARDrails);
  
  // 3. 技能列表（如可用）
  if (skills.length > 0) {
    sections.push(formatSkillsForPrompt(skills));
  }
  
  // 4. 自更新说明
  sections.push(SELF_UPDATE_INSTRUCTIONS);
  
  // 5. 工作区信息
  sections.push(`Workspace: ${workspacePath}`);
  
  // 6. 文档位置
  sections.push(`Docs: ${docsPath}`);
  
  // 7. 注入的引导文件
  sections.push('## Workspace Files (injected)');
  for (const file of bootstrapFiles) {
    sections.push(`### ${file.name}`);
    sections.push(file.content);
  }
  
  // 8. 沙盒信息
  if (sandbox.enabled) {
    sections.push(`Sandbox: ${sandbox.path}`);
  }
  
  // 9. 时间信息
  sections.push(`Current Date & Time: ${formatDateTime(timezone)}`);
  
  // 10. 回复标签（如启用）
  if (replyTags.enabled) {
    sections.push(formatReplyTagsHelp());
  }
  
  // 11. 心跳提示
  sections.push(HEARTBEAT_INSTRUCTIONS);
  
  // 12. 运行时信息
  sections.push(formatRuntimeInfo(runtime));
  
  // 13. 推理说明
  sections.push(formatReasoningHelp(thinkingLevel));
  
  return sections.join('\n\n');
}
```

模型特定的限制和压缩预留 token 在此阶段被强制执行[^system-prompt]。

#### Prompt Modes（提示词模式）

OpenClaw 支持三种系统提示词模式，用于不同场景[^system-prompt]：

| 模式 | 说明 | 使用场景 |
|------|------|----------|
| `full`（默认） | 包含所有部分：工具、技能、内存召回、自更新等 | 标准会话 |
| `minimal` | 省略 Skills、Memory Recall、Self-Update 等部分 | 子代理，减少上下文开销 |
| `none` | 仅返回基础身份行 | 特殊用途，最小化提示词 |

配置方式：

```json5
// 标准JSON配置: openclaw.json
{
  agents: {
    defaults: {
      systemPromptMode: 'full',  // full | minimal | none
    },
  },
}
```

子代理默认使用 `minimal` 模式以减少上下文占用，主会话默认使用 `full` 模式以获得完整功能。

#### 步骤 5：LLM 推理与流事件处理

```
┌────────────────────────────────────────────────────────────┐
│                  LLM 推理流程                               │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  OpenClaw Gateway                                          │
│       │                                                    │
│       ▼                                                    │
│  ┌─────────────┐    WebSocket/SSE    ┌─────────────┐     │
│  │ pi-agent-   │ ◄─────────────────► │   LLM       │     │
│  │ core runtime│     流式事件         │   Provider  │     │
│  └──────┬──────┘                     └─────────────┘     │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  流式事件类型                         │  │
│  │  • assistant_delta  - 助手输出片段                   │  │
│  │  • tool_start       - 工具调用开始                   │  │
│  │  • tool_end         - 工具调用完成                   │  │
│  │  • lifecycle_start  - 运行生命周期开始               │  │
│  │  • lifecycle_end    - 运行生命周期结束               │  │
│  │  • lifecycle_error  - 运行错误                       │  │
│  │  • compaction       - 上下文压缩事件                 │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

`subscribeEmbeddedPiSession` 函数将 pi-agent-core 事件桥接到 OpenClaw 的 agent 流：

- **Tool 事件** → `stream: "tool"`
- **Assistant deltas** → `stream: "assistant"`
- **Lifecycle 事件** → `stream: "lifecycle"` (`phase: "start" | "end" | "error"`)

#### 步骤 6：工具调用执行

当 LLM 决定调用工具时，执行流程如下：

```typescript
// 概念示例：工具调用处理
// 注意：此为示意代码，非 OpenClaw 实际源码

async function executeToolCall(
  toolCall: ToolCall,
  context: ExecutionContext
): Promise<ToolResult> {
  // 1. 查找工具处理器
  const handler = toolRegistry.get(toolCall.name);
  if (!handler) {
    throw new ToolNotFoundError(toolCall.name);
  }
  
  // 2. 权限检查
  await checkToolPolicy(toolCall, context);
  
  // 3. 执行前钩子
  await runHook('before_tool_call', { toolCall, context });
  
  // 4. 执行工具
  const result = await handler.execute(toolCall.params);
  
  // 5. 执行后钩子
  await runHook('after_tool_call', { toolCall, result, context });
  
  // 6. 结果处理（大小限制、图片负载清理）
  const sanitizedResult = sanitizeToolResult(result);
  
  // 7. 持久化工具结果
  await persistToolResult(toolCall, sanitizedResult, context);
  
  return sanitizedResult;
}
```

工具执行的关键特性：
- **权限控制**：根据 `tools.deny`、`tools.allow` 和 `tools.policy` 进行访问控制
- **钩子系统**：支持 `before_tool_call` 和 `after_tool_call` 钩子
- **结果清理**：对大型输出和图片负载进行大小限制
- **消息工具追踪**：追踪消息发送工具以避免重复确认

#### 步骤 7：上下文管理与压缩

当会话接近或超过模型上下文窗口时，OpenClaw 触发自动压缩。

**压缩策略说明：**

OpenClaw 采用**滑动窗口 + 摘要压缩**的混合策略：

1. **保留最近消息**：始终保留最近 N 条消息（默认约 6-10 条）不压缩，确保短期上下文完整
2. **摘要压缩**：对较早的消息历史生成文本摘要，替代原始消息
3. **压缩率**：通常将旧消息压缩至原 Token 数量的 10-30%

**摘要策略详情：**

| 策略类型 | 描述 | 适用场景 |
|---------|------|---------|
| **完整摘要** | 对整个历史生成单一段落摘要 | 历史较短时 |
| **分段摘要** | 将历史分段，每段生成独立摘要 | 历史较长时 |
| **分层摘要** | 已有摘要再次被摘要，形成层级 | 极长会话 |

**压缩触发条件（精确描述）：**

OpenClaw 区分两种压缩触发机制：

1. **自动压缩触发**：当会话 token 数接近或超过模型上下文窗口时触发
   - 触发条件：`contextTokens > contextWindow - reserveTokensFloor`

2. **预压缩内存刷新触发**：在自动压缩前触发记忆保存
   - 触发条件：`contextTokens > contextWindow - reserveTokensFloor - softThresholdTokens`
   - 默认 `softThresholdTokens` 为 4000 tokens
   - 这是软阈值，用于提前触发记忆刷新

**压缩率参考数据：**

| 原始历史长度 | 摘要后长度 | 压缩率 |
|-------------|-----------|--------|
| 50 条消息 (~10K tokens) | ~1K tokens | 90% |
| 100 条消息 (~25K tokens) | ~2.5K tokens | 90% |
| 200 条消息 (~60K tokens) | ~6K tokens | 90% |

**注**：压缩率受内容复杂度影响，实际范围在 85-95% 之间。

```
┌────────────────────────────────────────────────────────────┐
│                  上下文压缩流程                             │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  原始会话历史                                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Msg 1 │ Msg 2 │ Msg 3 │ ... │ Msg N-2 │ Msg N-1   │  │
│  │(最早) │       │       │     │         │ (最新)    │  │
│  └─────────────────────────────────────────────────────┘  │
│                    │                                       │
│                    ▼                                       │
│  触发条件：contextTokens > contextWindow - reserveTokens   │
│                    │                                       │
│                    ▼                                       │
│  压缩后历史                                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ [压缩摘要] │ Msg N-2 │ Msg N-1                      │  │
│  │ (概括旧消息)│ (保留最近消息)                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  压缩摘要以 compaction 类型条目持久化到 JSONL              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

压缩配置：

```json5
// 标准JSON配置: openclaw.json
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,  // 预留 token 下限
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.",
        },
      },
    },
  },
}
```

预压缩内存刷新（memory flush）是 OpenClaw 的重要特性：在自动压缩前，系统会触发一个无声的代理回合，提醒模型将持久记忆写入磁盘，防止关键上下文被压缩丢失[^memory][^session-management-compaction]。

#### 步骤 8：响应组装与输出

最后阶段将执行结果组装为最终响应：

```typescript
// 概念示例：响应组装
// 注意：此为示意代码，非 OpenClaw 实际源码

function assembleReply(context: AssemblyContext): ReplyPayload[] {
  const payloads: ReplyPayload[] = [];
  
  // 1. 添加助手文本（和可选推理）
  if (assistantText) {
    payloads.push({
      type: 'text',
      content: assistantText,
    });
  }
  
  // 2. 添加内联工具摘要（verbose 模式）
  if (verbose && toolSummaries.length > 0) {
    payloads.push(...formatToolSummaries(toolSummaries));
  }
  
  // 3. 添加助手错误文本（如发生错误）
  if (assistantError) {
    payloads.push({
      type: 'error',
      content: assistantError,
    });
  }
  
  // 4. 过滤 NO_REPLY
  const filtered = payloads.filter(p => !isNoReplyToken(p.content));
  
  // 5. 去重消息工具结果
  const deduplicated = deduplicateMessagingResults(filtered);
  
  // 6. 如无可渲染内容且工具出错，发送回退错误响应
  if (deduplicated.length === 0 && toolErrors.length > 0) {
    return [createFallbackErrorReply(toolErrors)];
  }
  
  return deduplicated;
}
```

响应组装的关键处理：
- **NO_REPLY 过滤**：以 `NO_REPLY` 开头的响应被静默处理
- **重复去除**：消息工具的重复结果从最终负载中移除
- **回退机制**：当没有可渲染内容且工具出错时，发送回退错误响应
- **流式输出**：支持块流式（block streaming）和预览流式（preview streaming）[^streaming]

### 3.1.3 Agent Loop 状态转换图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Agent Loop 状态机                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────┐    RPC调用      ┌─────────────┐                       │
│   │  IDLE   │ ──────────────→ │  ACCEPTED   │                       │
│   └─────────┘                 └──────┬──────┘                       │
│       ▲                              │                              │
│       │                              ▼                              │
│       │                        ┌─────────────┐    准备失败          │
│       │              准备完成  │ PREPARING   │ ─────────→  ERROR    │
│       │              ◄─────────┤  (准备阶段)  │                       │
│       │                        └──────┬──────┘                       │
│       │                               │                             │
│       │                               ▼                             │
│       │                        ┌─────────────┐    推理错误          │
│       │              工具调用  │  RUNNING    │ ─────────→  ERROR    │
│       │              ◄─────────┤  (推理阶段)  │                      │
│       │              │         └──────┬──────┘                      │
│       │              │                │                             │
│       │              │                ▼                             │
│       │              │         ┌─────────────┐    执行错误          │
│       │              └────────→│ EXECUTING   │ ─────────→  ERROR    │
│       │                        │  (工具执行)  │                      │
│       │                        └──────┬──────┘                      │
│       │                               │                             │
│       │                               ▼                             │
│       │                        ┌─────────────┐                      │
│       │              继续循环  │   WAITING   │                      │
│       │              ◄─────────┤  (等待用户)  │                      │
│       │                        └──────┬──────┘                      │
│       │                               │                             │
│       │                        组装响应                             │
│       │                               ▼                             │
│       │                        ┌─────────────┐                      │
│       └───────────────────────│  COMPLETED  │                      │
│                                └─────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1.4 超时与终止条件

Agent Loop 在以下情况下会提前结束[^agent-loop]：

| 终止条件 | 说明 | 配置项 |
|---------|------|--------|
| Agent 超时 | 运行超过指定时间被中止 | `agents.defaults.timeoutSeconds` (默认 600s) |
| AbortSignal | 用户取消或系统信号 | 运行时自动处理 |
| Gateway 断开 | RPC 超时或网关连接丢失 | 自动处理 |
| agent.wait 超时 | 仅等待操作超时 | `timeoutMs` 参数 (默认 30s) |
| 上下文溢出 | 超出模型上下文窗口 | 触发压缩后重试 |
| 工具执行失败 | 关键工具执行失败 | 根据策略处理 |

超时配置示例：

```json5
// 标准JSON配置: openclaw.json
{
  agents: {
    defaults: {
      timeoutSeconds: 600,      // Agent 运行超时
      compaction: {
        reserveTokensFloor: 20000,  // 压缩预留 token
      },
    },
  },
}
```

### 3.1.5 Hook 系统与扩展点

OpenClaw 提供两套钩子系统用于拦截和扩展 Agent Loop[^agent-loop]：

#### 内部钩子（Gateway hooks）

事件驱动的脚本，用于命令和生命周期事件：

- **`agent:bootstrap`**：构建引导文件时运行，可添加/移除引导上下文文件
- **Command hooks**：`/new`、`/reset`、`/stop` 等命令事件

#### 插件钩子（Plugin hooks）

Agent/工具生命周期和网关管道中的扩展点：

| 钩子名称 | 触发时机 | 用途 |
|---------|---------|------|
| `before_model_resolve` | 会话前（无 messages） | 确定性覆盖 provider/model |
| `before_prompt_build` | 会话加载后 | 注入 prependContext/systemPrompt |
| `before_agent_start` | 兼容性钩子 | 向后兼容 |
| `agent_end` | 完成后 | 检查最终消息列表和元数据 |
| `before_compaction` / `after_compaction` | 压缩前后 | 观察或注解压缩周期 |
| `before_tool_call` / `after_tool_call` | 工具调用前后 | 拦截工具参数/结果 |
| `tool_result_persist` | 工具结果持久化前 | 转换工具结果 |
| `message_received` / `message_sending` / `message_sent` | 消息收发时 | 消息处理 |
| `session_start` / `session_end` | 会话生命周期边界 | 会话管理 |
| `gateway_start` / `gateway_stop` | 网关生命周期 | 网关管理 |

## 3.2 工具系统

OpenClaw 的工具系统是其与外部世界交互的核心机制。工具使 Agent 能够读取文件、执行命令、控制浏览器、发送消息等。

### 3.2.1 工具系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      工具系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     工具调用层                               │   │
│  │  • 工具解析    • 参数验证    • 权限检查    • 路由分发        │   │
│  └──────────────────────┬──────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼──────────────────────────────────────┐   │
│  │                     工具注册表                               │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │   │
│  │  │  read   │ │  write  │ │  exec   │ │ browser │   ...      │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │   │
│  └──────────────────────┬──────────────────────────────────────┘   │
│                         │                                          │
│  ┌──────────────────────▼──────────────────────────────────────┐   │
│  │                     执行适配层                               │   │
│  │  • Sandbox  • Gateway Host  • Node Host  • Remote CDP       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2.2 六大类工具详解

> **注意**：以下工具分类为作者根据功能进行的归类，**非 OpenClaw 官方分类方式**。官方文档按实际功能组织工具，没有明确分为"六大类"。

OpenClaw 的工具可分为以下六大类：

#### 1. 文件操作工具

文件操作工具允许 Agent 与工作区文件交互。

**read（读取文件）**

```typescript
interface ReadParams {
  file_path: string;      // 文件路径（相对或绝对）
  offset?: number;        // 起始行号（1-indexed）
  limit?: number;         // 最大读取行数
}

// 功能：
// - 支持文本文件和图像（jpg, png, gif, webp）
// - 图像作为附件发送
// - 文本输出截断到 2000 行或 50KB
// - 使用 offset/limit 处理大文件
```

**write（写入文件）**

```typescript
interface WriteParams {
  file_path: string;      // 文件路径
  content: string;        // 文件内容
}

// 功能：
// - 创建新文件或覆盖现有文件
// - 自动创建父目录
// - 支持绝对路径和相对路径
```

**edit（编辑文件）**

```typescript
interface EditParams {
  file_path: string;      // 文件路径
  oldText: string;        // 要替换的精确文本
  newText: string;        // 新文本
}

// 功能：
// - 精确文本替换（包括空白字符）
// - 用于精确、外科手术式编辑
// - oldText 必须完全匹配
```

#### 2. 命令执行工具

**exec（执行命令）**

```typescript
interface ExecParams {
  command: string;                    // 要执行的命令
  workdir?: string;                   // 工作目录
  env?: Record<string, string>;       // 环境变量覆盖
  yieldMs?: number;                   // 自动后台化延迟（默认 10000ms）
  background?: boolean;               // 立即后台执行
  timeout?: number;                   // 超时秒数（默认 1800）
  pty?: boolean;                      // 在伪终端中运行
  host?: 'sandbox' | 'gateway' | 'node';  // 执行位置
  security?: 'deny' | 'allowlist' | 'full';  // 执行模式
  ask?: 'off' | 'on-miss' | 'always'; // 批准提示
  node?: string;                      // node id/name（host=node 时）
  elevated?: boolean;                 // 请求提升模式
}
```

Exec 工具的执行位置选项：

- **sandbox（默认）**：在隔离的沙盒环境中执行
- **gateway**：在网关主机上执行
- **node**：在配对的节点上执行

安全模式：

- **deny**：拒绝执行（除非在 allowlist 中）
- **allowlist**：仅在显式允许的路径上执行
- **full**：完全执行权限（需批准）

**process（进程管理）**

```typescript
interface ProcessParams {
  action: 'list' | 'kill' | 'steer' | 'send-keys' | 'write' | 'submit' | 'paste';
  sessionId?: string;     // 会话 ID
  keys?: string[];        // 按键序列
  text?: string;          // 文本内容
  // ... 其他参数
}

// 功能：
// - list：列出正在运行的 exec 会话
// - kill：终止会话
// - steer：向子代理发送消息
// - send-keys：发送按键（支持 tmux 风格键名）
// - write：写入数据
// - submit：发送回车
// - paste：粘贴文本
```

#### 3. 浏览器控制工具

**browser（浏览器控制）**

```typescript
interface BrowserParams {
  action: 'status' | 'start' | 'stop' | 'profiles' | 'tabs' | 'open' | 
          'focus' | 'close' | 'snapshot' | 'screenshot' | 'navigate' | 
          'console' | 'pdf' | 'upload' | 'dialog' | 'act';
  profile?: string;       // 浏览器配置文件
  target?: string;        // 目标位置
  // ... 其他参数
}

// 支持的 Action：
// - status/start/stop：状态检查和生命周期管理
// - profiles/tabs：配置文件和标签页管理
// - open/focus/close：标签页操作
// - snapshot：捕获可交互 UI 的快照
// - screenshot/pdf：捕获屏幕截图或 PDF
// - navigate：导航到 URL
// - act：执行 UI 动作（点击、输入、拖拽等）
```

浏览器配置文件[^browser]：

- **chrome**：使用 Chrome 扩展中继接管现有 Chrome 标签页
- **openclaw**：OpenClaw 管理的隔离浏览器

#### 4. 消息通信工具

**message（消息发送）**

```typescript
interface MessageParams {
  action: 'send';
  target?: string;        // 目标频道/用户 ID
  message?: string;       // 消息内容
  channel?: string;       // 频道类型
  // ... 其他参数
}

// 支持的通道：
// - Telegram、Discord、Slack
// - WhatsApp、Signal、iMessage
// - Google Chat、Teams
// - 以及其他支持的通道
```

消息工具的关键特性：
- 发送消息到指定通道
- 支持附件（文件、图片、音频）
- 支持回复、引用、反应
- 支持创建投票、线程等高级功能

#### 5. 会话与子代理工具

**sessions_send（向会话发送消息）**

```typescript
interface SessionsSendParams {
  sessionId?: string;     // 目标会话 ID
  message: string;        // 消息内容
  // ... 其他参数
}
```

**subagents（子代理管理）**

```typescript
// 子代理管理：列出、终止或发送指令给子代理
interface SubagentsParams {
  action: 'list' | 'kill' | 'steer';
  target?: string;        // 目标子代理
  message?: string;       // 要发送的消息（steer 时使用）
  // ... 其他参数
}

// 创建子代理（使用 sessions_spawn 或 subagents spawn）
interface SpawnSubagentParams {
  task: string;           // 任务描述（必需）
  label?: string;         // 用于日志/UI 的标签
  agentId?: string;       // 在另一个 agent id 下生成
  model?: string;         // 覆盖子代理模型
  thinking?: string;      // 覆盖思考级别
  runTimeoutSeconds?: number;  // 运行超时
  thread?: boolean;       // 是否请求线程绑定路由
  mode?: 'run' | 'session';    // thread=true 时默认为 session
  cleanup?: 'delete' | 'keep'; // 默认 keep
}
```

功能说明：
- **list**：列出所有活跃子代理
- **kill**：终止指定子代理
- **steer**：向子代理发送指令/消息
- **spawn**（通过 task 参数）：创建并启动子代理执行指定任务

子代理特性：
- **隔离性**：每个子代理运行在自己的会话中
- **并行性**：子代理可并行执行，不阻塞主代理
- **结果汇总**：子代理完成后自动向请求者汇报结果
- **成本控制**：可为子代理配置更便宜的模型

#### 6. 其他专业工具

| 工具 | 用途 | 来源 |
|------|------|------|
| `canvas` | 控制节点画布（展示/隐藏/导航/评估） | 内置 |
| `nodes` | 发现和控制配对节点 | 内置 |
| `image` | 使用视觉模型分析图像 | 内置 |
| `tts` | 文本转语音 | 内置 |
| `web_search` | 网络搜索（Brave API） | 内置 |
| `web_fetch` | 获取 URL 内容 | 内置 |
| `memory_search` | 语义记忆搜索 | memory 插件 |
| `memory_get` | 读取特定记忆文件 | memory 插件 |
| `feishu_doc` | 飞书文档操作 | 技能 |
| `feishu_bitable_*` | 飞书多维表格操作 | 技能 |

### 3.2.3 工具注册与发现机制

工具注册采用分层架构：

```
┌─────────────────────────────────────────────────────────────────────┐
│                      工具发现层级                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Level 1: 内置核心工具                                               │
│  ├── read, write, edit                                               │
│  ├── exec, process                                                   │
│  ├── browser                                                         │
│  ├── message                                                         │
│  └── sessions_send, subagents                                        │
│                                                                     │
│  Level 2: 技能提供的工具                                             │
│  ├── 飞书工具集 (feishu_doc, feishu_bitable_*)                       │
│  ├── GitHub 工具 (gh_issues)                                         │
│  └── 社区技能提供的工具                                              │
│                                                                     │
│  Level 3: 插件提供的工具                                             │
│  ├── memory_search, memory_get (memory-core 插件)                    │
│  └── 其他插件工具                                                    │
│                                                                     │
│  Level 4: MCP 服务器工具 (通过 mcporter)                              │
│  └── 外部 MCP 服务器提供的工具                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

工具注册代码示意：

```typescript
// 概念示例：工具注册机制
// 注意：此为示意代码，非 OpenClaw 实际源码

class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();
  
  // 注册内置工具
  registerBuiltinTools() {
    this.register('read', new ReadTool());
    this.register('write', new WriteTool());
    this.register('edit', new EditTool());
    this.register('exec', new ExecTool());
    this.register('process', new ProcessTool());
    this.register('browser', new BrowserTool());
    this.register('message', new MessageTool());
    // ... 其他内置工具
  }
  
  // 从技能加载工具
  async loadSkillsTools(skills: Skill[]) {
    for (const skill of skills) {
      const skillTools = await loadSkillTools(skill);
      for (const tool of skillTools) {
        this.register(tool.name, tool.handler);
      }
    }
  }
  
  // 从插件加载工具
  async loadPluginTools(plugins: Plugin[]) {
    for (const plugin of plugins) {
      if (plugin.providesTools) {
        const pluginTools = await plugin.getTools();
        for (const [name, handler] of Object.entries(pluginTools)) {
          this.register(name, handler);
        }
      }
    }
  }
  
  // 获取工具处理器
  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }
  
  // 获取所有可用工具列表
  list(): ToolInfo[] {
    return Array.from(this.tools.entries()).map(([name, handler]) => ({
      name,
      description: handler.description,
      parameters: handler.parameters,
    }));
  }
}
```

### 3.2.4 工具权限控制

OpenClaw 提供多层次的工具权限控制：

#### 1. 工具策略（Tool Policy）

```json5
// 标准JSON配置: openclaw.json - 工具策略
{
  tools: {
    // 显式允许的工具（优先级最高）
    allow: ["read", "write", "edit", "exec"],
    
    // 显式拒绝的工具
    deny: ["browser", "message"],
    
    // 默认策略：allow | deny
    policy: "deny",
    
    // 按工具类型配置
    exec: {
      // Exec 工具特定配置
      host: "sandbox",
      security: "allowlist",
      ask: "on-miss",
    },
    
    browser: {
      enabled: true,
      defaultProfile: "chrome",
    },
  },
}
```

#### 2. 权限检查流程

```typescript
// 概念示例：工具权限检查
// 注意：此为示意代码，非 OpenClaw 实际源码

async function checkToolPolicy(
  toolCall: ToolCall,
  context: ExecutionContext
): Promise<void> {
  // 1. 检查是否在 deny 列表中
  if (isDenied(toolCall.name)) {
    throw new ToolDeniedError(`${toolCall.name} is in deny list`);
  }
  
  // 2. 检查是否在 allow 列表中（policy=deny 时）
  if (context.policy === 'deny' && !isAllowed(toolCall.name)) {
    throw new ToolDeniedError(`${toolCall.name} is not in allow list`);
  }
  
  // 3. 工具特定权限检查
  switch (toolCall.name) {
    case 'exec':
      await checkExecPolicy(toolCall.params, context);
      break;
    case 'browser':
      await checkBrowserPolicy(toolCall.params, context);
      break;
    case 'message':
      await checkMessagePolicy(toolCall.params, context);
      break;
    // ... 其他工具
  }
}

// Exec 工具权限检查
async function checkExecPolicy(params: ExecParams, context: Context) {
  // 检查 host 设置
  if (params.host === 'gateway' || params.host === 'node') {
    // 检查批准
    if (params.ask !== 'off') {
      const approval = await requestApproval(params, context);
      if (!approval.granted) {
        throw new ApprovalDeniedError();
      }
    }
    
    // 检查 allowlist
    if (params.security === 'allowlist') {
      const resolvedPath = await resolveBinaryPath(params.command);
      if (!isInAllowlist(resolvedPath)) {
        throw new NotInAllowlistError(resolvedPath);
      }
    }
  }
}
```

#### 3. 沙盒执行

沙盒提供额外的隔离层：

```
┌─────────────────────────────────────────────────────────────────────┐
│                      沙盒执行模型                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Gateway Host                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Sandbox Container                        │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │               受限执行环境                             │  │   │
│  │  │  • 文件系统隔离（仅工作区可见）                        │  │   │
│  │  │  • 网络限制（可选）                                    │  │   │
│  │  │  • 资源限制（CPU/内存）                                │  │   │
│  │  │  • 无 root 权限                                        │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  配置：agents.defaults.sandbox.enabled = true                       │
│  工作区：agents.defaults.sandbox.workspaceRoot                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 4. 批准系统（Approvals）

对于敏感操作，OpenClaw 支持批准系统：

```typescript
// 批准请求流程
interface ApprovalRequest {
  id: string;
  tool: string;
  params: ToolParams;
  requester: SessionInfo;
  timestamp: number;
}

interface ApprovalResponse {
  granted: boolean;
  reason?: string;
  expiresAt?: number;
}

// 批准存储
// ~/.openclaw/exec-approvals.json
interface ApprovalStore {
  allowlist: string[];        // 已批准的二进制路径
  denials: string[];         // 明确拒绝的路径
  pending: ApprovalRequest[]; // 待批准请求
}
```

### 3.2.5 工具 Schema 与上下文成本

工具影响上下文的两种方式[^context]：

1. **工具列表文本**：系统提示词中显示的 "Tooling" 部分
2. **工具 Schema（JSON）**：发送给模型以便调用工具，计入上下文但不可见

使用 `/context detail` 查看工具 Schema 大小：

```
🧠 Context breakdown (detailed)
...
Top tools (schema size):
- browser: 9,812 chars (~2,453 tok)
- exec: 6,240 chars (~1,560 tok)
... (+N more tools)
```

工具 Schema 格式（TypeBox）：

```typescript
// 使用 TypeBox 定义工具参数 Schema
import { Type } from '@sinclair/typebox';

const ReadParamsSchema = Type.Object({
  file_path: Type.String({ description: 'Path to the file' }),
  offset: Type.Optional(Type.Number({ description: 'Line to start from' })),
  limit: Type.Optional(Type.Number({ description: 'Max lines to read' })),
});

const ReadToolDefinition = {
  name: 'read',
  description: 'Read file contents',
  parameters: ReadParamsSchema,
};
```

## 3.3 记忆系统

OpenClaw 的记忆系统是其实现长期学习和上下文保持的关键。与上下文（Context）不同，记忆是持久化存储在磁盘上的信息，可在会话之间共享。

### 3.3.1 记忆系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      记忆系统架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    记忆访问层                                │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                 │   │
│  │  │ memory_search   │    │ memory_get      │                 │   │
│  │  │ (语义搜索)       │    │ (精确读取)       │                 │   │
│  │  └─────────────────┘    └─────────────────┘                 │   │
│  └───────────────────────┬─────────────────────────────────────┘   │
│                          │                                         │
│  ┌───────────────────────▼─────────────────────────────────────┐   │
│  │                    存储后端                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │  │ Builtin     │  │ QMD         │  │ Vector Store│          │   │
│  │  │ (SQLite)    │  │ (实验性)     │  │ (可选)      │          │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  └───────────────────────┬─────────────────────────────────────┘   │
│                          │                                         │
│  ┌───────────────────────▼─────────────────────────────────────┐   │
│  │                    存储格式                                  │   │
│  │  • memory/YYYY-MM-DD.md    (每日日志)                       │   │
│  │  • MEMORY.md               (长期记忆)                       │   │
│  │  • 纯 Markdown 格式                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3.2 短期记忆与长期记忆

OpenClaw 使用两层记忆模型[^memory]：

#### 短期记忆（Daily Logs）

```
文件：memory/YYYY-MM-DD.md

用途：
• 每日日志（append-only）
• 日常笔记和运行上下文
• 会话开始时读取（今天 + 昨天）

示例内容：
─────────────────────────────────────────
# 2026-02-27

## 上午
- 完成了第3章的初稿撰写
- 与星总讨论了技术细节

## 下午
- 审核了代码实现
- 更新了项目计划
─────────────────────────────────────────
```

#### 长期记忆（Curated Memory）

```
文件：MEMORY.md

用途：
• 精选的长期记忆
• 决策、偏好、持久事实
• 仅在主私有会话中加载（不在群聊上下文中）

示例内容：
─────────────────────────────────────────
# 长期记忆

## 偏好
- 星总喜欢简洁的技术文档
- 使用专业术语，无需过度解释基础概念

## 重要决策
- 项目使用 Markdown 格式编写
- 所有代码必须经过测试验证

## 联系方式
- 邮箱: xingzong@example.com
─────────────────────────────────────────
```

记忆写入原则：

- **决策、偏好和持久事实** → `MEMORY.md`
- **日常笔记和运行上下文** → `memory/YYYY-MM-DD.md`
- 当有人说"记住这个"时，将其写入文件（不要保留在 RAM 中）
- 如果需要某事持久化，**要求 Agent 将其写入记忆**

### 3.3.3 向量存储与语义搜索

OpenClaw 支持在记忆文件上构建向量索引，实现语义搜索：

```
┌─────────────────────────────────────────────────────────────────────┐
│                    向量搜索流程                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 索引构建                                                         │
│     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│     │ Markdown    │───→│ 文本分割    │───→│ 向量嵌入    │          │
│     │ 文件        │    │ (chunks)    │    │ (Embeddings)│          │
│     └─────────────┘    └─────────────┘    └──────┬──────┘          │
│                                                   │                 │
│                                              ┌────▼────┐            │
│                                              │ 向量存储 │            │
│                                              │ (sqlite-│            │
│                                              │  vec)   │            │
│                                              └────┬────┘            │
│                                                   │                 │
│  2. 搜索查询                                       │                 │
│     ┌─────────────┐    ┌─────────────┐           │                 │
│     │ 用户查询    │───→│ 查询向量    │───────────┘                 │
│     │ "数据库配   │    │ (Embedding) │                               │
│     │  置"       │    │             │                               │
│     └─────────────┘    └─────────────┘                               │
│                              │                                      │
│                              ▼                                      │
│     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│     │ 相似度计算  │◄───│ 向量检索    │───→│ 结果排序    │          │
│     │ (cosine)    │    │ (top-k)     │    │ 返回 top N  │          │
│     └─────────────┘    └─────────────┘    └─────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 向量存储配置

```json5
// 标准JSON配置: openclaw.json - 向量搜索
{
  agents: {
    defaults: {
      memorySearch: {
        // 嵌入提供商：local | openai | gemini | voyage | mistral
        provider: 'openai',
        
        // 本地模型配置（provider=local）
        local: {
          modelPath: '~/models/embedding.gguf',
        },
        
        // 远程 API 配置
        remote: {
          apiKey: '${EMBEDDING_API_KEY}',
          baseUrl: 'https://api.example.com/v1',
        },
        
        // 搜索限制
        maxResults: 10,
        maxSnippetChars: 2000,
        maxInjectedChars: 10000,
      },
    },
  },
}
```

#### 自动提供商选择

如果 `memorySearch.provider` 未设置，OpenClaw 自动选择：

1. `local` - 如果配置了 `memorySearch.local.modelPath` 且文件存在
2. `openai` - 如果能解析到 OpenAI key
3. `gemini` - 如果能解析到 Gemini key
4. `voyage` - 如果能解析到 Voyage key
5. `mistral` - 如果能解析到 Mistral key
6. 否则禁用记忆搜索直到配置完成

#### 向量维度对比

不同嵌入提供商的向量维度各异：

| 提供商 | 模型示例 | 维度 | 特点 |
|--------|----------|------|------|
| **OpenAI** | text-embedding-3-small | 1536 | 性价比高，通用场景 |
| **OpenAI** | text-embedding-3-large | 3072 | 高精度，复杂语义 |
| **Gemini** | embedding-001 | 768 | 多语言支持好 |
| **Voyage** | voyage-3 | 1024 | 长文本优化 |
| **Mistral** | mistral-embed | 1024 | 欧洲隐私合规 |
| **Local** | nomic-embed-text | 768 | 离线运行，隐私优先 |
| **Local** | all-MiniLM-L6-v2 | 384 | 轻量级，资源占用低 |

**维度选择建议**：
- **高维（1536+）**：追求搜索精度，内存充足
- **中维（768-1024）**：平衡精度和性能
- **低维（384-768）**：边缘部署，资源受限

**存储空间对比（每百万向量）：**

| 维度 | 原始大小 | SQLite-vec 压缩后 | 说明 |
|------|---------|------------------|------|
| 384 | 1.5 GB | ~500 MB | 适合移动端/嵌入式 |
| 768 | 3.0 GB | ~1.0 GB | 平衡选择 |
| 1024 | 4.0 GB | ~1.3 GB | 主流选择 |
| 1536 | 6.0 GB | ~2.0 GB | OpenAI 默认 |
| 3072 | 12.0 GB | ~4.0 GB | 高精度需求 |

#### QMD 后端（实验性）

QMD（Query Markdown）是一个本地优先的搜索 sidecar，结合 BM25 + 向量 + 重新排序[^memory]：

```json5
// 标准JSON配置: openclaw.json - QMD
{
  agents: {
    defaults: {
      qmd: {
        command: 'qmd',                    // QMD 可执行文件路径
        searchMode: 'search',              // search | vsearch | query
        
        // 索引配置
        includeDefaultMemory: true,        // 自动索引 MEMORY.md + memory/**/*.md
        paths: [                           // 添加额外索引目录
          { path: '~/docs', pattern: '**/*.md', name: 'docs' },
          { path: '~/notes', pattern: '**/*.md', name: 'notes' },
        ],
        
        // 更新策略
        update: {
          interval: '5m',                  // 索引更新间隔（如 5m, 1h）
          onBoot: true,                    // 启动时立即更新索引
        },
        
        // 搜索限制
        limits: {
          maxResults: 10,                  // 最大返回结果数
          maxSnippetChars: 2000,           // 片段最大字符数
        },
        
        // 搜索范围策略
        scope: 'workspace',                // workspace | global | session
        
        // 会话 JSONL 索引（实验性）
        sessions: {
          enabled: true,                   // 索引会话历史
          maxAge: '30d',                   // 最大会话年龄
        },
        
        // 自动回退机制
        fallback: {
          enabled: true,                   // QMD 失败时回退到 builtin
          onError: ['connection', 'timeout', 'crash'],
        },
      },
    },
  },
}
```

**QMD 后端特性：**

| 特性 | 说明 |
|------|------|
| **混合搜索** | BM25 关键词匹配 + 向量语义搜索 |
| **增量索引** | 支持定时更新和启动时更新 |
| **多路径支持** | 可索引多个目录的 Markdown 文件 |
| **会话索引** | 可选索引会话 JSONL 历史 |
| **自动回退** | QMD 不可用时自动回退到 builtin |

#### 混合搜索（Hybrid Search）

OpenClaw 的记忆搜索采用混合搜索策略，结合多种算法提高召回质量[^memory]：

**混合搜索组成：**

```
┌─────────────────────────────────────────────────────────────────────┐
│                      混合搜索架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 向量相似度（Vector Similarity）                                 │
│     • 语义匹配 - 理解查询意图                                       │
│     • 余弦相似度计算                                                │
│     • 捕获概念相关性                                                │
│                                                                     │
│  2. BM25 关键词相关性                                               │
│     • 传统关键词匹配                                                │
│     • 词频-逆文档频率（TF-IDF）改进                                 │
│     • 精确术语匹配                                                  │
│                                                                     │
│  3. 加权合并                                                        │
│     finalScore = vectorWeight * vectorScore + textWeight * textScore│
│                                                                     │
│  4. MMR 重新排序（Maximal Marginal Relevance）                     │
│     • 平衡相关性与多样性                                            │
│     • 避免重复内容                                                  │
│     • λ 参数控制权衡（默认 0.5）                                    │
│                                                                     │
│  5. 时间衰减（Temporal Decay）                                      │
│     • 新内容获得更高权重                                            │
│     • 指数衰减函数                                                  │
│     • 可配置半衰期                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**混合搜索配置：**

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        // 混合搜索权重
        hybrid: {
          vectorWeight: 0.7,     // 向量搜索权重（0-1）
          textWeight: 0.3,       // BM25 文本搜索权重（0-1）
        },
        
        // MMR 重新排序
        mmr: {
          enabled: true,
          lambda: 0.5,           // 相关性 vs 多样性权衡（0-1）
          diversity: 0.3,        // 多样性强度
        },
        
        // 时间衰减
        temporal: {
          enabled: true,
          halfLife: '7d',        // 半衰期（7天内容权重减半）
          reference: 'now',      // 时间参考点
        },
        
        // 嵌入缓存（减少 API 调用）
        cache: {
          enabled: true,
          maxEntries: 50000,     // 最大缓存条目数
        },
        
        // 实验性：会话记忆搜索
        experimental: {
          sessionMemory: true,   // 启用会话历史搜索
        },
        sources: ['memory', 'sessions'],  // 搜索来源
      },
    },
  },
}
```

**搜索流程示例：**

```
用户查询："数据库连接配置"

Step 1: 查询处理
├─ 生成查询向量嵌入
├─ 提取关键词（数据库、连接、配置）
└─ 应用查询扩展

Step 2: 并行检索
├─ 向量搜索 → top-k 语义匹配结果
└─ BM25 搜索 → top-k 关键词匹配结果

Step 3: 加权合并
├─ 归一化分数
├─ 应用权重：finalScore = 0.7*vScore + 0.3*tScore
└─ 合并去重

Step 4: MMR 重新排序
├─ 选择最相关结果
├─ 迭代添加多样性高的结果
└─ 避免内容重复

Step 5: 时间衰减调整
├─ 应用时间权重
├─ 新内容获得提升
└─ 最终排序输出
```

### 3.3.4 记忆检索算法

#### 文本检索（memory_get）

`memory_get` 工具提供对特定 Markdown 文件的精确读取：

```typescript
interface MemoryGetParams {
  path: string;           // 文件路径
  offset?: number;        // 起始行
  limit?: number;         // 最大行数
}

// 特性：
// - 文件不存在时优雅降级（返回空字符串）
// - 支持行范围读取
// - 适用于已知位置的信息检索
```

#### 语义检索（memory_search）

`memory_search` 工具提供基于语义的回忆：

```typescript
interface MemorySearchParams {
  query: string;          // 搜索查询
  limit?: number;         // 返回结果数量
  // ... 其他参数
}

// 特性：
// - 使用向量相似度搜索
// - 即使措辞不同也能找到相关内容
// - 返回带相似度分数的片段
```

#### 检索流程示例

```
用户查询："我上周讨论的数据库配置是什么？"

┌─────────────────────────────────────────────────────────┐
│ Step 1: 确定搜索范围                                     │
│ • 默认搜索 MEMORY.md 和 memory/*.md                     │
│ • 检查 QMD 配置中的额外路径                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Step 2: 执行语义搜索                                     │
│ • 将查询转换为向量嵌入                                  │
│ • 在向量存储中检索 top-k 相似片段                        │
│ • 计算余弦相似度并排序                                  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Step 3: 结果过滤与格式化                                 │
│ • 应用 maxResults 限制                                  │
│ • 截断到 maxSnippetChars                                │
│ • 格式化返回结果                                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: 结果注入上下文                                   │
│ • 结果注入到模型上下文（如果启用）                       │
│ • 受 maxInjectedChars 限制                              │
└─────────────────────────────────────────────────────────┘
```

### 3.3.5 自动记忆刷新

OpenClaw 在会话接近自动压缩时触发**无声的 Agentic 回合**，提醒模型在压缩前将持久记忆写入磁盘[^memory][^session-management-compaction]：

```
┌─────────────────────────────────────────────────────────────────────┐
│                  预压缩记忆刷新流程                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  监控条件                                                           │
│  contextTokens > contextWindow - reserveTokensFloor - softThreshold │
│                              │                                      │
│                              ▼                                      │
│  触发无声刷新回合                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  systemPrompt: "Session nearing compaction..."              │   │
│  │  prompt: "Write any lasting notes to memory/YYYY-MM-DD.md"  │   │
│  │  expectedResponse: "NO_REPLY"                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  模型执行记忆写入                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ • 评估哪些信息值得持久化                                    │   │
│  │ • 将重要决策写入 MEMORY.md                                  │   │
│  │ • 将日常笔记写入 memory/YYYY-MM-DD.md                       │   │
│  │ • 返回 NO_REPLY（用户不可见）                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  继续正常压缩流程                                                   │
│  （确保重要记忆已保存到磁盘）                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

配置：

```json5
{
  agents: {
    defaults: {
      compaction: {
        reserveTokensFloor: 20000,
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 4000,
          systemPrompt: "Session nearing compaction. Store durable memories now.",
          prompt: "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.",
        },
      },
    },
  },
}
```

刷新特性：
- **软阈值**：当会话 token 估计超过 `contextWindow - reserveTokensFloor - softThresholdTokens` 时触发
- **默认静默**：提示包含 `NO_REPLY`，用户不可见
- **每压缩周期一次**：在 `sessions.json` 中跟踪
- **只读工作区跳过**：如果会话工作区是只读的，跳过刷新

## 3.4 规划与推理

OpenClaw 的规划与推理系统建立在 LLM 的强大能力之上，通过特定的策略和机制实现复杂任务的分解、执行和错误恢复。

### 3.4.1 LLM 推理机制

#### 推理流程概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM 推理流程                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │ 系统提示词  │     │  对话历史   │     │  当前输入   │           │
│  │             │     │             │     │             │           │
│  │ • 工具列表  │  +  │ • 用户消息  │  +  │ • 用户问题  │           │
│  │ • 安全提示  │     │ • 助手回复  │     │ • 附件      │           │
│  │ • 上下文    │     │ • 工具结果  │     │             │           │
│  └─────────────┘     └─────────────┘     └─────────────┘           │
│         │                   │                   │                   │
│         └───────────────────┴───────────────────┘                   │
│                             │                                       │
│                             ▼                                       │
│                    ┌─────────────────┐                              │
│                    │   LLM Provider  │                              │
│                    │                 │                              │
│                    │ • OpenAI        │                              │
│                    │ • Anthropic     │                              │
│                    │ • Google        │                              │
│                    │ • OpenCode      │                              │
│                    │ • ...           │                              │
│                    └────────┬────────┘                              │
│                             │                                       │
│                             ▼                                       │
│                    ┌─────────────────┐                              │
│                    │    推理输出     │                              │
│                    │                 │                              │
│                    │ • 文本回复      │                              │
│                    │ • 工具调用      │                              │
│                    │ • 推理过程      │                              │
│                    └─────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 思考级别（Thinking Levels）

OpenClaw 支持多级别的思考深度：

| 级别 | 说明 | 使用场景 |
|------|------|----------|
| `off` | 无显式思考 | 简单查询、快速响应 |
| `low` | 最小思考 | 标准对话 |
| `medium` | 中等思考 | 复杂问题 |
| `high` | 深度思考 | 分析、规划、代码审查 |
| `max` | 最大思考 | 复杂架构设计、故障排查 |

配置：

```json5
// openclaw.json
{
  agents: {
    defaults: {
      thinking: 'medium',  // 默认思考级别
    },
  },
}

// 运行时切换
// /thinking high
// /thinking low
```

#### 推理可见性（Reasoning Visibility）

```
┌─────────────────────────────────────────────────────────────────────┐
│                  推理过程控制                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  /reasoning off                                                     │
│  • 推理过程完全隐藏                                                 │
│  • 用户只看到最终答案                                               │
│                                                                     │
│  /reasoning on                                                      │
│  • 推理过程可见                                                     │
│  • 作为单独块或内联显示                                             │
│                                                                     │
│  /reasoning stream                                                  │
│  • 推理过程流式传输                                                 │
│  • 实时显示思考过程                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4.2 任务分解策略

#### 自主任务分解

OpenClaw Agent 能够自主将复杂任务分解为子任务：

```
用户请求："帮我开发一个完整的用户认证系统"

┌─────────────────────────────────────────────────────────────────────┐
│                  任务分解示例                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  主任务：开发用户认证系统                                           │
│                                                                     │
│  ├─ 子任务 1：设计数据库模式                                        │
│  │   ├─ 创建用户表                                                  │
│  │   ├─ 创建会话表                                                  │
│  │   └─ 创建密码重置表                                              │
│  │                                                                   │
│  ├─ 子任务 2：实现注册功能                                          │
│  │   ├─ 验证输入数据                                                │
│  │   ├─ 密码哈希处理                                                │
│  │   └─ 创建用户记录                                                │
│  │                                                                   │
│  ├─ 子任务 3：实现登录功能                                          │
│  │   ├─ 凭证验证                                                    │
│  │   ├─ 会话管理                                                    │
│  │   └─ JWT 令牌生成                                                │
│  │                                                                   │
│  └─ 子任务 4：实现密码重置                                          │
│      ├─ 令牌生成                                                    │
│      ├─ 邮件发送                                                    │
│      └─ 密码更新                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 使用子代理并行执行

对于可并行的子任务，OpenClaw 支持使用子代理（Sub-agents）并行处理[^subagents]：

```typescript
// 概念示例：使用子代理并行执行任务

const tasks = [
  { name: 'database-design', task: '设计数据库模式...' },
  { name: 'register-module', task: '实现注册功能...' },
  { name: 'login-module', task: '实现登录功能...' },
  { name: 'reset-module', task: '实现密码重置...' },
];

// 并行启动子代理
const subagentPromises = tasks.map(t => 
  subagents({
    action: 'steer',      // 或 'spawn' 根据实现
    target: t.name,
    message: t.task,
  })
);

// 或使用 sessions_spawn 创建子代理
const spawnPromises = tasks.map(t =>
  sessions_spawn({
    task: t.task,
    label: t.name,
    model: 'openai/gpt-4.1-mini',
    thinking: 'medium',
  })
);

// 等待所有子代理完成
const results = await Promise.all(
  subagents.map(s => waitForCompletion(s.runId))
);

// 整合结果
const integratedSolution = await integrateResults(results);
```

子代理特性：
- **隔离性**：每个子代理运行在自己的会话中
- **并行性**：子代理可并行执行，不阻塞主代理
- **结果汇总**：子代理完成后自动向请求者汇报结果
- **成本控制**：可为子代理配置更便宜的模型

#### 队列模式与任务调度

OpenClaw 提供多种队列模式控制任务处理[^queue]：

| 模式 | 说明 | 使用场景 |
|------|------|----------|
| `collect`（默认） | 合并所有排队消息为单个后续回合 | 避免重复响应 |
| `steer` | 立即注入当前运行 | 需要立即干预 |
| `followup` | 排队等待下一个代理回合 | 标准消息处理 |
| `steer-backlog` | 立即转向并保留消息用于后续 | 复杂交互 |
| `interrupt` | 中止当前运行，执行最新消息 | 紧急操作 |

队列配置：

```json5
{
  messages: {
    queue: {
      mode: 'collect',
      debounceMs: 1000,    // 防抖延迟
      cap: 20,             // 最大排队数
      drop: 'summarize',   // 溢出策略：old | new | summarize
      byChannel: {
        discord: 'collect',
        telegram: 'steer',
      },
    },
  },
}
```

### 3.4.3 错误恢复机制

#### 错误类型与处理策略

```
┌─────────────────────────────────────────────────────────────────────┐
│                  错误分类与处理                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. 工具执行错误                                                    │
│     • 命令返回非零退出码                                            │
│     • 文件不存在                                                    │
│     • 网络请求失败                                                  │
│     处理：将错误信息返回给 LLM，让 Agent 决定下一步                 │
│                                                                     │
│  2. LLM 推理错误                                                    │
│     • API 错误（rate limit, quota exceeded）                        │
│     • 上下文溢出                                                    │
│     • 无效响应格式                                                  │
│     处理：模型故障转移、压缩重试、回退响应                          │
│                                                                     │
│  3. 系统级错误                                                      │
│     • Gateway 连接丢失                                              │
│     • 会话损坏                                                      │
│     • 配置错误                                                      │
│     处理：优雅降级、错误报告、自动恢复                              │
│                                                                     │
│  4. 超时错误                                                        │
│     • Agent 运行超时                                                │
│     • 工具执行超时                                                  │
│     • API 调用超时                                                  │
│     处理：中止运行、返回部分结果、通知用户                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 上下文溢出恢复

当会话超出模型上下文窗口时，OpenClaw 的恢复流程：

```
┌─────────────────────────────────────────────────────────────────────┐
│                上下文溢出恢复流程                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  触发条件                                                           │
│  contextTokens > contextWindow - reserveTokens                      │
│                              │                                      │
│                              ▼                                      │
│  自动压缩流程                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. 触发 memoryFlush（如启用）                               │   │
│  │    - 无声回合写入持久记忆                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2. 执行压缩                                                 │   │
│  │    - 摘要旧对话                                             │   │
│  │    - 保留最近消息                                           │   │
│  │    - 持久化到 JSONL                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. 重试原始请求                                             │   │
│  │    - 使用压缩后的上下文                                     │   │
│  │    - 重置内存缓冲区                                         │   │
│  │    - 避免重复输出                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 4. 如仍失败                                                 │   │
│  │    - 返回错误信息                                           │   │
│  │    - 建议用户手动压缩 (/compact)                            │   │
│  │    - 或创建新会话 (/new)                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 模型故障转移

当主模型失败时，OpenClaw 支持自动故障转移：

```json5
// 标准JSON配置: openclaw.json - 故障转移
{
  agents: {
    defaults: {
      models: {
        primary: 'anthropic/claude-opus-4-6',
        fallbacks: [
          'openai/gpt-4.1',
          'google/gemini-3-pro-preview',
        ],
      },
      // 触发故障转移的条件
      failover: {
        onRateLimit: true,      // 429 错误
        onTimeout: true,        // 超时
        onError: ['context_length_exceeded', 'server_error'],
        maxRetries: 2,          // 每模型最大重试
      },
    },
  },
}
```

故障转移逻辑：

1. **主模型失败** → 重试（最多 maxRetries 次）
2. **重试耗尽** → 切换到 fallback[0]
3. **fallback 失败** → 继续下一个 fallback
4. **全部失败** → 返回最后错误

#### 工具执行错误恢复

工具执行错误的恢复策略：

```typescript
// 概念示例：工具错误恢复
// 注意：此为示意代码，非 OpenClaw 实际源码

async function executeWithRecovery(toolCall: ToolCall): Promise<Result> {
  try {
    return await executeTool(toolCall);
  } catch (error) {
    // 1. 记录错误
    logToolError(toolCall, error);
    
    // 2. 根据错误类型决定策略
    switch (error.type) {
      case 'ToolNotFound':
        // 告知 Agent 工具不可用
        return { error: `Tool ${toolCall.name} not found` };
        
      case 'ToolDenied':
        // 权限错误，Agent 需要调整策略
        return { error: `Permission denied for ${toolCall.name}` };
        
      case 'ExecTimeout':
        // 执行超时，可建议后台执行
        return { 
          error: 'Command timed out',
          suggestion: 'Try running with background: true',
        };
        
      case 'FileNotFound':
        // 文件不存在，返回明确错误
        return { error: `File not found: ${error.path}` };
        
      default:
        // 未知错误，返回详细信息
        return { error: error.message };
    }
  }
}
```

### 3.4.4 规划模式与最佳实践

#### ReAct 模式（Reasoning + Acting）

OpenClaw 隐式支持 ReAct 模式，Agent 能够在推理和行动之间交替循环，直到任务完成。

**ReAct 实现机制：**

1. **循环结构**：每个 Agent Loop 回合包含 [思考 → 行动 → 观察] 的循环
2. **隐式规划**：LLM 在系统提示词引导下自主决定是否需要进一步工具调用
3. **最大回合限制**：默认限制连续工具调用回合数（通常 25-50 回合），防止无限循环
4. **终止条件**：当 LLM 返回最终答案（不含工具调用）时循环终止

**具体实现细节补充：**

| 实现要素 | 详细说明 |
|---------|---------|
| **最大回合数** | 默认 50 回合，可通过配置调整；超过限制会触发 `max_turns_exceeded` 错误 |
| **隐式 ReAct** | 不需要显式标记思考/行动，LLM 自主决定调用工具还是返回结果 |
| **工具调用格式** | 使用标准函数调用格式：`{"name": "tool_name", "arguments": {...}}` |
| **观察结果处理** | 工具结果自动添加到上下文，作为下一轮推理的输入 |
| **中间状态保存** | 每回合的完整状态（思考+行动+观察）持久化到 `sessions.jsonl` |
| **循环中断** | 支持 `/stop` 命令中断当前 ReAct 循环 |

**ReAct 执行流程伪代码（概念示例）：**

```typescript
// 概念示例：ReAct 循环实现示意
// 注意：此为基于 ReAct 模式的简化示例，非 OpenClaw 官方实现细节

async function reactLoop(session, userInput, maxTurns = 50) {
  const context = buildContext(session, userInput);
  
  for (let turn = 0; turn < maxTurns; turn++) {
    // 1. LLM 推理
    const response = await llm.generate(context);
    
    // 2. 检查是否包含工具调用
    if (!response.hasToolCalls()) {
      // 无工具调用，返回最终答案
      return { answer: response.text, turns: turn + 1 };
    }
    
    // 3. 执行工具调用
    const results = await executeTools(response.toolCalls);
    
    // 4. 观察结果加入上下文
    context.addObservation(results);
    
    // 5. 持久化回合状态
    await persistTurn(session, response, results);
  }
  
  throw new Error('max_turns_exceeded');
}
```

```
用户："找出我的 GitHub 仓库中最近更新的前 5 个项目"

Agent 思考过程：
─────────────────────────────────────────
回合 1 - 思考：用户想了解 GitHub 仓库信息。
         我需要：
         1. 调用 GitHub API 获取仓库列表
         2. 按更新时间排序
         3. 提取前 5 个

回合 1 - 行动：调用 github 工具获取仓库

回合 1 - 观察：获取到 20 个仓库，包含名称、更新时间等信息
─────────────────────────────────────────
[循环继续...]
─────────────────────────────────────────
回合 2 - 思考：我已获取仓库列表，现在需要排序并提取前 5 个

回合 2 - 行动：无需额外工具，直接从结果中提取

回合 2 - 最终回答：这里是您最近更新的前 5 个仓库...
─────────────────────────────────────────
```

**关键实现细节：**

| 组件 | 说明 |
|------|------|
| 推理触发 | LLM 根据任务复杂度自主决定是否需要多步推理 |
| 工具选择 | 基于描述匹配选择最合适的工具 |
| 错误恢复 | 工具调用失败时自动重试或调整策略 |
| 会话状态 | 每回合的思考和观察结果都持久化到会话历史 |

#### 自我修正（Self-Correction）

Agent 能够检测并修正自己的错误：

```
场景：Agent 尝试编辑文件但提供了错误的 oldText

尝试 1：
  edit({ file_path: 'config.js', oldText: 'port: 3000', newText: 'port: 8080' })
  → 失败：oldText 不匹配

Agent 反思：
  错误信息显示 oldText 不匹配。让我重新读取文件确认实际内容。

尝试 2：
  read({ file_path: 'config.js' })
  → 返回：port: 3001,

Agent 修正：
  原来实际端口是 3001 不是 3000。

尝试 3：
  edit({ file_path: 'config.js', oldText: 'port: 3001,', newText: 'port: 8080,' })
  → 成功
```

#### 最佳实践建议

基于 OpenClaw 的设计原理，以下是规划与推理的最佳实践：

1. **任务分解**
   - 将复杂任务分解为可管理的子任务
   - 使用子代理并行处理独立子任务
   - 设置清晰的子任务边界

2. **错误处理**
   - 始终检查工具返回值
   - 为关键操作设置超时
   - 准备备用方案

3. **记忆管理**
   - 主动将重要信息写入 MEMORY.md
   - 使用语义搜索检索相关信息
   - 定期整理和压缩记忆

4. **上下文优化**
   - 使用 `/compact` 主动压缩长会话
   - 利用技能按需加载指令
   - 保持引导文件简洁

5. **安全考虑**
   - 敏感操作使用沙盒执行
   - 启用工具策略和批准系统
   - 定期审查 exec 批准列表

---

## 本章小结

本章深入剖析了 OpenClaw 的三大核心工作机制：

**Agent Loop** 作为 OpenClaw 的执行引擎，通过 8 个步骤将用户输入转化为系统响应。其序列化执行模型确保会话一致性，而队列系统和流式输出则提供了良好的并发和用户体验。

**工具系统** 是 OpenClaw 与外部世界交互的桥梁。六大类工具（文件操作、命令执行、浏览器控制、消息通信、会话管理、专业工具）通过统一的注册和权限控制机制，实现了安全、灵活的扩展能力。

**记忆系统** 使 OpenClaw 能够超越单次会话的上下文限制，实现真正的长期学习。通过两层记忆模型（短期日志和长期记忆）和向量语义搜索，Agent 能够积累和检索知识。

**规划与推理** 系统建立在 LLM 的能力之上，通过任务分解、错误恢复和自我修正等机制，实现了复杂任务的自主执行。多级别的思考控制和队列模式为不同场景提供了灵活性。

理解这些工作原理，将帮助用户更有效地与 OpenClaw 协作，发挥其最大潜力。

---

## 参考来源

[^agent-loop]: OpenClaw 官方文档 - Agent Loop: https://docs.openclaw.ai/concepts/agent-loop
[^memory]: OpenClaw 官方文档 - Memory: https://docs.openclaw.ai/concepts/memory
[^system-prompt]: OpenClaw 官方文档 - System Prompt: https://docs.openclaw.ai/concepts/system-prompt
[^streaming]: OpenClaw 官方文档 - Streaming: https://docs.openclaw.ai/concepts/streaming
[^compaction]: OpenClaw 官方文档 - Compaction: https://docs.openclaw.ai/concepts/compaction
[^context]: OpenClaw 官方文档 - Context: https://docs.openclaw.ai/concepts/context
[^agent-workspace]: OpenClaw 官方文档 - Agent Workspace: https://docs.openclaw.ai/concepts/agent-workspace
[^multi-agent]: OpenClaw 官方文档 - Multi-Agent Routing: https://docs.openclaw.ai/concepts/multi-agent
[^queue]: OpenClaw 官方文档 - Command Queue: https://docs.openclaw.ai/concepts/queue
[^session-management-compaction]: OpenClaw 官方文档 - Session Management Deep Dive: https://docs.openclaw.ai/reference/session-management-compaction
[^browser]: OpenClaw 官方文档 - Browser: https://docs.openclaw.ai/tools/browser
[^subagents]: OpenClaw 官方文档 - Sub-agents: https://docs.openclaw.ai/tools/subagents
[^model-providers]: OpenClaw 官方文档 - Model Providers: https://docs.openclaw.ai/concepts/model-providers
[^exec]: OpenClaw 官方文档 - Exec Tool: https://docs.openclaw.ai/tools/exec

---

*文档版本：2026.2.27*  
*OpenClaw 版本：2026.2.x*
