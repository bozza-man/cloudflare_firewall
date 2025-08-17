#!/usr/bin/env node

/**
 * Simplified Gateway List Population Tool
 * 
 * Uses only the working PUT method based on API testing results.
 * Filters out IP addresses and handles domain-only lists.
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
    timeout: 60000
});

// Validate if string is a valid domain (not IP)
function isValidDomain(domain) {
    // Basic IP address check
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
        return false;
    }
    
    // Basic domain validation
    if (domain.includes('.') && domain.length > 1) {
        return true;
    }
    
    return false;
}

// List populations - filtered to domain names only
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
        'one.one.one.one', 'quad9.net',  // Removed IP addresses
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
    ]
};

class SimpleListPopulator {
    constructor() {
        this.existingLists = [];
        this.populatedLists = [];
        this.skippedLists = [];
        this.errors = [];
    }

    async getExistingLists() {
        console.log('📋 Fetching existing Gateway lists...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
            
            if (!response.data.success) {
                throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch lists');
            }
            
            this.existingLists = response.data.result;
            console.log(`   Found ${this.existingLists.length} existing lists`);
            
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

    async populateListWithPUT(list, domains) {
        console.log(`\n🔄 Populating "${list.name}" with ${domains.length} domains...`);
        
        // Filter to valid domains only
        const validDomains = domains.filter(domain => isValidDomain(domain));
        const invalidDomains = domains.filter(domain => !isValidDomain(domain));
        
        if (invalidDomains.length > 0) {
            console.log(`   ⚠️  Filtered out ${invalidDomains.length} invalid entries: ${invalidDomains.join(', ')}`);
        }
        
        if (validDomains.length === 0) {
            console.log(`   ❌ No valid domains to add after filtering`);
            return false;
        }
        
        try {
            const items = validDomains.map(domain => ({ value: domain }));
            
            console.log(`   ⚙️  Using PUT method to populate with ${validDomains.length} domains...`);
            
            const response = await api.put(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`,
                { items: items }
            );
            
            if (response.data.success) {
                console.log(`   ✅ Successfully populated list with ${validDomains.length} domains`);
                this.populatedLists.push({
                    name: list.name,
                    id: list.id,
                    domainsAdded: validDomains.length,
                    method: 'PUT',
                    filteredOut: invalidDomains.length
                });
                return true;
            } else {
                const errorMsg = response.data.errors?.[0]?.message || 'PUT failed';
                console.log(`   ❌ PUT failed: ${errorMsg}`);
                return false;
            }
            
        } catch (error) {
            const errorMsg = error.response?.data?.errors?.[0]?.message || error.message;
            console.log(`   ❌ PUT failed: ${errorMsg}`);
            
            // Check if it's a "resource already exists" error
            if (errorMsg.includes('already exists')) {
                console.log(`   📝 List "${list.name}" appears to have conflicting data - skipping`);
                this.skippedLists.push({
                    name: list.name,
                    reason: 'Resource conflict - may already contain data'
                });
            } else {
                this.errors.push({
                    listName: list.name,
                    error: errorMsg
                });
            }
            return false;
        }
    }

    async run() {
        console.log('🚀 Simple Gateway List Population Tool');
        console.log('=====================================');
        console.log('Using only PUT method (tested working)');
        console.log('');

        try {
            await this.getExistingLists();
            
            const listsToPopulate = this.existingLists.filter(list => 
                LIST_POPULATIONS.hasOwnProperty(list.name) && list.num_items === 0
            );
            
            const listsWithData = this.existingLists.filter(list => 
                LIST_POPULATIONS.hasOwnProperty(list.name) && list.num_items > 0
            );
            
            if (listsWithData.length > 0) {
                console.log(`\n⚠️  Found ${listsWithData.length} lists with existing data (skipping):`);
                listsWithData.forEach(list => {
                    console.log(`     • ${list.name} (${list.num_items} items)`);
                });
            }
            
            if (listsToPopulate.length === 0) {
                console.log('\n❌ No empty lists found to populate');
                console.log('Available lists for population:');
                Object.keys(LIST_POPULATIONS).forEach(name => {
                    console.log(`   • ${name}`);
                });
                return;
            }
            
            console.log(`\n🎯 Found ${listsToPopulate.length} empty lists ready for population:`);
            listsToPopulate.forEach(list => {
                const domainCount = LIST_POPULATIONS[list.name].length;
                console.log(`   • ${list.name} → ${domainCount} domains to add`);
            });
            
            // Populate each list
            for (const list of listsToPopulate) {
                const domains = LIST_POPULATIONS[list.name];
                await this.populateListWithPUT(list, domains);
                
                // Small delay between lists
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            this.displayResults();
            
        } catch (error) {
            console.error('💥 Population failed:', error);
            process.exit(1);
        }
    }

    displayResults() {
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              LIST POPULATION RESULTS                     ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully populated: ${this.populatedLists.length} lists`);
        console.log(`   ⏭️  Skipped: ${this.skippedLists.length} lists`);
        console.log(`   ❌ Failed: ${this.errors.length} lists`);
        console.log('');

        if (this.populatedLists.length > 0) {
            console.log('✅ Successfully Populated Lists:');
            this.populatedLists.forEach(list => {
                console.log(`   • ${list.name}`);
                console.log(`     Domains added: ${list.domainsAdded}`);
                if (list.filteredOut > 0) {
                    console.log(`     Filtered out: ${list.filteredOut} invalid entries`);
                }
                console.log(`     List ID: ${list.id}`);
                console.log('');
            });
        }

        if (this.skippedLists.length > 0) {
            console.log('⏭️ Skipped Lists:');
            this.skippedLists.forEach(skipped => {
                console.log(`   ${skipped.name}: ${skipped.reason}`);
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

        if (this.populatedLists.length > 0) {
            console.log('🎉 Success! Your Gateway lists are now populated.');
            console.log('');
            console.log('🔄 Next Steps:');
            console.log('   1. ✅ Verify lists in Cloudflare Dashboard');
            console.log('   2. 🧪 Test the lists in Gateway rules');
            console.log('   3. 📝 Update your rules to use list references:');
            this.populatedLists.forEach(list => {
                const listRef = list.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                console.log(`      • ${list.name} → $${listRef}`);
            });
            console.log('   4. 🗑️  Remove inline domains from rules once verified');
        }
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const populator = new SimpleListPopulator();
    populator.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default SimpleListPopulator;
