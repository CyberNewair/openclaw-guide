# 第6章 实践指南

## 本章概要

本章是《OpenClaw 完全指南》的实践篇，提供从零开始部署、配置和使用 OpenClaw 的完整指导。无论您是初次接触的新用户，还是希望深入优化配置的高级用户，本章都将为您提供详尽的操作步骤、配置说明和实战经验。

**学习目标：**
- 掌握 OpenClaw 的安装部署方法
- 理解 openclaw.json 配置体系
- 学会配置主流通讯平台的通道集成
- 了解典型应用场景的完整实现
- 具备独立排查和解决问题的能力

---

## 6.1 安装指南

### 6.1.1 系统要求

#### 6.1.1.1 硬件要求

OpenClaw 的硬件需求取决于您的使用场景和预期负载。以下是基于不同场景的配置建议：

| 使用场景 | CPU | 内存 | 存储 | 网络 | 适用对象 |
|---------|-----|------|------|------|---------|
| 个人轻量使用 | 2核+ | 4GB+ | 10GB SSD | 稳定宽带 | 个人用户、开发者体验 |
| 日常使用 | 4核+ | 8GB+ | 20GB SSD | 50Mbps+ | 个人主力助手 |
| 多通道部署 | 4核+ | 16GB+ | 50GB SSD | 100Mbps+ | 团队使用 |

**详细说明：**

**CPU 要求**：
- 基础运行仅需支持 x86_64 或 ARM64 架构的现代处理器
- 多通道场景下，CPU 核心数直接影响并发处理能力

**内存要求**：
- 网关进程本身占用约 200-500MB 内存
- 每个活跃会话约占用 50-100MB 内存
- 本地 LLM 运行需要额外 4-16GB（取决于模型大小）

**存储要求**：
- 系统安装：约 500MB（含 Node.js 运行时）
- 依赖缓存：约 1-2GB（npm 包缓存）
- 日志存储：建议预留 5GB+

#### 6.1.1.2 软件要求

**操作系统支持矩阵：**

| 操作系统 | 支持版本 | 安装方式 | 推荐程度 |
|---------|---------|---------|---------|
| macOS | 13+ (Ventura) | 安装脚本/npm | ★★★★★ |
| Ubuntu | 22.04 LTS+ | 安装脚本/npm | ★★★★★ |
| Debian | 11+ | 安装脚本/npm | ★★★★☆ |
| CentOS/RHEL | 8+ | 安装脚本/npm | ★★★★☆ |
| Fedora | 38+ | 安装脚本/npm | ★★★★☆ |
| Arch Linux | Rolling | npm | ★★★☆☆ |
| Windows | 10/11 (WSL2) | 安装脚本/npm | ★★★☆☆ |

**⚠️ Windows 用户注意：** Windows 必须通过 WSL2 运行（strongly recommended）。

**必需软件依赖：**

```bash
# Node.js 运行时（官方要求 Node 22+）
Node.js >= 22.0.0

# 包管理器
npm >= 9.0.0 或 pnpm >= 8.0.0

# Git（用于扩展安装）
Git >= 2.30.0
```

### 6.1.2 安装 OpenClaw

**方式一：官方安装脚本（推荐）**

```bash
# macOS/Linux
curl -fsSL https://openclaw.ai/install.sh | bash

# Windows (PowerShell)
iwr -useb https://openclaw.ai/install.ps1 | iex
```

**方式二：npm 全局安装**

```bash
# 全局安装 OpenClaw
npm install -g openclaw@latest

# 验证安装
openclaw --version
```

**使用 pnpm（磁盘效率更高）：**

```bash
# 安装 pnpm（如未安装）
npm install -g pnpm

# 使用 pnpm 安装
pnpm add -g openclaw
```

### 6.1.3 初始化配置

安装完成后，运行初始化向导：

```bash
# 启动配置向导并安装系统服务
openclaw onboard --install-daemon

# 或仅运行向导（不安装服务）
openclaw onboard
```

初始化向导将：
1. 创建 `~/.openclaw/` 配置目录
2. 生成默认的 `openclaw.json` 配置文件
3. 配置 LLM 提供商（推荐 Anthropic）
4. 安装系统服务（使用 `--install-daemon` 时）

### 6.1.4 首次启动

