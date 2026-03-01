# 第5章 进阶主题

本章深入探讨 OpenClaw 的高级配置与优化技术。当系统进入生产环境或需要支撑复杂业务场景时，基础配置往往难以满足需求。本章将涵盖多代理系统的高级配置策略、性能优化技术、调试与监控方案，以及生产部署方法，帮助读者构建企业级的 AI 代理系统。

> **参考文档**：本章内容基于 OpenClaw 官方文档编写
> - [Gateway 配置参考](https://docs.openclaw.ai/gateway/configuration-reference)
> - [多代理概念指南](https://docs.openclaw.ai/concepts/multi-agent)
> - [Cron Jobs](https://docs.openclaw.ai/automation/cron-jobs)
> - [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)

---

## 5.1 多代理高级配置

OpenClaw 的多代理系统允许在同一 Gateway 下运行多个独立的代理实例，每个代理拥有独立的 Workspace、`agentDir`（状态目录）和会话存储。本节介绍如何设计和配置复杂的多代理架构。

### 5.1.1 什么是"一个代理"

在 OpenClaw 中，一个**代理**是一个完全独立的作用域，包含以下组成部分：

| 组件 | 说明 | 存储路径 |
|------|------|----------|
| **Workspace** | 文件、AGENTS.md/SOUL.md/USER.md、本地笔记、人格规则 | `~/.openclaw/workspace-<agentId>` |
| **AgentDir** | 认证配置文件、模型注册表、代理级配置 | `~/.openclaw/agents/<agentId>/agent` |
| **Session Store** | 聊天记录和路由状态 | `~/.openclaw/agents/<agentId>/sessions` |

**重要原则**：`agentDir` 绝对不能在多个代理之间复用，否则会导致认证和会话冲突。

### 5.1.2 代理配置结构

OpenClaw 使用 JSON5 格式（支持注释和尾随逗号）进行配置，所有字段均为可选。

#### 单代理模式（默认）

如果不进行多代理配置，OpenClaw 默认运行单代理模式：

- `agentId` 默认为 `main`
- 会话键格式为 `agent:main:<mainKey>`
- Workspace 默认为 `~/.openclaw/workspace`
- 状态目录默认为 `~/.openclaw/agents/main/agent`

#### 多代理配置结构

```json5
{
  agents: {
    list: [
      {
        id: "home",
        default: true,
        name: "Home",
        workspace: "~/.openclaw/workspace-home",
        agentDir: "~/.openclaw/agents/home/agent"
      },
      {
        id: "work",
        name: "Work",
        workspace: "~/.openclaw/workspace-work",
        agentDir: "~/.openclaw/agents/work/agent"
      },
      {
        id: "dev",
        name: "Dev Assistant",
        workspace: "~/.openclaw/workspace-dev",
        agentDir: "~/.openclaw/agents/dev/agent",
        identity: {
          name: "DevBot",
          emoji: "🤖",
          theme: "coding assistant"
        },
        groupChat: {
          mentionPatterns: ["@devbot", "@dev"]
        }
      }
    ]
  }
}
```

**关键字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 代理唯一标识符 |
| `default` | boolean | 否 | 是否为默认代理，路由无匹配时回退到此代理 |
| `name` | string | 否 | 代理显示名称 |
| `workspace` | string | 否 | 代理工作区路径 |
| `agentDir` | string | 是 | 代理状态目录，**每个代理必须独立** |
| `identity` | object | 否 | 代理身份设置（名称、主题、emoji、头像） |
| `groupChat` | object | 否 | 群聊配置，如提及模式 |

#### 使用命令行创建代理

```bash
# 使用向导添加新代理
openclaw agents add work

# 指定工作区路径
openclaw agents add work --workspace ~/.openclaw/workspace-work

# 列出所有代理
openclaw agents list

# 查看代理绑定关系
openclaw agents list --bindings
```

### 5.1.3 路由规则与绑定

路由规则决定了入站消息如何分配给不同的代理。OpenClaw 使用 `bindings` 配置实现灵活的代理路由。

#### 绑定配置结构

```json5
{
  agents: {
    list: [
      { id: "home", workspace: "~/.openclaw/workspace-home", agentDir: "~/.openclaw/agents/home/agent" },
      { id: "work", workspace: "~/.openclaw/workspace-work", agentDir: "~/.openclaw/agents/work/agent" }
    ]
  },
  bindings: [
    { agentId: "home", match: { channel: "whatsapp", accountId: "personal" } },
    { agentId: "work", match: { channel: "whatsapp", accountId: "biz" } },
    { agentId: "home", match: { channel: "telegram", peer: { kind: "direct", id: "+15551234567" } } }
  ]
}
```

#### 路由优先级（从高到低）

| 优先级 | 匹配类型 | 说明 |
|--------|----------|------|
| 1 | `peer` 精确匹配 | 特定 DM/群组/频道 ID |
| 2 | `parentPeer` 匹配 | 线程继承匹配 |
| 3 | `guildId + roles` | Discord 角色路由 |
| 4 | `guildId` | Discord 服务器匹配 |
| 5 | `teamId` | Slack 团队匹配 |
| 6 | `accountId` 匹配 | 特定账户绑定 |
| 7 | `accountId: "*"` | 通道级匹配（所有账户） |
| 8 | `default: true` 的代理 | 默认代理兜底 |

**重要说明**：
- 绑定省略 `accountId` 时，仅匹配默认账户
- 使用 `accountId: "*"` 作为通道级回退（所有账户）
- 多个匹配规则在同一层级时，配置顺序中**第一条**生效

#### 基于用户的 DM 路由（单账户多代理）

可以在一个 WhatsApp 账户下，将不同的私信路由到不同代理：

```json5
{
  agents: {
    list: [
      { id: "alex", workspace: "~/.openclaw/workspace-alex", agentDir: "~/.openclaw/agents/alex/agent" },
      { id: "mia", workspace: "~/.openclaw/workspace-mia", agentDir: "~/.openclaw/agents/mia/agent" }
    ]
  },
  bindings: [
    {
      agentId: "alex",
      match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230001" } }
    },
    {
      agentId: "mia",
      match: { channel: "whatsapp", peer: { kind: "direct", id: "+15551230002" } }
    }
  ],
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+15551230001", "+15551230002"]
    }
  }
}
```

#### 使用 CLI 管理绑定

```bash
# 列出所有绑定
openclaw agents list --bindings

# JSON 格式输出
openclaw agents list --bindings --json
```

> **注意**：绑定配置需直接编辑 `openclaw.json` 文件，CLI 暂不提供 bind/unbind 命令。

### 5.1.4 代理身份与群聊配置

#### 身份设置

每个代理可以配置独立的身份信息：

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "OpenClaw",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/openclaw.png"
        }
      }
    ]
  }
}
```

通过 CLI 设置身份：

```bash
# 从 IDENTITY.md 文件加载
openclaw agents set-identity --workspace ~/.openclaw/workspace --from-identity

