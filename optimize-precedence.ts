#!/usr/bin/env npx tsx
import { GatewayClient } from './src/api/gateway-client.js';

async function optimizePrecedence() {
  const client = new GatewayClient();
  
  try {
    console.log('📊 Implementing Precedence Gap Optimization\n');
    
    const rules = await client.listGatewayRules();
    const precedences = rules.map(r => r.precedence).sort((a, b) => a - b);
    
    console.log('🎯 Current Precedence Distribution:');
    console.log(`   Range: ${precedences[0]} - ${precedences[precedences.length - 1]}`);
    console.log(`   Total Rules: ${rules.length}`);
    
    // Identify the largest gaps
    const gaps = [];
    for (let i = 1; i < precedences.length; i++) {
      const gap = precedences[i] - precedences[i-1];
      if (gap > 1000) { // Focus on gaps > 1000 for major optimization
        gaps.push({
          from: precedences[i-1],
          to: precedences[i],
          gap,
          beforeRule: rules.find(r => r.precedence === precedences[i-1]),
          afterRule: rules.find(r => r.precedence === precedences[i])
        });
      }
    }
    
    console.log(`\n📏 Large precedence gaps (>1000): ${gaps.length}`);
    gaps.forEach((gap, index) => {
      console.log(`   ${index + 1}. Gap ${gap.gap}: ${gap.from} → ${gap.to}`);
      console.log(`      Before: ${gap.beforeRule?.name}`);
      console.log(`      After: ${gap.afterRule?.name}`);
    });
    
    // Create optimized precedence plan
    console.log(`\n🎯 Precedence Optimization Plan:`);
    
    // Define logical precedence groups
    const precedenceGroups = {
      'Critical Infrastructure': { start: 500, increment: 10 },      // 500-590
      'OpenAI Infrastructure': { start: 600, increment: 5 },          // 600-650  
      'Certificate Infrastructure': { start: 700, increment: 10 },    // 700-790
      'High Priority Security': { start: 1000, increment: 50 },      // 1000-1500
      'AI Services': { start: 1600, increment: 10 },                 // 1600-1700
      'Security Controls': { start: 2000, increment: 100 },          // 2000-5000
      'Apple Services': { start: 8000, increment: 200 },             // 8000-12000
      'Development Tools': { start: 12000, increment: 100 },         // 12000-15000
      'Cloud Services': { start: 15000, increment: 500 },            // 15000-25000
      'Business Applications': { start: 25000, increment: 1000 },    // 25000-50000
      'Low Priority': { start: 55000, increment: 1000 }              // 55000+
    };
    
    console.log(`   Proposed precedence groups with compressed ranges:`);
    Object.entries(precedenceGroups).forEach(([group, config]) => {
      const endRange = config.start + (10 * config.increment);
      console.log(`      • ${group}: ${config.start}-${endRange} (increment: ${config.increment})`);
    });
    
    // Calculate potential savings
    const currentSpread = precedences[precedences.length - 1] - precedences[0];
    const optimizedSpread = 65000 - 500; // New range
    const compressionRatio = Math.round((1 - optimizedSpread / currentSpread) * 100);
    
    console.log(`\n📊 Optimization Impact:`);
    console.log(`   Current precedence spread: ${currentSpread} units`);
    console.log(`   Optimized precedence spread: ${optimizedSpread} units`);
    console.log(`   Space efficiency improvement: Better organization`);
    console.log(`   Maintenance benefit: Logical grouping with room for expansion`);
    
    // Show examples of rules that would benefit from reordering
    console.log(`\n🔄 Sample Precedence Reordering (Examples):`);
    
    // Find some rules that could be reordered
    const criticalRules = rules.filter(r => r.name.includes('CRITICAL') || r.name.includes('OpenAI') || r.name.includes('Certificate'));
    const securityRules = rules.filter(r => r.name.includes('Security') || r.name.includes('Block'));
    
    console.log(`   Critical Infrastructure Rules (${criticalRules.length}):`)
    criticalRules.slice(0, 3).forEach(rule => {
      const newPrecedence = 500 + (criticalRules.indexOf(rule) * 10);
      console.log(`      ${rule.name}: ${rule.precedence} → ${newPrecedence}`);
    });
    
    console.log(`   Security Rules (${securityRules.length}):`)
    securityRules.slice(0, 3).forEach(rule => {
      const newPrecedence = 2000 + (securityRules.indexOf(rule) * 100);
      console.log(`      ${rule.name}: ${rule.precedence} → ${newPrecedence}`);
    });
    
    console.log(`\n⚠️  Implementation Notes:`);
    console.log(`   • Precedence optimization requires careful testing`);
    console.log(`   • Changes should be made gradually in batches`);
    console.log(`   • Critical rules (< 1000) should be tested first`);
    console.log(`   • Monitor functionality after each batch of changes`);
    console.log(`   • Keep backup of current configuration`);
    
    console.log(`\n💡 Recommended Approach:`);
    console.log(`   1. Start with non-critical rules (precedence > 10000)`);
    console.log(`   2. Test functionality after each precedence group update`);
    console.log(`   3. Gradually work toward higher priority rules`);
    console.log(`   4. Leave critical infrastructure rules (< 1000) for last`);
    console.log(`   5. Document all precedence changes for rollback`);
    
    return {
      totalGaps: gaps.length,
      optimizationPlan: precedenceGroups,
      currentSpread: currentSpread,
      optimizedSpread: optimizedSpread
    };
    
  } catch (error) {
    console.error('❌ Error during precedence optimization:', error);
  }
}

optimizePrecedence();
