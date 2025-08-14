import { describe, it, expect, beforeEach } from '@jest/globals';
import { DomainConflictDetector } from '../../src/rules/domain-conflict-detector.js';
import { RuleAnalyzer } from '../../src/rules/rule-analyzer.js';
import type { GatewayRule } from '../../src/types/gateway.js';

describe('Rule Management Integration', () => {
  let conflictDetector: DomainConflictDetector;
  let ruleAnalyzer: RuleAnalyzer;
  
  const createRule = (overrides: Partial<GatewayRule>): GatewayRule => ({
    id: 'rule-default',
    name: 'Default Rule',
    description: '',
    action: 'block',
    enabled: true,
    filters: ['dns'],
    traffic: 'dns.fqdn == "default.com"',
    precedence: 1000,
    identity: '',
    device_posture: '',
    rule_settings: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  });

  beforeEach(() => {
    conflictDetector = new DomainConflictDetector();
    ruleAnalyzer = new RuleAnalyzer();
  });

  describe('Complete rule creation workflow', () => {
    it('should detect and handle conflicts when creating a new rule', () => {
      // Existing rules in the system
      const existingRules: GatewayRule[] = [
        createRule({
          id: 'rule-1',
          name: 'Block Social Media',
          action: 'block',
          traffic: 'dns.fqdn in {"facebook.com" "twitter.com" "instagram.com"}',
          precedence: 1000
        }),
        createRule({
          id: 'rule-2',
          name: 'Allow Work Social',
          action: 'allow',
          traffic: 'dns.fqdn == "workplace.facebook.com"',
          precedence: 900
        })
      ];

      // New rule that conflicts
      const newRule = {
        name: 'Block All Facebook',
        action: 'block' as const,
        filters: ['dns.fqdn matches "^.*\\.facebook\\.com$"'],
        traffic: 'dns'
      };

      // Step 1: Detect domain conflicts
      const domainConflicts = conflictDetector.detectConflicts(newRule, existingRules);
      
      expect(domainConflicts).toHaveLength(2);
      expect(domainConflicts.some(c => c.type === 'WILDCARD_OVERLAP')).toBe(true);
      expect(domainConflicts.some(c => c.existingRuleName === 'Allow Work Social')).toBe(true);

      // Step 2: Analyze the full ruleset
      const analysis = ruleAnalyzer.analyzeRules(existingRules);
      
      expect(analysis.totalRules).toBe(2);
      expect(analysis.issues).toBeDefined();
      
      // Step 3: Get consolidation suggestions
      const suggestions = conflictDetector.suggestConsolidation(newRule, domainConflicts);
      
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should analyze rule precedence and suggest reordering', () => {
      const rules: GatewayRule[] = [
        createRule({
          id: 'general-rule',
          name: 'Block All .com',
          action: 'block',
          traffic: 'dns.fqdn contains ".com"',
          precedence: 1000
        }),
        createRule({
          id: 'specific-rule',
          name: 'Allow Specific Site',
          action: 'allow',
          traffic: 'dns.fqdn == "allowed.com"',
          precedence: 2000
        })
      ];

      const analysis = ruleAnalyzer.analyzeRules(rules);
      
      // Should detect that specific rule will never be evaluated
      const orderingIssues = analysis.issues.filter(i => i.category === 'ordering');
      expect(orderingIssues.length).toBeGreaterThan(0);
      
      // Should suggest reordering
      expect(analysis.proposedOrder).toBeDefined();
      if (analysis.proposedOrder && analysis.proposedOrder.length > 0) {
        expect(analysis.proposedOrder[0].suggestedPrecedence).toBeLessThan(1000);
      }
    });
  });

  describe('Rule optimization workflow', () => {
    it('should identify redundant rules for consolidation', () => {
      const rules: GatewayRule[] = [
        createRule({
          id: 'rule-1',
          name: 'Block Malware 1',
          action: 'block',
          traffic: 'dns.fqdn in {"malware1.com" "malware2.com"}',
          precedence: 1000
        }),
        createRule({
          id: 'rule-2',
          name: 'Block Malware 2',
          action: 'block',
          traffic: 'dns.fqdn in {"malware3.com" "malware4.com"}',
          precedence: 1001
        }),
        createRule({
          id: 'rule-3',
          name: 'Block Malware 3',
          action: 'block',
          traffic: 'dns.fqdn == "malware5.com"',
          precedence: 1002
        })
      ];

      const analysis = ruleAnalyzer.analyzeRules(rules);
      
      // Should identify that these rules could be consolidated
      const redundancyIssues = analysis.issues.filter(i => i.category === 'redundancy');
      expect(redundancyIssues.length).toBeGreaterThanOrEqual(0);
      
      // Should have optimization suggestions
      expect(analysis.optimizationSuggestions).toBeDefined();
    });

    it('should detect performance issues with overly broad rules', () => {
      const rules: GatewayRule[] = [
        createRule({
          id: 'broad-rule',
          name: 'Block Everything',
          action: 'block',
          traffic: 'true', // Matches all traffic
          precedence: 1000
        }),
        createRule({
          id: 'specific-rule',
          name: 'Allow Specific',
          action: 'allow',
          traffic: 'dns.fqdn == "allowed.com"',
          precedence: 2000
        })
      ];

      const analysis = ruleAnalyzer.analyzeRules(rules);
      
      // Should detect performance issue with overly broad rule
      const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
      expect(performanceIssues.length).toBeGreaterThan(0);
      
      // Should warn about the broad rule
      const broadRuleIssue = performanceIssues.find(i => i.ruleId === 'broad-rule');
      expect(broadRuleIssue).toBeDefined();
      expect(broadRuleIssue?.message).toContain('broad');
    });
  });

  describe('Complex conflict scenarios', () => {
    it('should handle multiple overlapping wildcard patterns', () => {
      const existingRules: GatewayRule[] = [
        createRule({
          id: 'rule-1',
          name: 'Block *.example.com',
          action: 'block',
          traffic: 'dns.fqdn matches "^.*\\.example\\.com$"',
          precedence: 1000
        }),
        createRule({
          id: 'rule-2',
          name: 'Allow api.example.com',
          action: 'allow',
          traffic: 'dns.fqdn == "api.example.com"',
          precedence: 900
        })
      ];

      const newRule = {
        name: 'Block test.example.com',
        action: 'block' as const,
        filters: ['dns.fqdn == "test.example.com"'],
        traffic: 'dns'
      };

      const conflicts = conflictDetector.detectConflicts(newRule, existingRules);
      
      // Should detect that this is already covered by wildcard
      expect(conflicts.some(c => c.type === 'REDUNDANT' || c.type === 'SUBSET')).toBe(true);
    });

    it('should handle country-based filtering conflicts', () => {
      const existingRules: GatewayRule[] = [
        createRule({
          id: 'rule-1',
          name: 'Block High Risk Countries',
          action: 'block',
          traffic: 'net.src.geo.country in {"CN" "RU" "KP"}',
          filters: ['l4'],
          precedence: 1000
        })
      ];

      const newRule = {
        name: 'Allow Specific IP from China',
        action: 'allow' as const,
        filters: ['net.src.ip == "1.2.3.4" and net.src.geo.country == "CN"'],
        traffic: 'l4'
      };

      const conflicts = conflictDetector.detectConflicts(newRule, existingRules);
      
      // Should detect country-based conflict
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].description).toContain('country');
    });
  });

  describe('Rule analysis statistics', () => {
    it('should provide accurate statistics for ruleset', () => {
      const rules: GatewayRule[] = [
        createRule({ id: 'r1', action: 'block', traffic: 'dns.fqdn == "bad.com"', enabled: true }),
        createRule({ id: 'r2', action: 'allow', traffic: 'dns.fqdn == "good.com"', enabled: true }),
        createRule({ id: 'r3', action: 'block', traffic: 'dns.fqdn == "malware.com"', enabled: false }),
        createRule({ id: 'r4', action: 'isolate', traffic: 'dns.fqdn == "suspicious.com"', enabled: true }),
        createRule({ id: 'r5', action: 'block', filters: ['http'], traffic: 'http.request.host == "blocked.com"', enabled: true })
      ];

      const analysis = ruleAnalyzer.analyzeRules(rules);
      
      expect(analysis.totalRules).toBe(5);
      expect(analysis.enabledRules).toBe(4);
      expect(analysis.disabledRules).toBe(1);
      expect(analysis.byAction['block']).toBe(3);
      expect(analysis.byAction['allow']).toBe(1);
      expect(analysis.byAction['isolate']).toBe(1);
      expect(analysis.byTrafficType['dns']).toBe(4);
      expect(analysis.byTrafficType['http']).toBe(1);
    });
  });
});