# 显式设置字段
openclaw agents set-identity --agent main --name "OpenClaw" --emoji "🦞" --avatar avatars/openclaw.png
```

#### 群聊提及模式

```json5
{
  agents: {
    list: [
      {
        id: "family",
        groupChat: {
          mentionPatterns: ["@family", "@familybot"]
        }
      }
    ]
  }
}
```

### 5.1.5 代理间通信控制

OpenClaw 支持配置代理之间的工具调用权限：

```json5
{
  tools: {
    agentToAgent: {
      enabled: false,        // 是否启用代理间通信
      allow: ["home", "work"] // 允许通信的目标代理列表（当 enabled 为 true 时）
    }
  }
}
```

**使用场景**：
- `enabled: false`：代理完全隔离，无法相互调用
- `enabled: true` + `allow: [...]`：仅允许向指定代理发起调用

---

## 5.2 性能优化

性能优化是生产环境部署的核心考量。OpenClaw 提供多种配置选项来优化延迟、内存使用和并发处理能力。

### 5.2.1 并发控制配置

OpenClaw 支持配置代理和子代理的并发数：

```json5
{
  agents: {
    defaults: {
      maxConcurrent: 1,       // 代理级最大并发数（默认：1）
      subagents: {
        maxConcurrent: 1,     // 子代理级最大并发数（默认：1）
        model: "minimax/MiniMax-M2.1",  // 子代理使用的模型
        runTimeoutSeconds: 900,         // 子代理运行超时（秒）
        archiveAfterMinutes: 60         // 归档时间（分钟）
      }
    }
  }
}
```

### 5.2.2 模型配置优化

#### 模型故障转移

OpenClaw 支持多模型提供商配置，实现自动故障转移：

```json5
{
  models: {
    mode: "merge",
    providers: {
      "anthropic": {
        baseUrl: "https://api.anthropic.com",
        apiKey: "${ANTHROPIC_API_KEY}",
        api: "anthropic-messages",
        models: [
          { id: "claude-opus-4-6", maxTokens: 4096 }
        ]
      },
      "openai": {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "${OPENAI_API_KEY}",
        api: "openai-chat",
        models: [
          { id: "gpt-4o", maxTokens: 4096 }
        ]
      }
    }
  },
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["openai/gpt-4o"]
      }
    }
  }
}
```

**重要说明**：
- `models.providers` 是**对象**类型（object），键为提供商 ID
- 代理的模型配置在 `agents.defaults.model`，不在 `models.defaults`
- 使用新的模型 ID 格式，如 `claude-opus-4-6`

#### 通道级模型覆盖

可以为特定通道或聊天设置固定的模型：

```json5
{
  channels: {
    modelByChannel: {
      discord: {
        "123456789012345678": "anthropic/claude-opus-4-6"
      },
      slack: {
        C1234567890: "openai/gpt-4.1"
      },
      telegram: {
        "-1001234567890": "openai/gpt-4.1-mini",
        "-1001234567890:topic:99": "anthropic/claude-sonnet-4-6"
      }
    }
  }
}
```

### 5.2.3 会话压缩与清理

OpenClaw 自动压缩会话历史以控制上下文长度：

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "safeguard",           // 压缩模式："default" | "safeguard"
        reserveTokensFloor: 24000,   // 保留的最低 token 数
        memoryFlush: {
          enabled: true,
          softThresholdTokens: 6000,
          systemPrompt: "You are a memory management assistant...",
          prompt: "Summarize the following conversation..."
        }
      }
    }
  }
}
```

