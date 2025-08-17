import { SecureGatewayRuleManager } from './secure-gateway-rule-manager.js';
import { SecurityScanner, SecurityValidationResult, SecurityScanOptions } from '../security/security-scanner.js';
import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, GatewayList } from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';

export interface DomainPlacementSuggestion {
  domain: string;
  securityResult: SecurityValidationResult;
  placementOptions: PlacementOption[];
  recommendedPlacement: PlacementOption;
  userDecision?: 'approve' | 'reject' | 'pending';
}

export interface PlacementOption {
  type: 'existing_rule' | 'existing_list' | 'new_rule' | 'new_list';
  target: {
    id?: string;
    name: string;
    description: string;
  };
  confidence: number;
  reasoning: string;
  category: string;
  estimatedImpact: 'low' | 'medium' | 'high';
}

export interface PlacementReport {
  totalDomains: number;
  approved: DomainPlacementSuggestion[];
  rejected: DomainPlacementSuggestion[];
  pending: DomainPlacementSuggestion[];
  actionsPerformed: {
    rulesCreated: number;
    rulesUpdated: number;
    listsCreated: number;
    listsUpdated: number;
    domainsRejected: number;
  };
  summary: string[];
}

export class IntelligentDomainPlacement {
  private ruleManager: SecureGatewayRuleManager;
  private securityScanner: SecurityScanner;
  private gateway: GatewayClient;

  // Domain classification patterns
  private domainCategories = {
    apple: {
      patterns: [/apple\.com/, /icloud\.com/, /aaplimg\.com/, /itunes/, /cdn-apple/, /akadns\.net.*apple/],
      listName: 'Apple Services',
      category: 'Infrastructure & Core Services',
      priority: 'critical'
    },
    google: {
      patterns: [/google/, /googleapis/, /googleusercontent/, /gstatic/, /gmail/],
      listName: 'Google Services', 
      category: 'Infrastructure & Core Services',
      priority: 'critical'
    },
    microsoft: {
      patterns: [/microsoft/, /office/, /outlook/, /live\.com/, /msft/, /azure/],
      listName: 'Microsoft Services',
      category: 'Infrastructure & Core Services', 
      priority: 'critical'
    },
    social: {
      patterns: [/facebook/, /instagram/, /twitter/, /linkedin/, /tiktok/, /snapchat/, /grindr/],
      listName: 'Social Media Sites',
      category: 'Social & Entertainment',
      priority: 'low'
    },
    cdn: {
      patterns: [/cdn/, /cloudfront/, /fastly/, /akamai/, /jsdelivr/],
      listName: 'Content Delivery Networks',
      category: 'Infrastructure & Core Services',
      priority: 'important'
    },
    iot: {
      patterns: [/mqtt/, /\.iot\./, /creality/, /xiaomi/, /smart/],
      listName: 'IoT and Smart Devices',
      category: 'IoT & Hardware',
      priority: 'normal'
    },
    development: {
      patterns: [/github/, /gitlab/, /npm/, /docker/, /kubernetes/, /aws/],
      listName: 'Development Tools Domains',
      category: 'Development & Tools',
      priority: 'critical'
    },
    analytics: {
      patterns: [/analytics/, /metrics/, /tracking/, /stats/, /telemetry/],
      listName: 'Analytics and Tracking',
      category: 'Analytics & Monitoring',
      priority: 'normal'
    }
  };

  constructor() {
    this.ruleManager = new SecureGatewayRuleManager();
    this.securityScanner = new SecurityScanner();
    this.gateway = new GatewayClient();
  }

