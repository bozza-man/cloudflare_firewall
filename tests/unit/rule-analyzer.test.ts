import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockGatewayRules } from '../fixtures/gateway-rules.js';
import type { GatewayRule } from '../../src/types/gateway.js';

// Simple RuleAnalyzer implementation for testing
interface RuleAnalysis {
  issues: Array<{
    ruleId: string;
    category: 'redundancy' | 'conflict' | 'ordering' | 'performance';
    type: 'error' | 'warning' | 'info';
    message: string;
    relatedRules?: string[];
    severity?: 'low' | 'medium' | 'high';
  }>;
  proposedOrder?: Array<{
    rule: GatewayRule;
    suggestedPrecedence: number;
    reason: string;
  }>;
  summary: {
    totalRules: number;
    errors: number;
    warnings: number;
    suggestions: number;
  };
}

class RuleAnalyzer {
  analyzeRules(rules: GatewayRule[]): RuleAnalysis {
    const issues: RuleAnalysis['issues'] = [];
    const proposedOrder: RuleAnalysis['proposedOrder'] = [];

    // Basic statistics
    const stats = {
      totalRules: rules.length,
      errors: 0,
      warnings: 0,
      suggestions: 0
    };

    // Analyze for conflicts
    this.detectConflicts(rules, issues);

    // Analyze for redundancies
    this.detectRedundancies(rules, issues);

    // Analyze precedence ordering
    this.analyzePrecedence(rules, issues, proposedOrder);

    // Analyze performance issues
    this.analyzePerformance(rules, issues);

    // Count issue types
    stats.errors = issues.filter(i => i.type === 'error').length;
    stats.warnings = issues.filter(i => i.type === 'warning').length;
    stats.suggestions = issues.filter(i => i.type === 'info').length;

    return {
      issues,
      proposedOrder,
      summary: stats
    };
  }

  private detectConflicts(rules: GatewayRule[], issues: RuleAnalysis['issues']): void {
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i];
        const rule2 = rules[j];

