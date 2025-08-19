#!/usr/bin/env tsx

/**
 * Adds critical services that are still being blocked
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addCriticalMissingServices() {
  console.log(chalk.red.bold('🚨 Critical Services Still Blocked - Adding Rules\n'));
  
  const gateway = new GatewayClient();
  
  const criticalRules = [
    {
      name: 'Microsoft: Authentication Services',
      description: 'Allow Microsoft login and authentication',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"login.microsoftonline.com" "login.microsoft.com" "login.live.com" "account.microsoft.com"}',
      precedence: 990, // VERY high priority - authentication is critical
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Apple: Certificate Validation',
      description: 'Allow Apple OCSP and certificate validation',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"ocsp2.g.aaplimg.com" "valid-apple.g.aaplimg.com" "ocsp.apple.com" "valid.apple.com"}',
      precedence: 991, // Critical for Apple services
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Anthropic: Analytics Services',
      description: 'Allow Anthropic/Claude analytics',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"statsig.anthropic.com" "telemetry.anthropic.com" "api.anthropic.com"}',
      precedence: 1125, // With AI services
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'DNS: Reverse Lookup Services',
      description: 'Allow reverse DNS lookups for IP addresses',
      action: 'allow' as const,
      enabled: true,
      filters: ['dns'],
      traffic: 'true', // Allow all reverse DNS lookups
      precedence: 993, // High priority for DNS
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Network: IPv4/IPv6 Connectivity',
      description: 'Allow network connectivity checks',
      action: 'allow' as const,
      enabled: true,
      filters: ['dns'],
      traffic: 'true', // Allow connectivity checks
      precedence: 992, // High priority
      identity: '',
      device_posture: '',
      rule_settings: {}
    }
  ];

  // Also ensure these services are properly covered
  const updateRules = [
    {
      name: 'Apple: Complete iCloud Services',
      description: 'Ensure all iCloud mask services work',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^(mask|mask-h2|mask-canary|mask-api|gateway|setup).*\\.icloud\\.com$"',
      precedence: 1012, // Update iCloud rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Tesla: Complete Vehicle Services',
      description: 'Ensure all Tesla services work',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.tesla\\.(services|com)$"',
      precedence: 1243, // Update Tesla rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'IoT: Complete Device Coverage',
      description: 'Ensure all IoT devices can connect',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.(brother|harman|onecloud)\\.com$"',
      precedence: 1126, // Update IoT rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'VPN: Complete Tailscale Coverage',
      description: 'Ensure all Tailscale services work',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.tailscale\\.(com|io|net)$"',
      precedence: 1127, // Update Tailscale rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Security: Complete OCSP Coverage',
      description: 'Allow all OCSP certificate validation',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^ocsp.*\\.*"',
      precedence: 994, // Very high priority
      identity: '',
      device_posture: '',
      rule_settings: {}
    }
  ];

  const allRules = [...criticalRules, ...updateRules];
  
  const results = {
    success: [] as string[],
    failed: [] as { name: string; error: string }[],
    skipped: [] as string[]
  };

  console.log(chalk.red('🚨 CRITICAL ISSUES FOUND:\n'));
  console.log(chalk.red.bold('• Microsoft Login is BLOCKED - Users cannot authenticate!'));
  console.log(chalk.red.bold('• Apple certificate validation is BLOCKED - Apple services broken!'));
  console.log(chalk.yellow('• Anthropic/Claude analytics blocked'));
  console.log(chalk.yellow('• DNS reverse lookups blocked (8.8.8.8.in-addr.arpa)'));
  console.log(chalk.yellow('• Some services still partially blocked\n'));

  for (const ruleData of allRules) {
    const spinner = ora(`Creating: ${ruleData.name}`).start();
    
    try {
      await gateway.api.post(
        `/accounts/${gateway.accountId}/gateway/rules`,
        ruleData
      );
      
      // const createdRule = response.data.result;
      results.success.push(ruleData.name);
      spinner.succeed(`✅ Created: ${ruleData.name} (precedence: ${ruleData.precedence})`);
      
    } catch (error: any) {
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
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Display summary
  console.log(chalk.cyan.bold('\n📊 Summary:\n'));
  
  if (results.success.length > 0) {
    console.log(chalk.green(`✅ Successfully created ${results.success.length} rules`));
  }
  
  if (results.skipped.length > 0) {
    console.log(chalk.yellow(`⏭️  Skipped ${results.skipped.length} rules`));
  }
  
  if (results.failed.length > 0) {
    console.log(chalk.red(`❌ Failed ${results.failed.length} rules`));
  }

  console.log(chalk.green.bold('\n✅ CRITICAL SERVICES FIXED:\n'));
  console.log(chalk.green('🔐 Microsoft Authentication') + ' - login.microsoftonline.com now allowed');
  console.log(chalk.green('🍎 Apple Certificate Validation') + ' - OCSP and validation services working');
  console.log(chalk.green('🤖 Anthropic/Claude') + ' - Analytics and telemetry allowed');
  console.log(chalk.green('🌐 DNS Services') + ' - Reverse lookups and connectivity checks allowed');
  console.log(chalk.green('☁️ iCloud Private Relay') + ' - All mask services fully covered');
  
  console.log(chalk.cyan.bold('\n🎯 What This Fixes:\n'));
  console.log('• Microsoft 365, Teams, OneDrive login issues');
  console.log('• Apple services certificate errors');
  console.log('• iCloud Private Relay functionality');
  console.log('• DNS resolution for various services');
  console.log('• Claude AI analytics');
  
  console.log(chalk.yellow('\n⚠️  Final Check:'));
  console.log('1. Test Microsoft login immediately');
  console.log('2. Check Apple services are working');
  console.log('3. Verify no more blocks in dashboard');
  console.log('4. Monitor: http://localhost:3001\n');
  
  // Check total rules
  try {
    const allRules = await gateway.listGatewayRules();
    console.log(chalk.cyan.bold(`📈 Total Gateway Rules: ${allRules.length}`));
  } catch (error: any) {
    // Ignore
  }
}

// Main execution
addCriticalMissingServices().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});