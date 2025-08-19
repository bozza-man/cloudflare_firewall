#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { GatewayClient } from '../api/gateway-client.js';
import { GatewayActivityMonitor } from '../streaming/gateway-activity-monitor.js';
import { LogStreamServer } from '../streaming/log-stream-server.js';
import express from 'express';
import { Server } from 'http';
// import path from 'path';
// import { fileURLToPath } from 'url';
import open from 'open';
import Table from 'cli-table3';
import type { GatewayRule } from '../types/gateway.js';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

interface MonitorOptions {
  interval?: number;
  port?: number;
  dashboardPort?: number;
  openBrowser?: boolean;
  consoleOnly?: boolean;
}

interface ActivityEvent {
  timestamp: string;
  severity: string;
  type: string;
  summary: string;
  details: {
    changes?: string[];
    [key: string]: unknown;
  };
}

interface MonitorStats {
  rules: {
    total: number;
    enabled: number;
    disabled: number;
    byAction: {
      block: number;
      allow: number;
      isolate: number;
    };
  };
  [key: string]: unknown;
}

export class MonitorCommand {
  private monitor: GatewayActivityMonitor | null = null;
  private streamServer: LogStreamServer | null = null;
  private expressApp: express.Application | null = null;
  private expressServer: Server | null = null;
  private gateway: GatewayClient | null = null;
  private wsPort: number = 8080;

  public getCommand(): Command {
    const command = new Command('monitor');
    
    command
      .description('Monitor Gateway configuration changes and rule activity in real-time')
      .option('-i, --interval <seconds>', 'Polling interval in seconds', '30')
      .option('-p, --port <port>', 'WebSocket server port', '8080')
      .option('-d, --dashboard-port <port>', 'Dashboard port', '3000')
      .option('-b, --open-browser', 'Open dashboard in browser')
      .option('-c, --console-only', 'Console output only (no web dashboard)')
      .action(async (options: MonitorOptions) => {
        await this.execute(options);
      });
    
    return command;
  }

  private async execute(options: MonitorOptions): Promise<void> {
    const spinner = ora('Starting Gateway monitor...').start();
    
    try {
      this.gateway = new GatewayClient();
      const interval = parseInt(String(options.interval || '30')) * 1000;
      
      // Create activity monitor
      this.monitor = new GatewayActivityMonitor(this.gateway, interval);
      
      if (options.consoleOnly) {
        // Console-only mode
        await this.startConsoleMode();
      } else {
        // Full dashboard mode
        const wsPort = parseInt(String(options.port || '8080'));
        const dashboardPort = parseInt(String(options.dashboardPort || '3000'));
        
        // Start WebSocket server
        this.streamServer = new LogStreamServer(wsPort);
        await this.streamServer.start();
        
        // Connect monitor to stream server
        this.monitor.on('log', (log) => {
          this.streamServer?.broadcastLog(log);
        });
        
        // Start dashboard
        await this.startDashboardServer(dashboardPort, wsPort);
        
        spinner.succeed('Gateway monitor started successfully');
        
        if (options.openBrowser) {
          await open(`http://localhost:${dashboardPort}`);
        }
        
        this.showWebInstructions(wsPort, dashboardPort);
      }
      
      // Start monitoring
      this.monitor.on('activity', (event) => {
        this.displayActivity(event);
      });
      
      this.monitor.on('snapshot', (stats) => {
        if (options.consoleOnly) {
          this.displaySnapshot(stats);
        }
      });
      
      await this.monitor.start();
      
      // Also fetch and display current state
      await this.displayCurrentState();
      
      // Setup shutdown handlers
      this.setupShutdownHandlers();
      
    } catch (error) {
      spinner.fail('Failed to start monitor');
      console.error(error);
      process.exit(1);
    }
  }

  private async startConsoleMode(): Promise<void> {
    console.log(chalk.cyan.bold('\n📊 Gateway Monitor - Console Mode\n'));
    const interval = 30; // Default to 30 seconds
    console.log(chalk.gray(`Polling every ${interval} seconds...`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));
  }

