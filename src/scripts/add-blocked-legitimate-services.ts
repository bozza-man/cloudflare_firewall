#!/usr/bin/env tsx

/**
 * Adds allow rules for legitimate services currently being blocked
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addBlockedLegitimateServices() {
  console.log(chalk.cyan.bold('🔓 Adding Allow Rules for Blocked Legitimate Services\n'));
  
  const gateway = new GatewayClient();
  
  const rules = [
    {
      name: 'Security: Certificate Validation (OCSP)',
      description: 'Allow OCSP certificate validation services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"ocsp.digicert.com" "ocsp.entrust.net" "ocsp.verisign.com" "ocsp.sectigo.com" "ocsp.godaddy.com" "ocsp.comodoca.com" "ocsp.usertrust.com"}',
      precedence: 995, // Very high priority - security critical
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Apple: iCloud Services Extended',
      description: 'Allow iCloud gateway and mask services for Private Relay',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"gateway.icloud.com" "mask-canary.icloud.com" "mask-h2.icloud.com" "mask.icloud.com" "mask-api.icloud.com"}',
      precedence: 1009, // With other Apple services
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Tesla: Vehicle Services',
      description: 'Allow Tesla telemetry and map services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.tesla\\.(services|com)$" or http.request.host in {"telemetry-prd.vn.tesla.services" "maps-ap-prd.go.tesla.services"}',
      precedence: 1241, // Near existing Tesla API rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Monitoring: Sentry Error Tracking',
      description: 'Allow Sentry.io ingest endpoints',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.ingest\\.sentry\\.io$" or http.request.host == "sentry.io"',
      precedence: 1116, // After other monitoring tools
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Networking: Tailscale VPN',
      description: 'Allow Tailscale logging and control plane',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"log.tailscale.com" "controlplane.tailscale.com" "login.tailscale.com"}',
      precedence: 1117,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Microsoft: Telemetry Services',
      description: 'Allow Microsoft telemetry and events',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.events\\.data\\.microsoft\\.com$" or http.request.host == "mobile.events.data.microsoft.com"',
      precedence: 1118,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'IoT: Device Management',
      description: 'Allow IoT device connections (Brother, Harman)',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"n.connections.brother.com" "ota.onecloud.harman.com" "brother.com" "harman.com"}',
      precedence: 1119,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'CDN: Akamai Edge',
      description: 'Allow Akamai CDN edge servers',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.akamaiedge\\.net$"',
      precedence: 1120,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Software: API Services',
      description: 'Allow legitimate software API endpoints',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"api.acasa-software.de" "t1.cnrd.io"}',
      precedence: 1121,
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Network: IPv4 Only ARPA',
      description: 'Allow IPv4only.arpa for dual-stack connectivity checks',
      action: 'allow' as const,
      enabled: true,
      filters: ['dns'],
      traffic: 'dns.question.name == "ipv4only.arpa"',
      precedence: 994, // High priority for network connectivity
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

  console.log(chalk.yellow('📋 Identified Legitimate Services Being Blocked:\n'));
  console.log('• Certificate Validation (OCSP) - Critical for HTTPS');
  console.log('• iCloud Private Relay - Apple privacy service');
  console.log('• Tesla vehicle telemetry and maps');
  console.log('• Sentry error tracking');
  console.log('• Tailscale VPN services');
  console.log('• Microsoft telemetry');
  console.log('• IoT devices (Brother printers, Harman audio)');
  console.log('• Akamai CDN');
  console.log('• IPv4only.arpa connectivity checks\n');

  for (const ruleData of rules) {
    const spinner = ora(`Creating: ${ruleData.name}`).start();
    
    try {
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
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Display summary
  console.log(chalk.cyan.bold('\n📊 Summary:\n'));
  
  if (results.success.length > 0) {
    console.log(chalk.green(`✅ Successfully created ${results.success.length} rules`));
  }
  
  if (results.skipped.length > 0) {
    console.log(chalk.yellow(`⏭️  Skipped ${results.skipped.length} rules (already exist)`));
  }
  
  if (results.failed.length > 0) {
    console.log(chalk.red(`❌ Failed ${results.failed.length} rules`));
  }

  console.log(chalk.cyan.bold('\n🔑 Critical Services Now Allowed:\n'));
  console.log(chalk.green('✅ OCSP Certificate Validation') + ' - HTTPS certificates will validate properly');
  console.log(chalk.green('✅ iCloud Private Relay') + ' - Apple privacy features will work');
  console.log(chalk.green('✅ Tesla Services') + ' - Vehicle telemetry and maps functional');
  console.log(chalk.green('✅ Tailscale VPN') + ' - VPN connectivity restored');
  console.log(chalk.green('✅ IoT Devices') + ' - Printers and smart devices can connect');
  
  console.log(chalk.yellow('\n⚠️  Important Notes:'));
  console.log('• OCSP is critical for SSL/TLS certificate validation');
  console.log('• iCloud mask services are used for Private Relay privacy');
  console.log('• IPv4only.arpa is used for network connectivity checks');
  console.log('• Some IoT devices may need additional domains');
  
  console.log(chalk.cyan.bold('\n🔍 Monitor for Additional Blocks:'));
  console.log('Check your dashboard at http://localhost:3001');
  console.log('Or view logs in Cloudflare Zero Trust dashboard\n');
}

// Main execution
addBlockedLegitimateServices().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});