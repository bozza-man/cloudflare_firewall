#!/usr/bin/env node

/**
 * Create Gateway Lists using Cloudflare Global API Key
 * 
 * This script uses the Global API Key which has full permissions
 * to create and populate Gateway hostname lists.
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Try different environment variable names for the global key
const GLOBAL_API_KEY = process.env.CLOUDFLARE_GLOBAL_KEY || 
                       process.env.CLOUDFLARE_GLOBAL_API_KEY || 
                       process.env.CLOUDFLARE_API_KEY || 
                       process.env.CF_GLOBAL_API_KEY ||
                       process.env.CF_API_KEY;

const ACCOUNT_EMAIL = process.env.CLOUDFLARE_EMAIL || 
                     process.env.CF_EMAIL ||
                     process.env.CLOUDFLARE_ACCOUNT_EMAIL;

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 
                   process.env.CF_ACCOUNT_ID;

if (!GLOBAL_API_KEY) {
    console.error('❌ Missing Global API Key. Please set one of these environment variables:');
    console.error('   CLOUDFLARE_GLOBAL_API_KEY, CLOUDFLARE_API_KEY, CF_GLOBAL_API_KEY, or CF_API_KEY');
    process.exit(1);
}

if (!ACCOUNT_EMAIL) {
    console.error('❌ Missing account email. Please set one of these environment variables:');
    console.error('   CLOUDFLARE_EMAIL, CF_EMAIL, or CLOUDFLARE_ACCOUNT_EMAIL');
    process.exit(1);
}

if (!ACCOUNT_ID) {
    console.error('❌ Missing account ID. Please set CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID');
    process.exit(1);
}

console.log('🔑 Using Global API Key authentication');
console.log(`📧 Account Email: ${ACCOUNT_EMAIL}`);
console.log(`🆔 Account ID: ${ACCOUNT_ID}`);

const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
        'X-Auth-Email': ACCOUNT_EMAIL,
        'X-Auth-Key': GLOBAL_API_KEY,
        'Content-Type': 'application/json'
    }
});

// Define the lists we want to create
const listsToCreate = [
    {
        name: 'Critical Infrastructure Domains',
        description: 'Essential domains that must always work for core system functions, device management, and authentication',
        items: [
            // Warp.dev (Critical development environment)
            'warp.dev', 'app.warp.dev', 'rtc.app.warp.dev',
            
            // Anthropic/AI Services (Critical for development)
            'anthropic.com', 'api.anthropic.com', 'console.anthropic.com',
            
            // Apple Core Infrastructure 
            'apple.com', 'icloud.com', 'appleid.apple.com', 'idmsa.apple.com',
            'deviceenrollment.apple.com', 'deviceservices-external.apple.com',
            'gdmf.apple.com', 'mdmenrollment.apple.com', 'setup.icloud.com',
            'gateway.icloud.com', 'mask-canary.icloud.com', 'mask-h2.icloud.com',
            'p143-caldav.icloud.com', 'p69-caldav.icloud.com',
            
            // Cloudflare Infrastructure
            'cloudflare.com', 'dash.cloudflare.com', 'api.cloudflare.com',
            'cdnjs.cloudflare.com',
            
            // SimpleMDM (Critical device management)
            'simplemdm.com', 'a.simplemdm.com', 'api.simplemdm.com',
            
            // Ubiquiti/UniFi (Critical network management)
            'ui.com', 'unifi.ui.com', 'account.ui.com', 'sso.ui.com',
            
            // Microsoft Core Authentication
            'login.microsoftonline.com', 'login.microsoft.com', 'microsoft.com',
            'account.microsoft.com', 'teams.microsoft.com',
            
            // DNS Infrastructure
            'one.one.one.one', '1.1.1.1', 'quad9.net',
            
            // Certificate/Security Infrastructure
            'ocsp.apple.com', 'valid.apple.com', 'ocsp2.g.aaplimg.com', 'valid-apple.g.aaplimg.com'
        ]
    },
    {
        name: 'Development and DevOps Tools',
        description: 'Software development, coding platforms, and DevOps tools',
        items: [
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
    {
        name: 'AI and ML Platforms',
        description: 'AI platforms, machine learning services, and ChatGPT-related domains',
        items: [
            'anthropic.com', 'api.anthropic.com', 'claude.ai', 'console.anthropic.com',
            'openai.com', 'api.openai.com', 'chat.openai.com', 'ab.chatgpt.com',
            'ws.chatgpt.com', 'gemini.google.com',
            'cohere.ai', 'huggingface.co', 'replicate.com',
            'midjourney.com', 'stability.ai', 'runpod.io'
        ]
    }
];

class GlobalKeyListManager {
    constructor() {
        this.createdLists = [];
        this.errors = [];
    }

    /**
     * Test API connectivity
     */
    async testConnection() {
        try {
            console.log('🧪 Testing API connection...');
            
            // Test basic account access
            const accountResponse = await api.get(`/accounts/${ACCOUNT_ID}`);
            if (accountResponse.data.success) {
                console.log(`   ✅ Account access confirmed: ${accountResponse.data.result.name}`);
            }
            
            // Test Gateway rules access
            const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules?per_page=1`);
            if (rulesResponse.data.success) {
                console.log(`   ✅ Gateway rules access confirmed (${rulesResponse.data.result.length} rules found)`);
            }
            
            // Test Gateway lists access
            try {
                const listsResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
                if (listsResponse.data.success) {
                    console.log(`   ✅ Gateway lists access confirmed (${listsResponse.data.result.length} lists found)`);
                    return true;
                }
            } catch (error) {
                console.log(`   ⚠️  Gateway lists endpoint issue: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`   ❌ API connection failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            return false;
        }
    }

    /**
     * Create a single list with comprehensive endpoint testing
     */
    async createListWithItems(listDef) {
        try {
            console.log(`\n🏗️  Creating list: "${listDef.name}"...`);
            
            let listId = null;
            let createdViaEndpoint = null;
            
            // Try different endpoints for list creation
            const createEndpoints = [
                {
                    name: 'Gateway Lists',
                    endpoint: `/accounts/${ACCOUNT_ID}/gateway/lists`,
                    payload: { name: listDef.name, description: listDef.description, type: 'DOMAIN' }
                },
                {
                    name: 'Rules Lists',
                    endpoint: `/accounts/${ACCOUNT_ID}/rules/lists`,
                    payload: { name: listDef.name, description: listDef.description, kind: 'hostname' }
                }
            ];
            
            for (const endpointConfig of createEndpoints) {
                try {
                    console.log(`   ⚙️  Trying ${endpointConfig.name}...`);
                    const response = await api.post(endpointConfig.endpoint, endpointConfig.payload);
                    
                    if (response.data.success) {
                        listId = response.data.result.id;
                        createdViaEndpoint = endpointConfig.name;
                        console.log(`   ✅ List created via ${endpointConfig.name} (ID: ${listId})`);
                        break;
                    }
                } catch (error) {
                    console.log(`   ❌ ${endpointConfig.name} failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
                }
            }
            
            if (!listId) {
                throw new Error('All list creation endpoints failed');
            }
            
            // Now try to add items
            console.log(`   📝 Adding ${listDef.items.length} items...`);
            
            // Prepare items in different formats
            const itemFormats = [
                // Format 1: Simple array of objects
                listDef.items.map(item => ({ value: item })),
                // Format 2: Wrapped in items array
                { items: listDef.items.map(item => ({ value: item })) },
                // Format 3: Direct values
                listDef.items
            ];
            
            const addEndpoints = [
                `/accounts/${ACCOUNT_ID}/gateway/lists/${listId}/items`,
                `/accounts/${ACCOUNT_ID}/rules/lists/${listId}/items`
            ];
            
            let itemsAdded = false;
            
            // Try different combinations of endpoints and formats
            for (const endpoint of addEndpoints) {
                if (itemsAdded) break;
                
                for (const [formatIndex, itemPayload] of itemFormats.entries()) {
                    try {
                        console.log(`     ⚙️  Trying endpoint ${endpoint.includes('gateway') ? 'Gateway' : 'Rules'}, format ${formatIndex + 1}...`);
                        
                        const response = await api.post(endpoint, itemPayload);
                        
                        if (response.data.success) {
                            console.log(`     ✅ Items added successfully via ${endpoint.includes('gateway') ? 'Gateway' : 'Rules'} endpoint!`);
                            itemsAdded = true;
                            break;
                        }
                    } catch (error) {
                        console.log(`     ❌ Failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
                    }
                }
            }
            
            // Also try PUT method
            if (!itemsAdded) {
                console.log(`     ⚙️  Trying PUT method...`);
                try {
                    const response = await api.put(
                        `/accounts/${ACCOUNT_ID}/gateway/lists/${listId}/items`,
                        listDef.items.map(item => ({ value: item }))
                    );
                    
                    if (response.data.success) {
                        console.log(`     ✅ Items added successfully via PUT method!`);
                        itemsAdded = true;
                    }
                } catch (error) {
                    console.log(`     ❌ PUT failed: ${error.response?.status} ${error.response?.data?.errors?.[0]?.message || error.message}`);
                }
            }
            
            if (itemsAdded) {
                this.createdLists.push({
                    id: listId,
                    name: listDef.name,
                    itemCount: listDef.items.length,
                    endpoint: createdViaEndpoint
                });
                console.log(`   ✅ Successfully created "${listDef.name}" with ${listDef.items.length} items`);
            } else {
                console.log(`   ⚠️  List created but items could not be added programmatically`);
                console.log(`      You can add items manually in the Cloudflare dashboard`);
                
                this.createdLists.push({
                    id: listId,
                    name: listDef.name,
                    itemCount: 0,
                    endpoint: createdViaEndpoint,
                    needsManualItems: true
                });
            }
            
        } catch (error) {
            this.errors.push({
                listName: listDef.name,
                error: error.response?.data?.errors?.[0]?.message || error.message
            });
            console.log(`   ❌ Failed to create "${listDef.name}": ${error.response?.data?.errors?.[0]?.message || error.message}`);
        }
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Gateway Lists Creation Tool (Global API Key)');
        console.log('==============================================');
        console.log('');

        // Test connection first
        const connectionOk = await this.testConnection();
        if (!connectionOk) {
            console.error('❌ Cannot proceed without API access. Please check your credentials.');
            process.exit(1);
        }
        
        console.log('');
        
        // Create lists
        for (const listDef of listsToCreate) {
            await this.createListWithItems(listDef);
            
            // Delay between lists
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Display results
        this.displayResults();
    }

    displayResults() {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              GATEWAY LISTS CREATION RESULTS              ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully created: ${this.createdLists.length} lists`);
        console.log(`   ❌ Failed: ${this.errors.length} lists`);
        console.log('');

        if (this.createdLists.length > 0) {
            console.log('✅ Successfully Created Lists:');
            this.createdLists.forEach(list => {
                console.log(`   • ${list.name}`);
                console.log(`     ID: ${list.id}`);
                console.log(`     Items: ${list.itemCount} ${list.needsManualItems ? '(needs manual population)' : ''}`);
                console.log(`     Created via: ${list.endpoint}`);
                console.log('');
            });
        }

        if (this.errors.length > 0) {
            console.log('❌ Failed Lists:');
            this.errors.forEach(error => {
                console.log(`   ${error.listName}: ${error.error}`);
            });
            console.log('');
        }

        console.log('🔄 Next Steps:');
        console.log('   1. If lists were created but need manual population:');
        console.log('      - Go to Zero Trust → Settings → Lists in Cloudflare Dashboard');
        console.log('      - Edit each list and add the domains from our script');
        console.log('   2. Use the list optimization script to update your rules');
        console.log('   3. Test the updated rules to ensure they work correctly');
        console.log('');
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const manager = new GlobalKeyListManager();
    manager.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default GlobalKeyListManager;
