#!/usr/bin/env tsx

import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, GatewayList } from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

interface ConversionCandidate {
  rule: GatewayRule;
  domains: string[];
  suggestedListName: string;
  existingList?: GatewayList;
  filterType: 'dns' | 'http';
}

class DomainToListConverter {
  private gateway: GatewayClient;

  constructor() {
    this.gateway = new GatewayClient();
  }

  async analyze(): Promise<void> {
    const spinner = ora('Analyzing rules for domain consolidation opportunities...').start();

    try {
      // Fetch current rules and lists
      const [rules, lists] = await Promise.all([
        this.gateway.listGatewayRules(),
        this.gateway.listGatewayLists()
      ]);

      spinner.succeed('Analysis complete');

      // Find rules with inline domains that could use lists
      const candidates = this.findConversionCandidates(rules, lists);

      if (candidates.length === 0) {
        console.log(chalk.green('\n✅ No inline domain filters found that need conversion to lists.'));
        return;
      }

      // Display candidates
      console.log(chalk.bold.cyan(`\n📋 Found ${candidates.length} rules with inline domains that could use Gateway Lists:\n`));
      
      candidates.forEach((candidate, index) => {
        console.log(`${index + 1}. ${chalk.bold(candidate.rule.name)}`);
        console.log(`   Current: ${candidate.domains.length} inline domains`);
        console.log(`   Domains: ${candidate.domains.slice(0, 3).join(', ')}${candidate.domains.length > 3 ? ` and ${candidate.domains.length - 3} more` : ''}`);
        if (candidate.existingList) {
          console.log(chalk.green(`   ✓ Can use existing list: "${candidate.existingList.name}"`));
        } else {
          console.log(chalk.yellow(`   → Suggest creating new list: "${candidate.suggestedListName}"`));
        }
        console.log();
      });

      // Ask user how to proceed
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'How would you like to proceed?',
          choices: [
            { name: 'Convert all automatically', value: 'auto' },
            { name: 'Review and convert each individually', value: 'interactive' },
            { name: 'Show conversion plan only (dry run)', value: 'dryrun' },
            { name: 'Cancel', value: 'cancel' }
          ]
        }
      ]);

      if (action === 'cancel') {
        console.log(chalk.yellow('\nConversion cancelled.'));
        return;
      }

      // Execute conversion based on user choice
      await this.executeConversion(candidates, action);

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  }

  private findConversionCandidates(rules: GatewayRule[], lists: GatewayList[]): ConversionCandidate[] {
    const candidates: ConversionCandidate[] = [];

    for (const rule of rules) {
      // Skip rules that already use lists
      if (rule.filters.some(f => f.includes('$'))) {
        continue;
      }

      // Extract inline domains from filters
      const dnsDomainsFilter = rule.filters.find(f => 
        f.includes('dns.fqdn') && (f.includes(' in {') || f.includes(' == "'))
      );
      
      const httpDomainsFilter = rule.filters.find(f => 
        f.includes('http.request.host') && (f.includes(' in {') || f.includes(' == "'))
      );

      if (dnsDomainsFilter || httpDomainsFilter) {
        const filter = dnsDomainsFilter || httpDomainsFilter;
        const filterType = dnsDomainsFilter ? 'dns' : 'http';
        const domains = this.extractDomainsFromFilter(filter!);

        if (domains.length >= 3) { // Only consider if 3+ domains
          const suggestedListName = this.suggestListName(rule, domains);
          const existingList = this.findMatchingList(domains, lists);

          candidates.push({
            rule,
            domains,
            suggestedListName,
            existingList,
            filterType
          });
        }
      }
    }

    return candidates;
  }

  private extractDomainsFromFilter(filter: string): string[] {
    const domains: string[] = [];
    
    // Handle "in {domain1, domain2, ...}" format
    const inMatch = filter.match(/in\s*\{([^}]+)\}/);
    if (inMatch) {
      const domainStr = inMatch[1];
      const extracted = domainStr.match(/"([^"]+)"/g);
      if (extracted) {
        domains.push(...extracted.map(d => d.replace(/"/g, '')));
      }
    }
    
    // Handle multiple "== domain" with OR
    const orMatches = filter.match(/==\s*"([^"]+)"/g);
    if (orMatches) {
      domains.push(...orMatches.map(m => m.replace(/==\s*"/, '').replace(/"/, '')));
    }

    return [...new Set(domains)].filter(d => d.includes('.'));
  }

  private suggestListName(rule: GatewayRule, domains: string[]): string {
    // Try to infer service name from domains
    const servicePatterns = {
      'Apple Services': ['apple.com', 'icloud.com', 'aaplimg.com'],
      'Microsoft Services': ['microsoft.com', 'office.com', 'outlook.com'],
      'Google Services': ['google.com', 'googleapis.com', 'gstatic.com'],
      'AWS Infrastructure': ['amazonaws.com', 'cloudfront.net'],
      'Certificate Infrastructure': ['ocsp', 'crl', 'letsencrypt'],
      'AI Services': ['openai.com', 'anthropic.com', 'claude.ai'],
      'Development Tools': ['github.com', 'npmjs', 'yarnpkg'],
    };

    for (const [service, patterns] of Object.entries(servicePatterns)) {
      if (patterns.some(pattern => domains.some(domain => domain.includes(pattern)))) {
        return service;
      }
    }

    // Fallback to rule-based naming
    if (rule.name.includes('Certificate')) return 'Certificate Infrastructure';
    if (rule.name.includes('OpenAI')) return 'OpenAI Infrastructure';
    if (rule.name.includes('Apple')) return 'Apple Services';
    if (rule.name.includes('Microsoft')) return 'Microsoft Services';
    if (rule.name.includes('Development')) return 'Development Tools';
    
    return `${rule.action === 'allow' ? 'Allowed' : 'Blocked'} Domains`;
  }

  private findMatchingList(domains: string[], lists: GatewayList[]): GatewayList | undefined {
    // Check if an existing list contains most of these domains
    for (const list of lists) {
      if (list.type !== 'DOMAIN') continue;
      
      const listItems = list.items || [];
      const listDomains = listItems.map(item => 
        typeof item === 'string' ? item : item.value
      );
      
      // If 80% of domains match, consider it a match
      const matchCount = domains.filter(d => listDomains.includes(d)).length;
      if (matchCount >= domains.length * 0.8) {
        return list;
      }
    }
    
    return undefined;
  }

  private async executeConversion(
    candidates: ConversionCandidate[], 
    mode: 'auto' | 'interactive' | 'dryrun'
  ): Promise<void> {
    const spinner = ora();
    const createdLists = new Map<string, GatewayList>();
    const updatedRules: GatewayRule[] = [];

    console.log(chalk.bold.cyan('\n🔄 Conversion Plan:\n'));

    for (const candidate of candidates) {
      if (mode === 'interactive') {
        console.log(chalk.bold(`\nRule: ${candidate.rule.name}`));
        console.log(`Domains: ${candidate.domains.join(', ')}`);
        
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: candidate.existingList 
              ? `Use existing list "${candidate.existingList.name}"?`
              : `Create new list "${candidate.suggestedListName}"?`,
            default: true
          }
        ]);

        if (!proceed) continue;
      }

      // Display what will be done
      if (candidate.existingList) {
        console.log(chalk.green(`✓ Will use existing list: "${candidate.existingList.name}" for rule "${candidate.rule.name}"`));
      } else {
        console.log(chalk.yellow(`→ Will create new list: "${candidate.suggestedListName}" with ${candidate.domains.length} domains`));
      }

      if (mode === 'dryrun') continue;

      try {
        // Create or get list
        let listToUse: GatewayList;
        
        if (candidate.existingList) {
          listToUse = candidate.existingList;
        } else {
          // Check if we already created this list in this session
          const existingCreated = createdLists.get(candidate.suggestedListName);
          if (existingCreated) {
            listToUse = existingCreated;
          } else {
            spinner.start(`Creating list: ${candidate.suggestedListName}`);
            listToUse = await this.gateway.createGatewayList({
              name: candidate.suggestedListName,
              type: 'DOMAIN',
              items: candidate.domains.map(d => ({ value: d }))
            });
            createdLists.set(candidate.suggestedListName, listToUse);
            spinner.succeed(`Created list: ${candidate.suggestedListName}`);
          }
        }

        // Update rule to use list
        spinner.start(`Updating rule: ${candidate.rule.name}`);
        
        const newFilter = candidate.filterType === 'dns' 
          ? `dns.fqdn in $${listToUse.id}`
          : `http.request.host in $${listToUse.id}`;

        // Replace the old filter with the new one
        const updatedFilters = candidate.rule.filters.map(f => {
          if (f.includes('dns.fqdn') && candidate.filterType === 'dns') {
            return newFilter;
          }
          if (f.includes('http.request.host') && candidate.filterType === 'http') {
            return newFilter;
          }
          return f;
        });

        await this.gateway.updateGatewayRule({
          id: candidate.rule.id,
          filters: updatedFilters,
          action: candidate.rule.action
        });

        updatedRules.push(candidate.rule);
        spinner.succeed(`Updated rule: ${candidate.rule.name}`);

      } catch (error) {
        spinner.fail(`Failed to process ${candidate.rule.name}`);
        console.error(chalk.red('Error:'), error);
      }
    }

    if (mode !== 'dryrun') {
      console.log(chalk.green(`\n✅ Conversion complete!`));
      console.log(`   • ${createdLists.size} new lists created`);
      console.log(`   • ${updatedRules.length} rules updated`);
      console.log(chalk.yellow('\nRun "rules list" to see the updated rules'));
      console.log(chalk.yellow('Run "lists list" to see all Gateway lists'));
    }
  }

  async consolidateExistingLists(): Promise<void> {
    const spinner = ora('Analyzing existing lists for consolidation...').start();

    try {
      const lists = await this.gateway.listGatewayLists();
      spinner.succeed('Analysis complete');

      // Find similar lists that could be consolidated
      const domainLists = lists.filter(l => l.type === 'DOMAIN');
      const consolidationGroups: Array<{
        lists: GatewayList[];
        suggestedName: string;
        totalItems: number;
        uniqueItems: number;
      }> = [];

      // Group lists by similarity
      const processed = new Set<string>();
      
      for (const list of domainLists) {
        if (processed.has(list.id)) continue;
        
        const similar: GatewayList[] = [list];
        const listItems = list.items || [];
        const allDomains = new Set(listItems.map(i => typeof i === 'string' ? i : i.value));
        
        for (const otherList of domainLists) {
          if (otherList.id === list.id || processed.has(otherList.id)) continue;
          
          const otherItems = otherList.items || [];
          const otherDomains = otherItems.map(i => typeof i === 'string' ? i : i.value);
          const overlap = otherDomains.filter(d => allDomains.has(d)).length;
          
          // If 50% overlap, consider for consolidation
          if (overlap >= otherDomains.length * 0.5) {
            similar.push(otherList);
            otherDomains.forEach(d => allDomains.add(d));
          }
        }
        
        if (similar.length > 1) {
          similar.forEach(l => processed.add(l.id));
          consolidationGroups.push({
            lists: similar,
            suggestedName: this.suggestConsolidatedName(similar),
            totalItems: similar.reduce((sum, l) => sum + l.items.length, 0),
            uniqueItems: allDomains.size
          });
        }
      }

      if (consolidationGroups.length === 0) {
        console.log(chalk.green('\n✅ No lists found that need consolidation.'));
        return;
      }

      console.log(chalk.bold.cyan(`\n📋 Found ${consolidationGroups.length} groups of lists that could be consolidated:\n`));
      
      consolidationGroups.forEach((group, index) => {
        console.log(`${index + 1}. Consolidate ${group.lists.length} lists:`);
        group.lists.forEach(l => console.log(`   • ${l.name} (${l.items.length} items)`));
        console.log(`   → Suggested name: "${group.suggestedName}"`);
        console.log(`   → Result: ${group.uniqueItems} unique items (from ${group.totalItems} total)`);
        console.log();
      });

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
    }
  }

  private suggestConsolidatedName(lists: GatewayList[]): string {
    // Look for common patterns in names
    const names = lists.map(l => l.name.toLowerCase());
    
    if (names.every(n => n.includes('certificate') || n.includes('cert'))) {
      return 'Certificate Infrastructure';
    }
    if (names.every(n => n.includes('openai') || n.includes('ai'))) {
      return 'AI Services Infrastructure';
    }
    if (names.every(n => n.includes('apple'))) {
      return 'Apple Services';
    }
    if (names.every(n => n.includes('microsoft'))) {
      return 'Microsoft Services';
    }
    if (names.every(n => n.includes('google'))) {
      return 'Google Services';
    }
    
    return 'Consolidated Domains';
  }
}

// Main execution
async function main() {
  const converter = new DomainToListConverter();
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Convert inline domains to Gateway Lists', value: 'convert' },
        { name: 'Analyze existing lists for consolidation', value: 'consolidate' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'convert':
      await converter.analyze();
      break;
    case 'consolidate':
      await converter.consolidateExistingLists();
      break;
    case 'exit':
      console.log(chalk.yellow('Goodbye!'));
      break;
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
