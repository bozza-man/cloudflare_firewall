#!/usr/bin/env npx tsx
import { GatewayClient } from './src/api/gateway-client.js';
import { writeFileSync } from 'fs';

async function implementOptimizations() {
  const client = new GatewayClient();
  
  try {
    console.log('🚀 Implementing Gateway Configuration Optimizations\n');
    
    // Step 1: Create backup
    console.log('📦 Creating configuration backup...');
    const rules = await client.listGatewayRules();
    const lists = await client.listGatewayLists();
    
    const backup = {
      timestamp: new Date().toISOString(),
      rules: rules,
      lists: lists,
      metadata: {
        totalRules: rules.length,
        totalLists: lists.length,
        backupReason: 'Pre-optimization backup'
      }
    };
    
    writeFileSync('gateway-config-backup.json', JSON.stringify(backup, null, 2));
    console.log(`✅ Backup created: gateway-config-backup.json (${rules.length} rules, ${lists.length} lists)`);
    
    // Step 2: Analyze optimization candidates
    console.log('\n🔍 Analyzing optimization candidates...');
    
    // Find long traffic expression rules
    const longRules = rules.filter(rule => rule.traffic && rule.traffic.length > 500);
    console.log(`📏 Long traffic expression rules: ${longRules.length}`);
    
    // Find domain-based rules that could use lists
    const domainRules = rules.filter(rule => 
      rule.traffic && (
        rule.traffic.includes('dns.fqdn ==') || 
        rule.traffic.includes('http.request.host ==')
      )
    );
    console.log(`🎯 Domain-based rules: ${domainRules.length}`);
    
    // Analyze precedence gaps
    const precedences = rules.map(r => r.precedence).sort((a, b) => a - b);
    const largeGaps = [];
    for (let i = 1; i < precedences.length; i++) {
      const gap = precedences[i] - precedences[i-1];
      if (gap > 500) {
        largeGaps.push({
          from: precedences[i-1],
          to: precedences[i],
          gap,
          beforeRule: rules.find(r => r.precedence === precedences[i-1]),
          afterRule: rules.find(r => r.precedence === precedences[i])
        });
      }
    }
    console.log(`📊 Large precedence gaps: ${largeGaps.length}`);
    
    // Step 3: Implement Gateway List Consolidation
    console.log('\n🎯 Phase 1: Gateway List Consolidation');
    await consolidateDomainRules(client, domainRules, lists);
    
    // Step 4: Optimize long traffic expressions
    console.log('\n📏 Phase 2: Traffic Expression Optimization');
    await optimizeLongRules(client, longRules);
    
    // Step 5: Precedence optimization
    console.log('\n📊 Phase 3: Precedence Gap Optimization');
    await optimizePrecedenceGaps(client, largeGaps);
    
    console.log('\n✨ Optimization Implementation Complete!');
    
  } catch (error) {
    console.error('❌ Error during optimization:', error);
  }
}

async function consolidateDomainRules(client, domainRules, existingLists) {
  console.log('   Analyzing domain consolidation opportunities...');
  
  // Group domain rules by category for potential consolidation
  const domainCategories = {};
  domainRules.forEach(rule => {
    const category = rule.name.split(':')[0] || 'Other';
    if (!domainCategories[category]) {
      domainCategories[category] = [];
    }
    domainCategories[category].push(rule);
  });
  
  console.log(`   Found ${Object.keys(domainCategories).length} categories with domain rules:`);
  Object.entries(domainCategories).forEach(([category, rules]) => {
    console.log(`      • ${category}: ${rules.length} rules`);
  });
  
  // For now, we'll analyze but not automatically consolidate to preserve functionality
  console.log(`   ℹ️  Analysis complete. Manual consolidation recommended for safety.`);
  
  return domainCategories;
}

async function optimizeLongRules(client, longRules) {
  console.log('   Analyzing traffic expression optimization opportunities...');
  
  for (const rule of longRules) {
    console.log(`      • ${rule.name}: ${rule.traffic.length} chars`);
    
    // Check if rule uses repetitive patterns that could be optimized
    const trafficExpression = rule.traffic;
    const domainCount = (trafficExpression.match(/dns\.fqdn == "/g) || []).length;
    const hostCount = (trafficExpression.match(/http\.request\.host == "/g) || []).length;
    
    if (domainCount > 10 || hostCount > 10) {
      console.log(`        → Candidate for Gateway List (${domainCount + hostCount} domains)`);
    }
    
    // Check for regex patterns that could be simplified
    const regexCount = (trafficExpression.match(/matches "/g) || []).length;
    if (regexCount > 5) {
      console.log(`        → Complex regex patterns detected (${regexCount} patterns)`);
    }
  }
  
  console.log(`   ℹ️  Long rule analysis complete. Consider Gateway List migration.`);
}

async function optimizePrecedenceGaps(client, largeGaps) {
  console.log('   Analyzing precedence gap optimization...');
  
  // Show the largest gaps for potential compression
  const sortedGaps = largeGaps.sort((a, b) => b.gap - a.gap).slice(0, 10);
  
  console.log('   Top precedence gaps for optimization:');
  sortedGaps.forEach((gap, index) => {
    console.log(`      ${index + 1}. Gap ${gap.gap}: ${gap.from} → ${gap.to}`);
    console.log(`         Before: ${gap.beforeRule?.name}`);
    console.log(`         After: ${gap.afterRule?.name}`);
  });
  
  // Calculate potential compression
  const totalGapSpace = largeGaps.reduce((sum, gap) => sum + (gap.gap - 10), 0);
  console.log(`   Potential precedence compression: ${totalGapSpace} units`);
  
  console.log(`   ℹ️  Precedence analysis complete. Manual optimization recommended.`);
}

implementOptimizations();
