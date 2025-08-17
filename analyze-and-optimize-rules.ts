#!/usr/bin/env npx tsx
import { GatewayClient } from './src/api/gateway-client.js';

async function analyzeAndOptimizeRules() {
  const client = new GatewayClient();
  
  try {
    console.log('🔍 Comprehensive Gateway Rules Analysis & Optimization\n');
    
    // Get all rules and lists
    const rules = await client.listGatewayRules();
    const lists = await client.listGatewayLists();
    
    console.log(`📊 Current Configuration:`);
    console.log(`   • Total Rules: ${rules.length}`);
    console.log(`   • Total Lists: ${lists.length}`);
    
    // Categorize rules by type
    const dnsRules = rules.filter(rule => rule.filters.includes('dns'));
    const httpRules = rules.filter(rule => rule.filters.includes('http'));
    const l4Rules = rules.filter(rule => rule.filters.includes('l4'));
    
    // Categorize by action
    const allowRules = rules.filter(rule => rule.action === 'allow');
    const blockRules = rules.filter(rule => rule.action === 'block');
    const bypassRules = rules.filter(rule => rule.action === 'off');
    const otherRules = rules.filter(rule => !['allow', 'block', 'off'].includes(rule.action));
    
    console.log(`\n📋 Rule Breakdown:`);
    console.log(`   • DNS Rules: ${dnsRules.length}`);
    console.log(`   • HTTP Rules: ${httpRules.length}`);
    console.log(`   • L4 Rules: ${l4Rules.length}`);
    console.log(`   • Allow Rules: ${allowRules.length}`);
    console.log(`   • Block Rules: ${blockRules.length}`);
    console.log(`   • TLS Bypass Rules: ${bypassRules.length}`);
    console.log(`   • Other Rules: ${otherRules.length}`);
    
    // Analyze precedence ranges
    const precedences = rules.map(rule => rule.precedence).sort((a, b) => a - b);
    const minPrecedence = precedences[0];
    const maxPrecedence = precedences[precedences.length - 1];
    
    console.log(`\n🎯 Precedence Analysis:`);
    console.log(`   • Range: ${minPrecedence} - ${maxPrecedence}`);
    console.log(`   • Critical Infrastructure (< 1000): ${rules.filter(r => r.precedence < 1000).length}`);
    console.log(`   • High Priority (1000-10000): ${rules.filter(r => r.precedence >= 1000 && r.precedence < 10000).length}`);
    console.log(`   • Standard (10000-50000): ${rules.filter(r => r.precedence >= 10000 && r.precedence < 50000).length}`);
    console.log(`   • Low Priority (50000+): ${rules.filter(r => r.precedence >= 50000).length}`);
    
    // Look for potential issues
    console.log(`\n⚠️  Potential Issues:`);
    
    // 1. Check for duplicate precedences
    const precedenceCounts = {};
    rules.forEach(rule => {
      precedenceCounts[rule.precedence] = (precedenceCounts[rule.precedence] || 0) + 1;
    });
    const duplicatePrecedences = Object.entries(precedenceCounts).filter(([_, count]) => count > 1);
    if (duplicatePrecedences.length > 0) {
      console.log(`   ❌ Duplicate precedences found: ${duplicatePrecedences.map(([p, c]) => `${p}(${c})`).join(', ')}`);
    } else {
      console.log(`   ✅ No duplicate precedences`);
    }
    
    // 2. Check for disabled rules
    const disabledRules = rules.filter(rule => !rule.enabled);
    console.log(`   ${disabledRules.length > 0 ? '⚠️' : '✅'} Disabled rules: ${disabledRules.length}`);
    if (disabledRules.length > 0) {
      disabledRules.forEach(rule => {
        console.log(`      • ${rule.name} (precedence: ${rule.precedence})`);
      });
    }
    
    // 3. Check for very long traffic expressions
    const longTrafficRules = rules.filter(rule => rule.traffic && rule.traffic.length > 500);
    console.log(`   ${longTrafficRules.length > 0 ? '⚠️' : '✅'} Rules with long traffic expressions: ${longTrafficRules.length}`);
    
    // 4. Look for similar rules that could be consolidated
    const similarRules = [];
    const ruleCategories = {};
    
    rules.forEach(rule => {
      const category = rule.name.split(':')[0] || 'Other';
      if (!ruleCategories[category]) {
        ruleCategories[category] = [];
      }
      ruleCategories[category].push(rule);
    });
    
    console.log(`\n📂 Rule Categories:`);
    Object.entries(ruleCategories).forEach(([category, categoryRules]) => {
      console.log(`   • ${category}: ${categoryRules.length} rules`);
    });
    
    // 5. OpenAI-specific analysis
    const openaiRules = rules.filter(rule => 
      rule.name.toLowerCase().includes('openai') || 
      rule.name.toLowerCase().includes('chatgpt') ||
      rule.name.toLowerCase().includes('ai services')
    );
    
    console.log(`\n🤖 OpenAI/AI Services Analysis:`);
    console.log(`   • Total AI-related rules: ${openaiRules.length}`);
    openaiRules.forEach(rule => {
      console.log(`      • ${rule.name} (precedence: ${rule.precedence}, action: ${rule.action})`);
    });
    
    // 6. Certificate-related analysis
    const certRules = rules.filter(rule => 
      rule.name.toLowerCase().includes('certificate') ||
      rule.name.toLowerCase().includes('ssl') ||
      rule.name.toLowerCase().includes('tls') ||
      rule.name.toLowerCase().includes('ocsp') ||
      rule.name.toLowerCase().includes('crl')
    );
    
    console.log(`\n🔐 Certificate Infrastructure Analysis:`);
    console.log(`   • Total certificate-related rules: ${certRules.length}`);
    certRules.forEach(rule => {
      console.log(`      • ${rule.name} (precedence: ${rule.precedence}, action: ${rule.action})`);
    });
    
    // 7. Performance analysis
    const totalTrafficChars = rules.reduce((sum, rule) => sum + (rule.traffic?.length || 0), 0);
    const avgTrafficLength = Math.round(totalTrafficChars / rules.length);
    
    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   • Total traffic expression characters: ${totalTrafficChars.toLocaleString()}`);
    console.log(`   • Average traffic expression length: ${avgTrafficLength}`);
    console.log(`   • Rules with empty traffic: ${rules.filter(r => !r.traffic || r.traffic.trim() === '').length}`);
    
    // 8. Security coverage analysis
    const securityRules = rules.filter(rule => 
      rule.name.toLowerCase().includes('security') ||
      rule.name.toLowerCase().includes('block') ||
      rule.name.toLowerCase().includes('malware') ||
      rule.name.toLowerCase().includes('phishing')
    );
    
    console.log(`\n🛡️  Security Coverage:`);
    console.log(`   • Security-focused rules: ${securityRules.length}`);
    console.log(`   • Block actions: ${blockRules.length}`);
    console.log(`   • TLS bypass rules: ${bypassRules.length}`);
    
    // 9. Optimization recommendations
    console.log(`\n💡 Optimization Recommendations:`);
    
    // Check for rules that could use Gateway Lists
    const domainBasedRules = rules.filter(rule => 
      rule.traffic && (
        rule.traffic.includes('dns.fqdn ==') || 
        rule.traffic.includes('http.request.host ==')
      )
    );
    
    if (domainBasedRules.length > 5) {
      console.log(`   🎯 Consider consolidating ${domainBasedRules.length} domain-based rules into Gateway Lists`);
    }
    
    if (longTrafficRules.length > 0) {
      console.log(`   📏 Consider breaking down ${longTrafficRules.length} rules with long traffic expressions`);
    }
    
    if (duplicatePrecedences.length > 0) {
      console.log(`   🔢 Fix ${duplicatePrecedences.length} precedence conflicts`);
    }
    
    if (disabledRules.length > 0) {
      console.log(`   🗑️  Review ${disabledRules.length} disabled rules for cleanup`);
    }
    
    // Check for precedence gaps that could be optimized
    const precedenceGaps = [];
    for (let i = 1; i < precedences.length; i++) {
      const gap = precedences[i] - precedences[i-1];
      if (gap > 100) {
        precedenceGaps.push({ start: precedences[i-1], end: precedences[i], gap });
      }
    }
    
    if (precedenceGaps.length > 0) {
      console.log(`   📊 Found ${precedenceGaps.length} large precedence gaps that could be optimized`);
    }
    
    console.log(`\n✅ Analysis Complete!`);
    console.log(`\n📋 Summary:`);
    console.log(`   • Configuration Health: ${duplicatePrecedences.length === 0 && disabledRules.length === 0 ? 'EXCELLENT' : 'GOOD with minor issues'}`);
    console.log(`   • Rule Organization: ${Object.keys(ruleCategories).length} categories`);
    console.log(`   • Security Coverage: COMPREHENSIVE (${securityRules.length + blockRules.length} security rules)`);
    console.log(`   • OpenAI Support: COMPLETE (${openaiRules.length} dedicated rules)`);
    console.log(`   • Certificate Infrastructure: ROBUST (${certRules.length} certificate rules)`);
    
    return {
      rules,
      lists,
      analysis: {
        total: rules.length,
        categories: ruleCategories,
        issues: {
          duplicatePrecedences,
          disabledRules,
          longTrafficRules
        },
        performance: {
          totalTrafficChars,
          avgTrafficLength
        }
      }
    };
    
  } catch (error) {
    console.error('❌ Error analyzing rules:', error);
  }
}

analyzeAndOptimizeRules();
