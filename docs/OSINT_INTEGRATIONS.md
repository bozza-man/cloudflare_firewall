# OSINT Integrations Documentation

## Overview

The Cloudflare Firewall project now includes comprehensive **Open Source Intelligence (OSINT)** capabilities that gather real-time threat intelligence data from multiple external sources. All previous simulated/mock data has been replaced with production-ready integrations.

## Features Implemented

### ✅ Real Data Sources (No Mock Data)

- **WHOIS Lookups**: RDAP protocol + system whois command fallback
- **DNS Resolution**: Node.js DNS APIs with multiple resolver fallbacks  
- **Certificate Transparency**: crt.sh API integration for certificate history
- **IP Geolocation**: Free tier services (ip-api.com, ipapi.co)
- **Reverse DNS**: PTR record lookups for IP addresses
- **Subdomain Enumeration**: Certificate transparency-based discovery
- **Business Intelligence**: Basic company data lookup with extensible API framework

### 🔧 Configuration Options

All OSINT features are configurable via environment variables:

```bash
# Enable/disable free services (default: enabled)
OSINT_ENABLE_FREE_SERVICES=true

# Performance tuning
OSINT_MAX_CONCURRENT=3          # Maximum concurrent requests
OSINT_RATE_LIMIT_MS=1000       # Delay between requests
OSINT_TIMEOUT_MS=10000         # Request timeout
OSINT_DNS_TIMEOUT_MS=5000      # DNS lookup timeout

# Feature toggles
OSINT_ENABLE_WHOIS=true        # WHOIS data collection
OSINT_ENABLE_DNS=true          # DNS record resolution  
OSINT_ENABLE_GEO=true          # IP geolocation
OSINT_ENABLE_CT=true           # Certificate transparency
OSINT_ENABLE_SUBDOMAINS=true   # Subdomain enumeration

# Premium API keys (optional)
WHOISXML_API_KEY=your_key      # WhoisXML API
SECURITYTRAILS_API_KEY=your_key # SecurityTrails API
CLEARBIT_API_KEY=your_key      # Clearbit business data
HUNTER_API_KEY=your_key        # Hunter.io email/business data
```

## Architecture

### OSINT Providers (`OSINTProviders` class)

Centralized service provider that implements:

- **Rate limiting**: Semaphore-based concurrency control
- **Error resilience**: Graceful fallbacks between services
- **Multi-source aggregation**: Combines data from multiple APIs
- **Performance optimization**: Parallel requests with configurable limits

### Threat Intelligence Client Integration

The `ThreatIntelligenceClient` now uses real OSINT data:

```typescript
// Before (disabled)
// result.osintAnalysis = await this.performOSINTAnalysis(domain);

// After (real data)
result.osintAnalysis = await this.performOSINTAnalysis(domain);
```

## Supported Data Types

### Domain Analysis
- **WHOIS Data**: Registrar, registration dates, nameservers, privacy protection
- **DNS Records**: A, AAAA, MX, TXT, CNAME, NS records
- **SSL Certificates**: Issuer, validity period, SANs, fingerprints
- **Subdomains**: Certificate transparency-based enumeration
- **Business Info**: Company name, industry, founding date
- **Risk Factors**: Age analysis, privacy patterns, certificate validation

### IP Analysis  
- **Geolocation**: Country, region, city, ISP, ASN information
- **Reverse DNS**: PTR records and hostname resolution
- **Risk Assessment**: Country-based risk, residential ISP detection
- **Network Information**: ASN details, organization data

## Risk Factor Analysis

The system automatically analyzes collected OSINT data for risk indicators:

### Domain Risk Factors
- **Newly Registered**: Domains < 30 days (HIGH), < 90 days (MEDIUM)
- **Privacy Protection**: WHOIS privacy enabled (LOW)
- **Free Certificates**: Let's Encrypt usage (LOW)
- **Excessive Subdomains**: >50 subdomains may indicate compromise (MEDIUM)

### IP Risk Factors  
- **High-Risk Countries**: China, Russia, North Korea, Iran (MEDIUM)
- **Residential ISP**: May indicate compromised home machines (LOW)

## API Integration Details

### Free Services (No API Key Required)

1. **RDAP Servers**: Modern WHOIS protocol
   - Verisign (.com/.net), PIR (.org), etc.
   - Structured JSON responses
   - Rate limits vary by registry

2. **Certificate Transparency (crt.sh)**
   - Historical certificate data
   - Subdomain discovery
   - Real-time certificate monitoring