  /**
   * Main method: Intelligently process and place multiple domains
   */
  async processDomainsIntelligently(
    domains: string[],
    options: {
      allowSecurityWarnings?: boolean;
      interactiveApproval?: boolean;
      securityOptions?: Partial<SecurityScanOptions>;
    } = {}
  ): Promise<PlacementReport> {
    console.log(chalk.cyan.bold(`🧠 Intelligent Domain Placement for ${domains.length} domains\n`));
    
    const spinner = ora('Analyzing domains and determining optimal placement...').start();
    
    try {
      // Step 1: Security scan all domains
      spinner.text = '🛡️  Performing comprehensive security scan...';
      const securityResults = await this.performSecurityScan(domains, options.securityOptions);
      
      // Step 2: Analyze existing Gateway configuration
      spinner.text = '📊 Analyzing existing Gateway Lists and Rules...';
      const existingConfig = await this.analyzeExistingConfiguration();
      
      // Step 3: Generate placement suggestions for each domain
      spinner.text = '🎯 Generating intelligent placement suggestions...';
      const suggestions = await this.generatePlacementSuggestions(domains, securityResults, existingConfig);
      
      spinner.succeed('Analysis complete - ready for user decisions');
      
      // Step 4: Handle security approvals and user decisions
      const processedSuggestions = await this.handleUserDecisions(suggestions, options);
      
      // Step 5: Execute approved placements
      const report = await this.executePlacements(processedSuggestions);
      
      // Step 6: Display final report
      this.displayPlacementReport(report);
      
      return report;
      
    } catch (error) {
      spinner.fail('Domain placement analysis failed');
      throw error;
    }
  }

