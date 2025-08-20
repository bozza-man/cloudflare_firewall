/**
 * Security MCP Client
 * Manages security monitoring through AI Gateway, Audit Logs, and CASB MCP servers
 */

import { getMCPClientManager, MCPClientManager } from '../client-manager.js';
import { mcpDebug } from '../../security/mcp-config.js';

export interface AuditLogQuery {
  startTime?: string;
  endTime?: string;
  action?: string;
  actor?: string;
  resource?: string;
  limit?: number;
}

export interface AIGatewayLog {
  requestId: string;
  timestamp: string;
  model: string;
  prompt: string;
  response: string;
  tokens: number;
  cost?: number;
  cached?: boolean;
}

export interface CASBFinding {
  appName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  remediation: string;
  users?: string[];
}

export class SecurityMCPClient {
  private manager: MCPClientManager | null = null;

  /**
   * Initialize the Security MCP client
   */
  async initialize(): Promise<void> {
    this.manager = await getMCPClientManager();
    mcpDebug('Security MCP Client initialized');
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

  // ===== AI Gateway Server =====

  /**
   * Search AI Gateway logs
   */
  async searchAILogs(query: {
    startTime?: string;
    endTime?: string;
    model?: string;
    searchTerm?: string;
    limit?: number;
  }): Promise<AIGatewayLog[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('aiGateway', 'search_logs', query);
    } catch (error) {
      console.error('Failed to search AI Gateway logs via MCP:', error);
      throw error;
    }
  }

