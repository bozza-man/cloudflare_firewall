// WebSocket connection
let ws = null;
let reconnectInterval = null;
let isPaused = false;
let autoScroll = true;

// Stats
let stats = {
    total: 0,
    blocked: 0,
    allowed: 0,
    isolated: 0,
    logsPerSec: 0
};

// Logs buffer
let logsBuffer = [];
const maxBufferSize = 10000;

// Chart
let activityChart = null;
let chartData = {
    labels: [],
    datasets: [
        {
            label: 'Blocked',
            data: [],
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4
        },
        {
            label: 'Allowed',
            data: [],
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.4
        }
    ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    initializeChart();
    setupEventListeners();
    startStatsUpdater();
});

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8080`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to log stream');
        updateConnectionStatus(true);
        
        // Clear reconnect interval if exists
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
    
    ws.onclose = () => {
        console.log('Disconnected from log stream');
        updateConnectionStatus(false);
        
        // Try to reconnect
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('Attempting to reconnect...');
                initializeWebSocket();
            }, 5000);
        }
    };
}

function handleMessage(message) {
    switch (message.type) {
        case 'connection':
            console.log('Connection established:', message.message);
            break;
            
        case 'log':
            if (!isPaused) {
                processLog(message.data);
            }
            break;
            
        case 'buffer':
            if (message.logs && Array.isArray(message.logs)) {
                message.logs.forEach(log => processLog(log));
            }
            break;
            
        case 'filtered':
            clearLogs();
            if (message.logs && Array.isArray(message.logs)) {
                message.logs.forEach(log => processLog(log));
            }
            break;
            
        default:
            console.log('Unknown message type:', message.type);
    }
}

function processLog(log) {
    // Add to buffer
    logsBuffer.push(log);
    if (logsBuffer.length > maxBufferSize) {
        logsBuffer.shift();
    }
    
    // Update stats
    stats.total++;
    if (log.action === 'block') stats.blocked++;
    else if (log.action === 'allow') stats.allowed++;
    else if (log.action === 'isolate') stats.isolated++;
    
    // Add to UI
    addLogToUI(log);
    
    // Update buffer size display
    document.getElementById('bufferSize').textContent = logsBuffer.length;
}

function addLogToUI(log) {
    const container = document.getElementById('logsContainer');
    
    // Create log entry
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry bg-gray-700 rounded-lg p-3 hover:bg-gray-600 transition cursor-pointer';
    logEntry.onclick = () => showLogDetails(log);
    
    // Determine action color
    let actionColor = 'text-gray-400';
    let actionIcon = 'fa-circle';
    
    switch (log.action) {
        case 'block':
            actionColor = 'text-red-500';
            actionIcon = 'fa-ban';
            break;
        case 'allow':
            actionColor = 'text-green-500';
            actionIcon = 'fa-check-circle';
            break;
        case 'isolate':
            actionColor = 'text-yellow-500';
            actionIcon = 'fa-exclamation-triangle';
            break;
        case 'inspect':
            actionColor = 'text-blue-500';
            actionIcon = 'fa-search';
            break;
    }
    
    // Determine level color
    let levelColor = 'text-gray-400';
    switch (log.level) {
        case 'error':
        case 'critical':
            levelColor = 'text-red-400';
            break;
        case 'warning':
            levelColor = 'text-yellow-400';
            break;
        case 'info':
            levelColor = 'text-blue-400';
            break;
    }
    
    logEntry.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex-1">
                <div class="flex items-center space-x-3">
                    <i class="fas ${actionIcon} ${actionColor}"></i>
                    <span class="text-xs text-gray-400">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span class="text-xs ${levelColor} uppercase">${log.level}</span>
                    <span class="font-semibold ${actionColor}">${log.action.toUpperCase()}</span>
                    ${log.ruleName ? `<span class="text-sm text-gray-300">${log.ruleName}</span>` : ''}
                </div>
                <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                        <span class="text-gray-400">Source:</span>
                        <span class="ml-2">${log.source.ip || 'Unknown'}</span>
                        ${log.source.country ? `<span class="ml-1 text-xs text-gray-500">(${log.source.country})</span>` : ''}
                    </div>
                    <div>
                        <span class="text-gray-400">Destination:</span>
                        <span class="ml-2">${log.destination.hostname || log.destination.ip || 'Unknown'}</span>
                    </div>
                </div>
                ${log.details.category ? `
                    <div class="mt-1">
                        <span class="inline-block px-2 py-1 text-xs bg-gray-600 rounded">
                            ${log.details.category}
                        </span>
                        ${log.details.threat ? `
                            <span class="inline-block px-2 py-1 text-xs bg-red-600 rounded ml-1">
                                Threat: ${log.details.threat}
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Add to container
    container.appendChild(logEntry);
    
    // Limit displayed logs
    while (container.children.length > 500) {
        container.removeChild(container.firstChild);
    }
    
    // Auto-scroll
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

function showLogDetails(log) {
    const modal = document.getElementById('logModal');
    const content = document.getElementById('logModalContent');
    
    content.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <h3 class="text-sm font-semibold text-gray-400 mb-2">General Information</h3>
                    <dl class="space-y-1 text-sm">
                        <div><dt class="inline text-gray-400">ID:</dt> <dd class="inline">${log.id}</dd></div>
                        <div><dt class="inline text-gray-400">Timestamp:</dt> <dd class="inline">${new Date(log.timestamp).toLocaleString()}</dd></div>
                        <div><dt class="inline text-gray-400">Level:</dt> <dd class="inline">${log.level}</dd></div>
                        <div><dt class="inline text-gray-400">Type:</dt> <dd class="inline">${log.type}</dd></div>
                        <div><dt class="inline text-gray-400">Action:</dt> <dd class="inline">${log.action}</dd></div>
                    </dl>
                </div>
                
                <div>
                    <h3 class="text-sm font-semibold text-gray-400 mb-2">Rule Information</h3>
                    <dl class="space-y-1 text-sm">
                        <div><dt class="inline text-gray-400">Rule ID:</dt> <dd class="inline">${log.ruleId || 'N/A'}</dd></div>
                        <div><dt class="inline text-gray-400">Rule Name:</dt> <dd class="inline">${log.ruleName || 'N/A'}</dd></div>
                    </dl>
                </div>
            </div>
            
            <div>
                <h3 class="text-sm font-semibold text-gray-400 mb-2">Source</h3>
                <dl class="space-y-1 text-sm">
                    ${log.source.ip ? `<div><dt class="inline text-gray-400">IP:</dt> <dd class="inline">${log.source.ip}</dd></div>` : ''}
                    ${log.source.country ? `<div><dt class="inline text-gray-400">Country:</dt> <dd class="inline">${log.source.country}</dd></div>` : ''}
                    ${log.source.asn ? `<div><dt class="inline text-gray-400">ASN:</dt> <dd class="inline">${log.source.asn}</dd></div>` : ''}
                    ${log.source.user ? `<div><dt class="inline text-gray-400">User:</dt> <dd class="inline">${log.source.user}</dd></div>` : ''}
                </dl>
            </div>
            
            <div>
                <h3 class="text-sm font-semibold text-gray-400 mb-2">Destination</h3>
                <dl class="space-y-1 text-sm">
                    ${log.destination.hostname ? `<div><dt class="inline text-gray-400">Hostname:</dt> <dd class="inline">${log.destination.hostname}</dd></div>` : ''}
                    ${log.destination.ip ? `<div><dt class="inline text-gray-400">IP:</dt> <dd class="inline">${log.destination.ip}</dd></div>` : ''}
                    ${log.destination.port ? `<div><dt class="inline text-gray-400">Port:</dt> <dd class="inline">${log.destination.port}</dd></div>` : ''}
                    ${log.destination.protocol ? `<div><dt class="inline text-gray-400">Protocol:</dt> <dd class="inline">${log.destination.protocol}</dd></div>` : ''}
                </dl>
            </div>
            
            <div>
                <h3 class="text-sm font-semibold text-gray-400 mb-2">Additional Details</h3>
                <pre class="bg-gray-900 p-3 rounded text-xs overflow-x-auto">${JSON.stringify(log.details, null, 2)}</pre>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
}

function closeLogModal() {
    document.getElementById('logModal').classList.add('hidden');
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (connected) {
        dot.className = 'w-3 h-3 bg-green-500 rounded-full mr-2 pulse-dot';
        text.textContent = 'Connected';
    } else {
        dot.className = 'w-3 h-3 bg-red-500 rounded-full mr-2';
        text.textContent = 'Disconnected';
    }
}

function initializeChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    
    activityChart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af'
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        color: '#374151'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    display: true,
                    beginAtZero: true,
                    grid: {
                        color: '#374151'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                }
            }
        }
    });
    
    // Update chart every 5 seconds
    setInterval(updateChart, 5000);
}

function updateChart() {
    const now = new Date().toLocaleTimeString();
    
    // Add new data point
    chartData.labels.push(now);
    chartData.datasets[0].data.push(stats.blocked);
    chartData.datasets[1].data.push(stats.allowed);
    
    // Keep only last 20 points
    if (chartData.labels.length > 20) {
        chartData.labels.shift();
        chartData.datasets[0].data.shift();
        chartData.datasets[1].data.shift();
    }
    
    activityChart.update();
}

function setupEventListeners() {
    // Pause/Resume button
    document.getElementById('pauseBtn').addEventListener('click', () => {
        isPaused = !isPaused;
        const btn = document.getElementById('pauseBtn');
        if (isPaused) {
            btn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume';
            btn.className = 'px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition';
        } else {
            btn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
            btn.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition';
        }
    });
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', () => {
        clearLogs();
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
        exportLogs();
    });
    
    // Auto-scroll checkbox
    document.getElementById('autoScroll').addEventListener('change', (e) => {
        autoScroll = e.target.checked;
    });
    
    // Apply filters button
    document.getElementById('applyFilters').addEventListener('click', () => {
        applyFilters();
    });
    
    // Search input (real-time)
    document.getElementById('searchInput').addEventListener('input', (e) => {
        if (e.target.value.length > 2 || e.target.value.length === 0) {
            applyFilters();
        }
    });
}

function clearLogs() {
    document.getElementById('logsContainer').innerHTML = '';
    logsBuffer = [];
    stats = {
        total: 0,
        blocked: 0,
        allowed: 0,
        isolated: 0,
        logsPerSec: 0
    };
    updateStats();
}

function exportLogs() {
    const dataStr = JSON.stringify(logsBuffer, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `gateway-logs-${new Date().toISOString()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function applyFilters() {
    const filter = {
        search: document.getElementById('searchInput').value,
        level: document.getElementById('levelFilter').value,
        action: document.getElementById('actionFilter').value
    };
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'filter',
            filter: filter
        }));
    }
}

function startStatsUpdater() {
    setInterval(updateStats, 1000);
}

function updateStats() {
    document.getElementById('totalLogs').textContent = stats.total;
    document.getElementById('blockedCount').textContent = stats.blocked;
    document.getElementById('allowedCount').textContent = stats.allowed;
    document.getElementById('isolatedCount').textContent = stats.isolated;
    document.getElementById('logsPerSec').textContent = stats.logsPerSec.toFixed(1);
}

// Calculate logs per second
let lastLogCount = 0;
setInterval(() => {
    const currentCount = stats.total;
    stats.logsPerSec = currentCount - lastLogCount;
    lastLogCount = currentCount;
}, 1000);