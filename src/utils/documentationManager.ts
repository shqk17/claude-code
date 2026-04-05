import fs from 'fs/promises'
import path from 'path'
import { getInitialSettings } from './settings/settings.js'

/**
 * 文档管理器 - 支持多语言文档查找
 * 根据用户配置的语言偏好自动查找对应语言版本的文档
 */
export class DocumentationManager {
  private language: string = 'en'
  private forceLanguage: boolean = false

  setLanguage(lang: string, force: boolean = false) {
    this.language = lang
    this.forceLanguage = force
  }

  /**
   * 查找指定文档
   * @param docName - 文档名称（不含扩展名）
   * @param baseDir - 基础搜索目录
   * @returns 找到的文件路径，如果未找到则返回null
   */
  async findDocument(docName: string, baseDir: string): Promise<string | null> {
    // 根据配置决定查找模式
    const patterns = this.getSearchPatterns(docName)

    for (const pattern of patterns) {
      const filePath = path.join(baseDir, pattern)
      try {
        await fs.access(filePath)
        return filePath
      } catch {
        // File not accessible, try next pattern
      }
    }

    // 如果强制使用指定语言且找不到文档，返回null
    if (this.forceLanguage) {
      return null
    }

    // 否则尝试查找英文文档作为回退
    return this.findEnglishFallback(docName, baseDir)
  }

  /**
   * 获取搜索模式列表
   * @param docName - 文档名称
   * @returns 文件路径模式数组
   */
  private getSearchPatterns(docName: string): string[] {
    const patterns = [
      `${docName}.${this.language}.md`,
      `${docName}.${this.language.split('-')[0]}.md`,
      `${this.language}/${docName}.md`,
      `docs/${this.language}/${docName}.md`,
    ]

    // 如果不强制使用指定语言，添加通用模式
    if (!this.forceLanguage) {
      patterns.push(`${docName}.md`)
      patterns.push(`docs/${docName}.md`)
    }

    return patterns
  }

  /**
   * 查找英文回退文档
   * @param docName - 文档名称
   * @param baseDir - 基础搜索目录
   * @returns 找到的文件路径，如果未找到则返回null
   */
  private async findEnglishFallback(
    docName: string,
    baseDir: string,
  ): Promise<string | null> {
    const englishPatterns = [
      `${docName}.en.md`,
      `${docName}.md`,
      `en/${docName}.md`,
      `docs/en/${docName}.md`,
      `docs/${docName}.md`,
    ]

    for (const pattern of englishPatterns) {
      const filePath = path.join(baseDir, pattern)
      try {
        await fs.access(filePath)
        return filePath
      } catch {
        // File not accessible, try next pattern
      }
    }

    return null
  }
}

// 全局文档管理器实例
const docManager = new DocumentationManager()

/**
 * 根据配置初始化文档管理器
 * 从settings.json读取language和forceDocumentationLanguage配置
 */
export function initializeDocumentationManager(): void {
  try {
    const settings = getInitialSettings()
    if (settings.documentationLanguage) {
      // 根据用户配置决定是否强制使用指定语言
      const forceLanguage = settings.forceDocumentationLanguage || false
      docManager.setLanguage(settings.documentationLanguage, forceLanguage)
    }
  } catch {
    // 配置系统可能未初始化，忽略错误继续执行
  }
}

/**
 * 查找CLAUDE.md文件
 * @param projectRoot - 项目根目录
 * @returns 找到的CLAUDE.md文件路径，如果未找到则返回null
 */
export async function findClaudeMdFile(
  projectRoot: string,
): Promise<string | null> {
  return docManager.findDocument('CLAUDE', projectRoot)
}
