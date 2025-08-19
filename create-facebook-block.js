const axios = require('axios');

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

async function createBlockRule() {
  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`,
      {
        name: "Block Facebook and Instagram",
        description: "Block all Facebook and Instagram domains",
        action: "block",
        enabled: true,
        filters: ["dns"],
        traffic: 'any(dns.domains[*] in {"facebook.com" "www.facebook.com" "m.facebook.com" "fb.com" "fbcdn.net" "facebook.net" "instagram.com" "www.instagram.com" "cdninstagram.com"})',
        precedence: 1000,
        rule_settings: {
          block_page_enabled: true,
          block_reason: "Social media sites are blocked by company policy"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Rule created successfully:', response.data.result);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

createBlockRule();
