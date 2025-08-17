# 🎯 Smart Domain Categorization Guide

Automatically analyze and categorize domains into appropriate Cloudflare Gateway Lists with intelligent pattern matching and optional AI analysis.

## 🚀 Quick Start

### 1. Prepare Your Domains File

Create a text file with one domain per line:

```text
# domains.txt
github.com
api.github.com
slack.com
zoom.us
netflix.com
facebook.com
```

### 2. Run Categorization

```bash
# Basic categorization (pattern-based only)
npm run categorize-domains domains.txt

# With AI analysis (recommended)
npm run categorize-domains domains.txt --ai

# Dry run (preview without changes)
npm run categorize-domains domains.txt --ai --dry-run

# Save detailed results
npm run categorize-domains domains.txt --ai --output results.json
```

## 📊 What It Does

The smart categorizer:

1. **Pattern Recognition**: Uses pre-defined patterns to identify domain categories
2. **AI Enhancement**: Optionally uses Claude to analyze unknown domains
3. **Business Priority**: Assigns criticality levels (critical, important, normal, low)
4. **Gateway Lists**: Automatically creates or updates Cloudflare Gateway Lists
5. **Conflict Prevention**: Avoids duplicates and manages existing lists intelligently

## 🎯 Built-in Categories

### Critical Business Services
- **Development Tools**: GitHub, GitLab, Azure, AWS services
- **Communication Tools**: Slack, Teams, Zoom, Discord
- **Apple Services**: iCloud, App Store, iTunes, developer tools
- **Microsoft Services**: Office 365, Outlook, Teams, OneDrive
- **Google Services**: Gmail, Drive, Docs, Meet, APIs
- **Cloud Infrastructure**: AWS, GCP, Azure CDNs and services

### Normal Priority
- **E-commerce Sites**: Amazon, eBay, Shopify, payment services

### Low Priority  
- **Social Media**: Facebook, Instagram, Twitter, TikTok
- **Streaming Services**: Netflix, Spotify, YouTube, Twitch

## 📋 Command Options

| Option | Description | Example |
|--------|-------------|---------|
| `--ai` | Enable AI analysis for better categorization | `--ai` |
| `--dry-run` | Preview results without making changes | `--dry-run` |
| `--output <file>` | Save detailed results to JSON file | `--output results.json` |
| `--batch-size <n>` | Process domains in batches (default: 5) | `--batch-size 10` |

## 📂 Input File Format

```text
# This is a comment and will be ignored
github.com
api.github.com
*.github.io

# Microsoft services
teams.microsoft.com
outlook.office365.com

# Social media (comments help organize)
facebook.com
instagram.com
```

## 📄 Output Examples

### Console Output
```
📊 Domain Categorization Results:

● Development Tools Domains (CREATE)
   📋 Domains: 3
   🎯 Criticality: critical: 3
   🌐 Sample: github.com, api.github.com, gitlab.com

● Communication Tools (UPDATE)
   📋 Domains: 2
   🆔 List ID: abc123-def456-789
   🎯 Criticality: critical: 2
   🌐 Sample: slack.com, zoom.us

📈 Summary:
   Total domains categorized: 15
   Lists to create: 2
   Lists to update: 3
```

### JSON Output (with `--output`)
```json
{
  "timestamp": "2025-01-17T12:00:00Z",
  "summary": {
    "totalDomains": 15,
    "totalLists": 5,
    "newLists": 2,
    "updatedLists": 3
  },
  "assignments": [
    {
      "listName": "Development Tools Domains",
      "action": "create",
      "domainCount": 3,
      "domains": [
        {
          "domain": "github.com",
          "confidence": 1.0,
          "businessCriticality": "critical",
          "reasoning": "Matched patterns: github.com, *.github.io"
        }
      ]
    }
  ]
}
```

## 🔧 Advanced Usage

### Custom Categories

The categorizer uses intelligent pattern matching. To add custom patterns, you can modify the `categoryMappings` in `src/scripts/smart-domain-categorizer.ts`:

```typescript
{
  patterns: ['*.mycompany.com', 'internal.app'],
  keywords: ['internal', 'company', 'private'],
  listName: 'Internal Company Services',
  businessCriticality: 'critical',
  description: 'Internal company applications'
}
```

### AI Analysis Benefits

With `--ai` enabled:
- Better categorization of unknown domains
- Context-aware business criticality assessment
- Detailed reasoning for categorization decisions
- Enhanced pattern recognition

### Integration with Gateway Rules

After categorization, use the domains in rules:

```typescript
// Example: Create rules using the categorized lists
const rule = {
  name: 'Allow Development Tools',
  action: 'allow',
  traffic: 'dns.fqdn in $<development-tools-list-id>',
  precedence: 1000
};
```

## 🛡️ Safety Features

- **Dry Run Mode**: Preview changes before applying
- **Duplicate Prevention**: Avoids creating duplicate lists
- **Conflict Detection**: Handles existing lists intelligently  
- **Rate Limiting**: Respects API limits during batch processing
- **Backup Creation**: Maintains audit trail of changes

## 📈 Performance Benefits

Using categorized Gateway Lists provides:

- **Reduced Rule Complexity**: One list reference vs. many domain entries
- **Better Maintainability**: Update lists instead of individual rules
- **Character Savings**: Up to 90% reduction in rule length
- **Faster Processing**: Cloudflare processes lists more efficiently
- **Centralized Management**: One place to manage domain categories

## 🔍 Troubleshooting

### Common Issues

**"No domains found in input file"**
- Check file encoding (should be UTF-8)
- Ensure domains are on separate lines
- Remove Windows line endings if needed

**"AI analysis failed"**
- Check your ANTHROPIC_API_KEY is set
- Verify API key has sufficient credits
- The system will fall back to pattern matching

**"Gateway List creation failed"**
- Verify CLOUDFLARE_API_TOKEN permissions
- Check account has Gateway Lists feature enabled
- Ensure API token has "Cloudflare Gateway:Edit" permissions

### Debug Mode

For detailed logging:

```bash
DEBUG=* npm run categorize-domains domains.txt --ai --dry-run
```

## 💡 Best Practices

1. **Start with Dry Run**: Always preview changes first
2. **Use AI Analysis**: Enables better categorization of custom domains
3. **Organize Input Files**: Use comments to group related domains
4. **Regular Updates**: Re-run categorization as your domain list evolves
5. **Monitor Results**: Review the JSON output for accuracy
6. **Test Rules**: Verify Gateway rules work correctly after categorization

## 🔗 Integration Examples

### Automated Workflow
```bash
#!/bin/bash
# Extract domains from firewall logs
analyze-logs --extract-domains > new-domains.txt

# Categorize new domains
npm run categorize-domains new-domains.txt --ai --output categorization-results.json

# Apply to firewall rules
create-rules-from-lists categorization-results.json
```

### CI/CD Integration
```yaml
- name: Categorize Domains
  run: |
    npm run categorize-domains domains.txt --ai --dry-run --output results.json
    # Review results and apply if approved
```

This intelligent categorization system makes managing large numbers of domains effortless and ensures your Gateway Lists are organized, efficient, and maintainable.
