/**
 * Workers MCP Client
 * Manages Workers deployments, bindings, and builds through MCP servers
 */

import { getMCPClientManager, MCPClientManager } from '../client-manager.js';
import { mcpDebug } from '../../security/mcp-config.js';

export class WorkersMCPClient {
  private manager: MCPClientManager | null = null;

  /**
   * Initialize the Workers MCP client
   */
  async initialize(): Promise<void> {
    this.manager = await getMCPClientManager();
    mcpDebug('Workers MCP Client initialized');
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

  // ===== Workers Bindings Server =====

  /**
   * List all KV namespaces
   */
  async listKVNamespaces(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_kv_namespaces', {});
    } catch (error) {
      console.error('Failed to list KV namespaces via MCP:', error);
      throw error;
    }
  }

  /**
   * Create a new KV namespace
   */
  async createKVNamespace(name: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'create_kv_namespace', { name });
    } catch (error) {
      console.error('Failed to create KV namespace via MCP:', error);
      throw error;
    }
  }

  /**
   * List R2 buckets
   */
  async listR2Buckets(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_r2_buckets', {});
    } catch (error) {
      console.error('Failed to list R2 buckets via MCP:', error);
      throw error;
    }
  }

  /**
   * Create R2 bucket
   */
  async createR2Bucket(name: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'create_r2_bucket', { name });
    } catch (error) {
      console.error('Failed to create R2 bucket via MCP:', error);
      throw error;
    }
  }

  /**
   * List D1 databases
   */
  async listD1Databases(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_d1_databases', {});
    } catch (error) {
      console.error('Failed to list D1 databases via MCP:', error);
      throw error;
    }
  }

  /**
   * Create D1 database
   */
  async createD1Database(name: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'create_d1_database', { name });
    } catch (error) {
      console.error('Failed to create D1 database via MCP:', error);
      throw error;
    }
  }

  /**
   * List Durable Objects namespaces
   */
  async listDurableObjects(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_durable_objects', {});
    } catch (error) {
      console.error('Failed to list Durable Objects via MCP:', error);
      throw error;
    }
  }

  /**
   * Configure AI bindings
   */
  async configureAIBindings(model: string, options?: any): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'configure_ai_binding', {
        model,
        ...options
      });
    } catch (error) {
      console.error('Failed to configure AI bindings via MCP:', error);
      throw error;
    }
  }

  /**
   * List Queues
   */
  async listQueues(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_queues', {});
    } catch (error) {
      console.error('Failed to list Queues via MCP:', error);
      throw error;
    }
  }

  /**
   * Create Queue
   */
  async createQueue(name: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'create_queue', { name });
    } catch (error) {
      console.error('Failed to create Queue via MCP:', error);
      throw error;
    }
  }

  /**
   * List Vectorize indexes
   */
  async listVectorizeIndexes(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'list_vectorize_indexes', {});
    } catch (error) {
      console.error('Failed to list Vectorize indexes via MCP:', error);
      throw error;
    }
  }

  /**
   * Create Vectorize index
   */
  async createVectorizeIndex(name: string, dimensions: number): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('bindings', 'create_vectorize_index', {
        name,
        dimensions
      });
    } catch (error) {
      console.error('Failed to create Vectorize index via MCP:', error);
      throw error;
    }
  }

  // ===== Workers Builds Server =====

  /**
   * Get build status
   */
  async getBuildStatus(buildId?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'get_build_status', {
        buildId
      });
    } catch (error) {
      console.error('Failed to get build status via MCP:', error);
      throw error;
    }
  }

  /**
   * List recent builds
   */
  async listBuilds(limit: number = 10): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'list_builds', {
        limit
      });
    } catch (error) {
      console.error('Failed to list builds via MCP:', error);
      throw error;
    }
  }

  /**
   * Get build logs
   */
  async getBuildLogs(buildId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'get_build_logs', {
        buildId
      });
    } catch (error) {
      console.error('Failed to get build logs via MCP:', error);
      throw error;
    }
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(scriptName?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'get_deployment_history', {
        scriptName
      });
    } catch (error) {
      console.error('Failed to get deployment history via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze build performance
   */
  async analyzeBuildPerformance(timeRange?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'analyze_build_performance', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to analyze build performance via MCP:', error);
      throw error;
    }
  }

  /**
   * Debug build failure
   */
  async debugBuildFailure(buildId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('builds', 'debug_build_failure', {
        buildId
      });
    } catch (error) {
      console.error('Failed to debug build failure via MCP:', error);
      throw error;
    }
  }

  // ===== Container Server =====

  /**
   * Create sandbox environment
   */
  async createSandbox(config?: any): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('containers', 'create_sandbox', {
        ...config
      });
    } catch (error) {
      console.error('Failed to create sandbox via MCP:', error);
      throw error;
    }
  }

  /**
   * List sandboxes
   */
  async listSandboxes(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('containers', 'list_sandboxes', {});
    } catch (error) {
      console.error('Failed to list sandboxes via MCP:', error);
      throw error;
    }
  }

  /**
   * Delete sandbox
   */
  async deleteSandbox(sandboxId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('containers', 'delete_sandbox', {
        sandboxId
      });
    } catch (error) {
      console.error('Failed to delete sandbox via MCP:', error);
      throw error;
    }
  }

  /**
   * Execute command in sandbox
   */
  async executeInSandbox(sandboxId: string, command: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('containers', 'execute_command', {
        sandboxId,
        command
      });
    } catch (error) {
      console.error('Failed to execute command in sandbox via MCP:', error);
      throw error;
    }
  }
}

// Singleton instance
let workersClient: WorkersMCPClient | null = null;

/**
 * Get or create Workers MCP client instance
 */
export async function getWorkersMCPClient(): Promise<WorkersMCPClient> {
  if (!workersClient) {
    workersClient = new WorkersMCPClient();
    await workersClient.initialize();
  }
  
  return workersClient;
}
