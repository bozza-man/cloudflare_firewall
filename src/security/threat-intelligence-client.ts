import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import { OSINTProviders } from './osint-providers.js';
import { enhancedRadarClient } from './enhanced-radar-client.js';
import { dnsVerifier } from './dns-verifier.js';

export interface ThreatIntelligenceResult {
  domain: string;
  ip?: string;
  reputation: 'trusted' | 'suspicious' | 'malicious' | 'unknown';
  confidence: number; // 0-1
  threats: ThreatType[];
  sources: ThreatSource[];
  details: {
    categories?: string[];
    malware?: boolean;
    phishing?: boolean;
    botnet?: boolean;
    spam?: boolean;
    childAbuse?: boolean;
    lastSeen?: string;
    firstSeen?: string;
    popularity?: number;
    ageInDays?: number;
  };
  osintAnalysis?: OSINTAnalysis;
  recommendations: string[];
  allowRecommendation: 'allow' | 'block' | 'caution';
}

export interface OSINTAnalysis {
  whoisData?: {
    registrar?: string;
    registrationDate?: string;
    expirationDate?: string;
    nameServers?: string[];
    registrantCountry?: string;
    registrantOrganization?: string;
    privacyProtection?: boolean;
  };
  dnsRecords?: {
    A?: string[];
    AAAA?: string[];
    MX?: string[];
    TXT?: string[];
    CNAME?: string[];
    NS?: string[];
  };
  geolocation?: {
    country?: string;
    region?: string;
    city?: string;
    isp?: string;
    asn?: number;
    asnOrganization?: string;
    latitude?: number;
    longitude?: number;
  };
  certificates?: {
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    subjectAlternativeNames?: string[];
    fingerprint?: string;
  };
  relatedDomains?: string[];
  subdomains?: string[];
  historicalData?: {
    previousIPs?: string[];
    domainHistory?: Array<{
      date: string;
      change: string;
      value: string;
    }>;
  };
  socialMediaPresence?: {
    platforms: string[];
    verified: boolean;
  };
  businessInfo?: {
    companyName?: string;
    industry?: string;
    employeeCount?: string;
    website?: string;
    founded?: string;
  };
  riskFactors?: Array<{
    factor: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    evidence: string;
  }>;
}

export interface ThreatType {
  type: 'malware' | 'phishing' | 'botnet' | 'spam' | 'adult' | 'suspicious' | 'newly_registered';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  source: string;
  description: string;
  firstDetected?: string;
  lastDetected?: string;
}

export interface ThreatSource {
  name: string;
  type: 'radar' | 'virustotal' | 'urlvoid' | 'reputation' | 'blacklist';
  reputation: number; // 0-100
  lastUpdate: string;
}

export interface RadarDomainInfo {
  domain: string;
  category: string[];
  content_categories: string[];
  additional_information: {
    suspected_malware: boolean;
    adult_content: boolean;
  };
  risk_score: number;
  popularity: number;
}

export interface RadarIPInfo {
  ip: string;
  risk_score: number;
  classification: string[];
  threats: string[];
  asn: {
    asn: number;
    name: string;
    country: string;
  };
  location: {
    country: string;
    region: string;
    city: string;
  };
}

export class ThreatIntelligenceClient {
  private radarApi: AxiosInstance;
  private fallbackApis: Map<string, AxiosInstance> = new Map();
  private osintProviders: OSINTProviders;
  private currentResult: ThreatIntelligenceResult | null = null;
  
  constructor() {
    // Initialize Cloudflare Radar API
    this.radarApi = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4/radar',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.apiToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Initialize fallback APIs for comprehensive threat intelligence
    this.initializeFallbackApis();
    
    // Initialize OSINT providers
    this.osintProviders = new OSINTProviders({
      enableFreeServices: config.osint.enableFreeServices,
      whoisXmlApiKey: config.osint.whoisXmlApiKey,
      securityTrailsApiKey: config.osint.securityTrailsApiKey,
      sslmateApiKey: config.osint.sslmateApiKey,
      maxConcurrent: config.osint.maxConcurrentRequests,
      rateLimitMs: config.osint.rateLimitMs,
      requestTimeout: config.osint.requestTimeoutMs,
      dnsTimeout: config.osint.dnsTimeoutMs
    });
  }