**压缩策略**：
- `mode`: 压缩模式，`"default"` 为默认模式，`"safeguard"` 为安全模式
- `reserveTokensFloor`: 会话保留的最低 token 数量
- `memoryFlush`: 内存刷新配置，用于在会话过长时生成摘要
  - `enabled`: 是否启用内存刷新
  - `softThresholdTokens`: 软阈值 token 数
  - `systemPrompt`: 系统提示词
  - `prompt`: 用户提示词模板

### 5.2.4 上下文剪枝

OpenClaw 支持自动剪枝旧的工具结果以控制上下文长度：

```json5
{
  agents: {
    defaults: {
      contextPruning: {
        enabled: true,               // 是否启用上下文剪枝
        maxToolResults: 20,          // 保留的最大工具结果数
        preserveRecent: 5            // 始终保留的最近结果数
      }
    }
  }
}
```

**配置说明**：
- `enabled`: 启用上下文剪枝功能
- `maxToolResults`: 当工具结果超过此数量时触发剪枝
- `preserveRecent`: 始终保留的最近工具结果数量

### 5.2.5 消息流式输出

Telegram 等通道支持流式响应，改善用户体验：

```json5
{
  channels: {
    telegram: {
      streaming: "partial",  // off | partial | block | progress
      // off: 关闭流式
      // partial: 流式预览（发送消息 + 编辑）
      // block: 分块发送
      // progress: 进度指示器
    }
  }
}
```

### 5.2.6 Cron 任务优化

#### Cron 执行模式

```json5
{
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",     // 清理已完成的隔离运行会话
    runLog: {
      maxBytes: "2mb",           // 运行日志大小限制（支持字符串格式）
      keepLines: 2000            // 保留的日志行数（默认：2000）
    }
  }
}
```

#### Cron 调度错峰

OpenClaw 自动为整点调度表达式添加最多 5 分钟的错峰窗口，减少负载峰值：

```json5
{
  cron: {
    jobs: [
      {
        jobId: "hourly-task",
        schedule: {
          kind: "cron",
          cron: "0 * * * *",      // 每小时执行
          staggerMs: 0            // --exact 强制精确时间
        }
      }
    ]
  }
}
```

#### Cron 调度错峰

OpenClaw 自动为整点调度表达式添加最多 5 分钟的错峰窗口，减少负载峰值：

```json5
{
  cron: {
    jobs: [
      {
        jobId: "hourly-task",
        schedule: {
          kind: "cron",
          cron: "0 * * * *",      // 每小时执行
          staggerMs: 0            // --exact 强制精确时间
        }
      }
    ]
  }
}
```

