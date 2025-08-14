# Cloudflare Zero Trust Gateway Manager

An intelligent CLI tool for managing Cloudflare Zero Trust Gateway rules with AI-powered conflict detection, rule optimization, and natural language rule generation.

## Features

- **AI-Powered Conflict Detection**: Analyzes new rules against existing ones to detect conflicts and overlaps
- **Smart Rule Precedence**: Automatically suggests optimal rule ordering based on specificity and best practices
- **Natural Language Rule Generation**: Create rules from plain English descriptions
- **Filter Validation & Optimization**: AI validates and optimizes filter expressions
- **Rule Explanation**: Get plain-English explanations of complex Gateway rules
- **Comprehensive Rule Analysis**: Analyze your entire ruleset for conflicts, redundancies, and optimization opportunities
- **Automated Rule Optimization**: Apply AI-recommended improvements with a single command
- **Comprehensive Management**: Manage rules, lists, categories, and locations

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

3. Build the project:
```bash
npm run build
```

## Configuration

You need to set the following environment variables in your `.env` file:

- `CLOUDFLARE_API_TOKEN`: Your Cloudflare API token with Zero Trust permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID
- `ANTHROPIC_API_KEY`: Your Anthropic API key for AI features

### Getting your Cloudflare Account ID
1. Log in to Cloudflare dashboard
2. Select your account
3. The account ID is shown in the right sidebar

### Required API Token Permissions
Your Cloudflare API token needs these permissions:
- Account: Zero Trust: Gateway - Read/Edit

## Usage

### Rules Management

#### List all Gateway rules
```bash
npm start -- rules list
npm start -- rules list --verbose  # Show detailed information
```

#### Create a rule from natural language
```bash
npm start -- rules create --description "block all social media sites"
```

#### Create a rule manually
```bash
# Interactive mode
npm start -- rules create --interactive

# Direct mode
npm start -- rules create \
  --name "Block malicious domains" \
  --filters "example.com in dns.domains" \
  --action block \
  --traffic dns
```

#### Update a rule
```bash
npm start -- rules update <rule-id> \
  --name "Updated rule name" \
  --action allow
```

#### Delete a rule
```bash
npm start -- rules delete <rule-id>
npm start -- rules delete <rule-id> --force  # Skip confirmation
```

#### Explain a rule
```bash
npm start -- rules explain <rule-id>
```

#### Analyze and optimize all rules
```bash
# View analysis and recommendations
npm start -- rules analyze

# Automatically apply all recommended optimizations
npm start -- rules analyze --auto-fix

# Preview changes without applying them
npm start -- rules analyze --dry-run

# Interactively approve each change
npm start -- rules analyze --interactive
```

### Lists, Categories, and Locations

#### View Gateway lists
```bash
npm start -- lists list
```

#### View content/security categories
```bash
npm start -- categories
npm start -- categories --class security  # Filter by class
```

#### View Gateway locations
```bash
npm start -- locations
```

## How It Works

### Conflict Detection & Resolution
When creating or updating rules, the AI:
1. Analyzes filter expressions for overlaps with existing rules
2. Checks for contradictory actions on similar traffic
3. Identifies precedence issues where rules might never be evaluated
4. Detects redundant rules
5. Provides interactive resolution options

**New: Smart Conflict Resolution**
Instead of just warning about conflicts, the app now offers intelligent solutions:
- **Modify Existing Rule**: Remove conflicting domains/IPs from existing rules
- **Create Adjusted Rule**: Create the new rule with modified filters
- **Merge Rules**: Combine similar rules into one
- **Reorder Rules**: Adjust precedence to resolve conflicts
- **Skip Creation**: Cancel if the rule is redundant

### Rule Precedence
Gateway evaluates rules from lowest to highest precedence. The AI considers:
- More specific filters should have lower precedence (evaluated first)
- Block/isolate actions typically come before allow
- Identity-based rules often precede general rules
- Security bypass rules must be specific and early

### Natural Language Processing
Describe what you want to block/allow in plain English:
```bash
$ npm start -- rules create -d "block access to gambling and adult content"

Generated filters:
  - "gambling" in dns.content_categories
  - "adult_content" in dns.content_categories
```

