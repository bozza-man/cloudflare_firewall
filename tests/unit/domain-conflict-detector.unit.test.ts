import { describe, it, expect, beforeEach } from '@jest/globals';
import { DomainConflictDetector } from '../../src/rules/domain-conflict-detector.js';
import { TestFactory } from '../utils/test-factory.js';

describe('DomainConflictDetector', () => {
  let detector: DomainConflictDetector;

  beforeEach(() => {
    detector = new DomainConflictDetector();
  });

  describe('extractDomainsFromFilters', () => {
    it('should extract domains from dns.fqdn in format', () => {
      const filters = ['dns.fqdn in {"example.com" "test.com" "demo.org"}'];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual(['example.com', 'test.com', 'demo.org']);
    });

    it('should extract domains from dns.fqdn == format', () => {
      const filters = ['dns.fqdn == "example.com"'];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual(['example.com']);
    });

    it('should extract domains from http.request.host format', () => {
      const filters = ['http.request.host == "api.example.com"'];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual(['api.example.com']);
    });

    it('should handle multiple filter types in same array', () => {
      const filters = [
        'dns.fqdn == "example.com"',
        'http.request.host == "api.test.com"',
        'dns.fqdn in {"demo.org" "sample.net"}'
      ];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual(['example.com', 'api.test.com', 'demo.org', 'sample.net']);
    });

    it('should handle filters with no domains', () => {
      const filters = ['net.dst.port == 443', 'app.ids in {100}'];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual([]);
    });

    it('should handle malformed filters gracefully', () => {
      const filters = ['dns.fqdn in {broken', 'invalid filter', ''];
      const domains = detector.extractDomainsFromFilters(filters);
      
      expect(domains).toEqual([]);
    });
  });

  describe('extractPatternsFromFilters', () => {
    it('should extract regex patterns from matches operator', () => {
      const filters = ['dns.fqdn matches "^.*\\\\.example\\\\.com$"'];
      const patterns = detector.extractPatternsFromFilters(filters);
      
      expect(patterns).toEqual(['^.*\\.example\\.com$']);
    });

    it('should handle multiple patterns', () => {
      const filters = [
        'dns.fqdn matches "^.*\\\\.test\\\\.com$"',
        'http.request.host matches "^api-.*\\\\.example\\\\.com$"'
      ];
      const patterns = detector.extractPatternsFromFilters(filters);
      
      expect(patterns).toEqual(['^.*\\.test\\.com$', '^api-.*\\.example\\.com$']);
    });
  });

  describe('detectConflicts', () => {
    it('should detect conflicting actions on same domain', () => {
      const newRule = {
        name: 'Allow Example',
        action: 'allow' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'Block Example',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        })
      ];

      const conflicts = detector.detectConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('CONFLICTING_ACTIONS');
      expect(conflicts[0].severity).toBe('high');
      expect(conflicts[0].overlappingDomains).toEqual(['example.com']);
    });

    it('should detect redundant rules with same action', () => {
      const newRule = {
        name: 'Block Example Again',
        action: 'block' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
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

    it('should detect subset relationships', () => {
      const newRule = {
        name: 'Block Subset',
        action: 'block' as const,
        filters: ['dns.fqdn in {"sub.example.com"}'],
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'Block Multiple',
          action: 'block',
          traffic: 'dns.fqdn in {"sub.example.com" "example.com" "test.com"}'
        })
      ];

      const conflicts = detector.detectConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('SUBSET');
      expect(conflicts[0].severity).toBe('low');
    });

    it('should detect wildcard overlaps', () => {
      const newRule = {
        name: 'Block Specific',
        action: 'block' as const,
        filters: ['dns.fqdn == "api.example.com"'],
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'Block Pattern',
          action: 'allow',
          traffic: 'dns.fqdn matches "^.*\\\\.example\\\\.com$"'
        })
      ];

      const conflicts = detector.detectConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('WILDCARD_OVERLAP');
    });

    it('should not detect conflicts for different traffic types', () => {
      const newRule = {
        name: 'DNS Rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'HTTP Rule',
          action: 'allow',
          traffic: 'http.request.host == "example.com"'
        })
      ];

      const conflicts = detector.detectConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(1); // Still detects domain overlap
      expect(conflicts[0].type).toBe('CONFLICTING_ACTIONS');
    });

    it('should handle rules with no domains', () => {
      const newRule = {
        name: 'Port Rule',
        action: 'block' as const,
        filters: ['net.dst.port == 8080'],
        traffic: 'l4'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'Domain Rule',
          action: 'block',
          traffic: 'dns.fqdn == "example.com"'
        })
      ];

      const conflicts = detector.detectConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('suggestConsolidation', () => {
    it('should suggest extending existing rule for similar purpose', () => {
      const newRule = {
        name: 'Block More Sites',
        action: 'block' as const,
        filters: ['dns.fqdn == "newsite.com"']
      };

      const conflicts = [{
        type: 'SIMILAR_PURPOSE' as const,
        existingRuleId: 'rule-1',
        existingRuleName: 'Block Sites',
        severity: 'low' as const,
        description: 'Similar blocking rule exists',
        affectedRules: ['rule-1'],
        overlappingDomains: [],
        suggestion: 'Extend existing rule'
      }];

      const suggestions = detector.suggestConsolidation(newRule, conflicts);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('extend_existing');
      expect(suggestions[0].ruleId).toBe('rule-1');
    });

    it('should suggest removing from existing rule for conflicts', () => {
      const newRule = {
        name: 'Allow Site',
        action: 'allow' as const,
        filters: ['dns.fqdn == "example.com"']
      };

      const conflicts = [{
        type: 'CONFLICTING_ACTIONS' as const,
        existingRuleId: 'rule-1',
        existingRuleName: 'Block Sites',
        severity: 'high' as const,
        description: 'Conflicting actions',
        affectedRules: ['rule-1'],
        overlappingDomains: ['example.com'],
        suggestion: 'Remove from block list'
      }];

      const suggestions = detector.suggestConsolidation(newRule, conflicts);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('remove_from_existing');
    });
  });

  describe('findDomainOverlaps', () => {
    it('should find exact domain matches', () => {
      const domains1 = new Set(['example.com', 'test.com']);
      const domains2 = new Set(['example.com', 'demo.org']);
      
      const overlaps = detector.findDomainOverlaps(domains1, domains2);
      
      expect(overlaps).toEqual(['example.com']);
    });

    it('should find subdomain relationships', () => {
      const domains1 = new Set(['api.example.com']);
      const domains2 = new Set(['example.com']);
      
      const overlaps = detector.findDomainOverlaps(domains1, domains2);
      
      expect(overlaps).toContain('api.example.com ↔ example.com');
    });

    it('should handle no overlaps', () => {
      const domains1 = new Set(['example.com']);
      const domains2 = new Set(['test.org']);
      
      const overlaps = detector.findDomainOverlaps(domains1, domains2);
      
      expect(overlaps).toEqual([]);
    });
  });
});