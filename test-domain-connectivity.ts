#!/usr/bin/env npx tsx

import { execSync } from 'child_process';

interface TestDomain {
  domain: string;
  category: string;
  expectedResult: 'allow' | 'block';
  description: string;
}

const testDomains: TestDomain[] = [
  // Should be allowed
  { domain: 'google.com', category: 'Search', expectedResult: 'allow', description: 'Major search engine' },
  { domain: 'github.com', category: 'Development', expectedResult: 'allow', description: 'Code repository' },
  { domain: 'apple.com', category: 'Apple Services', expectedResult: 'allow', description: 'Apple main site' },
  { domain: 'crt.sh', category: 'Certificate Transparency', expectedResult: 'allow', description: 'Certificate transparency log' },
  { domain: 'warp.dev', category: 'Development Tools', expectedResult: 'allow', description: 'Terminal application' },
  { domain: 'api.anthropic.com', category: 'AI Services', expectedResult: 'allow', description: 'Anthropic API' },
  { domain: 'simplemdm.com', category: 'MDM', expectedResult: 'allow', description: 'Device management' },
  { domain: 'slack.com', category: 'Communication', expectedResult: 'allow', description: 'Business communication' },
  
  // Should be blocked
  { domain: 'facebook.com', category: 'Social Media', expectedResult: 'block', description: 'Explicitly blocked social media' },
  { domain: 'instagram.com', category: 'Social Media', expectedResult: 'block', description: 'Explicitly blocked social media' },
  
  // Test certificate transparency services
  { domain: 'ocsp.digicert.com', category: 'Certificate Validation', expectedResult: 'allow', description: 'OCSP responder' },
  { domain: 'crl.letsencrypt.org', category: 'Certificate Validation', expectedResult: 'allow', description: 'Certificate revocation list' },
];

function testDNSResolution(domain: string): { success: boolean; ip?: string; error?: string } {
  try {
    const result = execSync(`dig +short ${domain} | grep -E '^[0-9]+\\.' | head -1`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && result !== '') {
      return { success: true, ip: result };
    } else {
      return { success: false, error: 'No IP returned' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function testHTTPS(domain: string): { success: boolean; statusCode?: number; error?: string } {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://${domain}`, { encoding: 'utf-8', timeout: 15000 }).trim();
    const statusCode = parseInt(result);
    if (statusCode >= 200 && statusCode < 400) {
      return { success: true, statusCode };
    } else if (statusCode >= 400) {
      return { success: false, statusCode, error: `HTTP ${statusCode}` };
    } else {
      return { success: false, error: 'Invalid response' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runConnectivityTests() {
  console.log('🌐 Comprehensive Domain Connectivity Test');
  console.log('=' .repeat(80));
  
  let passCount = 0;
  let failCount = 0;
  
  for (const testDomain of testDomains) {
    console.log(`\n🔍 Testing: ${testDomain.domain}`);
    console.log(`   Category: ${testDomain.category}`);
    console.log(`   Expected: ${testDomain.expectedResult.toUpperCase()}`);
    console.log(`   Description: ${testDomain.description}`);
    
    // Test DNS resolution
    const dnsResult = testDNSResolution(testDomain.domain);
    console.log(`   DNS: ${dnsResult.success ? `✅ ${dnsResult.ip}` : `❌ ${dnsResult.error}`}`);
    
    // Test HTTPS connectivity
    const httpsResult = testHTTPS(testDomain.domain);
    console.log(`   HTTPS: ${httpsResult.success ? `✅ ${httpsResult.statusCode}` : `❌ ${httpsResult.error}`}`);
    
    // Determine if test passed based on expectations
    const actuallyWorking = dnsResult.success && httpsResult.success;
    const testPassed = (testDomain.expectedResult === 'allow' && actuallyWorking) || 
                      (testDomain.expectedResult === 'block' && !actuallyWorking);
    
    console.log(`   Result: ${testPassed ? '✅ PASS' : '❌ FAIL'} - ${actuallyWorking ? 'ACCESSIBLE' : 'BLOCKED/FAILED'}`);
    
    if (testPassed) {
      passCount++;
    } else {
      failCount++;
      console.log(`   ⚠️  Expected ${testDomain.expectedResult} but domain is ${actuallyWorking ? 'accessible' : 'blocked/failed'}`);
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log(`📊 Test Results: ${passCount} passed, ${failCount} failed (${testDomains.length} total)`);
  console.log(`Success Rate: ${Math.round((passCount / testDomains.length) * 100)}%`);
  
  if (failCount > 0) {
    console.log('\n⚠️  Some tests failed. Review the Gateway rules for any conflicts or issues.');
  } else {
    console.log('\n🎉 All tests passed! Gateway rules are working correctly.');
  }
}

runConnectivityTests();
