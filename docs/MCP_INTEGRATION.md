# MCP (Model Context Protocol) Integration

## Overview

This project integrates with Cloudflare's MCP servers to provide enhanced threat intelligence and API access through a standardized protocol. MCP servers run automatically in the background when needed, providing seamless fallback to direct API calls when unavailable.

## Features

### 🚀 Automatic Background Operation
- MCP servers start automatically when first needed
- No interactive prompts or browser windows
- Silent operation with optional debug logging
- Automatic cleanup on process exit

### 🔄 Intelligent Fallback
- Primary: MCP server connection
- Fallback: Direct Cloudflare API calls
- Transparent operation - calling code doesn't need to know which method is used

### 🏥 Self-Healing
- Automatic reconnection on failure
- Exponential backoff retry logic
- Health checks every 30 seconds
- Process monitoring and restart

## Currently Integrated MCP Servers

### 1. Cloudflare Radar MCP Server
- **Endpoint**: `https://radar.mcp.cloudflare.com/sse`
- **Features**:
  - Domain ranking and categorization
  - IP address intelligence
  - AS (Autonomous System) information
  - URL security scanning
  - Traffic anomaly detection
  - Attack data analysis

## Configuration

### Environment Variables

```bash
# Enable/disable MCP integration (default: true)
MCP_ENABLED=true

# Run in background mode (default: true)
MCP_BACKGROUND=true

# Enable debug logging
DEBUG_MCP=false

# Connection timeout in milliseconds (default: 10000)
MCP_TIMEOUT=10000

# Maximum retry attempts (default: 3)
MCP_MAX_RETRIES=3

# Health check interval in milliseconds (default: 30000)
MCP_HEALTH_CHECK_INTERVAL=30000

# OAuth token for authentication (optional)
MCP_AUTH_TOKEN=your_token_here

# Skip browser-based authentication (default: true)
MCP_SKIP_BROWSER_AUTH=true
```

### Configuration File

You can also configure MCP behavior in `mcp-config.json`:

```json
{
  "mcpServers": {
    "cloudflare-radar": {
      "command": "npx",
      "args": ["mcp-remote", "https://radar.mcp.cloudflare.com/sse"],
      "env": {}
    }
  }
}
```

## Usage

### Automatic Usage

MCP integration works automatically with existing threat intelligence features:

```typescript
// The enhanced radar client automatically tries MCP first
import { enhancedRadarClient } from './src/security/enhanced-radar-client.js';

const assessment = await enhancedRadarClient.assessDomainSecurity('example.com');
// Uses MCP if available, falls back to direct API seamlessly
```

### Direct MCP Client Usage

```typescript
import { mcpRadarClient } from './src/security/mcp-radar-client.js';

// Check if MCP is available
if (mcpRadarClient.isAvailable()) {
  // Use MCP features
  const domainInfo = await mcpRadarClient.getDomainDetails('example.com');
  const ipInfo = await mcpRadarClient.getIPDetails('1.1.1.1');
  const scanResult = await mcpRadarClient.scanURL('https://example.com');
}
```

## Architecture

```
┌──────────────────┐
│  Application     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Enhanced Radar   │
│     Client       │
└────────┬─────────┘
         │
         ├─────────────┐
         ▼             ▼
┌──────────────┐  ┌──────────────┐
│ MCP Radar    │  │ Direct API   │
│   Client     │  │   Client     │
│ (Primary)    │  │ (Fallback)   │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ MCP Server   │  │ Cloudflare   │
│ (Background) │  │    API       │
└──────────────┘  └──────────────┘
```

## Troubleshooting

### MCP Not Connecting

1. **Check if MCP is enabled**:
   ```bash
   export MCP_ENABLED=true
   ```

2. **Enable debug logging**:
   ```bash
   export DEBUG_MCP=true
   npm run security-scan -- lookup example.com
   ```

3. **Check SSL certificates**:
   - Some environments may have SSL certificate issues
   - The system will automatically fall back to direct API

### Authentication Issues

1. **OAuth Token**: Set `MCP_AUTH_TOKEN` if you have a persistent token
2. **Browser Auth**: Set `MCP_SKIP_BROWSER_AUTH=false` to allow browser-based auth
3. **Fallback**: System automatically uses direct API if auth fails

### Performance

- MCP servers start on first use (lazy loading)
- Background processes are cleaned up automatically
- Health checks ensure connections stay alive
- Failed connections fall back to direct API with no delay

## Adding New MCP Servers

To integrate additional MCP servers:

1. Create a new client class in `src/security/`:
   ```typescript
   export class MCPNewServiceClient extends EventEmitter {
     // Implementation similar to mcp-radar-client.ts
   }
   ```

2. Update the enhanced client to use the new MCP:
   ```typescript
   // Try MCP first
   const mcpResult = await mcpNewServiceClient.getData();
   if (mcpResult) return mcpResult;
   
   // Fall back to direct API
   return await directApiCall();
   ```

3. Add configuration to `mcp-config.json`

## Security Considerations

- MCP servers run with minimal privileges
- OAuth tokens are never logged or exposed
- All MCP traffic is encrypted (HTTPS/WSS)
- Automatic cleanup prevents resource leaks
- Failed authentications fall back safely

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Cloudflare MCP Servers](https://github.com/cloudflare/mcp-server-cloudflare)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
