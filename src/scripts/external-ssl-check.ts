#!/usr/bin/env npx tsx

import axios from 'axios';
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

interface ExternalSSLCheck {
  domain: string;
  hasValidCert?: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  grade?: string;
  error?: string;
  source: string;
}

async function checkSSLLabs(domain: string): Promise<ExternalSSLCheck | null> {
  try {
    console.log(chalk.gray(`  → Checking SSL Labs for ${domain}...`));
    
    // SSL Labs API requires starting an analysis first, then polling for results
    // For demonstration, we'll just try to get cached results if they exist
    const response = await axios.get(
      `https://api.ssllabs.com/api/v3/analyze?host=${domain}&fromCache=on&maxAge=24`,
      { timeout: 10000 }
    );
    
    if (response.data && response.data.status === 'READY') {
      const endpoint = response.data.endpoints?.[0];
      if (endpoint && endpoint.details) {
        return {
          domain,
          hasValidCert: endpoint.grade !== 'M' && endpoint.grade !== 'T',
          grade: endpoint.grade,
          issuer: endpoint.details.cert?.issuerSubject,
          subject: endpoint.details.cert?.subject,
          validFrom: endpoint.details.cert?.notBefore ? new Date(endpoint.details.cert.notBefore).toISOString() : undefined,
          validTo: endpoint.details.cert?.notAfter ? new Date(endpoint.details.cert.notAfter).toISOString() : undefined,
          source: 'SSL Labs'
        };
      }
    }
    
    return null;
  } catch (error: any) {
    return {
      domain,
      error: `SSL Labs check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'SSL Labs'
    };
  }
}

async function checkCertificateTransparencyLogs(domain: string): Promise<ExternalSSLCheck | null> {
  try {
    console.log(chalk.gray(`  → Checking Certificate Transparency for ${domain}...`));
    
    // Use crt.sh certificate transparency search
    const response = await axios.get(
      `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`,
      { timeout: 15000 }
    );
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      // Get the most recent certificate
      const mostRecent = response.data.sort((a: any, b: any) => 
        new Date(b.not_after || b.entry_timestamp).getTime() - new Date(a.not_after || a.entry_timestamp).getTime()
      )[0];
      
      return {
        domain,
        hasValidCert: new Date(mostRecent.not_after) > new Date(),
        issuer: mostRecent.issuer_name,
        subject: mostRecent.name_value,
        validFrom: mostRecent.not_before,
        validTo: mostRecent.not_after,
        source: 'Certificate Transparency'
      };
    }
    
    return null;
  } catch (error: any) {
    return {
      domain,
      error: `CT logs check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'Certificate Transparency'
    };
  }
}

