# Claude Code 项目打包与部署指南

本文档总结了如何将 Claude Code 项目打包成可复制的产品，并部署到其他终端使用。基于 2026-04-04 的技术讨论整理。

## 概述

Claude Code 是一个基于 Bun 运行时的 CLI 工具，采用代码分割（code splitting）构建。默认构建配置生成 `dist/` 目录，包含主入口 `cli.js` 和约 450 个 chunk 文件。由于依赖外部化，直接复制 `dist/` 目录到其他环境可能无法运行。

## 问题描述

### 典型错误场景
将 `dist/` 目录复制到项目外文件夹，尝试用 Node.js 运行：
```bash
node cli.js
```

### 错误信息
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws' imported from G:\workspace\cntrae_worksapce\dist\chunk-hkn7tzgv.js
```

## 错误分析

### 根本原因
1. **构建配置**：`build.ts` 使用 `splitting: true` + `target: "bun"`
2. **依赖外部化**：npm 包（如 `ws`、`react`、`@anthropic-ai/sdk`）未被内联打包
3. **模块解析**：运行时需要通过 Node.js/Bun 的模块解析找到 `node_modules`
4. **后处理有限**：`build.ts` 仅替换 `import.meta.require` 以兼容 Node.js，但 ES 模块导入 `import "ws"` 仍需外部依赖

### 项目架构特点
- 为 **Bun 运行时** 优化设计
- 使用 Bun workspace 管理内部包
- 包含平台特定的原生模块（`audio-capture-napi`、`image-processor-napi` 等）
- 构建产物已通过后处理兼容 Node.js，但推荐使用 Bun

## 解决方案

### 方案1：使用 Bun 运行（最简单）
**前提**：目标机器安装 [Bun ≥1.2.0](https://bun.sh/docs/installation)

```bash
# 在目标机器上
bun cli.js [参数]
```

**优势**：
- Bun 自动解析依赖（可向上查找 `node_modules` 或使用内置包）
- 无需完整 `node_modules` 目录
- 性能最佳

### 方案2：复制必要的依赖
在 `dist` 目录旁创建最小 `node_modules`：

```bash
# 在源项目目录执行
# 1. 复制 dist 到目标位置
cp -r dist /path/to/target/

# 2. 创建 package.json（仅包含运行时依赖）
cd /path/to/target
cat > package.json << 'EOF'
{
  "name": "claude-code-portable",
  "type": "module",
  "dependencies": {
    "ws": "^8.20.0",
    "react": "^19.2.4",
    "react-compiler-runtime": "^1.0.0",
    "@anthropic-ai/sdk": "^0.80.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "chalk": "^5.6.2",
    "commander": "14.0.0"
  }
}
EOF

# 3. 安装依赖（在目标机器执行）
bun install  # 或 npm install

# 4. 运行
node cli.js
```

### 方案3：修改构建配置，生成单文件包（推荐）
修改 `build.ts`，让依赖内联：

```typescript
// 在 build.ts 中修改 Bun.build 配置
const result = await Bun.build({
    entrypoints: ["src/entrypoints/cli.tsx"],
    outdir: "dist-standalone",
    target: "node", // 改为 node
    splitting: false, // 关闭代码分割
    packages: "bundle", // 内联依赖
    define: getMacroDefines(),
    features,
});
```

**步骤**：
1. 备份原 `build.ts`
2. 应用上述修改
3. 重新构建：`bun run build`
4. 测试：`node dist-standalone/cli.js --version`

**优势**：
- 生成单个文件，便于分发
- 包含所有依赖，无需外部 `node_modules`
- 可在任何有 Node.js 的环境运行

### 方案4：使用 pkg 打包成可执行文件
```bash
# 安装 pkg
npm install -g pkg

# 创建 package.json 指定入口
echo '{"bin": "cli.js"}' > package.json

# 打包（需指定 node 版本）
pkg cli.js --target node18-win-x64 --output claude-code.exe
```

## Bun 安装指南

### Windows 系统
#### 方法1：PowerShell 安装脚本（推荐）
```powershell
# 以管理员身份打开 PowerShell，执行：
powershell -c "irm bun.sh/install.ps1 | iex"
```

#### 方法2：Windows 包管理器
```powershell
# 使用 Scoop
scoop install bun

