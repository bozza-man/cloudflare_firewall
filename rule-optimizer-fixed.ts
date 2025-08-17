#!/usr/bin/env node

/**
 * Fixed Gateway Rule Optimization Tool
 * 
 * Uses the correct syntax discovered: $listId (where listId is the UUID)
 * Only operates on DOMAIN type lists for DNS/HTTP matching
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config();

const CONFIG = {
  CLOUDFLARE_EMAIL: process.env.CLOUDFLARE_EMAIL,
  CLOUDFLARE_GLOBAL_KEY: process.env.CLOUDFLARE_GLOBAL_KEY,
  ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052',
  BASE_URL: 'https://api.cloudflare.com/client/v4',
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  RATE_LIMIT_DELAY: 500,
  TIMEOUT: 30000
};

interface GatewayList {
  id: string;
  name: string;
  description?: string;
  type: 'DOMAIN' | 'IP' | 'EMAIL' | 'URL' | 'SERIAL';
  items?: Array<{value: string; created_at?: string}>;
  count?: number;
  created_at: string;
  updated_at: string;
}

interface GatewayRule {
  id: string;
  name: string;
  description?: string;
  action: string;
  enabled: boolean;
  filters: string[];
  traffic: string;
  identity: string;
  precedence: number;
  rule_settings?: any;
  created_at: string;
  updated_at: string;
}

interface OptimizationResult {
  ruleId: string;
  ruleName: string;
  success: boolean;
  originalTraffic: string;
  optimizedTraffic: string;
  listsUsed: Array<{name: string; id: string}>;
  charactersSaved: number;
  error?: string;
}

class FixedRuleOptimizer {
  private client: axios.AxiosInstance;
  private requestCount = 0;
  private startTime: number;
  private domainLists: Map<string, GatewayList> = new Map(); // Only DOMAIN type lists
  private results: OptimizationResult[] = [];

  constructor() {
    this.startTime = Date.now();
    
    this.client = axios.create({
      baseURL: CONFIG.BASE_URL,
      timeout: CONFIG.TIMEOUT,
      headers: {
        'X-Auth-Email': CONFIG.CLOUDFLARE_EMAIL,
        'X-Auth-Key': CONFIG.CLOUDFLARE_GLOBAL_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'FixedRuleOptimizer/1.0'
      }
    });

    this.client.interceptors.request.use(async (config) => {
      this.requestCount++;
      if (this.requestCount > 1) {
        await this.delay(CONFIG.RATE_LIMIT_DELAY);
      }
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withRetries<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === CONFIG.MAX_RETRIES) {
          console.error(`❌ ${context} failed after ${CONFIG.MAX_RETRIES} attempts: ${lastError.message}`);
          throw lastError;
        }
        
        const delay = CONFIG.RETRY_DELAY * attempt;
        console.log(`⚠️  ${context} failed (attempt ${attempt}/${CONFIG.MAX_RETRIES}), retrying in ${delay}ms...`);
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }

  async run(): Promise<void> {
    console.log('🔧 Fixed Gateway Rule Optimization Tool');
    console.log('=======================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}`);
    console.log(`Strategy: Use correct list syntax: $listId (UUID format)\n`);

    try {
      // Step 1: Load DOMAIN type lists only
      console.log('📋 Step 1: Loading DOMAIN type Gateway Lists...');
      await this.loadDomainLists();

      if (this.domainLists.size === 0) {
        console.log('❌ No DOMAIN type lists found - cannot optimize rules');
        return;
      }

      // Step 2: Load rules to optimize
      console.log('\n🔧 Step 2: Loading Gateway Rules...');
      const rules = await this.listGatewayRules();
      console.log(`   Found ${rules.length} total rules`);

      // Step 3: Test list syntax first
      console.log('\n🧪 Step 3: Testing list syntax with a safe rule...');
      const testSuccess = await this.testListSyntax();
      
      if (!testSuccess) {
        console.log('❌ List syntax test failed - cannot proceed with optimization');
        return;
      }

      // Step 4: Identify optimization candidates
      console.log('\n🎯 Step 4: Identifying optimization candidates...');
      const candidates = this.identifyOptimizationCandidates(rules);
      console.log(`   Found ${candidates.length} rules that can be optimized`);

      if (candidates.length === 0) {
        console.log('\n✅ No rules found that can benefit from list optimization');
        return;
      }

      // Step 5: Display optimization plan
      console.log('\n📊 Step 5: Optimization Plan...');
      this.displayOptimizationPlan(candidates);

      // Step 6: Execute optimizations (starting with safest ones)
      console.log('\n🚀 Step 6: Executing Rule Optimizations...');
      await this.executeOptimizations(candidates);

      // Step 7: Generate results report
      console.log('\n📝 Step 7: Generating Results Report...');
      await this.generateResultsReport();

      // Step 8: Final summary
      this.displayFinalSummary();

    } catch (error) {
      console.error('💥 Fixed rule optimization failed:', error);
      process.exit(1);
    }
  }

  private async loadDomainLists(): Promise<void> {
    const allLists = await this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
      return response.data.result || [];
    }, 'Load Gateway Lists');

    // Filter for DOMAIN type lists only and load their contents
    const domainTypeLists = allLists.filter((list: any) => list.type === 'DOMAIN');
    
    console.log(`   Found ${domainTypeLists.length} DOMAIN type lists out of ${allLists.length} total`);

    for (const list of domainTypeLists) {
      try {
        const detailedList = await this.withRetries(async () => {
          const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${list.id}`);
          return response.data.result;
        }, `Load list details for ${list.name}`);

        this.domainLists.set(list.id, detailedList);
        console.log(`   📋 Loaded: ${list.name} (${detailedList.items?.length || 0} domains) -> $${list.id}`);
      } catch (error) {
        console.log(`   ⚠️  Could not load details for ${list.name}: ${error.message}`);
      }
    }

    console.log(`   ✅ Loaded ${this.domainLists.size} DOMAIN lists for optimization`);
  }

  private async listGatewayRules(): Promise<GatewayRule[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`);
      return response.data.result || [];
    }, 'List Gateway Rules');
  }

  private async testListSyntax(): Promise<boolean> {
    // Find a list to test with
    const testList = Array.from(this.domainLists.values())[0];
    if (!testList) {
      console.log('   ❌ No lists available for syntax testing');
      return false;
    }

    console.log(`   Testing with list: "${testList.name}" (${testList.id})`);
    
    try {
      // Create a test rule using the correct syntax
      const testRule = {
        name: `LIST_SYNTAX_TEST_DELETE_IMMEDIATELY_${Date.now()}`,
        action: 'allow',
        enabled: false, // Keep disabled for safety
        traffic: `dns.fqdn in $${testList.id}`, // Correct syntax: $listId
        precedence: 99999,
        description: 'Temporary rule for testing list syntax - DELETE IMMEDIATELY'
      };

      const response = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`, testRule);
      const createdRule = response.data.result;
      
      console.log(`   ✅ SUCCESS: List syntax $${testList.id} works!`);
      
      // Clean up immediately
      await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${createdRule.id}`);
      console.log(`   🗑️  Test rule cleaned up`);
      
      return true;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ List syntax test failed: ${errorMessage.substring(0, 200)}...`);
      return false;
    }
  }

  private identifyOptimizationCandidates(rules: GatewayRule[]): Array<{rule: GatewayRule; optimization: any}> {
    const candidates: Array<{rule: GatewayRule; optimization: any}> = [];

    for (const rule of rules) {
      const optimization = this.analyzeRuleForOptimization(rule);
      if (optimization && optimization.potentialSavings > 20) { // Minimum 20 characters savings
        candidates.push({ rule, optimization });
      }
    }

    // Sort by potential savings but prioritize disabled rules first for safety
    return candidates.sort((a, b) => {
      if (a.rule.enabled !== b.rule.enabled) {
        return a.rule.enabled ? 1 : -1;
      }
      return b.optimization.potentialSavings - a.optimization.potentialSavings;
    });
  }

  private analyzeRuleForOptimization(rule: GatewayRule): any {
    const extractedDomains = this.extractDomainsFromTrafficFilter(rule.traffic);
    if (extractedDomains.length < 3) { // Need at least 3 domains to make optimization worthwhile
      return null;
    }

    const optimizationPlan = {
      extractedDomains,
      applicableLists: [] as Array<{listId: string; listName: string; matchedDomains: string[]; coverage: number}>,
      potentialSavings: 0,
      optimizedTraffic: rule.traffic
    };

    // Find lists that can replace inline domains
    for (const [listId, list] of this.domainLists.entries()) {
      if (!list.items) continue;

      const listDomains = list.items.map(item => item.value.toLowerCase());
      const matchedDomains = extractedDomains.filter(domain =>
        listDomains.some(listDomain =>
          domain.toLowerCase() === listDomain ||
          domain.toLowerCase().includes(listDomain) ||
          listDomain.includes(domain.toLowerCase())
        )
      );

      if (matchedDomains.length >= 3) { // Need at least 3 matches to be worth it
        const coverage = matchedDomains.length / extractedDomains.length;
        optimizationPlan.applicableLists.push({
          listId,
          listName: list.name,
          matchedDomains,
          coverage
        });
      }
    }

    if (optimizationPlan.applicableLists.length > 0) {
      // Generate optimized traffic and calculate savings
      const optimizedTraffic = this.generateOptimizedTraffic(rule.traffic, optimizationPlan.applicableLists);
      optimizationPlan.optimizedTraffic = optimizedTraffic;
      optimizationPlan.potentialSavings = rule.traffic.length - optimizedTraffic.length;
    }

    return optimizationPlan.applicableLists.length > 0 ? optimizationPlan : null;
  }

  private extractDomainsFromTrafficFilter(traffic: string): string[] {
    const domains: string[] = [];
    
    // Patterns to extract domains from various syntax forms
    const patterns = [
      /dns\.fqdn\s+(?:==|in)\s+\{([^}]+)\}/g,
      /dns\.fqdn\s+==\s+"([^"]+)"/g,
      /http\.request\.host\s+(?:==|in)\s+\{([^}]+)\}/g,
      /http\.request\.host\s+==\s+"([^"]+)"/g,
      /http\.conn\.hostname\s+(?:==|in)\s+\{([^}]+)\}/g,
      /http\.conn\.hostname\s+==\s+"([^"]+)"/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(traffic)) !== null) {
        if (match[1]) {
          if (match[1].includes('"')) {
            // Handle multiple domains in braces
            const multipleDomains = match[1]
              .split(/\s+/)
              .map(d => d.replace(/"/g, '').trim())
              .filter(d => d.length > 0 && d.includes('.') && !d.includes('$'));
            domains.push(...multipleDomains);
          } else {
            // Single domain
            const domain = match[1].trim();
            if (domain.includes('.') && domain.length > 3 && !domain.includes('$')) {
              domains.push(domain);
            }
          }
        }
      }
    }

    return [...new Set(domains)];
  }

  private generateOptimizedTraffic(
    originalTraffic: string, 
    applicableLists: Array<{listId: string; listName: string; matchedDomains: string[]; coverage: number}>
  ): string {
    let optimizedTraffic = originalTraffic;
    
    // Sort by coverage (highest first)
    const sortedLists = [...applicableLists].sort((a, b) => b.coverage - a.coverage);
    
    for (const listInfo of sortedLists.slice(0, 1)) { // Use only the best matching list
      // Build the domain array pattern to replace
      const domainsPattern = listInfo.matchedDomains
        .map(d => `"${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
        .join('\\s+"');
      
      // Replace domain arrays with list reference
      const arrayPatterns = [
        new RegExp(`(dns\\.fqdn\\s+in\\s+)\\{[^}]*(?:${domainsPattern})[^}]*\\}`, 'gi'),
        new RegExp(`(http\\.request\\.host\\s+in\\s+)\\{[^}]*(?:${domainsPattern})[^}]*\\}`, 'gi'),
        new RegExp(`(http\\.conn\\.hostname\\s+in\\s+)\\{[^}]*(?:${domainsPattern})[^}]*\\}`, 'gi')
      ];
      
      for (const pattern of arrayPatterns) {
        if (pattern.test(originalTraffic)) {
          optimizedTraffic = optimizedTraffic.replace(pattern, `$1$${listInfo.listId}`);
          break; // Only replace once per rule
        }
      }
      
      // Also replace single domain matches if they're in the list
      for (const domain of listInfo.matchedDomains) {
        const singleDomainPatterns = [
          new RegExp(`(dns\\.fqdn\\s+==\\s+)"${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi'),
          new RegExp(`(http\\.request\\.host\\s+==\\s+)"${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi'),
          new RegExp(`(http\\.conn\\.hostname\\s+==\\s+)"${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi')
        ];
        
        for (const singlePattern of singleDomainPatterns) {
          optimizedTraffic = optimizedTraffic.replace(singlePattern, `$1$${listInfo.listId}`);
        }
      }
    }

    return optimizedTraffic;
  }

  private displayOptimizationPlan(candidates: Array<{rule: GatewayRule; optimization: any}>): void {
    console.log(`\n   📊 Optimization Plan (${candidates.length} rules):`);
    console.log('   ===========================================\n');

    candidates.slice(0, 8).forEach((candidate, index) => {
      const { rule, optimization } = candidate;
      console.log(`   ${index + 1}. ${rule.name}`);
      console.log(`      Status: ${rule.enabled ? '🟢 Enabled' : '🔴 Disabled'} (Precedence: ${rule.precedence})`);
      console.log(`      Potential savings: ~${optimization.potentialSavings} characters`);
      console.log(`      Lists to use: ${optimization.applicableLists.map((l: any) => l.listName).join(', ')}`);
      console.log(`      Domains to replace: ${optimization.extractedDomains.length}`);
      console.log('');
    });

    if (candidates.length > 8) {
      console.log(`   ... and ${candidates.length - 8} more rules`);
    }

    const totalSavings = candidates.reduce((sum, c) => sum + c.optimization.potentialSavings, 0);
    console.log(`\n   💡 Total potential savings: ~${totalSavings} characters across ${candidates.length} rules`);
  }

  private async executeOptimizations(candidates: Array<{rule: GatewayRule; optimization: any}>): Promise<void> {
    // Start conservatively with disabled rules only
    const disabledRules = candidates.filter(c => !c.rule.enabled);
    const enabledRules = candidates.filter(c => c.rule.enabled);
    
    // Process only a few rules at a time for safety
    const toProcess = [...disabledRules.slice(0, 3), ...enabledRules.slice(0, 2)];
    
    console.log(`\n   Starting optimization of ${toProcess.length} rules (${disabledRules.length} disabled available, ${enabledRules.length} enabled available)...`);

    for (let i = 0; i < toProcess.length; i++) {
      const { rule, optimization } = toProcess[i];
      
      console.log(`\n   ${i + 1}/${toProcess.length} Optimizing: ${rule.name}`);
      console.log(`      ${rule.enabled ? '🟢' : '🔴'} ${rule.enabled ? 'ENABLED' : 'DISABLED'} | Precedence: ${rule.precedence}`);
      
      const result: OptimizationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        success: false,
        originalTraffic: rule.traffic,
        optimizedTraffic: optimization.optimizedTraffic,
        listsUsed: optimization.applicableLists.map((l: any) => ({name: l.listName, id: l.listId})),
        charactersSaved: optimization.potentialSavings,
        error: undefined
      };

      try {
        // Create backup description
        const backupDescription = `${rule.description || ''}\n\n[BACKUP] Original traffic filter:\n${rule.traffic}`.trim();

        await this.withRetries(async () => {
          const response = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${rule.id}`, {
            name: rule.name,
            description: backupDescription,
            action: rule.action,
            enabled: rule.enabled,
            filters: rule.filters,
            traffic: optimization.optimizedTraffic,
            identity: rule.identity,
            precedence: rule.precedence,
            rule_settings: rule.rule_settings
          });
          return response.data.result;
        }, `Update rule ${rule.name}`);

        console.log(`      ✅ Successfully optimized`);
        console.log(`      📊 Saved ~${optimization.potentialSavings} characters`);
        console.log(`      📋 Using lists: ${result.listsUsed.map(l => l.name).join(', ')}`);
        
        result.success = true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${errorMessage}`);
        result.error = errorMessage;
      }

      this.results.push(result);

      // Pause between updates
      if (i < toProcess.length - 1) {
        await this.delay(2000);
      }
    }

    const remaining = candidates.length - toProcess.length;
    if (remaining > 0) {
      console.log(`\n   ℹ️  ${remaining} additional rules available for optimization`);
      console.log(`      Run the tool again to process more rules after verifying these changes`);
    }
  }

  private async generateResultsReport(): Promise<void> {
    const reportData = {
      timestamp: new Date().toISOString(),
      syntaxUsed: '$listId (where listId is the Gateway List UUID)',
      summary: {
        totalRulesProcessed: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalCharactersSaved: this.results.reduce((sum, r) => sum + (r.success ? r.charactersSaved : 0), 0),
        listsUsed: [...new Set(this.results.flatMap(r => r.listsUsed.map(l => l.name)))],
        apiRequests: this.requestCount,
        durationSeconds: (Date.now() - this.startTime) / 1000
      },
      results: this.results,
      listMappings: Object.fromEntries(
        Array.from(this.domainLists.entries()).map(([id, list]) => [id, list.name])
      ),
      backupNote: 'Original traffic filters are preserved in rule descriptions for rollback purposes'
    };

    const reportPath = path.join(process.cwd(), 'rule-optimization-fixed-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`   📄 Detailed report saved: ${reportPath}`);
    } catch (error) {
      console.log(`   ⚠️  Could not save report: ${error instanceof Error ? error.message : error}`);
    }
  }

  private displayFinalSummary(): void {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                  FIXED RULE OPTIMIZATION COMPLETE                     ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const totalSaved = successful.reduce((sum, r) => sum + r.charactersSaved, 0);

    console.log(`📊 Optimization Results:`);
    console.log(`   ✅ Successfully optimized: ${successful.length} rules`);
    console.log(`   ❌ Failed optimizations: ${failed.length} rules`);
    console.log(`   💾 Total characters saved: ~${totalSaved}`);
    console.log(`   📋 Lists utilized: ${[...new Set(successful.flatMap(r => r.listsUsed.map(l => l.name)))].length}`);
    console.log(`   ⏱️  Total time: ${duration}s | 🔄 API requests: ${this.requestCount}`);
    console.log('');

    if (successful.length > 0) {
      console.log('✅ Successfully Optimized Rules:');
      successful.forEach(result => {
        console.log(`   • ${result.ruleName}: -${result.charactersSaved} chars`);
        console.log(`     Lists: ${result.listsUsed.map(l => l.name).join(', ')}`);
      });
      console.log('');
    }

    if (failed.length > 0) {
      console.log('❌ Failed Optimizations:');
      failed.forEach(result => {
        console.log(`   • ${result.ruleName}: ${result.error}`);
      });
      console.log('');
    }

    console.log('🎉 Key Discovery:');
    console.log(`   • Correct list syntax: $listId (where listId is the UUID)`);
    console.log(`   • Only DOMAIN type lists work for DNS/HTTP matching`);
    console.log(`   • EMAIL, IP, URL lists have different use cases`);
    console.log('');

    console.log('🔄 Next Steps:');
    console.log('   1. ✅ Verify optimized rules in Zero Trust Dashboard');
    console.log('   2. 🧪 Test rule functionality with sample traffic');
    console.log('   3. 📊 Monitor Gateway Analytics for performance improvements');
    console.log('   4. 🔄 Run optimizer again to process remaining rules');
    console.log('   5. 🗑️ Clean up backup descriptions once verified');
    console.log('');

    if (successful.length > 0) {
      console.log(`🎉 ${successful.length} rules now use efficient list references!`);
      console.log(`📈 Performance improvement: ${totalSaved} fewer characters to process per rule evaluation`);
    }
  }
}

// Run the fixed optimization
const optimizer = new FixedRuleOptimizer();
optimizer.run().catch(error => {
  console.error('💥 Fixed rule optimization failed:', error);
  process.exit(1);
});
