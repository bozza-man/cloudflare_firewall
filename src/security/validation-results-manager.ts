import { GatewayClient } from '../api/gateway-client.js';
import { GatewayList, GatewayRule } from '../types/gateway.js';
import { ThreatIntelligenceResult } from './threat-intelligence-client.js';
import chalk from 'chalk';
import { config } from '../utils/config.js';

export interface ValidationMetadata {
  lastValidated: string;
  riskScore: number;
  reputation: 'trusted' | 'suspicious' | 'malicious' | 'unknown';
  confidence: number;
  categories?: string[];
  organization?: string;
  asn?: number;
  country?: string;
  popularity?: number;
  threats?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  allowRecommendation: 'allow' | 'block' | 'caution';
}

export class ValidationResultsManager {
  private client: GatewayClient;
  private cache: Map<string, ValidationMetadata> = new Map();
  
  constructor() {
    this.client = new GatewayClient(config.accountId);
  }

  /**
   * Save validation results to a Gateway list's description
   */
  async saveToList(listId: string, domains: Map<string, ThreatIntelligenceResult>): Promise<void> {
    try {
      const list = await this.client.getGatewayList(listId);
      if (!list) {
        console.warn(chalk.yellow(`List ${listId} not found`));
        return;
      }

      // Create metadata summary
      const metadata = this.createMetadataSummary(domains);
      
      // Update list description with validation metadata
      const updatedDescription = this.appendMetadata(list.description || '', metadata);
      
      // Update the list
      await this.client.updateGatewayList({
        id: listId,
        description: updatedDescription
      });
      
      console.log(chalk.green(`✅ Saved validation results to list "${list.name}"`));
    } catch (error) {
      console.error(chalk.red('Failed to save validation results to list:'), error);
    }
  }

  /**
   * Save validation results to a Gateway rule's description
   */
  async saveToRule(ruleId: string, domains: Map<string, ThreatIntelligenceResult>): Promise<void> {
    try {
      const rule = await this.client.getGatewayRule(ruleId);
      if (!rule) {
        console.warn(chalk.yellow(`Rule ${ruleId} not found`));
        return;
      }

      // Create metadata summary
      const metadata = this.createMetadataSummary(domains);
      
      // Update rule description with validation metadata
      const updatedDescription = this.appendMetadata(rule.description || '', metadata);
      
      // Update the rule
      await this.client.updateGatewayRule({
        id: ruleId,
        description: updatedDescription
      });
      
      console.log(chalk.green(`✅ Saved validation results to rule "${rule.name}"`));
    } catch (error) {
      console.error(chalk.red('Failed to save validation results to rule:'), error);
    }
  }

  /**
   * Create an enriched list with validation metadata for each item
   */
  async createValidatedList(
    name: string,
    domains: Map<string, ThreatIntelligenceResult>,
    type: 'DOMAIN' | 'IP' = 'DOMAIN'
  ): Promise<string | null> {
    try {
      const items: Array<{ value: string; description?: string }> = [];
      const stats = {
        trusted: 0,
        suspicious: 0,
        malicious: 0,
        unknown: 0
      };

      // Process each domain/IP with its validation results
      for (const [domain, result] of domains) {
        const metadata = this.resultToMetadata(result);
        stats[result.reputation]++;
        
        // Create item with validation info in description
        items.push({
          value: domain,
          description: this.createItemDescription(metadata)
        });
        
        // Cache the metadata
        this.cache.set(domain, metadata);
      }

      // Create list description with overall stats
      const description = this.createListDescription(stats, domains.size);

      // Create the list
      const list = await this.client.createGatewayList({
        name,
        type,
        description,
        items: items.map(item => ({ value: item.value }))
      });
      const listId = list?.id;

      if (listId) {
        console.log(chalk.green(`✅ Created validated list "${name}" with ${items.length} items`));
        
        // Now update individual item descriptions (if API supports it)
        await this.updateItemDescriptions(listId, items);
      }

      return listId;
    } catch (error) {
      console.error(chalk.red('Failed to create validated list:'), error);
      return null;
    }
  }

  /**
   * Retrieve validation metadata from cache or parse from description
   */
  async getValidationMetadata(domain: string): Promise<ValidationMetadata | null> {
    // Check cache first
    if (this.cache.has(domain)) {
      return this.cache.get(domain)!;
    }

    // Try to find in lists
    const lists = await this.client.listGatewayLists();
    for (const list of lists) {
      const items = list.items || [];
      const item = items.find(i => i.value === domain);
      if (item?.description) {
        const metadata = this.parseMetadata(item.description);
        if (metadata) {
          this.cache.set(domain, metadata);
          return metadata;
        }
      }
    }

    return null;
  }