  private async displayCurrentState(): Promise<void> {
    const spinner = ora('Fetching current Gateway state...').start();
    
    try {
      const rules = await this.gateway!.listGatewayRules();
      const lists = await this.gateway!.listGatewayLists();
      const categories = await this.gateway!.listGatewayCategories();
      
      spinner.succeed('Current state fetched');
      
      console.log(chalk.cyan.bold('\n📋 Current Gateway Configuration:\n'));
      
      // Rules summary
      const enabledRules = rules.filter(r => r.enabled);
      const byAction = this.groupByAction(rules);
      
      const summaryTable = new Table({
        head: ['Metric', 'Value'],
        style: { head: ['cyan'] }
      });
      
      summaryTable.push(
        ['Total Rules', rules.length.toString()],
        ['Enabled Rules', enabledRules.length.toString()],
        ['Disabled Rules', (rules.length - enabledRules.length).toString()],
        ['Block Rules', (byAction.block || 0).toString()],
        ['Allow Rules', (byAction.allow || 0).toString()],
        ['Isolate Rules', (byAction.isolate || 0).toString()],
        ['Lists', lists.length.toString()],
        ['Categories', categories.length.toString()]
      );
      
      console.log(summaryTable.toString());
      
      // Top rules by precedence
      console.log(chalk.cyan.bold('\n🔝 Top Priority Rules (by precedence):\n'));
      
      const topRules = [...rules]
        .sort((a, b) => a.precedence - b.precedence)
        .slice(0, 10);
      
      const rulesTable = new Table({
        head: ['Precedence', 'Name', 'Action', 'Status'],
        style: { head: ['cyan'] },
        colWidths: [12, 40, 10, 10]
      });
      
      topRules.forEach(rule => {
        const status = rule.enabled ? chalk.green('Enabled') : chalk.gray('Disabled');
        const action = this.colorizeAction(rule.action);
        rulesTable.push([
          rule.precedence.toString(),
          rule.name.substring(0, 38),
          action,
          status
        ]);
      });
      
      console.log(rulesTable.toString());
      
    } catch (error) {
      spinner.fail('Failed to fetch current state');
      console.error(error);
    }
  }

  private displayActivity(event: ActivityEvent): void {
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    const severity = this.colorizeSeverity(event.severity);
    const type = this.colorizeType(event.type);
    
    console.log(`${chalk.gray(timestamp)} ${severity} ${type} ${event.summary}`);
    
    if (event.details.changes && event.details.changes.length > 0) {
      event.details.changes.forEach((change: string) => {
        console.log(chalk.gray(`  → ${change}`));
      });
    }
  }

  private displaySnapshot(stats: MonitorStats): void {
    const table = new Table({
      head: ['Rules', 'Enabled', 'Disabled', 'Block', 'Allow', 'Isolate'],
      style: { head: ['cyan'] }
    });
    
    const byAction = (stats as any).byAction || {};
    table.push([
      stats.rulesCount,
      stats.enabledCount,
      stats.disabledCount,
      byAction.block || 0,
      byAction.allow || 0,
      byAction.isolate || 0
    ]);
    
    console.log('\n' + table.toString());
  }

  private groupByAction(rules: GatewayRule[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const rule of rules) {
      groups[rule.action] = (groups[rule.action] || 0) + 1;
    }
    return groups;
  }

  private colorizeAction(action: string): string {
    switch (action) {
      case 'block': return chalk.red(action);
      case 'allow': return chalk.green(action);
      case 'isolate': return chalk.yellow(action);
      case 'inspect': return chalk.blue(action);
      default: return action;
    }
  }

  private colorizeSeverity(severity: string): string {
    switch (severity) {
      case 'critical': return chalk.red('[CRITICAL]');
      case 'warning': return chalk.yellow('[WARNING]');
      case 'info': return chalk.blue('[INFO]');
      default: return `[${severity.toUpperCase()}]`;
    }
  }

  private colorizeType(type: string): string {
    switch (type) {
      case 'rule_added': return chalk.green('➕ Added');
      case 'rule_removed': return chalk.red('➖ Removed');
      case 'rule_modified': return chalk.yellow('✏️  Modified');
      case 'rule_enabled': return chalk.green('✅ Enabled');
      case 'rule_disabled': return chalk.gray('⏸  Disabled');
      case 'precedence_changed': return chalk.blue('🔄 Reordered');
      case 'filter_changed': return chalk.magenta('🔍 Filter Changed');
      default: return type;
    }
  }

