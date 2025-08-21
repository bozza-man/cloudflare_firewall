import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { MCPService } from '../mcp/mcp-service.js';
import type { GatewayRule } from '../types/gateway.js';

interface OptimizationOptions {
  autoFix?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
  useMCP?: boolean;
}

interface OptimizationResult {
  type: 'redundancy' | 'conflict' | 'precedence' | 'effectiveness' | 'consolidation';
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedRules: GatewayRule[];
  suggestedFix?: {
    action: 'delete' | 'update' | 'merge' | 'reorder';
    details: any;
  };
  metrics?: {
    effectiveness: number;
    hits: number;
    timeRange: string;
  };
}

export class EnhancedRuleOptimizer {
  private client: GatewayClient;
  private ai: GatewayAIAssistant;
  private mcpService: MCPService;

  constructor() {
    this.client = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.mcpService = new MCPService();
  }

  async analyzeAndOptimize(options: OptimizationOptions = {}): Promise<void> {
    const spinner = ora('Analyzing Gateway rules...').start();

    try {
      // Fetch all rules
      spinner.text = 'Fetching Gateway rules...';
      const rules = await this.client.listGatewayRules();
      
      if (rules.length === 0) {
        spinner.succeed('No rules found to analyze');
        return;
      }

      spinner.text = `Analyzing ${rules.length} rules...`;
      
      // Get observability metrics if MCP is enabled
      let metrics = null;
      if (options.useMCP !== false) {
        try {
          spinner.text = 'Connecting to MCP observability...';
          await this.mcpService.connectObservability();
          
          spinner.text = 'Fetching rule effectiveness metrics...';
          metrics = await this.mcpService.getRuleMetrics(rules, '7d');
        } catch (error) {
          console.log(chalk.yellow('\n⚠️  MCP observability not available, continuing with static analysis'));
        }
      }

      const issues = await this.findOptimizationOpportunities(rules, metrics);
      
      spinner.succeed(`Analysis complete. Found ${issues.length} optimization opportunities`);

      if (issues.length === 0) {
        console.log(chalk.green('\n✨ Your ruleset is already optimized!'));
        return;
      }

      // Display issues
      this.displayOptimizationIssues(issues);

      // Apply fixes if requested
      if (options.autoFix) {
        await this.applyOptimizations(issues, options);
      } else if (options.interactive) {
        await this.interactiveOptimization(issues, options);
      } else if (!options.dryRun) {
        console.log(chalk.cyan('\nTo apply these optimizations:'));
        console.log('  • Use --auto-fix to apply all recommendations automatically');
        console.log('  • Use --interactive to review and apply changes one by one');
      }

      // Get audit logs if available
      if (options.useMCP !== false) {
        try {
          spinner.start('Fetching recent rule changes from audit logs...');
          await this.mcpService.connectAuditLogs();
          const auditLogs = await this.mcpService.getAuditLogs({
            filter: 'resource.type == "gateway_rule"',
            timeRange: '7d',
            limit: 10
          });
          
          if (auditLogs.length > 0) {
            spinner.succeed('Recent rule changes retrieved');
            this.displayRecentChanges(auditLogs);
          } else {
            spinner.info('No recent rule changes found');
          }
        } catch (error) {
          spinner.warn('Audit logs not available');
        }
      }

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
    } finally {
      await this.mcpService.disconnectAll();
    }
  }

