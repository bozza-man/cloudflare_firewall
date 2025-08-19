#!/usr/bin/env tsx

/**
 * Adds allow rules for remaining blocked legitimate services
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addRemainingBlockedServices() {
  console.log(chalk.cyan.bold('🔓 Adding Rules for Remaining Blocked Services\n'));
  
  const gateway = new GatewayClient();
  
  const rules = [
    {
      name: 'Apple: Additional Services & CDN',
      description: 'Allow Apple image CDN and Safari services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.aaplimg\\.com$" or http.request.host in {"setup.icloud.com" "pancake.g.aaplimg.com" "smoot-api-safari-aapse2c.v.aaplimg.com"}',
      precedence: 1010, // With other Apple services
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Tesla: Extended Vehicle Services',
      description: 'Allow additional Tesla vehicle services',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"x1.ap.tesla.services" "hermes-prd.ap.tesla.services"} or http.request.host matches "^.*\\.tesla\\.services$"',
      precedence: 1242, // Near other Tesla rules
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'SimpleMDM: Agent Services',
      description: 'Allow SimpleMDM agent endpoints',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host == "a.simplemdm.com"',
      precedence: 1116, // With SimpleMDM main rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Network: NTP Pool Time Servers',
      description: 'Allow NTP pool for time synchronization',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host in {"www.ntppool.org" "pool.ntp.org" "time.nist.gov" "time.google.com" "time.cloudflare.com"}',
      precedence: 996, // High priority for time sync
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'IoT: Brother Printer Services',
      description: 'Ensure Brother printer connections are allowed',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.brother\\.com$" or http.request.host == "brother.com"',
      precedence: 1122, // Update IoT rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'IoT: Harman Audio Services',
      description: 'Ensure Harman/JBL audio device connections',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.harman\\.com$" or http.request.host matches "^.*\\.onecloud\\.harman\\.com$"',
      precedence: 1123, // Update IoT rule
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Security: OCSP Responders Extended',
      description: 'Additional OCSP certificate validation endpoints',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^ocsp.*\\.(digicert|entrust|verisign|sectigo|godaddy|comodoca|usertrust|globalsign|letsencrypt)\\..*$"',
      precedence: 996, // With other OCSP
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Apple: iCloud Mask Services Complete',
      description: 'All iCloud Private Relay mask endpoints',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^mask.*\\.icloud\\.com$"',
      precedence: 1011, // With other iCloud services
      identity: '',
      device_posture: '',
      rule_settings: {}
    },
    {
      name: 'Networking: Tailscale Complete',
      description: 'All Tailscale services including control plane',
      action: 'allow' as const,
      enabled: true,
      filters: ['http'],
      traffic: 'http.request.host matches "^.*\\.tailscale\\.com$" or http.request.host matches "^.*\\.tailscale\\.io$"',
      precedence: 1124, // Update Tailscale rule
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

  console.log(chalk.yellow('📋 Additional Blocked Services Identified:\n'));
  console.log('• Apple CDN (aaplimg.com) - Safari and system services');
  console.log('• setup.icloud.com - iCloud device setup');
  console.log('• Tesla extended services (x1, hermes)');
  console.log('• SimpleMDM agent (a.simplemdm.com)');
  console.log('• NTP time servers (critical for time sync)');
  console.log('• Brother printer full domain');
  console.log('• Harman audio full domain');
  console.log('• Extended OCSP responders');
  console.log('• Complete Tailscale domain coverage\n');

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
    results.success.forEach(name => {
      console.log(chalk.gray(`   • ${name}`));
    });
  }
  
  if (results.skipped.length > 0) {
    console.log(chalk.yellow(`\n⏭️  Skipped ${results.skipped.length} rules (already exist)`));
  }
  
  if (results.failed.length > 0) {
    console.log(chalk.red(`\n❌ Failed ${results.failed.length} rules`));
  }

  console.log(chalk.cyan.bold('\n✅ All Critical Services Should Now Be Working:\n'));
  console.log(chalk.green('Apple Services:'));
  console.log('  • iCloud setup and Private Relay');
  console.log('  • Safari API and CDN content');
  console.log('  • All Apple image delivery');
  
  console.log(chalk.green('\nTesla Services:'));
  console.log('  • Vehicle telemetry (all regions)');
  console.log('  • Hermes and X1 services');
  console.log('  • Maps and navigation');
  
  console.log(chalk.green('\nMDM & Security:'));
  console.log('  • SimpleMDM agent enrollment');
  console.log('  • OCSP certificate validation');
  console.log('  • Time synchronization (NTP)');
  
  console.log(chalk.green('\nNetworking & IoT:'));
  console.log('  • Tailscale VPN (complete)');
  console.log('  • Brother printers');
  console.log('  • Harman/JBL audio devices');
  
  console.log(chalk.yellow('\n⚠️  If Any Services Still Don\'t Work:'));
  console.log('1. Check the Cloudflare dashboard for remaining blocks');
  console.log('2. Some services may need DNS rules (port 53)');
  console.log('3. Ensure rule precedence is correct (lower = higher priority)');
  console.log('4. Monitor dashboard: http://localhost:3001\n');
  
  // Check total rules
  try {
    const allRules = await gateway.listGatewayRules();
    console.log(chalk.cyan.bold(`📈 Total Gateway Rules: ${allRules.length}`));
    const allowRules = allRules.filter(r => r.action === 'allow');
    const blockRules = allRules.filter(r => r.action === 'block');
    console.log(chalk.green(`   Allow rules: ${allowRules.length}`));
    console.log(chalk.red(`   Block rules: ${blockRules.length}`));
  } catch (error: any) {
    // Ignore
  }
}

// Main execution
addRemainingBlockedServices().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});