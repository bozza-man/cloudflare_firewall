import { MCPClient, CLOUDFLARE_MCP_SERVERS } from './mcp-client.js';
import chalk from 'chalk';
import type { GatewayRule } from '../types/gateway.js';

export interface ObservabilityMetrics {
  ruleHits: Map<string, number>;
  blockedRequests: number;
  allowedRequests: number;
  topBlockedDomains: Array<{ domain: string; count: number }>;
  ruleEffectiveness: Array<{ ruleId: string; ruleName: string; effectiveness: number }>;
  timeRange: string;
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  actor: string;
  resource: string;
  details: Record<string, any>;
}

export class MCPService {
  private observabilityClient: MCPClient | null = null;
  private auditLogsClient: MCPClient | null = null;
  private browserClient: MCPClient | null = null;

  async connectObservability(): Promise<void> {
    if (!this.observabilityClient) {
      this.observabilityClient = new MCPClient(CLOUDFLARE_MCP_SERVERS.observability);
    }
    await this.observabilityClient.connect();
  }

  async connectAuditLogs(): Promise<void> {
    if (!this.auditLogsClient) {
      this.auditLogsClient = new MCPClient(CLOUDFLARE_MCP_SERVERS.auditlogs);
    }
    await this.auditLogsClient.connect();
  }

  async connectBrowser(): Promise<void> {
    if (!this.browserClient) {
      this.browserClient = new MCPClient(CLOUDFLARE_MCP_SERVERS.browser);
    }
    await this.browserClient.connect();
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = [];
    
    if (this.observabilityClient) {
      disconnectPromises.push(this.observabilityClient.disconnect());
    }
    if (this.auditLogsClient) {
      disconnectPromises.push(this.auditLogsClient.disconnect());
    }
    if (this.browserClient) {
      disconnectPromises.push(this.browserClient.disconnect());
    }

    await Promise.all(disconnectPromises);
  }

  async queryObservability(query: {
    filter?: string;
    timeRange?: string;
    metrics?: string[];
  }): Promise<any> {
    if (!this.observabilityClient || !this.observabilityClient.isConnected()) {
      await this.connectObservability();
    }

    try {
      const result = await this.observabilityClient!.callTool('query_worker_observability', {
        filter: query.filter || '',
        timeRange: query.timeRange || '24h',
        metrics: query.metrics || ['requests', 'errors', 'cpu_time']
      });

      if (result.isError) {
        throw new Error(`Observability query failed: ${JSON.stringify(result.content)}`);
      }

      return result.content;
    } catch (error) {
      console.error(chalk.red('Error querying observability:'), error);
      throw error;
    }
  }

  async getRuleMetrics(rules: GatewayRule[], timeRange: string = '24h'): Promise<ObservabilityMetrics> {
    if (!this.observabilityClient || !this.observabilityClient.isConnected()) {
      await this.connectObservability();
    }

    const metrics: ObservabilityMetrics = {
      ruleHits: new Map(),
      blockedRequests: 0,
      allowedRequests: 0,
      topBlockedDomains: [],
      ruleEffectiveness: [],
      timeRange
    };

    try {
      // Query for rule hits
      for (const rule of rules) {
        const filter = `gateway.rule.id == "${rule.id}"`;
        const result = await this.observabilityClient!.callTool('query_worker_observability', {
          filter,
          timeRange,
          metrics: ['count']
        });

        if (!result.isError && result.content) {
          const count = result.content.count || 0;
          metrics.ruleHits.set(rule.id, count);
        }
      }

      // Query for blocked vs allowed requests
      const blockedResult = await this.observabilityClient!.callTool('query_worker_observability', {
        filter: 'gateway.action == "block"',
        timeRange,
        metrics: ['count']
      });
      
      if (!blockedResult.isError && blockedResult.content) {
        metrics.blockedRequests = blockedResult.content.count || 0;
      }

      const allowedResult = await this.observabilityClient!.callTool('query_worker_observability', {
        filter: 'gateway.action == "allow"',
        timeRange,
        metrics: ['count']
      });
      
      if (!allowedResult.isError && allowedResult.content) {
        metrics.allowedRequests = allowedResult.content.count || 0;
      }

      // Calculate rule effectiveness
      const totalRequests = metrics.blockedRequests + metrics.allowedRequests;
      for (const rule of rules) {
        const hits = metrics.ruleHits.get(rule.id) || 0;
        const effectiveness = totalRequests > 0 ? (hits / totalRequests) * 100 : 0;
        metrics.ruleEffectiveness.push({
          ruleId: rule.id,
          ruleName: rule.name,
          effectiveness: Math.round(effectiveness * 100) / 100
        });
      }

      // Sort by effectiveness
      metrics.ruleEffectiveness.sort((a, b) => b.effectiveness - a.effectiveness);

      return metrics;
    } catch (error) {
      console.error(chalk.red('Error getting rule metrics:'), error);
      return metrics;
    }
  }