  /**
   * Get AI request details
   */
  async getAIRequestDetails(requestId: string): Promise<AIGatewayLog> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('aiGateway', 'get_request_details', {
        requestId
      });
    } catch (error) {
      console.error('Failed to get AI request details via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze AI usage patterns
   */
  async analyzeAIUsage(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('aiGateway', 'analyze_usage', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to analyze AI usage via MCP:', error);
      throw error;
    }
  }

  /**
   * Get AI cost analysis
   */
  async getAICostAnalysis(startTime: string, endTime: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('aiGateway', 'cost_analysis', {
        startTime,
        endTime
      });
    } catch (error) {
      console.error('Failed to get AI cost analysis via MCP:', error);
      throw error;
    }
  }

  /**
   * Get cache performance metrics
   */
  async getAICacheMetrics(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('aiGateway', 'cache_metrics', {});
    } catch (error) {
      console.error('Failed to get AI cache metrics via MCP:', error);
      throw error;
    }
  }

  // ===== Audit Logs Server =====

  /**
   * Query audit logs
   */
  async queryAuditLogs(query: AuditLogQuery): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('auditLogs', 'query_logs', query);
    } catch (error) {
      console.error('Failed to query audit logs via MCP:', error);
      throw error;
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(options: {
    startTime: string;
    endTime: string;
    compliance: 'SOC2' | 'HIPAA' | 'PCI' | 'GDPR';
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('auditLogs', 'generate_compliance_report', options);
    } catch (error) {
      console.error('Failed to generate compliance report via MCP:', error);
      throw error;
    }
  }

  /**
   * Track user actions
   */
  async trackUserActions(userId: string, timeRange?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('auditLogs', 'track_user_actions', {
        userId,
        timeRange
      });
    } catch (error) {
      console.error('Failed to track user actions via MCP:', error);
      throw error;
    }
  }

  /**
   * Monitor API usage
   */
  async monitorAPIUsage(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('auditLogs', 'monitor_api_usage', {
        timeRange
      });
    } catch (error) {
      console.error('Failed to monitor API usage via MCP:', error);
      throw error;
    }
  }

  /**
   * Analyze security events
   */
  async analyzeSecurityEvents(options: {
    startTime?: string;
    endTime?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    eventType?: string;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('auditLogs', 'analyze_security_events', options);
    } catch (error) {
      console.error('Failed to analyze security events via MCP:', error);
      throw error;
    }
  }

  // ===== CASB Server =====

  /**
   * Scan SaaS applications for misconfigurations
   */
  async scanSaaSApps(appNames?: string[]): Promise<CASBFinding[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('casb', 'scan_apps', {
        appNames
      });
    } catch (error) {
      console.error('Failed to scan SaaS apps via MCP:', error);
      throw error;
    }
  }

  /**
   * Detect misconfigurations
   */
  async detectMisconfigurations(appName?: string): Promise<CASBFinding[]> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('casb', 'detect_misconfigurations', {
        appName
      });
    } catch (error) {
      console.error('Failed to detect misconfigurations via MCP:', error);
      throw error;
    }
  }

  /**
   * Run compliance checks
   */
  async runComplianceChecks(compliance: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('casb', 'compliance_checks', {
        compliance
      });
    } catch (error) {
      console.error('Failed to run compliance checks via MCP:', error);
      throw error;
    }
  }

  /**
   * Assess risk for SaaS applications
   */
  async assessRisk(appName?: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('casb', 'risk_assessment', {
        appName
      });
    } catch (error) {
      console.error('Failed to assess risk via MCP:', error);
      throw error;
    }
  }

  /**
   * Discover shadow IT
   */
  async discoverShadowIT(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      return await manager.callTool('casb', 'discover_shadow_it', {});
    } catch (error) {
      console.error('Failed to discover shadow IT via MCP:', error);
      throw error;
    }
  }

  // ===== Combined Security Operations =====

  /**
   * Get comprehensive security dashboard data
   */
  async getSecurityDashboard(timeRange: string): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [auditLogs, securityEvents, casbFindings, aiUsage] = await Promise.allSettled([
        this.queryAuditLogs({ limit: 100 }),
        this.analyzeSecurityEvents({ severity: 'high' }),
        this.scanSaaSApps(),
        this.analyzeAIUsage(timeRange)
      ]);
      
      return {
        auditLogs: auditLogs.status === 'fulfilled' ? auditLogs.value : null,
        securityEvents: securityEvents.status === 'fulfilled' ? securityEvents.value : null,
        casbFindings: casbFindings.status === 'fulfilled' ? casbFindings.value : null,
        aiUsage: aiUsage.status === 'fulfilled' ? aiUsage.value : null
      };
    } catch (error) {
      console.error('Failed to get security dashboard:', error);
      throw error;
    }
  }

  /**
   * Perform security audit
   */
  async performSecurityAudit(options?: {
    includeAI?: boolean;
    includeCASB?: boolean;
    includeCompliance?: boolean;
  }): Promise<any> {
    const manager = await this.ensureInitialized();
    const results: any = {};
    
    try {
      // Always include audit logs
      results.auditLogs = await this.queryAuditLogs({ limit: 1000 });
      results.securityEvents = await this.analyzeSecurityEvents({});
      
      if (options?.includeAI) {
        results.aiSecurity = await this.analyzeAIUsage('30d');
      }
      
      if (options?.includeCASB) {
        results.casbFindings = await this.scanSaaSApps();
        results.shadowIT = await this.discoverShadowIT();
      }
      
      if (options?.includeCompliance) {
        results.compliance = await this.generateComplianceReport({
          startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date().toISOString(),
          compliance: 'SOC2'
        });
      }
      
      return results;
    } catch (error) {
      console.error('Failed to perform security audit:', error);
      throw error;
    }
  }

  /**
   * Get threat intelligence summary
   */
  async getThreatIntelligenceSummary(): Promise<any> {
    const manager = await this.ensureInitialized();
    
    try {
      const [securityEvents, casbRisks, shadowIT] = await Promise.allSettled([
        this.analyzeSecurityEvents({
          severity: 'critical',
          startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        }),
        this.assessRisk(),
        this.discoverShadowIT()
      ]);
      
      return {
        criticalEvents: securityEvents.status === 'fulfilled' ? securityEvents.value : null,
        riskAssessment: casbRisks.status === 'fulfilled' ? casbRisks.value : null,
        shadowIT: shadowIT.status === 'fulfilled' ? shadowIT.value : null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get threat intelligence summary:', error);
      throw error;
    }
  }
}

// Singleton instance
let securityClient: SecurityMCPClient | null = null;

/**
 * Get or create Security MCP client instance
 */
export async function getSecurityMCPClient(): Promise<SecurityMCPClient> {
  if (!securityClient) {
    securityClient = new SecurityMCPClient();
    await securityClient.initialize();
  }
  
  return securityClient;
}
