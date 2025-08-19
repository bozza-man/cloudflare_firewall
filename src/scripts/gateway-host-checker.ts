#!/usr/bin/env tsx
import axios from 'axios';
import dns from 'dns/promises';
import chalk from 'chalk';
import { promisify } from 'util';
import { exec } from 'child_process';
import { GatewayClient } from '../api/gateway-client.js';
import { config } from '../utils/config.js';
import { GatewayRule, GatewayList } from '../types/gateway.js';

interface ErrorWithCode extends Error {
  code?: string;
}

const execAsync = promisify(exec);

interface ConnectivityResult {
  domain: string;
  dnsResolution: 'success' | 'failed';
  dnsIps: string[];
  httpConnectivity: 'success' | 'failed' | 'timeout' | 'ssl_error';
  httpsConnectivity: 'success' | 'failed' | 'timeout' | 'ssl_error';
  responseTime?: number;
  error?: string;
  source: string; // Which rule/list it came from
}

class GatewayHostChecker {
  private gatewayClient: GatewayClient;
  
  constructor() {
    this.gatewayClient = new GatewayClient();
  }

  /**
   * Fetch all Gateway rules
   */
  async fetchGatewayRules(): Promise<GatewayRule[]> {
    try {
      console.log(chalk.blue('📋 Fetching all Gateway rules...'));
      const rules = await this.gatewayClient.listGatewayRules();
      console.log(chalk.green(`✅ Found ${rules.length} Gateway rules`));
      return rules;
    } catch (error: any) {
      console.error(chalk.red(`❌ Error fetching Gateway rules: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return [];
    }
  }

  /**
   * Fetch all Gateway lists
   */
  async fetchGatewayLists(): Promise<GatewayList[]> {
    try {
      console.log(chalk.blue('📋 Fetching all Gateway lists...'));
      const lists = await this.gatewayClient.listGatewayLists();
      console.log(chalk.green(`✅ Found ${lists.length} Gateway lists`));
      return lists;
    } catch (error: any) {
      console.error(chalk.red(`❌ Error fetching Gateway lists: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return [];
    }
  }

  /**
   * Fetch items from a specific Gateway list
   */
  async fetchListItems(listId: string): Promise<string[]> {
    try {
      const list = await this.gatewayClient.getGatewayList(listId);
      return list.items?.map((item: { value: string }) => item.value) || [];
    } catch (error: any) {
      return [];
    }
  }

  /**
   * Extract domains from rule traffic expression
   */
  extractDomainsFromRule(rule: GatewayRule): { domains: string[], source: string } {
    const domains = new Set<string>();
    const traffic = rule.traffic || '';
    const source = `Rule: ${rule.name}`;

    // Extract domains from various patterns, but skip regex patterns
    const patterns = [
      // Exact matches (dns.fqdn == "domain.com")
      /(?:dns\.fqdn\s*==\s*|http\.host\s*==\s*|ssl\.sni\s*==\s*)["']([^"']+)["']/g,
      // Array syntax (dns.fqdn in {"domain1.com" "domain2.com"})
      /(?:dns\.fqdn\s*in\s*|http\.host\s*in\s*|ssl\.sni\s*in\s*)\s*\{([^}]+)\}/g
      // Note: Skipping matches patterns as they are regex and shouldn't be tested as literal domains
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(traffic)) !== null) {
        if (pattern.source.includes('{')) {
          // Handle array syntax - split properly on spaces and quotes
          const arrayContent = match[1];
          // Match quoted strings within the array
          const quotedDomains = arrayContent.match(/"([^"]+)"/g);
          if (quotedDomains) {
            quotedDomains.forEach(quoted => {
              const domain = quoted.replace(/"/g, '').trim();
              if (this.isValidDomain(domain)) {
                domains.add(domain);
              }
            });
          }
        } else {
          // Handle single domain
          const domain = match[1].trim();
          if (this.isValidDomain(domain)) {
            domains.add(domain);
          }
        }
      }
    });

    return { domains: Array.from(domains), source };
  }

  /**
   * Check if a string is a valid domain (not a regex pattern)
   */
  private isValidDomain(domain: string): boolean {
    // Skip if empty or starts with special characters indicating regex
    if (!domain || domain.startsWith('*') || domain.startsWith('^') || domain.startsWith('_.*')) {
      return false;
    }
    
    // Skip if contains regex special characters
    if (domain.includes('.*\\') || domain.includes('$') || domain.match(/\.\*\\\\/)) {
      return false;
    }
    
    // Must contain at least one dot and be a reasonable domain format
    if (!domain.includes('.') || domain.length < 4) {
      return false;
    }
    
    // Skip if it looks like a concatenated string of multiple domains
    if (domain.split(' ').length > 1) {
      return false;
    }
    
    return true;
  }

  /**
   * Test connectivity to a domain
   */
  async testDomainConnectivity(domain: string, source: string): Promise<ConnectivityResult> {
    const result: ConnectivityResult = {
      domain,
      dnsResolution: 'failed',
      dnsIps: [],
      httpConnectivity: 'failed',
      httpsConnectivity: 'failed',
      source
    };

    // Test DNS resolution
    try {
      const startTime = Date.now();
      const addresses = await dns.resolve4(domain);
      result.dnsResolution = 'success';
      result.dnsIps = addresses;
      result.responseTime = Date.now() - startTime;
      
      // Test HTTP connectivity (quick check)
      try {
        await axios.get(`http://${domain}`, { 
          timeout: 5000, 
          maxRedirects: 0,
          validateStatus: () => true // Accept any HTTP status
        });
        result.httpConnectivity = 'success';
      } catch (error: any) {
        const err = error as ErrorWithCode;
        if (err.code === 'ECONNABORTED') {
          result.httpConnectivity = 'timeout';
        } else if (err instanceof Error && (err.message.includes('SSL') || err.message.includes('certificate'))) {
          result.httpConnectivity = 'ssl_error';
        } else {
          result.httpConnectivity = 'failed';
        }
      }

      // Test HTTPS connectivity
      try {
        await axios.get(`https://${domain}`, { 
          timeout: 5000, 
          maxRedirects: 0,
          validateStatus: () => true // Accept any HTTP status
        });
        result.httpsConnectivity = 'success';
      } catch (error: any) {
        const err = error as ErrorWithCode;
        if (err.code === 'ECONNABORTED') {
          result.httpsConnectivity = 'timeout';
        } else if (err instanceof Error && (err.message.includes('SSL') || err.message.includes('certificate'))) {
          result.httpsConnectivity = 'ssl_error';
        } else {
          result.httpsConnectivity = 'failed';
        }
      }
      
    } catch (dnsError) {
      result.error = dnsError instanceof Error ? dnsError.message : 'Unknown DNS error';
      
      // Check if DNS returns blocked IP (0.0.0.0)
      try {
        const { stdout } = await execAsync(`nslookup ${domain}`);
        if (stdout.includes('0.0.0.0')) {
          result.error = 'Blocked by Gateway (DNS returns 0.0.0.0)';
        }
      } catch (error: any) {
        // Ignore nslookup errors as this is just an additional check
        // The main DNS resolution error is already captured
      }
    }

    return result;
  }

  /**
   * Run comprehensive connectivity check
   */
  async runConnectivityCheck(): Promise<void> {
    console.log(chalk.yellow('🚀 Starting comprehensive Gateway host connectivity check...'));
    console.log(chalk.gray('This may take several minutes depending on the number of domains...\n'));

    const allDomains = new Set<string>();
    const domainSources = new Map<string, string>();

    // Fetch and process Gateway rules
    const rules = await this.fetchGatewayRules();
    
    for (const rule of rules) {
      const { domains, source } = this.extractDomainsFromRule(rule);
      domains.forEach(domain => {
        allDomains.add(domain);
        domainSources.set(domain, source);
      });
    }

    // Fetch and process Gateway lists
    const lists = await this.fetchGatewayLists();
    
    for (const list of lists) {
      if (list.type === 'DOMAIN') {
        console.log(chalk.blue(`📝 Processing list: ${list.name}`));
        const items = await this.fetchListItems(list.id);
        const source = `List: ${list.name}`;
        
        items.forEach(item => {
          if (item && !item.startsWith('*') && item.includes('.')) {
            allDomains.add(item);
            domainSources.set(item, source);
          }
        });
      }
    }

    console.log(chalk.green(`\n🎯 Found ${allDomains.size} unique domains to test\n`));

    // Test connectivity for all domains
    const results: ConnectivityResult[] = [];
    let completed = 0;
    
    for (const domain of Array.from(allDomains)) {
      const source = domainSources.get(domain) || 'Unknown';
      
      process.stdout.write(`\r${chalk.blue('Testing:')} ${domain} (${++completed}/${allDomains.size})`);
      
      const result = await this.testDomainConnectivity(domain, source);
      results.push(result);
      
      // Brief pause to avoid overwhelming the network
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n');
    this.generateReport(results);
  }

  /**
   * Generate comprehensive report
   */
  private generateReport(results: ConnectivityResult[]): void {
    console.log(chalk.yellow('\n' + '='.repeat(80)));
    console.log(chalk.yellow('📊 GATEWAY HOST CONNECTIVITY REPORT'));
    console.log(chalk.yellow('='.repeat(80)));

    const stats = {
      total: results.length,
      dnsSuccess: results.filter(r => r.dnsResolution === 'success').length,
      dnsFailed: results.filter(r => r.dnsResolution === 'failed').length,
      httpSuccess: results.filter(r => r.httpConnectivity === 'success').length,
      httpsSuccess: results.filter(r => r.httpsConnectivity === 'success').length,
      blocked: results.filter(r => r.error?.includes('0.0.0.0')).length
    };

    console.log(`\n📈 Summary Statistics:`);
    console.log(`   Total domains tested: ${stats.total}`);
    console.log(`   DNS resolution success: ${chalk.green(stats.dnsSuccess)} (${(stats.dnsSuccess/stats.total*100).toFixed(1)}%)`);
    console.log(`   DNS resolution failed: ${chalk.red(stats.dnsFailed)} (${(stats.dnsFailed/stats.total*100).toFixed(1)}%)`);
    console.log(`   HTTP connectivity: ${chalk.green(stats.httpSuccess)} (${(stats.httpSuccess/stats.total*100).toFixed(1)}%)`);
    console.log(`   HTTPS connectivity: ${chalk.green(stats.httpsSuccess)} (${(stats.httpsSuccess/stats.total*100).toFixed(1)}%)`);
    console.log(`   Blocked by Gateway: ${chalk.red(stats.blocked)} (${(stats.blocked/stats.total*100).toFixed(1)}%)`);

    // Show blocked domains
    const blocked = results.filter(r => r.error?.includes('0.0.0.0'));
    if (blocked.length > 0) {
      console.log(`\n🚨 Blocked Domains (${blocked.length}):`);
      blocked.forEach(result => {
        console.log(`   ${chalk.red('❌')} ${result.domain} (${result.source})`);
      });
    }

    // Show DNS failures (not blocked)
    const dnsFailures = results.filter(r => r.dnsResolution === 'failed' && !r.error?.includes('0.0.0.0'));
    if (dnsFailures.length > 0) {
      console.log(`\n⚠️  DNS Resolution Failures (${dnsFailures.length}):`);
      dnsFailures.forEach(result => {
        console.log(`   ${chalk.yellow('⚠️')} ${result.domain} - ${result.error} (${result.source})`);
      });
    }

    // Show connectivity issues
    const connectivityIssues = results.filter(r => 
      r.dnsResolution === 'success' && 
      r.httpConnectivity !== 'success' && 
      r.httpsConnectivity !== 'success'
    );
    
    if (connectivityIssues.length > 0) {
      console.log(`\n🔧 Connectivity Issues (${connectivityIssues.length}):`);
      connectivityIssues.forEach(result => {
        console.log(`   ${chalk.yellow('🔧')} ${result.domain} - DNS OK, HTTP/HTTPS failed (${result.source})`);
      });
    }

    // Show working domains (sample)
    const working = results.filter(r => r.dnsResolution === 'success' && (r.httpConnectivity === 'success' || r.httpsConnectivity === 'success'));
    if (working.length > 0) {
      console.log(`\n✅ Working Domains (showing first 10 of ${working.length}):`);
      working.slice(0, 10).forEach(result => {
        const protocols = [];
        if (result.httpConnectivity === 'success') protocols.push('HTTP');
        if (result.httpsConnectivity === 'success') protocols.push('HTTPS');
        console.log(`   ${chalk.green('✅')} ${result.domain} (${protocols.join(', ')}) - ${result.responseTime}ms (${result.source})`);
      });
      
      if (working.length > 10) {
        console.log(`   ... and ${working.length - 10} more working domains`);
      }
    }

    console.log(chalk.yellow('\n' + '='.repeat(80)));
    console.log(chalk.yellow('Report completed at: ' + new Date().toLocaleString()));
    console.log(chalk.yellow('='.repeat(80)));
  }
}

// Main execution
async function main() {
  const checker = new GatewayHostChecker();
  await checker.runConnectivityCheck();
}

// Direct execution
main().catch(error => {
  console.error(chalk.red('❌ Error running host checker:'), error);
  process.exit(1);
});
