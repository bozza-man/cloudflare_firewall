import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { config } from '../utils/config.js';

/**
 * Enhanced Cloudflare Radar API Client
 * Utilizes more Radar API endpoints to gather comprehensive threat intelligence
 */
export class EnhancedRadarClient {
  private radarApi: AxiosInstance;
  
  constructor() {
    this.radarApi = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4/radar',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Get domain ranking and categories
   */
  async getDomainRanking(domain: string): Promise<any> {
    try {
      const response = await this.radarApi.get(`/ranking/domain/${encodeURIComponent(domain)}`);
      if (response.data?.success && response.data?.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Radar domain ranking failed for ${domain}`));
      return null;
    }
  }

  /**
   * Get ASN information for better organization identification
   */
  async getASNInfo(asn: number): Promise<any> {
    try {
      const response = await this.radarApi.get(`/entities/asns/${asn}`);
      if (response.data?.success && response.data?.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Radar ASN lookup failed for ${asn}`));
      return null;
    }
  }

  /**
   * Get IP entity information including ASN and location
   */
  async getIPInfo(ip: string): Promise<any> {
    try {
      const response = await this.radarApi.get(`/entities/ip`, {
        params: { ip }
      });
      if (response.data?.success && response.data?.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Radar IP lookup failed for ${ip}`));
      return null;
    }
  }

  /**
   * Get attack data for threat scoring
   * Helps identify IPs/countries involved in recent attacks
   */
  async getAttackData(dateRange: string = '7d'): Promise<any> {
    try {
      const response = await this.radarApi.get(`/attacks/layer3/top/attacks`, {
        params: { dateRange }
      });
      if (response.data?.success && response.data?.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Radar attack data fetch failed`));
      return null;
    }
  }

  /**
   * Search for entities in Radar's global database
   */
  async searchGlobal(query: string): Promise<any> {
    try {
      const response = await this.radarApi.get(`/search/global`, {
        params: { query }
      });
      if (response.data?.success && response.data?.result) {
        return response.data.result;
      }
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Radar global search failed for ${query}`));
      return null;
    }
  }

  /**
   * Get top attacking countries (for geo-risk assessment)
   */
  async getTopAttackingCountries(dateRange: string = '7d'): Promise<string[]> {
    try {
      const attackData = await this.getAttackData(dateRange);
      if (attackData?.top_0) {
        const countries = new Set<string>();
        attackData.top_0.forEach((attack: any) => {
          if (attack.originCountryAlpha2) {
            countries.add(attack.originCountryAlpha2);
          }
        });
        return Array.from(countries).slice(0, 10); // Top 10 attacking countries
      }
      return [];
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Failed to get top attacking countries`));
      return [];
    }
  }

  /**
   * Enhanced domain security assessment using multiple Radar endpoints
   */
  async assessDomainSecurity(domain: string): Promise<{
    riskScore: number;
    popularity?: number;
    categories?: string[];
    organizationInfo?: any;
    isHighRisk: boolean;
    reasons: string[];
  }> {
    const assessment = {
      riskScore: 0,
      popularity: undefined as number | undefined,
      categories: [] as string[],
      organizationInfo: undefined as any,
      isHighRisk: false,
      reasons: [] as string[]
    };

    try {
      // Get domain ranking
      const ranking = await this.getDomainRanking(domain);
      if (ranking) {
        const rank = ranking.details_0?.rank;
        const categories = ranking.details_0?.categories || [];
        
        assessment.popularity = rank;
        assessment.categories = categories.map((c: any) => c.name);
        
        // Lower rank = more popular = more trusted
        if (rank && rank < 1000) {
          assessment.riskScore = 0.1; // Very popular, low risk
          assessment.reasons.push(`Popular domain (rank: ${rank})`);
        } else if (rank && rank < 10000) {
          assessment.riskScore = 0.2; // Moderately popular
          assessment.reasons.push(`Moderately popular domain (rank: ${rank})`);
        } else if (rank && rank < 100000) {
          assessment.riskScore = 0.35; // Less popular
          assessment.reasons.push(`Less popular domain (rank: ${rank})`);
        } else if (rank && rank >= 100000) {
          assessment.riskScore = 0.5; // Very low popularity
          assessment.reasons.push(`Very low popularity domain (rank: ${rank})`);
        } else {
          // No ranking data available - be conservative, don't assume malicious
          assessment.riskScore = 0.3; // Unknown popularity - neutral score
          assessment.reasons.push(`Domain popularity unknown`);
        }
        
        // Check for suspicious categories
        const suspiciousCategories = ['Adult', 'Gambling', 'Malware', 'Phishing'];
        const foundSuspicious = categories.filter((c: any) => 
          suspiciousCategories.some(sus => c.name?.includes(sus))
        );
        
        if (foundSuspicious.length > 0) {
          assessment.riskScore += 0.3;
          assessment.isHighRisk = true;
          assessment.reasons.push(`Suspicious categories: ${foundSuspicious.map((c: any) => c.name).join(', ')}`);
        }
      }
      
      // Try to get organization info via IP
      try {
        const dns = await import('dns').then(m => m.promises);
        const addresses = await dns.resolve4(domain).catch(() => []);
        
        if (addresses.length > 0) {
          const ipInfo = await this.getIPInfo(addresses[0]);
          if (ipInfo?.ip) {
            assessment.organizationInfo = {
              asn: ipInfo.ip.asn,
              asnName: ipInfo.ip.asnName,
              organization: ipInfo.ip.asnOrgName,
              country: ipInfo.ip.locationName,
              countryCode: ipInfo.ip.location
            };
            
            // Check if hosting provider is known for abuse
            const suspiciousASNs = ['DIGITALOCEAN', 'OVH', 'HETZNER'];
            if (suspiciousASNs.some(asn => ipInfo.ip.asnName?.includes(asn))) {
              assessment.riskScore += 0.1;
              assessment.reasons.push(`Hosted on provider commonly used for malicious sites: ${ipInfo.ip.asnName}`);
            }
            
            // Check if country is high risk
            const attackingCountries = await this.getTopAttackingCountries();
            if (attackingCountries.includes(ipInfo.ip.location)) {
              assessment.riskScore += 0.2;
              assessment.reasons.push(`Hosted in country with high attack activity: ${ipInfo.ip.locationName}`);
            }
          }
        }
      } catch (error) {
        // DNS resolution failed, not necessarily bad
        console.debug(chalk.gray(`DNS resolution failed for ${domain}`));
      }
      
      // Cap risk score at 1.0
      assessment.riskScore = Math.min(1.0, assessment.riskScore);
      assessment.isHighRisk = assessment.riskScore > 0.6;
      
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Enhanced assessment failed for ${domain}`));
      assessment.riskScore = 0.5; // Unknown risk
      assessment.reasons.push('Unable to perform complete assessment');
    }
    
    return assessment;
  }

  /**
   * Enhanced IP security assessment
   */
  async assessIPSecurity(ip: string): Promise<{
    riskScore: number;
    asn?: number;
    organization?: string;
    country?: string;
    isHighRisk: boolean;
    reasons: string[];
  }> {
    const assessment = {
      riskScore: 0,
      asn: undefined as number | undefined,
      organization: undefined as string | undefined,
      country: undefined as string | undefined,
      isHighRisk: false,
      reasons: [] as string[]
    };

    try {
      // Get IP information
      const ipInfo = await this.getIPInfo(ip);
      if (ipInfo?.ip) {
        assessment.asn = parseInt(ipInfo.ip.asn);
        assessment.organization = ipInfo.ip.asnOrgName;
        assessment.country = ipInfo.ip.locationName;
        
        // Get detailed ASN information
        if (assessment.asn) {
          const asnInfo = await this.getASNInfo(assessment.asn);
          if (asnInfo?.asn) {
            // Check estimated users - low users might indicate less legitimate
            const estimatedUsers = asnInfo.asn.estimatedUsers?.estimatedUsers || 0;
            if (estimatedUsers < 1000) {
              assessment.riskScore += 0.3;
              assessment.reasons.push(`Small ASN with few users (${estimatedUsers})`);
            } else if (estimatedUsers < 10000) {
              assessment.riskScore += 0.1;
              assessment.reasons.push(`Medium-sized ASN (${estimatedUsers} users)`);
            }
            
            // Check if it's a known good organization
            const trustedOrgs = ['GOOGLE', 'AMAZON', 'MICROSOFT', 'CLOUDFLARE', 'AKAMAI'];
            if (trustedOrgs.some(org => asnInfo.asn.name?.includes(org))) {
              assessment.riskScore = Math.max(0, assessment.riskScore - 0.3);
              assessment.reasons.push(`Trusted organization: ${asnInfo.asn.name}`);
            }
          }
        }
        
        // Check country risk based on attack data
        const attackingCountries = await this.getTopAttackingCountries();
        if (ipInfo.ip.location && attackingCountries.includes(ipInfo.ip.location)) {
          assessment.riskScore += 0.3;
          assessment.reasons.push(`IP from country with high attack activity: ${ipInfo.ip.locationName}`);
        }
        
        // Check for residential/business ISP patterns
        const residentialKeywords = ['COMCAST', 'VERIZON', 'ATT-', 'CHARTER', 'COX-'];
        if (residentialKeywords.some(keyword => ipInfo.ip.asnName?.includes(keyword))) {
          assessment.riskScore += 0.2;
          assessment.reasons.push(`Residential ISP detected: ${ipInfo.ip.asnName}`);
        }
        
        // Check for VPN/proxy providers
        const vpnProviders = ['MULLVAD', 'NORDVPN', 'EXPRESSVPN', 'PROTONVPN', 'TOR-'];
        if (vpnProviders.some(vpn => ipInfo.ip.asnName?.toUpperCase().includes(vpn))) {
          assessment.riskScore += 0.4;
          assessment.reasons.push(`VPN/Proxy provider detected: ${ipInfo.ip.asnName}`);
        }
      } else {
        assessment.riskScore = 0.5;
        assessment.reasons.push('Unable to retrieve IP information');
      }
      
      // Cap risk score at 1.0
      assessment.riskScore = Math.min(1.0, assessment.riskScore);
      assessment.isHighRisk = assessment.riskScore > 0.6;
      
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Enhanced IP assessment failed for ${ip}`));
      assessment.riskScore = 0.5;
      assessment.reasons.push('Unable to perform complete assessment');
    }
    
    return assessment;
  }
}

// Export singleton instance
export const enhancedRadarClient = new EnhancedRadarClient();
