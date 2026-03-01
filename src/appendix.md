# 附录

本附录提供 OpenClaw 的快速参考信息，包括完整配置示例、常用命令速查、错误代码对照、资源链接和版本历史。

---

## A. 完整配置示例

### A.1 配置文件位置

OpenClaw 的主配置文件位于：

```
~/.openclaw/openclaw.json
```

### A.2 最小可用配置

最简单的配置只需启用一个通道：

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  }
}
```

### A.3 完整配置示例

```json
{
  "wizard": {
    "lastRunAt": "2026-02-24T14:43:18.363Z",
    "lastRunVersion": "2026.2.23",
    "lastRunCommand": "onboard",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "api_key"
      },
      "openai:default": {
        "provider": "openai",
        "mode": "api_key"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "anthropic": {
        "baseUrl": "https://api.anthropic.com/",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-opus-4-5",
            "name": "Claude Opus",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": {
              "input": 15.0,
              "output": 75.0,
              "cacheRead": 1.5,
              "cacheWrite": 18.75
            },
            "contextWindow": 200000,
            "maxTokens": 4096
          },
          {
            "id": "claude-sonnet-4-5",
            "name": "Claude Sonnet",
            "input": ["text", "image"],
            "cost": {
              "input": 3.0,
              "output": 15.0,
              "cacheRead": 0.3,
              "cacheWrite": 3.75
            },
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      },
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "api": "openai-chat",
        "models": [
          {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "input": ["text", "image"],
            "cost": {
              "input": 5.0,
              "output": 15.0
            },
            "contextWindow": 128000,
            "maxTokens": 4096
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      },
      "models": {
        "anthropic/claude-sonnet-4-5": {
          "alias": "Claude Sonnet"
        }
      },
      "workspace": "/Users/username/.openclaw/workspace",
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    },
    "list": [
      {
        "id": "work-agent",
        "name": "工作助手",
        "models": {
          "primary": "anthropic/claude-opus-4-5"
        },
        "workspace": "~/.openclaw/workspace-work",
        "tools": {
          "policy": "allow",
          "deny": ["process"]
        }
      },
      {
        "id": "home-agent",
        "name": "家庭助手",
        "models": {
          "primary": "openai/gpt-4o"
        },
        "workspace": "~/.openclaw/workspace-home",
        "tools": {
          "policy": "deny",
          "allow": ["message", "calendar", "reminders", "read"]
        }
      }
    ]
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "boot-md": {
          "enabled": true
        },
        "bootstrap-extra-files": {
          "enabled": true
        },
        "command-logger": {
          "enabled": true
        },
        "session-memory": {
          "enabled": true
        }
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "groupPolicy": "open",
      "streaming": true
    },
    "whatsapp": {
      "enabled": true,
      "allowFrom": ["+86138xxxx1234", "+86139xxxx5678"],
      "groupPolicy": "owner-only"
    },
    "discord": {
      "enabled": true,
      "token": "${DISCORD_BOT_TOKEN}",
      "clientId": "${DISCORD_CLIENT_ID}",
      "groupPolicy": "open"
    },
    "feishu": {
      "enabled": true,
      "appId": "${FEISHU_APP_ID}",
      "appSecret": "${FEISHU_APP_SECRET}",
      "domain": "feishu",
      "groupPolicy": "disabled",
      "streaming": true,
      "blockStreaming": true
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    },
    "nodes": {
      "denyCommands": [
        "camera.snap",
        "camera.clip",
        "screen.record"
      ]
    }
  },
  "skills": {
    "install": {
      "nodeManager": "npm"
    }
  },
  "cron": {
    "jobs": [
      {
        "name": "daily-summary",
        "schedule": "0 20 * * *",
        "command": "agent",
        "args": {
          "prompt": "总结今天的日历事件和待办事项，发送日报"
        }
      },
      {
        "name": "health-check",
        "schedule": "0 */6 * * *",
        "command": "agent",
        "args": {
          "prompt": "检查系统健康状态，如有异常发送通知"
        }
      }
    ]
  },
  "webhooks": {
    "github-pr": {
      "path": "/webhook/github/pr",
      "agent": "work-agent",
      "command": "agent",
      "args": {
        "prompt": "审查这个 PR 的代码变更"
      }
    },
    "sentry-alert": {
      "path": "/webhook/sentry",
      "command": "agent",
      "args": {
        "prompt": "分析错误报告，判断严重程度，通知相关工程师"
      }
    }
  },
  "plugins": {
    "entries": {
      "feishu": {
        "enabled": true
      }
    }
  },
  "meta": {
    "lastTouchedVersion": "2026.2.23",
    "lastTouchedAt": "2026-02-24T14:43:18.396Z"
  }
}
```

### A.4 配置字段详解

#### A.4.1 顶级字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `wizard` | Object | 向导运行记录 |
| `auth` | Object | 认证配置 |
| `models` | Object | 模型提供商标识和配置 |
| `agents` | Object | 代理默认配置和多代理列表 |
| `messages` | Object | 消息处理配置 |
| `commands` | Object | 命令系统配置 |
| `session` | Object | 会话管理配置 |
| `hooks` | Object | 钩子系统配置 |
| `channels` | Object | 通道配置（Telegram、WhatsApp等） |
| `gateway` | Object | 网关核心配置 |
| `skills` | Object | 技能系统配置 |
| `cron` | Object | 定时任务配置 |
| `webhooks` | Object | Webhook 端点配置 |
| `plugins` | Object | 插件配置 |
| `meta` | Object | 元数据（自动生成） |

#### A.4.2 认证配置 (`auth`)

```json
{
  "auth": {
    "profiles": {
      "provider:label": {
        "provider": "anthropic|openai|google|...",
        "mode": "api_key|oauth|..."
      }
    }
  }
}
```

#### A.4.3 代理配置 (`agents`)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaults.model.primary` | String | - | 默认主模型 |
| `defaults.workspace` | String | `~/.openclaw/workspace` | 默认工作空间 |
| `defaults.compaction.mode` | String | `safeguard` | 会话压缩模式 |
| `defaults.maxConcurrent` | Number | 4 | 最大并发会话数 |
| `defaults.subagents.maxConcurrent` | Number | 8 | 子代理最大并发数 |
| `list` | Array | - | 多代理配置列表 |

