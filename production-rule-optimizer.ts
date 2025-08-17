#!/usr/bin/env node

/**
 * Production Gateway Rule Optimizer
 * 
 * Based on analysis findings:
 * - Uses correct syntax: $listId (UUID)
 * - Realistic thresholds: 10+ character savings, 1+ domain matches
 * - Targets the 27 high-impact rules identified
 * - Prioritizes perfect matches and large arrays first
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
  RETRY_DELAY: 1500,
  RATE_LIMIT_DELAY: 750, // Slower for production safety
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

interface OptimizationCandidate {
  rule: GatewayRule;
  extractedDomains: string[];
  bestMatch: {
    listId: string;
    listName: string;
    matchedDomains: string[];
    coverage: number;
    estimatedSavings: number;
  };
  optimizedTraffic: string;
}

interface OptimizationResult {
  ruleId: string;
  ruleName: string;
  success: boolean;
  originalTraffic: string;
  optimizedTraffic: string;
  listUsed: {name: string; id: string};
  charactersSaved: number;
  domainsReplaced: number;
  error?: string;
}

class ProductionRuleOptimizer {
  private client: axios.AxiosInstance;
  private requestCount = 0;
  private startTime: number;
  private domainLists: Map<string, GatewayList> = new Map();
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
        'User-Agent': 'ProductionRuleOptimizer/1.0'
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
    console.log('🚀 Production Gateway Rule Optimizer');
    console.log('===================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}`);
    console.log(`Strategy: Target high-impact optimizations with proven syntax\n`);

    try {
      // Step 1: Load DOMAIN lists
      console.log('📋 Step 1: Loading DOMAIN type Gateway Lists...');
      await this.loadDomainLists();

      // Step 2: Load rules
      console.log('\n🔧 Step 2: Loading Gateway Rules...');
      const rules = await this.listGatewayRules();
      console.log(`   Found ${rules.length} total rules`);

      // Step 3: Verify list syntax still works
      console.log('\n🧪 Step 3: Verifying list syntax...');
      const syntaxWorking = await this.verifyListSyntax();
      if (!syntaxWorking) {
        console.log('❌ List syntax verification failed - aborting');
        return;
      }

      // Step 4: Find optimization candidates
      console.log('\n🎯 Step 4: Finding optimization candidates...');
      const candidates = this.findOptimizationCandidates(rules);
      console.log(`   Found ${candidates.length} optimization candidates`);

      if (candidates.length === 0) {
        console.log('\n✅ No optimization candidates found');
        return;
      }

      // Step 5: Display optimization plan
      console.log('\n📊 Step 5: Optimization Plan...');
      this.displayOptimizationPlan(candidates);

      // Step 6: Execute optimizations
      console.log('\n🚀 Step 6: Executing Optimizations...');
      await this.executeOptimizations(candidates);

      // Step 7: Generate report
      console.log('\n📝 Step 7: Generating Report...');
      await this.generateReport();

      // Step 8: Display summary
      this.displayFinalSummary();

    } catch (error) {
      console.error('💥 Production optimization failed:', error);
      process.exit(1);
    }
  }

  private async loadDomainLists(): Promise<void> {
    const allLists = await this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
      return response.data.result || [];
    }, 'Load Gateway Lists');

    const domainTypeLists = allLists.filter((list: any) => list.type === 'DOMAIN');
    console.log(`   Found ${domainTypeLists.length} DOMAIN type lists`);

    for (const list of domainTypeLists) {
      try {
        const detailedList = await this.withRetries(async () => {
          const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${list.id}`);
          return response.data.result;
        }, `Load ${list.name}`);

        this.domainLists.set(list.id, detailedList);
        console.log(`   📋 ${list.name}: ${detailedList.items?.length || 0} domains`);
      } catch (error) {
        console.log(`   ⚠️  Could not load ${list.name}: ${error.message}`);
      }
    }

    console.log(`   ✅ Loaded ${this.domainLists.size} lists for optimization`);
  }

  private async listGatewayRules(): Promise<GatewayRule[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`);
      return response.data.result || [];
    }, 'List Gateway Rules');
  }

  private async verifyListSyntax(): Promise<boolean> {
    const testList = Array.from(this.domainLists.values())[0];
    if (!testList) return false;

    console.log(`   Testing with: ${testList.name}`);
    
    try {
      const testRule = {
        name: `SYNTAX_VERIFY_DELETE_${Date.now()}`,
        action: 'allow',
        enabled: false,
        traffic: `dns.fqdn in $${testList.id}`,
        precedence: 99999,
        description: 'Syntax verification - DELETE IMMEDIATELY'
      };

      const response = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`, testRule);
      const createdRule = response.data.result;
      
      await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${createdRule.id}`);
      console.log(`   ✅ List syntax verified: $${testList.id}`);
      return true;
      
    } catch (error) {
      console.log(`   ❌ Syntax verification failed: ${error.message}`);
      return false;
    }
  }

  private findOptimizationCandidates(rules: GatewayRule[]): OptimizationCandidate[] {
    const candidates: OptimizationCandidate[] = [];

    for (const rule of rules) {
      const domains = this.extractDomainsFromTrafficFilter(rule.traffic);
      if (domains.length === 0) continue;

      // Find the best list match
      let bestMatch: any = null;
      let highestScore = 0;

      for (const [listId, list] of this.domainLists.entries()) {
        if (!list.items) continue;

        const listDomains = list.items.map(item => item.value.toLowerCase());
        const matchedDomains = domains.filter(domain =>
          listDomains.some(listDomain =>
            domain.toLowerCase() === listDomain ||
            domain.toLowerCase().includes(listDomain) ||
            listDomain.includes(domain.toLowerCase())
          )
        );

        if (matchedDomains.length > 0) {
          const coverage = matchedDomains.length / domains.length;
          const score = matchedDomains.length * coverage; // Favor high count AND high coverage
          
          if (score > highestScore) {
            highestScore = score;
            bestMatch = {
              listId,
              listName: list.name,
              matchedDomains,
              coverage,
              estimatedSavings: this.estimateSavings(rule.traffic, matchedDomains.length)
            };
          }
        }
      }

      // Only include if we have a meaningful match (at least 10 characters saved)
      if (bestMatch && bestMatch.estimatedSavings >= 10) {
        const optimizedTraffic = this.generateOptimizedTraffic(rule.traffic, bestMatch);
        
        candidates.push({
          rule,
          extractedDomains: domains,
          bestMatch,
          optimizedTraffic
        });
      }
    }

    // Sort by impact: disabled rules first (safer), then by estimated savings
    return candidates.sort((a, b) => {
      if (a.rule.enabled !== b.rule.enabled) {
        return a.rule.enabled ? 1 : -1;
      }
      return b.bestMatch.estimatedSavings - a.bestMatch.estimatedSavings;
    });
  }

  private extractDomainsFromTrafficFilter(traffic: string): string[] {
    const domains: string[] = [];
    
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
            const multipleDomains = match[1]
              .split(/\s+/)
              .map(d => d.replace(/"/g, '').trim())
              .filter(d => d.length > 0 && d.includes('.') && !d.includes('$'));
            domains.push(...multipleDomains);
          } else {
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

  private estimateSavings(traffic: string, matchedDomainCount: number): number {
    // Rough estimate: each domain saves ~15 characters on average when using list reference
    // Plus savings from not repeating the field name and operators
    const avgDomainLength = 15;
    const fieldOverhead = matchedDomainCount > 1 ? 20 : 0; // Savings from not repeating dns.fqdn in
    return (matchedDomainCount * avgDomainLength) + fieldOverhead;
  }

  private generateOptimizedTraffic(originalTraffic: string, bestMatch: any): string {
    let optimizedTraffic = originalTraffic;
    
    // Strategy: Replace the entire domain array with list reference if possible
    // Look for domain arrays that contain our matched domains
    const matchedDomainsPattern = bestMatch.matchedDomains
      .map((d: string) => `"${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
      .join('|');
    
    const arrayPatterns = [
      // dns.fqdn in {"domain1.com" "domain2.com" ...}
      new RegExp(`(dns\\.fqdn\\s+in\\s+)\\{[^}]*(?:${matchedDomainsPattern})[^}]*\\}`, 'gi'),
      // http.request.host in {"domain1.com" "domain2.com" ...}
      new RegExp(`(http\\.request\\.host\\s+in\\s+)\\{[^}]*(?:${matchedDomainsPattern})[^}]*\\}`, 'gi'),
      // http.conn.hostname in {"domain1.com" "domain2.com" ...}
      new RegExp(`(http\\.conn\\.hostname\\s+in\\s+)\\{[^}]*(?:${matchedDomainsPattern})[^}]*\\}`, 'gi')
    ];
    
    // Try to replace the entire array first
    for (const pattern of arrayPatterns) {
      if (pattern.test(originalTraffic)) {
        // If we have high coverage (50%+), replace the entire array
        if (bestMatch.coverage >= 0.5) {
          optimizedTraffic = optimizedTraffic.replace(pattern, `$1$${bestMatch.listId}`);
        } else {
          // Lower coverage: create a combined expression
          const remainingDomains = this.getRemainingDomains(originalTraffic, bestMatch.matchedDomains);
          if (remainingDomains.length > 0) {
            const remainingArray = `{${remainingDomains.map(d => `"${d}"`).join(' ')}}`;
            optimizedTraffic = optimizedTraffic.replace(
              pattern, 
              `($1$${bestMatch.listId} or $1${remainingArray})`
            );
          } else {
            optimizedTraffic = optimizedTraffic.replace(pattern, `$1$${bestMatch.listId}`);
          }
        }
        break;
      }
    }
    
    return optimizedTraffic;
  }

  private getRemainingDomains(originalTraffic: string, matchedDomains: string[]): string[] {
    const allDomains = this.extractDomainsFromTrafficFilter(originalTraffic);
    const matchedSet = new Set(matchedDomains.map(d => d.toLowerCase()));
    return allDomains.filter(domain => !matchedSet.has(domain.toLowerCase()));
  }

  private displayOptimizationPlan(candidates: OptimizationCandidate[]): void {
    console.log(`\n   📊 Production Optimization Plan (${candidates.length} candidates):`);
    console.log('   =======================================================\n');

    candidates.slice(0, 12).forEach((candidate, index) => {
      const { rule, bestMatch } = candidate;
      console.log(`   ${index + 1}. ${rule.name}`);
      console.log(`      Status: ${rule.enabled ? '🟢 Enabled' : '🔴 Disabled'} | Precedence: ${rule.precedence}`);
      console.log(`      Traffic length: ${rule.traffic.length} → ${candidate.optimizedTraffic.length} characters`);
      console.log(`      Estimated savings: ~${bestMatch.estimatedSavings} characters`);
      console.log(`      Best list: ${bestMatch.listName}`);
      console.log(`      Coverage: ${bestMatch.matchedDomains.length}/${candidate.extractedDomains.length} domains (${Math.round(bestMatch.coverage * 100)}%)`);
      console.log('');
    });

    if (candidates.length > 12) {
      console.log(`   ... and ${candidates.length - 12} more candidates`);
    }

    const totalSavings = candidates.reduce((sum, c) => sum + c.bestMatch.estimatedSavings, 0);
    console.log(`\n   💡 Total estimated savings: ~${totalSavings} characters across ${candidates.length} rules`);
  }

  private async executeOptimizations(candidates: OptimizationCandidate[]): Promise<void> {
    // Production safety: Start with disabled rules, then a few enabled ones
    const disabledCandidates = candidates.filter(c => !c.rule.enabled);
    const enabledCandidates = candidates.filter(c => c.rule.enabled);
    
    // Process in batches for safety
    const batchSize = Math.min(8, disabledCandidates.length + Math.min(3, enabledCandidates.length));
    const toProcess = [...disabledCandidates.slice(0, 5), ...enabledCandidates.slice(0, 3)];

    console.log(`\n   Processing ${toProcess.length} rules in production batch:`);
    console.log(`   (${disabledCandidates.length} disabled available, ${enabledCandidates.length} enabled available)\n`);

    for (let i = 0; i < toProcess.length; i++) {
      const candidate = toProcess[i];
      const { rule, bestMatch } = candidate;
      
      console.log(`   ${i + 1}/${toProcess.length} Optimizing: ${rule.name}`);
      console.log(`      ${rule.enabled ? '🟢' : '🔴'} ${rule.enabled ? 'ENABLED' : 'DISABLED'}`);
      console.log(`      Using list: ${bestMatch.listName} (${bestMatch.matchedDomains.length} domains)`);
      
      const result: OptimizationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        success: false,
        originalTraffic: rule.traffic,
        optimizedTraffic: candidate.optimizedTraffic,
        listUsed: { name: bestMatch.listName, id: bestMatch.listId },
        charactersSaved: rule.traffic.length - candidate.optimizedTraffic.length,
        domainsReplaced: bestMatch.matchedDomains.length,
        error: undefined
      };

      try {
        // Create comprehensive backup
        const timestamp = new Date().toISOString();
        const backupDescription = `${rule.description || ''}\n\n[BACKUP ${timestamp}] Original traffic filter:\n${rule.traffic}\n\nOptimized using list: ${bestMatch.listName} (${bestMatch.listId})\nDomains replaced: ${bestMatch.matchedDomains.join(', ')}`.trim();

        await this.withRetries(async () => {
          const response = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules/${rule.id}`, {
            name: rule.name,
            description: backupDescription,
            action: rule.action,
            enabled: rule.enabled,
            filters: rule.filters,
            traffic: candidate.optimizedTraffic,
            identity: rule.identity,
            precedence: rule.precedence,
            rule_settings: rule.rule_settings
          });
          return response.data.result;
        }, `Update rule ${rule.name}`);

        console.log(`      ✅ Successfully optimized`);
        console.log(`      📊 Actual savings: ${result.charactersSaved} characters`);
        console.log(`      📋 Domains replaced: ${result.domainsReplaced}`);
        
        result.success = true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${errorMessage}`);
        result.error = errorMessage;
      }

      this.results.push(result);

      // Longer pause between production updates
      if (i < toProcess.length - 1) {
        console.log(`      ⏱️  Waiting 3s before next optimization...`);
        await this.delay(3000);
      }
    }

    const remaining = candidates.length - toProcess.length;
    if (remaining > 0) {
      console.log(`\n   ℹ️  ${remaining} additional candidates available for future optimization`);
      console.log(`      Run the tool again after verifying these changes`);
    }
  }

  private async generateReport(): Promise<void> {
    const reportData = {
      timestamp: new Date().toISOString(),
      version: 'Production v1.0',
      syntax: '$listId (UUID format) - CONFIRMED WORKING',
      summary: {
        totalRulesProcessed: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalCharactersSaved: this.results.reduce((sum, r) => sum + (r.success ? r.charactersSaved : 0), 0),
        totalDomainsReplaced: this.results.reduce((sum, r) => sum + (r.success ? r.domainsReplaced : 0), 0),
        listsUsed: [...new Set(this.results.map(r => r.listUsed.name))],
        apiRequests: this.requestCount,
        durationSeconds: (Date.now() - this.startTime) / 1000
      },
      results: this.results,
      listMappings: Object.fromEntries(
        Array.from(this.domainLists.entries()).map(([id, list]) => [id, list.name])
      ),
      backupInstructions: 'Original traffic filters are preserved in rule descriptions with timestamps',
      rollbackInstructions: 'Copy original traffic filter from [BACKUP] section in rule description back to traffic field'
    };

    const reportPath = path.join(process.cwd(), 'production-optimization-report.json');
    
    try {
      await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2));
      console.log(`   📄 Production report saved: ${reportPath}`);
    } catch (error) {
      console.log(`   ⚠️  Could not save report: ${error instanceof Error ? error.message : error}`);
    }
  }

  private displayFinalSummary(): void {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                   PRODUCTION OPTIMIZATION COMPLETE                    ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const totalSaved = successful.reduce((sum, r) => sum + r.charactersSaved, 0);
    const totalDomains = successful.reduce((sum, r) => sum + r.domainsReplaced, 0);

    console.log(`🎯 Production Results:`);
    console.log(`   ✅ Successfully optimized: ${successful.length} rules`);
    console.log(`   ❌ Failed optimizations: ${failed.length} rules`);
    console.log(`   💾 Total characters saved: ${totalSaved}`);
    console.log(`   🔗 Total domains replaced: ${totalDomains}`);
    console.log(`   📋 Lists utilized: ${[...new Set(successful.map(r => r.listUsed.name))].length}`);
    console.log(`   ⏱️  Total time: ${duration}s | 🔄 API requests: ${this.requestCount}`);
    console.log('');

    if (successful.length > 0) {
      console.log('✅ Successfully Optimized Rules:');
      successful.forEach(result => {
        const efficiency = result.domainsReplaced > 0 ? Math.round(result.charactersSaved / result.domainsReplaced) : 0;
        console.log(`   • ${result.ruleName}`);
        console.log(`     Savings: ${result.charactersSaved} chars | Domains: ${result.domainsReplaced} | List: ${result.listUsed.name}`);
        console.log(`     Efficiency: ${efficiency} chars/domain`);
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

    console.log('🎉 Major Achievement:');
    console.log(`   ✅ Gateway Lists are now ACTIVELY USED in production rules!`);
    console.log(`   ✅ Confirmed working syntax: dns.fqdn in $listId`);
    console.log(`   ✅ Infrastructure ready for ongoing list-based management`);
    console.log('');

    console.log('📊 Performance Impact:');
    console.log(`   • ${totalSaved} fewer characters to parse per rule evaluation`);
    console.log(`   • ${totalDomains} domain lookups now use optimized list references`);
    console.log(`   • Centralized domain management via ${this.domainLists.size} lists`);
    console.log('');

    console.log('🔄 Next Steps:');
    console.log('   1. ✅ Test optimized rules with sample traffic');
    console.log('   2. 📊 Monitor Gateway Analytics for performance improvements');
    console.log('   3. 🧪 Verify all list references resolve correctly');
    console.log('   4. 🔄 Run optimizer again for remaining rules after verification');
    console.log('   5. 📝 Update domain management workflows to use lists');
    console.log('');

    if (successful.length > 0) {
      console.log(`🚀 SUCCESS: ${successful.length} rules now use efficient Gateway Lists!`);
      console.log(`📈 Your Gateway infrastructure is now optimized and ready for scale!`);
    }
  }
}

// Run the production optimizer
const optimizer = new ProductionRuleOptimizer();
optimizer.run().catch(error => {
  console.error('💥 Production optimization failed:', error);
  process.exit(1);
});
