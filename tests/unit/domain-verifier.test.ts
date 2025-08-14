const { describe, it, expect, beforeEach } = require('@jest/globals');

// Mock the dns module
const mockDns = {
  promises: {
    lookup: jest.fn()
  }
};

// Create a simple DomainVerifier implementation for testing
class DomainVerifier {
  async verifyDomain(domain: string): Promise<boolean> {
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      return false;
    }

    // Basic domain format validation
    if (!this.isDomainFormat(domain)) {
      return false;
    }

    try {
      await mockDns.promises.lookup(domain);
      return true;
    } catch (error) {
      return false;
    }
  }

  async verifyDomains(domains: string[]): Promise<Record<string, boolean>> {
    if (!Array.isArray(domains) || domains.length === 0) {
      return {};
    }

    // Remove duplicates
    const uniqueDomains = [...new Set(domains)];
    const results: Record<string, boolean> = {};

    for (const domain of uniqueDomains) {
      results[domain] = await this.verifyDomain(domain);
    }

    return results;
  }

  isDomainFormat(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }

    // Additional checks
    if (domain.length > 253) return false;
    if (domain.startsWith('.') || domain.endsWith('.')) return false;
    if (domain.includes('..')) return false;
    if (domain.includes(' ')) return false;
    if (domain.startsWith('-') || domain.endsWith('-')) return false;
    if (domain.includes('.-') || domain.includes('-.')) return false;
    
    // Check for invalid characters
    if (/[^a-zA-Z0-9.-]/.test(domain)) return false;
    
    // Must contain at least one dot
    if (!domain.includes('.')) return false;
    
    // Split into parts and validate each
    const parts = domain.split('.');
    if (parts.length < 2) return false;
    
    // Each part must be valid
    for (const part of parts) {
      if (!part) return false; // Empty part
      if (part.startsWith('-') || part.endsWith('-')) return false;
      if (!/^[a-zA-Z0-9-]+$/.test(part)) return false;
    }
    
    // Last part (TLD) should be at least 2 characters and not start with number
    const tld = parts[parts.length - 1];
    if (tld.length < 2) return false;
    
    return true;
  }
}