**启动 Gateway：**

```bash
# 默认启动（端口 18789）
openclaw gateway

# 指定端口启动
openclaw gateway --port 18789

# 查看网关状态
openclaw gateway status
```

**验证启动：**

```bash
# 检查网关状态
openclaw gateway status

# 查看健康状态
openclaw gateway health --url ws://127.0.0.1:18789

# 打开控制面板
openclaw dashboard
```

---

## 6.2 配置详解

### 6.2.1 配置文件结构

OpenClaw 的主配置文件位于 `~/.openclaw/openclaw.json`。以下是官方推荐的完整配置格式：

```json5
{
  // Agent 配置
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-5",
        fallbacks: ["openai/gpt-5.2"],
      },
      models: {
        "anthropic/claude-sonnet-4-5": { alias: "Sonnet" },
        "openai/gpt-5.2": { alias: "GPT" },
      },
    },
    list: [
      {
        id: "main",
        groupChat: {
          mentionPatterns: ["@openclaw"],
        },
      },
    ],
  },
  
  // 通道配置
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: ["+15551234567"],
    },
    telegram: {
      enabled: true,
      botToken: "123:abc",
      dmPolicy: "pairing",
    },
    discord: {
      enabled: true,
      token: "${DISCORD_BOT_TOKEN}",
    },
  },
  
  // 会话配置
  session: {
    dmScope: "per-channel-peer",
    threadBindings: {
      enabled: true,
      idleHours: 24,
      maxAgeHours: 0,
    },
    reset: {
      mode: "daily",
      atHour: 4,
      idleMinutes: 120,
    },
  },
  
  // Cron 作业配置
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",
  },
  
  // Webhook 配置
  hooks: {
    enabled: true,
    token: "shared-secret",
    path: "/hooks",
  },
  
  // 多代理路由配置
  bindings: [
    {
      agentId: "main",
      match: {
        channel: "whatsapp",
      },
    },
  ],
}
```

**关键配置块说明：**

- `agents.defaults` - 默认 Agent 设置，包含模型配置
- `agents.defaults.models` - 模型目录，定义可用模型及别名，用于 `/model` 命令切换
- `agents.list` - Agent 列表，可配置多个 Agent
- `channels` - 各通讯通道的配置
- `session` - 会话相关设置，包含 threadBindings 和 reset 配置
- `cron` - 定时任务（Cron 作业）配置
- `hooks` - Webhook 配置，用于外部系统集成
- `bindings` - 多代理路由配置，实现不同通道绑定不同 Agent

### 6.2.2 核心配置项

#### 6.2.2.1 Agent 配置

**模型配置（`agents.defaults.model` + `agents.defaults.models`）：**

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-sonnet-4-5",
        fallbacks: ["openai/gpt-5.2", "openai/gpt-4.1"],
      },
      models: {
        "anthropic/claude-sonnet-4-5": { alias: "Sonnet" },
        "openai/gpt-5.2": { alias: "GPT" },
        "openai/gpt-4.1": { alias: "GPT-4.1" },
      },
    },
  },
}
```

**说明：**
- `model.primary` - 主模型，对话默认使用
- `model.fallbacks` - 备用模型列表，主模型不可用时自动切换
- `models` - 模型目录，定义所有可用模型及其别名，用户可通过 `/model` 命令在对话中切换

**多 Agent 配置：**

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-5",
      },
    },
    list: [
      {
        id: "main",
        groupChat: {
          mentionPatterns: ["@openclaw", "@助手"],
        },
      },
      {
        id: "coding-agent",
        workspace: "/home/user/coding-workspace",
        model: {
          primary: "openai/gpt-5.2",
        },
      },
    ],
  },
}
```

#### 6.2.2.2 消息配置

```json5
{
  agents: {
    list: [
      {
        id: "main",
        groupChat: {
          // 触发响应的@模式
          mentionPatterns: ["@openclaw", "@助手"],
        },
      },
    ],
  },
}
```

#### 6.2.2.3 会话配置（session）

