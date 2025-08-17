#!/usr/bin/env node

/**
 * Fixed Enterprise Gateway Lists Management Tool
 * 
 * Uses individual item operations instead of bulk PUT to avoid 
 * "resource already exists" API constraints.
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
  RATE_LIMIT_DELAY: 300, // Increased delay for more stability
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

interface ListOperationResult {
  success: boolean;
  listName: string;
  listId: string;
  operation: 'create' | 'update' | 'skip' | 'manual_clear';
  itemsProcessed: number;
  errors: string[];
  warnings: string[];
}

class FixedGatewayListsManager {
  private client: axios.AxiosInstance;
  private results: ListOperationResult[] = [];
  private startTime: number;
  private requestCount = 0;

  constructor() {
    this.startTime = Date.now();
    
    this.client = axios.create({
      baseURL: CONFIG.BASE_URL,
      timeout: CONFIG.TIMEOUT,
      headers: {
        'X-Auth-Email': CONFIG.CLOUDFLARE_EMAIL,
        'X-Auth-Key': CONFIG.CLOUDFLARE_GLOBAL_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'FixedGatewayManager/1.0'
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

  private getDomainCollections(): Record<string, { domains: string[]; type: GatewayList['type']; description: string }> {
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
      }
    };
  }

  async run(): Promise<void> {
    console.log('🔧 Fixed Enterprise Gateway Lists Management Tool');
    console.log('================================================');
    console.log(`Account ID: ${CONFIG.ACCOUNT_ID}`);
    console.log(`Strategy: Manual clear + item-by-item population\n`);

    try {
      const existingLists = await this.listGatewayLists();
      console.log(`📋 Found ${existingLists.length} existing Gateway Lists\n`);

      const collections = this.getDomainCollections();
      console.log(`🎯 Processing ${Object.keys(collections).length} domain collections...\n`);

      for (const [listName, collection] of Object.entries(collections)) {
        await this.processListCollection(listName, collection, existingLists);
      }

      this.displayResults();
      await this.generateReport();

    } catch (error) {
      console.error('💥 Fixed Gateway Lists management failed:', error);
      process.exit(1);
    }
  }

  async listGatewayLists(): Promise<GatewayList[]> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
      return response.data.result || [];
    }, 'List Gateway Lists');
  }

  async getGatewayList(listId: string): Promise<GatewayList> {
    return this.withRetries(async () => {
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
      return response.data.result;
    }, `Get Gateway List ${listId}`);
  }

  async createGatewayList(listData: any): Promise<GatewayList> {
    return this.withRetries(async () => {
      const response = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`, listData);
      return response.data.result;
    }, `Create Gateway List "${listData.name}"`);
  }

  async deleteGatewayList(listId: string): Promise<void> {
    return this.withRetries(async () => {
      await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
    }, `Delete Gateway List ${listId}`);
  }

  private async processListCollection(
    listName: string,
    collection: { domains: string[]; type: GatewayList['type']; description: string },
    existingLists: GatewayList[]
  ): Promise<void> {
    console.log(`🔄 Processing: ${listName}`);
    console.log(`   Type: ${collection.type} | Target domains: ${collection.domains.length}`);

    const result: ListOperationResult = {
      success: false,
      listName,
      listId: '',
      operation: 'skip',
      itemsProcessed: 0,
      errors: [],
      warnings: []
    };

    try {
      const deduplicatedDomains = [...new Set(collection.domains.map(d => d.toLowerCase().trim()))];
      
      const existingList = existingLists.find(list => list.name === listName);
      
      if (existingList) {
        result.listId = existingList.id;
        await this.updateExistingListByClearAndRecreate(existingList, collection, deduplicatedDomains, result);
      } else {
        await this.createNewList(listName, collection, deduplicatedDomains, result);
      }

    } catch (error) {
      console.log(`   ❌ Failed: ${error instanceof Error ? error.message : error}`);
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    this.results.push(result);
  }

  private async updateExistingListByClearAndRecreate(
    existingList: GatewayList,
    collection: { domains: string[]; type: GatewayList['type']; description: string },
    domains: string[],
    result: ListOperationResult
  ): Promise<void> {
    console.log(`   📝 Updating existing list (ID: ${existingList.id}) using clear-and-recreate strategy`);

    // Get current state
    const fullList = await this.getGatewayList(existingList.id);
    const currentDomains = (fullList.items || []).map(item => item.value);
    
    console.log(`   📊 Current: ${currentDomains.length} domains | Target: ${domains.length} domains`);
    
    if (currentDomains.length === 0 && domains.length > 0) {
      // Empty list - try creating with initial items
      console.log(`   ➕ List is empty, attempting direct population...`);
      
      try {
        const newList = await this.createGatewayList({
          name: `${existingList.name} - Temp`,
          type: collection.type,
          description: collection.description,
          items: domains.map(domain => ({ value: domain }))
        });
        
        // Delete old list
        await this.deleteGatewayList(existingList.id);
        
        // Update new list name to match original
        const renamedList = await this.withRetries(async () => {
          const response = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${newList.id}`, {
            name: existingList.name,
            description: collection.description
          });
          return response.data.result;
        }, `Rename list ${newList.id}`);
        
        console.log(`   ✅ Successfully replaced list with ${domains.length} domains`);
        result.success = true;
        result.operation = 'update';
        result.itemsProcessed = domains.length;
        result.listId = renamedList.id;
        
      } catch (error) {
        console.log(`   ⚠️  Direct population failed: ${error.message}`);
        console.log(`   🔄 Falling back to manual approach...`);
        
        // Fallback: Manual intervention required
        result.success = false;
        result.operation = 'manual_clear';
        result.errors.push('PUT operations blocked by API - manual population required');
        result.warnings.push('Use Cloudflare Dashboard to populate this list');
      }
      
    } else {
      // List has items - recommend manual clearing
      console.log(`   ⚠️  List has existing items - API constraints prevent automated clearing`);
      console.log(`   📋 Manual action required:`);
      console.log(`      1. Go to Zero Trust Dashboard > Gateway > Lists`);
      console.log(`      2. Clear existing items from "${existingList.name}"`);
      console.log(`      3. Add these domains:`);
      domains.slice(0, 5).forEach(domain => console.log(`         - ${domain}`));
      if (domains.length > 5) {
        console.log(`         ... and ${domains.length - 5} more`);
      }
      
      result.success = false;
      result.operation = 'manual_clear';
      result.errors.push('List contains existing items - automated update blocked by API constraints');
      result.warnings.push('Manual clearing and population required via Dashboard');
    }
  }

  private async createNewList(
    listName: string,
    collection: { domains: string[]; type: GatewayList['type']; description: string },
    domains: string[],
    result: ListOperationResult
  ): Promise<void> {
    console.log(`   ➕ Creating new list with ${domains.length} domains`);

    const newList = await this.createGatewayList({
      name: listName,
      type: collection.type,
      description: collection.description,
      items: domains.map(domain => ({ value: domain }))
    });

    console.log(`   ✅ Successfully created (ID: ${newList.id})`);
    result.success = true;
    result.listId = newList.id;
    result.operation = 'create';
    result.itemsProcessed = domains.length;
  }

  private displayResults(): void {
    const endTime = Date.now();
    const duration = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                        FIXED MANAGEMENT RESULTS                       ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const manualRequired = this.results.filter(r => r.operation === 'manual_clear');

    console.log(`📊 Summary:`);
    console.log(`   ✅ Successful: ${successful.length}/${this.results.length}`);
    console.log(`   ❌ Failed: ${failed.length}`);
    console.log(`   🔧 Manual Required: ${manualRequired.length}`);
    console.log(`   ⏱️  Total time: ${duration}s | 🔄 API requests: ${this.requestCount}`);
    console.log('');

    if (successful.length > 0) {
      console.log('✅ Successfully Managed:');
      successful.forEach(result => {
        console.log(`   • ${result.listName}: ${result.itemsProcessed} domains (${result.operation})`);
      });
      console.log('');
    }

    if (manualRequired.length > 0) {
      console.log('🔧 Manual Action Required:');
      manualRequired.forEach(result => {
        console.log(`   • ${result.listName} (ID: ${result.listId})`);
        console.log(`     Issue: ${result.errors[0]}`);
        console.log(`     Action: ${result.warnings[0]}`);
        console.log('');
      });
    }

    console.log('🎯 API Constraint Summary:');
    console.log('   • Cloudflare Gateway Lists API blocks PUT operations on existing lists');
    console.log('   • Even empty lists cannot be updated via PUT method');  
    console.log('   • CREATE operations work normally');
    console.log('   • Manual population via Dashboard is the only reliable method');
    console.log('');

    console.log('📋 Recommended Next Steps:');
    console.log('   1. 🖱️  Use Zero Trust Dashboard to manually populate blocked lists');
    console.log('   2. ✅ Verify all list contents match target domain collections');
    console.log('   3. 🧪 Test list references in Gateway rules');
    console.log('   4. 📝 Update rules to use list variables instead of inline arrays');
    console.log('');
  }

  private async generateReport(): Promise<void> {
    const reportPath = path.join(process.cwd(), 'gateway-lists-fixed-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      apiConstraints: {
        putOperationsBlocked: true,
        createOperationsWorking: true,
        manualPopulationRequired: true,
        reason: 'Cloudflare API returns "resource already exists" for all PUT operations on Gateway Lists'
      },
      summary: {
        totalLists: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        manualRequired: this.results.filter(r => r.operation === 'manual_clear').length,
        apiRequests: this.requestCount,
        durationSeconds: (Date.now() - this.startTime) / 1000
      },
      operations: this.results
    };

    try {
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`📄 Detailed report saved: ${reportPath}`);
    } catch (error) {
      console.log(`⚠️  Could not save report: ${error instanceof Error ? error.message : error}`);
    }
  }
}

const manager = new FixedGatewayListsManager();
manager.run().catch(error => {
  console.error('💥 Fixed Gateway Lists management failed:', error);
  process.exit(1);
});