  async getAuditLogs(options: {
    filter?: string;
    timeRange?: string;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    if (!this.auditLogsClient || !this.auditLogsClient.isConnected()) {
      await this.connectAuditLogs();
    }

    try {
      const result = await this.auditLogsClient!.callTool('query_audit_logs', {
        filter: options.filter || '',
        timeRange: options.timeRange || '24h',
        limit: options.limit || 100
      });

      if (result.isError) {
        throw new Error(`Audit logs query failed: ${JSON.stringify(result.content)}`);
      }

      return result.content as AuditLogEntry[];
    } catch (error) {
      console.error(chalk.red('Error querying audit logs:'), error);
      return [];
    }
  }

  async getRuleChangeHistory(ruleId: string): Promise<AuditLogEntry[]> {
    const filter = `resource.id == "${ruleId}" AND action in ["create", "update", "delete"]`;
    return this.getAuditLogs({
      filter,
      timeRange: '30d',
      limit: 50
    });
  }

  async testBlockedSite(url: string): Promise<{
    screenshot?: string;
    html?: string;
    markdown?: string;
    isBlocked: boolean;
  }> {
    if (!this.browserClient || !this.browserClient.isConnected()) {
      await this.connectBrowser();
    }

    try {
      // Get screenshot
      const screenshotResult = await this.browserClient!.callTool('get_url_screenshot', {
        url,
        viewport: { width: 1920, height: 1080 }
      });

      // Get markdown content
      const markdownResult = await this.browserClient!.callTool('get_url_markdown', {
        url
      });

      // Get HTML content
      const htmlResult = await this.browserClient!.callTool('get_url_html_content', {
        url
      });

      return {
        screenshot: !screenshotResult.isError ? screenshotResult.content : undefined,
        markdown: !markdownResult.isError ? markdownResult.content : undefined,
        html: !htmlResult.isError ? htmlResult.content : undefined,
        isBlocked: htmlResult.isError || (htmlResult.content && htmlResult.content.includes('blocked'))
      };
    } catch (error) {
      console.error(chalk.red('Error testing blocked site:'), error);
      return { isBlocked: false };
    }
  }

  async getObservabilityKeys(): Promise<string[]> {
    if (!this.observabilityClient || !this.observabilityClient.isConnected()) {
      await this.connectObservability();
    }

    try {
      const result = await this.observabilityClient!.callTool('observability_keys', {});
      
      if (result.isError) {
        throw new Error(`Failed to get observability keys: ${JSON.stringify(result.content)}`);
      }

      return result.content as string[];
    } catch (error) {
      console.error(chalk.red('Error getting observability keys:'), error);
      return [];
    }
  }

  async getObservabilityValues(field: string): Promise<string[]> {
    if (!this.observabilityClient || !this.observabilityClient.isConnected()) {
      await this.connectObservability();
    }

    try {
      const result = await this.observabilityClient!.callTool('observability_values', {
        field
      });
      
      if (result.isError) {
        throw new Error(`Failed to get observability values: ${JSON.stringify(result.content)}`);
      }

      return result.content as string[];
    } catch (error) {
      console.error(chalk.red('Error getting observability values:'), error);
      return [];
    }
  }
}