```json5
{
  session: {
    // DM 会话范围：per-channel-peer | per-peer | global
    dmScope: "per-channel-peer",
    
    // 线程绑定配置（Discord 支持 /focus、/unfocus 等命令）
    threadBindings: {
      enabled: true,
      idleHours: 24,
      maxAgeHours: 0,
    },
    
    // 会话重置配置
    reset: {
      mode: "daily",        // daily | idle | off
      atHour: 4,            // daily 模式下每天几点重置
      idleMinutes: 120,     // idle 模式下空闲多少分钟后重置
    },
  },
}
```

**session.reset 说明：**

| 模式 | 说明 |
|------|------|
| `daily` | 每天在指定时间重置会话（配合 `atHour`） |
| `idle` | 空闲指定时间后重置（配合 `idleMinutes`） |
| `off` | 禁用自动重置 |

#### 6.2.2.4 Cron 作业配置

```json5
{
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
    sessionRetention: "24h",
    runLog: {
      maxBytes: "2mb",
      keepLines: 2000,
    },
  },
}
```

**说明：**
- `enabled` - 启用 Cron 作业
- `maxConcurrentRuns` - 最大并发运行数
- `sessionRetention` - 已完成运行会话的保留时间
- `runLog` - 运行日志的存储限制

#### 6.2.2.5 Webhook 配置（hooks）

```json5
{
  hooks: {
    enabled: true,
    token: "shared-secret",
    path: "/hooks",
    defaultSessionKey: "hook:ingress",
    allowRequestSessionKey: false,
    allowedSessionKeyPrefixes: ["hook:"],
    mappings: [
      {
        match: { path: "gmail" },
        action: "agent",
        agentId: "main",
        deliver: true,
      },
    ],
  },
}
```

#### 6.2.2.6 多代理路由配置（bindings）

```json5
{
  agents: {
    list: [
      { id: "home", default: true, workspace: "~/.openclaw/workspace-home" },
      { id: "work", workspace: "~/.openclaw/workspace-work" },
    ],
  },
  bindings: [
    {
      agentId: "home",
      match: {
        channel: "whatsapp",
        accountId: "personal",
      },
    },
    {
      agentId: "work",
      match: {
        channel: "whatsapp",
        accountId: "biz",
      },
    },
    {
      agentId: "work",
      match: {
        channel: "feishu",
        peer: { kind: "group", id: "oc_xxx" },
      },
    },
  ],
}
```

**bindings 路由字段说明：**

| 字段 | 说明 |
|------|------|
| `agentId` | 目标 Agent ID |
| `match.channel` | 通道名称（whatsapp、telegram、discord、feishu 等） |
| `match.accountId` | 账号 ID（多账号时使用） |
| `match.peer.kind` | 会话类型：`direct`（私聊）或 `group`（群组） |
| `match.peer.id` | 用户 ID（ou_xxx）或群组 ID（oc_xxx） |

### 6.2.3 环境变量

OpenClaw 支持通过多种方式配置环境变量：

#### 6.2.3.1 .env 文件

OpenClaw 自动加载以下位置的 `.env` 文件：

- 当前工作目录的 `.env` 文件
- `~/.openclaw/.env` 全局配置文件

```bash
# 创建 ~/.openclaw/.env 文件
cat > ~/.openclaw/.env <<EOF
# LLM API 密钥
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxx

# 通道 Token
TELEGRAM_BOT_TOKEN=123:abc
DISCORD_BOT_TOKEN=xxx
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# OpenClaw 配置
OPENCLAW_HOME="~/.openclaw"
OPENCLAW_STATE_DIR="/var/openclaw"
OPENCLAW_CONFIG_PATH="/etc/openclaw.json"
EOF

# OpenClaw 会自动加载 ~/.openclaw/.env
```

#### 6.2.3.2 环境变量引用

在配置文件中可以使用 `${VAR_NAME}` 语法引用环境变量：

```json5
{
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
    },
    feishu: {
      accounts: {
        main: {
          appId: "${FEISHU_APP_ID}",
          appSecret: "${FEISHU_APP_SECRET}",
        },
      },
    },
  },
  gateway: {
    auth: {
      token: "${OPENCLAW_GATEWAY_TOKEN}",
    },
  },
}
```

**规则：**
- 仅匹配大写名称：`[A-Z_][A-Z0-9_]*`
- 缺失或空值会在加载时报错
- 使用 `$${VAR}` 可输出字面量 `${VAR}`
- 支持在 `$include` 文件中使用

