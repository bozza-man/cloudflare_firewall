import { describe, it, expect } from '@jest/globals';

// Simple domain parser functionality extracted for testing
// This focuses on the core logic without UI dependencies
class DomainParser {
  /**
   * Extract domains from Gateway rule filters
   */
  extractDomainsFromFilters(filters: string[]): string[] {
    const domains = new Set<string>();

    for (const filter of filters) {
      // Extract from dns.fqdn in {"domain1.com" "domain2.com"} format
      const dnsInMatch = filter.match(/dns\.fqdn\s+in\s*\{([^}]+)\}/);
      if (dnsInMatch) {
        const domainList = dnsInMatch[1];
        const domainMatches = domainList.match(/"([^"]+)"/g);
        if (domainMatches) {
          domainMatches.forEach(match => {
            const domain = match.replace(/"/g, '');
            if (this.isValidDomain(domain)) {
              domains.add(domain);
            }
          });
        }
      }

      // Extract from dns.fqdn == "domain.com" format
      const dnsEqualMatch = filter.match(/dns\.fqdn\s*==\s*"([^"]+)"/);
      if (dnsEqualMatch) {
        const domain = dnsEqualMatch[1];
        if (this.isValidDomain(domain)) {
          domains.add(domain);
        }
      }

      // Extract from http.request.uri.host format
      const httpHostMatch = filter.match(/http\.request\.uri\.host\s*(?:==|in)\s*(?:"([^"]+)"|\{([^}]+)\})/);
      if (httpHostMatch) {
        if (httpHostMatch[1]) {
          // Single domain
          const domain = httpHostMatch[1];
          if (this.isValidDomain(domain)) {
            domains.add(domain);
          }
        } else if (httpHostMatch[2]) {
          // Multiple domains
          const domainList = httpHostMatch[2];
          const domainMatches = domainList.match(/"([^"]+)"/g);
          if (domainMatches) {
            domainMatches.forEach(match => {
              const domain = match.replace(/"/g, '');
              if (this.isValidDomain(domain)) {
                domains.add(domain);
              }
            });
          }
        }
      }
    }

    return Array.from(domains);
  }

  /**
   * Validate if a string is a valid domain
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }
}

// Following user rules - testing with real data instead of mocks
describe('DomainParser (Real Data Testing)', () => {
  let parser: DomainParser;

  beforeEach(() => {
    parser = new DomainParser();
  });

  describe('extractDomainsFromFilters', () => {
    it('should extract domains from dns.fqdn in format correctly', () => {
      const filters = [
        'dns.fqdn in {"google.com" "github.com" "stackoverflow.com"}'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('google.com');
      expect(result).toContain('github.com');
      expect(result).toContain('stackoverflow.com');
      expect(result).toHaveLength(3);
    });

    it('should extract domains from dns.fqdn == format correctly', () => {
      const filters = [
        'dns.fqdn == "google.com"',
        'dns.fqdn == "cloudflare.com"'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('google.com');
      expect(result).toContain('cloudflare.com');
      expect(result).toHaveLength(2);
    });

    it('should extract domains from http.request.uri.host == format correctly', () => {
      const filters = [
        'http.request.uri.host == "api.github.com"'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('api.github.com');
      expect(result).toHaveLength(1);
    });

    it('should extract domains from http.request.uri.host in format correctly', () => {
      const filters = [
        'http.request.uri.host in {"api.github.com" "cdn.jsdelivr.net" "fonts.googleapis.com"}'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('api.github.com');
      expect(result).toContain('cdn.jsdelivr.net');
      expect(result).toContain('fonts.googleapis.com');
      expect(result).toHaveLength(3);
    });

    it('should handle mixed filter formats with real domains', () => {
      const filters = [
        'dns.fqdn in {"google.com" "github.com"}',
        'dns.fqdn == "stackoverflow.com"',
        'http.request.uri.host == "api.cloudflare.com"',
        'http.request.uri.host in {"cdn.cloudflare.com" "www.microsoft.com"}'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('google.com');
      expect(result).toContain('github.com');
      expect(result).toContain('stackoverflow.com');
      expect(result).toContain('api.cloudflare.com');
      expect(result).toContain('cdn.cloudflare.com');
      expect(result).toContain('www.microsoft.com');
      expect(result).toHaveLength(6);
    });

    it('should ignore invalid domain formats while keeping valid ones', () => {
      const filters = [
        'dns.fqdn in {"google.com" "invalid..domain" "github.com" "-.invalid"}',
        'dns.fqdn == "toolong' + 'a'.repeat(250) + '.com"' // Domain longer than 253 chars
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('google.com');
      expect(result).toContain('github.com');
      expect(result).not.toContain('invalid..domain');
      expect(result).not.toContain('-.invalid');
      expect(result).toHaveLength(2);
    });

    it('should handle empty filter array', () => {
      const result = parser.extractDomainsFromFilters([]);

      expect(result).toHaveLength(0);
    });

    it('should handle filters with no domain matches', () => {
      const filters = [
        'src.ip in {1.1.1.1 8.8.8.8}', // Real Cloudflare and Google DNS IPs
        'user.email == "test@example.com"',
        'http.request.method == "POST"'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toHaveLength(0);
    });

    it('should deduplicate real domains found in multiple filters', () => {
      const filters = [
        'dns.fqdn in {"google.com" "github.com"}',
        'dns.fqdn == "google.com"',
        'http.request.uri.host == "github.com"'
      ];

      const result = parser.extractDomainsFromFilters(filters);

      expect(result).toContain('google.com');
      expect(result).toContain('github.com');
      expect(result).toHaveLength(2); // Should not have duplicates
    });
  });

  describe('domain format validation with real examples', () => {
    it('should validate real domain formats', () => {
      const realValidDomains = [
        'google.com',
        'www.github.com',
        'api.stackoverflow.com',
        'cdn.jsdelivr.net',
        'fonts.googleapis.com',
        'a.co', // Short but valid
        'very-long-subdomain-name.example-domain.co.uk', // Complex but valid
        'test-123.example.org'
      ];

      realValidDomains.forEach(domain => {
        const result = parser.extractDomainsFromFilters([`dns.fqdn == "${domain}"`]);
        expect(result).toContain(domain);
      });
    });

    it('should reject actual invalid domain formats', () => {
      const realInvalidDomains = [
        'invalid..domain.com',     // Double dots
        '.starts-with-dot.com',    // Starts with dot
        'ends-with-dot.com.',      // Ends with dot
        '-starts-with-hyphen.com', // Starts with hyphen
        'ends-with-hyphen-.com',   // Ends with hyphen
        'has_underscore.com',      // Underscore not allowed
        'has space.com',           // Space not allowed
        'has@symbol.com',          // @ symbol not allowed
        'toolong' + 'a'.repeat(250) + '.com' // Too long
      ];

      realInvalidDomains.forEach(domain => {
        const result = parser.extractDomainsFromFilters([`dns.fqdn == "${domain}"`]);
        expect(result).not.toContain(domain);
        expect(result).toHaveLength(0); // Should extract nothing for invalid domains
      });
    });

    it('should handle realistic firewall rule scenarios', () => {
      // Real-world firewall rule examples
      const realisticFilters = [
        // Allow major platforms
        'dns.fqdn in {"google.com" "youtube.com" "gmail.com"}',
        // Block social media during work hours  
        'dns.fqdn in {"facebook.com" "twitter.com" "instagram.com"}',
        // Allow development resources
        'http.request.uri.host in {"github.com" "stackoverflow.com" "developer.mozilla.org"}',
        // Block known malware domains (using example domains that should be safe)
        'dns.fqdn == "example-malware-test.com"',
        // Allow CDNs
        'http.request.uri.host in {"cdn.jsdelivr.net" "cdnjs.cloudflare.com" "unpkg.com"}'
      ];

      const result = parser.extractDomainsFromFilters(realisticFilters);

      // Should extract all valid domains
      const expectedDomains = [
        'google.com', 'youtube.com', 'gmail.com',
        'facebook.com', 'twitter.com', 'instagram.com',
        'github.com', 'stackoverflow.com', 'developer.mozilla.org',
        'example-malware-test.com',
        'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'
      ];

      expectedDomains.forEach(domain => {
        expect(result).toContain(domain);
      });

      expect(result).toHaveLength(expectedDomains.length);
    });
  });

  describe('error handling with real scenarios', () => {
    it('should handle malformed filter strings gracefully', () => {
      const malformedFilters = [
        'dns.fqdn in {"google.com"', // Missing closing brace
        'dns.fqdn == google.com',    // Missing quotes  
        'dns.fqdn in {}',            // Empty braces
        'malformed filter string'    // Completely invalid
      ];

      const result = parser.extractDomainsFromFilters(malformedFilters);

      // Should not crash and should return empty result for malformed input
      expect(result).toHaveLength(0);
    });

    it('should handle mixed valid and malformed filters', () => {
      const mixedFilters = [
        'dns.fqdn == "google.com"',           // Valid
        'dns.fqdn in {"github.com"',          // Invalid - missing brace
        'http.request.uri.host == "valid.com"', // Valid
        'completely invalid filter',           // Invalid
        'dns.fqdn in {"stackoverflow.com"}'   // Valid
      ];

      const result = parser.extractDomainsFromFilters(mixedFilters);

      // Should extract only the valid domains
      expect(result).toContain('google.com');
      expect(result).toContain('valid.com');
      expect(result).toContain('stackoverflow.com');
      expect(result).toHaveLength(3);
    });
  });
});
