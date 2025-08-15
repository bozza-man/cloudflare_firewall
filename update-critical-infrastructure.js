// Update Critical Infrastructure rules to include Google Workspace, Google Cloud, and ChatGPT
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

// Rule IDs for critical infrastructure rules
const DNS_RULE_ID = '13cc67a0-b26b-4e8c-9960-45ba24301531';
const HTTP_RULE_ID = '0ff5bbfa-88cb-46cc-a860-4b34091198e8';

// Enhanced critical infrastructure domains
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
  
  // OpenAI/ChatGPT (Critical AI services)
  'openai.com',
  'api.openai.com',
  'chat.openai.com',
  'platform.openai.com',
  'ab.chatgpt.com',
  
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
  
  // Google Workspace & Cloud (Critical business services)
  'google.com',
  'gmail.com',
  'accounts.google.com',
  'workspace.google.com',
  'admin.google.com',
  'drive.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'calendar.google.com',
  'meet.google.com',
  'chat.google.com',
  'googleapis.com',
  'googleusercontent.com',
  'gstatic.com',
  'console.cloud.google.com',
  'cloud.google.com',
  'gcp.goog',
  'googledomains.com',
  
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

async function updateCriticalInfrastructure() {
  try {
    console.log('🔄 Updating Critical Infrastructure rules...');
    console.log(`📋 Now including ${CRITICAL_DOMAINS.length} essential domains`);
    
    console.log('\n🆕 NEW domains being added:');
    console.log('• OpenAI/ChatGPT (openai.com, api.openai.com, chat.openai.com, platform.openai.com)');
    console.log('• Google Workspace (gmail.com, drive.google.com, docs.google.com, sheets.google.com, calendar.google.com, meet.google.com)');
    console.log('• Google Cloud Platform (console.cloud.google.com, cloud.google.com, gcp.goog)');
    console.log('• Google Core Services (accounts.google.com, googleapis.com, googleusercontent.com, gstatic.com)');
    
    // Update DNS rule (rule #1)
    console.log('\n⚙️ Updating DNS Critical Infrastructure rule...');
    
    const getDnsRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${DNS_RULE_ID}`);
    const currentDnsRule = getDnsRule.data.result;
    
    const dnsFilter = `dns.fqdn in {${CRITICAL_DOMAINS.map(d => `"${d}"`).join(' ')}}`;
    
    const updatedDnsPayload = {
      name: currentDnsRule.name,
      description: currentDnsRule.description,
      action: currentDnsRule.action,
      enabled: currentDnsRule.enabled,
      filters: currentDnsRule.filters,
      traffic: dnsFilter,
      precedence: currentDnsRule.precedence,
      identity: currentDnsRule.identity || '',
      device_posture: currentDnsRule.device_posture || '',
      rule_settings: currentDnsRule.rule_settings || {}
    };
    
    const updateDnsResponse = await api.put(
      `/accounts/${ACCOUNT_ID}/gateway/rules/${DNS_RULE_ID}`,
      updatedDnsPayload
    );
    
    console.log('✅ DNS rule updated successfully!');
    
    // Update HTTP rule (rule #2)
    console.log('⚙️ Updating HTTP Critical Infrastructure rule...');
    
    const getHttpRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${HTTP_RULE_ID}`);
    const currentHttpRule = getHttpRule.data.result;
    
    const httpFilter = `http.request.host in {${CRITICAL_DOMAINS.map(d => `"${d}"`).join(' ')}}`;
    
    const updatedHttpPayload = {
      name: currentHttpRule.name,
      description: currentHttpRule.description,
      action: currentHttpRule.action,
      enabled: currentHttpRule.enabled,
      filters: currentHttpRule.filters,
      traffic: httpFilter,
      precedence: currentHttpRule.precedence,
      identity: currentHttpRule.identity || '',
      device_posture: currentHttpRule.device_posture || '',
      rule_settings: currentHttpRule.rule_settings || {}
    };
    
    const updateHttpResponse = await api.put(
      `/accounts/${ACCOUNT_ID}/gateway/rules/${HTTP_RULE_ID}`,
      updatedHttpPayload
    );
    
    console.log('✅ HTTP rule updated successfully!');
    
    console.log('\n🎉 CRITICAL INFRASTRUCTURE UPDATED!');
    console.log(`📊 Total domains protected: ${CRITICAL_DOMAINS.length}`);
    console.log('🛡️ Enhanced protection now includes:');
    console.log('  • All previous critical services');
    console.log('  • OpenAI/ChatGPT for AI development');
    console.log('  • Google Workspace for business operations');
    console.log('  • Google Cloud Platform for infrastructure');
    console.log('  • Google core authentication services');
    
    console.log('\n✅ Both DNS and HTTP rules updated with expanded coverage!');
    
  } catch (error) {
    console.error('❌ Failed to update critical infrastructure:', error.response?.data || error.message);
    process.exit(1);
  }
}

updateCriticalInfrastructure();