#### 6.2.3.3 内联环境变量（env.vars）

```json5
{
  env: {
    vars: {
      OPENROUTER_API_KEY: "sk-or-...",
      GROQ_API_KEY: "gsk-...",
    },
  },
}
```

#### 6.2.3.4 SecretRef 配置

对于支持 SecretRef 的字段，可以使用以下方式引用敏感信息：

```json5
{
  models: {
    providers: {
      openai: {
        apiKey: {
          source: "env",
          provider: "default",
          id: "OPENAI_API_KEY",
        },
      },
    },
  },
  skills: {
    entries: {
      "nano-banana-pro": {
        apiKey: {
          source: "file",
          provider: "filemain",
          id: "/skills/entries/nano-banana-pro/apiKey",
        },
      },
    },
  },
  channels: {
    googlechat: {
      serviceAccountRef: {
        source: "exec",
        provider: "vault",
        id: "channels/googlechat/serviceAccount",
      },
    },
  },
}
```

**SecretRef 来源类型：**

| 类型 | 说明 |
|------|------|
| `env` | 从环境变量读取 |
| `file` | 从文件读取 |
| `exec` | 从命令执行结果读取 |

#### 6.2.3.5 Shell 环境导入

```json5
{
  env: {
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

或环境变量：`OPENCLAW_LOAD_SHELL_ENV=1`

### 6.2.4 通道配置实战

#### 6.2.4.1 WhatsApp 配置

**配对 WhatsApp：**

```bash
# 扫描二维码配对
openclaw channels login --channel whatsapp

# 或交互式选择
openclaw channels login
```

**配置示例：**

```json5
{
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing",      // 必需字段
      allowFrom: ["+8613800138000"],  // 仅允许特定号码
      groupPolicy: "allowlist", // allowlist | open | disabled
      groupAllowFrom: ["+8613800138000"],
    },
  },
}
```

**dmPolicy 说明：**

| 值 | 行为 |
|----|------|
| `"pairing"` | 默认。未知用户获得配对码，需批准后聊天 |
| `"allowlist"` | 仅 allowFrom 中的用户可以聊天 |
| `"open"` | 允许所有用户（需在 allowFrom 中设置 `"*"`） |
| `"disabled"` | 禁用私信 |

#### 6.2.4.2 Telegram 配置

**创建 Bot：**

1. 在 Telegram 搜索 @BotFather
2. 发送 `/newbot` 命令
3. 按提示设置 Bot 名称和用户名
4. 保存返回的 Bot Token

**配置示例：**

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",  // 或环境变量 TELEGRAM_BOT_TOKEN
      dmPolicy: "pairing",   // pairing | allowlist | open | disabled
      allowFrom: ["tg:123"], // 必须是数字用户ID，不支持 @username
      groups: {
        "-1001234567890": {
          groupPolicy: "open",
          requireMention: true,
        },
      },
    },
  },
}
```

**⚠️ 注意：** `allowFrom` 必须填写**数字用户ID**（格式 `tg:123`），不支持 `@username`。

#### 6.2.4.3 Discord 配置

**创建应用：**

1. 访问 https://discord.com/developers/applications
2. 点击 "New Application"，命名并创建
3. 在 "Bot" 页面点击 "Add Bot"
4. 重置并保存 Token

**配置示例：**

```json5
{
  channels: {
    discord: {
      enabled: true,
      token: "${DISCORD_BOT_TOKEN}",
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      guilds: {
        "YOUR_SERVER_ID": {
          requireMention: true,
          users: ["YOUR_USER_ID"],
        },
      },
    },
  },
}
```

**关键字段：**
- `token` - Bot Token
- `guilds` - 服务器配置，支持 `requireMention` 和 `users`

#### 6.2.4.4 飞书（Feishu）配置

飞书是企业协作平台，OpenClaw 通过 WebSocket 长连接接收消息，无需暴露公网 Webhook URL。

**Step 1: 安装飞书插件**

```bash
openclaw plugins install @openclaw/feishu
```

**Step 2: 创建飞书应用**

