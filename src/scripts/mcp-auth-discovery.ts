#!/usr/bin/env tsx
/**
 * MCP Authentication Discovery Script
 * Discovers and tests various authentication methods for MCP servers
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';
import https from 'https';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import open from 'open';

dotenv.config();

interface AuthMethod {
  type: 'oauth' | 'api-token' | 'cf-access' | 'mcp-remote';
  name: string;
  description: string;
  test: () => Promise<boolean>;
}

class MCPAuthDiscovery {
  private apiToken: string;
  private accountId: string;
  private email: string;

  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
    this.email = process.env.CLOUDFLARE_EMAIL || '';
    
    if (!this.apiToken) {
      console.error(chalk.red('❌ CLOUDFLARE_API_TOKEN not found in environment'));
      process.exit(1);
    }
  }

  async discoverAuthMethods(): Promise<void> {
    console.log(chalk.cyan.bold('\n🔍 MCP Authentication Discovery\n'));
    console.log(chalk.gray('Testing various authentication methods...\n'));

    // Test different authentication approaches
    const methods: AuthMethod[] = [
      {
        type: 'api-token',
        name: 'API Token with Standard Endpoints',
        description: 'Using your Cloudflare API token with standard API endpoints',
        test: () => this.testStandardAPI()
      },
      {
        type: 'cf-access',
        name: 'Cloudflare Access Token',
        description: 'Using Cloudflare Access service token',
        test: () => this.testCFAccess()
      },
      {
        type: 'mcp-remote',
        name: 'MCP Remote Client',
        description: 'Using mcp-remote npm package',
        test: () => this.testMCPRemote()
      },
      {
        type: 'oauth',
        name: 'OAuth via Cloudflare Dashboard',
        description: 'OAuth flow through Cloudflare dashboard',
        test: () => this.testDashboardOAuth()
      }
    ];

    console.log(chalk.yellow('Testing authentication methods:\n'));
    
    const results: { method: string; success: boolean; details?: string }[] = [];
    
    for (const method of methods) {
      console.log(chalk.blue(`\nTesting: ${method.name}`));
      console.log(chalk.gray(`  ${method.description}`));
      
      try {
        const success = await method.test();
        results.push({ 
          method: method.name, 
          success,
          details: success ? 'Working' : 'Failed'
        });
        
        if (success) {
          console.log(chalk.green(`  ✅ Success!`));
        } else {
          console.log(chalk.red(`  ❌ Failed`));
        }
      } catch (error: any) {
        console.log(chalk.red(`  ❌ Error: ${error.message}`));
        results.push({ 
          method: method.name, 
          success: false,
          details: error.message
        });
      }
    }

    // Summary
    console.log(chalk.cyan.bold('\n\n📊 Authentication Method Summary\n'));
    
    for (const result of results) {
      const status = result.success 
        ? chalk.green('✅ Working') 
        : chalk.red('❌ Failed');
      console.log(`${result.method.padEnd(40)} ${status}`);
      if (result.details && !result.success) {
        console.log(chalk.gray(`  Details: ${result.details}`));
      }
    }

    // Recommendations
    const workingMethods = results.filter(r => r.success);
    
    if (workingMethods.length > 0) {
      console.log(chalk.green('\n✨ Recommended approach:'));
      console.log(chalk.yellow(`Use "${workingMethods[0].method}" for MCP authentication`));
    } else {
      console.log(chalk.yellow('\n⚠️  No working authentication methods found'));
      console.log(chalk.gray('\nPossible solutions:'));
      console.log(chalk.gray('1. MCP servers may require special access permissions'));
      console.log(chalk.gray('2. Contact Cloudflare support to enable MCP access'));
      console.log(chalk.gray('3. Use standard Cloudflare API instead of MCP'));
    }
  }

  private async testStandardAPI(): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        'https://api.cloudflare.com/client/v4/user',
        'GET'
      );
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  private async testCFAccess(): Promise<boolean> {
    try {
      // Try to get a CF Access token
      const serviceTokenId = process.env.CF_ACCESS_CLIENT_ID;
      const serviceTokenSecret = process.env.CF_ACCESS_CLIENT_SECRET;
      
      if (!serviceTokenId || !serviceTokenSecret) {
        console.log(chalk.gray('    No CF Access credentials found'));
        return false;
      }

      const response = await this.makeRequest(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/access/identity_providers`,
        'GET',
        {
          'CF-Access-Client-Id': serviceTokenId,
          'CF-Access-Client-Secret': serviceTokenSecret
        }
      );
      
      return response.statusCode === 200;
    } catch {
      return false;
    }
  }

  private async testMCPRemote(): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(chalk.gray('    Testing mcp-remote connection...'));
      
      const testUrl = 'https://workers.mcp.cloudflare.com/sse';
      const mcpProcess = spawn('npx', [
        'mcp-remote',
        testUrl,
        '--test-connection'
      ], {
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_TLS_REJECT_UNAUTHORIZED: '0'
        }
      });

      let output = '';
      
      mcpProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      mcpProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      setTimeout(() => {
        mcpProcess.kill();
        
        if (output.includes('Connected') || output.includes('401')) {
          console.log(chalk.gray('    Server responded (auth required)'));
          resolve(true);
        } else {
          resolve(false);
        }
      }, 5000);
    });
  }

  private async testDashboardOAuth(): Promise<boolean> {
    console.log(chalk.gray('    Checking Cloudflare Dashboard OAuth...'));
    
    // Test if we can access the dashboard API with current token
    try {
      const response = await this.makeRequest(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}`,
        'GET'
      );
      
      if (response.statusCode === 200) {
        console.log(chalk.gray('    Dashboard API accessible'));
        
        // Provide OAuth URLs for manual authentication
        console.log(chalk.yellow('\n    📋 Manual OAuth Instructions:'));
        console.log(chalk.gray('    1. Log into Cloudflare Dashboard'));
        console.log(chalk.gray('    2. Navigate to: https://dash.cloudflare.com/profile/api-tokens'));
        console.log(chalk.gray('    3. Create a new API token with MCP permissions'));
        console.log(chalk.gray('    4. Or visit: https://developers.cloudflare.com/mcp/get-started'));
        
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private makeRequest(
    url: string, 
    method: string,
    additionalHeaders?: Record<string, string>
  ): Promise<{ statusCode?: number; body?: string }> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Auth-Discovery/1.0',
          ...additionalHeaders
        },
        timeout: 10000,
        rejectUnauthorized: false
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

  async setupAlternativeAuth(): Promise<void> {
    console.log(chalk.cyan.bold('\n\n🔧 Alternative Authentication Setup\n'));
    
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        choices: [
          { name: 'Create API Token with full permissions', value: 'create-token' },
          { name: 'Set up Cloudflare Access', value: 'cf-access' },
          { name: 'Use standard Cloudflare API', value: 'standard-api' },
          { name: 'View MCP documentation', value: 'docs' },
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    switch (choice) {
      case 'create-token':
        console.log(chalk.yellow('\nOpening Cloudflare Dashboard to create API token...'));
        await open('https://dash.cloudflare.com/profile/api-tokens');
        console.log(chalk.gray('\nCreate a token with these permissions:'));
        console.log(chalk.gray('- Account: Read'));
        console.log(chalk.gray('- Zone: Read, Edit'));
        console.log(chalk.gray('- Workers Scripts: Read, Edit'));
        console.log(chalk.gray('- Workers KV Storage: Read, Edit'));
        console.log(chalk.gray('- Access: Read, Edit'));
        break;
        
      case 'cf-access':
        console.log(chalk.yellow('\nCloudflare Access Setup:'));
        console.log(chalk.gray('1. Go to: https://dash.cloudflare.com/[account]/access/service-auth'));
        console.log(chalk.gray('2. Create a new service token'));
        console.log(chalk.gray('3. Add to .env file:'));
        console.log(chalk.gray('   CF_ACCESS_CLIENT_ID=<your-client-id>'));
        console.log(chalk.gray('   CF_ACCESS_CLIENT_SECRET=<your-client-secret>'));
        break;
        
      case 'standard-api':
        console.log(chalk.green('\n✅ Your current API token works with standard Cloudflare API'));
        console.log(chalk.gray('You can use all standard Cloudflare API endpoints'));
        console.log(chalk.gray('MCP-specific features may not be available'));
        break;
        
      case 'docs':
        console.log(chalk.yellow('\nOpening MCP documentation...'));
        await open('https://developers.cloudflare.com/mcp');
        break;
    }
  }
}

// Main execution
async function main() {
  const discovery = new MCPAuthDiscovery();
  
  await discovery.discoverAuthMethods();
  await discovery.setupAlternativeAuth();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