---

## 5.3 调试与监控

完善的调试和监控体系是保障系统稳定运行的基础。

### 5.3.1 日志系统

OpenClaw 提供详细的日志记录功能，支持通过 CLI 查看。

#### 查看日志命令

```bash
# 查看最近日志
openclaw logs

# 实时跟踪日志
openclaw logs --follow

# JSON 格式输出
openclaw logs --json

# 限制输出行数
openclaw logs --limit 500

# 本地时区时间戳
openclaw logs --local-time

# 组合使用
openclaw logs --follow --local-time
```

#### Gateway 日志级别

启动 Gateway 时指定日志级别：

```bash
# 调试模式启动
openclaw gateway --log-level debug

# 或使用环境变量
DEBUG=openclaw:* openclaw gateway

# 特定模块调试
DEBUG=openclaw:agent,openclaw:tools openclaw gateway
```

### 5.3.2 诊断命令

#### doctor 命令

```bash
# 运行完整系统诊断
openclaw doctor

# 深度扫描（检查所有组件）
openclaw doctor --deep

# 自动修复问题
openclaw doctor --repair
openclaw doctor --fix

# 其他常用选项
openclaw doctor --force              # 强制修复
openclaw doctor --yes                # 自动确认
openclaw doctor --non-interactive    # 非交互模式
```

#### Gateway 状态管理

```bash
# 查看 Gateway 运行状态
openclaw gateway status

# 启动 Gateway
openclaw gateway start

# 停止 Gateway
openclaw gateway stop

# 重启 Gateway
openclaw gateway restart
```

#### 通道状态检查

```bash
# 检查所有通道状态
openclaw channels status

# 探针测试通道连接
openclaw channels status --probe
```

### 5.3.3 技能管理

```bash
# 列出已安装技能
openclaw skills list

# 显示符合条件的技能（满足依赖）
openclaw skills list --eligible

# 查看技能详情
openclaw skills info coding-agent

# 检查技能更新
openclaw skills check
```

### 5.3.4 会话管理

```bash
# 列出活跃会话（默认显示最近活跃的会话）
openclaw sessions

# 查看所有代理的会话
openclaw sessions --all-agents

# 按代理筛选
openclaw sessions --agent main

# 显示指定时间内活跃的会话（分钟）
openclaw sessions --active 30

# JSON 格式输出
openclaw sessions --json

# 清理已完成/过期会话
openclaw sessions cleanup
```

---

## 5.4 沙箱与安全配置

OpenClaw 支持通过 Docker 容器运行工具，限制执行环境的影响范围。

### 5.4.1 沙箱模式

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",    // off | non-main | all
        scope: "session",    // session | agent | shared
        prune: {             // 沙箱自动清理配置
          idleHours: 24,     // 空闲多少小时后清理
          maxAgeDays: 7      // 最大保留天数
        }
      }
    }
  }
}
```

**模式说明**：

| 模式 | 说明 |
|------|------|
| `off` | 不使用沙箱，所有工具在主机上运行 |
| `non-main` | 仅对非主会话使用沙箱（推荐） |
| `all` | 所有会话都在沙箱中运行 |

**作用域说明**：

| 作用域 | 说明 |
|--------|------|
| `session` | 每个会话一个容器（默认） |
| `agent` | 每个代理一个容器 |
| `shared` | 所有沙箱化会话共享一个容器 |

### 5.4.2 工作区访问控制

```json5
{
  agents: {
    defaults: {
      sandbox: {
        workspaceAccess: "none"  // none | ro | rw
      }
    }
  }
}
```

| 模式 | 说明 |
|------|------|
| `none` | 沙箱使用独立工作区（`~/.openclaw/sandboxes`） |
| `ro` | 以只读方式挂载代理工作区到 `/agent` |
| `rw` | 以读写方式挂载代理工作区到 `/workspace` |

### 5.4.3 自定义挂载

```json5
{
  agents: {
    defaults: {
      sandbox: {
        docker: {
          binds: ["/home/user/source:/source:ro", "/var/data/myapp:/data:ro"]
        }
      }
    },
    list: [
      {
        id: "build",
        sandbox: {
          docker: {
            binds: ["/mnt/cache:/cache:rw"]
          }
        }
      }
    ]
  }
}
```

### 5.4.4 沙箱浏览器

```json5
{
  agents: {
    defaults: {
      sandbox: {
        browser: {
          enabled: false,              // 是否启用沙箱浏览器（默认：false）
          autoStart: true,             // 自动启动浏览器
          autoStartTimeoutMs: 12000,   // 启动超时（默认：12000ms）
          network: "openclaw-sandbox-browser",
          allowHostControl: false,
          cdpPort: 9222,               // Chrome DevTools Protocol 端口
          cdpSourceRange: "172.21.0.1/32",
          vncPort: 5900,               // VNC 端口
          noVncPort: 6080,             // noVNC Web 端口
          headless: false,             // 是否无头模式
          enableNoVnc: true            // 是否启用 noVNC
        }
      }
    }
  }
}
```

---

## 5.5 生产环境部署

### 5.5.1 环境配置分离

建议区分开发、测试和生产环境：

```bash
# 使用不同配置文件
openclaw gateway --config ~/.openclaw/config/production.json

