import axios, { AxiosInstance } from 'axios';
import { promisify } from 'util';
import { exec } from 'child_process';
import dns from 'dns';
import chalk from 'chalk';
import type { OSINTAnalysis } from './threat-intelligence-client.js';
import { enhancedRadarClient } from './enhanced-radar-client.js';

const execAsync = promisify(exec);
  // These are defined but not currently used
  const _dnsLookup = promisify(dns.lookup);
  const _dnsResolve = promisify(dns.resolve);
const dnsResolvePtr = promisify(dns.reverse);

export interface OSINTProviderConfig {
  // Free tier APIs that don't require keys
  enableFreeServices: boolean;
  
  // Premium services (require API keys)
  ipApiKey?: string;
  whoisXmlApiKey?: string;
  securityTrailsApiKey?: string;
  sslmateApiKey?: string;
  
  // Rate limiting
  maxConcurrent: number;
  rateLimitMs: number;
  
  // Timeouts
  requestTimeout: number;
  dnsTimeout: number;
}

export class OSINTProviders {
  private config: Required<OSINTProviderConfig>;
  private httpClient: AxiosInstance;
  private semaphore: { count: number; waiting: Array<() => void> };

  constructor(config: Partial<OSINTProviderConfig> = {}) {
    this.config = {
      enableFreeServices: true,
      ipApiKey: process.env.IP_API_KEY || "",
      whoisXmlApiKey: process.env.WHOIS_XML_API_KEY || "",
      securityTrailsApiKey: process.env.SECURITY_TRAILS_API_KEY || "",
      sslmateApiKey: process.env.SSLMATE_API_KEY || "",
      maxConcurrent: 3,
      rateLimitMs: 500,  // Reduced from 1000ms for faster scans
      requestTimeout: 5000,  // Reduced from 10000ms to fail faster
      dnsTimeout: 2000,  // Reduced from 5000ms for quicker DNS operations
      ...config
    };

    this.httpClient = axios.create({
      timeout: this.config.requestTimeout,
      headers: {
        'User-Agent': 'CloudflareFirewall-OSINTClient/1.0'
      }
    });

    this.semaphore = {
      count: this.config.maxConcurrent,
      waiting: []
    };

    // Set DNS timeouts
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  }

  /**
   * Acquire semaphore for rate limiting
   */
  private async acquireSemaphore(): Promise<void> {
    if (this.semaphore.count > 0) {
      this.semaphore.count--;
      return;
    }

    return new Promise(resolve => {
      this.semaphore.waiting.push(resolve);
    });
  }

  /**
   * Release semaphore
   */
  private releaseSemaphore(): void {
    if (this.semaphore.waiting.length > 0) {
      const next = this.semaphore.waiting.shift()!;
      next();
    } else {
      this.semaphore.count++;
    }
  }

