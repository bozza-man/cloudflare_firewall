#!/usr/bin/env node

/**
 * Gateway Lists Diagnostic Tool
 * 
 * Analyzes current Gateway Lists to understand the API constraint
 * that's causing "resource already exists" errors.
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

class GatewayListsDiagnostic {
  private client: axios.AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: CONFIG.BASE_URL,
      headers: {
        'X-Auth-Email': CONFIG.CLOUDFLARE_EMAIL,
        'X-Auth-Key': CONFIG.CLOUDFLARE_GLOBAL_KEY,
        'Content-Type': 'application/json'
      }
    });
  }

  async run(): Promise<void> {
    console.log('🔍 Gateway Lists Diagnostic Tool');
    console.log('=================================\n');

    const lists = await this.listGatewayLists();
    console.log(`Found ${lists.length} Gateway Lists\n`);

    // Focus on the problematic lists
    const problematicLists = [
      '87094a93-876b-44fe-800c-257561e3f37c', // Critical Infrastructure
      'a7325f43-68ce-404f-b50d-0bfc9eb4ee5e', // Development Tools 
      'bddcac3e-c1b8-42a8-89af-bce7f783cfc7'  // AI and ML Platforms
    ];

    for (const listId of problematicLists) {
      await this.analyzeList(listId);
    }

    // Test various API operations to understand constraints
    await this.testAPIOperations();
  }

  async listGatewayLists() {
    const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`);
    return response.data.result || [];
  }

  async analyzeList(listId: string): Promise<void> {
    try {
      console.log(`📋 Analyzing List: ${listId}`);
      
      const response = await this.client.get(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${listId}`);
      const list = response.data.result;
      
      console.log(`   Name: ${list.name}`);
      console.log(`   Type: ${list.type}`);
      console.log(`   Items: ${list.items?.length || 0}`);
      console.log(`   Created: ${list.created_at}`);
      console.log(`   Updated: ${list.updated_at}`);
      
      if (list.items && list.items.length > 0) {
        console.log(`   Sample items: ${list.items.slice(0, 3).map(item => item.value).join(', ')}`);
      }
      
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error analyzing list ${listId}: ${error.message}\n`);
    }
  }

  async testAPIOperations(): Promise<void> {
    console.log('🧪 Testing API Operation Constraints');
    console.log('====================================\n');

    // Test 1: Try to create a test list and then update it
    try {
      console.log('Test 1: Create and Update Pattern');
      
      // Create a test list
      const createResponse = await this.client.post(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists`, {
        name: 'API Test List - DELETE ME',
        type: 'DOMAIN',
        description: 'Temporary list for API testing',
        items: [
          { value: 'example.com' },
          { value: 'test.com' }
        ]
      });
      
      const testListId = createResponse.data.result.id;
      console.log(`   ✅ Created test list: ${testListId}`);
      
      // Try to update it with new items
      try {
        const updateResponse = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${testListId}`, {
          items: [
            { value: 'example.com' }, // Same item
            { value: 'newdomain.com' }  // New item
          ]
        });
        console.log('   ✅ PUT update with mixed items: SUCCESS');
      } catch (error) {
        console.log(`   ❌ PUT update with mixed items: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }

      // Try to update it with completely new items
      try {
        const updateResponse = await this.client.put(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${testListId}`, {
          items: [
            { value: 'brandnew1.com' },
            { value: 'brandnew2.com' }
          ]
        });
        console.log('   ✅ PUT update with all new items: SUCCESS');
      } catch (error) {
        console.log(`   ❌ PUT update with all new items: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }

      // Clean up
      await this.client.delete(`/accounts/${CONFIG.ACCOUNT_ID}/gateway/lists/${testListId}`);
      console.log('   🗑️  Cleaned up test list');
      
    } catch (error) {
      console.log(`   ❌ Test 1 failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
    }
    
    console.log('\n');

    // Test 2: Understand the "resource already exists" constraint
    console.log('Test 2: Resource Constraint Analysis');
    
    // Check if there's a global constraint on domain values
    const allLists = await this.listGatewayLists();
    const allDomains = new Set();
    
    for (const list of allLists) {
      if (list.items) {
        for (const item of list.items) {
          if (allDomains.has(item.value)) {
            console.log(`   🔍 Duplicate domain found: ${item.value} exists in multiple lists`);
          }
          allDomains.add(item.value);
        }
      }
    }
    
    console.log(`   📊 Total unique domains across all lists: ${allDomains.size}`);
    console.log('\n');
  }
}

// Run diagnostic
const diagnostic = new GatewayListsDiagnostic();
diagnostic.run().catch(error => {
  console.error('💥 Diagnostic failed:', error);
  process.exit(1);
});
