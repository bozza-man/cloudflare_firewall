import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { RuleAnalyzer } from './rule-analyzer.js';
import { ListAnalyzer } from './list-analyzer.js';
import { RuleNamingTemplate } from '../utils/rule-naming-template.js';
import type { GatewayRule } from '../types/gateway.js';
import type {
  AIAnalysisResponse,
  AIIssue,
  AIRecommendation,
  AIOptimizedRule,
  LocalAnalysis,
  LocalAnalysisIssue,
  ProposedRuleOrder
} from '../types/ai-responses.js';
import {
  extractIssueText,
  castToAIAnalysisResponse,
  isAIRecommendation
} from '../types/ai-responses.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

export interface OptimizationPlan {
  rulesToUpdate: Array<{
    rule: GatewayRule;
    updates: {
      name?: string;
      filters?: string[];
      action?: GatewayRule['action'];
      precedence?: number;
      enabled?: boolean;
      description?: string;
    };
    reason: string;
  }>;
  rulesToDelete: Array<{
    rule: GatewayRule;
    reason: string;
  }>;
  rulesToCreate: Array<{
    rule: Omit<GatewayRule, 'id' | 'created_at' | 'updated_at'>;
    reason: string;
  }>;
  reorderingPlan: Array<{
    ruleId: string;
    ruleName: string;
    currentPrecedence: number;
    newPrecedence: number;
  }>;
}

