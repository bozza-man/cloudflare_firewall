import axios, { AxiosInstance } from 'axios';
import { promisify } from 'util';
import { exec } from 'child_process';
import dns from 'dns';
import chalk from 'chalk';
import type { OSINTAnalysis } from './threat-intelligence-client.js';

const execAsync = promisify(exec);
const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolve);
const dnsResolvePtr = promisify(dns.reverse);

export interface OSINTProviderConfig {
  // Free tier APIs that don't require keys
  enableFreeServices: boolean;
  
  // Premium services (require API keys)
  ipApiKey?: string;
  whoisXmlApiKey?: string;
  securityTrailsApiKey?: string;
  
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
      ipApiKey: undefined,
      whoisXmlApiKey: undefined,
      securityTrailsApiKey: undefined,
      maxConcurrent: 3,
      rateLimitMs: 1000,
      requestTimeout: 10000,
      dnsTimeout: 5000,
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
        return await this.getWhoisXmlApi(domain);
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
      if (!tld) return null;

      // Common RDAP servers
      const rdapServers = {
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
      if (!serverUrl) return null;

      const response = await this.rateLimitedRequest(() => 
        this.httpClient.get(`${serverUrl}domain/${domain}`)
      );

      if (response.data) {
        const data = response.data;
        
        return {
          registrar: data.entities?.find((e: any) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3],
          registrationDate: data.events?.find((e: any) => e.eventAction === 'registration')?.eventDate,
          expirationDate: data.events?.find((e: any) => e.eventAction === 'expiration')?.eventDate,
          nameServers: data.nameservers?.map((ns: any) => ns.ldhName),
          registrantCountry: data.entities?.find((e: any) => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'adr')?.[3]?.[6],
          registrantOrganization: data.entities?.find((e: any) => e.roles?.includes('registrant'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'org')?.[3],
          privacyProtection: data.entities?.some((e: any) => e.vcardArray?.[1]?.some((v: any) => v[3]?.toLowerCase().includes('privacy')))
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Fallback to system whois command
   */
  private async getWhoisCommand(domain: string): Promise<OSINTAnalysis['whoisData'] | null> {
    try {
      const { stdout } = await execAsync(`whois ${domain}`, { 
        timeout: this.config.dnsTimeout * 1000 
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
      return null;
    }
  }

  /**
   * WhoisXML API (premium service)
   */
  private async getWhoisXmlApi(domain: string): Promise<OSINTAnalysis['whoisData'] | null> {
    if (!this.config.whoisXmlApiKey) return null;

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
      if (!whoisRecord) return null;

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
      return null;
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
        case 'A':
          return await resolver.resolve4(domain);
        case 'AAAA':
          return await resolver.resolve6(domain);
        case 'MX':
          const mx = await resolver.resolveMx(domain);
          return mx.map(record => `${record.priority} ${record.exchange}`);
        case 'TXT':
          const txt = await resolver.resolveTxt(domain);
          return txt.map(record => record.join(''));
        case 'CNAME':
          return await resolver.resolveCname(domain);
        case 'NS':
          return await resolver.resolveNs(domain);
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

      return null;
    } catch (error) {
      return null;
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

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get certificates from Certificate Transparency logs
   */
  async getCertificateTransparency(domain: string): Promise<OSINTAnalysis['certificates']> {
    try {
      console.log(chalk.gray(`  → Looking up certificates for ${domain} in CT logs...`));

      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
          timeout: 15000
        })
      );

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Get the most recent certificate
        const mostRecent = response.data.sort((a: any, b: any) => 
          new Date(b.not_after || b.entry_timestamp).getTime() - new Date(a.not_after || a.entry_timestamp).getTime()
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
      console.warn(chalk.yellow(`Certificate transparency lookup failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
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

      const response = await this.rateLimitedRequest(() =>
        this.httpClient.get(`https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`, {
          timeout: 20000
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
      console.warn(chalk.yellow(`Subdomain enumeration failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
      
      const wellKnownCompanies = {
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
}
