import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, GatewayList } from '../types/gateway.js';
import chalk from 'chalk';

export interface ListUsageAnalysis {
  unusedLists: GatewayList[];
  underutilizedLists: Array<{
    list: GatewayList;
    ruleCount: number;
    suggestion: string;
  }>;
  duplicateContentLists: Array<{
    lists: GatewayList[];
    commonItems: string[];
  }>;
  listConsolidationOpportunities: Array<{
    targetList: GatewayList;
    sourceLists: GatewayList[];
    reason: string;
  }>;
  rulesToConvertToLists: Array<{
    rules: GatewayRule[];
    commonDomains: string[];
    suggestedListName: string;
    estimatedReduction: number;
  }>;
  inefficientListUsage: Array<{
    rule: GatewayRule;
    issue: string;
    suggestion: string;
  }>;
}

export class ListAnalyzer {
  private gateway: GatewayClient;

  constructor() {
    this.gateway = new GatewayClient();
  }

  async analyzeListEffectiveness(
    rules: GatewayRule[],
    lists?: GatewayList[]
  ): Promise<ListUsageAnalysis> {
    // Fetch lists if not provided
    const gatewayLists = lists || await this.gateway.listGatewayLists();
    
    const analysis: ListUsageAnalysis = {
      unusedLists: [],
      underutilizedLists: [],
      duplicateContentLists: [],
      listConsolidationOpportunities: [],
      rulesToConvertToLists: [],
      inefficientListUsage: []
    };

    // Analyze list usage in rules
    this.findUnusedLists(rules, gatewayLists, analysis);
    this.findUnderutilizedLists(rules, gatewayLists, analysis);
    this.findDuplicateContentLists(gatewayLists, analysis);
    this.findListConsolidationOpportunities(gatewayLists, analysis);
    this.findRulesToConvertToLists(rules, gatewayLists, analysis);
    this.findInefficientListUsage(rules, gatewayLists, analysis);

    return analysis;
  }

  private findUnusedLists(
    rules: GatewayRule[], 
    lists: GatewayList[], 
    analysis: ListUsageAnalysis
  ): void {
    const usedListIds = new Set<string>();
    
    // Extract list IDs from rule filters
    rules.forEach(rule => {
      rule.filters.forEach(filter => {
        // Look for list references in filters
        const listMatches = filter.match(/\$([a-f0-9-]+)/g);
        if (listMatches) {
          listMatches.forEach(match => {
            const listId = match.substring(1);
            usedListIds.add(listId);
          });
        }
      });
    });

    // Find unused lists
    lists.forEach(list => {
      if (!usedListIds.has(list.id)) {
        analysis.unusedLists.push(list);
      }
    });
  }

  private findUnderutilizedLists(
    rules: GatewayRule[], 
    lists: GatewayList[], 
    analysis: ListUsageAnalysis
  ): void {
    const listUsageCount = new Map<string, number>();
    
    // Count how many rules use each list
    rules.forEach(rule => {
      rule.filters.forEach(filter => {
        const listMatches = filter.match(/\$([a-f0-9-]+)/g);
        if (listMatches) {
          listMatches.forEach(match => {
            const listId = match.substring(1);
            listUsageCount.set(listId, (listUsageCount.get(listId) || 0) + 1);
          });
        }
      });
    });

    // Find underutilized lists (used in only 1 rule)
    lists.forEach(list => {
      const usageCount = listUsageCount.get(list.id) || 0;
      if (usageCount === 1 && list.count > 1) {
        analysis.underutilizedLists.push({
          list,
          ruleCount: usageCount,
          suggestion: `List "${list.name}" with ${list.count} items is only used in 1 rule. Consider if it's worth maintaining as a separate list.`
        });
      }
    });
  }

  private findDuplicateContentLists(
    lists: GatewayList[], 
    analysis: ListUsageAnalysis
  ): void {
    // Group lists by type
    const listsByType = new Map<string, GatewayList[]>();
    lists.forEach(list => {
      const typeList = listsByType.get(list.type) || [];
      typeList.push(list);
      listsByType.set(list.type, typeList);
    });

    // Check for duplicate content within same type
    listsByType.forEach((typeLists) => {
      for (let i = 0; i < typeLists.length; i++) {
        for (let j = i + 1; j < typeLists.length; j++) {
          const list1 = typeLists[i];
          const list2 = typeLists[j];
          
          // Check if lists have similar names or descriptions suggesting duplication
          if (this.areSimilarLists(list1, list2)) {
            analysis.duplicateContentLists.push({
              lists: [list1, list2],
              commonItems: [] // Would need to fetch actual list items to compare
            });
          }
        }
      }
    });
  }

  private areSimilarLists(list1: GatewayList, list2: GatewayList): boolean {
    const name1 = list1.name.toLowerCase();
    const name2 = list2.name.toLowerCase();
    
    // Check for similar names
    if (this.calculateSimilarity(name1, name2) > 0.7) {
      return true;
    }
    
    // Check if one name contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
      return true;
    }
    
