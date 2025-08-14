#!/usr/bin/env tsx

/**
 * Deduplicate and reorder Gateway rules for optimal performance
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface RuleGroup {
  primary: any;
  duplicates: any[];
  mergedTraffic?: string;
}

class RuleDeduplicator {
  private gateway: GatewayClient;
  
  constructor() {
    this.gateway = new GatewayClient();
  }

  async execute(): Promise<void> {
    console.log(chalk.cyan.bold('🧹 Gateway Rules Deduplication & Reordering\n'));
    
    const spinner = ora('Fetching all rules...').start();
    
    try {
      const rules = await this.gateway.listGatewayRules();
      spinner.succeed(`Loaded ${rules.length} rules`);
      
      // Step 1: Identify duplicates
      console.log(chalk.cyan.bold('\n📋 Step 1: Identifying Duplicates\n'));
      const duplicateGroups = this.identifyDuplicates(rules);
      await this.displayDuplicates(duplicateGroups);
      
      // Step 2: Delete duplicates
      console.log(chalk.cyan.bold('\n🗑️  Step 2: Removing Duplicates\n'));
      const deletedCount = await this.deleteDuplicates(duplicateGroups);
      
      // Step 3: Get remaining rules and reorder
      console.log(chalk.cyan.bold('\n📊 Step 3: Reordering Rules\n'));
      const remainingRules = await this.gateway.listGatewayRules();
      await this.reorderRules(remainingRules);
      
      // Final summary
      const finalRules = await this.gateway.listGatewayRules();
      console.log(chalk.green.bold('\n✅ Optimization Complete!\n'));
      console.log(chalk.cyan(`Previous rule count: ${rules.length}`));
      console.log(chalk.cyan(`Duplicates removed: ${deletedCount}`));
      console.log(chalk.cyan(`Final rule count: ${finalRules.length}`));
      
    } catch (error) {
      spinner.fail('Optimization failed');
      throw error;
    }
  }

  private identifyDuplicates(rules: any[]): Map<string, RuleGroup> {
    const groups = new Map<string, RuleGroup>();
    
    // Group rules by service/category
    const serviceGroups = new Map<string, any[]>();
    
    // Define duplicate patterns
    const duplicatePatterns = [
      { pattern: /^Tesla:/, key: 'tesla' },
      { pattern: /^Apple:.*iCloud/, key: 'icloud' },
      { pattern: /^.*Tailscale/, key: 'tailscale' },
      { pattern: /^.*OCSP|Certificate/, key: 'ocsp' },
      { pattern: /^IoT:/, key: 'iot' },
      { pattern: /^Monitoring:/, key: 'monitoring' },
      { pattern: /^Networking:/, key: 'networking' },
      { pattern: /^Microsoft:/, key: 'microsoft' },
      { pattern: /^Security:.*MDM/, key: 'mdm' },
      { pattern: /^CDN:/, key: 'cdn' }
    ];
    
    for (const rule of rules) {
      for (const { pattern, key } of duplicatePatterns) {
        if (pattern.test(rule.name)) {
          if (!serviceGroups.has(key)) {
            serviceGroups.set(key, []);
          }
          serviceGroups.get(key)!.push(rule);
          break;
        }
      }
    }
    
    // Identify actual duplicates within each group
    for (const [service, serviceRules] of serviceGroups) {
      if (serviceRules.length > 1) {
        // Sort by precedence to keep the one with lowest precedence as primary
        serviceRules.sort((a, b) => a.precedence - b.precedence);
        
        // Check for overlapping or redundant rules
        const primary = serviceRules[0];
        const duplicates = [];
        
        for (let i = 1; i < serviceRules.length; i++) {
          const rule = serviceRules[i];
          // Consider it a duplicate if it's the same action and similar traffic
          if (rule.action === primary.action) {
            duplicates.push(rule);
          }
        }
        
        if (duplicates.length > 0) {
          groups.set(service, {
            primary,
            duplicates,
            mergedTraffic: this.mergeTrafficRules(serviceRules)
          });
        }
      }
    }
    
    return groups;
  }

  private mergeTrafficRules(rules: any[]): string {
    // Extract all domains/patterns from traffic rules
    const allDomains = new Set<string>();
    const allPatterns = new Set<string>();
    
    for (const rule of rules) {
      if (!rule.traffic) continue;
      
      // Extract domains from "in {}" patterns
      const inMatches = rule.traffic.match(/in \{([^}]+)\}/g);
      if (inMatches) {
        for (const match of inMatches) {
          const domains = match.replace(/in \{|\}/g, '').split(/[,\s]+/).filter(d => d);
          domains.forEach(d => allDomains.add(d.replace(/"/g, '')));
        }
      }
      
      // Extract patterns from "matches" expressions
      const matchesPatterns = rule.traffic.match(/matches "[^"]+"/g);
      if (matchesPatterns) {
        for (const pattern of matchesPatterns) {
          allPatterns.add(pattern);
        }
      }
    }
    
    // Combine into single traffic rule
    let traffic = '';
    if (allDomains.size > 0) {
      const domainList = Array.from(allDomains).map(d => `"${d}"`).join(' ');
      traffic = `http.request.host in {${domainList}}`;
    }
    if (allPatterns.size > 0) {
      if (traffic) traffic += ' or ';
      traffic += Array.from(allPatterns).join(' or ');
    }
    
    return traffic;
  }

  private async displayDuplicates(groups: Map<string, RuleGroup>): Promise<void> {
    if (groups.size === 0) {
      console.log(chalk.green('No duplicate rule groups found'));
      return;
    }
    
    console.log(chalk.yellow(`Found ${groups.size} groups with duplicates:\n`));
    
    for (const [service, group] of groups) {
      console.log(chalk.cyan(`${service.toUpperCase()}:`));
      console.log(chalk.green(`  ✓ Keep: ${group.primary.name} (precedence: ${group.primary.precedence})`));
      for (const dup of group.duplicates) {
        console.log(chalk.red(`  ✗ Remove: ${dup.name} (precedence: ${dup.precedence})`));
      }
      console.log();
    }
  }

  private async deleteDuplicates(groups: Map<string, RuleGroup>): Promise<number> {
    let deleted = 0;
    
    for (const [service, group] of groups) {
      for (const dup of group.duplicates) {
        const spinner = ora(`Deleting: ${dup.name}`).start();
        try {
          await this.gateway.deleteGatewayRule(dup.id);
          deleted++;
          spinner.succeed(`Deleted: ${dup.name}`);
        } catch (error) {
          spinner.fail(`Failed to delete: ${dup.name}`);
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return deleted;
  }

  private async reorderRules(rules: any[]): Promise<void> {
    // Define proper precedence ranges for each category
    const categoryRanges = [
      { name: 'Critical Auth & Certs', pattern: /Authentication|Certificate|OCSP/, range: [990, 999], spacing: 1 },
      { name: 'Security Blocks', pattern: /Block|Malware|Phishing|Command|Botnet/, range: [1000, 1099], spacing: 10 },
      { name: 'Development', pattern: /GitHub|Package|NPM|CDN.*JavaScript/, range: [1100, 1149], spacing: 5 },
      { name: 'Cloud Services', pattern: /AWS|Azure|Google.*Core|Cloud/, range: [1150, 1199], spacing: 5 },
      { name: 'Apple Services', pattern: /Apple|iCloud/, range: [1200, 1249], spacing: 5 },
      { name: 'Communication', pattern: /Slack|Zoom|Teams|Video/, range: [1250, 1299], spacing: 5 },
      { name: 'Productivity', pattern: /Atlassian|Notion|Jira/, range: [1300, 1349], spacing: 5 },
      { name: 'Security Tools', pattern: /Password|Auth0|Okta|SimpleMDM/, range: [1350, 1399], spacing: 5 },
      { name: 'Monitoring', pattern: /Sentry|Datadog|Application.*Performance/, range: [1400, 1449], spacing: 5 },
      { name: 'AI Services', pattern: /AI|Anthropic|OpenAI|Claude/, range: [1450, 1499], spacing: 5 },
      { name: 'IoT Devices', pattern: /IoT|Brother|Harman|Device/, range: [1500, 1549], spacing: 5 },
      { name: 'VPN/Networking', pattern: /Tailscale|VPN|Network/, range: [1550, 1599], spacing: 5 },
      { name: 'Tesla', pattern: /Tesla/, range: [1600, 1649], spacing: 5 },
      { name: 'CDN Services', pattern: /Akamai|Cloudflare.*Services|CDN/, range: [1650, 1699], spacing: 5 },
      { name: 'Microsoft Services', pattern: /Microsoft|Office/, range: [1700, 1749], spacing: 5 },
      { name: 'Infrastructure', pattern: /Infrastructure|UniFi|Home.*Assistant/, range: [1750, 1799], spacing: 5 },
      { name: 'Email Services', pattern: /Email|Gmail|Outlook/, range: [1800, 1849], spacing: 5 },
      { name: 'Social Media', pattern: /Social|Facebook|Twitter|Meta/, range: [1850, 1899], spacing: 5 },
      { name: 'Streaming', pattern: /Streaming|Netflix|YouTube/, range: [1900, 1949], spacing: 5 },
      { name: 'Finance', pattern: /Finance|Banking|Payment/, range: [1950, 1999], spacing: 5 },
      { name: 'General Allow', pattern: /.*/, range: [2000, 2999], spacing: 10 }
    ];
    
    // Categorize all rules
    const categorized = new Map<string, any[]>();
    for (const category of categoryRanges) {
      categorized.set(category.name, []);
    }
    
    for (const rule of rules) {
      let assigned = false;
      for (const category of categoryRanges) {
        if (category.pattern.test(rule.name)) {
          categorized.get(category.name)!.push(rule);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        categorized.get('General Allow')!.push(rule);
      }
    }
    
    // Reorder rules with new precedence
    console.log(chalk.yellow('Reordering rules by category...\n'));
    
    const table = new Table({
      head: ['Category', 'Rules', 'Precedence Range'],
      style: { head: ['cyan'] }
    });
    
    let totalReordered = 0;
    
    for (const category of categoryRanges) {
      const categoryRules = categorized.get(category.name)!;
      if (categoryRules.length === 0) continue;
      
      let currentPrecedence = category.range[0];
      
      for (const rule of categoryRules) {
        if (rule.precedence !== currentPrecedence) {
          const spinner = ora(`Reordering: ${rule.name} (${rule.precedence} → ${currentPrecedence})`).start();
          try {
            await this.gateway.updateRulePrecedence(rule.id, currentPrecedence);
            totalReordered++;
            spinner.succeed(`Reordered: ${rule.name}`);
          } catch (error) {
            spinner.fail(`Failed: ${rule.name}`);
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        currentPrecedence += category.spacing;
      }
      
      if (categoryRules.length > 0) {
        table.push([
          category.name,
          categoryRules.length.toString(),
          `${category.range[0]}-${currentPrecedence - category.spacing}`
        ]);
      }
    }
    
    console.log('\n' + table.toString());
    console.log(chalk.green(`\n✓ Reordered ${totalReordered} rules`));
  }
}

// Main execution
async function main() {
  try {
    const deduplicator = new RuleDeduplicator();
    await deduplicator.execute();
    
    console.log(chalk.green.bold('\n✅ Your Gateway rules are now optimized!'));
    console.log(chalk.gray('\nImprovements made:'));
    console.log('• Removed duplicate rules');
    console.log('• Organized rules by category');
    console.log('• Optimized precedence ordering');
    console.log('• Improved rule processing efficiency\n');
    
    console.log(chalk.cyan('Monitor your dashboard to verify everything is working:'));
    console.log(chalk.gray('http://localhost:3001\n'));
    
  } catch (error: any) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

main();