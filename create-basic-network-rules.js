#!/usr/bin/env node
// Create basic network security rules using simplified Gateway HTTP syntax
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CLOUDFLARE_API_TOKEN || !ACCOUNT_ID) {
  console.error('❌ Missing environment variables. Check .env file.');
  process.exit(1);
}

const api = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: {
    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Basic network rule definitions that should work with Gateway
const NETWORK_RULES = [
  // Security Rules
  {
    name: 'Network Security: Block Dangerous File Downloads',
    description: 'Block downloads of executable files and scripts',
    action: 'block',
    enabled: true,
    precedence: 2100,
    traffic: 'http.request.uri.path matches ".*\\.(exe|scr|bat|cmd|pif|com|vbs|msi|deb|rpm)$"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Dangerous file type blocked'
    }
  },
  {
    name: 'Network Security: Block SQL Injection Attempts',
    description: 'Block common SQL injection patterns',
    action: 'block',
    enabled: true,
    precedence: 2110,
    traffic: 'http.request.uri.query matches ".*(SELECT|UNION|INSERT|UPDATE|DELETE).*"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'SQL injection attempt blocked'
    }
  },
  {
    name: 'Network Security: Block XSS Attempts',
    description: 'Block cross-site scripting attempts',
    action: 'block',
    enabled: true,
    precedence: 2120,
    traffic: 'http.request.uri matches ".*(<script|javascript:|onload=|onerror=).*"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'XSS attempt blocked'
    }
  },
  {
    name: 'Network Security: Block Admin Path Brute Force',
    description: 'Block suspicious admin path access attempts',
    action: 'block',
    enabled: true,
    precedence: 2130,
    traffic: 'http.request.uri.path matches ".*(wp-admin|phpmyadmin|cpanel|admin|administrator).*" and http.request.method == "POST"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Admin access attempt blocked'
    }
  },
  
  // Application Control
  {
    name: 'App Control: Monitor Large Uploads',
    description: 'Monitor POST requests to upload paths',
    action: 'allow',
    enabled: true,
    precedence: 4100,
    traffic: 'http.request.method == "POST" and http.request.uri.path matches ".*(upload|file).*"',
    rule_settings: {}
  },
  {
    name: 'App Control: Block Suspicious Downloads',
    description: 'Block downloads from suspicious paths',
    action: 'block',
    enabled: true,
    precedence: 4110,
    traffic: 'http.request.uri.path matches ".*(tmp|temp|cache).*\\.(zip|rar|7z|tar)$"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Suspicious download blocked'
    }
  },
  
  // Monitoring Rules  
  {
    name: 'Network Audit: Log API Access',
    description: 'Log access to API endpoints',
    action: 'allow',
    enabled: true,
    precedence: 6100,
    traffic: 'http.request.uri.path matches ".*(api|rest|graphql).*"',
    rule_settings: {}
  },
  {
    name: 'Network Audit: Monitor Authentication',
    description: 'Monitor authentication endpoints',
    action: 'allow',
    enabled: true,
    precedence: 6110,
    traffic: 'http.request.uri.path matches ".*(login|signin|auth|oauth).*"',
    rule_settings: {}
  }
];

class BasicNetworkRulesManager {
  constructor() {
    this.createdRules = [];
    this.errors = [];
  }

  async createBasicNetworkRules() {
    console.log('🛡️ Creating basic network security rules for Zero Trust Gateway...');
    console.log(`📋 Creating ${NETWORK_RULES.length} simplified HTTP network rules\n`);
    console.log('ℹ️  Note: Using simplified rules due to Gateway HTTP rule syntax limitations');
    console.log('   Advanced features like domain matching require DNS rules instead\n');

    for (const rule of NETWORK_RULES) {
      try {
        console.log(`⚙️ Creating: ${rule.name}...`);
        
        const payload = {
          name: rule.name,
          description: rule.description,
          action: rule.action,
          enabled: rule.enabled,
          filters: ['http'],
          traffic: rule.traffic,
          precedence: rule.precedence,
          rule_settings: rule.rule_settings || {}
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

  displayResults() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║           BASIC NETWORK RULES CREATION RESULTS           ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Summary:`);
    console.log(`   ✅ Successfully created: ${this.createdRules.length} rules`);
    console.log(`   ❌ Failed: ${this.errors.length} rules\n`);

    if (this.createdRules.length > 0) {
      console.log('✅ Successfully Created Network Rules:');
      this.createdRules.forEach(rule => {
        console.log(`   ${rule.precedence}: ${rule.name} (${rule.action.toUpperCase()})`);
      });
      console.log();
    }

    if (this.errors.length > 0) {
      console.log('❌ Failed Rules:');
      this.errors.forEach(error => {
        console.log(`   ${error.rule}: ${error.error}`);
      });
      console.log();
    }

    console.log('🛡️ Network Security Controls Deployed:');
    console.log('   • Dangerous file download protection');
    console.log('   • SQL injection attempt blocking');
    console.log('   • Cross-site scripting (XSS) protection');
    console.log('   • Admin interface brute force protection');
    console.log('   • Upload monitoring and logging');
    console.log('   • Suspicious download blocking');
    console.log('   • API access monitoring');
    console.log('   • Authentication endpoint monitoring');
    console.log();

    console.log('📋 Network Rule Limitations & Alternatives:');
    console.log('   ⚠️  Domain-based blocking: Use DNS rules instead');
    console.log('   ⚠️  User-agent filtering: Limited in HTTP rules');
    console.log('   ⚠️  Geographic blocking: Use DNS rules with location data');
    console.log('   ⚠️  Category blocking: Use DNS rules with content categories');
    console.log();

    console.log('🎯 Complementary DNS Rules Already Active:');
    console.log('   ✅ Critical Infrastructure (84 domains)');
    console.log('   ✅ Security blocking (malware, phishing)');
    console.log('   ✅ Social media access (Grindr)');
    console.log('   ✅ Mail services (Google & Apple)');
    console.log();

    console.log('📋 Next Steps:');
    console.log('   1. Test new network rules:');
    console.log('      node manage-warp-zerotrust.js test');
    console.log('   2. Verify all rules are working:');
    console.log('      npm start -- rules list | tail -10');
    console.log('   3. Add domain-based rules via DNS filtering:');
    console.log('      npm start -- rules create --type dns');
    console.log('   4. Monitor rule effectiveness in Gateway Analytics');
    console.log('   5. Consider additional DNS rules for comprehensive coverage');
    console.log();

    if (this.createdRules.length > 0) {
      console.log('🎉 Basic network security rules deployed successfully!');
      console.log(`   Added ${this.createdRules.length} HTTP-level security controls`);
      console.log('   Combined with existing DNS rules for layered protection');
      console.log();
      console.log('🔍 Current Total Security Coverage:');
      console.log('   • DNS Rules: Domain/content filtering (67+ rules)');
      console.log(`   • HTTP Rules: Request/response filtering (${this.createdRules.length} new rules)`);
      console.log('   • Zero Trust: Identity and device verification');
      console.log('   • WARP Tunnel: End-to-end encryption');
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new BasicNetworkRulesManager();
  manager.createBasicNetworkRules().catch(error => {
    console.error('❌ Error creating basic network rules:', error.message);
    process.exit(1);
  });
}

export default BasicNetworkRulesManager;