1. 访问 [飞书开放平台](https://open.feishu.cn/app) 并登录
   - 国际版 Lark 用户访问 https://open.larksuite.com/app
   - 需要在配置中设置 `domain: "lark"`

2. 点击 **创建企业自建应用**，填写应用名称和描述

3. 在 **凭证与基础信息** 中复制：
   - **App ID**（格式：`cli_xxx`）
   - **App Secret**

4. **配置权限**（关键步骤）：
   
   进入 **权限管理**，点击 **批量导入**，粘贴以下内容：
   
   ```json
   {
     "scopes": {
       "tenant": [
         "aily:file:read",
         "aily:file:write",
         "application:application.app_message_stats.overview:readonly",
         "application:application:self_manage",
         "application:bot.menu:write",
         "contact:user.employee_id:readonly",
         "corehr:file:download",
         "event:ip_list",
         "im:chat.access_event.bot_p2p_chat:read",
         "im:chat.members:bot_access",
         "im:message",
         "im:message.group_at_msg:readonly",
         "im:message.p2p_msg:readonly",
         "im:message:readonly",
         "im:message:send_as_bot",
         "im:resource"
       ],
       "user": [
         "aily:file:read",
         "aily:file:write",
         "im:chat.access_event.bot_p2p_chat:read"
       ]
     }
   }
   ```
   
   **核心权限说明：**
   
   | 权限 | 说明 |
   |------|------|
   | `aily:file:read` / `aily:file:write` | Aily 文件读写（AI 功能） |
   | `im:message` | 消息权限（核心权限） |
   | `im:message:readonly` | 读取消息 |
   | `im:message:send_as_bot` | 以机器人身份发送消息 |
   | `im:chat.access_event.bot_p2p_chat:read` | 私聊访问事件 |
   | `im:chat.members:bot_access` | 访问群成员信息 |
   | `application:application:self_manage` | 应用自管理 |
   | `contact:user.employee_id:readonly` | 读取用户员工号 |

5. **开启机器人能力**：
   
   进入 **应用能力** > **机器人**，启用机器人能力并设置名称

6. **配置事件订阅**：
   
   进入 **事件订阅**：
   - 选择 **使用长连接接收事件**（WebSocket 模式）
   - 添加事件：`im.message.receive_v1`
   
   ⚠️ **注意：** 配置事件订阅前，确保：
   - 已运行 `openclaw channels add` 添加飞书通道
   - Gateway 正在运行（`openclaw gateway status`）

7. **发布应用**：
   
   在 **版本管理与发布** 中创建版本并提交审核，等待管理员批准

**Step 3: 配置 openclaw.json**

```json5
{
  channels: {
    feishu: {
      enabled: true,
      dmPolicy: "pairing",
      // domain: "lark",  // 国际版 Lark 用户取消注释此行
      connectionMode: "websocket",  // websocket | webhook
      accounts: {
        main: {
          appId: "cli_xxxxxxxxxxxx",
          appSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          botName: "AI 助手",
        },
      },
      // 群组配置
      groupPolicy: "open",
      groups: {
        "oc_xxxxxxxxxxxxxxxx": {
          requireMention: true,
        },
      },
      // 高级配置
      streaming: true,          // 启用流式卡片输出
      blockStreaming: true,     // 启用块级流式
      textChunkLimit: 2000,     // 消息分块大小
      mediaMaxMb: 30,           // 媒体大小限制
    },
  },
}
```

**或使用环境变量：**

```bash
export FEISHU_APP_ID="cli_xxxxxxxxxxxx"
export FEISHU_APP_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**飞书高级配置字段：**

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `domain` | API 域名（`feishu` 或 `lark`） | `feishu` |
| `connectionMode` | 事件传输模式（`websocket` 或 `webhook`） | `websocket` |
| `verificationToken` | Webhook 模式需要 | - |
| `webhookPath` | Webhook 路由路径 | `/feishu/events` |
| `webhookHost` | Webhook 绑定主机 | `127.0.0.1` |
| `webhookPort` | Webhook 绑定端口 | `3000` |
| `streaming` | 启用流式卡片输出 | `true` |
| `blockStreaming` | 启用块级流式 | `true` |
| `textChunkLimit` | 消息分块大小 | `2000` |
| `mediaMaxMb` | 媒体大小限制 | `30` |

**Step 4: 配对测试**

```bash
# 1. 启动 Gateway
openclaw gateway

# 2. 在飞书中找到机器人，发送消息
# 3. 机器人会回复配对码，执行批准命令
openclaw pairing approve feishu <配对码>

# 4. 查看配对列表
openclaw pairing list feishu
```

**国内部署注意事项：**

1. **网络环境**：确保服务器可以访问飞书开放平台 API（`open.feishu.cn`）
2. **备案要求**：如需使用 Webhook 模式（非 WebSocket），确保域名已完成 ICP 备案
3. **企业认证**：部分高级权限需要企业完成飞书认证
4. **长连接稳定性**：WebSocket 模式适合国内部署，无需公网 IP 或域名

**飞书常用命令：**

| 命令 | 说明 |
|------|------|
| `/status` | 显示 Bot 状态 |
| `/reset` | 重置会话 |
| `/model` | 显示/切换模型 |

> 注意：飞书暂不支持原生命令菜单，需手动输入命令。

**获取用户/群组 ID：**

- 启动 Gateway 后，在日志中查看（`openclaw logs --follow`）
- 用户 ID 格式：`ou_xxx`
- 群组 ID 格式：`oc_xxx`

---

## 6.3 实战案例

### 6.3.1 案例一：个人 AI 助手

**场景描述：** 构建一个个人 AI 助手，通过 WhatsApp 或 Telegram 随时访问。

**配置实现：**

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-5",
      },
      models: {
        "anthropic/claude-sonnet-4-5": { alias: "Sonnet" },
      },
    },
    list: [
      {
        id: "main",
      },
    ],
  },
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: ["${MY_PHONE_NUMBER}"],
    },
  },
  session: {
    dmScope: "per-channel-peer",
    reset: {
      mode: "daily",
      atHour: 4,
    },
  },
}
```

**启动步骤：**

```bash
# 1. 配对 WhatsApp
openclaw channels login --channel whatsapp

# 2. 启动 Gateway
openclaw gateway

# 3. 批准配对
openclaw pairing approve whatsapp <CODE>

# 4. 开始对话
# 在 WhatsApp 中向自己发送消息
```

### 6.3.2 案例二：团队协作助手

**场景描述：** 为团队配置一个 Discord 机器人，协助日常沟通。

**配置实现：**

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "openai/gpt-5.2",
      },
      models: {
        "openai/gpt-5.2": { alias: "GPT" },
      },
    },
    list: [
      {
        id: "main",
        groupChat: {
          mentionPatterns: ["@Assistant", "@助手"],
        },
      },
    ],
  },
  channels: {
    discord: {
      enabled: true,
      token: "${DISCORD_BOT_TOKEN}",
      dmPolicy: "pairing",
      guilds: {
        "${TEAM_GUILD_ID}": {
          channels: ["${GENERAL_CHANNEL}"],
          requireMention: true,
        },
      },
    },
  },
  hooks: {
    enabled: true,
    token: "${WEBHOOK_TOKEN}",
    path: "/hooks",
  },
}
```

**部署步骤：**

```bash
# 1. 配置环境变量
export DISCORD_BOT_TOKEN="xxx"
export TEAM_GUILD_ID="xxx"
export GENERAL_CHANNEL="xxx"
export WEBHOOK_TOKEN="xxx"

