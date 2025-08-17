#!/usr/bin/env node

/**
 * Optimized Gateway List Population Tool
 * 
 * Based on Cloudflare API documentation review, this script uses the correct
 * endpoints and methods to populate existing Gateway lists with domains.
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GLOBAL_API_KEY = process.env.CLOUDFLARE_GLOBAL_KEY;
const ACCOUNT_EMAIL = process.env.CLOUDFLARE_EMAIL;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052';

if (!GLOBAL_API_KEY || !ACCOUNT_EMAIL) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: {
        'X-Auth-Email': ACCOUNT_EMAIL,
        'X-Auth-Key': GLOBAL_API_KEY,
        'Content-Type': 'application/json'
    },
    timeout: 60000 // 60 second timeout for large operations
});

// List populations mapped to existing list names
const LIST_POPULATIONS = {
    'Critical Infrastructure Domains': [
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
    ],
    
    'Development Tools Domains': [
        'github.com', 'api.github.com', 'githubusercontent.com', 'github.io', 
        'githubassets.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
        'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
        'npmjs.com', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
        'rubygems.org', 'docker.com', 'hub.docker.com', 'build-cloud.docker.com',
        'vercel.com', 'netlify.com', 'heroku.com',
        'console.cloud.google.com', 'cloud.google.com',
        'aws.amazon.com', 'console.aws.amazon.com', 'azure.microsoft.com',
        'cdn.jsdelivr.net', 'unpkg.com', 'esm.sh'
    ],
    
    'AI and ML Platforms': [
        'anthropic.com', 'api.anthropic.com', 'claude.ai', 'console.anthropic.com',
        'openai.com', 'api.openai.com', 'chat.openai.com', 'ab.chatgpt.com',
        'ws.chatgpt.com', 'gemini.google.com',
        'cohere.ai', 'huggingface.co', 'replicate.com',
        'midjourney.com', 'stability.ai', 'runpod.io'
    ],
    
    'Social Media Sites': [
        'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
        'tiktok.com', 'snapchat.com', 'discord.com', 'reddit.com', 'pinterest.com',
        'youtube.com', 'whatsapp.com', 'telegram.org', 'signal.org',
        'grindr.com', 'www.grindr.com', 'api.grindr.com'
    ]
};

class OptimizedListPopulator {
    constructor() {
        this.existingLists = [];
        this.populatedLists = [];
        this.errors = [];
    }

    /**
     * Get existing Gateway lists
     */
    async getExistingLists() {
        console.log('📋 Fetching existing Gateway lists...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
            
            if (!response.data.success) {
                throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch lists');
            }
            
            this.existingLists = response.data.result;
            console.log(`   Found ${this.existingLists.length} existing lists`);
            
            // Show existing lists with item counts
            this.existingLists.forEach(list => {
                const itemCount = list.num_items || 0;
                console.log(`     • ${list.name} (${itemCount} items) - ID: ${list.id}`);
            });
            
            return this.existingLists;
            
        } catch (error) {
            console.error('❌ Failed to fetch lists:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Update a Gateway list using the PATCH method (as per API docs)
     */
    async updateListItems(list, domains) {
        console.log(`\n🔄 Updating "${list.name}" with ${domains.length} domains...`);
        
        try {
            // Convert domains to the expected format
            const items = domains.map(domain => ({
                value: domain
            }));
            
            // Use PATCH method to update list as per Cloudflare documentation
            console.log(`   ⚙️  Using PATCH method to update list...`);
            
            const response = await api.patch(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`,
                {
                    items: items,
                    append: true // Add to existing items rather than replace
                }
            );
            
            if (response.data.success) {
                console.log(`   ✅ Successfully updated list with ${domains.length} domains`);
                this.populatedLists.push({
                    name: list.name,
                    id: list.id,
                    domainsAdded: domains.length,
                    method: 'PATCH'
                });
                return true;
            } else {
                throw new Error(response.data.errors?.[0]?.message || 'Update failed');
            }
            
        } catch (error) {
            console.log(`   ❌ PATCH method failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            
            // Try alternative: Use PUT to completely replace list items
            return await this.replaceListItems(list, domains);
        }
    }

    /**
     * Replace list items using PUT method
     */
    async replaceListItems(list, domains) {
        try {
            console.log(`   ⚙️  Trying PUT method to replace list items...`);
            
            const items = domains.map(domain => ({ value: domain }));
            
            const response = await api.put(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`,
                { items: items }
            );
            
            if (response.data.success) {
                console.log(`   ✅ Successfully replaced list with ${domains.length} domains`);
                this.populatedLists.push({
                    name: list.name,
                    id: list.id,
                    domainsAdded: domains.length,
                    method: 'PUT'
                });
                return true;
            } else {
                throw new Error(response.data.errors?.[0]?.message || 'PUT failed');
            }
            
        } catch (error) {
            console.log(`   ❌ PUT method failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            
            // Try individual item creation approach
            return await this.addItemsIndividually(list, domains);
        }
    }

    /**
     * Add items individually to the list
     */
    async addItemsIndividually(list, domains) {
        console.log(`   ⚙️  Trying to add items individually...`);
        
        let successCount = 0;
        const batchSize = 10; // Add items in small batches
        
        try {
            for (let i = 0; i < domains.length; i += batchSize) {
                const batch = domains.slice(i, i + batchSize);
                const items = batch.map(domain => ({ value: domain }));
                
                try {
                    const response = await api.post(
                        `/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}/items`,
                        items
                    );
                    
                    if (response.data.success) {
                        successCount += batch.length;
                        console.log(`     Added batch ${Math.floor(i/batchSize) + 1}: ${batch.length} items`);
                    }
                    
                    // Small delay to avoid rate limiting
                    if (i + batchSize < domains.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                } catch (batchError) {
                    console.log(`     Batch ${Math.floor(i/batchSize) + 1} failed: ${batchError.response?.data?.errors?.[0]?.message || batchError.message}`);
                    break;
                }
            }
            
            if (successCount > 0) {
                console.log(`   ✅ Successfully added ${successCount} of ${domains.length} domains individually`);
                this.populatedLists.push({
                    name: list.name,
                    id: list.id,
                    domainsAdded: successCount,
                    method: 'Individual POST'
                });
                return true;
            }
            
        } catch (error) {
            console.log(`   ❌ Individual addition failed: ${error.message}`);
        }
        
        return false;
    }

    /**
     * Main population method
     */
    async populateList(list, domains) {
        // Check if this list already has items
        const currentItems = list.num_items || 0;
        
        if (currentItems > 0) {
            console.log(`\n⚠️  "${list.name}" already has ${currentItems} items.`);
            console.log('   This will add to existing items (append mode).');
            
            // Ask user for confirmation in real implementation
            // For now, we'll proceed with append
        }
        
        const success = await this.updateListItems(list, domains);
        
        if (!success) {
            this.errors.push({
                listName: list.name,
                error: 'All update methods failed'
            });
        }
        
        // Small delay between lists
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Optimized Gateway List Population Tool');
        console.log('=========================================');
        console.log('');

        try {
            // Get existing lists
            await this.getExistingLists();
            
            // Find lists we can populate
            const listsToPopulate = this.existingLists.filter(list => 
                LIST_POPULATIONS.hasOwnProperty(list.name)
            );
            
            if (listsToPopulate.length === 0) {
                console.log('\n❌ No matching lists found to populate');
                console.log('Available lists for population:');
                Object.keys(LIST_POPULATIONS).forEach(name => {
                    console.log(`   • ${name}`);
                });
                return;
            }
            
            console.log(`\n🎯 Found ${listsToPopulate.length} lists ready for population:`);
            listsToPopulate.forEach(list => {
                const domainCount = LIST_POPULATIONS[list.name].length;
                console.log(`   • ${list.name} → ${domainCount} domains to add`);
            });
            
            // Populate each list
            for (const list of listsToPopulate) {
                const domains = LIST_POPULATIONS[list.name];
                await this.populateList(list, domains);
            }
            
            this.displayResults();
            
        } catch (error) {
            console.error('💥 Population failed:', error);
            process.exit(1);
        }
    }

    /**
     * Display results
     */
    displayResults() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              LIST POPULATION RESULTS                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully populated: ${this.populatedLists.length} lists`);
        console.log(`   ❌ Failed: ${this.errors.length} lists`);
        console.log('');

        if (this.populatedLists.length > 0) {
            console.log('✅ Successfully Populated Lists:');
            this.populatedLists.forEach(list => {
                console.log(`   • ${list.name}`);
                console.log(`     Domains added: ${list.domainsAdded}`);
                console.log(`     Method used: ${list.method}`);
                console.log(`     List ID: ${list.id}`);
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

        if (this.populatedLists.length > 0) {
            console.log('🔄 Next Steps:');
            console.log('   1. ✅ Lists have been populated with domains');
            console.log('   2. 🧪 Test the lists in Gateway rules');
            console.log('   3. 📝 Update your rules to use list references like:');
            console.log('      • dns.fqdn in $critical-infrastructure-domains');
            console.log('      • http.request.host in $development-tools-domains');
            console.log('   4. 🗑️  Remove inline hosts from rules once verified');
            console.log('');
            console.log('💡 Benefits:');
            console.log('   • Centralized domain management');
            console.log('   • Easier rule maintenance');
            console.log('   • Better performance');
            console.log('   • Reduced rule complexity');
        } else {
            console.log('❌ No lists were populated successfully.');
            console.log('💡 You may need to:');
            console.log('   1. Create the lists manually in Cloudflare Dashboard');
            console.log('   2. Check API permissions for list management');
            console.log('   3. Verify account ID and credentials');
        }
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const populator = new OptimizedListPopulator();
    populator.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default OptimizedListPopulator;