    return false;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private findListConsolidationOpportunities(
    lists: GatewayList[], 
    analysis: ListUsageAnalysis
  ): void {
    // Group small lists of the same type
    const smallLists = lists.filter(l => l.count < 5);
    const listsByType = new Map<string, GatewayList[]>();
    
    smallLists.forEach(list => {
      const typeList = listsByType.get(list.type) || [];
      typeList.push(list);
      listsByType.set(list.type, typeList);
    });

    // Suggest consolidation for multiple small lists of same type
    listsByType.forEach((typeLists, type) => {
      if (typeLists.length > 2) {
        const totalItems = typeLists.reduce((sum, l) => sum + l.count, 0);
        if (totalItems < 20) {
          analysis.listConsolidationOpportunities.push({
            targetList: typeLists[0], // Use first as target
            sourceLists: typeLists.slice(1),
            reason: `${typeLists.length} small ${type} lists with total ${totalItems} items could be consolidated`
          });
        }
      }
    });
  }

  private findRulesToConvertToLists(
    rules: GatewayRule[], 
    _lists: GatewayList[],
    analysis: ListUsageAnalysis
  ): void {
    // Find rules with multiple domain/IP filters that could use lists
    const domainRules = new Map<string, Array<{ rule: GatewayRule; domains: string[] }>>();
    
    rules.forEach(rule => {
      const domains = this.extractDomainsFromRule(rule);
      if (domains.length > 3) {
        // Group by action and traffic type for potential consolidation
        const key = `${rule.action}-${rule.traffic}`;
        const group = domainRules.get(key) || [];
        group.push({ rule, domains });
        domainRules.set(key, group);
      }
    });

    // Find common domains across rules that could share a list
    domainRules.forEach((ruleGroup, key) => {
      if (ruleGroup.length > 1) {
        const allDomains = ruleGroup.flatMap(r => r.domains);
        const domainCounts = new Map<string, number>();
        
        allDomains.forEach(domain => {
          domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        });

        // Find domains that appear in multiple rules
        const commonDomains = Array.from(domainCounts.entries())
          .filter(([_, count]) => count > 1)
          .map(([domain]) => domain);

        if (commonDomains.length > 5) {
          const [action, traffic] = key.split('-');
          analysis.rulesToConvertToLists.push({
            rules: ruleGroup.map(r => r.rule),
            commonDomains,
            suggestedListName: `${traffic}_${action}_domains`,
            estimatedReduction: ruleGroup.length - 1 // Rules that could be consolidated
          });
        }
      }
    });

    // Also check individual rules with many domains
    rules.forEach(rule => {
      const domains = this.extractDomainsFromRule(rule);
      if (domains.length > 10 && !this.usesLists(rule)) {
        analysis.rulesToConvertToLists.push({
          rules: [rule],
          commonDomains: domains,
          suggestedListName: `${rule.name.toLowerCase().replace(/\s+/g, '_')}_domains`,
          estimatedReduction: 0 // Just converting to list for maintainability
        });
      }
    });
  }

  private findInefficientListUsage(
    rules: GatewayRule[], 
    lists: GatewayList[],
    analysis: ListUsageAnalysis
  ): void {
    const listMap = new Map(lists.map(l => [l.id, l]));
    
    rules.forEach(rule => {
      // Check for rules that mix lists and individual domains
      const usesList = this.usesLists(rule);
      const hasDomains = this.extractDomainsFromRule(rule).length > 0;
      
      if (usesList && hasDomains) {
        analysis.inefficientListUsage.push({
          rule,
          issue: 'Rule mixes list references with individual domain filters',
          suggestion: 'Consider adding the individual domains to the list for cleaner rule management'
        });
      }

      // Check for rules using multiple small lists that could be combined
      const listIds = this.extractListIds(rule);
      if (listIds.length > 2) {
        const smallLists = listIds
          .map(id => listMap.get(id))
          .filter(list => list && list.count < 5);
        
        if (smallLists.length > 1) {
          analysis.inefficientListUsage.push({
            rule,
            issue: `Rule uses ${smallLists.length} small lists (< 5 items each)`,
            suggestion: 'Consider combining these small lists into a single larger list'
          });
        }
      }
    });
  }

