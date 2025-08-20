/**
 * DNS Verification Module
 * 
 * Verifies domain resolution and checks for DNS hijacking/spoofing
 * by comparing results from multiple DNS sources including Cloudflare's
 * authoritative servers.
 */

import dns from 'dns';
import { promisify } from 'util';
import axios from 'axios';
import chalk from 'chalk';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);
const resolveCname = promisify(dns.resolveCname);
const resolveTxt = promisify(dns.resolveTxt);
const resolveMx = promisify(dns.resolveMx);

export interface DNSVerificationResult {
  domain: string;
  resolves: boolean;
  isValid: boolean;
  addresses: {
    ipv4: string[];
    ipv6: string[];
  };
  cloudflareResults?: {
    ipv4: string[];
    ipv6: string[];
  };
  localResults?: {
    ipv4: string[];
    ipv6: string[];
  };
  discrepancies: string[];
  warnings: string[];
  cname?: string[];
  txtRecords?: string[][];
  mxRecords?: { priority: number; exchange: string }[];
  responseTime: number;
  dnssecValid?: boolean;
  authoritative?: {
    nameservers: string[];
    soa?: {
      nsname: string;
      hostmaster: string;
      serial: number;
    };
  };
}

export class DNSVerifier {
  private cloudflareDoH = 'https://cloudflare-dns.com/dns-query';
  private googleDoH = 'https://dns.google/resolve';
  
  /**
   * Comprehensive DNS verification for a domain
   */
  async verifyDomain(domain: string): Promise<DNSVerificationResult> {
    const startTime = Date.now();
    const result: DNSVerificationResult = {
      domain,
      resolves: false,
      isValid: false,
      addresses: { ipv4: [], ipv6: [] },
      discrepancies: [],
      warnings: [],
      responseTime: 0
    };

    try {
      console.log(chalk.cyan(`🔍 Verifying DNS resolution for ${domain}...`));
      
      // 1. Get local DNS results (system resolver) - this is the primary check
      const localResults = await this.getLocalDNS(domain);
      result.localResults = localResults;
      
      // 2. Try to get Cloudflare DNS results for comparison (optional enhancement)
      const cloudflareResults = await this.getCloudflareDNS(domain).catch(() => ({ ipv4: [], ipv6: [] }));
      result.cloudflareResults = cloudflareResults;
      
      // 3. Compare results for discrepancies
      const comparison = this.compareDNSResults(localResults, cloudflareResults);
      result.discrepancies = comparison.discrepancies;
      result.warnings = comparison.warnings;
      
      // 4. Check DNSSEC if available
      result.dnssecValid = await this.checkDNSSEC(domain);
      
      // 5. Get additional DNS records
      await this.getAdditionalRecords(domain, result);
      
      // 6. Determine final resolution status
      // Use local results as primary, Cloudflare as verification if available
      if (localResults.ipv4.length > 0 || localResults.ipv6.length > 0) {
        result.resolves = true;
        result.addresses = localResults; // Use local results as primary
        
        // If we have Cloudflare results, check for discrepancies
        if (cloudflareResults.ipv4.length > 0 || cloudflareResults.ipv6.length > 0) {
          if (comparison.discrepancies.length === 0) {
            result.isValid = true;
            console.log(chalk.green(`✅ DNS verified: ${domain} resolves correctly`));
          } else {
            result.isValid = false;
            console.log(chalk.yellow(`⚠️  DNS discrepancy detected for ${domain}`));
            comparison.discrepancies.forEach(d => 
              console.log(chalk.yellow(`   - ${d}`))
            );
          }
        } else {
          // No Cloudflare results but local resolved - still valid
          result.isValid = true;
          console.log(chalk.green(`✅ DNS resolved: ${domain} -> ${localResults.ipv4.join(', ')}`))
        }
      } else if (cloudflareResults.ipv4.length > 0 || cloudflareResults.ipv6.length > 0) {
        // Only Cloudflare resolved - potential local DNS issue
        result.resolves = true;
        result.addresses = cloudflareResults;
        result.isValid = true;
        result.warnings.push('Local DNS did not resolve but Cloudflare DNS did');
        console.log(chalk.yellow(`⚠️  DNS resolved via Cloudflare only: ${domain}`));
      } else {
        console.log(chalk.red(`❌ Domain ${domain} does not resolve`));
      }
      
      result.responseTime = Date.now() - startTime;
      return result;
      
    } catch (error) {
      console.log(chalk.red(`❌ DNS verification failed for ${domain}: ${error}`));
      result.warnings.push(`DNS verification error: ${error}`);
      result.responseTime = Date.now() - startTime;
      return result;
    }
  }
  
