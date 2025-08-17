import { EventEmitter } from 'events';
import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule } from '../types/gateway.js';
import chalk from 'chalk';
import { createHash } from 'crypto';

interface RuleSnapshot {
  rules: GatewayRule[];
  timestamp: Date;
  hash: string;
}

interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'rule_added' | 'rule_removed' | 'rule_modified' | 'rule_enabled' | 'rule_disabled' | 'precedence_changed' | 'filter_changed';
  severity: 'info' | 'warning' | 'critical';
  ruleName: string;
  ruleId?: string;
  details: {
    before?: unknown;
    after?: unknown;
    changes?: string[];
  };
  summary: string;
}

export class GatewayActivityMonitor extends EventEmitter {
  private gateway: GatewayClient;
  private pollInterval: number;
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private lastSnapshot?: RuleSnapshot;
  private ruleStats: Map<string, { hitCount: number; lastSeen: Date }> = new Map();
  private activityLog: ActivityEvent[] = [];
  private maxActivityLog = 1000;

  constructor(gateway: GatewayClient, pollInterval: number = 30000) {
    super();
    this.gateway = gateway;
    this.pollInterval = pollInterval;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log(chalk.yellow('Activity monitor is already running'));
      return;
    }

    this.isRunning = true;
    console.log(chalk.green('✓ Gateway activity monitor started'));
    
    // Take initial snapshot
    await this.takeSnapshot();
    
    // Start polling
    this.schedulePoll();
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
    
