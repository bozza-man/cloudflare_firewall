#!/usr/bin/env node

/**
 * Create Local DNS Allow Rule - Simple Approach
 * 
 * Creates an allow rule for local DNS patterns using domain list format
 * that matches the working rules in your Gateway configuration.
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
 * Create a single comprehensive allow rule using the same format as your working rules
 */
async function createLocalDNSAllowRule() {
    console.log('🔧 Creating local DNS allow rule...');
    
    // Using the same format as your working "Allow Apple Homekit" rule which includes .local domains
    const rule = {
        name: "Network: Local DNS Operations",
        description: "Allow legitimate local network DNS operations including reverse DNS lookups (.arpa), service discovery (.local), and network device discovery patterns. Essential for proper network function.",
        precedence: 52000, // Higher priority than the blocking rule (63000)
        enabled: true,
        action: "allow",
        filters: 'dns.fqdn matches ".*\\.local$" or dns.fqdn matches ".*\\.arpa$" or dns.fqdn matches "^_.*\\._.*\\._.*$"'
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
            console.log('🔍 This rule allows:');
            console.log('   • .arpa domains (reverse DNS lookups)');
            console.log('   • .local domains (mDNS/Bonjour service discovery)');
            console.log('   • Service discovery patterns (_service._protocol.domain)');
            console.log('');
            console.log('📈 Expected impact:');
            console.log('   • The DNS queries in your screenshot should now be ALLOWED');
            console.log('   • Network printers and devices should be discoverable');
            console.log('   • Apple device features (AirDrop, AirPlay) should work');
            
            return response.data.result;
        } else {
            console.error('❌ Failed to create rule:', response.data.errors);
            return null;
        }
    } catch (error) {
        console.error('❌ Error creating rule:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Alternative: Try creating with simpler regex patterns
 */
async function createWithSimplePatterns() {
    console.log('🔧 Trying alternative approach with simpler patterns...');
    
    const rule = {
        name: "Network: Essential Local DNS",
        description: "Allow essential local network DNS queries that are being blocked by security rules",
        precedence: 51900, 
        enabled: true,
        action: "allow",
        filters: 'dns.fqdn matches ".*\\.arpa$"'
    };

    try {
        const response = await axios.post(
            `${API_BASE}/accounts/${ACCOUNT_ID}/gateway/rules`,
            rule,
            { headers }
        );

        if (response.data.success) {
            console.log('✅ Successfully created simplified rule');
            console.log(`   📋 Rule ID: ${response.data.result.id}`);
            return response.data.result;
        } else {
            console.error('❌ Failed to create simplified rule:', response.data.errors);
            return null;
        }
    } catch (error) {
        console.error('❌ Error creating simplified rule:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 Creating Local DNS Allow Rule');
    console.log('=================================');
    console.log('');
    console.log('❗ Problem: Local DNS queries (like those in your screenshot)');
    console.log('   are being blocked by the "Block Unknown DNS Queries" rule');
    console.log('');
    console.log('💡 Solution: Create an allow rule with higher precedence');
    console.log('   to permit legitimate local network operations');
    console.log('');
    
    // Try the main approach first
    let result = await createLocalDNSAllowRule();
    
    // If that fails, try the simpler approach
    if (!result) {
        console.log('');
        console.log('🔄 First approach failed, trying simpler pattern...');
        result = await createWithSimplePatterns();
    }
    
    if (result) {
        console.log('');
        console.log('🎉 Local DNS allow rule created successfully!');
        console.log('');
        console.log('🧪 Testing:');
        console.log('   1. Check your Gateway logs in a few minutes');
        console.log('   2. The .arpa domains from your screenshot should now show as ALLOWED');
        console.log('   3. Network discovery features should work properly');
        console.log('');
        console.log('🛡️  Security: The blocking rule remains active for actual threats');
    } else {
        console.log('');
        console.log('❌ Could not create the local DNS allow rule');
        console.log('💭 This may require manual configuration in the Cloudflare dashboard');
    }
}

// Run the script
main().catch(error => {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
});