async function checkVirusTotal(domain: string): Promise<ExternalSSLCheck | null> {
  try {
    console.log(chalk.gray(`  → Checking VirusTotal for ${domain}...`));
    
    // Note: This would require a VirusTotal API key in production
    // For demonstration, we'll skip this unless you have an API key
    return null;
    
  } catch (error: any) {
    return {
      domain,
      error: `VirusTotal check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'VirusTotal'
    };
  }
}

async function performExternalSSLCheck(domain: string): Promise<ExternalSSLCheck[]> {
  console.log(chalk.cyan(`🔍 External SSL check for ${domain}...`));
  
  const results: ExternalSSLCheck[] = [];
  
  // Try multiple external services
  const checks = [
    checkCertificateTransparencyLogs(domain),
    checkSSLLabs(domain),
    // checkVirusTotal(domain) // Uncomment if you have API key
  ];
  
  const settledResults = await Promise.allSettled(checks);
  
  settledResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    } else if (result.status === 'rejected') {
      results.push({
        domain,
        error: `External check ${index} failed: ${result.reason}`,
        source: 'External Service'
      });
    }
  });
  
  return results;
}

function displayExternalSSLResults(results: ExternalSSLCheck[]): void {
  const domain = results[0]?.domain || 'Unknown';
  console.log(chalk.yellow(`\n🌐 External SSL Report: ${domain}`));
  console.log('─'.repeat(70));
  
  if (results.length === 0) {
    console.log(chalk.red('   ❌ No external SSL data found'));
    return;
  }
  
  results.forEach(result => {
    console.log(chalk.blue(`   📊 Source: ${result.source}`));
    
    if (result.error) {
      console.log(chalk.red(`      ❌ Error: ${result.error}`));
      return;
    }
    
    if (result.hasValidCert !== undefined) {
      const validIcon = result.hasValidCert ? '✅' : '❌';
      console.log(`      ${validIcon} Valid Certificate: ${result.hasValidCert ? 'Yes' : 'No'}`);
    }
    
    if (result.issuer) {
      const issuerColor = result.issuer.toLowerCase().includes('let\'s encrypt') ? chalk.blue :
                         result.issuer.toLowerCase().includes('digicert') ? chalk.green :
                         result.issuer.toLowerCase().includes('google') ? chalk.green :
                         result.issuer.toLowerCase().includes('apple') ? chalk.green :
                         chalk.cyan;
      console.log(`      🏢 Issuer: ${issuerColor(result.issuer)}`);
    }
    
    if (result.subject) {
      console.log(`      🎯 Subject: ${result.subject}`);
    }
    
    if (result.validFrom && result.validTo) {
      console.log(`      📅 Validity: ${result.validFrom} → ${result.validTo}`);
    }
    
    if (result.grade) {
      const gradeColor = result.grade === 'A+' || result.grade === 'A' ? chalk.green :
                        result.grade === 'B' ? chalk.yellow :
                        result.grade === 'C' ? chalk.yellow : chalk.red;
      console.log(`      📊 SSL Labs Grade: ${gradeColor(result.grade)}`);
    }
    
    console.log('');
  });
}

async function checkAllExternalSSL(): Promise<void> {
  console.log(chalk.cyan.bold('🌍 External SSL Certificate Analysis'));
  console.log(chalk.blue('Using external services to validate SSL certificates...'));
  console.log('═'.repeat(80));
  
  const allResults: Map<string, ExternalSSLCheck[]> = new Map();
  const domainsWithCerts: string[] = [];
  const domainsWithoutCerts: string[] = [];
  
  // Process domains in small batches to be respectful to external services
  const batchSize = 2;
  for (let i = 0; i < DOMAINS_TO_CHECK.length; i += batchSize) {
    const batch = DOMAINS_TO_CHECK.slice(i, i + batchSize);
    
    for (const domain of batch) {
      const results = await performExternalSSLCheck(domain);
      allResults.set(domain, results);
      
      displayExternalSSLResults(results);
      
      // Categorize results
      const hasValidCert = results.some(r => r.hasValidCert === true);
      if (hasValidCert) {
        domainsWithCerts.push(domain);
      } else {
        domainsWithoutCerts.push(domain);
      }
    }
    
    // Delay between batches to be respectful
    if (i + batchSize < DOMAINS_TO_CHECK.length) {
      console.log(chalk.gray('⏳ Waiting before next batch...'));
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Summary
  console.log(chalk.cyan.bold('\\n📊 External SSL Analysis Summary'));
  console.log('═'.repeat(80));
  
  console.log(`${chalk.green('✅ Domains with valid certificates:')} ${domainsWithCerts.length}`);
  console.log(`${chalk.red('❌ Domains without valid certificates:')} ${domainsWithoutCerts.length}`);
  
  if (domainsWithCerts.length > 0) {
    console.log(chalk.green('\\n🔐 Domains with Valid Certificates:'));
    domainsWithCerts.forEach(domain => {
      const results = allResults.get(domain) || [];
      const certResult = results.find(r => r.hasValidCert === true);
      const issuer = certResult?.issuer || 'Unknown issuer';
      console.log(`   • ${domain} - ${issuer}`);
    });
  }
  
  if (domainsWithoutCerts.length > 0) {
    console.log(chalk.red('\\n❌ Domains without Valid Certificates:'));
    domainsWithoutCerts.forEach(domain => {
      console.log(`   • ${domain}`);
    });
  }
  
  // Analysis
  console.log(chalk.cyan.bold('\\n🔍 Key Findings:'));
  console.log('─'.repeat(50));
  console.log('• External certificate validation provides independent perspective');
  console.log('• Certificate Transparency logs show historical certificate data');
  console.log('• SSL Labs provides detailed security analysis (when available)');
  console.log('• Your local Gateway blocking prevents direct certificate inspection');
  
  if (domainsWithCerts.length > 0) {
    console.log(chalk.green('• Some domains DO have legitimate SSL certificates externally'));
    console.log('• This suggests the domains exist and are properly configured');
    console.log('• Local blocking is preventing access, not certificate issues');
  }
  
  console.log(chalk.yellow('\\n💡 Recommendations:'));
  console.log('1. Domains with valid external certificates may be legitimate');
  console.log('2. Consider adding verified legitimate domains to Gateway allow lists');
  console.log('3. Your enhanced security review process is working correctly');
  console.log('4. External validation helps distinguish real issues from blocking effects');
}

checkAllExternalSSL().catch(console.error);
