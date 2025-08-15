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
const CRITICAL_HTTP_FILTER = `http.request.host in {${CRITICAL_DOMAINS.map(d => `"${d}"`).join(' ')}}`;\n\nconst CRITICAL_HTTP_RULE = {\n  name: 'CRITICAL INFRASTRUCTURE: Essential Services (HTTP)',\n  description: '🚨 CRITICAL INFRASTRUCTURE (HTTP): Companion to DNS rule. This rule MUST remain at LOW precedence (early evaluation) to ensure HTTP traffic to essential services always works. Contains same domains as DNS rule for complete coverage. DO NOT disable or move this rule.',\n  action: 'allow',\n  enabled: true,\n  filters: ['http'],\n  traffic: CRITICAL_HTTP_FILTER,\n  precedence: 501, // Just after the DNS rule\n  identity: '',\n  device_posture: '',\n  rule_settings: {}\n};\n\nif (!CLOUDFLARE_API_TOKEN || !ACCOUNT_ID) {\n  console.error('❌ Missing environment variables. Check .env file.');\n  process.exit(1);\n}\n\nconst api = axios.create({\n  baseURL: 'https://api.cloudflare.com/client/v4',\n  headers: {\n    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,\n    'Content-Type': 'application/json'\n  }\n});\n\nasync function createCriticalHttpRule() {\n  try {\n    console.log('🌐 Creating Critical Infrastructure HTTP allow rule...');\n    console.log(`📋 Including ${CRITICAL_DOMAINS.length} essential domains for HTTP traffic`);\n    \n    console.log('\\n🔧 This rule ensures HTTP/HTTPS traffic to critical services works');\n    console.log('• Warp.dev API calls');\n    console.log('• Anthropic/Claude API endpoints');\n    console.log('• Apple authentication and MDM services');\n    console.log('• Cloudflare dashboard and API');\n    console.log('• SimpleMDM management console');\n    console.log('• UniFi controller access');\n    console.log('• Microsoft authentication portals');\n    \n    // Create the rule\n    console.log('\\n⚙️ Creating HTTP rule with precedence 501 (high priority)...');\n    \n    const createResponse = await api.post(\n      `/accounts/${ACCOUNT_ID}/gateway/rules`,\n      CRITICAL_HTTP_RULE\n    );\n    \n    const createdRule = createResponse.data.result;\n    \n    console.log('\\n✅ Successfully created Critical Infrastructure HTTP rule!');\n    console.log(`Rule ID: ${createdRule.id}`);\n    console.log(`Name: ${createdRule.name}`);\n    console.log(`Precedence: ${createdRule.precedence} (High Priority)`);\n    console.log(`Action: ${createdRule.action.toUpperCase()}`);\n    console.log(`Status: ${createdRule.enabled ? 'ENABLED' : 'DISABLED'}`);\n    \n    console.log('\\n🛡️ Critical infrastructure now has complete DNS + HTTP coverage!');\n    console.log('🔒 Both DNS (500) and HTTP (501) rules protect essential services');\n    \n    return createdRule;\n    \n  } catch (error) {\n    console.error('❌ Failed to create critical HTTP rule:', error.response?.data || error.message);\n    process.exit(1);\n  }\n}\n\ncreateCriticalHttpRule();
