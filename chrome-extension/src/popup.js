/**
 * Popup script for Gateway Log Streamer extension
 */

let isMonitoring = false;
let currentTab = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];
  
  // Load saved settings
  loadSettings();
  
  // Update status
  updateStatus();
  
  // Set up event listeners
  setupEventListeners();
  
  // Start status polling
  setInterval(updateStatus, 2000);
});

function setupEventListeners() {
  // Toggle monitoring button
  document.getElementById('toggleBtn').addEventListener('click', toggleMonitoring);
  
  // Open dashboard button
  document.getElementById('openDashboard').addEventListener('click', () => {
    const port = document.getElementById('wsPort').value || 8081;
    const dashboardUrl = `http://localhost:${port === '8081' ? '3001' : '3000'}`;
    chrome.tabs.create({ url: dashboardUrl });
  });
  
  // Settings change handlers
  document.getElementById('wsPort').addEventListener('change', saveSettings);
  document.getElementById('refreshInterval').addEventListener('change', saveSettings);
  document.getElementById('autoStart').addEventListener('change', saveSettings);
  
  // Help link
  document.getElementById('helpLink').addEventListener('click', (e) => {
    e.preventDefault();
    showHelp();
  });
  
  // Settings link
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'src/options.html' });
  });
}

async function toggleMonitoring() {
  const wsPort = document.getElementById('wsPort').value || 8081;
  
  if (isMonitoring) {
    // Stop monitoring
    try {
      await sendMessageToTab({ action: 'stopMonitoring' });
      isMonitoring = false;
      updateUI();
    } catch (error) {
      showError('Failed to stop monitoring: ' + error.message);
    }
  } else {
    // Check if we're on a Cloudflare page
    if (!isCloudflareTab()) {
      showError('Please navigate to the Cloudflare Zero Trust Gateway logs page first');
      chrome.tabs.create({ 
        url: 'https://one.dash.cloudflare.com/gateway/logs' 
      });
      return;
    }
    
    // Start monitoring
    try {
      await sendMessageToTab({ 
        action: 'startMonitoring',
        wsPort: parseInt(wsPort)
      });
      isMonitoring = true;
      updateUI();
    } catch (error) {
      showError('Failed to start monitoring: ' + error.message);
    }
  }
}

function isCloudflareTab() {
  if (!currentTab) return false;
  const url = currentTab.url || '';
  return url.includes('cloudflare.com') || url.includes('teams.cloudflare.com');
}

async function sendMessageToTab(message) {
  return new Promise((resolve, reject) => {
    if (!currentTab) {
      reject(new Error('No active tab'));
      return;
    }
    
    chrome.tabs.sendMessage(currentTab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

async function updateStatus() {
  try {
    // Get status from content script
    const contentStatus = await sendMessageToTab({ action: 'getStatus' }).catch(() => null);
    
    // Get stats from background script
    const bgStats = await chrome.runtime.sendMessage({ action: 'getStats' }).catch(() => null);
    
    if (contentStatus) {
      isMonitoring = contentStatus.isMonitoring;
      
      // Update extension status
      updateIndicator('extensionStatus', 'extensionStatusDot', contentStatus.isMonitoring);
      document.getElementById('extensionStatus').textContent = 
        contentStatus.isMonitoring ? 'Monitoring Active' : 
        contentStatus.pageReady ? 'Ready' : 'Not on logs page';
    }
    
    if (bgStats) {
      // Update WebSocket status
      updateIndicator('wsStatus', 'wsStatusDot', bgStats.connected);
      document.getElementById('wsStatus').textContent = 
        bgStats.connected ? 'Connected' : 'Disconnected';
      
      // Update stats
      document.getElementById('logCount').textContent = bgStats.logsSent || 0;
      document.getElementById('errorCount').textContent = bgStats.errors || 0;
    }
    
    updateUI();
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

function updateIndicator(textId, dotId, isActive) {
  const dot = document.getElementById(dotId);
  if (isActive) {
    dot.classList.add('active');
  } else {
    dot.classList.remove('active');
  }
}

function updateUI() {
  const toggleBtn = document.getElementById('toggleBtn');
  
  if (isMonitoring) {
    toggleBtn.textContent = 'Stop Monitoring';
    toggleBtn.classList.add('active');
  } else {
    toggleBtn.textContent = 'Start Monitoring';
    toggleBtn.classList.remove('active');
  }
}

function loadSettings() {
  chrome.storage.local.get(['wsPort', 'refreshInterval', 'autoStart'], (data) => {
    if (data.wsPort) {
      document.getElementById('wsPort').value = data.wsPort;
    }
    if (data.refreshInterval) {
      document.getElementById('refreshInterval').value = data.refreshInterval;
    }
    if (data.autoStart !== undefined) {
      document.getElementById('autoStart').checked = data.autoStart;
    }
  });
}

function saveSettings() {
  const settings = {
    wsPort: parseInt(document.getElementById('wsPort').value) || 8081,
    refreshInterval: parseInt(document.getElementById('refreshInterval').value) || 30,
    autoStart: document.getElementById('autoStart').checked
  };
  
  chrome.storage.local.set(settings, () => {
    console.log('Settings saved:', settings);
  });
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.classList.add('show');
  
  setTimeout(() => {
    errorEl.classList.remove('show');
  }, 5000);
}

function showHelp() {
  const helpMessage = `
Gateway Log Streamer Help:

1. Navigate to your Cloudflare Zero Trust dashboard
2. Go to Gateway > Activity Logs
3. Click "Start Monitoring" in this extension
4. Logs will be streamed to your local monitoring server

Requirements:
- Local monitoring server must be running on the specified port
- You must be on the Gateway logs page for scraping to work

Troubleshooting:
- Ensure the WebSocket port matches your server configuration
- Check that the monitoring server is running (npm run start -- monitor)
- Refresh the Cloudflare page if logs aren't appearing
  `.trim();
  
  alert(helpMessage);
}