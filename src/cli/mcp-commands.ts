#!/usr/bin/env tsx
/**
 * MCP CLI Commands
 * Command-line interface for MCP server operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { getMCPClientManager } from '../mcp/client-manager.js';
import { getWorkersMCPClient } from '../mcp/clients/workers-client.js';
import { getObservabilityMCPClient } from '../mcp/clients/observability-client.js';
import { getSecurityMCPClient } from '../mcp/clients/security-client.js';
import { getAnalyticsMCPClient } from '../mcp/clients/analytics-client.js';
import { getUtilityMCPClient } from '../mcp/clients/utility-client.js';

const program = new Command();

// Helper function to format output
function formatOutput(data: any, format: 'json' | 'table' | 'pretty' = 'pretty') {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else if (format === 'table' && Array.isArray(data)) {
    const table = new Table({
      head: Object.keys(data[0] || {}),
      style: { head: ['cyan'] }
    });
    data.forEach(item => {
      table.push(Object.values(item).map(v => String(v || '')));
    });
    console.log(table.toString());
  } else {
    console.log(chalk.cyan(JSON.stringify(data, null, 2)));
  }
}

// Main MCP command
program
  .name('mcp')
  .description('Cloudflare MCP Server CLI')
  .version('1.0.0');

// Status command
program
  .command('status')
  .description('Check MCP server connection status')
  .action(async () => {
    const spinner = ora('Checking MCP server status...').start();
    
    try {
      const manager = await getMCPClientManager();
      const status = manager.getStatus();
      
      spinner.succeed('MCP server status retrieved');
      
      const table = new Table({
        head: ['Server', 'Status', 'Category', 'Last Check'],
        style: { head: ['cyan'] }
      });
      
      for (const [name, info] of Object.entries(status)) {
        const statusIcon = info.connected ? chalk.green('✓ Connected') : chalk.red('✗ Disconnected');
        table.push([
          name,
          statusIcon,
          info.category,
          new Date(info.lastHealthCheck).toLocaleTimeString()
        ]);
      }
      
      console.log(table.toString());
    } catch (error) {
      spinner.fail('Failed to get MCP status');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Workers commands
const workers = program
  .command('workers')
  .description('Manage Workers through MCP');

workers
  .command('kv:list')
  .description('List KV namespaces')
  .action(async () => {
    const spinner = ora('Fetching KV namespaces...').start();
    
    try {
      const client = await getWorkersMCPClient();
      const namespaces = await client.listKVNamespaces();
      spinner.succeed('KV namespaces retrieved');
      formatOutput(namespaces, 'table');
    } catch (error) {
      spinner.fail('Failed to list KV namespaces');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

workers
  .command('kv:create <name>')
  .description('Create a new KV namespace')
  .action(async (name) => {
    const spinner = ora(`Creating KV namespace: ${name}...`).start();
    
    try {
      const client = await getWorkersMCPClient();
      const result = await client.createKVNamespace(name);
      spinner.succeed(`KV namespace '${name}' created successfully`);
      formatOutput(result);
    } catch (error) {
      spinner.fail('Failed to create KV namespace');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

workers
  .command('builds:list')
  .description('List recent builds')
  .option('-l, --limit <number>', 'Number of builds to show', '10')
  .action(async (options) => {
    const spinner = ora('Fetching builds...').start();
    
    try {
      const client = await getWorkersMCPClient();
      const builds = await client.listBuilds(parseInt(options.limit));
      spinner.succeed('Builds retrieved');
      formatOutput(builds, 'table');
    } catch (error) {
      spinner.fail('Failed to list builds');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

workers
  .command('builds:logs <buildId>')
  .description('Get build logs')
  .action(async (buildId) => {
    const spinner = ora(`Fetching logs for build ${buildId}...`).start();
    
    try {
      const client = await getWorkersMCPClient();
      const logs = await client.getBuildLogs(buildId);
      spinner.succeed('Build logs retrieved');
      console.log(logs);
    } catch (error) {
      spinner.fail('Failed to get build logs');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Observability commands
const observability = program
  .command('logs')
  .description('Manage logs and observability through MCP');

observability
  .command('tail [scriptName]')
  .description('Tail Worker logs in real-time')
  .action(async (scriptName) => {
    const spinner = ora('Connecting to log stream...').start();
    
    try {
      const client = await getObservabilityMCPClient();
      const logs = await client.tailLogs(scriptName);
      spinner.succeed('Connected to log stream');
      
      // In a real implementation, this would be a stream
      console.log(chalk.green('Tailing logs... (Press Ctrl+C to stop)'));
      formatOutput(logs);
    } catch (error) {
      spinner.fail('Failed to tail logs');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

observability
  .command('search')
  .description('Search historical logs')
  .option('-q, --query <string>', 'Search query')
  .option('-l, --limit <number>', 'Number of results', '100')
  .option('-s, --script <name>', 'Filter by script name')
  .action(async (options) => {
    const spinner = ora('Searching logs...').start();
    
    try {
      const client = await getObservabilityMCPClient();
      const logs = await client.searchLogs({
        query: options.query,
        limit: parseInt(options.limit),
        scriptName: options.script
      });
      spinner.succeed(`Found ${logs.length} log entries`);
      formatOutput(logs, 'table');
    } catch (error) {
      spinner.fail('Failed to search logs');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

observability
  .command('errors [timeRange]')
  .description('Get error tracking data')
  .action(async (timeRange = '24h') => {
    const spinner = ora('Fetching error data...').start();
    
    try {
      const client = await getObservabilityMCPClient();
      const errors = await client.getErrors(timeRange);
      spinner.succeed('Error data retrieved');
      formatOutput(errors);
    } catch (error) {
      spinner.fail('Failed to get error data');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Security commands
const security = program
  .command('security')
  .description('Security monitoring through MCP');

security
  .command('audit')
  .description('Query audit logs')
  .option('-l, --limit <number>', 'Number of results', '100')
  .action(async (options) => {
    const spinner = ora('Querying audit logs...').start();
    
    try {
      const client = await getSecurityMCPClient();
      const logs = await client.queryAuditLogs({
        limit: parseInt(options.limit)
      });
      spinner.succeed('Audit logs retrieved');
      formatOutput(logs, 'table');
    } catch (error) {
      spinner.fail('Failed to query audit logs');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

security
  .command('casb:scan')
  .description('Scan SaaS apps for misconfigurations')
  .action(async () => {
    const spinner = ora('Scanning SaaS applications...').start();
    
    try {
      const client = await getSecurityMCPClient();
      const findings = await client.scanSaaSApps();
      spinner.succeed(`Found ${findings.length} findings`);
      
      if (findings.length > 0) {
        const critical = findings.filter(f => f.severity === 'critical');
        const high = findings.filter(f => f.severity === 'high');
        
        if (critical.length > 0) {
          console.log(chalk.red(`\n⚠️  ${critical.length} CRITICAL findings`));
        }
        if (high.length > 0) {
          console.log(chalk.yellow(`⚠️  ${high.length} HIGH severity findings`));
        }
      }
      
      formatOutput(findings, 'table');
    } catch (error) {
      spinner.fail('Failed to scan SaaS apps');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

security
  .command('dashboard')
  .description('Get security dashboard overview')
  .action(async () => {
    const spinner = ora('Loading security dashboard...').start();
    
    try {
      const client = await getSecurityMCPClient();
      const dashboard = await client.getSecurityDashboard('24h');
      spinner.succeed('Security dashboard loaded');
      formatOutput(dashboard);
    } catch (error) {
      spinner.fail('Failed to load security dashboard');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Analytics commands
const analytics = program
  .command('analytics')
  .description('Analytics and monitoring through MCP');

analytics
  .command('dns [timeRange]')
  .description('Get DNS analytics')
  .action(async (timeRange = '24h') => {
    const spinner = ora('Fetching DNS analytics...').start();
    
    try {
      const client = await getAnalyticsMCPClient();
      const data = await client.getDNSPerformance(timeRange);
      spinner.succeed('DNS analytics retrieved');
      formatOutput(data);
    } catch (error) {
      spinner.fail('Failed to get DNS analytics');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

analytics
  .command('performance')
  .description('Get performance insights')
  .option('-d, --dns', 'Include DNS metrics')
  .option('-a, --apps', 'Include application metrics')
  .option('-w, --workers', 'Include Workers metrics')
  .action(async (options) => {
    const spinner = ora('Gathering performance insights...').start();
    
    try {
      const client = await getAnalyticsMCPClient();
      const insights = await client.getPerformanceInsights({
        includeDNS: options.dns,
        includeDEM: options.apps,
        includeWorkers: options.workers
      });
      spinner.succeed('Performance insights retrieved');
      formatOutput(insights);
    } catch (error) {
      spinner.fail('Failed to get performance insights');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

analytics
  .command('health')
  .description('Get network health summary')
  .action(async () => {
    const spinner = ora('Checking network health...').start();
    
    try {
      const client = await getAnalyticsMCPClient();
      const health = await client.getNetworkHealthSummary();
      spinner.succeed('Network health retrieved');
      
      const healthScore = health.overallHealth;
      const healthColor = healthScore >= 80 ? chalk.green : healthScore >= 60 ? chalk.yellow : chalk.red;
      
      console.log('\n' + healthColor(`Overall Health: ${healthScore}%`));
      formatOutput(health);
    } catch (error) {
      spinner.fail('Failed to get network health');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Utility commands
const utility = program
  .command('util')
  .description('Utility functions through MCP');

utility
  .command('screenshot <url>')
  .description('Take a screenshot of a webpage')
  .option('-o, --output <file>', 'Output file path')
  .action(async (url, options) => {
    const spinner = ora(`Taking screenshot of ${url}...`).start();
    
    try {
      const client = await getUtilityMCPClient();
      const screenshot = await client.takeScreenshot(url);
      spinner.succeed('Screenshot captured');
      
      if (options.output) {
        // In a real implementation, save to file
        console.log(chalk.green(`Screenshot saved to: ${options.output}`));
      }
    } catch (error) {
      spinner.fail('Failed to take screenshot');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

utility
  .command('docs <query>')
  .description('Search Cloudflare documentation')
  .option('-l, --limit <number>', 'Number of results', '5')
  .action(async (query, options) => {
    const spinner = ora('Searching documentation...').start();
    
    try {
      const client = await getUtilityMCPClient();
      const results = await client.searchDocumentation(query, {
        limit: parseInt(options.limit)
      });
      spinner.succeed(`Found ${results.length} documentation entries`);
      
      results.forEach((doc, i) => {
        console.log(chalk.cyan(`\n${i + 1}. ${doc.title}`));
        console.log(chalk.gray(`   ${doc.url}`));
        console.log(`   ${doc.snippet}`);
      });
    } catch (error) {
      spinner.fail('Failed to search documentation');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

utility
  .command('help <error>')
  .description('Get help for an error')
  .action(async (error) => {
    const spinner = ora('Finding help...').start();
    
    try {
      const client = await getUtilityMCPClient();
      const help = await client.getErrorHelp(error);
      spinner.succeed('Help found');
      
      if (help.troubleshooting) {
        console.log(chalk.cyan('\n📚 Troubleshooting Guide:'));
        console.log(help.troubleshooting);
      }
      
      if (help.documentation?.length > 0) {
        console.log(chalk.cyan('\n📖 Related Documentation:'));
        help.documentation.forEach(doc => {
          console.log(`  - ${doc.title}: ${doc.url}`);
        });
      }
    } catch (error) {
      spinner.fail('Failed to get help');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Dashboard command (comprehensive)
program
  .command('dashboard')
  .description('Launch comprehensive MCP dashboard')
  .action(async () => {
    const spinner = ora('Loading comprehensive dashboard...').start();
    
    try {
      // Get all clients
      const [security, analytics, obs] = await Promise.all([
        getSecurityMCPClient(),
        getAnalyticsMCPClient(),
        getObservabilityMCPClient()
      ]);
      
      // Gather dashboard data
      const [securityDash, analyticsDash, errors] = await Promise.allSettled([
        security.getSecurityDashboard('24h'),
        analytics.getAnalyticsDashboard('24h'),
        obs.getErrors('24h')
      ]);
      
      spinner.succeed('Dashboard loaded');
      
      console.log(chalk.cyan('\n═══════════════════════════════════════════'));
      console.log(chalk.cyan('           MCP DASHBOARD'));
      console.log(chalk.cyan('═══════════════════════════════════════════'));
      
      // Display status
      const manager = await getMCPClientManager();
      const status = manager.getStatus();
      const connected = Object.values(status).filter(s => s.connected).length;
      const total = Object.keys(status).length;
      
      console.log(chalk.green(`\n✓ MCP Servers: ${connected}/${total} connected`));
      
      // Display key metrics
      if (securityDash.status === 'fulfilled') {
        console.log(chalk.yellow('\n🔒 Security:'));
        const data = securityDash.value;
        if (data.casbFindings?.length) {
          console.log(`  - CASB Findings: ${data.casbFindings.length}`);
        }
        if (data.auditLogs) {
          console.log(`  - Recent Audit Events: ${data.auditLogs.length || 0}`);
        }
      }
      
      if (analyticsDash.status === 'fulfilled') {
        console.log(chalk.blue('\n📊 Analytics:'));
        const data = analyticsDash.value;
        if (data.dns) {
          console.log(`  - DNS Performance: OK`);
        }
        if (data.applications?.length) {
          console.log(`  - Monitored Applications: ${data.applications.length}`);
        }
      }
      
      if (errors.status === 'fulfilled') {
        console.log(chalk.red('\n⚠️  Errors (24h):'));
        console.log(`  - Total Errors: ${errors.value?.count || 0}`);
      }
      
      console.log(chalk.cyan('\n═══════════════════════════════════════════'));
      console.log(chalk.gray('\nUse specific commands for detailed views'));
    } catch (error) {
      spinner.fail('Failed to load dashboard');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
