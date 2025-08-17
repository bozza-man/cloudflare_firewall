#!/usr/bin/env node

import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';

interface DomainAnalysis {
  domain: string;
  category: string;
  confidence: number;
  reasoning: string;
  suggestedList: string;
  businessCriticality: 'critical' | 'important' | 'normal' | 'low';
  tags: string[];
}

interface CategoryMapping {
  patterns: string[];
  keywords: string[];
  listName: string;
  businessCriticality: 'critical' | 'important' | 'normal' | 'low';
  description: string;
}

interface ListAssignment {
  listName: string;
  listId?: string;
  domains: DomainAnalysis[];
  action: 'create' | 'update' | 'existing';
  totalDomains: number;
}

export class SmartDomainCategorizer {
  private gateway: GatewayClient;
  private ai: GatewayAIAssistant;
  private existingLists: Map<string, any> = new Map();

  // Pre-defined category mappings based on common business needs
  private categoryMappings: CategoryMapping[] = [
    {
      patterns: ['github.com', '*.github.io', 'gitlab.com', 'bitbucket.org', 'azure.com', 'visualstudio.com'],
      keywords: ['git', 'dev', 'code', 'repo', 'ci', 'cd', 'azure', 'aws', 'gcp'],
      listName: 'Development Tools Domains',
      businessCriticality: 'critical',
      description: 'Essential development and DevOps services'
    },
    {
      patterns: ['*.apple.com', 'icloud.com', '*.icloud.com', 'itunes.com', 'app-store.com'],
      keywords: ['apple', 'ios', 'macos', 'ipad', 'iphone', 'mac'],
      listName: 'Apple Services',
      businessCriticality: 'critical',
      description: 'Apple ecosystem services and updates'
    },
    {
      patterns: ['*.microsoft.com', 'office.com', '*.office.com', 'outlook.com', 'live.com', 'xbox.com'],
      keywords: ['microsoft', 'office', 'teams', 'outlook', 'onedrive', 'sharepoint'],
      listName: 'Microsoft Services',
      businessCriticality: 'critical',
      description: 'Microsoft Office and productivity services'
    },
    {
      patterns: ['*.google.com', 'gmail.com', 'youtube.com', 'gstatic.com', 'googleapis.com'],
      keywords: ['google', 'gmail', 'drive', 'docs', 'sheets', 'meet'],
      listName: 'Google Services',
      businessCriticality: 'critical',
      description: 'Google Workspace and essential services'
    },
    {
      patterns: ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'tiktok.com', 'snapchat.com'],
      keywords: ['social', 'media', 'facebook', 'instagram', 'twitter', 'linkedin'],
      listName: 'Social Media Sites',
      businessCriticality: 'low',
      description: 'Social media platforms'
    },
    {
      patterns: ['netflix.com', 'spotify.com', 'youtube.com', 'twitch.tv', 'hulu.com', 'disney.com'],
      keywords: ['streaming', 'video', 'music', 'entertainment', 'netflix', 'spotify'],
      listName: 'Streaming and Entertainment',
      businessCriticality: 'low',
      description: 'Entertainment and streaming services'
    },
    {
      patterns: ['amazon.com', 'ebay.com', 'shopify.com', 'stripe.com', 'paypal.com', 'shop.*.com'],
      keywords: ['shop', 'buy', 'store', 'commerce', 'payment', 'retail'],
      listName: 'E-commerce Sites',
      businessCriticality: 'normal',
      description: 'Shopping and e-commerce platforms'
    },
    {
      patterns: ['slack.com', 'zoom.us', 'teams.microsoft.com', 'discord.com', 'webex.com'],
      keywords: ['chat', 'communication', 'meeting', 'conference', 'collaborate'],
      listName: 'Communication Tools',
      businessCriticality: 'critical',
      description: 'Business communication and collaboration tools'
    },
    {
      patterns: ['*.amazonaws.com', '*.cloudfront.net', '*.googleusercontent.com', '*.azureedge.net'],
      keywords: ['aws', 'cloud', 'cdn', 'storage', 'compute', 'infrastructure'],
      listName: 'Cloud Infrastructure',
      businessCriticality: 'critical',
      description: 'Cloud service providers and CDNs'
    }
  ];

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
  }

  /**
   * Main entry point: Analyze domains and categorize them into Gateway Lists
   */
  async categorizeDomains(
    domains: string[],
    options: {
      useAI?: boolean;
      dryRun?: boolean;
      outputFile?: string;
      batchSize?: number;
    } = {}
  ): Promise<ListAssignment[]> {
    const spinner = ora('Starting domain categorization...').start();
    
    try {
      // Load existing Gateway Lists
      await this.loadExistingLists();
      
      spinner.text = 'Analyzing domains...';
      const analyses = await this.analyzeDomains(domains, options.useAI || false);
      
      spinner.text = 'Grouping domains by category...';
      const assignments = this.groupDomainsIntoLists(analyses);
      
      spinner.succeed(`Analyzed ${domains.length} domains into ${assignments.length} categories`);
      
      // Display results
      this.displayCategorization(assignments);
      
      if (options.outputFile) {
        await this.saveResults(assignments, options.outputFile);
      }
      
      if (!options.dryRun) {
        await this.applyListAssignments(assignments, options.batchSize || 5);
      } else {
        console.log(chalk.yellow('\n🧪 Dry run mode - no changes applied'));
      }
      
      return assignments;
      
    } catch (error) {
      spinner.fail('Domain categorization failed');
      throw error;
    }
  }

  /**
   * Analyze individual domains using pattern matching and optionally AI
   */
  private async analyzeDomains(domains: string[], useAI: boolean): Promise<DomainAnalysis[]> {
    const analyses: DomainAnalysis[] = [];
    
    for (const domain of domains) {
      const analysis = await this.analyzeSingleDomain(domain, useAI);
      analyses.push(analysis);
    }
    
    return analyses;
  }

  /**
   * Analyze a single domain using pattern matching and AI
   */
  private async analyzeSingleDomain(domain: string, useAI: boolean): Promise<DomainAnalysis> {
    // First, try pattern-based categorization
    const patternMatch = this.matchDomainToCategory(domain);
    
    if (patternMatch.confidence >= 0.8) {
      return patternMatch;
    }
    
    // If pattern matching isn't confident enough, use AI
    if (useAI) {
      try {
        const aiAnalysis = await this.ai.categorizeService(domain, [domain]);
        
        return {
          domain,
          category: aiAnalysis.category,
          confidence: 0.9,
          reasoning: aiAnalysis.reasoning,
          suggestedList: this.mapCategoryToList(aiAnalysis.category),
          businessCriticality: aiAnalysis.priority === 'high' ? 'critical' : 
                                 aiAnalysis.priority === 'medium' ? 'important' : 'normal',
          tags: [aiAnalysis.category, aiAnalysis.priority]
        };
      } catch (error) {
        console.log(chalk.yellow(`⚠️  AI analysis failed for ${domain}, using pattern match`));
      }
    }
    
    // Fallback to pattern match even if confidence is lower
    return patternMatch;
  }

  /**
   * Match domain to category using patterns and keywords
   */
  private matchDomainToCategory(domain: string): DomainAnalysis {
    const domainLower = domain.toLowerCase();
    let bestMatch: CategoryMapping | null = null;
    let bestScore = 0;
    
    for (const mapping of this.categoryMappings) {
      let score = 0;
      
      // Check pattern matches
      for (const pattern of mapping.patterns) {
        if (this.matchesPattern(domainLower, pattern.toLowerCase())) {
          score += 10; // High weight for pattern matches
        }
      }
      
      // Check keyword matches
      for (const keyword of mapping.keywords) {
        if (domainLower.includes(keyword.toLowerCase())) {
          score += 3; // Medium weight for keyword matches
        }
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = mapping;
      }
    }
    
    if (bestMatch) {
      return {
        domain,
        category: bestMatch.listName,
        confidence: Math.min(bestScore / 10, 1.0),
        reasoning: `Matched patterns: ${bestMatch.patterns.join(', ')} and keywords: ${bestMatch.keywords.join(', ')}`,
        suggestedList: bestMatch.listName,
        businessCriticality: bestMatch.businessCriticality,
        tags: [bestMatch.listName, bestMatch.businessCriticality]
      };
    }
    
    // Default categorization for unknown domains
    return {
      domain,
      category: 'Uncategorized Domains',
      confidence: 0.3,
      reasoning: 'No clear pattern match found',
      suggestedList: 'Uncategorized Domains',
      businessCriticality: 'normal',
      tags: ['uncategorized']
    };
  }

  /**
   * Check if domain matches a pattern (supports wildcards)
   */
  private matchesPattern(domain: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[^.]*');
      return new RegExp(`^${regexPattern}$`).test(domain);
    }
    return domain === pattern || domain.endsWith('.' + pattern);
  }

  /**
   * Map AI category to our list names
   */
  private mapCategoryToList(category: string): string {
    const categoryLower = category.toLowerCase();
    
    const mappings: Record<string, string> = {
      'business_critical': 'Critical Infrastructure Domains',
      'development': 'Development Tools Domains',
      'social_media': 'Social Media Sites',
      'entertainment': 'Streaming and Entertainment',
      'communication': 'Communication Tools',
      'cloud': 'Cloud Infrastructure',
      'productivity': 'Microsoft Services'
    };
    
    return mappings[categoryLower] || 'Uncategorized Domains';
  }

  /**
   * Group domain analyses into list assignments
   */
  private groupDomainsIntoLists(analyses: DomainAnalysis[]): ListAssignment[] {
    const groups = new Map<string, DomainAnalysis[]>();
    
    for (const analysis of analyses) {
      const listName = analysis.suggestedList;
      if (!groups.has(listName)) {
        groups.set(listName, []);
      }
      groups.get(listName)!.push(analysis);
    }
    
    const assignments: ListAssignment[] = [];
    
    for (const [listName, domains] of groups.entries()) {
      const existingList = this.findExistingList(listName);
      
      assignments.push({
        listName,
        listId: existingList?.id,
        domains,
        action: existingList ? 'update' : 'create',
        totalDomains: domains.length
      });
    }
    
    // Sort by business criticality and domain count
    return assignments.sort((a, b) => {
      const criticalityOrder = { critical: 0, important: 1, normal: 2, low: 3 };
      const aMaxCriticality = Math.min(...a.domains.map(d => criticalityOrder[d.businessCriticality]));
      const bMaxCriticality = Math.min(...b.domains.map(d => criticalityOrder[d.businessCriticality]));
      
      if (aMaxCriticality !== bMaxCriticality) {
        return aMaxCriticality - bMaxCriticality;
      }
      
      return b.totalDomains - a.totalDomains;
    });
  }

  /**
   * Display categorization results
   */
  private displayCategorization(assignments: ListAssignment[]): void {
    console.log(chalk.cyan.bold('\n📊 Domain Categorization Results:\n'));
    
    for (const assignment of assignments) {
      const actionColor = assignment.action === 'create' ? chalk.green : 
                         assignment.action === 'update' ? chalk.yellow : chalk.blue;
      
      console.log(`${actionColor('●')} ${chalk.bold(assignment.listName)} ${actionColor(`(${assignment.action.toUpperCase()})`)}`);
      console.log(`   📋 Domains: ${assignment.totalDomains}`);
      
      if (assignment.listId) {
        console.log(`   🆔 List ID: ${chalk.gray(assignment.listId)}`);
      }
      
      // Show business criticality breakdown
      const criticalityCount = assignment.domains.reduce((acc, domain) => {
        acc[domain.businessCriticality] = (acc[domain.businessCriticality] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const criticalityDisplay = Object.entries(criticalityCount)
        .map(([level, count]) => {
          const color = level === 'critical' ? chalk.red : 
                       level === 'important' ? chalk.yellow :
                       level === 'normal' ? chalk.green : chalk.gray;
          return `${color(level)}: ${count}`;
        });
      
      console.log(`   🎯 Criticality: ${criticalityDisplay.join(', ')}`);
      
      // Show sample domains
      const sampleDomains = assignment.domains.slice(0, 5).map(d => d.domain);
      console.log(`   🌐 Sample: ${sampleDomains.join(', ')}${assignment.totalDomains > 5 ? '...' : ''}`);
      console.log('');
    }
    
    const totalDomains = assignments.reduce((sum, a) => sum + a.totalDomains, 0);
    const newLists = assignments.filter(a => a.action === 'create').length;
    const updatedLists = assignments.filter(a => a.action === 'update').length;
    
    console.log(chalk.cyan('📈 Summary:'));
    console.log(`   Total domains categorized: ${chalk.bold(totalDomains)}`);
    console.log(`   Lists to create: ${chalk.green(newLists)}`);
    console.log(`   Lists to update: ${chalk.yellow(updatedLists)}`);
  }

  /**
   * Apply list assignments to Gateway Lists
   */
  private async applyListAssignments(assignments: ListAssignment[], batchSize: number): Promise<void> {
    const spinner = ora('Applying categorization to Gateway Lists...').start();
    
    try {
      let processed = 0;
      
      for (const assignment of assignments) {
        spinner.text = `Processing ${assignment.listName} (${processed + 1}/${assignments.length})...`;
        
        const domains = assignment.domains.map(d => d.domain);
        
        if (assignment.action === 'create') {
          // Create new list
          const newList = await this.gateway.createGatewayList({
            name: assignment.listName,
            type: 'DOMAIN',
            description: assignment.domains[0]?.reasoning || 'Auto-categorized domains',
            items: domains.map(domain => ({ value: domain }))
          });
          
          assignment.listId = newList.id;
          console.log(chalk.green(`✅ Created list: ${assignment.listName} with ${domains.length} domains`));
          
        } else if (assignment.action === 'update') {
          // Update existing list
          await this.gateway.updateGatewayList({
            id: assignment.listId!,
            items: domains.map(domain => ({ value: domain }))
          });
          
          console.log(chalk.yellow(`📝 Updated list: ${assignment.listName} with ${domains.length} domains`));
        }
        
        processed++;
        
        // Rate limiting
        if (processed < assignments.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      spinner.succeed(`Successfully processed ${assignments.length} Gateway Lists`);
      
    } catch (error) {
      spinner.fail('Failed to apply list assignments');
      throw error;
    }
  }

  /**
   * Load existing Gateway Lists
   */
  private async loadExistingLists(): Promise<void> {
    const lists = await this.gateway.listGatewayLists();
    const domainLists = lists.filter(list => list.type === 'DOMAIN');
    
    for (const list of domainLists) {
      this.existingLists.set(list.name, list);
    }
  }

  /**
   * Find existing list by name
   */
  private findExistingList(listName: string): any {
    return this.existingLists.get(listName);
  }

  /**
   * Save results to file
   */
  private async saveResults(assignments: ListAssignment[], outputFile: string): Promise<void> {
    const results = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDomains: assignments.reduce((sum, a) => sum + a.totalDomains, 0),
        totalLists: assignments.length,
        newLists: assignments.filter(a => a.action === 'create').length,
        updatedLists: assignments.filter(a => a.action === 'update').length
      },
      assignments: assignments.map(a => ({
        listName: a.listName,
        action: a.action,
        domainCount: a.totalDomains,
        domains: a.domains.map(d => ({
          domain: d.domain,
          confidence: d.confidence,
          businessCriticality: d.businessCriticality,
          reasoning: d.reasoning
        }))
      }))
    };
    
    await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
    console.log(chalk.green(`📄 Results saved to: ${outputFile}`));
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(chalk.red('Usage: npm run categorize-domains <domains-file> [options]'));
    console.log(chalk.gray('Options:'));
    console.log(chalk.gray('  --ai              Use AI analysis for better categorization'));
    console.log(chalk.gray('  --dry-run         Preview categorization without applying changes'));
    console.log(chalk.gray('  --output <file>   Save results to JSON file'));
    console.log(chalk.gray('  --batch-size <n>  Process domains in batches (default: 5)'));
    console.log(chalk.gray('\nExample: npm run categorize-domains domains.txt --ai --output results.json'));
    process.exit(1);
  }
  
  const domainsFile = args[0];
  const useAI = args.includes('--ai');
  const dryRun = args.includes('--dry-run');
  const outputIndex = args.indexOf('--output');
  const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
  const batchSizeIndex = args.indexOf('--batch-size');
  const batchSize = batchSizeIndex !== -1 ? parseInt(args[batchSizeIndex + 1]) : 5;
  
  try {
    // Read domains from file
    const domainsContent = await fs.readFile(domainsFile, 'utf-8');
    const domains = domainsContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));
    
    if (domains.length === 0) {
      throw new Error('No domains found in input file');
    }
    
    console.log(chalk.cyan(`🔍 Processing ${domains.length} domains from ${domainsFile}`));
    if (useAI) console.log(chalk.yellow('🤖 AI analysis enabled'));
    if (dryRun) console.log(chalk.yellow('🧪 Dry run mode'));
    
    const categorizer = new SmartDomainCategorizer();
    await categorizer.categorizeDomains(domains, {
      useAI,
      dryRun,
      outputFile,
      batchSize
    });
    
    console.log(chalk.green('\n✅ Domain categorization completed successfully!'));
    
  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
