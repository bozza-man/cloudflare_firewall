#!/usr/bin/env tsx

/**
 * Creates allow rules for legitimate services that should not be blocked
 */

import { GatewayRuleManager } from '../rules/gateway-rule-manager.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';

interface ServiceGroup {
  name: string;
  description: string;
  domains: string[];
  priority: number;
}

class AllowRuleCreator {
  private ruleManager: GatewayRuleManager;
  
  // Groups of legitimate services to allow
  private serviceGroups: ServiceGroup[] = [
    {
      name: 'Development: Core Tools',
      description: 'Essential development platforms and package registries',
      domains: [
        'github.com',
        'githubusercontent.com',
        'gitlab.com',
        'bitbucket.org',
        'npmjs.com',
        'registry.npmjs.org',
        'pypi.org',
        'rubygems.org',
        'packagist.org'
      ],
      priority: 1
    },
    {
      name: 'Development: CDN & Libraries',
      description: 'Content delivery networks for development libraries',
      domains: [
        'cdn.jsdelivr.net',
        'unpkg.com',
        'cdnjs.cloudflare.com',
        'esm.sh',
        'skypack.dev',
        'jspm.io'
      ],
      priority: 2
    },
    {
      name: 'Cloud: AWS Services',
      description: 'Amazon Web Services and related infrastructure',
      domains: [
        'amazonaws.com',
        'aws.amazon.com',
        'cloudfront.net',
        's3.amazonaws.com',
        'ec2.amazonaws.com'
      ],
      priority: 3
    },
    {
      name: 'Cloud: Google Services',
      description: 'Google Cloud and API services',
      domains: [
        'googleapis.com',
        'gstatic.com',
        'googleusercontent.com',
        'google-analytics.com',
        'firebase.googleapis.com',
        'firebaseio.com'
      ],
      priority: 4
    },
    {
      name: 'Cloud: Microsoft Services',
      description: 'Microsoft Azure and Office 365 services',
      domains: [
        'azure.com',
        'azurewebsites.net',
        'microsoft.com',
        'office.com',
        'office365.com',
        'microsoftonline.com',
        'sharepoint.com'
      ],
      priority: 5
    },
    {
      name: 'Apple: Core Services',
      description: 'Apple services and iCloud',
      domains: [
        'apple.com',
        'icloud.com',
        'mzstatic.com',
        'apple-dns.net',
        'cdn-apple.com',
        'aaplimg.com'
      ],
      priority: 6
    },
    {
      name: 'Communication: Collaboration Tools',
      description: 'Team communication and video conferencing',
      domains: [
        'slack.com',
        'slack-edge.com',
        'slack-imgs.com',
        'zoom.us',
        'zoomgov.com',
        'teams.microsoft.com',
        'discord.com',
        'discordapp.com'
      ],
      priority: 7
    },
    {
      name: 'Productivity: Work Tools',
      description: 'Project management and documentation tools',
      domains: [
        'notion.so',
        'atlassian.com',
        'atlassian.net',
        'jira.com',
        'confluence.com',
        'trello.com',
        'asana.com',
        'monday.com'
      ],
      priority: 8
    },
    {
      name: 'Security: Authentication',
      description: 'Identity management and authentication services',
      domains: [
        'auth0.com',
        'okta.com',
        'onelogin.com',
        '1password.com',
        'lastpass.com',
        'bitwarden.com',
        'duo.com'
      ],
      priority: 9
    },
    {
      name: 'Infrastructure: DNS & CDN',
      description: 'DNS resolvers and content delivery networks',
      domains: [
        'cloudflare.com',
        'cloudflare-dns.com',
        'one.one.one.one',
        'fastly.net',
        'akamaized.net',
        'akamai.net',
        'edgecast.com'
      ],
      priority: 10
    },
    {
      name: 'Monitoring: Observability',
      description: 'Application monitoring and error tracking',
      domains: [
        'sentry.io',
        'datadoghq.com',
        'newrelic.com',
        'bugsnag.com',
        'rollbar.com',
        'pagerduty.com',
        'statuspage.io'
      ],
      priority: 11
    },
    {
      name: 'AI: Language Models',
      description: 'AI services and language model APIs',
      domains: [
        'openai.com',
        'api.openai.com',
        'anthropic.com',
        'claude.ai',
        'huggingface.co',
        'replicate.com'
      ],
      priority: 12
    }
  ];

  constructor() {
    this.ruleManager = new GatewayRuleManager();
  }

