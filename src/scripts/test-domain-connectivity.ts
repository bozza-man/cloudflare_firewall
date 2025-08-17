#!/usr/bin/env npx tsx

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

const DOMAINS_TO_TEST = [
  'configuration.apple.com.akadns.net',
  'bozza.au',
  'cdns.grindr.com',
  'gs-loc.ls-apple.com.akadns.net',
  'wallet.cdn-apple.com',
  'xp.itunes-apple.com.akadns.net',
  'metrics.icloud.com',
  'mqtt.crealitycloud.com',
  'gcs-blue-upload-us.l.googleusercontent.com',
  'gcs-blue-download-us.l.googleusercontent.com',
  'gdmf.v.aaplimg.com',
  'p69-contacts.icloud.com',
  'p143-contacts.icloud.com',
  'ausyd2.icloud-content.com'
];

interface ConnectivityTest {
  domain: string;
  dnsResolution: {
    success: boolean;
    ips: string[];
    error?: string;
  };
  httpCheck: {
    success: boolean;
    statusCode?: number;
    error?: string;
  };
  httpsCheck: {
    success: boolean;
    statusCode?: number;
    error?: string;
  };
  pingTest: {
    success: boolean;
    avgTime?: string;
    error?: string;
  };
}

async function testDNSResolution(domain: string): Promise<ConnectivityTest['dnsResolution']> {
  try {
    const { stdout } = await execAsync(`nslookup ${domain}`, { timeout: 5000 });
    
    // Extract IP addresses from nslookup output
    const ipMatches = stdout.match(/Address: (\d+\.\d+\.\d+\.\d+)/g);
    const ips = ipMatches ? ipMatches.map(match => match.replace('Address: ', '')) : [];
    
    if (ips.length > 0) {
      return { success: true, ips };
    } else {
      return { success: false, ips: [], error: 'No IP addresses found' };
    }
  } catch (error) {
    return { 
      success: false, 
      ips: [], 
      error: error instanceof Error ? error.message : 'DNS lookup failed' 
    };
  }
}