#### A.4.4 网关配置 (`gateway`)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | Number | 18789 | 网关端口 |
| `mode` | String | `local` | 运行模式 |
| `bind` | String | `loopback` | 绑定地址 |
| `tailscale.mode` | String | `off` | Tailscale 模式 |
| `nodes.denyCommands` | Array | [] | 禁止的节点命令 |

**注意**：Gateway 认证通过环境变量 `OPENCLAW_GATEWAY_TOKEN` 配置，而非配置文件中的 `auth.token`。

```bash
# 设置 Gateway Token 环境变量
export OPENCLAW_GATEWAY_TOKEN="your-secure-token-here"

# 启动 Gateway
openclaw gateway start
```

#### A.4.5 通道配置 (`channels`)

**Telegram:**

```json
{
  "telegram": {
    "enabled": true,
    "botToken": "${TELEGRAM_BOT_TOKEN}",
    "groupPolicy": "open|owner-only|disabled",
    "streaming": true
  }
}
```

**WhatsApp:**

```json
{
  "whatsapp": {
    "enabled": true,
    "allowFrom": ["+86138xxxx1234"],
    "groupPolicy": "open|owner-only|disabled"
  }
}
```

**Discord:**

```json
{
  "discord": {
    "enabled": true,
    "token": "${DISCORD_BOT_TOKEN}",
    "clientId": "${DISCORD_CLIENT_ID}",
    "guilds": {
      "guild_id_1": {
        "channels": ["channel_id_1", "channel_id_2"]
      },
      "guild_id_2": {
        "channels": ["*"]
      }
    }
  }
}
```

**Feishu:**

```json
{
  "feishu": {
    "enabled": true,
    "appId": "${FEISHU_APP_ID}",
    "appSecret": "${FEISHU_APP_SECRET}",
    "domain": "feishu|lark",
    "groupPolicy": "open|owner-only|disabled",
    "streaming": true,
    "blockStreaming": true
  }
}
```

#### A.4.6 Cron 任务配置 (`cron`)

```json
{
  "cron": {
    "jobs": [
      {
        "name": "job-name",
        "schedule": "0 8 * * *",
        "command": "agent|message|exec",
        "args": {
          "prompt": "任务描述"
        }
      }
    ]
  }
}
```

Schedule 格式遵循 cron 表达式：

```
* * * * *
│ │ │ │ └─ 星期 (0-7, 0和7都是周日)
│ │ │ └─── 月份 (1-12)
│ │ └───── 日期 (1-31)
│ └─────── 小时 (0-23)
└───────── 分钟 (0-59)
```

