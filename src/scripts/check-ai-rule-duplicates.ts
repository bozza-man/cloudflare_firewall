#!/usr/bin/env tsx

/**
 * Check for duplicate domains in AI-related rules
 * Especially important for Anthropic/Claude functionality
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';

async function checkAIRuleDuplicates() {
  console.log(chalk.cyan.bold('🤖 Checking AI/Anthropic Rule Duplicates\n'));
  
  const gateway = new GatewayClient();
  const rules = await gateway.listGatewayRules();
  
  // Find all AI-related rules
  const aiRules = rules.filter(r => 
    r.name.toLowerCase().includes('ai') || 
    r.name.toLowerCase().includes('anthropic') ||
    r.name.toLowerCase().includes('claude') ||
    r.name.toLowerCase().includes('openai') ||
    r.name.toLowerCase().includes('language model')
  );
  
  console.log(chalk.yellow(`Found ${aiRules.length} AI-related rules:\n`));
  
  // Display all AI rules with their domains
  const allDomains = new Map<string, string[]>();
  
  for (const rule of aiRules) {
    console.log(chalk.cyan(`📋 ${rule.name}`));
    console.log(`   Precedence: ${rule.precedence}`);
    console.log(`   Action: ${rule.action}`);
    
    // Extract domains from traffic field
    const domains: string[] = [];
    if (rule.traffic) {
      const matches = rule.traffic.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach(m => {
          const domain = m.replace(/"/g, '');
          domains.push(domain);
          
          // Track which rules contain each domain
          if (!allDomains.has(domain)) {
            allDomains.set(domain, []);
          }
          allDomains.get(domain)!.push(rule.name);
        });
      }
    }
    
    console.log(`   Domains (${domains.length}):`);
    domains.forEach(d => {
      // Highlight critical Anthropic domains
      if (d.includes('anthropic') || d.includes('claude')) {
        console.log(chalk.green(`     ✓ ${d} (CRITICAL for Claude)`));
      } else {
        console.log(`     • ${d}`);
      }
    });
    console.log();
  }
  
  // Find duplicate domains
  console.log(chalk.yellow.bold('🔍 Duplicate Analysis:\n'));
  
  const duplicates: Array<{domain: string, rules: string[]}> = [];
  const criticalDuplicates: Array<{domain: string, rules: string[]}> = [];
  
  for (const [domain, ruleNames] of allDomains) {
    if (ruleNames.length > 1) {
      const dup = { domain, rules: ruleNames };
      
      // Check if it's a critical Anthropic domain
      if (domain.includes('anthropic') || domain.includes('claude')) {
        criticalDuplicates.push(dup);
      } else {
        duplicates.push(dup);
      }
    }
  }
  
  if (criticalDuplicates.length > 0) {
    console.log(chalk.red.bold('⚠️  CRITICAL DUPLICATES (Anthropic/Claude domains):\n'));
    criticalDuplicates.forEach(dup => {
      console.log(chalk.red(`   Domain: ${dup.domain}`));
      console.log(chalk.yellow(`   Found in ${dup.rules.length} rules:`));
      dup.rules.forEach(r => console.log(`     - ${r}`));
      console.log();
    });
    
    console.log(chalk.red.bold('   ⚠️  These duplicates might affect Claude functionality!\n'));
  }
  
  if (duplicates.length > 0) {
    console.log(chalk.yellow('📋 Other duplicate domains:\n'));
    duplicates.forEach(dup => {
      console.log(`   Domain: ${dup.domain}`);
      console.log(`   Found in: ${dup.rules.join(', ')}`);
    });
    console.log();
  }
  
  // Recommendations
  console.log(chalk.cyan.bold('💡 Recommendations:\n'));
  
  if (criticalDuplicates.length > 0 || duplicates.length > 0) {
    console.log('1. Consider consolidating AI rules into a single comprehensive rule');
    console.log('2. Critical Anthropic domains should be in a high-priority rule (precedence < 1500)');
    console.log('3. Remove duplicate domains from lower-priority rules');
    
    // Show suggested consolidated rule
    console.log(chalk.green.bold('\n✅ Suggested Consolidated Rule:\n'));
    
    const allUniqueDomains = new Set<string>();
    for (const [domain] of allDomains) {
      allUniqueDomains.add(domain);
    }
    
    const anthropicDomains = Array.from(allUniqueDomains).filter(d => 
      d.includes('anthropic') || d.includes('claude')
    );
    const otherAIDomains = Array.from(allUniqueDomains).filter(d => 
      !d.includes('anthropic') && !d.includes('claude')
    );
    
    console.log('Name: "AI Services: Complete Coverage"');
    console.log('Precedence: 1450 (AI Services category)');
    console.log('Action: allow');
    console.log('\nCritical Anthropic/Claude domains:');
    anthropicDomains.forEach(d => console.log(chalk.green(`  - ${d}`)));
    console.log('\nOther AI service domains:');
    otherAIDomains.forEach(d => console.log(`  - ${d}`));
    
    const trafficRule = `http.request.host in {${Array.from(allUniqueDomains).map(d => `"${d}"`).join(' ')}}`;
    console.log('\nTraffic rule:');
    console.log(chalk.gray(trafficRule));
    
  } else {
    console.log(chalk.green('✅ No duplicates found in AI rules!'));
    console.log('   All Anthropic/Claude domains are properly configured.');
  }
  
  // List all critical Anthropic domains for verification
  console.log(chalk.cyan.bold('\n🔒 Critical Anthropic/Claude Domains (must be allowed):\n'));
  const criticalDomains = [
    'api.anthropic.com',
    'claude.ai',
    'console.anthropic.com',
    'docs.anthropic.com',
    'statsig.anthropic.com',
    'telemetry.anthropic.com'
  ];
  
  for (const critical of criticalDomains) {
    const found = allDomains.has(critical);
    if (found) {
      console.log(chalk.green(`   ✓ ${critical} - Found in: ${allDomains.get(critical)!.join(', ')}`));
    } else {
      console.log(chalk.red(`   ✗ ${critical} - NOT FOUND! Claude functionality may be affected!`));
    }
  }
  
  // Summary
  console.log(chalk.cyan.bold('\n📊 Summary:\n'));
  console.log(`   Total AI rules: ${aiRules.length}`);
  console.log(`   Total unique domains: ${allDomains.size}`);
  console.log(`   Critical duplicates: ${criticalDuplicates.length}`);
  console.log(`   Other duplicates: ${duplicates.length}`);
  
  if (criticalDuplicates.length > 0) {
    console.log(chalk.red.bold('\n⚠️  ACTION REQUIRED: Remove duplicate Anthropic/Claude domains to ensure proper functionality!\n'));
  }
}

// Main execution
checkAIRuleDuplicates().catch((error) => {
  console.error(chalk.red('❌ Error:'), error.message);
  process.exit(1);
});