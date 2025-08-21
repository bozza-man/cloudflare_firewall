# Cloudflare Firewall Manager - Command Reference

## 🚀 Quick Start

Your firewall manager is now available as a REST API at:
```
https://cloudflare-firewall-manager.bruteforce.workers.dev
```

## 📋 Available Commands

### 1. Health Check
Check if the system is operational:
```bash
curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "ai": true,
    "database": true,
    "storage": true,
    "cache": true
  },
  "timestamp": "2025-08-20T14:29:07.105Z"
}
```

---

### 2. Generate Rule from Natural Language
Create a firewall rule using plain English description:

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Block all social media websites",
    "context": {}
  }'
```

**More Examples:**
```bash
# Block gambling sites
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "Block all gambling and casino websites"}'

# Allow specific work tools
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "Allow access to Slack, Teams, and Zoom for remote work"}'

# Block malware domains
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "Block known malware and phishing domains"}'
```

---

### 3. Analyze Rule Conflicts
Check if a new rule conflicts with existing rules:

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "newRule": {
      "name": "Block Facebook",
      "filters": ["facebook.com", "*.facebook.com"],
      "action": "block",
      "traffic": "dns"
    },
    "existingRules": [
      {
        "id": "rule-1",
        "name": "Allow Social Media for Marketing",
        "filters": ["facebook.com", "twitter.com"],
        "action": "allow",
        "traffic": "dns",
        "precedence": 1
      }
    ]
  }'
```

**Response:**
```json
{
  "conflicts": [
    {
      "conflictingRule": {...},
      "reason": "Rules have conflicting actions for facebook.com",
      "severity": "high",
      "suggestion": "Adjust precedence or merge rules"
    }
  ],
  "resolutions": [
    {
      "type": "modify_existing",
      "description": "Remove facebook.com from Allow rule",
      "recommendation": "recommended"
    }
  ]
}
```

---

### 4. Optimize Ruleset
Analyze and optimize a set of rules:

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "id": "1",
        "name": "Block Facebook",
        "filters": ["facebook.com"],
        "action": "block"
      },
      {
        "id": "2", 
        "name": "Block Meta",
        "filters": ["facebook.com", "instagram.com"],
        "action": "block"
      }
    ]
  }'
```

---

### 5. Create Backup
Backup your current rules to R2 storage:

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/backup \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {"id": "1", "name": "Block Malware", "action": "block", "filters": ["malware.com"]},
      {"id": "2", "name": "Allow Work Sites", "action": "allow", "filters": ["slack.com"]}
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "backupKey": "backups/rules-2025-08-20T14:29:47.939Z.json",
  "timestamp": "2025-08-20T14:29:47.939Z"
}
```

---

### 6. Restore from Backup
Restore rules from a previous backup:

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/restore \
  -H "Content-Type: application/json" \
  -d '{
    "backupKey": "backups/rules-2025-08-20T14:29:47.939Z.json"
  }'
```

---

### 7. Search Similar Rules
Find rules similar to a description (when Vectorize is enabled):

```bash
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "block social media",
    "limit": 5
  }'
```

---

## 🛠️ Advanced Usage

### Using with jq for Pretty Output
```bash
# Pretty print JSON responses
curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health | jq '.'

# Extract specific fields
curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health | jq '.services'
```

### Save Response to File
```bash
# Save backup info
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/backup \
  -H "Content-Type: application/json" \
  -d '{"rules": [...]}' \
  -o backup-info.json
```

### Using Environment Variables
```bash
# Set base URL
export FIREWALL_API="https://cloudflare-firewall-manager.bruteforce.workers.dev"

# Use in commands
curl $FIREWALL_API/health
```

### Create Shell Functions
Add to your `.zshrc` or `.bashrc`:

```bash
# Firewall manager functions
fw-health() {
  curl -s https://cloudflare-firewall-manager.bruteforce.workers.dev/health | jq '.'
}

fw-generate() {
  curl -s -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"description\": \"$1\"}" | jq '.'
}

fw-backup() {
  curl -s -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/backup \
    -H "Content-Type: application/json" \
    -d "$1" | jq '.'
}

# Usage:
# fw-health
# fw-generate "block all adult content"
# fw-backup '{"rules": [...]}'
```

---

## 🔍 Monitoring & Debugging

### View Live Logs
```bash
npx wrangler tail cloudflare-firewall-manager --config wrangler.deploy.toml
```

### Check Worker Status
```bash
npx wrangler deployments list --config wrangler.deploy.toml
```

### Test with Verbose Output
```bash
curl -v https://cloudflare-firewall-manager.bruteforce.workers.dev/health
```

---

## 📊 Example Workflows

### Complete Rule Creation Workflow
```bash
# 1. Generate a rule from description
RULE=$(curl -s -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "Block adult content"}')

echo "Generated rule: $RULE"

# 2. Check for conflicts
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/analyze \
  -H "Content-Type: application/json" \
  -d "{
    \"newRule\": $RULE,
    \"existingRules\": [...]
  }"

# 3. Create backup before applying
curl -X POST https://cloudflare-firewall-manager.bruteforce.workers.dev/api/backup \
  -H "Content-Type: application/json" \
  -d '{"rules": [...]}'
```

### Batch Operations Script
```bash
#!/bin/bash
# batch-block-sites.sh

SITES=("gambling.com" "casino.com" "poker.com")
API="https://cloudflare-firewall-manager.bruteforce.workers.dev"

for site in "${SITES[@]}"; do
  echo "Creating rule for $site..."
  curl -X POST $API/api/generate \
    -H "Content-Type: application/json" \
    -d "{\"description\": \"Block $site\"}"
  sleep 1
done
```

---

## 🔐 Using with Authentication (if configured)

If authentication is enabled, add the Authorization header:

```bash
curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🌍 Global Edge Locations

Your API is available from 300+ Cloudflare edge locations worldwide. The nearest location is automatically selected for lowest latency.

---

## 📈 Performance Tips

1. **Use caching**: Responses are cached for 1 hour by default
2. **Batch operations**: Send multiple rules in one request when possible
3. **Use compression**: Add `-H "Accept-Encoding: gzip"` for large responses
4. **Regional endpoints**: The API automatically routes to the nearest edge location

---

## 🆘 Troubleshooting

### DNS Resolution Issues
```bash
# If DNS is blocked, use direct IP
curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health \
  --resolve cloudflare-firewall-manager.bruteforce.workers.dev:443:172.67.172.92
```

### Connection Timeouts
```bash
# Increase timeout
curl --max-time 30 https://cloudflare-firewall-manager.bruteforce.workers.dev/health
```

### Debug Headers
```bash
# See all headers
curl -I https://cloudflare-firewall-manager.bruteforce.workers.dev/health
```

---

## 📚 Additional Resources

- **Dashboard**: https://dash.cloudflare.com/0b0ee2b5eaf1fb8a2612e40ab6488052/workers
- **API Docs**: See this file
- **Support**: File issues in the GitHub repository

---

## 🎯 Quick Reference Card

| Operation | Method | Endpoint | Purpose |
|-----------|--------|----------|---------|
| Health Check | GET | `/health` | Check system status |
| Generate Rule | POST | `/api/generate` | Create rule from text |
| Analyze Conflicts | POST | `/api/analyze` | Check for conflicts |
| Optimize Rules | POST | `/api/optimize` | Optimize ruleset |
| Backup Rules | POST | `/api/backup` | Save to R2 |
| Restore Rules | POST | `/api/restore` | Load from R2 |
| Search Rules | POST | `/api/search` | Find similar rules |

---

Last Updated: 2025-08-20
