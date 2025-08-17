import { EventEmitter } from 'events';
import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayLog, LogLevel } from '../types/streaming.js';
// import type { GatewayRule } from '../types/gateway.js';
import chalk from 'chalk';

interface LogCollectorOptions {
  pollInterval?: number;
  enableAuditLogs?: boolean;
  enableActivityLogs?: boolean;
  enableDnsLogs?: boolean;
  enableHttpLogs?: boolean;
  batchSize?: number;
}

export class GatewayLogCollector extends EventEmitter {
  private gateway: GatewayClient;
  private pollInterval: number;
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private lastPollTime: Date;
  private options: Required<LogCollectorOptions>;
  private seenLogIds: Set<string> = new Set();
  private maxSeenLogIds = 100000;

  constructor(gateway: GatewayClient, options: LogCollectorOptions = {}) {
    super();
    this.gateway = gateway;
    this.pollInterval = options.pollInterval || 5000; // 5 seconds default
    this.lastPollTime = new Date();
    
    this.options = {
      pollInterval: options.pollInterval || 5000,
      enableAuditLogs: options.enableAuditLogs ?? true,
      enableActivityLogs: options.enableActivityLogs ?? true,
      enableDnsLogs: options.enableDnsLogs ?? true,
      enableHttpLogs: options.enableHttpLogs ?? true,
      batchSize: options.batchSize || 100
    };
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('Log collector is already running'));
      return;
    }
    
    this.isRunning = true;
    console.log(chalk.green('✓ Gateway log collector started'));
    
    // Start polling
    this.pollLogs();
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    
    console.log(chalk.yellow('Gateway log collector stopped'));
  }

  private async pollLogs(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Fetch different types of logs in parallel
      const logPromises: Promise<void>[] = [];
      
      if (this.options.enableAuditLogs) {
        logPromises.push(this.fetchAuditLogs());
      }
      
      if (this.options.enableActivityLogs) {
        logPromises.push(this.fetchActivityLogs());
      }
      
      if (this.options.enableDnsLogs) {
        logPromises.push(this.fetchDnsLogs());
      }
      
      if (this.options.enableHttpLogs) {
        logPromises.push(this.fetchHttpLogs());
      }
      
      await Promise.allSettled(logPromises);
      
      this.lastPollTime = new Date();
      
    } catch (error) {
      console.error('Error polling logs:', error);
      this.emit('error', error);
    }
    
    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.pollLogs(), this.pollInterval);
    }
  }

  private async fetchAuditLogs(): Promise<void> {
    try {
      // Fetch audit logs from Cloudflare
      // This would use the Cloudflare API to get audit logs
      const response = await this.gateway.fetchLogs({
        type: 'audit',
        since: this.lastPollTime.toISOString(),
        limit: this.options.batchSize
      });
      
      if (response && Array.isArray(response)) {
        for (const log of response) {
          this.processLog(log, 'audit');
        }
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  }

  private async fetchActivityLogs(): Promise<void> {
    try {
      // Fetch gateway activity logs
      // This includes rule matches, blocks, allows, etc.
      const response = await this.gateway.fetchLogs({
        type: 'gateway_activity',
        since: this.lastPollTime.toISOString(),
        limit: this.options.batchSize
      });
      
      if (response && Array.isArray(response)) {
        for (const log of response) {
          this.processLog(log, 'activity');
        }
      }
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    }
  }

  private async fetchDnsLogs(): Promise<void> {
    try {
      // Fetch DNS query logs
      const response = await this.gateway.fetchLogs({
        type: 'dns',
        since: this.lastPollTime.toISOString(),
        limit: this.options.batchSize
      });
      
      if (response && Array.isArray(response)) {
        for (const log of response) {
          this.processLog(log, 'dns');
        }
      }
    } catch (error) {
      console.error('Error fetching DNS logs:', error);
    }
  }

  private async fetchHttpLogs(): Promise<void> {
    try {
      // Fetch HTTP request logs
      const response = await this.gateway.fetchLogs({
        type: 'http',
        since: this.lastPollTime.toISOString(),
        limit: this.options.batchSize
      });
      
      if (response && Array.isArray(response)) {
        for (const log of response) {
          this.processLog(log, 'http');
        }
      }
    } catch (error) {
      console.error('Error fetching HTTP logs:', error);
    }
  }

  private processLog(rawLog: unknown, logType: string): void {
    try {
      // Generate unique ID for deduplication
      const logId = this.generateLogId(rawLog);
      
      // Check if we've already seen this log
      if (this.seenLogIds.has(logId)) {
        return;
      }
      
      // Add to seen logs
      this.seenLogIds.add(logId);
      
      // Trim seen logs if too large
      if (this.seenLogIds.size > this.maxSeenLogIds) {
        const idsArray = Array.from(this.seenLogIds);
        this.seenLogIds = new Set(idsArray.slice(-this.maxSeenLogIds / 2));
      }
      
      // Transform raw log to our format
      const gatewayLog = this.transformLog(rawLog, logType);
      
      // Emit the processed log
      this.emit('log', gatewayLog);
      
    } catch (error) {
      console.error('Error processing log:', error);
    }
  }

  private generateLogId(log: unknown): string {
    // Generate a unique ID based on log content
    const key = `${log.timestamp || Date.now()}_${log.id || ''}_${log.action || ''}_${log.ruleId || ''}`;
    return key;
  }

  private transformLog(rawLog: unknown, logType: string): GatewayLog {
    const level = this.determineLogLevel(rawLog);
    
    return {
      id: rawLog.id || this.generateLogId(rawLog),
      timestamp: rawLog.timestamp || new Date().toISOString(),
      level,
      type: logType,
      action: rawLog.action || rawLog.decision || 'unknown',
      ruleId: rawLog.ruleId || rawLog.rule_id,
      ruleName: rawLog.ruleName || rawLog.rule_name,
      source: {
        ip: rawLog.sourceIp || rawLog.client_ip || rawLog.source?.ip,
        country: rawLog.sourceCountry || rawLog.client_country || rawLog.source?.country,
        asn: rawLog.sourceAsn || rawLog.client_asn || rawLog.source?.asn,
        user: rawLog.user || rawLog.identity || rawLog.source?.user
      },
      destination: {
        hostname: rawLog.hostname || rawLog.destination?.hostname,
        ip: rawLog.destinationIp || rawLog.destination?.ip,
        port: rawLog.port || rawLog.destination?.port,
        protocol: rawLog.protocol || rawLog.destination?.protocol
      },
      details: {
        method: rawLog.method,
        path: rawLog.path || rawLog.uri,
        query: rawLog.query,
        userAgent: rawLog.userAgent || rawLog.user_agent,
        referer: rawLog.referer,
        statusCode: rawLog.statusCode || rawLog.status_code,
        category: rawLog.category,
        threat: rawLog.threat,
        ...rawLog.metadata
      },
      raw: rawLog
    };
  }

  private determineLogLevel(log: unknown): LogLevel {
    // Determine log level based on action and other factors
    const logData = log as Record<string, unknown>;
    const action = ((logData.action || logData.decision || '') as string).toLowerCase();
    
    if (action === 'block' || action === 'deny') {
      return 'warning';
    }
    
    if (action === 'isolate' || log.threat) {
      return 'error';
    }
    
    if (action === 'allow' || action === 'pass') {
      return 'info';
    }
    
    if (log.type === 'audit' || log.type === 'system') {
      return 'debug';
    }
    
    return 'info';
  }

  public getStats() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.pollInterval,
      lastPollTime: this.lastPollTime,
      seenLogsCount: this.seenLogIds.size,
      options: this.options
    };
  }

  // TODO: Implement real log simulation for testing if needed
  // Should use proper testing framework data or external mock services
}