  /**
   * Get DNS results from local system resolver
   */
  private async getLocalDNS(domain: string): Promise<{ ipv4: string[]; ipv6: string[] }> {
    const results = { ipv4: [] as string[], ipv6: [] as string[] };
    
    try {
      results.ipv4 = await resolve4(domain).catch(() => []);
    } catch (error) {
      // No IPv4 addresses
    }
    
    try {
      results.ipv6 = await resolve6(domain).catch(() => []);
    } catch (error) {
      // No IPv6 addresses
    }
    
    return results;
  }
  
  /**
   * Get DNS results from Cloudflare's DNS over HTTPS
   */
  private async getCloudflareDNS(domain: string): Promise<{ ipv4: string[]; ipv6: string[] }> {
    const results = { ipv4: [] as string[], ipv6: [] as string[] };
    
    try {
      // Query for A records (IPv4)
      const ipv4Response = await axios.get(this.cloudflareDoH, {
        params: {
          name: domain,
          type: 'A'
        },
        headers: {
          'Accept': 'application/dns-json'
        },
        timeout: 5000
      });
      
      if (ipv4Response.data?.Answer) {
        results.ipv4 = ipv4Response.data.Answer
          .filter((a: any) => a.type === 1) // Type 1 = A record
          .map((a: any) => a.data)
          .filter((ip: string) => ip && ip !== '0.0.0.0'); // Filter out invalid IPs
      }
      
      // Query for AAAA records (IPv6)
      const ipv6Response = await axios.get(this.cloudflareDoH, {
        params: {
          name: domain,
          type: 'AAAA'
        },
        headers: {
          'Accept': 'application/dns-json'
        },
        timeout: 5000
      });
      
      if (ipv6Response.data?.Answer) {
        results.ipv6 = ipv6Response.data.Answer
          .filter((a: any) => a.type === 28) // Type 28 = AAAA record
          .map((a: any) => a.data);
      }
      
    } catch (error) {
      // Silently fail - Cloudflare DoH is optional enhancement
      console.debug(chalk.gray(`Cloudflare DoH not available`));
    }
    
    return results;
  }
  
  /**
   * Compare DNS results from different sources
   */
  private compareDNSResults(
    local: { ipv4: string[]; ipv6: string[] },
    cloudflare: { ipv4: string[]; ipv6: string[] }
  ): { discrepancies: string[]; warnings: string[] } {
    const discrepancies: string[] = [];
    const warnings: string[] = [];
    
    // Compare IPv4 addresses
    const localIPv4Set = new Set(local.ipv4);
    const cloudflareIPv4Set = new Set(cloudflare.ipv4);
    
    // Check for IPs in local but not in Cloudflare
    local.ipv4.forEach(ip => {
      if (!cloudflareIPv4Set.has(ip)) {
        discrepancies.push(`IPv4 ${ip} found locally but not in Cloudflare DNS`);
      }
    });
    
    // Check for IPs in Cloudflare but not local
    cloudflare.ipv4.forEach(ip => {
      if (!localIPv4Set.has(ip)) {
        warnings.push(`IPv4 ${ip} in Cloudflare DNS but not in local resolver`);
      }
    });
    
    // Compare IPv6 addresses
    const localIPv6Set = new Set(local.ipv6);
    const cloudflareIPv6Set = new Set(cloudflare.ipv6);
    
    local.ipv6.forEach(ip => {
      if (!cloudflareIPv6Set.has(ip)) {
        discrepancies.push(`IPv6 ${ip} found locally but not in Cloudflare DNS`);
      }
    });
    
    cloudflare.ipv6.forEach(ip => {
      if (!localIPv6Set.has(ip)) {
        warnings.push(`IPv6 ${ip} in Cloudflare DNS but not in local resolver`);
      }
    });
    
    // Check for potential hijacking indicators
    if (local.ipv4.length > 0 && cloudflare.ipv4.length > 0) {
      const localFirst = local.ipv4[0];
      const cloudflareFirst = cloudflare.ipv4[0];
      
      // Check if IPs are in completely different ranges (potential hijacking)
      if (localFirst && cloudflareFirst) {
        const localOctets = localFirst.split('.').map(Number);
        const cloudflareOctets = cloudflareFirst.split('.').map(Number);
        
        if (localOctets[0] !== cloudflareOctets[0] || localOctets[1] !== cloudflareOctets[1]) {
          discrepancies.push('CRITICAL: IP addresses are in different network ranges - possible DNS hijacking');
        }
      }
    }
    
    return { discrepancies, warnings };
  }
  
