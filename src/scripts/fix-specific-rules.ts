#!/usr/bin/env tsx
import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';

async function fixProblematicRules() {
  const gatewayClient = new GatewayClient();

  console.log(chalk.yellow('🔧 Fixing identified problematic rules...\n'));

  try {
    // Fix Rule 1: Apple HomeKit - Remove the problematic regex pattern
    console.log(chalk.blue('1. Fixing "Allow Apple Homekit and Google Home Ecosystems"...'));
    const homeKitRuleId = '30867815-418f-413d-89f9-3a1572a90b0d';
    
    const homeKitRule = await gatewayClient.getGatewayRule(homeKitRuleId);
    console.log(chalk.gray(`   Current traffic: ${homeKitRule.traffic}`));
    
    // Remove the problematic regex pattern and simplify
    const newHomeKitTraffic = 'dns.fqdn in $419dd8d5-b0a0-4892-ab87-9c663735727a or (dns.fqdn in $fa64ba26-c470-4273-b251-c75ce17280b6 or dns.fqdn in {"apple-cloudkit.com" "apple-livephotoskit.com" "nest.com" "google-home.com" "home.nest.com"}) or dns.fqdn matches ".*\\.local\\.home"';
    
    await gatewayClient.updateGatewayRule({
      id: homeKitRuleId,
      name: homeKitRule.name,
      description: homeKitRule.description + ' [FIXED: Removed problematic regex anchor]',
      action: homeKitRule.action,
      enabled: homeKitRule.enabled,
      traffic: newHomeKitTraffic,
      precedence: homeKitRule.precedence,
      filters: homeKitRule.filters,
      identity: homeKitRule.identity,
      device_posture: homeKitRule.device_posture,
      rule_settings: homeKitRule.rule_settings
    });
    
    console.log(chalk.green('   ✅ Fixed HomeKit rule'));
    console.log(chalk.gray(`   New traffic: ${newHomeKitTraffic}\n`));

    // Fix Rule 2: Service Discovery - Update the regex pattern
    console.log(chalk.blue('2. Fixing "Network: Allow Service Discovery (_services)"...'));
    const serviceDiscoveryRuleId = '714c0d08-bcee-4a4d-b351-72f13334ad6d';
    
    const serviceRule = await gatewayClient.getGatewayRule(serviceDiscoveryRuleId);
    console.log(chalk.gray(`   Current traffic: ${serviceRule.traffic}`));
    
    // Fix the regex pattern to be more specific and valid
    const newServiceTraffic = 'dns.fqdn matches "_.*\\.local" or dns.fqdn matches "_.*\\.lan" or dns.fqdn matches "_.*\\._tcp" or dns.fqdn matches "_.*\\._udp"';
    
    await gatewayClient.updateGatewayRule({
      id: serviceDiscoveryRuleId,
      name: serviceRule.name,
      description: serviceRule.description + ' [FIXED: Updated to specific service discovery patterns]',
      action: serviceRule.action,
      enabled: serviceRule.enabled,
      traffic: newServiceTraffic,
      precedence: serviceRule.precedence,
      filters: serviceRule.filters,
      identity: serviceRule.identity,
      device_posture: serviceRule.device_posture,
      rule_settings: serviceRule.rule_settings
    });
    
    console.log(chalk.green('   ✅ Fixed Service Discovery rule'));
    console.log(chalk.gray(`   New traffic: ${newServiceTraffic}\n`));

    console.log(chalk.green('🎉 All problematic rules have been fixed!'));
    console.log(chalk.cyan('\n📋 Summary of changes:'));
    console.log('   • HomeKit rule: Removed problematic regex anchor "^.*\\.local\\.home$"');
    console.log('   • Service Discovery: Replaced "^_.*" with specific service patterns');
    console.log('   • Both rules should now work correctly without blocking DNS\n');
    
  } catch (error) {
    console.error(chalk.red('❌ Error fixing rules:'), error);
  }
}

// Run the fixes
fixProblematicRules().catch(error => {
  console.error(chalk.red('❌ Failed to run fixes:'), error);
  process.exit(1);
});
