/**
 * Utility MCP Client
 * Manages utility functions through Browser Rendering, AutoRAG, and Documentation MCP servers
 */

import { getMCPClientManager, MCPClientManager } from '../client-manager.js';
import { mcpDebug } from '../../security/mcp-config.js';

export interface BrowserRenderOptions {
  url: string;
  format?: 'screenshot' | 'markdown' | 'html' | 'pdf';
  viewport?: {
    width: number;
    height: number;
  };
  waitFor?: string;
  javascript?: boolean;
}

export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}

export interface DocSearchResult {
  title: string;
  url: string;
  snippet: string;
  category: string;
  relevance: number;
}

export class UtilityMCPClient {
  private manager: MCPClientManager | null = null;

  /**
   * Initialize the Utility MCP client
   */
  async initialize(): Promise<void> {
    this.manager = await getMCPClientManager();
    mcpDebug('Utility MCP Client initialized');
  }

  /**
   * Ensure manager is initialized
   */
  private async ensureInitialized(): Promise<MCPClientManager> {
    if (!this.manager) {
      await this.initialize();
    }
    return this.manager!;
  }

  // ===== Browser Rendering Server =====

  /**
   * Take a screenshot of a webpage
   */
  async takeScreenshot(url: string, options?: {
    viewport?: { width: number; height: number };
    fullPage?: boolean;
  }): Promise<Buffer> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'take_screenshot', {
        url,
        ...options
      });
    } catch (error) {
      console.error('Failed to take screenshot via MCP:', error);
      throw error;
    }
  }

  /**
   * Convert webpage to Markdown
   */
  async convertToMarkdown(url: string, options?: {
    includeImages?: boolean;
    includeLinks?: boolean;
    simplify?: boolean;
  }): Promise<string> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'convert_to_markdown', {
        url,
        ...options
      });
    } catch (error) {
      console.error('Failed to convert to markdown via MCP:', error);
      throw error;
    }
  }

  /**
   * Render JavaScript and get content
   */
  async renderJavaScript(url: string, waitFor?: string): Promise<string> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'render_javascript', {
        url,
        waitFor
      });
    } catch (error) {
      console.error('Failed to render JavaScript via MCP:', error);
      throw error;
    }
  }

  /**
   * Extract content from webpage
   */
  async extractContent(url: string, selectors?: string[]): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'extract_content', {
        url,
        selectors
      });
    } catch (error) {
      console.error('Failed to extract content via MCP:', error);
      throw error;
    }
  }

  /**
   * Automated browsing session
   */
  async automateBrowsing(actions: Array<{
    type: 'navigate' | 'click' | 'type' | 'wait';
    target?: string;
    value?: string;
  }>): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'automate_browsing', {
        actions
      });
    } catch (error) {
      console.error('Failed to automate browsing via MCP:', error);
      throw error;
    }
  }

  /**
   * Generate PDF from webpage
   */
  async generatePDF(url: string, options?: {
    format?: 'A4' | 'Letter';
    landscape?: boolean;
    margin?: { top: string; right: string; bottom: string; left: string };
  }): Promise<Buffer> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('browserRendering', 'generate_pdf', {
        url,
        ...options
      });
    } catch (error) {
      console.error('Failed to generate PDF via MCP:', error);
      throw error;
    }
  }

  // ===== AutoRAG Server =====

  /**
   * Search documents in RAG
   */
  async searchDocuments(query: string, options?: {
    limit?: number;
    collection?: string;
    filters?: Record<string, any>;
  }): Promise<RAGDocument[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('autorag', 'search_documents', {
        query,
        ...options
      });
    } catch (error) {
      console.error('Failed to search documents via MCP:', error);
      throw error;
    }
  }

  /**
   * List RAG collections
   */
  async listRAGCollections(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('autorag', 'list_collections', {});
    } catch (error) {
      console.error('Failed to list RAG collections via MCP:', error);
      throw error;
    }
  }

  /**
   * Query knowledge base
   */
  async queryKnowledgeBase(question: string, context?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('autorag', 'query_knowledge_base', {
        question,
        context
      });
    } catch (error) {
      console.error('Failed to query knowledge base via MCP:', error);
      throw error;
    }
  }

  /**
   * Get document indexing status
   */
  async getIndexingStatus(collectionId?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('autorag', 'indexing_status', {
        collectionId
      });
    } catch (error) {
      console.error('Failed to get indexing status via MCP:', error);
      throw error;
    }
  }

  /**
   * Add document to RAG
   */
  async addDocument(document: {
    title: string;
    content: string;
    metadata?: Record<string, any>;
    collection?: string;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('autorag', 'add_document', document);
    } catch (error) {
      console.error('Failed to add document via MCP:', error);
      throw error;
    }
  }

  // ===== Documentation Server =====

  /**
   * Search Cloudflare documentation
   */
  async searchDocumentation(query: string, options?: {
    category?: string;
    limit?: number;
  }): Promise<DocSearchResult[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('docs', 'search_documentation', {
        query,
        ...options
      });
    } catch (error) {
      console.error('Failed to search documentation via MCP:', error);
      throw error;
    }
  }

  /**
   * Get API reference
   */
  async getAPIReference(endpoint: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('docs', 'get_api_reference', {
        endpoint
      });
    } catch (error) {
      console.error('Failed to get API reference via MCP:', error);
      throw error;
    }
  }

  /**
   * Find configuration examples
   */
  async findConfigurationExamples(service: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('docs', 'find_configuration_examples', {
        service
      });
    } catch (error) {
      console.error('Failed to find configuration examples via MCP:', error);
      throw error;
    }
  }

  /**
   * Get best practices
   */
  async getBestPractices(topic: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('docs', 'get_best_practices', {
        topic
      });
    } catch (error) {
      console.error('Failed to get best practices via MCP:', error);
      throw error;
    }
  }

  /**
   * Get troubleshooting guide
   */
  async getTroubleshootingGuide(issue: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('docs', 'troubleshooting_guide', {
        issue
      });
    } catch (error) {
      console.error('Failed to get troubleshooting guide via MCP:', error);
      throw error;
    }
  }

  // ===== Combined Utility Operations =====

  /**
   * Analyze webpage for security issues
   */
  async analyzeWebpageSecurity(url: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      // Render the page and extract content
      const [screenshot, markdown, content] = await Promise.allSettled([
        this.takeScreenshot(url),
        this.convertToMarkdown(url),
        this.extractContent(url)
      ]);
      
      // Search for security best practices
      const bestPractices = await this.getBestPractices('web-security');
      
      return {
        url,
        screenshot: screenshot.status === 'fulfilled' ? screenshot.value : null,
        content: markdown.status === 'fulfilled' ? markdown.value : null,
        extracted: content.status === 'fulfilled' ? content.value : null,
        securityGuidelines: bestPractices,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to analyze webpage security:', error);
      throw error;
    }
  }

  /**
   * Get help for a specific error
   */
  async getErrorHelp(error: string, context?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [troubleshooting, docs, knowledge] = await Promise.allSettled([
        this.getTroubleshootingGuide(error),
        this.searchDocumentation(error, { limit: 5 }),
        this.queryKnowledgeBase(error, context)
      ]);
      
      return {
        error,
        troubleshooting: troubleshooting.status === 'fulfilled' ? troubleshooting.value : null,
        documentation: docs.status === 'fulfilled' ? docs.value : null,
        knowledgeBase: knowledge.status === 'fulfilled' ? knowledge.value : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get error help:', error);
      throw error;
    }
  }

  /**
   * Research a topic across all sources
   */
  async researchTopic(topic: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [docs, bestPractices, examples, knowledge] = await Promise.allSettled([
        this.searchDocumentation(topic, { limit: 10 }),
        this.getBestPractices(topic),
        this.findConfigurationExamples(topic),
        this.searchDocuments(topic, { limit: 10 })
      ]);
      
      return {
        topic,
        documentation: docs.status === 'fulfilled' ? docs.value : [],
        bestPractices: bestPractices.status === 'fulfilled' ? bestPractices.value : null,
        examples: examples.status === 'fulfilled' ? examples.value : null,
        knowledgeBase: knowledge.status === 'fulfilled' ? knowledge.value : [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to research topic:', error);
      throw error;
    }
  }

  /**
   * Create comprehensive report
   */
  async createReport(options: {
    urls?: string[];
    topics?: string[];
    format?: 'markdown' | 'pdf';
  }): Promise<any> {
    const results: any = {
      metadata: {
        created: new Date().toISOString(),
        format: options.format || 'markdown'
      },
      content: []
    };
    
    try {
      // Process URLs if provided
      if (options.urls?.length) {
        for (const url of options.urls) {
          const pageData = await this.analyzeWebpageSecurity(url);
          results.content.push({
            type: 'webpage',
            url,
            data: pageData
          });
        }
      }
      
      // Research topics if provided
      if (options.topics?.length) {
        for (const topic of options.topics) {
          const research = await this.researchTopic(topic);
          results.content.push({
            type: 'research',
            topic,
            data: research
          });
        }
      }
      
      return results;
    } catch (error) {
      console.error('Failed to create report:', error);
      throw error;
    }
  }
}

// Singleton instance
let utilityClient: UtilityMCPClient | null = null;

/**
 * Get or create Utility MCP client instance
 */
export async function getUtilityMCPClient(): Promise<UtilityMCPClient> {
  if (!utilityClient) {
    utilityClient = new UtilityMCPClient();
    await utilityClient.initialize();
  }
  
  return utilityClient;
}