    console.log(chalk.yellow('Gateway activity monitor stopped'));
  }

  private async takeSnapshot(): Promise<void> {
    try {
      const rules = await this.gateway.listGatewayRules();
      const hash = this.hashRules(rules);
      
      const snapshot: RuleSnapshot = {
        rules,
        timestamp: new Date(),
        hash
      };

      // Compare with last snapshot
      if (this.lastSnapshot) {
        await this.compareSnapshots(this.lastSnapshot, snapshot);
      } else {
        // First snapshot - log all rules as initial state
        this.logActivity({
          id: `init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'rule_added',
          severity: 'info',
          ruleName: 'Initial Rules Loaded',
          summary: `Loaded ${rules.length} existing rules`,
          details: {
            after: rules.map(r => ({ id: r.id, name: r.name, action: r.action }))
          }
        });
      }

      this.lastSnapshot = snapshot;
      
      // Emit snapshot event
      this.emit('snapshot', {
        rulesCount: rules.length,
        enabledCount: rules.filter(r => r.enabled).length,
        disabledCount: rules.filter(r => !r.enabled).length,
        byAction: this.groupByAction(rules),
        timestamp: snapshot.timestamp
      });

    } catch (error) {
      console.error('Error taking snapshot:', error);
      this.emit('error', error);
    }
  }

  private async compareSnapshots(oldSnapshot: RuleSnapshot, newSnapshot: RuleSnapshot): Promise<void> {
    const oldRulesMap = new Map(oldSnapshot.rules.map(r => [r.id, r]));
    const newRulesMap = new Map(newSnapshot.rules.map(r => [r.id, r]));

    // Check for added rules
    for (const [id, rule] of newRulesMap) {
      if (!oldRulesMap.has(id)) {
        this.logActivity({
          id: `add-${Date.now()}-${id}`,
          timestamp: new Date().toISOString(),
          type: 'rule_added',
          severity: 'warning',
          ruleName: rule.name,
          ruleId: id,
          summary: `New rule added: ${rule.name}`,
          details: {
            after: rule
          }
        });
      }
    }

    // Check for removed rules
    for (const [id, rule] of oldRulesMap) {
      if (!newRulesMap.has(id)) {
        this.logActivity({
          id: `remove-${Date.now()}-${id}`,
          timestamp: new Date().toISOString(),
          type: 'rule_removed',
          severity: 'warning',
          ruleName: rule.name,
          ruleId: id,
          summary: `Rule removed: ${rule.name}`,
          details: {
            before: rule
          }
        });
      }
    }

    // Check for modified rules
    for (const [id, newRule] of newRulesMap) {
      const oldRule = oldRulesMap.get(id);
      if (oldRule) {
        const changes = this.detectChanges(oldRule, newRule);
        if (changes.length > 0) {
          const severity = this.determineSeverity(changes);
          const type = this.determineChangeType(changes);
          
          this.logActivity({
            id: `modify-${Date.now()}-${id}`,
            timestamp: new Date().toISOString(),
            type,
            severity,
            ruleName: newRule.name,
            ruleId: id,
            summary: `Rule modified: ${newRule.name} (${changes.join(', ')})`,
            details: {
              before: oldRule,
              after: newRule,
              changes
            }
          });
        }
      }
    }
  }

  private detectChanges(oldRule: GatewayRule, newRule: GatewayRule): string[] {
    const changes: string[] = [];

    if (oldRule.enabled !== newRule.enabled) {
      changes.push(newRule.enabled ? 'enabled' : 'disabled');
    }

    if (oldRule.action !== newRule.action) {
      changes.push(`action changed from ${oldRule.action} to ${newRule.action}`);
    }

    if (oldRule.precedence !== newRule.precedence) {
      changes.push(`precedence changed from ${oldRule.precedence} to ${newRule.precedence}`);
    }

    if (oldRule.traffic !== newRule.traffic) {
      changes.push('filter modified');
    }

    if (oldRule.name !== newRule.name) {
      changes.push('name changed');
    }

    if (oldRule.identity !== newRule.identity) {
      changes.push('identity criteria changed');
    }

    if (oldRule.device_posture !== newRule.device_posture) {
      changes.push('device posture changed');
    }

    return changes;
  }

  private determineChangeType(changes: string[]): ActivityEvent['type'] {
    if (changes.some(c => c.includes('enabled'))) return 'rule_enabled';
    if (changes.some(c => c.includes('disabled'))) return 'rule_disabled';
    if (changes.some(c => c.includes('precedence'))) return 'precedence_changed';
    if (changes.some(c => c.includes('filter'))) return 'filter_changed';
    return 'rule_modified';
  }

  private determineSeverity(changes: string[]): ActivityEvent['severity'] {
    if (changes.some(c => c.includes('action changed') || c.includes('filter'))) {
      return 'critical';
    }
    if (changes.some(c => c.includes('precedence') || c.includes('enabled') || c.includes('disabled'))) {
      return 'warning';
    }
    return 'info';
  }

  private logActivity(event: ActivityEvent): void {
    this.activityLog.push(event);
    
    // Trim log if too large
    if (this.activityLog.length > this.maxActivityLog) {
      this.activityLog = this.activityLog.slice(-this.maxActivityLog);
    }

    // Emit the event
    this.emit('activity', event);

    // Convert to log format for streaming
    const log = {
      id: event.id,
      timestamp: event.timestamp,
      level: event.severity === 'critical' ? 'error' : event.severity,
      type: 'config_change',
      action: event.type,
      ruleId: event.ruleId,
      ruleName: event.ruleName,
      source: {
        ip: 'API',
        user: 'Unknown'
      },
      destination: {
        hostname: 'gateway.config'
      },
      details: {
        summary: event.summary,
        ...event.details
      }
    };

    this.emit('log', log);
  }

  private hashRules(rules: GatewayRule[]): string {
    const data = JSON.stringify(rules.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      action: r.action,
      precedence: r.precedence,
      traffic: r.traffic,
      filters: r.filters,
      identity: r.identity,
      device_posture: r.device_posture
    })));
    return createHash('sha256').update(data).digest('hex');
  }

  private groupByAction(rules: GatewayRule[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const rule of rules) {
      groups[rule.action] = (groups[rule.action] || 0) + 1;
    }
    return groups;
  }

  private schedulePoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.takeSnapshot();
      this.schedulePoll();
    }, this.pollInterval);
  }

  public getStats() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.pollInterval,
      lastSnapshot: this.lastSnapshot?.timestamp,
      activityLogSize: this.activityLog.length,
      rulesCount: this.lastSnapshot?.rules.length || 0
    };
  }

  public getActivityLog(): ActivityEvent[] {
    return [...this.activityLog];
  }

  public async testRuleImpact(ruleId: string): Promise<unknown> {
    // This would analyze what a rule might be blocking/allowing
    // based on its filters and precedence
    const rules = this.lastSnapshot?.rules || [];
    const rule = rules.find(r => r.id === ruleId);
    
    if (!rule) {
      return null;
    }

    return {
      rule: {
        id: rule.id,
        name: rule.name,
        action: rule.action,
        precedence: rule.precedence
      },
      analysis: {
        position: rules.indexOf(rule) + 1,
        totalRules: rules.length,
        higherPrecedence: rules.filter(r => r.precedence < rule.precedence).length,
        lowerPrecedence: rules.filter(r => r.precedence > rule.precedence).length,
        conflictingRules: this.findConflictingRules(rule, rules),
        estimatedImpact: this.estimateRuleImpact(rule)
      }
    };
  }

  private findConflictingRules(rule: GatewayRule, allRules: GatewayRule[]): unknown[] {
    // Simple conflict detection based on overlapping filters
    const conflicts = [];
    
    for (const otherRule of allRules) {
      if (otherRule.id === rule.id) continue;
      
      // Check if actions conflict and filters might overlap
      if (this.actionsConflict(rule.action, otherRule.action)) {
        if (this.filtersOverlap(rule.traffic, otherRule.traffic)) {
          conflicts.push({
            id: otherRule.id,
            name: otherRule.name,
            action: otherRule.action,
            precedence: otherRule.precedence,
            type: otherRule.precedence < rule.precedence ? 'overrides' : 'overridden_by'
          });
        }
      }
    }
    
    return conflicts;
  }

  private actionsConflict(action1: string, action2: string): boolean {
    const conflictMap: Record<string, string[]> = {
      'allow': ['block', 'isolate'],
      'block': ['allow'],
      'isolate': ['allow'],
      'do_not_isolate': ['isolate'],
      'do_not_inspect': ['inspect'],
      'inspect': ['do_not_inspect']
    };
    
    return conflictMap[action1]?.includes(action2) || false;
  }

  private filtersOverlap(traffic1: string, traffic2: string): boolean {
    // Simple check - in reality this would need proper parsing
    if (!traffic1 || !traffic2) return false;
    
    // Check for common patterns
    const domains1 = this.extractDomains(traffic1);
    const domains2 = this.extractDomains(traffic2);
    
    return domains1.some(d1 => domains2.includes(d1));
  }

  private extractDomains(traffic: string): string[] {
    const domains: string[] = [];
    const matches = traffic.match(/"([^"]+)"/g);
    if (matches) {
      matches.forEach(match => {
        const domain = match.replace(/"/g, '');
        if (domain.includes('.')) {
          domains.push(domain);
        }
      });
    }
    return domains;
  }

  private estimateRuleImpact(rule: GatewayRule): string {
    // Estimate based on filter breadth
    const traffic = rule.traffic || '';
    
    if (traffic.includes('*') || traffic.includes('matches')) {
      return 'high';
    }
    
    if (traffic.includes(' or ') || traffic.includes(' in ')) {
      return 'medium';
    }
    
    return 'low';
  }
}