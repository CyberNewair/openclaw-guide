# 第2章 核心架构

OpenClaw 采用创新的网关（Gateway）架构设计，将传统 AI 助手的云服务模式转变为本地优先的分布式架构。本章深入解析 OpenClaw 的系统架构，从宏观分层到微观实现，揭示其技术设计原理与核心机制。

---

## 2.1 架构总览

### 2.1.1 官方架构模型

OpenClaw 采用简洁的扁平化架构设计，核心组件清晰分离，通过标准化的 Gateway WebSocket 控制平面进行协调。根据官方文档，系统架构如下：

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│       (control plane)         │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Pi agent (RPC)
               ├─ CLI (openclaw …)
               ├─ WebChat UI
               ├─ macOS app
               └─ iOS / Android nodes
```

**核心子系统**（根据官方 README）：

- **Gateway WebSocket network** — 统一的控制平面，连接客户端、工具和事件
- **Channels** — 多通道接入层，支持主流聊天平台
- **Pi Agent Runtime** — Agent 执行运行时（RPC 模式）
- **Session Management** — 会话管理（包含 `main`、`dmScope` 等概念）
- **Control UI** — 控制界面
- **Cron + Webhooks** — 定时任务和 webhook

### 2.1.2 组件架构详解

官方采用功能组件化设计，而非强制分层：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Channels Layer                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │WhatsApp │ │Telegram │ │  Slack  │ │Discord  │ │ Feishu  │ │iMessage │   │
│  │(Baileys)│ │(grammY) │ │ (Bolt)  │ │(discord)│ │(lark)   │ │(osa)    │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
│                                    │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ WebSocket / HTTP API
┌────────────────────────────────────▼────────────────────────────────────────┐
│                              Gateway Layer                                  │
│                    (ws://127.0.0.1:18789)                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Gateway WebSocket Control Plane                 │   │
│  │         消息路由 · 会话管理 · 协议处理 · 权限控制                   │   │
│  └──────────────────────────────────┬──────────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────────┴──────────────────────────────────┐   │
│  │                        Session Management                           │   │
│  │    会话创建 · dmScope 管理 · 上下文压缩 · 过期清理                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ RPC / Internal API
┌─────────────────────────────────────▼───────────────────────────────────────┐
│                            Pi Agent Runtime                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   Context   │ │    LLM      │ │    Tool     │ │   Streaming /       │   │
│  │  Assembler  │ │   Engine    │ │  Executor   │ │   Reasoning         │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1.2 各层职责详解

**Channels Layer（通道层）**

通道层负责与外部聊天平台的集成，实现多通道消息的统一接入。该层通过 Provider 模式封装各平台的 SDK，将不同平台的消息格式转换为 OpenClaw 内部标准格式。

核心组件包括：
- **WhatsApp Provider**: 基于 Baileys 库实现 WhatsApp Web 协议连接
- **Telegram Provider**: 基于 grammY 框架实现 Bot API 集成
- **Slack Provider**: 基于 Bolt 框架实现 Slack Bot 功能
- **Discord Provider**: 基于 discord.js 实现 Discord Bot 功能
- **Feishu Provider**: 基于飞书开放平台的 Lark SDK 实现企业集成
- **Google Chat Provider**: 基于 Google Chat API 实现企业聊天集成
- **Signal Provider**: 基于 signal-cli 实现 Signal 协议连接
- **BlueBubbles Provider**: 推荐 iMessage 解决方案，基于 BlueBubbles 服务
- **iMessage Provider**: 基于 macOS OSA 脚本实现本地消息收发（legacy）
- **Microsoft Teams Provider**: 微软 Teams 集成（extension）
- **Matrix Provider**: Matrix 去中心化通信协议（extension）
- **Zalo/Zalo Personal Provider**: Zalo 越南社交应用（extension）
- **WebChat Provider**: 内置 Web 聊天界面

**Gateway Layer（网关层）**

网关层是 OpenClaw 架构的核心创新，运行在本地 `127.0.0.1:18789` 端口，作为系统的中央枢纽协调各组件通信。根据官方文档，Gateway 包含：

- **Gateway WebSocket Control Plane**: WebSocket 控制平面，统一管理客户端、工具和事件
- **Session Management**: 会话管理，包含会话创建、dmScope 管理、上下文压缩和过期清理
- **Channels Integration**: 通道集成管理
- **Cron + Webhooks**: 定时任务和 webhook 处理

**Pi Agent Runtime（Agent 运行时层）**

Agent 运行时层负责 Agent 的实际执行，使用 **Pi Agent Runtime**（基于 `pi-agent-core`）作为核心执行引擎，通过 RPC 模式与 Gateway 交互。该层实现了 Agent Loop 机制、LLM 接口封装、工具调用执行、流式输出（streaming）和推理控制（reasoning）。

**Infrastructure Services（基础设施服务）**

基础设施层提供底层存储和通用服务，包括：
- **Tailscale exposure**: Serve/Funnel 用于 Gateway dashboard + WS
- **Browser control**: OpenClaw 管理的 Chrome/Chromium CDP 控制
- **Canvas + A2UI**: Agent 驱动的可视化工作空间
- **Voice Wake + Talk Mode**: 常开语音和连续对话
- **Nodes**: Canvas、相机拍照/录像、屏幕录制、位置获取、通知推送

### 2.1.3 架构设计原则

OpenClaw 的架构设计遵循以下核心原则：

**本地优先（Local First）**

所有核心组件默认运行在本地环境，数据不经过第三方云服务。这一设计确保了用户数据的完全主权，符合隐私保护和数据合规要求。

**模块化（Modularity）**

各层、各组件之间通过明确定义的接口交互，低耦合高内聚。这种设计允许用户根据需求替换或扩展特定组件，例如更换向量数据库实现或添加新的聊天平台支持。

**可扩展性（Extensibility）**

插件系统允许开发者通过 Skill 机制扩展功能，无需修改核心代码。Skill 可以注册新工具、添加新的消息处理器或自定义行为逻辑。

**事件驱动（Event-Driven）**

系统采用事件驱动架构，组件间通过异步事件进行通信。这种设计支持高并发处理，允许同时管理多个会话和 Agent 实例。

---

## 2.2 Gateway 详解

Gateway 是 OpenClaw 架构的核心枢纽，其设计借鉴了网络路由器的概念，但路由的对象是 AI 消息和命令。本节深入解析 Gateway 的四个核心子系统。

### 2.2.1 Gateway 总体架构

Gateway 作为独立进程运行，暴露 WebSocket API 供客户端连接。根据官方文档，其核心功能是作为 **WebSocket Control Plane**（控制平面），协调 Channels、Pi Agent、CLI、WebChat UI 和移动设备节点之间的通信。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Gateway Process                                     │
│                     (ws://127.0.0.1:18789)                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Gateway WebSocket Control Plane                 │   │
│  │                                                                     │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │   Client    │ │    CLI      │ │  WebChat    │ │   Node      │   │   │
│  │  │  (CLI)      │ │  (命令行)   │ │    UI       │ │ (iOS/安卓)  │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │              Session Management + Channels Routing            │   │   │
│  │  └─────────────────────────────┬───────────────────────────────┘   │   │
│  └────────────────────────────────┼──────────────────────────────────┘   │
│                                   │                                         │
│                                   ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Pi Agent Runtime (RPC)                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2.2 Gateway WebSocket Control Plane

Gateway 的核心是 **WebSocket Control Plane**，运行在 `ws://127.0.0.1:18789`，提供统一的控制平面供客户端、工具和事件通信。

