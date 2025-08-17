#!/usr/bin/env npx tsx

import { SecurityScanner, SecurityValidationResult } from './security-scanner.js';
import { ThreatIntelligenceResult, OSINTAnalysis } from './threat-intelligence-client.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

export interface SecurityApprovalDecision {
  item: string;
  decision: 'approve' | 'reject' | 'skip';
  reasoning?: string;
  reviewedBy: string;
  reviewDate: string;
}

export interface InteractiveReviewOptions {
  requireApprovalForRisk: 'low' | 'medium' | 'high' | 'critical';
  autoApproveBelow: 'none' | 'low' | 'medium' | 'high';
  showFullOSINT: boolean;
  batchMode: boolean;
  reviewer: string;
}

export class InteractiveSecurityReviewer {
  private scanner: SecurityScanner;
  private decisions: Map<string, SecurityApprovalDecision> = new Map();
  
  private defaultOptions: InteractiveReviewOptions = {
    requireApprovalForRisk: 'medium',
    autoApproveBelow: 'low',
    showFullOSINT: true,
    batchMode: false,
    reviewer: 'Unknown Reviewer'
  };

  constructor() {
    this.scanner = new SecurityScanner();
  }

  /**
   * Process domains with interactive security review
   */
  async processDomainsWithReview(
    domains: string[], 
    options: Partial<InteractiveReviewOptions> = {}
  ): Promise<{
    approved: string[];
    rejected: string[];
    skipped: string[];
    decisions: SecurityApprovalDecision[];
  }> {
    const config = { ...this.defaultOptions, ...options };
    
    console.log(chalk.cyan.bold('\n🛡️  Interactive Security Review\n'));
    console.log(chalk.blue(`Reviewer: ${config.reviewer}`));
    console.log(chalk.blue(`Review Threshold: ${config.requireApprovalForRisk}+ risk levels`));
    console.log(chalk.blue(`Auto-approve Below: ${config.autoApproveBelow === 'none' ? 'None' : config.autoApproveBelow}`));
    console.log('─'.repeat(60));

    const approved: string[] = [];
    const rejected: string[] = [];
    const skipped: string[] = [];
    const decisions: SecurityApprovalDecision[] = [];

    let spinner = ora('Starting security validation...').start();

    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      
      try {
        spinner.text = `Validating ${domain} (${i + 1}/${domains.length})...`;
        
        // Perform security scan
        const validation = await this.scanner.validateItem(domain, {
          enableThreatIntelligence: true,
          requireManualReview: true,
          allowedRiskLevel: 'low'
        });

        spinner.succeed(`Scan completed for ${domain}`);
        
        // Determine if manual review is required
        const needsReview = this.needsManualReview(validation, config);
        
        if (!needsReview) {
          // Auto-approve
          approved.push(domain);
          decisions.push({
            item: domain,
            decision: 'approve',
            reasoning: 'Auto-approved - below review threshold',
            reviewedBy: 'System',
            reviewDate: new Date().toISOString()
          });
          
          console.log(chalk.green(`✅ Auto-approved: ${domain} (${validation.riskLevel} risk)\n`));
          
        } else {
          // Display comprehensive security analysis
          this.displaySecurityAnalysis(domain, validation, config);
          
          // Get user decision
          const decision = await this.getUserDecision(domain, validation);
          
          switch (decision.decision) {
            case 'approve':
              approved.push(domain);
              break;
            case 'reject':
              rejected.push(domain);
              break;
            case 'skip':
              skipped.push(domain);
              break;
          }
          
          decisions.push(decision);
          
          console.log('─'.repeat(60));
        }
        
        // Rate limiting between scans
        if (i < domains.length - 1) {
          spinner = ora('Preparing next scan...').start();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        spinner.fail(`Error processing ${domain}`);
        console.error(chalk.red(`❌ Error processing ${domain}:`), error);
        
        // Default to rejection on error
        rejected.push(domain);
        decisions.push({
          item: domain,
          decision: 'reject',
          reasoning: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          reviewedBy: config.reviewer,
          reviewDate: new Date().toISOString()
        });
      }
    }

    // Display final summary
    this.displayReviewSummary(approved, rejected, skipped, decisions);

    return {
      approved,
      rejected,
      skipped,
      decisions
    };
  }

