#!/usr/bin/env node

/**
 * Smart Gateway List Population with Deduplication
 * 
 * This script fetches existing domains from lists and only adds new ones,
 * which should resolve the "resource already exists" API conflicts.
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

// Target domain collections
const TARGET_DOMAINS = {
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

class SmartListPopulator {
    constructor() {
        this.allLists = [];
        this.results = {
            updated: [],
            skipped: [],
            errors: []
        };
    }

    /**
     * Fetch all Gateway lists with their current items
     */
    async fetchAllLists() {
        console.log('📋 Fetching all Gateway lists with current items...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
            
            if (!response.data.success) {
                throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch lists');
            }
            
            this.allLists = response.data.result;
            console.log(`   Found ${this.allLists.length} total lists`);
            
            // Fetch detailed items for each target list
            const targetLists = this.allLists.filter(list => TARGET_DOMAINS.hasOwnProperty(list.name));
            
            console.log(`   Fetching details for ${targetLists.length} target lists...`);
            
            for (const list of targetLists) {
                await this.fetchListItems(list);
            }
            
            return this.allLists;
            
        } catch (error) {
            console.error('❌ Failed to fetch lists:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Fetch items for a specific list
     */
    async fetchListItems(list) {
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`);
            
            if (response.data.success && response.data.result.items) {
                list.currentDomains = response.data.result.items.map(item => item.value);
                console.log(`     • ${list.name}: ${list.currentDomains.length} existing domains`);
            } else {
                list.currentDomains = [];
                console.log(`     • ${list.name}: 0 existing domains`);
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.log(`     • ${list.name}: Error fetching items - ${error.response?.data?.errors?.[0]?.message || error.message}`);
            list.currentDomains = [];
        }
    }

    /**
     * Deduplicate and identify new domains to add
     */
    analyzeDomains(listName, currentDomains, targetDomains) {
        // Create sets for efficient deduplication
        const currentSet = new Set(currentDomains.map(d => d.toLowerCase()));
        const targetSet = new Set(targetDomains.map(d => d.toLowerCase()));
        
        // Find domains that need to be added (in target but not in current)
        const domainsToAdd = targetDomains.filter(domain => 
            !currentSet.has(domain.toLowerCase())
        );
        
        // Find domains that are already present
        const existingDomains = targetDomains.filter(domain => 
            currentSet.has(domain.toLowerCase())
        );
        
        // Find extra domains (in current but not in target)
        const extraDomains = currentDomains.filter(domain => 
            !targetSet.has(domain.toLowerCase())
        );
        
        return {
            domainsToAdd,
            existingDomains,
            extraDomains,
            totalTarget: targetDomains.length,
            totalCurrent: currentDomains.length
        };
    }

    /**
     * Update a list with only new domains
     */
    async updateList(list, analysis) {
        const { domainsToAdd, existingDomains, extraDomains, totalTarget } = analysis;
        
        console.log(`\n🔍 Analysis for "${list.name}":`);
        console.log(`   Target domains: ${totalTarget}`);
        console.log(`   Currently has: ${list.currentDomains.length}`);
        console.log(`   Already present: ${existingDomains.length}`);
        console.log(`   Need to add: ${domainsToAdd.length}`);
        console.log(`   Extra domains: ${extraDomains.length}`);
        
        if (domainsToAdd.length === 0) {
            console.log(`   ✅ List is already up to date!`);
            this.results.skipped.push({
                name: list.name,
                reason: 'Already contains all target domains',
                currentCount: list.currentDomains.length,
                targetCount: totalTarget
            });
            return true;
        }
        
        console.log(`\n🔄 Adding ${domainsToAdd.length} new domains to "${list.name}"...`);
        
        if (domainsToAdd.length <= 5) {
            console.log(`   New domains: ${domainsToAdd.join(', ')}`);
        } else {
            console.log(`   New domains: ${domainsToAdd.slice(0, 5).join(', ')} ... and ${domainsToAdd.length - 5} more`);
        }
        
        try {
            // Combine existing domains with new ones
            const allDomains = [...list.currentDomains, ...domainsToAdd];
            const items = allDomains.map(domain => ({ value: domain }));
            
            const response = await api.put(
                `/accounts/${ACCOUNT_ID}/gateway/lists/${list.id}`,
                { items: items }
            );
            
            if (response.data.success) {
                console.log(`   ✅ Successfully updated! Now has ${allDomains.length} domains total`);
                this.results.updated.push({
                    name: list.name,
                    id: list.id,
                    domainsAdded: domainsToAdd.length,
                    totalDomains: allDomains.length,
                    method: 'PUT with deduplication'
                });
                return true;
            } else {
                const errorMsg = response.data.errors?.[0]?.message || 'Update failed';
                console.log(`   ❌ Failed: ${errorMsg}`);
                this.results.errors.push({
                    listName: list.name,
                    error: errorMsg
                });
                return false;
            }
            
        } catch (error) {
            const errorMsg = error.response?.data?.errors?.[0]?.message || error.message;
            console.log(`   ❌ Error: ${errorMsg}`);
            this.results.errors.push({
                listName: list.name,
                error: errorMsg
            });
            return false;
        }
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Smart Gateway List Population with Deduplication');
        console.log('===================================================');
        console.log('This script will analyze existing domains and only add new ones.\n');

        try {
            // Fetch all lists and their current items
            await this.fetchAllLists();
            
            // Find target lists
            const targetLists = this.allLists.filter(list => TARGET_DOMAINS.hasOwnProperty(list.name));
            
            if (targetLists.length === 0) {
                console.log('\n❌ No target lists found!');
                return;
            }
            
            console.log(`\n🎯 Processing ${targetLists.length} target lists:\n`);
            
            // Process each target list
            for (const list of targetLists) {
                const targetDomains = TARGET_DOMAINS[list.name];
                const analysis = this.analyzeDomains(list.name, list.currentDomains, targetDomains);
                
                await this.updateList(list, analysis);
                
                // Small delay between lists
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            this.displayResults();
            
        } catch (error) {
            console.error('💥 Population failed:', error);
            process.exit(1);
        }
    }

    /**
     * Display comprehensive results
     */
    displayResults() {
        console.log('\n');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║            SMART POPULATION RESULTS                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully updated: ${this.results.updated.length} lists`);
        console.log(`   ⏭️  Already complete: ${this.results.skipped.length} lists`);
        console.log(`   ❌ Failed: ${this.results.errors.length} lists`);
        console.log('');

        if (this.results.updated.length > 0) {
            console.log('✅ Updated Lists:');
            this.results.updated.forEach(list => {
                console.log(`   • ${list.name}`);
                console.log(`     New domains added: ${list.domainsAdded}`);
                console.log(`     Total domains now: ${list.totalDomains}`);
                console.log(`     Method: ${list.method}`);
                console.log('');
            });
        }

        if (this.results.skipped.length > 0) {
            console.log('⏭️ Already Complete Lists:');
            this.results.skipped.forEach(skipped => {
                console.log(`   • ${skipped.name}: ${skipped.reason}`);
                console.log(`     Current: ${skipped.currentCount}/${skipped.targetCount} domains`);
                console.log('');
            });
        }

        if (this.results.errors.length > 0) {
            console.log('❌ Failed Lists:');
            this.results.errors.forEach(error => {
                console.log(`   • ${error.listName}: ${error.error}`);
            });
            console.log('');
        }

        const totalUpdated = this.results.updated.length + this.results.skipped.length;
        const totalTarget = Object.keys(TARGET_DOMAINS).length;

        if (totalUpdated === totalTarget) {
            console.log('🎉 All target lists are now properly populated!');
            console.log('');
            console.log('🔄 Next Steps:');
            console.log('   1. ✅ Verify lists in Cloudflare Dashboard');
            console.log('   2. 🧪 Update Gateway rules to use list references:');
            
            Object.keys(TARGET_DOMAINS).forEach(listName => {
                const listRef = listName.toLowerCase().replace(/[^a-z0-9]/g, '-');
                console.log(`      dns.fqdn in $${listRef}`);
            });
            
            console.log('   3. 🗑️  Remove inline domain arrays from existing rules');
            console.log('   4. 🚀 Enjoy centralized domain management!');
        }
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const populator = new SmartListPopulator();
    populator.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default SmartListPopulator;
