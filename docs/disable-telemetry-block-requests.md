# 完全禁用遥测并阻止向 api.anthropic.com 发送数据

本文档提供完整方案，用于禁用 Claude Code 项目中的所有遥测数据收集，并阻止向 `api.anthropic.com` 发送任何数据。

## 方案概览

| 方案 | 复杂度 | 效果 | 副作用 |
|------|--------|------|--------|
| 环境变量配置 | 低 | 禁用遥测，但 API 调用仍正常 | 遥测关闭，核心功能正常 |
| HTTP 拦截器 | 中 | 阻止所有到 api.anthropic.com 的连接 | Claude API 无法使用 |
| 仅用 OpenAI 模式 | 中 | 全部请求重定向到自定义端点 | 完全脱离 Anthropic 服务 |

## 方案一：环境变量配置（推荐）

### 1.1 禁用所有遥测
```bash
# Windows PowerShell
$env:DISABLE_TELEMETRY="1"
$env:CLAUDE_CODE_ENABLE_TELEMETRY=""
$env:SENTRY_DSN=""

# Linux/macOS
export DISABLE_TELEMETRY=1
export CLAUDE_CODE_ENABLE_TELEMETRY=
export SENTRY_DSN=
```

### 1.2 禁用所有非必要网络流量
```bash
# 更严格的限制，禁用自动更新、功能检查等
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 1.3 验证配置
创建 `.env` 文件在项目根目录：
```env
# .env
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
SENTRY_DSN=
CLAUDE_CODE_ENABLE_TELEMETRY=
```

运行测试：
```bash
# 检查隐私级别
bun run dev -- --dump-system-prompt 2>&1 | grep -i "privacy\|telemetry"

# 或直接运行并监控网络
bun run dev --dangerously-skip-permissions
```

## 方案二：HTTP 拦截器（阻止所有到 api.anthropic.com 的请求）

### 2.1 修改代理拦截器
编辑 `src/utils/proxy.ts`，在现有拦截器基础上添加：

```typescript
// 在文件顶部添加导入
import { URL } from 'url'

// 在现有拦截器函数中添加检查
proxyInterceptorId = axios.interceptors.request.use(config => {
  // 原有代理逻辑...
  
  // 新增：阻止所有到 api.anthropic.com 的请求
  if (config.url && config.url.includes('api.anthropic.com')) {
    throw new Error(`Blocked request to ${config.url}: Anthropic API calls are disabled`)
  }
  
  return config
})
```

### 2.2 创建专用拦截器模块
创建 `src/utils/blockAnthropic.ts`：

```typescript
import axios from 'axios'

let interceptorId: number | null = null

export function blockAnthropicRequests(): void {
  if (interceptorId !== null) {
    return
  }
  
  interceptorId = axios.interceptors.request.use(config => {
    const url = config.url || ''
    
    // 阻止所有 Anthropic 域名
    const blockedDomains = [
      'api.anthropic.com',
      'api-staging.anthropic.com',
      // 可选：添加其他 Anthropic 域名
    ]
    
    for (const domain of blockedDomains) {
      if (url.includes(domain)) {
        console.error(`[BLOCKED] Request to ${domain}: ${config.method?.toUpperCase()} ${url}`)
        throw new Error(`Requests to ${domain} are disabled by configuration`)
      }
    }
    
    return config
  })
}

export function unblockAnthropicRequests(): void {
  if (interceptorId !== null) {
    axios.interceptors.request.eject(interceptorId)
    interceptorId = null
  }
}

// 默认启用
blockAnthropicRequests()
```

在 `src/bootstrap/state.ts` 中导入并调用：
```typescript
import { blockAnthropicRequests } from '../utils/blockAnthropic.js'

// 在初始化函数中调用
blockAnthropicRequests()
```

### 2.3 条件启用
可以通过环境变量控制：
```typescript
export function blockAnthropicRequests(): void {
  if (process.env.BLOCK_ANTHROPIC_REQUESTS !== '1') {
    return
  }
  // ... 拦截器逻辑
}
```

## 方案三：仅使用 OpenAI 兼容模式

### 3.1 完全切换到 OpenAI 协议
```bash
# 使用本地模型（如 Ollama）
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"
export OPENAI_MODEL="deepseek-coder"  # 或任何本地模型

# 同时禁用 Anthropic 遥测
export DISABLE_TELEMETRY=1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 3.2 修改默认配置
编辑 `src/utils/config.ts`，设置默认使用 OpenAI：

```typescript
// 在适当的位置添加默认值
export function getDefaultConfig() {
  return {
    // ... 其他配置
    useOpenAI: true,
    openaiBaseURL: process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1',
    // ... 
  }
}
```

## 方案四：修改遥测初始化代码

### 4.1 禁用第一方事件日志
编辑 `src/services/analytics/firstPartyEventLogger.ts`：

```typescript
export function is1PEventLoggingEnabled(): boolean {
  // 强制禁用
  if (process.env.FORCE_DISABLE_1P_LOGGING === '1') {
    return false
  }
  return !isAnalyticsDisabled()
}

// 或直接修改
export function is1PEventLoggingEnabled(): boolean {
  return false  // 强制禁用
}
```

### 4.2 禁用 BigQuery 指标导出
编辑 `src/utils/telemetry/bigqueryExporter.ts`：

```typescript
export class BigQueryMetricsExporter implements PushMetricExporter {
  async export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    // 直接跳过导出
    if (process.env.DISABLE_BIGQUERY_EXPORT === '1') {
      resultCallback({ code: ExportResultCode.SUCCESS })
      return
    }
    // ... 原有逻辑
  }
}
```

