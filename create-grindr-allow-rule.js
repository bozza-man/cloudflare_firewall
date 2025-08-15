// Create rule to allow Grindr app and services
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

// Grindr domains and services
const GRINDR_DOMAINS = [
  'grindr.com',
  'www.grindr.com',
  'api.grindr.com',
  'app.grindr.com',
  'chat.grindr.com',
  'media.grindr.com',
  'images.grindr.com',
  'cdn.grindr.com',
  'push.grindr.com',
  'analytics.grindr.com',
  'static.grindr.com',
  'assets.grindr.com'
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

async function createGrindrAllowRule() {
  try {
    console.log('🌈 Creating Grindr allow rule...');
    console.log(`📱 Allowing ${GRINDR_DOMAINS.length} Grindr domains`);
    
    // Get current rules to determine appropriate precedence
    const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
    const existingRules = rulesResponse.data.result;
    
    // Find a good precedence (after critical infrastructure but before blocking rules)
    // Critical infrastructure uses 500-501, security rules use 1000-1030, so we'll use 1050
    const precedence = 1050;
    
    console.log('\n📱 Grindr domains to be allowed:');
    GRINDR_DOMAINS.forEach(domain => console.log(`  • ${domain}`));
    
    // Create DNS rule
    console.log('\n⚙️ Creating DNS allow rule for Grindr...');
    
    const dnsFilter = `dns.fqdn in {${GRINDR_DOMAINS.map(d => `"${d}"`).join(' ')}}`;
    
    const dnsRulePayload = {
      name: 'Social: Allow Grindr (DNS)',
      description: 'Allow DNS resolution for Grindr app and services',
      action: 'allow',
      enabled: true,
      filters: ['dns'],
      traffic: dnsFilter,
      precedence: precedence,
      identity: '',
      device_posture: '',
      rule_settings: {}
    };
    
    const dnsRuleResponse = await api.post(
      `/accounts/${ACCOUNT_ID}/gateway/rules`,
      dnsRulePayload
    );
    
    const dnsRuleId = dnsRuleResponse.data.result.id;
    console.log(`✅ DNS rule created successfully! ID: ${dnsRuleId}`);
    
    // Create HTTP rule
    console.log('⚙️ Creating HTTP allow rule for Grindr...');
    
    const httpFilter = `http.request.host in {${GRINDR_DOMAINS.map(d => `"${d}"`).join(' ')}}`;
    
    const httpRulePayload = {
      name: 'Social: Allow Grindr (HTTP)',
      description: 'Allow HTTP/HTTPS traffic for Grindr app and services',
      action: 'allow',
      enabled: true,
      filters: ['http'],
      traffic: httpFilter,
      precedence: precedence + 1,
      identity: '',
      device_posture: '',
      rule_settings: {}
    };
    
    const httpRuleResponse = await api.post(
      `/accounts/${ACCOUNT_ID}/gateway/rules`,
      httpRulePayload
    );
    
    const httpRuleId = httpRuleResponse.data.result.id;
    console.log(`✅ HTTP rule created successfully! ID: ${httpRuleId}`);
    
    console.log('\n🎉 GRINDR ACCESS ENABLED!');
    console.log('📊 Rules created:');
    console.log(`  • DNS Rule: ${dnsRuleId} (precedence ${precedence})`);
    console.log(`  • HTTP Rule: ${httpRuleId} (precedence ${precedence + 1})`);
    console.log('\n🌈 Grindr app and services are now allowed through the firewall');
    console.log('📱 This includes:');
    console.log('  • Main app functionality');
    console.log('  • Chat and messaging');
    console.log('  • Media and image sharing');
    console.log('  • Push notifications');
    console.log('  • Analytics and app updates');
    
  } catch (error) {
    console.error('❌ Failed to create Grindr allow rule:', error.response?.data || error.message);
    process.exit(1);
  }
}

createGrindrAllowRule();
