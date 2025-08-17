# 🛡️ Security Scanning with Cloudflare Radar

This document covers the comprehensive security scanning capabilities integrated into the Cloudflare Gateway Firewall Manager. The security features use Cloudflare's Radar API and advanced threat intelligence to automatically validate domains and IPs before they are allowed in your Gateway rules.

## 🎯 Overview

The security scanning system provides:

- **Threat Intelligence Integration**: Uses Cloudflare Radar API for real-time reputation data
- **Automatic Security Validation**: Scans all domains/IPs during rule creation
- **Comprehensive Reporting**: Detailed security reports with threat analysis
- **Multiple Scanning Methods**: CLI commands, natural language interface, and programmatic API
- **Configurable Security Policies**: Customizable risk thresholds and actions

## 🚀 Quick Start

### 1. Basic Security Scan

```bash
# Scan all Gateway Rules and Lists for security issues
npm run security-scan scan

# Scan only Gateway Rules
npm run security-scan scan --type rules

# Scan only Gateway Lists
npm run security-scan scan --type lists
```

### 2. Domain Validation

```bash
# Validate specific domains
npm run security-scan validate github.com suspicious-site.com malware-domain.com

# Validate domains from a file
npm run security-scan validate --file my-domains.txt

# Verbose output with detailed threat information
npm run security-scan validate github.com --verbose
```

### 3. Threat Intelligence Lookup

```bash
# Look up threat intelligence for a specific domain
npm run security-scan lookup malicious-domain.com

# Detailed lookup with verbose output
npm run security-scan lookup suspicious-site.com --verbose

# Look up IP address reputation
npm run security-scan lookup 192.168.1.1
```

### 4. Natural Language Security Commands

```bash
# Security scanning through natural language
npm run secure-gateway "scan my gateway for security issues"
npm run secure-gateway "validate domain suspicious-site.com"
npm run secure-gateway "is malicious-domain.com safe?"
npm run secure-gateway "check my lists for malware"
```

## 📋 Available Commands

### Security Scan Command (`security-scan`)

The dedicated security scanning CLI provides comprehensive threat detection:

#### `security-scan scan`
Run security scans on your Gateway configuration.

**Options:**
- `--type <type>`: Scan type (rules, lists, both) [default: both]
- `--output <file>`: Save detailed report to file
- `--rate-limit <ms>`: Rate limit between API calls [default: 1000]
- `--confidence-threshold <0-1>`: Minimum confidence threshold [default: 0.7]
- `--allowed-risk-level <level>`: Maximum allowed risk level [default: medium]
- `--auto-block-malicious`: Automatically block malicious domains
- `--disable-threat-intelligence`: Disable threat intelligence checks
- `--require-manual-review`: Require manual review for suspicious domains
- `--verbose`: Verbose logging

**Examples:**
```bash
# Basic comprehensive scan
security-scan scan

# Scan with stricter security settings
security-scan scan --confidence-threshold 0.9 --allowed-risk-level low

# Scan with automatic blocking of malicious domains
security-scan scan --auto-block-malicious --require-manual-review

# Save detailed report
security-scan scan --output security-report-$(date +%Y%m%d).json
```

#### `security-scan validate`
Validate specific domains for security threats.

**Usage:**
```bash
security-scan validate [domains...] [options]
```

**Options:**
- `--file <file>`: Read domains from file (one per line)
- `--output <file>`: Save results to file
- `--rate-limit <ms>`: Rate limit between API calls [default: 500]
- `--confidence-threshold <0-1>`: Minimum confidence threshold [default: 0.7]
- `--verbose`: Show detailed results

**Examples:**
```bash
# Validate multiple domains
security-scan validate github.com google.com suspicious-site.com

# Validate from file with detailed output
security-scan validate --file domains.txt --verbose --output validation-report.json

# Fast validation with lower rate limiting
security-scan validate example.com --rate-limit 100
```

#### `security-scan lookup`
Look up threat intelligence for a domain or IP.

**Usage:**
```bash
security-scan lookup <target> [options]
```

**Options:**
- `--verbose`: Show detailed threat information and raw data

**Examples:**
```bash
# Basic lookup
security-scan lookup malicious-domain.com

# Detailed lookup with all available data
security-scan lookup suspicious-site.com --verbose

# IP address lookup
security-scan lookup 192.168.1.100
```

#### `security-scan config`
Show security scanning configuration and options.

#### `security-scan health`
Check the health of security scanning services.

#### `security-scan stats`
Show Gateway security statistics.

**Options:**
- `--detailed`: Show detailed statistics

### Secure Natural Language Interface (`secure-gateway`)

The enhanced natural language interface includes automatic security validation:

**Security-focused Commands:**
```bash
# Comprehensive security scans
npm run secure-gateway "scan my gateway for security issues"
npm run secure-gateway "run a security audit on my rules"
npm run secure-gateway "check my lists for malware"

# Domain validation
npm run secure-gateway "validate domain suspicious-site.com"
npm run secure-gateway "is malicious-domain.com safe?"
npm run secure-gateway "check domain reputation for example.com"

# Security configuration
npm run secure-gateway "security configuration"
npm run secure-gateway "show security settings"

# Rule creation with security validation
npm run secure-gateway "block malicious-site.com"
npm run secure-gateway "allow github.com with security check"
```

