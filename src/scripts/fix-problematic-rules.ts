#!/usr/bin/env tsx
import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';

class ProblematicRuleFixer {
  private gatewayClient: GatewayClient;
  
  constructor() {
    this.gatewayClient = new GatewayClient();
  }

  async findProblematicRules(): Promise<void> {
    console.log(chalk.yellow('🔍 Finding problematic Gateway rules...\n'));

    try {
      const rules = await this.gatewayClient.listGatewayRules();
      console.log(chalk.blue(`📋 Analyzing ${rules.length} Gateway rules...\n`));

      const problematicRules = [];

      for (const rule of rules) {
        const traffic = rule.traffic || '';
        
        // Check for the specific blocked patterns
        if (traffic.includes('^.*\\.local\\.home$') || 
            traffic.includes('^_.*') ||
            traffic.includes('HomeKit') ||
            traffic.includes('service discovery')) {
          problematicRules.push(rule);
          console.log(chalk.red(`❌ PROBLEMATIC: ${rule.name}`));
          console.log(`   ID: ${rule.id}`);
          console.log(`   Traffic: ${traffic}`);
          console.log(`   Action: ${rule.action}`);
          console.log(`   Enabled: ${rule.enabled}`);
          console.log();
        }

        // Check for regex patterns that might be causing DNS issues
        if (traffic.includes('.*\\') || traffic.includes('$') || traffic.match(/\.\*\\\\/)) {
          console.log(chalk.yellow(`⚠️  REGEX PATTERN: ${rule.name}`));
          console.log(`   Traffic: ${traffic}`);
          console.log();
        }
      }

      console.log(chalk.green(`\n✅ Found ${problematicRules.length} problematic rules`));
      
      // Show summary of issues
      this.showRuleSummary(rules);

    } catch (error: any) {
      console.error(chalk.red('❌ Error analyzing rules:'), error);
    }
  }

  private showRuleSummary(rules: any[]): void {
    console.log(chalk.cyan('\n📊 Rule Analysis Summary:'));
    
    const regexRules = rules.filter(r => (r.traffic || '').includes('.*\\'));
    const allowRules = rules.filter(r => r.action === 'allow');
    const blockRules = rules.filter(r => r.action === 'block');
    const disabledRules = rules.filter(r => !r.enabled);

    console.log(`   Total rules: ${rules.length}`);
    console.log(`   Allow rules: ${allowRules.length}`);
    console.log(`   Block rules: ${blockRules.length}`);
    console.log(`   Disabled rules: ${disabledRules.length}`);
    console.log(`   Regex pattern rules: ${regexRules.length}`);
  }

  async fixRule(ruleId: string, newTraffic: string): Promise<void> {
    try {
      console.log(chalk.blue(`🔧 Fixing rule ${ruleId}...`));
      
      const rule = await this.gatewayClient.getGatewayRule(ruleId);
      
      // Update the rule with corrected traffic
      const updatedRule = await this.gatewayClient.updateGatewayRule({
        id: ruleId,
        name: rule.name,
        description: rule.description,
        action: rule.action,
        enabled: rule.enabled,
        traffic: newTraffic,
        precedence: rule.precedence,
        filters: rule.filters,
        identity: rule.identity,
        device_posture: rule.device_posture,
        rule_settings: rule.rule_settings
      });

      console.log(chalk.green(`✅ Fixed rule: ${updatedRule.name}`));
      console.log(`   Old traffic: ${rule.traffic}`);
      console.log(`   New traffic: ${newTraffic}`);
      
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to fix rule ${ruleId}:`), error);
    }
  }

  async suggestFixes(): Promise<void> {
    console.log(chalk.cyan('\n💡 Suggested fixes for common issues:\n'));

    console.log(chalk.yellow('1. Regex Pattern Issues:'));
    console.log('   - Replace `.*\\.domain\\.com$` with `dns.fqdn matches ".*\\.domain\\.com"`');
    console.log('   - Use proper Cloudflare Gateway syntax for wildcards\n');

    console.log(chalk.yellow('2. Local DNS Issues:'));
    console.log('   - `^.*\\.local\\.home$` → `dns.fqdn matches ".*\\.local\\.home"`');
    console.log('   - `^_.*` → `dns.fqdn matches "^_.*"`\n');

    console.log(chalk.yellow('3. Multi-domain strings:'));
    console.log('   - Split concatenated domain strings into individual DNS queries');
    console.log('   - Use proper array syntax: `dns.fqdn in {"domain1.com", "domain2.com"}`\n');
  }
}

// Main execution
async function main() {
  const fixer = new ProblematicRuleFixer();
  await fixer.findProblematicRules();
  await fixer.suggestFixes();
}

// Direct execution
main().catch(error => {
  console.error(chalk.red('❌ Error running rule fixer:'), error);
  process.exit(1);
});
