import { ThreatIntelligenceClient, ThreatIntelligenceResult } from './threat-intelligence-client.js';
import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, GatewayList } from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';

export interface SecurityScanOptions {
  enableThreatIntelligence: boolean;
  autoBlockMalicious: boolean;
  requireManualReview: boolean;
  confidenceThreshold: number; // 0-1
  allowedRiskLevel: 'low' | 'medium' | 'high';
  rateLimitMs: number;
  outputFile?: string;
}

export interface SecurityValidationResult {
  item: string;
  type: 'domain' | 'ip';
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  action: 'allow' | 'block' | 'review';
  threatIntelligence?: ThreatIntelligenceResult;
  reasons: string[];
  recommendations: string[];
}

export interface SecurityScanReport {
  summary: {
    totalScanned: number;
    allowed: number;
    blocked: number;
    requireReview: number;
    scanDuration: number;
    timestamp: string;
  };
  results: SecurityValidationResult[];
  riskBreakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  threatTypes: Map<string, number>;
  recommendations: string[];
}

export class SecurityScanner {
  private threatClient: ThreatIntelligenceClient;
  private gateway: GatewayClient;
  
  // Default security configuration
  private defaultOptions: SecurityScanOptions = {
    enableThreatIntelligence: true,
    autoBlockMalicious: true,
    requireManualReview: true, // Changed to require manual review by default
    confidenceThreshold: 0.7,
    allowedRiskLevel: 'low', // Changed to only auto-allow low risk by default
    rateLimitMs: 1000,
  };

  constructor() {
    this.threatClient = new ThreatIntelligenceClient();
    this.gateway = new GatewayClient();
  }

  /**
   * Validate a single domain or IP for security before allowing it in Gateway rules
   */
  async validateItem(item: string, options: Partial<SecurityScanOptions> = {}): Promise<SecurityValidationResult> {
    const config = { ...this.defaultOptions, ...options };
    
    console.log(chalk.cyan(`🛡️  Validating security for: ${item}`));

    const result: SecurityValidationResult = {
      item,
      type: this.isValidIP(item) ? 'ip' : 'domain',
      passed: false,
      riskLevel: 'medium',
      action: 'review',
      reasons: [],
      recommendations: []
    };

    try {
      if (config.enableThreatIntelligence) {
        // Perform threat intelligence scan
        const threatResult = result.type === 'ip' ? 
          await this.threatClient.scanIP(item) : 
          await this.threatClient.scanDomain(item);
        
        result.threatIntelligence = threatResult;
        
        // Analyze threat intelligence results
        this.analyzeThreatIntelligence(result, threatResult, config);
      } else {
        // Basic validation without threat intelligence
        result.passed = true;
        result.action = 'allow';
        result.riskLevel = 'low';
        result.reasons.push('Threat intelligence disabled - basic validation only');
      }

      // Additional security validations
      await this.performAdditionalValidations(result, config);

      // Final decision logic
      this.makeFinalDecision(result, config);

      console.log(this.formatValidationResult(result));
      return result;

    } catch (error) {
      console.error(chalk.red(`❌ Security validation failed for ${item}:`), error);
      
      // Fail safely - block on error
      result.passed = false;
      result.action = 'block';
      result.riskLevel = 'high';
      result.reasons.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.recommendations.push('Manual security review required due to validation failure');
      
      return result;
    }
  }

