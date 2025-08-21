# MCP (Model Context Protocol) Integration

This project now includes integration with Cloudflare's MCP servers for enhanced observability and monitoring capabilities.

## 🔌 What is MCP?

Model Context Protocol (MCP) is a standardized protocol for managing context between large language models (LLMs) and external systems. Cloudflare provides several MCP servers that allow you to interact with their services through natural language and structured tools.

## 📋 Available MCP Servers

The following Cloudflare MCP servers are configured for use with this project:

- **Observability** (`https://observability.mcp.cloudflare.com/sse`) - Query logs and metrics
- **Audit Logs** (`https://auditlogs.mcp.cloudflare.com/sse`) - Track Gateway changes  
- **Browser Rendering** (`https://browser.mcp.cloudflare.com/sse`) - Test blocked sites
- **DNS Analytics** (`https://dns-analytics.mcp.cloudflare.com/sse`) - Analyze DNS performance
- **AI Gateway** (`https://ai-gateway.mcp.cloudflare.com/sse`) - Manage AI logs
- **Workers Bindings** (`https://bindings.mcp.cloudflare.com/sse`) - Manage KV, R2, D1 resources
- **Radar** (`https://radar.mcp.cloudflare.com/sse`) - Internet traffic insights
- **Documentation** (`https://docs.mcp.cloudflare.com/sse`) - Access Cloudflare docs

## 🚀 Quick Start

### Prerequisites

1. Install mcp-remote globally (already done):
```bash
npm install -g mcp-remote
```

2. Set up environment variables in `.env`:
```env
CLOUDFLARE_ACCOUNT_ID=0b0ee2b5eaf1fb8a2612e40ab6488052
CLOUDFLARE_ZONE_ID=7249ad638510c628a7861d93535acbca  # Optional
MCP_ENABLED=true  # Enable MCP integration
```

### Using MCP Commands

#### Test MCP Connections
```bash
npm start -- mcp test
```
This tests connectivity to MCP servers. Note: OAuth authentication may be required.

#### Analyze Rule Effectiveness
```bash
npm start -- mcp effectiveness
```
Uses MCP observability to analyze Gateway rule effectiveness with real traffic data.

#### View MCP Information
```bash
npm start -- mcp info
```
Displays MCP configuration and available servers.

#### Enhanced Rule Analysis with MCP
```bash
npm start -- rules analyze --with-mcp
```
Analyzes rules using both AI and MCP observability data for comprehensive optimization suggestions.

## 🔐 Authentication

MCP servers use OAuth authentication through Cloudflare. When you first connect:

1. A browser window will open for authentication
2. Log in to your Cloudflare account
3. Grant the necessary permissions
4. The token will be stored for future use

**Note**: If authentication fails, you may need to:
- Ensure you have the necessary permissions in your Cloudflare account
- Check that your account ID is correctly configured
- Try authenticating directly through your browser

## 📁 MCP Configuration Files

### Warp Terminal Configuration
The `.mcp/config.json` file configures MCP servers for use in Warp terminal with AI features.

### Project Integration
MCP integration code is located in:
- `src/mcp/mcp-client.ts` - MCP client implementation
- `src/mcp/mcp-service.ts` - Service layer for MCP operations
- `src/rules/enhanced-rule-optimizer.ts` - Rule optimizer with MCP metrics
- `src/cli/mcp-commands-simple.ts` - CLI commands for MCP operations

## 🎯 Use Cases

### 1. Rule Effectiveness Analysis
Analyze which Gateway rules are actually being triggered in production:
```bash
npm start -- mcp effectiveness --time 7d
```

### 2. Audit Trail Review
Track changes to Gateway rules over time:
```bash
npm start -- rules analyze --with-mcp
```
The analyzer will fetch audit logs showing recent rule modifications.

### 3. Test Blocked Sites
Verify that blocked sites are actually being blocked:
```bash
# Future implementation
npm start -- mcp test-block https://example.com
```

### 4. Performance Monitoring
Monitor Gateway performance metrics:
```bash
# Uses MCP observability for real-time metrics
npm start -- monitor
```

## 🛠️ Troubleshooting

### MCP Connection Failed
If you see "MCP connection failed" errors:

1. **Check mcp-remote installation**:
   ```bash
   npm list -g mcp-remote
   ```

2. **Verify environment variables**:
   ```bash
   npm start -- mcp info
   ```

3. **Test OAuth authentication**:
   - MCP servers require OAuth, not API tokens
   - You may need to authenticate through your browser
   - Ensure you have Zero Trust permissions in Cloudflare

### Limited Functionality
Some MCP features require specific Cloudflare plan features:
- Observability requires Workers analytics
- Audit logs require Enterprise features
- Browser rendering requires Browser Isolation

### Fallback Mode
If MCP servers are unavailable, the application will:
- Continue with static analysis for rule optimization
- Use traditional API calls for Gateway management
- Show a warning but continue operation

## 📚 Additional Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Cloudflare MCP Servers GitHub](https://github.com/cloudflare/mcp-server-cloudflare)
- [Cloudflare Zero Trust Documentation](https://developers.cloudflare.com/cloudflare-one/)

## 🔄 Updates

The MCP integration is actively maintained. To update:

1. Update mcp-remote:
   ```bash
   npm update -g mcp-remote
   ```

2. Update project dependencies:
   ```bash
   npm update @modelcontextprotocol/sdk
   ```

3. Check for new MCP servers:
   ```bash
   npm start -- mcp info
   ```

## 📝 Notes

- MCP servers are hosted by Cloudflare and require internet connectivity
- OAuth tokens are managed by the MCP servers, not stored locally
- Some features may require specific Cloudflare plan levels
- The integration gracefully falls back to traditional methods if MCP is unavailable
