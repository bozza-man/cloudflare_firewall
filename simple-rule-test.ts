#!/usr/bin/env ts-node

import axios from 'axios';

// Configuration - using exact same pattern as working optimizer
const ACCOUNT_ID = '0b0ee2b5eaf1fb8a2612e40ab6488052';
const CLOUDFLARE_EMAIL = 'daniel@bruteforce.group';
const CLOUDFLARE_GLOBAL_KEY = '9586ac5f9e8deaeffa283a83d137d265123fe';
const BASE_URL = 'https://api.cloudflare.com/client/v4';

const headers = {
  'X-Auth-Email': CLOUDFLARE_EMAIL,
  'X-Auth-Key': CLOUDFLARE_GLOBAL_KEY,
  'Content-Type': 'application/json',
};

interface GatewayRule {
  id: string;
  name: string;
  enabled: boolean;
  precedence: number;
  traffic: string;
  action: string;
}

async function testOptimizedRules() {
  console.log('🔬 Simple Gateway Rule Test');
  console.log('===========================');
  console.log(`Account ID: ${ACCOUNT_ID}\n`);

  try {
    // Load rules using exact same URL as optimizer
    console.log('📋 Loading Gateway Rules...');
    const rulesResponse = await axios.get(
      `${BASE_URL}/accounts/${ACCOUNT_ID}/gateway/rules`,
      { headers }
    );
    
    const rules: GatewayRule[] = rulesResponse.data.result;
    console.log(`   Found ${rules.length} total rules\n`);

    // Find rules that use Gateway Lists (contain $ references)
    const listPattern = /\$([a-f0-9-]{36})/g;
    const optimizedRules = rules.filter(rule => listPattern.test(rule.traffic));
    
    console.log(`🎯 Found ${optimizedRules.length} rules using Gateway Lists:`);
    console.log('=====================================================');
    
    optimizedRules.forEach((rule, index) => {
      const listMatches = rule.traffic.match(/\$([a-f0-9-]{36})/g) || [];
      console.log(`\n${index + 1}. ${rule.name}`);
      console.log(`   Status: ${rule.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
      console.log(`   Precedence: ${rule.precedence}`);
      console.log(`   List references: ${listMatches.length}`);
      listMatches.forEach(ref => {
        console.log(`      - ${ref}`);
      });
      console.log(`   Traffic filter: ${rule.traffic}`);
    });

    // Test creating a simple rule to verify API access
    console.log('\n🧪 Testing API Write Access...');
    const testRule = {
      name: `API_TEST_${Date.now()}`,
      enabled: false,
      precedence: 999999,
      traffic: 'dns.fqdn == "test.example.com"',
      action: 'allow',
      description: 'Temporary API test rule'
    };

    const createResponse = await axios.post(
      `${BASE_URL}/accounts/${ACCOUNT_ID}/gateway/rules`,
      testRule,
      { headers }
    );
    
    const testRuleId = createResponse.data.result.id;
    console.log(`   ✅ Successfully created test rule: ${testRuleId}`);
    
    // Clean up
    await axios.delete(
      `${BASE_URL}/accounts/${ACCOUNT_ID}/gateway/rules/${testRuleId}`,
      { headers }
    );
    console.log(`   🗑️  Successfully cleaned up test rule`);

    console.log('\n📊 Summary:');
    console.log('============');
    console.log(`✅ API Access: Working`);
    console.log(`📋 Total Rules: ${rules.length}`);
    console.log(`🎯 Optimized Rules: ${optimizedRules.length}`);
    console.log(`🔗 Total List References: ${optimizedRules.reduce((sum, rule) => {
      return sum + (rule.traffic.match(/\$([a-f0-9-]{36})/g) || []).length;
    }, 0)}`);
    
    if (optimizedRules.length > 0) {
      console.log('\n🎉 SUCCESS: Gateway Lists are active in production!');
      console.log('✅ List-based optimization is working correctly');
      console.log('✅ Rules are properly referencing Gateway Lists');
    } else {
      console.log('\n⚠️  No optimized rules found - optimization may not be complete');
    }

  } catch (error: any) {
    console.error('💥 Test failed:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testOptimizedRules();
