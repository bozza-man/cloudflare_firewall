#!/usr/bin/env node

/**
 * Test adding items to an existing Gateway list to figure out the correct API format
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

async function testAddItems() {
    try {
        // Get existing lists
        console.log('📋 Getting existing lists...');
        const listsResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
        const lists = listsResponse.data.result;
        
        // Find our test list (use the first one we created)
        const testList = lists.find(list => 
            list.name === 'Critical Infrastructure Domains' || 
            list.name === 'Security and Authentication'
        );
        
        if (!testList) {
            console.log('❌ No test list found. Please run create-gateway-lists.js first');
            return;
        }
        
        console.log(`🧪 Testing with list: ${testList.name} (ID: ${testList.id})`);
        
        // Test different API endpoints and formats
        const testItems = [
            { value: 'example.com' },
            { value: 'test.com' }
        ];
        
        console.log('⚙️  Trying different API endpoints...');
        
        // Try 1: gateway/lists/items (PUT)
        try {
            console.log('   Trying PUT /gateway/lists/{id}/items...');
            const response = await api.put(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${testList.id}/items`,
                testItems
            );
            console.log('   ✅ PUT worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ PUT failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        // Try 2: gateway/lists/items (POST)
        try {
            console.log('   Trying POST /gateway/lists/{id}/items...');
            const response = await api.post(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${testList.id}/items`,
                testItems
            );
            console.log('   ✅ POST worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ POST failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        // Try 3: gateway/lists/items (PATCH)
        try {
            console.log('   Trying PATCH /gateway/lists/{id}/items...');
            const response = await api.patch(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${testList.id}/items`,
                testItems
            );
            console.log('   ✅ PATCH worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ PATCH failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        // Try 4: Different format (append vs replace)
        try {
            console.log('   Trying POST with append=true...');
            const response = await api.post(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${testList.id}/items?append=true`,
                testItems
            );
            console.log('   ✅ POST with append worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ POST with append failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        // Try 5: rules/lists endpoint  
        try {
            console.log('   Trying POST /rules/lists/{id}/items...');
            const response = await api.post(
                `/accounts/${ACCOUNT_ID}/rules/lists/${testList.id}/items`,
                testItems
            );
            console.log('   ✅ rules/lists POST worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ rules/lists POST failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        // Try 6: Different payload format
        try {
            console.log('   Trying different payload format...');
            const response = await api.post(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${testList.id}/items`,
                {
                    items: testItems
                }
            );
            console.log('   ✅ Different format worked!', response.data);
            return;
        } catch (error) {
            console.log(`   ❌ Different format failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
        
        console.log('❌ All attempts failed. The list exists but we cannot add items via API.');
        console.log('💡 You may need to add items manually via the Cloudflare dashboard.');
        
    } catch (error) {
        console.error('💥 Test failed:', error.response?.data || error.message);
    }
}

testAddItems();