  /**
   * Rate limited request wrapper
   */
  private async rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSemaphore();
    try {
      const result = await fn();
      await new Promise(resolve => setTimeout(resolve, this.config.rateLimitMs));
      return result;
    } finally {
      this.releaseSemaphore();
    }
  }

  /**
   * Get WHOIS data using RDAP protocol and fallbacks
   */
  async getWhoisData(domain: string): Promise<OSINTAnalysis['whoisData']> {
    try {
      console.log(chalk.gray(`  → Looking up WHOIS for ${domain}...`));

      // Try RDAP first (modern protocol)
      const rdapResult = await this.getRdapData(domain);
      if (rdapResult) return rdapResult;

      // Fallback to whois command
      const whoisResult = await this.getWhoisCommand(domain);
      if (whoisResult) return whoisResult;

      // Fallback to API services
      if (this.config.whoisXmlApiKey) {
        const result = await this.getWhoisXmlApi(domain);
        return result === null ? undefined : result;
      }

      return undefined;
    } catch (error) {
      console.warn(chalk.yellow(`WHOIS lookup failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return undefined;
    }
  }

  /**
   * RDAP (Registration Data Access Protocol) lookup
   */
  private async getRdapData(domain: string): Promise<OSINTAnalysis['whoisData'] | null> {
    try {
      const tld = domain.split('.').pop()?.toLowerCase();
      if (!tld) return undefined;

      // Common RDAP servers
      const rdapServers: Record<string, string> = {
        'com': 'https://rdap.verisign.com/com/v1/',
        'net': 'https://rdap.verisign.com/net/v1/',
        'org': 'https://rdap.pir.org/',
        'info': 'https://rdap.afilias.net/rdap/afilias/',
        'biz': 'https://rdap.afilias.net/rdap/afilias/',
        'au': 'https://rdap.audns.net.au/au/',
        'uk': 'https://rdap.nominet.uk/uk/',
        'fr': 'https://rdap.nic.fr/',
        'de': 'https://rdap.denic.de/',
      };

      const serverUrl = rdapServers[tld];
      if (!serverUrl) return undefined;

      const response = await this.rateLimitedRequest(() => 
        this.httpClient.get(`${serverUrl}domain/${domain}`)
      );

      if (response.data) {
        const data = response.data;
        
        return {
          registrar: data.entities?.find((e: { roles?: string[] }) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v: unknown[]) => v[0] === 'fn')?.[3],
          registrationDate: data.events?.find((e: { eventAction?: string }) => e.eventAction === 'registration')?.eventDate,
          expirationDate: data.events?.find((e: { eventAction?: string }) => e.eventAction === 'expiration')?.eventDate,
          nameServers: data.nameservers?.map((ns: { ldhName?: string }) => ns.ldhName),
          registrantCountry: data.entities?.find((e: { roles?: string[] }) => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find((v: unknown[]) => v[0] === 'adr')?.[3]?.[6],
          registrantOrganization: data.entities?.find((e: { roles?: string[] }) => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find((v: unknown[]) => v[0] === 'org')?.[3],
          privacyProtection: data.entities?.some((e: { vcardArray?: unknown[][] }) => e.vcardArray?.[1]?.some((v: any) => v[3]?.toString().toLowerCase().includes('privacy')))
        };
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Fallback to system whois command
   */
  private async getWhoisCommand(domain: string): Promise<OSINTAnalysis['whoisData'] | null> {
    try {
      const { stdout } = await execAsync(`whois ${domain}`, { 
        timeout: this.config.dnsTimeout  // Already in milliseconds, no need to multiply
      });

      const registrarMatch = stdout.match(/Registrar:\s*(.+)/i);
      const createdMatch = stdout.match(/Creation Date:\s*(.+)/i) || stdout.match(/Created:\s*(.+)/i);
      const expiresMatch = stdout.match(/Registry Expiry Date:\s*(.+)/i) || stdout.match(/Expiry Date:\s*(.+)/i);
      const nameServersMatch = stdout.match(/Name Server:\s*(.+)/gi);
      const orgMatch = stdout.match(/Registrant Organization:\s*(.+)/i);
      const countryMatch = stdout.match(/Registrant Country:\s*(.+)/i);

      return {
        registrar: registrarMatch?.[1]?.trim(),
        registrationDate: createdMatch?.[1]?.trim(),
        expirationDate: expiresMatch?.[1]?.trim(),
        nameServers: nameServersMatch?.map(ns => ns.replace(/Name Server:\s*/i, '').trim()),
        registrantCountry: countryMatch?.[1]?.trim(),
        registrantOrganization: orgMatch?.[1]?.trim(),
        privacyProtection: stdout.toLowerCase().includes('privacy') || stdout.toLowerCase().includes('redacted')
      };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * WhoisXML API (premium service)
   */
  private async getWhoisXmlApi(domain: string): Promise<OSINTAnalysis['whoisData'] | null> {
    if (!this.config.whoisXmlApiKey) return undefined;

    try {
      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://www.whoisxmlapi.com/whoisserver/WhoisService`, {
          params: {
            apiKey: this.config.whoisXmlApiKey,
            domainName: domain,
            outputFormat: 'JSON'
          }
        })
      );

      const whoisRecord = response.data.WhoisRecord;
      if (!whoisRecord) return undefined;

      return {
        registrar: whoisRecord.registrarName,
        registrationDate: whoisRecord.createdDate,
        expirationDate: whoisRecord.expiresDate,
        nameServers: whoisRecord.nameServers?.hostNames,
        registrantCountry: whoisRecord.registrant?.country,
        registrantOrganization: whoisRecord.registrant?.organization,
        privacyProtection: whoisRecord.registrant?.name?.toLowerCase().includes('privacy')
      };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get comprehensive DNS records
   */
  async getDnsRecords(domain: string): Promise<OSINTAnalysis['dnsRecords']> {
    try {
      console.log(chalk.gray(`  → Looking up DNS records for ${domain}...`));

      const [aRecords, aaaaRecords, mxRecords, txtRecords, cnameRecords, nsRecords] = await Promise.allSettled([
        this.resolveDns(domain, 'A'),
        this.resolveDns(domain, 'AAAA'),
        this.resolveDns(domain, 'MX'),
        this.resolveDns(domain, 'TXT'),
        this.resolveDns(domain, 'CNAME'),
        this.resolveDns(domain, 'NS')
      ]);

      return {
        A: aRecords.status === 'fulfilled' ? aRecords.value : undefined,
        AAAA: aaaaRecords.status === 'fulfilled' ? aaaaRecords.value : undefined,
        MX: mxRecords.status === 'fulfilled' ? mxRecords.value : undefined,
        TXT: txtRecords.status === 'fulfilled' ? txtRecords.value : undefined,
        CNAME: cnameRecords.status === 'fulfilled' ? cnameRecords.value : undefined,
        NS: nsRecords.status === 'fulfilled' ? nsRecords.value : undefined
      };
    } catch (error) {
      console.warn(chalk.yellow(`DNS lookup failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return {};
    }
  }

  /**
   * Resolve specific DNS record types
   */
  private async resolveDns(domain: string, type: string): Promise<string[]> {
    try {
      const resolver = new dns.promises.Resolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']);

      switch (type) {
        case 'A': {
          return await resolver.resolve4(domain);
        }
        case 'AAAA': {
          return await resolver.resolve6(domain);
        }
        case 'MX': {
          const mx = await resolver.resolveMx(domain);
          return mx.map(record => `${record.priority} ${record.exchange}`);
        }
        case 'TXT': {
          const txt = await resolver.resolveTxt(domain);
          return txt.map(record => record.join(''));
        }
        case 'CNAME': {
          return await resolver.resolveCname(domain);
        }
        case 'NS': {
          return await resolver.resolveNs(domain);
        }
        default:
          return [];
      }
    } catch (error) {
      return [];
    }
  }

  /**
   * Get IP geolocation using free services
   */
  async getIpGeolocation(ip: string): Promise<OSINTAnalysis['geolocation']> {
    try {
      console.log(chalk.gray(`  → Looking up geolocation for ${ip}...`));

      // Try ip-api.com first (free, no key required)
      const ipApiResult = await this.getIpApiGeolocation(ip);
      if (ipApiResult) return ipApiResult;

      // Fallback to ipapi.co
      const ipapiResult = await this.getIpapiGeolocation(ip);
      if (ipapiResult) return ipapiResult;

      return undefined;
    } catch (error) {
      console.warn(chalk.yellow(`Geolocation lookup failed for ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return undefined;
    }
  }

  /**
   * ip-api.com geolocation (free tier)
   */
  private async getIpApiGeolocation(ip: string): Promise<OSINTAnalysis['geolocation'] | null> {
    try {
      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,as,lat,lon`)
      );

      if (response.data.status === 'success') {
        return {
          country: response.data.country,
          region: response.data.regionName,
          city: response.data.city,
          isp: response.data.isp,
          asn: parseInt(response.data.as?.split(' ')[0]?.replace('AS', '') || '0'),
          asnOrganization: response.data.as?.split(' ').slice(1).join(' '),
          latitude: response.data.lat,
          longitude: response.data.lon
        };
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * ipapi.co geolocation (free tier)
   */
  private async getIpapiGeolocation(ip: string): Promise<OSINTAnalysis['geolocation'] | null> {
    try {
      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://ipapi.co/${ip}/json/`)
      );

      if (response.data && !response.data.error) {
        return {
          country: response.data.country_name,
          region: response.data.region,
          city: response.data.city,
          isp: response.data.org,
          asn: response.data.asn ? parseInt(response.data.asn.replace('AS', '')) : undefined,
          asnOrganization: response.data.org,
          latitude: response.data.latitude,
          longitude: response.data.longitude
        };
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Get certificates from Certificate Transparency logs
   */
  async getCertificateTransparency(domain: string): Promise<OSINTAnalysis['certificates']> {
    try {
      console.log(chalk.gray(`  → Looking up certificates for ${domain} in CT logs...`));

      // Try SSLMate Cert Spotter first (more reliable)
      const sslMateResult = await this.getCertificatesFromSSLMate(domain);
      if (sslMateResult) return sslMateResult;

      // Fallback to crt.sh if SSLMate fails
      // First, do a quick health check on crt.sh
      try {
        await this.httpClient.head('https://crt.sh', { timeout: 1000 });
      } catch (error) {
        console.debug(chalk.gray(`  CT logs services unavailable, skipping...`));
        return undefined;
      }

      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
          timeout: 3000  // Reduced from 15000ms to fail faster
        })
      );

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Get the most recent certificate
        const mostRecent = response.data.sort((a: { not_after?: string; entry_timestamp?: string }, b: { not_after?: string; entry_timestamp?: string }) => 
          new Date(b.not_after || b.entry_timestamp || "").getTime() - new Date(a.not_after || a.entry_timestamp || "").getTime()
        )[0];

        return {
          issuer: mostRecent.issuer_name,
          validFrom: mostRecent.not_before,
          validTo: mostRecent.not_after,
          subjectAlternativeNames: mostRecent.name_value ? mostRecent.name_value.split('\\n') : [],
          fingerprint: mostRecent.serial_number
        };
      }

      return undefined;
    } catch (error) {
      // Silently fail for CT logs - they're supplementary data
      console.debug(chalk.gray(`  CT logs lookup skipped for ${domain} (service unavailable)`));
      return undefined;
    }
  }

  /**
   * Reverse DNS lookup for IP
   */
  async getReverseDns(ip: string): Promise<string[]> {
    try {
      console.log(chalk.gray(`  → Reverse DNS lookup for ${ip}...`));
      
      const hostnames = await dnsResolvePtr(ip);
      return hostnames;
    } catch (error) {
      return [];
    }
  }

  /**
   * Subdomain enumeration using Certificate Transparency
   */
  async getSubdomains(domain: string): Promise<string[]> {
    try {
      console.log(chalk.gray(`  → Enumerating subdomains for ${domain}...`));

      // First, do a quick health check on crt.sh
      try {
        await this.httpClient.head('https://crt.sh', { timeout: 1000 });
      } catch (error) {
        console.debug(chalk.gray(`  Subdomain enumeration service unavailable, skipping...`));
        return [];
      }

      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`, {
          timeout: 3000  // Reduced from 20000ms to fail faster
        })
      );

      if (response.data && Array.isArray(response.data)) {
        const subdomains = new Set<string>();

        for (const cert of response.data) {
          if (cert.name_value) {
            const names = cert.name_value.split('\\n');
            for (const name of names) {
              const cleanName = name.trim().toLowerCase();
              if (cleanName.endsWith(`.${domain}`) && !cleanName.startsWith('*')) {
                subdomains.add(cleanName);
              }
            }
          }
        }

        return Array.from(subdomains).sort();
      }

      return [];
    } catch (error) {
      // Silently fail for subdomain enumeration - it's supplementary data
      console.debug(chalk.gray(`  Subdomain enumeration skipped for ${domain} (service unavailable)`));
      return [];
    }
  }

  /**
   * Business information lookup (basic free version)
   */
  async getBusinessInfo(domain: string): Promise<OSINTAnalysis['businessInfo']> {
    try {
      // For now, we'll use a simple approach based on domain patterns and public data
      // In a production environment, you might integrate with Clearbit, HunterIO, etc.
      
      const wellKnownCompanies: Record<string, { companyName: string; industry: string; founded: string }> = {
        'apple.com': { companyName: 'Apple Inc.', industry: 'Technology', founded: '1976' },
        'google.com': { companyName: 'Google LLC', industry: 'Technology', founded: '1998' },
        'microsoft.com': { companyName: 'Microsoft Corporation', industry: 'Technology', founded: '1975' },
        'amazon.com': { companyName: 'Amazon.com, Inc.', industry: 'E-commerce', founded: '1994' },
        'facebook.com': { companyName: 'Meta Platforms, Inc.', industry: 'Social Media', founded: '2004' },
        'netflix.com': { companyName: 'Netflix, Inc.', industry: 'Entertainment', founded: '1997' }
      };

      // Check for well-known domains
      const baseDomain = domain.split('.').slice(-2).join('.');
      const knownInfo = wellKnownCompanies[baseDomain];
      
      if (knownInfo) {
        return {
          ...knownInfo,
          website: baseDomain
        };
      }

      // For unknown domains, try to extract basic info from WHOIS
      const whoisData = await this.getWhoisData(domain);
      if (whoisData?.registrantOrganization) {
        return {
          companyName: whoisData.registrantOrganization,
          website: domain
        };
      }

      return undefined;
    } catch (error) {
      console.warn(chalk.yellow(`Business info lookup failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return undefined;
    }
  }

  /**
   * Get certificates from SSLMate Cert Spotter API (CT Search API v1)
   * Documentation: https://sslmate.com/help/reference/ct_search_api_v1
   */
  private async getCertificatesFromSSLMate(domain: string): Promise<OSINTAnalysis['certificates'] | null> {
    try {
      // SSLMate requires API key for authentication
      if (!this.config.sslmateApiKey) {
        console.debug(chalk.gray(`  SSLMate API key not configured, skipping...`));
        return null;
      }

      // Build the API URL with proper parameters
      const url = `https://api.certspotter.com/v1/issuances`;
      const params = new URLSearchParams();
      params.append('domain', domain);
      params.append('include_subdomains', 'false');
      params.append('match_wildcards', 'true');
      params.append('expand', 'dns_names');
      params.append('expand', 'issuer');

      const response = await this.httpClient.get(
        `${url}?${params.toString()}`,
        { 
          timeout: 5000,
          headers: {
            'User-Agent': 'CloudflareFirewall-OSINTClient/1.0',
            'Authorization': `Bearer ${this.config.sslmateApiKey}`  // SSLMate uses Bearer token auth
          }
        }
      );

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Sort by not_after date to get the most recent valid certificate
        const sorted = response.data.sort((a: any, b: any) => {
          const dateA = new Date(a.not_after || '').getTime();
          const dateB = new Date(b.not_after || '').getTime();
          return dateB - dateA;  // Most recent first
        });
        
        const mostRecent = sorted[0];
        
        return {
          issuer: mostRecent.issuer?.friendly_name || mostRecent.issuer?.name || 'Unknown Issuer',
          validFrom: mostRecent.not_before,
          validTo: mostRecent.not_after,
          subjectAlternativeNames: mostRecent.dns_names || [],
          fingerprint: mostRecent.cert_sha256 || mostRecent.tbs_sha256
        };
      }

      console.debug(chalk.gray(`  No certificates found for ${domain} via SSLMate`));
      return null;
    } catch (error) {
      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          console.debug(chalk.gray(`  SSLMate API authentication failed - check API key`));
        } else if (error.message.includes('429')) {
          console.debug(chalk.gray(`  SSLMate API rate limit exceeded`));
        } else {
          console.debug(chalk.gray(`  SSLMate lookup failed for ${domain}: ${error.message}`));
        }
      }
      console.debug(chalk.gray(`  Trying crt.sh as fallback...`));
      return null;
    }
  }

  /**
   * Alternative subdomain enumeration using SecurityTrails (if API key available)
   */
  private async getSubdomainsFromSecurityTrails(domain: string): Promise<string[] | null> {
    if (!this.config.securityTrailsApiKey) return null;

    try {
      const response = await this.httpClient.get(
        `https://api.securitytrails.com/v1/domain/${domain}/subdomains`,
        {
          timeout: 3000,
          headers: {
            'APIKEY': this.config.securityTrailsApiKey,
            'User-Agent': 'CloudflareFirewall-OSINTClient/1.0'
          }
        }
      );

      if (response.data && response.data.subdomains) {
        return response.data.subdomains.map((sub: string) => `${sub}.${domain}`);
      }

      return null;
    } catch (error) {
      console.debug(chalk.gray(`  SecurityTrails lookup failed for ${domain}`));
      return null;
    }
  }
}
