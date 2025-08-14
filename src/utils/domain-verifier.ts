import { promisify } from 'util';
import { lookup as dnsLookup } from 'dns';
import chalk from 'chalk';
import ora from 'ora';

const lookupAsync = promisify(dnsLookup);

export interface DomainVerificationResult {
  domain: string;
  success: boolean;
  ip?: string;
  error?: string;
  responseTime: number;
}

export interface VerificationSummary {
  totalDomains: number;
  successfulDomains: number;
  failedDomains: number;
  averageResponseTime: number;
  results: DomainVerificationResult[];
}

export interface RuleVerificationContext {
  ruleName: string;
  action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
  domains: string[];
  phase: 'pre' | 'post';
}

export class DomainVerifier {
  private timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  /**
   * Extract domains from Gateway rule filters
   */
  extractDomainsFromFilters(filters: string[]): string[] {
    const domains = new Set<string>();

    for (const filter of filters) {
      // Extract from dns.fqdn in {"domain1.com" "domain2.com"} format
      const dnsInMatch = filter.match(/dns\.fqdn\s+in\s*\{([^}]+)\}/);
      if (dnsInMatch) {
        const domainList = dnsInMatch[1];
        const domainMatches = domainList.match(/"([^"]+)"/g);
        if (domainMatches) {
          domainMatches.forEach(match => {
            const domain = match.replace(/"/g, '');
            if (this.isValidDomain(domain)) {
              domains.add(domain);
            }
          });
        }
      }

      // Extract from dns.fqdn == "domain.com" format
      const dnsEqualMatch = filter.match(/dns\.fqdn\s*==\s*"([^"]+)"/);
      if (dnsEqualMatch) {
        const domain = dnsEqualMatch[1];
        if (this.isValidDomain(domain)) {
          domains.add(domain);
        }
      }