## 🔧 Configuration

### Security Scan Options

The security scanning system supports various configuration options:

#### Threat Intelligence Settings
- **`enableThreatIntelligence`**: Enable/disable Cloudflare Radar integration
- **`confidenceThreshold`**: Minimum confidence level (0-1) for threat detection
- **`rateLimitMs`**: Delay between API calls to avoid rate limiting

#### Security Policy Settings
- **`autoBlockMalicious`**: Automatically block domains identified as malicious
- **`requireManualReview`**: Require human approval for suspicious domains
- **`allowedRiskLevel`**: Maximum acceptable risk level (low/medium/high)

#### Reporting Settings
- **`outputFile`**: Save detailed reports to specified file
- **`verbose`**: Enable detailed logging and output

### Environment Variables

Ensure these environment variables are set:

```bash
# Required for Cloudflare API access
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Optional: Configure additional threat intelligence sources
# (Reserved for future use)
VIRUSTOTAL_API_KEY=your_virustotal_key
URLVOID_API_KEY=your_urlvoid_key
```

### Configuration File Example

Create a `security-config.json` file:

```json
{
  "threatIntelligence": {
    "enabled": true,
    "confidenceThreshold": 0.8,
    "sources": ["radar", "dns_blacklists", "pattern_analysis"]
  },
  "securityPolicy": {
    "autoBlockMalicious": false,
    "requireManualReview": true,
    "allowedRiskLevel": "medium",
    "blockNewDomains": false
  },
  "rateLimit": {
    "apiCallDelayMs": 1000,
    "bulkScanBatchSize": 10,
    "maxConcurrentRequests": 5
  },
  "reporting": {
    "saveReports": true,
    "reportDirectory": "./security-reports",
    "detailedLogging": false
  }
}
```

## 🎨 Integration Examples

### 1. Automated Security Validation in Rule Creation

```typescript
import { SecureGatewayRuleManager } from './src/rules/secure-gateway-rule-manager.js';

const ruleManager = new SecureGatewayRuleManager();

// Configure security options
ruleManager.setSecurityScanOptions({
  enableThreatIntelligence: true,
  autoBlockMalicious: true,
  confidenceThreshold: 0.8,
  allowedRiskLevel: 'low'
});

// Create rule with automatic security validation
const rule = await ruleManager.createRule({
  name: 'Block Suspicious Sites',
  action: 'block',
  filters: ['dns.fqdn == "suspicious-domain.com"'],
  description: 'Block suspicious domains with security validation'
});
```

### 2. Bulk Domain Validation

```typescript
import { SecurityScanner } from './src/security/security-scanner.js';

const scanner = new SecurityScanner();

const domains = ['github.com', 'google.com', 'suspicious-site.com'];
const report = await scanner.bulkValidate(domains, {
  enableThreatIntelligence: true,
  rateLimitMs: 500,
  outputFile: 'security-report.json'
});

console.log(`Scanned ${report.summary.totalScanned} domains:`);
console.log(`✅ Safe: ${report.summary.allowed}`);
console.log(`❌ Blocked: ${report.summary.blocked}`);
console.log(`⚠️  Review: ${report.summary.requireReview}`);
```

### 3. Threat Intelligence Lookup

```typescript
import { ThreatIntelligenceClient } from './src/security/threat-intelligence-client.js';

const threatClient = new ThreatIntelligenceClient();

// Scan a domain for threats
const result = await threatClient.scanDomain('suspicious-domain.com');

console.log(`Reputation: ${result.reputation}`);
console.log(`Confidence: ${Math.round(result.confidence * 100)}%`);
console.log(`Recommendation: ${result.allowRecommendation}`);

if (result.threats.length > 0) {
  console.log('Threats detected:');
  result.threats.forEach(threat => {
    console.log(`- ${threat.type}: ${threat.description}`);
  });
}
```

### 4. Gateway Security Audit

```typescript
import { SecureGatewayRuleManager } from './src/rules/secure-gateway-rule-manager.js';

const ruleManager = new SecureGatewayRuleManager();

// Run comprehensive security scan
await ruleManager.runSecurityScan({
  scanType: 'both', // Scan both rules and lists
  securityOptions: {
    enableThreatIntelligence: true,
    confidenceThreshold: 0.7,
    outputFile: `security-audit-${Date.now()}.json`
  }
});
```

## 📊 Understanding Security Reports

### Threat Intelligence Result Structure

```typescript
interface ThreatIntelligenceResult {
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
    popularity?: number;
    ageInDays?: number;
  };
  recommendations: string[];
  allowRecommendation: 'allow' | 'block' | 'caution';
}
```

### Security Validation Result

```typescript
interface SecurityValidationResult {
  item: string;
  type: 'domain' | 'ip';
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  action: 'allow' | 'block' | 'review';
  threatIntelligence?: ThreatIntelligenceResult;
  reasons: string[];
  recommendations: string[];
}
```

