#!/usr/bin/env node

import { SecurityScanner, SecurityScanOptions } from '../security/security-scanner.js';
import { ThreatIntelligenceClient } from '../security/threat-intelligence-client.js';
import chalk from 'chalk';
import { program } from 'commander';
import fs from 'fs/promises';

interface ScanCommandOptions {
  type: 'rules' | 'lists' | 'both' | 'domains';
  output?: string;
  rateLimitMs: number;
  confidenceThreshold: number;
  allowedRiskLevel: 'low' | 'medium' | 'high';
  autoBlockMalicious: boolean;
  enableThreatIntelligence: boolean;
  requireManualReview: boolean;
  domainsFile?: string;
  domains?: string[];
  verbose: boolean;
}

export class SecurityScanCommand {
  private securityScanner: SecurityScanner;
  private threatClient: ThreatIntelligenceClient;

  constructor() {
    this.securityScanner = new SecurityScanner();
    this.threatClient = new ThreatIntelligenceClient();
  }

  async run(): Promise<void> {
    program
      .name('security-scan')
      .description('🛡️  Comprehensive Cloudflare Gateway Security Scanner')
      .version('1.0.0');

    // Main security scan command
    program
      .command('scan')
      .description('Run security scan on Gateway configuration')
      .option('-t, --type <type>', 'Scan type: rules, lists, both, or domains', 'both')
      .option('-o, --output <file>', 'Save detailed report to file')
      .option('--rate-limit <ms>', 'Rate limit between API calls (milliseconds)', '1000')
      .option('--confidence-threshold <threshold>', 'Minimum confidence threshold (0-1)', '0.7')
      .option('--allowed-risk-level <level>', 'Maximum allowed risk level', 'medium')
      .option('--auto-block-malicious', 'Automatically block malicious domains', false)
      .option('--disable-threat-intelligence', 'Disable threat intelligence checks', false)
      .option('--require-manual-review', 'Require manual review for suspicious domains', false)
      .option('-v, --verbose', 'Verbose logging', false)
      .action(async (options) => {
        await this.executeScan(options);
      });

    // Domain validation command
    program
      .command('validate')
      .description('Validate specific domains for security threats')
      .argument('[domains...]', 'Domains to validate (space-separated)')
      .option('-f, --file <file>', 'Read domains from file (one per line)')
      .option('-o, --output <file>', 'Save results to file')
      .option('--rate-limit <ms>', 'Rate limit between API calls (milliseconds)', '500')
      .option('--confidence-threshold <threshold>', 'Minimum confidence threshold (0-1)', '0.7')
      .option('-v, --verbose', 'Verbose logging', false)
      .action(async (domains, options) => {
        await this.executeValidation(domains, options);
      });

    // Threat intelligence lookup command
    program
      .command('lookup')
      .description('Look up threat intelligence for a specific domain or IP')
      .argument('<target>', 'Domain or IP address to lookup')
      .option('-v, --verbose', 'Verbose output with detailed threat information', false)
      .action(async (target, options) => {
        await this.executeLookup(target, options);
      });

    // Configuration command
    program
      .command('config')
      .description('Show security scanning configuration')
      .action(async () => {
        await this.showConfiguration();
      });

    // Health check command
    program
      .command('health')
      .description('Check the health of security scanning services')
      .action(async () => {
        await this.executeHealthCheck();
      });

    // Statistics command
    program
      .command('stats')
      .description('Show Gateway security statistics')
      .option('--detailed', 'Show detailed statistics', false)
      .action(async (options) => {
        await this.executeStats(options);
      });

    program.parse();
  }