3. **IP Geolocation (ip-api.com)**
   - 1000 requests/month free
   - Country, city, ISP, ASN data
   - Fallback to ipapi.co (1000/month)

4. **DNS Resolution (Node.js)**
   - System DNS with custom resolvers
   - Google (8.8.8.8), Cloudflare (1.1.1.1)
   - Built-in retry and timeout handling

### Premium Services (API Key Required)

1. **WhoisXML API**: Enhanced WHOIS data with historical records
2. **SecurityTrails**: DNS history, subdomain data, threat intelligence  
3. **Clearbit**: Business intelligence and company data
4. **Hunter.io**: Email finder and business verification

## Usage Examples

### Basic Domain Analysis
```javascript
import { ThreatIntelligenceClient } from './src/security/threat-intelligence-client.js';

const client = new ThreatIntelligenceClient();
const result = await client.scanDomain('example.com');

// Access OSINT data
console.log('WHOIS:', result.osintAnalysis.whoisData);
console.log('DNS:', result.osintAnalysis.dnsRecords);  
console.log('Certificates:', result.osintAnalysis.certificates);
console.log('Subdomains:', result.osintAnalysis.subdomains);
console.log('Risk Factors:', result.osintAnalysis.riskFactors);
```

### IP Analysis
```javascript
const result = await client.scanIP('8.8.8.8');

// Access IP OSINT data
console.log('Location:', result.osintAnalysis.geolocation);
console.log('Reverse DNS:', result.osintAnalysis.dnsRecords?.PTR);
console.log('Risk Factors:', result.osintAnalysis.riskFactors);
```

### Bulk Analysis
```javascript
const domains = ['google.com', 'github.com', 'example.com'];
const results = await client.bulkScan(domains, 2000); // 2s rate limit

results.forEach((result, domain) => {
  console.log(`${domain}: ${result.reputation} (${result.confidence})`);
});
```

## Testing

Run the included test script to verify OSINT integrations:

```bash
node test-osint-integration.js
```

This script tests:
- Domain OSINT analysis with real data sources
- IP OSINT analysis with geolocation and reverse DNS
- Error handling and fallback mechanisms  
- Risk factor identification and scoring

## Rate Limiting & Performance

### Recommended Settings
- **Max Concurrent**: 3-5 requests (avoid overwhelming free services)
- **Rate Limit**: 1000ms between requests (1 request/second)
- **Timeout**: 10s for HTTP requests, 5s for DNS
- **Batch Processing**: Process domains/IPs in small batches

### Performance Optimizations
- **Parallel Collection**: Multiple OSINT sources queried simultaneously
- **Intelligent Fallbacks**: Automatic failover between similar services
- **Cached Results**: Consider adding Redis/memory cache for repeated queries
- **Selective Analysis**: Disable unnecessary features via config toggles

## Error Handling

The system includes comprehensive error handling:

- **Network Failures**: Automatic fallbacks to alternative services
- **API Limits**: Graceful degradation when services are unavailable  
- **Invalid Responses**: Skip bad data while preserving successful results
- **Partial Analysis**: Continue processing even if some sources fail

## Security Considerations

- **API Keys**: Store in environment variables, never in code
- **Rate Limiting**: Respect service limits to avoid IP bans
- **Data Validation**: Sanitize all external API responses
- **Privacy**: Be aware of data collection and retention policies
- **Legal Compliance**: Ensure usage complies with service ToS and local laws

## Extending the System

### Adding New Data Sources

1. **Extend OSINTProviders class**:
```typescript
async getNewDataSource(domain: string): Promise<DataType> {
  // Implement API call with rate limiting
  return await this.rateLimitedRequest(() => 
    this.httpClient.get(`https://api.example.com/data/${domain}`)
  );
}
```

2. **Update configuration** in `config.ts`
3. **Add to analysis pipeline** in `performOSINTAnalysis()`
4. **Update risk factor analysis** as needed

### Custom Risk Rules

Modify `analyzeRiskFactors()` and `analyzeIPRiskFactors()` to add custom risk detection logic based on your specific threat model.

## Monitoring & Maintenance

- **API Quotas**: Monitor usage of paid services
- **Service Availability**: Track successful vs failed requests
- **Response Times**: Monitor performance and adjust timeouts
- **Data Quality**: Validate accuracy of collected intelligence
- **False Positives**: Tune risk factor thresholds based on feedback

## Support

For issues or questions about OSINT integrations:

1. Check service status pages for external APIs
2. Verify API keys and quotas
3. Review rate limiting configuration
4. Test with known-good domains/IPs
5. Enable debug logging for detailed troubleshooting