# 或使用环境变量
OPENCLAW_PROFILE=production openclaw gateway
```

配置目录结构示例：

```
~/.openclaw/
├── config/
│   ├── development.json
│   ├── staging.json
│   └── production.json
└── agents/
    ├── home/agent/
    ├── work/agent/
    └── dev/agent/
```

### 5.5.2 Gateway 安全配置

```json5
{
  gateway: {
    port: 18789,
    mode: "local",
    bind: "loopback",     // loopback | all
    auth: {
      mode: "token",      // token | none
      token: "${GATEWAY_TOKEN}"
    },
    tailscale: {
      mode: "off",        // off | client | server
      resetOnExit: false
    }
  }
}
```

### 5.5.3 通道安全配置

#### DM 和群组访问策略

所有通道支持 DM 策略和群组策略配置：

**DM 策略**：

| 策略 | 行为 |
|------|------|
| `pairing` (默认) | 未知发送者获得一次性配对码，需所有者批准 |
| `allowlist` | 仅允许 `allowFrom` 中的发送者 |
| `open` | 允许所有入站 DM（需 `allowFrom: ["*"]`） |
| `disabled` | 忽略所有入站 DM |

**群组策略**：

| 策略 | 行为 |
|------|------|
| `allowlist` (默认) | 仅允许匹配配置的群组 |
| `open` | 绕过群组白名单（提及限制仍适用） |
| `disabled` | 阻止所有群组/房间消息 |

#### Telegram 安全配置示例

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",
      dmPolicy: "pairing",
      allowFrom: ["tg:123456789"],
      groups: {
        "*": { requireMention: true },
        "-1001234567890": {
          allowFrom: ["@admin"],
          systemPrompt: "Keep answers brief."
        }
      },
      configWrites: false  // 阻止 Telegram 发起的配置写入
    }
  }
}
```

#### WhatsApp 安全配置示例

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "pairing",
      allowFrom: ["+15555550123", "+447700900123"],
      groups: {
        "*": { requireMention: true }
      },
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567"],
      sendReadReceipts: true
    }
  }
}
```

### 5.5.4 备份与恢复

#### 配置备份

```bash
# 备份配置目录
tar -czf openclaw-config-backup.tar.gz ~/.openclaw/config/

# 备份代理状态
tar -czf openclaw-agents-backup.tar.gz ~/.openclaw/agents/

# 完整备份（排除日志和缓存）
tar -czf openclaw-full-backup.tar.gz ~/.openclaw/ \
  --exclude='*.log' \
  --exclude='cache/' \
  --exclude='logs/'
```

#### 数据恢复

```bash
# 恢复配置
tar -xzf openclaw-config-backup.tar.gz -C /

# 完整恢复
tar -xzf openclaw-full-backup.tar.gz -C /
```

**建议**：定期将备份文件同步到云存储或版本控制系统。

### 5.5.5 Cron 任务配置

#### 添加定时任务

```bash
# 一次性提醒任务
openclaw cron add \
  --name "Reminder" \
  --at "2026-03-01T09:00:00Z" \
  --session main \
  --system-event "提醒：检查今日待办事项" \
  --wake now \
  --delete-after-run

# 周期性任务（Main 会话）
openclaw cron add \
  --name "health-check" \
  --schedule "*/5 * * * *" \
  --session main \
  --system-event "执行系统健康检查"

