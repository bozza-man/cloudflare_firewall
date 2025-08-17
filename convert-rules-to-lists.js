#!/usr/bin/env node

/**
 * Convert Gateway Rules to Use Lists
 * 
 * This script analyzes your existing Gateway rules and helps convert
 * rules with many inline hosts to use centrally managed lists instead.
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const GLOBAL_API_KEY = process.env.CLOUDFLARE_GLOBAL_KEY || process.env.CLOUDFLARE_GLOBAL_API_KEY;
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
    }
});

// List mapping - how to convert inline hosts to list references
const LIST_MAPPINGS = [
    {
        listName: 'Critical Infrastructure Domains',
        listVariable: '$critical-infrastructure-domains',
        keywords: ['warp.dev', 'anthropic.com', 'apple.com', 'icloud.com', 'cloudflare.com', 'simplemdm.com', 'ui.com', 'microsoft.com', 'login.microsoft', 'ocsp.apple.com'],
        description: 'Essential infrastructure and authentication domains'
    },
    {
        listName: 'Development Tools Domains', // Use existing list
        listVariable: '$development-tools-domains',
        keywords: ['github.com', 'gitlab.com', 'npmjs.com', 'pypi.org', 'docker.com', 'stackoverflow.com', 'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com'],
        description: 'Software development and DevOps platforms'
    },
    {
        listName: 'AI and ML Platforms',
        listVariable: '$ai-and-ml-platforms',
        keywords: ['anthropic.com', 'openai.com', 'claude.ai', 'chat.openai.com', 'gemini.google.com', 'huggingface.co'],
        description: 'AI platforms and machine learning services'
    },
    {
        listName: 'Social Media Sites', // Use existing list
        listVariable: '$social-media-sites',
        keywords: ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'tiktok.com', 'discord.com', 'reddit.com', 'grindr.com'],
        description: 'Social media and messaging platforms'
    }
];

class RuleListConverter {
    constructor() {
        this.rules = [];
        this.availableLists = [];
        this.conversionSuggestions = [];
    }

    /**
     * Get all Gateway rules and lists
     */
    async loadData() {
        console.log('📋 Loading Gateway rules and lists...');
        
        try {
            // Get rules
            const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
            this.rules = rulesResponse.data.result;
            
            // Get lists
            const listsResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/lists`);
            this.availableLists = listsResponse.data.result;
            
            console.log(`   Found ${this.rules.length} rules and ${this.availableLists.length} lists`);
            
        } catch (error) {
            console.error('❌ Failed to load data:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Extract hosts from rule traffic expressions
     */
    extractHosts(traffic) {
        if (!traffic) return [];
        
        const hosts = [];
        
        // Extract from "in {}" patterns
        const inPatternMatches = traffic.match(/in\s*\{([^}]+)\}/g);
        if (inPatternMatches) {
            inPatternMatches.forEach(match => {
                const content = match.replace(/in\s*\{/, '').replace(/\}/, '');
                const domainMatches = content.match(/"([^"]+)"/g);
                if (domainMatches) {
                    hosts.push(...domainMatches.map(d => d.replace(/"/g, '')));
                }
            });
        }
        
        return [...new Set(hosts)]; // Remove duplicates
    }

    /**
     * Analyze rules and suggest list conversions
     */
    analyzeForConversion() {
        console.log('🔍 Analyzing rules for list conversion opportunities...');
        
        this.rules.forEach(rule => {
            const hosts = this.extractHosts(rule.traffic);
            
            if (hosts.length > 5) { // Only suggest for rules with many hosts
                const suggestions = this.findListMatches(hosts, rule);
                
                if (suggestions.length > 0) {
                    this.conversionSuggestions.push({
                        rule: rule,
                        hosts: hosts,
                        suggestions: suggestions,
                        totalHosts: hosts.length
                    });
                }
            }
        });
        
        console.log(`   Found ${this.conversionSuggestions.length} rules that could benefit from lists`);
    }

    /**
     * Find which lists match the hosts in a rule
     */
    findListMatches(hosts, rule) {
        const matches = [];
        
        LIST_MAPPINGS.forEach(mapping => {
            const matchingHosts = hosts.filter(host => 
                mapping.keywords.some(keyword => 
                    host.toLowerCase().includes(keyword.toLowerCase())
                )
            );
            
            if (matchingHosts.length > 0) {
                // Check if this list actually exists
                const existingList = this.availableLists.find(list => 
                    list.name === mapping.listName
                );
                
                matches.push({
                    ...mapping,
                    matchingHosts: matchingHosts,
                    listExists: !!existingList,
                    listId: existingList?.id
                });
            }
        });
        
        return matches;
    }

    /**
     * Generate conversion examples for a rule
     */
    generateConversionExample(suggestion) {
        const rule = suggestion.rule;
        let convertedTraffic = rule.traffic;
        
        // For each matching list, show how to replace hosts
        suggestion.suggestions.forEach(listMatch => {
            if (listMatch.listExists) {
                // Create a simplified example
                const exampleHosts = listMatch.matchingHosts.slice(0, 3).map(h => `"${h}"`).join(' ');
                const inPattern = `in {${exampleHosts}}`;
                const listPattern = `in ${listMatch.listVariable}`;
                
                convertedTraffic = convertedTraffic.replace(inPattern, listPattern);
            }
        });
        
        return {
            original: rule.traffic.substring(0, 100) + (rule.traffic.length > 100 ? '...' : ''),
            converted: convertedTraffic.substring(0, 100) + (convertedTraffic.length > 100 ? '...' : '')
        };
    }

    /**
     * Display conversion recommendations
     */
    displayResults() {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║              RULE CONVERSION RECOMMENDATIONS             ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        if (this.conversionSuggestions.length === 0) {
            console.log('✅ Your rules are already well optimized!');
            console.log('   Most rules use single domains or are already using lists.');
            return;
        }

        console.log('🔄 Rules That Can Be Optimized:');
        console.log('');

        this.conversionSuggestions
            .sort((a, b) => b.totalHosts - a.totalHosts)
            .forEach((suggestion, index) => {
                console.log(`${index + 1}. 📋 ${suggestion.rule.name}`);
                console.log(`   Rule ID: ${suggestion.rule.id}`);
                console.log(`   Precedence: ${suggestion.rule.precedence}`);
                console.log(`   Total hosts: ${suggestion.totalHosts}`);
                console.log('');
                
                console.log('   💡 List Conversion Opportunities:');
                suggestion.suggestions.forEach(listMatch => {
                    const status = listMatch.listExists ? '✅' : '❌';
                    console.log(`   ${status} ${listMatch.listName} (${listMatch.matchingHosts.length} matching hosts)`);
                    
                    if (listMatch.listExists) {
                        console.log(`      → Use: ${listMatch.listVariable}`);
                        console.log(`      → Hosts: ${listMatch.matchingHosts.slice(0, 3).join(', ')}${listMatch.matchingHosts.length > 3 ? '...' : ''}`);
                    } else {
                        console.log(`      → Need to create this list first`);
                    }
                });
                
                // Show conversion example
                const example = this.generateConversionExample(suggestion);
                console.log('');
                console.log('   📝 Conversion Example:');
                console.log(`   Before: ${example.original}`);
                console.log(`   After:  ${example.converted}`);
                console.log('');
                console.log('   ' + '─'.repeat(60));
                console.log('');
            });

        // Show summary of required actions
        console.log('📋 Required Lists:');
        const missingLists = [];
        const existingLists = [];
        
        LIST_MAPPINGS.forEach(mapping => {
            const exists = this.availableLists.find(list => list.name === mapping.listName);
            if (exists) {
                existingLists.push(mapping);
            } else {
                missingLists.push(mapping);
            }
        });
        
        if (existingLists.length > 0) {
            console.log('');
            console.log('✅ Lists Ready to Use:');
            existingLists.forEach(list => {
                console.log(`   • ${list.listName} → ${list.listVariable}`);
            });
        }
        
        if (missingLists.length > 0) {
            console.log('');
            console.log('❌ Lists That Need to Be Created:');
            missingLists.forEach(list => {
                console.log(`   • ${list.listName}`);
                console.log(`     Keywords: ${list.keywords.slice(0, 5).join(', ')}...`);
            });
        }

        console.log('');
        console.log('🔄 Next Steps:');
        console.log('   1. Create any missing lists in Cloudflare Dashboard');
        console.log('   2. Populate lists with the relevant domains');
        console.log('   3. Update rules to use list references (e.g., dns.fqdn in $list-name)');
        console.log('   4. Test updated rules to ensure they work correctly');
        console.log('   5. Remove inline hosts once list-based rules are verified');
        console.log('');
        console.log('💡 Benefits:');
        console.log('   • Easier maintenance (update lists vs individual rules)');
        console.log('   • Better performance (pre-compiled host matching)');
        console.log('   • Centralized domain management');
        console.log('   • Reduced rule complexity');
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 Gateway Rule to List Conversion Tool');
        console.log('======================================');
        console.log('');

        try {
            await this.loadData();
            this.analyzeForConversion();
            this.displayResults();
        } catch (error) {
            console.error('💥 Conversion analysis failed:', error);
            process.exit(1);
        }
    }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
    const converter = new RuleListConverter();
    converter.run().catch(error => {
        console.error('💥 Script execution failed:', error);
        process.exit(1);
    });
}

export default RuleListConverter;
