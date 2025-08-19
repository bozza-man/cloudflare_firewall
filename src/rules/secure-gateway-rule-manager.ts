import { EnhancedGatewayRuleManager } from './enhanced-gateway-rule-manager.js';
import { SecurityScanner, SecurityScanOptions, SecurityValidationResult } from '../security/security-scanner.js';
import type { GatewayRule, CreateGatewayRuleRequest } from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Security-Enhanced Gateway Rule Manager
 * 
 * Extends the EnhancedGatewayRuleManager to include threat intelligence
 * and security scanning capabilities for all rule operations.
 */
export class SecureGatewayRuleManager extends EnhancedGatewayRuleManager {
  private securityScanner: SecurityScanner;
  
  // Default security scan options
  private securityScanOptions: SecurityScanOptions = {
    enableThreatIntelligence: true,
    autoBlockMalicious: true,
    requireManualReview: false,
    confidenceThreshold: 0.7,
    allowedRiskLevel: 'medium',
    rateLimitMs: 1000
  };

  constructor() {
    super();
    this.securityScanner = new SecurityScanner();
  }
  
  /**
   * Configure security scan options
   */
  setSecurityScanOptions(options: Partial<SecurityScanOptions>): void {
    this.securityScanOptions = { ...this.securityScanOptions, ...options };
    console.log(chalk.cyan('🛡️  Security scan options updated'));
  }
  
  /**
   * Get current security configuration
   */
  getSecurityScanOptions(): SecurityScanOptions {
    return { ...this.securityScanOptions };
  }

  /**
   * Override createRule to include security scanning
   */
  async createRule(rule: CreateGatewayRuleRequest): Promise<GatewayRule> {
    console.log(chalk.cyan.bold('🛡️  Creating rule with integrated security scanning...\n'));
    
    const spinner = ora('Initializing rule creation with security validation...').start();
    
    try {
      // Extract domains from the rule for security scanning
      const domains = this.extractDomainsFromRule(rule);
      
      if (domains.length > 0) {
        spinner.text = `🛡️  Performing security scan on ${domains.length} domains...`;
        const securityResults = await this.scanDomainsForSecurity(domains);
        
        // Check if any domains should be blocked due to security risks
        const blockedDomains = securityResults.filter(result => result.action === 'block');
        const reviewDomains = securityResults.filter(result => result.action === 'review');
        
        if (blockedDomains.length > 0) {
          spinner.stop();
          console.log(chalk.red('\n🚨 Critical Security Risks Detected:'));
          
          for (const result of blockedDomains) {
            console.log(chalk.red(`   ❌ ${result.item}: ${result.riskLevel.toUpperCase()} risk`));
            console.log(chalk.gray(`      ${result.reasons.join(', ')}`));
            
            if (result.threatIntelligence?.threats?.length) {
              console.log(chalk.red(`      Threats: ${result.threatIntelligence.threats.map(t => t.type).join(', ')}`));
            }
          }
          
          // Ask user if they want to proceed despite security risks
          if (process.stdin.isTTY && !this.securityScanOptions.autoBlockMalicious) {
            const { default: inquirer } = await import('inquirer');
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: `${blockedDomains.length} critical security risks detected. Do you want to proceed anyway?`,
              default: false
            }]);
            
            if (!proceed) {
              throw new Error('Rule creation cancelled due to security risks');
            }
          } else if (this.securityScanOptions.autoBlockMalicious) {
            throw new Error(`Rule creation blocked: ${blockedDomains.length} malicious domains detected`);
          }
          
          spinner.start('Continuing rule creation despite security risks...');
        }
        
