# Real-time Gateway Log Streaming

## Overview

The Gateway Log Streaming feature provides real-time monitoring of Cloudflare Zero Trust Gateway logs through a WebSocket server and interactive web dashboard.

## Features

- **Real-time WebSocket streaming** - Logs are pushed instantly to connected clients
- **Interactive web dashboard** - Beautiful, responsive UI for log visualization
- **Advanced filtering** - Filter by log level, action, rule, time range, and search terms
- **Log persistence** - Maintains a buffer of recent logs for replay
- **Statistics & analytics** - Real-time metrics and activity charts
- **Export capabilities** - Export logs to JSON for analysis
- **Simulation mode** - Test the system without connecting to Cloudflare

## Quick Start

### 1. Start the streaming server

```bash
# Start with default settings
npm run start -- stream

# Start with custom ports
npm run start -- stream --port 8080 --dashboard-port 3000

# Start in simulation mode (for testing)
npm run start -- stream --simulate

# Open dashboard automatically
npm run start -- stream --open-browser
```

### 2. Access the dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Cloudflare API │────▶│  Log Collector   │────▶│  WebSocket  │
└─────────────────┘     └──────────────────┘     │   Server    │
                                                  └─────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │  Dashboard  │
                                                  │  (Browser)  │
                                                  └─────────────┘
```

## Components

### 1. Log Stream Server (`log-stream-server.ts`)
- WebSocket server for real-time communication
- Manages client connections and broadcasts
- Maintains log buffer for replay
- Handles filtering and search requests

### 2. Gateway Log Collector (`gateway-log-collector.ts`)
- Polls Cloudflare API for new logs
- Transforms raw logs to unified format
- Emits processed logs to stream server
- Handles different log types (DNS, HTTP, Audit, Activity)

### 3. Web Dashboard (`dashboard/`)
- Real-time log visualization
- Interactive filtering and search
- Activity charts and statistics
- Log detail modal views

### 4. CLI Command (`stream-logs-command.ts`)
- Orchestrates all components
- Provides command-line interface
- Manages server lifecycle

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--port` | WebSocket server port | 8080 |
| `--dashboard-port` | Dashboard web server port | 3000 |
| `--poll-interval` | Log polling interval (ms) | 5000 |
| `--open-browser` | Auto-open dashboard | false |
| `--simulate` | Use simulated logs | false |
| `--no-audit` | Disable audit logs | false |
| `--no-activity` | Disable activity logs | false |
| `--no-dns` | Disable DNS logs | false |
| `--no-http` | Disable HTTP logs | false |

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### Message Types

#### Incoming (from server)
```javascript
// Connection acknowledgment
{ type: 'connection', message: 'Connected', timestamp: '...' }

// New log entry
{ type: 'log', data: { /* log object */ } }

// Log buffer (recent logs)
{ type: 'buffer', logs: [ /* array of logs */ ] }

// Filtered results
{ type: 'filtered', logs: [ /* filtered logs */ ], filter: { /* filter criteria */ } }
```

#### Outgoing (to server)
```javascript
// Apply filter
ws.send(JSON.stringify({
  type: 'filter',
  filter: {
    level: 'error',
    action: 'block',
    search: 'malware'
  }
}));

// Request replay
ws.send(JSON.stringify({
  type: 'replay',
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-02T00:00:00Z'
}));
```

## Log Format

```typescript
interface GatewayLog {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  type: string;
  action: string;
  ruleId?: string;
  ruleName?: string;
  source: {
    ip?: string;
    country?: string;
    asn?: string;
    user?: string;
  };
  destination: {
    hostname?: string;
    ip?: string;
    port?: number;
    protocol?: string;
  };
  details: {
    method?: string;
    path?: string;
    query?: string;
    userAgent?: string;
    referer?: string;
    statusCode?: number;
    category?: string;
    threat?: string;
    [key: string]: any;
  };
}
```

## Dashboard Features

### Real-time Updates
- Logs stream in real-time as they occur
- Auto-scroll option to follow new logs
- Visual indicators for different log levels and actions

### Filtering & Search
- Filter by log level (debug, info, warning, error, critical)
- Filter by action (block, allow, isolate, inspect)
- Full-text search across all log fields
- Time range selection

### Statistics
- Total log count
- Breakdown by action (blocked, allowed, isolated)
- Logs per second metric
- Top rules by frequency
- Activity chart over time

### Log Details
- Click any log entry to view full details
- Formatted JSON view of additional data
- Source and destination information
- Rule information

## Troubleshooting

### Connection Issues
- Ensure WebSocket port (8080) is not in use
- Check firewall settings allow WebSocket connections
- Verify Cloudflare API credentials are configured

### No Logs Appearing
- Check Cloudflare API token has correct permissions
- Verify account has Gateway logs enabled
- Try simulation mode to test the system

### Performance Issues
- Reduce poll interval for less frequent updates
- Limit log types collected (use --no-* flags)
- Clear browser cache if dashboard is slow

## Security Considerations

- WebSocket server binds to localhost only by default
- No authentication on WebSocket connection (add if exposing externally)
- Logs may contain sensitive information - handle appropriately
- Consider HTTPS/WSS for production deployments

## Future Enhancements

- [ ] WebRTC support for peer-to-peer streaming
- [ ] Log aggregation and analytics
- [ ] Alert system for specific patterns
- [ ] Log forwarding to external systems
- [ ] Historical log retrieval
- [ ] Multi-account support
- [ ] Custom dashboard themes
- [ ] Mobile-responsive improvements

## API Limitations

**Note**: The current implementation includes a placeholder for `fetchLogs()` as Cloudflare's log access methods vary:

1. **Logpush** - Configure logs to be pushed to external destinations
2. **GraphQL Analytics API** - Query logs programmatically
3. **REST API** - Limited log access endpoints

You'll need to implement the appropriate method based on your Cloudflare plan and requirements.

## Support

For issues or questions about the log streaming feature, please check:
- The main project README
- Cloudflare Zero Trust documentation
- Project issue tracker on GitHub