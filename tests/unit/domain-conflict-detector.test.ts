import { describe, it, expect, beforeEach } from '@jest/globals';
import { DomainConflictDetector } from '../../src/rules/domain-conflict-detector.js';
import type { GatewayRule } from '../../src/types/gateway.js';

describe('DomainConflictDetector', () => {
  let detector: DomainConflictDetector;
  
  const createMockRule = (overrides: Partial<GatewayRule> = {}): GatewayRule => ({
    id: 'rule-1',
    name: 'Test Rule',
    description: '',
    action: 'block',
    enabled: true,
    filters: ['dns'],
    traffic: 'dns.fqdn == "example.com"',
    precedence: 1000,
    identity: '',
    device_posture: '',
    rule_settings: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides
  });

  beforeEach(() => {
    detector = new DomainConflictDetector();
  });

  describe('detectConflicts', () => {
    it('should detect conflicts between allow and block rules for same domain', () => {
      const newRule = {
        name: 'Allow Example',
        action: 'allow' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };
      
      const existingRules = [
        createMockRule({
          id: 'existing-1',
          name: 'Block Example',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        })
      ];
      
      const conflicts = detector.detectConflicts(newRule, existingRules);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('CONFLICTING_ACTIONS');
      expect(conflicts[0].severity).toBe('high');
      expect(conflicts[0].overlappingDomains).toContain('example.com');
    });

    it('should detect redundant rules with same action and domain', () => {
      const newRule = {
        name: 'Block Example Again',
        action: 'block' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };
      
      const existingRules = [
        createMockRule({
          id: 'existing-1',
          name: 'Block Example',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        })
      ];
      
      const conflicts = detector.detectConflicts(newRule, existingRules);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('REDUNDANT');
      expect(conflicts[0].severity).toBe('low');
    });

    it('should detect subset relationships in domain lists', () => {
      const newRule = {
        name: 'Block Subset',
        action: 'block' as const,
        filters: ['dns.fqdn in {"example.com" "test.com"}'],
        traffic: 'dns'
      };
      
      const existingRules = [
        createMockRule({
          id: 'existing-1',
          name: 'Block Superset',
          action: 'block',
          traffic: 'dns.fqdn in {"example.com" "test.com" "demo.com" "sample.com"}'
        })
      ];
      
      const conflicts = detector.detectConflicts(newRule, existingRules);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('SUBSET');
      expect(conflicts[0].overlappingDomains).toEqual(['example.com', 'test.com']);
    });

    it('should handle wildcard patterns', () => {
      const newRule = {
        name: 'Block Wildcard',
        action: 'block' as const,
        filters: ['dns.fqdn matches "^.*\\.example\\.com$"'],
        traffic: 'dns'
      };
      
      const existingRules = [
        createMockRule({
          id: 'existing-1',
          name: 'Allow Specific',
          action: 'allow',
          traffic: 'dns.fqdn == "api.example.com"'
        })
      ];
      
      const conflicts = detector.detectConflicts(newRule, existingRules);
      
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('WILDCARD_OVERLAP');
    });

    it('should not detect conflicts for different domains', () => {
      const newRule = {
        name: 'Block Different',
        action: 'block' as const,
        filters: ['dns.fqdn == "different.com"'],
        traffic: 'dns'
      };
      
      const existingRules = [
        createMockRule({
          id: 'existing-1',
          name: 'Block Example',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        })
      ];
      
      const conflicts = detector.detectConflicts(newRule, existingRules);
      
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('suggestConsolidation', () => {
    it('should suggest extending existing rule for same action', () => {
      const newRule = {
        name: 'Block New Domain',
        action: 'block' as const,
        filters: ['dns.fqdn == "new.com"']
      };
      
      const conflicts = [{
        type: 'SIMILAR_PURPOSE' as const,
        existingRuleId: 'rule-1',
        existingRuleName: 'Block List',
        description: 'Rules have same action and similar purpose',
        overlappingDomains: [],
        severity: 'low' as const,
        suggestion: 'Consider combining into one rule'
      }];
      
      const suggestions = detector.suggestConsolidation(newRule, conflicts);
      
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('extend_existing');
      expect(suggestions[0].modifiedFilters).toContain('dns.fqdn == "new.com"');
    });

    it('should suggest removing redundant domains', () => {
      const newRule = {
        name: 'Allow Specific',
        action: 'allow' as const,
        filters: ['dns.fqdn == "allowed.com"']
      };
      
      const conflicts = [{
        type: 'CONFLICTING_ACTIONS' as const,
        existingRuleId: 'rule-1',
        existingRuleName: 'Block List',
        description: 'Conflicting actions',
        overlappingDomains: ['allowed.com'],
        severity: 'high' as const,
        suggestion: 'Remove from block list'
      }];
      
      const suggestions = detector.suggestConsolidation(newRule, conflicts);
      
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('remove_from_existing');
    });
  });

  describe('extractDomainsFromFilters', () => {
    it('should extract domains from various filter formats', () => {
      const detector = new DomainConflictDetector();
      
      const filters1 = ['dns.fqdn == "example.com"'];
      expect((detector as any).extractDomainsFromFilters(filters1)).toEqual(['example.com']);
      
      const filters2 = ['dns.fqdn in {"example.com" "test.com"}'];
      expect((detector as any).extractDomainsFromFilters(filters2)).toEqual(['example.com', 'test.com']);
      
      const filters3 = ['http.request.host == "example.com"'];
      expect((detector as any).extractDomainsFromFilters(filters3)).toEqual(['example.com']);
    });

    it('should handle complex filter expressions', () => {
      const detector = new DomainConflictDetector();
      
      const filters = [
        'dns.fqdn in {"example.com" "test.com"}',
        'dns.fqdn == "demo.com"'
      ];
      
      const domains = (detector as any).extractDomainsFromFilters(filters);
      expect(domains).toContain('example.com');
      expect(domains).toContain('test.com');
      expect(domains).toContain('demo.com');
    });
  });

  describe('extractPatternsFromFilters', () => {
    it('should extract regex patterns from matches expressions', () => {
      const detector = new DomainConflictDetector();
      
      const filters = ['dns.fqdn matches "^.*\\.example\\.com$"'];
      const patterns = (detector as any).extractPatternsFromFilters(filters);
      
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toBe('^.*\\.example\\.com$');
    });

    it('should handle multiple patterns', () => {
      const detector = new DomainConflictDetector();
      
      const filters = [
        'dns.fqdn matches "^.*\\.example\\.com$"',
        'http.request.host matches "^api\\."'
      ];
      
      const patterns = (detector as any).extractPatternsFromFilters(filters);
      expect(patterns).toHaveLength(2);
    });
  });
});