# 隔离任务（独立会话，带通知）
openclaw cron add \
  --name "daily-report" \
  --schedule "0 9 * * *" \
  --tz "Asia/Shanghai" \
  --session isolated \
  --message "生成昨日工作总结报告" \
  --announce \
  --channel telegram \
  --to "123456789"

# 每周报告
openclaw cron add \
  --name "weekly-report" \
  --schedule "0 10 * * 1" \
  --session isolated \
  --message "生成本周工作报告" \
  --announce
```

#### 管理定时任务

```bash
# 列出所有任务
openclaw cron list

# 查看任务运行历史
openclaw cron runs
openclaw cron runs --id <job-id>

# 禁用/启用任务
openclaw cron disable <job-id>
openclaw cron enable <job-id>

# 编辑任务
openclaw cron edit <job-id> --announce --channel telegram --to "123456789"

# 立即运行任务
openclaw cron run <job-id>

# 删除任务
openclaw cron rm <job-id>
```

#### Cron 任务配置参数

| 参数 | 说明 |
|------|------|
| `--name` | 任务名称 |
| `--schedule` | Cron 表达式（5字段或6字段） |
| `--at` | 一次性执行时间（ISO 8601） |
| `--tz` | 时区（IANA 格式，如 Asia/Shanghai） |
| `--session` | 执行模式：`main` 或 `isolated` |
| `--message` | 代理消息（isolated 模式） |
| `--system-event` | 系统事件（main 模式） |
| `--announce` | 通知模式（isolated 默认） |
| `--no-deliver` | 不发送通知 |
| `--channel` | 通知通道 |
| `--to` | 通知目标 |
| `--wake` | 唤醒模式：`now` 或 `next-heartbeat` |
| `--delete-after-run` | 运行后删除（一次性任务） |
| `--exact` | 精确时间（无错峰） |
| `--stagger` | 错峰窗口（如 30s, 1m, 5m） |

---

## 本章小结

本章系统介绍了 OpenClaw 的进阶主题，涵盖以下五个核心领域：

**多代理高级配置**：每个代理拥有独立的 Workspace、`agentDir` 和会话存储。通过 `agents.list` 配置多代理，`bindings` 配置路由规则。路由优先级从 `peer` 精确匹配到默认代理回退。`agentDir` 绝不能在代理间复用。

**性能优化**：通过 `maxConcurrent` 控制并发数，通过 `compaction` 配置会话压缩和 memoryFlush，通过 `contextPruning` 配置上下文剪枝，通过 `modelByChannel` 实现通道级模型覆盖。Cron 任务支持错峰调度以减少负载峰值。

**调试与监控**：使用 `openclaw logs` 查看日志（支持 `--follow`、`--json`、`--limit`、`--local-time` 等选项），`openclaw doctor` 运行诊断，`openclaw gateway status` 检查 Gateway 状态。`openclaw skills` 管理技能，`openclaw sessions` 管理会话。

**沙箱与安全**：通过 `sandbox.mode` 和 `sandbox.scope` 配置容器化执行环境。支持工作区访问控制和自定义挂载。生产环境应配置适当的 DM 和群组访问策略。

**生产环境部署**：使用环境分离、安全配置、备份恢复策略和 Cron 任务管理，构建稳定可靠的 OpenClaw 生产环境。

---

## 参考资源

### 官方文档

- [Gateway 配置参考](https://docs.openclaw.ai/gateway/configuration-reference)
- [多代理路由](https://docs.openclaw.ai/concepts/multi-agent)
- [Cron Jobs](https://docs.openclaw.ai/automation/cron-jobs)
- [Sandboxing](https://docs.openclaw.ai/gateway/sandboxing)
- [CLI 命令参考](https://docs.openclaw.ai/cli/)
- [Channel 配置](https://docs.openclaw.ai/channels/)

### GitHub 项目

- [OpenClaw 主仓库](https://github.com/openclaw/openclaw)
- [Issue 讨论](https://github.com/openclaw/openclaw/discussions)

### 版本说明

本章内容适用于 **OpenClaw 2026.2.x** 及更高版本。配置基于 JSON5 格式（支持注释和尾随逗号）。所有配置字段均为可选，OpenClaw 使用安全的默认值。

---

*最后更新: 2026-02-28（基于 OpenClaw 2026.2.23 官方配置）*
