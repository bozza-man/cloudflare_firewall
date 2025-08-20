#!/usr/bin/env node

/**
 * Add NPM Registry domains to Cloudflare Gateway Allow List
 * Fixes npm connectivity issues caused by Gateway blocking
 */

import chalk from 'chalk';
import ora from 'ora';
import { GatewayClient } from '../api/gateway-client.js';
import { config } from '../utils/config.js';

const NPM_DOMAINS = [
  'registry.npmjs.org',
  'registry.npmjs.com',
  'npm.pkg.github.com',
  'registry.yarnpkg.com',
  'registry.npmmirror.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'nodejs.org',
  'github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'objects.githubusercontent.com'
];

async function createNpmAllowRule() {
  const spinner = ora('Creating NPM registry allow rule...').start();
  
  try {
    const client = new GatewayClient();
    
    // Check if rule already exists
    spinner.text = 'Checking for existing NPM allow rules...';
    const existingRules = await client.listGatewayRules();
    
    const npmRule = existingRules.find(rule => 
      rule.name.toLowerCase().includes('npm') && 
      rule.name.toLowerCase().includes('allow') &&
      rule.action === 'allow'
    );
    
    if (npmRule) {
      spinner.succeed(`NPM allow rule already exists: ${npmRule.name}`);
      console.log(chalk.yellow('Info: If you are still having issues, check the rule precedence'));
      return;
    }
    
    // Create the allow rule for NPM
    spinner.text = 'Creating NPM registry allow rule...';
    
    const domainFilter = NPM_DOMAINS.map(domain => `"${domain}"`).join(' ');
    
    const newRule = await client.createGatewayRule({
      name: 'HTTP: Allow NPM Registry and Package Managers',
      description: 'Allows access to NPM, Yarn, and other package registry domains for development tools',
      action: 'allow',
      enabled: true,
      filters: [`http.request.host in {${domainFilter}}`],
      traffic: 'http',
      precedence: 500 // High priority to ensure it's evaluated early
    });
    
    spinner.succeed('NPM registry allow rule created successfully!');
    
    console.log(chalk.green('\n✅ Rule Details:'));
    console.log(`   Name: ${newRule.name}`);
    console.log(`   ID: ${newRule.id}`);
    console.log(`   Action: ${newRule.action}`);
    console.log(`   Precedence: ${newRule.precedence}`);
    console.log(`   Domains: ${NPM_DOMAINS.length} package registry domains`);
    
    // Also create a DNS allow rule
    spinner.start('Creating DNS allow rule for NPM...');
    
    const dnsRule = await client.createGatewayRule({
      name: 'DNS: Allow NPM Registry and Package Managers',
      description: 'Allows DNS resolution for NPM and package registry domains',
      action: 'allow',
      enabled: true,
      filters: [`dns.fqdn in {${domainFilter}}`],
      traffic: 'dns',
      precedence: 501
    });
    
    spinner.succeed('DNS allow rule created successfully!');
    
    console.log(chalk.green('\n✅ DNS Rule Details:'));
    console.log(`   Name: ${dnsRule.name}`);
    console.log(`   ID: ${dnsRule.id}`);
    console.log(`   Action: ${dnsRule.action}`);
    console.log(`   Precedence: ${dnsRule.precedence}`);
    
    console.log(chalk.cyan('\n📝 Next Steps:'));
    console.log('1. Wait 30-60 seconds for rules to propagate');
    console.log('2. Try running npm install again');
    console.log('3. If issues persist, flush your DNS cache:');
    console.log('   macOS: sudo dscacheutil -flushcache');
    console.log('   Windows: ipconfig /flushdns');
    console.log('   Linux: sudo systemd-resolve --flush-caches');
    
  } catch (error) {
    spinner.fail('Failed to create NPM allow rule');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🔧 Fixing NPM Connectivity Issues\n'));
  console.log('This will create Gateway rules to allow NPM registry access');
  console.log(`Account ID: ${config.cloudflare.accountId}`);
  
  await createNpmAllowRule();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { createNpmAllowRule };