**核心职责**：

1. **消息路由（Message Routing）**
   - 接收来自各 Provider 的消息
   - 根据会话标识路由到对应的 Agent 实例
   - 支持多 Agent 并发处理

2. **会话管理（Session Management）**
   - 维护会话状态（sessionKey、dmScope 等）
   - 处理会话激活模式（群聊中的触发方式）
   - 管理上下文压缩和会话修剪

3. **协议处理（Protocol Handling）**
   - WebSocket 连接生命周期管理
   - 心跳检测和重连机制
   - 消息序列化和事件推送

### 2.2.3 通道集成（Channels Integration）

Channels 是 Gateway 的接入层，负责与外部聊天平台的集成。

**支持的 Provider**（根据官方 README）：

| Provider | 实现库 | 备注 |
|----------|--------|------|
| WhatsApp | Baileys | 主要通道 |
| Telegram | grammY | 主要通道 |
| Slack | Bolt | 主要通道 |
| Discord | discord.js | 主要通道 |
| Google Chat | Chat API | 主要通道 |
| Signal | signal-cli | 主要通道 |
| BlueBubbles | BlueBubbles | iMessage 推荐方案 |
| iMessage | osa | legacy |
| Microsoft Teams | extension | 扩展 |
| Matrix | extension | 扩展 |
| Zalo | extension | 扩展 |
| Zalo Personal | extension | 扩展 |
| WebChat | built-in | 内置 |

### 2.2.4 Session 管理详解

Session Management 是 Gateway 的核心子系统，负责维护所有活跃会话的状态。

**会话数据模型**（官方 Session 模型，2026.2.23 版本）：

```typescript
interface Session {
  sessionId: string;           // 会话唯一标识（UUID）
  sessionKey: string;          // 会话键（如 "agent:<agentId>:<mainKey>"）
  agentId: string;             // 所属 Agent
  channelId: string;           // 来源通道
  threadId?: string;           // 线程/话题 ID
  dmScope: DmScope;            // 私信范围配置
  messages: Message[];         // 消息历史
  context: Context;            // 会话上下文
  metadata: SessionMetadata;   // 元数据
  inputTokens: number;         // 输入 Token 计数
  outputTokens: number;        // 输出 Token 计数
  totalTokens: number;         // 总 Token 计数
  contextTokens: number;       // 上下文 Token 计数
  compactionCount?: number;    // 上下文压缩次数（新增字段）
  reasoningLevel?: string;     // 推理级别：off|minimal|low|medium|high|xhigh
  verboseLevel?: string;       // 详细程度
  model?: string;              // 当前使用的模型
  sendPolicy?: string;         // 发送策略
  groupActivation?: string;    // 群聊激活模式：mention/always
  createdAt: number;           // 创建时间
  updatedAt: number;           // 更新时间
  expiresAt: number;           // 过期时间
}

// dmScope 枚举：定义私信会话的隔离范围
enum DmScope {
  MAIN = 'main',                    // 主会话（所有私信共享）
  PER_PEER = 'per-peer',            // 每个对话对象独立会话
  PER_CHANNEL_PEER = 'per-channel-peer',        // 每个通道+对象独立
  PER_ACCOUNT_CHANNEL_PEER = 'per-account-channel-peer'  // 每个账户+通道+对象独立
}

// 注意：自 2026.2.23 版本起，默认 dmScope 已从 'main' 改为 'per-channel-peer'
// 如需共享 DM 会话连续性，需显式设置为 'main'

// 存储路径
// 会话索引: ~/.openclaw/agents/<agentId>/sessions/sessions.json
// 会话转录: ~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl
```

**会话生命周期**：

```
创建 → 激活 → 处理中 → 等待响应 → 完成 → 挂起 → [恢复/过期清理]
```

**会话修剪（Session Pruning）**：

为控制内存使用，Session Manager 实施智能修剪策略：

1. **时间维度**: 过期会话自动清理（默认 24 小时无活动）
2. **容量维度**: 单会话消息数量限制（默认保留最近 100 条）
3. **上下文压缩（Compaction）**: 当上下文超过 Token 限制时触发压缩，记录 compactionCount
4. **重要性维度**: 重要消息标记保留，普通消息可压缩

**dmScope 详解**：

dmScope（Direct Message Scope）控制私信会话的隔离范围：

