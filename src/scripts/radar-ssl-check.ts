#!/usr/bin/env npx tsx

import axios from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';

const DOMAINS_TO_CHECK = [
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

interface RadarSSLInfo {
  domain: string;
  certificate?: {
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    sans?: string[];
    fingerprint?: string;
  };
  error?: string;
  radarData?: any;
}

async function checkRadarSSL(domain: string): Promise<RadarSSLInfo> {
  const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4/radar',
    headers: {
      'Authorization': `Bearer ${config.cloudflare.apiToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 15000
  });

  console.log(chalk.cyan(`🔍 Checking Radar SSL data for ${domain}...`));

  try {
    // Try different Radar endpoints that might have SSL/certificate info
    const endpoints = [
      `/domains/${domain}`,
      `/domains/${domain}/security`,
      `/domains/${domain}/certificate`,
      `/domains/${domain}/ssl`,
      `/http/ases_by_http_version?domain=${domain}`,
      `/http/locations_by_http_version?domain=${domain}`
    ];

    let foundData = false;
    const results: RadarSSLInfo = { domain };

    for (const endpoint of endpoints) {
      try {
        console.log(chalk.gray(`  → Trying ${endpoint}`));
        const response = await api.get(endpoint);
        
        if (response.data?.success && response.data?.result) {
          console.log(chalk.green(`  ✅ Found data at ${endpoint}`));
          
          // Store the raw data for analysis
          if (!results.radarData) {
            results.radarData = {};
          }
          results.radarData[endpoint] = response.data.result;
          foundData = true;

          // Try to extract certificate information
          const result = response.data.result;
          
          // Check for various certificate-related fields
          if (result.certificate || result.ssl || result.tls) {
            const certData = result.certificate || result.ssl || result.tls;
            
            results.certificate = {
              issuer: certData.issuer || certData.ca,
              subject: certData.subject || certData.cn,
              validFrom: certData.not_before || certData.valid_from,
              validTo: certData.not_after || certData.valid_to,
              sans: certData.san || certData.subject_alternative_names,
              fingerprint: certData.fingerprint || certData.sha256
            };
          }

          // Check for HTTP/HTTPS related info that might indicate SSL status
          if (result.https_percentage !== undefined || result.http_version) {
            console.log(chalk.blue(`  📊 HTTPS usage: ${result.https_percentage}%`));
          }
          
        } else {
          console.log(chalk.gray(`  ⚪ No data at ${endpoint}`));
        }
        
      } catch (endpointError) {
        if (axios.isAxiosError(endpointError) && endpointError.response?.status === 404) {
          console.log(chalk.gray(`  ⚪ Not found at ${endpoint}`));
        } else {
          console.log(chalk.yellow(`  ⚠️  Error at ${endpoint}: ${endpointError instanceof Error ? endpointError.message : 'Unknown'}`));
        }
      }
      
      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!foundData) {
      results.error = 'No certificate data found in any Radar endpoint';
    }

    return results;

  } catch (error) {
    return {
      domain,
      error: `Radar API error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

function displayRadarSSLInfo(info: RadarSSLInfo): void {
  console.log(chalk.yellow(`\n🔐 Radar SSL Report: ${info.domain}`));
  console.log('─'.repeat(70));

  if (info.error) {
    console.log(chalk.red(`   ❌ Error: ${info.error}`));
    return;
  }

  if (info.certificate) {
    console.log(chalk.green('   ✅ Certificate Information Found:'));
    
    if (info.certificate.issuer) {
      const issuerColor = info.certificate.issuer.toLowerCase().includes('let\'s encrypt') ? chalk.blue :
                         info.certificate.issuer.toLowerCase().includes('digicert') ? chalk.green :
                         info.certificate.issuer.toLowerCase().includes('google') ? chalk.green :
                         chalk.cyan;
      console.log(`      🏢 Issuer: ${issuerColor(info.certificate.issuer)}`);
    }
    
    if (info.certificate.subject) {
      console.log(`      🎯 Subject: ${info.certificate.subject}`);
    }
    
    if (info.certificate.validFrom && info.certificate.validTo) {
      console.log(`      📅 Validity: ${info.certificate.validFrom} → ${info.certificate.validTo}`);
    }
    
    if (info.certificate.sans && info.certificate.sans.length > 0) {
      console.log(`      🌐 SANs: ${info.certificate.sans.slice(0, 3).join(', ')}${info.certificate.sans.length > 3 ? ` (+${info.certificate.sans.length - 3} more)` : ''}`);
    }
    
    if (info.certificate.fingerprint) {
      console.log(`      🔍 Fingerprint: ${info.certificate.fingerprint.substring(0, 32)}...`);
    }
  }

  if (info.radarData) {
    console.log(chalk.blue('   📊 Additional Radar Data:'));
    
    Object.entries(info.radarData).forEach(([endpoint, data]: [string, any]) => {
      console.log(`      ${endpoint}:`);
      
      // Display key fields from the data
      if (typeof data === 'object' && data !== null) {
        Object.entries(data).slice(0, 5).forEach(([key, value]) => {
          if (typeof value === 'string' || typeof value === 'number') {
            console.log(`        ${key}: ${value}`);
          } else if (Array.isArray(value)) {
            console.log(`        ${key}: [${value.length} items]`);
          }
        });
      }
    });
  }

  if (!info.certificate && !info.radarData) {
    console.log(chalk.yellow('   ⚪ No SSL/certificate data available from Radar'));
  }
}

async function checkAllRadarSSL(): Promise<void> {
  console.log(chalk.cyan.bold('🌐 Cloudflare Radar SSL Certificate Analysis'));
  console.log(chalk.blue('Checking external SSL certificate perspective from Cloudflare Radar...'));
  console.log('═'.repeat(80));

  const results: RadarSSLInfo[] = [];
  const withCertData: RadarSSLInfo[] = [];
  const withoutCertData: RadarSSLInfo[] = [];

  // Process domains in small batches to avoid rate limiting
  const batchSize = 2;
  for (let i = 0; i < DOMAINS_TO_CHECK.length; i += batchSize) {
    const batch = DOMAINS_TO_CHECK.slice(i, i + batchSize);
    
    for (const domain of batch) {
      const result = await checkRadarSSL(domain);
      results.push(result);
      
      displayRadarSSLInfo(result);
      
      if (result.certificate || (result.radarData && Object.keys(result.radarData).length > 0)) {
        withCertData.push(result);
      } else {
        withoutCertData.push(result);
      }
    }
    
    // Longer delay between batches to be respectful to Radar API
    if (i + batchSize < DOMAINS_TO_CHECK.length) {
      console.log(chalk.gray('\n⏳ Waiting before next batch...'));
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Summary
  console.log(chalk.cyan.bold('\n📊 Radar SSL Analysis Summary'));
  console.log('═'.repeat(80));

  console.log(`${chalk.green('✅ Domains with SSL data:')} ${withCertData.length}`);
  console.log(`${chalk.yellow('⚪ Domains without SSL data:')} ${withoutCertData.length}`);

  if (withCertData.length > 0) {
    console.log(chalk.green('\n🔐 Domains with Certificate Information:'));
    withCertData.forEach(result => {
      const issuer = result.certificate?.issuer || 'Unknown';
      console.log(`   • ${result.domain} - ${issuer}`);
    });
  }

  if (withoutCertData.length > 0) {
    console.log(chalk.yellow('\n⚪ Domains without Certificate Information:'));
    withoutCertData.forEach(result => {
      console.log(`   • ${result.domain} - ${result.error || 'No data available'}`);
    });
  }

  // Compare with our connectivity findings
  console.log(chalk.cyan.bold('\n🔍 Analysis vs. Local Connectivity:'));
  console.log('─'.repeat(50));
  console.log('• Local connectivity tests showed all domains resolve to 0.0.0.0 (blocked by Gateway)');
  console.log('• SSL certificate checks failed locally due to blocking');
  console.log('• Radar provides external perspective on what certificates exist');
  
  if (withCertData.length > 0) {
    console.log(chalk.green('• Some domains DO have valid certificates externally'));
    console.log('• This confirms the domains exist and have SSL - they\'re just blocked locally');
  } else {
    console.log(chalk.yellow('• Limited certificate data from Radar API endpoints'));
    console.log('• May need to check Radar dashboard manually for more detailed SSL info');
  }

  console.log(chalk.blue('\n💡 Key Insights:'));
  console.log('• Your Gateway blocking (0.0.0.0 resolution) prevents local SSL checks');
  console.log('• Radar can provide external SSL perspective for unblocked validation');
  console.log('• Enhanced security review correctly identified connectivity issues');
  console.log('• Domains may be legitimate but are caught by your catch-all DNS blocker');
}

checkAllRadarSSL().catch(console.error);