常用示例：
- `0 8 * * *` - 每天上午 8:00
- `0 */6 * * *` - 每 6 小时
- `*/15 * * * *` - 每 15 分钟
- `0 9 * * 1` - 每周一上午 9:00

---

## B. 常用命令速查

### B.1 网关管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw gateway start` | 启动网关 | `openclaw gateway start` |
| `openclaw gateway stop` | 停止网关 | `openclaw gateway stop` |
| `openclaw gateway status` | 查看网关状态 | `openclaw gateway status` |
| `openclaw gateway restart` | 重启网关 | `openclaw gateway restart` |
| `openclaw gateway health` | 检查网关健康状态 | `openclaw gateway health` |

### B.2 通道管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw channels login` | 登录/连接通道 | `openclaw channels login telegram` |
| `openclaw channels logout` | 断开通道连接 | `openclaw channels logout telegram` |
| `openclaw channels list` | 列出已配置通道 | `openclaw channels list` |
| `openclaw channels status` | 查看通道状态 | `openclaw channels status` |
| `openclaw status` | 查看所有通道状态 | `openclaw status` |

### B.3 配置管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw configure` | 交互式配置向导 | `openclaw configure` |
| `openclaw config get` | 获取配置值 | `openclaw config get channels.telegram.enabled` |
| `openclaw config set` | 设置配置值 | `openclaw config set agents.defaults.model.primary anthropic/claude-opus-4-5` |
| `openclaw config unset` | 删除配置项 | `openclaw config unset cron.jobs` |
| `openclaw onboard` | 初始化设置向导 | `openclaw onboard` |
| `openclaw setup` | 初始化工作空间 | `openclaw setup` |

### B.4 代理操作

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw agent` | 运行代理单次回合 | `openclaw agent --message "你好"` |
| `openclaw agents list` | 列出所有代理 | `openclaw agents list` |
| `openclaw agents add` | 创建新代理 | `openclaw agents add work-agent` |
| `openclaw agents delete` | 删除代理 | `openclaw agents delete old-agent` |
| `openclaw tui` | 打开终端交互界面 | `openclaw tui` |

### B.5 消息发送

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw message send` | 发送消息 | `openclaw message send --channel telegram --target +86138xxxx --message "Hello"` |
| `openclaw sessions` | 列出会话 | `openclaw sessions` |

### B.6 模型管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw models list` | 列出可用模型 | `openclaw models list` |
| `openclaw models scan` | 扫描模型提供商 | `openclaw models scan` |
| `openclaw models add` | 添加自定义模型 | `openclaw models add provider/model-id` |

### B.7 技能管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw skills list` | 列出可用技能 | `openclaw skills list` |
| `openclaw skills check` | 检查技能依赖 | `openclaw skills check` |
| `openclaw skills info` | 查看技能详情 | `openclaw skills info skill-name` |

**ClawHub CLI 命令**（用于技能市场操作，推荐使用 npx）：

| 命令 | 说明 | 示例 |
|------|------|------|
| `npx clawhub list` | 列出已安装技能 | `npx clawhub list` |
| `npx clawhub search` | 搜索技能市场 | `npx clawhub search "github"` |
| `npx clawhub install` | 安装技能 | `npx clawhub install skill-name` |
| `npx clawhub update` | 更新技能 | `npx clawhub update skill-name` |
| `npx clawhub uninstall` | 卸载技能 | `npx clawhub uninstall skill-name` |

### B.8 Cron 任务

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw cron list` | 列出定时任务 | `openclaw cron list` |
| `openclaw cron add` | 添加定时任务 | `openclaw cron add --name daily --schedule "0 8 * * *"` |
| `openclaw cron rm` | 删除定时任务（支持 rm/remove/delete） | `openclaw cron rm daily` |

### B.9 Webhook 管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw webhooks gmail` | Gmail Pub/Sub 钩子 | `openclaw webhooks gmail setup` |

### B.10 调试与诊断

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw doctor` | 运行诊断检查 | `openclaw doctor` |
| `openclaw logs` | 查看日志 | `openclaw logs --follow` |
| `openclaw dashboard` | 打开控制面板 | `openclaw dashboard` |

### B.11 设备与节点

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw devices list` | 列出配对设备 | `openclaw devices list` |
| `openclaw nodes list` | 列出节点 | `openclaw nodes list` |
| `openclaw qr` | 生成配对二维码 | `openclaw qr` |

### B.12 系统管理