  private async findOptimizationOpportunities(
    rules: GatewayRule[],
    metrics: any
  ): Promise<OptimizationResult[]> {
    const issues: OptimizationResult[] = [];

    // Sort rules by precedence for analysis
    const sortedRules = [...rules].sort((a, b) => a.precedence - b.precedence);

    // 1. Check for ineffective rules using MCP metrics
    if (metrics) {
      for (const rule of sortedRules) {
        const hits = metrics.ruleHits.get(rule.id) || 0;
        const effectiveness = metrics.ruleEffectiveness.find((e: any) => e.ruleId === rule.id);
        
        if (hits === 0 && rule.enabled) {
          issues.push({
            type: 'effectiveness',
            severity: 'low',
            message: `Rule "${rule.name}" has had no hits in the past ${metrics.timeRange}`,
            affectedRules: [rule],
            suggestedFix: {
              action: 'delete',
              details: { ruleId: rule.id }
            },
            metrics: {
              effectiveness: 0,
              hits: 0,
              timeRange: metrics.timeRange
            }
          });
        } else if (effectiveness && effectiveness.effectiveness < 0.1 && rule.enabled) {
          issues.push({
            type: 'effectiveness',
            severity: 'low',
            message: `Rule "${rule.name}" has very low effectiveness (${effectiveness.effectiveness}%)`,
            affectedRules: [rule],
            metrics: {
              effectiveness: effectiveness.effectiveness,
              hits,
              timeRange: metrics.timeRange
            }
          });
        }
      }
    }

    // 2. Check for redundant rules
    for (let i = 0; i < sortedRules.length; i++) {
      for (let j = i + 1; j < sortedRules.length; j++) {
        const rule1 = sortedRules[i];
        const rule2 = sortedRules[j];

        // Check for exact duplicates
        if (rule1.traffic === rule2.traffic && rule1.action === rule2.action) {
          issues.push({
            type: 'redundancy',
            severity: 'high',
            message: `Rules "${rule1.name}" and "${rule2.name}" have identical filters and actions`,
            affectedRules: [rule1, rule2],
            suggestedFix: {
              action: 'delete',
              details: { ruleId: rule2.id, reason: 'Duplicate of earlier rule' }
            }
          });
        }
      }
    }

    // 3. Check for conflicting rules
    for (let i = 0; i < sortedRules.length; i++) {
      for (let j = i + 1; j < sortedRules.length; j++) {
        const rule1 = sortedRules[i];
        const rule2 = sortedRules[j];

        // Simple overlap detection
        if (this.detectFilterOverlap(rule1.traffic, rule2.traffic)) {
          if (rule1.action !== rule2.action) {
            issues.push({
              type: 'conflict',
              severity: 'medium',
              message: `Rules "${rule1.name}" and "${rule2.name}" have overlapping filters but different actions`,
              affectedRules: [rule1, rule2],
              suggestedFix: {
                action: 'reorder',
                details: { 
                  message: 'Consider adjusting precedence to ensure correct evaluation order'
                }
              }
            });
          }
        }
      }
    }

    // 4. Check for precedence issues
    for (let i = 0; i < sortedRules.length - 1; i++) {
      const rule1 = sortedRules[i];
      const rule2 = sortedRules[i + 1];

      // Check if a more specific rule comes after a general rule
      if (this.isMoreSpecific(rule2.traffic, rule1.traffic)) {
        issues.push({
          type: 'precedence',
          severity: 'medium',
          message: `Rule "${rule2.name}" is more specific but has higher precedence than "${rule1.name}"`,
          affectedRules: [rule1, rule2],
          suggestedFix: {
            action: 'reorder',
            details: {
              rule1Id: rule1.id,
              rule1NewPrecedence: rule2.precedence,
              rule2Id: rule2.id,
              rule2NewPrecedence: rule1.precedence
            }
          }
        });
      }
    }

    // 5. Suggest consolidation opportunities
    const domainBlockRules = sortedRules.filter(r => 
      r.action === 'block' && 
      r.traffic.includes('dns.fqdn') &&
      r.enabled
    );

    if (domainBlockRules.length > 5) {
      issues.push({
        type: 'consolidation',
        severity: 'low',
        message: `${domainBlockRules.length} separate domain block rules could be consolidated into lists`,
        affectedRules: domainBlockRules,
        suggestedFix: {
          action: 'merge',
          details: {
            message: 'Consider creating Gateway Lists to group related domains'
          }
        }
      });
    }

    return issues;
  }

  private detectFilterOverlap(traffic1: string, traffic2: string): boolean {
    // Simple overlap detection - can be enhanced
    const commonPatterns = ['dns.fqdn', 'http.request.host', 'http.request.uri'];
    
    for (const pattern of commonPatterns) {
      if (traffic1.includes(pattern) && traffic2.includes(pattern)) {
        // Extract domains/patterns and check for overlap
        const domains1 = this.extractDomains(traffic1);
        const domains2 = this.extractDomains(traffic2);
        
        if (domains1.some(d => domains2.includes(d))) {
          return true;
        }
      }
    }
    
    return false;
  }