  /**
   * Perform security scanning on all domains
   */
  private async performSecurityScan(
    domains: string[],
    securityOptions?: Partial<SecurityScanOptions>
  ): Promise<Map<string, SecurityValidationResult>> {
    const results = new Map<string, SecurityValidationResult>();
    
    console.log(chalk.blue(`🔍 Security scanning ${domains.length} domains...`));
    
    for (const domain of domains) {
      try {
        const result = await this.securityScanner.validateItem(domain, securityOptions);
        results.set(domain, result);
        
        // Brief pause to avoid overwhelming the API
        await this.delay(200);
        
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to scan ${domain}: ${error}`));
        // Add a basic "unknown" result
        results.set(domain, {
          item: domain,
          type: 'domain',
          passed: false,
          riskLevel: 'medium',
          action: 'review',
          reasons: ['Security scan failed'],
          recommendations: ['Manual review required']
        });
      }
    }
    
    return results;
  }

  /**
   * Analyze existing Gateway configuration to understand placement options
   */
  private async analyzeExistingConfiguration(): Promise<{
    rules: GatewayRule[];
    lists: GatewayList[];
    rulesByCategory: Map<string, GatewayRule[]>;
    listsByCategory: Map<string, GatewayList[]>;
  }> {
    const rules = await this.ruleManager.listRules();
    const lists = await this.ruleManager.listLists();
    
    // Categorize existing rules and lists
    const rulesByCategory = new Map<string, GatewayRule[]>();
    const listsByCategory = new Map<string, GatewayList[]>();
    
    // Categorize rules
    for (const rule of rules) {
      const category = this.categorizeExistingRule(rule);
      if (!rulesByCategory.has(category)) {
        rulesByCategory.set(category, []);
      }
      rulesByCategory.get(category)!.push(rule);
    }
    
    // Categorize lists
    for (const list of lists) {
      const category = this.categorizeExistingList(list);
      if (!listsByCategory.has(category)) {
        listsByCategory.set(category, []);
      }
      listsByCategory.get(category)!.push(list);
    }
    
    return { rules, lists, rulesByCategory, listsByCategory };
  }

  /**
   * Generate intelligent placement suggestions for each domain
   */
  private async generatePlacementSuggestions(
    domains: string[],
    securityResults: Map<string, SecurityValidationResult>,
    existingConfig: any
  ): Promise<DomainPlacementSuggestion[]> {
    const suggestions: DomainPlacementSuggestion[] = [];
    
    for (const domain of domains) {
      const securityResult = securityResults.get(domain)!;
      const category = this.categorizeDomain(domain);
      
      // Generate placement options
      const placementOptions = this.generatePlacementOptions(domain, category, existingConfig);
      
      // Determine recommended placement
      const recommendedPlacement = this.selectRecommendedPlacement(placementOptions, securityResult);
      
      suggestions.push({
        domain,
        securityResult,
        placementOptions,
        recommendedPlacement,
        userDecision: 'pending'
      });
    }
    
    return suggestions;
  }

  /**
   * Handle user decisions for security warnings and placement approvals
   */
  private async handleUserDecisions(
    suggestions: DomainPlacementSuggestion[],
    options: any
  ): Promise<DomainPlacementSuggestion[]> {
    console.log(chalk.cyan.bold('\n🎯 Domain Placement Recommendations\n'));
    
    for (const suggestion of suggestions) {
      // Display domain info
      console.log(chalk.blue(`📡 Domain: ${suggestion.domain}`));
      
      // Display security status
      const secResult = suggestion.securityResult;
      const statusIcon = secResult.action === 'allow' ? '✅' : 
                        secResult.action === 'block' ? '❌' : '⚠️ ';
      const riskColor = secResult.riskLevel === 'low' ? chalk.blue :
                       secResult.riskLevel === 'medium' ? chalk.yellow :
                       secResult.riskLevel === 'high' ? chalk.red : chalk.red;
      
      console.log(`   Security: ${statusIcon} ${riskColor(secResult.riskLevel.toUpperCase())} risk - ${secResult.action.toUpperCase()}`);
      
      if (secResult.reasons.length > 0) {
        console.log(chalk.gray(`   Reasons: ${secResult.reasons[0]}`));
      }
      
      if (secResult.threatIntelligence?.threats && secResult.threatIntelligence.threats.length > 0) {
        const threats = secResult.threatIntelligence.threats.slice(0, 2);
        console.log(chalk.red(`   Threats: ${threats.map(t => t.type).join(', ')}`));
      }
      
      // Display recommended placement
      const rec = suggestion.recommendedPlacement;
      console.log(`   Recommended: ${chalk.cyan(rec.type.toUpperCase())} → ${chalk.white(rec.target.name)}`);
      console.log(chalk.gray(`   Reasoning: ${rec.reasoning}`));
      
      // Handle security decisions
      if (secResult.action === 'block' || (secResult.action === 'review' && secResult.riskLevel === 'high')) {
        console.log(chalk.red('\n🚨 Security Warning: This domain has security concerns'));
        
        if (options.interactiveApproval !== false && process.stdin.isTTY) {
          const { default: inquirer } = await import('inquirer');
          const { decision } = await inquirer.prompt([{
            type: 'list',
            name: 'decision',
            message: `What would you like to do with ${suggestion.domain}?`,
            choices: [
              { name: '✅ Approve and allow (override security warning)', value: 'approve' },
              { name: '❌ Reject and skip this domain', value: 'reject' },
              { name: '📋 Show more security details', value: 'details' }
            ]
          }]);
          
          if (decision === 'details') {
            this.displayDetailedSecurityInfo(secResult);
            
            const { finalDecision } = await inquirer.prompt([{
              type: 'list', 
              name: 'finalDecision',
              message: `Final decision for ${suggestion.domain}:`,
              choices: [
                { name: '✅ Approve despite warnings', value: 'approve' },
                { name: '❌ Reject this domain', value: 'reject' }
              ]
            }]);
            
            suggestion.userDecision = finalDecision;
          } else {
            suggestion.userDecision = decision;
          }
        } else {
          // Non-interactive mode - use default behavior
          suggestion.userDecision = options.allowSecurityWarnings ? 'approve' : 'reject';
        }
      } else {
        // Low risk domains are auto-approved
        suggestion.userDecision = 'approve';
      }
      
      // Handle placement approval for approved domains
      if (suggestion.userDecision === 'approve') {
        if (options.interactiveApproval !== false && process.stdin.isTTY && suggestion.placementOptions.length > 1) {
          const { default: inquirer } = await import('inquirer');
          const { placementChoice } = await inquirer.prompt([{
            type: 'list',
            name: 'placementChoice',
            message: `Where should we place ${suggestion.domain}?`,
            choices: [
              { 
                name: `✨ ${suggestion.recommendedPlacement.target.name} (${suggestion.recommendedPlacement.type}) - RECOMMENDED`, 
                value: 0 
              },
              ...suggestion.placementOptions.slice(1).map((option, idx) => ({
                name: `${option.target.name} (${option.type}) - ${Math.round(option.confidence * 100)}% match`,
                value: idx + 1
              })),
              { name: '📝 Show all options with details', value: 'details' }
            ]
          }]);
          
          if (placementChoice === 'details') {
            this.displayPlacementOptions(suggestion.placementOptions);
            // Could add another prompt here for final selection
          } else {
            suggestion.recommendedPlacement = suggestion.placementOptions[placementChoice];
          }
        }
      }
      
      console.log(); // Add spacing between domains
    }
    
    return suggestions;
  }

  /**
   * Execute the approved domain placements
   */
  private async executePlacements(suggestions: DomainPlacementSuggestion[]): Promise<PlacementReport> {
    const report: PlacementReport = {
      totalDomains: suggestions.length,
      approved: suggestions.filter(s => s.userDecision === 'approve'),
      rejected: suggestions.filter(s => s.userDecision === 'reject'),
      pending: suggestions.filter(s => s.userDecision === 'pending'),
      actionsPerformed: {
        rulesCreated: 0,
        rulesUpdated: 0,
        listsCreated: 0,
        listsUpdated: 0,
        domainsRejected: suggestions.filter(s => s.userDecision === 'reject').length
      },
      summary: []
    };
    
    const spinner = ora('Executing domain placements...').start();
    
    try {
      // Group approved domains by their placement targets
      const placementGroups = this.groupByPlacement(report.approved);
      
      for (const [placementKey, domains] of placementGroups) {
        const placement = domains[0].recommendedPlacement;
        const domainList = domains.map(d => d.domain);
        
        spinner.text = `${placement.type === 'existing_list' ? '📋' : '⚡'} ${placement.target.name}...`;
        
        try {
          switch (placement.type) {
            case 'existing_rule':
              await this.addDomainsToExistingRule(placement.target.id!, domainList);
              report.actionsPerformed.rulesUpdated++;
              report.summary.push(`Updated rule "${placement.target.name}" with ${domainList.length} domains`);
              break;
              
            case 'existing_list':
              await this.addDomainsToExistingList(placement.target.id!, domainList);
              report.actionsPerformed.listsUpdated++;
              report.summary.push(`Updated list "${placement.target.name}" with ${domainList.length} domains`);
              break;
              
            case 'new_rule':
              await this.createNewRuleWithDomains(placement.target.name, domainList, placement);
              report.actionsPerformed.rulesCreated++;
              report.summary.push(`Created new rule "${placement.target.name}" with ${domainList.length} domains`);
              break;
              
            case 'new_list':
              await this.createNewListWithDomains(placement.target.name, domainList, placement);
              report.actionsPerformed.listsCreated++;
              report.summary.push(`Created new list "${placement.target.name}" with ${domainList.length} domains`);
              break;
          }
          
        } catch (error) {
          console.error(chalk.red(`❌ Failed to execute placement for ${placement.target.name}:`), error);
          report.summary.push(`❌ Failed: ${placement.target.name} - ${error}`);
        }
      }
      
      spinner.succeed('Domain placements executed successfully');
      
    } catch (error) {
      spinner.fail('Failed to execute domain placements');
      throw error;
    }
    
    return report;
  }

  // Helper methods for domain categorization and placement
  private categorizeDomain(domain: string): { category: string; confidence: number; listName: string } {
    for (const [key, config] of Object.entries(this.domainCategories)) {
      for (const pattern of config.patterns) {
        if (pattern.test(domain)) {
          return {
            category: config.category,
            confidence: 0.9,
            listName: config.listName
          };
        }
      }
    }
    
    // Default categorization
    return {
      category: 'General',
      confidence: 0.3,
      listName: 'Miscellaneous Domains'
    };
  }

  private generatePlacementOptions(
    domain: string, 
    category: any, 
    existingConfig: any
  ): PlacementOption[] {
    const options: PlacementOption[] = [];
    
    // Look for existing lists that match the category
    const matchingLists = existingConfig.lists.filter((list: GatewayList) =>
      list.name.toLowerCase().includes(category.listName.toLowerCase()) ||
      this.isListCategoryMatch(list, category)
    );
    
    for (const list of matchingLists) {
      options.push({
        type: 'existing_list',
        target: { id: list.id, name: list.name, description: `Add to existing ${list.type} list` },
        confidence: 0.8,
        reasoning: `Matches existing "${list.name}" list category`,
        category: category.category,
        estimatedImpact: 'low'
      });
    }
    
    // Look for existing rules that could accommodate this domain
    const matchingRules = existingConfig.rules.filter((rule: GatewayRule) =>
      rule.action === 'allow' && this.isRuleCategoryMatch(rule, category)
    );
    
    for (const rule of matchingRules.slice(0, 2)) { // Limit to top 2 matches
      options.push({
        type: 'existing_rule',
        target: { id: rule.id, name: rule.name, description: `Add to existing allow rule` },
        confidence: 0.7,
        reasoning: `Could be added to existing "${rule.name}" rule`,
        category: category.category,
        estimatedImpact: 'medium'
      });
    }
    
    // Option to create new list for this category
    if (!matchingLists.length) {
      options.push({
        type: 'new_list',
        target: { name: category.listName, description: `Create new list for ${category.category}` },
        confidence: 0.6,
        reasoning: `No existing list found - create new "${category.listName}" list`,
        category: category.category,
        estimatedImpact: 'medium'
      });
    }
    
    // Option to create new rule
    options.push({
      type: 'new_rule',
      target: { name: `Allow ${category.listName}`, description: `Create new rule for ${category.category}` },
      confidence: 0.5,
      reasoning: `Create dedicated rule for this domain category`,
      category: category.category,
      estimatedImpact: 'high'
    });
    
    return options.sort((a, b) => b.confidence - a.confidence);
  }

  private selectRecommendedPlacement(
    options: PlacementOption[], 
    securityResult: SecurityValidationResult
  ): PlacementOption {
    // For high-risk domains, prefer existing lists over new rules
    if (securityResult.riskLevel === 'high' || securityResult.action === 'review') {
      const listOption = options.find(o => o.type === 'existing_list');
      if (listOption) return listOption;
    }
    
    // Default to highest confidence option
    return options[0];
  }

  // Utility methods
  private categorizeExistingRule(rule: GatewayRule): string {
    const name = rule.name.toLowerCase();
    if (name.includes('apple') || name.includes('icloud')) return 'Apple Services';
    if (name.includes('google') || name.includes('gmail')) return 'Google Services';
    if (name.includes('microsoft') || name.includes('office')) return 'Microsoft Services';
    if (name.includes('social') || name.includes('facebook')) return 'Social Media';
    if (name.includes('dev') || name.includes('github')) return 'Development';
    return 'General';
  }

  private categorizeExistingList(list: GatewayList): string {
    return this.categorizeExistingRule({ name: list.name } as GatewayRule);
  }

  private isListCategoryMatch(list: GatewayList, category: any): boolean {
    const listName = list.name.toLowerCase();
    const categoryName = category.category.toLowerCase();
    
    return listName.includes(categoryName) || 
           categoryName.includes(listName) ||
           listName.includes(category.listName.toLowerCase());
  }

  private isRuleCategoryMatch(rule: GatewayRule, category: any): boolean {
    return this.isListCategoryMatch({ name: rule.name } as GatewayList, category);
  }

  private groupByPlacement(approved: DomainPlacementSuggestion[]): Map<string, DomainPlacementSuggestion[]> {
    const groups = new Map<string, DomainPlacementSuggestion[]>();
    
    for (const suggestion of approved) {
      const key = `${suggestion.recommendedPlacement.type}:${suggestion.recommendedPlacement.target.name}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(suggestion);
    }
    
    return groups;
  }

  private displayDetailedSecurityInfo(secResult: SecurityValidationResult): void {
    console.log(chalk.cyan('\n🔍 Detailed Security Information:'));
    console.log(`   Domain: ${secResult.item}`);
    console.log(`   Risk Level: ${secResult.riskLevel}`);
    console.log(`   Recommended Action: ${secResult.action}`);
    
    if (secResult.reasons.length > 0) {
      console.log('   Reasons:');
      secResult.reasons.forEach(reason => {
        console.log(chalk.gray(`   • ${reason}`));
      });
    }
    
    if (secResult.threatIntelligence?.threats) {
      console.log('   Threats Detected:');
      secResult.threatIntelligence.threats.forEach(threat => {
        console.log(chalk.red(`   • ${threat.severity.toUpperCase()}: ${threat.type} - ${threat.description}`));
      });
    }
  }

  private displayPlacementOptions(options: PlacementOption[]): void {
    console.log(chalk.cyan('\n🎯 Placement Options:'));
    options.forEach((option, idx) => {
      console.log(`   ${idx + 1}. ${option.target.name} (${option.type})`);
      console.log(chalk.gray(`      ${option.reasoning} - ${Math.round(option.confidence * 100)}% confidence`));
    });
  }

  private displayPlacementReport(report: PlacementReport): void {
    console.log(chalk.cyan.bold('\n📊 Domain Placement Report\n'));
    
    console.log(chalk.blue('Summary:'));
    console.log(`   Total Domains: ${report.totalDomains}`);
    console.log(`   ${chalk.green(`✅ Approved: ${report.approved.length}`)}`);
    console.log(`   ${chalk.red(`❌ Rejected: ${report.rejected.length}`)}`);
    console.log(`   ${chalk.yellow(`⏳ Pending: ${report.pending.length}`)}`);
    
    console.log(chalk.blue('\nActions Performed:'));
    console.log(`   Rules Created: ${report.actionsPerformed.rulesCreated}`);
    console.log(`   Rules Updated: ${report.actionsPerformed.rulesUpdated}`);
    console.log(`   Lists Created: ${report.actionsPerformed.listsCreated}`);
    console.log(`   Lists Updated: ${report.actionsPerformed.listsUpdated}`);
    
    if (report.summary.length > 0) {
      console.log(chalk.cyan('\n💡 Summary:'));
      report.summary.forEach(item => {
        console.log(`   • ${item}`);
      });
    }
  }

  // Placeholder methods for actual Gateway operations
  private async addDomainsToExistingRule(ruleId: string, domains: string[]): Promise<void> {
    // Implementation would update the existing rule with new domains
    console.log(`Adding ${domains.length} domains to rule ${ruleId}`);
  }

  private async addDomainsToExistingList(listId: string, domains: string[]): Promise<void> {
    // Implementation would add domains to the existing list
    console.log(`Adding ${domains.length} domains to list ${listId}`);
  }

  private async createNewRuleWithDomains(ruleName: string, domains: string[], placement: PlacementOption): Promise<void> {
    // Implementation would create a new rule with the domains
    console.log(`Creating new rule "${ruleName}" with ${domains.length} domains`);
  }

  private async createNewListWithDomains(listName: string, domains: string[], placement: PlacementOption): Promise<void> {
    // Implementation would create a new list with the domains
    console.log(`Creating new list "${listName}" with ${domains.length} domains`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