# 2. 启动服务
openclaw gateway --port 18789

# 3. 在 Discord 中@机器人进行对话
```

### 6.3.3 案例三：多平台统一助手

**场景描述：** 同时连接 WhatsApp、Telegram、Discord 和飞书，统一管理。

**配置实现：**

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-5",
        fallbacks: ["openai/gpt-5.2"],
      },
      models: {
        "anthropic/claude-sonnet-4-5": { alias: "Sonnet" },
        "openai/gpt-5.2": { alias: "GPT" },
      },
    },
    list: [
      {
        id: "main",
        default: true,
        groupChat: {
          mentionPatterns: ["@openclaw"],
        },
      },
      {
        id: "coding",
        workspace: "/home/user/coding-workspace",
        model: {
          primary: "openai/gpt-5.2",
        },
      },
    ],
  },
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "pairing",
      allowFrom: ["+8613800138000"],
    },
    telegram: {
      enabled: true,
      botToken: "${TELEGRAM_BOT_TOKEN}",
      dmPolicy: "pairing",
      allowFrom: ["tg:123456789"],
    },
    discord: {
      enabled: true,
      token: "${DISCORD_BOT_TOKEN}",
      dmPolicy: "pairing",
    },
    feishu: {
      enabled: true,
      dmPolicy: "pairing",
      accounts: {
        main: {
          appId: "${FEISHU_APP_ID}",
          appSecret: "${FEISHU_APP_SECRET}",
        },
      },
      streaming: true,
      blockStreaming: true,
    },
  },
  session: {
    dmScope: "per-channel-peer",
    threadBindings: {
      enabled: true,
      idleHours: 24,
    },
    reset: {
      mode: "idle",
      idleMinutes: 120,
    },
  },
  cron: {
    enabled: true,
    maxConcurrentRuns: 2,
  },
  bindings: [
    {
      agentId: "main",
      match: { channel: "whatsapp" },
    },
    {
      agentId: "main",
      match: { channel: "telegram" },
    },
    {
      agentId: "main",
      match: { channel: "discord" },
    },
    {
      agentId: "coding",
      match: {
        channel: "feishu",
        peer: { kind: "group", id: "${FEISHU_CODING_GROUP_ID}" },
      },
    },
    {
      agentId: "main",
      match: {
        channel: "feishu",
        peer: { kind: "direct" },
      },
    },
  ],
}
```

