import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

async function createBlockRule() {
  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`,
      {
        name: "Block Facebook and Instagram Sites",
        description: "Block all Facebook and Instagram domains",
        action: "block",
        enabled: true,
        filters: ["dns"],
        traffic: 'any(dns.domains[*] in {"facebook.com" "www.facebook.com" "m.facebook.com" "fb.com" "fbcdn.net" "facebook.net" "instagram.com" "www.instagram.com" "cdninstagram.com"})',
        precedence: 999,
        rule_settings: {
          block_page_enabled: true,
          block_reason: "Social media sites are blocked"
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Rule created successfully!');
    console.log('ID:', response.data.result.id);
    console.log('Name:', response.data.result.name);
    console.log('Action:', response.data.result.action);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

createBlockRule();
