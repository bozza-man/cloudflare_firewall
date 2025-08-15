// Add Google and Apple Mail services to Critical Infrastructure rules
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

// Rule IDs for critical infrastructure rules
const DNS_RULE_ID = '13cc67a0-b26b-4e8c-9960-45ba24301531';
const HTTP_RULE_ID = '0ff5bbfa-88cb-46cc-a860-4b34091198e8';

// Additional Mail Service Domains to add
const NEW_MAIL_DOMAINS = [
  // Google Mail Infrastructure (additional to existing gmail.com)
  'mail.google.com',
  'googlemail.com',
  'inbox.google.com',
  'smtp.gmail.com',
  'imap.gmail.com',
  'pop.gmail.com',
  'mail-settings.google.com',
  
  // Apple Mail Services
  'mail.me.com',
  'mail.icloud.com',
  'smtp.mail.me.com',
  'imap.mail.me.com',
  'p01-smtp.mail.me.com',
  'p02-smtp.mail.me.com',
  'p03-smtp.mail.me.com',
  'p01-imap.mail.me.com',
  'p02-imap.mail.me.com',
  'p03-imap.mail.me.com',
  'p01-contacts.icloud.com',
  'p02-contacts.icloud.com',
  'p03-contacts.icloud.com',
  'p01-caldav.icloud.com',
  'p02-caldav.icloud.com', 
  'p03-caldav.icloud.com',
  'push.apple.com',
  'gateway.push.apple.com'
];

// Get current critical infrastructure domains and add mail services
async function getCurrentDomains(ruleId) {
  try {
    const response = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${ruleId}`);
    const rule = response.data.result;
    
    // Extract domains from traffic filter
    const traffic = rule.traffic;
    let domains = [];
    
    // Parse domains from DNS filter format: dns.fqdn in {"domain1" "domain2" ...}
    // or HTTP filter format: http.request.host in {"domain1" "domain2" ...}
    const domainMatches = traffic.match(/\{([^}]+)\}/);
    if (domainMatches) {
      const domainString = domainMatches[1];
      domains = domainString.split(/\s+/).map(d => d.replace(/"/g, ''));
    }
    
    return domains;
  } catch (error) {
    throw new Error(`Failed to get current domains for rule ${ruleId}: ${error.message}`);
  }
}

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

async function addMailServicesToCriticalInfrastructure() {
  try {
    console.log('📧 Adding Google and Apple Mail services to Critical Infrastructure rules...');
    console.log(`📋 Adding ${NEW_MAIL_DOMAINS.length} new mail service domains`);
    
    console.log('\n📧 NEW mail domains being added:');
    console.log('• Google Mail: mail.google.com, googlemail.com, smtp.gmail.com, imap.gmail.com, pop.gmail.com');
    console.log('• Apple Mail: mail.me.com, mail.icloud.com, smtp/imap.mail.me.com, push.apple.com');
    console.log('• Apple iCloud Services: contacts, caldav, and push gateway services');
    
    // Update DNS rule (rule #1)
    console.log('\n⚙️ Updating DNS Critical Infrastructure rule...');
    
    const currentDnsDomains = await getCurrentDomains(DNS_RULE_ID);
    const updatedDnsDomains = [...new Set([...currentDnsDomains, ...NEW_MAIL_DOMAINS])];
    
    console.log(`📊 DNS rule: ${currentDnsDomains.length} → ${updatedDnsDomains.length} domains (+${updatedDnsDomains.length - currentDnsDomains.length})`);
    
    const getDnsRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${DNS_RULE_ID}`);
    const currentDnsRule = getDnsRule.data.result;
    
    const dnsFilter = `dns.fqdn in {${updatedDnsDomains.map(d => `"${d}"`).join(' ')}}`;
    
    const updatedDnsPayload = {
      name: currentDnsRule.name,
      description: currentDnsRule.description + ' (Updated: Added Google & Apple Mail services)',
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
    
    const currentHttpDomains = await getCurrentDomains(HTTP_RULE_ID);
    const updatedHttpDomains = [...new Set([...currentHttpDomains, ...NEW_MAIL_DOMAINS])];
    
    console.log(`📊 HTTP rule: ${currentHttpDomains.length} → ${updatedHttpDomains.length} domains (+${updatedHttpDomains.length - currentHttpDomains.length})`);
    
    const getHttpRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${HTTP_RULE_ID}`);
    const currentHttpRule = getHttpRule.data.result;
    
    const httpFilter = `http.request.host in {${updatedHttpDomains.map(d => `"${d}"`).join(' ')}}`;
    
    const updatedHttpPayload = {
      name: currentHttpRule.name,
      description: currentHttpRule.description + ' (Updated: Added Google & Apple Mail services)',
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
    
    console.log('\n🎉 MAIL SERVICES ADDED TO CRITICAL INFRASTRUCTURE!');
    console.log(`📊 Total domains now protected: ${updatedDnsDomains.length}`);
    console.log('📧 Enhanced mail protection now includes:');
    console.log('  • Google Mail (Gmail, SMTP, IMAP, POP3)');
    console.log('  • Apple Mail (iCloud Mail, SMTP, IMAP)');
    console.log('  • Apple iCloud Services (Contacts, Calendar, Push)');
    console.log('  • All existing critical infrastructure services');
    
    console.log('\n✅ Both DNS and HTTP rules updated with mail service coverage!');
    console.log('🛡️ Mail services are now protected at highest priority');
    
  } catch (error) {
    console.error('❌ Failed to add mail services to critical infrastructure:', error.response?.data || error.message);
    process.exit(1);
  }
}

addMailServicesToCriticalInfrastructure();
