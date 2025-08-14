import { GatewayRule } from '../types/gateway.js';
import chalk from 'chalk';

export interface RuleIssue {
  ruleId: string;
  ruleName: string;
  type: 'error' | 'warning' | 'info';
  category: 'conflict' | 'performance' | 'security' | 'redundancy' | 'ordering' | 'best-practice';
  message: string;
  suggestion?: string;
  relatedRules?: string[];
}

export interface RuleAnalysis {
  totalRules: number;
  byTrafficType: Record<string, number>;
  byAction: Record<string, number>;
  enabledRules: number;
  disabledRules: number;
  issues: RuleIssue[];
  optimizationSuggestions: string[];
  proposedOrder: Array<{
    rule: GatewayRule;
    suggestedPrecedence: number;
    reason: string;
  }>;
}

export class RuleAnalyzer {
  
  analyzeRules(rules: GatewayRule[]): RuleAnalysis {
    const analysis: RuleAnalysis = {
      totalRules: rules.length,
      byTrafficType: {},
      byAction: {},
      enabledRules: 0,
      disabledRules: 0,
      issues: [],
      optimizationSuggestions: [],
      proposedOrder: []
    };

    // Basic statistics
    rules.forEach(rule => {
      // Traffic type stats
      analysis.byTrafficType[rule.traffic] = (analysis.byTrafficType[rule.traffic] || 0) + 1;
      
      // Action stats
      analysis.byAction[rule.action] = (analysis.byAction[rule.action] || 0) + 1;
      
      // Enabled/disabled stats
      if (rule.enabled) {
        analysis.enabledRules++;
      } else {
        analysis.disabledRules++;
      }
    });

    // Analyze for issues
    this.checkForConflicts(rules, analysis);
    this.checkForRedundancy(rules, analysis);
    this.checkForPerformanceIssues(rules, analysis);
    this.checkForSecurityIssues(rules, analysis);
    this.checkForOrderingIssues(rules, analysis);
    this.checkForBestPractices(rules, analysis);

    // Generate optimization suggestions
    this.generateOptimizationSuggestions(rules, analysis);

    // Propose optimal rule order
    this.proposeOptimalOrder(rules, analysis);

    return analysis;
  }

  private checkForConflicts(rules: GatewayRule[], analysis: RuleAnalysis): void {
    const enabledRules = rules.filter(r => r.enabled);
    
    for (let i = 0; i < enabledRules.length; i++) {
      for (let j = i + 1; j < enabledRules.length; j++) {
        const rule1 = enabledRules[i];
        const rule2 = enabledRules[j];

        // Check for filter overlap with contradictory actions
        if (this.hasFilterOverlap(rule1, rule2) && this.hasContradictoryActions(rule1, rule2)) {
          analysis.issues.push({
            ruleId: rule1.id,
            ruleName: rule1.name,
            type: 'error',
            category: 'conflict',
            message: `Conflicting actions with rule "${rule2.name}"`,
            suggestion: `Review precedence order or consolidate rules`,
            relatedRules: [rule2.id]
          });
        }
      }
    }
  }

  private checkForRedundancy(rules: GatewayRule[], analysis: RuleAnalysis): void {
    const enabledRules = rules.filter(r => r.enabled);
    
    for (let i = 0; i < enabledRules.length; i++) {
      for (let j = i + 1; j < enabledRules.length; j++) {
        const rule1 = enabledRules[i];
        const rule2 = enabledRules[j];

        // Only check rules with the same action and traffic type
        if (rule1.action === rule2.action && rule1.traffic === rule2.traffic) {
          // Check for near-identical rules (exact domains/patterns)
          if (this.areRulesNearlyIdentical(rule1, rule2)) {
            analysis.issues.push({
              ruleId: rule2.id,
              ruleName: rule2.name,
              type: 'warning',
              category: 'redundancy',
              message: `Rule appears redundant with "${rule1.name}"`,
              suggestion: `Consider removing this rule or merging with the other`,
              relatedRules: [rule1.id]
            });
          }
          // Check for genuine subset relationships
          else if (this.isGenuineSubset(rule1, rule2)) {
            analysis.issues.push({
              ruleId: rule2.id,
              ruleName: rule2.name,
              type: 'warning',
              category: 'redundancy',
              message: `Rule may be covered by broader rule "${rule1.name}"`,
              suggestion: `Verify if this specific rule is still needed`,
              relatedRules: [rule1.id]
            });
          }
        }
      }
    }
  }

