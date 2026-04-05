# Claude Code 项目安全分析报告

**分析日期**: 2026-04-04  
**项目版本**: 2.1.888  
**分析范围**: 源代码审查，重点关注后台可疑代码、数据收集和外部通信

## 执行摘要

Claude Code 项目是一个反向工程/反编译的官方 Claude Code CLI 工具。代码审查发现项目包含标准的遥测、错误报告和功能标志系统，主要与 Anthropic 服务通信。未发现明显的恶意代码或未披露的数据收集，但存在以下值得注意的通信：

1. **遥测数据**发送到 Anthropic API 端点
2. **错误报告**通过 Sentry（可选）
3. **功能标志**通过 GrowthBook
4. **语音识别**通过 WebSocket 到 Anthropic

所有外部通信都面向 Anthropic 服务或用户配置的端点，未发现向第三方域名的数据传输。

## 详细分析

### 1. 外部网络通信

#### 1.1 Anthropic API 端点
| 端点 | 用途 | 条件/控制 |
|------|------|-----------|
| `https://api.anthropic.com/api/claude_code/metrics` | 性能指标收集 | 需要信任对话框确认，组织可禁用 |
| `https://api.anthropic.com/api/event_logging/batch` | 事件日志记录 | 采样配置，需要信任对话框 |
| `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled` | 检查指标启用状态 | 组织级控制 |
| `https://api.anthropic.com/api/ws/speech_to_text/voice_stream` | 语音识别 WebSocket | 仅语音模式启用，需 OAuth |

#### 1.2 用户配置的端点
- **OpenAI 兼容端点**: 通过 `CLAUDE_CODE_USE_OPENAI=1` 启用，使用 `OPENAI_BASE_URL` 环境变量
- **Anthropic API**: 主要 Claude API 调用

#### 1.3 其他服务
- **Sentry**: 错误报告，仅当 `SENTRY_DSN` 环境变量设置时启用
- **GrowthBook**: 功能标志和实验，远程配置

### 2. 数据收集机制

#### 2.1 遥测系统
**位置**: `src/utils/telemetry/`
- `bigqueryExporter.ts`: 指标导出到 Anthropic BigQuery
- `firstPartyEventLogger.ts`: 第一方事件日志记录
- `sessionTracing.ts`: 会话跟踪

**控制机制**:
- 信任对话框要求 (`checkHasTrustDialogAccepted()`)
- 组织级禁用 (`checkMetricsEnabled()`)
- 隐私级别检查 (`isEssentialTrafficOnly()`)
- 事件采样配置

#### 2.2 错误报告
**位置**: `src/utils/sentry.ts`
- 可选功能，需要 `SENTRY_DSN` 环境变量
- 包含敏感信息过滤（移除认证头）
- 忽略不可操作的网络错误

#### 2.3 功能标志
**位置**: `src/services/analytics/growthbook.ts` (存根)
- 根据 CLAUDE.md，GrowthBook 实现为空
- 但相关代码仍存在，可能通过环境变量启用

### 3. 权限和用户控制

#### 3.1 信任对话框
- 首次运行或权限更改时显示
- 控制遥测数据收集
- 记录在配置中

#### 3.2 环境变量控制
| 变量 | 作用 |
|------|------|
| `SENTRY_DSN` | 启用/禁用 Sentry 错误报告 |
| `FEATURE_*` | 启用特定功能标志 |
| `CLAUDE_CODE_USE_OPENAI` | 切换到 OpenAI 兼容模式 |
| `ANTHROPIC_API_KEY` | 主 API 密钥 |

#### 3.3 组织级控制
- 通过 `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled` 检查
- 允许组织禁用指标收集

### 4. 原生模块分析

#### 4.1 音频捕获 (`audio-capture-napi`)
- 加载平台特定的 `.node` 原生模块
- 用于语音模式录音
- 权限检查（macOS TCC，Windows 注册表）

#### 4.2 图像处理 (`image-processor-napi`)
- 图像处理原生模块
- 用于图像上传到 API

#### 4.3 计算机使用 (`@ant/computer-use-*`)
- 屏幕捕获和输入模拟
- 跨平台支持（macOS，Windows，Linux 待完成）

