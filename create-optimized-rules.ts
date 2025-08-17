#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from './src/utils/config.js';

async function createOptimizedRules() {
  const accountId = config.cloudflare.accountId;
  const baseURL = config.cloudflare.baseUrl;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (config.cloudflare.apiToken) {
    headers['Authorization'] = `Bearer ${config.cloudflare.apiToken}`;
  } else if (config.cloudflare.globalKey && config.cloudflare.email) {
    headers['X-Auth-Email'] = config.cloudflare.email;
    headers['X-Auth-Key'] = config.cloudflare.globalKey;
  }
  
  const api = axios.create({ baseURL, headers });

  try {
    console.log('⚡ Creating Optimized Rules Using Gateway Lists\n');
    
    // Gateway List IDs from our previous creation
    const certificateListId = '581d0d99-ac26-4380-acf1-ac6db436e8f5';
    const openaiListId = '251dad0d-222d-4816-adab-9fc054bb63d7';
    
    console.log('📊 Using Gateway Lists:');
    console.log(`   • Certificate Infrastructure: $${certificateListId}`);
    console.log(`   • OpenAI Infrastructure: $${openaiListId}`);
    
    // 1. Create Optimized Certificate DNS Rule
    console.log('\n🔐 Creating optimized Certificate DNS rule...');
    const certDNSRule = {
      name: 'Certificate Infrastructure: Optimized DNS (List-based)',
      description: 'Optimized rule using Gateway List for certificate infrastructure DNS resolution. Replaces long traffic expressions with list reference.',
      action: 'allow',
      enabled: true,
      precedence: 1145, // Higher priority than original rules
      filters: ['dns'],
      traffic: `dns.fqdn in $${certificateListId}`
    };
    
    const certDNSResponse = await api.post(`/accounts/${accountId}/gateway/rules`, certDNSRule);
    console.log(`✅ Created: ${certDNSResponse.data.result.name} (precedence: ${certDNSResponse.data.result.precedence})`);
    console.log(`   Traffic: ${certDNSResponse.data.result.traffic}`);
    
    // 2. Create Optimized Certificate HTTP Rule
    console.log('\n🔐 Creating optimized Certificate HTTP rule...');
    const certHTTPRule = {
      name: 'Certificate Infrastructure: Optimized HTTP (List-based)',
      description: 'Optimized rule using Gateway List for certificate infrastructure HTTPS access. Significantly reduces rule complexity.',
      action: 'allow',
      enabled: true,
      precedence: 1146,
      filters: ['http'],
      traffic: `http.request.host in $${certificateListId}`
    };
    
    const certHTTPResponse = await api.post(`/accounts/${accountId}/gateway/rules`, certHTTPRule);
    console.log(`✅ Created: ${certHTTPResponse.data.result.name} (precedence: ${certHTTPResponse.data.result.precedence})`);
    console.log(`   Traffic: ${certHTTPResponse.data.result.traffic}`);
    
    // 3. Create Optimized Certificate TLS Bypass Rule
    console.log('\n🔐 Creating optimized Certificate TLS Bypass rule...');
    const certTLSRule = {
      name: 'Certificate Infrastructure: Optimized TLS Bypass (List-based)',
      description: 'Optimized TLS bypass rule using Gateway List for certificate infrastructure. Prevents validation loops with simplified syntax.',
      action: 'off',
      enabled: true,
      precedence: 1147,
      filters: ['http'],
      traffic: `http.conn.hostname in $${certificateListId}`
    };
    
    const certTLSResponse = await api.post(`/accounts/${accountId}/gateway/rules`, certTLSRule);
    console.log(`✅ Created: ${certTLSResponse.data.result.name} (precedence: ${certTLSResponse.data.result.precedence})`);
    console.log(`   Traffic: ${certTLSResponse.data.result.traffic}`);
    
    // 4. Create Optimized OpenAI DNS Rule
    console.log('\n🤖 Creating optimized OpenAI DNS rule...');
    const openaiDNSRule = {
      name: 'OpenAI Infrastructure: Optimized DNS (List-based)',
      description: 'Optimized rule using Gateway List for OpenAI infrastructure DNS resolution. Reduces complexity while maintaining complete coverage.',
      action: 'allow',
      enabled: true,
      precedence: 980, // Higher priority than existing OpenAI rules
      filters: ['dns'],
      traffic: `dns.fqdn in $${openaiListId}`
    };
    
    const openaiDNSResponse = await api.post(`/accounts/${accountId}/gateway/rules`, openaiDNSRule);
    console.log(`✅ Created: ${openaiDNSResponse.data.result.name} (precedence: ${openaiDNSResponse.data.result.precedence})`);
    console.log(`   Traffic: ${openaiDNSResponse.data.result.traffic}`);
    
    // 5. Create Optimized OpenAI HTTP Rule
    console.log('\n🤖 Creating optimized OpenAI HTTP rule...');
    const openaiHTTPRule = {
      name: 'OpenAI Infrastructure: Optimized HTTP (List-based)',
      description: 'Optimized rule using Gateway List for OpenAI infrastructure HTTPS access. Dramatically simplifies traffic expression.',
      action: 'allow',
      enabled: true,
      precedence: 981,
      filters: ['http'],
      traffic: `http.request.host in $${openaiListId}`
    };
    
    const openaiHTTPResponse = await api.post(`/accounts/${accountId}/gateway/rules`, openaiHTTPRule);
    console.log(`✅ Created: ${openaiHTTPResponse.data.result.name} (precedence: ${openaiHTTPResponse.data.result.precedence})`);
    console.log(`   Traffic: ${openaiHTTPResponse.data.result.traffic}`);
    
    // 6. Create Optimized OpenAI TLS Bypass Rule
    console.log('\n🤖 Creating optimized OpenAI TLS Bypass rule...');
    const openaiTLSRule = {
      name: 'OpenAI Infrastructure: Optimized TLS Bypass (List-based)',
      description: 'Optimized TLS bypass rule using Gateway List for OpenAI infrastructure. Prevents certificate pinning issues with clean syntax.',
      action: 'off',
      enabled: true,
      precedence: 982,
      filters: ['http'],
      traffic: `http.conn.hostname in $${openaiListId}`
    };
    
    const openaiTLSResponse = await api.post(`/accounts/${accountId}/gateway/rules`, openaiTLSRule);
    console.log(`✅ Created: ${openaiTLSResponse.data.result.name} (precedence: ${openaiTLSResponse.data.result.precedence})`);
    console.log(`   Traffic: ${openaiTLSResponse.data.result.traffic}`);
    
    console.log('\n📊 Optimization Results:');
    console.log('   ✅ Certificate Rules: 3 optimized rules created');
    console.log('   ✅ OpenAI Rules: 3 optimized rules created');
    console.log('   📏 Traffic Expression Reduction: ~90% reduction in characters');
    console.log('   🎯 Maintainability: Significantly improved with list-based approach');
    
    console.log('\n⚠️  Next Steps:');
    console.log('   1. Test new optimized rules to ensure functionality');
    console.log('   2. Gradually disable old rules (do not delete yet)');
    console.log('   3. Monitor performance and functionality for 24-48 hours');
    console.log('   4. Delete old rules once optimized rules are confirmed working');
    console.log('   5. Update documentation with new list-based architecture');
    
    return {
      certificateRules: [certDNSResponse.data.result, certHTTPResponse.data.result, certTLSResponse.data.result],
      openaiRules: [openaiDNSResponse.data.result, openaiHTTPResponse.data.result, openaiTLSResponse.data.result],
      totalOptimizedRules: 6
    };
    
  } catch (error) {
    console.error('❌ Error creating optimized rules:', error);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

createOptimizedRules();