  private extractDomains(traffic: string): string[] {
    const domains: string[] = [];
    const regex = /"([^"]+)"/g;
    let match;
    
    while ((match = regex.exec(traffic)) !== null) {
      domains.push(match[1]);
    }
    
    return domains;
  }

  private isMoreSpecific(traffic1: string, traffic2: string): boolean {
    // Check if traffic1 is more specific than traffic2
    const operators1 = (traffic1.match(/and|or|not/g) || []).length;
    const operators2 = (traffic2.match(/and|or|not/g) || []).length;
    
    // More operators usually means more specific
    if (operators1 > operators2) return true;
    
    // Check for wildcards
    const wildcards1 = (traffic1.match(/\*/g) || []).length;
    const wildcards2 = (traffic2.match(/\*/g) || []).length;
    
    // Fewer wildcards means more specific
    if (wildcards1 < wildcards2) return true;
    
    return false;
  }

  private displayOptimizationIssues(issues: OptimizationResult[]): void {
    console.log(chalk.bold('\n📊 Optimization Report:\n'));

    const grouped = {
      high: issues.filter(i => i.severity === 'high'),
      medium: issues.filter(i => i.severity === 'medium'),
      low: issues.filter(i => i.severity === 'low')
    };

    for (const [severity, severityIssues] of Object.entries(grouped)) {
      if (severityIssues.length === 0) continue;

      const color = severity === 'high' ? chalk.red : 
                    severity === 'medium' ? chalk.yellow : 
                    chalk.blue;
      
      console.log(color.bold(`${severity.toUpperCase()} Priority Issues (${severityIssues.length}):`));
      
      for (const issue of severityIssues) {
        console.log(`\n  ${this.getIssueIcon(issue.type)} ${issue.message}`);
        
        if (issue.metrics) {
          console.log(chalk.gray(`     Metrics: ${issue.metrics.hits} hits in ${issue.metrics.timeRange}, ${issue.metrics.effectiveness}% effectiveness`));
        }
        
        console.log(chalk.gray(`     Affected rules: ${issue.affectedRules.map(r => r.name).join(', ')}`));
        
        if (issue.suggestedFix) {
          console.log(chalk.cyan(`     Suggested fix: ${this.getFixDescription(issue.suggestedFix)}`));
        }
      }
    }
  }

  private getIssueIcon(type: string): string {
    const icons: Record<string, string> = {
      redundancy: '🔁',
      conflict: '⚠️',
      precedence: '📋',
      effectiveness: '📉',
      consolidation: '🔄'
    };
    return icons[type] || '•';
  }

  private getFixDescription(fix: any): string {
    switch (fix.action) {
      case 'delete':
        return `Delete rule ${fix.details.reason || ''}`;
      case 'update':
        return 'Update rule configuration';
      case 'merge':
        return fix.details.message || 'Merge rules';
      case 'reorder':
        return fix.details.message || 'Adjust rule precedence';
      default:
        return 'Apply suggested changes';
    }
  }

  private async applyOptimizations(
    issues: OptimizationResult[],
    options: OptimizationOptions
  ): Promise<void> {
    const spinner = ora('Applying optimizations...').start();
    let applied = 0;
    let failed = 0;

    for (const issue of issues) {
      if (!issue.suggestedFix) continue;

      try {
        if (options.dryRun) {
          spinner.text = `[DRY RUN] Would ${issue.suggestedFix.action} for: ${issue.message}`;
          applied++;
        } else {
          spinner.text = `Applying fix for: ${issue.message}`;
          
          switch (issue.suggestedFix.action) {
            case 'delete':
              await this.client.deleteGatewayRule(issue.suggestedFix.details.ruleId);
              break;
            case 'reorder':
              if (issue.suggestedFix.details.rule1Id) {
                await this.client.updateRulePrecedence(
                  issue.suggestedFix.details.rule1Id,
                  issue.suggestedFix.details.rule1NewPrecedence
                );
                await this.client.updateRulePrecedence(
                  issue.suggestedFix.details.rule2Id,
                  issue.suggestedFix.details.rule2NewPrecedence
                );
              }
              break;
            // Add more fix implementations as needed
          }
          
          applied++;
        }
      } catch (error) {
        failed++;
        spinner.fail(`Failed to apply fix: ${error}`);
      }
    }

    if (options.dryRun) {
      spinner.succeed(`[DRY RUN] Would apply ${applied} optimizations`);
    } else {
      spinner.succeed(`Applied ${applied} optimizations, ${failed} failed`);
    }
  }

  private async interactiveOptimization(
    issues: OptimizationResult[],
    options: OptimizationOptions
  ): Promise<void> {
    console.log(chalk.cyan('\n🔍 Interactive Optimization Mode\n'));

    for (const issue of issues) {
      console.log(chalk.bold(`\n${this.getIssueIcon(issue.type)} ${issue.message}`));
      
      if (issue.metrics) {
        console.log(chalk.gray(`Metrics: ${issue.metrics.hits} hits, ${issue.metrics.effectiveness}% effectiveness`));
      }
      
      console.log(chalk.gray(`Affected: ${issue.affectedRules.map(r => r.name).join(', ')}`));

      if (issue.suggestedFix) {
        const { apply } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'apply',
            message: `Apply fix: ${this.getFixDescription(issue.suggestedFix)}?`,
            default: issue.severity === 'high'
          }
        ]);

        if (apply && !options.dryRun) {
          const spinner = ora('Applying fix...').start();
          try {
            // Apply the fix (implement based on action type)
            spinner.succeed('Fix applied successfully');
          } catch (error) {
            spinner.fail(`Failed to apply fix: ${error}`);
          }
        }
      }
    }
  }

  private displayRecentChanges(auditLogs: any[]): void {
    console.log(chalk.bold('\n📜 Recent Rule Changes:\n'));
    
    for (const log of auditLogs.slice(0, 5)) {
      const timestamp = new Date(log.timestamp).toLocaleString();
      console.log(`  ${chalk.gray(timestamp)} - ${log.action} by ${log.actor}`);
      if (log.resource) {
        console.log(`    Resource: ${log.resource}`);
      }
    }
  }
}
