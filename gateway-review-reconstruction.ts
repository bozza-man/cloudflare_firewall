#!/usr/bin/env node

/**
 * Gateway Lists and Rules Review & Reconstruction Tool
 * 
 * After manual list cleanup, this tool will:
 * 1. Audit current lists and their contents
 * 2. Review existing Gateway rules for optimization opportunities
 * 3. Reconstruct missing lists with proper configurations
 * 4. Generate optimized rules that leverage list references
 * 5. Provide migration recommendations
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
  RATE_LIMIT_DELAY: 250,
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
  num_items?: number;
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

interface ReconstructionPlan {
  listName: string;
  domains: string[];
  type: GatewayList['type'];
  description: string;
  status: 'missing' | 'exists' | 'needs_update';
  currentCount?: number;
  targetCount: number;
  listId?: string;
}

interface RuleOptimization {
  ruleId: string;
  ruleName: string;
  currentTraffic: string;
  optimizedTraffic: string;
  listsUsed: string[];
  potentialSavings: number; // character count reduction
  confidence: 'high' | 'medium' | 'low';
}

class GatewayReviewReconstruction {
  private client: axios.AxiosInstance;
  private requestCount = 0;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
    
    this.client = axios.create({
      baseURL: CONFIG.BASE_URL,
      timeout: CONFIG.TIMEOUT,
      headers: {
        'X-Auth-Email': CONFIG.CLOUDFLARE_EMAIL,
        'X-Auth-Key': CONFIG.CLOUDFLARE_GLOBAL_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'GatewayReviewReconstruction/1.0'
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

  private getTargetDomainCollections(): Record<string, { domains: string[]; type: GatewayList['type']; description: string }> {
    return {
      'Critical Infrastructure Domains': {
        type: 'DOMAIN',
        description: 'Essential services and infrastructure domains required for business operations',
        domains: [
          'warp.dev', 'app.warp.dev', 'rtc.app.warp.dev',
          'anthropic.com', 'api.anthropic.com', 'console.anthropic.com',
          'apple.com', 'icloud.com', 'appleid.apple.com', 'idmsa.apple.com',
          'deviceenrollment.apple.com', 'deviceservices-external.apple.com',
          'gdmf.apple.com', 'mdmenrollment.apple.com', 'setup.icloud.com',
          'gateway.icloud.com', 'mask-canary.icloud.com', 'mask-h2.icloud.com',
          'p143-caldav.icloud.com', 'p69-caldav.icloud.com',
          'cloudflare.com', 'dash.cloudflare.com', 'api.cloudflare.com',
          'cdnjs.cloudflare.com',
          'simplemdm.com', 'a.simplemdm.com', 'api.simplemdm.com',
          'ui.com', 'unifi.ui.com', 'account.ui.com', 'sso.ui.com',
          'login.microsoftonline.com', 'login.microsoft.com', 'microsoft.com',
          'account.microsoft.com', 'teams.microsoft.com',
          'one.one.one.one', 'quad9.net',
          'ocsp.apple.com', 'valid.apple.com', 'ocsp2.g.aaplimg.com', 'valid-apple.g.aaplimg.com'
        ]
      },
      
      'Development Tools Domains': {
        type: 'DOMAIN',
        description: 'Software development platforms, tools, and package managers',
        domains: [
          'github.com', 'api.github.com', 'githubusercontent.com', 'github.io', 
          'githubassets.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
          'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
          'npmjs.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
          'rubygems.org', 'docker.com', 'hub.docker.com', 'build-cloud.docker.com',
          'vercel.com', 'netlify.com', 'heroku.com',
          'console.cloud.google.com', 'cloud.google.com',
          'aws.amazon.com', 'console.aws.amazon.com', 'azure.microsoft.com',
          'cdn.jsdelivr.net', 'unpkg.com', 'esm.sh'
        ]
      },
      
      'AI and ML Platforms': {
        type: 'DOMAIN',
        description: 'Artificial Intelligence and Machine Learning service providers',
        domains: [
          'anthropic.com', 'api.anthropic.com', 'claude.ai', 'console.anthropic.com',
          'openai.com', 'api.openai.com', 'chat.openai.com', 'ab.chatgpt.com',
          'ws.chatgpt.com', 'gemini.google.com',
          'cohere.ai', 'huggingface.co', 'replicate.com',
          'midjourney.com', 'stability.ai', 'runpod.io'
        ]
      },
      
      'Social Media Sites': {
        type: 'DOMAIN',
        description: 'Major social media platforms and messaging services',
        domains: [
          'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
          'tiktok.com', 'snapchat.com', 'discord.com', 'reddit.com', 'pinterest.com',
          'youtube.com', 'whatsapp.com', 'telegram.org', 'signal.org',
          'grindr.com', 'www.grindr.com', 'api.grindr.com'
        ]
      },
      
      'Streaming and Entertainment': {
        type: 'DOMAIN',
        description: 'Video streaming, music, and entertainment platforms',
        domains: [
          'netflix.com', 'hulu.com', 'disneyplus.com', 'primevideo.com',
          'spotify.com', 'music.apple.com', 'youtube.com', 'twitch.tv',
          'soundcloud.com', 'pandora.com', 'tidal.com'
        ]
      },
      
      'E-commerce Sites': {
        type: 'DOMAIN',
        description: 'Online shopping and e-commerce platforms',
        domains: [
          'amazon.com', 'ebay.com', 'shopify.com', 'etsy.com',
          'walmart.com', 'target.com', 'bestbuy.com', 'costco.com',
          'alibaba.com', 'aliexpress.com', 'paypal.com', 'stripe.com'
        ]
      }
    };
  }

  async run(): Promise<void> {
    console.log('🔍 Gateway Lists & Rules Review and Reconstruction Tool');
    console.log('======================================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);

    try {
      // Step 1: Current State Analysis
      console.log('📋 Step 1: Analyzing Current State...');
      const currentLists = await this.listGatewayLists();
      const currentRules = await this.listGatewayRules();
      
      console.log(`   Found ${currentLists.length} existing Gateway Lists`);
      console.log(`   Found ${currentRules.length} existing Gateway Rules\n`);

      // Step 2: Generate Reconstruction Plan
      console.log('🎯 Step 2: Generating Reconstruction Plan...');
      const reconstructionPlan = this.generateReconstructionPlan(currentLists);
      this.displayReconstructionPlan(reconstructionPlan);

      // Step 3: Detailed List Analysis
      console.log('\n📊 Step 3: Detailed List Analysis...');
      await this.analyzeCurrentLists(currentLists);

      // Step 4: Rule Optimization Analysis
      console.log('\n🔧 Step 4: Rule Optimization Analysis...');
      const optimizations = await this.analyzeRulesForOptimization(currentRules, currentLists);
      this.displayRuleOptimizations(optimizations);

      // Step 5: Execute Reconstruction
      console.log('\n🚀 Step 5: Executing Reconstruction...');
      await this.executeReconstruction(reconstructionPlan);

      // Step 6: Generate Migration Guide
      console.log('\n📝 Step 6: Generating Migration Guide...');
      await this.generateMigrationGuide(currentRules, currentLists, optimizations);

      // Step 7: Final Summary
      this.displayFinalSummary();

    } catch (error) {
      console.error('💥 Gateway review and reconstruction failed:', error);
      process.exit(1);
    }
  }

  private async listGatewayLists(): Promise<GatewayList[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
      return response.data.result || [];
    }, 'List Gateway Lists');
  }

  private async listGatewayRules(): Promise<GatewayRule[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/rules`);
      return response.data.result || [];
    }, 'List Gateway Rules');
  }

  private async getGatewayList(listId: string): Promise<GatewayList> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
      return response.data.result;
    }, `Get Gateway List ${listId}`);
  }

  private generateReconstructionPlan(currentLists: GatewayList[]): ReconstructionPlan[] {
    const targetCollections = this.getTargetDomainCollections();
    const plan: ReconstructionPlan[] = [];

    for (const [listName, collection] of Object.entries(targetCollections)) {
      const existingList = currentLists.find(list => list.name === listName);
      
      if (existingList) {
        plan.push({
          listName,
          domains: collection.domains,
          type: collection.type,
          description: collection.description,
          status: 'exists',
          currentCount: existingList.count || existingList.num_items || 0,
          targetCount: collection.domains.length,
          listId: existingList.id
        });
      } else {
        plan.push({
          listName,
          domains: collection.domains,
          type: collection.type,
          description: collection.description,
          status: 'missing',
          targetCount: collection.domains.length
        });
      }
    }

    return plan;
  }

  private displayReconstructionPlan(plan: ReconstructionPlan[]): void {
    console.log('\n   📋 Reconstruction Plan Summary:');
    console.log('   ================================');
    
    const missing = plan.filter(p => p.status === 'missing');
    const existing = plan.filter(p => p.status === 'exists');
    const needsUpdate = plan.filter(p => p.status === 'needs_update');

    console.log(`   ✅ Existing Lists: ${existing.length}`);
    console.log(`   ❌ Missing Lists: ${missing.length}`);
    console.log(`   🔄 Need Updates: ${needsUpdate.length}`);

    if (missing.length > 0) {
      console.log('\n   📋 Missing Lists to Create:');
      missing.forEach(item => {
        console.log(`      • ${item.listName}: ${item.targetCount} domains (${item.type})`);
      });
    }

    if (existing.length > 0) {
      console.log('\n   ✅ Existing Lists:');
      existing.forEach(item => {
        const status = item.currentCount === item.targetCount ? '✅' : '⚠️';
        console.log(`      ${status} ${item.listName}: ${item.currentCount}/${item.targetCount} domains`);
      });
    }
  }

  private async analyzeCurrentLists(currentLists: GatewayList[]): Promise<void> {
    console.log(`\n   Analyzing ${currentLists.length} current lists...\n`);

    for (const list of currentLists) {
      console.log(`   📋 ${list.name}`);
      console.log(`      ID: ${list.id}`);
      console.log(`      Type: ${list.type}`);
      console.log(`      Items: ${list.count || list.num_items || 0}`);
      console.log(`      Created: ${new Date(list.created_at).toLocaleDateString()}`);
      console.log(`      Updated: ${new Date(list.updated_at).toLocaleDateString()}`);
      
      // Get detailed items if the list has content
      if ((list.count || list.num_items || 0) > 0) {
        try {
          const detailedList = await this.getGatewayList(list.id);
          if (detailedList.items && detailedList.items.length > 0) {
            console.log(`      Sample items: ${detailedList.items.slice(0, 3).map(item => item.value).join(', ')}${detailedList.items.length > 3 ? '...' : ''}`);
          }
        } catch (error) {
          console.log(`      ⚠️ Could not fetch items: ${error.message}`);
        }
      }
      console.log('');
    }
  }

  private async analyzeRulesForOptimization(rules: GatewayRule[], lists: GatewayList[]): Promise<RuleOptimization[]> {
    const optimizations: RuleOptimization[] = [];

    console.log(`\n   Analyzing ${rules.length} rules for optimization opportunities...\n`);

    for (const rule of rules) {
      console.log(`   🔧 Rule: ${rule.name}`);
      console.log(`      ID: ${rule.id}`);
      console.log(`      Action: ${rule.action}`);
      console.log(`      Enabled: ${rule.enabled}`);
      console.log(`      Precedence: ${rule.precedence}`);
      console.log(`      Traffic filter: ${rule.traffic.substring(0, 100)}${rule.traffic.length > 100 ? '...' : ''}`);
      
      // Analyze traffic filter for domain patterns
      const domainMatches = this.extractDomainsFromTrafficFilter(rule.traffic);
      if (domainMatches.length > 0) {
        console.log(`      🎯 Found ${domainMatches.length} inline domains - optimization candidate!`);
        
        const optimization = this.generateRuleOptimization(rule, domainMatches, lists);
        if (optimization) {
          optimizations.push(optimization);
        }
      } else {
        console.log(`      ✅ No inline domains detected - already optimized`);
      }
      
      console.log('');
    }

    return optimizations;
  }

  private extractDomainsFromTrafficFilter(traffic: string): string[] {
    const domains: string[] = [];
    
    // Look for various patterns of domain matching
    const patterns = [
      /dns\.fqdn\s+==\s+"([^"]+)"/g,          // dns.fqdn == "domain.com"
      /dns\.fqdn\s+in\s+\{([^}]+)\}/g,        // dns.fqdn in {"domain1.com" "domain2.com"}
      /http\.request\.full_uri\s+contains\s+"([^"]+)"/g,  // URL contains patterns
      /"([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/g     // Generic quoted domains
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(traffic)) !== null) {
        if (match[1]) {
          if (match[1].includes('"')) {
            // Handle multiple domains in braces
            const multipleDomains = match[1].split(/\s+/).map(d => d.replace(/"/g, '').trim()).filter(d => d.length > 0);
            domains.push(...multipleDomains);
          } else {
            domains.push(match[1].trim());
          }
        }
      }
    }

    // Deduplicate and filter valid domains
    return [...new Set(domains)].filter(domain => 
      domain.includes('.') && domain.length > 3 && !domain.includes(' ')
    );
  }

  private generateRuleOptimization(rule: GatewayRule, domains: string[], lists: GatewayList[]): RuleOptimization | null {
    const targetCollections = this.getTargetDomainCollections();
    const listsUsed: string[] = [];
    let optimizedTraffic = rule.traffic;
    let potentialSavings = 0;

    // Check which lists could replace inline domains
    for (const [listName, collection] of Object.entries(targetCollections)) {
      const matchingDomains = domains.filter(domain => 
        collection.domains.some(collectionDomain => 
          domain.toLowerCase().includes(collectionDomain.toLowerCase()) ||
          collectionDomain.toLowerCase().includes(domain.toLowerCase())
        )
      );

      if (matchingDomains.length > 0) {
        listsUsed.push(listName);
        const listVariable = listName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        // This is a simplified optimization - in practice, you'd need more sophisticated parsing
        potentialSavings += matchingDomains.join('').length;
      }
    }

    if (listsUsed.length === 0) return null;

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      currentTraffic: rule.traffic,
      optimizedTraffic: optimizedTraffic, // Would need more sophisticated replacement logic
      listsUsed,
      potentialSavings,
      confidence: listsUsed.length > 1 ? 'high' : 'medium'
    };
  }

  private displayRuleOptimizations(optimizations: RuleOptimization[]): void {
    if (optimizations.length === 0) {
      console.log('   ✅ All rules appear to be already optimized!\n');
      return;
    }

    console.log(`\n   🎯 Found ${optimizations.length} rules that can be optimized:\n`);

    optimizations.forEach((opt, index) => {
      console.log(`   ${index + 1}. Rule: ${opt.ruleName}`);
      console.log(`      Confidence: ${opt.confidence.toUpperCase()}`);
      console.log(`      Lists to use: ${opt.listsUsed.join(', ')}`);
      console.log(`      Potential savings: ~${opt.potentialSavings} characters`);
      console.log(`      Current traffic filter: ${opt.currentTraffic.substring(0, 80)}...`);
      console.log('');
    });

    const totalSavings = optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0);
    console.log(`   💡 Total potential character savings: ~${totalSavings}`);
    console.log(`   📈 Rules eligible for optimization: ${optimizations.length}`);
  }

  private async executeReconstruction(plan: ReconstructionPlan[]): Promise<void> {
    const missing = plan.filter(p => p.status === 'missing');

    if (missing.length === 0) {
      console.log('   ✅ All target lists already exist - no reconstruction needed!\n');
      return;
    }

    console.log(`\n   Creating ${missing.length} missing lists...\n`);

    for (const item of missing) {
      try {
        console.log(`   ➕ Creating: ${item.listName}`);
        
        const response = await this.withRetries(async () => {
          return await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`, {
            name: item.listName,
            type: item.type,
            description: item.description,
            items: item.domains.map(domain => ({ value: domain }))
          });
        }, `Create ${item.listName}`);

        const newList = response.data.result;
        console.log(`      ✅ Created successfully (ID: ${newList.id})`);
        console.log(`      📊 Populated with ${item.domains.length} domains\n`);

        // Update plan with new list ID
        item.listId = newList.id;
        item.status = 'exists';
        
      } catch (error) {
        console.log(`      ❌ Failed to create ${item.listName}: ${error.message}\n`);
      }
    }
  }

  private async generateMigrationGuide(rules: GatewayRule[], lists: GatewayList[], optimizations: RuleOptimization[]): Promise<void> {
    const migrationGuide = {
      timestamp: new Date().toISOString(),
      summary: {
        totalRules: rules.length,
        totalLists: lists.length,
        optimizableRules: optimizations.length,
        estimatedSavings: optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0)
      },
      listReferences: this.generateListReferences(lists),
      ruleOptimizations: optimizations,
      migrationSteps: this.generateMigrationSteps(optimizations),
      testingGuidance: this.generateTestingGuidance()
    };

    const guidePath = path.join(process.cwd(), 'gateway-migration-guide.json');
    
    try {
      await fs.writeFile(guidePath, JSON.stringify(migrationGuide, null, 2));
      console.log(`   📄 Migration guide saved: ${guidePath}`);
    } catch (error) {
      console.log(`   ⚠️  Could not save migration guide: ${error.message}`);
    }

    // Also create a human-readable summary
    await this.generateHumanReadableSummary(migrationGuide);
  }

  private generateListReferences(lists: GatewayList[]): Record<string, string> {
    const references: Record<string, string> = {};
    
    lists.forEach(list => {
      const variableName = list.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      references[list.name] = `dns.fqdn in $${variableName}`;
    });

    return references;
  }

  private generateMigrationSteps(optimizations: RuleOptimization[]): string[] {
    const steps = [
      '1. 🧪 Test list references in Gateway analytics before making changes',
      '2. 📝 Create backup copies of critical rules before optimization',
      '3. 🔄 Update rules one at a time, starting with lowest traffic rules',
      '4. ✅ Verify each rule change in Zero Trust Dashboard',
      '5. 📊 Monitor rule performance after each change',
      '6. 🗑️ Clean up old inline domain arrays once verified'
    ];

    if (optimizations.length > 0) {
      steps.push('7. 🎯 Priority order for rule optimization:');
      optimizations
        .sort((a, b) => b.potentialSavings - a.potentialSavings)
        .slice(0, 5)
        .forEach((opt, index) => {
          steps.push(`   ${index + 1}. ${opt.ruleName} (${opt.confidence} confidence, ~${opt.potentialSavings} chars saved)`);
        });
    }

    return steps;
  }

  private generateTestingGuidance(): string[] {
    return [
      '🧪 Testing Best Practices:',
      '• Start with rules that affect low-traffic or test domains',
      '• Use Gateway Analytics to monitor rule hit rates before/after changes',
      '• Test list references with curl or browser developer tools',
      '• Verify DNS resolution for list domains in Gateway logs',
      '• Keep original rule traffic filters commented in rule descriptions',
      '• Test during low-traffic hours to minimize impact',
      '• Have rollback plan ready for each rule change'
    ];
  }

  private async generateHumanReadableSummary(migrationGuide: any): Promise<void> {
    const summaryLines = [
      '🔍 GATEWAY LISTS & RULES REVIEW SUMMARY',
      '======================================',
      '',
      `📊 Current State:`,
      `   • Total Gateway Rules: ${migrationGuide.summary.totalRules}`,
      `   • Total Gateway Lists: ${migrationGuide.summary.totalLists}`,
      `   • Rules eligible for optimization: ${migrationGuide.summary.optimizableRules}`,
      `   • Estimated character savings: ~${migrationGuide.summary.estimatedSavings}`,
      '',
      '📋 Available List References:',
      ...Object.entries(migrationGuide.listReferences).map(([name, ref]) => 
        `   • ${name}: ${ref}`
      ),
      '',
      '🎯 Migration Steps:',
      ...migrationGuide.migrationSteps.map(step => `   ${step}`),
      '',
      '🧪 Testing Guidance:',
      ...migrationGuide.testingGuidance.map(guidance => `   ${guidance}`),
      '',
      `⏰ Generated: ${new Date().toISOString()}`,
      ''
    ];

    const summaryPath = path.join(process.cwd(), 'gateway-review-summary.txt');
    
    try {
      await fs.writeFile(summaryPath, summaryLines.join('\n'));
      console.log(`   📄 Human-readable summary: ${summaryPath}`);
    } catch (error) {
      console.log(`   ⚠️  Could not save summary: ${error.message}`);
    }
  }

  private displayFinalSummary(): void {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    REVIEW & RECONSTRUCTION COMPLETE                   ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🎉 Gateway review and reconstruction completed successfully!`);
    console.log(`⏱️  Total time: ${duration}s | 🔄 API requests: ${this.requestCount}`);
    console.log('');
    console.log('📋 Next Actions:');
    console.log('   1. ✅ Review generated migration guide and summary files');
    console.log('   2. 🧪 Test list references using Gateway Analytics');
    console.log('   3. 📝 Begin rule optimization following the migration steps');
    console.log('   4. 📊 Monitor performance improvements after changes');
    console.log('');
  }
}

// Run the reconstruction tool
const reconstructor = new GatewayReviewReconstruction();
reconstructor.run().catch(error => {
  console.error('💥 Gateway review and reconstruction failed:', error);
  process.exit(1);
});