### 4.3 禁用所有遥测初始化
编辑 `src/entrypoints/init.ts`：

```typescript
export const init = memoize(async (): Promise<void> => {
  // ... 其他初始化
  
  // 跳过第一方事件日志初始化
  if (process.env.SKIP_1P_EVENT_LOGGING !== '1') {
    void Promise.all([
      import('../services/analytics/firstPartyEventLogger.js'),
      import('../services/analytics/growthbook.js'),
    ]).then(([fp, gb]) => {
      fp.initialize1PEventLogging()
      gb.onGrowthBookRefresh(() => {
        void fp.reinitialize1PEventLoggingIfConfigChanged()
      })
    })
  }
  
  // ... 其他代码
})

export function initializeTelemetryAfterTrust(): void {
  // 完全跳过遥测初始化
  if (process.env.SKIP_ALL_TELEMETRY === '1') {
    return
  }
  // ... 原有逻辑
}
```

## 验证方法

### 网络监控
```bash
# Linux/macOS 使用 tcpdump
sudo tcpdump -i any -n host api.anthropic.com

# Windows 使用资源监视器或 Wireshark
```

### 日志检查
```bash
# 启用调试日志
export DEBUG=1
export CLAUDE_CODE_DEBUG=1

# 运行并检查日志
bun run dev 2>&1 | grep -i "api\.anthropic\|telemetry\|metric\|export"
```

### 代码检查
```bash
# 检查是否还有到 api.anthropic.com 的引用
grep -r "api\.anthropic\.com" src --include="*.ts" --include="*.tsx"

# 检查遥测函数调用
grep -r "logEvent\|captureException\|export\|BigQuery" src --include="*.ts" | grep -v "test\|mock"
```

## 完整配置示例

### `.env` 文件
```env
# 核心配置
ANTHROPIC_API_KEY=sk-dummy  # 虚拟密钥，实际不会使用
CLAUDE_CODE_USE_OPENAI=1
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=deepseek-coder

# 禁用所有遥测
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
CLAUDE_CODE_ENABLE_TELEMETRY=
SENTRY_DSN=

# 拦截器控制
BLOCK_ANTHROPIC_REQUESTS=1
SKIP_ALL_TELEMETRY=1
FORCE_DISABLE_1P_LOGGING=1
DISABLE_BIGQUERY_EXPORT=1

# 调试
DEBUG=1
CLAUDE_CODE_DEBUG=1
```

### `package.json` 脚本
```json
{
  "scripts": {
    "dev:private": "dotenv -e .env -- bun run dev --dangerously-skip-permissions",
    "build:private": "dotenv -e .env -- bun run build",
    "test:network": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 bun test"
  }
}
```

## 注意事项

### 1. 功能影响
- **禁用遥测**：不影响核心功能，但无法获取使用统计
- **阻止 API 请求**：Claude 对话功能将失效
- **OpenAI 模式**：需要本地或第三方模型服务

### 2. 更新风险
- 项目更新可能覆盖代码修改
- 建议使用 Git 分支或补丁文件
- 定期检查新添加的遥测代码

### 3. 法律合规
- 遵守 Anthropic API 使用条款
- 企业用户注意数据出境规定
- 开源项目修改需遵守许可证

## 故障排除

### 问题1：拦截器不生效
```typescript
// 检查拦截器顺序
console.log('拦截器ID:', interceptorId)
// 确保在代理拦截器之前添加
```

### 问题2：仍有网络请求
```bash
# 检查是否有直接使用 fetch 或 XMLHttpRequest
grep -r "fetch(\|new XMLHttpRequest\|new WebSocket" src --include="*.ts"
```

### 问题3：启动失败
```bash
# 禁用所有可能导致失败的初始化
export CLAUDE_CODE_SKIP_INIT_CHECKS=1
export NODE_OPTIONS="--max-old-space-size=4096"
```

## 高级：构建时修改

### 修改 `build.ts`
```typescript
// 在构建时注入禁用代码
const result = await Bun.build({
  // ... 原有配置
  define: {
    ...getMacroDefines(),
    // 注入全局禁用标志
    'process.env.DISABLE_TELEMETRY': '"1"',
    'process.env.BLOCK_ANTHROPIC_REQUESTS': '"1"',
  },
})
```

### 创建补丁文件
```bash
# 创建 patches/disable-telemetry.patch
git diff > patches/disable-telemetry.patch

# 应用补丁
git apply patches/disable-telemetry.patch
```

---

## 总结

| 需求 | 推荐方案 | 具体操作 |
|------|----------|----------|
| 仅禁用遥测 | 环境变量 | 设置 `DISABLE_TELEMETRY=1` |
| 完全隐私 | 环境变量 + 拦截器 | 方案一 + 方案二 |
| 脱离 Anthropic | OpenAI 模式 | 方案三 |
| 企业部署 | 代码修改 + 构建配置 | 方案四 + 构建时修改 |

**最低配置**（仅禁用遥测）：
```bash
export DISABLE_TELEMETRY=1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

**完全隔离配置**：
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL=http://localhost:11434/v1
export DISABLE_TELEMETRY=1
export BLOCK_ANTHROPIC_REQUESTS=1
```

> **警告**：完全阻止到 api.anthropic.com 的请求将导致 Claude 对话功能失效。仅当使用 OpenAI 兼容模式或本地模型时才推荐使用。

*文档更新时间：2026-04-04*  
*适用于 Claude Code 版本 2.1.888*