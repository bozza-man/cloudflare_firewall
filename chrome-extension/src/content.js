/**
 * Content script for Cloudflare Gateway Log Streamer
 * Scrapes activity logs from the Cloudflare Zero Trust dashboard
 */

class GatewayLogScraper {
  constructor() {
    this.isMonitoring = false;
    this.lastLogId = null;
    this.observerConfig = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    };
    this.observer = null;
    this.refreshInterval = null;
    this.wsPort = 8081; // Default WebSocket port
    
    this.init();
  }

  init() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Check if we're on the Gateway logs page
    this.checkCurrentPage();
    
    // Monitor URL changes (for SPA navigation)
    this.monitorUrlChanges();
  }

  handleMessage(request, sendResponse) {
    switch(request.action) {
      case 'startMonitoring':
        this.startMonitoring(request.wsPort || this.wsPort);
        sendResponse({ success: true, message: 'Monitoring started' });
        break;
      
      case 'stopMonitoring':
        this.stopMonitoring();
        sendResponse({ success: true, message: 'Monitoring stopped' });
        break;
      
      case 'getStatus':
        sendResponse({ 
          isMonitoring: this.isMonitoring,
          pageReady: this.isGatewayLogsPage(),
          lastLogId: this.lastLogId
        });
        break;
      
      case 'refreshLogs':
        this.refreshLogs();
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ success: false, message: 'Unknown action' });
    }
  }

  checkCurrentPage() {
    // Check if we're on Gateway activity logs page
    const isLogsPage = this.isGatewayLogsPage();
    
    if (isLogsPage) {
      this.injectFloatingWidget();
      // Auto-start if previously enabled
      chrome.storage.local.get(['autoStart', 'wsPort'], (data) => {
        if (data.autoStart) {
          this.startMonitoring(data.wsPort || this.wsPort);
        }
      });
    }
  }

  isGatewayLogsPage() {
    const url = window.location.href;
    return url.includes('gateway/logs') || 
           url.includes('gateway/activity') ||
           url.includes('analytics/logs') ||
           url.includes('teams') && url.includes('logs');
  }

  monitorUrlChanges() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.checkCurrentPage();
      }
    }).observe(document, { subtree: true, childList: true });
  }

  startMonitoring(wsPort) {
    if (this.isMonitoring) {
      console.log('Already monitoring');
      return;
    }

    this.wsPort = wsPort;
    this.isMonitoring = true;
    
    console.log('Starting Gateway log monitoring...');
    
    // Connect to local WebSocket server
    chrome.runtime.sendMessage({
      action: 'connectWebSocket',
      wsPort: this.wsPort
    });

    // Start observing DOM changes for new logs
    this.startDomObserver();
    
    // Initial scrape
    this.scrapeLogs();
    
    // Set up auto-refresh
    this.setupAutoRefresh();
    
    // Update UI
    this.updateWidgetStatus(true);
    
    // Save state
    chrome.storage.local.set({ 
      autoStart: true,
      wsPort: this.wsPort 
    });
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    console.log('Stopping Gateway log monitoring...');
    
    // Disconnect WebSocket
    chrome.runtime.sendMessage({ action: 'disconnectWebSocket' });
    
    // Stop DOM observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Clear auto-refresh
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    // Update UI
    this.updateWidgetStatus(false);
    
    // Clear saved state
    chrome.storage.local.set({ autoStart: false });
  }

  startDomObserver() {
    // Look for the logs container
    const logsContainer = this.findLogsContainer();
    
    if (!logsContainer) {
      console.warn('Logs container not found, retrying...');
      setTimeout(() => this.startDomObserver(), 2000);
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      // Debounce to avoid excessive processing
      clearTimeout(this.observerTimeout);
      this.observerTimeout = setTimeout(() => {
        this.scrapeLogs();
      }, 500);
    });

    this.observer.observe(logsContainer, this.observerConfig);
    console.log('DOM observer started');
  }

  findLogsContainer() {
    // Try various selectors that Cloudflare might use
    const selectors = [
      '[data-testid="activity-log-table"]',
      '[data-testid="logs-table"]',
      '.activity-log-table',
      '.logs-table',
      'table tbody',
      '[role="table"]',
      '.data-table tbody',
      'div[class*="Table"]',
      'div[class*="table"]',
      'div[class*="logs"]',
      'div[class*="activity"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Found logs container with selector: ${selector}`);
        return element;
      }
    }

    return null;
  }

  scrapeLogs() {
    if (!this.isMonitoring) return;

    try {
      const logs = this.extractLogs();
      
      if (logs.length > 0) {
        console.log(`Scraped ${logs.length} logs`);
        
        // Send to background script
        chrome.runtime.sendMessage({
          action: 'sendLogs',
          logs: logs
        });

        // Update last log ID
        if (logs[0].id) {
          this.lastLogId = logs[0].id;
        }
      }
    } catch (error) {
      console.error('Error scraping logs:', error);
    }
  }

  extractLogs() {
    const logs = [];
    
    // Try to find log rows using various strategies
    const strategies = [
      () => this.extractFromTable(),
      () => this.extractFromDivs(),
      () => this.extractFromReactComponents()
    ];

    for (const strategy of strategies) {
      const extractedLogs = strategy();
      if (extractedLogs.length > 0) {
        return extractedLogs;
      }
    }

    return logs;
  }

  extractFromTable() {
    const logs = [];
    const rows = document.querySelectorAll('table tbody tr, [role="row"]');
    
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td, [role="cell"]');
      if (cells.length >= 4) {
        const log = this.parseLogRow(cells, index);
        if (log && (!this.lastLogId || log.id !== this.lastLogId)) {
          logs.push(log);
        }
      }
    });

    return logs;
  }

  extractFromDivs() {
    const logs = [];
    const logDivs = document.querySelectorAll('div[class*="log-item"], div[class*="activity-item"]');
    
    logDivs.forEach((div, index) => {
      const log = this.parseLogDiv(div, index);
      if (log && (!this.lastLogId || log.id !== this.lastLogId)) {
        logs.push(log);
      }
    });

    return logs;
  }

  extractFromReactComponents() {
    const logs = [];
    
    // Try to access React props (if available)
    const reactRoot = document.querySelector('#root, #app, [data-reactroot]');
    if (reactRoot && reactRoot._reactRootContainer) {
      try {
        // This is a hack to get React component data
        const fiber = reactRoot._reactRootContainer._internalRoot.current;
        const logs = this.traverseReactFiber(fiber);
        return logs;
      } catch (error) {
        console.debug('Could not access React internals:', error);
      }
    }

    return logs;
  }

  parseLogRow(cells, index) {
    try {
      // Common patterns for Gateway logs
      const timestamp = cells[0]?.textContent?.trim() || new Date().toISOString();
      const action = cells[1]?.textContent?.trim() || 'unknown';
      const user = cells[2]?.textContent?.trim() || 'unknown';
      const sourceIp = cells[3]?.textContent?.trim() || '';
      const destination = cells[4]?.textContent?.trim() || '';
      const rule = cells[5]?.textContent?.trim() || '';
      const category = cells[6]?.textContent?.trim() || '';
      
      return {
        id: `log-${Date.now()}-${index}`,
        timestamp: this.parseTimestamp(timestamp),
        action: action.toLowerCase(),
        user: user,
        source: {
          ip: sourceIp,
          location: this.extractLocation(cells[3])
        },
        destination: {
          hostname: destination,
          port: this.extractPort(destination)
        },
        rule: rule,
        category: category,
        raw: Array.from(cells).map(c => c.textContent?.trim()).join(' | ')
      };
    } catch (error) {
      console.error('Error parsing log row:', error);
      return null;
    }
  }

  parseLogDiv(div, index) {
    try {
      // Extract text content and parse it
      const text = div.textContent || '';
      const timestamp = div.querySelector('[class*="time"], [class*="date"]')?.textContent || new Date().toISOString();
      const action = div.querySelector('[class*="action"], [class*="status"]')?.textContent || 'unknown';
      const details = div.querySelector('[class*="details"], [class*="description"]')?.textContent || '';
      
      return {
        id: `log-${Date.now()}-${index}`,
        timestamp: this.parseTimestamp(timestamp),
        action: action.toLowerCase(),
        details: details,
        raw: text
      };
    } catch (error) {
      console.error('Error parsing log div:', error);
      return null;
    }
  }

  parseTimestamp(timestamp) {
    // Try to parse various timestamp formats
    try {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (e) {}
    
    // If parsing fails, return current time
    return new Date().toISOString();
  }

  extractLocation(cell) {
    // Look for location info (country, city)
    const text = cell?.textContent || '';
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : '';
  }

  extractPort(destination) {
    const match = destination.match(/:(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }

  setupAutoRefresh() {
    // Click refresh button every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.refreshLogs();
    }, 30000);
  }

  refreshLogs() {
    // Try to find and click the refresh button
    const refreshSelectors = [
      'button[aria-label*="refresh"]',
      'button[aria-label*="Refresh"]',
      'button[title*="refresh"]',
      'button[title*="Refresh"]',
      '[data-testid="refresh-button"]',
      'button svg[class*="refresh"]',
      'button svg[class*="sync"]'
    ];

    for (const selector of refreshSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        button.click();
        console.log('Clicked refresh button');
        return;
      }
    }

    // If no refresh button found, try to trigger a reload another way
    this.triggerDataReload();
  }

  triggerDataReload() {
    // Try to trigger a data reload by manipulating filters or pagination
    const filterInputs = document.querySelectorAll('input[type="text"], input[type="search"]');
    if (filterInputs.length > 0) {
      const input = filterInputs[0];
      const event = new Event('input', { bubbles: true });
      input.dispatchEvent(event);
    }
  }

  injectFloatingWidget() {
    // Remove existing widget if any
    const existing = document.getElementById('cf-log-streamer-widget');
    if (existing) {
      existing.remove();
    }

    // Create floating widget
    const widget = document.createElement('div');
    widget.id = 'cf-log-streamer-widget';
    widget.className = 'cf-log-streamer-widget';
    widget.innerHTML = `
      <div class="cf-widget-header">
        <span class="cf-widget-title">Gateway Log Streamer</span>
        <span class="cf-widget-status" id="cf-widget-status">Inactive</span>
      </div>
      <div class="cf-widget-body">
        <button id="cf-toggle-monitoring" class="cf-widget-btn cf-btn-primary">
          Start Monitoring
        </button>
        <div class="cf-widget-stats" id="cf-widget-stats" style="display: none;">
          <div class="cf-stat-item">
            <span class="cf-stat-label">Logs Captured:</span>
            <span class="cf-stat-value" id="cf-logs-count">0</span>
          </div>
          <div class="cf-stat-item">
            <span class="cf-stat-label">WebSocket:</span>
            <span class="cf-stat-value" id="cf-ws-status">Disconnected</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Add event listeners
    document.getElementById('cf-toggle-monitoring').addEventListener('click', () => {
      if (this.isMonitoring) {
        this.stopMonitoring();
      } else {
        this.startMonitoring(this.wsPort);
      }
    });

    // Make widget draggable
    this.makeWidgetDraggable(widget);
  }

  makeWidgetDraggable(widget) {
    const header = widget.querySelector('.cf-widget-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      
      if (e.target === header) {
        isDragging = true;
        widget.style.transition = 'none';
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;

        widget.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    }

    function dragEnd() {
      isDragging = false;
      widget.style.transition = '';
    }
  }

  updateWidgetStatus(isActive) {
    const statusEl = document.getElementById('cf-widget-status');
    const toggleBtn = document.getElementById('cf-toggle-monitoring');
    const statsEl = document.getElementById('cf-widget-stats');
    
    if (statusEl) {
      statusEl.textContent = isActive ? 'Active' : 'Inactive';
      statusEl.className = `cf-widget-status ${isActive ? 'active' : ''}`;
    }
    
    if (toggleBtn) {
      toggleBtn.textContent = isActive ? 'Stop Monitoring' : 'Start Monitoring';
      toggleBtn.className = `cf-widget-btn ${isActive ? 'cf-btn-danger' : 'cf-btn-primary'}`;
    }
    
    if (statsEl) {
      statsEl.style.display = isActive ? 'block' : 'none';
    }
  }

  traverseReactFiber(fiber) {
    // Advanced technique to extract data from React components
    const logs = [];
    // Implementation would depend on specific React structure
    return logs;
  }
}

// Initialize scraper
const scraper = new GatewayLogScraper();

// Listen for WebSocket status updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'wsStatusUpdate') {
    const wsStatusEl = document.getElementById('cf-ws-status');
    if (wsStatusEl) {
      wsStatusEl.textContent = request.connected ? 'Connected' : 'Disconnected';
      wsStatusEl.className = `cf-stat-value ${request.connected ? 'connected' : ''}`;
    }
  } else if (request.action === 'logsSentUpdate') {
    const countEl = document.getElementById('cf-logs-count');
    if (countEl) {
      const current = parseInt(countEl.textContent) || 0;
      countEl.textContent = current + request.count;
    }
  }
});

console.log('Cloudflare Gateway Log Streamer content script loaded');