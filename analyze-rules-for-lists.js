#!/usr/bin/env node

/**
 * Analyze Gateway Rules for List Optimization Opportunities
 * 
 * This script analyzes existing Gateway rules to identify which ones
 * have many hosts and could benefit from using lists instead.
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

/**
 * Extract and count hosts from filter strings
 */
function extractHosts(traffic) {
    if (!traffic) return [];
    
    // Look for patterns like:
    // dns.fqdn in {"domain1.com" "domain2.com"}  
    // http.request.host in {"domain1.com" "domain2.com"}
    // domain.com or otherdomain.com
    
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
    
    // Extract individual domains from "or" patterns
    const orDomains = traffic.match(/[a-zA-Z0-9][\w.-]+\.[a-zA-Z]{2,}/g);
    if (orDomains) {
        hosts.push(...orDomains.filter(h => 
            !h.includes('*') && // Skip wildcards
            h.includes('.') &&   // Must have domain structure
            h.length > 4         // Reasonable minimum length
        ));
    }
    
    // Remove duplicates
    return [...new Set(hosts)];
}

/**
 * Categorize domains by type
 */
function categorizeDomains(hosts) {
    const categories = {
        critical: [],
        social: [],
        cloud: [],
        streaming: [],
        development: [],
        ai: [],
        other: []
    };
    
    hosts.forEach(host => {
        const lowerHost = host.toLowerCase();
        
        if (/\b(warp\.dev|anthropic\.com|apple\.com|icloud\.com|cloudflare\.com|simplemdm\.com|ui\.com|microsoft\.com|1\.1\.1\.1|quad9\.net|ocsp)\b/.test(lowerHost)) {
            categories.critical.push(host);
        } else if (/\b(facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|tiktok\.com|snapchat\.com|discord\.com|reddit\.com|pinterest\.com|youtube\.com|whatsapp\.com|telegram\.org|signal\.org)\b/.test(lowerHost)) {
            categories.social.push(host);
        } else if (/\b(dropbox\.com|drive\.google\.com|onedrive\.live\.com|box\.com|mega\.nz|sync\.com|pcloud\.com|backblaze\.com)\b/.test(lowerHost)) {
            categories.cloud.push(host);
        } else if (/\b(netflix\.com|hulu\.com|disney|primevideo\.com|spotify\.com|twitch\.tv|crunchyroll\.com|hbo\.com|peacocktv\.com|paramountplus\.com)\b/.test(lowerHost)) {
            categories.streaming.push(host);
        } else if (/\b(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|npmjs\.com|pypi\.org|docker\.com|vercel\.com|netlify\.com|heroku\.com|aws\.amazon\.com|azure\.microsoft\.com|cloud\.google\.com)\b/.test(lowerHost)) {
            categories.development.push(host);
        } else if (/\b(anthropic\.com|openai\.com|cohere\.ai|huggingface\.co|replicate\.com|midjourney\.com|stability\.ai|runpod\.io)\b/.test(lowerHost)) {
            categories.ai.push(host);
        } else {
            categories.other.push(host);
        }
    });
    
    return categories;
}

async function analyzeRules() {
    console.log('🚀 Analyzing Gateway Rules for List Optimization');
    console.log('===============================================');
    console.log('');

    try {
        // Get all rules
        console.log('🔍 Fetching Gateway rules...');
        const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
        
        if (!response.data.success) {
            throw new Error(response.data.errors?.[0]?.message || 'Failed to fetch rules');
        }
        
        const rules = response.data.result;
        console.log(`   Found ${rules.length} total rules`);
        console.log('');
        
        // Analyze each rule for host optimization opportunities
        const optimizationCandidates = [];
        
        rules.forEach(rule => {
            const hosts = extractHosts(rule.traffic);
            
            if (hosts.length > 3) {
                const categories = categorizeDomains(hosts);
                
                optimizationCandidates.push({
                    rule: rule,
                    hosts: hosts,
                    categories: categories,
                    totalHosts: hosts.length
                });
            }
        });
        
        console.log(`🎯 Found ${optimizationCandidates.length} rules that could benefit from lists:`);
        console.log('');
        
        // Sort by host count (descending)
        optimizationCandidates.sort((a, b) => b.totalHosts - a.totalHosts);
        
        optimizationCandidates.forEach((candidate, index) => {
            console.log(`${index + 1}. 📋 ${candidate.rule.name}`);
            console.log(`   Rule ID: ${candidate.rule.id}`);
            console.log(`   Precedence: ${candidate.rule.precedence}`);
            console.log(`   Action: ${candidate.rule.action.toUpperCase()}`);
            console.log(`   Total hosts: ${candidate.totalHosts}`);
            
            // Show categorization
            Object.entries(candidate.categories).forEach(([category, hosts]) => {
                if (hosts.length > 0) {
                    console.log(`   ${category}: ${hosts.length} hosts`);
                    if (hosts.length <= 3) {
                        console.log(`     → ${hosts.join(', ')}`);
                    } else {
                        console.log(`     → ${hosts.slice(0, 3).join(', ')}... (+${hosts.length - 3} more)`);
                    }
                }
            });
            
            console.log('');
        });
        
        // Show summary and recommendations
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║                    RECOMMENDATIONS                       ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');
        
        if (optimizationCandidates.length === 0) {
            console.log('✅ Great! Your rules are already optimized.');
            console.log('   Most rules use either single domains or wildcards,');
            console.log('   which is efficient for Gateway processing.');
            console.log('');
        } else {
            console.log('💡 List Optimization Opportunities:');
            console.log('');
            
            // Count total hosts by category across all rules
            const totalByCategory = {
                critical: new Set(),
                social: new Set(),
                cloud: new Set(),
                streaming: new Set(),
                development: new Set(),
                ai: new Set(),
                other: new Set()
            };
            
            optimizationCandidates.forEach(candidate => {
                Object.entries(candidate.categories).forEach(([category, hosts]) => {
                    hosts.forEach(host => totalByCategory[category].add(host));
                });
            });
            
            Object.entries(totalByCategory).forEach(([category, hostsSet]) => {
                if (hostsSet.size > 2) {
                    const hosts = Array.from(hostsSet);
                    console.log(`   🏷️  Create "${category.charAt(0).toUpperCase() + category.slice(1)} Services" list (${hosts.length} domains)`);
                    console.log(`      Examples: ${hosts.slice(0, 3).join(', ')}${hosts.length > 3 ? '...' : ''}`);
                }
            });
            
            console.log('');
            console.log('🔄 Next Steps:');
            console.log('   1. Create Cloudflare lists for the categories above');
            console.log('   2. Update rules to use list references like: dns.fqdn in $critical-services');
            console.log('   3. Test updated rules to ensure they work as expected');
            console.log('   4. Remove inline hosts once list-based rules are validated');
            console.log('');
            
            console.log('💡 Benefits of using lists:');
            console.log('   • Easier maintenance (update list vs. individual rules)');
            console.log('   • Better performance (pre-compiled host matching)');
            console.log('   • Reduced rule complexity and length');
            console.log('   • Centralized domain management');
        }
        
    } catch (error) {
        console.error('❌ Analysis failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Run analysis
analyzeRules();