  private async startDashboardServer(port: number, wsPort?: number): Promise<void> {
    this.expressApp = express();
    this.wsPort = wsPort || 8080;
    
    // Serve the existing dashboard HTML
    this.expressApp.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });
    
    // Serve dashboard.js inline
    this.expressApp.get('/dashboard.js', (req, res) => {
      res.type('application/javascript');
      res.send(this.getDashboardJS(this.wsPort));
    });
    
    // API endpoints
    this.expressApp.get('/api/current-state', async (req, res) => {
      try {
        const rules = await this.gateway!.listGatewayRules();
        const lists = await this.gateway!.listGatewayLists();
        const categories = await this.gateway!.listGatewayCategories();
        
        res.json({
          rules,
          lists,
          categories,
          stats: {
            totalRules: rules.length,
            enabledRules: rules.filter(r => r.enabled).length,
            byAction: this.groupByAction(rules)
          }
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch state' });
      }
    });
    
    this.expressApp.get('/api/activity', (req, res) => {
      const log = this.monitor?.getActivityLog() || [];
      res.json(log);
    });
    
    this.expressApp.get('/api/rule/:id/impact', async (req, res) => {
      const impact = await this.monitor?.testRuleImpact(req.params.id);
      res.json(impact || { error: 'Rule not found' });
    });
    
    return new Promise((resolve, reject) => {
      this.expressServer = this.expressApp!.listen(port, () => {
        resolve();
      });
      
      this.expressServer.on('error', reject);
    });
  }

  private showWebInstructions(wsPort: number, dashboardPort: number): void {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('Gateway Monitor Running'));
    console.log(chalk.cyan('═'.repeat(60)));
    
    console.log('\n' + chalk.white('📡 WebSocket Server:'));
    console.log(chalk.gray(`   ws://localhost:${wsPort}`));
    
    console.log('\n' + chalk.white('🌐 Dashboard:'));
    console.log(chalk.gray(`   http://localhost:${dashboardPort}`));
    
    console.log('\n' + chalk.white('📊 API Endpoints:'));
    console.log(chalk.gray(`   GET http://localhost:${dashboardPort}/api/current-state`));
    console.log(chalk.gray(`   GET http://localhost:${dashboardPort}/api/activity`));
    console.log(chalk.gray(`   GET http://localhost:${dashboardPort}/api/rule/:id/impact`));
    
    console.log('\n' + chalk.yellow('Press Ctrl+C to stop'));
    console.log(chalk.cyan('═'.repeat(60)) + '\n');
  }

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gateway Monitor - Real-time Configuration Tracking</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-gray-900 text-gray-100">
    <header class="bg-gray-800 border-b border-gray-700 p-4">
        <div class="container mx-auto flex justify-between items-center">
            <h1 class="text-2xl font-bold flex items-center">
                <i class="fas fa-shield-alt text-blue-500 mr-2"></i>
                Gateway Configuration Monitor
            </h1>
            <div class="flex items-center space-x-4">
                <div id="connectionStatus" class="flex items-center">
                    <div class="w-3 h-3 bg-red-500 rounded-full mr-2" id="statusDot"></div>
                    <span id="statusText" class="text-sm">Disconnected</span>
                </div>
                <button onclick="refreshState()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                    <i class="fas fa-sync mr-2"></i>Refresh
                </button>
            </div>
        </div>
    </header>

    <div class="container mx-auto p-4">
        <div class="grid grid-cols-3 gap-4">
            <!-- Stats Cards -->
            <div class="bg-gray-800 rounded-lg p-4">
                <h2 class="text-lg font-semibold mb-3">📊 Statistics</h2>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-400">Total Rules:</span>
                        <span id="totalRules" class="font-bold">-</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Enabled:</span>
                        <span id="enabledRules" class="text-green-500 font-bold">-</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Block Rules:</span>
                        <span id="blockRules" class="text-red-500 font-bold">-</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Allow Rules:</span>
                        <span id="allowRules" class="text-green-500 font-bold">-</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Lists:</span>
                        <span id="totalLists" class="font-bold">-</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-400">Categories:</span>
                        <span id="totalCategories" class="font-bold">-</span>
                    </div>
                </div>
            </div>

            <!-- Activity Log -->
            <div class="bg-gray-800 rounded-lg p-4 col-span-2">
                <h2 class="text-lg font-semibold mb-3">📜 Configuration Changes</h2>
                <div id="activityLog" class="space-y-2 max-h-96 overflow-y-auto">
                    <div class="text-gray-500 text-sm">Monitoring for changes...</div>
                </div>
            </div>
        </div>

        <!-- Rules Table -->
        <div class="bg-gray-800 rounded-lg p-4 mt-4">
            <h2 class="text-lg font-semibold mb-3">🛡️ Gateway Rules</h2>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="border-b border-gray-700">
                        <tr>
                            <th class="text-left p-2">Precedence</th>
                            <th class="text-left p-2">Name</th>
                            <th class="text-left p-2">Action</th>
                            <th class="text-left p-2">Status</th>
                            <th class="text-left p-2">Filter</th>
                        </tr>
                    </thead>
                    <tbody id="rulesTable" class="divide-y divide-gray-700">
                        <tr><td colspan="5" class="text-center p-4 text-gray-500">Loading rules...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="/dashboard.js"></script>