### 5. 潜在关注点

#### 5.1 默认启用的遥测
- 指标收集在信任对话框接受后默认启用
- 用户可能不清楚数据收集范围

#### 5.2 语音数据
- 语音模式将音频发送到 Anthropic 的语音识别服务
- 需要 OAuth 认证，但用户可能未意识到数据离开本地设备

#### 5.3 功能标志系统
- 远程配置能力可能被滥用
- 当前实现为存根，但框架存在

#### 5.4 原生模块
- 编译的 `.node` 文件难以审查
- 项目是开源的，但需要信任构建过程

### 6. 未发现的问题

❌ **未发现**向第三方域名的隐藏数据传输  
❌ **未发现**硬编码的凭据或密钥  
❌ **未发现**未披露的后门功能  
❌ **未发现**加密货币挖矿或恶意负载  
❌ **未发现**用户数据泄露到非 Anthropic 服务

### 7. 安全建议

#### 7.1 给用户的建议
1. **审查环境变量**: 明确设置 `SENTRY_DSN` 等敏感配置
2. **使用防火墙**: 监控出站连接，特别是到 `api.anthropic.com`
3. **审查信任对话框**: 理解遥测数据收集的含义
4. **语音模式注意**: 了解语音数据会发送到 Anthropic 服务器

#### 7.2 给项目维护者的建议
1. **增强透明度**: 在文档中明确数据收集实践
2. **提供选择退出**: 更明确的遥测禁用选项
3. **安全审计**: 定期审计第三方依赖和原生模块
4. **漏洞报告**: 建立明确的安全漏洞报告渠道

### 8. 技术架构评估

#### 8.1 代码质量
- 大量 TypeScript 类型错误（~1341 tsc 错误），来自反编译过程
- 但运行时功能正常
- 代码结构良好，模块化设计

#### 8.2 安全实践
- 敏感信息过滤（Sentry 中的认证头移除）
- 错误处理避免崩溃
- 权限检查（信任对话框）

#### 8.3 依赖管理
- 使用 Bun workspace 管理内部包
- 大量第三方依赖，但主要是知名库
- 定期更新依赖版本

### 9. 结论

Claude Code 项目**不包含明显的恶意代码或未披露的数据收集**。所有外部通信都面向：

1. **Anthropic 服务**（API、遥测、语音识别）
2. **用户配置的端点**（OpenAI 兼容模式）
3. **可选服务**（Sentry，需明确启用）

然而，项目包含**企业级遥测系统**，可能在用户不完全知情的情况下收集使用数据。建议用户：

1. 仔细阅读信任对话框
2. 根据需要配置环境变量
3. 了解语音模式的数据传输
4. 监控网络连接（如需）

**总体风险评估**: **低到中**
- 对于注重隐私的用户：**中**（需配置禁用遥测）
- 对于普通用户：**低**（标准 SaaS 工具实践）
- 对于企业用户：**低**（有组织级控制）

---

## 附录：审查的文件列表

### 关键安全相关文件
1. `src/utils/sentry.ts` - Sentry 错误报告
2. `src/utils/telemetry/bigqueryExporter.ts` - 指标导出
3. `src/utils/telemetry/firstPartyEventLoggingExporter.ts` - 事件日志
4. `src/services/api/metricsOptOut.ts` - 指标选择退出
5. `src/services/voiceStreamSTT.ts` - 语音识别 WebSocket
6. `src/services/api/openai/client.ts` - OpenAI 兼容客户端

### 配置和权限文件
1. `src/utils/config.ts` - 配置管理
2. `src/bootstrap/state.ts` - 会话状态
3. `src/utils/auth.ts` - 认证工具

### 原生模块包装器
1. `packages/audio-capture-napi/src/index.ts` - 音频捕获
2. `packages/image-processor-napi/` - 图像处理
3. `packages/@ant/computer-use-*/` - 计算机使用

---

*报告生成: Claude Code 安全审查工具*  
*注意事项: 此分析基于源代码静态分析，未进行运行时行为监控或二进制分析。建议进行动态分析以验证实际行为。*