| dmScope | 隔离级别 | 适用场景 |
|---------|----------|----------|
| `main` | 无隔离 | 所有私信共享同一个会话上下文 |
| `per-peer` | 按用户隔离 | 与每个用户的对话有独立上下文 |
| `per-channel-peer` | 按通道+用户隔离（默认） | 同一用户在不同平台有不同的上下文 |
| `per-account-channel-peer` | 完全隔离 | 最细粒度的会话隔离 |

> **⚠️ 重要变更**: 自 2026.2.23 版本起，CLI 本地 onboarding 默认将 `session.dmScope` 设置为 `per-channel-peer`。这是 breaking change，如需共享 DM 会话连续性，需显式设置为 `main`。

**WebSocket 连接管理**：

Gateway 使用 WebSocket 协议进行实时双向通信，支持以下功能：

- **连接建立**: 客户端发起 WebSocket 握手，Gateway 验证身份后建立连接
- **心跳检测**: 定期发送 ping/pong 保持连接活跃
- **重连机制**: 支持断线重连和会话恢复
- **连接限流**: 防止单个客户端占用过多资源

**消息协议定义**（官方协议格式）**：

```typescript
// 请求消息格式
interface GatewayRequest {
  type: "req";          // 消息类型：请求
  id: string;           // 请求唯一标识
  method: string;       // 请求方法/类型
  params: unknown;      // 请求参数
}

// 响应消息格式
interface GatewayResponse {
  type: "res";          // 消息类型：响应
  id: string;           // 对应请求 ID
  ok: boolean;          // 是否成功
  payload?: unknown;    // 响应数据（成功时）
  error?: ErrorInfo;    // 错误信息（失败时）
}

// 事件消息格式
interface GatewayEvent {
  type: "event";        // 消息类型：事件
  event: string;        // 事件类型名称
  payload: unknown;     // 事件数据
  seq?: number;         // 序列号（可选）
  stateVersion?: number;// 状态版本（可选）
}
```

**支持的消息类型**：

| 类型 | 说明 | 方向 |
|------|------|------|
| `health` | 健康检查 | Request/Response |
| `status` | 状态查询 | Request/Response |
| `send` | 发送消息 | Request/Response |
| `agent` | Agent 控制 | Request/Response |
| `presence` | 在线状态 | Request/Response |
| `tick` | 定时心跳 | Event |
| `message` | 新消息通知 | Event |
| `shutdown` | 关闭通知 | Event |

### 2.2.5 Skill 系统

Skill 系统通过 Skill 机制实现功能扩展，而非独立的 "Plugin Manager"。

**Skill 加载机制**：

```
Skill Discovery → Manifest Parsing → Dependency Resolution → 
Module Loading → Hook Registration → Permission Setup
```

**核心功能**：

1. **技能发现（Skill Discovery）**
   - 扫描 `~/.openclaw/skills/` 目录
   - 读取每个 Skill 的 `SKILL.md` 文件
   - 解析技能元数据和依赖关系

2. **钩子管理（Hook Management）**
   - 支持多种钩子点：消息接收前、消息发送后、工具调用前后等
   - 允许 Skill 注册自定义处理逻辑
   - 钩子执行顺序管理

3. **权限控制（Permission Control）**
   - 基于角色的权限模型
   - 工具级别的 allow/deny 列表
   - 运行时权限检查

**权限配置示例**：

```json
{
  "permissions": {
    "tools": {
      "allow": ["web_search", "file_read", "code_exec"],
      "deny": ["shell_exec", "system_modify"]
    },
    "channels": {
      "allow": ["telegram", "discord"],
      "deny": ["whatsapp"]
    }
  }
}
```

---

## 2.3 Agent Runtime 工作机制

Agent Runtime 是 OpenClaw 的核心执行引擎，负责将 LLM 的能力封装为可运行的服务。本节详细解析 Agent Runtime 的工作机制。

### 2.3.1 Agent Loop 流程详解

Agent Loop 是 Agent Runtime 的核心工作循环，实现了"感知-推理-行动-观察"的闭环。根据官方文档，完整的 Agent Loop 包含 **streaming**、**reasoning**、**failover** 等关键环节：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Agent Loop 完整流程（含 Streaming/Reasoning）            │
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐  │
│   │   等待输入   │────►│  上下文组装  │────►│  LLM 推理   │────►│ 决策点  │  │
│   └─────────────┘     └─────────────┘     └─────────────┘     └────┬────┘  │
│                                                                     │       │
│        ┌────────────────────────────────────────────────────────────┘       │
│        │                                                                      │
│        ▼                                                                      │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐  │
│   │  输出回复   │◄────│  结果反馈   │◄────│  工具执行   │◄────│ 需工具? │  │
│   │  (流式)     │     │             │     │             │     │  (是)   │  │
│   └─────────────┘     └─────────────┘     └─────────────┘     └─────────┘  │
│        ▲                                                            │       │
│        │                                                     (否) ────┘       │
│   ┌────┴─────────────────────────────────────────────────────────────────┐  │
│   │                      Streaming + Reasoning                           │  │
│   │   • 流式输出 deltas → 目标通道                                       │  │
│   │   • 推理块（reasoning blocks）处理与显示控制                         │  │
│   │   • 上下文修剪决策（pruning）                                        │  │
│   │   • 工具调用前权限检查                                               │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**完整流程步骤**：

1. **等待输入（Wait for Input）**
   - 监听来自 Gateway 的消息
   - 识别会话上下文
   - 触发 Loop 启动

2. **上下文组装（Context Assembly）**
   - 加载系统提示词（System Prompt）
   - 加载会话历史（Conversation History）
   - 加载相关记忆（Relevant Memories）
   - 加载可用工具说明（Available Tools）
   - 组装当前用户输入

3. **LLM 推理（LLM Inference）**
   - 发送组装好的上下文到 LLM API
   - 启动流式响应（Streaming Response）
   - 根据 session.reasoningLevel 控制推理块显示

