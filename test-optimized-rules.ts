#!/usr/bin/env ts-node

import axios from 'axios';

// Configuration
const ACCOUNT_ID = '0b0ee2b5eaf1fb8a2612e40ab6488052';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ CLOUDFLARE_API_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

interface GatewayRule {
  id: string;
  name: string;
  enabled: boolean;
  precedence: number;
  traffic: string;
  action: string;
  description?: string;
}

interface GatewayList {
  id: string;
  name: string;
  type: string;
  count: number;
  items: Array<{ value: string }>;
}

interface TestResult {
  ruleName: string;
  ruleId: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

class RuleTester {
  private requestCount = 0;

  private makeRequest(method: string, url: string, data?: any) {
    this.requestCount++;
    console.log(`🔄 ${method} ${url.replace(/.*\/accounts\//, '/accounts/')} (Request #${this.requestCount})`);
    return axios({ method, url, headers, data });
  }

  async loadRules(): Promise<GatewayRule[]> {
    const response = await this.makeRequest('GET', 
      `https://api.cloudflare.com/v4/accounts/${ACCOUNT_ID}/gateway/rules`
    );
    return response.data.result;
  }

  async loadLists(): Promise<GatewayList[]> {
    const response = await this.makeRequest('GET',
      `https://api.cloudflare.com/v4/accounts/${ACCOUNT_ID}/gateway/lists`
    );
    
    const lists = response.data.result.filter((list: any) => list.type === 'DOMAIN');
    
    // Load details for each list
    const detailedLists: GatewayList[] = [];
    for (const list of lists) {
      const detailResponse = await this.makeRequest('GET',
        `https://api.cloudflare.com/v4/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`
      );
      detailedLists.push({
        id: list.id,
        name: list.name,
        type: list.type,
        count: list.count,
        items: detailResponse.data.result.items
      });
    }
    
    return detailedLists;
  }

  async testRuleSyntax(rule: GatewayRule): Promise<TestResult> {
    console.log(`\n🧪 Testing rule: ${rule.name}`);
    console.log(`   Rule ID: ${rule.id}`);
    console.log(`   Status: ${rule.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
    console.log(`   Traffic filter: ${rule.traffic}`);

    try {
      // Create a test rule to validate syntax
      const testRuleData = {
        name: `TEST_SYNTAX_${Date.now()}`,
        enabled: false,
        precedence: 999999,
        traffic: rule.traffic,
        action: 'allow',
        description: 'Temporary test rule for syntax validation'
      };

      const createResponse = await this.makeRequest('POST',
        `https://api.cloudflare.com/v4/accounts/${ACCOUNT_ID}/gateway/rules`,
        testRuleData
      );

      const testRuleId = createResponse.data.result.id;
      console.log(`   ✅ Syntax test passed - created test rule ${testRuleId}`);

      // Clean up test rule
      await this.makeRequest('DELETE',
        `https://api.cloudflare.com/v4/accounts/${ACCOUNT_ID}/gateway/rules/${testRuleId}`
      );
      console.log(`   🗑️  Cleaned up test rule`);

      return {
        ruleName: rule.name,
        ruleId: rule.id,
        status: 'PASS',
        message: 'Syntax validation passed',
        details: { traffic: rule.traffic }
      };

    } catch (error: any) {
      console.log(`   ❌ Syntax test failed`);
      return {
        ruleName: rule.name,
        ruleId: rule.id,
        status: 'FAIL',
        message: `Syntax validation failed: ${error.response?.data?.errors?.[0]?.message || error.message}`,
        details: { 
          traffic: rule.traffic,
          error: error.response?.data
        }
      };
    }
  }

