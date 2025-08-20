/**
 * Analytics MCP Client
 * Manages analytics through DNS Analytics, DEM, and GraphQL MCP servers
 */

import { getMCPClientManager, MCPClientManager } from '../client-manager.js';
import { mcpDebug } from '../../security/mcp-config.js';

export interface DNSQuery {
  startTime: string;
  endTime: string;
  dimensions?: string[];
  metrics?: string[];
  filters?: Record<string, any>;
  limit?: number;
}

export interface DEMMetrics {
  application: string;
  performance: {
    latency: number;
    packetLoss: number;
    jitter: number;
  };
  availability: number;
  userExperience: number;
  issues: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    affected: number;
    description: string;
  }>;
}

export interface GraphQLQuery {
  query: string;
  variables?: Record<string, any>;
}

export class AnalyticsMCPClient {
  private manager: MCPClientManager | null = null;

  /**
   * Initialize the Analytics MCP client
   */
  async initialize(): Promise<void> {
    this.manager = await getMCPClientManager();
    mcpDebug('Analytics MCP Client initialized');
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

  // ===== DNS Analytics Server =====

  /**
   * Query DNS analytics
   */
  async queryDNSAnalytics(query: DNSQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'query_analytics', query);
    } catch (error) {
      console.error('Failed to query DNS analytics via MCP:', error);
      throw error;
    }
  }

  /**
   * Get DNS performance metrics
   */
  async getDNSPerformance(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'get_performance_metrics', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to get DNS performance via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze NXDOMAIN responses
   */
  async analyzeNXDOMAIN(options: {
    startTime: string;
    endTime: string;
    limit?: number;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'analyze_nxdomain', options);
    } catch (error) {
      console.error('Failed to analyze NXDOMAIN via MCP:', error);
      throw error;
    }
  }

  /**
   * Get DNS response time tracking
   */
  async getDNSResponseTimes(options: {
    startTime: string;
    endTime: string;
    percentiles?: number[];
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'response_time_tracking', options);
    } catch (error) {
      console.error('Failed to get DNS response times via MCP:', error);
      throw error;
    }
  }

  /**
   * Get geographic distribution of DNS queries
   */
  async getDNSGeographicDistribution(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'geographic_distribution', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to get DNS geographic distribution via MCP:', error);
      throw error;
    }
  }

  /**
   * Get query type breakdown
   */
  async getDNSQueryTypes(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dnsAnalytics', 'query_type_breakdown', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to get DNS query types via MCP:', error);
      throw error;
    }
  }

  // ===== Digital Experience Monitoring (DEM) Server =====

  /**
   * Get application performance metrics
   */
  async getApplicationPerformance(appName?: string): Promise<DEMMetrics[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dex', 'get_application_performance', {
        appName
      });
    } catch (error) {
      console.error('Failed to get application performance via MCP:', error);
      throw error;
    }
  }

  /**
   * Get user experience metrics
   */
  async getUserExperience(options: {
    application?: string;
    timeRange?: string;
    userGroup?: string;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dex', 'user_experience_metrics', options);
    } catch (error) {
      console.error('Failed to get user experience metrics via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze network path
   */
  async analyzeNetworkPath(source: string, destination: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dex', 'network_path_analysis', {
        source,
        destination
      });
    } catch (error) {
      console.error('Failed to analyze network path via MCP:', error);
      throw error;
    }
  }

  /**
   * Monitor device health
   */
  async getDeviceHealth(deviceId?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dex', 'device_health_monitoring', {
        deviceId
      });
    } catch (error) {
      console.error('Failed to get device health via MCP:', error);
      throw error;
    }
  }

  /**
   * Identify connectivity issues
   */
  async identifyConnectivityIssues(timeRange?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('dex', 'connectivity_issues', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to identify connectivity issues via MCP:', error);
      throw error;
    }
  }

  // ===== GraphQL Server =====

  /**
   * Execute custom GraphQL query
   */
  async executeGraphQLQuery(query: GraphQLQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('graphql', 'execute_query', query);
    } catch (error) {
      console.error('Failed to execute GraphQL query via MCP:', error);
      throw error;
    }
  }

  /**
   * Get zone analytics via GraphQL
   */
  async getZoneAnalytics(zoneId: string, timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    const query = `
      query GetZoneAnalytics($zoneId: String!, $filter: ZoneAnalyticsFilter!) {
        viewer {
          zones(filter: { zoneTag: $zoneId }) {
            analytics(filter: $filter) {
              requests
              bandwidth
              threats
              pageViews
            }
          }
        }
      }
    `;
    
    try {
      return await this.executeGraphQLQuery({
        query,
        variables: {
          zoneId,
          filter: { timeRange }
        }
      });
    } catch (error) {
      console.error('Failed to get zone analytics via MCP:', error);
      throw error;
    }
  }

  /**
   * Get worker analytics via GraphQL
   */
  async getWorkerAnalytics(scriptName: string, timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    const query = `
      query GetWorkerAnalytics($scriptName: String!, $timeRange: String!) {
        viewer {
          accounts {
            workers {
              script(scriptName: $scriptName) {
                analytics(timeRange: $timeRange) {
                  requests
                  errors
                  cpuTime
                  duration
                }
              }
            }
          }
        }
      }
    `;
    
    try {
      return await this.executeGraphQLQuery({
        query,
        variables: { scriptName, timeRange }
      });
    } catch (error) {
      console.error('Failed to get worker analytics via MCP:', error);
      throw error;
    }
  }

  /**
   * Execute complex aggregation query
   */
  async executeAggregation(options: {
    dataset: string;
    metrics: string[];
    dimensions: string[];
    filters?: Record<string, any>;
    timeRange: string;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('graphql', 'execute_aggregation', options);
    } catch (error) {
      console.error('Failed to execute aggregation via MCP:', error);
      throw error;
    }
  }

  // ===== Combined Analytics Operations =====

  /**
   * Get comprehensive analytics dashboard
   */
  async getAnalyticsDashboard(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [dnsMetrics, appPerformance, connectivity] = await Promise.allSettled([
        this.getDNSPerformance(timeRange),
        this.getApplicationPerformance(),
        this.identifyConnectivityIssues(timeRange)
      ]);
      
      return {
        dns: dnsMetrics.status === 'fulfilled' ? dnsMetrics.value : null,
        applications: appPerformance.status === 'fulfilled' ? appPerformance.value : null,
        connectivity: connectivity.status === 'fulfilled' ? connectivity.value : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get analytics dashboard:', error);
      throw error;
    }
  }

  /**
   * Get performance insights
   */
  async getPerformanceInsights(options?: {
    includeDNS?: boolean;
    includeDEM?: boolean;
    includeWorkers?: boolean;
    timeRange?: string;
  }): Promise<any> {
    const timeRange = options?.timeRange || '24h';
    const results: any = {};
    
    try {
      if (options?.includeDNS !== false) {
        results.dns = await this.getDNSPerformance(timeRange);
        results.dnsResponseTimes = await this.getDNSResponseTimes({
          startTime: this.getStartTime(timeRange),
          endTime: new Date().toISOString(),
          percentiles: [50, 90, 95, 99]
        });
      }
      
      if (options?.includeDEM !== false) {
        results.applications = await this.getApplicationPerformance();
        results.userExperience = await this.getUserExperience({ timeRange });
      }
      
      if (options?.includeWorkers) {
        // This would need actual worker names from configuration
        results.workers = await this.executeGraphQLQuery({
          query: `
            query GetWorkersOverview($timeRange: String!) {
              viewer {
                accounts {
                  workers {
                    scripts {
                      name
                      analytics(timeRange: $timeRange) {
                        requests
                        errors
                        cpuTime
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { timeRange }
        });
      }
      
      return results;
    } catch (error) {
      console.error('Failed to get performance insights:', error);
      throw error;
    }
  }

  /**
   * Get network health summary
   */
  async getNetworkHealthSummary(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [dnsHealth, connectivity, deviceHealth] = await Promise.allSettled([
        this.getDNSPerformance('1h'),
        this.identifyConnectivityIssues('1h'),
        this.getDeviceHealth()
      ]);
      
      return {
        dns: {
          healthy: dnsHealth.status === 'fulfilled',
          data: dnsHealth.status === 'fulfilled' ? dnsHealth.value : null
        },
        connectivity: {
          issues: connectivity.status === 'fulfilled' ? connectivity.value : [],
        },
        devices: {
          healthy: deviceHealth.status === 'fulfilled',
          data: deviceHealth.status === 'fulfilled' ? deviceHealth.value : null
        },
        overallHealth: this.calculateOverallHealth(dnsHealth, connectivity, deviceHealth),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get network health summary:', error);
      throw error;
    }
  }

  /**
   * Helper to calculate overall health score
   */
  private calculateOverallHealth(...results: PromiseSettledResult<any>[]): number {
    const successful = results.filter(r => r.status === 'fulfilled').length;
    return (successful / results.length) * 100;
  }

  /**
   * Helper to convert time range to start time
   */
  private getStartTime(timeRange: string): string {
    const now = new Date();
    const match = timeRange.match(/(\d+)([hdmw])/);
    
    if (!match) {
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
    }
    
    return now.toISOString();
  }
}

// Singleton instance
let analyticsClient: AnalyticsMCPClient | null = null;

/**
 * Get or create Analytics MCP client instance
 */
export async function getAnalyticsMCPClient(): Promise<AnalyticsMCPClient> {
  if (!analyticsClient) {
    analyticsClient = new AnalyticsMCPClient();
    await analyticsClient.initialize();
  }
  
  return analyticsClient;
}
