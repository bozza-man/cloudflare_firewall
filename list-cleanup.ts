#!/usr/bin/env node

/**
 * List Cleanup Tool
 * 
 * Investigates and fixes the unnamed list (bccb3048-ee6d-4c1f-ab1a-21d8de3d250e)
 * and cleans up any other orphaned or improperly named lists.
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

class ListCleanup {
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
        'User-Agent': 'ListCleanup/1.0'
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
    console.log('🔍 List Cleanup Tool');
    console.log('===================');
    console.log(`Target List ID: bccb3048-ee6d-4c1f-ab1a-21d8de3d250e\n`);

    try {
      // Step 1: Get detailed info about the unnamed list
      console.log('🎯 Step 1: Investigating unnamed list...');
      const suspiciousList = await this.getGatewayList('bccb3048-ee6d-4c1f-ab1a-21d8de3d250e');
      await this.analyzeList(suspiciousList);

      // Step 2: Compare with our target collections
      console.log('\n🔍 Step 2: Comparing with target domain collections...');
      const matchResult = this.identifyListPurpose(suspiciousList);
      this.displayMatchResult(matchResult);

      // Step 3: Get all lists for cleanup analysis
      console.log('\n📋 Step 3: Analyzing all lists for cleanup opportunities...');
      const allLists = await this.listGatewayLists();
      const cleanupPlan = this.generateCleanupPlan(allLists);
      this.displayCleanupPlan(cleanupPlan);

      // Step 4: Execute cleanup
      console.log('\n🚀 Step 4: Executing cleanup...');
      await this.executeCleanup(cleanupPlan);

    } catch (error) {
      console.error('💥 List cleanup failed:', error);
      process.exit(1);
    }
  }

  private async listGatewayLists(): Promise<GatewayList[]> {
    const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
    return response.data.result || [];
  }

  private async getGatewayList(listId: string): Promise<GatewayList> {
    const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
    return response.data.result;
  }

  private async updateGatewayList(listId: string, updateData: any): Promise<GatewayList> {
    const response = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`, updateData);
    return response.data.result;
  }

  private async deleteGatewayList(listId: string): Promise<void> {
    await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
  }

  private async analyzeList(list: GatewayList): Promise<void> {
    console.log(`\n   📋 List Analysis:`);
    console.log(`      ID: ${list.id}`);
    console.log(`      Name: "${list.name}" ${list.name === '' ? '❌ EMPTY NAME!' : '✅'}`);
    console.log(`      Type: ${list.type}`);
    console.log(`      Description: ${list.description || 'None'}`);
    console.log(`      Items: ${list.items?.length || 0}`);
    console.log(`      Created: ${new Date(list.created_at).toLocaleString()}`);
    console.log(`      Updated: ${new Date(list.updated_at).toLocaleString()}`);
    
    if (list.items && list.items.length > 0) {
      console.log(`\n   🔍 List Contents (first 10 items):`);
      list.items.slice(0, 10).forEach((item, index) => {
        console.log(`      ${index + 1}. ${item.value}`);
      });
      if (list.items.length > 10) {
        console.log(`      ... and ${list.items.length - 10} more items`);
      }
    }
  }

  private getTargetDomainCollections(): Record<string, { domains: string[]; type: GatewayList['type']; description: string }> {
    return {
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

  private identifyListPurpose(list: GatewayList): { bestMatch: string | null; confidence: number; matchedDomains: string[] } {
    if (!list.items || list.items.length === 0) {
      return { bestMatch: null, confidence: 0, matchedDomains: [] };
    }

    const listDomains = list.items.map(item => item.value.toLowerCase());
    const targetCollections = this.getTargetDomainCollections();
    
    let bestMatch: string | null = null;
    let bestScore = 0;
    let bestMatchedDomains: string[] = [];

    for (const [collectionName, collection] of Object.entries(targetCollections)) {
      const collectionDomains = collection.domains.map(d => d.toLowerCase());
      const matches = listDomains.filter(domain => 
        collectionDomains.some(targetDomain => 
          domain === targetDomain || 
          domain.includes(targetDomain) || 
          targetDomain.includes(domain)
        )
      );

      const score = matches.length / Math.max(listDomains.length, collectionDomains.length);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = collectionName;
        bestMatchedDomains = matches;
      }
    }

    return {
      bestMatch,
      confidence: Math.round(bestScore * 100),
      matchedDomains: bestMatchedDomains
    };
  }

  private displayMatchResult(result: { bestMatch: string | null; confidence: number; matchedDomains: string[] }): void {
    if (result.bestMatch) {
      console.log(`\n   🎯 Best Match: "${result.bestMatch}"`);
      console.log(`   📊 Confidence: ${result.confidence}%`);
      console.log(`   ✅ Matched domains: ${result.matchedDomains.length}`);
      if (result.matchedDomains.length > 0) {
        console.log(`      Examples: ${result.matchedDomains.slice(0, 5).join(', ')}`);
      }
    } else {
      console.log(`\n   ❓ No clear match found for this list's contents`);
    }
  }

  private generateCleanupPlan(allLists: GatewayList[]): Array<{action: string; listId: string; listName: string; reason: string; newName?: string}> {
    const plan: Array<{action: string; listId: string; listName: string; reason: string; newName?: string}> = [];

    // Find lists that need attention
    for (const list of allLists) {
      // Empty or unnamed lists
      if (list.name === '' || list.name.trim() === '') {
        if (list.items && list.items.length > 0) {
          const purpose = this.identifyListPurpose(list);
          if (purpose.bestMatch && purpose.confidence > 70) {
            plan.push({
              action: 'rename',
              listId: list.id,
              listName: list.name || '(unnamed)',
              reason: `Empty name but matches "${purpose.bestMatch}" with ${purpose.confidence}% confidence`,
              newName: purpose.bestMatch
            });
          } else {
            plan.push({
              action: 'investigate',
              listId: list.id,
              listName: list.name || '(unnamed)',
              reason: 'Empty name and unclear purpose - manual review needed'
            });
          }
        } else {
          plan.push({
            action: 'delete',
            listId: list.id,
            listName: list.name || '(unnamed)',
            reason: 'Empty name and no items - appears to be orphaned'
          });
        }
      }

      // Duplicate lists (same name)
      const duplicates = allLists.filter(l => l.name === list.name && l.id !== list.id);
      if (duplicates.length > 0 && !plan.some(p => p.listId === list.id)) {
        plan.push({
          action: 'investigate',
          listId: list.id,
          listName: list.name,
          reason: `Duplicate name detected - ${duplicates.length + 1} lists with same name`
        });
      }
    }

    return plan;
  }

  private displayCleanupPlan(plan: Array<{action: string; listId: string; listName: string; reason: string; newName?: string}>): void {
    if (plan.length === 0) {
      console.log(`\n   ✅ No cleanup needed - all lists appear to be properly configured!`);
      return;
    }

    console.log(`\n   🧹 Cleanup Plan (${plan.length} actions):`);
    console.log(`   ========================================`);

    plan.forEach((item, index) => {
      console.log(`\n   ${index + 1}. ${item.action.toUpperCase()}: ${item.listName}`);
      console.log(`      ID: ${item.listId}`);
      console.log(`      Reason: ${item.reason}`);
      if (item.newName) {
        console.log(`      New name: "${item.newName}"`);
      }
    });
  }

  private async executeCleanup(plan: Array<{action: string; listId: string; listName: string; reason: string; newName?: string}>): Promise<void> {
    if (plan.length === 0) {
      console.log(`\n   ✅ No cleanup actions needed!`);
      return;
    }

    for (const item of plan) {
      console.log(`\n   ${item.action.toUpperCase()}: ${item.listName} (${item.listId})`);

      try {
        switch (item.action) {
          case 'rename':
            if (item.newName) {
              await this.updateGatewayList(item.listId, {
                name: item.newName,
                description: this.getDescriptionForListName(item.newName)
              });
              console.log(`      ✅ Renamed to "${item.newName}"`);
            }
            break;

          case 'delete':
            await this.deleteGatewayList(item.listId);
            console.log(`      ✅ Deleted successfully`);
            break;

          case 'investigate':
            console.log(`      ⚠️  Manual review required - ${item.reason}`);
            console.log(`      🔗 https://dash.teams.cloudflare.com/gateway/lists`);
            break;

          default:
            console.log(`      ❓ Unknown action: ${item.action}`);
        }

      } catch (error) {
        console.log(`      ❌ Failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private getDescriptionForListName(listName: string): string {
    const descriptions: Record<string, string> = {
      'Social Media Sites': 'Major social media platforms and messaging services',
      'Streaming and Entertainment': 'Video streaming, music, and entertainment platforms',
      'E-commerce Sites': 'Online shopping and e-commerce platforms',
      'Critical Infrastructure Domains': 'Essential services and infrastructure domains required for business operations',
      'Development Tools Domains': 'Software development platforms, tools, and package managers',
      'AI and ML Platforms': 'Artificial Intelligence and Machine Learning service providers'
    };
    
    return descriptions[listName] || 'Automatically generated list';
  }
}

// Run the cleanup
const cleanup = new ListCleanup();
cleanup.run().catch(error => {
  console.error('💥 List cleanup failed:', error);
  process.exit(1);
});