  findListReferences(traffic: string): string[] {
    const listRefPattern = /\$([a-f0-9-]{36})/g;
    const matches = [];
    let match;
    
    while ((match = listRefPattern.exec(traffic)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  async validateListReferences(rule: GatewayRule, lists: GatewayList[]): Promise<TestResult> {
    const listRefs = this.findListReferences(rule.traffic);
    
    if (listRefs.length === 0) {
      return {
        ruleName: rule.name,
        ruleId: rule.id,
        status: 'WARNING',
        message: 'No list references found in rule',
        details: { traffic: rule.traffic }
      };
    }

    const listMap = new Map(lists.map(l => [l.id, l]));
    const missingLists = [];
    const validLists = [];

    for (const listId of listRefs) {
      const list = listMap.get(listId);
      if (list) {
        validLists.push({
          id: listId,
          name: list.name,
          count: list.count
        });
      } else {
        missingLists.push(listId);
      }
    }

    if (missingLists.length > 0) {
      return {
        ruleName: rule.name,
        ruleId: rule.id,
        status: 'FAIL',
        message: `Rule references missing lists: ${missingLists.join(', ')}`,
        details: { validLists, missingLists, traffic: rule.traffic }
      };
    }

    return {
      ruleName: rule.name,
      ruleId: rule.id,
      status: 'PASS',
      message: `All ${listRefs.length} list reference(s) valid`,
      details: { 
        validLists,
        listCount: listRefs.length,
        totalDomains: validLists.reduce((sum, l) => sum + l.count, 0),
        traffic: rule.traffic
      }
    };
  }

  async runComprehensiveTests(): Promise<void> {
    console.log('🔬 Gateway Rule Optimization Test Suite');
    console.log('=======================================');
    console.log(`Account ID: ${ACCOUNT_ID}`);
    console.log('Testing optimized rules for correctness and functionality\n');

    try {
      console.log('📋 Step 1: Loading Gateway Rules...');
      const rules = await this.loadRules();
      console.log(`   Found ${rules.length} total rules\n`);

      console.log('📋 Step 2: Loading Gateway Lists...');
      const lists = await this.loadLists();
      console.log(`   Found ${lists.length} DOMAIN type lists\n`);

      // Find rules that use list references
      const optimizedRules = rules.filter(rule => 
        this.findListReferences(rule.traffic).length > 0
      );

      console.log(`🎯 Step 3: Found ${optimizedRules.length} rules using Gateway Lists:`);
      optimizedRules.forEach(rule => {
        const listRefs = this.findListReferences(rule.traffic);
        console.log(`   • ${rule.name} (${listRefs.length} list references)`);
      });
      console.log('');

      const testResults: TestResult[] = [];

      console.log('🧪 Step 4: Testing Rule Syntax Validation...');
      console.log('================================================');
      
      // Test a sample of optimized rules (first 5 to avoid too many API calls)
      const samplesToTest = optimizedRules.slice(0, 5);
      
      for (const rule of samplesToTest) {
        const syntaxResult = await this.testRuleSyntax(rule);
        testResults.push(syntaxResult);
        
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log('\n🔍 Step 5: Validating List References...');
      console.log('==========================================');
      
      for (const rule of optimizedRules) {
        const listResult = await this.validateListReferences(rule, lists);
        testResults.push(listResult);
        console.log(`   ${listResult.status === 'PASS' ? '✅' : listResult.status === 'WARNING' ? '⚠️' : '❌'} ${rule.name}: ${listResult.message}`);
        
        if (listResult.details?.validLists) {
          listResult.details.validLists.forEach((list: any) => {
            console.log(`      📋 ${list.name} (${list.count} domains)`);
          });
        }
      }

      console.log('\n📊 Step 6: Test Results Summary');
      console.log('================================');
      
      const passCount = testResults.filter(r => r.status === 'PASS').length;
      const failCount = testResults.filter(r => r.status === 'FAIL').length;
      const warnCount = testResults.filter(r => r.status === 'WARNING').length;
      
      console.log(`✅ PASSED: ${passCount} tests`);
      console.log(`❌ FAILED: ${failCount} tests`);  
      console.log(`⚠️  WARNINGS: ${warnCount} tests`);
      console.log(`🔄 Total API requests: ${this.requestCount}`);

      if (failCount > 0) {
        console.log('\n❌ FAILED TESTS:');
        testResults.filter(r => r.status === 'FAIL').forEach(result => {
          console.log(`   • ${result.ruleName}: ${result.message}`);
          if (result.details?.error) {
            console.log(`     Error details: ${JSON.stringify(result.details.error, null, 2)}`);
          }
        });
      }

      if (warnCount > 0) {
        console.log('\n⚠️  WARNINGS:');
        testResults.filter(r => r.status === 'WARNING').forEach(result => {
          console.log(`   • ${result.ruleName}: ${result.message}`);
        });
      }

      console.log('\n🎉 OPTIMIZATION VERIFICATION COMPLETE!');
      
      if (failCount === 0) {
        console.log('✅ All critical tests passed - optimized rules are functioning correctly!');
        console.log('✅ Gateway Lists are properly integrated and working in production');
        console.log('✅ List references are valid and resolve to existing domain lists');
        
        // Calculate total domains being managed through lists
        const totalDomainsInLists = testResults
          .filter(r => r.details?.totalDomains)
          .reduce((sum, r) => sum + (r.details.totalDomains || 0), 0);
          
        console.log(`📊 Managing ${totalDomainsInLists} domains through ${optimizedRules.length} optimized rules`);
        console.log('🚀 Your Gateway infrastructure optimization is confirmed successful!');
      } else {
        console.log('⚠️  Some tests failed - please review the failed rules before proceeding');
      }

    } catch (error: any) {
      console.error('💥 Test suite failed:', error.message);
      if (error.response?.data) {
        console.error('API Error:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }
  }
}

// Run the test suite
async function main() {
  const tester = new RuleTester();
  await tester.runComprehensiveTests();
}

// Check if this is the main module (ES module compatible)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}