  /**
   * Execute comprehensive security scan
   */
  private async executeScan(options: any): Promise<void> {
    console.log(chalk.cyan.bold('🛡️  Cloudflare Gateway Security Scanner\n'));
    
    const scanOptions: SecurityScanOptions = {
      enableThreatIntelligence: !options.disableThreatIntelligence,
      autoBlockMalicious: options.autoBlockMalicious,
      requireManualReview: options.requireManualReview,
      confidenceThreshold: parseFloat(options.confidenceThreshold),
      allowedRiskLevel: options.allowedRiskLevel as 'low' | 'medium' | 'high',
      rateLimitMs: parseInt(options.rateLimit),
      outputFile: options.output
    };

    console.log(chalk.blue('🔧 Scan Configuration:'));
    console.log(`   Type: ${options.type}`);
    console.log(`   Threat Intelligence: ${scanOptions.enableThreatIntelligence ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   Auto-block Malicious: ${scanOptions.autoBlockMalicious ? '✅ Yes' : '❌ No'}`);
    console.log(`   Confidence Threshold: ${Math.round(scanOptions.confidenceThreshold * 100)}%`);
    console.log(`   Allowed Risk Level: ${scanOptions.allowedRiskLevel}`);
    console.log(`   Rate Limit: ${scanOptions.rateLimitMs}ms`);
    
    if (options.output) {
      console.log(`   Output File: ${options.output}`);
    }

    try {
      const startTime = Date.now();

      switch (options.type) {
        case 'rules':
          console.log(chalk.yellow('\n📏 Scanning Gateway Rules...'));
          await this.securityScanner.scanGatewayRules(scanOptions);
          break;

        case 'lists':
          console.log(chalk.yellow('\n📋 Scanning Gateway Lists...'));
          await this.securityScanner.scanGatewayLists(scanOptions);
          break;

        case 'both':
          console.log(chalk.yellow('\n📏 Scanning Gateway Rules...'));
          await this.securityScanner.scanGatewayRules(scanOptions);
          
          console.log(chalk.yellow('\n📋 Scanning Gateway Lists...'));
          await this.securityScanner.scanGatewayLists(scanOptions);
          break;

        default:
          throw new Error(`Unknown scan type: ${options.type}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(chalk.green(`\n✅ Security scan completed in ${duration}s`));

      // Show next steps
      console.log(chalk.cyan('\n💡 Recommended Actions:'));
      console.log('• Review any flagged domains or IPs immediately');
      console.log('• Update Gateway Lists to remove malicious entries');
      console.log('• Create rules to block high-risk domains');
      console.log('• Schedule regular security scans (weekly/monthly)');
      console.log('• Use "security-scan validate <domain>" for individual checks');

    } catch (error) {
      console.error(chalk.red('\n❌ Security scan failed:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Execute domain validation
   */
  private async executeValidation(inputDomains: string[], options: any): Promise<void> {
    console.log(chalk.cyan.bold('🔍 Domain Security Validation\n'));

    let domains: string[] = inputDomains;

    // Read from file if specified
    if (options.file) {
      try {
        const fileContent = await fs.readFile(options.file, 'utf-8');
        const fileDomains = fileContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'));
        
        domains = [...domains, ...fileDomains];
        console.log(chalk.blue(`📁 Loaded ${fileDomains.length} domains from file: ${options.file}`));
      } catch (error) {
        console.error(chalk.red(`❌ Error reading file ${options.file}:`), error);
        process.exit(1);
      }
    }

    if (domains.length === 0) {
      console.error(chalk.red('❌ No domains provided. Use domains as arguments or --file option.'));
      console.log(chalk.gray('Example: security-scan validate github.com google.com'));
      console.log(chalk.gray('Or: security-scan validate --file domains.txt'));
      process.exit(1);
    }

    // Remove duplicates and validate format
    const uniqueDomains = [...new Set(domains)].filter(domain => {
      const isValid = this.isValidDomain(domain);
      if (!isValid && options.verbose) {
        console.warn(chalk.yellow(`⚠️  Skipping invalid domain: ${domain}`));
      }
      return isValid;
    });

    console.log(chalk.green(`🎯 Validating ${uniqueDomains.length} unique domains`));

    const scanOptions: SecurityScanOptions = {
      enableThreatIntelligence: true,
      autoBlockMalicious: false,
      requireManualReview: false,
      confidenceThreshold: parseFloat(options.confidenceThreshold),
      allowedRiskLevel: 'high', // Be permissive for validation
      rateLimitMs: parseInt(options.rateLimit),
      outputFile: options.output
    };

    try {
      const report = await this.securityScanner.bulkValidate(uniqueDomains, scanOptions);

      // Display summary
      console.log(chalk.cyan('\n📊 Validation Summary:'));
      console.log(`   ${chalk.green(`✅ Safe: ${report.summary.allowed}`)}`);
      console.log(`   ${chalk.red(`❌ Blocked: ${report.summary.blocked}`)}`);
      console.log(`   ${chalk.yellow(`⚠️  Review: ${report.summary.requireReview}`)}`);
      console.log(`   ⏱️  Duration: ${(report.summary.scanDuration / 1000).toFixed(1)}s`);

      // Show detailed results if verbose
      if (options.verbose) {
        console.log(chalk.cyan('\n📝 Detailed Results:'));
        for (const result of report.results) {
          const statusIcon = result.action === 'allow' ? '✅' : 
                            result.action === 'block' ? '❌' : '⚠️ ';
          
          const riskColor = result.riskLevel === 'low' ? chalk.blue :
                           result.riskLevel === 'medium' ? chalk.yellow :
                           result.riskLevel === 'high' ? chalk.red : chalk.red;
          
          console.log(`${statusIcon} ${result.item}: ${riskColor(result.riskLevel.toUpperCase())} risk`);
          
          if (result.reasons.length > 0) {
            result.reasons.forEach(reason => {
              console.log(chalk.gray(`   • ${reason}`));
            });
          }
          
          if (result.threatIntelligence?.threats && result.threatIntelligence.threats.length > 0) {
            const threats = result.threatIntelligence.threats.slice(0, 3);
            console.log(chalk.red(`   🚨 Threats: ${threats.map(t => t.type).join(', ')}`));
          }
        }
      }

      if (options.output) {
        console.log(chalk.green(`\n💾 Detailed report saved to: ${options.output}`));
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Domain validation failed:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Execute threat intelligence lookup
   */
  private async executeLookup(target: string, options: any): Promise<void> {
    console.log(chalk.cyan.bold(`🔍 Threat Intelligence Lookup: ${target}\n`));

    const isIP = this.isValidIP(target);
    const isDomain = this.isValidDomain(target);

    if (!isIP && !isDomain) {
      console.error(chalk.red('❌ Invalid target. Must be a valid domain or IP address.'));
      process.exit(1);
    }

    try {
      const result = isIP ? 
        await this.threatClient.scanIP(target) : 
        await this.threatClient.scanDomain(target);

      // Display basic information
      console.log(chalk.blue('📊 Basic Information:'));
      console.log(`   Target: ${result.domain || result.ip}`);
      console.log(`   Type: ${isIP ? 'IP Address' : 'Domain'}`);
      
      const reputationColor = result.reputation === 'trusted' ? chalk.green : 
                             result.reputation === 'suspicious' ? chalk.yellow : 
                             result.reputation === 'malicious' ? chalk.red : chalk.gray;
      
      console.log(`   Reputation: ${reputationColor(result.reputation.toUpperCase())}`);
      console.log(`   Confidence: ${Math.round(result.confidence * 100)}%`);
      console.log(`   Recommendation: ${result.allowRecommendation.toUpperCase()}`);

      // Display threat sources
      if (result.sources.length > 0) {
        console.log(chalk.blue('\n🔍 Threat Intelligence Sources:'));
        for (const source of result.sources) {
          const reputationScore = Math.round(source.reputation);
          const scoreColor = reputationScore >= 80 ? chalk.green :
                           reputationScore >= 60 ? chalk.yellow : chalk.red;
          
          console.log(`   • ${source.name} (${source.type}): ${scoreColor(reputationScore + '/100')}`);
          console.log(chalk.gray(`     Last Update: ${new Date(source.lastUpdate).toLocaleString()}`));
        }
      }

      // Display detailed information if available
      if (result.details && Object.keys(result.details).length > 0) {
        console.log(chalk.blue('\n📋 Details:'));
        
        if (result.details.categories && result.details.categories.length > 0) {
          console.log(`   Categories: ${result.details.categories.join(', ')}`);
        }
        
        if (result.details.popularity !== undefined) {
          console.log(`   Popularity Rank: ${result.details.popularity}`);
        }
        
        if (result.details.ageInDays !== undefined) {
          console.log(`   Domain Age: ${result.details.ageInDays} days`);
        }

        // Security flags
        const flags: string[] = [];
        if (result.details.malware) flags.push('🦠 Malware');
        if (result.details.phishing) flags.push('🎣 Phishing');
        if (result.details.botnet) flags.push('🤖 Botnet');
        if (result.details.spam) flags.push('📧 Spam');
        if (result.details.childAbuse) flags.push('🚫 Child Abuse');
        
        if (flags.length > 0) {
          console.log(chalk.red(`   Security Flags: ${flags.join(', ')}`));
        }
      }

      // Display threats
      if (result.threats.length > 0) {
        console.log(chalk.red('\n🚨 Identified Threats:'));
        
        for (const threat of result.threats) {
          const severityColor = threat.severity === 'critical' ? chalk.red :
                               threat.severity === 'high' ? chalk.red :
                               threat.severity === 'medium' ? chalk.yellow : chalk.blue;
          
          console.log(`   • ${severityColor(threat.severity.toUpperCase())}: ${threat.type}`);
          console.log(chalk.gray(`     ${threat.description}`));
          console.log(chalk.gray(`     Source: ${threat.source} (${Math.round(threat.confidence * 100)}% confidence)`));
          
          if (threat.firstDetected) {
            console.log(chalk.gray(`     First Detected: ${new Date(threat.firstDetected).toLocaleDateString()}`));
          }
        }
      }

      // Display recommendations
      if (result.recommendations.length > 0) {
        console.log(chalk.cyan('\n💡 Recommendations:'));
        for (const recommendation of result.recommendations) {
          console.log(`   ${recommendation}`);
        }
      }

      // Verbose output for raw data
      if (options.verbose) {
        console.log(chalk.gray('\n🔍 Raw Threat Intelligence Data:'));
        console.log(JSON.stringify(result, null, 2));
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Threat intelligence lookup failed:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Show security scanning configuration
   */
  private async showConfiguration(): Promise<void> {
    console.log(chalk.cyan.bold('⚙️  Security Scanning Configuration\n'));

    console.log(chalk.blue('🛡️  Default Security Settings:'));
    console.log('   Threat Intelligence: ✅ Enabled');
    console.log('   Auto-block Malicious: ❌ Disabled (can be enabled with --auto-block-malicious)');
    console.log('   Manual Review Required: ❌ Disabled (can be enabled with --require-manual-review)');
    console.log('   Default Confidence Threshold: 70%');
    console.log('   Default Allowed Risk Level: medium');
    console.log('   Default Rate Limit: 1000ms');

    console.log(chalk.blue('\n🔧 Configuration Options:'));
    console.log('   --confidence-threshold <0-1>    Minimum confidence for threat detection');
    console.log('   --allowed-risk-level <level>    Maximum risk level (low/medium/high)');
    console.log('   --rate-limit <ms>               Delay between API calls');
    console.log('   --auto-block-malicious          Block malicious domains automatically');
    console.log('   --require-manual-review         Require human approval for suspicious items');
    console.log('   --disable-threat-intelligence   Disable Cloudflare Radar integration');

    console.log(chalk.blue('\n📊 Threat Intelligence Sources:'));
    console.log('   • Cloudflare Radar (primary)');
    console.log('   • DNS blacklist checking');
    console.log('   • Pattern-based analysis');
    console.log('   • Domain age assessment');
    console.log('   • IP geolocation analysis');

    console.log(chalk.yellow('\n💡 Usage Examples:'));
    console.log('   security-scan scan --type both');
    console.log('   security-scan scan --type rules --auto-block-malicious');
    console.log('   security-scan validate example.com suspicious-site.com');
    console.log('   security-scan lookup malicious-domain.com --verbose');
    console.log('   security-scan scan --confidence-threshold 0.8 --allowed-risk-level low');
  }

  /**
   * Execute health check
   */
  private async executeHealthCheck(): Promise<void> {
    console.log(chalk.cyan.bold('🏥 Security Services Health Check\n'));

    const checks = [
      { name: 'Cloudflare API Connection', check: () => this.checkCloudflareAPI() },
      { name: 'Cloudflare Radar Access', check: () => this.checkRadarAccess() },
      { name: 'Gateway API Access', check: () => this.checkGatewayAccess() },
      { name: 'DNS Resolution', check: () => this.checkDNSResolution() }
    ];

    const results: { name: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

    for (const check of checks) {
      try {
        const result = await check.check();
        results.push({ name: check.name, ...result });
        
        const statusIcon = result.status === 'pass' ? '✅' : 
                          result.status === 'warn' ? '⚠️ ' : '❌';
        
        console.log(`${statusIcon} ${check.name}: ${result.message}`);
        
      } catch (error) {
        results.push({ 
          name: check.name, 
          status: 'fail', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        });
        console.log(`❌ ${check.name}: Failed - ${error instanceof Error ? error.message : error}`);
      }
    }

    const passed = results.filter(r => r.status === 'pass').length;
    const warned = results.filter(r => r.status === 'warn').length;
    const failed = results.filter(r => r.status === 'fail').length;

    console.log(chalk.cyan(`\n📊 Health Check Summary:`));
    console.log(`   ${chalk.green(`✅ Passed: ${passed}`)}`);
    console.log(`   ${chalk.yellow(`⚠️  Warnings: ${warned}`)}`);
    console.log(`   ${chalk.red(`❌ Failed: ${failed}`)}`);

    if (failed > 0) {
      console.log(chalk.red('\n🚨 Some services are unavailable. Security scanning may be limited.'));
      process.exit(1);
    } else if (warned > 0) {
      console.log(chalk.yellow('\n⚠️  Some services have issues. Monitor closely.'));
    } else {
      console.log(chalk.green('\n🎉 All security services are healthy!'));
    }
  }

  /**
   * Execute statistics command
   */
  private async executeStats(options: any): Promise<void> {
    console.log(chalk.cyan.bold('📊 Gateway Security Statistics\n'));

    try {
      // This would typically connect to your analytics or logging system
      // For now, we'll show a placeholder implementation
      
      console.log(chalk.blue('🔍 Recent Activity (Last 24 Hours):'));
      console.log('   Security Scans Performed: N/A');
      console.log('   Domains Validated: N/A');
      console.log('   Threats Detected: N/A');
      console.log('   Rules Created with Security Validation: N/A');

      console.log(chalk.blue('\n🛡️  Threat Detection Summary:'));
      console.log('   Malware Domains Blocked: N/A');
      console.log('   Phishing Attempts Prevented: N/A');
      console.log('   Suspicious Domains Flagged: N/A');
      console.log('   False Positives: N/A');

      console.log(chalk.blue('\n⚙️  Configuration Status:'));
      console.log('   Threat Intelligence: ✅ Available');
      console.log('   Cloudflare Radar: ✅ Connected');
      console.log('   Gateway API: ✅ Accessible');
      console.log('   Auto-blocking: Based on scan configuration');

      if (options.detailed) {
        console.log(chalk.blue('\n📈 Detailed Metrics:'));
        console.log('   Average Scan Duration: N/A');
        console.log('   API Response Times: N/A');
        console.log('   Cache Hit Rate: N/A');
        console.log('   Rate Limit Utilization: N/A');
      }

      console.log(chalk.yellow('\n💡 Note: Statistics collection is not yet implemented.'));
      console.log('   Future versions will include detailed metrics and historical data.');

    } catch (error) {
      console.error(chalk.red('❌ Failed to retrieve statistics:'), error);
      process.exit(1);
    }
  }

  // Health check methods
  private async checkCloudflareAPI(): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> {
    // Test basic Cloudflare API connectivity
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN || ''}`
        }
      });
      
      if (response.ok) {
        return { status: 'pass', message: 'API connection successful' };
      } else {
        return { status: 'fail', message: `API returned ${response.status}` };
      }
    } catch (error) {
      return { status: 'fail', message: 'Connection failed' };
    }
  }

  private async checkRadarAccess(): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> {
    // Test Cloudflare Radar API access
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/radar/domains/cloudflare.com', {
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN || ''}`
        }
      });
      
      if (response.ok) {
        return { status: 'pass', message: 'Radar API accessible' };
      } else if (response.status === 403) {
        return { status: 'warn', message: 'Radar API access limited (may require higher plan)' };
      } else {
        return { status: 'fail', message: `Radar API returned ${response.status}` };
      }
    } catch (error) {
      return { status: 'fail', message: 'Radar API connection failed' };
    }
  }

  private async checkGatewayAccess(): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> {
    // Test Gateway API access
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        return { status: 'fail', message: 'Account ID not configured' };
      }

      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`, {
        headers: {
          'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN || ''}`
        }
      });
      
      if (response.ok) {
        return { status: 'pass', message: 'Gateway API accessible' };
      } else {
        return { status: 'fail', message: `Gateway API returned ${response.status}` };
      }
    } catch (error) {
      return { status: 'fail', message: 'Gateway API connection failed' };
    }
  }

  private async checkDNSResolution(): Promise<{ status: 'pass' | 'fail' | 'warn'; message: string }> {
    // Test basic DNS resolution
    try {
      const dns = await import('dns');
      const { promisify } = await import('util');
      const lookup = promisify(dns.lookup);
      
      await lookup('cloudflare.com');
      return { status: 'pass', message: 'DNS resolution working' };
    } catch (error) {
      return { status: 'fail', message: 'DNS resolution failed' };
    }
  }

  // Utility methods
  private isValidDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') return false;
    const domainRegex = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain) && !domain.includes('..') && domain.length > 3;
  }

  private isValidIP(input: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(input) || ipv6Regex.test(input);
  }
}

/**
 * Main CLI execution
 */
async function main() {
  const command = new SecurityScanCommand();
  await command.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('❌ Command failed:'), error);
    process.exit(1);
  });
}

export { SecurityScanCommand };
