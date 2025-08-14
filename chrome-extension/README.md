# Cloudflare Gateway Log Streamer - Chrome Extension

This Chrome extension scrapes real-time activity logs from the Cloudflare Zero Trust Gateway dashboard and streams them to your local monitoring server via WebSocket.

## Features

- **Real-time Log Scraping**: Captures Gateway activity logs directly from the Cloudflare dashboard
- **WebSocket Streaming**: Sends logs to your local monitoring server
- **Auto-refresh**: Automatically refreshes logs at configurable intervals
- **Floating Widget**: In-page control panel for easy monitoring
- **Smart Detection**: Automatically detects when you're on the Gateway logs page
- **Persistent Settings**: Remembers your configuration preferences

## Installation

### 1. Generate Icons
1. Open `chrome-extension/assets/generate-icons.html` in Chrome
2. Right-click each canvas and save as:
   - `icon-16.png` (16x16)
   - `icon-48.png` (48x48)
   - `icon-128.png` (128x128)

### 2. Load Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder
5. The extension will appear in your extensions list

## Setup

### 1. Start Your Monitoring Server
First, ensure your local monitoring server is running:

```bash
npm run start -- monitor --port 8081 --dashboard-port 3001
```

### 2. Configure Extension
1. Click the extension icon in Chrome toolbar
2. Set the WebSocket port (default: 8081)
3. Configure refresh interval (default: 30 seconds)
4. Enable auto-start if desired

### 3. Navigate to Cloudflare Dashboard
1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com)
2. Navigate to: **Gateway** → **Activity Logs** or **Analytics** → **Gateway** → **Logs**
3. The extension will detect the logs page automatically

### 4. Start Monitoring
1. Click "Start Monitoring" in the extension popup OR
2. Use the floating widget that appears on the logs page
3. Logs will begin streaming to your local server

## How It Works

### Architecture
```
Cloudflare Dashboard
        ↓
  Content Script (Scraper)
        ↓
  Background Service Worker
        ↓
  WebSocket Connection
        ↓
  Local Monitoring Server
        ↓
  Dashboard (localhost:3001)
```

### Components

1. **Content Script** (`content.js`)
   - Injects into Cloudflare dashboard pages
   - Scrapes log data from DOM
   - Handles multiple table formats and React components
   - Provides floating control widget

2. **Background Service Worker** (`background.js`)
   - Manages WebSocket connection
   - Queues messages when disconnected
   - Handles reconnection logic
   - Formats logs for monitoring server

3. **Popup UI** (`popup.html/js`)
   - Extension control panel
   - Configuration settings
   - Connection status display
   - Statistics tracking

## Log Format

The extension captures and formats logs with the following structure:

```javascript
{
  id: "unique-log-id",
  timestamp: "ISO-8601 timestamp",
  action: "block|allow|isolate|bypass",
  user: "user@example.com",
  source: {
    ip: "192.168.1.1",
    location: "City, Country"
  },
  destination: {
    hostname: "example.com",
    port: 443
  },
  rule: "Rule Name",
  category: "Security Category",
  level: "info|warning|error"
}
```

## Troubleshooting

### Extension Not Detecting Logs Page
- Ensure you're on the correct URL pattern:
  - `https://dash.teams.cloudflare.com/*/gateway/logs`
  - `https://one.dash.cloudflare.com/*/gateway/activity`
- Refresh the page after navigating
- Check if the floating widget appears

### WebSocket Connection Failed
- Verify monitoring server is running
- Check the WebSocket port matches server configuration
- Look for firewall blocking localhost connections
- Check Chrome DevTools console for errors

### Logs Not Appearing
- Ensure there is activity in your Gateway
- Click the refresh button in the Cloudflare dashboard
- Check if logs are visible in the dashboard first
- Verify the DOM structure hasn't changed

### Permission Issues
- The extension needs permissions for:
  - Cloudflare domains
  - Localhost WebSocket connections
  - Storage for settings

## Development

### Testing
1. Make changes to extension files
2. Go to `chrome://extensions/`
3. Click refresh icon on the extension card
4. Reload the Cloudflare dashboard page

### Debugging
- **Content Script**: Right-click page → Inspect → Console
- **Background Worker**: Extension card → "Inspect views: service worker"
- **Popup**: Right-click extension icon → Inspect popup

### DOM Selectors
The extension tries multiple strategies to find logs:
1. Data-testid attributes
2. Class names containing "log" or "activity"
3. Table/role attributes
4. React component internals (fallback)

## Security Considerations

- The extension only reads data, never modifies the Cloudflare dashboard
- WebSocket connection is local only (localhost)
- No data is sent to external servers
- Credentials are never stored or transmitted
- Uses Chrome's secure storage API for settings

## Limitations

- Requires manual navigation to logs page
- Can only capture visible logs (pagination limits)
- Depends on Cloudflare's DOM structure
- WebSocket is unencrypted (local only)

## Future Enhancements

- [ ] Support for wss:// (encrypted WebSocket)
- [ ] Automatic pagination handling
- [ ] Export logs to file
- [ ] Advanced filtering before sending
- [ ] Multiple dashboard support
- [ ] Log deduplication
- [ ] Performance metrics collection

## Support

For issues or questions:
1. Check the troubleshooting section
2. View console logs for detailed errors
3. Ensure all components are running
4. Verify Cloudflare dashboard hasn't changed