4. **流式处理与决策（Streaming & Decision）**
   - **流式输出（Streaming）**: 实时接收并转发 assistant deltas 到目标通道
   - **推理控制（Reasoning）**: 处理 reasoning blocks，根据 reasoningLevel 决定是否显示
   - **上下文检查**: 监控 token 使用，触发 compaction 决策

5. **决策点（Decision Point）**
   - 判断 LLM 输出类型：直接回复 / 工具调用 / 需要更多信息
   - 如果是工具调用，解析工具名称和参数
   - 执行工具调用前权限检查
   - 如果是直接回复，完成流式输出

6. **工具执行（Tool Execution）**
   - 验证工具调用权限
   - 执行工具函数
   - 捕获执行结果或错误

7. **结果反馈（Result Feedback）**
   - 将工具执行结果反馈给 LLM
   - LLM 基于结果进行下一步推理
   - 可能产生新的工具调用（多轮循环）

8. **输出回复（Output Response）**
   - 生成最终回复内容
   - 通过 Gateway 流式发送到目标通道
   - 更新会话状态

**模型故障转移（Model Failover）**：

根据官方 CHANGELOG，Agent Runtime 支持模型故障转移机制：

```typescript
// 配置示例（openclaw.json）
{
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-20250514",
      "failover": {
        "enabled": true,
        "fallbackModels": ["gpt-4o", "gemini-2.0-flash"]
      }
    }
  }
}
```

故障转移策略：
1. 主模型调用失败时自动降级到备用模型
2. 支持配置多个备用模型按优先级尝试
3. 记录 failover 事件到会话日志

### Agent Loop 实现细节（Pi Agent Runtime）

OpenClaw 使用 **Pi Agent Runtime**（基于 `pi-agent-core`）作为核心 Agent 执行引擎，通过 RPC 模式与 Gateway 交互。根据官方 CHANGELOG 2026.2.23，最新版本还包含 **subagents** 和 **reasoning 控制** 功能：

**RPC 调用流程**：

```
1. Gateway 接收消息
        │
        ▼
2. agent RPC 验证参数
   • 解析 session，获取 sessionKey
   • 返回 { runId, acceptedAt }
        │
        ▼
3. agentCommand 运行 Agent
   • 解析模型 + thinking/verbose/reasoningLevel 默认值
   • 加载 skills snapshot
   • 调用 runEmbeddedPiAgent
        │
        ▼
4. runEmbeddedPiAgent 执行
   • 通过 per-session + global queues 序列化运行
   • 解析模型 + auth profile
   • 订阅 pi 事件并流式传输 assistant/tool deltas
   • 强制执行 timeout
        │
        ▼
5. subscribeEmbeddedPiSession
   • 桥接 pi-agent-core 事件到 OpenClaw
   • 流式输出到目标通道
```

**序列化执行模型**：

- **Per-session Queue**: 同一会话的请求按顺序处理，保证对话一致性
- **Global Queue**: 所有 Agent 运行全局串行化，避免资源竞争
- **Timeout 控制**: 强制超时机制，防止 Agent 无限运行

**子代理（Subagents）配置**（2026.2.23 新增）：

```typescript
// openclaw.json 配置
{
  "agents": {
    "defaults": {
      "subagents": {
        "runTimeoutSeconds": 300  // 子代理运行超时时间
      }
    }
  }
}
```

Subagents 用于：
1. 将复杂任务分解为并行子任务
2. 隔离不同子任务的上下文
3. 独立控制子任务的超时和资源

**推理级别控制（Reasoning Level）**：

| 级别 | 说明 |
|------|------|
| `off` | 关闭推理，直接输出 |
| `minimal` | 最小化推理 |
| `low` | 低级别推理 |
| `medium` | 中等级别推理（默认）|
| `high` | 高级别推理 |
| `xhigh` | 最高级别推理 |

用户可通过 `/think` 命令动态调整当前会话的 reasoningLevel。

**事件流类型**（Pi Runtime）：

| 事件类型 | 说明 |
|----------|------|
| `lifecycle` | Agent 生命周期事件（start/end/error） |
| `assistant` | 流式输出 deltas |
| `tool` | 工具调用事件 |
| `compaction` | 上下文压缩事件 |
| `reasoning` | 推理块事件（新增）|

### 2.3.2 事件驱动架构

Agent Runtime 采用事件驱动架构（Event-Driven Architecture），通过异步事件机制实现高并发和松耦合。

**事件总线设计**（Pi Agent Runtime 事件类型）：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Event Bus                                        │
│                                                                             │
│  Publisher ───────► Event Queue ───────► Event Router ───────► Subscriber  │
│                                                             (Event Handler) │
│                                                                             │
│  事件类型（Pi Runtime）：                                                    │
│  • lifecycle       - Agent 生命周期事件（start/end/error）                   │
│  • assistant       - 流式响应 deltas                                        │
│  • tool            - 工具调用事件                                           │
│  • compaction      - 上下文压缩事件                                         │
│                                                                             │
│  系统事件：                                                                  │
│  • USER_MESSAGE    - 用户消息                                                │
│  • AGENT_RESPONSE  - Agent 响应                                              │
│  • SESSION_START   - 会话开始                                                │
│  • SESSION_END     - 会话结束                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**事件处理流程**：

1. **事件发布（Publish）**: 组件产生事件并发布到事件总线
2. **事件排队（Queue）**: 事件进入异步队列，确保有序处理
3. **事件路由（Route）**: 根据事件类型分发给对应的处理器
4. **事件处理（Handle）**: 处理器执行业务逻辑
5. **事件确认（Ack）**: 处理成功后确认，失败可重试

**并发控制**：

- **单会话顺序**: 同一会话的消息按顺序处理，保证对话一致性
- **多会话并发**: 不同会话可并行处理，提高吞吐量
- **资源隔离**: 每个会话有独立的上下文和状态，互不干扰

### 2.3.3 上下文管理策略