  private extractDomainsFromRule(rule: GatewayRule): string[] {
    const domains: string[] = [];
    
    rule.filters.forEach(filter => {
      // Extract from dns.fqdn patterns
      const fqdnMatches = filter.match(/dns\.fqdn[^"]*"([^"]+)"/g);
      if (fqdnMatches) {
        fqdnMatches.forEach(match => {
          const domain = match.match(/"([^"]+)"/)?.[1];
          if (domain && !domain.startsWith('$')) {
            domains.push(domain);
          }
        });
      }

      // Extract from in {...} patterns
      const inMatches = filter.match(/in\s*\{([^}]+)\}/g);
      if (inMatches) {
        inMatches.forEach(match => {
          const content = match.match(/\{([^}]+)\}/)?.[1];
          if (content) {
            const items = content.match(/"([^"]+)"/g);
            if (items) {
              items.forEach(item => {
                const value = item.replace(/"/g, '');
                if (value && !value.startsWith('$')) {
                  domains.push(value);
                }
              });
            }
          }
        });
      }

      // Extract from http.request.host patterns
      const hostMatches = filter.match(/http\.request\.host[^"]*"([^"]+)"/g);
      if (hostMatches) {
        hostMatches.forEach(match => {
          const domain = match.match(/"([^"]+)"/)?.[1];
          if (domain && !domain.startsWith('$')) {
            domains.push(domain);
          }
        });
      }
    });
    
    return [...new Set(domains)];
  }

  private usesLists(rule: GatewayRule): boolean {
    return rule.filters.some(filter => filter.includes('$'));
  }

  private extractListIds(rule: GatewayRule): string[] {
    const listIds: string[] = [];
    
    rule.filters.forEach(filter => {
      const matches = filter.match(/\$([a-f0-9-]+)/g);
      if (matches) {
        matches.forEach(match => {
          listIds.push(match.substring(1));
        });
      }
    });
    
    return [...new Set(listIds)];
  }

  displayListAnalysis(analysis: ListUsageAnalysis): void {
    console.log(chalk.bold.cyan('\n📚 Gateway List Analysis:\n'));

    // Unused lists
    if (analysis.unusedLists.length > 0) {
      console.log(chalk.yellow(`⚠️  Unused Lists (${analysis.unusedLists.length}):`));
      analysis.unusedLists.forEach(list => {
        console.log(`   - ${list.name} (${list.type}, ${list.count} items)`);
      });
    }

    // Underutilized lists
    if (analysis.underutilizedLists.length > 0) {
      console.log(chalk.yellow(`\n📉 Underutilized Lists (${analysis.underutilizedLists.length}):`));
      analysis.underutilizedLists.forEach(({ list, suggestion }) => {
        console.log(`   - ${list.name}: ${suggestion}`);
      });
    }

    // Duplicate content lists
    if (analysis.duplicateContentLists.length > 0) {
      console.log(chalk.red(`\n🔄 Potential Duplicate Lists (${analysis.duplicateContentLists.length}):`));
      analysis.duplicateContentLists.forEach(({ lists }) => {
        console.log(`   - "${lists[0].name}" and "${lists[1].name}" appear similar`);
      });
    }

    // Consolidation opportunities
    if (analysis.listConsolidationOpportunities.length > 0) {
      console.log(chalk.blue(`\n🔗 List Consolidation Opportunities (${analysis.listConsolidationOpportunities.length}):`));
      analysis.listConsolidationOpportunities.forEach(({ reason }) => {
        console.log(`   - ${reason}`);
      });
    }

    // Rules to convert to lists
    if (analysis.rulesToConvertToLists.length > 0) {
      console.log(chalk.green(`\n📝 Rules That Could Use Lists (${analysis.rulesToConvertToLists.length}):`));
      analysis.rulesToConvertToLists.forEach(({ rules, commonDomains, suggestedListName, estimatedReduction }) => {
        if (rules.length === 1) {
          console.log(`   - Rule "${rules[0].name}" has ${commonDomains.length} domains → suggest list: "${suggestedListName}"`);
        } else {
          console.log(`   - ${rules.length} rules share ${commonDomains.length} domains → suggest list: "${suggestedListName}"`);
          if (estimatedReduction > 0) {
            console.log(`     Could reduce rule count by ${estimatedReduction}`);
          }
        }
      });
    }

    // Inefficient list usage
    if (analysis.inefficientListUsage.length > 0) {
      console.log(chalk.yellow(`\n⚡ Inefficient List Usage (${analysis.inefficientListUsage.length}):`));
      analysis.inefficientListUsage.forEach(({ rule, issue, suggestion }) => {
        console.log(`   - Rule "${rule.name}": ${issue}`);
        console.log(`     ${chalk.gray(suggestion)}`);
      });
    }

    // Summary
    const totalIssues = 
      analysis.unusedLists.length +
      analysis.underutilizedLists.length +
      analysis.duplicateContentLists.length +
      analysis.listConsolidationOpportunities.length +
      analysis.rulesToConvertToLists.length +
      analysis.inefficientListUsage.length;

    if (totalIssues === 0) {
      console.log(chalk.green('\n✨ Gateway Lists are being used efficiently!'));
    } else {
      console.log(chalk.yellow(`\n📊 Total list optimization opportunities: ${totalIssues}`));
    }
  }
}