  /**
   * Determine if a domain needs manual review based on validation and config
   */
  private needsManualReview(validation: SecurityValidationResult, config: InteractiveReviewOptions): boolean {
    const riskLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    
    const itemRiskLevel = riskLevels[validation.riskLevel];
    const reviewThreshold = riskLevels[config.requireApprovalForRisk];
    const autoApproveThreshold = config.autoApproveBelow === 'none' ? 0 : riskLevels[config.autoApproveBelow];
    
    // Always review critical items
    if (validation.riskLevel === 'critical') {
      return true;
    }
    
    // Auto-approve if below threshold
    if (itemRiskLevel <= autoApproveThreshold) {
      return false;
    }
    
    // Review if at or above review threshold
    return itemRiskLevel >= reviewThreshold;
  }

  /**
   * Display comprehensive security analysis for a domain
   */
  private displaySecurityAnalysis(
    domain: string, 
    validation: SecurityValidationResult,
    config: InteractiveReviewOptions
  ): void {
    console.log(chalk.cyan.bold(`\n🔍 Security Analysis: ${domain}`));
    console.log('═'.repeat(80));
    
    // Basic validation info
    const riskColor = validation.riskLevel === 'low' ? chalk.blue :
                     validation.riskLevel === 'medium' ? chalk.yellow :
                     validation.riskLevel === 'high' ? chalk.red : chalk.red;
    
    console.log(chalk.white.bold('📋 Basic Assessment:'));
    console.log(`   Risk Level: ${riskColor(validation.riskLevel.toUpperCase())}`);
    console.log(`   Recommended Action: ${this.getActionIcon(validation.action)} ${validation.action.toUpperCase()}`);
    
    if (validation.reasons.length > 0) {
      console.log(chalk.white.bold('\n🚨 Security Concerns:'));
      validation.reasons.forEach(reason => {
        console.log(`   • ${reason}`);
      });
    }
    
    // Threat Intelligence Summary
    if (validation.threatIntelligence) {
      this.displayThreatIntelligenceSummary(validation.threatIntelligence);
      
      // Full OSINT Analysis if enabled
      if (config.showFullOSINT && validation.threatIntelligence.osintAnalysis) {
        this.displayOSINTAnalysis(validation.threatIntelligence.osintAnalysis);
      }
    }
    
    // Recommendations
    if (validation.recommendations.length > 0) {
      console.log(chalk.white.bold('\n💡 Recommendations:'));
      validation.recommendations.forEach(rec => {
        console.log(`   ${rec}`);
      });
    }
    
    console.log('═'.repeat(80));
  }

  /**
   * Display threat intelligence summary
   */
  private displayThreatIntelligenceSummary(threat: ThreatIntelligenceResult): void {
    const reputationColor = threat.reputation === 'trusted' ? chalk.green :
                           threat.reputation === 'suspicious' ? chalk.yellow :
                           threat.reputation === 'malicious' ? chalk.red : chalk.gray;
    
    console.log(chalk.white.bold('\n🔍 Threat Intelligence:'));
    console.log(`   Reputation: ${reputationColor(threat.reputation.toUpperCase())} (${Math.round(threat.confidence * 100)}% confidence)`);
    
    if (threat.sources.length > 0) {
      console.log(`   Sources: ${threat.sources.map(s => s.name).join(', ')}`);
    }
    
    if (threat.threats.length > 0) {
      console.log(chalk.white.bold('\n⚠️  Detected Threats:'));
      threat.threats.forEach(t => {
        const severityColor = t.severity === 'critical' ? chalk.red :
                             t.severity === 'high' ? chalk.red :
                             t.severity === 'medium' ? chalk.yellow : chalk.blue;
        console.log(`   • ${severityColor(t.severity.toUpperCase())}: ${t.description} (${t.source})`);
      });
    }
  }

  /**
   * Display comprehensive OSINT analysis
   */
  private displayOSINTAnalysis(osint: OSINTAnalysis): void {
    console.log(chalk.white.bold('\n🔎 OSINT Analysis:'));
    
    // WHOIS Information
    if (osint.whoisData) {
      console.log(chalk.yellow.bold('\n   📄 WHOIS Information:'));
      if (osint.whoisData.registrar) {
        console.log(`      Registrar: ${osint.whoisData.registrar}`);
      }
      if (osint.whoisData.registrationDate) {
        const regDate = new Date(osint.whoisData.registrationDate);
        const daysAgo = Math.floor((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`      Registration: ${osint.whoisData.registrationDate} (${daysAgo} days ago)`);
      }
      if (osint.whoisData.expirationDate) {
        console.log(`      Expiration: ${osint.whoisData.expirationDate}`);
      }
      if (osint.whoisData.registrantOrganization) {
        console.log(`      Organization: ${osint.whoisData.registrantOrganization}`);
      }
      if (osint.whoisData.privacyProtection) {
        console.log(chalk.yellow('      Privacy Protection: ENABLED'));
      }
    }
    
    // DNS Records
    if (osint.dnsRecords) {
      console.log(chalk.yellow.bold('\n   🌐 DNS Records:'));
      if (osint.dnsRecords.A) {
        console.log(`      A Records: ${osint.dnsRecords.A.join(', ')}`);
      }
      if (osint.dnsRecords.MX) {
        console.log(`      MX Records: ${osint.dnsRecords.MX.join(', ')}`);
      }
      if (osint.dnsRecords.NS) {
        console.log(`      Name Servers: ${osint.dnsRecords.NS.join(', ')}`);
      }
    }
    
    // Geolocation (for IPs)
    if (osint.geolocation) {
      console.log(chalk.yellow.bold('\n   🌍 Geolocation:'));
      if (osint.geolocation.country) {
        console.log(`      Country: ${osint.geolocation.country}`);
      }
      if (osint.geolocation.region) {
        console.log(`      Region: ${osint.geolocation.region}, ${osint.geolocation.city}`);
      }
      if (osint.geolocation.isp) {
        console.log(`      ISP: ${osint.geolocation.isp}`);
      }
      if (osint.geolocation.asn) {
        console.log(`      ASN: AS${osint.geolocation.asn} (${osint.geolocation.asnOrganization})`);
      }
    }
    
    // Certificate Information
    if (osint.certificates) {
      console.log(chalk.yellow.bold('\n   🔒 Certificate Information:'));
      if (osint.certificates.issuer) {
        console.log(`      Issuer: ${osint.certificates.issuer}`);
      }
      if (osint.certificates.validFrom && osint.certificates.validTo) {
        console.log(`      Validity: ${osint.certificates.validFrom} to ${osint.certificates.validTo}`);
      }
      if (osint.certificates.subjectAlternativeNames) {
        console.log(`      SANs: ${osint.certificates.subjectAlternativeNames.join(', ')}`);
      }
    }
    
    // Business Information
    if (osint.businessInfo) {
      console.log(chalk.yellow.bold('\n   🏢 Business Information:'));
      if (osint.businessInfo.companyName) {
        console.log(`      Company: ${osint.businessInfo.companyName}`);
      }
      if (osint.businessInfo.industry) {
        console.log(`      Industry: ${osint.businessInfo.industry}`);
      }
      if (osint.businessInfo.employeeCount) {
        console.log(`      Employees: ${osint.businessInfo.employeeCount}`);
      }
      if (osint.businessInfo.founded) {
        console.log(`      Founded: ${osint.businessInfo.founded}`);
      }
    }
    
    // Subdomains
    if (osint.subdomains && osint.subdomains.length > 0) {
      console.log(chalk.yellow.bold('\n   🌿 Discovered Subdomains:'));
      osint.subdomains.slice(0, 10).forEach(subdomain => {
        console.log(`      • ${subdomain}`);
      });
      if (osint.subdomains.length > 10) {
        console.log(`      ... and ${osint.subdomains.length - 10} more`);
      }
    }
    
    // Risk Factors
    if (osint.riskFactors && osint.riskFactors.length > 0) {
      console.log(chalk.yellow.bold('\n   ⚠️  Risk Factors:'));
      osint.riskFactors.forEach(risk => {
        const severityColor = risk.severity === 'critical' ? chalk.red :
                             risk.severity === 'high' ? chalk.red :
                             risk.severity === 'medium' ? chalk.yellow : chalk.blue;
        console.log(`      • ${severityColor(risk.severity.toUpperCase())}: ${risk.description}`);
        console.log(`        Evidence: ${risk.evidence}`);
      });
    }
  }

  /**
   * Get user decision for a domain
   */
  private async getUserDecision(
    domain: string, 
    validation: SecurityValidationResult
  ): Promise<SecurityApprovalDecision> {
    const questions = [
      {
        type: 'list',
        name: 'decision',
        message: `Decision for ${chalk.cyan(domain)}:`,
        choices: [
          {
            name: `${chalk.green('✅ Approve')} - Add to allow list`,
            value: 'approve'
          },
          {
            name: `${chalk.red('❌ Reject')} - Block/skip this domain`,
            value: 'reject'
          },
          {
            name: `${chalk.yellow('⏭️  Skip')} - Review later`,
            value: 'skip'
          }
        ],
        default: validation.riskLevel === 'low' ? 'approve' : 'reject'
      },
      {
        type: 'input',
        name: 'reasoning',
        message: 'Reasoning (optional):',
        when: (answers: any) => answers.decision !== 'skip'
      }
    ];

    const answers = await inquirer.prompt(questions);
    
    return {
      item: domain,
      decision: answers.decision,
      reasoning: answers.reasoning || undefined,
      reviewedBy: this.defaultOptions.reviewer,
      reviewDate: new Date().toISOString()
    };
  }

  /**
   * Display final review summary
   */
  private displayReviewSummary(
    approved: string[], 
    rejected: string[], 
    skipped: string[], 
    decisions: SecurityApprovalDecision[]
  ): void {
    console.log(chalk.cyan.bold('\n📊 Review Summary'));
    console.log('═'.repeat(60));
    
    console.log(`${chalk.green('✅ Approved:')} ${approved.length}`);
    if (approved.length > 0) {
      approved.forEach(domain => {
        console.log(`   • ${domain}`);
      });
    }
    
    console.log(`${chalk.red('\n❌ Rejected:')} ${rejected.length}`);
    if (rejected.length > 0) {
      rejected.forEach(domain => {
        console.log(`   • ${domain}`);
      });
    }
    
    console.log(`${chalk.yellow('\n⏭️  Skipped:')} ${skipped.length}`);
    if (skipped.length > 0) {
      skipped.forEach(domain => {
        console.log(`   • ${domain}`);
      });
    }
    
    console.log(chalk.cyan.bold('\nNext Steps:'));
    if (approved.length > 0) {
      console.log('• Add approved domains to appropriate Gateway Lists');
    }
    if (rejected.length > 0) {
      console.log('• Consider adding rejected domains to block lists if needed');
    }
    if (skipped.length > 0) {
      console.log('• Review skipped domains at a later time');
    }
  }

  /**
   * Get action icon for display
   */
  private getActionIcon(action: string): string {
    switch (action) {
      case 'allow': return '✅';
      case 'block': return '❌';
      case 'review': return '⚠️ ';
      default: return '❓';
    }
  }
}