上下文管理是 Agent Runtime 的关键挑战，需要在有限的 LLM 上下文窗口内最大化信息效用。

**上下文优先级模型**：

```
高优先级 ──────────────────────────────────────────────► 低优先级

系统提示词 > 当前用户输入 > 近期对话 > 相关记忆 > 技能说明 > 早期对话
（固定保留）  （必须包含）  （动态调整） （检索选择） （按需加载） （可压缩/丢弃）
```

**上下文压缩技术**：

1. **摘要生成**: 对早期对话生成摘要，替代原始消息
2. **记忆提取**: 将重要信息提取到长期记忆
3. **信息去重**: 移除冗余信息
4. **分段处理**: 超长内容分段处理

**Token 预算管理**：

```typescript
interface TokenBudget {
  maxTokens: number;        // LLM 最大上下文限制
  reservedTokens: {         // 预留 Token 分配
    systemPrompt: number;   // 系统提示词
    currentInput: number;   // 当前输入
    responseBuffer: number; // 响应预留
  };
  dynamicTokens: number;    // 动态分配额度
}
```

### 2.3.4 错误处理与恢复

Agent Runtime 实现了完善的错误处理机制，确保系统稳定性。

**错误分类**：

| 错误类型 | 说明 | 处理策略 |
|----------|------|----------|
| 网络错误 | LLM API 连接失败 | 指数退避重试 |
| 超时错误 | 请求响应超时 | 降级到备用模型 |
| 权限错误 | 工具调用被拒绝 | 返回友好提示 |
| 执行错误 | 工具执行异常 | 捕获错误并反馈 LLM |
| 上下文错误 | Token 超限 | 压缩上下文重试 |

**恢复策略**：

1. **重试机制**: 临时错误自动重试，最多 3 次
2. **降级处理**: 主模型失败时切换到备用模型
3. **优雅降级**: 复杂任务失败时提供简化方案
4. **人工介入**: 关键错误通知用户处理

---

## 2.4 通信协议

### 2.4.1 WebSocket 连接管理

Gateway 与客户端之间通过 WebSocket 协议进行实时通信，本节详述连接管理的实现细节。

**连接建立流程**：

```
┌─────────────┐                              ┌─────────────┐
│   Client    │                              │   Gateway   │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  1. HTTP Upgrade Request                   │
       │ ─────────────────────────────────────────►│
       │                                            │
       │  2. 身份验证                                 │
       │    • 本地信任检查（同一机器）                  │
       │    • 配对令牌验证（远程连接）                  │
       │                                            │
       │  3. WebSocket Handshake Response           │
       │ ◄─────────────────────────────────────────│
       │                                            │
       │  4. 连接建立，开始双向通信                    │
       │◄══════════════════════════════════════════►│
```

**身份验证机制**：

1. **本地信任（Local Trust）**
   - 同一台机器上的客户端自动信任
   - 通过文件系统权限控制访问
   - 适用于 CLI、macOS App 等本地客户端

2. **配对令牌（Pairing Token）**
   - 远程设备首次连接需要管理员批准
   - 使用短期有效的配对令牌进行认证
   - 支持设备白名单管理

**心跳机制**（官方配置格式）：

```typescript
// 心跳配置（openclaw.json 中的 agents.defaults.heartbeat）
interface HeartbeatConfig {
  every: string;         // 心跳间隔（默认 "30m"，即30分钟）
  target: string;        // 目标通道（"last" | "whatsapp" | "telegram" | "discord" | "none"）
  directPolicy: string;  // 直连策略（"allow" | "block"）
}

// 示例配置
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "directPolicy": "allow"
      }
    }
  }
}
```

**连接建立协议**：

WebSocket 连接建立后，客户端必须发送 `connect` 帧作为第一帧，完成身份验证和会话初始化：

```typescript
// connect 帧格式（必须是第一帧）
interface ConnectFrame {
  type: 'connect';
  token: string;           // 身份验证令牌
  minProtocol: number;     // 最低支持的协议版本
  maxProtocol: number;     // 最高支持的协议版本
  role: 'operator' | 'node';// 连接角色
  scopes: string[];        // 权限范围数组
  device: {
    id: string;            // 设备唯一标识
    publicKey: string;     // 设备公钥（用于签名验证）
    signature: string;     // 对 challenge nonce 的签名
    signedAt: number;      // 签名时间戳
    nonce: string;         // 服务端下发的 nonce
  };
  client: {
    name: string;          // 客户端名称
    version: string;       // 客户端版本
    platform: string;      // 平台标识（如 "macos", "ios", "android", "web"）
    capabilities: string[];// 支持的能力列表
  };
  idempotencyKey?: string; // 幂等性键（用于重连场景）
}

// connect 响应
interface ConnectResponse {
  type: 'connect_response';
  status: 'success' | 'error';
  sessionId?: string;      // 分配的会话 ID
  deviceToken?: string;    // 设备令牌（用于后续连接）
  serverInfo: {
    version: string;
    supportedFeatures: string[];
  };
  error?: ErrorInfo;
}
```

**Token 验证机制**：

Gateway 的身份验证流程基于 challenge-response 机制：

1. **连接 Challenge 流程**
```
Client          Gateway
  │                │
  │── connect ────▶│  1. 发送 connect 帧
  │                │
  │◄── challenge ──│  2. Gateway 发送 connect.challenge 事件
  │   (nonce, ts)  │     包含随机 nonce 和时间戳
  │                │
  │── connect ────▶│  3. 客户端签名 nonce 后重新发送 connect
  │  (含 signature)│
  │                │
  │◄── success ────│  4. 验证通过，返回 deviceToken
```

2. **签名 Payload 版本**
   - **v2（兼容版）**: 简单 nonce 签名，向后兼容
   - **v3（推荐版）**: 绑定 platform + deviceFamily，更安全