  /**
   * Main method to scan a domain for threat intelligence
   */
  async scanDomain(domain: string): Promise<ThreatIntelligenceResult> {
    console.log(chalk.cyan(`🔍 Scanning domain: ${domain}`));
    
    // First, verify DNS resolution
    const dnsResult = await dnsVerifier.verifyDomain(domain);
    
    const result: ThreatIntelligenceResult = {
      domain,
      reputation: 'unknown',
      confidence: 0,
      threats: [],
      sources: [],
      details: {},
      recommendations: [],
      allowRecommendation: 'caution'
    };
    
    // Store the current result for use in other methods
    this.currentResult = result;
    
    // Check DNS resolution status
    if (!dnsResult.resolves) {
      console.log(chalk.red(`❌ Domain ${domain} does not resolve - likely invalid or non-existent`));
      result.reputation = 'suspicious';
      result.confidence = 0.9;
      result.threats.push('Domain does not resolve via DNS');
      result.details.dnsStatus = 'NXDOMAIN';
      result.recommendations.push('⚠️ BLOCK: Domain does not resolve - potential typosquatting or malicious domain');
      result.allowRecommendation = 'block';
      return result;
    }
    
    // Check for DNS hijacking
    if (dnsResult.discrepancies.some(d => d.includes('CRITICAL'))) {
      console.log(chalk.red(`🚨 DNS hijacking detected for ${domain}!`));
      result.reputation = 'malicious';
      result.confidence = 0.95;
      result.threats.push('Possible DNS hijacking detected');
      dnsResult.discrepancies.forEach(d => result.threats.push(d));
      result.details.dnsStatus = 'HIJACKED';
      result.details.dnsDiscrepancies = dnsResult.discrepancies;
      result.recommendations.push('🚫 BLOCK: DNS hijacking indicators detected');
      result.allowRecommendation = 'block';
      return result;
    }
    
    // Check for private IPs
    if (dnsResult.addresses.ipv4.some(ip => dnsVerifier.isPrivateIP(ip))) {
      console.log(chalk.yellow(`⚠️ Domain ${domain} resolves to private IP addresses`));
      result.details.hasPrivateIPs = true;
    }
    
    // Store DNS info in details
    result.details.dnsInfo = {
      resolves: dnsResult.resolves,
      ipv4: dnsResult.addresses.ipv4,
      ipv6: dnsResult.addresses.ipv6,
      dnssecValid: dnsResult.dnssecValid,
      responseTime: dnsResult.responseTime
    };

    try {
      // Primary scan using Cloudflare Radar
      const radarResult = await this.scanWithRadar(domain);
      if (radarResult) {
        this.mergeRadarResults(result, radarResult);
      }

      // Fallback to other threat intelligence sources
      await this.scanWithFallbacks(domain, result);

      // Perform comprehensive OSINT analysis with real data sources
      result.osintAnalysis = await this.performOSINTAnalysis(domain);

      // Analyze results and provide recommendations
      this.analyzeAndRecommend(result);

      console.log(this.formatScanResult(result));
      return result;

    } catch (error) {
      console.error(chalk.red(`❌ Error scanning ${domain}:`), error instanceof Error ? error.message : error);
      
      // Return safe default for errors
      result.reputation = 'unknown';
      result.allowRecommendation = 'caution';
      result.recommendations.push('Unable to verify domain reputation - manual review recommended');
      
      return result;
    }
  }

  /**
   * Scan an IP address for threat intelligence
   */
  async scanIP(ip: string): Promise<ThreatIntelligenceResult> {
    console.log(chalk.cyan(`🔍 Scanning IP: ${ip}`));
    
    const result: ThreatIntelligenceResult = {
      domain: '', // IP scan
      ip,
      reputation: 'unknown',
      confidence: 0,
      threats: [],
      sources: [],
      details: {},
      recommendations: [],
      allowRecommendation: 'caution'
    };

    try {
      // Scan IP using Cloudflare Radar
      const radarResult = await this.scanIPWithRadar(ip);
      if (radarResult) {
        this.mergeRadarIPResults(result, radarResult);
      }

      // Additional IP reputation checks
      await this.scanIPWithFallbacks(ip, result);

      // Perform comprehensive IP OSINT analysis with real data sources
      result.osintAnalysis = await this.performIPOSINTAnalysis(ip);

      this.analyzeAndRecommend(result);
      
      console.log(this.formatScanResult(result));
      return result;

    } catch (error) {
      console.error(chalk.red(`❌ Error scanning IP ${ip}:`), error instanceof Error ? error.message : error);
      
      result.reputation = 'unknown';
      result.allowRecommendation = 'caution';
      result.recommendations.push('Unable to verify IP reputation - manual review recommended');
      
      return result;
    }
  }