export class RuleOptimizer {
  private gateway: GatewayClient;
  private ai: GatewayAIAssistant;
  private analyzer: RuleAnalyzer;
  private listAnalyzer: ListAnalyzer;

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.analyzer = new RuleAnalyzer();
    this.listAnalyzer = new ListAnalyzer();
  }

  async analyzeAndOptimize(options: {
    autoFix?: boolean;
    dryRun?: boolean;
    interactive?: boolean;
  } = {}): Promise<void> {
    const spinner = ora('Fetching current Gateway rules...').start();

    try {
      // Fetch current rules
      const rules = await this.gateway.listGatewayRules();
      const sortedRules = rules.sort((a, b) => a.precedence - b.precedence);
      
      spinner.text = 'Analyzing ruleset...';
      
      // Run local analysis
      const localAnalysis = this.analyzer.analyzeRules(sortedRules);
      
      // Run AI analysis
      spinner.text = 'Running AI-powered deep analysis...';
      const aiAnalysis = await this.ai.analyzeAndOptimizeRuleset(sortedRules);
      
      spinner.succeed('Analysis complete');

      // Display analysis results
      console.log(chalk.bold.cyan('\n🤖 AI Analysis Summary:\n'));
      console.log(aiAnalysis.summary);
      
      if (aiAnalysis.criticalIssues.length > 0) {
        console.log(chalk.red('\n🚨 Critical Issues:'));
        aiAnalysis.criticalIssues.forEach((issue: AIIssue | string, index: number) => {
          const issueText = extractIssueText(issue);
          console.log(`   ${index + 1}. ${issueText}`);
        });
      }

      // Display local analysis
      this.analyzer.displayAnalysis(localAnalysis);

      // Run list effectiveness analysis
      spinner.text = 'Analyzing Gateway Lists usage...';
      const listAnalysis = await this.listAnalyzer.analyzeListEffectiveness(sortedRules);
      spinner.succeed('List analysis complete');
      
      // Display list analysis
      this.listAnalyzer.displayListAnalysis(listAnalysis);

      // Convert RuleAnalysis to LocalAnalysis format
      const convertedLocalAnalysis: LocalAnalysis = {
        issues: localAnalysis.issues.map(issue => ({
          ruleId: issue.ruleId || '',
          category: issue.category === 'redundancy' ? 'redundancy' : 
                   issue.category === 'conflict' ? 'conflict' : 
                   issue.category === 'ordering' ? 'ordering' : 'performance',
          type: issue.type,
          message: issue.message,
          relatedRules: issue.relatedRules,
          severity: issue.type === 'error' ? 'high' : 
                   issue.type === 'warning' ? 'medium' : 'low'
        })),
        proposedOrder: localAnalysis.proposedOrder,
        summary: {
          totalRules: localAnalysis.totalRules,
          errors: localAnalysis.issues.filter(i => i.type === 'error').length,
          warnings: localAnalysis.issues.filter(i => i.type === 'warning').length,
          suggestions: localAnalysis.issues.filter(i => i.type === 'info').length
        }
      };

      // Generate optimization plan
      spinner.start('Generating optimization plan...');
      const plan = await this.generateOptimizationPlan(
        sortedRules, 
        convertedLocalAnalysis, 
        aiAnalysis
      );
      spinner.succeed('Optimization plan ready');

      // Display the plan
      this.displayOptimizationPlan(plan);

      // Execute the plan if requested
      if (options.autoFix || options.interactive) {
        const shouldProceed = options.autoFix || await this.confirmExecution(plan);
        
        if (shouldProceed) {
          if (options.dryRun) {
            console.log(chalk.yellow('\n🔍 DRY RUN MODE - No changes will be made\n'));
          } else {
            await this.executeOptimizationPlan(plan, options.interactive || false);
          }
        }
      } else {
        console.log(chalk.yellow('\n💡 Run with --auto-fix or --interactive to apply these optimizations'));
      }

    } catch (error) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  private async generateOptimizationPlan(
    rules: GatewayRule[],
    localAnalysis: LocalAnalysis,
    aiAnalysisRaw: unknown
  ): Promise<OptimizationPlan> {
    // Cast and validate the AI analysis response
    const aiAnalysis: AIAnalysisResponse = castToAIAnalysisResponse(aiAnalysisRaw);
    const plan: OptimizationPlan = {
      rulesToUpdate: [],
      rulesToDelete: [],
      rulesToCreate: [],
      reorderingPlan: []
    };

    // Process local analysis findings first - these are more reliable
    this.processLocalAnalysisFindings(rules, localAnalysis, plan);

    // Process AI recommendations (with null checks)
    if (aiAnalysis.recommendations && Array.isArray(aiAnalysis.recommendations)) {
      aiAnalysis.recommendations.forEach((recRaw: unknown) => {
        // Type guard to ensure recommendation has proper structure
        if (!isAIRecommendation(recRaw)) return;
        const rec = recRaw as AIRecommendation;
        
        if (rec.priority === 'high' || rec.priority === 'medium') {
          if (rec.affectedRules && Array.isArray(rec.affectedRules)) {
            rec.affectedRules.forEach((ruleId: string) => {
              const rule = rules.find(r => r.id === ruleId);
              if (rule) {
                if (rec.action.includes('delete') || rec.action.includes('remove')) {
                  // Avoid duplicates from local analysis
                  const alreadyMarked = plan.rulesToDelete.some(d => d.rule.id === ruleId);
                  if (!alreadyMarked) {
                    plan.rulesToDelete.push({ rule, reason: rec.reason });
                  }
                } else if (rec.action.includes('update') || rec.action.includes('modify')) {
                  // Find corresponding optimized rule from AI (with null check)
                  if (aiAnalysis.optimizedRuleset && Array.isArray(aiAnalysis.optimizedRuleset)) {
                    const optimized = aiAnalysis.optimizedRuleset.find(
                      (optRaw: unknown) => {
                        const opt = optRaw as AIOptimizedRule;
                        return opt.rule && opt.rule.id === ruleId;
                      }
                    );
                    if (optimized) {
                      const alreadyMarked = plan.rulesToUpdate.some(u => u.rule.id === ruleId);
                      if (!alreadyMarked) {
                        plan.rulesToUpdate.push({
                          rule,
                          updates: this.extractUpdates(rule, optimized as AIOptimizedRule),
                          reason: rec.reason
                        });
                      }
                    }
                  }
                }
              }
            });
          }
        }
      });
    }

    // Process reordering suggestions (with null checks)
    // CRITICAL: Never move the catch-all rule (0519eb6f-0e60-4713-8213-19da74e501f9)
    const CATCH_ALL_RULE_ID = '0519eb6f-0e60-4713-8213-19da74e501f9';
    
    if (localAnalysis.proposedOrder && Array.isArray(localAnalysis.proposedOrder)) {
      localAnalysis.proposedOrder.forEach((proposal: ProposedRuleOrder) => {
        if (proposal.rule && proposal.rule.id) {
          // Skip the catch-all rule - it must always stay last
          if (proposal.rule.id === CATCH_ALL_RULE_ID) {
            console.log(chalk.yellow(`\n⚠️  Skipping catch-all rule "${proposal.rule.name}" - must remain last`));
            return;
          }
          
          plan.reorderingPlan.push({
            ruleId: proposal.rule.id,
            ruleName: proposal.rule.name,
            currentPrecedence: proposal.rule.precedence,
            newPrecedence: proposal.suggestedPrecedence
          });
        }
      });
    }

    // Add AI-suggested reordering (with null checks)
    if (aiAnalysis.optimizedRuleset && Array.isArray(aiAnalysis.optimizedRuleset)) {
      aiAnalysis.optimizedRuleset.forEach((optRaw: unknown) => {
        const opt = optRaw as AIOptimizedRule;
        if (opt.rule && opt.newPrecedence && opt.newPrecedence !== opt.rule.precedence) {
          // Skip the catch-all rule - it must always stay last
          if (opt.rule.id === CATCH_ALL_RULE_ID) {
            return;
          }
          
          const existing = plan.reorderingPlan.find(r => r.ruleId === opt.rule.id);
          if (!existing) {
            plan.reorderingPlan.push({
              ruleId: opt.rule.id,
              ruleName: opt.rule.name,
              currentPrecedence: opt.rule.precedence,
              newPrecedence: opt.newPrecedence
            });
          }
        }
      });
    }

    return plan;
  }

  private processLocalAnalysisFindings(
    rules: GatewayRule[], 
    localAnalysis: LocalAnalysis, 
    plan: OptimizationPlan
  ): void {
    if (!localAnalysis.issues || !Array.isArray(localAnalysis.issues)) return;

    // Track which rules are marked for deletion to avoid updating them
    const markedForDeletion = new Set<string>();

    // First, identify redundant rules for deletion (do this first to avoid updating rules we'll delete)
    const redundantRules = localAnalysis.issues.filter(
      (issue: LocalAnalysisIssue) => issue.category === 'redundancy' && issue.type === 'warning'
    );

    // Track rules that have been processed to avoid conflicts
    const processedRules = new Set<string>();
    
    // For each redundant rule, consider it for deletion
    redundantRules.forEach((issue: LocalAnalysisIssue) => {
      if (processedRules.has(issue.ruleId)) return;
      
      const rule = rules.find(r => r.id === issue.ruleId);
      if (!rule) return;

      // Find the related rule (the one it's redundant with)
      const relatedRuleIds = issue.relatedRules || [];
      const relatedRule = relatedRuleIds.length > 0 ? 
        rules.find(r => r.id === relatedRuleIds[0]) : null;

      if (relatedRule) {
        // More aggressive deletion strategy:
        // Delete the rule with higher precedence (evaluated later) unless it has significantly more specific filters
        const currentFilterCount = rule.filters.join(' ').length;
        const relatedFilterCount = relatedRule.filters.join(' ').length;
        const isSignificantlyMoreSpecific = currentFilterCount > relatedFilterCount * 1.5;
        
        // Delete the later rule unless it's significantly more specific
        const shouldDeleteCurrent = rule.precedence > relatedRule.precedence && !isSignificantlyMoreSpecific;
        const shouldDeleteRelated = relatedRule.precedence > rule.precedence && 
          !((relatedFilterCount > currentFilterCount * 1.5));
        
        if (shouldDeleteCurrent) {
          plan.rulesToDelete.push({
            rule,
            reason: `Redundant with "${relatedRule.name}" (earlier rule covers same domains)`
          });
          processedRules.add(rule.id);
          markedForDeletion.add(rule.id);
        } else if (shouldDeleteRelated && !processedRules.has(relatedRule.id)) {
          plan.rulesToDelete.push({
            rule: relatedRule,
            reason: `Redundant with "${rule.name}" (earlier rule covers same domains)`
          });
          processedRules.add(relatedRule.id);
          markedForDeletion.add(relatedRule.id);
        }
      }
    });

    // Log how many rules are marked for deletion
    if (markedForDeletion.size > 0) {
      console.log(chalk.yellow(`\n📝 Identified ${markedForDeletion.size} redundant rules for deletion`));
    }

    // Check all rules for naming standard compliance and missing descriptions
    // But skip rules that are marked for deletion
    rules.forEach(rule => {
      // Skip if this rule is marked for deletion
      if (markedForDeletion.has(rule.id)) return;
      
      const updates: any = {};
      let reasons: string[] = [];
      
      // Always add description if missing
      if (!rule.description || rule.description.trim() === '') {
        const generatedDescription = this.generateRuleDescription(rule);
        if (generatedDescription) {
          updates.description = generatedDescription;
          reasons.push('Add missing description');
        }
      } else if (rule.description.length < 20) {
        // Also update if description is too short to be meaningful
        const generatedDescription = this.generateRuleDescription(rule);
        if (generatedDescription && generatedDescription.length > rule.description.length) {
          updates.description = generatedDescription;
          reasons.push('Enhance short description');
        }
      }
      
      // Check if rule name could be improved (even if it follows the template)
      if (!RuleNamingTemplate.isStandardized(rule.name)) {
        const standardizedName = RuleNamingTemplate.standardizeRuleName(rule);
        if (standardizedName !== rule.name) {
          updates.name = standardizedName;
          reasons.push('Standardize rule name to follow template');
        }
      } else {
        // Even if standardized, check if the name could be more descriptive
        const betterName = this.suggestBetterRuleName(rule);
        if (betterName && betterName !== rule.name && betterName.length > rule.name.length + 5) {
          updates.name = betterName;
          reasons.push('Improve rule name clarity');
        }
      }
      
      // If there are updates to make, add to the plan
      if (Object.keys(updates).length > 0 && !plan.rulesToUpdate.some(u => u.rule.id === rule.id)) {
        plan.rulesToUpdate.push({
          rule,
          updates,
          reason: reasons.join(' and ')
        });
      }
    });

    // Log how many rules will be updated
    if (plan.rulesToUpdate.length > 0) {
      console.log(chalk.yellow(`\n✏️  Identified ${plan.rulesToUpdate.length} rules for updates (names/descriptions)`));
    }

    // Handle conflict errors by suggesting consolidation
    const conflictRules = localAnalysis.issues.filter(
      (issue: LocalAnalysisIssue) => issue.category === 'conflict' && issue.type === 'error'
    );

    conflictRules.forEach((issue: LocalAnalysisIssue) => {
      const rule = rules.find(r => r.id === issue.ruleId);
      if (!rule || processedRules.has(rule.id)) return;

      // For now, just suggest reviewing the conflicting rule
      // In a more sophisticated implementation, we could suggest merging
      console.log(chalk.yellow(`\n⚠️  Manual review needed: ${rule.name} conflicts with other rules`));
    });
  }

  private extractUpdates(_original: GatewayRule, optimized: AIOptimizedRule): OptimizationPlan['rulesToUpdate'][0]['updates'] {
    const updates: OptimizationPlan['rulesToUpdate'][0]['updates'] = {};
    
    if (optimized.changes && Array.isArray(optimized.changes)) {
      optimized.changes.forEach((change: string) => {
        if (change.includes('filters') && optimized.rule.filters) {
          updates.filters = optimized.rule.filters;
        }
        if (change.includes('name') && optimized.rule.name) {
          updates.name = optimized.rule.name;
        }
        if (change.includes('description') && optimized.rule.description) {
          updates.description = optimized.rule.description;
        }
      });
    }

    if (optimized.newPrecedence) {
      updates.precedence = optimized.newPrecedence;
    }

    return updates;
  }

  private generateRuleDescription(rule: GatewayRule): string {
    const { name, action, traffic, filters } = rule;
    
    // Parse rule characteristics
    const domains = this.extractDomainsFromFilters(filters);
    const categories = this.extractCategoriesFromFilters(filters);
    const isSecurityRule = this.isSecurityRule(rule);
    const isTLSBypass = name.toLowerCase().includes('tls bypass') || name.toLowerCase().includes('bypass');
    
    // Generate contextual descriptions based on patterns
    if (isSecurityRule && action === 'block') {
      if (categories.length > 0) {
        return `Blocks traffic from security threat categories: ${categories.join(', ')}. Protects against malicious content and unauthorized access.`;
      }
      if (name.includes('Countries')) {
        return `Blocks traffic from high-risk geographic regions to reduce security threats and comply with access policies.`;
      }
      return `Security blocking rule that prevents access to potentially harmful or unauthorized content.`;
    }
    
    if (action === 'allow' && domains.length > 0) {
      const serviceName = this.inferServiceFromDomains(domains);
      if (serviceName) {
        return `Allows access to ${serviceName} services and APIs. Enables functionality for ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? ` and ${domains.length - 3} other domains` : ''}.`;
      }
      return `Permits access to specified domains for essential business services and applications.`;
    }
    
    if (isTLSBypass) {
      return `Bypasses TLS inspection for critical authentication and secure communication endpoints to prevent connection issues.`;
    }
    
    // Fallback descriptions based on action
    switch (action) {
      case 'allow':
        return `Allows specified traffic to ensure required services and applications function properly.`;
      case 'block':
        return `Blocks specified traffic to enforce security policies and prevent unauthorized access.`;
      case 'isolate':
        return `Isolates suspicious traffic for security analysis while maintaining network protection.`;
      default:
        return `${action.charAt(0).toUpperCase() + action.slice(1)} rule for traffic matching specified criteria.`;
    }
  }

  private extractDomainsFromFilters(filters: string[]): string[] {
    const domains: string[] = [];
    
    filters.forEach(filter => {
      // Extract domains from dns.fqdn patterns
      const dnsMatches = filter.match(/dns\.fqdn.*?["\{]([^"\}]+)["\}]/g);
      if (dnsMatches) {
        dnsMatches.forEach(match => {
          const domainMatch = match.match(/["\{]([^"\}]+)["\}]/);
          if (domainMatch) {
            domains.push(...domainMatch[1].split(/[",\s]+/).filter(d => d.length > 0));
          }
        });
      }
      
      // Extract domains from http.request.host patterns
      const hostMatches = filter.match(/http\.request\.host.*?["\{]([^"\}]+)["\}]/g);
      if (hostMatches) {
        hostMatches.forEach(match => {
          const domainMatch = match.match(/["\{]([^"\}]+)["\}]/);
          if (domainMatch) {
            domains.push(...domainMatch[1].split(/[",\s]+/).filter(d => d.length > 0));
          }
        });
      }
    });
    
    return [...new Set(domains)].filter(d => d.includes('.'));
  }

  private extractCategoriesFromFilters(filters: string[]): string[] {
    const categories: string[] = [];
    
    filters.forEach(filter => {
      const catMatches = filter.match(/category.*?\{([^}]+)\}/g);
      if (catMatches) {
        catMatches.forEach(match => {
          const nums = match.match(/\d+/g);
          if (nums) {
            categories.push(...nums);
          }
        });
      }
    });
    
    return [...new Set(categories)];
  }

  private isSecurityRule(rule: GatewayRule): boolean {
    const name = rule.name.toLowerCase();
    const filters = rule.filters.join(' ').toLowerCase();
    
    return name.includes('security') || 
           name.includes('malware') || 
           name.includes('phishing') || 
           name.includes('threat') ||
           filters.includes('security_category');
  }

  private inferServiceFromDomains(domains: string[]): string | null {
    const servicePatterns = {
      'Apple': ['apple.com', 'icloud.com', 'aaplimg.com'],
      'Microsoft': ['microsoft.com', 'office.com', 'outlook.com'],
      'Google': ['google.com', 'googleapis.com', 'gstatic.com'],
      'Amazon AWS': ['amazonaws.com', 'cloudfront.net'],
      'Tesla': ['tesla.com', 'teslamotors.com'],
      'AI Services': ['anthropic.com', 'openai.com', 'claude.ai'],
      'GitHub': ['github.com', 'githubusercontent.com'],
      'Slack': ['slack.com', 'slack-edge.com'],
      'Smart Home': ['aqara.com', 'nest.com', 'ui.com']
    };
    
    for (const [service, patterns] of Object.entries(servicePatterns)) {
      if (patterns.some(pattern => domains.some(domain => domain.includes(pattern)))) {
        return service;
      }
    }
    
    return null;
  }

  /**
   * Suggest a better, more descriptive rule name
   */
  private suggestBetterRuleName(rule: GatewayRule): string | null {
    const { filters, action } = rule;
    
    // Extract meaningful information from filters
    const domains = this.extractDomainsFromFilters(filters);
    
    // If we can identify a specific service, suggest a better name
    if (domains.length > 0) {
      const service = this.inferServiceFromDomains(domains);
      if (service) {
        const trafficType = filters.some(f => f.includes('dns.')) ? 'DNS' : 
                          filters.some(f => f.includes('http.')) ? 'HTTP' : 'NETWORK';
        const actionStr = action === 'allow' ? 'Allow' : action === 'block' ? 'Block' : 'Custom';
        return `${trafficType}: Productivity (${actionStr}) - ${service}: Core Services`;
      }
    }
    
    // Don't suggest a change if we can't improve it
    return null;
  }


  private displayOptimizationPlan(plan: OptimizationPlan): void {
    console.log(chalk.bold.cyan('\n📋 Optimization Plan:\n'));

    const totalChanges = 
      plan.rulesToUpdate.length + 
      plan.rulesToDelete.length + 
      plan.rulesToCreate.length + 
      plan.reorderingPlan.length;

    if (totalChanges === 0) {
      console.log(chalk.green('✨ Your ruleset is already well-optimized! No changes needed.'));
      return;
    }

    console.log(chalk.yellow(`Total changes to apply: ${totalChanges}`));

    // Updates
    if (plan.rulesToUpdate.length > 0) {
      console.log(chalk.yellow(`\n📝 Rules to Update (${plan.rulesToUpdate.length}):`));
      plan.rulesToUpdate.forEach(({ rule, updates, reason }) => {
        console.log(`\n   ${chalk.bold(rule.name)}`);
        console.log(`   Reason: ${chalk.gray(reason)}`);
        console.log(`   Changes:`);
        Object.entries(updates).forEach(([key, value]) => {
          console.log(`     - ${key}: ${JSON.stringify(value)}`);
        });
      });
    }

    // Deletions
    if (plan.rulesToDelete.length > 0) {
      console.log(chalk.red(`\n🗑️  Rules to Delete (${plan.rulesToDelete.length}):`));
      plan.rulesToDelete.forEach(({ rule, reason }) => {
        console.log(`\n   ${chalk.bold(rule.name)}`);
        console.log(`   Reason: ${chalk.gray(reason)}`);
      });
    }

    // Creations
    if (plan.rulesToCreate.length > 0) {
      console.log(chalk.green(`\n➕ Rules to Create (${plan.rulesToCreate.length}):`));
      plan.rulesToCreate.forEach(({ rule, reason }) => {
        console.log(`\n   ${chalk.bold(rule.name)}`);
        console.log(`   Reason: ${chalk.gray(reason)}`);
      });
    }

    // Reordering
    if (plan.reorderingPlan.length > 0) {
      console.log(chalk.blue(`\n🔄 Rules to Reorder (${plan.reorderingPlan.length}):`));
      plan.reorderingPlan.forEach(({ ruleName, currentPrecedence, newPrecedence }) => {
        const direction = newPrecedence < currentPrecedence ? '↑' : '↓';
        console.log(`   ${direction} ${ruleName}: ${currentPrecedence} → ${newPrecedence}`);
      });
    }
  }

  private async confirmExecution(_plan: OptimizationPlan): Promise<boolean> {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to apply these optimizations?',
        default: false
      }
    ]);
    return proceed;
  }

  private async executeOptimizationPlan(
    plan: OptimizationPlan, 
    interactive: boolean
  ): Promise<void> {
    const spinner = ora('Applying optimizations...').start();
    let successCount = 0;
    let errorCount = 0;

    try {
      // Apply deletions first
      for (const { rule, reason } of plan.rulesToDelete) {
        if (interactive) {
          spinner.stop();
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete rule "${rule.name}"? (${reason})`,
              default: true
            }
          ]);
          if (!confirm) continue;
          spinner.start();
        }

        try {
          spinner.text = `Deleting rule: ${rule.name}`;
          await this.gateway.deleteGatewayRule(rule.id);
          successCount++;
        } catch (error) {
          console.error(chalk.red(`\nFailed to delete ${rule.name}:`, error));
          errorCount++;
        }
      }

      // Apply updates
      for (const { rule, updates, reason } of plan.rulesToUpdate) {
        if (interactive) {
          spinner.stop();
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Update rule "${rule.name}"? (${reason})`,
              default: true
            }
          ]);
          if (!confirm) continue;
          spinner.start();
        }

        try {
          spinner.text = `Updating rule: ${rule.name}`;
          // Ensure we include the rule ID and preserve the action if not being updated
          const updatePayload = {
            id: rule.id,
            action: updates.action || rule.action,  // Preserve action if not being updated
            ...updates
          };
          await this.gateway.updateGatewayRule(updatePayload);
          successCount++;
        } catch (error) {
          console.error(chalk.red(`\nFailed to update ${rule.name}:`, error));
          errorCount++;
        }
      }

      // Apply reordering with intelligent conflict resolution
      if (plan.reorderingPlan.length > 0) {
        if (interactive) {
          spinner.stop();
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Reorder ${plan.reorderingPlan.length} rules?`,
              default: true
            }
          ]);
          if (!confirm) {
            spinner.start();
          } else {
            spinner.start();
            const { reorderSuccess, reorderErrors } = await this.applyIntelligentReordering(
              plan.reorderingPlan,
              spinner
            );
            successCount += reorderSuccess;
            errorCount += reorderErrors;
          }
        } else {
          const { reorderSuccess, reorderErrors } = await this.applyIntelligentReordering(
            plan.reorderingPlan,
            spinner
          );
          successCount += reorderSuccess;
          errorCount += reorderErrors;
        }
      }

      spinner.succeed(`Optimization complete: ${successCount} succeeded, ${errorCount} failed`);

      if (successCount > 0) {
        console.log(chalk.green('\n✅ Rules have been optimized successfully!'));
        console.log(chalk.yellow('Run "rules list" to see the updated ruleset.'));
      }

    } catch (error) {
      spinner.fail('Optimization failed');
      throw error;
    }
  }

  /**
   * Intelligently reorder rules to avoid precedence conflicts
   * Uses a multi-phase approach to move rules without conflicts
   */
  private async applyIntelligentReordering(
    reorderingPlan: OptimizationPlan['reorderingPlan'],
    spinner: any // ora spinner instance
  ): Promise<{ reorderSuccess: number; reorderErrors: number }> {
    let reorderSuccess = 0;
    let reorderErrors = 0;

    // Get current rules to identify catch-all blocks and determine safe ranges
    const currentRules = await this.gateway.listGatewayRules();
    const catchAllRules = currentRules.filter(rule => 
      rule.name.toLowerCase().includes('catch') || 
      rule.name.toLowerCase().includes('block all') ||
      rule.name.toLowerCase().includes('default deny') ||
      (rule.action === 'block' && rule.filters.some(f => 
        f.includes('true') || f === '1=1' || f.includes('*')
      ))
    );
    
    // Find the minimum precedence of catch-all rules to stay safely before them
    const minCatchAllPrecedence = catchAllRules.length > 0 
      ? Math.min(...catchAllRules.map(r => r.precedence))
      : 100000; // Default high value if no catch-all found
    
    // CRITICAL: Filter out the catch-all rule to ensure it never moves
    const CATCH_ALL_RULE_ID = '0519eb6f-0e60-4713-8213-19da74e501f9';
    const filteredPlan = reorderingPlan.filter(item => {
      if (item.ruleId === CATCH_ALL_RULE_ID) {
        console.log(chalk.red(`\n🛡️ Protecting catch-all rule "${item.ruleName}" from reordering - it must remain last`));
        return false;
      }
      return true;
    });
    
    // Sort the reordering plan to process in a smart order
    const sortedPlan = this.sortReorderingPlan(filteredPlan);
    
    // Phase 1: Move rules to temporary LOW precedence values to maintain security
    // CRITICAL: Use low values (1-1000) to stay BEFORE catch-all rules
    spinner.text = 'Phase 1: Preparing precedence space (maintaining security)...';
    const tempMoves: Array<{ ruleId: string; ruleName: string; tempPrecedence: number; targetPrecedence: number }> = [];
    
    // Start from precedence 1 for temporary moves - ensures rules stay before catch-all
    const tempPrecedenceBase = 1;
    
    for (const [index, item] of sortedPlan.entries()) {
      const tempPrecedence = tempPrecedenceBase + (index * 10); // Space them out by 10
      
      // Safety check: ensure temp precedence is well before any catch-all rule
      if (tempPrecedence >= minCatchAllPrecedence - 1000) {
        console.error(chalk.red(`\n⚠️  Safety: Cannot move ${item.ruleName} - would bypass catch-all rules`));
        reorderErrors++;
        continue;
      }
      
      tempMoves.push({
        ruleId: item.ruleId,
        ruleName: item.ruleName,
        tempPrecedence,
        targetPrecedence: item.newPrecedence
      });
      
      try {
        spinner.text = `Phase 1: Safely moving ${item.ruleName} to temporary position ${tempPrecedence}...`;
        await this.gateway.updateRulePrecedence(item.ruleId, tempPrecedence);
      } catch (error) {
        // If we can't move to temp position, skip this rule
        console.error(chalk.yellow(`\nSkipping ${item.ruleName}: Could not move to temporary position`));
        reorderErrors++;
        // Remove from tempMoves since it failed
        tempMoves.pop();
      }
    }
    
    // Phase 2: Move rules from temporary positions to their final positions
    spinner.text = 'Phase 2: Moving rules to final positions...';
    
    // Sort by target precedence to avoid conflicts when moving to final positions
    tempMoves.sort((a, b) => a.targetPrecedence - b.targetPrecedence);
    
    for (const { ruleId, ruleName, targetPrecedence } of tempMoves) {
      try {
        spinner.text = `Phase 2: Moving ${ruleName} to final position ${targetPrecedence}...`;
        await this.gateway.updateRulePrecedence(ruleId, targetPrecedence);
        reorderSuccess++;
      } catch (error) {
        console.error(chalk.red(`\nFailed to move ${ruleName} to final position:`, error));
        reorderErrors++;
        // Try to recover by finding next available precedence
        try {
          const alternativePrecedence = await this.findNearestAvailablePrecedence(targetPrecedence);
          if (alternativePrecedence) {
            spinner.text = `Retrying ${ruleName} with alternative precedence ${alternativePrecedence}...`;
            await this.gateway.updateRulePrecedence(ruleId, alternativePrecedence);
            console.log(chalk.yellow(`\n⚠️  ${ruleName} placed at ${alternativePrecedence} instead of ${targetPrecedence}`));
            reorderSuccess++;
            reorderErrors--; // Correct the error count since we recovered
          }
        } catch (retryError) {
          // Could not recover, error count stays
        }
      }
    }
    
    return { reorderSuccess, reorderErrors };
  }

  /**
   * Sort reordering plan to minimize conflicts
   * Rules moving up (decreasing precedence) should be processed first
   * Rules moving down (increasing precedence) should be processed last
   */
  private sortReorderingPlan(
    reorderingPlan: OptimizationPlan['reorderingPlan']
  ): OptimizationPlan['reorderingPlan'] {
    return [...reorderingPlan].sort((a, b) => {
      const aDelta = a.newPrecedence - a.currentPrecedence;
      const bDelta = b.newPrecedence - b.currentPrecedence;
      
      // Process rules moving up first (negative delta)
      // Then process rules moving down (positive delta)
      if (aDelta < 0 && bDelta >= 0) return -1;
      if (aDelta >= 0 && bDelta < 0) return 1;
      
      // For rules moving in the same direction, process smaller moves first
      return Math.abs(aDelta) - Math.abs(bDelta);
    });
  }

  /**
   * Find the nearest available precedence value to the target
   */
  private async findNearestAvailablePrecedence(targetPrecedence: number): Promise<number | null> {
    try {
      const rules = await this.gateway.listGatewayRules();
      const usedPrecedences = new Set(rules.map(r => r.precedence));
      
      // Try values near the target precedence
      const maxAttempts = 100;
      for (let offset = 1; offset <= maxAttempts; offset++) {
        // Try higher precedence
        const higher = targetPrecedence + offset;
        if (!usedPrecedences.has(higher) && higher <= 150000) {
          return higher;
        }
        
        // Try lower precedence
        const lower = targetPrecedence - offset;
        if (!usedPrecedences.has(lower) && lower > 0) {
          return lower;
        }
      }
      
      // If no nearby precedence is available, find any available gap
      const sortedPrecedences = Array.from(usedPrecedences).sort((a, b) => a - b);
      for (let i = 0; i < sortedPrecedences.length - 1; i++) {
        if (sortedPrecedences[i + 1] - sortedPrecedences[i] > 1) {
          return sortedPrecedences[i] + 1;
        }
      }
      
      // Last resort: use max precedence + 1
      const maxPrecedence = Math.max(...sortedPrecedences);
      return maxPrecedence + 1;
      
    } catch (error) {
      console.error('Failed to find available precedence:', error);
      return null;
    }
  }
}