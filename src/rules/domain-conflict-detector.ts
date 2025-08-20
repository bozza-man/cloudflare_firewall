import type { GatewayRule } from '../types/gateway.js';

export interface DomainConflict {
  type: 'CONFLICTING_ACTIONS' | 'REDUNDANT' | 'SUBSET' | 'WILDCARD_OVERLAP' | 'SIMILAR_PURPOSE';
  existingRuleId?: string;
  existingRuleName?: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedRules: string[];
  overlappingDomains: string[];
  suggestion: string;
}

export class DomainConflictDetector {
  
  /**
   * Extract domains from filter expressions
   * Made public for testing
   */
  extractDomainsFromFilters(filters: string[]): string[] {
    const domains = new Set<string>();
    
    for (const filter of filters) {
      // The filters can be simple expressions like 'dns.fqdn == "example.com"'
      // or full traffic expressions
      
      // Handle dns.fqdn in {"domain1.com" "domain2.com"} format
      const inMatch = filter.match(/dns\.fqdn\s+in\s+\{([^}]+)\}/);
      if (inMatch) {
        const domainList = inMatch[1];
        // Extract quoted domains, supporting both space and comma separation
        const domainMatches = domainList.match(/"([^"]+)"/g);
        if (domainMatches) {
          domainMatches.forEach(match => {
            const domain = match.replace(/"/g, '');
            domains.add(domain);
          });
        }
      }
      
      // Handle dns.fqdn == "domain.com" format
      const equalMatch = filter.match(/dns\.fqdn\s*==\s*"([^"]+)"/);
      if (equalMatch) {
        domains.add(equalMatch[1]);
      }
      
