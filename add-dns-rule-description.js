// Add a protective description to the DNS blocking rule
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const RULE_ID = '0519eb6f-0e60-4713-8213-19da74e501f9';

const PROTECTIVE_DESCRIPTION = '⚠️ CRITICAL: This rule MUST always be the LAST rule (highest precedence) to function as a catch-all DNS blocker. DO NOT move this rule or DNS filtering will break. Blocks all DNS queries not explicitly allowed by other rules.';

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

async function addProtectiveDescription() {
  try {
    console.log('📝 Adding protective description to DNS blocking rule...');
    
    // First, get the current rule
    console.log('📋 Fetching current rule details...');
    const getCurrentRule = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules/${RULE_ID}`);
    const currentRule = getCurrentRule.data.result;
    
    console.log(`Current rule: ${currentRule.name}`);
    console.log(`Current description: ${currentRule.description || '(none)'}`);
    console.log(`Current precedence: ${currentRule.precedence}`);
    
    // Update with the protective description
    console.log('🛡️ Adding protective description...');
    
    const updatePayload = {
      name: currentRule.name,
      description: PROTECTIVE_DESCRIPTION,
      action: currentRule.action,
      enabled: currentRule.enabled,
      filters: currentRule.filters,
      traffic: currentRule.traffic,
      precedence: currentRule.precedence,
      identity: currentRule.identity || '',
      device_posture: currentRule.device_posture || '',
      rule_settings: currentRule.rule_settings || {}
    };
    
    const updateResponse = await api.put(
      `/accounts/${ACCOUNT_ID}/gateway/rules/${RULE_ID}`,
      updatePayload
    );
    
    const updatedRule = updateResponse.data.result;
    
    console.log('✅ Successfully added protective description!');
    console.log(`Updated description: ${updatedRule.description}`);
    console.log('🔒 Rule is now clearly marked as critical and protected');
    
  } catch (error) {
    console.error('❌ Failed to update rule description:', error.response?.data || error.message);
    process.exit(1);
  }
}

addProtectiveDescription();