  /**
   * Check DNSSEC validation
   */
  private async checkDNSSEC(domain: string): Promise<boolean> {
    try {
      const response = await axios.get(this.cloudflareDoH, {
        params: {
          name: domain,
          type: 'A',
          do: true, // Request DNSSEC data
          cd: false // Check DNSSEC validation
        },
        headers: {
          'Accept': 'application/dns-json'
        },
        timeout: 5000
      });
      
      // AD flag indicates DNSSEC validation passed
      return response.data?.AD === true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get additional DNS records for comprehensive analysis
   */
  private async getAdditionalRecords(domain: string, result: DNSVerificationResult): Promise<void> {
    try {
      // Get CNAME records
      try {
        result.cname = await resolveCname(domain);
      } catch (error) {
        // No CNAME records or domain is not a CNAME
      }
      
      // Get TXT records (for SPF, DMARC, etc.)
      try {
        result.txtRecords = await resolveTxt(domain);
      } catch (error) {
        // No TXT records
      }
      
      // Get MX records
      try {
        result.mxRecords = await resolveMx(domain);
      } catch (error) {
        // No MX records
      }
      
      // Get authoritative nameservers
      try {
        const nsResponse = await axios.get(this.cloudflareDoH, {
          params: {
            name: domain,
            type: 'NS'
          },
          headers: {
            'Accept': 'application/dns-json'
          },
          timeout: 5000
        });
        
        if (nsResponse.data?.Answer) {
          result.authoritative = {
            nameservers: nsResponse.data.Answer
              .filter((a: any) => a.type === 2) // Type 2 = NS record
              .map((a: any) => a.data)
          };
        }
      } catch (error) {
        // Could not get NS records
      }
      
    } catch (error) {
      console.debug(chalk.gray(`Failed to get additional DNS records: ${error}`));
    }
  }
  
  /**
   * Quick check if a domain resolves at all
   */
  async quickResolveCheck(domain: string): Promise<boolean> {
    try {
      const response = await axios.get(this.cloudflareDoH, {
        params: {
          name: domain,
          type: 'A'
        },
        headers: {
          'Accept': 'application/dns-json'
        },
        timeout: 3000
      });
      
      return response.data?.Answer && response.data.Answer.length > 0;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if an IP is in a private/reserved range
   */
  isPrivateIP(ip: string): boolean {
    const octets = ip.split('.').map(Number);
    
    // Check for private IP ranges
    // 10.0.0.0/8
    if (octets[0] === 10) return true;
    
    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) return true;
    
    // 127.0.0.0/8 (loopback)
    if (octets[0] === 127) return true;
    
    // 169.254.0.0/16 (link-local)
    if (octets[0] === 169 && octets[1] === 254) return true;
    
    return false;
  }
}

// Export singleton instance
export const dnsVerifier = new DNSVerifier();