### 6.3.4 案例四：配置文件分割

**场景描述：** 配置复杂时，使用 `$include` 分割配置文件。

**主配置：**

```json5
// ~/.openclaw/openclaw.json
{
  gateway: { port: 18789 },
  agents: { $include: "./agents.json5" },
  channels: { $include: "./channels.json5" },
  session: { $include: "./session.json5" },
}
```

**agents.json5：**

```json5
{
  defaults: {
    workspace: "~/.openclaw/workspace",
    model: {
      primary: "anthropic/claude-sonnet-4-5",
    },
    models: {
      "anthropic/claude-sonnet-4-5": { alias: "Sonnet" },
    },
  },
  list: [
    { id: "main" },
  ],
}
```

**说明：**
- 单文件：替换包含的对象
- 文件数组：按顺序深度合并（后覆盖前）
- 同级键：在 include 后合并（覆盖 included 值）
- 支持嵌套 include，最多 10 层
- 相对路径：相对于包含文件的目录解析

---

## 6.4 故障排除

### 6.4.1 常见问题 FAQ

#### Q: 安装时提示权限错误（EACCES）

**解决方案：**

```bash
# 方法 1：使用 npx
npx openclaw <command>

# 方法 2：更改 npm 默认目录
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 方法 3：使用 nvm
nvm install 22
nvm use 22
npm install -g openclaw
```

#### Q: 启动网关时提示端口被占用

**解决方案：**

```bash
# 查找占用进程
lsof -i :18789

# 更换端口启动
openclaw gateway --port 18790
```

#### Q: 无法连接到 LLM API

**诊断步骤：**

```bash
# 1. 检查 API 密钥是否设置
echo $ANTHROPIC_API_KEY

# 2. 测试网络连通性
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY"

# 3. 检查代理设置
echo $HTTPS_PROXY
```

#### Q: WhatsApp 无法配对

**解决方案：**

```bash
# 重新配对
openclaw channels login --channel whatsapp

# 查看配对列表
openclaw pairing list whatsapp

# 批准配对
openclaw pairing approve whatsapp <CODE>

# 检查日志
openclaw logs --follow
```

#### Q: Discord Bot 显示离线

**检查清单：**
- [ ] Token 是否正确
- [ ] Bot 是否已加入服务器
- [ ] Intents 是否启用（Privileged Gateway Intents）
- [ ] 权限是否足够

#### Q: 飞书机器人无响应

**检查清单：**
- [ ] 应用是否已发布并通过审核
- [ ] 事件订阅是否包含 `im.message.receive_v1`
- [ ] 是否选择 **长连接接收事件** 模式
- [ ] 应用权限是否完整（17个 tenant + 3个 user 权限）
- [ ] Gateway 是否正在运行
- [ ] 检查日志：`openclaw logs --follow`
- [ ] 网络是否可以访问 `open.feishu.cn`

### 6.4.2 配置热重载

OpenClaw 支持配置文件热重载，无需手动重启 Gateway。

**重载模式：**

