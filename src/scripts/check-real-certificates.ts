#!/usr/bin/env npx tsx

import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

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

interface CertificateInfo {
  domain: string;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  sans?: string[];
  error?: string;
}

async function getCertificateInfo(domain: string): Promise<CertificateInfo> {
  try {
    console.log(chalk.cyan(`🔍 Checking certificate for ${domain}...`));
    
    // Use openssl to get certificate information
    const command = `echo | openssl s_client -connect ${domain}:443 -servername ${domain} -verify_return_error 2>/dev/null | openssl x509 -noout -text 2>/dev/null`;
    
    const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
    
    if (stderr && stderr.includes('error') || !stdout) {
      // Try alternative method with timeout
      const altCommand = `timeout 5s openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -issuer -subject -dates -ext subjectAltName 2>/dev/null`;
      
      try {
        const { stdout: altStdout } = await execAsync(altCommand, { timeout: 8000 });
        return parseAlternativeCertInfo(domain, altStdout);
      } catch (altError) {
        return {
          domain,
          error: `Connection failed: ${stderr || altError}`
        };
      }
    }
    
    return parseCertificateOutput(domain, stdout);
    
  } catch (error) {
    return {
      domain,
      error: `Failed to retrieve certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

function parseCertificateOutput(domain: string, output: string): CertificateInfo {
  const info: CertificateInfo = { domain };
  
  try {
    // Extract issuer
    const issuerMatch = output.match(/Issuer:.*?CN\s*=\s*([^,\n]+)/);
    if (issuerMatch) {
      info.issuer = issuerMatch[1].trim();
    }
    
    // Extract subject
    const subjectMatch = output.match(/Subject:.*?CN\s*=\s*([^,\n]+)/);
    if (subjectMatch) {
      info.subject = subjectMatch[1].trim();
    }
    
    // Extract validity dates
    const notBeforeMatch = output.match(/Not Before\s*:\s*(.+)/);
    const notAfterMatch = output.match(/Not After\s*:\s*(.+)/);
    
    if (notBeforeMatch) info.validFrom = notBeforeMatch[1].trim();
    if (notAfterMatch) info.validTo = notAfterMatch[1].trim();
    
    // Extract SANs
    const sanMatch = output.match(/X509v3 Subject Alternative Name:\s*\n\s*(.+)/);
    if (sanMatch) {
      info.sans = sanMatch[1]
        .split(',')
        .map(san => san.trim().replace(/^DNS:/, ''))
        .filter(san => san.length > 0);
    }
    
  } catch (parseError) {
    info.error = `Failed to parse certificate: ${parseError}`;
  }
  
  return info;
}

function parseAlternativeCertInfo(domain: string, output: string): CertificateInfo {
  const info: CertificateInfo = { domain };
  
  try {
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('issuer=')) {
        const issuerMatch = line.match(/CN\s*=\s*([^,]+)/);
        if (issuerMatch) info.issuer = issuerMatch[1].trim();
      } else if (line.includes('subject=')) {
        const subjectMatch = line.match(/CN\s*=\s*([^,]+)/);
        if (subjectMatch) info.subject = subjectMatch[1].trim();
      } else if (line.includes('notBefore=')) {
        info.validFrom = line.replace('notBefore=', '').trim();
      } else if (line.includes('notAfter=')) {
        info.validTo = line.replace('notAfter=', '').trim();
      } else if (line.includes('DNS:')) {
        info.sans = line.split(',')
          .map(san => san.trim().replace(/^DNS:/, ''))
          .filter(san => san.length > 0);
      }
    }
    
  } catch (parseError) {
    info.error = `Failed to parse alternative certificate format: ${parseError}`;
  }
  
  return info;
}

function displayCertificateInfo(certInfo: CertificateInfo): void {
  console.log(chalk.yellow(`\n📜 Certificate for ${certInfo.domain}:`));
  console.log('─'.repeat(60));
  
  if (certInfo.error) {
    console.log(chalk.red(`   ❌ Error: ${certInfo.error}`));
    return;
  }
  
  if (certInfo.issuer) {
    // Color code by issuer
    const issuerColor = certInfo.issuer.toLowerCase().includes('let\'s encrypt') ? chalk.blue :
                       certInfo.issuer.toLowerCase().includes('digicert') ? chalk.green :
                       certInfo.issuer.toLowerCase().includes('comodo') ? chalk.green :
                       certInfo.issuer.toLowerCase().includes('sectigo') ? chalk.green :
                       certInfo.issuer.toLowerCase().includes('google') ? chalk.green :
                       certInfo.issuer.toLowerCase().includes('amazon') ? chalk.green :
                       chalk.cyan;
    
    console.log(`   🏢 Issuer: ${issuerColor(certInfo.issuer)}`);
  }
  
  if (certInfo.subject) {
    console.log(`   🎯 Subject: ${certInfo.subject}`);
  }
  
  if (certInfo.validFrom && certInfo.validTo) {
    console.log(`   📅 Valid: ${certInfo.validFrom} → ${certInfo.validTo}`);
  }
  
  if (certInfo.sans && certInfo.sans.length > 0) {
    console.log(`   🌐 SANs: ${certInfo.sans.slice(0, 3).join(', ')}${certInfo.sans.length > 3 ? ` (+${certInfo.sans.length - 3} more)` : ''}`);
  }
}

async function checkAllCertificates(): Promise<void> {
  console.log(chalk.cyan.bold('🔐 Real SSL Certificate Analysis'));
  console.log(chalk.blue('Checking actual certificate information for domains...'));
  console.log('═'.repeat(80));
  
  const results: CertificateInfo[] = [];
  const successful: CertificateInfo[] = [];
  const failed: CertificateInfo[] = [];
  
  // Check certificates with some parallelism but not too much
  const batchSize = 3;
  for (let i = 0; i < DOMAINS_TO_CHECK.length; i += batchSize) {
    const batch = DOMAINS_TO_CHECK.slice(i, i + batchSize);
    const batchPromises = batch.map(domain => getCertificateInfo(domain));
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Display results as we get them
    for (const result of batchResults) {
      displayCertificateInfo(result);
      
      if (result.error) {
        failed.push(result);
      } else {
        successful.push(result);
      }
    }
    
    // Small delay between batches to be respectful
    if (i + batchSize < DOMAINS_TO_CHECK.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  console.log(chalk.cyan.bold('\n📊 Certificate Analysis Summary'));
  console.log('═'.repeat(80));
  
  console.log(`${chalk.green('✅ Successful:')} ${successful.length}`);
  console.log(`${chalk.red('❌ Failed:')} ${failed.length}`);
  
  if (successful.length > 0) {
    console.log(chalk.blue('\n🏢 Certificate Issuers Found:'));
    const issuerCounts = new Map<string, number>();
    
    successful.forEach(cert => {
      if (cert.issuer) {
        const count = issuerCounts.get(cert.issuer) || 0;
        issuerCounts.set(cert.issuer, count + 1);
      }
    });
    
    Array.from(issuerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([issuer, count]) => {
        const issuerColor = issuer.toLowerCase().includes('let\'s encrypt') ? chalk.blue :
                           issuer.toLowerCase().includes('digicert') ? chalk.green :
                           issuer.toLowerCase().includes('google') ? chalk.green :
                           chalk.cyan;
        console.log(`   • ${issuerColor(issuer)}: ${count} domains`);
      });
  }
  
  if (failed.length > 0) {
    console.log(chalk.red('\n❌ Failed Domains:'));
    failed.forEach(cert => {
      console.log(`   • ${cert.domain}: ${cert.error}`);
    });
    
    console.log(chalk.yellow('\n💡 Troubleshooting Tips:'));
    console.log('   • Some domains may not accept HTTPS connections');
    console.log('   • Network timeouts could indicate connectivity issues');
    console.log('   • Certificate validation errors might indicate expired/invalid certs');
    console.log('   • Some services may block certificate inspection');
  }
}

checkAllCertificates().catch(console.error);