  async createAllowRules(): Promise<void> {
    console.log(chalk.cyan.bold('🛡️  Creating Allow Rules for Legitimate Services\n'));
    
    const createdRules = [];
    const failedRules = [];
    
    // Sort by priority
    const sortedGroups = [...this.serviceGroups].sort((a, b) => a.priority - b.priority);
    
    for (const group of sortedGroups) {
      const spinner = ora(`Creating rule: ${group.name}`).start();
      
      try {
        // Format domains for the filter - use array format
        const domainFilter = group.domains.map(d => `"${d}"`).join(', ');
        
        // Create the rule with proper Gateway syntax
        const rule = await this.ruleManager.createRule({
          name: group.name,
          action: 'allow',
          filters: [`http.host[*] in {${domainFilter}}`],
          traffic: 'http',
          description: group.description,
          precedence: 1000 + group.priority // Higher precedence to override blocks
        });
        
        createdRules.push({
          name: rule.name,
          domains: group.domains.length,
          precedence: rule.precedence
        });
        
        spinner.succeed(`Created: ${group.name} (${group.domains.length} domains)`);
        
      } catch (error: any) {
        failedRules.push({
          name: group.name,
          error: error.message
        });
        
        // Check if rule already exists
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          spinner.info(`Skipped: ${group.name} (already exists)`);
        } else {
          spinner.fail(`Failed: ${group.name}`);
          console.error(chalk.red(`  Error: ${error.message}`));
        }
      }
      
      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Display summary
    console.log(chalk.cyan.bold('\n📊 Summary:\n'));
    
    if (createdRules.length > 0) {
      console.log(chalk.green(`✅ Successfully created ${createdRules.length} rules:\n`));
      
      const successTable = new Table({
        head: ['Rule Name', 'Domains', 'Precedence'],
        style: { head: ['cyan'] },
        colWidths: [40, 10, 12]
      });
      
      for (const rule of createdRules) {
        successTable.push([
          rule.name,
          rule.domains.toString(),
          rule.precedence.toString()
        ]);
      }
      
      console.log(successTable.toString());
    }
    
    if (failedRules.length > 0) {
      console.log(chalk.yellow(`\n⚠️  ${failedRules.length} rules were skipped or failed`));
    }
    
    // Provide recommendations
    console.log(chalk.cyan.bold('\n💡 Recommendations:\n'));
    console.log(chalk.white('1. Review the created rules in your Cloudflare dashboard'));
    console.log(chalk.white('2. Adjust precedence values if needed (lower = higher priority)'));
    console.log(chalk.white('3. Monitor logs to ensure legitimate traffic is flowing'));
    console.log(chalk.white('4. Consider creating custom lists for frequently accessed domains'));
    console.log(chalk.white('5. Use the monitor command to track rule effectiveness:\n'));
    console.log(chalk.gray('   npm run start -- monitor --port 8081\n'));
  }

  async analyzeExistingRules(): Promise<void> {
    const spinner = ora('Analyzing existing rules...').start();
    
    try {
      const rules = await this.ruleManager.listRules();
      const allowRules = (rules as any[]).filter(r => r.action === 'allow');
      const blockRules = (rules as any[]).filter(r => r.action === 'block');
      
      spinner.succeed('Analysis complete');
      
      console.log(chalk.cyan.bold('\n📈 Current Rule Statistics:\n'));
      
      const statsTable = new Table({
        head: ['Metric', 'Count'],
        style: { head: ['cyan'] }
      });
      
      statsTable.push(
        ['Total Rules', rules.length.toString()],
        ['Allow Rules', chalk.green(allowRules.length.toString())],
        ['Block Rules', chalk.red(blockRules.length.toString())],
        ['Enabled Rules', rules.filter(r => r.enabled).length.toString()],
        ['Disabled Rules', rules.filter(r => !r.enabled).length.toString()]
      );
      
      console.log(statsTable.toString());
      
      // Check for potential conflicts
      const conflicts = this.findPotentialConflicts(allowRules, blockRules);
      if (conflicts.length > 0) {
        console.log(chalk.yellow('\n⚠️  Potential Conflicts Detected:\n'));
        for (const conflict of conflicts) {
          console.log(chalk.yellow(`  • ${conflict}`));
        }
      }
      
    } catch (error: any) {
      spinner.fail('Failed to analyze rules');
      throw error;
    }
  }

  private findPotentialConflicts(allowRules: unknown[], blockRules: unknown[]): string[] {
    const conflicts: string[] = [];
    
    // Check for overlapping precedence
    for (const allow of allowRules as any[]) {
      for (const block of blockRules as any[]) {
        if (Math.abs(allow.precedence - block.precedence) < 10) {
          conflicts.push(
            `"${allow.name}" (precedence ${allow.precedence}) may conflict with "${block.name}" (precedence ${block.precedence})`
          );
        }
      }
    }
    
    return conflicts;
  }
}

// Main execution
async function main() {
  try {
    const creator = new AllowRuleCreator();
    
    // First analyze existing rules
    await creator.analyzeExistingRules();
    
    // Create the allow rules
    await creator.createAllowRules();
    
    console.log(chalk.green('\n✅ Allow rule creation complete!'));
    console.log(chalk.gray('\nNote: These rules allow common legitimate services.'));
    console.log(chalk.gray('Review and adjust based on your specific security requirements.'));
    
  } catch (error: any) {
    console.error(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  }
}

main();