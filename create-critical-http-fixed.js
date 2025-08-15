// Create a Critical Infrastructure HTTP allow rule companion
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

// Same critical infrastructure domains for HTTP traffic
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
  
  // Certificate/Security Infrastructure (HTTP OCSP)
  'ocsp.apple.com',
  'valid.apple.com',
  'ocsp2.g.aaplimg.com',
  'valid-apple.g.aaplimg.com'
];

// Create the critical infrastructure HTTP filter
const CRITICAL_HTTP_FILTER = `http.request.host in {${CRITICAL_DOMAINS.map(d => `"${d}"`).join(' ')}}`;

const CRITICAL_HTTP_RULE = {
  name: 'CRITICAL INFRASTRUCTURE: Essential Services (HTTP)',
  description: '🚨 CRITICAL INFRASTRUCTURE (HTTP): Companion to DNS rule. This rule MUST remain at LOW precedence (early evaluation) to ensure HTTP traffic to essential services always works. Contains same domains as DNS rule for complete coverage. DO NOT disable or move this rule.',
  action: 'allow',
  enabled: true,
  filters: ['http'],
  traffic: CRITICAL_HTTP_FILTER,
  precedence: 501, // Just after the DNS rule
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

async function createCriticalHttpRule() {
  try {
    console.log('🌐 Creating Critical Infrastructure HTTP allow rule...');
    console.log(`📋 Including ${CRITICAL_DOMAINS.length} essential domains for HTTP traffic`);
    
    console.log('\n🔧 This rule ensures HTTP/HTTPS traffic to critical services works:');
    console.log('• Warp.dev API calls');
    console.log('• Anthropic/Claude API endpoints');
    console.log('• Apple authentication and MDM services');
    console.log('• Cloudflare dashboard and API');
    console.log('• SimpleMDM management console');
    console.log('• UniFi controller access');
    console.log('• Microsoft authentication portals');
    
    // Create the rule
    console.log('\n⚙️ Creating HTTP rule with precedence 501 (high priority)...');
    
    const createResponse = await api.post(
      `/accounts/${ACCOUNT_ID}/gateway/rules`,
      CRITICAL_HTTP_RULE
    );
    
    const createdRule = createResponse.data.result;
    
    console.log('\n✅ Successfully created Critical Infrastructure HTTP rule!');
    console.log(`Rule ID: ${createdRule.id}`);
    console.log(`Name: ${createdRule.name}`);
    console.log(`Precedence: ${createdRule.precedence} (High Priority)`);
    console.log(`Action: ${createdRule.action.toUpperCase()}`);
    console.log(`Status: ${createdRule.enabled ? 'ENABLED' : 'DISABLED'}`);
    
    console.log('\n🛡️ Critical infrastructure now has complete DNS + HTTP coverage!');
    console.log('🔒 Both DNS (500) and HTTP (501) rules protect essential services');
    
    return createdRule;
    
  } catch (error) {
    console.error('❌ Failed to create critical HTTP rule:', error.response?.data || error.message);
    process.exit(1);
  }
}

createCriticalHttpRule();
