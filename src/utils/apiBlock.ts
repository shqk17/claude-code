import axios from 'axios'
import { URL } from 'url'
import { getInitialSettings } from './settings/settings.js'
import { getAPIProvider } from './model/providers.js'

export class APIBlockManager {
  private interceptorId: number | null = null

  /**
   * 初始化API屏蔽功能
   * 根据配置设置请求拦截和重定向
   */
  setup() {
    const settings = getInitialSettings()
    const config = settings.apiProviderConfig as {
      blockAnthropicAPI?: boolean
      customEndpoints?: {
        openAIBaseURL?: string
      }
      provider?: string
    } | undefined

    // 如果启用 API 屏蔽，则设置请求拦截器
    if (config?.blockAnthropicAPI) {
      this.setupRequestInterceptor(config)
    }
  }

  /**
   * 设置请求拦截器
   * 拦截所有到api.anthropic.com的请求
   * 根据配置进行重定向或拒绝
   */
  private setupRequestInterceptor(config: any) {
    this.interceptorId = axios.interceptors.request.use(requestConfig => {
      const url = requestConfig.url || ''

      // 检查是否为Anthropic API请求
      if (url.includes('api.anthropic.com')) {
        // 如果有配置重定向端点，则静默重定向
        if (config.customEndpoints?.openAIBaseURL) {
          return this.redirectToOpenAI(
            requestConfig,
            config.customEndpoints.openAIBaseURL,
          )
        }

        // 否则根据provider设置重定向
        const provider = config.provider || 'openai'
        return this.redirectByProvider(
          requestConfig,
          provider,
          config.customEndpoints,
        )
      }

      return requestConfig
    })
  }

  /**
   * 重定向到OpenAI兼容端点
   * 将Anthropic API路径映射到OpenAI兼容路径
   */
  private redirectToOpenAI(requestConfig: any, openAIBaseURL: string): any {
    const originalUrl = requestConfig.url || ''
    const urlObj = new URL(originalUrl)

    // 构建新的OpenAI兼容URL
    const path = urlObj.pathname
    let newPath = path

    // 映射Anthropic端点到OpenAI端点
    if (path.includes('/v1/messages')) {
      newPath = '/v1/chat/completions'
    } else if (path.includes('/api/claude_code')) {
      newPath = path.replace('/api/claude_code', '')
    }

    // 构建新URL
    const newUrl = `${openAIBaseURL}${newPath}${urlObj.search}`

    // 更新请求配置
    return {
      ...requestConfig,
      url: newUrl,
      headers: {
        ...requestConfig.headers,
        // 更新认证头为OpenAI格式
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ''}`,
      },
    }
  }

  /**
   * 根据提供商进行相应的重定向逻辑
   * 支持openai, bedrock, vertex, foundry等提供商
   */
  private redirectByProvider(
    requestConfig: any,
    provider: string,
    customEndpoints: any,
  ): any {
    // 根据提供商进行相应的重定向逻辑
    switch (provider) {
      case 'openai':
        const baseURL =
          customEndpoints?.openAIBaseURL || 'https://api.openai.com/v1'
        return this.redirectToOpenAI(requestConfig, baseURL)
      case 'bedrock':
        // AWS Bedrock重定向逻辑
        return this.redirectToBedrock(requestConfig, customEndpoints)
      case 'vertex':
        // Google Vertex重定向逻辑
        return this.redirectToVertex(requestConfig, customEndpoints)
      case 'foundry':
        // Foundry重定向逻辑
        return this.redirectToFoundry(requestConfig, customEndpoints)
      default:
        // 默认抛出错误
        throw new Error(
          '请求被屏蔽：根据配置阻止了对api.anthropic.com的访问，且未配置有效的重定向端点',
        )
    }
  }

  /**
   * AWS Bedrock重定向实现
   * 根据Bedrock API格式进行转换
   */
  private redirectToBedrock(requestConfig: any, customEndpoints: any): any {
    // AWS Bedrock重定向实现
    // 这里需要根据Bedrock API格式进行转换
    return requestConfig
  }

  /**
   * Google Vertex重定向实现
   */
  private redirectToVertex(requestConfig: any, customEndpoints: any): any {
    // Google Vertex重定向实现
    return requestConfig
  }

  /**
   * Foundry重定向实现
   */
  private redirectToFoundry(requestConfig: any, customEndpoints: any): any {
    // Foundry重定向实现
    return requestConfig
  }

  /**
   * 清理请求拦截器
   * 在应用关闭时清理
   */
  teardown() {
    if (this.interceptorId !== null) {
      axios.interceptors.request.eject(this.interceptorId)
      this.interceptorId = null
    }
  }
}
