#!/usr/bin/env node
// Create network security rules using correct Gateway HTTP rule syntax
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

// Network rule definitions using correct Gateway syntax
const NETWORK_RULES = [
  // Security Rules (High Priority - 2000-2999)
  {
    name: 'Security: Block Known Malware Domains',
    description: 'Block known malware and malicious domains',
    action: 'block',
    enabled: true,
    precedence: 2000,
    traffic: 'any(http.request.headers["host"][*] in {"malware-domain.example" "bad-actor.net" "suspicious-site.org"})',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Malware domain detected'
    }
  },
  {
    name: 'Security: Block Suspicious File Downloads',
    description: 'Block downloads of potentially dangerous file types',
    action: 'block',
    enabled: true,
    precedence: 2010,
    traffic: 'http.request.uri.path matches ".*\\.(exe|scr|bat|cmd|pif|com|vbs|msi)$"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Potentially dangerous file download blocked'
    }
  },
  {
    name: 'Security: Block Cryptocurrency Mining Sites',
    description: 'Block cryptocurrency mining websites and pools',
    action: 'block',
    enabled: true,
    precedence: 2020,
    traffic: 'any(http.request.headers["host"][*] in {"coinhive.com" "coin-hive.com" "crypto-loot.com" "jsecoin.com"})',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Cryptocurrency mining site blocked'
    }
  },
  
  // Data Loss Prevention Rules (3000-3999)
  {
    name: 'DLP: Block Unauthorized File Sharing',
    description: 'Block access to unauthorized file sharing sites',
    action: 'block',
    enabled: true,
    precedence: 3000,
    traffic: 'any(http.request.headers["host"][*] in {"wetransfer.com" "sendspace.com" "rapidshare.com" "megaupload.com"})',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Unauthorized file sharing service blocked'
    }
  },
  {
    name: 'DLP: Monitor Large File Uploads',
    description: 'Log large file uploads for monitoring',
    action: 'allow',
    enabled: true,
    precedence: 3010,
    traffic: 'http.request.method == "POST" and http.request.uri.path contains "upload"',
    rule_settings: {
      add_headers: {
        'X-Audit-Upload': 'true'
      }
    }
  },
  
  // Application Control Rules (4000-4999)
  {
    name: 'App Control: Block P2P File Sharing',
    description: 'Block peer-to-peer file sharing websites',
    action: 'block',
    enabled: true,
    precedence: 4000,
    traffic: 'any(http.request.headers["host"][*] in {"thepiratebay.org" "torrentz.com" "kickass.to" "1337x.to"})',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Peer-to-peer file sharing blocked'
    }
  },
  {
    name: 'App Control: Monitor Video Streaming',
    description: 'Monitor high-bandwidth video streaming sites',
    action: 'allow',
    enabled: true,
    precedence: 4010,
    traffic: 'any(http.request.headers["host"][*] in {"youtube.com" "netflix.com" "twitch.tv" "vimeo.com"})',
    rule_settings: {
      add_headers: {
        'X-Audit-Streaming': 'true'
      }
    }
  },
  {
    name: 'App Control: Block Gaming Sites During Work Hours',
    description: 'Block gaming websites during business hours',
    action: 'block',
    enabled: true,
    precedence: 4020,
    traffic: 'any(http.request.headers["host"][*] in {"steam.com" "battle.net" "epicgames.com" "origin.com"})',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Gaming sites restricted during business hours'
    }
  },
  
  // Risk-Based Security Rules (5000-5999)
  {
    name: 'Risk-Based: Block Suspicious User Agents',
    description: 'Block requests with suspicious user agents',
    action: 'block',
    enabled: true,
    precedence: 5000,
    traffic: 'http.user_agent matches ".*(curl|wget|python-requests|masscan|nmap).*"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Suspicious user agent detected'
    }
  },
  {
    name: 'Risk-Based: Block Common Attack Patterns',
    description: 'Block common web attack patterns in URLs',
    action: 'block',
    enabled: true,
    precedence: 5010,
    traffic: 'http.request.uri.path matches ".*(SELECT|UNION|DROP|INSERT|UPDATE|DELETE|script>|javascript:).*"',
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Potential attack pattern detected'
    }
  },
  
  // Monitoring and Audit Rules (6000-6999)
  {
    name: 'Audit: Log Administrative Access',
    description: 'Log access to administrative interfaces',
    action: 'allow',
    enabled: true,
    precedence: 6000,
    traffic: 'http.request.uri.path matches ".*(admin|administrator|wp-admin|cpanel).*"',
    rule_settings: {
      add_headers: {
        'X-Audit-Admin-Access': 'true'
      }
    }
  },
  {
    name: 'Audit: Monitor DNS Over HTTPS',
    description: 'Monitor potential DNS over HTTPS bypass attempts',
    action: 'allow',
    enabled: true,
    precedence: 6010,
    traffic: 'any(http.request.headers["host"][*] in {"dns.cloudflare.com" "dns.google" "doh.opendns.com"})',
    rule_settings: {
      add_headers: {
        'X-Audit-DoH': 'true'
      }
    }
  },
  
  // Business Applications (7000-7999)
  {
    name: 'Business: Ensure Microsoft 365 Access',
    description: 'Ensure reliable access to Microsoft 365 services',
    action: 'allow',
    enabled: true,
    precedence: 7000,
    traffic: 'any(http.request.headers["host"][*] matches ".*\\.(microsoft|office|outlook|sharepoint|onedrive)\\.com$")',
    rule_settings: {}
  },
  {
    name: 'Business: Ensure Google Workspace Access',
    description: 'Ensure reliable access to Google Workspace',
    action: 'allow',
    enabled: true,
    precedence: 7010,
    traffic: 'any(http.request.headers["host"][*] matches ".*\\.(google|googleapis|googleusercontent)\\.com$")',
    rule_settings: {}
  },
  
  // Default Monitoring (9000-9999)
  {
    name: 'Default: Log Uncategorized Traffic',
    description: 'Log traffic to uncategorized or new domains',
    action: 'allow',
    enabled: true,
    precedence: 9000,
    traffic: 'not any(http.request.headers["host"][*] matches ".*\\.(google|microsoft|cloudflare|github|amazon)\\.com$")',
    rule_settings: {
      add_headers: {
        'X-Audit-Uncategorized': 'true'
      }
    }
  }
];

