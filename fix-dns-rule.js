// Simple approach - use the gateway API directly with axios
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const RULE_ID = '0519eb6f-0e60-4713-8213-19da74e501f9';
const TARGET_PRECEDENCE = 63000;

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

async function fixDnsBlockingRule() {
  try {
    console.log('🔧 Fixing DNS blocking rule precedence...');
    
    // First, get the current rule
    console.log('📋 Fetching current rule details...');
    const getCurrentRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${RULE_ID}`);
    const currentRule = getCurrentRule.data.result;
    
    console.log(`Current rule: ${currentRule.name}`);
    console.log(`Current precedence: ${currentRule.precedence}`);
    console.log(`Current action: ${currentRule.action}`);
    
    // Update with the same data but new precedence
    console.log(`🔄 Updating precedence to ${TARGET_PRECEDENCE}...`);
    
    const updatePayload = {
      name: currentRule.name,
      description: currentRule.description || '',
      action: currentRule.action,
      enabled: currentRule.enabled,
      filters: currentRule.filters,
      traffic: currentRule.traffic,
      precedence: TARGET_PRECEDENCE,
      identity: currentRule.identity || '',
      device_posture: currentRule.device_posture || '',
      rule_settings: currentRule.rule_settings || {}
    };
    
    const updateResponse = await api.put(
      `/accounts/${ACCOUNT_ID}/gateway/rules/${RULE_ID}`,
      updatePayload
    );
    
    const updatedRule = updateResponse.data.result;
    
    console.log('✅ Successfully updated DNS blocking rule!');
    console.log(`New precedence: ${updatedRule.precedence}`);
    console.log('🎯 DNS blocking rule is now positioned as the LAST rule (catch-all)');
    
  } catch (error) {
    console.error('❌ Failed to update rule:', error.response?.data || error.message);
    process.exit(1);
  }
}

fixDnsBlockingRule();