```typescript
// v3 签名 payload 示例
interface V3Payload {
  version: 'v3';
  platform: string;      // 如 "macos"
  deviceFamily: string;  // 如 "mac"
  nonce: string;         // 服务端下发的 nonce
  timestamp: number;     // 签名时间戳
}
```

3. **Token 类型**
   - **Gateway Token**（`OPENCLAW_GATEWAY_TOKEN`）
     - 从环境变量或配置文件读取的静态令牌
     - 用于本地客户端和已配对节点的认证
     - 格式：`oct_` 前缀的随机字符串
   
   - **Device Token**（通过配对获取）
     - 连接成功后 Gateway 下发的长期令牌
     - 存储于客户端，用于后续连接的快速认证
     - 可通过 `connect` 帧的 `token` 字段直接使用

4. **本地连接自动批准**
   - loopback 地址（127.0.0.1）
   - Tailnet 地址（100.x.x.x）
   - 以上地址范围内的连接可跳过显式配对批准

5. **远程连接配对流程**
   - 非本地连接需要管理员显式批准
   - 通过 `clawctl pair` 或 Gateway UI 进行配对
   - 批准后设备获得长期有效的 deviceToken

**幂等性键（Idempotency Keys）**：

对于可能产生副作用的操作（如发送消息、创建任务），客户端应提供幂等性键：

```typescript
interface IdempotentRequest {
  id: string;              // 请求唯一标识
  idempotencyKey: string;  // 幂等性键（客户端生成 UUID）
  type: RequestType;
  payload: unknown;
}

// Gateway 保证：相同 idempotencyKey 的请求只执行一次
// 响应中包含相同的 idempotencyKey 用于确认
interface IdempotentResponse {
  id: string;
  idempotencyKey: string;
  status: 'success' | 'error' | 'duplicate';
  // 'duplicate' 表示该请求已处理过，返回缓存结果
}
```

### 2.4.2 消息格式定义

OpenClaw 定义了标准化的消息格式，确保各组件间的互操作性。

**消息信封（Message Envelope）**：

```typescript
interface MessageEnvelope {
  version: string;        // 协议版本（如 "1.0"）
  id: string;            // 消息唯一标识（UUID）
  type: MessageType;     // 消息类型
  timestamp: number;     // 发送时间戳（Unix ms）
  source: EndpointInfo;  // 发送方信息
  target?: EndpointInfo; // 目标方信息（可选）
  payload: unknown;      // 消息载荷
  signature?: string;    // 签名（可选）
}
```

**消息类型定义**：

```typescript
enum MessageType {
  // 请求类型
  REQUEST = 'request',
  
  // 响应类型
  RESPONSE = 'response',
  
  // 事件类型
  EVENT = 'event',
  
  // 错误类型
  ERROR = 'error'
}

// 请求类型枚举
enum RequestType {
  HEALTH_CHECK = 'health',
  GET_STATUS = 'status',
  SEND_MESSAGE = 'send',
  AGENT_CONTROL = 'agent',
  SYSTEM_PRESENCE = 'presence'
}

// 事件类型枚举
enum EventType {
  TICK = 'tick',
  AGENT_EVENT = 'agent',
  PRESENCE_UPDATE = 'presence',
  SHUTDOWN = 'shutdown',
  MESSAGE_RECEIVED = 'message'
}
```

**标准消息载荷**：

```typescript
// 用户消息载荷
interface UserMessagePayload {
  content: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}

// Agent 响应载荷
interface AgentResponsePayload {
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
}

// 工具调用载荷
interface ToolCallPayload {
  tool: string;
  parameters: Record<string, unknown>;
  callId: string;
}

// 工具结果载荷
interface ToolResultPayload {
  callId: string;
  status: 'success' | 'error';
  result?: unknown;
  error?: ErrorInfo;
}
```

### 2.4.3 节点通信协议

Nodes（设备节点）通过 Gateway WebSocket 与 Gateway 通信，实现跨设备的能力调用。

> **说明**: 以下描述基于 OpenClaw 官方文档公开的功能说明，部分内部实现细节为基于观察的推测，可能随版本更新而变化。

**能力发现与调用流程**（官方文档确认）：

Nodes 通过 Gateway WebSocket 广告 capabilities + permission map，Gateway 据此进行能力路由。标准能力包括：

| 能力类别（caps） | 具体命令（commands）| 说明 |
|------------------|---------------------|------|
| `camera` | `camera.snap`, `camera.clip` | 相机拍照、录像 |
| `canvas` | `canvas.navigate`, `canvas.snapshot`, `canvas.eval` | 画布导航、截图、JS执行 |
| `screen` | `screen.record` | 屏幕录制 |
| `location` | `location.get` | 位置获取 |
| `voice` | - | 语音能力 |

**能力调用流程**（官方流程）：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │────►│   Gateway   │────►│    Node     │────►│   Target    │
│  Runtime    │     │             │     │  Selector   │     │    Node     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                            │
                                                            ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │◄────│   Gateway   │◄────│    Node     │◄────│   Target    │
│  Runtime    │     │             │     │  Selector   │     │    Node     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘

1. Agent 请求调用节点能力
2. Gateway 查询可用节点列表（node.list）
3. 根据能力匹配选择目标节点
4. Gateway 转发请求到目标节点（node.invoke）
5. 节点执行命令并返回结果
6. Gateway 将结果返回给 Agent
```

**节点管理命令**（官方 CLI 命令）：

| 命令 | 说明 |
|------|------|
| `node.list` | 列出所有已连接的节点 |
| `node.describe` | 获取节点详细信息（能力、状态）|
| `node.invoke` | 调用节点上的特定能力 |
| `node.approve` | 批准新节点配对 |
| `node.reject` | 拒绝节点配对请求 |

**调用示例**（基于实际使用模式）：

```typescript
// 获取节点列表
const nodes = await gateway.request('node.list', {});

