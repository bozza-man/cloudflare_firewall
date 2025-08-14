/**
 * Background service worker for Cloudflare Gateway Log Streamer
 * Manages WebSocket connection to local monitoring server
 */

class WebSocketManager {
  constructor() {
    this.ws = null;
    this.wsUrl = null;
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.messageQueue = [];
    this.stats = {
      connected: false,
      logsSent: 0,
      errors: 0,
      lastConnected: null,
      lastError: null
    };
  }

  connect(port = 8081) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('Connection already in progress');
      return;
    }

    this.isConnecting = true;
    this.wsUrl = `ws://localhost:${port}`;
    
    console.log(`Connecting to WebSocket server at ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected successfully');
        this.isConnecting = false;
        this.stats.connected = true;
        this.stats.lastConnected = new Date().toISOString();
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        
        // Send queued messages
        this.flushMessageQueue();
        
        // Notify content scripts
        this.broadcastStatus(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (error) {
          console.error('Error parsing server message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.stats.errors++;
        this.stats.lastError = new Date().toISOString();
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stats.connected = false;
        this.isConnecting = false;
        this.ws = null;
        
        // Notify content scripts
        this.broadcastStatus(false);
        
        // Schedule reconnection
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.isConnecting = false;
      this.stats.errors++;
      this.scheduleReconnect();
    }
  }

  disconnect() {
    console.log('Disconnecting WebSocket');
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.stats.connected = false;
    this.broadcastStatus(false);
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    console.log(`Scheduling reconnection in ${this.reconnectInterval}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wsUrl) {
        const port = this.wsUrl.match(/:(\d+)$/)?.[1] || 8081;
        this.connect(port);
      }
    }, this.reconnectInterval);
  }

  sendLogs(logs) {
    if (!logs || logs.length === 0) {
      return;
    }

    const messages = logs.map(log => ({
      type: 'log',
      data: this.formatLog(log)
    }));

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      messages.forEach(message => {
        try {
          this.ws.send(JSON.stringify(message));
          this.stats.logsSent++;
        } catch (error) {
          console.error('Error sending log:', error);
          this.messageQueue.push(message);
        }
      });
      
      // Notify content script
      this.notifyLogsSent(logs.length);
    } else {
      // Queue messages for later
      this.messageQueue.push(...messages);
      console.log(`Queued ${logs.length} logs (WebSocket not connected)`);
    }
  }

  formatLog(log) {
    // Format log for the monitoring server
    return {
      id: log.id || `cf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || new Date().toISOString(),
      level: this.mapActionToLevel(log.action),
      type: 'gateway_activity',
      action: log.action,
      user: log.user || 'unknown',
      source: log.source || { ip: 'unknown' },
      destination: log.destination || {},
      rule: log.rule,
      category: log.category,
      details: {
        raw: log.raw,
        ...log.details
      }
    };
  }

  mapActionToLevel(action) {
    const actionMap = {
      'block': 'warning',
      'blocked': 'warning',
      'allow': 'info',
      'allowed': 'info',
      'isolate': 'warning',
      'isolated': 'warning',
      'bypass': 'info',
      'inspect': 'info',
      'error': 'error',
      'deny': 'warning',
      'denied': 'warning'
    };
    
    return actionMap[action?.toLowerCase()] || 'info';
  }

  flushMessageQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`Flushing ${this.messageQueue.length} queued messages`);
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach(message => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(message));
          this.stats.logsSent++;
        } else {
          this.messageQueue.push(message);
        }
      } catch (error) {
        console.error('Error sending queued message:', error);
        this.messageQueue.push(message);
      }
    });
  }

  handleServerMessage(message) {
    console.log('Received message from server:', message);
    
    // Handle different message types from server
    switch(message.type) {
      case 'ping':
        // Respond with pong
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;
      
      case 'config':
        // Server configuration update
        console.log('Server config:', message.data);
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  broadcastStatus(connected) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && (tab.url.includes('cloudflare.com') || tab.url.includes('teams.cloudflare.com'))) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'wsStatusUpdate',
            connected: connected
          }).catch(() => {});
        }
      });
    });
  }

  notifyLogsSent(count) {
    chrome.tabs.query({ active: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'logsSentUpdate',
          count: count
        }).catch(() => {});
      }
    });
  }

  getStats() {
    return {
      ...this.stats,
      queueSize: this.messageQueue.length,
      wsState: this.ws ? this.ws.readyState : 'disconnected'
    };
  }
}

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  switch(request.action) {
    case 'connectWebSocket':
      wsManager.connect(request.wsPort || 8081);
      sendResponse({ success: true });
      break;
    
    case 'disconnectWebSocket':
      wsManager.disconnect();
      sendResponse({ success: true });
      break;
    
    case 'sendLogs':
      wsManager.sendLogs(request.logs);
      sendResponse({ success: true });
      break;
    
    case 'getStats':
      sendResponse(wsManager.getStats());
      break;
    
    default:
      sendResponse({ success: false, message: 'Unknown action' });
  }
  
  return true; // Keep message channel open
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // Open options or welcome page
    chrome.tabs.create({
      url: 'src/welcome.html'
    });
  }
});

// Handle extension icon click (if no popup)
chrome.action.onClicked.addListener((tab) => {
  // Toggle monitoring for current tab
  chrome.tabs.sendMessage(tab.id, {
    action: 'toggleMonitoring'
  });
});

console.log('Cloudflare Gateway Log Streamer background service initialized');