async function testHTTP(domain: string): Promise<ConnectivityTest['httpCheck']> {
  try {
    const { stdout } = await execAsync(`curl -I -m 5 -s http://${domain}`, { timeout: 8000 });
    
    // Extract status code
    const statusMatch = stdout.match(/HTTP\/\d+\.\d+ (\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;
    
    return { success: true, statusCode };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'HTTP request failed' 
    };
  }
}

async function testHTTPS(domain: string): Promise<ConnectivityTest['httpsCheck']> {
  try {
    const { stdout } = await execAsync(`curl -I -m 5 -s -k https://${domain}`, { timeout: 8000 });
    
    // Extract status code
    const statusMatch = stdout.match(/HTTP\/\d+\.\d+ (\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : undefined;
    
    return { success: true, statusCode };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'HTTPS request failed' 
    };
  }
}

async function testPing(domain: string): Promise<ConnectivityTest['pingTest']> {
  try {
    const { stdout } = await execAsync(`ping -c 3 -W 2000 ${domain}`, { timeout: 8000 });
    
    // Extract average time from ping output
    const avgMatch = stdout.match(/avg = ([\d.]+)/);
    const avgTime = avgMatch ? avgMatch[1] + 'ms' : undefined;
    
    return { success: true, avgTime };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Ping failed' 
    };
  }
}

async function testDomainConnectivity(domain: string): Promise<ConnectivityTest> {
  console.log(chalk.cyan(`🔍 Testing connectivity for ${domain}...`));
  
  const [dnsResult, httpResult, httpsResult, pingResult] = await Promise.all([
    testDNSResolution(domain),
    testHTTP(domain),
    testHTTPS(domain),
    testPing(domain)
  ]);
  
  return {
    domain,
    dnsResolution: dnsResult,
    httpCheck: httpResult,
    httpsCheck: httpsResult,
    pingTest: pingResult
  };
}

function displayConnectivityResult(test: ConnectivityTest): void {
  console.log(chalk.yellow(`\n📊 Connectivity Report: ${test.domain}`));
  console.log('─'.repeat(70));
  
  // DNS Resolution
  const dnsIcon = test.dnsResolution.success ? '✅' : '❌';
  console.log(`   ${dnsIcon} DNS Resolution: ${test.dnsResolution.success ? 'SUCCESS' : 'FAILED'}`);
  if (test.dnsResolution.success) {
    console.log(`      IPs: ${test.dnsResolution.ips.join(', ')}`);
  } else {
    console.log(`      Error: ${test.dnsResolution.error}`);
  }
  
  // HTTP Check
  const httpIcon = test.httpCheck.success ? '✅' : '❌';
  console.log(`   ${httpIcon} HTTP (80): ${test.httpCheck.success ? 'SUCCESS' : 'FAILED'}`);
  if (test.httpCheck.success && test.httpCheck.statusCode) {
    const statusColor = test.httpCheck.statusCode < 400 ? chalk.green : chalk.red;
    console.log(`      Status: ${statusColor(test.httpCheck.statusCode.toString())}`);
  } else if (test.httpCheck.error) {
    console.log(`      Error: ${test.httpCheck.error}`);
  }
  
  // HTTPS Check
  const httpsIcon = test.httpsCheck.success ? '✅' : '❌';
  console.log(`   ${httpsIcon} HTTPS (443): ${test.httpsCheck.success ? 'SUCCESS' : 'FAILED'}`);
  if (test.httpsCheck.success && test.httpsCheck.statusCode) {
    const statusColor = test.httpsCheck.statusCode < 400 ? chalk.green : chalk.red;
    console.log(`      Status: ${statusColor(test.httpsCheck.statusCode.toString())}`);
  } else if (test.httpsCheck.error) {
    console.log(`      Error: ${test.httpsCheck.error}`);
  }
  
  // Ping Test
  const pingIcon = test.pingTest.success ? '✅' : '❌';
  console.log(`   ${pingIcon} Ping: ${test.pingTest.success ? 'SUCCESS' : 'FAILED'}`);
  if (test.pingTest.success && test.pingTest.avgTime) {
    console.log(`      Avg Time: ${test.pingTest.avgTime}`);
  } else if (test.pingTest.error) {
    console.log(`      Error: ${test.pingTest.error}`);
  }
}

async function testAllDomains(): Promise<void> {
  console.log(chalk.cyan.bold('🌐 Domain Connectivity Analysis'));
  console.log(chalk.blue('Testing DNS, HTTP, HTTPS, and ping connectivity...'));
  console.log('═'.repeat(80));
  
  const results: ConnectivityTest[] = [];
  const successful: ConnectivityTest[] = [];
  const problematic: ConnectivityTest[] = [];
  
  // Test domains in batches to avoid overwhelming the network
  const batchSize = 4;
  for (let i = 0; i < DOMAINS_TO_TEST.length; i += batchSize) {
    const batch = DOMAINS_TO_TEST.slice(i, i + batchSize);
    const batchPromises = batch.map(domain => testDomainConnectivity(domain));
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Display results as we get them
    for (const result of batchResults) {
      displayConnectivityResult(result);
      
      // Categorize results
      const hasBasicConnectivity = result.dnsResolution.success || result.pingTest.success;
      if (hasBasicConnectivity) {
        successful.push(result);
      } else {
        problematic.push(result);
      }
    }
    
    // Small delay between batches
    if (i + batchSize < DOMAINS_TO_TEST.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  console.log(chalk.cyan.bold('\n📈 Connectivity Summary'));
  console.log('═'.repeat(80));
  
  console.log(`${chalk.green('✅ Domains with connectivity:')} ${successful.length}`);
  console.log(`${chalk.red('❌ Domains with issues:')} ${problematic.length}`);
  
  // Analyze patterns
  const dnsFailures = results.filter(r => !r.dnsResolution.success).length;
  const httpFailures = results.filter(r => !r.httpCheck.success).length;
  const httpsFailures = results.filter(r => !r.httpsCheck.success).length;
  const pingFailures = results.filter(r => !r.pingTest.success).length;
  
  console.log(chalk.blue('\n🔍 Failure Analysis:'));
  console.log(`   DNS Resolution Failures: ${dnsFailures}/${results.length}`);
  console.log(`   HTTP Connection Failures: ${httpFailures}/${results.length}`);
  console.log(`   HTTPS Connection Failures: ${httpsFailures}/${results.length}`);
  console.log(`   Ping Failures: ${pingFailures}/${results.length}`);
  
  // Diagnosis
  console.log(chalk.yellow('\n💡 Potential Issues:'));
  
  if (dnsFailures > results.length * 0.5) {
    console.log('   🚨 High DNS failure rate suggests network or DNS configuration issues');
  }
  
  if (httpsFailures === results.length && httpFailures < results.length) {
    console.log('   🔒 All HTTPS failures but some HTTP success suggests SSL/TLS issues');
  }
  
  if (pingFailures > results.length * 0.7) {
    console.log('   🌐 High ping failure rate suggests network connectivity issues');
  }
  
  if (httpsFailures === results.length) {
    console.log('   🔐 Universal HTTPS failures suggest:');
    console.log('      • Cloudflare Gateway blocking HTTPS traffic');
    console.log('      • Local firewall/security software interference');
    console.log('      • DNS over HTTPS (DoH) conflicts');
    console.log('      • Certificate validation issues');
  }
  
  console.log(chalk.cyan('\n🛠️  Recommended Next Steps:'));
  console.log('   1. Check Cloudflare Gateway rules for HTTPS blocking');
  console.log('   2. Verify DNS configuration (especially DoH settings)');
  console.log('   3. Test with a few known-good domains (google.com, apple.com)');
  console.log('   4. Check local security software (antivirus, firewall)');
  console.log('   5. Try from a different network to isolate the issue');
}

testAllDomains().catch(console.error);
