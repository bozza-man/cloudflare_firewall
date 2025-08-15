// Create a Critical Infrastructure allow rule for essential services
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

// Critical infrastructure domains that must always work
const CRITICAL_DOMAINS = [
  // Warp.dev (Critical development environment)
  'warp.dev',
  'app.warp.dev', 
  'rtc.app.warp.dev',
  
  // Anthropic/AI Services (Critical for development)
  'anthropic.com',
  'api.anthropic.com',
  'claude.ai',
  'console.anthropic.com',
  
  // Apple Core Infrastructure 
  'apple.com',
  'icloud.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'deviceenrollment.apple.com',
  'deviceservices-external.apple.com',
  'gdmf.apple.com',
  'mdmenrollment.apple.com',
  
  // Cloudflare Infrastructure
  'cloudflare.com',
  'dash.cloudflare.com',
  'api.cloudflare.com',
  
  // SimpleMDM (Critical device management)
  'simplemdm.com',
  'a.simplemdm.com',
  'api.simplemdm.com',
  
  // Ubiquiti/UniFi (Critical network management)
  'ui.com',
  'unifi.ui.com',
  'account.ui.com',
  'sso.ui.com',
  
  // Microsoft Core Authentication
  'login.microsoftonline.com',
  'login.microsoft.com',
  'microsoft.com',
  
  // DNS Infrastructure
  'one.one.one.one',
  '1.1.1.1',
  'quad9.net',
  
  // Certificate/Security Infrastructure
  'ocsp.apple.com',
  'valid.apple.com',
  'ocsp2.g.aaplimg.com',
  'valid-apple.g.aaplimg.com'
];

// Create the critical infrastructure filter (DNS only for simplicity)
const CRITICAL_FILTER = `dns.fqdn in {${CRITICAL_DOMAINS.map(d => `"${d}"`).join(' ')}}`;

const CRITICAL_RULE = {
  name: 'CRITICAL INFRASTRUCTURE: Essential Services',
  description: '🚨 CRITICAL INFRASTRUCTURE: This rule MUST remain at LOW precedence (early evaluation) to ensure essential services always work. Contains bare minimum domains needed for system operation, device management, authentication, and development tools. DO NOT disable or move this rule.',
  action: 'allow',
  enabled: true,
  filters: ['dns'],
  traffic: CRITICAL_FILTER,
  precedence: 500, // Very low number = high priority, evaluated early
  identity: '',
  device_posture: '',
  rule_settings: {}
};

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

async function createCriticalInfrastructureRule() {
  try {
    console.log('🏗️ Creating Critical Infrastructure allow rule...');
    console.log(`📋 Including ${CRITICAL_DOMAINS.length} essential domains`);
    
    // Display the critical domains
    console.log('\n🔧 Critical domains included:');
    console.log('• Warp.dev (Development environment)');
    console.log('• Anthropic/Claude (AI services)');
    console.log('• Apple Core (Authentication, MDM, certificates)');
    console.log('• Cloudflare (Infrastructure)');
    console.log('• SimpleMDM (Device management)');
    console.log('• Ubiquiti/UniFi (Network management)');
    console.log('• Microsoft (Authentication)');
    console.log('• DNS Infrastructure (1.1.1.1, Quad9)');
    
    // Create the rule
    console.log('\n⚙️ Creating rule with precedence 500 (high priority)...');
    
    const createResponse = await api.post(
      `/accounts/${ACCOUNT_ID}/gateway/rules`,
      CRITICAL_RULE
    );
    
    const createdRule = createResponse.data.result;
    
    console.log('\n✅ Successfully created Critical Infrastructure rule!');
    console.log(`Rule ID: ${createdRule.id}`);
    console.log(`Name: ${createdRule.name}`);
    console.log(`Precedence: ${createdRule.precedence} (High Priority)`);
    console.log(`Action: ${createdRule.action.toUpperCase()}`);
    console.log(`Status: ${createdRule.enabled ? 'ENABLED' : 'DISABLED'}`);
    
    console.log('\n🛡️ This rule will ensure essential services always work!');
    console.log('🔒 Remember: This rule should NEVER be disabled or moved to low priority');
    
    return createdRule;
    
  } catch (error) {
    if (error.response?.data?.errors?.[0]?.message?.includes('already exists')) {
      console.log('⚠️ A similar rule may already exist. Checking existing rules...');
    } else {
      console.error('❌ Failed to create critical infrastructure rule:', error.response?.data || error.message);
    }
    process.exit(1);
  }
}

createCriticalInfrastructureRule();