| 命令 | 说明 | 示例 |
|------|------|------|
| `openclaw update status` | 检查更新状态 | `openclaw update status` |
| `openclaw update` | 执行更新 | `openclaw update` |
| `openclaw reset` | 重置配置 | `openclaw reset` |
| `openclaw uninstall` | 卸载 OpenClaw | `openclaw uninstall` |
| `openclaw --version` | 显示版本 | `openclaw --version` |

### B.13 常用选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `--dev` | 开发模式 | `openclaw --dev gateway start` |
| `--profile <name>` | 使用指定配置 | `openclaw --profile work gateway start` |
| `--log-level <level>` | 日志级别 | `openclaw --log-level debug gateway start` |
| `--no-color` | 禁用颜色 | `openclaw --no-color status` |
| `--help` | 显示帮助 | `openclaw --help` |

---

## C. 错误代码对照表

> ⚠️ **免责声明**：以下错误代码表为社区整理的参考信息，非 OpenClaw 官方标准文档内容。OpenClaw 官方主要使用 `openclaw doctor` 命令进行错误诊断和修复。如遇问题，建议优先运行 `openclaw doctor` 或 `openclaw doctor --fix` 进行排查。

### C.1 网关错误 (Gateway)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `GATEWAY_EADDRINUSE` | Port already in use | 端口被占用 | 更换端口或停止占用进程 |
| `GATEWAY_ECONNREFUSED` | Connection refused | 网关未启动 | 运行 `openclaw gateway start` |
| `GATEWAY_ETIMEDOUT` | Connection timeout | 连接超时 | 检查网络或增加超时时间 |
| `GATEWAY_EAUTH` | Authentication failed | 认证失败 | 检查 token 配置 |
| `GATEWAY_EWS_UPGRADE` | WebSocket upgrade failed | WebSocket 升级失败 | 检查代理或防火墙设置 |

### C.2 通道错误 (Channel)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `CHANNEL_ENOT_ENABLED` | Channel not enabled | 通道未启用 | 在配置中启用通道 |
| `CHANNEL_EAUTH` | Authentication failed | 认证失败 | 检查 bot token 或凭据 |
| `CHANNEL_ECONN` | Connection failed | 连接失败 | 检查网络连接 |
| `CHANNEL_ETIMEOUT` | Request timeout | 请求超时 | 重试或检查网络 |
| `CHANNEL_ERATE_LIMIT` | Rate limit exceeded | 速率限制 | 降低请求频率 |
| `CHANNEL_EFORBIDDEN` | Forbidden | 权限不足 | 检查 bot 权限设置 |

### C.3 代理错误 (Agent)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `AGENT_EMODEL` | Model not found | 模型不存在 | 检查模型配置 |
| `AGENT_EAUTH` | API key invalid | API 密钥无效 | 检查 auth 配置 |
| `AGENT_ERATE_LIMIT` | Rate limit exceeded | 模型请求限制 | 降低请求频率或更换模型 |
| `AGENT_ECONTEXT` | Context too long | 上下文超长 | 开启会话压缩或新开会话 |
| `AGENT_EMAX_TURNS` | Max turns exceeded | 达到最大轮数 | 简化任务或调整配置 |
| `AGENT_EEXEC_DENIED` | Command denied | 命令被拒绝 | 检查权限配置 |

### C.4 配置错误 (Config)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `CONFIG_ENOT_FOUND` | Config file not found | 配置文件不存在 | 运行 `openclaw setup` |
| `CONFIG_EPARSE` | Invalid JSON | JSON 格式错误 | 检查配置文件语法 |
| `CONFIG_EVALIDATION` | Validation failed | 配置验证失败 | 根据错误信息修正配置 |
| `CONFIG_EMISSING_FIELD` | Required field missing | 缺少必填字段 | 补充缺失的配置项 |

### C.5 工具错误 (Tools)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `TOOL_ENOT_FOUND` | Tool not found | 工具不存在 | 检查工具名称或安装技能 |
| `TOOL_EPERMISSION` | Permission denied | 权限不足 | 检查工具权限配置 |
| `TOOL_EEXEC` | Execution failed | 执行失败 | 查看详细错误信息 |
| `TOOL_EINVALID_ARGS` | Invalid arguments | 参数无效 | 检查参数格式 |
| `TOOL_ETIMEOUT` | Tool execution timeout | 执行超时 | 增加超时时间或简化任务 |

### C.6 内存错误 (Memory)

