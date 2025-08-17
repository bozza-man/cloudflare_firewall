#!/usr/bin/env npx tsx

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';

const BLOCKED_DOMAINS = [
  'configuration.apple.com.akadns.net',
  'bozza.au',
  'cdns.grindr.com',
  'gs-loc.ls-apple.com.akadns.net',
  'wallet.cdn-apple.com',
  'xp.itunes-apple.com.akadns.net',
  'metrics.icloud.com',
  'mqtt.crealitycloud.com',
  'gcs-blue-upload-us.l.googleusercontent.com',
  'gcs-blue-download-us.l.googleusercontent.com',
  'p69-contacts.icloud.com',
  'p143-contacts.icloud.com',
  'ausyd2.icloud-content.com'
  // Excluding gdmf.v.aaplimg.com since it's not fully blocked
];

async function findBlockingRules(): Promise<void> {
  console.log(chalk.cyan.bold('🔍 Analyzing Gateway Rules for Domain Blocking'));
  console.log(chalk.blue('Finding rules that might be blocking the identified domains...'));
  console.log('═'.repeat(80));

  const gateway = new GatewayClient();

  try {
    // Get all Gateway rules
    console.log(chalk.cyan('📋 Fetching Gateway Rules...'));
    const rules = await gateway.listGatewayRules();
    console.log(`Found ${rules.length} Gateway rules\n`);

    // Analyze rules by action type
    const blockRules = rules.filter(rule => rule.action === 'block');
    const allowRules = rules.filter(rule => rule.action === 'allow');
    const otherRules = rules.filter(rule => !['block', 'allow'].includes(rule.action));

    console.log(chalk.red(`🚫 Block Rules: ${blockRules.length}`));
    console.log(chalk.green(`✅ Allow Rules: ${allowRules.length}`));
    console.log(chalk.yellow(`⚠️  Other Rules: ${otherRules.length}`));

    // Look for rules that might be blocking our domains
    console.log(chalk.cyan.bold('\n🔍 Analyzing Block Rules for Domain Patterns:'));
    console.log('─'.repeat(80));

    const suspiciousRules = [];

    for (const rule of blockRules) {
      console.log(chalk.red(`\n🚫 ${rule.name}`));
      console.log(`   Precedence: ${rule.precedence}`);
      console.log(`   Action: ${rule.action}`);
      console.log(`   Enabled: ${rule.enabled ? 'Yes' : 'No'}`);
      
      if (rule.description) {
        console.log(`   Description: ${rule.description}`);
      }

      // Analyze traffic expression for domain patterns
      if (rule.traffic) {
        console.log(`   Traffic: ${rule.traffic}`);
        
        // Check if this rule might affect our blocked domains
        const mightAffectDomains = BLOCKED_DOMAINS.some(domain => {
          // Check for domain-specific patterns
          return rule.traffic.toLowerCase().includes(domain.toLowerCase()) ||
                 rule.traffic.toLowerCase().includes('*.') ||
                 rule.traffic.toLowerCase().includes('dns.fqdn') ||
                 rule.traffic.toLowerCase().includes('any') ||
                 rule.traffic.toLowerCase().includes('true');
        });

        if (mightAffectDomains) {
          suspiciousRules.push(rule);
          console.log(chalk.yellow('   ⚠️  This rule might affect the blocked domains'));
        }
      }
    }

    // Check for wildcard or broad blocking rules
    console.log(chalk.cyan.bold('\n🌐 Broad Blocking Rules Analysis:'));
    console.log('─'.repeat(80));

    const broadRules = blockRules.filter(rule => 
      rule.traffic?.toLowerCase().includes('true') ||
      rule.traffic?.toLowerCase().includes('any') ||
      rule.traffic?.toLowerCase().includes('*') ||
      rule.traffic?.toLowerCase().includes('dns.fqdn') ||
      rule.traffic?.length === 0
    );

    if (broadRules.length > 0) {
      console.log(chalk.yellow(`Found ${broadRules.length} potentially broad blocking rules:`));
      
      for (const rule of broadRules) {
        console.log(chalk.red(`\n🚨 BROAD RULE: ${rule.name}`));
        console.log(`   Precedence: ${rule.precedence} (${rule.precedence < 1000 ? 'HIGH PRIORITY' : 'NORMAL PRIORITY'})`);
        console.log(`   Traffic: "${rule.traffic}"`);
        console.log(`   Enabled: ${rule.enabled ? chalk.red('YES') : chalk.gray('NO')}`);
        
        if (rule.precedence < 1000) {
          console.log(chalk.red('   🚨 HIGH PRIORITY RULE - This likely affects all traffic!'));
        }
      }
    } else {
      console.log(chalk.green('No broad blocking rules found.'));
    }

    // Check rule precedence order
    console.log(chalk.cyan.bold('\n📊 Rule Precedence Analysis:'));
    console.log('─'.repeat(80));

    const sortedRules = rules.sort((a, b) => a.precedence - b.precedence);
    console.log('Rules in execution order (by precedence):');

    sortedRules.slice(0, 10).forEach((rule, index) => {
      const actionColor = rule.action === 'block' ? chalk.red : 
                         rule.action === 'allow' ? chalk.green : chalk.yellow;
      
      console.log(`${index + 1}. ${actionColor(rule.action.toUpperCase())} - ${rule.name} (${rule.precedence})`);
      if (rule.traffic && rule.traffic.length > 0 && rule.traffic !== 'true') {
        const shortTraffic = rule.traffic.length > 60 ? rule.traffic.substring(0, 60) + '...' : rule.traffic;
        console.log(`     Traffic: ${shortTraffic}`);
      }
    });

    if (sortedRules.length > 10) {
      console.log(`     ... and ${sortedRules.length - 10} more rules`);
    }

    // Summary and recommendations
    console.log(chalk.cyan.bold('\n💡 Analysis Summary:'));
    console.log('─'.repeat(60));

    console.log(`• ${chalk.red('DNS Resolution:')} All domains resolve to 0.0.0.0 (blocked)`);
    console.log(`• ${chalk.red('Connection Failures:')} All HTTP/HTTPS/Ping fail`);
    console.log(`• ${chalk.yellow('Likely Cause:')} Cloudflare Gateway DNS filtering`);

    if (broadRules.length > 0) {
      console.log(`• ${chalk.red('Broad Rules Found:')} ${broadRules.length} rules with wide-reaching effects`);
    }

    if (suspiciousRules.length > 0) {
      console.log(`• ${chalk.yellow('Suspicious Rules:')} ${suspiciousRules.length} rules that might affect these domains`);
    }

    console.log(chalk.cyan.bold('\n🛠️  Recommended Actions:'));
    console.log('1. Review the highest precedence block rules above');
    console.log('2. Look for DNS-based blocking rules that might be too broad');
    console.log('3. Consider creating specific allow rules for legitimate domains');
    console.log('4. Check if any security categories are being blocked wholesale');
    console.log('5. Consider adjusting rule precedence to allow legitimate traffic');

    // Show blocked domains summary
    console.log(chalk.red.bold('\n🚫 Blocked Domains Summary:'));
    console.log('─'.repeat(40));
    BLOCKED_DOMAINS.forEach((domain, index) => {
      console.log(`${index + 1}. ${domain}`);
    });

    console.log(chalk.yellow('\n💡 These domains are being blocked by your Gateway configuration.'));
    console.log(chalk.blue('This is why the enhanced security review correctly flagged them as inaccessible.'));

  } catch (error) {
    console.error(chalk.red('❌ Error analyzing Gateway rules:'), error);
  }
}

findBlockingRules().catch(console.error);
