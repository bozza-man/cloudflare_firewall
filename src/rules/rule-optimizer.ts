import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { RuleAnalyzer } from './rule-analyzer.js';
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

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.analyzer = new RuleAnalyzer();
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
    if (localAnalysis.proposedOrder && Array.isArray(localAnalysis.proposedOrder)) {
      localAnalysis.proposedOrder.forEach((proposal: ProposedRuleOrder) => {
        if (proposal.rule && proposal.rule.id) {
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

    // Group redundant rules for potential deletion
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
        // Prefer to keep the more specific or earlier rule
        const shouldKeepCurrent = rule.precedence < relatedRule.precedence ||
          (rule.filters.length >= relatedRule.filters.length);
        
        if (!shouldKeepCurrent) {
          plan.rulesToDelete.push({
            rule,
            reason: `Redundant with "${relatedRule.name}" - ${issue.message}`
          });
          processedRules.add(rule.id);
        }
      }
    });

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
          await this.gateway.updateGatewayRule({
            id: rule.id,
            ...updates
          });
          successCount++;
        } catch (error) {
          console.error(chalk.red(`\nFailed to update ${rule.name}:`, error));
          errorCount++;
        }
      }

      // Apply reordering
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
          if (confirm) {
            spinner.start();
            for (const { ruleId, ruleName, newPrecedence } of plan.reorderingPlan) {
              try {
                spinner.text = `Reordering rule: ${ruleName}`;
                await this.gateway.updateRulePrecedence(ruleId, newPrecedence);
                successCount++;
              } catch (error) {
                console.error(chalk.red(`\nFailed to reorder ${ruleName}:`, error));
                errorCount++;
              }
            }
          }
        } else {
          for (const { ruleId, ruleName, newPrecedence } of plan.reorderingPlan) {
            try {
              spinner.text = `Reordering rule: ${ruleName}`;
              await this.gateway.updateRulePrecedence(ruleId, newPrecedence);
              successCount++;
            } catch (error) {
              console.error(chalk.red(`\nFailed to reorder ${ruleName}:`, error));
              errorCount++;
            }
          }
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
}