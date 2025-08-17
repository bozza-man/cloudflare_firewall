#!/usr/bin/env node

import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { EnhancedGatewayRuleManager } from '../rules/enhanced-gateway-rule-manager.js';
import { SmartDomainCategorizer } from '../scripts/smart-domain-categorizer.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

interface Command {
  type: 'categorize' | 'create_rule' | 'manage_lists' | 'analyze' | 'help' | 'unknown';
  intent: string;
  parameters: {
    domains?: string[];
    action?: 'allow' | 'block';
    ruleName?: string;
    listName?: string;
    precedence?: number;
    dryRun?: boolean;
    useAI?: boolean;
  };
  confidence: number;
}

export class NaturalLanguageInterface {
  private gateway: GatewayClient;
  private ai: GatewayAIAssistant;
  private ruleManager: EnhancedGatewayRuleManager;
  private categorizer: SmartDomainCategorizer;

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.ruleManager = new EnhancedGatewayRuleManager();
    this.categorizer = new SmartDomainCategorizer();
  }

  /**
   * Main entry point for natural language processing
   */
  async processNaturalLanguage(input: string): Promise<void> {
    const spinner = ora('Understanding your request...').start();
    
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
   * Parse natural language into structured command
   */
  private async parseCommand(input: string): Promise<Command> {
    const inputLower = input.toLowerCase();
    
    // Extract domains from the input
    const domains = this.extractDomainsFromText(input);
    
    // Determine command type and intent
    if (this.matchesCategorization(inputLower)) {
      return {
        type: 'categorize',
        intent: domains.length > 0 
          ? `Categorize ${domains.length} domains into Gateway Lists`
          : 'Set up domain categorization',
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
      return {
        type: 'create_rule',
        intent: domains.length > 0 
          ? `${action.charAt(0).toUpperCase() + action.slice(1)} access to ${domains.join(', ')}`
          : `Create ${action} rule from description`,
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
        intent: 'Manage Gateway Lists',
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
        intent: 'Analyze current Gateway configuration',
        parameters: {},
        confidence: 0.8
      };
    }
    
    if (inputLower.includes('help') || inputLower.includes('?')) {
      return {
        type: 'help',
        intent: 'Show help information',
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
          intent: `Create rule: ${aiInterpretation.explanation}`,
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
   * Execute the parsed command
   */
  private async executeCommand(command: Command): Promise<void> {
    switch (command.type) {
      case 'categorize':
        await this.executeCategorization(command);
        break;
        
      case 'create_rule':
        await this.executeRuleCreation(command);
        break;
        
      case 'manage_lists':
        await this.executeListManagement(command);
        break;
        
      case 'analyze':
        await this.executeAnalysis(command);
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
   * Execute domain categorization
   */
  private async executeCategorization(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🎯 Domain Categorization\n'));
    
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
    
    console.log(chalk.green(`📋 Found ${domains.length} domains to categorize`));
    
    const assignments = await this.categorizer.categorizeDomains(domains, {
      useAI: command.parameters.useAI || false,
      dryRun: command.parameters.dryRun || false,
      outputFile: `categorization-${Date.now()}.json`
    });
    
    // Show next steps
    if (!command.parameters.dryRun) {
      console.log(chalk.cyan.bold('\n🚀 Next Steps:'));
      console.log('• Your domains are now organized in Gateway Lists');
      console.log('• You can create rules using these lists');
      console.log('• Try: "create rule to allow all development tools"');
      console.log('• Or: "block all social media sites"');
    }
  }

  /**
   * Execute rule creation
   */
  private async executeRuleCreation(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n⚡ Rule Creation\n'));
    
    const domains = command.parameters.domains || [];
    const action = command.parameters.action || 'block';
    
    if (domains.length > 0) {
      // Create rule for specific domains
      console.log(chalk.green(`Creating ${action} rule for ${domains.length} domains...`));
      
      const ruleName = command.parameters.ruleName || 
        `${action.charAt(0).toUpperCase() + action.slice(1)} ${domains.slice(0, 2).join(', ')}${domains.length > 2 ? ' and others' : ''}`;
      
      const rule = await this.ruleManager.createRule({
        name: ruleName,
        action,
        filters: domains.map(domain => `dns.fqdn == "${domain}"`),
        description: `Auto-created rule to ${action} access to specified domains`
      });
      
      console.log(chalk.green(`✅ Created rule: ${rule.name} (ID: ${rule.id})`));
      
    } else {
      // Let AI generate the rule from natural language
      console.log(chalk.blue('🤖 Using AI to create rule from your description...'));
      
      const rule = await this.ruleManager.createRuleFromDescription(command.intent);
      console.log(chalk.green(`✅ Created rule: ${rule.name} (ID: ${rule.id})`));
    }
  }

  /**
   * Execute Gateway Lists management
   */
  private async executeListManagement(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n📋 Gateway Lists Management\n'));
    
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
      }
    }
  }

  /**
   * Execute analysis of current configuration
   */
  private async executeAnalysis(command: Command): Promise<void> {
    console.log(chalk.cyan.bold('\n🔍 Gateway Configuration Analysis\n'));
    
    const spinner = ora('Analyzing your Gateway configuration...').start();
    
    try {
      // Get current state
      const rules = await this.ruleManager.listRules();
      const lists = await this.ruleManager.listLists();
      
      // Find optimization opportunities
      const optimizationCandidates = await this.ruleManager.findOptimizationCandidates();
      
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
      
      // Optimization suggestions
      if (optimizationCandidates.length > 0) {
        console.log(chalk.yellow('\n💡 Optimization Opportunities:'));
        const totalSavings = optimizationCandidates.reduce((sum, c) => 
          sum + c.bestMatch.estimatedSavings, 0);
        console.log(`   • ${optimizationCandidates.length} rules can be optimized`);
        console.log(`   • Estimated savings: ${totalSavings} characters`);
        console.log('   • Try: "optimize my rules" to apply improvements');
      }
      
    } catch (error) {
      spinner.fail('Analysis failed');
      throw error;
    }
  }

  /**
   * Extract domains from natural language text
   */
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

  /**
   * Get domains interactively from user
   */
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

  // Pattern matching methods
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
    console.log(chalk.cyan.bold('\n🤖 Natural Language Gateway Manager\n'));
    
    console.log(chalk.blue('I can help you manage your Cloudflare Gateway with simple English commands!\n'));
    
    this.showExamples();
    
    console.log(chalk.cyan('\n💡 Tips:'));
    console.log('• You can be conversational - I understand context');
    console.log('• Add "preview" or "dry run" to see what will happen first');
    console.log('• Use "smart" or "AI" for enhanced analysis');
    console.log('• I can work with domain lists, individual domains, or descriptions\n');
  }

  private showExamples(): void {
    console.log(chalk.green('🎯 Domain Categorization:'));
    console.log('   "Categorize github.com, slack.com, netflix.com"');
    console.log('   "Organize domains from my-list.txt using AI"');
    console.log('   "Sort these domains into Gateway Lists"');
    
    console.log(chalk.red('\n🚫 Rule Creation:'));
    console.log('   "Block facebook.com and instagram.com"');
    console.log('   "Allow all development tools"');
    console.log('   "Create rule to block social media"');
    console.log('   "Make a rule called \'Work Hours\' to allow only business sites"');
    
    console.log(chalk.blue('\n📋 List Management:'));
    console.log('   "Show me my Gateway Lists"');
    console.log('   "What\'s in my social media list?"');
    
    console.log(chalk.yellow('\n🔍 Analysis:'));
    console.log('   "Analyze my current setup"');
    console.log('   "Show me a summary of my rules"');
    console.log('   "What can I optimize?"\n');
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.cyan.bold('🤖 Natural Language Gateway Manager'));
    console.log(chalk.gray('Usage: npx tsx src/cli/natural-language-interface.ts "<your command>"'));
    console.log(chalk.gray('Example: npx tsx src/cli/natural-language-interface.ts "categorize github.com, slack.com"'));
    console.log(chalk.gray('\nFor interactive mode, use: npx tsx src/cli/natural-language-interface.ts "help"'));
    process.exit(1);
  }
  
  const input = args.join(' ');
  const nlInterface = new NaturalLanguageInterface();
  
  console.log(chalk.cyan(`💬 Processing: "${input}"`));
  await nlInterface.processNaturalLanguage(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
