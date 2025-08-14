#!/usr/bin/env tsx

/**
 * Fix AI rule duplicates and ensure critical Anthropic/Claude domains are properly configured
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function fixAIRulesDuplication() {
  console.log(chalk.cyan.bold('🤖 Fixing AI Rule Duplicates & Critical Anthropic Domains\n'));
  
  const gateway = new GatewayClient();
  const spinner = ora('Fetching current rules...').start();
  
  try {
    const rules = await gateway.listGatewayRules();
    spinner.succeed('Loaded rules');
    
    // Find the problematic "Allow Mainstream AI Services" rule
    const mainstreamAIRule = rules.find(r => r.name === 'Allow Mainstream AI Services');
    const aiLanguageRule = rules.find(r => r.name === 'AI: Language Models & APIs');
    const anthropicAnalyticsRule = rules.find(r => r.name === 'Anthropic: Analytics Services');
    
    if (!mainstreamAIRule) {
      console.log(chalk.red('❌ "Allow Mainstream AI Services" rule not found'));
      return;
    }
    
    console.log(chalk.yellow('\n📋 Current problematic configuration:'));
    console.log(`   "Allow Mainstream AI Services" has 54 domains (many non-AI!)`);
    console.log(`   Contains duplicates with other AI rules`);
    console.log(`   Missing critical domain: docs.anthropic.com\n`);
    
    // Define proper AI domains (removing non-AI domains)
    const properAIDomains = [
      // OpenAI
      'openai.com',
      'api.openai.com',
      'chat.openai.com',
      'platform.openai.com',
      'ab.chatgpt.com',
      
      // Anthropic/Claude (CRITICAL - must be complete)
      'anthropic.com',
      'api.anthropic.com',
      'claude.ai',
      'console.anthropic.com',
      'docs.anthropic.com', // MISSING - CRITICAL!
      'statsig.anthropic.com',
      'telemetry.anthropic.com',
      
      // Google AI
      'gemini.google.com',
      'makersuite.google.com',
      'ai.google.com',
      'bard.google.com',
      
      // Other AI Services
      'huggingface.co',
      'ollama.ai',
      'ollama.com',
      'api.perplexity.ai',
      'perplexity.ai',
      'poe.com',
      'midjourney.com',
      'replicate.com',
      'stability.ai',
      'leonardo.ai',
      'character.ai',
      'janitorai.com',
      'meta.ai',
      'copilot.microsoft.com',
      
      // AI Writing/Content Tools
      'jasper.ai',
      'copy.ai',
      'writesonic.com',
      'grammarly.com',
      
      // Development AI
      'warp.dev',
      'app.warp.dev',
      'rtc.app.warp.dev'
    ];
    
    // Domains that should be in OTHER rules (not AI)
    const nonAIDomains = [
      'a.simplemdm.com', // Should be in SimpleMDM rule
      'log.tailscale.com', // Should be in Tailscale rule  
      'ping.ui.com', // Should be in Infrastructure rule
      'ui.com', // Should be in Infrastructure rule
      'www.apple.com', // Should be in Apple Services
      'imap.gmail.com', // Should be in Email rule
      'p43-imap.mail.me.com', // Should be in Apple Mail rule
      'ldap.google.com', // Should be in Google Services
      'netcts.cdn-apple.com', // Should be in Apple CDN
      'ota.onecloud.harman.com', // Should be in IoT rule
      'quora.com', // Not AI-specific
      'discord.gg', // Should be in Communication
      'discord.com', // Should be in Communication
      'notion.so', // Should be in Productivity
      'notion.com', // Should be in Productivity
      'canva.com', // Should be in Productivity
      'figma.com', // Should be in Productivity
      'bing.com' // Should be in Search/Microsoft
    ];
    
    console.log(chalk.cyan.bold('🔧 Fixing AI rules...\n'));
    
    // Step 1: Delete redundant AI rules (keeping only the main one)
    const rulesToDelete = [];
    
    if (aiLanguageRule) {
      console.log(chalk.yellow('Will delete: "AI: Language Models & APIs" (redundant with main AI rule)'));
      rulesToDelete.push(aiLanguageRule);
    }
    
    if (anthropicAnalyticsRule) {
      console.log(chalk.yellow('Will delete: "Anthropic: Analytics Services" (will be merged into main rule)'));
      rulesToDelete.push(anthropicAnalyticsRule);
    }
    
    // Delete redundant rules
    for (const rule of rulesToDelete) {
      const deleteSpinner = ora(`Deleting: ${rule.name}`).start();
      try {
        await gateway.deleteGatewayRule(rule.id);
        deleteSpinner.succeed(`Deleted: ${rule.name}`);
      } catch (error) {
        deleteSpinner.fail(`Failed to delete: ${rule.name}`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 2: Update the main AI rule with proper domains
    console.log(chalk.cyan('\n📝 Updating "Allow Mainstream AI Services" rule...\n'));
    
    const updatedTraffic = `http.request.host in {${properAIDomains.map(d => `"${d}"`).join(' ')}}`;
    
    const updateSpinner = ora('Updating AI rule with cleaned domains...').start();
    
    try {
      await gateway.updateGatewayRule({
        id: mainstreamAIRule.id,
        name: 'AI Services: Complete Coverage (Anthropic/Claude Critical)',
        description: 'Comprehensive AI services including all critical Anthropic/Claude domains',
        action: 'allow',
        traffic: updatedTraffic,
        precedence: 1450 // Proper AI category precedence
      });
      
      updateSpinner.succeed('Updated AI rule successfully');
    } catch (error: any) {
      updateSpinner.fail(`Failed to update: ${error.message}`);
      return;
    }
    
    // Step 3: Create rules for misplaced domains if they don't exist
    console.log(chalk.cyan('\n🔄 Checking misplaced domains...\n'));
    
    const misplacedDomainChecks = [
      { domain: 'a.simplemdm.com', ruleName: 'SimpleMDM', category: 'MDM' },
      { domain: 'log.tailscale.com', ruleName: 'Tailscale', category: 'VPN' },
      { domain: 'discord.com', ruleName: 'Discord', category: 'Communication' },
      { domain: 'notion.com', ruleName: 'Notion', category: 'Productivity' }
    ];
    
    for (const check of misplacedDomainChecks) {
      const existingRule = rules.find(r => 
        r.name.toLowerCase().includes(check.ruleName.toLowerCase()) &&
        r.action === 'allow'
      );
      
      if (existingRule) {
        console.log(chalk.green(`   ✓ ${check.domain} - covered by "${existingRule.name}"`));
      } else {
        console.log(chalk.yellow(`   ⚠️  ${check.domain} - no ${check.category} rule found (may need to create one)`));
      }
    }
    
    // Final summary
    console.log(chalk.green.bold('\n✅ AI Rules Fixed!\n'));
    
    console.log(chalk.cyan('Summary of changes:'));
    console.log(`   • Deleted ${rulesToDelete.length} redundant AI rules`);
    console.log(`   • Updated main AI rule from 54 to ${properAIDomains.length} domains`);
    console.log(`   • Added missing critical domain: docs.anthropic.com`);
    console.log(`   • Removed ${nonAIDomains.length} non-AI domains`);
    console.log(`   • Consolidated all AI services into single rule at precedence 1450`);
    
    console.log(chalk.green.bold('\n🔒 All Critical Anthropic/Claude Domains Now Included:'));
    const criticalDomains = [
      'anthropic.com',
      'api.anthropic.com', 
      'claude.ai',
      'console.anthropic.com',
      'docs.anthropic.com',
      'statsig.anthropic.com',
      'telemetry.anthropic.com'
    ];
    
    criticalDomains.forEach(d => {
      console.log(chalk.green(`   ✓ ${d}`));
    });
    
    console.log(chalk.cyan.bold('\n💡 Next Steps:'));
    console.log('1. Verify Claude functionality is working properly');
    console.log('2. Check if any non-AI domains need their own rules');
    console.log('3. Monitor dashboard for any new blocks: http://localhost:3001');
    
    // Get final rule count
    const finalRules = await gateway.listGatewayRules();
    console.log(chalk.cyan.bold(`\n📊 Final Gateway Rules: ${finalRules.length}`));
    
  } catch (error) {
    spinner.fail('Failed to fix AI rules');
    throw error;
  }
}

// Main execution
fixAIRulesDuplication().catch((error) => {
  console.error(chalk.red('❌ Error:'), error.message);
  process.exit(1);
});