```json5
{
  gateway: {
    reload: {
      mode: "hybrid",      // hybrid | hot | restart | off
      debounceMs: 300,
    },
  },
}
```

| 模式 | 行为 |
|------|------|
| `hybrid`（默认）| 安全更改即时热应用，关键更改自动重启 |
| `hot` | 仅热应用安全更改，需要重启时记录警告 |
| `restart` | 任何更改都重启 Gateway |
| `off` | 禁用文件监控 |

**需要重启的配置更改：**

| 类别 | 字段 |
|------|------|
| Gateway 服务器 | `gateway.*`（端口、绑定、认证、TLS 等）|
| 基础设施 | `discovery`、`canvasHost`、`plugins` |

**无需重启的配置更改：**
- 所有通道配置
- Agent 和模型配置
- 自动化（hooks、cron、heartbeat）
- 会话和消息配置
- 工具和多媒体配置

### 6.4.3 日志分析

**查看日志（推荐方式）：**

```bash
# 实时查看网关日志
openclaw logs --follow

# 查看最近日志
openclaw logs

# 搜索错误
openclaw logs | grep ERROR
```

**日志文件位置：**

```
~/.openclaw/logs/
├── gateway.log          # 网关日志
└── channels/            # 通道日志
    ├── whatsapp.log
    ├── telegram.log
    ├── discord.log
    └── feishu.log
```

### 6.4.4 获取帮助

**官方资源：**

- 官方文档：https://docs.openclaw.ai
- GitHub：https://github.com/openclaw/openclaw
- Discord 社区：https://discord.gg/openclaw

**提交 Issue：**

````markdown
## 问题描述
清晰描述遇到的问题

## 复现步骤
1. 执行 '...'
2. 输入 '...'
3. 看到错误

## 环境信息
- OpenClaw 版本：（运行 openclaw --version）
- Node.js 版本：（运行 node --version）
- 操作系统：

## 配置文件
```json5
（脱敏后的 openclaw.json）
```

## 日志输出
```
（相关的错误日志）
```
````

---

## 本章总结

本章介绍了 OpenClaw 的实践应用：

**安装部署**：通过官方安装脚本或 npm 全局安装，使用 `openclaw onboard` 初始化配置。

**配置详解**：`~/.openclaw/openclaw.json` 采用 JSON5 格式，支持注释和尾随逗号。核心配置块包括：
- `agents.defaults` + `agents.list` - Agent 配置
- `agents.defaults.models` - 模型目录（用于 `/model` 命令）
- `channels.*` - 各通道配置
- `session` - 会话配置（含 threadBindings、reset）
- `cron` - 定时任务配置
- `hooks` - Webhook 配置
- `bindings` - 多代理路由配置

**环境变量**：支持 `.env` 文件、`${VAR}` 引用语法、SecretRef（env/file/exec）和内联 `env.vars` 配置。

**实战案例**：涵盖个人助手、团队协作、多平台部署和飞书集成四种典型场景。

**故障排除**：常见问题解决方案、配置热重载机制和日志分析方法。

**实践建议：**

1. **从简单开始**：先配置单一通道，验证成功后再扩展
2. **安全配置**：使用 `allowFrom` 限制访问，避免未授权使用
3. **环境变量**：敏感信息（API 密钥、Token）通过环境变量或 SecretRef 注入
4. **监控日志**：使用 `openclaw logs --follow` 实时查看日志
5. **及时配对**：新用户首次使用需要执行配对批准
6. **配置文件分割**：复杂配置使用 `$include` 分割为多个文件

---

## 参考资源

- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [OpenClaw GitHub 仓库](https://github.com/openclaw/openclaw)
- [配置参考文档](https://docs.openclaw.ai/gateway/configuration)
- [完整配置字段参考](https://docs.openclaw.ai/gateway/configuration-reference)
- [WhatsApp 配置](https://docs.openclaw.ai/channels/whatsapp)
- [Telegram 配置](https://docs.openclaw.ai/channels/telegram)
- [Discord 配置](https://docs.openclaw.ai/channels/discord)
- [飞书配置](https://docs.openclaw.ai/channels/feishu)
- [Anthropic API 文档](https://docs.anthropic.com)
- [OpenAI API 文档](https://platform.openai.com/docs)
