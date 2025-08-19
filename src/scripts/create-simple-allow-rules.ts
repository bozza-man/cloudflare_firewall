#!/usr/bin/env tsx

/**
 * Creates allow rules for legitimate services using correct Gateway syntax
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

interface AllowRule {
  name: string;
  description: string;
  traffic: string;
  precedence: number;
}

async function createAllowRules() {
  console.log(chalk.cyan.bold('🛡️  Creating Allow Rules for Legitimate Services\n'));
  
  const gateway = new GatewayClient();
  
  // Define allow rules with proper Gateway syntax
  const allowRules: AllowRule[] = [
    {
      name: 'Allow: GitHub and Development',
      description: 'Allow GitHub and development platforms',
      traffic: 'http.request.host in {"github.com" "githubusercontent.com" "gitlab.com" "npmjs.com" "registry.npmjs.org"}',
      precedence: 1001
    },
    {
      name: 'Allow: CDN Services',
      description: 'Allow content delivery networks',
      traffic: 'http.request.host in {"cdn.jsdelivr.net" "unpkg.com" "cdnjs.cloudflare.com" "jsdelivr.com" "esm.sh"}',
      precedence: 1002
    },
    {
      name: 'Allow: Google APIs',
      description: 'Allow Google services and APIs',
      traffic: 'http.request.host in {"googleapis.com" "gstatic.com" "googleusercontent.com" "firebase.googleapis.com"}',
      precedence: 1003
    },
    {
      name: 'Allow: Microsoft Cloud',
      description: 'Allow Microsoft and Azure services',
      traffic: 'http.request.host matches "^.*\\.(azure|microsoft|office365|sharepoint)\\.com$"',
      precedence: 1006
    },
    {
      name: 'Allow: Communication Tools',
      description: 'Allow Slack, Zoom, and Teams',
      traffic: 'http.request.host in {"slack.com" "slack-edge.com" "zoom.us" "teams.microsoft.com"}',
      precedence: 1008
    },
    {
      name: 'Allow: Productivity Tools',  
      description: 'Allow project management tools',
      traffic: 'http.request.host in {"notion.so" "atlassian.com" "atlassian.net" "trello.com" "asana.com"}',
      precedence: 1009
    },
    {
      name: 'Allow: Authentication Services',
      description: 'Allow identity and auth providers',
      traffic: 'http.request.host in {"auth0.com" "okta.com" "1password.com" "lastpass.com" "duo.com"}',
      precedence: 1010
    },
    {
      name: 'Allow: Monitoring Tools',
      description: 'Allow application monitoring',
      traffic: 'http.request.host in {"sentry.io" "datadoghq.com" "newrelic.com" "pagerduty.com"}',
      precedence: 1011
    },
    {
      name: 'Allow: AI Services',
      description: 'Allow AI and ML platforms',
      traffic: 'http.request.host in {"openai.com" "api.openai.com" "anthropic.com" "claude.ai" "huggingface.co"}',
      precedence: 1012
    },
    {
      name: 'Allow: Package Registries',
      description: 'Allow various package managers',
      traffic: 'http.request.host in {"pypi.org" "rubygems.org" "packagist.org" "crates.io" "pkg.go.dev"}',
      precedence: 1013
    }
  ];
  
  const createdRules = [];
  const failedRules = [];
  
  for (const ruleConfig of allowRules) {
    const spinner = ora(`Creating: ${ruleConfig.name}`).start();
    
    try {
      // Create the rule using raw API
      const rule = await gateway.createGatewayRule({
        name: ruleConfig.name,
        description: ruleConfig.description,
        precedence: ruleConfig.precedence,
        action: 'allow',
        enabled: true,
        filters: ['http'],
        traffic: ruleConfig.traffic,
        rule_settings: {}
      });
      
      createdRules.push(rule);
      spinner.succeed(`Created: ${ruleConfig.name} (precedence: ${ruleConfig.precedence})`);
      
    } catch (error: any) {
      failedRules.push({ name: ruleConfig.name, error: error.message });
      
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        spinner.info(`Skipped: ${ruleConfig.name} (already exists)`);
      } else {
        spinner.fail(`Failed: ${ruleConfig.name}`);
        console.error(chalk.red(`  Error: ${error.message}`));
      }
    }
    
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log(chalk.cyan.bold('\n📊 Summary:\n'));
  
  if (createdRules.length > 0) {
    console.log(chalk.green(`✅ Successfully created ${createdRules.length} allow rules`));
    
    for (const rule of createdRules) {
      console.log(chalk.gray(`  • ${rule.name} (ID: ${rule.id})`));
    }
  }
  
  if (failedRules.length > 0) {
    console.log(chalk.yellow(`\n⚠️  ${failedRules.length} rules failed or were skipped`));
  }
  
  console.log(chalk.cyan.bold('\n💡 Next Steps:\n'));
  console.log('1. Review the created rules in your Cloudflare dashboard');
  console.log('2. Test that legitimate services are now accessible');
  console.log('3. Monitor logs to ensure no unwanted traffic is allowed');
  console.log('4. Run the monitor to track rule effectiveness:');
  console.log(chalk.gray('\n   npm run start -- monitor --port 8081\n'));
}

// Main execution
createAllowRules().catch((error) => {
  console.error(chalk.red('❌ Error:'), error.message);
  process.exit(1);
});