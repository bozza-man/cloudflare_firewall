#!/usr/bin/env node

/**
 * Create Local DNS Allow Rule - Correct API Format
 * 
 * Creates DNS allow rules using the correct Cloudflare Gateway API format
 * with filters array and traffic field.
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

// Local DNS allow rules using correct API format
const LOCAL_DNS_RULES = [
    {
        name: 'Network: Allow Reverse DNS Lookups (.arpa)',
        description: 'Allow reverse DNS lookups for .arpa domains which are essential for network diagnostics and proper network function',
        action: 'allow',
        enabled: true,
        precedence: 52000,
        filters: ['dns'],  // Correct format for DNS rules
        traffic: 'dns.fqdn matches ".*\\.arpa$"',  // The actual filter logic
        rule_settings: {}
    },
    {
        name: 'Network: Allow mDNS/Bonjour (.local)',
        description: 'Allow mDNS/Bonjour service discovery for .local domains used by Apple devices and network printers',
        action: 'allow',
        enabled: true,
        precedence: 52010,
        filters: ['dns'],
        traffic: 'dns.fqdn matches ".*\\.local$"',
        rule_settings: {}
    },
    {
        name: 'Network: Allow Service Discovery (_services)',
        description: 'Allow service discovery queries that start with underscore (_) for network device discovery',
        action: 'allow',
        enabled: true,
        precedence: 52020,
        filters: ['dns'],
        traffic: 'dns.fqdn matches "^_.*"',
        rule_settings: {}
    }
];

class LocalDNSAllowManager {
    constructor() {
        this.createdRules = [];
        this.errors = [];
    }

    async createLocalDNSAllowRules() {
        console.log('🚀 Creating Local DNS Allow Rules');
        console.log('=================================');
        console.log('');
        console.log('📋 Creating DNS rules to allow legitimate local network operations');
        console.log('   These rules will have higher precedence than the blocking rule');
        console.log('');

        for (const rule of LOCAL_DNS_RULES) {
            try {
                console.log(`⚙️  Creating: ${rule.name}...`);
                
                const payload = {
                    name: rule.name,
                    description: rule.description,
                    action: rule.action,
                    enabled: rule.enabled,
                    filters: rule.filters,
                    traffic: rule.traffic,
                    precedence: rule.precedence,
                    rule_settings: rule.rule_settings
                };

                const response = await api.post(`/accounts/${ACCOUNT_ID}/gateway/rules`, payload);
                
                if (response.data.success) {
                    this.createdRules.push({
                        id: response.data.result.id,
                        name: rule.name,
                        precedence: rule.precedence,
                        action: rule.action
                    });
                    console.log(`   ✅ Created successfully (ID: ${response.data.result.id})`);
                } else {
                    throw new Error(response.data.errors?.[0]?.message || 'Unknown error');
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                this.errors.push({
                    rule: rule.name,
                    error: error.response?.data?.errors?.[0]?.message || error.message
                });
                console.log(`   ❌ Failed: ${error.response?.data?.errors?.[0]?.message || error.message}`);
            }
        }

        this.displayResults();
    }

    async checkBlockingRule() {
        try {
            const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
            
            if (response.data.success) {
                const blockingRule = response.data.result.find(rule =>
                    rule.name.includes('Block Unknown DNS Queries')
                );
                
                if (blockingRule) {
                    console.log('📋 Found blocking rule:');
                    console.log(`   Name: ${blockingRule.name}`);
                    console.log(`   Precedence: ${blockingRule.precedence}`);
                    console.log(`   Status: ${blockingRule.enabled ? 'ENABLED' : 'DISABLED'}`);
                    console.log('');
                    return blockingRule;
                }
            }
        } catch (error) {
            console.log('⚠️  Could not check blocking rule status');
        }
        return null;
    }

    displayResults() {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║           LOCAL DNS ALLOW RULES CREATION RESULTS         ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('');

        console.log(`📊 Summary:`);
        console.log(`   ✅ Successfully created: ${this.createdRules.length} rules`);
        console.log(`   ❌ Failed: ${this.errors.length} rules`);
        console.log('');

        if (this.createdRules.length > 0) {
            console.log('✅ Successfully Created DNS Allow Rules:');
            this.createdRules.forEach(rule => {
                console.log(`   ${rule.precedence}: ${rule.name} (${rule.action.toUpperCase()})`);
            });
            console.log('');

            console.log('📈 Expected Results:');
            console.log('   • .arpa reverse DNS queries should now be ALLOWED');
            console.log('   • .local mDNS/Bonjour queries should now be ALLOWED');
            console.log('   • _service discovery queries should now be ALLOWED');
            console.log('   • Network printers and scanners should be discoverable');
            console.log('   • Apple device features (AirDrop, AirPlay) should work');
            console.log('');

            console.log('🧪 Testing:');
            console.log('   1. Wait 1-2 minutes for rules to propagate');
            console.log('   2. Check Gateway logs - those .arpa queries should show as ALLOWED');
            console.log('   3. Test network discovery features on your devices');
            console.log('');

            console.log('🛡️  Security Impact:');
            console.log('   • The "Block Unknown DNS Queries" rule remains active');
            console.log('   • Only specific legitimate patterns are now allowed');
            console.log('   • Malicious DNS queries will still be blocked');
        }

        if (this.errors.length > 0) {
            console.log('');
            console.log('❌ Failed Rules:');
            this.errors.forEach(error => {
                console.log(`   ${error.rule}: ${error.error}`);
            });
        }
    }
}

// Run the script
async function main() {
    const manager = new LocalDNSAllowManager();
    
    // Check the blocking rule first
    await manager.checkBlockingRule();
    
    // Create the allow rules
    await manager.createLocalDNSAllowRules();
}

main().catch(error => {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
});
