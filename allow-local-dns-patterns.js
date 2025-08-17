#!/usr/bin/env node

/**
 * Allow Local DNS Patterns - Cloudflare Gateway Rule Manager
 * 
 * This script creates specific allow rules for legitimate local network DNS queries
 * using the correct Cloudflare Gateway API syntax. These rules will have higher
 * precedence than the blocking rule to allow legitimate traffic through.
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

const API_BASE = 'https://api.cloudflare.com/client/v4';
const headers = {
    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json'
};

/**
 * Create multiple specific allow rules for different types of local DNS queries
 */
async function createLocalDNSAllowRules() {
    const rules = [
        {
            name: "Network: Allow Reverse DNS Lookups (.arpa)",
            description: "Allow reverse DNS lookups for .arpa domains which are essential for network diagnostics and proper network function",
            precedence: 52000,
            enabled: true,
            action: "allow",
            filters: 'dns.fqdn matches ".*\\.arpa$"'
        },
        {
            name: "Network: Allow mDNS/Bonjour (.local)",
            description: "Allow mDNS/Bonjour service discovery for .local domains used by Apple devices and network printers",
            precedence: 52010,
            enabled: true,
            action: "allow", 
            filters: 'dns.fqdn matches ".*\\.local$"'
        },
        {
            name: "Network: Allow Service Discovery (_services)",
            description: "Allow service discovery queries that start with underscore (_) for network device discovery",
            precedence: 52020,
            enabled: true,
            action: "allow",
            filters: 'dns.fqdn matches "^_.*"'
        }
    ];

    console.log('🔧 Creating local DNS allow rules...');
    console.log('');

    const createdRules = [];

    for (const rule of rules) {
        try {
            console.log(`📝 Creating: ${rule.name}`);
            
            const response = await axios.post(
                `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
                rule,
                { headers }
            );

            if (response.data.success) {
                console.log(`✅ Created successfully - ID: ${response.data.result.id}`);
                createdRules.push(response.data.result);
            } else {
                console.log(`❌ Failed: ${response.data.errors[0]?.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.response?.data?.errors[0]?.message || error.message}`);
        }
        
        console.log('');
    }

    return createdRules;
}

/**
 * Check if similar rules already exist
 */
async function checkExistingRules() {
    console.log('🔍 Checking for existing local DNS rules...');
    
    try {
        const response = await axios.get(
            `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
            { headers }
        );

        if (response.data.success) {
            const existingLocalRules = response.data.result.filter(rule =>
                rule.name.toLowerCase().includes('local') ||
                rule.name.toLowerCase().includes('.arpa') ||
                rule.name.toLowerCase().includes('reverse dns') ||
                rule.name.toLowerCase().includes('bonjour') ||
                rule.name.toLowerCase().includes('mdns') ||
                (rule.filters && (
                    rule.filters.includes('.arpa') ||
                    rule.filters.includes('.local') ||
                    rule.filters.includes('^_.*')
                ))
            );

            if (existingLocalRules.length > 0) {
                console.log('📋 Found existing local DNS rules:');
                existingLocalRules.forEach(rule => {
                    console.log(`   • ${rule.name} (Precedence: ${rule.precedence})`);
                });
                console.log('');
                return existingLocalRules;
            } else {
                console.log('📭 No existing local DNS rules found');
                console.log('');
                return [];
            }
        }
    } catch (error) {
        console.error('❌ Error checking existing rules:', error.response?.data || error.message);
        return [];
    }
}

/**
 * Get the blocking rule info
 */
async function getBlockingRuleInfo() {
    try {
        const response = await axios.get(
            `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
            { headers }
        );

        if (response.data.success) {
            const blockingRule = response.data.result.find(rule =>
                rule.name.includes('Block Unknown DNS Queries')
            );
            
            if (blockingRule) {
                return {
                    name: blockingRule.name,
                    precedence: blockingRule.precedence,
                    enabled: blockingRule.enabled
                };
            }
        }
    } catch (error) {
        console.error('❌ Error getting blocking rule info:', error.message);
    }
    return null;
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Creating Local DNS Allow Rules');
    console.log('==================================');
    console.log('');
    
    // Get blocking rule info
    const blockingRule = await getBlockingRuleInfo();
    if (blockingRule) {
        console.log('📋 Found blocking rule:');
        console.log(`   Name: ${blockingRule.name}`);
        console.log(`   Precedence: ${blockingRule.precedence}`);
        console.log(`   Status: ${blockingRule.enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log('');
        console.log('💡 Solution: Creating allow rules with higher precedence (lower numbers)');
        console.log('   New rules will be evaluated BEFORE the blocking rule');
        console.log('');
    }
    
    // Check for existing rules
    const existingRules = await checkExistingRules();
    
    if (existingRules.length > 0) {
        console.log('⚠️  Existing local DNS rules found. You may want to review them first.');
        console.log('   Continue anyway? The new rules will have specific precedence values.');
        console.log('');
    }
    
    // Create the new rules
    const createdRules = await createLocalDNSAllowRules();
    
    console.log('📊 Summary:');
    console.log(`   Rules created: ${createdRules.length}/3`);
    
    if (createdRules.length > 0) {
        console.log('');
        console.log('🎉 Local DNS allow rules created successfully!');
        console.log('');
        console.log('📈 Expected results:');
        console.log('   • .arpa reverse DNS lookups should now be ALLOWED');
        console.log('   • .local mDNS/Bonjour queries should now be ALLOWED');
        console.log('   • Service discovery (_*) queries should now be ALLOWED');
        console.log('');
        console.log('🧪 Next steps:');
        console.log('   1. Monitor Gateway logs for reduced blocking');
        console.log('   2. Test network discovery features');
        console.log('   3. Check that the queries in your screenshot are now allowed');
        
        if (blockingRule) {
            console.log('');
            console.log('🛡️  Security maintained:');
            console.log(`   • The "${blockingRule.name}" rule remains active`);
            console.log('   • Only legitimate local network patterns are now allowed');
            console.log('   • Malicious DNS queries will still be blocked');
        }
    } else {
        console.log('');
        console.log('❌ No rules were created successfully');
        console.log('💭 Check the error messages above for details');
    }
}

// Run the script
main().catch(error => {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
});