  private checkForPerformanceIssues(rules: GatewayRule[], analysis: RuleAnalysis): void {
    rules.forEach(rule => {
      // Check for overly complex filters
      if (rule.filters.length > 10) {
        analysis.issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: 'warning',
          category: 'performance',
          message: `Rule has ${rule.filters.length} filters which may impact performance`,
          suggestion: `Consider splitting into multiple rules or using lists`
        });
      }

      // Check for inefficient regex patterns
      rule.filters.forEach(filter => {
        if (filter.includes('.*') && !filter.includes('\\')) {
          analysis.issues.push({
            ruleId: rule.id,
            ruleName: rule.name,
            type: 'info',
            category: 'performance',
            message: `Filter contains wildcard pattern that may be inefficient`,
            suggestion: `Consider using more specific patterns or lists`
          });
        }
      });
    });
  }

  private checkForSecurityIssues(rules: GatewayRule[], analysis: RuleAnalysis): void {
    const allowRules = rules.filter(r => r.action === 'allow' && r.enabled);
    const blockRules = rules.filter(r => (r.action === 'block' || r.action === 'isolate') && r.enabled);

    // Check for overly broad allow rules
    allowRules.forEach(rule => {
      if (this.isOverlyBroad(rule)) {
        analysis.issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: 'warning',
          category: 'security',
          message: `Allow rule may be too permissive`,
          suggestion: `Consider adding more specific conditions or using bypass for exceptions`
        });
      }
    });

    // Check for missing security categories
    const hasSecurityCategories = blockRules.some(rule => 
      rule.filters.some(f => f.includes('security_categories'))
    );

    if (!hasSecurityCategories) {
      analysis.optimizationSuggestions.push(
        'Consider adding rules to block security threat categories (malware, phishing, etc.)'
      );
    }
  }

  private checkForOrderingIssues(rules: GatewayRule[], analysis: RuleAnalysis): void {
    const sortedRules = [...rules].sort((a, b) => a.precedence - b.precedence);
    
    for (let i = 0; i < sortedRules.length - 1; i++) {
      const currentRule = sortedRules[i];
      const nextRule = sortedRules[i + 1];

      // Check if more specific rule comes after general rule
      if (this.isMoreSpecific(nextRule, currentRule) && 
          this.hasFilterOverlap(currentRule, nextRule)) {
        analysis.issues.push({
          ruleId: nextRule.id,
          ruleName: nextRule.name,
          type: 'warning',
          category: 'ordering',
          message: `More specific rule comes after general rule "${currentRule.name}"`,
          suggestion: `Move this rule before the general rule`,
          relatedRules: [currentRule.id]
        });
      }
    }
  }

  private checkForBestPractices(rules: GatewayRule[], analysis: RuleAnalysis): void {
    // Check for rules without descriptions
    rules.forEach(rule => {
      if (!rule.description || rule.description.trim() === '') {
        analysis.issues.push({
          ruleId: rule.id,
          ruleName: rule.name,
          type: 'info',
          category: 'best-practice',
          message: `Rule lacks a description`,
          suggestion: `Add a description to explain the rule's purpose`
        });
      }
    });

    // Check for consistent naming conventions
    const namingPatterns = this.analyzeNamingPatterns(rules);
    if (namingPatterns.inconsistent) {
      analysis.optimizationSuggestions.push(
        'Consider adopting a consistent naming convention for rules (e.g., "[Action] - [Target] - [Purpose]")'
      );
    }

    // Check for disabled rules that might be forgotten
    const disabledRules = rules.filter(r => !r.enabled);
    if (disabledRules.length > rules.length * 0.3) {
      analysis.optimizationSuggestions.push(
        `You have ${disabledRules.length} disabled rules. Consider removing unused rules to maintain clarity`
      );
    }
  }

  private generateOptimizationSuggestions(rules: GatewayRule[], analysis: RuleAnalysis): void {
    // Suggest consolidation opportunities
    const similarRules = this.findSimilarRules(rules);
    if (similarRules.length > 0) {
      analysis.optimizationSuggestions.push(
        `Found ${similarRules.length} groups of similar rules that could be consolidated`
      );
    }

    // Suggest using lists for repeated domains/IPs
    const repeatedValues = this.findRepeatedFilterValues(rules);
    if (repeatedValues.length > 0) {
      analysis.optimizationSuggestions.push(
        'Consider creating Gateway Lists for frequently used domains/IPs to simplify rule management'
      );
    }

    // Suggest category-based rules
    if (analysis.byTrafficType['dns'] > 10) {
      analysis.optimizationSuggestions.push(
        'Consider using content/security categories instead of individual domain rules where applicable'
      );
    }
  }

  private proposeOptimalOrder(rules: GatewayRule[], analysis: RuleAnalysis): void {
    const enabledRules = rules.filter(r => r.enabled);
    
    // Sort rules by optimal precedence
    const sortedRules = [...enabledRules].sort((a, b) => {
      // 1. Security blocks first
      if (this.isSecurityRule(a) && !this.isSecurityRule(b)) return -1;
      if (!this.isSecurityRule(a) && this.isSecurityRule(b)) return 1;

      // 2. More specific rules before general rules
      const specificityDiff = this.getSpecificity(b) - this.getSpecificity(a);
      if (specificityDiff !== 0) return specificityDiff;

      // 3. Block/isolate before allow
      const actionPriority: Record<string, number> = {
        'isolate': 1,
        'block': 2,
        'do_not_inspect': 3,
        'do_not_isolate': 4,
        'allow': 5,
        'inspect': 6
      };
      
      const actionDiff = (actionPriority[a.action] || 99) - (actionPriority[b.action] || 99);
      if (actionDiff !== 0) return actionDiff;

      // 4. Keep current order for ties
      return a.precedence - b.precedence;
    });

    // Generate proposed order with explanations
    sortedRules.forEach((rule, index) => {
      const newPrecedence = (index + 1) * 1000;
      if (Math.abs(rule.precedence - newPrecedence) > 500) {
        analysis.proposedOrder.push({
          rule,
          suggestedPrecedence: newPrecedence,
          reason: this.getReorderingReason(rule, index, sortedRules)
        });
      }
    });
  }

  // Helper methods
  private hasFilterOverlap(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // Simplified overlap detection - in reality this would be more complex
    return rule1.traffic === rule2.traffic && 
           rule1.filters.some(f1 => rule2.filters.some(f2 => 
             this.filtersOverlap(f1, f2)
           ));
  }

  private filtersOverlap(filter1: string, filter2: string): boolean {
    // Check for common patterns
    if (filter1 === filter2) return true;
    
    // Check for domain overlap
    if (filter1.includes('dns.domain') && filter2.includes('dns.domain')) {
      return true; // Simplified - would need actual domain comparison
    }
    
    // Check for IP overlap
    if (filter1.includes('net.dst.ip') && filter2.includes('net.dst.ip')) {
      return true; // Simplified - would need actual IP range comparison
    }
    
    return false;
  }

  private hasContradictoryActions(rule1: GatewayRule, rule2: GatewayRule): boolean {
    const contradictory = [
      ['allow', 'block'],
      ['allow', 'isolate'],
      ['do_not_isolate', 'isolate'],
      ['do_not_inspect', 'inspect']
    ];
    
    return contradictory.some(([a, b]) => 
      (rule1.action === a && rule2.action === b) ||
      (rule1.action === b && rule2.action === a)
    );
  }

  private areRulesNearlyIdentical(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // Check if rules target the same specific entities (domains, IPs, etc.)
    const rule1Domains = this.extractDomains(rule1);
    const rule2Domains = this.extractDomains(rule2);
    
    // If both rules have specific domains, check for significant overlap
    if (rule1Domains.length > 0 && rule2Domains.length > 0) {
      const commonDomains = rule1Domains.filter(d => rule2Domains.includes(d));
      return commonDomains.length > 0 && 
             (commonDomains.length / Math.min(rule1Domains.length, rule2Domains.length)) > 0.7;
    }
    
    // Check for nearly identical filter patterns
    return rule1.filters.length === rule2.filters.length &&
           rule1.filters.every(f1 => rule2.filters.some(f2 => f1 === f2));
  }

  private isGenuineSubset(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // Only consider it a subset if rule2 is truly covered by rule1's broader scope
    const rule1Domains = this.extractDomains(rule1);
    const rule2Domains = this.extractDomains(rule2);
    
    // If rule1 has broader patterns and rule2 has specific domains that match
    if (rule1.filters.some(f => f.includes('matches') || f.includes('.*')) &&
        rule2Domains.length > 0) {
      return rule2Domains.some(domain => 
        rule1.filters.some(f => this.domainMatchesPattern(domain, f))
      );
    }
    
    return false;
  }

  private extractDomains(rule: GatewayRule): string[] {
    const domains: string[] = [];
    
    rule.filters.forEach(filter => {
      // Extract domains from dns.fqdn == "domain.com" patterns
      const exactMatches = filter.match(/dns\.fqdn\s*==\s*"([^"]+)"/g);
      if (exactMatches) {
        exactMatches.forEach(match => {
          const domain = match.replace(/.*"([^"]+)".*/, '$1');
          domains.push(domain);
        });
      }
      
      // Extract domains from dns.fqdn in {"domain1.com" "domain2.com"} patterns
      const inMatches = filter.match(/dns\.fqdn\s+in\s+\{([^}]+)\}/g);
      if (inMatches) {
        inMatches.forEach(match => {
          const domainList = match.replace(/.*\{([^}]+)\}.*/, '$1');
          const domainArray = domainList.match(/"([^"]+)"/g);
          if (domainArray) {
            domainArray.forEach(quotedDomain => {
              domains.push(quotedDomain.replace(/"/g, ''));
            });
          }
        });
      }
    });
    
    return domains;
  }

  private domainMatchesPattern(domain: string, filterPattern: string): boolean {
    // Check if a specific domain would be matched by a pattern filter
    if (filterPattern.includes(`"${domain}"`)) return true;
    
    // Check regex patterns (simplified)
    if (filterPattern.includes('matches') && filterPattern.includes('.*')) {
      // Extract the pattern and do basic matching
      const pattern = filterPattern.match(/"([^"]+)"/)?.[1];
      if (pattern) {
        try {
          const regex = new RegExp(pattern.replace(/\\\\/g, '\\/'));
          return regex.test(domain);
        } catch {
          // Fallback to simple string matching
          return domain.includes(pattern.replace(/\.\*/, '').replace(/\$/, ''));
        }
      }
    }
    
    return false;
  }

  private isFilterSubset(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // Simplified subset detection
    return rule1.filters.every(f1 => 
      rule2.filters.some(f2 => f1 === f2 || this.filterContains(f2, f1))
    );
  }

  private filterContains(container: string, contained: string): boolean {
    // Very simplified - would need proper parsing
    return container.includes(contained);
  }

  private isOverlyBroad(rule: GatewayRule): boolean {
    // Empty filters are definitely too broad
    if (rule.filters.length === 0) return true;
    
    return rule.filters.some(filter => {
      // Very broad wildcard patterns without proper anchoring
      if (filter.includes('.*') && !filter.includes('\\') && !filter.includes('$')) {
        return true;
      }
      
      // Allow all traffic patterns
      if (filter === 'true' || filter.toLowerCase().includes('allow all') || filter === '*') {
        return true;
      }
      
      // Overly broad geo-blocking (blocking too many countries)
      if (filter.includes('net.src.geo.country') && this.countCountriesInFilter(filter) > 10) {
        return true;
      }
      
      // Very broad domain patterns without sufficient specificity
      if (filter.includes('dns.fqdn matches') && filter.includes('.*') && !filter.includes('\\')) {
        const dotsCount = (filter.match(/\./g) || []).length;
        if (dotsCount < 2) return true; // Too broad like '.*com$'
      }
      
      return false;
    });
  }

  private countCountriesInFilter(filter: string): number {
    const matches = filter.match(/"[A-Z]{2}"/g);
    return matches ? matches.length : 0;
  }

  private isMoreSpecific(rule1: GatewayRule, rule2: GatewayRule): boolean {
    return this.getSpecificity(rule1) > this.getSpecificity(rule2);
  }

  private getSpecificity(rule: GatewayRule): number {
    let score = 0;
    
    // More filters = more specific
    score += rule.filters.length * 10;
    
    // Specific values > categories > wildcards
    rule.filters.forEach(filter => {
      if (filter.includes('==') || filter.includes(' in ')) score += 5;
      if (filter.includes('categories')) score += 2;
      if (filter.includes('*') || filter.includes('any')) score -= 5;
    });
    
    return score;
  }

  private isSecurityRule(rule: GatewayRule): boolean {
    return rule.filters.some(f => 
      f.includes('security_categories') || 
      f.includes('threat') ||
      f.includes('malware') ||
      f.includes('phishing')
    ) || (rule.action === 'block' || rule.action === 'isolate');
  }

  private analyzeNamingPatterns(rules: GatewayRule[]): { inconsistent: boolean } {
    const patterns = rules.map(r => {
      if (r.name.includes(' - ')) return 'dash-separated';
      if (r.name.includes(':')) return 'colon-separated';
      if (r.name.includes('_')) return 'underscore';
      return 'other';
    });
    
    const uniquePatterns = new Set(patterns).size;
    return { inconsistent: uniquePatterns > 2 };
  }

  private findSimilarRules(rules: GatewayRule[]): Array<GatewayRule[]> {
    const groups: Array<GatewayRule[]> = [];
    const processed = new Set<string>();
    
    rules.forEach(rule => {
      if (processed.has(rule.id)) return;
      
      const similar = rules.filter(r => 
        r.id !== rule.id && 
        !processed.has(r.id) &&
        r.action === rule.action &&
        r.traffic === rule.traffic &&
        this.hasFilterOverlap(rule, r)
      );
      
      if (similar.length > 0) {
        const group = [rule, ...similar];
        groups.push(group);
        group.forEach(r => processed.add(r.id));
      }
    });
    
    return groups;
  }

  private findRepeatedFilterValues(rules: GatewayRule[]): string[] {
    const valueCount = new Map<string, number>();
    
    rules.forEach(rule => {
      rule.filters.forEach(filter => {
        // Extract domains and IPs
        const matches = filter.match(/"([^"]+)"/g);
        if (matches) {
          matches.forEach(match => {
            const value = match.replace(/"/g, '');
            valueCount.set(value, (valueCount.get(value) || 0) + 1);
          });
        }
      });
    });
    
    return Array.from(valueCount.entries())
      .filter(([_, count]) => count > 3)
      .map(([value, _]) => value);
  }

  private getReorderingReason(rule: GatewayRule, newIndex: number, allRules: GatewayRule[]): string {
    if (this.isSecurityRule(rule) && newIndex < 5) {
      return 'Security rules should be evaluated first';
    }
    
    if (rule.action === 'allow' && newIndex > allRules.length * 0.7) {
      return 'Allow rules should generally come after block rules';
    }
    
    const specificity = this.getSpecificity(rule);
    if (specificity > 50 && newIndex < allRules.length * 0.3) {
      return 'Highly specific rule should be evaluated early';
    }
    
    return 'Optimized position based on rule specificity and action';
  }

  displayAnalysis(analysis: RuleAnalysis): void {
    console.log(chalk.bold.cyan('\n📊 Gateway Rules Analysis Report\n'));
    
    // Statistics
    console.log(chalk.yellow('📈 Statistics:'));
    console.log(`   Total Rules: ${analysis.totalRules}`);
    console.log(`   Enabled: ${analysis.enabledRules} | Disabled: ${analysis.disabledRules}`);
    console.log('\n   By Traffic Type:');
    Object.entries(analysis.byTrafficType).forEach(([type, count]) => {
      console.log(`     ${type}: ${count}`);
    });
    console.log('\n   By Action:');
    Object.entries(analysis.byAction).forEach(([action, count]) => {
      console.log(`     ${action}: ${count}`);
    });
    
    // Issues
    if (analysis.issues.length > 0) {
      console.log(chalk.yellow('\n⚠️  Issues Found:'));
      
      const issuesByType = {
        error: analysis.issues.filter(i => i.type === 'error'),
        warning: analysis.issues.filter(i => i.type === 'warning'),
        info: analysis.issues.filter(i => i.type === 'info')
      };
      
      if (issuesByType.error.length > 0) {
        console.log(chalk.red(`\n   🔴 Errors (${issuesByType.error.length}):`));
        issuesByType.error.forEach(issue => this.displayIssue(issue));
      }
      
      if (issuesByType.warning.length > 0) {
        console.log(chalk.yellow(`\n   🟡 Warnings (${issuesByType.warning.length}):`));
        issuesByType.warning.forEach(issue => this.displayIssue(issue));
      }
      
      if (issuesByType.info.length > 0) {
        console.log(chalk.blue(`\n   🔵 Info (${issuesByType.info.length}):`));
        issuesByType.info.forEach(issue => this.displayIssue(issue));
      }
    } else {
      console.log(chalk.green('\n✅ No issues found!'));
    }
    
    // Optimization Suggestions
    if (analysis.optimizationSuggestions.length > 0) {
      console.log(chalk.yellow('\n💡 Optimization Suggestions:'));
      analysis.optimizationSuggestions.forEach((suggestion, index) => {
        console.log(`   ${index + 1}. ${suggestion}`);
      });
    }
    
    // Proposed Reordering
    if (analysis.proposedOrder.length > 0) {
      console.log(chalk.yellow('\n🔄 Proposed Rule Reordering:'));
      console.log(chalk.gray('   (Only showing rules that need significant position changes)'));
      
      analysis.proposedOrder.forEach(({ rule, suggestedPrecedence, reason }) => {
        const change = suggestedPrecedence - rule.precedence;
        const direction = change < 0 ? '↑' : '↓';
        console.log(`\n   ${direction} ${chalk.bold(rule.name)}`);
        console.log(`      Current precedence: ${rule.precedence} → Suggested: ${suggestedPrecedence}`);
        console.log(`      Reason: ${chalk.gray(reason)}`);
      });
    }
    
    console.log('\n');
  }

  private displayIssue(issue: RuleIssue): void {
    console.log(`\n      ${chalk.bold(issue.ruleName)}`);
    console.log(`      ${issue.message}`);
    if (issue.suggestion) {
      console.log(`      ${chalk.green('→')} ${issue.suggestion}`);
    }
    if (issue.relatedRules && issue.relatedRules.length > 0) {
      console.log(`      ${chalk.gray('Related rules:')} ${issue.relatedRules.join(', ')}`);
    }
  }
}