  /**
   * Convert ThreatIntelligenceResult to ValidationMetadata
   */
  private resultToMetadata(result: ThreatIntelligenceResult): ValidationMetadata {
    return {
      lastValidated: new Date().toISOString(),
      riskScore: result.confidence,
      reputation: result.reputation,
      confidence: result.confidence,
      categories: result.details.categories,
      organization: result.details.organization as string | undefined,
      asn: result.details.asn as number | undefined,
      country: result.details.country as string | undefined,
      popularity: result.details.popularity,
      threats: result.threats.map(t => ({
        type: t.type,
        severity: t.severity,
        description: t.description
      })),
      allowRecommendation: result.allowRecommendation
    };
  }

  /**
   * Create a summary of validation metadata
   */
  private createMetadataSummary(domains: Map<string, ThreatIntelligenceResult>): string {
    const stats = {
      trusted: 0,
      suspicious: 0,
      malicious: 0,
      unknown: 0,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0
    };

    const orgs = new Set<string>();
    const countries = new Set<string>();

    for (const result of domains.values()) {
      stats[result.reputation]++;
      
      // Count risk levels
      if (result.confidence > 0.7) stats.highRisk++;
      else if (result.confidence > 0.4) stats.mediumRisk++;
      else stats.lowRisk++;

      // Collect unique orgs and countries
      if (result.details.organization) orgs.add(result.details.organization as string);
      if (result.details.country) countries.add(result.details.country as string);
    }

    const lines = [
      `[SECURITY VALIDATION - ${new Date().toISOString().split('T')[0]}]`,
      `Domains: ${domains.size} | Trusted: ${stats.trusted} | Suspicious: ${stats.suspicious} | Malicious: ${stats.malicious}`,
      `Risk: High(${stats.highRisk}) Medium(${stats.mediumRisk}) Low(${stats.lowRisk})`,
      orgs.size > 0 ? `Orgs: ${Array.from(orgs).slice(0, 5).join(', ')}` : '',
      countries.size > 0 ? `Countries: ${Array.from(countries).slice(0, 5).join(', ')}` : ''
    ].filter(Boolean);

    return lines.join(' | ');
  }