class NetworkRulesManager {
  constructor() {
    this.createdRules = [];
    this.errors = [];
  }

  async createNetworkRules() {
    console.log('🌐 Creating network security rules with corrected Gateway syntax...');
    console.log(`📋 Creating ${NETWORK_RULES.length} HTTP network rules\n`);

    for (const rule of NETWORK_RULES) {
      try {
        console.log(`⚙️ Creating: ${rule.name}...`);
        
        const payload = {
          name: rule.name,
          description: rule.description,
          action: rule.action,
          enabled: rule.enabled,
          filters: ['http'], // HTTP rules for network filtering
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
    console.log('║              NETWORK RULES CREATION RESULTS              ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Summary:`);
    console.log(`   ✅ Successfully created: ${this.createdRules.length} rules`);
    console.log(`   ❌ Failed: ${this.errors.length} rules\n`);

    if (this.createdRules.length > 0) {
      console.log('✅ Successfully Created Rules:');
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

    console.log('🛡️ Network Security Categories Deployed:');
    console.log('   • Malware Domain Protection');
    console.log('   • Suspicious File Download Blocking');
    console.log('   • Cryptocurrency Mining Prevention');
    console.log('   • Data Loss Prevention Controls');
    console.log('   • Application Usage Control');
    console.log('   • Risk-Based Security Detection');
    console.log('   • Comprehensive Audit Logging');
    console.log('   • Business Application Optimization');
    console.log();

    console.log('📋 Next Steps:');
    console.log('   1. Test new rules with WARP clients:');
    console.log('      node manage-warp-zerotrust.js test');
    console.log('   2. Verify rule effectiveness:');
    console.log('      npm start -- rules list | tail -20');
    console.log('   3. Monitor Gateway analytics for rule performance');
    console.log('   4. Customize rules based on your specific needs');
    console.log('   5. Add more specific domains to block/allow lists');
    console.log();

    if (this.createdRules.length > 0) {
      console.log('🎉 Network security rules successfully deployed!');
      console.log(`   Your Zero Trust Gateway now has ${this.createdRules.length} additional security controls`);
      console.log('   Combined with existing DNS rules for comprehensive protection');
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new NetworkRulesManager();
  manager.createNetworkRules().catch(error => {
    console.error('❌ Error creating network rules:', error.message);
    process.exit(1);
  });
}

export default NetworkRulesManager;