  /**
   * Bulk security validation for multiple items
   */
  async bulkValidate(items: string[], options: Partial<SecurityScanOptions> = {}): Promise<SecurityScanReport> {
    const config = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    const spinner = ora(`🛡️  Starting security scan of ${items.length} items...`).start();
    
    const report: SecurityScanReport = {
      summary: {
        totalScanned: items.length,
        allowed: 0,
        blocked: 0,
        requireReview: 0,
        scanDuration: 0,
        timestamp: new Date().toISOString()
      },
      results: [],
      riskBreakdown: { low: 0, medium: 0, high: 0, critical: 0 },
      threatTypes: new Map(),
      recommendations: []
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        spinner.text = `🛡️  Scanning ${item} (${i + 1}/${items.length})...`;
        
        const result = await this.validateItem(item, config);
        report.results.push(result);
        
        // Update summary statistics
        switch (result.action) {
          case 'allow':
            report.summary.allowed++;
            break;
          case 'block':
            report.summary.blocked++;
            break;
          case 'review':
            report.summary.requireReview++;
            break;
        }
        
        // Update risk breakdown
        report.riskBreakdown[result.riskLevel]++;
        
        // Track threat types
        if (result.threatIntelligence?.threats) {
          for (const threat of result.threatIntelligence.threats) {
            const count = report.threatTypes.get(threat.type) || 0;
            report.threatTypes.set(threat.type, count + 1);
          }
        }
        
        // Rate limiting
        if (config.rateLimitMs > 0 && i < items.length - 1) {
          await this.delay(config.rateLimitMs);
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Error validating ${item}:`), error);
        
        // Add error result
        report.results.push({
          item,
          type: this.isValidIP(item) ? 'ip' : 'domain',
          passed: false,
          riskLevel: 'high',
          action: 'block',
          reasons: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
          recommendations: ['Manual review required due to validation failure']
        });
        
        report.summary.blocked++;
        report.riskBreakdown.high++;
      }
    }

    report.summary.scanDuration = Date.now() - startTime;
    
    // Generate overall recommendations
    this.generateReportRecommendations(report);
    
    spinner.succeed(`🛡️  Security scan completed: ${report.summary.allowed} allowed, ${report.summary.blocked} blocked, ${report.summary.requireReview} require review`);
    
    // Display detailed results
    this.displayScanReport(report);
    
    // Save report if requested
    if (config.outputFile) {
      await this.saveScanReport(report, config.outputFile);
    }
    
    return report;
  }

  /**
   * Scan existing Gateway Lists for security issues
   */
  async scanGatewayLists(options: Partial<SecurityScanOptions> = {}): Promise<Map<string, SecurityScanReport>> {
    const config = { ...this.defaultOptions, ...options };
    const results = new Map<string, SecurityScanReport>();
    
    console.log(chalk.cyan.bold('🛡️  Scanning existing Gateway Lists for security issues...\n'));
    
    const lists = await this.gateway.listGatewayLists();
    const domainLists = lists.filter(list => list.type === 'DOMAIN');
    
    for (const list of domainLists) {
      console.log(chalk.yellow(`\n🔍 Scanning list: ${list.name} (${list.count || 0} items)`));
      
      try {
        const detailedList = await this.gateway.getGatewayList(list.id);
        
        if (!detailedList.items || detailedList.items.length === 0) {
          console.log(chalk.gray('   Empty list - skipping'));
          continue;
        }
        
        const domains = detailedList.items.map(item => item.value);
        const report = await this.bulkValidate(domains, {
          ...config,
          outputFile: config.outputFile ? `${list.name.replace(/[^a-zA-Z0-9]/g, '_')}_${config.outputFile}` : undefined
        });
        
        results.set(list.id, report);
        
      } catch (error) {
        console.error(chalk.red(`❌ Error scanning list ${list.name}:`), error);
      }
    }
    
    // Generate overall summary
    this.displayGatewayListsScanSummary(results);
    
    return results;
  }

  /**
   * Scan existing Gateway Rules for security issues in their filters
   */
  async scanGatewayRules(options: Partial<SecurityScanOptions> = {}): Promise<Map<string, SecurityScanReport>> {
    const config = { ...this.defaultOptions, ...options };
    const results = new Map<string, SecurityScanReport>();
    
    console.log(chalk.cyan.bold('🛡️  Scanning existing Gateway Rules for security issues...\n'));
    
    const rules = await this.gateway.listGatewayRules();
    
    for (const rule of rules) {
      console.log(chalk.yellow(`\n🔍 Scanning rule: ${rule.name}`));
      
      try {
        // Extract domains from rule traffic and filters
        const domains = this.extractDomainsFromRule(rule);
        
        if (domains.length === 0) {
          console.log(chalk.gray('   No domains found - skipping'));
          continue;
        }
        
        console.log(chalk.blue(`   Found ${domains.length} domains to scan`));
        
        const report = await this.bulkValidate(domains, {
          ...config,
          outputFile: config.outputFile ? `rule_${rule.name.replace(/[^a-zA-Z0-9]/g, '_')}_${config.outputFile}` : undefined
        });
        
        results.set(rule.id, report);
        
      } catch (error) {
        console.error(chalk.red(`❌ Error scanning rule ${rule.name}:`), error);
      }
    }
    
    // Generate overall summary
    this.displayGatewayRulesScanSummary(results);
    
    return results;
  }

  /**
   * Analyze threat intelligence results and update validation result
   */
  private analyzeThreatIntelligence(
    result: SecurityValidationResult, 
    threatResult: ThreatIntelligenceResult, 
    config: SecurityScanOptions
  ): void {
    // Check confidence threshold
    if (threatResult.confidence < config.confidenceThreshold) {
      result.reasons.push(`Low confidence threat intelligence (${Math.round(threatResult.confidence * 100)}%)`);
    }

    // Analyze reputation
    switch (threatResult.reputation) {
      case 'malicious':
        result.riskLevel = 'critical';
        result.action = config.autoBlockMalicious ? 'block' : 'review';
        result.reasons.push('Identified as malicious by threat intelligence');
        break;
        
      case 'suspicious':
        result.riskLevel = 'high';
        result.action = 'review';
        result.reasons.push('Identified as suspicious by threat intelligence');
        break;
        
      case 'trusted':
        if (threatResult.confidence > config.confidenceThreshold) {
          result.riskLevel = 'low';
          result.action = 'allow';
          result.passed = true;
          result.reasons.push('Verified as trusted by threat intelligence');
        }
        break;
        
      case 'unknown':
      default:
        result.riskLevel = 'medium';
        result.action = config.requireManualReview ? 'review' : 'allow';
        result.reasons.push('Unknown reputation - limited threat intelligence available');
        break;
    }

    // Analyze specific threats
    const highSeverityThreats = threatResult.threats.filter(t => t.severity === 'high' || t.severity === 'critical');
    const mediumSeverityThreats = threatResult.threats.filter(t => t.severity === 'medium');

    if (highSeverityThreats.length > 0) {
      result.riskLevel = 'critical';
      result.action = 'block';
      result.reasons.push(`${highSeverityThreats.length} high-severity threats detected`);
    } else if (mediumSeverityThreats.length > 2) {
      result.riskLevel = 'high';
      result.action = 'review';
      result.reasons.push(`${mediumSeverityThreats.length} medium-severity threats detected`);
    }

    // Copy recommendations from threat intelligence
    result.recommendations.push(...threatResult.recommendations);
  }

  /**
   * Perform additional security validations beyond threat intelligence
   */
  private async performAdditionalValidations(
    result: SecurityValidationResult, 
    config: SecurityScanOptions
  ): Promise<void> {
    // Domain length and pattern validation
    if (result.type === 'domain') {
      this.validateDomainPatterns(result);
    }
    
    // IP range validation
    if (result.type === 'ip') {
      this.validateIPRanges(result);
    }
    
    // Business policy compliance
    this.validateBusinessPolicy(result, config);
  }

  /**
   * Validate domain patterns for suspicious characteristics
   */
  private validateDomainPatterns(result: SecurityValidationResult): void {
    const domain = result.item;
    
    // Very long domains (potential DGA)
    if (domain.length > 50) {
      result.reasons.push('Unusually long domain name (potential DGA)');
      result.riskLevel = this.escalateRiskLevel(result.riskLevel);
    }
    
    // Many numbers in domain
    const numberCount = (domain.match(/\d/g) || []).length;
    if (numberCount > domain.length * 0.3) {
      result.reasons.push('High number density in domain (suspicious)');
    }
    
    // Many hyphens (potential typosquatting)
    const hyphenCount = (domain.match(/-/g) || []).length;
    if (hyphenCount > 3) {
      result.reasons.push('Multiple hyphens in domain (potential typosquatting)');
    }
  }

  /**
   * Validate IP addresses for suspicious ranges
   */
  private validateIPRanges(result: SecurityValidationResult): void {
    const ip = result.item;
    
    // Check for private/reserved ranges
    if (this.isPrivateIP(ip)) {
      result.reasons.push('Private IP address range');
      result.riskLevel = 'low';
    }
    
    if (this.isReservedIP(ip)) {
      result.reasons.push('Reserved IP address range');
      result.riskLevel = 'medium';
    }
  }

  /**
   * Validate against business policies
   */
  private validateBusinessPolicy(result: SecurityValidationResult, config: SecurityScanOptions): void {
    // Check risk level against allowed threshold
    const riskLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    const allowedLevel = riskLevels[config.allowedRiskLevel];
    const itemLevel = riskLevels[result.riskLevel];
    
    if (itemLevel > allowedLevel) {
      result.action = 'block';
      result.reasons.push(`Risk level (${result.riskLevel}) exceeds policy threshold (${config.allowedRiskLevel})`);
    }
  }

  /**
   * Make final decision based on all validation results
   */
  private makeFinalDecision(result: SecurityValidationResult, config: SecurityScanOptions): void {
    // Override logic for critical risks
    if (result.riskLevel === 'critical') {
      result.action = 'block';
      result.passed = false;
    } else if (result.action === 'allow') {
      result.passed = true;
    }
    
    // Add final recommendations
    switch (result.action) {
      case 'allow':
        result.recommendations.push('✅ Safe to allow in Gateway rules');
        break;
      case 'block':
        result.recommendations.push('❌ Should be blocked - security risks detected');
        break;
      case 'review':
        result.recommendations.push('⚠️  Requires manual security review before allowing');
        break;
    }
  }

  /**
   * Extract domains from Gateway Rule filters and traffic expressions
   */
  private extractDomainsFromRule(rule: GatewayRule): string[] {
    const domains = new Set<string>();
    
    // Extract from traffic expression
    if (rule.traffic) {
      const trafficDomains = this.extractDomainsFromExpression(rule.traffic);
      trafficDomains.forEach(domain => domains.add(domain));
    }
    
    // Extract from filters (legacy)
    if (rule.filters && Array.isArray(rule.filters)) {
      for (const filter of rule.filters) {
        if (typeof filter === 'string') {
          const filterDomains = this.extractDomainsFromExpression(filter);
          filterDomains.forEach(domain => domains.add(domain));
        }
      }
    }
    
    return Array.from(domains);
  }

  /**
   * Extract domains from a Gateway expression string
   */
  private extractDomainsFromExpression(expression: string): string[] {
    const domains: string[] = [];
    
    // Pattern to match domain names in various formats
    const patterns = [
      // dns.fqdn == "example.com"
      /dns\.fqdn\s*==\s*"([^"]+)"/gi,
      // dns.fqdn in {"example.com" "example.org"}
      /dns\.fqdn\s+in\s+\{[^}]*"([^"]+)"/gi,
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
   * Generate report recommendations based on scan results
   */
  private generateReportRecommendations(report: SecurityScanReport): void {
    const { summary, riskBreakdown, threatTypes } = report;
    
    if (summary.blocked > 0) {
      report.recommendations.push(`🚨 ${summary.blocked} items should be blocked due to security risks`);
    }
    
    if (summary.requireReview > 0) {
      report.recommendations.push(`⚠️  ${summary.requireReview} items require manual security review`);
    }
    
    if (riskBreakdown.critical > 0) {
      report.recommendations.push(`🔥 ${riskBreakdown.critical} critical risk items detected - immediate action required`);
    }
    
    if (riskBreakdown.high > summary.totalScanned * 0.1) {
      report.recommendations.push('📈 High proportion of high-risk items - consider tightening security policies');
    }
    
    // Threat type recommendations
    const topThreat = Array.from(threatTypes.entries()).reduce((max, [type, count]) => 
      count > (max[1] || 0) ? [type, count] : max, ['', 0] as [string, number]);
    
    if (topThreat[1] > 0) {
      report.recommendations.push(`🎯 Most common threat type: ${topThreat[0]} (${topThreat[1]} instances)`);
    }
  }

  /**
   * Display detailed scan report
   */
  private displayScanReport(report: SecurityScanReport): void {
    console.log(chalk.cyan.bold('\n📊 Security Scan Report\n'));
    
    console.log(chalk.blue('Summary:'));
    console.log(`  Total Scanned: ${report.summary.totalScanned}`);
    console.log(`  ${chalk.green(`✅ Allowed: ${report.summary.allowed}`)}`);
    console.log(`  ${chalk.red(`❌ Blocked: ${report.summary.blocked}`)}`);
    console.log(`  ${chalk.yellow(`⚠️  Require Review: ${report.summary.requireReview}`)}`);
    console.log(`  Scan Duration: ${(report.summary.scanDuration / 1000).toFixed(1)}s`);
    
    console.log(chalk.blue('\nRisk Breakdown:'));
    console.log(`  ${chalk.blue(`Low: ${report.riskBreakdown.low}`)}`);
    console.log(`  ${chalk.yellow(`Medium: ${report.riskBreakdown.medium}`)}`);
    console.log(`  ${chalk.red(`High: ${report.riskBreakdown.high}`)}`);
    console.log(`  ${chalk.red(`Critical: ${report.riskBreakdown.critical}`)}`);
    
    if (report.threatTypes.size > 0) {
      console.log(chalk.blue('\nThreat Types:'));
      for (const [type, count] of report.threatTypes.entries()) {
        console.log(`  ${type}: ${count}`);
      }
    }
    
    if (report.recommendations.length > 0) {
      console.log(chalk.cyan('\n💡 Recommendations:'));
      for (const recommendation of report.recommendations) {
        console.log(`  ${recommendation}`);
      }
    }
  }

  /**
   * Display Gateway Lists scan summary
   */
  private displayGatewayListsScanSummary(results: Map<string, SecurityScanReport>): void {
    console.log(chalk.cyan.bold('\n🏁 Gateway Lists Security Scan Summary\n'));
    
    let totalItems = 0;
    let totalBlocked = 0;
    let totalReview = 0;
    
    for (const [listId, report] of results) {
      totalItems += report.summary.totalScanned;
      totalBlocked += report.summary.blocked;
      totalReview += report.summary.requireReview;
    }
    
    console.log(`📋 Lists Scanned: ${results.size}`);
    console.log(`📊 Total Items: ${totalItems}`);
    console.log(`${chalk.red(`❌ Total Blocked: ${totalBlocked}`)}`);
    console.log(`${chalk.yellow(`⚠️  Total Require Review: ${totalReview}`)}`);
    
    if (totalBlocked > 0 || totalReview > 0) {
      console.log(chalk.yellow('\n⚠️  Action Required: Some domains in your Gateway Lists have security issues'));
      console.log('   Consider removing or reviewing flagged domains');
    } else {
      console.log(chalk.green('\n✅ All Gateway Lists passed security validation'));
    }
  }

  /**
   * Display Gateway Rules scan summary
   */
  private displayGatewayRulesScanSummary(results: Map<string, SecurityScanReport>): void {
    console.log(chalk.cyan.bold('\n🏁 Gateway Rules Security Scan Summary\n'));
    
    let totalItems = 0;
    let totalBlocked = 0;
    let totalReview = 0;
    
    for (const [ruleId, report] of results) {
      totalItems += report.summary.totalScanned;
      totalBlocked += report.summary.blocked;
      totalReview += report.summary.requireReview;
    }
    
    console.log(`📏 Rules Scanned: ${results.size}`);
    console.log(`📊 Total Items: ${totalItems}`);
    console.log(`${chalk.red(`❌ Total Blocked: ${totalBlocked}`)}`);
    console.log(`${chalk.yellow(`⚠️  Total Require Review: ${totalReview}`)}`);
  }

  /**
   * Format validation result for display
   */
  private formatValidationResult(result: SecurityValidationResult): string {
    const statusIcon = result.action === 'allow' ? '✅' : 
                      result.action === 'block' ? '❌' : '⚠️ ';
    
    const riskColor = result.riskLevel === 'low' ? chalk.blue :
                     result.riskLevel === 'medium' ? chalk.yellow :
                     result.riskLevel === 'high' ? chalk.red : chalk.red;
    
    let output = `${statusIcon} ${result.item}: ${result.action.toUpperCase()} (${riskColor(result.riskLevel)} risk)`;
    
    if (result.reasons.length > 0) {
      output += `\n  Reasons: ${result.reasons.join(', ')}`;
    }
    
    return output;
  }

  /**
   * Save scan report to file
   */
  private async saveScanReport(report: SecurityScanReport, filename: string): Promise<void> {
    try {
      const reportData = {
        ...report,
        threatTypes: Object.fromEntries(report.threatTypes)
      };
      
      await fs.writeFile(filename, JSON.stringify(reportData, null, 2));
      console.log(chalk.green(`📄 Report saved to: ${filename}`));
    } catch (error) {
      console.error(chalk.red('❌ Error saving report:'), error);
    }
  }

  // Utility methods
  private escalateRiskLevel(currentLevel: 'low' | 'medium' | 'high' | 'critical'): 'low' | 'medium' | 'high' | 'critical' {
    const levels = { low: 'medium', medium: 'high', high: 'critical', critical: 'critical' };
    return levels[currentLevel];
  }

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain) && !domain.includes('..') && domain.length > 3;
  }

  private isValidIP(input: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(input) || ipv6Regex.test(input);
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./
    ];
    
    return privateRanges.some(range => range.test(ip));
  }

  private isReservedIP(ip: string): boolean {
    const reservedRanges = [
      /^0\./,
      /^224\./,
      /^240\./
    ];
    
    return reservedRanges.some(range => range.test(ip));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
