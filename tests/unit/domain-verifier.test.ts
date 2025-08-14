import { describe, it, expect, beforeEach } from '@jest/globals';
import { DomainVerifier, RuleVerificationContext } from '../../src/utils/domain-verifier';

// Note: Following user rules - using real data instead of mocks where possible
// However, for DNS operations in tests, we need to use controlled environments

describe('DomainVerifier', () => {
  let domainVerifier: DomainVerifier;

  beforeEach(() => {
    domainVerifier = new DomainVerifier(2000); // Shorter timeout for tests
  });

  describe('extractDomainsFromFilters', () => {
    it('should extract domains from dns.fqdn in format correctly', () => {
      const filters = [
        'dns.fqdn in {"example.com" "test.org" "subdomain.example.com"}'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('example.com');
      expect(result).toContain('test.org');
      expect(result).toContain('subdomain.example.com');
      expect(result).toHaveLength(3);
    });

    it('should extract domains from dns.fqdn == format correctly', () => {
      const filters = [
        'dns.fqdn == "example.com"',
        'dns.fqdn == "another-domain.net"'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('example.com');
      expect(result).toContain('another-domain.net');
      expect(result).toHaveLength(2);
    });

    it('should extract domains from http.request.uri.host == format correctly', () => {
      const filters = [
        'http.request.uri.host == "api.example.com"'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('api.example.com');
      expect(result).toHaveLength(1);
    });

    it('should extract domains from http.request.uri.host in format correctly', () => {
      const filters = [
        'http.request.uri.host in {"api.example.com" "cdn.example.org" "static.test.com"}'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('api.example.com');
      expect(result).toContain('cdn.example.org');
      expect(result).toContain('static.test.com');
      expect(result).toHaveLength(3);
    });

    it('should handle mixed filter formats in a single call', () => {
      const filters = [
        'dns.fqdn in {"example.com" "test.org"}',
        'dns.fqdn == "single-domain.com"',
        'http.request.uri.host == "api.example.net"',
        'http.request.uri.host in {"cdn.test.io" "static.example.co"}'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('example.com');
      expect(result).toContain('test.org');
      expect(result).toContain('single-domain.com');
      expect(result).toContain('api.example.net');
      expect(result).toContain('cdn.test.io');
      expect(result).toContain('static.example.co');
      expect(result).toHaveLength(6);
    });

    it('should ignore invalid domain formats', () => {
      const filters = [
        'dns.fqdn in {"valid-domain.com" "invalid..domain" "another-valid.org" "-.invalid"}',
        'dns.fqdn == "toolong' + 'a'.repeat(250) + '.com"' // Domain longer than 253 chars
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('valid-domain.com');
      expect(result).toContain('another-valid.org');
      expect(result).not.toContain('invalid..domain');
      expect(result).not.toContain('-.invalid');
      expect(result).toHaveLength(2);
    });

    it('should handle empty filter array', () => {
      const result = domainVerifier.extractDomainsFromFilters([]);

      expect(result).toHaveLength(0);
    });

    it('should handle filters with no domain matches', () => {
      const filters = [
        'src.ip in {1.2.3.4 5.6.7.8}',
        'user.email == "test@example.com"',
        'http.request.method == "POST"'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toHaveLength(0);
    });

    it('should deduplicate domains found in multiple filters', () => {
      const filters = [
        'dns.fqdn in {"example.com" "test.org"}',
        'dns.fqdn == "example.com"',
        'http.request.uri.host == "test.org"'
      ];

      const result = domainVerifier.extractDomainsFromFilters(filters);

      expect(result).toContain('example.com');
      expect(result).toContain('test.org');
      expect(result).toHaveLength(2); // Should not have duplicates
    });
  });

  describe('domain format validation', () => {
    it('should validate standard domain formats', () => {
      const validDomains = [
        'example.com',
        'subdomain.example.org',
        'multi.level.subdomain.test.net',
        'a.co',
        'test-domain.com',
        'domain123.org'
      ];

      validDomains.forEach(domain => {
        const result = domainVerifier.extractDomainsFromFilters([`dns.fqdn == "${domain}"`]);
        expect(result).toContain(domain);
      });
    });

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'invalid..domain.com',
        '.invalid-start.com',
        'invalid-end.com.',
        '-invalid-hyphen-start.com',
        'invalid-hyphen-end-.com',
        'toolong' + 'a'.repeat(250) + '.com',
        'invalid_underscore.com',
        'invalid space.com',
        'invalid@symbol.com'
      ];

      invalidDomains.forEach(domain => {
        const result = domainVerifier.extractDomainsFromFilters([`dns.fqdn == "${domain}"`]);
        expect(result).not.toContain(domain);
      });
    });
  });

  describe('verifyDomain', () => {
    it('should resolve well-known domains successfully', async () => {
      // Using real, stable domains for testing as per user rules
      const result = await domainVerifier.verifyDomain('google.com');

      expect(result.domain).toBe('google.com');
      expect(result.success).toBe(true);
      expect(result.ip).toBeDefined();
      expect(typeof result.ip).toBe('string');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should handle non-existent domains gracefully', async () => {
      // Using a domain that should not exist
      const nonExistentDomain = 'this-domain-definitely-does-not-exist-12345.com';
      const result = await domainVerifier.verifyDomain(nonExistentDomain);

      expect(result.domain).toBe(nonExistentDomain);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.ip).toBeUndefined();
    });

    it('should handle DNS timeouts gracefully', async () => {
      // Create a verifier with very short timeout to force timeout
      const shortTimeoutVerifier = new DomainVerifier(1); // 1ms timeout
      
      // Even a real domain should timeout with 1ms
      const result = await shortTimeoutVerifier.verifyDomain('google.com');

      expect(result.domain).toBe('google.com');
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.responseTime).toBeLessThan(100); // Should be very fast due to timeout
    });

    it('should measure response time accurately', async () => {
      const result = await domainVerifier.verifyDomain('google.com');

      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.responseTime).toBeLessThan(5000); // Should be within our timeout
    });
  });

  describe('verifyDomains', () => {
    it('should handle empty domain list', async () => {
      const result = await domainVerifier.verifyDomains([]);

      expect(result.totalDomains).toBe(0);
      expect(result.successfulDomains).toBe(0);
      expect(result.failedDomains).toBe(0);
      expect(result.averageResponseTime).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should verify multiple real domains successfully', async () => {
      // Using real, stable domains
      const domains = ['google.com', 'github.com', 'stackoverflow.com'];
      const result = await domainVerifier.verifyDomains(domains);

      expect(result.totalDomains).toBe(3);
      expect(result.successfulDomains).toBeGreaterThan(0); // At least some should succeed
      expect(result.results).toHaveLength(3);
      expect(result.averageResponseTime).toBeGreaterThan(0);

      // Verify structure of individual results
      result.results.forEach(domainResult => {
        expect(domainResult.domain).toBeDefined();
        expect(typeof domainResult.success).toBe('boolean');
        expect(typeof domainResult.responseTime).toBe('number');
        expect(domainResult.responseTime).toBeGreaterThan(0);
      });
    });

    it('should handle mixed valid and invalid domains', async () => {
      const domains = [
        'google.com', // Should succeed
        'this-domain-does-not-exist-test-12345.com', // Should fail
        'github.com' // Should succeed
      ];

      const result = await domainVerifier.verifyDomains(domains);

      expect(result.totalDomains).toBe(3);
      expect(result.successfulDomains).toBeGreaterThanOrEqual(1); // At least one should succeed
      expect(result.failedDomains).toBeGreaterThanOrEqual(1); // At least one should fail
      expect(result.successfulDomains + result.failedDomains).toBe(3);
      expect(result.results).toHaveLength(3);

      // Verify that we have both successful and failed results
      const successful = result.results.filter(r => r.success);
      const failed = result.results.filter(r => !r.success);
      
      expect(successful.length).toBe(result.successfulDomains);
      expect(failed.length).toBe(result.failedDomains);

      // Check successful results have IPs
      successful.forEach(r => {
        expect(r.ip).toBeDefined();
        expect(r.error).toBeUndefined();
      });

      // Check failed results have errors
      failed.forEach(r => {
        expect(r.ip).toBeUndefined();
        expect(r.error).toBeDefined();
      });
    });

    it('should process domains in batches for large lists', async () => {
      // Create a larger list to test batching
      const domains = [
        'google.com',
        'github.com',
        'stackoverflow.com',
        'microsoft.com',
        'cloudflare.com',
        'amazon.com'
      ];

      const result = await domainVerifier.verifyDomains(domains);

      expect(result.totalDomains).toBe(6);
      expect(result.results).toHaveLength(6);
      expect(result.successfulDomains + result.failedDomains).toBe(6);

      // Most of these well-known domains should resolve successfully
      expect(result.successfulDomains).toBeGreaterThanOrEqual(3);
    });
  });

  describe('verifyRuleImplementation', () => {
    it('should handle rule context with no domains', async () => {
      const context: RuleVerificationContext = {
        ruleName: 'Test Rule',
        action: 'allow',
        domains: [],
        phase: 'pre'
      };

      const result = await domainVerifier.verifyRuleImplementation(context);

      expect(result.totalDomains).toBe(0);
      expect(result.successfulDomains).toBe(0);
      expect(result.failedDomains).toBe(0);
      expect(result.averageResponseTime).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle pre-rule verification with allow action', async () => {
      const context: RuleVerificationContext = {
        ruleName: 'Allow Test Rule',
        action: 'allow',
        domains: ['google.com', 'github.com'],
        phase: 'pre'
      };

      const result = await domainVerifier.verifyRuleImplementation(context);

      expect(result.totalDomains).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(typeof result.averageResponseTime).toBe('number');
    });

    it('should handle post-rule verification with block action', async () => {
      const context: RuleVerificationContext = {
        ruleName: 'Block Test Rule',
        action: 'block',
        domains: ['google.com'],
        phase: 'post'
      };

      const result = await domainVerifier.verifyRuleImplementation(context);

      expect(result.totalDomains).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].domain).toBe('google.com');
    });

    it('should handle different rule actions correctly', async () => {
      const actions: Array<'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect'> = 
        ['allow', 'block', 'isolate', 'do_not_isolate', 'do_not_inspect', 'inspect'];

      for (const action of actions) {
        const context: RuleVerificationContext = {
          ruleName: `Test ${action} Rule`,
          action,
          domains: ['google.com'],
          phase: 'pre'
        };

        const result = await domainVerifier.verifyRuleImplementation(context);

        expect(result.totalDomains).toBe(1);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].domain).toBe('google.com');
      }
    });
  });

  describe('waitForRulePropagation', () => {
    it('should wait for the specified duration', async () => {
      const startTime = Date.now();
      const waitSeconds = 1; // Use 1 second for faster tests

      await domainVerifier.waitForRulePropagation(waitSeconds);

      const endTime = Date.now();
      const actualWaitTime = endTime - startTime;

      // Allow some tolerance for timing precision
      expect(actualWaitTime).toBeGreaterThanOrEqual(waitSeconds * 950); // 95% of expected time
      expect(actualWaitTime).toBeLessThan(waitSeconds * 1500); // Allow 50% extra for system overhead
    });
  });

  describe('timeout handling', () => {
    it('should respect custom timeout settings', async () => {
      const customTimeout = 100; // Very short timeout
      const customVerifier = new DomainVerifier(customTimeout);

      const startTime = Date.now();
      
      // This should timeout quickly even with a real domain
      const result = await customVerifier.verifyDomain('google.com');
      
      const endTime = Date.now();
      const actualTime = endTime - startTime;

      // The actual time should be close to our timeout
      expect(actualTime).toBeLessThan(customTimeout + 500); // Allow some overhead
      
      if (!result.success) {
        expect(result.error).toContain('timeout');
      }
    });
  });
});
