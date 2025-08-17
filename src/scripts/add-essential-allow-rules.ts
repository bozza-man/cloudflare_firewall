#!/usr/bin/env tsx

/**
 * Adds essential allow rules for legitimate services
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addEssentialAllowRules() {
  console.log(chalk.cyan.bold('🛡️  Adding Essential Allow Rules\n'));
  
  const gateway = new GatewayClient();
  
  // Define rules using the same format as existing rules
  const rules = [
    {
      name: 'Development: GitHub & Git Services',
      description: 'Allow GitHub and related development services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"github.com" "githubusercontent.com" "github.io" "githubassets.com"}',
      precedence: 1100,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Development: Package Managers',
      description: 'Allow NPM, PyPI, and other package registries',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"npmjs.com" "registry.npmjs.org" "pypi.org" "files.pythonhosted.org" "rubygems.org"}',
      precedence: 1101,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'CDN: JavaScript Libraries',
      description: 'Allow CDN services for web libraries',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"cdn.jsdelivr.net" "unpkg.com" "cdnjs.cloudflare.com" "esm.sh" "skypack.dev"}',
      precedence: 1102,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Cloud: Google Core Services',
      description: 'Allow essential Google APIs and services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(googleapis\\.com|gstatic\\.com|googleusercontent\\.com)$"',
      precedence: 1103,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Cloud: AWS Infrastructure',
      description: 'Allow AWS services and CloudFront',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(amazonaws\\.com|cloudfront\\.net|aws\\.amazon\\.com)$"',
      precedence: 1104,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Cloud: Microsoft Azure',
      description: 'Allow Azure and Microsoft cloud services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(azure\\.com|azurewebsites\\.net|azureedge\\.net|windowsazure\\.com)$"',
      precedence: 1105,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Communication: Slack',
      description: 'Allow Slack and related services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(slack\\.com|slack-edge\\.com|slack-imgs\\.com|slackb\\.com)$"',
      precedence: 1106,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Communication: Video Conferencing',
      description: 'Allow Zoom and Teams',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"zoom.us" "zoom.com" "teams.microsoft.com" "teams.live.com"}',
      precedence: 1107,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Productivity: Atlassian Suite',
      description: 'Allow Jira, Confluence, and Atlassian services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(atlassian\\.com|atlassian\\.net|jira\\.com|confluence\\.com|statuspage\\.io)$"',
      precedence: 1108,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Productivity: Documentation Tools',
      description: 'Allow Notion and similar tools',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"notion.so" "notion.site" "notion-static.com"}',
      precedence: 1109,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Security: Authentication Services',
      description: 'Allow SSO and auth providers',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"auth0.com" "okta.com" "oktacdn.com" "onelogin.com" "duo.com"}',
      precedence: 1110,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Security: Password Managers',
      description: 'Allow password management services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"1password.com" "lastpass.com" "bitwarden.com" "dashlane.com"}',
      precedence: 1111,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Monitoring: Application Performance',
      description: 'Allow APM and error tracking',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"sentry.io" "datadoghq.com" "newrelic.com" "bugsnag.com" "rollbar.com"}',
      precedence: 1112,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'AI: Language Models & APIs',
      description: 'Allow AI service providers',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"openai.com" "api.openai.com" "anthropic.com" "claude.ai" "huggingface.co"}',
      precedence: 1113,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Infrastructure: Cloudflare Services',
      description: 'Allow Cloudflare infrastructure',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.cloudflare\\.com$" or http.request.host == "cloudflare.com"',
      precedence: 1114,
      identity: '',
      device_posture: '',
      rule_settings: {}
    }
  ];

  const results = {
    success: [] as string[],
    failed: [] as { name: string; error: string }[],
    skipped: [] as string[]
  };

  for (const ruleData of rules) {
    const spinner = ora(`Creating: ${ruleData.name}`).start();
    
    try {
      // Create the rule directly using the Gateway API
      await gateway.api.post(
        `/accounts/${gateway.accountId}/gateway/rules`,
        ruleData
      );
      
      // const createdRule = response.data.result;
      results.success.push(ruleData.name);
      spinner.succeed(`✅ Created: ${ruleData.name} (precedence: ${ruleData.precedence})`);
      
    } catch (error) {
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
      
      if (errorMessage.includes('already exists') || 
          errorMessage.includes('duplicate') || 
          errorMessage.includes('similar rule')) {
        results.skipped.push(ruleData.name);
        spinner.info(`⏭️  Skipped: ${ruleData.name} (similar rule exists)`);
      } else {
        results.failed.push({ name: ruleData.name, error: errorMessage });
        spinner.fail(`❌ Failed: ${ruleData.name}`);
        console.error(chalk.red(`   Error: ${errorMessage}`));
      }
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Display summary
  console.log(chalk.cyan.bold('\n📊 Summary:\n'));
  
  if (results.success.length > 0) {
    console.log(chalk.green(`✅ Successfully created ${results.success.length} rules:`));
    results.success.forEach(name => {
      console.log(chalk.gray(`   • ${name}`));
    });
  }
  
  if (results.skipped.length > 0) {
    console.log(chalk.yellow(`\n⏭️  Skipped ${results.skipped.length} rules (already exist):`));
    results.skipped.forEach(name => {
      console.log(chalk.gray(`   • ${name}`));
    });
  }
  
  if (results.failed.length > 0) {
    console.log(chalk.red(`\n❌ Failed to create ${results.failed.length} rules:`));
    results.failed.forEach(({ name, error }) => {
      console.log(chalk.gray(`   • ${name}: ${error}`));
    });
  }

  console.log(chalk.cyan.bold('\n💡 Next Steps:\n'));
  console.log('1. Review the rules in your Cloudflare dashboard');
  console.log('2. Test that legitimate services are now accessible');
  console.log('3. Monitor the dashboard to see rule effectiveness:');
  console.log(chalk.gray('   http://localhost:3001\n'));
  console.log('4. Adjust precedence if needed (lower number = higher priority)');
  console.log('5. Check for any remaining blocked legitimate traffic\n');
}

// Main execution
addEssentialAllowRules().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});