  /**
   * Create description for a list with validation stats
   */
  private createListDescription(stats: any, totalItems: number): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `[Validated ${timestamp}] Total: ${totalItems} | ` +
           `✅ Trusted: ${stats.trusted} | ⚠️ Suspicious: ${stats.suspicious} | ` +
           `❌ Malicious: ${stats.malicious} | ❓ Unknown: ${stats.unknown}`;
  }

  /**
   * Create description for an individual item
   */
  private createItemDescription(metadata: ValidationMetadata): string {
    const risk = metadata.riskScore > 0.7 ? '🔴' : 
                 metadata.riskScore > 0.4 ? '🟡' : '🟢';
    
    const parts = [
      `${risk} ${metadata.reputation.toUpperCase()}`,
      `Conf: ${Math.round(metadata.confidence * 100)}%`
    ];

    if (metadata.organization) parts.push(`Org: ${metadata.organization}`);
    if (metadata.popularity) parts.push(`Rank: ${metadata.popularity}`);
    if (metadata.threats && metadata.threats.length > 0) {
      parts.push(`Threats: ${metadata.threats.length}`);
    }

    return parts.join(' | ');
  }

  /**
   * Append metadata to existing description
   */
  private appendMetadata(existingDescription: string, metadata: string): string {
    // Remove old validation metadata if present
    const cleanDescription = existingDescription.replace(/\[SECURITY VALIDATION[^\]]+\][^|]*(\||$)/g, '').trim();
    
    // Add new metadata
    if (cleanDescription) {
      return `${cleanDescription}\n${metadata}`;
    }
    return metadata;
  }

  /**
   * Parse metadata from description
   */
  private parseMetadata(description: string): ValidationMetadata | null {
    try {
      // Look for our metadata format
      const riskMatch = description.match(/([🔴🟡🟢])\s+(\w+)/);
      const confMatch = description.match(/Conf:\s*(\d+)%/);
      const orgMatch = description.match(/Org:\s*([^|]+)/);
      const rankMatch = description.match(/Rank:\s*(\d+)/);
      const threatsMatch = description.match(/Threats:\s*(\d+)/);

      if (riskMatch && confMatch) {
        return {
          lastValidated: new Date().toISOString(),
          riskScore: parseInt(confMatch[1]) / 100,
          reputation: riskMatch[2].toLowerCase() as any,
          confidence: parseInt(confMatch[1]) / 100,
          organization: orgMatch?.[1]?.trim(),
          popularity: rankMatch ? parseInt(rankMatch[1]) : undefined,
          threats: threatsMatch ? [] : undefined,
          allowRecommendation: riskMatch[1] === '🟢' ? 'allow' : 
                               riskMatch[1] === '🔴' ? 'block' : 'caution'
        };
      }
    } catch (error) {
      console.debug('Failed to parse metadata:', error);
    }
    return null;
  }

  /**
   * Update individual item descriptions (if supported by API)
   */
  private async updateItemDescriptions(listId: string, items: Array<{ value: string; description?: string }>): Promise<void> {
    // Note: Cloudflare Gateway API might not support individual item descriptions
    // This is a placeholder for future API enhancements
    console.debug(chalk.gray('Item-level descriptions saved in cache'));
    
    // Store in cache for now
    for (const item of items) {
      if (item.description) {
        const metadata = this.parseMetadata(item.description);
        if (metadata) {
          this.cache.set(item.value, metadata);
        }
      }
    }
  }

  /**
   * Generate a security report from validation results
   */
  generateReport(domains: Map<string, ThreatIntelligenceResult>): string {
    const lines: string[] = [
      chalk.cyan('=' .repeat(60)),
      chalk.cyan.bold('🔒 SECURITY VALIDATION REPORT'),
      chalk.cyan('=' .repeat(60)),
      ''
    ];

    const stats = {
      total: domains.size,
      trusted: 0,
      suspicious: 0,
      malicious: 0,
      unknown: 0
    };

    const byOrg = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const threats: string[] = [];

    // Process results
    for (const [domain, result] of domains) {
      stats[result.reputation]++;
      
      if (result.details.organization) {
        const org = result.details.organization as string;
        byOrg.set(org, (byOrg.get(org) || 0) + 1);
      }
      
      if (result.details.country) {
        const country = result.details.country as string;
        byCountry.set(country, (byCountry.get(country) || 0) + 1);
      }
      
      if (result.threats.length > 0) {
        threats.push(`${domain}: ${result.threats.map(t => t.description).join(', ')}`);
      }
    }

    // Summary stats
    lines.push(chalk.white.bold('📊 Summary:'));
    lines.push(`  Total Domains: ${stats.total}`);
    lines.push(`  ✅ Trusted: ${stats.trusted} (${Math.round(stats.trusted / stats.total * 100)}%)`);
    lines.push(`  ⚠️  Suspicious: ${stats.suspicious} (${Math.round(stats.suspicious / stats.total * 100)}%)`);
    lines.push(`  ❌ Malicious: ${stats.malicious} (${Math.round(stats.malicious / stats.total * 100)}%)`);
    lines.push(`  ❓ Unknown: ${stats.unknown} (${Math.round(stats.unknown / stats.total * 100)}%)`);
    lines.push('');

    // Top organizations
    if (byOrg.size > 0) {
      lines.push(chalk.white.bold('🏢 Top Organizations:'));
      const sortedOrgs = Array.from(byOrg.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [org, count] of sortedOrgs) {
        lines.push(`  • ${org}: ${count} domains`);
      }
      lines.push('');
    }

    // Top countries
    if (byCountry.size > 0) {
      lines.push(chalk.white.bold('🌍 Top Countries:'));
      const sortedCountries = Array.from(byCountry.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [country, count] of sortedCountries) {
        lines.push(`  • ${country}: ${count} domains`);
      }
      lines.push('');
    }

    // Threats detected
    if (threats.length > 0) {
      lines.push(chalk.red.bold('⚠️  Threats Detected:'));
      threats.slice(0, 10).forEach(threat => {
        lines.push(`  • ${threat}`);
      });
      if (threats.length > 10) {
        lines.push(`  ... and ${threats.length - 10} more`);
      }
      lines.push('');
    }

    // Recommendations
    lines.push(chalk.white.bold('💡 Recommendations:'));
    if (stats.malicious > 0) {
      lines.push(chalk.red(`  ⚠️  Block ${stats.malicious} malicious domains immediately`));
    }
    if (stats.suspicious > 0) {
      lines.push(chalk.yellow(`  ⚠️  Review ${stats.suspicious} suspicious domains for potential blocking`));
    }
    if (stats.unknown > 0) {
      lines.push(chalk.gray(`  ℹ️  ${stats.unknown} domains need additional validation`));
    }
    
    lines.push('');
    lines.push(chalk.cyan('=' .repeat(60)));

    return lines.join('\n');
  }
}

// Export singleton instance
export const validationResultsManager = new ValidationResultsManager();
