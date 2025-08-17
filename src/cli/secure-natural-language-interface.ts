#!/usr/bin/env node

import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { SecureGatewayRuleManager } from '../rules/secure-gateway-rule-manager.js';
import { SmartDomainCategorizer } from '../scripts/smart-domain-categorizer.js';
import { SecurityScanner, SecurityScanOptions } from '../security/security-scanner.js';
import { IntelligentDomainPlacement } from '../rules/intelligent-domain-placement.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

interface Command {
  type: 'categorize' | 'create_rule' | 'intelligent_placement' | 'manage_lists' | 'analyze' | 'security_scan' | 'validate_domain' | 'security_config' | 'help' | 'unknown';
  intent: string;
  parameters: {
    domains?: string[];
    action?: 'allow' | 'block';
    ruleName?: string;
    listName?: string;
    precedence?: number;
    dryRun?: boolean;
    useAI?: boolean;
    scanType?: 'rules' | 'lists' | 'both';
    securityOptions?: Partial<SecurityScanOptions>;
  };
  confidence: number;
}

export class SecureNaturalLanguageInterface {
  private gateway: GatewayClient;
  private ai: GatewayAIAssistant;
  private ruleManager: SecureGatewayRuleManager;
  private categorizer: SmartDomainCategorizer;
  private securityScanner: SecurityScanner;
  private intelligentPlacement: IntelligentDomainPlacement;

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.ruleManager = new SecureGatewayRuleManager();
    this.categorizer = new SmartDomainCategorizer();
    this.securityScanner = new SecurityScanner();
    this.intelligentPlacement = new IntelligentDomainPlacement();
  }

  /**
   * Main entry point for natural language processing with security integration
   */
  async processNaturalLanguage(input: string): Promise<void> {
    const spinner = ora('🤖 Understanding your request...').start();
    
    try {
      // Parse the natural language command
      const command = await this.parseCommand(input);
      
      spinner.succeed(`Understood: ${command.intent}`);
      
      if (command.confidence < 0.6) {
        console.log(chalk.yellow('⚠️  I\'m not entirely sure what you want to do. Here\'s my best guess:'));
        console.log(chalk.gray(`   Interpreted as: ${command.intent}`));
        console.log(chalk.gray('   If this isn\'t right, try rephrasing your request.\n'));
      }

      // Execute the command
      await this.executeCommand(command);
      
    } catch (error) {
      spinner.fail('Failed to process your request');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      
      // Provide helpful suggestions
      console.log(chalk.cyan('\n💡 Try these example commands:'));
      this.showExamples();
    }
  }

  /**
   * Parse natural language into structured command with security context
   */
  private async parseCommand(input: string): Promise<Command> {
    const inputLower = input.toLowerCase();
    
    // Extract domains from the input
    const domains = this.extractDomainsFromText(input);
    
    // Check for security-related commands first
    if (this.matchesSecurityScan(inputLower)) {
      const scanType = inputLower.includes('rule') ? 'rules' : 
                      inputLower.includes('list') ? 'lists' : 'both';
      return {
        type: 'security_scan',
        intent: `Run security scan on Gateway ${scanType}`,
        parameters: {
          scanType,
          domains
        },
        confidence: 0.9
      };
    }
    
    if (this.matchesDomainValidation(inputLower)) {
      return {
        type: 'validate_domain',
        intent: domains.length > 0 
          ? `Validate security for ${domains.length} domains`
          : 'Validate domain security',
        parameters: {
          domains
        },
        confidence: 0.8
      };
    }
    
    if (this.matchesSecurityConfig(inputLower)) {
      return {
        type: 'security_config',
        intent: 'Configure security scanning options',
        parameters: {},
        confidence: 0.8
      };
    }
    
    // Standard command matching with enhanced security awareness
    if (this.matchesCategorization(inputLower)) {
      return {
        type: 'categorize',
        intent: domains.length > 0 
          ? `Categorize ${domains.length} domains into Gateway Lists with security validation`
          : 'Set up domain categorization with security validation',
        parameters: {
          domains,
          dryRun: inputLower.includes('preview') || inputLower.includes('dry run') || inputLower.includes('test'),
          useAI: inputLower.includes('ai') || inputLower.includes('smart') || inputLower.includes('analyze')
        },
        confidence: domains.length > 0 ? 0.9 : 0.7
      };
    }
    
    if (this.matchesRuleCreation(inputLower)) {
      const action = inputLower.includes('allow') || inputLower.includes('permit') ? 'allow' : 'block';
      
      // Check if this is a request for intelligent placement
      const isIntelligentPlacement = domains.length > 1 || 
        inputLower.includes('intelligent') || 
        inputLower.includes('smart') ||
        inputLower.includes('appropriate') ||
        inputLower.includes('best') ||
        inputLower.includes('categorize');
      
      return {
        type: isIntelligentPlacement ? 'intelligent_placement' : 'create_rule',
        intent: domains.length > 0 
          ? `${isIntelligentPlacement ? 'Intelligently place and ' : ''}${action.charAt(0).toUpperCase() + action.slice(1)} access to ${domains.join(', ')} with security validation`
          : `Create ${action} rule with security validation`,
        parameters: {
          domains,
          action,
          ruleName: this.extractRuleName(input),
          dryRun: inputLower.includes('preview') || inputLower.includes('dry run'),
          useAI: true // Always use AI for rule creation
        },
        confidence: 0.8
      };
    }
    
    if (this.matchesListManagement(inputLower)) {
      return {
        type: 'manage_lists',
        intent: 'Manage Gateway Lists with security insights',
        parameters: {
          listName: this.extractListName(input),
          domains
        },
        confidence: 0.7
      };
    }
    
    if (this.matchesAnalysis(inputLower)) {
      return {
        type: 'analyze',
        intent: 'Analyze current Gateway configuration with security assessment',
        parameters: {},
        confidence: 0.8
      };
    }
    
    if (inputLower.includes('help') || inputLower.includes('?')) {
      return {
        type: 'help',
        intent: 'Show help information with security features',
        parameters: {},
        confidence: 1.0
      };
    }
    
    // Fall back to AI interpretation for complex queries
    try {
      const aiInterpretation = await this.ai.generateRuleFilters(input);
      
      if (aiInterpretation.filters.length > 0) {
        const action = input.toLowerCase().includes('allow') ? 'allow' : 'block';
        return {
          type: 'create_rule',
          intent: `Create rule with security validation: ${aiInterpretation.explanation}`,
          parameters: {
            action,
            useAI: true,
            ruleName: this.extractRuleName(input) || `AI Generated: ${aiInterpretation.explanation}`
          },
          confidence: 0.6
        };
      }
    } catch (error) {
      // AI interpretation failed, continue with unknown
    }
    
    return {
      type: 'unknown',
      intent: 'Unknown command - see help for examples',
      parameters: {},
      confidence: 0.0
    };
  }

  /**
   * Execute the parsed command with security integration
   */
  private async executeCommand(command: Command): Promise<void> {
    switch (command.type) {
      case 'categorize':
        await this.executeCategorization(command);
        break;
        
      case 'create_rule':
        await this.executeRuleCreation(command);
        break;
        
      case 'intelligent_placement':
        await this.executeIntelligentPlacement(command);
        break;
        
      case 'manage_lists':
        await this.executeListManagement(command);
        break;
        
      case 'analyze':
        await this.executeAnalysis(command);
        break;
        
      case 'security_scan':
        await this.executeSecurityScan(command);
        break;
        
      case 'validate_domain':
        await this.executeDomainValidation(command);
        break;
        
      case 'security_config':
        await this.executeSecurityConfig(command);
        break;
        
      case 'help':
        this.showHelp();
        break;
        
      default:
        console.log(chalk.red('❓ I don\'t understand that command.'));
        this.showExamples();
    }
  }

  /**
   * Execute domain categorization with security validation
   */
  private async executeCategorization(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🎯 Domain Categorization with Security Validation\n'));
    
    let domains = command.parameters.domains || [];
    
    // If no domains provided directly, check for file or ask for input
    if (domains.length === 0) {
      console.log(chalk.yellow('No domains found in your request.'));
      console.log('You can provide domains in several ways:');
      console.log('  • List them directly: "categorize github.com, slack.com, netflix.com"');
      console.log('  • From a file: "categorize domains from my-domains.txt"');
      console.log('  • Interactive input: Just type the domains when prompted\n');
      
      // Try to get domains interactively
      domains = await this.getDomainsInteractively();
    }
    
    if (domains.length === 0) {
      console.log(chalk.red('No domains provided. Cancelling categorization.'));
      return;
    }
    
    console.log(chalk.green(`📋 Found ${domains.length} domains to categorize and validate`));
    
    // First, run security validation on all domains
    console.log(chalk.cyan('🛡️  Running security pre-validation...'));
    const securityResults = await this.securityScanner.bulkValidate(domains, {
      enableThreatIntelligence: true,
      rateLimitMs: 500, // Faster for bulk operations
      outputFile: `security-scan-${Date.now()}.json`
    });
    
    // Show security summary before categorization
    const blockedDomains = securityResults.results.filter(r => r.action === 'block');
    const reviewDomains = securityResults.results.filter(r => r.action === 'review');
    
    if (blockedDomains.length > 0) {
      console.log(chalk.red(`\n🚨 ${blockedDomains.length} domains flagged as high-risk:`));
      blockedDomains.slice(0, 5).forEach(result => {
        console.log(chalk.red(`   ❌ ${result.item}: ${result.reasons[0]}`));
      });
      if (blockedDomains.length > 5) {
        console.log(chalk.gray(`   ... and ${blockedDomains.length - 5} more`));
      }
    }
    
    if (reviewDomains.length > 0) {
      console.log(chalk.yellow(`\n⚠️  ${reviewDomains.length} domains require review:`));
      reviewDomains.slice(0, 3).forEach(result => {
        console.log(chalk.yellow(`   ⚠️  ${result.item}: ${result.reasons[0]}`));
      });
      if (reviewDomains.length > 3) {
        console.log(chalk.gray(`   ... and ${reviewDomains.length - 3} more`));
      }
    }
    
    // Now proceed with categorization
    const assignments = await this.categorizer.categorizeDomains(domains, {
      useAI: command.parameters.useAI || false,
      dryRun: command.parameters.dryRun || false,
      outputFile: `categorization-${Date.now()}.json`
    });
    
    // Show next steps
    if (!command.parameters.dryRun) {
      console.log(chalk.cyan.bold('\n🚀 Next Steps:'));
      console.log('• Your domains are now organized in Gateway Lists');
      console.log('• Security validation results have been saved');
      console.log('• Review flagged domains before creating rules');
      console.log('• Try: "create rule to allow all development tools"');
      console.log('• Or: "scan my gateway for security issues"');
    }
  }

  /**
   * Execute rule creation with integrated security scanning
   */
  private async executeRuleCreation(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n⚡ Secure Rule Creation\n'));
    
    const domains = command.parameters.domains || [];
    const action = command.parameters.action || 'block';
    
    if (domains.length > 0) {
      // Create rule for specific domains with security validation
      console.log(chalk.green(`Creating ${action} rule for ${domains.length} domains with security validation...`));
      
      const ruleName = command.parameters.ruleName || 
        `${action.charAt(0).toUpperCase() + action.slice(1)} ${domains.slice(0, 2).join(', ')}${domains.length > 2 ? ' and others' : ''}`;
      
      const rule = await this.ruleManager.createRule({
        name: ruleName,
        action,
        filters: domains.map(domain => `dns.fqdn == "${domain}"`),
        description: `Auto-created rule to ${action} access to specified domains with security validation`
      });
      
      console.log(chalk.green(`✅ Created secure rule: ${rule.name} (ID: ${rule.id})`));
      
    } else {
      // Let AI generate the rule from natural language with security validation
      console.log(chalk.blue('🤖 Using AI to create secure rule from your description...'));
      
      const rule = await this.ruleManager.createRuleFromDescription(command.intent);
      console.log(chalk.green(`✅ Created secure rule: ${rule.name} (ID: ${rule.id})`));
    }
  }

  /**
   * Execute Gateway Lists management with security insights
   */
  private async executeListManagement(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n📋 Gateway Lists Management with Security Insights\n'));
    
    const lists = await this.ruleManager.listLists();
    
    console.log(`📊 You have ${lists.length} Gateway Lists:`);
    lists.forEach(list => {
      const itemCount = list.count || 0;
      console.log(`   • ${list.name} (${itemCount} items) - ${list.type}`);
    });
    
    if (command.parameters.listName) {
      const targetList = lists.find(l => 
        l.name.toLowerCase().includes(command.parameters.listName!.toLowerCase())
      );
      
      if (targetList) {
        console.log(chalk.yellow(`\n🔍 Details for "${targetList.name}":`));
        console.log(`   Type: ${targetList.type}`);
        console.log(`   Items: ${targetList.count || 0}`);
        console.log(`   ID: ${targetList.id}`);
        
        // Offer security scan of this list
        if (targetList.type === 'DOMAIN' && (targetList.count || 0) > 0) {
          console.log(chalk.cyan('\n💡 Security Tip:'));
          console.log(`   Try: "scan list ${targetList.name} for security issues"`);
        }
      }
    }
    
    console.log(chalk.cyan('\n🛡️  Security Recommendations:'));
    console.log('• Run regular security scans on your lists');
    console.log('• Remove any flagged malicious domains');
    console.log('• Try: "scan my lists for security issues"');
  }

  /**
   * Execute analysis with security assessment
   */
  private async executeAnalysis(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🔍 Gateway Configuration Analysis with Security Assessment\n'));
    
    const spinner = ora('Analyzing your Gateway configuration and security posture...').start();
    
    try {
      // Get current state
      const rules = await this.ruleManager.listRules();
      const lists = await this.ruleManager.listLists();
      
      // Find optimization opportunities
      const optimizationCandidates = await this.ruleManager.findOptimizationCandidates();
      
      // Get security statistics
      const securityStats = await this.ruleManager.getSecurityStats();
      
      spinner.succeed('Analysis complete');
      
      // Summary
      console.log(chalk.blue('📊 Configuration Summary:'));
      console.log(`   Rules: ${rules.length}`);
      console.log(`   Gateway Lists: ${lists.length}`);
      console.log(`   Optimization opportunities: ${optimizationCandidates.length}`);
      
      // Show rule breakdown by action
      const allowRules = rules.filter(r => r.action === 'allow').length;
      const blockRules = rules.filter(r => r.action === 'block').length;
      
      console.log(chalk.green(`\n✅ Allow rules: ${allowRules}`));
      console.log(chalk.red(`🚫 Block rules: ${blockRules}`));
      
      // Show list breakdown by type
      const domainLists = lists.filter(l => l.type === 'DOMAIN').length;
      const ipLists = lists.filter(l => l.type === 'IP').length;
      
      console.log(chalk.blue(`\n📋 Domain Lists: ${domainLists}`));
      console.log(chalk.blue(`🔢 IP Lists: ${ipLists}`));
      
      // Security Configuration
      console.log(chalk.cyan('\n🛡️  Security Configuration:'));
      console.log(`   Threat Intelligence: ${securityStats.threatIntelligenceEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      console.log(`   Auto-block Malicious: ${securityStats.autoBlockEnabled ? '✅ Yes' : '❌ No'}`);
      console.log(`   Confidence Threshold: ${Math.round(securityStats.confidenceThreshold * 100)}%`);
      console.log(`   Allowed Risk Level: ${securityStats.allowedRiskLevel}`);
      
      // Optimization suggestions
      if (optimizationCandidates.length > 0) {
        console.log(chalk.yellow('\n💡 Optimization Opportunities:'));
        const totalSavings = optimizationCandidates.reduce((sum, c) => 
          sum + c.bestMatch.estimatedSavings, 0);
        console.log(`   • ${optimizationCandidates.length} rules can be optimized`);
        console.log(`   • Estimated savings: ${totalSavings} characters`);
        console.log('   • Try: "optimize my rules" to apply improvements');
      }
      
      // Security recommendations
      console.log(chalk.cyan('\n🔒 Security Recommendations:'));
      console.log('   • Try: "scan my gateway for security issues" for a security audit');
      console.log('   • Try: "validate domain suspicious-site.com" to check specific domains');
      console.log('   • Consider enabling auto-block for malicious domains');
      
    } catch (error) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  /**
   * Execute security scan command
   */
  private async executeSecurityScan(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🛡️  Comprehensive Gateway Security Scan\n'));
    
    const scanType = command.parameters.scanType || 'both';
    
    try {
      await this.ruleManager.runSecurityScan({
        scanType: scanType as 'rules' | 'lists' | 'both',
        securityOptions: command.parameters.securityOptions
      });
      
      console.log(chalk.cyan('\n💡 Security Recommendations:'));
      console.log('• Review any flagged domains or IPs immediately');
      console.log('• Update Gateway Lists to remove malicious entries');
      console.log('• Consider blocking high-risk domains automatically');
      console.log('• Run security scans regularly (weekly or monthly)');
      console.log('• Try: "validate domain example.com" to check individual domains');
      
    } catch (error) {
      console.error(chalk.red('❌ Security scan failed:'), error);
      throw error;
    }
  }

  /**
   * Execute domain validation command
   */
  private async executeDomainValidation(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🛡️  Domain Security Validation\n'));
    
    let domains = command.parameters.domains || [];
    
    // If no domains provided, ask for input
    if (domains.length === 0) {
      console.log(chalk.yellow('No domains found in your request.'));
      domains = await this.getDomainsInteractively();
    }
    
    if (domains.length === 0) {
      console.log(chalk.red('No domains provided. Cancelling validation.'));
      return;
    }
    
    console.log(chalk.green(`🔍 Validating ${domains.length} domains for security...`));
    
    try {
      const results = await this.ruleManager.bulkValidateDomains(domains);
      
      let allowedCount = 0;
      let blockedCount = 0;
      let reviewCount = 0;
      
      console.log(chalk.cyan('\n📊 Validation Results:'));
      
      for (const [domain, result] of results) {
        const statusIcon = result.action === 'allow' ? '✅' : 
                          result.action === 'block' ? '❌' : '⚠️ ';
        
        const riskColor = result.riskLevel === 'low' ? chalk.blue :
                         result.riskLevel === 'medium' ? chalk.yellow :
                         result.riskLevel === 'high' ? chalk.red : chalk.red;
        
        console.log(`${statusIcon} ${domain}: ${result.action.toUpperCase()} (${riskColor(result.riskLevel)} risk)`);
        
        if (result.reasons.length > 0) {
          console.log(chalk.gray(`   ${result.reasons[0]}`));
        }
        
        if (result.threatIntelligence?.threats && result.threatIntelligence.threats.length > 0) {
          const threats = result.threatIntelligence.threats.slice(0, 2);
          console.log(chalk.red(`   Threats: ${threats.map(t => t.type).join(', ')}`));
        }
        
        switch (result.action) {
          case 'allow': allowedCount++; break;
          case 'block': blockedCount++; break;
          case 'review': reviewCount++; break;
        }
      }
      
      console.log(chalk.cyan('\n📈 Summary:'));
      console.log(`   ${chalk.green(`✅ Safe to allow: ${allowedCount}`)}`);
      console.log(`   ${chalk.red(`❌ Should block: ${blockedCount}`)}`);
      console.log(`   ${chalk.yellow(`⚠️  Require review: ${reviewCount}`)}`);
      
      if (blockedCount > 0) {
        console.log(chalk.red('\n⚠️  Recommendation: Block the flagged domains in your Gateway rules'));
        console.log('   Try: "create rule to block [flagged domains]"');
      }
      
      if (reviewCount > 0) {
        console.log(chalk.yellow('\n💡 Manual review recommended for flagged domains'));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Domain validation failed:'), error);
      throw error;
    }
  }

  /**
   * Execute security configuration
   */
  private async executeSecurityConfig(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n⚙️  Security Configuration\n'));
    
    const currentOptions = this.ruleManager.getSecurityScanOptions();
    
    console.log(chalk.blue('Current Security Settings:'));
    console.log(`   Threat Intelligence: ${currentOptions.enableThreatIntelligence ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   Auto-block Malicious: ${currentOptions.autoBlockMalicious ? '✅ Yes' : '❌ No'}`);
    console.log(`   Manual Review Required: ${currentOptions.requireManualReview ? '✅ Yes' : '❌ No'}`);
    console.log(`   Confidence Threshold: ${Math.round(currentOptions.confidenceThreshold * 100)}%`);
    console.log(`   Allowed Risk Level: ${currentOptions.allowedRiskLevel}`);
    console.log(`   Rate Limit: ${currentOptions.rateLimitMs}ms`);
    
    console.log(chalk.cyan('\n💡 Configuration Options:'));
    console.log('• Threat intelligence provides reputation data from Cloudflare Radar');
    console.log('• Auto-block prevents malicious domains from being added to rules');
    console.log('• Manual review requires human approval for suspicious domains');
    console.log('• Confidence threshold determines minimum trust level (0-100%)');
    console.log('• Risk level sets maximum acceptable threat level (low/medium/high)');
    
    console.log(chalk.yellow('\n🔧 To modify settings, update your configuration file or contact support'));
  }

  /**
   * Execute intelligent domain placement
   */
  private async executeIntelligentPlacement(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🧠 Intelligent Domain Placement\n'));
    
    const domains = command.parameters.domains || [];
    
    if (domains.length === 0) {
      console.log(chalk.yellow('No domains found in your request.'));
      console.log('For intelligent placement, provide multiple domains like:');
      console.log('  "intelligently allow github.com, apple.com, facebook.com"');
      console.log('  "smart categorize and allow these domains: domain1.com, domain2.com"');
      return;
    }
    
    try {
      console.log(chalk.green(`🎯 Processing ${domains.length} domains with intelligent placement...`));
      
      const options = {
        allowSecurityWarnings: false, // Always require explicit approval for security warnings
        interactiveApproval: true,    // Always show placement options interactively
        securityOptions: {
          enableThreatIntelligence: true,
          confidenceThreshold: 0.7,
          rateLimitMs: 500 // Faster for better UX
        }
      };
      
      const report = await this.intelligentPlacement.processDomainsIntelligently(domains, options);
      
      console.log(chalk.cyan.bold('\n🎉 Intelligent Placement Complete!'));
      console.log(`✅ Successfully processed ${report.approved.length} domains`);
      
      if (report.rejected.length > 0) {
        console.log(`❌ Rejected ${report.rejected.length} domains due to security concerns`);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Intelligent placement failed:'), error);
      throw error;
    }
  }

  // Pattern matching methods for security commands
  private matchesSecurityScan(input: string): boolean {
    const patterns = [
      'security scan', 'scan security', 'scan for threats', 'threat scan',
      'security audit', 'audit security', 'check security', 'security check',
      'scan gateway', 'scan rules', 'scan lists', 'malware scan',
      'scan for malware', 'check for threats', 'security assessment'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  private matchesDomainValidation(input: string): boolean {
    const patterns = [
      'validate domain', 'check domain', 'domain security', 'is domain safe',
      'validate security', 'security validate', 'threat check', 'reputation check',
      'is safe', 'check if safe', 'verify domain', 'domain check'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  private matchesSecurityConfig(input: string): boolean {
    const patterns = [
      'security config', 'security settings', 'configure security',
      'security configuration', 'threat settings', 'security options'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  // Existing pattern matching methods
  private matchesCategorization(input: string): boolean {
    const patterns = [
      'categorize', 'organize', 'sort', 'group', 'classify',
      'put into lists', 'organize domains', 'sort domains',
      'create lists', 'manage domains'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  private matchesRuleCreation(input: string): boolean {
    const patterns = [
      'create rule', 'make rule', 'add rule', 'new rule',
      'block', 'allow', 'permit', 'deny', 'restrict',
      'create a rule', 'make a rule'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  private matchesListManagement(input: string): boolean {
    const patterns = [
      'list', 'lists', 'show lists', 'gateway lists',
      'manage lists', 'view lists', 'see lists'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  private matchesAnalysis(input: string): boolean {
    const patterns = [
      'analyze', 'analysis', 'summary', 'overview', 'status',
      'show me', 'what do i have', 'current', 'report'
    ];
    return patterns.some(pattern => input.includes(pattern));
  }

  // Utility methods (copied from original)
  private extractDomainsFromText(text: string): string[] {
    // Common domain pattern matching
    const domainPatterns = [
      // Standard domains: example.com
      /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi,
      // Quoted domains: "example.com"
      /"([a-z0-9-]+\.)+[a-z]{2,}"/gi,
      // File references: from file.txt, in domains.txt
      /(?:from|in)\s+([a-z0-9-_]+\.txt)/gi
    ];
    
    const domains: string[] = [];
    
    for (const pattern of domainPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        domains.push(...matches.map(match => 
          match.replace(/['"]/g, '').toLowerCase()
        ));
      }
    }
    
    // Remove duplicates and filter out invalid domains
    const uniqueDomains = [...new Set(domains)].filter(domain => 
      domain.includes('.') && 
      !domain.includes(' ') &&
      domain.length > 3
    );
    
    return uniqueDomains;
  }

  private async getDomainsInteractively(): Promise<string[]> {
    console.log(chalk.cyan('Enter domains (one per line, empty line to finish):'));
    
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const domains: string[] = [];
    
    return new Promise((resolve) => {
      const askForDomain = () => {
        rl.question(chalk.gray('> '), (domain) => {
          if (domain.trim() === '') {
            rl.close();
            resolve(domains);
          } else {
            const cleanDomain = domain.trim().toLowerCase();
            if (cleanDomain.includes('.')) {
              domains.push(cleanDomain);
              console.log(chalk.green(`  ✓ Added: ${cleanDomain}`));
            } else {
              console.log(chalk.yellow('  ⚠ Invalid domain format, skipped'));
            }
            askForDomain();
          }
        });
      };
      
      askForDomain();
    });
  }

  private extractRuleName(input: string): string | undefined {
    const patterns = [
      /(?:name|call|label)(?:\s+(?:it|this|the\s+rule))?\s+"([^"]+)"/i,
      /(?:name|call|label)(?:\s+(?:it|this|the\s+rule))?\s+([^,\n\.]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private extractListName(input: string): string | undefined {
    const patterns = [
      /"([^"]*list[^"]*)"/i,
      /list\s+(?:named\s+)?["']?([^"'\n,]+)["']?/i
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  private showHelp(): void {
    console.log(chalk.cyan.bold('\n🤖 Secure Natural Language Gateway Manager\n'));
    
    console.log(chalk.blue('I can help you manage your Cloudflare Gateway with security-integrated commands!\n'));
    
    this.showExamples();
    
    console.log(chalk.cyan('\n💡 Tips:'));
    console.log('• You can be conversational - I understand context');
    console.log('• Add "preview" or "dry run" to see what will happen first');
    console.log('• Use "smart" or "AI" for enhanced analysis');
    console.log('• All operations include automatic security validation');
    console.log('• Security scans use Cloudflare Radar threat intelligence\n');
  }

  private showExamples(): void {
    console.log(chalk.green('🎯 Domain Categorization:'));
    console.log('   "Categorize github.com, slack.com, netflix.com"');
    console.log('   "Organize domains from my-list.txt using AI"');
    console.log('   "Sort these domains into Gateway Lists"');
    
    console.log(chalk.red('\n🚫 Secure Rule Creation:'));
    console.log('   "Block facebook.com and instagram.com"');
    console.log('   "Allow all development tools"');
    console.log('   "Create rule to block social media"');
    console.log('   "Make a rule called \'Work Hours\' to allow only business sites"');
    
    console.log(chalk.blue('\n📋 List Management:'));
    console.log('   "Show me my Gateway Lists"');
    console.log('   "What\'s in my social media list?"');
    
    console.log(chalk.yellow('\n🔍 Analysis & Security:'));
    console.log('   "Analyze my current setup"');
    console.log('   "Show me a summary of my rules"');
    console.log('   "What can I optimize?"');
    
    console.log(chalk.red('\n🛡️  Security Scanning:'));
    console.log('   "Scan my gateway for security issues"');
    console.log('   "Run a security audit on my rules"');
    console.log('   "Check my lists for malware"');
    console.log('   "Validate domain example.com"');
    console.log('   "Is malicious-site.com safe?"');
    console.log('   "Security configuration"');
    console.log('   "Check domain reputation for suspicious-site.com"\n');
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.cyan.bold('🤖 Secure Natural Language Gateway Manager'));
    console.log(chalk.gray('Usage: npx tsx src/cli/secure-natural-language-interface.ts "<your command>"'));
    console.log(chalk.gray('Example: npx tsx src/cli/secure-natural-language-interface.ts "scan my gateway for security issues"'));
    console.log(chalk.gray('\nFor interactive mode, use: npx tsx src/cli/secure-natural-language-interface.ts "help"'));
    process.exit(1);
  }
  
  const input = args.join(' ');
  const nlInterface = new SecureNaturalLanguageInterface();
  
  console.log(chalk.cyan(`💬 Processing: "${input}"`));
  await nlInterface.processNaturalLanguage(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