### Example Workflow

1. **Creating a rule with smart conflict resolution:**
```bash
$ npm start -- rules create -d "allow snapchat for marketing team"

⚠️  Potential Conflicts Detected:

1. [HIGH] Block Social Media Platforms
   Existing rule blocks social media including Snapchat
   Suggestion: Remove Snapchat from the block list to allow specific access

📋 Resolution Options:

✅ Remove "snapchat.com" from "Block Social Media Platforms" rule (modify "Block Social Media Platforms")
     Remove: snapchat.com, cdn.snapchat.com, app.snapchat.com

🔄 Create new allow rule with higher precedence
     This will override the block for Snapchat specifically

⚠️ Merge into existing social media rule
     Combine both rules with exceptions

❌ Cancel - Do not create or modify any rules

How would you like to resolve these conflicts? > Remove "snapchat.com" from block rule

✓ Existing rules modified successfully
```

2. **Natural language rule creation:**
```bash
$ npm start -- rules create -d "block all torrent and P2P traffic"

Generated filters: Block BitTorrent and P2P protocols
  - "bittorrent" in app.ids
  - net.dst.port in {6881..6889}

Enter a name for this rule: Block P2P Traffic
Select the action: block
Create this rule? Yes

✓ Rule created successfully!
```

### Rule Analysis & Optimization

The `analyze` command performs comprehensive analysis of your entire ruleset:

```bash
$ npm start -- rules analyze

📊 Gateway Rules Analysis Report

📈 Statistics:
   Total Rules: 25
   Enabled: 20 | Disabled: 5
   
   By Traffic Type:
     dns: 15
     http: 8
     l4: 2

⚠️  Issues Found:

   🔴 Errors (3):
      Block Social Media
      Conflicting actions with rule "Allow Facebook for Marketing"
      → Review precedence order or consolidate rules

   🟡 Warnings (5):
      Allow All Traffic
      Allow rule may be too permissive
      → Consider adding more specific conditions

💡 Optimization Suggestions:
   1. Found 4 groups of similar rules that could be consolidated
   2. Consider using content/security categories instead of individual domain rules
   3. You have 5 disabled rules. Consider removing unused rules to maintain clarity

🔄 Proposed Rule Reordering:
   ↑ Block Malware Sites
      Current precedence: 5000 → Suggested: 1000
      Reason: Security rules should be evaluated first
```

Apply optimizations automatically:
```bash
# Apply all recommendations
npm start -- rules analyze --auto-fix

# Preview changes first
npm start -- rules analyze --dry-run

# Choose which changes to apply
npm start -- rules analyze --interactive
```

## Gateway Rule Types

### HTTP Rules
Filter web traffic based on:
- `http.request.host` - Domain names
- `http.request.uri.path` - URL paths
- `http.request.method` - HTTP methods

### DNS Rules
Filter DNS queries based on:
- `dns.domain` - Specific domains
- `dns.content_categories` - Content categories (gambling, social media, etc.)
- `dns.security_categories` - Security threats (malware, phishing, etc.)

### Network (L4) Rules
Filter network traffic based on:
- `net.dst.ip` - Destination IP addresses
- `net.dst.port` - Destination ports
- `net.protocol` - Network protocols

### Application Rules
Filter based on detected applications:
- `app.ids` - Specific application IDs

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run linting
npm run lint

# Run type checking
npm run typecheck
```

## Security Best Practices

- Always review AI-suggested rules before applying
- Test rules in report-only mode first when possible
- Use specific filters to avoid unintended blocks
- Regularly review and audit your Gateway rules
- Keep precedence values organized and documented

## Troubleshooting

### Common Issues

1. **"Invalid filter expression"**
   - Check filter syntax matches Gateway documentation
   - Use the AI to validate and optimize filters

2. **"Rule never evaluated"**
   - Check precedence ordering
   - Look for broader rules that might match first

3. **"Unexpected blocks"**
   - Review rule precedence
   - Check for overlapping filters
   - Use the explain command to understand rule behavior

## License

MIT