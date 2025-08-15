// Fix the DNS Critical Infrastructure rule position
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DNS_RULE_ID = '13cc67a0-b26b-4e8c-9960-45ba24301531';

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

async function fixDnsCriticalPosition() {
  try {
    console.log('🔧 Fixing DNS Critical Infrastructure rule position...');
    
    // Get the current DNS rule
    const getDnsRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${DNS_RULE_ID}`);
    const currentRule = getDnsRule.data.result;
    
    console.log(`Current DNS rule precedence: ${currentRule.precedence}`);
    console.log('Target precedence: 500 (should be position #1)');
    
    // Update precedence to 500 (highest priority)
    const updatePayload = {
      name: currentRule.name,
      description: currentRule.description,
      action: currentRule.action,
      enabled: currentRule.enabled,
      filters: currentRule.filters,
      traffic: currentRule.traffic,
      precedence: 500, // Restore to original high priority position
      identity: currentRule.identity || '',
      device_posture: currentRule.device_posture || '',
      rule_settings: currentRule.rule_settings || {}
    };
    
    const updateResponse = await api.put(
      `/accounts/${ACCOUNT_ID}/gateway/rules/${DNS_RULE_ID}`,
      updatePayload
    );
    
    console.log('✅ DNS Critical Infrastructure rule position fixed!');
    console.log(`New precedence: ${updateResponse.data.result.precedence}`);
    console.log('🎯 DNS rule should now be position #1 (tied with HTTP rule)');
    
  } catch (error) {
    console.error('❌ Failed to fix DNS rule position:', error.response?.data || error.message);
    process.exit(1);
  }
}

fixDnsCriticalPosition();