| 错误代码 | 错误信息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| `MEMORY_ENOT_FOUND` | Memory not found | 记忆不存在 | 检查记忆 ID |
| `MEMORY_ESEARCH` | Search failed | 搜索失败 | 检查向量存储状态 |
| `MEMORY_EINDEX` | Index error | 索引错误 | 运行 `openclaw memory reindex` |
| `MEMORY_ESTORE` | Storage error | 存储错误 | 检查磁盘空间和权限 |

### C.7 HTTP 状态码

OpenClaw API 返回的标准 HTTP 状态码：

| 状态码 | 含义 | 常见场景 |
|--------|------|----------|
| `200` | OK | 请求成功 |
| `400` | Bad Request | 请求参数错误 |
| `401` | Unauthorized | 认证失败 |
| `403` | Forbidden | 权限不足 |
| `404` | Not Found | 资源不存在 |
| `429` | Too Many Requests | 速率限制 |
| `500` | Internal Server Error | 服务器内部错误 |
| `503` | Service Unavailable | 服务不可用 |

### C.8 常见错误排查

#### C.8.1 网关无法启动

```bash
# 检查端口占用
lsof -i :18789

# 强制启动（自动释放端口）
openclaw gateway start --force
```

#### C.8.2 通道连接失败

```bash
# 检查通道状态
openclaw channels status

# 重新登录
openclaw channels logout <channel>
openclaw channels login <channel>
```

#### C.8.3 模型调用失败

```bash
# 检查模型配置
openclaw models list

# 验证 API 密钥
openclaw config get auth.profiles

# 检查网关日志
openclaw logs
```

#### C.8.4 配置文件错误

```bash
# 验证配置
openclaw doctor

# 重置配置（谨慎使用）
openclaw reset
```

---

## D. 资源链接汇总

### D.1 官方资源

| 资源 | 链接 | 说明 |
|------|------|------|
| 官方网站 | https://openclaw.ai | 项目主页 |
| 官方文档 | https://docs.openclaw.ai | 完整文档 |
| GitHub 仓库 | https://github.com/openclaw/openclaw | 源码仓库 |
| 安装指南 | https://docs.openclaw.ai/start/installation | 安装教程 |
| 配置参考 | https://docs.openclaw.ai/configuration/overview | 配置说明 |
| API 文档 | https://docs.openclaw.ai/api | API 参考 |

### D.2 社区资源

| 资源 | 链接 | 说明 |
|------|------|------|
| Discord 社区 | https://discord.gg/clawd | 官方 Discord |
| Reddit | https://reddit.com/r/openclaw | 官方 Subreddit |
| Twitter/X | https://twitter.com/openclaw | 官方推特 |
| 技能市场 | https://clawhub.com | 技能商店 |

### D.3 相关工具

| 工具 | 链接 | 说明 |
|------|------|------|
| Home Assistant | https://www.home-assistant.io | 智能家居集成 |
| Tailscale | https://tailscale.com | 安全网络连接 |
| ngrok | https://ngrok.com | 本地服务暴露 |

### D.4 API 提供商

| 提供商 | 链接 | 说明 |
|--------|------|------|
| Anthropic | https://console.anthropic.com | Claude API |
| OpenAI | https://platform.openai.com | GPT API |
| Google AI | https://ai.google.dev | Gemini API |
| Groq | https://console.groq.com | 快速推理 API |

### D.5 学习资源

| 资源 | 链接 | 说明 |
|------|------|------|
| Awesome OpenClaw | https://github.com/hesamsheikh/awesome-openclaw | 精选资源 |
| OpenClaw Blog | https://openclaw.ai/blog | 官方博客 |
| YouTube 频道 | https://youtube.com/@openclaw | 视频教程 |

### D.6 内部工具链接

| 服务 | 地址 | 说明 |
|------|------|------|
| Gateway API | `ws://127.0.0.1:18789` | WebSocket 网关 |
| Control UI | `http://127.0.0.1:18789/ui` | 控制面板 |
| Canvas | `http://127.0.0.1:18789/canvas` | 画布服务 |
| Health Endpoint | `http://127.0.0.1:18789/health` | 健康检查 |

---

## E. 版本历史

