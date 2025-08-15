#!/usr/bin/env node
// Create comprehensive network security rules for Zero Trust Gateway
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

// Network rule definitions based on best practices
const NETWORK_RULES = [
  // Security Rules (High Priority - 2000-2999)
  {
    name: 'Security: Block Malware Command & Control',
    description: 'Block known malware command and control servers',
    action: 'block',
    enabled: true,
    precedence: 2000,
    traffic: 'net.dst.category in {146 147 148}', // Malware, C2, Botnet categories
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Malware or Command & Control server detected'
    }
  },
  {
    name: 'Security: Block Known Phishing Sites',
    description: 'Block websites identified as phishing attempts',
    action: 'block',
    enabled: true,
    precedence: 2010,
    traffic: 'net.dst.category in {144}', // Phishing category
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Phishing attempt blocked'
    }
  },
  {
    name: 'Security: Block Cryptocurrency Mining',
    description: 'Block cryptocurrency mining and related activities',
    action: 'block',
    enabled: true,
    precedence: 2020,
    traffic: 'net.dst.category in {156}', // Cryptocurrency category
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Cryptocurrency mining blocked'
    }
  },
  {
    name: 'Security: Block Suspicious File Downloads',
    description: 'Block downloads of potentially dangerous file types',
    action: 'block',
    enabled: true,
    precedence: 2030,
    traffic: 'http.request.uri.path matches ".*\\.(exe|scr|bat|cmd|pif|com|vbs|js|jar|msi|deb|rpm)$" and not net.dst.category in {82 83 155}', // Block executables except from software/update sites
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Potentially dangerous file download blocked'
    }
  },
  
  // Data Loss Prevention Rules (3000-3999)
  {
    name: 'DLP: Monitor Large File Uploads',
    description: 'Log and inspect large file uploads for data exfiltration',
    action: 'allow',
    enabled: true,
    precedence: 3000,
    traffic: 'http.request.method == "POST" and http.request.headers["content-length"][0] > "10485760"', // 10MB+
    rule_settings: {
      add_headers: {
        'X-Audit-Large-Upload': 'true'
      },
      biso_admin_controls: {
        dp: true // Data Protection inspection
      }
    }
  },
  {
    name: 'DLP: Block Unauthorized Cloud Storage',
    description: 'Block uploads to unauthorized cloud storage services',
    action: 'block',
    enabled: true,
    precedence: 3010,
    traffic: 'net.dst.category in {96} and not (net.dst.domain in {"drive.google.com" "onedrive.live.com" "dropbox.com" "icloud.com"})', // Storage category except approved
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Unauthorized cloud storage service blocked'
    }
  },
  
  // Application Control Rules (4000-4999)
  {
    name: 'App Control: Restrict Social Media During Work Hours',
    description: 'Limit social media access during business hours (9 AM - 5 PM)',
    action: 'block',
    enabled: true,
    precedence: 4000,
    traffic: 'net.dst.category in {25 26 100} and not (time.hour >= 12 and time.hour < 13) and time.hour >= 9 and time.hour < 17 and time.weekday in {1 2 3 4 5}', // Social media except lunch hour
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Social media restricted during business hours'
    }
  },
  {
    name: 'App Control: Monitor Video Streaming Bandwidth',
    description: 'Monitor and log high-bandwidth video streaming',
    action: 'allow',
    enabled: true,
    precedence: 4010,
    traffic: 'net.dst.category in {55 89}', // Video streaming categories
    rule_settings: {
      add_headers: {
        'X-Audit-Streaming': 'true'
      }
    }
  },
  {
    name: 'App Control: Block P2P File Sharing',
    description: 'Block peer-to-peer file sharing applications',
    action: 'block',
    enabled: true,
    precedence: 4020,
    traffic: 'net.dst.category in {15}', // P2P category
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Peer-to-peer file sharing blocked'
    }
  },
  
  // Geographic and Risk-Based Rules (5000-5999)
  {
    name: 'Geo-Block: High Risk Countries',
    description: 'Block traffic to high-risk geographic locations',
    action: 'block',
    enabled: true,
    precedence: 5000,
    traffic: 'ip.geoip.country in {"CN" "RU" "KP" "IR"}', // High-risk countries
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Traffic to high-risk country blocked'
    }
  },
  {
    name: 'Risk-Based: Suspicious User Agents',
    description: 'Block requests with suspicious or malicious user agents',
    action: 'block',
    enabled: true,
    precedence: 5010,
    traffic: 'http.user_agent matches ".*(curl|wget|python|scanner|bot|crawler).*" and not net.dst.category in {82 83}', // Suspicious UAs except to legitimate sites
    rule_settings: {
      block_page_enabled: true,
      block_reason: 'Suspicious user agent detected'
    }
  },
  
  // Monitoring and Audit Rules (6000-6999)
  {
    name: 'Audit: Log All HTTPS to Unknown Sites',
    description: 'Log HTTPS connections to uncategorized websites',
    action: 'allow',
    enabled: true,
    precedence: 6000,
    traffic: 'net.dst.category in {0} and net.dst.port == 443', // Uncategorized HTTPS
    rule_settings: {
      add_headers: {
        'X-Audit-Unknown-HTTPS': 'true'
      }
    }
  },
  {
    name: 'Audit: Monitor DNS Over HTTPS Bypasses',
    description: 'Detect and log DoH bypass attempts',
    action: 'allow',
    enabled: true,
    precedence: 6010,
    traffic: 'net.dst.port in {853 443} and (net.dst.domain in {"1.1.1.1" "8.8.8.8" "9.9.9.9" "dns.cloudflare.com" "dns.google.com"})', // DoH/DoT servers
    rule_settings: {
      add_headers: {
        'X-Audit-DoH-Bypass': 'true'
      }
    }
  },
  
  // Business Applications (7000-7999)
  {
    name: 'Business: Allow Microsoft 365 Full Suite',
    description: 'Ensure full Microsoft 365 functionality',
    action: 'allow',
    enabled: true,
    precedence: 7000,
    traffic: 'net.dst.category in {82} and net.dst.domain matches ".*\\.(microsoft|office|outlook|sharepoint|onedrive)\\.com$"',
    rule_settings: {}
  },
  {
    name: 'Business: Allow Google Workspace',
    description: 'Ensure full Google Workspace functionality',
    action: 'allow',
    enabled: true,
    precedence: 7010,
    traffic: 'net.dst.domain matches ".*\\.(google|googleapis|googleusercontent)\\.com$" and net.dst.category in {82 83}',
    rule_settings: {}
  },
  
  // Default Allow with Logging (9000-9999)
  {
    name: 'Default: Log All Other Traffic',
    description: 'Allow and log all other traffic for analysis',
    action: 'allow',
    enabled: true,
    precedence: 9000,
    traffic: 'true', // Match all remaining traffic
    rule_settings: {
      add_headers: {
        'X-Audit-Default-Allow': 'true'
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
    console.log('🌐 Creating comprehensive network security rules for Zero Trust Gateway...');
    console.log(`📋 Creating ${NETWORK_RULES.length} network rules based on security best practices\n`);

    for (const rule of NETWORK_RULES) {
      try {
        console.log(`⚙️ Creating: ${rule.name}...`);
        
        const payload = {
          name: rule.name,
          description: rule.description,
          action: rule.action,
          enabled: rule.enabled,
          filters: ['http'], // Network rules use http filter
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

    console.log('🛡️ Network Security Categories Covered:');
    console.log('   • Malware & Command Control Protection');
    console.log('   • Phishing & Fraud Prevention');
    console.log('   • Data Loss Prevention (DLP)');
    console.log('   • Application Control & Bandwidth Management');
    console.log('   • Geographic Risk Blocking');
    console.log('   • Suspicious Activity Detection');
    console.log('   • Business Application Optimization');
    console.log('   • Comprehensive Audit Logging');
    console.log();

    console.log('📋 Next Steps:');
    console.log('   1. Review Gateway Analytics for rule effectiveness');
    console.log('   2. Adjust time-based rules for your business hours');
    console.log('   3. Customize geographic blocks for your locations');
    console.log('   4. Configure alerting for security events');
    console.log('   5. Test rules with different user scenarios');
    console.log();

    console.log('⚙️ Rule Management Commands:');
    console.log('   npm start -- rules list | grep "Security\\|DLP\\|App Control"');
    console.log('   npm start -- rules analyze');
    console.log('   npm start -- rules stats');
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