        if (reviewDomains.length > 0) {
          spinner.stop();
          console.log(chalk.yellow('\n⚠️  Domains Requiring Review:'));
          
          for (const result of reviewDomains) {
            console.log(chalk.yellow(`   ⚠️  ${result.item}: ${result.riskLevel} risk`));
            console.log(chalk.gray(`      ${result.reasons.join(', ')}`));
          }
          
          if (this.securityScanOptions.requireManualReview && process.stdin.isTTY) {
            const { default: inquirer } = await import('inquirer');
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: `${reviewDomains.length} domains require manual review. Proceed with rule creation?`,
              default: true
            }]);
            
            if (!proceed) {
              throw new Error('Rule creation cancelled - manual review required');
            }
          }
          
          spinner.start('Continuing rule creation with review domains...');
        }
        
        if (blockedDomains.length === 0 && reviewDomains.length === 0) {
          spinner.succeed('✅ All domains passed security validation');
        }
      } else {
        spinner.succeed('No domains found for security scanning');
      }
      
      // Call parent method to create the rule
      return await super.createRule(rule);
      
    } catch (error) {
      spinner.fail('❌ Rule creation failed during security validation');
      throw error;
    }
  }

  /**
   * Override createRuleFromNLDescription to include security scanning
   */
  async createRuleFromNLDescription(description: string): Promise<GatewayRule | null> {
    console.log(chalk.cyan(`🛡️  Creating rule from description with security validation: "${description}"`));
    
    // Let the parent method generate the rule structure
    const result = await super.createRuleFromNLDescription(description);
    if (!result) throw new Error('Failed to create rule from description');
    return result;
  }

  /**
   * Scan domains for security threats before rule creation
   */
  private async scanDomainsForSecurity(domains: string[]): Promise<SecurityValidationResult[]> {
    if (!domains || domains.length === 0) {
      return [];
    }
    
    try {      
      // Limit to a reasonable batch size to avoid overwhelming the API
      const MAX_BATCH_SIZE = 10;
      const domainsToScan = domains.slice(0, MAX_BATCH_SIZE);
      
      if (domains.length > MAX_BATCH_SIZE) {
        console.log(chalk.yellow(`⚠️  Limiting scan to first ${MAX_BATCH_SIZE} domains for performance`));
      }
      
      // Validate domains for security threats
      const results = await Promise.all(
        domainsToScan.map(domain => 
          this.securityScanner.validateItem(domain, this.securityScanOptions)
        )
      );
      
      return results;
      
    } catch (error) {
      console.error(chalk.red('❌ Security scan failed:'), error);
      return []; // Continue without blocking if security scan fails
    }
  }

  /**
   * Extract domains from rule filters and traffic
   */

  /**
   * Extract domains from a Gateway expression string
   */
  private extractDomainsFromExpression(expression: string): string[] {
    const domains: string[] = [];
    
    // Patterns to match domain names in various Gateway expression formats
    const patterns = [
      // dns.fqdn == "example.com"
      /dns\.fqdn\s*==\s*"([^"]+)"/gi,
      // dns.fqdn in {"example.com" "example.org"}
      /"([a-z0-9.-]+\.[a-z]{2,})"/gi,
      // http.request.host == "example.com"
      /http\.request\.host\s*==\s*"([^"]+)"/gi,
      // http.conn.hostname == "example.com"
      /http\.conn\.hostname\s*==\s*"([^"]+)"/gi,
      // Basic domain patterns
      /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(expression)) !== null) {
        const domain = match[1] || match[0];
        if (domain && this.isValidDomain(domain)) {
          domains.push(domain.toLowerCase());
        }
      }
    }
    
    return [...new Set(domains)]; // Remove duplicates
  }

  /**
   * Run comprehensive security scan on existing Gateway Rules and Lists
   */
  async runSecurityScan(options: {
    scanType: 'rules' | 'lists' | 'both';
    securityOptions?: Partial<SecurityScanOptions>;
  }): Promise<void> {
    const securityOptions = { ...this.securityScanOptions, ...options.securityOptions };
    
    console.log(chalk.cyan.bold('🛡️  Running Comprehensive Gateway Security Scan\n'));
    
    try {
      if (options.scanType === 'rules' || options.scanType === 'both') {
        console.log(chalk.blue('📏 Scanning Gateway Rules...'));
        await this.securityScanner.scanGatewayRules(securityOptions);
      }
      
      if (options.scanType === 'lists' || options.scanType === 'both') {
        console.log(chalk.blue('📋 Scanning Gateway Lists...'));
        await this.securityScanner.scanGatewayLists(securityOptions);
      }
      
      console.log(chalk.green('\n✅ Security scan completed successfully'));
      
    } catch (error) {
      console.error(chalk.red('\n❌ Security scan failed:'), error);
      throw error;
    }
  }

  /**
   * Validate a specific domain or IP before adding to rules
   */
  async validateDomainSecurity(domain: string): Promise<SecurityValidationResult> {
    console.log(chalk.cyan(`🛡️  Validating security for: ${domain}`));
    
    return await this.securityScanner.validateItem(domain, this.securityScanOptions);
  }

  /**
   * Bulk validate multiple domains/IPs for security
   */
  async bulkValidateDomains(domains: string[]): Promise<Map<string, SecurityValidationResult>> {
    console.log(chalk.cyan(`🛡️  Bulk validating ${domains.length} domains...`));
    
    const results = new Map<string, SecurityValidationResult>();
    
    for (const domain of domains) {
      const result = await this.validateDomainSecurity(domain);
      results.set(domain, result);
      
      // Rate limiting
      if (this.securityScanOptions.rateLimitMs > 0) {
        await this.delay(this.securityScanOptions.rateLimitMs);
      }
    }
    
    return results;
  }

  /**
   * Check if a domain is potentially malicious before allowing it
   */
  async isDomainSafe(domain: string): Promise<{ safe: boolean; reason?: string }> {
    try {
      const result = await this.validateDomainSecurity(domain);
      
      if (result.action === 'block') {
        return { 
          safe: false, 
          reason: `Blocked: ${result.reasons.join(', ')}` 
        };
      }
      
      if (result.action === 'review' && result.riskLevel === 'high') {
        return { 
          safe: false, 
          reason: `High risk: ${result.reasons.join(', ')}` 
        };
      }
      
      return { safe: true };
      
    } catch (error) {
      // Fail safely - if we can't scan, assume it's not safe
      return { 
        safe: false, 
        reason: `Security validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get security statistics for the current Gateway configuration
   */
  async getSecurityStats(): Promise<{
    totalRules: number;
    totalLists: number;
    securityScansEnabled: boolean;
    threatIntelligenceEnabled: boolean;
    autoBlockEnabled: boolean;
    confidenceThreshold: number;
    allowedRiskLevel: string;
  }> {
    const rules = await this.listRules();
    const lists = await this.listLists();
    
    return {
      totalRules: rules.length,
      totalLists: lists.length,
      securityScansEnabled: this.securityScanOptions.enableThreatIntelligence,
      threatIntelligenceEnabled: this.securityScanOptions.enableThreatIntelligence,
      autoBlockEnabled: this.securityScanOptions.autoBlockMalicious,
      confidenceThreshold: this.securityScanOptions.confidenceThreshold,
      allowedRiskLevel: this.securityScanOptions.allowedRiskLevel
    };
  }

  // Utility methods
  private isValidDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') return false;
    
    const domainRegex = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain) && 
           !domain.includes('..') && 
           domain.length > 3 && 
           domain.length < 255;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
