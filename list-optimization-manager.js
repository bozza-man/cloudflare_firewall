#!/usr/bin/env node

/**
 * List Optimization Manager for Cloudflare Gateway Rules
 * 
 * This script analyzes existing Gateway rules to find ones with many hosts,
 * creates appropriate lists for common categories, and converts rules to use
 * lists instead of inline hosts for better maintainability and performance.
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

class ListOptimizationManager {
    constructor() {
        this.currentRules = [];
        this.existingLists = [];
        this.newLists = [];
        this.optimizedRules = [];
        this.errors = [];
    }

    /**
     * Get all existing Gateway rules
     */
    async getCurrentRules() {
        console.log('🔍 Analyzing existing Gateway rules...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
            
            if (response.data.success) {
                this.currentRules = response.data.result;
                console.log(`   Found ${this.currentRules.length} total rules`);
                
                // Find rules with many hosts
                const hostHeavyRules = this.currentRules.filter(rule => {
                    if (!rule.filters) return false;
                    const filtersStr = rule.filters.join(' ');
                    const hostCount = this.countHosts(filtersStr);
                    return hostCount > 3;
                });
                
                console.log(`   Found ${hostHeavyRules.length} rules with multiple hosts:`);
                hostHeavyRules.forEach(rule => {
                    const filtersStr = rule.filters.join(' ');
                    const hostCount = this.countHosts(filtersStr);
                    console.log(`     • ${rule.name} (${hostCount} hosts)`);
                });
                
                return hostHeavyRules;
            }
        } catch (error) {
            console.error('❌ Failed to get rules:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Count hosts in a filter string
     */
    countHosts(filtersStr) {
        const hostMatches = filtersStr.match(/(\w+\.[\w\.-]+|"[^"]+"|'[^']+')/g) || [];
        return hostMatches.length;
    }

    /**
     * Extract hosts from filter strings
     */
    extractHosts(filtersStr) {
        const hostMatches = filtersStr.match(/(\w+\.[\w\.-]+|"[^"]+"|'[^']+')/g) || [];
        return hostMatches.map(host => host.replace(/['"]/g, ''));
    }

    /**
     * Get existing lists
     */
    async getExistingLists() {
        console.log('📋 Checking existing lists...');
        
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/rules/lists`);
            
            if (response.data.success) {
                this.existingLists = response.data.result;
                console.log(`   Found ${this.existingLists.length} existing lists:`);
                this.existingLists.forEach(list => {
                    console.log(`     • ${list.name} (${list.num_items} items)`);
                });
            }
        } catch (error) {
            console.error('❌ Failed to get lists:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create predefined lists for common categories
     */
    async createCommonLists() {
        console.log('🏗️ Creating common host lists...');

        const commonLists = [
            {
                name: 'Critical Infrastructure Domains',
                description: 'Essential domains that must always work for core system functions',
                items: [
                    'warp.dev', 'app.warp.dev', 'rtc.app.warp.dev',
                    'anthropic.com', 'api.anthropic.com', 'claude.ai', 'console.anthropic.com',
                    'apple.com', 'icloud.com', 'appleid.apple.com', 'idmsa.apple.com',
                    'deviceenrollment.apple.com', 'deviceservices-external.apple.com',
                    'gdmf.apple.com', 'mdmenrollment.apple.com',
                    'cloudflare.com', 'dash.cloudflare.com', 'api.cloudflare.com',
                    'simplemdm.com', 'a.simplemdm.com', 'api.simplemdm.com',
                    'ui.com', 'unifi.ui.com', 'account.ui.com', 'sso.ui.com',
                    'login.microsoftonline.com', 'login.microsoft.com', 'microsoft.com',
                    'one.one.one.one', '1.1.1.1', 'quad9.net',
                    'ocsp.apple.com', 'valid.apple.com', 'ocsp2.g.aaplimg.com', 'valid-apple.g.aaplimg.com'
                ]
            },
            {
                name: 'Social Media Platforms',
                description: 'Major social media and messaging platforms',
                items: [
                    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
                    'tiktok.com', 'snapchat.com', 'discord.com', 'reddit.com', 'pinterest.com',
                    'youtube.com', 'whatsapp.com', 'telegram.org', 'signal.org'
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
                name: 'Streaming Services',
                description: 'Video and music streaming platforms',
                items: [
                    'netflix.com', 'hulu.com', 'disney.com', 'disneyplus.com', 'amazon.com',
                    'primevideo.com', 'spotify.com', 'apple.com', 'youtube.com', 'twitch.tv',
                    'crunchyroll.com', 'hbo.com', 'peacocktv.com', 'paramountplus.com'
                ]
            },
            {
                name: 'Development Tools',
                description: 'Software development and coding platforms',
                items: [
                    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
                    'npmjs.com', 'pypi.org', 'docker.com', 'hub.docker.com',
                    'vercel.com', 'netlify.com', 'heroku.com', 'aws.amazon.com',
                    'console.aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com'
                ]
            },
            {
                name: 'AI and Machine Learning Services',
                description: 'AI platforms and machine learning services',
                items: [
                    'anthropic.com', 'api.anthropic.com', 'claude.ai',
                    'openai.com', 'api.openai.com', 'chat.openai.com',
                    'cohere.ai', 'huggingface.co', 'replicate.com',
                    'midjourney.com', 'stability.ai', 'runpod.io'
                ]
            }
        ];

        for (const listDef of commonLists) {
            try {
                // Check if list already exists
                const existingList = this.existingLists.find(list => 
                    list.name === listDef.name
                );

                if (existingList) {
                    console.log(`   ⚠️  List "${listDef.name}" already exists, skipping...`);
                    continue;
                }

                console.log(`   ⚙️  Creating list: ${listDef.name}...`);

                // Create the list
                const listResponse = await api.post(`/accounts/${ACCOUNT_ID}/rules/lists`, {
                    name: listDef.name,
                    description: listDef.description,
                    kind: 'hostname'
                });

                if (listResponse.data.success) {
                    const listId = listResponse.data.result.id;
                    
                    // Add items to the list
                    const items = listDef.items.map(hostname => ({
                        value: hostname,
                        comment: `Added by list optimization script`
                    }));

                    const itemsResponse = await api.post(
                        `/accounts/${ACCOUNT_ID}/rules/lists/${listId}/items`,
                        items
                    );

                    if (itemsResponse.data.success) {
                        this.newLists.push({
                            id: listId,
                            name: listDef.name,
                            itemCount: listDef.items.length
                        });
                        console.log(`     ✅ Created with ${listDef.items.length} items (ID: ${listId})`);
                    }
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                this.errors.push({
                    operation: `Create list: ${listDef.name}`,
                    error: error.response?.data?.errors?.[0]?.message || error.message
                });
                console.log(`     ❌ Failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            }
        }
    }

    /**
     * Analyze a rule and suggest list optimizations
     */
    analyzeRuleForOptimization(rule) {
        if (!rule.filters) return null;
        
        const filtersStr = rule.filters.join(' ');
        const hosts = this.extractHosts(filtersStr);
        
        if (hosts.length < 4) return null; // Skip rules with few hosts
        
        // Categorize hosts
        const categories = {
            critical: hosts.filter(h => this.isCriticalInfrastructure(h)),
            social: hosts.filter(h => this.isSocialMedia(h)),
            cloud: hosts.filter(h => this.isCloudStorage(h)),
            streaming: hosts.filter(h => this.isStreaming(h)),
            dev: hosts.filter(h => this.isDevelopment(h)),
            ai: hosts.filter(h => this.isAI(h))
        };
        
        return {
            rule,
            hosts,
            categories,
            totalHosts: hosts.length
        };
    }

    /**
     * Helper functions to categorize domains
     */
    isCriticalInfrastructure(host) {
        return /\b(warp\.dev|anthropic\.com|apple\.com|icloud\.com|cloudflare\.com|simplemdm\.com|ui\.com|microsoft\.com|1\.1\.1\.1|quad9\.net|ocsp)\b/i.test(host);
    }

    isSocialMedia(host) {
        return /\b(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|tiktok\.com|snapchat\.com|discord\.com|reddit\.com|pinterest\.com|youtube\.com|whatsapp\.com|telegram\.org|signal\.org)\b/i.test(host);
    }

    isCloudStorage(host) {
        return /\b(dropbox\.com|drive\.google\.com|onedrive\.live\.com|box\.com|mega\.nz|sync\.com|pcloud\.com|backblaze\.com)\b/i.test(host);
    }

    isStreaming(host) {
        return /\b(netflix\.com|hulu\.com|disney|primevideo\.com|spotify\.com|twitch\.tv|crunchyroll\.com|hbo\.com|peacocktv\.com|paramountplus\.com)\b/i.test(host);
    }

    isDevelopment(host) {
        return /\b(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|npmjs\.com|pypi\.org|docker\.com|vercel\.com|netlify\.com|heroku\.com|aws\.amazon\.com|azure\.microsoft\.com|cloud\.google\.com)\b/i.test(host);
    }

    isAI(host) {
        return /\b(anthropic\.com|openai\.com|cohere\.ai|huggingface\.co|replicate\.com|midjourney\.com|stability\.ai|runpod\.io)\b/i.test(host);
    }

    /**
     * Display analysis results
     */
    displayResults() {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              LIST OPTIMIZATION RESULTS                   ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Created lists: ${this.newLists.length}`);
        console.log(`   ❌ Errors: ${this.errors.length}`);
        console.log('');

        if (this.newLists.length > 0) {
            console.log('✅ Successfully Created Lists:');
            this.newLists.forEach(list => {
                console.log(`   • ${list.name} (${list.itemCount} items, ID: ${list.id})`);
            });
            console.log('');
        }

        if (this.errors.length > 0) {
            console.log('❌ Errors:');
            this.errors.forEach(error => {
                console.log(`   ${error.operation}: ${error.error}`);
            });
            console.log('');
        }

        console.log('🔄 Next Steps:');
        console.log('   1. Review the created lists in the Cloudflare dashboard');
        console.log('   2. Update rules to use $critical-infrastructure-domains, $social-media-platforms, etc.');
        console.log('   3. Test rule functionality after conversion');
        console.log('   4. Consider removing inline hosts from rules once lists are proven to work');
        console.log('');

        console.log('💡 List Usage Examples:');
        console.log('   DNS: dns.fqdn in $critical-infrastructure-domains');
        console.log('   HTTP: http.request.host in $social-media-platforms');
        console.log('   Combined: dns.fqdn in $critical-infrastructure-domains or http.request.host in $development-tools');
    }

    /**
     * Main execution method
     */
    async optimize() {
        try {
            console.log('🚀 Starting Gateway Rules List Optimization');
            console.log('===========================================');
            console.log('');

            // Step 1: Get current rules
            const hostHeavyRules = await this.getCurrentRules();
            console.log('');

            // Step 2: Get existing lists  
            await this.getExistingLists();
            console.log('');

            // Step 3: Create common lists
            await this.createCommonLists();
            console.log('');

            // Step 4: Analyze rules for optimization opportunities
            console.log('🔍 Analyzing rules for optimization opportunities...');
            hostHeavyRules.forEach(rule => {
                const analysis = this.analyzeRuleForOptimization(rule);
                if (analysis) {
                    console.log(`   📋 ${rule.name}:`);
                    console.log(`      Total hosts: ${analysis.totalHosts}`);
                    Object.entries(analysis.categories).forEach(([category, hosts]) => {
                        if (hosts.length > 0) {
                            console.log(`      ${category}: ${hosts.length} hosts`);
                        }
                    });
                }
            });

            this.displayResults();

        } catch (error) {
            console.error('💥 Optimization failed:', error);
            process.exit(1);
        }
    }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
    const manager = new ListOptimizationManager();
    manager.optimize().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default ListOptimizationManager;
