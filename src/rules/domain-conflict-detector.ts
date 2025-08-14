import type { GatewayRule } from '../types/gateway.js';

export interface DomainConflict {
  type: 'allow_block_overlap' | 'redundant_rule' | 'contradictory_actions';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedRules: string[];
  overlappingDomains: string[];
  suggestion: string;
}

export class DomainConflictDetector {
  
  /**
   * Extract domains from filter expressions
   */
  extractDomains(filters: string[]): Set<string> {
    const domains = new Set<string>();
    
    for (const filter of filters) {
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
      
      // Handle http.request.uri.host format
      const hostMatch = filter.match(/http\.request\.uri\.host\s*==\s*"([^"]+)"/);
      if (hostMatch) {
        domains.add(hostMatch[1]);
      }
      
      // Handle domain lists in other formats
      const listMatch = filter.match(/in\s+\$([a-zA-Z_]+)/);
      if (listMatch) {
        // This is a reference to a list, we can't extract specific domains
        // but we should note this for later analysis
        domains.add(`$${listMatch[1]}`);
      }
    }
    
    return domains;
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
    
    // For new rules, use filters. For existing rules, use traffic field which contains the actual expressions
    const newFilters = newRule.traffic ? [newRule.traffic] : newRule.filters;
    const newDomains = this.extractDomains(newFilters);
    
    if (newDomains.size === 0) {
      return conflicts; // No domain-based conflicts possible
    }

    for (const existingRule of existingRules) {
      // For existing rules, the actual filter expressions are in the traffic field
      const existingFilters = existingRule.traffic ? [existingRule.traffic] : existingRule.filters;
      const existingDomains = this.extractDomains(existingFilters);
      
      if (existingDomains.size === 0) {
        continue; // Skip non-domain rules
      }

      const overlaps = this.findDomainOverlaps(newDomains, existingDomains);
      
      if (overlaps.length > 0) {
        // Check for contradictory actions
        if (this.areActionsContradictory(newRule.action, existingRule.action)) {
          conflicts.push({
            type: 'allow_block_overlap',
            severity: 'high',
            description: `New rule "${newRule.name}" (${newRule.action}) conflicts with existing rule "${existingRule.name}" (${existingRule.action}) on overlapping domains`,
            affectedRules: [existingRule.id!],
            overlappingDomains: overlaps,
            suggestion: `Consider modifying "${existingRule.name}" to exclude these domains, or consolidate the rules`
          });
        } 
        // Check for redundant rules (same action)
        else if (newRule.action === existingRule.action) {
          conflicts.push({
            type: 'redundant_rule',
            severity: 'medium',
            description: `New rule "${newRule.name}" appears redundant with existing rule "${existingRule.name}" (both ${newRule.action} similar domains)`,
            affectedRules: [existingRule.id!],
            overlappingDomains: overlaps,
            suggestion: `Consider consolidating these rules or adding the domains to "${existingRule.name}" instead`
          });
        }
      }
    }

    return conflicts;
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
    type: 'extend_existing' | 'create_exclusion';
    ruleId: string;
    ruleName: string;
    description: string;
    modifiedFilters: string[];
  }> {
    const suggestions: Array<{
      type: 'extend_existing' | 'create_exclusion';
      ruleId: string;
      ruleName: string;
      description: string;
      modifiedFilters: string[];
    }> = [];

    const redundantConflicts = conflicts.filter(c => c.type === 'redundant_rule');
    
    for (const conflict of redundantConflicts) {
      // For redundant rules, suggest extending the existing rule
      const newDomains = this.extractDomains(newRule.filters);
      const combinedDomains = Array.from(newDomains).filter(d => !d.startsWith('$'));
      
      if (combinedDomains.length > 0) {
        const newFilter = `dns.fqdn in {"${combinedDomains.join('" "')}"}`;
        
        suggestions.push({
          type: 'extend_existing',
          ruleId: conflict.affectedRules[0],
          ruleName: `Extended rule (was conflicting with ${newRule.name})`,
          description: `Add domains from "${newRule.name}" to existing rule instead of creating a separate rule`,
          modifiedFilters: [newFilter]
        });
      }
    }

    return suggestions;
  }
}