      // Handle http.request.host == "domain.com" format  
      const hostMatch = filter.match(/http\.request\.host\s*==\s*"([^"]+)"/);
      if (hostMatch) {
        domains.add(hostMatch[1]);
      }
      
      // Additional http.request.host patterns
      const httpHostInMatch = filter.match(/http\.request\.host\s+in\s+\{([^}]+)\}/);
      if (httpHostInMatch) {
        const domainList = httpHostInMatch[1];
        const domainMatches = domainList.match(/"([^"]+)"/g);
        if (domainMatches) {
          domainMatches.forEach(match => {
            const domain = match.replace(/"/g, '');
            domains.add(domain);
          });
        }
      }
    }
    
    return Array.from(domains);
  }

  /**
   * Extract regex patterns from filter expressions
   * Made public for testing
   */
  extractPatternsFromFilters(filters: string[]): string[] {
    const patterns: string[] = [];
    
    for (const filter of filters) {
      // Handle dns.fqdn matches "pattern" format
      const matchesMatch = filter.match(/matches\s+"([^"]+)"/);
      if (matchesMatch) {
        patterns.push(matchesMatch[1]);
      }
    }
    
    return patterns;
  }


  /**
   * Check if two domain sets overlap
   */
  findDomainOverlaps(domains1: Set<string>, domains2: Set<string>): string[] {
    const overlaps: string[] = [];
    
    for (const domain1 of domains1) {
      for (const domain2 of domains2) {
        if (this.domainsOverlap(domain1, domain2)) {
          overlaps.push(domain1 === domain2 ? domain1 : `${domain1} ↔ ${domain2}`);
        }
      }
    }
    
    return overlaps;
  }

  /**
   * Check if two domains overlap (exact match or subdomain relationship)
   */
  private domainsOverlap(domain1: string, domain2: string): boolean {
    // Skip list references for now
    if (domain1.startsWith('$') || domain2.startsWith('$')) {
      return false;
    }
    
    // Exact match
    if (domain1 === domain2) {
      return true;
    }
    
    // Subdomain relationships
    if (domain1.endsWith(`.${domain2}`) || domain2.endsWith(`.${domain1}`)) {
      return true;
    }
    
    return false;
  }

  /**
   * Detect conflicts between a new rule and existing rules
   */
  detectConflicts(
    newRule: {
      name: string;
      action: GatewayRule['action'];
      filters: string[];
      traffic?: string;
    },
    existingRules: GatewayRule[]
  ): DomainConflict[] {
    const conflicts: DomainConflict[] = [];
    
    // For new rules, use filters array (not traffic which is just a type like 'dns' or 'http')
    const newFilters = newRule.filters;
    const newDomains = this.extractDomainsFromFilters(newFilters);
    const newPatterns = this.extractPatternsFromFilters(newFilters);
    
    if (newDomains.length === 0 && newPatterns.length === 0) {
      return conflicts; // No domain-based conflicts possible
    }

    for (const existingRule of existingRules) {
      // For existing rules, the actual filter expressions are in the traffic field
      const existingFilters = existingRule.traffic ? [existingRule.traffic] : existingRule.filters;
      const existingDomains = this.extractDomainsFromFilters(existingFilters);
      const existingPatterns = this.extractPatternsFromFilters(existingFilters);
      
      if (existingDomains.length === 0 && existingPatterns.length === 0) {
        continue; // Skip non-domain rules
      }

      // Check for exact overlaps
      const overlappingDomains = newDomains.filter(d => existingDomains.includes(d));
      
      // Check for subset relationships
      const isSubset = newDomains.length > 0 && existingDomains.length > 0 && 
                      newDomains.every(d => existingDomains.includes(d));
      const isSuperset = newDomains.length > 0 && existingDomains.length > 0 && 
                        existingDomains.every(d => newDomains.includes(d));
      
      // Check for wildcard overlaps
      let wildcardOverlap = false;
      if (newPatterns.length > 0 || existingPatterns.length > 0) {
        // Check if any specific domain matches a wildcard pattern
        for (const pattern of newPatterns) {
          for (const domain of existingDomains) {
            if (this.domainMatchesPattern(domain, pattern)) {
              wildcardOverlap = true;
              overlappingDomains.push(domain);
            }
          }
        }
        for (const pattern of existingPatterns) {
          for (const domain of newDomains) {
            if (this.domainMatchesPattern(domain, pattern)) {
              wildcardOverlap = true;
              if (!overlappingDomains.includes(domain)) {
                overlappingDomains.push(domain);
              }
            }
          }
        }
      }
      
      if (overlappingDomains.length > 0 || isSubset || isSuperset || wildcardOverlap) {
        // Determine conflict type
        if (wildcardOverlap) {
          conflicts.push({
            type: 'WILDCARD_OVERLAP',
            existingRuleId: existingRule.id,
            existingRuleName: existingRule.name,
            severity: this.areActionsContradictory(newRule.action, existingRule.action) ? 'high' : 'medium',
            description: `Wildcard pattern overlap between new rule "${newRule.name}" and existing rule "${existingRule.name}"`,
            affectedRules: [existingRule.id!],
            overlappingDomains,
            suggestion: `Review wildcard patterns to ensure intended behavior`
          });
        } else if (isSubset && newRule.action === existingRule.action) {
          conflicts.push({
            type: 'SUBSET',
            existingRuleId: existingRule.id,
            existingRuleName: existingRule.name,
            severity: 'low',
            description: `New rule "${newRule.name}" domains are a subset of existing rule "${existingRule.name}"`,
            affectedRules: [existingRule.id!],
            overlappingDomains,
            suggestion: `New rule may be redundant as it's already covered by "${existingRule.name}"`
          });
        } else if (this.areActionsContradictory(newRule.action, existingRule.action)) {
          conflicts.push({
            type: 'CONFLICTING_ACTIONS',
            existingRuleId: existingRule.id,
            existingRuleName: existingRule.name,
            severity: 'high',
            description: `New rule "${newRule.name}" (${newRule.action}) conflicts with existing rule "${existingRule.name}" (${existingRule.action}) on overlapping domains`,
            affectedRules: [existingRule.id!],
            overlappingDomains,
            suggestion: `Consider modifying "${existingRule.name}" to exclude these domains, or consolidate the rules`
          });
        } else if (newRule.action === existingRule.action && overlappingDomains.length > 0) {
          conflicts.push({
            type: 'REDUNDANT',
            existingRuleId: existingRule.id,
            existingRuleName: existingRule.name,
            severity: 'low',
            description: `New rule "${newRule.name}" appears redundant with existing rule "${existingRule.name}" (both ${newRule.action} similar domains)`,
            affectedRules: [existingRule.id!],
            overlappingDomains,
            suggestion: `Consider consolidating these rules or adding the domains to "${existingRule.name}" instead`
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if a domain matches a wildcard pattern
   */
  private domainMatchesPattern(domain: string, pattern: string): boolean {
    try {
      // Convert pattern to regex - handle common wildcard syntax
      const regexPattern = pattern
        .replace(/\./g, '\\.')  // Escape dots
        .replace(/\*/g, '.*');   // Convert * to .*
      
      const regex = new RegExp(regexPattern);
      return regex.test(domain);
    } catch {
      return false;
    }
  }

  /**
   * Check if two actions are contradictory
   */
  private areActionsContradictory(action1: GatewayRule['action'], action2: GatewayRule['action']): boolean {
    const contradictions: Record<string, string[]> = {
      'block': ['allow'],
      'allow': ['block'],
      'isolate': ['do_not_isolate'],
      'do_not_isolate': ['isolate'],
    };
    
    return contradictions[action1]?.includes(action2) || false;
  }

  /**
   * Suggest rule consolidation opportunities
   */
  suggestConsolidation(
    newRule: {
      name: string;
      action: GatewayRule['action'];
      filters: string[];
    },
    conflicts: DomainConflict[]
  ): Array<{
    type: 'extend_existing' | 'remove_from_existing' | 'create_exclusion';
    ruleId?: string;
    ruleName?: string;
    description: string;
    modifiedFilters: string[];
  }> {
    const suggestions: Array<{
      type: 'extend_existing' | 'remove_from_existing' | 'create_exclusion';
      ruleId?: string;
      ruleName?: string;
      description: string;
      modifiedFilters: string[];
    }> = [];

    for (const conflict of conflicts) {
      if (conflict.type === 'SIMILAR_PURPOSE' || conflict.type === 'REDUNDANT') {
        // Suggest extending existing rule
        suggestions.push({
          type: 'extend_existing',
          ruleId: conflict.existingRuleId,
          ruleName: conflict.existingRuleName,
          description: `Extend existing rule "${conflict.existingRuleName}" with new domains`,
          modifiedFilters: newRule.filters
        });
      } else if (conflict.type === 'CONFLICTING_ACTIONS') {
        // Suggest removing from existing rule
        suggestions.push({
          type: 'remove_from_existing',
          ruleId: conflict.existingRuleId,
          ruleName: conflict.existingRuleName,
          description: `Remove overlapping domains from "${conflict.existingRuleName}"`,
          modifiedFilters: []
        });
      }
    }

    return suggestions;
  }

  /**
   * Old method for backward compatibility
   */
  private extractDomains(filters: string[]): Set<string> {
    const domains = this.extractDomainsFromFilters(filters);
    return new Set(domains);
  }
}