// 调用特定节点的 camera.snap 能力
const result = await gateway.request('node.invoke', {
  nodeId: 'iphone-001',
  command: 'camera.snap',
  params: { facing: 'back' }
});
```

---

## 2.5 为什么 OpenClaw 会火

> **📌 作者观点声明**
> 
> 本节内容基于作者的个人观察和市场分析，包含主观判断和预测。以下观点不代表 OpenClaw 官方立场，也不构成投资建议。

OpenClaw 自开源以来迅速获得开发者社区的关注。本节从市场时机、产品定位、技术趋势和网络效应四个维度分析 OpenClaw 成功的原因。

### 2.5.1 市场时机：AI 应用的转折点

> **作者观点**: 2024-2025 年是 AI 应用的关键转折点，以下分析基于作者对行业趋势的观察。

**LLM 能力成熟（2024-2025）**

2024 年至 2025 年间，大语言模型能力实现了质的飞跃：

- **Claude 3.5 系列**: Anthropic 发布的 Claude 3.5 Sonnet 和 Opus 在推理能力上大幅提升，支持更复杂的逻辑分析和代码生成
- **GPT-4o**: OpenAI 推出的 GPT-4o 实现原生多模态支持，文本、图像、音频的统一处理能力为 Agent 应用开辟新场景
- **成本下降**: LLM API 成本在两年内下降 10-100 倍，使得高频调用的 Agent 应用在经济上可行
- **本地模型**: Llama 3、Qwen 等开源模型的性能接近商业模型，为本地部署提供可能

**用户需求觉醒**

ChatGPT 等产品的普及完成了市场教育：

- 用户不再满足于简单的问答对话，期待 AI 能够实际执行复杂任务
- 企业用户关注数据隐私和合规，寻求自托管解决方案
- 开发者希望构建定制化的 AI 应用，而非使用标准化的 SaaS 产品

**隐私法规驱动**

全球范围内数据保护法规日趋严格：

- GDPR（欧盟通用数据保护条例）要求数据最小化和用户控制
- 中国企业面临数据本地化要求
- 医疗、金融等敏感行业对数据主权有强制要求

### 2.5.2 产品定位：填补市场空白

> **作者观点**: OpenClaw 填补了云服务与完全自研之间的市场空白，以下竞品分析基于作者的市场观察。

**竞品分析矩阵**

| 产品 | 部署模式 | 数据控制 | 定制化 | 成本结构 | 多平台 |
|------|----------|----------|--------|----------|--------|
| **ChatGPT** | 云服务 | 用户无控制 | 受限 | 订阅费 | 否 |
| **Claude** | 云服务 | 用户无控制 | 受限 | 订阅费 | 否 |
| **Character.AI** | 云服务 | 用户无控制 | 有限 | 订阅费 | 否 |
| **OpenClaw** | 自托管 | 完全控制 | 完全开放 | API 调用费 | 是 |
| **自研方案** | 自研 | 完全控制 | 完全开放 | 开发成本 | 需开发 |

**OpenClaw 的差异化优势**：

1. **比云服务更私密**: 数据完全本地处理，不经过第三方服务器
2. **比自研更经济**: 基于成熟开源框架，省去从头开发的成本
3. **开箱即用的多平台**: 内置支持主流聊天平台，无需额外集成
4. **可扩展的插件系统**: Skill 机制允许无代码扩展功能

**目标用户画像**（作者分析）：

- **技术型个人用户**: 关注隐私，具备技术能力，希望定制个人 AI 助手
- **中小企业**: 需要 AI 自动化但不愿承担 SaaS 订阅成本
- **开发者**: 希望基于 OpenClaw 构建垂直领域应用
- **数据敏感行业**: 医疗、金融、法律等行业用户

### 2.5.3 技术趋势：从"聊天"到"行动"

> **作者观点**: AI 应用正经历从聊天机器人到自主代理的范式转移。

**AI 应用演进三阶段**（作者归纳）

```
阶段一：聊天机器人（2022-2023）
├─ 能力：自然语言理解与生成
├─ 局限：只能对话，无法执行实际任务
└─ 代表：早期 ChatGPT

阶段二：工具使用（2023-2024）
├─ 能力：调用预定义工具完成任务
├─ 局限：工具需要手动集成，灵活性受限
└─ 代表：ChatGPT Plugins、Copilot

阶段三：自主代理（2024-2025）
├─ 能力：自主规划、动态工具调用、任务执行
├─ 特征：具备记忆、可扩展、多平台
└─ 代表：OpenClaw、Claude Computer Use、AutoGPT
```

**技术范式转移**（作者观察）

传统 AI 应用采用"意图识别 → 预定义流程 → 执行"的模式，而现代 Agent 采用"自然语言理解 → 自主推理 → 动态执行"的模式：

| 维度 | 传统模式 | Agent 模式 |
|------|----------|------------|
| 交互方式 | 点击/命令 | 自然语言对话 |
| 流程定义 | 硬编码 | 动态生成 |
| 适应性 | 预定义场景 | 开放式场景 |
| 扩展方式 | 开发新功能 | 添加新工具 |

**OpenClaw 的技术前瞻性**（作者评价）：

- 率先实现本地优先的 Agent 架构
- 支持多模型切换和故障转移
- 事件驱动架构支持高并发
- 模块化设计适应技术演进

### 2.5.4 网络效应：飞轮加速

> **作者观点**: OpenClaw 的开源模式可能形成自增强的社区生态。

**开源社区驱动**（作者推测的飞轮模型）

```
        ┌─────────────┐
        │   开源代码   │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │  开发者参与  │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │  Skill 生态  │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │  功能增强   │
        └──────┬──────┘
               ▼
        ┌─────────────┐
        │  更多用户   │
        └──────┬──────┘
               │
               └──────────► 回到起点，循环增强