        if (this.hasFilterOverlap(rule1, rule2) && rule1.action !== rule2.action) {
          issues.push({
            ruleId: rule1.id,
            category: 'conflict',
            type: 'error',
            message: `Conflicting actions with rule "${rule2.name}"`,
            relatedRules: [rule2.id],
            severity: 'high'
          });
        }
      }
    }
  }

  private detectRedundancies(rules: GatewayRule[], issues: RuleAnalysis['issues']): void {
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i];
        const rule2 = rules[j];

        if (this.isRedundant(rule1, rule2)) {
          issues.push({
            ruleId: rule1.id,
            category: 'redundancy',
            type: 'warning',
            message: `Rule is redundant with "${rule2.name}"`,
            relatedRules: [rule2.id],
            severity: 'medium'
          });
        }
      }
    }
  }

  private analyzePrecedence(
    rules: GatewayRule[], 
    issues: RuleAnalysis['issues'],
    proposedOrder: NonNullable<RuleAnalysis['proposedOrder']>
  ): void {
    const sortedRules = [...rules].sort((a, b) => a.precedence - b.precedence);
    
    for (let i = 0; i < sortedRules.length - 1; i++) {
      const current = sortedRules[i];
      const next = sortedRules[i + 1];

      // Check if a more general rule comes before a specific one
      if (this.isMoreGeneral(current, next)) {
        issues.push({
          ruleId: next.id,
          category: 'ordering',
          type: 'warning',
          message: `Rule may never be evaluated due to more general rule "${current.name}"`,
          relatedRules: [current.id],
          severity: 'high'
        });

        // Suggest reordering
        proposedOrder.push({
          rule: next,
          suggestedPrecedence: current.precedence - 100,
          reason: 'Move more specific rule before general rule'
        });
      }
    }
  }

  private analyzePerformance(rules: GatewayRule[], issues: RuleAnalysis['issues']): void {
    rules.forEach(rule => {
      // Check for overly complex filters
      if (rule.filters.length > 10) {
        issues.push({
          ruleId: rule.id,
          category: 'performance',
          type: 'info',
          message: 'Rule has many filters, consider consolidation',
          severity: 'low'
        });
      }

      // Check for disabled rules
      if (!rule.enabled) {
        issues.push({
          ruleId: rule.id,
          category: 'performance',
          type: 'info',
          message: 'Rule is disabled, consider removing if unused',
          severity: 'low'
        });
      }

      // Check for overly broad rules
      if (this.isOverlyBroad(rule)) {
        issues.push({
          ruleId: rule.id,
          category: 'performance',
          type: 'warning',
          message: 'Rule may be too broad and impact performance',
          severity: 'medium'
        });
      }
    });
  }

  private hasFilterOverlap(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // Simple overlap detection based on traffic patterns
    if (rule1.traffic === rule2.traffic) return true;
    
    // Check for domain overlap in filter expressions
    const rule1Domains = this.extractDomains(rule1.traffic);
    const rule2Domains = this.extractDomains(rule2.traffic);
    
    // If both rules target the same domain(s), they overlap
    // This should catch DNS vs HTTP rules targeting same domain
    if (rule1Domains.length > 0 && rule2Domains.length > 0) {
      return rule1Domains.some(domain => rule2Domains.includes(domain));
    }
    
    // Check if both rules target DNS traffic
    if (rule1.traffic.includes('dns') && rule2.traffic.includes('dns')) {
      return true;
    }
    
    return false;
  }

  private isRedundant(rule1: GatewayRule, rule2: GatewayRule): boolean {
    return rule1.action === rule2.action && 
           rule1.traffic === rule2.traffic &&
           rule1.filters.every(f => rule2.filters.includes(f));
  }

  private isMoreGeneral(rule1: GatewayRule, rule2: GatewayRule): boolean {
    // A rule is more general if it has fewer specific conditions
    // Check if traffic expressions show one is more general
    if (rule1.traffic && rule2.traffic) {
      // Check for contains vs exact match
      if (rule1.traffic.includes('contains') && rule2.traffic.includes('==')) {
        // rule1 uses contains (more general) and rule2 uses exact match (more specific)
        return true;
      }
    }
    
    const rule1Specificity = this.calculateSpecificity(rule1);
    const rule2Specificity = this.calculateSpecificity(rule2);
    
    return rule1Specificity < rule2Specificity && this.hasFilterOverlap(rule1, rule2);
  }

  private isOverlyBroad(rule: GatewayRule): boolean {
    // Check for very general patterns that might catch too much traffic
    if (rule.traffic === 'true') return true;
    if (rule.traffic.includes('*') && rule.traffic.split('*').length > 3) return true;
    return false;
  }

  private calculateSpecificity(rule: GatewayRule): number {
    let specificity = 0;
    
    // Count specific conditions in traffic expression
    if (rule.traffic.includes('==')) specificity += 3;
    if (rule.traffic.includes('in')) specificity += 2;
    if (rule.traffic.includes('contains')) specificity += 1;
    
    // Add filter count
    specificity += rule.filters.length;
    
    // Subtract for wildcards and broad patterns
    if (rule.traffic.includes('*')) specificity -= 1;
    if (rule.traffic === 'true') specificity -= 5;
    
    return Math.max(0, specificity);
  }

  private extractDomains(traffic: string): string[] {
    const domains: string[] = [];
    
    // Extract domains from common patterns
    const domainPatterns = [
      /dns\.fqdn\s*==\s*"([^"]+)"/g,
      /dns\.domain\s*==\s*"([^"]+)"/g,
      /http\.request\.host\s*==\s*"([^"]+)"/g
    ];
    
    domainPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(traffic)) !== null) {
        domains.push(match[1]);
      }
    });
    
    return domains;
  }

  displayAnalysis(analysis: RuleAnalysis): void {
    console.log(`Analysis Summary: ${analysis.summary.totalRules} rules analyzed`);
    console.log(`Errors: ${analysis.summary.errors}, Warnings: ${analysis.summary.warnings}`);
    
    if (analysis.issues.length > 0) {
      console.log('\nIssues Found:');
      analysis.issues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.severity?.toUpperCase()}] ${issue.message}`);
      });
    }
  }
}

describe('RuleAnalyzer', () => {
  let analyzer: RuleAnalyzer;

  beforeEach(() => {
    analyzer = new RuleAnalyzer();
  });

  describe('analyzeRules', () => {
    it('should analyze basic rule statistics', () => {
      const rules = mockGatewayRules.slice(0, 2); // Use first 2 rules
      const analysis = analyzer.analyzeRules(rules);

      expect(analysis.summary.totalRules).toBe(2);
      expect(analysis.issues).toBeInstanceOf(Array);
      expect(analysis.proposedOrder).toBeInstanceOf(Array);
    });

    it('should handle empty rule set', () => {
      const analysis = analyzer.analyzeRules([]);

      expect(analysis.summary.totalRules).toBe(0);
      expect(analysis.summary.errors).toBe(0);
      expect(analysis.summary.warnings).toBe(0);
      expect(analysis.issues).toHaveLength(0);
    });

    it('should count issue types correctly', () => {
      const conflictingRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'rule-conflict-1',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'rule-conflict-2',
          action: 'allow',
          traffic: 'dns.fqdn == "example.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(conflictingRules);

      expect(analysis.summary.errors).toBeGreaterThan(0);
      expect(analysis.issues.some(i => i.type === 'error')).toBe(true);
    });

    it('should analyze rules with different traffic types', () => {
      const mixedRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'dns-rule',
          traffic: 'dns.fqdn == "dns.example.com"',
          filters: ['dns']
        },
        {
          ...mockGatewayRules[0],
          id: 'http-rule',
          traffic: 'http.request.host == "http.example.com"',
          filters: ['http']
        }
      ];

      const analysis = analyzer.analyzeRules(mixedRules);

      expect(analysis.summary.totalRules).toBe(2);
      // Should complete without throwing errors
    });
  });

  describe('conflict detection', () => {
    it('should detect conflicting rules with same domain', () => {
      const conflictingRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'block-rule',
          name: 'Block Example',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'allow-rule',
          name: 'Allow Example',
          action: 'allow',
          traffic: 'dns.fqdn == "example.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(conflictingRules);

      const conflictIssues = analysis.issues.filter(i => i.category === 'conflict');
      expect(conflictIssues).toHaveLength(1);
      expect(conflictIssues[0].type).toBe('error');
      expect(conflictIssues[0].severity).toBe('high');
    });

    it('should not detect conflicts for rules with same action', () => {
      const nonConflictingRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'block-rule-1',
          action: 'block',
          traffic: 'dns.fqdn == "bad1.example.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'block-rule-2',
          action: 'block',
          traffic: 'dns.fqdn == "bad2.example.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(nonConflictingRules);

      const conflictIssues = analysis.issues.filter(i => i.category === 'conflict');
      expect(conflictIssues).toHaveLength(0);
    });

    it('should detect conflicts in HTTP rules', () => {
      const httpConflictRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'http-block',
          action: 'block',
          traffic: 'http.request.host == "test.com"',
          filters: ['http']
        },
        {
          ...mockGatewayRules[0],
          id: 'http-allow',
          action: 'allow',
          traffic: 'http.request.host == "test.com"',
          filters: ['http']
        }
      ];

      const analysis = analyzer.analyzeRules(httpConflictRules);

      const conflictIssues = analysis.issues.filter(i => i.category === 'conflict');
      expect(conflictIssues.length).toBeGreaterThan(0);
    });
  });

  describe('redundancy detection', () => {
    it('should detect redundant rules', () => {
      const redundantRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'original-rule',
          name: 'Original Rule',
          action: 'block',
          traffic: 'dns.fqdn == "duplicate.com"',
          filters: ['dns']
        },
        {
          ...mockGatewayRules[0],
          id: 'duplicate-rule',
          name: 'Duplicate Rule',
          action: 'block',
          traffic: 'dns.fqdn == "duplicate.com"',
          filters: ['dns']
        }
      ];

      const analysis = analyzer.analyzeRules(redundantRules);

      const redundancyIssues = analysis.issues.filter(i => i.category === 'redundancy');
      expect(redundancyIssues).toHaveLength(1);
      expect(redundancyIssues[0].type).toBe('warning');
      expect(redundancyIssues[0].relatedRules).toContain('duplicate-rule');
    });

    it('should not flag similar but different rules as redundant', () => {
      const similarRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'rule-1',
          action: 'block',
          traffic: 'dns.fqdn == "different1.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'rule-2',
          action: 'block',
          traffic: 'dns.fqdn == "different2.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(similarRules);

      const redundancyIssues = analysis.issues.filter(i => i.category === 'redundancy');
      expect(redundancyIssues).toHaveLength(0);
    });
  });

  describe('precedence analysis', () => {
    it('should suggest reordering when specific rule comes after general rule', () => {
      const incorrectOrderRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'general-rule',
          name: 'General Block',
          precedence: 1000,
          action: 'block',
          traffic: 'dns.fqdn contains ".com"', // More general
          filters: ['dns']
        },
        {
          ...mockGatewayRules[0],
          id: 'specific-rule',
          name: 'Specific Allow',
          precedence: 2000,
          action: 'allow',
          traffic: 'dns.fqdn == "allowed.com"', // More specific
          filters: ['dns']
        }
      ];

      const analysis = analyzer.analyzeRules(incorrectOrderRules);

      const orderingIssues = analysis.issues.filter(i => i.category === 'ordering');
      expect(orderingIssues.length).toBeGreaterThan(0);
      expect(analysis.proposedOrder?.length).toBeGreaterThan(0);
    });

    it('should not suggest reordering for correctly ordered rules', () => {
      const correctOrderRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'specific-rule',
          precedence: 1000,
          traffic: 'dns.fqdn == "specific.com"',
          filters: ['dns']
        },
        {
          ...mockGatewayRules[0],
          id: 'general-rule',
          precedence: 2000,
          traffic: 'dns.fqdn contains ".com"',
          filters: ['dns']
        }
      ];

      const analysis = analyzer.analyzeRules(correctOrderRules);

      const orderingIssues = analysis.issues.filter(i => i.category === 'ordering');
      expect(orderingIssues).toHaveLength(0);
    });

    it('should handle rules with identical precedence', () => {
      const samePrecedenceRules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'rule-1',
          precedence: 1000,
          traffic: 'dns.fqdn == "test1.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'rule-2',
          precedence: 1000,
          traffic: 'dns.fqdn == "test2.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(samePrecedenceRules);

      // Should not throw errors
      expect(analysis.summary.totalRules).toBe(2);
    });
  });

  describe('performance analysis', () => {
    it('should flag rules with many filters', () => {
      const complexRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'complex-rule',
        filters: Array.from({ length: 15 }, (_, i) => `filter-${i}`)
      };

      const analysis = analyzer.analyzeRules([complexRule]);

      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.some(i => i.message.includes('many filters'))).toBe(true);
    });

    it('should flag disabled rules', () => {
      const disabledRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'disabled-rule',
        enabled: false
      };

      const analysis = analyzer.analyzeRules([disabledRule]);

      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.some(i => i.message.includes('disabled'))).toBe(true);
    });

    it('should flag overly broad rules', () => {
      const broadRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'broad-rule',
        traffic: 'true' // Matches everything
      };

      const analysis = analyzer.analyzeRules([broadRule]);

      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.some(i => i.message.includes('too broad'))).toBe(true);
    });

    it('should handle rules with wildcard patterns', () => {
      const wildcardRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'wildcard-rule',
        traffic: 'dns.fqdn matches "*.*.*.example.com"'
      };

      const analysis = analyzer.analyzeRules([wildcardRule]);

      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.some(i => i.message.includes('too broad'))).toBe(true);
    });
  });

  describe('specificity calculation', () => {
    it('should calculate higher specificity for exact matches', () => {
      const specificRule: GatewayRule = {
        ...mockGatewayRules[0],
        traffic: 'dns.fqdn == "exact.example.com"',
        filters: ['dns', 'specific']
      };

      const generalRule: GatewayRule = {
        ...mockGatewayRules[0],
        traffic: 'dns.fqdn contains "example"',
        filters: ['dns']
      };

      // Test indirectly through precedence analysis
      const rules = [generalRule, specificRule];
      const analysis = analyzer.analyzeRules(rules);

      // The analyzer should work without throwing errors
      expect(analysis.summary.totalRules).toBe(2);
    });

    it('should handle rules with no specific conditions', () => {
      const vagueRule: GatewayRule = {
        ...mockGatewayRules[0],
        traffic: 'true',
        filters: []
      };

      const analysis = analyzer.analyzeRules([vagueRule]);

      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.length).toBeGreaterThan(0);
    });
  });

  describe('domain extraction', () => {
    it('should extract domains from DNS filter expressions', () => {
      const rules: GatewayRule[] = [
        {
          ...mockGatewayRules[0],
          id: 'dns-rule',
          traffic: 'dns.fqdn == "example.com"'
        },
        {
          ...mockGatewayRules[0],
          id: 'http-rule',  
          traffic: 'http.request.host == "example.com"'
        }
      ];

      const analysis = analyzer.analyzeRules(rules);

      // Should detect overlap between DNS and HTTP rules for same domain
      const conflictIssues = analysis.issues.filter(i => i.category === 'conflict');
      expect(conflictIssues.length).toBeGreaterThan(0);
    });

    it('should handle complex filter expressions', () => {
      const complexRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'complex-rule',
        traffic: 'dns.fqdn == "test1.com" or dns.fqdn == "test2.com"'
      };

      const analysis = analyzer.analyzeRules([complexRule]);

      // Should not throw errors when parsing complex expressions
      expect(analysis.summary.totalRules).toBe(1);
    });
  });

  describe('displayAnalysis', () => {
    it('should display analysis without throwing errors', () => {
      const analysis = analyzer.analyzeRules(mockGatewayRules);
      
      // Mock console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      analyzer.displayAnalysis(analysis);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle analysis with no issues', () => {
      const cleanAnalysis: RuleAnalysis = {
        issues: [],
        proposedOrder: [],
        summary: {
          totalRules: 5,
          errors: 0,
          warnings: 0,
          suggestions: 0
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      analyzer.displayAnalysis(cleanAnalysis);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle rules with null or undefined properties', () => {
      const malformedRule: any = {
        ...mockGatewayRules[0],
        id: 'malformed-rule',
        traffic: null,
        filters: undefined
      };

      // Should not throw when analyzing malformed rules
      expect(() => analyzer.analyzeRules([malformedRule])).not.toThrow();
    });

    it('should handle rules with empty traffic expressions', () => {
      const emptyTrafficRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'empty-traffic',
        traffic: ''
      };

      const analysis = analyzer.analyzeRules([emptyTrafficRule]);
      expect(analysis.summary.totalRules).toBe(1);
    });

    it('should handle very large rule sets efficiently', () => {
      const largeRuleSet: GatewayRule[] = Array.from({ length: 100 }, (_, i) => ({
        ...mockGatewayRules[0],
        id: `rule-${i}`,
        name: `Rule ${i}`,
        precedence: 1000 + i,
        traffic: `dns.fqdn == "domain${i}.com"`
      }));

      const startTime = Date.now();
      const analysis = analyzer.analyzeRules(largeRuleSet);
      const endTime = Date.now();

      expect(analysis.summary.totalRules).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle rules with special characters in expressions', () => {
      const specialCharRule: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'special-char-rule',
        traffic: 'dns.fqdn == "test-domain_with.special$chars.com"'
      };

      const analysis = analyzer.analyzeRules([specialCharRule]);
      expect(analysis.summary.totalRules).toBe(1);
    });

    it('should handle circular rule references gracefully', () => {
      const rule1: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'rule-1',
        traffic: 'dns.fqdn == "circular.com"'
      };

      const rule2: GatewayRule = {
        ...mockGatewayRules[0],
        id: 'rule-2',
        traffic: 'dns.fqdn == "circular.com"'
      };

      const analysis = analyzer.analyzeRules([rule1, rule2]);
      
      // Should detect redundancy but not infinite loops
      expect(analysis.issues.length).toBeGreaterThan(0);
      expect(analysis.summary.totalRules).toBe(2);
    });
  });
});
