#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import express from 'express';
import { Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { LogStreamServer } from '../streaming/log-stream-server.js';
import { GatewayLogCollector } from '../streaming/gateway-log-collector.js';
import { GatewayClient } from '../api/gateway-client.js';
import open from 'open';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StreamOptions {
  port?: number;
  dashboardPort?: number;
  pollInterval?: number;
  openBrowser?: boolean;
  simulate?: boolean;
  enableAudit?: boolean;
  enableActivity?: boolean;
  enableDns?: boolean;
  enableHttp?: boolean;
}

export class StreamLogsCommand {
  private streamServer: LogStreamServer | null = null;
  private logCollector: GatewayLogCollector | null = null;
  private expressApp: express.Application | null = null;
  private expressServer: Server | null = null;

  public getCommand(): Command {
    const command = new Command('stream');
    
    command
      .description('Stream Gateway logs in real-time with web dashboard')
      .option('-p, --port <port>', 'WebSocket server port', '8080')
      .option('-d, --dashboard-port <port>', 'Dashboard web server port', '3000')
      .option('-i, --poll-interval <ms>', 'Log polling interval in ms', '5000')
      .option('-b, --open-browser', 'Open dashboard in browser automatically')
      .option('-s, --simulate', 'Simulate logs for testing')
      .option('--no-audit', 'Disable audit log collection')
      .option('--no-activity', 'Disable activity log collection')
      .option('--no-dns', 'Disable DNS log collection')
      .option('--no-http', 'Disable HTTP log collection')
      .action(async (options: StreamOptions) => {
        await this.execute(options);
      });
    
    return command;
  }

  private async execute(options: StreamOptions): Promise<void> {
    const spinner = ora('Starting log streaming server...').start();
    
    try {
      // Parse options
      const wsPort = parseInt(String(options.port || '8080'));
      const dashboardPort = parseInt(String(options.dashboardPort || '3000'));
      const pollInterval = parseInt(String(options.pollInterval || '5000'));
      
      // Start WebSocket server
      this.streamServer = new LogStreamServer(wsPort);
      await this.streamServer.start();
      spinner.succeed(`WebSocket server started on port ${wsPort}`);
      
      // Start dashboard web server
      await this.startDashboardServer(dashboardPort);
      spinner.succeed(`Dashboard server started on http://localhost:${dashboardPort}`);
      
      // Initialize Gateway client and log collector
      if (!options.simulate) {
        const gateway = new GatewayClient();
        this.logCollector = new GatewayLogCollector(gateway, {
          pollInterval,
          enableAuditLogs: options.enableAudit !== false,
          enableActivityLogs: options.enableActivity !== false,
          enableDnsLogs: options.enableDns !== false,
          enableHttpLogs: options.enableHttp !== false
        });
        
        // Connect collector to stream server
        this.logCollector.on('log', (log) => {
          this.streamServer?.broadcastLog(log);
        });
        
        this.logCollector.on('error', (error) => {
          console.error(chalk.red('Log collector error:'), error);
        });
        
        await this.logCollector.start();
        spinner.succeed('Log collector started');
      } else {
        spinner.succeed('Running in simulation mode');
        this.startSimulation();
      }
      
      // Open browser if requested
      if (options.openBrowser) {
        await open(`http://localhost:${dashboardPort}`);
        console.log(chalk.green('✓ Dashboard opened in browser'));
      }
      
      // Show instructions
      this.showInstructions(wsPort, dashboardPort);
      
      // Handle shutdown
      this.setupShutdownHandlers();
      
    } catch (error) {
      spinner.fail('Failed to start log streaming');
      console.error(error);
      process.exit(1);
    }
  }

  private async startDashboardServer(port: number): Promise<void> {
    this.expressApp = express();
    
    // Serve static dashboard files
    const dashboardPath = path.join(__dirname, '../streaming/dashboard');
    this.expressApp.use(express.static(dashboardPath));
    
    // API endpoints
    this.expressApp.get('/api/stats', (req, res) => {
      if (this.streamServer) {
        res.json({
          server: this.streamServer.getStats(),
          collector: this.logCollector?.getStats() || null
        });
      } else {
        res.status(503).json({ error: 'Server not running' });
      }
    });
    
    // Health check
    this.expressApp.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    return new Promise((resolve, reject) => {
      this.expressServer = this.expressApp!.listen(port, () => {
        resolve();
      });
      
      this.expressServer.on('error', reject);
    });
  }

  private startSimulation(): void {
    if (!this.streamServer) return;
    
    // Simulate different types of logs
    const simulateLog = () => {
      const actions = ['block', 'allow', 'isolate', 'inspect'];
      const levels = ['info', 'warning', 'error', 'debug'];
      const domains = [
        'facebook.com', 'twitter.com', 'github.com', 'google.com',
        'malicious-site.com', 'phishing-attempt.net', 'amazon.com',
        'microsoft.com', 'slack.com', 'zoom.us'
      ];
      const categories = [
        'Social Media', 'Development', 'Malware', 'Phishing',
        'Business', 'Communication', 'Shopping', 'News'
      ];
      const rules = [
        { id: 'rule-001', name: 'Block Social Media' },
        { id: 'rule-002', name: 'Allow Business Sites' },
        { id: 'rule-003', name: 'Isolate Threats' },
        { id: 'rule-004', name: 'Inspect Downloads' }
      ];
      
      const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
      
      const log = {
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        level: randomElement(levels) as 'info' | 'warn' | 'error' | 'debug',
        type: 'activity',
        action: randomElement(actions),
        ruleId: randomElement(rules).id,
        ruleName: randomElement(rules).name,
        source: {
          ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          country: randomElement(['US', 'UK', 'DE', 'FR', 'JP', 'CN', 'AU']),
          user: `user${Math.floor(Math.random() * 100)}`
        },
        destination: {
          hostname: randomElement(domains),
          port: randomElement([80, 443, 8080, 3000])
        },
        details: {
          category: randomElement(categories),
          threat: Math.random() > 0.8 ? randomElement(['malware', 'phishing', 'ransomware']) : undefined,
          method: randomElement(['GET', 'POST', 'PUT', 'DELETE']),
          statusCode: randomElement([200, 301, 403, 404, 500])
        }
      };
      
      this.streamServer?.broadcastLog(log);
    };
    
    // Generate logs at random intervals
    const generateLogs = () => {
      simulateLog();
      
      // Random delay between 100ms and 2000ms
      const delay = Math.random() * 1900 + 100;
      setTimeout(generateLogs, delay);
    };
    
    // Start simulation
    generateLogs();
    
    // Generate burst of logs occasionally
    setInterval(() => {
      const burstSize = Math.floor(Math.random() * 10) + 5;
      for (let i = 0; i < burstSize; i++) {
        setTimeout(simulateLog, i * 50);
      }
    }, 10000);
  }

  private showInstructions(wsPort: number, dashboardPort: number): void {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('Gateway Log Streaming Server Running'));
    console.log(chalk.cyan('═'.repeat(60)));
    
    console.log('\n' + chalk.white('📡 WebSocket Server:'));
    console.log(chalk.gray(`   ws://localhost:${wsPort}`));
    
    console.log('\n' + chalk.white('🌐 Dashboard:'));
    console.log(chalk.gray(`   http://localhost:${dashboardPort}`));
    
    console.log('\n' + chalk.white('📊 API Endpoints:'));
    console.log(chalk.gray(`   GET http://localhost:${dashboardPort}/api/stats`));
    console.log(chalk.gray(`   GET http://localhost:${dashboardPort}/health`));
    
    console.log('\n' + chalk.white('🔌 WebSocket Client Example:'));
    console.log(chalk.gray(`   const ws = new WebSocket('ws://localhost:${wsPort}');`));
    console.log(chalk.gray(`   ws.on('message', (data) => console.log(JSON.parse(data)));`));
    
    console.log('\n' + chalk.yellow('Press Ctrl+C to stop the server'));
    console.log(chalk.cyan('═'.repeat(60)) + '\n');
  }

  private setupShutdownHandlers(): void {
    const shutdown = async () => {
      console.log('\n' + chalk.yellow('Shutting down...'));
      
      try {
        // Stop log collector
        if (this.logCollector) {
          this.logCollector.stop();
        }
        
        // Stop WebSocket server
        if (this.streamServer) {
          await this.streamServer.stop();
        }
        
        // Stop Express server
        if (this.expressServer) {
          await new Promise((resolve) => {
            this.expressServer.close(resolve);
          });
        }
        
        console.log(chalk.green('✓ Shutdown complete'));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('Error during shutdown:'), error);
        process.exit(1);
      }
    };
    
    // Handle various shutdown signals
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
  }
}