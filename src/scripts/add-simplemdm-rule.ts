#!/usr/bin/env tsx

/**
 * Adds allow rule for SimpleMDM mobile device management
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addSimpleMDMRule() {
  console.log(chalk.cyan.bold('🛡️  Adding SimpleMDM Allow Rule\n'));
  
  const gateway = new GatewayClient();
  
  // SimpleMDM domains and services
  const simpleMDMRule = {
    name: 'Security: SimpleMDM Device Management',
    description: 'Allow SimpleMDM mobile device management platform',
    action: 'allow' as const,
    enabled: true,
    filters: ['http'],
    traffic: 'http.request.host in {"simplemdm.com" "a.simplemdm.com" "api.simplemdm.com" "simplemdm.s3.amazonaws.com"} or http.request.host matches "^.*\\.simplemdm\\.com$"',
    precedence: 1115, // Right after Cloudflare Services
    identity: '',
    device_posture: '',
    rule_settings: {}
  };

  const spinner = ora(`Creating: ${simpleMDMRule.name}`).start();
  
  try {
    // Create the rule using the Gateway API
    const response = await gateway.api.post(
      `/accounts/${gateway.accountId}/gateway/rules`,
      simpleMDMRule
    );
    
    const createdRule = response.data.result;
    spinner.succeed(`✅ Created: ${simpleMDMRule.name}`);
    
    console.log(chalk.green('\n✅ Successfully added SimpleMDM rule'));
    console.log(chalk.gray(`   Rule ID: ${createdRule.id}`));
    console.log(chalk.gray(`   Precedence: ${simpleMDMRule.precedence}`));
    console.log(chalk.gray(`   Status: Enabled`));
    
    console.log(chalk.cyan.bold('\n📝 Rule Details:\n'));
    console.log('This rule allows:');
    console.log('  • simplemdm.com - Main SimpleMDM website and console');
    console.log('  • a.simplemdm.com - SimpleMDM agent/enrollment');
    console.log('  • api.simplemdm.com - SimpleMDM API endpoints');
    console.log('  • *.simplemdm.com - All SimpleMDM subdomains');
    console.log('  • simplemdm.s3.amazonaws.com - SimpleMDM file storage');
    
    console.log(chalk.cyan.bold('\n💡 Additional Considerations:\n'));
    console.log('SimpleMDM may also use these services:');
    console.log('  • Apple Push Notification Service (already allowed via Apple rules)');
    console.log('  • Apple Device Enrollment Program (dep.apple.com)');
    console.log('  • AWS S3 for file downloads (already allowed via AWS rule)');
    
    // Check if we need to add Apple DEP
    console.log(chalk.yellow('\n⚠️  Note: If devices cannot enroll, you may also need:'));
    console.log('  • deviceenrollment.apple.com');
    console.log('  • deviceservices-external.apple.com');
    console.log('  • gdmf.apple.com (MDM feedback)');
    
  } catch (error: any) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      spinner.info(`⏭️  Skipped: SimpleMDM rule already exists`);
    } else {
      spinner.fail(`❌ Failed to create SimpleMDM rule`);
      console.error(chalk.red(`   Error: ${errorMessage}`));
      
      console.log(chalk.yellow('\n💡 Alternative: Add SimpleMDM manually in the dashboard:'));
      console.log('1. Go to Zero Trust → Gateway → Firewall policies');
      console.log('2. Create a new rule with:');
      console.log('   • Name: Security: SimpleMDM Device Management');
      console.log('   • Action: Allow');
      console.log('   • Selector: Host');
      console.log('   • Operator: in');
      console.log('   • Value: simplemdm.com, a.simplemdm.com, api.simplemdm.com');
      console.log('   • Precedence: 1115');
    }
  }

  console.log(chalk.cyan.bold('\n📊 Current MDM-related rules:\n'));
  
  // List any existing MDM/device management rules
  try {
    const rules = await gateway.listGatewayRules();
    const mdmRules = rules.filter(r => 
      r.name.toLowerCase().includes('mdm') ||
      r.name.toLowerCase().includes('device') ||
      r.name.toLowerCase().includes('apple') ||
      r.traffic?.includes('simplemdm')
    );
    
    if (mdmRules.length > 0) {
      console.log('Found related rules:');
      mdmRules.forEach(rule => {
        const status = rule.enabled ? '✅' : '⏸️';
        console.log(`  ${status} ${rule.name} (precedence: ${rule.precedence})`);
      });
    }
  } catch (error) {
    console.error(chalk.red('Could not fetch existing rules'));
  }
}

// Main execution
addSimpleMDMRule().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});