#!/usr/bin/env node

/**
 * Create Cloudflare Lists for Gateway Rule Optimization
 * 
 * This script creates hostname lists that can be used in Gateway rules
 * to optimize rules that currently have many inline hosts.
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CLOUDFLARE_API_TOKEN || !ACCOUNT_ID) {
    console.error('❌ Missing required environment variables: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID');
    process.exit(1);
}

const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
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
        name: 'Social Media Platforms',
        description: 'Major social media and messaging platforms',
        items: [
            'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
            'tiktok.com', 'snapchat.com', 'discord.com', 'reddit.com', 'pinterest.com',
            'youtube.com', 'whatsapp.com', 'telegram.org', 'signal.org',
            'grindr.com', 'www.grindr.com', 'api.grindr.com'
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
        name: 'AI and Machine Learning Services',
        description: 'AI platforms, machine learning services, and ChatGPT-related domains',
        items: [
            'anthropic.com', 'api.anthropic.com', 'claude.ai', 'console.anthropic.com',
            'openai.com', 'api.openai.com', 'chat.openai.com', 'ab.chatgpt.com',
            'ws.chatgpt.com', 'gemini.google.com',
            'cohere.ai', 'huggingface.co', 'replicate.com',
            'midjourney.com', 'stability.ai', 'runpod.io'
        ]
    },
    {
        name: 'Cloud Storage Services',
        description: 'Popular cloud storage and file sharing services',
        items: [
            'dropbox.com', 'drive.google.com', 'onedrive.live.com', 'icloud.com',
            'box.com', 'mega.nz', 'sync.com', 'pcloud.com', 'backblaze.com'
        ]
    },
    {
        name: 'Streaming and Entertainment',
        description: 'Video and music streaming platforms',
        items: [
            'netflix.com', 'hulu.com', 'disney.com', 'disneyplus.com', 'amazon.com',
            'primevideo.com', 'spotify.com', 'apple.com', 'youtube.com', 'twitch.tv',
            'crunchyroll.com', 'hbo.com', 'peacocktv.com', 'paramountplus.com'
        ]
    },
    {
        name: 'IoT and Smart Home Devices',
        description: 'Internet of Things devices and smart home platforms',
        items: [
            'apple-cloudkit.com', 'apple-livephotoskit.com', 'googleapis.com',
            'aqara.com', 'us.aqara.com', 'api.aqara.com',
            'logitech.com', 'logi.com', 'logitechg.com',
            'n.connections.brother.com', 'ota.onecloud.harman.com', 'brother.com',
            'tesla.com', 'teslamotors.com', 'owner-api.teslamotors.com'
        ]
    },
    {
        name: 'Security and Authentication',
        description: 'Security tools, password managers, and authentication services',
        items: [
            'auth0.com', 'okta.com', 'oktacdn.com',
            '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com',
            'sentry.io', 'datadoghq.com', 'newrelic.com', 'bugsnag.com'
        ]
    },
    {
        name: '3D Printing and Maker Sites',
        description: '3D printing, maker community, and prototyping platforms',
        items: [
            'thingiverse.com', 'prusaprinters.org', 'myminifactory.com',
            'cults3d.com', 'printables.com', 'thangs.com'
        ]
    }
];

class GatewayListManager {
    constructor() {
        this.createdLists = [];
        this.errors = [];
    }

    /**
     * Check if lists already exist
     */
    async checkExistingLists() {
        console.log('🔍 Checking for existing lists...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
            
            if (response.data.success) {
                const existingLists = response.data.result;
                console.log(`   Found ${existingLists.length} existing lists`);
                
                existingLists.forEach(list => {
                    console.log(`     • ${list.name} (${list.num_items} items)`);
                });
                
                return existingLists;
            }
        } catch (error) {
            console.log('   ⚠️  Could not check existing lists (API permission issue)');
            console.log('      Continuing with creation attempt...');
            return [];
        }
    }

    /**
     * Create a single list
     */
    async createList(listDef) {
        try {
            console.log(`⚙️  Creating list: "${listDef.name}"...`);
            
            // Create the list (try different endpoints and types)
            let createResponse;
            
            // Try Gateway lists first
            try {
                createResponse = await api.post(`/accounts/${ACCOUNT_ID}/gateway/lists`, {
                    name: listDef.name,
                    description: listDef.description,
                    type: 'DOMAIN'
                });
            } catch (error) {
                console.log(`       Gateway endpoint failed, trying rules/lists...`);
                // Try rules/lists endpoint
                createResponse = await api.post(`/accounts/${ACCOUNT_ID}/rules/lists`, {
                    name: listDef.name,
                    description: listDef.description,
                    kind: 'hostname'
                });
            }

            if (!createResponse.data.success) {
                throw new Error(createResponse.data.errors?.[0]?.message || 'Failed to create list');
            }

            const listId = createResponse.data.result.id;
            console.log(`     ✅ List created (ID: ${listId})`);

            // Add items to the list in batches (API limit is typically 1000 per request)
            console.log(`     ⚙️  Adding ${listDef.items.length} items...`);
            
            const batchSize = 500; // Conservative batch size
            for (let i = 0; i < listDef.items.length; i += batchSize) {
                const batch = listDef.items.slice(i, i + batchSize);
                
                const items = batch.map(hostname => ({
                    value: hostname
                }));

                // Try different endpoints for adding items
                let itemsResponse;
                try {
                    itemsResponse = await api.post(
                        `/accounts/${ACCOUNT_ID}/gateway/lists/${listId}/items`,
                        items
                    );
                } catch (error) {
                    console.log(`         Gateway items endpoint failed, trying rules/lists...`);
                    itemsResponse = await api.post(
                        `/accounts/${ACCOUNT_ID}/rules/lists/${listId}/items`,
                        items
                    );
                }

                if (!itemsResponse.data.success) {
                    throw new Error(`Failed to add items: ${itemsResponse.data.errors?.[0]?.message}`);
                }

                console.log(`       Added batch ${Math.floor(i/batchSize) + 1} (${batch.length} items)`);
                
                // Small delay between batches to avoid rate limiting
                if (i + batchSize < listDef.items.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            this.createdLists.push({
                id: listId,
                name: listDef.name,
                itemCount: listDef.items.length
            });

            console.log(`     ✅ Successfully created "${listDef.name}" with ${listDef.items.length} items`);
            console.log('');

        } catch (error) {
            this.errors.push({
                listName: listDef.name,
                error: error.response?.data?.errors?.[0]?.message || error.message
            });
            console.log(`     ❌ Failed to create "${listDef.name}": ${error.response?.data?.errors?.[0]?.message || error.message}`);
            console.log('');
        }
    }

    /**
     * Create all lists
     */
    async createLists() {
        console.log('🏗️  Creating Gateway hostname lists...');
        console.log('');

        for (const listDef of listsToCreate) {
            await this.createList(listDef);
            
            // Delay between lists to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    /**
     * Display results and usage instructions
     */
    displayResults() {
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                GATEWAY LISTS CREATION RESULTS            ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully created: ${this.createdLists.length} lists`);
        console.log(`   ❌ Failed: ${this.errors.length} lists`);
        console.log('');

        if (this.createdLists.length > 0) {
            console.log('✅ Successfully Created Lists:');
            this.createdLists.forEach(list => {
                console.log(`   • ${list.name} (${list.itemCount} items)`);
                console.log(`     ID: ${list.id}`);
            });
            console.log('');
        }

        if (this.errors.length > 0) {
            console.log('❌ Failed Lists:');
            this.errors.forEach(error => {
                console.log(`   ${error.listName}: ${error.error}`);
            });
            console.log('');
        }

        if (this.createdLists.length > 0) {
            console.log('🔄 How to Use These Lists in Gateway Rules:');
            console.log('');
            console.log('DNS Rules:');
            console.log('   dns.fqdn in $critical-infrastructure-domains');
            console.log('   dns.fqdn in $social-media-platforms');
            console.log('');
            console.log('HTTP Rules:');
            console.log('   http.request.host in $development-and-devops-tools');
            console.log('   http.request.host in $ai-and-machine-learning-services');
            console.log('');
            console.log('💡 Next Steps:');
            console.log('   1. Update your existing rules to use these lists');
            console.log('   2. Test the updated rules to ensure they work correctly');
            console.log('   3. Remove inline hosts from rules once list-based versions are verified');
            console.log('   4. Manage domains centrally by updating the lists instead of individual rules');
            console.log('');
        }

        console.log('📚 List Management:');
        console.log('   • View lists: Cloudflare Dashboard > Zero Trust > Settings > Lists');
        console.log('   • Add/remove domains: Edit the lists in the dashboard');
        console.log('   • Usage in rules: Reference lists with $list-name format');
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Gateway Lists Creation Tool');
        console.log('==============================');
        console.log('');

        // Check existing lists
        await this.checkExistingLists();
        console.log('');

        // Create new lists
        await this.createLists();

        // Display results
        this.displayResults();
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const manager = new GatewayListManager();
    manager.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default GatewayListManager;