### Security Scan Report

```typescript
interface SecurityScanReport {
  summary: {
    totalScanned: number;
    allowed: number;
    blocked: number;
    requireReview: number;
    scanDuration: number;
    timestamp: string;
  };
  results: SecurityValidationResult[];
  riskBreakdown: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  threatTypes: Map<string, number>;
  recommendations: string[];
}
```

## 🚨 Threat Types and Severity Levels

### Threat Types
- **`malware`**: Known malicious software distribution
- **`phishing`**: Phishing and credential theft attempts
- **`botnet`**: Command and control infrastructure
- **`spam`**: Spam and unsolicited communications
- **`adult`**: Adult or inappropriate content
- **`suspicious`**: General suspicious activity
- **`newly_registered`**: Recently registered domains (potential risk)

### Severity Levels
- **`critical`**: Immediate threat requiring blocking
- **`high`**: Significant threat, should be blocked
- **`medium`**: Moderate threat, requires review
- **`low`**: Minor threat, monitoring recommended

### Risk Levels
- **`low`**: Generally safe, minimal concerns
- **`medium`**: Some risk factors present
- **`high`**: Multiple risk factors, caution advised
- **`critical`**: Severe risk, should be blocked

## 🔍 Troubleshooting

### Common Issues

#### 1. API Rate Limiting
```
Error: Too Many Requests (429)
```

**Solution:** Increase the rate limit delay:
```bash
security-scan scan --rate-limit 2000
```

#### 2. Insufficient API Permissions
```
Error: Cloudflare API Error: Insufficient permissions
```

**Solution:** Ensure your API token has the following permissions:
- Account: Cloudflare Tunnel:Read
- Zone: Zone Settings:Read, Zone:Read, DNS:Read
- Account: Zero Trust Navigation:Read, Access: Apps and Policies:Read

#### 3. Radar API Access Limited
```
Warning: Radar API access limited (may require higher plan)
```

**Note:** Some Cloudflare Radar features require higher-tier plans. Basic threat intelligence still works with limited access.

#### 4. Domain Validation Failures
```
Error: Domain validation failed for suspicious-domain.com
```

**Solution:** Check domain format and network connectivity. Use verbose mode for detailed error information:
```bash
security-scan validate suspicious-domain.com --verbose
```

### Health Check

Run the health check to diagnose issues:

```bash
security-scan health
```

This will test:
- ✅ Cloudflare API connectivity
- ✅ Cloudflare Radar access  
- ✅ Gateway API access
- ✅ DNS resolution

## 📈 Best Practices

### 1. Regular Security Scans
- Run weekly comprehensive scans of all Gateway Lists
- Schedule monthly full audits of rules and lists
- Set up automated scanning for new domain additions

### 2. Risk Management
- Use `medium` risk level for most environments
- Enable `autoBlockMalicious` for high-security environments  
- Require manual review for critical infrastructure changes

### 3. Threat Intelligence
- Keep confidence threshold at 0.7 or higher
- Review flagged domains promptly
- Maintain an allowlist for known good domains

### 4. Monitoring and Reporting
- Save detailed reports for compliance
- Monitor threat trend analysis
- Track false positives and tune accordingly

### 5. Integration Workflow
```bash
# 1. Validate new domains before adding
security-scan validate new-domain.com

# 2. Create rules with automatic security validation
npm run secure-gateway "allow new-domain.com"

# 3. Regular security audits
security-scan scan --output monthly-audit-$(date +%Y%m).json

# 4. Review and remediate findings
# (Manual process based on report recommendations)
```

## 🔮 Future Enhancements

### Planned Features
- **Additional Threat Intelligence Sources**: Integration with VirusTotal, URLVoid, and other services
- **Machine Learning Models**: Custom ML models for domain classification
- **Real-time Monitoring**: Continuous monitoring of Gateway traffic for threats
- **Advanced Analytics**: Threat trend analysis and predictive security
- **Automated Response**: Automatic rule creation for detected threats

### API Extensions
- **Webhook Integration**: Real-time threat notifications
- **Custom Threat Feeds**: Import custom threat intelligence
- **Security Metrics API**: Programmatic access to security statistics
- **Threat Hunting Tools**: Advanced search and investigation capabilities

## 📞 Support

For questions, issues, or feature requests related to security scanning:

1. **Documentation**: Review this guide and the main README
2. **Health Check**: Run `security-scan health` to diagnose issues
3. **Verbose Logging**: Use `--verbose` flags for detailed error information
4. **Configuration**: Verify your environment variables and API tokens

## 🏷️ Version History

- **v1.0.0**: Initial security scanning implementation
  - Cloudflare Radar integration
  - Domain and IP validation
  - Comprehensive reporting
  - CLI and natural language interfaces
  - Automatic rule validation

---

The security scanning system provides comprehensive protection for your Cloudflare Gateway configuration, ensuring that only safe and trusted domains and IPs are allowed in your network security rules.