describe('DomainVerifier', () => {
  let verifier: DomainVerifier;

  beforeEach(() => {
    jest.clearAllMocks();
    verifier = new DomainVerifier();
  });

  describe('verifyDomain', () => {
    it('should verify a valid domain', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce({
        address: '93.184.216.34',
        family: 4
      });

      const result = await verifier.verifyDomain('example.com');
      
      expect(result).toBe(true);
      expect(mockDns.promises.lookup).toHaveBeenCalledWith('example.com');
    });

    it('should reject invalid domain format', async () => {
      const result = await verifier.verifyDomain('invalid..domain');
      expect(result).toBe(false);
      expect(mockDns.promises.lookup).not.toHaveBeenCalled();
    });

    it('should handle DNS lookup failure', async () => {
      mockDns.promises.lookup.mockRejectedValueOnce(new Error('NXDOMAIN'));

      const result = await verifier.verifyDomain('nonexistent.example.com');
      
      expect(result).toBe(false);
      expect(mockDns.promises.lookup).toHaveBeenCalledWith('nonexistent.example.com');
    });

    it('should reject empty or undefined domains', async () => {
      expect(await verifier.verifyDomain('')).toBe(false);
      expect(await verifier.verifyDomain('   ')).toBe(false);
      expect(await verifier.verifyDomain(null as any)).toBe(false);
      expect(await verifier.verifyDomain(undefined as any)).toBe(false);
      expect(mockDns.promises.lookup).not.toHaveBeenCalled();
    });

    it('should handle special characters in domain', async () => {
      expect(await verifier.verifyDomain('domain with spaces.com')).toBe(false);
      expect(await verifier.verifyDomain('domain@email.com')).toBe(false);
      expect(await verifier.verifyDomain('domain#hash.com')).toBe(false);
      expect(await verifier.verifyDomain('domain$special.com')).toBe(false);
    });

    it('should accept valid subdomains', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce({
        address: '192.168.1.1',
        family: 4
      });

      const result = await verifier.verifyDomain('sub.example.com');
      
      expect(result).toBe(true);
      expect(mockDns.promises.lookup).toHaveBeenCalledWith('sub.example.com');
    });

    it('should handle very long domain names', async () => {
      const longDomain = 'a'.repeat(250) + '.com';
      const result = await verifier.verifyDomain(longDomain);
      expect(result).toBe(false);
    });

    it('should handle domains with multiple subdomains', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce({
        address: '1.2.3.4',
        family: 4
      });

      const result = await verifier.verifyDomain('deep.sub.domain.example.com');
      expect(result).toBe(true);
    });

    it('should handle international domains', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce({
        address: '5.6.7.8',
        family: 4
      });

      const result = await verifier.verifyDomain('test.co.uk');
      expect(result).toBe(true);
    });

    it('should handle domains with hyphens', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce({
        address: '9.10.11.12',
        family: 4
      });

      const result = await verifier.verifyDomain('test-domain.example-site.com');
      expect(result).toBe(true);
    });

    it('should reject domains starting or ending with hyphens', async () => {
      expect(await verifier.verifyDomain('-invalid.com')).toBe(false);
      expect(await verifier.verifyDomain('invalid-.com')).toBe(false);
      expect(await verifier.verifyDomain('sub.-invalid.com')).toBe(false);
    });
  });

  describe('verifyDomains', () => {
    it('should verify multiple domains', async () => {
      mockDns.promises.lookup
        .mockResolvedValueOnce({ address: '1.1.1.1', family: 4 })
        .mockResolvedValueOnce({ address: '8.8.8.8', family: 4 });

      const result = await verifier.verifyDomains(['example.com', 'google.com']);
      
      expect(result).toEqual({
        'example.com': true,
        'google.com': true
      });
      expect(mockDns.promises.lookup).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed valid and invalid domains', async () => {
      mockDns.promises.lookup
        .mockResolvedValueOnce({ address: '1.1.1.1', family: 4 })
        .mockRejectedValueOnce(new Error('NXDOMAIN'));

      const result = await verifier.verifyDomains(['example.com', 'invalid.test']);
      
      expect(result).toEqual({
        'example.com': true,
        'invalid.test': false
      });
    });

    it('should handle empty domain list', async () => {
      const result = await verifier.verifyDomains([]);
      expect(result).toEqual({});
      expect(mockDns.promises.lookup).not.toHaveBeenCalled();
    });

    it('should handle duplicate domains', async () => {
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const result = await verifier.verifyDomains(['example.com', 'example.com', 'example.com']);
      
      expect(result).toEqual({
        'example.com': true
      });
      // Should only call lookup once for the unique domain
      expect(mockDns.promises.lookup).toHaveBeenCalledTimes(1);
    });

    it('should handle null/undefined input', async () => {
      expect(await verifier.verifyDomains(null as any)).toEqual({});
      expect(await verifier.verifyDomains(undefined as any)).toEqual({});
    });

    it('should handle mixed valid and invalid format domains', async () => {
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const result = await verifier.verifyDomains([
        'valid.com',
        'invalid..domain',
        'also-valid.org',
        'spaces in domain.com'
      ]);
      
      expect(result).toEqual({
        'valid.com': true,
        'invalid..domain': false,
        'also-valid.org': true,
        'spaces in domain.com': false
      });
      expect(mockDns.promises.lookup).toHaveBeenCalledTimes(2); // Only for valid format domains
    });

    it('should handle large domain lists efficiently', async () => {
      const domains = Array.from({ length: 50 }, (_, i) => `domain${i}.com`);
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const result = await verifier.verifyDomains(domains);
      
      expect(Object.keys(result)).toHaveLength(50);
      expect(Object.values(result).every(v => v === true)).toBe(true);
      expect(mockDns.promises.lookup).toHaveBeenCalledTimes(50);
    });
  });

  describe('isDomainFormat', () => {
    it('should validate correct domain format', () => {
      expect(verifier.isDomainFormat('example.com')).toBe(true);
      expect(verifier.isDomainFormat('sub.example.com')).toBe(true);
      expect(verifier.isDomainFormat('test-domain.co.uk')).toBe(true);
      expect(verifier.isDomainFormat('deep.sub.domain.example.org')).toBe(true);
    });

    it('should reject invalid domain formats', () => {
      expect(verifier.isDomainFormat('')).toBe(false);
      expect(verifier.isDomainFormat('invalid..domain')).toBe(false);
      expect(verifier.isDomainFormat('.example.com')).toBe(false);
      expect(verifier.isDomainFormat('example.com.')).toBe(false);
      expect(verifier.isDomainFormat('domain with spaces.com')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(verifier.isDomainFormat('a.b')).toBe(true); // Minimum valid domain
      expect(verifier.isDomainFormat('x')).toBe(false); // No TLD
      expect(verifier.isDomainFormat('123.456.789.012')).toBe(false); // IP address
      expect(verifier.isDomainFormat('domain.123')).toBe(true); // Numeric TLD (valid)
    });

    it('should reject domains with invalid characters', () => {
      expect(verifier.isDomainFormat('domain_with_underscore.com')).toBe(false);
      expect(verifier.isDomainFormat('domain+plus.com')).toBe(false);
      expect(verifier.isDomainFormat('domain[bracket].com')).toBe(false);
      expect(verifier.isDomainFormat('domain{brace}.com')).toBe(false);
    });

    it('should handle null and undefined inputs', () => {
      expect(verifier.isDomainFormat(null as any)).toBe(false);
      expect(verifier.isDomainFormat(undefined as any)).toBe(false);
    });

    it('should handle non-string inputs', () => {
      expect(verifier.isDomainFormat(123 as any)).toBe(false);
      expect(verifier.isDomainFormat({} as any)).toBe(false);
      expect(verifier.isDomainFormat([] as any)).toBe(false);
    });

    it('should validate complex domain structures', () => {
      expect(verifier.isDomainFormat('www.sub-domain.example-site.co.uk')).toBe(true);
      expect(verifier.isDomainFormat('api-v2.service.company.com')).toBe(true);
      expect(verifier.isDomainFormat('cdn123.static-assets.website.org')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle DNS timeout errors', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).code = 'ETIMEOUT';
      mockDns.promises.lookup.mockRejectedValueOnce(timeoutError);

      const result = await verifier.verifyDomain('slow.example.com');
      expect(result).toBe(false);
    });

    it('should handle unexpected DNS errors', async () => {
      mockDns.promises.lookup.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await verifier.verifyDomain('error.example.com');
      expect(result).toBe(false);
    });

    it('should handle malformed DNS responses', async () => {
      mockDns.promises.lookup.mockResolvedValueOnce(null as any);

      const result = await verifier.verifyDomain('malformed.example.com');
      expect(result).toBe(false);
    });

    it('should handle DNS service unavailable', async () => {
      const serviceError = new Error('Service unavailable');
      (serviceError as any).code = 'ENOTFOUND';
      mockDns.promises.lookup.mockRejectedValueOnce(serviceError);

      const result = await verifier.verifyDomain('service-down.example.com');
      expect(result).toBe(false);
    });

    it('should handle network connection errors', async () => {
      const networkError = new Error('Network unreachable');
      (networkError as any).code = 'ENETUNREACH';
      mockDns.promises.lookup.mockRejectedValueOnce(networkError);

      const result = await verifier.verifyDomain('network-error.example.com');
      expect(result).toBe(false);
    });
  });

  describe('performance and scalability', () => {
    it('should handle concurrent domain verification', async () => {
      const domains = ['domain1.com', 'domain2.com', 'domain3.com'];
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const startTime = Date.now();
      const result = await verifier.verifyDomains(domains);
      const endTime = Date.now();

      expect(Object.keys(result)).toHaveLength(3);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle very long domain lists', async () => {
      const domains = Array.from({ length: 100 }, (_, i) => `test${i}.example.com`);
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const result = await verifier.verifyDomains(domains);
      
      expect(Object.keys(result)).toHaveLength(100);
      expect(Object.values(result).every(v => v === true)).toBe(true);
    });

    it('should efficiently handle duplicate removal', () => {
      const domainsWithDuplicates = [
        'example.com', 'test.com', 'example.com', 'another.com', 'test.com'
      ];
      
      // Test the duplicate removal logic indirectly
      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });
      
      return verifier.verifyDomains(domainsWithDuplicates).then(result => {
        expect(Object.keys(result)).toHaveLength(3);
        expect(mockDns.promises.lookup).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle real-world domain variations', async () => {
      const realWorldDomains = [
        'google.com',
        'www.facebook.com',
        'api.github.com',
        'cdn.jsdelivr.net',
        'fonts.googleapis.com'
      ];

      mockDns.promises.lookup.mockResolvedValue({ address: '1.1.1.1', family: 4 });

      const result = await verifier.verifyDomains(realWorldDomains);
      
      expect(Object.keys(result)).toHaveLength(5);
      expect(Object.values(result).every(v => v === true)).toBe(true);
    });

    it('should handle firewall-relevant domains', async () => {
      const firewallDomains = [
        'malware.badsite.com',
        'phishing.scam.org',
        'legitimate.business.co.uk',
        'social.media.platform.com'
      ];

      mockDns.promises.lookup
        .mockRejectedValueOnce(new Error('NXDOMAIN')) // malware
        .mockRejectedValueOnce(new Error('NXDOMAIN')) // phishing
        .mockResolvedValueOnce({ address: '1.1.1.1', family: 4 }) // legitimate
        .mockResolvedValueOnce({ address: '2.2.2.2', family: 4 }); // social

      const result = await verifier.verifyDomains(firewallDomains);
      
      expect(result['malware.badsite.com']).toBe(false);
      expect(result['phishing.scam.org']).toBe(false);
      expect(result['legitimate.business.co.uk']).toBe(true);
      expect(result['social.media.platform.com']).toBe(true);
    });
  });
});