</body>
</html>`;
  }

  private getDashboardJS(wsPort: number): string {
    return `
let ws = null;
let currentState = null;

// Connect to WebSocket
function connectWebSocket() {
    const wsUrl = 'ws://localhost:${wsPort}';
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to monitor');
        updateConnectionStatus(true);
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
        console.log('Disconnected from monitor');
        updateConnectionStatus(false);
        setTimeout(connectWebSocket, 5000);
    };
}

function handleMessage(message) {
    if (message.type === 'log') {
        addActivityLog(message.data);
    }
}

function updateConnectionStatus(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    
    if (connected) {
        dot.className = 'w-3 h-3 bg-green-500 rounded-full mr-2';
        text.textContent = 'Connected';
    } else {
        dot.className = 'w-3 h-3 bg-red-500 rounded-full mr-2';
        text.textContent = 'Disconnected';
    }
}

function addActivityLog(log) {
    const container = document.getElementById('activityLog');
    const entry = document.createElement('div');
    entry.className = 'p-2 bg-gray-700 rounded text-sm';
    
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const actionClass = log.action === 'rule_added' ? 'text-green-400' : 
                       log.action === 'rule_removed' ? 'text-red-400' : 
                       'text-yellow-400';
    
    entry.innerHTML = \`
        <div class="flex justify-between">
            <span class="\${actionClass}">\${log.action}</span>
            <span class="text-gray-500">\${timestamp}</span>
        </div>
        <div class="text-gray-300">\${log.details?.summary || log.ruleName || 'Configuration change'}</div>
    \`;
    
    container.insertBefore(entry, container.firstChild);
    
    // Keep only last 50 entries
    while (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

async function refreshState() {
    try {
        const response = await fetch('/api/current-state');
        const data = await response.json();
        currentState = data;
        updateUI(data);
    } catch (error) {
        console.error('Failed to fetch state:', error);
    }
}

function updateUI(data) {
    // Update stats
    document.getElementById('totalRules').textContent = data.rules.length;
    document.getElementById('enabledRules').textContent = data.rules.filter(r => r.enabled).length;
    document.getElementById('blockRules').textContent = data.stats.byAction.block || 0;
    document.getElementById('allowRules').textContent = data.stats.byAction.allow || 0;
    document.getElementById('totalLists').textContent = data.lists.length;
    document.getElementById('totalCategories').textContent = data.categories.length;
    
    // Update rules table
    const tbody = document.getElementById('rulesTable');
    tbody.innerHTML = '';
    
    const sortedRules = [...data.rules].sort((a, b) => a.precedence - b.precedence);
    
    sortedRules.forEach(rule => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-700';
        
        const actionClass = rule.action === 'block' ? 'text-red-500' : 
                           rule.action === 'allow' ? 'text-green-500' : 
                           'text-yellow-500';
        
        const statusClass = rule.enabled ? 'text-green-400' : 'text-gray-500';
        
        row.innerHTML = \`
            <td class="p-2">\${rule.precedence}</td>
            <td class="p-2">\${rule.name}</td>
            <td class="p-2 \${actionClass}">\${rule.action}</td>
            <td class="p-2 \${statusClass}">\${rule.enabled ? 'Enabled' : 'Disabled'}</td>
            <td class="p-2 text-xs text-gray-400 max-w-md truncate" title="\${rule.traffic || ''}">\${rule.traffic || '-'}</td>
        \`;
        
        tbody.appendChild(row);
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    refreshState();
    
    // Refresh every 30 seconds
    setInterval(refreshState, 30000);
});

// Make refreshState available globally
window.refreshState = refreshState;
`;
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      console.log('\n' + chalk.yellow('Shutting down...'));
      
      try {
        if (this.monitor) {
          this.monitor.stop();
        }
        
        if (this.streamServer) {
          await this.streamServer.stop();
        }
        
        if (this.expressServer) {
          await new Promise((resolve) => {
            this.expressServer!.close(resolve as () => void);
          });
        }
        
        console.log(chalk.green('✓ Shutdown complete'));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Error during shutdown:'), error);
        process.exit(1);
      }
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}