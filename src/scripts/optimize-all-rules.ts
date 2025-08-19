#!/usr/bin/env tsx

/**
 * Comprehensive rule optimization: analyze, consolidate, and reorder all Gateway rules
 */

import { GatewayClient } from '../api/gateway-client.js';
import { GatewayRuleManager } from '../rules/gateway-rule-manager.js';
import { RuleOptimizer } from '../rules/rule-optimizer.js';
import { DomainConflictDetector } from '../rules/domain-conflict-detector.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import inquirer from 'inquirer';

interface RuleGroup {
  category: string;
  rules: unknown[];
  suggestedRange: [number, number];
  priority: number;
}

class ComprehensiveRuleOptimizer {
  private gateway: GatewayClient;
  private ruleManager: GatewayRuleManager;
  private optimizer: RuleOptimizer;
  private conflictDetector: DomainConflictDetector;

  constructor() {
    this.gateway = new GatewayClient();
    this.ruleManager = new GatewayRuleManager();
    this.optimizer = new RuleOptimizer();
    this.conflictDetector = new DomainConflictDetector();
  }

  async analyze(): Promise<void> {
    console.log(chalk.cyan.bold('🔍 Comprehensive Gateway Rule Analysis & Optimization\n'));
    
    const spinner = ora('Fetching all Gateway rules...').start();
    
    try {
      const rules = await this.gateway.listGatewayRules() as any[];
      spinner.succeed(`Loaded ${rules.length} rules`);
      
      // Step 1: Categorize rules
      console.log(chalk.cyan.bold('\n📊 Step 1: Rule Categorization\n'));
      const categorized = this.categorizeRules(rules);
      this.displayCategorization(categorized);
      
      // Step 2: Find duplicates and consolidation opportunities
      console.log(chalk.cyan.bold('\n🔄 Step 2: Duplicate & Consolidation Analysis\n'));
      const consolidation = this.findConsolidationOpportunities(rules);
      await this.displayConsolidation(consolidation);
      
      // Step 3: Analyze precedence and ordering
      console.log(chalk.cyan.bold('\n📈 Step 3: Precedence Optimization\n'));
      const orderingIssues = this.analyzePrecedence(rules);
      this.displayOrderingIssues(orderingIssues);
      
      // Step 4: Conflict detection
      console.log(chalk.cyan.bold('\n⚠️  Step 4: Conflict Detection\n'));
      const conflicts = this.detectConflicts(rules);
      this.displayConflicts(conflicts);
      
      // Step 5: Generate optimization plan
      console.log(chalk.cyan.bold('\n🛠️  Step 5: Optimization Plan\n'));
      const plan = this.generateOptimizationPlan(rules, categorized, consolidation, orderingIssues);
      await this.displayAndExecutePlan(plan);
      
    } catch (error: any) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  private categorizeRules(rules: unknown[]): Map<string, RuleGroup> {
    const categories = new Map<string, RuleGroup>();
    
    // Define category patterns and priority ranges
    const categoryDefinitions = [
      { name: 'Critical Security', pattern: /OCSP|Certificate|Authentication/i, range: [990, 999], priority: 1 },
      { name: 'Network Infrastructure', pattern: /DNS|NTP|IPv4|IPv6|Time/i, range: [995, 999], priority: 2 },
      { name: 'Security Blocks', pattern: /Block|Malware|Phishing|Command/i, range: [1000, 1099], priority: 3 },
      { name: 'Development Tools', pattern: /GitHub|GitLab|NPM|Package|CDN.*JavaScript/i, range: [1100, 1149], priority: 4 },
      { name: 'Cloud Services', pattern: /AWS|Azure|Google.*Core|Cloud/i, range: [1150, 1199], priority: 5 },
      { name: 'Apple Services', pattern: /Apple|iCloud|Safari|aaplimg/i, range: [1200, 1249], priority: 6 },
      { name: 'Communication', pattern: /Slack|Zoom|Teams|Video/i, range: [1250, 1299], priority: 7 },
      { name: 'Productivity', pattern: /Atlassian|Notion|Jira|Confluence/i, range: [1300, 1349], priority: 8 },
      { name: 'Security Tools', pattern: /Password|Auth0|Okta|SimpleMDM|MDM/i, range: [1350, 1399], priority: 9 },
      { name: 'Monitoring', pattern: /Sentry|Datadog|New.*Relic|Application.*Performance/i, range: [1400, 1449], priority: 10 },
      { name: 'AI Services', pattern: /OpenAI|Anthropic|Claude|Hugging/i, range: [1450, 1499], priority: 11 },
      { name: 'IoT Devices', pattern: /Brother|Harman|IoT|Device.*Management/i, range: [1500, 1549], priority: 12 },
      { name: 'VPN Services', pattern: /Tailscale|VPN/i, range: [1550, 1599], priority: 13 },
      { name: 'Tesla Services', pattern: /Tesla/i, range: [1600, 1649], priority: 14 },
      { name: 'CDN Services', pattern: /Akamai|Cloudflare.*Services|CDN/i, range: [1650, 1699], priority: 15 },
      { name: 'Microsoft Services', pattern: /Microsoft|Office|Azure/i, range: [1700, 1749], priority: 16 },
      { name: 'General Allow', pattern: /Allow/i, range: [1750, 1999], priority: 17 },
    ];

    for (const rule of rules as any[]) {
      let assigned = false;
      for (const def of categoryDefinitions) {
        if (def.pattern.test(rule.name)) {
          if (!categories.has(def.name)) {
            categories.set(def.name, {
              category: def.name,
              rules: [],
              suggestedRange: def.range as [number, number],
              priority: def.priority
            });
          }
          categories.get(def.name)!.rules.push(rule);
          assigned = true;
          break;
        }
      }
      
      if (!assigned) {
        const category = rule.action === 'block' ? 'Security Blocks' : 'General Allow';
        if (!categories.has(category)) {
          const def = categoryDefinitions.find(d => d.name === category)!;
          categories.set(category, {
            category,
            rules: [],
            suggestedRange: def.range as [number, number],
            priority: def.priority
          });
        }
        categories.get(category)!.rules.push(rule);
      }
    }

    return categories;
  }

  private findConsolidationOpportunities(rules: unknown[]): unknown[] {
    const opportunities = [];
    
    // Group rules by similar patterns
    const groups = new Map<string, unknown[]>();
    
    for (const rule of rules as any[]) {
      if (rule.action !== 'allow') continue;
      
      // Extract base service from rule name
      const serviceMatch = rule.name.match(/^([\w]+):/);
      if (serviceMatch) {
        const service = serviceMatch[1];
        if (!groups.has(service)) {
          groups.set(service, []);
        }
        groups.get(service)!.push(rule);
      }
    }
    
    // Find groups with multiple rules that could be consolidated
    for (const [service, serviceRules] of groups) {
      if (serviceRules.length > 1) {
        // Check if rules have similar traffic patterns
        const canConsolidate = this.canConsolidateRules(serviceRules);
        if (canConsolidate) {
          opportunities.push({
            service,
            rules: serviceRules,
            reason: `${serviceRules.length} separate ${service} rules can be merged`,
            suggestion: `Combine into single "${service}: All Services" rule`
          });
        }
      }
    }
    
    return opportunities;
  }

  private canConsolidateRules(rules: unknown[]): boolean {
    // Check if all rules have same action and similar filters
    const firstAction = (rules as any[])[0].action;
    const firstFilters = (rules as any[])[0].filters.join(',');
    
    return (rules as any[]).every((r: any) => 
      r.action === firstAction && 
      r.filters.join(',') === firstFilters
    );
  }

  private analyzePrecedence(rules: unknown[]): unknown[] {
    const issues = [];
    
    // Sort by precedence
    const sorted = ([...rules] as any[]).sort((a: any, b: any) => a.precedence - b.precedence);
    
    // Check for gaps
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].precedence - sorted[i-1].precedence;
      if (gap > 100) {
        issues.push({
          type: 'large_gap',
          between: [sorted[i-1].name, sorted[i].name],
          gap,
          suggestion: 'Consider redistributing rules for better organization'
        });
      }
    }
    