  /**
   * Bulk scan multiple domains/IPs
   */
  async bulkScan(items: string[], rateLimitMs: number = 1000): Promise<Map<string, ThreatIntelligenceResult>> {
    const results = new Map<string, ThreatIntelligenceResult>();
    
    console.log(chalk.yellow(`🔍 Starting bulk scan of ${items.length} items with ${rateLimitMs}ms rate limit`));
    
    for (const item of items) {
      try {
        const result = this.isValidIP(item) ? 
          await this.scanIP(item) : 
          await this.scanDomain(item);
        
        results.set(item, result);
        
        // Rate limiting
        if (rateLimitMs > 0) {
          await this.delay(rateLimitMs);
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Error scanning ${item}:`), error);
        
        // Add error result
        results.set(item, {
          domain: this.isValidIP(item) ? '' : item,
          ip: this.isValidIP(item) ? item : undefined,
          reputation: 'unknown',
          confidence: 0,
          threats: [],
          sources: [],
          details: {},
          recommendations: [`Error scanning ${item}: ${error instanceof Error ? error.message : 'Unknown error'}`],
          allowRecommendation: 'caution'
        });
      }
    }
    
    console.log(chalk.green(`✅ Bulk scan completed: ${results.size} items processed`));
    return results;
  }

  /**
   * Scan domain using enhanced Cloudflare Radar API
   */
  private async scanWithRadar(domain: string): Promise<RadarDomainInfo | null> {
    try {
      // Clean and validate domain format
      const cleanDomain = domain.toLowerCase().trim();
      
      // Remove protocol if present
      const domainWithoutProtocol = cleanDomain.replace(/^https?:\/\//, '');
      
      // Remove path and query string if present
      const domainOnly = domainWithoutProtocol.split('/')[0].split('?')[0];
      
      // Validate domain format (basic check)
      if (!domainOnly || !domainOnly.includes('.') || domainOnly.length < 3) {
        console.debug(chalk.gray(`⚠️  Invalid domain format for Radar API: ${domain}`));
        return null;
      }
      
      // For common domains that often fail, skip Radar API
      const skipDomains = ['example.com', 'localhost', 'test.com', '0.0.0.0', '127.0.0.1'];
      if (skipDomains.includes(domainOnly)) {
        console.debug(chalk.gray(`⚠️  Skipping Radar API for known test domain: ${domainOnly}`));
        return null;
      }
      
      // Use enhanced Radar client for comprehensive assessment
      const assessment = await enhancedRadarClient.assessDomainSecurity(domainOnly);
      
      if (assessment) {
        // Display Radar API data
        console.log(chalk.blue('📊 Radar API Data:'));
        console.log(chalk.gray(`  Risk Score: ${assessment.riskScore * 100}%`));
        console.log(chalk.gray(`  Popularity Rank: ${assessment.popularity || 'Unknown'}`));
        console.log(chalk.gray(`  Categories: ${assessment.categories?.join(', ') || 'None'}`));
        if (assessment.organizationInfo) {
          console.log(chalk.gray(`  Organization: ${assessment.organizationInfo.organization || 'Unknown'}`));
          console.log(chalk.gray(`  ASN: ${assessment.organizationInfo.asn || 'Unknown'}`));
          console.log(chalk.gray(`  Country: ${assessment.organizationInfo.country || 'Unknown'}`));
        }
        console.log(chalk.gray(`  Risk Reasons: ${assessment.reasons.join(', ')}`));
        
        // Store organization info in result details if available
        if (assessment.organizationInfo && this.currentResult) {
          this.currentResult.details.organization = assessment.organizationInfo.organization;
          this.currentResult.details.country = assessment.organizationInfo.country;
          this.currentResult.details.asn = assessment.organizationInfo.asn;
        }
        
        return {
          domain: domainOnly,
          category: assessment.categories || [],
          content_categories: assessment.categories || [],
          additional_information: {
            suspected_malware: false, // Don't flag as malware based solely on risk score
            adult_content: assessment.categories?.some(c => c.toLowerCase().includes('adult')) || false
          },
          risk_score: assessment.riskScore * 100, // Convert to percentage
          popularity: assessment.popularity || 0,
          // Add enhanced data
          enhanced_data: {
            organizationInfo: assessment.organizationInfo,
            reasons: assessment.reasons
          }
        } as any;
      }
      
      return null;
    } catch (error) {
      console.debug(chalk.gray(`⚠️  Enhanced Radar scan failed for ${domain}`));
      return null;
    }
  }

  /**
   * Scan IP using Cloudflare Radar API
   */
  private async scanIPWithRadar(ip: string): Promise<RadarIPInfo | null> {
    try {
      const response = await this.radarApi.get(`/ip/${ip}`);
      
      if (response.data?.success && response.data?.result) {
        return response.data.result as RadarIPInfo;
      }
      
      return null;
    } catch (error) {
      console.warn(chalk.yellow(`⚠️  Radar IP scan failed for ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      return null;
    }
  }

  /**
   * Use fallback threat intelligence sources
   */
  private async scanWithFallbacks(domain: string, result: ThreatIntelligenceResult): Promise<void> {
    // DNS-based reputation checks
    await this.checkDNSReputation(domain, result);
    
    // Domain age and registration analysis
    await this.analyzeDomainAge(domain, result);
    
    // Pattern-based threat detection
    this.analyzePatterns(domain, result);
  }

  /**
   * Use fallback IP reputation sources
   */
  private async scanIPWithFallbacks(ip: string, result: ThreatIntelligenceResult): Promise<void> {
    // Check against known bad IP ranges
    this.checkBadIPRanges(ip, result);
    
    // Geolocation-based risk assessment
    await this.analyzeIPGeolocation(ip, result);
  }

  /**
   * DNS-based reputation checking
   */
  private async checkDNSReputation(domain: string, result: ThreatIntelligenceResult): Promise<void> {
    try {
      // Check against common DNS blacklists
      const blacklists = [
        'surbl.org',
        'uribl.com', 
        'multi.uribl.com'
      ];
      
      for (const blacklist of blacklists) {
        try {
          // Note: This is a simplified check - in production you'd implement proper DNS lookups
          const isListed = await this.checkDNSBlacklist(domain, blacklist);
          if (isListed) {
            result.threats.push({
              type: 'suspicious',
              severity: 'medium',
              confidence: 0.7,
              source: blacklist,
              description: `Domain found in ${blacklist} blacklist`
            });
          }
        } catch (error) {
          // Blacklist check failed, continue with others
          console.debug(`DNS blacklist check failed for ${blacklist}: ${error}`);
        }
      }
    } catch (error) {
      console.debug(`DNS reputation check failed: ${error}`);
    }
  }

  /**
   * Analyze domain age and registration patterns
   */
  private async analyzeDomainAge(domain: string, result: ThreatIntelligenceResult): Promise<void> {
    try {
      // In a real implementation, you'd query WHOIS data
      // For now, we'll use heuristics based on domain patterns
      
      if (this.isNewlyRegisteredPattern(domain)) {
        result.threats.push({
          type: 'newly_registered',
          severity: 'low',
          confidence: 0.6,
          source: 'pattern_analysis',
          description: 'Domain appears to follow newly registered domain patterns'
        });
      }
    } catch (error) {
      console.debug(`Domain age analysis failed: ${error}`);
    }
  }

  /**
   * Pattern-based threat detection
   */
  private analyzePatterns(domain: string, result: ThreatIntelligenceResult): void {
    const suspiciousPatterns = [
      /\d{4,}/g, // Many numbers (year patterns, etc.)
      /[a-z]{20,}/g, // Very long random strings
      /-[a-z0-9]{8,}-/g, // UUID-like patterns
      /\.(tk|ml|ga|cf)$/i, // High-risk TLDs
      /(secure|update|verify|account|login|bank)/gi // Phishing keywords
    ];
    
    const maliciousKeywords = [
      'phishing', 'scam', 'hack', 'malware', 'virus',
      'trojan', 'bot', 'spam', 'fake', 'suspicious'
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(domain)) {
        result.threats.push({
          type: 'suspicious',
          severity: 'low',
          confidence: 0.4,
          source: 'pattern_analysis',
          description: `Domain matches suspicious pattern: ${pattern.source}`
        });
      }
    }
    
    for (const keyword of maliciousKeywords) {
      if (domain.toLowerCase().includes(keyword)) {
        result.threats.push({
          type: 'suspicious',
          severity: 'medium',
          confidence: 0.6,
          source: 'keyword_analysis',
          description: `Domain contains suspicious keyword: ${keyword}`
        });
      }
    }
  }

  /**
   * Check IP against known bad ranges
   */
  private checkBadIPRanges(ip: string, result: ThreatIntelligenceResult): void {
    // Common malicious IP ranges (simplified)
    const badRanges = [
      { start: '127.0.0.0', end: '127.255.255.255', description: 'Localhost' },
      { start: '0.0.0.0', end: '0.255.255.255', description: 'Reserved' },
      { start: '10.0.0.0', end: '10.255.255.255', description: 'Private Range' }
    ];
    
    for (const range of badRanges) {
      if (this.isIPInRange(ip, range.start, range.end)) {
        result.threats.push({
          type: 'suspicious',
          severity: 'low',
          confidence: 0.3,
          source: 'ip_range_analysis',
          description: `IP in ${range.description} range`
        });
      }
    }
  }

  /**
   * Analyze IP geolocation for risk
   */
  private async analyzeIPGeolocation(ip: string, result: ThreatIntelligenceResult): Promise<void> {
    // High-risk countries/regions (simplified example)
    const highRiskCountries = ['CN', 'RU', 'KP', 'IR'];
    
    // In a real implementation, you'd use a geolocation service
    // For now, this is a placeholder
    try {
      // Placeholder for geolocation check
      const isHighRisk = false; // Would be determined by actual geolocation lookup
      
      if (isHighRisk) {
        result.threats.push({
          type: 'suspicious',
          severity: 'medium',
          confidence: 0.5,
          source: 'geolocation_analysis',
          description: 'IP located in high-risk region'
        });
      }
    } catch (error) {
      console.debug(`Geolocation analysis failed: ${error}`);
    }
  }

  /**
   * Merge Cloudflare Radar results into threat intelligence result
   */
  private mergeRadarResults(result: ThreatIntelligenceResult, radarData: RadarDomainInfo): void {
    result.sources.push({
      name: 'Cloudflare Radar',
      type: 'radar',
      reputation: Math.max(0, 100 - (radarData.risk_score || 0)),
      lastUpdate: new Date().toISOString()
    });

    result.details.categories = radarData.category || [];
    result.details.malware = radarData.additional_information?.suspected_malware || false;
    result.details.popularity = radarData.popularity || 0;

    // Determine reputation based on Radar data
    // Adjusted thresholds to reduce false positives for legitimate domains
    const riskScore = radarData.risk_score || 0;
    if (riskScore > 80) {
      result.reputation = 'malicious';
      result.confidence = 0.9;
    } else if (riskScore > 65) {
      result.reputation = 'suspicious';
      result.confidence = 0.7;
    } else if (riskScore > 50) {
      // Domains with moderate risk scores should be unknown, not suspicious
      result.reputation = 'unknown';
      result.confidence = 0.5;
    } else {
      // Low risk scores (0-50) indicate likely trusted domains
      // This includes domains with unknown popularity (30%) which shouldn't be penalized
      result.reputation = 'trusted';
      result.confidence = 0.7; // Slightly lower confidence for unknown popularity
    }

    // Add threats based on Radar data
    if (radarData.additional_information?.suspected_malware) {
      result.threats.push({
        type: 'malware',
        severity: 'high',
        confidence: 0.8,
        source: 'Cloudflare Radar',
        description: 'Domain flagged as suspected malware'
      });
    }

    if (radarData.additional_information?.adult_content) {
      result.threats.push({
        type: 'adult',
        severity: 'medium',
        confidence: 0.9,
        source: 'Cloudflare Radar',
        description: 'Domain contains adult content'
      });
    }
  }

  /**
   * Merge Cloudflare Radar IP results
   */
  private mergeRadarIPResults(result: ThreatIntelligenceResult, radarData: RadarIPInfo): void {
    result.sources.push({
      name: 'Cloudflare Radar',
      type: 'radar',
      reputation: Math.max(0, 100 - (radarData.risk_score || 0)),
      lastUpdate: new Date().toISOString()
    });

    // Determine reputation based on IP risk score
    // Adjusted thresholds to reduce false positives
    const riskScore = radarData.risk_score || 0;
    if (riskScore > 80) {
      result.reputation = 'malicious';
      result.confidence = 0.9;
    } else if (riskScore > 60) {
      result.reputation = 'suspicious';
      result.confidence = 0.7;
    } else if (riskScore > 40) {
      // IPs with moderate risk scores should be unknown, not suspicious
      result.reputation = 'unknown';
      result.confidence = 0.5;
    } else {
      // Low risk scores indicate trusted IPs
      result.reputation = 'trusted';
      result.confidence = 0.8;
    }

    // Add threats based on classifications
    for (const classification of radarData.classification || []) {
      result.threats.push({
        type: 'suspicious',
        severity: 'medium',
        confidence: 0.7,
        source: 'Cloudflare Radar',
        description: `IP classified as: ${classification}`
      });
    }

    for (const threat of radarData.threats || []) {
      result.threats.push({
        type: 'malicious' as any,
        severity: 'high',
        confidence: 0.8,
        source: 'Cloudflare Radar',
        description: `IP associated with: ${threat}`
      });
    }
  }

  /**
   * Analyze combined results and provide recommendations
   */
  private analyzeAndRecommend(result: ThreatIntelligenceResult): void {
    const highSeverityThreats = result.threats.filter(t => t.severity === 'high' || t.severity === 'critical');
    const mediumSeverityThreats = result.threats.filter(t => t.severity === 'medium');
    
    // Determine overall recommendation
    if (highSeverityThreats.length > 0) {
      result.allowRecommendation = 'block';
      result.recommendations.push('❌ BLOCK: High-severity threats detected');
    } else if (mediumSeverityThreats.length > 2) {
      result.allowRecommendation = 'block';
      result.recommendations.push('❌ BLOCK: Multiple medium-severity threats detected');
    } else if (result.reputation === 'malicious') {
      result.allowRecommendation = 'block';
      result.recommendations.push('❌ BLOCK: Domain/IP has malicious reputation');
    } else if (result.reputation === 'suspicious' || mediumSeverityThreats.length > 0) {
      result.allowRecommendation = 'caution';
      result.recommendations.push('⚠️  CAUTION: Suspicious activity detected - requires review');
    } else if (result.reputation === 'trusted' && result.confidence >= 0.7) {
      result.allowRecommendation = 'allow';
      result.recommendations.push('✅ ALLOW: Clean reputation with high confidence');
    } else {
      result.allowRecommendation = 'caution';
      result.recommendations.push('⚠️  CAUTION: Unknown reputation - manual verification recommended');
    }

    // Add specific recommendations based on threats
    for (const threat of result.threats) {
      switch (threat.type) {
        case 'malware':
          result.recommendations.push(`🦠 Malware detected: ${threat.description}`);
          break;
        case 'phishing':
          result.recommendations.push(`🎣 Phishing detected: ${threat.description}`);
          break;
        case 'botnet':
          result.recommendations.push(`🤖 Botnet activity: ${threat.description}`);
          break;
        case 'newly_registered':
          result.recommendations.push(`🆕 Newly registered domain: Exercise extra caution`);
          break;
      }
    }
  }

  /**
   * Format scan result for console output
   */
  private formatScanResult(result: ThreatIntelligenceResult): string {
    const target = result.domain || result.ip;
    const reputationColor = result.reputation === 'trusted' ? chalk.green : 
                           result.reputation === 'suspicious' ? chalk.yellow : chalk.red;
    
    let output = `\n${chalk.cyan('🔍 Security Scan Results')}\n`;
    output += `Target: ${target}\n`;
    output += `Reputation: ${reputationColor(result.reputation.toUpperCase())} (${Math.round(result.confidence * 100)}% confidence)\n`;
    
    if (result.threats.length > 0) {
      output += `\n${chalk.red('⚠️  Threats Detected:')}\n`;
      for (const threat of result.threats) {
        const severityColor = threat.severity === 'critical' ? chalk.red :
                             threat.severity === 'high' ? chalk.red :
                             threat.severity === 'medium' ? chalk.yellow : chalk.blue;
        output += `  • ${severityColor(threat.severity.toUpperCase())}: ${threat.description}\n`;
      }
    }
    
    output += `\n${chalk.cyan('Recommendation:')} ${result.allowRecommendation === 'allow' ? '✅' : 
                                                    result.allowRecommendation === 'block' ? '❌' : '⚠️ '} ${result.allowRecommendation.toUpperCase()}\n`;
    
    return output;
  }

  // Utility methods
  private initializeFallbackApis(): void {
    // Initialize other threat intelligence APIs if available
    // This is where you could add VirusTotal, URLVoid, etc.
  }

  private async checkDNSBlacklist(domain: string, blacklist: string): Promise<boolean> {
    // Simplified DNS blacklist check
    // In production, you'd implement actual DNS lookups
    return false;
  }

  private isNewlyRegisteredPattern(domain: string): boolean {
    // Heuristics for newly registered domains
    const suspiciousPatterns = [
      /\d{4,}/g, // Many numbers
      /[a-z]{15,}/g, // Very long strings
      /-[a-z0-9]{8,}/g // UUID-like patterns
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(domain));
  }

  private isValidIP(input: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(input) || ipv6Regex.test(input);
  }

  private isIPInRange(ip: string, startIP: string, endIP: string): boolean {
    // Simplified IP range check - in production, use proper IP parsing
    const ipToNumber = (ip: string) => 
      ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
    
    const target = ipToNumber(ip);
    const start = ipToNumber(startIP);
    const end = ipToNumber(endIP);
    
    return target >= start && target <= end;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Perform comprehensive OSINT analysis for a domain using real data sources
   */
  private async performOSINTAnalysis(domain: string): Promise<OSINTAnalysis> {
    console.log(chalk.cyan(`🔎 Performing comprehensive OSINT analysis for ${domain}...`));
    
    const analysis: OSINTAnalysis = {
      riskFactors: []
    };

    try {
      // Collect OSINT data in parallel for efficiency
      const [whoisData, dnsRecords, certificates, subdomains, businessInfo] = await Promise.allSettled([
        config.osint.enableWhoisLookup ? this.osintProviders.getWhoisData(domain) : Promise.resolve(undefined),
        config.osint.enableDnsLookup ? this.osintProviders.getDnsRecords(domain) : Promise.resolve(undefined),
        config.osint.enableCertificateTransparency ? this.osintProviders.getCertificateTransparency(domain) : Promise.resolve(undefined),
        config.osint.enableSubdomainEnum ? this.osintProviders.getSubdomains(domain) : Promise.resolve(undefined),
        this.osintProviders.getBusinessInfo(domain)
      ]);
      
      // Assign successful results
      if (whoisData.status === 'fulfilled' && whoisData.value) {
        analysis.whoisData = whoisData.value;
      }
      
      if (dnsRecords.status === 'fulfilled' && dnsRecords.value) {
        analysis.dnsRecords = dnsRecords.value;
      }
      
      if (certificates.status === 'fulfilled' && certificates.value) {
        analysis.certificates = certificates.value;
      }
      
      if (subdomains.status === 'fulfilled' && subdomains.value) {
        analysis.subdomains = subdomains.value;
      }
      
      if (businessInfo.status === 'fulfilled' && businessInfo.value) {
        analysis.businessInfo = businessInfo.value;
      }
      
      // Analyze collected data for risk factors
      this.analyzeRiskFactors(domain, analysis);
      
      console.log(chalk.green(`✅ OSINT analysis completed for ${domain}`));
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ OSINT analysis partially failed for ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      
      analysis.riskFactors?.push({
        factor: 'incomplete_analysis',
        severity: 'medium',
        description: 'OSINT analysis could not be completed fully',
        evidence: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
    
    return analysis;
  }

  /**
   * Perform comprehensive OSINT analysis for an IP address using real data sources
   */
  private async performIPOSINTAnalysis(ip: string): Promise<OSINTAnalysis> {
    console.log(chalk.cyan(`🔎 Performing comprehensive IP OSINT analysis for ${ip}...`));
    
    const analysis: OSINTAnalysis = {
      riskFactors: []
    };

    try {
      // Collect IP OSINT data in parallel
      const [geolocation, reverseDns] = await Promise.allSettled([
        config.osint.enableGeoLocation ? this.osintProviders.getIpGeolocation(ip) : Promise.resolve(undefined),
        this.osintProviders.getReverseDns(ip)
      ]);
      
      // Assign successful results
      if (geolocation.status === 'fulfilled' && geolocation.value) {
        analysis.geolocation = geolocation.value;
      }
      
      if (reverseDns.status === 'fulfilled' && reverseDns.value && reverseDns.value.length > 0) {
        analysis.dnsRecords = {
          PTR: reverseDns.value
        } as any;
      }
      
      // Analyze collected IP data for risk factors
      this.analyzeIPRiskFactors(ip, analysis);
      
      console.log(chalk.green(`✅ IP OSINT analysis completed for ${ip}`));
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ IP OSINT analysis partially failed for ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`));
      
      analysis.riskFactors?.push({
        factor: 'incomplete_ip_analysis',
        severity: 'medium',
        description: 'IP OSINT analysis could not be completed fully',
        evidence: `IP analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
    
    return analysis;
  }

  // TODO: Implement real OSINT methods with actual data sources
  // Methods should integrate with:
  // - WHOIS APIs (e.g., RDAP, whois.net)
  // - DNS resolution tools (dig, nslookup)
  // - Certificate transparency logs (crt.sh)
  // - Subdomain enumeration tools (subfinder, amass)
  // - Business intelligence APIs (Clearbit, etc.)
  // - Geolocation services (MaxMind, IPinfo)
  // - Reverse DNS lookups

  private analyzeRiskFactors(domain: string, analysis: OSINTAnalysis): void {
    if (!analysis.riskFactors) analysis.riskFactors = [];
    
    // Analyze domain age
    if (analysis.whoisData?.registrationDate) {
      const regDate = new Date(analysis.whoisData.registrationDate);
      const daysSinceRegistration = Math.floor((Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceRegistration < 30) {
        analysis.riskFactors.push({
          factor: 'newly_registered_domain',
          severity: 'high',
          description: 'Domain registered less than 30 days ago',
          evidence: `Registration date: ${analysis.whoisData.registrationDate} (${daysSinceRegistration} days ago)`
        });
      } else if (daysSinceRegistration < 90) {
        analysis.riskFactors.push({
          factor: 'recently_registered_domain',
          severity: 'medium',
          description: 'Domain registered less than 90 days ago',
          evidence: `Registration date: ${analysis.whoisData.registrationDate} (${daysSinceRegistration} days ago)`
        });
      }
    }
    
    // Analyze privacy protection
    if (analysis.whoisData?.privacyProtection) {
      analysis.riskFactors.push({
        factor: 'privacy_protection',
        severity: 'low',
        description: 'Domain uses privacy protection (common but reduces transparency)',
        evidence: 'WHOIS privacy protection enabled'
      });
    }
    
    // Analyze certificate issuer
    if (analysis.certificates?.issuer === "Let's Encrypt") {
      analysis.riskFactors.push({
        factor: 'free_certificate',
        severity: 'low',
        description: 'Uses free SSL certificate (not inherently bad, but less validation)',
        evidence: `Certificate issued by: ${analysis.certificates.issuer}`
      });
    }
    
    // Analyze subdomain count (high count could indicate compromise)
    if (analysis.subdomains && analysis.subdomains.length > 50) {
      analysis.riskFactors.push({
        factor: 'excessive_subdomains',
        severity: 'medium',
        description: 'Unusually high number of subdomains detected',
        evidence: `${analysis.subdomains.length} subdomains found`
      });
    }
  }

  private analyzeIPRiskFactors(ip: string, analysis: OSINTAnalysis): void {
    if (!analysis.riskFactors) analysis.riskFactors = [];
    
    // Analyze geolocation risk
    const highRiskCountries = ['China', 'Russia', 'North Korea', 'Iran'];
    if (analysis.geolocation?.country && highRiskCountries.includes(analysis.geolocation.country)) {
      analysis.riskFactors.push({
        factor: 'high_risk_country',
        severity: 'medium',
        description: 'IP located in high-risk country',
        evidence: `Country: ${analysis.geolocation.country}`
      });
    }
    
    // Check for residential ISP patterns (could indicate compromised machines)
    const residentialISPs = ['Comcast', 'Verizon', 'AT&T', 'Charter'];
    if (analysis.geolocation?.isp && residentialISPs.some(isp => analysis.geolocation!.isp!.includes(isp))) {
      analysis.riskFactors.push({
        factor: 'residential_ip',
        severity: 'low',
        description: 'IP appears to be from residential ISP',
        evidence: `ISP: ${analysis.geolocation.isp}`
      });
    }
  }
}