```

**飞轮效应分析**（作者观点）：

1. **更多用户 → 更多反馈**: 用户基数扩大带来丰富的使用场景和 bug 报告
2. **更多反馈 → 更好产品**: 快速迭代改进，提升用户体验
3. **更好产品 → 更多用户**: 口碑传播，用户增长加速
4. **更多开发者 → 更多 Skill**: 社区贡献丰富功能生态
5. **更多 Skill → 更强功能**: 平台能力边界持续扩展

### 2.5.5 技术同源性：与自动驾驶的共鸣

> **📌 非技术性概念类比**
> 
> 本节内容纯属作者个人的跨领域联想，旨在帮助具有自动驾驶背景的读者建立直观理解。这些类比**不构成技术架构的准确描述**，两种系统的技术实现差异巨大。

作为自动驾驶领域的从业者，能够从专业视角理解 OpenClaw 的设计哲学：

**系统架构对比**（概念类比，非技术描述）

| OpenClaw 组件 | 自动驾驶对应概念 | 类比说明（仅作理解参考）|
|---------------|-----------------|------------------------|
| **Gateway** | 车载中央计算平台 | 统一处理多源输入，协调各子系统 |
| **Agent** | 自动驾驶算法栈 | 感知 → 决策 → 规划的完整闭环 |
| **Channels** | 传感器接口 | CAN 总线、以太网等数据接入 |
| **Memory** | 高精地图 + 记忆系统 | 存储环境信息和历史轨迹 |
| **Tools** | 执行器接口 | 控制转向、油门、刹车等 |
| **Skills** | 算法模块 | 车道保持、自动泊车等功能 |

**设计原则共通性**（作者的主观观察）：

1. **实时性要求**: 两者都需要低延迟的响应能力
2. **可靠性要求**: 系统故障可能导致严重后果，需要完善的错误处理
3. **模块化设计**: 支持功能独立升级和故障隔离
4. **数据闭环**: 运行数据反馈驱动持续优化

**创业机会洞察**（作者观点）：

自动驾驶领域存在大量可用 OpenClaw 解决的痛点：

- **数据标注**: 自动化数据预处理和标注任务分发
- **仿真测试**: 测试场景生成和结果分析
- **模型监控**: 模型性能追踪和异常检测
- **文档管理**: 技术文档的智能检索和问答

---

## 本章小结

本章深入剖析了 OpenClaw 的核心架构，从官方文档出发呈现系统的技术设计：

**官方架构**方面，OpenClaw 采用扁平化的功能组件设计，核心包括 Gateway WebSocket Control Plane、Channels、Pi Agent Runtime、Session Management 和 Cron/Webhooks。这种设计与传统的分层架构不同，更加强调组件间的松耦合和职责分离。

**Gateway 核心**作为 WebSocket 控制平面运行在本地 `127.0.0.1:18789`，协调 Channels、Pi Agent、CLI、WebChat UI 和移动设备节点之间的通信。Session Management 维护会话状态，支持 dmScope 配置和上下文压缩。

**Agent Runtime** 使用 Pi Agent Runtime（基于 `pi-agent-core`）作为核心执行引擎，通过 RPC 模式与 Gateway 交互。Agent Loop 包含 streaming、reasoning、failover 等关键环节，支持模型故障转移和子代理（subagents）功能。

**通信协议**采用 WebSocket 实现实时双向通信，定义了标准化的消息格式和身份验证机制。节点通信协议支持跨设备能力调用（camera、canvas、screen、location、voice）。

**市场分析**（作者观点）表明，OpenClaw 的成功源于准确的市场时机把握、差异化的产品定位、顺应技术趋势的架构设计以及开源社区的潜在网络效应。其本地优先的架构设计填补了云服务与完全自研之间的市场空白。

---

## 参考资料

1. OpenClaw 官方文档 - 架构概览: https://docs.openclaw.ai/concepts/architecture
2. OpenClaw 官方文档 - Agent Loop: https://docs.openclaw.ai/concepts/agent-loop
3. OpenClaw 官方文档 - Session: https://docs.openclaw.ai/concepts/session
4. OpenClaw 官方文档 - Gateway Protocol: https://docs.openclaw.ai/gateway/protocol
5. OpenClaw 官方文档 - Gateway Configuration: https://docs.openclaw.ai/gateway/configuration
6. OpenClaw GitHub 仓库: https://github.com/openclaw/openclaw
7. OpenClaw Gateway 源码: https://github.com/openclaw/openclaw/tree/main/src/gateway
8. OpenClaw 入门指南: https://docs.openclaw.ai/start/getting-started

---

## 术语表

| 术语 | 英文 | 定义 |
|------|------|------|
| 网关 | Gateway | OpenClaw 的核心守护进程（daemon），WebSocket 控制平面，负责消息路由和组件协调 |
| 代理 | Agent | AI 智能体，执行具体任务的实体 |
| 通道 | Channel | 与外部聊天平台的连接 |
| 技能 | Skill | 可插拔的功能扩展模块 |
| 工具 | Tool | Agent 可调用的具体功能 |
| 会话 | Session | Agent 与用户的对话上下文，通过 sessionKey 唯一标识 |
| 节点 | Node | 连接到 Gateway 的能力主机（capability host），提供 caps 和 commands |
| Provider | Provider | 聊天平台集成实现 |
| sessionKey | sessionKey | 会话键（如 `agent:<agentId>:<mainKey>`），用于唯一标识和索引会话 |
| dmScope | dmScope | 私信范围配置（默认 per-channel-peer，支持 main/per-peer/per-channel-peer/per-account-channel-peer）|
| compactionCount | compactionCount | 会话上下文压缩次数计数器 |
| reasoningLevel | reasoningLevel | 推理级别控制（off/minimal/low/medium/high/xhigh）|
| groupActivation | groupActivation | 群聊激活模式（mention/always）|
| subagents | Subagents | 子代理机制，用于并行任务执行 |
| failover | Failover | 模型故障转移机制 |
| streaming | Streaming | 流式输出，实时转发 LLM 响应 deltas |
| caps | Capabilities | 节点声明的高阶能力类别（如 camera、canvas、screen、location、voice） |
| commands | Commands | 节点支持的具体可执行命令（如 camera.snap、screen.record） |
