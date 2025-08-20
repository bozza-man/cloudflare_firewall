/**
 * Observability MCP Client
 * Manages logs, analytics, and monitoring through MCP servers
 */

import { getMCPClientManager, MCPClientManager } from '../client-manager.js';
import { mcpDebug } from '../../security/mcp-config.js';

export interface LogQuery {
  startTime?: string;
  endTime?: string;
  query?: string;
  limit?: number;
  fields?: string[];
  scriptName?: string;
  status?: number;
  method?: string;
}

export interface AnalyticsQuery {
  startTime: string;
  endTime: string;
  metrics?: string[];
  dimensions?: string[];
  filters?: Record<string, any>;
  granularity?: 'minute' | 'hour' | 'day';
}

export class ObservabilityMCPClient {
  private manager: MCPClientManager | null = null;

  /**
   * Initialize the Observability MCP client
   */
  async initialize(): Promise<void> {
    this.manager = await getMCPClientManager();
    mcpDebug('Observability MCP Client initialized');
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

  // ===== Observability Server =====

  /**
   * Tail Workers logs in real-time
   */
  async tailLogs(scriptName?: string, filters?: any): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'tail_logs', {
        scriptName,
        ...filters
      });
    } catch (error) {
      console.error('Failed to tail logs via MCP:', error);
      throw error;
    }
  }

  /**
   * Search historical logs
   */
  async searchLogs(query: LogQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'search_logs', query);
    } catch (error) {
      console.error('Failed to search logs via MCP:', error);
      throw error;
    }
  }

  /**
   * Get error tracking data
   */
  async getErrors(timeRange: string, scriptName?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'get_errors', {
        timeRange,
        scriptName
      });
    } catch (error) {
      console.error('Failed to get errors via MCP:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(query: AnalyticsQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'get_performance_metrics', query);
    } catch (error) {
      console.error('Failed to get performance metrics via MCP:', error);
      throw error;
    }
  }

  /**
   * Get request analytics
   */
  async getRequestAnalytics(query: AnalyticsQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'get_request_analytics', query);
    } catch (error) {
      console.error('Failed to get request analytics via MCP:', error);
      throw error;
    }
  }

  /**
   * Get trace details
   */
  async getTrace(traceId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('observability', 'get_trace', {
        traceId
      });
    } catch (error) {
      console.error('Failed to get trace via MCP:', error);
      throw error;
    }
  }

  // ===== Logpush Server =====

  /**
   * List Logpush jobs
   */
  async listLogpushJobs(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'list_jobs', {});
    } catch (error) {
      console.error('Failed to list Logpush jobs via MCP:', error);
      throw error;
    }
  }

  /**
   * Get Logpush job health
   */
  async getLogpushJobHealth(jobId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'get_job_health', {
        jobId
      });
    } catch (error) {
      console.error('Failed to get Logpush job health via MCP:', error);
      throw error;
    }
  }

  /**
   * Create Logpush job
   */
  async createLogpushJob(config: {
    dataset: string;
    destination: string;
    fields?: string[];
    filter?: string;
    enabled?: boolean;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'create_job', config);
    } catch (error) {
      console.error('Failed to create Logpush job via MCP:', error);
      throw error;
    }
  }

  /**
   * Update Logpush job
   */
  async updateLogpushJob(jobId: string, updates: any): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'update_job', {
        jobId,
        ...updates
      });
    } catch (error) {
      console.error('Failed to update Logpush job via MCP:', error);
      throw error;
    }
  }

  /**
   * Delete Logpush job
   */
  async deleteLogpushJob(jobId: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'delete_job', {
        jobId
      });
    } catch (error) {
      console.error('Failed to delete Logpush job via MCP:', error);
      throw error;
    }
  }

  /**
   * Get Logpush delivery status
   */
  async getLogpushDeliveryStatus(jobId: string, timeRange?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'get_delivery_status', {
        jobId,
        timeRange
      });
    } catch (error) {
      console.error('Failed to get Logpush delivery status via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze log volumes
   */
  async analyzeLogVolumes(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'analyze_log_volumes', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to analyze log volumes via MCP:', error);
      throw error;
    }
  }

  /**
   * Get available Logpush fields
   */
  async getAvailableLogpushFields(dataset: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('logpush', 'get_available_fields', {
        dataset
      });
    } catch (error) {
      console.error('Failed to get available Logpush fields via MCP:', error);
      throw error;
    }
  }

  // ===== Combined Analytics =====

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      // Try observability server first
      const [metrics, errors, logs] = await Promise.allSettled([
        this.getPerformanceMetrics({
          startTime: this.getStartTime(timeRange),
          endTime: new Date().toISOString(),
          granularity: 'hour'
        }),
        this.getErrors(timeRange),
        this.searchLogs({
          limit: 100
        })
      ]);
      
      return {
        metrics: metrics.status === 'fulfilled' ? metrics.value : null,
        errors: errors.status === 'fulfilled' ? errors.value : null,
        recentLogs: logs.status === 'fulfilled' ? logs.value : null
      };
    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get Worker-specific insights
   */
  async getWorkerInsights(scriptName: string, timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [performance, errors, logs] = await Promise.allSettled([
        this.getPerformanceMetrics({
          startTime: this.getStartTime(timeRange),
          endTime: new Date().toISOString(),
          filters: { scriptName }
        }),
        this.getErrors(timeRange, scriptName),
        this.searchLogs({
          scriptName,
          limit: 50
        })
      ]);
      
      return {
        performance: performance.status === 'fulfilled' ? performance.value : null,
        errors: errors.status === 'fulfilled' ? errors.value : null,
        logs: logs.status === 'fulfilled' ? logs.value : null
      };
    } catch (error) {
      console.error('Failed to get Worker insights:', error);
      throw error;
    }
  }

  /**
   * Helper to convert time range to start time
   */
  private getStartTime(timeRange: string): string {
    const now = new Date();
    const match = timeRange.match(/(\d+)([hdmw])/);
    
    if (!match) {
      // Default to 24 hours
      now.setHours(now.getHours() - 24);
      return now.toISOString();
    }
    
    const [, amount, unit] = match;
    const value = parseInt(amount);
    
    switch (unit) {
      case 'h':
        now.setHours(now.getHours() - value);
        break;
      case 'd':
        now.setDate(now.getDate() - value);
        break;
      case 'w':
        now.setDate(now.getDate() - (value * 7));
        break;
      case 'm':
        now.setMonth(now.getMonth() - value);
        break;
      default:
        now.setHours(now.getHours() - 24);
    }
    
    return now.toISOString();
  }
}

// Singleton instance
let observabilityClient: ObservabilityMCPClient | null = null;

/**
 * Get or create Observability MCP client instance
 */
export async function getObservabilityMCPClient(): Promise<ObservabilityMCPClient> {
  if (!observabilityClient) {
    observabilityClient = new ObservabilityMCPClient();
    await observabilityClient.initialize();
  }
  
  return observabilityClient;
}