> **说明**：以下版本历史为示例内容，基于开发计划整理。实际版本历史请参考 [GitHub Releases](https://github.com/openclaw/openclaw/releases)。

### E.1 版本号说明

OpenClaw 使用 **日历版本号**（CalVer）格式：`YYYY.M.D`

例如：`2026.2.23` 表示 2026 年 2 月 23 日发布

### E.2 主要版本历史

#### 2026.2.23 (2026-02-23)

**新特性：**
- 新增 Feishu 插件完整支持
- 新增 `feishu_doc`、`feishu_wiki`、`feishu_drive`、`feishu_bitable` 工具
- 改进子代理并发控制
- 优化会话压缩算法

**修复：**
- 修复 WhatsApp 群聊消息处理问题
- 修复 Discord 私信路由错误
- 修复 Cron 任务时区问题

**改进：**
- 提升 Gateway 启动速度
- 优化内存使用

#### 2026.2.15 (2026-02-15)

**新特性：**
- 新增浏览器控制增强功能
- 支持多标签页管理
- 新增 A2UI 交互协议

**修复：**
- 修复部分通道重连问题
- 修复模型缓存失效问题

#### 2026.2.1 (2026-02-01)

**新特性：**
- 新增多代理支持
- 新增代理间路由功能
- 新增技能依赖管理

**改进：**
- 重构工具调用系统
- 优化错误处理

#### 2026.1.20 (2026-01-20)

**新特性：**
- 新增 Tailscale 集成
- 新增设备配对功能
- 新增 iOS 应用支持

**修复：**
- 修复内存泄漏问题
- 修复 Webhook 并发问题

#### 2026.1.10 (2026-01-10)

**新特性：**
- 初始版本发布
- 支持 Telegram、WhatsApp、Discord
- 基础工具系统

### E.3 版本检查与更新

```bash
# 检查更新
openclaw update status

# 安装更新
openclaw update

# 升级后建议运行 doctor 检查配置兼容性
openclaw doctor
```

### E.4 兼容性说明

| 版本 | Node.js | 支持平台 |
|------|---------|----------|
| 2026.2.x | ≥ 20.0 | macOS, Linux, Windows |
| 2026.1.x | ≥ 18.0 | macOS, Linux |

**注意**：bun 为实验性支持，不推荐用于 Gateway 运行时。

---

## F. 快速启动脚本

### F.1 一键安装脚本 (macOS/Linux)

```bash
#!/bin/bash
# install-openclaw.sh

echo "🦞 安装 OpenClaw..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 请先安装 Node.js 20+"
    exit 1
fi

# 安装 OpenClaw CLI
npm install -g openclaw

# 初始化配置
openclaw setup

# 启动网关
echo "🚀 启动网关..."
openclaw gateway start

echo "✅ 安装完成！"
echo "📖 访问 http://127.0.0.1:18789/ui 打开控制面板"
```

### F.2 Docker Compose 配置

```yaml
# docker-compose.yml
version: '3.8'

services:
  openclaw:
    image: openclaw/openclaw:latest
    container_name: openclaw
    ports:
      - "18789:18789"
    volumes:
      - ./openclaw-data:/root/.openclaw
    environment:
      - OPENCLAW_CONFIG=/root/.openclaw/openclaw.json
      - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
    restart: unless-stopped
```

**注意**：Docker 部署时建议通过环境变量 `OPENCLAW_GATEWAY_TOKEN` 配置网关认证。

### F.3 Systemd 服务文件

```ini
# /etc/systemd/system/openclaw.service
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
Type=simple
User=openclaw
ExecStart=/usr/bin/openclaw gateway start
ExecStop=/usr/bin/openclaw gateway stop
Restart=on-failure
RestartSec=10
Environment="OPENCLAW_GATEWAY_TOKEN=your-secure-token-here"

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl enable openclaw
sudo systemctl start openclaw
sudo systemctl status openclaw
```

---

## G. 术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| 代理 | Agent | AI 代理，OpenClaw 的核心执行单元 |
| 网关 | Gateway | 消息路由和代理管理的中心服务 |
| 通道 | Channel | 聊天平台连接（Telegram、WhatsApp 等） |
| 技能 | Skill | 可复用的功能扩展包 |
| 工具 | Tool | 代理可调用的具体功能 |
| 记忆 | Memory | 代理的持久化存储系统 |
| 会话 | Session | 一次完整的对话上下文 |
| 绑定 | Binding | 用户与代理的关联配置 |
| 节点 | Node | 受网关管理的设备 |
| 钩子 | Hook | 事件触发的回调机制 |
| Cron | Cron | 定时任务调度 |
| Webhook | Webhook | HTTP 回调接口 |

---

**附录版本**: v1.1  
**适用 OpenClaw 版本**: 2026.2.23  
**最后更新**: 2026-02-28
