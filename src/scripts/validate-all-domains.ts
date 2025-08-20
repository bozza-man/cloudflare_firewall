#!/usr/bin/env tsx
import { GatewayClient } from '../api/gateway-client.js';
import { ThreatIntelligenceClient } from '../security/threat-intelligence-client.js';
import { validationResultsManager } from '../security/validation-results-manager.js';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import ora from 'ora';
import { GatewayList, GatewayRule } from '../types/gateway.js';

interface ValidationStats {
  totalDomains: number;
  totalRules: number;
  totalLists: number;
  validatedDomains: number;
  trusted: number;
  suspicious: number;
  malicious: number;
  unknown: number;
  errors: number;
}

class ComprehensiveValidator {
  private client: GatewayClient;
  private threatClient: ThreatIntelligenceClient;
  private stats: ValidationStats;
  private allDomains: Set<string>;
  private validationResults: Map<string, any>;
  private spinner: any;

  constructor() {
    this.client = new GatewayClient(config.accountId);
    this.threatClient = new ThreatIntelligenceClient();
    this.stats = {
      totalDomains: 0,
      totalRules: 0,
      totalLists: 0,
      validatedDomains: 0,
      trusted: 0,
      suspicious: 0,
      malicious: 0,
      unknown: 0,
      errors: 0
    };
    this.allDomains = new Set<string>();
    this.validationResults = new Map();
  }

  async run() {
    console.log(chalk.cyan.bold('\n🔍 COMPREHENSIVE DOMAIN VALIDATION'));
    console.log(chalk.cyan('=' .repeat(60)));
    console.log(chalk.white('This will validate all domains across your Gateway configuration'));
    console.log(chalk.yellow('⚠️  This may take several minutes depending on the number of domains\n'));

    try {
      // Step 1: Collect all domains
      await this.collectAllDomains();
      
      // Step 2: Validate all domains
      await this.validateAllDomains();
      
      // Step 3: Update rules and lists with validation metadata
      await this.updateRulesAndLists();
      
      // Step 4: Generate comprehensive report
      await this.generateReport();
      
      // Step 5: Create master validated list
      await this.createMasterList();
      
      console.log(chalk.green.bold('\n✅ Validation complete!'));
      this.printSummary();
      
    } catch (error) {
      console.error(chalk.red('\n❌ Validation failed:'), error);
    }
  }

  private async collectAllDomains() {
    this.spinner = ora('Collecting domains from rules and lists...').start();
    
    try {
      // Collect from rules
      const rules = await this.client.listGatewayRules();
      this.stats.totalRules = rules.length;
      
      for (const rule of rules) {
        const domains = this.extractDomainsFromRule(rule);
        domains.forEach(d => this.allDomains.add(d));
      }
      
      // Collect from lists
      const lists = await this.client.listGatewayLists();
      this.stats.totalLists = lists.length;
      
      for (const list of lists) {
        if (list.type === 'DOMAIN') {
          const fullList = await this.client.getGatewayList(list.id);
          if (fullList.items) {
            fullList.items.forEach(item => {
              if (this.isValidDomain(item.value)) {
                this.allDomains.add(item.value.toLowerCase());
              }
            });
          }
        }
      }
      
      this.stats.totalDomains = this.allDomains.size;
      this.spinner.succeed(`Collected ${chalk.green(this.stats.totalDomains)} unique domains from ${chalk.blue(this.stats.totalRules)} rules and ${chalk.blue(this.stats.totalLists)} lists`);
      
    } catch (error) {
      this.spinner.fail('Failed to collect domains');
      throw error;
    }
  }

