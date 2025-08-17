#!/usr/bin/env node

/**
 * List Reference Syntax Diagnostic Tool
 * 
 * Determines the correct syntax for referencing Gateway Lists in rule traffic filters
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  CLOUDFLARE_EMAIL: process.env.CLOUDFLARE_EMAIL,
  CLOUDFLARE_GLOBAL_KEY: process.env.CLOUDFLARE_GLOBAL_KEY,
  ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052',
  BASE_URL: 'https://api.cloudflare.com/client/v4'
};

class ListSyntaxDiagnostic {
  private client: axios.AxiosInstance;
  private requestCount = 0;

  constructor() {
    this.client = axios.create({
      baseURL: CONFIG.BASE_URL,
      timeout: 30000,
      headers: {
        'X-Auth-Email': CONFIG.CLOUDFLARE_EMAIL,
        'X-Auth-Key': CONFIG.CLOUDFLARE_GLOBAL_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'ListSyntaxDiagnostic/1.0'
      }
    });

    this.client.interceptors.request.use(async (config) => {
      this.requestCount++;
      console.log(`🔄 ${config.method?.toUpperCase()} ${config.url} (Request #${this.requestCount})`);
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        if (!response.data.success) {
          const errors = response.data.errors || [];
          const errorMessage = errors.map((e: any) => e.message).join('; ') || 'Unknown API error';
          throw new Error(`Cloudflare API Error: ${errorMessage}`);
        }
        return response;
      },
      (error) => {
        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          const errorMessage = errors.map((e: any) => e.message).join('; ');
          throw new Error(`Cloudflare API Error: ${errorMessage}`);
        }
        throw error;
      }
    );
  }

  async run(): Promise<void> {
    console.log('🔍 List Reference Syntax Diagnostic Tool');
    console.log('========================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}\n`);

    try {
      // Step 1: Get available lists
      console.log('📋 Step 1: Fetching available Gateway Lists...');
      const lists = await this.listGatewayLists();
      console.log(`   Found ${lists.length} available lists\n`);

      // Step 2: Test various syntax patterns with a simple list
      console.log('🧪 Step 2: Testing list reference syntax patterns...');
      
      // Find a simple list to test with
      const testList = lists.find(list => list.name && list.name.length > 0 && (list.count || 0) > 0);
      if (!testList) {
        console.log('❌ No suitable test list found');
        return;
      }

      console.log(`   Using test list: "${testList.name}" (ID: ${testList.id})`);
      
      await this.testSyntaxPatterns(testList);

      // Step 3: Check existing rules for working list references
      console.log('\n🔍 Step 3: Analyzing existing rules for list reference patterns...');
      await this.analyzeExistingRules();

      // Step 4: Test rule creation with different syntaxes
      console.log('\n🧪 Step 4: Testing rule creation with different list syntaxes...');
      await this.testRuleCreation(testList);

    } catch (error) {
      console.error('💥 List syntax diagnostic failed:', error);
      process.exit(1);
    }
  }

  private async listGatewayLists() {
    const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
    return response.data.result || [];
  }

  private async listGatewayRules() {
    const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`);
    return response.data.result || [];
  }

  private async testSyntaxPatterns(testList: any): Promise<void> {
    const syntaxPatterns = [
      `$${testList.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,    // $list-name (kebab-case)
      `$${testList.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,    // $list_name (snake_case)
      `$${testList.name.replace(/\s+/g, '')}`,                         // $ListName (no spaces)
      `$${testList.name}`,                                             // $Original Name
      `${testList.id}`,                                                // List ID
      `$${testList.id}`,                                               // $List ID
      `"${testList.name}"`,                                            // "List Name" in quotes
      `list:${testList.id}`,                                           // list:id format
      `list:${testList.name}`,                                         // list:name format
    ];

    console.log('\n   🔬 Testing syntax patterns:');
    
    for (const pattern of syntaxPatterns) {
      console.log(`\n      Testing: ${pattern}`);
      
      // Test the pattern in a simple DNS rule
      const testTraffic = `dns.fqdn in ${pattern}`;
      console.log(`      Traffic filter: ${testTraffic}`);
      
      try {
        // Try to validate by attempting rule creation (dry run style)
        // We'll create and immediately delete a test rule
        const testRule = {
          name: `LIST_SYNTAX_TEST_DELETE_ME_${Date.now()}`,
          action: 'allow',
          enabled: false, // Keep disabled for safety
          traffic: testTraffic,
          precedence: 99999, // Very low priority
          description: 'Temporary rule for testing list syntax - DELETE IMMEDIATELY'
        };

        const response = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`, testRule);
        const createdRule = response.data.result;
        
        console.log(`      ✅ SUCCESS: Pattern "${pattern}" works!`);
        
        // Clean up immediately
        await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${createdRule.id}`);
        console.log(`      🗑️  Cleaned up test rule`);
        
        // Found working syntax, let's test a few more variations
        console.log(`\n   🎉 FOUND WORKING SYNTAX: ${pattern}`);
        return;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${errorMessage.substring(0, 100)}...`);
      }
    }
    
    console.log('\n   ❌ No working syntax patterns found in basic tests');
  }

  private async analyzeExistingRules(): Promise<void> {
    const rules = await this.listGatewayRules();
    console.log(`   Analyzing ${rules.length} existing rules for list references...\n`);
    
    const rulesWithPossibleLists = rules.filter(rule => 
      rule.traffic && (
        rule.traffic.includes('$') ||
        rule.traffic.includes('list:') ||
        rule.traffic.includes('in {') === false // Rules that might use list syntax instead of inline arrays
      )
    );

    if (rulesWithPossibleLists.length === 0) {
      console.log('   ❌ No existing rules found with list reference syntax');
      return;
    }

    console.log(`   Found ${rulesWithPossibleLists.length} rules that might use list references:`);
    
    rulesWithPossibleLists.slice(0, 5).forEach((rule, index) => {
      console.log(`\n   ${index + 1}. ${rule.name}`);
      console.log(`      Traffic: ${rule.traffic.substring(0, 100)}${rule.traffic.length > 100 ? '...' : ''}`);
      
      // Look for potential list reference patterns
      const patterns = rule.traffic.match(/\$[a-zA-Z0-9_-]+/g);
      if (patterns) {
        console.log(`      Found patterns: ${patterns.join(', ')}`);
      }
    });
  }

  private async testRuleCreation(testList: any): Promise<void> {
    console.log(`\n   Testing rule creation with list: "${testList.name}"`);
    
    // Test the most likely syntaxes based on Cloudflare documentation patterns
    const likelySyntaxes = [
      { pattern: `dns.fqdn in $${testList.name.toLowerCase().replace(/\s+/g, '')}`, description: 'camelCase without spaces' },
      { pattern: `dns.fqdn in $"${testList.name}"`, description: 'quoted list name' },
      { pattern: `dns.fqdn in \$${testList.name}`, description: 'escaped dollar sign' },
      { pattern: `dns.fqdn in list("${testList.name}")`, description: 'list() function syntax' },
      { pattern: `dns.fqdn in @${testList.name}`, description: 'at symbol prefix' },
    ];

    for (const syntax of likelySyntaxes) {
      console.log(`\n      Testing: ${syntax.description}`);
      console.log(`      Pattern: ${syntax.pattern}`);
      
      try {
        const testRule = {
          name: `SYNTAX_TEST_${Date.now()}`,
          action: 'allow',
          enabled: false,
          traffic: syntax.pattern,
          precedence: 99999,
          description: 'Temporary syntax test rule'
        };

        const response = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`, testRule);
        const createdRule = response.data.result;
        
        console.log(`      ✅ SUCCESS: ${syntax.description} works!`);
        console.log(`      ✅ Rule created with ID: ${createdRule.id}`);
        
        // Clean up
        await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${createdRule.id}`);
        console.log(`      🗑️  Test rule cleaned up`);
        
        // Found a working syntax!
        console.log(`\n   🎉 CONFIRMED WORKING SYNTAX: ${syntax.pattern}`);
        return;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${errorMessage.substring(0, 150)}...`);
      }
    }

    console.log('\n   ❌ No working list reference syntax found');
    console.log('   💡 This suggests that either:');
    console.log('      1. List references may not be supported in this account type');
    console.log('      2. The syntax is different than expected');
    console.log('      3. Lists need to be created with specific naming conventions');
    console.log('\n   📚 Recommendation: Check Cloudflare Zero Trust documentation');
    console.log('      or use inline domain arrays as the current working solution');
  }
}

// Run the diagnostic
const diagnostic = new ListSyntaxDiagnostic();
diagnostic.run().catch(error => {
  console.error('💥 List syntax diagnostic failed:', error);
  process.exit(1);
});