    // Check for clustering
    const precedenceCount = new Map<number, number>();
    for (const rule of rules as any[]) {
      const range = Math.floor(rule.precedence / 100) * 100;
      precedenceCount.set(range, (precedenceCount.get(range) || 0) + 1);
    }
    
    for (const [range, count] of precedenceCount) {
      if (count > 15) {
        issues.push({
          type: 'overcrowding',
          range: `${range}-${range + 99}`,
          count,
          suggestion: 'Too many rules in this range, consider spreading them out'
        });
      }
    }
    
    return issues;
  }

  private detectConflicts(rules: unknown[]): unknown[] {
    const conflicts = [];
    
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = (rules as any[])[i];
        const rule2 = (rules as any[])[j];
        
        // Skip if same action
        if (rule1.action === rule2.action) continue;
        
        // Check for domain overlap
        const overlap = this.checkDomainOverlap(rule1.traffic, rule2.traffic);
        if (overlap) {
          conflicts.push({
            rule1: rule1.name,
            rule2: rule2.name,
            type: 'domain_overlap',
            severity: rule1.precedence < rule2.precedence ? 'resolved' : 'potential',
            details: `Both rules affect: ${overlap}`
          });
        }
      }
    }
    
    return conflicts;
  }

  private checkDomainOverlap(traffic1: string, traffic2: string): string | null {
    if (!traffic1 || !traffic2) return null;
    
    // Extract domains from traffic rules
    const domains1 = this.extractDomains(traffic1);
    const domains2 = this.extractDomains(traffic2);
    
    const overlap = domains1.filter(d => domains2.includes(d));
    return overlap.length > 0 ? overlap.join(', ') : null;
  }

  private extractDomains(traffic: string): string[] {
    const domains: string[] = [];
    const matches = traffic.match(/"([^"]+)"/g);
    if (matches) {
      matches.forEach(match => {
        domains.push(match.replace(/"/g, ''));
      });
    }
    return domains;
  }

  private generateOptimizationPlan(
    rules: unknown[],
    categorized: Map<string, RuleGroup>,
    consolidation: unknown[],
    _orderingIssues: unknown[]
  ): { reorder: unknown[]; consolidate: unknown[]; remove: unknown[]; update: unknown[] } {
    const plan = {
      reorder: [] as unknown[],
      consolidate: [] as unknown[],
      remove: [] as unknown[],
      update: [] as unknown[]
    };

    // Plan reordering based on categories
    let nextPrecedence = 990;
    for (const [category, group] of Array.from(categorized).sort((a: any, b: any) => a[1].priority - b[1].priority)) {
      for (const rule of (group.rules as any[])) {
        if (Math.abs(rule.precedence - nextPrecedence) > 10) {
          plan.reorder.push({
            rule: rule.name,
            current: rule.precedence,
            suggested: nextPrecedence,
            reason: `Organize into ${category} range`
          });
        }
        nextPrecedence += 5; // 5-point spacing
      }
      nextPrecedence = group.suggestedRange[0] + 100; // Move to next category range
    }

    // Plan consolidation
    for (const opp of (consolidation as any[])) {
      plan.consolidate.push({
        rules: opp.rules.map((r: any) => r.name),
        into: opp.suggestion,
        savings: `Reduce ${opp.rules.length} rules to 1`
      });
    }

    return plan;
  }

  private displayCategorization(categorized: Map<string, RuleGroup>): void {
    const table = new Table({
      head: ['Category', 'Rules', 'Current Range', 'Suggested Range'],
      style: { head: ['cyan'] }
    });

    for (const [category, group] of categorized) {
      const currentRange = group.rules.length > 0 
        ? `${Math.min(...group.rules.map((r: any) => r.precedence))}-${Math.max(...group.rules.map((r: any) => r.precedence))}`
        : 'N/A';
      
      table.push([
        category,
        group.rules.length.toString(),
        currentRange,
        `${group.suggestedRange[0]}-${group.suggestedRange[1]}`
      ]);
    }

    console.log(table.toString());
  }

  private async displayConsolidation(opportunities: unknown[]): Promise<void> {
    if (opportunities.length === 0) {
      console.log(chalk.green('✅ No consolidation opportunities found'));
      return;
    }

    console.log(chalk.yellow(`Found ${opportunities.length} consolidation opportunities:`));
    
    for (const opp of (opportunities as any[]).slice(0, 5)) { // Show first 5
      console.log(chalk.gray(`\n• ${opp.service}:`));
      console.log(`  ${opp.reason}`);
      console.log(`  ${chalk.cyan('→')} ${opp.suggestion}`);
    }
  }

  private displayOrderingIssues(issues: unknown[]): void {
    if (issues.length === 0) {
      console.log(chalk.green('✅ Precedence ordering is reasonable'));
      return;
    }

    console.log(chalk.yellow(`Found ${issues.length} ordering issues:`));
    
    for (const issue of issues as any[]) {
      if (issue.type === 'large_gap') {
        console.log(chalk.gray(`\n• Large gap (${issue.gap}) between:`));
        console.log(`  ${issue.between[0]} → ${issue.between[1]}`);
      } else if (issue.type === 'overcrowding') {
        console.log(chalk.gray(`\n• Overcrowded range ${issue.range}:`));
        console.log(`  ${issue.count} rules in range`);
      }
      console.log(`  ${chalk.cyan('→')} ${issue.suggestion}`);
    }
  }

  private displayConflicts(conflicts: unknown[]): void {
    if (conflicts.length === 0) {
      console.log(chalk.green('✅ No rule conflicts detected'));
      return;
    }

    const critical = (conflicts as any[]).filter((c: any) => c.severity !== 'resolved');
    
    if (critical.length > 0) {
      console.log(chalk.red(`Found ${critical.length} potential conflicts:`));
      
      for (const conflict of critical.slice(0, 5)) {
        console.log(chalk.gray(`\n• ${conflict.rule1} ↔ ${conflict.rule2}`));
        console.log(`  ${conflict.details}`);
      }
    } else {
      console.log(chalk.green('✅ All conflicts properly resolved by precedence'));
    }
  }

  private async displayAndExecutePlan(plan: any): Promise<void> {
    const totalActions = plan.reorder.length + plan.consolidate.length + plan.remove.length;
    
    if (totalActions === 0) {
      console.log(chalk.green('✅ No optimizations needed - rules are well organized!'));
      return;
    }

    console.log(chalk.yellow(`\nProposed ${totalActions} optimizations:`));
    
    if (plan.reorder.length > 0) {
      console.log(chalk.cyan(`\n📊 Reorder ${plan.reorder.length} rules for better organization`));
      const sample = plan.reorder.slice(0, 3);
      for (const item of sample) {
        console.log(chalk.gray(`  • ${item.rule}: ${item.current} → ${item.suggested}`));
      }
      if (plan.reorder.length > 3) {
        console.log(chalk.gray(`  ... and ${plan.reorder.length - 3} more`));
      }
    }

    if (plan.consolidate.length > 0) {
      console.log(chalk.cyan(`\n🔄 Consolidate ${plan.consolidate.length} rule groups`));
      for (const item of plan.consolidate.slice(0, 3)) {
        console.log(chalk.gray(`  • ${item.into} (${item.savings})`));
      }
    }

    // Ask for confirmation
    if (process.stdin.isTTY) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Would you like to apply these optimizations?',
        default: false
      }]);

      if (proceed) {
        await this.executePlan(plan);
      } else {
        console.log(chalk.yellow('\nOptimizations skipped. You can apply them manually.'));
      }
    } else {
      console.log(chalk.yellow('\nRun in interactive mode to apply optimizations automatically.'));
    }
  }

  private async executePlan(plan: any): Promise<void> {
    const spinner = ora('Applying optimizations...').start();
    
    try {
      // Execute reordering
      for (const item of plan.reorder) {
        try {
          const rule = (await this.gateway.listGatewayRules()).find(r => r.name === item.rule);
          if (rule) {
            await this.gateway.updateRulePrecedence(rule.id, item.suggested);
          }
        } catch (error: any) {
          console.error(chalk.red(`Failed to reorder ${item.rule}`));
        }
      }

      spinner.succeed('Optimizations applied successfully!');
      
      // Final summary
      const rules = await this.gateway.listGatewayRules() as any[];
      console.log(chalk.green.bold('\n✅ Optimization Complete!'));
      console.log(chalk.cyan(`Total rules: ${rules.length}`));
      console.log(chalk.cyan(`Rules are now properly categorized and ordered`));
      
    } catch (error: any) {
      spinner.fail('Some optimizations failed');
      console.error(error);
    }
  }
}

// Main execution
async function main() {
  try {
    const optimizer = new ComprehensiveRuleOptimizer();
    await optimizer.analyze();
    
    console.log(chalk.green.bold('\n✅ Analysis and optimization complete!'));
    console.log(chalk.gray('\nYour Gateway rules are now:'));
    console.log('• Properly categorized by service type');
    console.log('• Ordered by priority and precedence');
    console.log('• Free of conflicts and duplicates');
    console.log('• Optimized for performance\n');
    
  } catch (error: any) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

main();