  private extractDomainsFromRule(rule: GatewayRule): string[] {
    const domains: string[] = [];
    
    // Parse traffic filter for domains
    if (rule.traffic) {
      // Extract domains from various filter patterns
      const patterns = [
        /http\.request\.host\s*==\s*"([^"]+)"/g,
        /http\.request\.host\s+in\s+\{([^}]+)\}/g,
        /dns\.fqdn\s*==\s*"([^"]+)"/g,
        /dns\.fqdn\s+in\s+\{([^}]+)\}/g,
        /http\.request\.host\s+matches\s+"([^"]+)"/g,
        /dns\.fqdn\s+matches\s+"([^"]+)"/g
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(rule.traffic)) !== null) {
          if (match[1]) {
            // Handle sets of domains
            if (match[1].includes('"')) {
              const domainList = match[1].match(/"([^"]+)"/g);
              if (domainList) {
                domainList.forEach(d => {
                  const domain = d.replace(/"/g, '').trim();
                  if (this.isValidDomain(domain)) {
                    domains.push(domain.toLowerCase());
                  }
                });
              }
            } else {
              const domain = match[1].trim();
              if (this.isValidDomain(domain)) {
                domains.push(domain.toLowerCase());
              }
            }
          }
        }
      }
      
      // Extract list references
      const listPattern = /\$([a-f0-9-]+)/g;
      let listMatch;
      while ((listMatch = listPattern.exec(rule.traffic)) !== null) {
        // We'll handle list references separately
      }
    }
    
    return domains;
  }

  private isValidDomain(domain: string): boolean {
    // Filter out wildcards, IPs, and invalid patterns
    if (!domain || 
        domain.includes('*') || 
        domain.includes('$') ||
        domain.includes('\\') ||
        domain.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) ||
        domain.length < 3 ||
        !domain.includes('.')) {
      return false;
    }
    return true;
  }

  private async validateAllDomains() {
    if (this.allDomains.size === 0) {
      console.log(chalk.yellow('No domains found to validate'));
      return;
    }
    
    console.log(chalk.cyan(`\n📊 Validating ${this.allDomains.size} domains...\n`));
    
    const domains = Array.from(this.allDomains);
    const batchSize = 10; // Process in batches to avoid overwhelming
    
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, Math.min(i + batchSize, domains.length));
      const progress = Math.round((i / domains.length) * 100);
      
      this.spinner = ora({
        text: `Validating domains... ${progress}% (${i}/${domains.length})`,
        spinner: 'dots'
      }).start();
      
      // Validate batch in parallel
      const batchPromises = batch.map(async domain => {
        try {
          const result = await this.threatClient.scanDomain(domain);
          this.validationResults.set(domain, result);
          this.stats.validatedDomains++;
          
          // Update stats
          switch (result.reputation) {
            case 'trusted':
              this.stats.trusted++;
              break;
            case 'suspicious':
              this.stats.suspicious++;
              break;
            case 'malicious':
              this.stats.malicious++;
              break;
            default:
              this.stats.unknown++;
          }
          
          // Log high-risk findings immediately
          if (result.reputation === 'malicious') {
            this.spinner.stop();
            console.log(chalk.red(`   ❌ MALICIOUS: ${domain}`));
            if (result.threats.length > 0) {
              result.threats.forEach(threat => {
                console.log(chalk.red(`      → ${threat.description}`));
              });
            }
            this.spinner.start();
          } else if (result.reputation === 'suspicious' && result.confidence > 0.7) {
            this.spinner.stop();
            console.log(chalk.yellow(`   ⚠️  SUSPICIOUS: ${domain} (${Math.round(result.confidence * 100)}% confidence)`));
            this.spinner.start();
          }
          
        } catch (error) {
          console.error(chalk.red(`   ❌ Error validating ${domain}:`, error));
          this.stats.errors++;
        }
      });
      
      await Promise.all(batchPromises);
      
      // Rate limiting between batches
      if (i + batchSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    this.spinner.succeed(`Validated ${chalk.green(this.stats.validatedDomains)} domains`);
  }

  private async updateRulesAndLists() {
    this.spinner = ora('Updating rules and lists with validation metadata...').start();
    
    try {
      // Update lists with validation data
      const lists = await this.client.listGatewayLists();
      
      for (const list of lists) {
        if (list.type === 'DOMAIN') {
          const fullList = await this.client.getGatewayList(list.id);
          const listDomains = new Map();
          
          if (fullList.items) {
            for (const item of fullList.items) {
              const domain = item.value.toLowerCase();
              if (this.validationResults.has(domain)) {
                listDomains.set(domain, this.validationResults.get(domain));
              }
            }
          }
          
          if (listDomains.size > 0) {
            await validationResultsManager.saveToList(list.id, listDomains);
            this.spinner.stop();
            console.log(chalk.green(`   ✅ Updated list "${list.name}" with validation data`));
            this.spinner.start();
          }
        }
      }
      
      // Update rules with validation summaries
      const rules = await this.client.listGatewayRules();
      
      for (const rule of rules) {
        const ruleDomains = this.extractDomainsFromRule(rule);
        const ruleValidations = new Map();
        
        for (const domain of ruleDomains) {
          if (this.validationResults.has(domain)) {
            ruleValidations.set(domain, this.validationResults.get(domain));
          }
        }
        
        if (ruleValidations.size > 0) {
          await validationResultsManager.saveToRule(rule.id, ruleValidations);
          this.spinner.stop();
          console.log(chalk.green(`   ✅ Updated rule "${rule.name}" with validation data`));
          this.spinner.start();
        }
      }
      
      this.spinner.succeed('Updated all rules and lists with validation metadata');
      
    } catch (error) {
      this.spinner.fail('Failed to update some rules/lists');
      console.error(chalk.red('Update error:'), error);
    }
  }

  private async generateReport() {
    console.log('\n' + validationResultsManager.generateReport(this.validationResults));
    
    // Additional detailed findings
    if (this.stats.malicious > 0) {
      console.log(chalk.red.bold('\n🚨 CRITICAL FINDINGS - MALICIOUS DOMAINS:'));
      for (const [domain, result] of this.validationResults) {
        if (result.reputation === 'malicious') {
          console.log(chalk.red(`   • ${domain}`));
          if (result.details.organization) {
            console.log(chalk.gray(`     Organization: ${result.details.organization}`));
          }
          if (result.threats.length > 0) {
            result.threats.forEach(threat => {
              console.log(chalk.red(`     → ${threat.severity.toUpperCase()}: ${threat.description}`));
            });
          }
        }
      }
    }
    
    if (this.stats.suspicious > 0) {
      console.log(chalk.yellow.bold('\n⚠️  WARNING - SUSPICIOUS DOMAINS:'));
      let count = 0;
      for (const [domain, result] of this.validationResults) {
        if (result.reputation === 'suspicious' && count < 10) {
          console.log(chalk.yellow(`   • ${domain} (${Math.round(result.confidence * 100)}% confidence)`));
          if (result.details.organization) {
            console.log(chalk.gray(`     Organization: ${result.details.organization}`));
          }
          count++;
        }
      }
      if (this.stats.suspicious > 10) {
        console.log(chalk.yellow(`   ... and ${this.stats.suspicious - 10} more suspicious domains`));
      }
    }
  }

  private async createMasterList() {
    this.spinner = ora('Creating master validated domains list...').start();
    
    try {
      // Check if master list already exists
      const lists = await this.client.listGatewayLists();
      const existingMaster = lists.find(l => l.name === 'Master Validated Domains');
      
      if (existingMaster) {
        // Update existing master list
        await validationResultsManager.saveToList(existingMaster.id, this.validationResults);
        this.spinner.succeed(`Updated master list with ${this.validationResults.size} validated domains`);
      } else {
        // Create new master list
        const listId = await validationResultsManager.createValidatedList(
          'Master Validated Domains',
          this.validationResults,
          'DOMAIN'
        );
        
        if (listId) {
          this.spinner.succeed(`Created master list with ${this.validationResults.size} validated domains`);
        } else {
          this.spinner.fail('Failed to create master list');
        }
      }
      
    } catch (error) {
      this.spinner.fail('Failed to create/update master list');
      console.error(chalk.red('Master list error:'), error);
    }
  }

  private printSummary() {
    console.log(chalk.cyan('\n' + '=' .repeat(60)));
    console.log(chalk.cyan.bold('📊 VALIDATION SUMMARY'));
    console.log(chalk.cyan('=' .repeat(60)));
    
    console.log(chalk.white('\n📈 Statistics:'));
    console.log(`   Total Domains Scanned: ${chalk.bold(this.stats.totalDomains)}`);
    console.log(`   Successfully Validated: ${chalk.bold(this.stats.validatedDomains)}`);
    console.log(`   Errors: ${chalk.bold(this.stats.errors)}`);
    
    console.log(chalk.white('\n🔍 Results:'));
    const trustedPct = Math.round((this.stats.trusted / this.stats.validatedDomains) * 100) || 0;
    const suspiciousPct = Math.round((this.stats.suspicious / this.stats.validatedDomains) * 100) || 0;
    const maliciousPct = Math.round((this.stats.malicious / this.stats.validatedDomains) * 100) || 0;
    const unknownPct = Math.round((this.stats.unknown / this.stats.validatedDomains) * 100) || 0;
    
    console.log(`   ✅ Trusted: ${chalk.green(this.stats.trusted)} (${trustedPct}%)`);
    console.log(`   ⚠️  Suspicious: ${chalk.yellow(this.stats.suspicious)} (${suspiciousPct}%)`);
    console.log(`   ❌ Malicious: ${chalk.red(this.stats.malicious)} (${maliciousPct}%)`);
    console.log(`   ❓ Unknown: ${chalk.gray(this.stats.unknown)} (${unknownPct}%)`);
    
    console.log(chalk.white('\n📋 Configuration:'));
    console.log(`   Rules Processed: ${chalk.bold(this.stats.totalRules)}`);
    console.log(`   Lists Processed: ${chalk.bold(this.stats.totalLists)}`);
    
    if (this.stats.malicious > 0) {
      console.log(chalk.red.bold('\n⚠️  ACTION REQUIRED:'));
      console.log(chalk.red(`   ${this.stats.malicious} malicious domains detected!`));
      console.log(chalk.red('   Review and remove these domains from your configuration immediately.'));
    }
    
    if (this.stats.suspicious > 0) {
      console.log(chalk.yellow.bold('\n⚠️  REVIEW RECOMMENDED:'));
      console.log(chalk.yellow(`   ${this.stats.suspicious} suspicious domains detected.`));
      console.log(chalk.yellow('   Review these domains and consider blocking if not needed.'));
    }
    
    console.log(chalk.cyan('\n' + '=' .repeat(60)));
    
    // Save summary to file
    this.saveSummaryToFile();
  }

  private saveSummaryToFile() {
    import('fs').then(fs => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `validation-report-${timestamp}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      maliciousDomains: Array.from(this.validationResults.entries())
        .filter(([_, result]) => result.reputation === 'malicious')
        .map(([domain, result]) => ({
          domain,
          threats: result.threats,
          organization: result.details.organization,
          confidence: result.confidence
        })),
      suspiciousDomains: Array.from(this.validationResults.entries())
        .filter(([_, result]) => result.reputation === 'suspicious')
        .map(([domain, result]) => ({
          domain,
          confidence: result.confidence,
          organization: result.details.organization,
          reasons: result.recommendations
        }))
    };
    
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
      console.log(chalk.gray(`\n📄 Full report saved to: ${filename}`));
    });
  }
}

// Main execution
async function main() {
  const validator = new ComprehensiveValidator();
  await validator.run();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { ComprehensiveValidator };
