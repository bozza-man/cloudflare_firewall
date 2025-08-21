#!/usr/bin/env tsx
/**
 * Simple MCP Authentication using existing Cloudflare API Token
 * This bypasses OAuth and uses your existing API credentials
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';

dotenv.config();

interface MCPServerConfig {
  name: string;
  url: string;
  displayName: string;
  description: string;
}

const MCP_SERVERS: MCPServerConfig[] = [
  {
    name: 'observability',
    url: 'observability.mcp.cloudflare.com',
    displayName: 'Observability',
    description: 'Monitoring and observability services'
  },
  {
    name: 'auditLogs',
    url: 'auditlogs.mcp.cloudflare.com',
    displayName: 'Audit Logs',
    description: 'Security audit logging'
  },
  {
    name: 'browserRendering',
    url: 'browser.mcp.cloudflare.com',
    displayName: 'Browser Rendering',
    description: 'Headless browser services'
  },
  {
    name: 'dnsAnalytics',
    url: 'dns-analytics.mcp.cloudflare.com',
    displayName: 'DNS Analytics',
    description: 'DNS analytics and insights'
  },
  {
    name: 'aiGateway',
    url: 'ai-gateway.mcp.cloudflare.com',
    displayName: 'AI Gateway',
    description: 'AI Gateway services'
  },
  {
    name: 'graphql',
    url: 'graphql.mcp.cloudflare.com',
    displayName: 'GraphQL',
    description: 'GraphQL API services'
  },
  {
    name: 'workersBindings',
    url: 'bindings.mcp.cloudflare.com',
    displayName: 'Workers Bindings',
    description: 'Workers KV and Durable Objects'
  },
  {
    name: 'workersBuilds',
    url: 'builds.mcp.cloudflare.com',
    displayName: 'Workers Builds',
    description: 'Workers build system'
  }
];

class SimpleAuthManager {
  private apiToken: string;
  private envFile: string;

  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
    this.envFile = path.join(process.cwd(), '.env');
    
    if (!this.apiToken) {
      console.error(chalk.red('❌ CLOUDFLARE_API_TOKEN not found in environment'));
      console.log(chalk.yellow('Please set CLOUDFLARE_API_TOKEN in your .env file'));
      process.exit(1);
    }
  }

  async testConnection(server: MCPServerConfig): Promise<boolean> {
    console.log(chalk.blue(`Testing ${server.displayName}...`));
    
    // Test different endpoint patterns
    const endpoints = [
      { path: '/sse', method: 'GET' },
      { path: '/mcp', method: 'GET' },
      { path: '/', method: 'GET' },
      { path: '/api/v1/status', method: 'GET' }
    ];

    for (const endpoint of endpoints) {
      const url = `https://${server.url}${endpoint.path}`;
      
      try {
        const response = await this.makeHttpRequest(url, endpoint.method);
        
        if (response.statusCode && response.statusCode < 500) {
          console.log(chalk.green(`✅ ${server.displayName} - Endpoint found: ${url} (Status: ${response.statusCode})`));
          
          // Save working configuration
          this.saveConfig(server, url);
          
          // Check if it's actually an MCP server
          if (response.statusCode === 401) {
            console.log(chalk.yellow(`   ⚠️  Authentication required - OAuth needed`));
          } else if (response.statusCode === 200) {
            console.log(chalk.green(`   ✓ Server accessible with API token`));
          }
          
          return response.statusCode === 200;
        }
      } catch (error) {
        // Continue to next endpoint
        continue;
      }
    }
    
    console.log(chalk.red(`❌ ${server.displayName} - No accessible endpoints found`));
    return false;
  }

  private makeHttpRequest(url: string, method: string): Promise<{ statusCode?: number; body?: string }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'CF-Access-Client-Id': process.env.CLOUDFLARE_ACCOUNT_ID || '',
          'CF-Access-Client-Secret': this.apiToken,
          'Accept': 'text/event-stream, application/json',
          'User-Agent': 'Cloudflare-MCP-Client/1.0'
        },
        timeout: 10000,
        rejectUnauthorized: false // Allow self-signed certificates for testing
      };

      const req = https.request(options, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  private saveConfig(server: MCPServerConfig, workingUrl: string): void {
    // Read existing .env file
    let envContent = '';
    if (fs.existsSync(this.envFile)) {
      envContent = fs.readFileSync(this.envFile, 'utf-8');
    }

    // Add or update MCP server URL
    const envKey = `MCP_${server.name.toUpperCase()}_URL`;
    const envLine = `${envKey}=${workingUrl}`;
    
    if (envContent.includes(envKey)) {
      // Update existing
      envContent = envContent.replace(new RegExp(`^${envKey}=.*$`, 'm'), envLine);
    } else {
      // Add new
      if (!envContent.endsWith('\n')) envContent += '\n';
      envContent += `${envLine}\n`;
    }

    // Add token configuration if not present
    const tokenKey = `MCP_${server.name.toUpperCase()}_TOKEN`;
    if (!envContent.includes(tokenKey)) {
      envContent += `${tokenKey}=${this.apiToken}\n`;
    }

    fs.writeFileSync(this.envFile, envContent);
  }

  async testAllServers(): Promise<void> {
    console.log(chalk.cyan.bold('\n🔐 MCP Simple Authentication Test\n'));
    console.log(chalk.gray('Using API Token from CLOUDFLARE_API_TOKEN\n'));

    const results: { server: string; success: boolean }[] = [];

    for (const server of MCP_SERVERS) {
      const success = await this.testConnection(server);
      results.push({ server: server.displayName, success });
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    console.log(chalk.cyan.bold('\n📊 Connection Summary\n'));
    
    let successCount = 0;
    for (const result of results) {
      const status = result.success 
        ? chalk.green('✅ Connected') 
        : chalk.red('❌ Failed');
      console.log(`${result.server.padEnd(20)} ${status}`);
      if (result.success) successCount++;
    }

    console.log(chalk.cyan(`\nSuccessfully connected: ${successCount}/${MCP_SERVERS.length}`));
    
    if (successCount > 0) {
      console.log(chalk.green('\n✨ Working configurations saved to .env file'));
      console.log(chalk.yellow('You can now use the connected MCP servers!'));
    } else {
      console.log(chalk.yellow('\n⚠️  No servers could be connected with the API token'));
      console.log(chalk.gray('The MCP servers may require OAuth authentication instead.'));
      console.log(chalk.gray('Try running: npm run mcp:auth'));
    }
  }
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});

// Main execution
async function main() {
  const manager = new SimpleAuthManager();
  await manager.testAllServers();
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