# 使用 Winget
winget install oven.bun
```

### macOS 系统
```bash
# 使用 Homebrew（推荐）
brew tap oven-sh/bun
brew install bun

# 或使用安装脚本
curl -fsSL https://bun.sh/install | bash
```

### Linux 系统
```bash
# 安装脚本
curl -fsSL https://bun.sh/install | bash

# 或使用包管理器
# Ubuntu/Debian
sudo apt update
sudo apt install bun

# Arch Linux
yay -S bun
```

### 验证安装
```bash
bun --version  # 应显示 1.2.0+
bun --help     # 查看可用命令
```

### 升级 Bun
```bash
bun upgrade
```

## 最佳实践

### 完整项目复制（推荐）
```bash
# 复制整个项目（排除 node_modules 以减小体积）
rsync -av --exclude=node_modules --exclude=.git . /path/to/destination/

# 或创建压缩包
tar -czf claude-code.tar.gz --exclude=node_modules --exclude=.git .
```

### 在目标机器部署
```bash
# 解压复制过来的项目
tar -xzf claude-code.tar.gz
cd claude-code

# 安装依赖（包括原生模块）
bun install

# 如果 dist/ 已存在，可跳过构建；否则重新构建
bun run build

# 验证安装
bun dist/cli.js --version
```

### 运行方式
#### 临时运行
```bash
bun dist/cli.js [命令参数]
```

#### 全局安装
```bash
# 在项目目录中执行
npm install -g .

# 安装后可通过 bin 名称调用
ccb --help
# 或
claude-code-best --help
```

#### 开发模式运行
```bash
bun run dev
```

### 环境变量配置
目标机器可能需要设置：
```bash
# 必需：Anthropic API 密钥
export ANTHROPIC_API_KEY="sk-..."

# 可选：启用特定功能
export FEATURE_BUDDY=1
export FEATURE_VOICE_MODE=1

# 可选：使用 OpenAI 兼容端点
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_API_KEY="ollama"
```

## 平台注意事项

### 跨平台兼容性
- **构建产物**：纯 JavaScript，但包含平台特定的原生模块
- **原生模块**：若源机器与目标机器操作系统不同（如 Windows → macOS），需在目标机器重新执行 `bun install` 编译原生模块
- **必要工具**：
  - ripgrep（`rg`）会自动通过 postinstall 脚本下载
  - 图形界面功能（Computer Use）需要 macOS/Windows 平台支持

### 权限问题
- 首次运行可能提示信任对话框，按提示确认即可
- Windows 可能需要管理员权限安装 Bun

## 常见问题

### Q1: 缺少依赖错误
**症状**：`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'xxx'`
**解决**：在目标机器执行 `bun install`

### Q2: 原生模块编译失败
**症状**：编译错误或运行时找不到原生模块
**解决**：
- Windows：安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- macOS：安装 Xcode Command Line Tools：`xcode-select --install`
- Linux：安装 gcc、make 等编译工具链

### Q3: ripgrep 未找到
**症状**：`rg: command not found`
**解决**：
- 自动下载：项目 postinstall 脚本会尝试下载
- 手动安装：[ripgrep 官网](https://github.com/BurntSushi/ripgrep)

### Q4: 权限被拒绝
**症状**：`Permission denied` 或安全软件拦截
**解决**：
- Windows：以管理员身份运行
- 添加安全软件例外
- 检查文件权限

## 验证部署
运行健康检查确认所有功能正常：
```bash
bun run health
```

## Docker 部署（如需完全隔离）
项目暂未提供官方 Dockerfile，但可基于 Bun 官方镜像创建：
```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY . .
RUN bun install && bun run build
ENTRYPOINT ["bun", "dist/cli.js"]
```

## 总结

| 方案 | 复杂度 | 可移植性 | 推荐场景 |
|------|--------|----------|----------|
| Bun 运行 | 低 | 高 | 目标机器可安装 Bun |
| 单文件包 | 中 | 最高 | 需要独立分发 |
| 完整项目复制 | 中 | 高 | 开发环境迁移 |
| pkg 打包 | 高 | 高 | 需要原生可执行文件 |

**推荐流程**：
1. 目标机器安装 Bun
2. 复制整个项目（排除 `node_modules`）
3. 在目标机器执行 `bun install`
4. 运行 `bun dist/cli.js` 或全局安装

---

*文档更新时间：2026-04-04*  
*基于 Claude Code 项目技术讨论整理*