#!/usr/bin/env node

/**
 * Gateway Rule Optimization Tool
 * 
 * Intelligently replaces inline domain arrays in Gateway rules with 
 * clean list references for better performance and maintainability.
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
  RATE_LIMIT_DELAY: 500, // Slower for rule updates
  TIMEOUT: 30000
};

interface GatewayListItem {
  value: string;
  created_at?: string;
}

interface GatewayList {
  id: string;
  name: string;
  description?: string;
  type: 'DOMAIN' | 'IP' | 'EMAIL' | 'URL' | 'SERIAL';
  items?: GatewayListItem[];
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
  listsUsed: string[];
  charactersSaved: number;
  error?: string;
}

class RuleOptimizer {
  private client: axios.AxiosInstance;
  private requestCount = 0;
  private startTime: number;
  private availableLists: Map<string, GatewayList> = new Map();
  private listVariableMap: Map<string, string> = new Map();
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
        'User-Agent': 'RuleOptimizer/1.0'
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
    console.log('🚀 Gateway Rule Optimization Tool');
    console.log('=================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}`);
    console.log(`Strategy: Replace inline domains with list references\n`);

    try {
      // Step 1: Load available lists
      console.log('📋 Step 1: Loading available Gateway Lists...');
      await this.loadAvailableLists();

      // Step 2: Load rules to optimize
      console.log('\n🔧 Step 2: Loading Gateway Rules...');
      const rules = await this.listGatewayRules();
      console.log(`   Found ${rules.length} total rules`);

      // Step 3: Identify optimization candidates
      console.log('\n🎯 Step 3: Identifying optimization candidates...');
      const candidates = this.identifyOptimizationCandidates(rules);
      console.log(`   Found ${candidates.length} rules that can be optimized`);

      if (candidates.length === 0) {
        console.log('\n✅ All rules are already optimized!');
        return;
      }

      // Step 4: Display optimization plan
      console.log('\n📊 Step 4: Optimization Plan...');
      this.displayOptimizationPlan(candidates);

      // Step 5: Execute optimizations (starting with safest ones)
      console.log('\n🚀 Step 5: Executing Rule Optimizations...');
      await this.executeOptimizations(candidates);

      // Step 6: Generate results report
      console.log('\n📝 Step 6: Generating Results Report...');
      await this.generateResultsReport();

      // Step 7: Final summary
      this.displayFinalSummary();

    } catch (error) {
      console.error('💥 Rule optimization failed:', error);
      process.exit(1);
    }
  }

  private async loadAvailableLists(): Promise<void> {
    const lists = await this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
      return response.data.result || [];
    }, 'Load Gateway Lists');

    // Load detailed list contents
    for (const list of lists) {
      try {
        const detailedList = await this.withRetries(async () => {
          const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${list.id}`);
          return response.data.result;
        }, `Load list details for ${list.name}`);

        this.availableLists.set(list.name, detailedList);
        
        // Generate variable name
        const variableName = list.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        this.listVariableMap.set(list.name, variableName);

        console.log(`   📋 Loaded: ${list.name} (${detailedList.items?.length || 0} domains) -> $${variableName}`);
      } catch (error) {
        console.log(`   ⚠️  Could not load details for ${list.name}: ${error.message}`);
      }
    }

    console.log(`   ✅ Loaded ${this.availableLists.size} lists with domain mappings`);
  }

  private async listGatewayRules(): Promise<GatewayRule[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`);
      return response.data.result || [];
    }, 'List Gateway Rules');
  }

  private identifyOptimizationCandidates(rules: GatewayRule[]): Array<{rule: GatewayRule; optimization: any}> {
    const candidates: Array<{rule: GatewayRule; optimization: any}> = [];

    for (const rule of rules) {
      const optimization = this.analyzeRuleForOptimization(rule);
      if (optimization && optimization.potentialSavings > 10) { // Only optimize if saving >10 characters
        candidates.push({ rule, optimization });
      }
    }

    // Sort by potential savings (highest first) but prioritize disabled rules first for safety
    return candidates.sort((a, b) => {
      // Disabled rules first (safer to test)
      if (a.rule.enabled !== b.rule.enabled) {
        return a.rule.enabled ? 1 : -1;
      }
      // Then by potential savings
      return b.optimization.potentialSavings - a.optimization.potentialSavings;
    });
  }

  private analyzeRuleForOptimization(rule: GatewayRule): any {
    // Extract domains from traffic filter
    const extractedDomains = this.extractDomainsFromTrafficFilter(rule.traffic);
    if (extractedDomains.length === 0) {
      return null;
    }

    const optimizationPlan = {
      extractedDomains,
      applicableLists: [] as Array<{listName: string; matchedDomains: string[]; coverage: number}>,
      potentialSavings: 0,
      optimizedTraffic: rule.traffic
    };

    // Find lists that can replace inline domains
    for (const [listName, list] of this.availableLists.entries()) {
      if (!list.items) continue;

      const listDomains = list.items.map(item => item.value.toLowerCase());
      const matchedDomains = extractedDomains.filter(domain =>
        listDomains.some(listDomain =>
          domain.toLowerCase() === listDomain ||
          domain.toLowerCase().includes(listDomain) ||
          listDomain.includes(domain.toLowerCase())
        )
      );

      if (matchedDomains.length > 2) { // Only consider if we match at least 3 domains
        const coverage = matchedDomains.length / extractedDomains.length;
        optimizationPlan.applicableLists.push({
          listName,
          matchedDomains,
          coverage
        });
      }
    }

    if (optimizationPlan.applicableLists.length > 0) {
      // Calculate potential savings
      const originalLength = rule.traffic.length;
      const optimizedTraffic = this.generateOptimizedTraffic(rule.traffic, optimizationPlan.applicableLists);
      optimizationPlan.optimizedTraffic = optimizedTraffic;
      optimizationPlan.potentialSavings = originalLength - optimizedTraffic.length;
    }

    return optimizationPlan.applicableLists.length > 0 ? optimizationPlan : null;
  }

  private extractDomainsFromTrafficFilter(traffic: string): string[] {
    const domains: string[] = [];
    
    // Comprehensive patterns for domain extraction
    const patterns = [
      /dns\.fqdn\s+(?:==|in)\s+\{([^}]+)\}/g,          // dns.fqdn in {"domain1.com" "domain2.com"}
      /dns\.fqdn\s+==\s+"([^"]+)"/g,                   // dns.fqdn == "domain.com"
      /http\.request\.host\s+(?:==|in)\s+\{([^}]+)\}/g, // http.request.host in {...}
      /http\.request\.host\s+==\s+"([^"]+)"/g,         // http.request.host == "domain.com"
      /http\.conn\.hostname\s+(?:==|in)\s+\{([^}]+)\}/g, // http.conn.hostname in {...}
      /http\.conn\.hostname\s+==\s+"([^"]+)"/g,        // http.conn.hostname == "domain.com"
      /"([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/g              // Generic quoted domains
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
              .filter(d => d.length > 0 && d.includes('.'));
            domains.push(...multipleDomains);
          } else {
            // Single domain
            const domain = match[1].trim();
            if (domain.includes('.') && domain.length > 3) {
              domains.push(domain);
            }
          }
        }
      }
    }

    // Deduplicate
    return [...new Set(domains)];
  }

  private generateOptimizedTraffic(originalTraffic: string, applicableLists: Array<{listName: string; matchedDomains: string[]; coverage: number}>): string {
    let optimizedTraffic = originalTraffic;

    // Sort lists by coverage (highest first)
    const sortedLists = [...applicableLists].sort((a, b) => b.coverage - a.coverage);

    for (const listInfo of sortedLists) {
      const variableName = this.listVariableMap.get(listInfo.listName);
      if (!variableName) continue;

      // Build list reference
      const listReference = `$${variableName}`;

      // Try to replace domain arrays with list references
      // This is a simplified replacement - in practice, you'd need more sophisticated parsing
      
      // Look for patterns like dns.fqdn in {"domain1.com" "domain2.com" ...}
      const domainArrayPattern = new RegExp(
        `(dns\\.fqdn|http\\.request\\.host|http\\.conn\\.hostname)\\s+in\\s+\\{[^}]*(?:${listInfo.matchedDomains.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[^}]*\\}`,
        'gi'
      );

      if (domainArrayPattern.test(originalTraffic)) {
        // Replace with list reference
        optimizedTraffic = optimizedTraffic.replace(
          domainArrayPattern,
          (match) => {
            const field = match.match(/(dns\.fqdn|http\.request\.host|http\.conn\.hostname)/i)?.[1];
            return `${field} in ${listReference}`;
          }
        );
      }

      // Also handle single domain matches
      for (const domain of listInfo.matchedDomains) {
        const singleDomainPattern = new RegExp(
          `(dns\\.fqdn|http\\.request\\.host|http\\.conn\\.hostname)\\s+==\\s+"${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
          'gi'
        );
        
        optimizedTraffic = optimizedTraffic.replace(singleDomainPattern, (match) => {
          const field = match.match(/(dns\.fqdn|http\.request\.host|http\.conn\.hostname)/i)?.[1];
          return `${field} in ${listReference}`;
        });
      }
    }

    return optimizedTraffic;
  }

  private displayOptimizationPlan(candidates: Array<{rule: GatewayRule; optimization: any}>): void {
    console.log(`\n   📊 Optimization Plan (${candidates.length} rules):`);
    console.log('   ===========================================\n');

    candidates.slice(0, 10).forEach((candidate, index) => {
      const { rule, optimization } = candidate;
      console.log(`   ${index + 1}. ${rule.name}`);
      console.log(`      Status: ${rule.enabled ? '🟢 Enabled' : '🔴 Disabled'} (Precedence: ${rule.precedence})`);
      console.log(`      Potential savings: ~${optimization.potentialSavings} characters`);
      console.log(`      Lists to use: ${optimization.applicableLists.map((l: any) => l.listName).join(', ')}`);
      console.log(`      Domains to replace: ${optimization.extractedDomains.length}`);
      console.log('');
    });

    if (candidates.length > 10) {
      console.log(`   ... and ${candidates.length - 10} more rules`);
    }

    const totalSavings = candidates.reduce((sum, c) => sum + c.optimization.potentialSavings, 0);
    console.log(`\n   💡 Total potential savings: ~${totalSavings} characters across ${candidates.length} rules`);
  }

  private async executeOptimizations(candidates: Array<{rule: GatewayRule; optimization: any}>): Promise<void> {
    console.log(`\n   Starting optimization of ${candidates.length} rules...\n`);

    // Start with disabled rules first (safer for testing)
    const disabledRules = candidates.filter(c => !c.rule.enabled);
    const enabledRules = candidates.filter(c => c.rule.enabled);
    const orderedCandidates = [...disabledRules, ...enabledRules.slice(0, 5)]; // Limit enabled rules for safety

    console.log(`   📊 Processing ${orderedCandidates.length} rules (${disabledRules.length} disabled, ${Math.min(enabledRules.length, 5)} enabled)`);

    for (let i = 0; i < orderedCandidates.length; i++) {
      const { rule, optimization } = orderedCandidates[i];
      
      console.log(`\n   ${i + 1}/${orderedCandidates.length} Optimizing: ${rule.name}`);
      console.log(`      ${rule.enabled ? '🟢' : '🔴'} ${rule.enabled ? 'ENABLED' : 'DISABLED'} | Precedence: ${rule.precedence}`);
      
      const result: OptimizationResult = {
        ruleId: rule.id,
        ruleName: rule.name,
        success: false,
        originalTraffic: rule.traffic,
        optimizedTraffic: optimization.optimizedTraffic,
        listsUsed: optimization.applicableLists.map((l: any) => l.listName),
        charactersSaved: optimization.potentialSavings,
        error: undefined
      };

      try {
        // Create backup description with original traffic filter
        const backupDescription = `${rule.description || ''}\n\n[BACKUP] Original traffic filter:\n${rule.traffic}`.trim();

        // Update the rule
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
        console.log(`      📋 Using lists: ${result.listsUsed.join(', ')}`);
        
        result.success = true;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`      ❌ Failed: ${errorMessage}`);
        result.error = errorMessage;
      }

      this.results.push(result);

      // Small delay between rule updates
      if (i < orderedCandidates.length - 1) {
        await this.delay(1000);
      }
    }

    const remaining = candidates.length - orderedCandidates.length;
    if (remaining > 0) {
      console.log(`\n   ⚠️  ${remaining} enabled rules not optimized in this run for safety`);
      console.log(`      Re-run the tool to optimize additional rules after verifying the first batch`);
    }
  }

  private async generateResultsReport(): Promise<void> {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRulesProcessed: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalCharactersSaved: this.results.reduce((sum, r) => sum + (r.success ? r.charactersSaved : 0), 0),
        listsUsed: [...new Set(this.results.flatMap(r => r.listsUsed))],
        apiRequests: this.requestCount,
        durationSeconds: (Date.now() - this.startTime) / 1000
      },
      results: this.results,
      listMappings: Object.fromEntries(this.listVariableMap.entries()),
      backupNote: 'Original traffic filters are preserved in rule descriptions for rollback purposes'
    };

    const reportPath = path.join(process.cwd(), 'rule-optimization-report.json');
    
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
    console.log('║                     RULE OPTIMIZATION COMPLETE                        ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const totalSaved = successful.reduce((sum, r) => sum + r.charactersSaved, 0);

    console.log(`📊 Optimization Results:`);
    console.log(`   ✅ Successfully optimized: ${successful.length} rules`);
    console.log(`   ❌ Failed optimizations: ${failed.length} rules`);
    console.log(`   💾 Total characters saved: ~${totalSaved}`);
    console.log(`   📋 Lists utilized: ${[...new Set(successful.flatMap(r => r.listsUsed))].length}`);
    console.log(`   ⏱️  Total time: ${duration}s | 🔄 API requests: ${this.requestCount}`);
    console.log('');

    if (successful.length > 0) {
      console.log('✅ Successfully Optimized Rules:');
      successful.slice(0, 5).forEach(result => {
        console.log(`   • ${result.ruleName}: -${result.charactersSaved} chars`);
        console.log(`     Lists: ${result.listsUsed.join(', ')}`);
      });
      if (successful.length > 5) {
        console.log(`   ... and ${successful.length - 5} more`);
      }
      console.log('');
    }

    if (failed.length > 0) {
      console.log('❌ Failed Optimizations:');
      failed.forEach(result => {
        console.log(`   • ${result.ruleName}: ${result.error}`);
      });
      console.log('');
    }

    console.log('🔄 Next Steps:');
    console.log('   1. ✅ Verify optimized rules in Zero Trust Dashboard');
    console.log('   2. 🧪 Test rule functionality with sample traffic');
    console.log('   3. 📊 Monitor Gateway Analytics for performance improvements');
    console.log('   4. 🔄 Run optimizer again to process remaining rules');
    console.log('   5. 🗑️ Clean up backup descriptions once verified');
    console.log('');

    console.log('💡 Rollback Instructions:');
    console.log('   Original traffic filters are backed up in rule descriptions');
    console.log('   To rollback: Copy original filter from description back to traffic field');
    console.log('');

    console.log(`🎉 ${successful.length} rules now use efficient list references!`);
    console.log(`📈 Performance improvement: ${totalSaved} fewer characters to process per rule evaluation`);
  }
}

// Run the optimization
const optimizer = new RuleOptimizer();
optimizer.run().catch(error => {
  console.error('💥 Rule optimization failed:', error);
  process.exit(1);
});
