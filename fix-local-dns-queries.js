#!/usr/bin/env node

/**
 * Fix Local DNS Queries - Cloudflare Gateway Rule Manager
 * 
 * This script creates allow rules for legitimate local network DNS queries
 * that are commonly used for service discovery and network operations.
 * 
 * These queries are being blocked by the broad "Block Unknown DNS Queries" rule
 * but should be allowed as they are part of normal network operations.
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
 * Create a Gateway DNS rule to allow legitimate local network DNS queries
 */
async function createLocalDNSAllowRule() {
    console.log('🔧 Creating allow rule for legitimate local network DNS queries...');
    
    // First, try creating with specific FQDN patterns
    const rule = {
        name: "Network Discovery: Allow Local DNS Queries",
        description: "Allow legitimate local network DNS queries including service discovery, reverse DNS lookups, and network printer/scanner discovery. These queries are part of normal network operations and should not be blocked.",
        precedence: 52000, // Higher priority than the blocking rule (63000)
        enabled: true,
        action: "allow",
        filters: [
            'dns.fqdn matches ".*\\.arpa$"',
            'dns.fqdn matches ".*\\.local$"',
            'dns.fqdn matches "^_.*"'
        ],
        rule_settings: {
            block_page_enabled: false,
            override_ips: null,
            override_host: ""
        }
    };

    try {
        const response = await axios.post(
            `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
            rule,
            { headers }
        );

        if (response.data.success) {
            console.log('✅ Successfully created local DNS allow rule');
            console.log(`   📋 Rule ID: ${response.data.result.id}`);
            console.log(`   🎯 Precedence: ${response.data.result.precedence}`);
            console.log(`   📊 Action: ${response.data.result.action.toUpperCase()}`);
            console.log('');
            console.log('🔍 This rule will now allow:');
            console.log('   • Reverse DNS lookups (.arpa domains)');
            console.log('   • mDNS/Bonjour service discovery (.local domains)');
            console.log('   • Network printer and scanner discovery');
            console.log('   • Apple device discovery (AirPlay, AirDrop)');
            console.log('   • General service discovery queries starting with "_"');
            console.log('');
            console.log('📈 Impact: Reduced false positive blocks for legitimate network operations');
            
            return response.data.result;
        } else {
            console.error('❌ Failed to create local DNS allow rule:', response.data.errors);
            return null;
        }
    } catch (error) {
        console.error('❌ Error creating local DNS allow rule:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Get information about the existing blocking rule
 */
async function analyzeBlockingRule() {
    console.log('🔍 Analyzing current DNS blocking rule...');
    
    try {
        const response = await axios.get(
            `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
            { headers }
        );

        if (response.data.success) {
            const rules = response.data.result;
            const blockingRule = rules.find(rule => 
                rule.name.includes('Block Unknown DNS Queries') || 
                rule.filters?.includes('not(any(dns.security_category[*]')
            );
            
            if (blockingRule) {
                console.log('📋 Found DNS blocking rule:');
                console.log(`   📛 Name: ${blockingRule.name}`);
                console.log(`   🆔 ID: ${blockingRule.id}`);
                console.log(`   🎯 Precedence: ${blockingRule.precedence}`);
                console.log(`   ⚡ Status: ${blockingRule.enabled ? 'ENABLED' : 'DISABLED'}`);
                console.log('');
                
                return blockingRule;
            } else {
                console.log('⚠️ DNS blocking rule not found');
                return null;
            }
        }
    } catch (error) {
        console.error('❌ Error analyzing blocking rule:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Fixing Local DNS Query Blocking Issue');
    console.log('==========================================');
    console.log('');
    
    // Analyze the current blocking rule
    const blockingRule = await analyzeBlockingRule();
    
    if (blockingRule) {
        console.log('💡 Solution: Creating an allow rule with higher priority');
        console.log(`   🔄 New rule precedence: 52000 (higher than ${blockingRule.precedence})`);
        console.log('');
        
        // Create the allow rule
        const allowRule = await createLocalDNSAllowRule();
        
        if (allowRule) {
            console.log('🎉 Fix completed successfully!');
            console.log('');
            console.log('📊 What changed:');
            console.log('   • Added allow rule for legitimate local DNS queries');
            console.log('   • Reduced false positive blocks for network discovery');
            console.log('   • Maintained security by keeping original blocking rule');
            console.log('');
            console.log('🧪 Next steps:');
            console.log('   1. Monitor the Gateway logs to verify the fix');
            console.log('   2. Check that legitimate DNS queries are now allowed');
            console.log('   3. Ensure security blocking still works for malicious DNS');
        }
    } else {
        console.log('⚠️ Could not find the DNS blocking rule to analyze');
        console.log('💭 Creating the allow rule anyway for future protection...');
        
        await createLocalDNSAllowRule();
    }
}

// Run the script
main().catch(error => {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
});