      // Extract from http.request.uri.host format
      const httpHostMatch = filter.match(/http\.request\.uri\.host\s*(?:==|in)\s*(?:"([^"]+)"|{([^}]+)})/);
      if (httpHostMatch) {
        if (httpHostMatch[1]) {
          // Single domain
          const domain = httpHostMatch[1];
          if (this.isValidDomain(domain)) {
            domains.add(domain);
          }
        } else if (httpHostMatch[2]) {
          // Multiple domains
          const domainList = httpHostMatch[2];
          const domainMatches = domainList.match(/"([^"]+)"/g);
          if (domainMatches) {
            domainMatches.forEach(match => {
              const domain = match.replace(/"/g, '');
              if (this.isValidDomain(domain)) {
                domains.add(domain);
              }
            });
          }
        }
      }
    }

    return Array.from(domains);
  }

  /**
   * Validate if a string is a valid domain
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * Test DNS resolution for a single domain
   */
  async verifyDomain(domain: string): Promise<DomainVerificationResult> {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        lookupAsync(domain),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('DNS lookup timeout')), this.timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;
      
      return {
        domain,
        success: true,
        ip: Array.isArray(result) ? result[0].address : result.address,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        domain,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      };
    }
  }

  /**
   * Test DNS resolution for multiple domains with progress indication
   */
  async verifyDomains(domains: string[]): Promise<VerificationSummary> {
    if (domains.length === 0) {
      return {
        totalDomains: 0,
        successfulDomains: 0,
        failedDomains: 0,
        averageResponseTime: 0,
        results: []
      };
    }

    const spinner = ora(`Verifying ${domains.length} domain(s)...`).start();
    const results: DomainVerificationResult[] = [];
    let successful = 0;
    let failed = 0;
    let totalResponseTime = 0;

    try {
      // Test domains in batches to avoid overwhelming DNS servers
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < domains.length; i += batchSize) {
        batches.push(domains.slice(i, i + batchSize));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        spinner.text = `Verifying domains (batch ${batchIndex + 1}/${batches.length})...`;
        
        const batchResults = await Promise.all(
          batch.map(domain => this.verifyDomain(domain))
        );

        results.push(...batchResults);
        
        // Update counters
        for (const result of batchResults) {
          if (result.success) {
            successful++;
          } else {
            failed++;
          }
          totalResponseTime += result.responseTime;
        }

        // Small delay between batches to be respectful to DNS servers
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const averageResponseTime = totalResponseTime / domains.length;
      
      if (successful === domains.length) {
        spinner.succeed(`All ${domains.length} domain(s) verified successfully! (avg: ${averageResponseTime.toFixed(0)}ms)`);
      } else if (successful > 0) {
        spinner.succeed(`${successful}/${domains.length} domain(s) verified successfully (avg: ${averageResponseTime.toFixed(0)}ms)`);
      } else {
        spinner.fail(`Failed to verify any of ${domains.length} domain(s)`);
      }

      return {
        totalDomains: domains.length,
        successfulDomains: successful,
        failedDomains: failed,
        averageResponseTime,
        results
      };
    } catch (error) {
      spinner.fail('Domain verification failed');
      throw error;
    }
  }

  /**
   * Display verification results in a formatted way
   */
  displayResults(summary: VerificationSummary, showDetails: boolean = false): void {
    console.log(`\n${chalk.cyan('📊 Domain Verification Summary:')}`);
    console.log(`   Total domains: ${summary.totalDomains}`);
    console.log(`   ${chalk.green('✓ Successful:')} ${summary.successfulDomains}`);
    console.log(`   ${chalk.red('✗ Failed:')} ${summary.failedDomains}`);
    console.log(`   Average response time: ${summary.averageResponseTime.toFixed(0)}ms`);

    if (showDetails && summary.results.length > 0) {
      console.log(`\n${chalk.cyan('📋 Detailed Results:')}`);
      
      // Show successful domains first
      const successful = summary.results.filter(r => r.success);
      const failed = summary.results.filter(r => !r.success);
      
      if (successful.length > 0) {
        console.log(`\n${chalk.green('✓ Successfully resolved:')}`);
        successful.forEach(result => {
          console.log(`   ${chalk.gray('•')} ${result.domain} → ${result.ip} (${result.responseTime}ms)`);
        });
      }
      
      if (failed.length > 0) {
        console.log(`\n${chalk.red('✗ Failed to resolve:')}`);
        failed.forEach(result => {
          console.log(`   ${chalk.gray('•')} ${result.domain} - ${result.error} (${result.responseTime}ms)`);
        });
      }
    }
  }

  /**
   * Comprehensive rule verification with before/after testing
   */
  async verifyRuleImplementation(context: RuleVerificationContext): Promise<VerificationSummary> {
    const { ruleName, action, domains, phase } = context;
    
    if (domains.length === 0) {
      console.log(chalk.gray(`\n🔍 No domains found in rule "${ruleName}" for verification`));
      return {
        totalDomains: 0,
        successfulDomains: 0,
        failedDomains: 0,
        averageResponseTime: 0,
        results: []
      };
    }

    const phaseEmoji = phase === 'pre' ? '⏳' : '🔍';
    const phaseText = phase === 'pre' ? 'Pre-rule' : 'Post-rule';
    const actionEmoji = action === 'allow' ? '✅' : '🚫';
    
    console.log(chalk.cyan(`\n${phaseEmoji} ${phaseText} Verification: ${actionEmoji} ${action.toUpperCase()} rule "${ruleName}"`));
    console.log(chalk.gray(`   Testing ${domains.length} domain(s)...`));
    
    // Perform domain verification
    const summary = await this.verifyDomains(domains);
    
    // Display context-aware results
    this.displayContextualResults(summary, context);
    
    return summary;
  }

  /**
   * Display results with context for rule type and phase
   */
  private displayContextualResults(summary: VerificationSummary, context: RuleVerificationContext): void {
    const { action, phase } = context;
    
    // Show basic summary
    this.displayResults(summary, true);
    
    // Add contextual interpretation
    if (phase === 'pre') {
      this.displayPreRuleContext(summary, action);
    } else {
      this.displayPostRuleContext(summary, action);
    }
  }

  /**
   * Display context for pre-rule verification
   */
  private displayPreRuleContext(summary: VerificationSummary, action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect'): void {
    console.log(chalk.cyan('\n📋 Pre-Rule Analysis:'));
    
    if (action === 'allow') {
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.green('   ✅ All domains are currently accessible - rule will maintain access'));
      } else if (summary.failedDomains === summary.totalDomains) {
        console.log(chalk.yellow('   ⚠️  No domains are currently accessible - rule will allow future access'));
      } else {
        console.log(chalk.yellow(`   ⚠️  Mixed accessibility: ${summary.successfulDomains} accessible, ${summary.failedDomains} blocked/unavailable`));
      }
    } else if (action === 'block') {
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.yellow('   ⚠️  All domains are currently accessible - rule will block this access'));
      } else if (summary.failedDomains === summary.totalDomains) {
        console.log(chalk.green('   ✅ No domains are currently accessible - rule will maintain blocks'));
      } else {
        console.log(chalk.yellow(`   ⚠️  Mixed accessibility: ${summary.successfulDomains} will be blocked, ${summary.failedDomains} already inaccessible`));
      }
    } else {
      // Handle other actions (isolate, inspect, etc.)
      console.log(chalk.blue(`   ℹ️  Domains will be subject to ${action.toUpperCase()} action`));
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.green('   ✅ All domains are currently accessible'));
      } else if (summary.failedDomains === summary.totalDomains) {
        console.log(chalk.yellow('   ⚠️  No domains are currently accessible'));
      } else {
        console.log(chalk.yellow(`   ⚠️  Mixed accessibility: ${summary.successfulDomains} accessible, ${summary.failedDomains} inaccessible`));
      }
    }
  }

  /**
   * Display context for post-rule verification
   */
  private displayPostRuleContext(summary: VerificationSummary, action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect'): void {
    console.log(chalk.cyan('\n📋 Post-Rule Analysis:'));
    
    if (action === 'allow') {
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.green('   ✅ Perfect! All domains are accessible as intended by the ALLOW rule'));
      } else if (summary.failedDomains === summary.totalDomains) {
        console.log(chalk.red('   ❌ Warning: No domains are accessible despite ALLOW rule - may indicate:'));
        console.log('      • Rule precedence issues (higher priority BLOCK rules)');
        console.log('      • DNS propagation delays');
        console.log('      • Network connectivity problems');
      } else {
        console.log(chalk.yellow(`   ⚠️  Partial success: ${summary.successfulDomains}/${summary.totalDomains} domains accessible`));
        console.log('      • Some domains may be blocked by higher-precedence rules');
        console.log('      • Check rule ordering and conflicts');
      }
    } else if (action === 'block') {
      // Note: For block rules, we still test DNS resolution (not actual blocking)
      // In a real implementation, you might test through a proxy or different method
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.yellow('   ⚠️  Note: Domains are still DNS-resolvable (expected behavior)'));
        console.log('      • BLOCK rules prevent access at the gateway level, not DNS resolution');
        console.log('      • DNS resolution success indicates domains exist and rule can block them');
      } else {
        console.log(chalk.blue('   ℹ️  Some domains failed DNS resolution - this is independent of blocking'));
        console.log('      • Failed domains may be misconfigured or non-existent');
        console.log('      • Successful domains will be blocked at the gateway level');
      }
    } else {
      // Handle other actions (isolate, inspect, etc.)
      console.log(chalk.cyan(`   📋 ${action.toUpperCase()} rule analysis:`));
      if (summary.successfulDomains === summary.totalDomains) {
        console.log(chalk.green('   ✅ All domains are DNS-resolvable and will be subject to the specified action'));
      } else if (summary.failedDomains === summary.totalDomains) {
        console.log(chalk.yellow('   ⚠️  No domains resolved - action may not apply to these domains'));
      } else {
        console.log(chalk.yellow(`   ⚠️  ${summary.successfulDomains}/${summary.totalDomains} domains resolved and will be subject to ${action}`));
      }
    }
  }

  /**
   * Wait for rule propagation (useful between pre/post testing)
   */
  async waitForRulePropagation(seconds: number = 5): Promise<void> {
    const spinner = ora(`Waiting ${seconds}s for rule propagation...`).start();
    
    for (let i = seconds; i > 0; i--) {
      spinner.text = `Waiting ${i}s for rule propagation...`;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    spinner.succeed('Rule propagation wait completed');
  }
}
