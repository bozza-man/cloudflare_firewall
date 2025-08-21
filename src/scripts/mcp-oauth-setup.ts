#!/usr/bin/env tsx
/**
 * MCP OAuth Setup Script
 * Handles OAuth authentication for all MCP servers
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import http from 'http';
import { URL } from 'url';
import open from 'open';

// MCP Servers that require OAuth
const MCP_OAUTH_SERVERS = [
  {
    name: 'observability',
    url: 'https://observability.mcp.cloudflare.com/sse',
    displayName: 'Observability',
    description: 'Monitoring and observability services'
  },
  {
    name: 'auditLogs',
    url: 'https://auditlogs.mcp.cloudflare.com/sse',
    displayName: 'Audit Logs',
    description: 'Security audit logging'
  },
  {
    name: 'browserRendering',
    url: 'https://browser.mcp.cloudflare.com/sse',
    displayName: 'Browser Rendering',
    description: 'Headless browser services'
  },
  {
    name: 'dnsAnalytics',
    url: 'https://dns-analytics.mcp.cloudflare.com/sse',
    displayName: 'DNS Analytics',
    description: 'DNS analytics and insights'
  },
  {
    name: 'aiGateway',
    url: 'https://ai-gateway.mcp.cloudflare.com/sse',
    displayName: 'AI Gateway',
    description: 'AI Gateway services'
  },
  {
    name: 'graphql',
    url: 'https://graphql.mcp.cloudflare.com/sse',
    displayName: 'GraphQL',
    description: 'GraphQL API services'
  },
  {
    name: 'workersBindings',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    displayName: 'Workers Bindings',
    description: 'Workers KV and Durable Objects'
  },
  {
    name: 'workersBuilds',
    url: 'https://builds.mcp.cloudflare.com/sse',
    displayName: 'Workers Builds',
    description: 'Workers build system'
  }
];

interface TokenInfo {
  server: string;
  token?: string;
  refreshToken?: string;
  expiresAt?: string;
  authorizedAt?: string;
}

class MCPOAuthManager {
  private tokensFile: string;
  private tokens: Map<string, TokenInfo> = new Map();

  constructor() {
    this.tokensFile = path.join(process.cwd(), '.mcp-tokens.json');
    this.loadTokens();
  }

  private loadTokens(): void {
    if (fs.existsSync(this.tokensFile)) {
      try {
        const data = fs.readFileSync(this.tokensFile, 'utf-8');
        const tokens = JSON.parse(data);
        for (const [key, value] of Object.entries(tokens)) {
          this.tokens.set(key, value as TokenInfo);
        }
        console.log(chalk.green(`✓ Loaded ${this.tokens.size} existing tokens`));
      } catch (error) {
        console.log(chalk.yellow('⚠ Could not load existing tokens'));
      }
    }
  }

  private saveTokens(): void {
    const tokensObj: Record<string, TokenInfo> = {};
    for (const [key, value] of this.tokens) {
      tokensObj[key] = value;
    }
    fs.writeFileSync(this.tokensFile, JSON.stringify(tokensObj, null, 2));
    console.log(chalk.green(`✓ Saved tokens to ${this.tokensFile}`));
  }

  public getToken(server: string): TokenInfo | undefined {
    return this.tokens.get(server);
  }

  public setToken(server: string, tokenInfo: TokenInfo): void {
    this.tokens.set(server, tokenInfo);
    this.saveTokens();
  }

  public hasValidToken(server: string): boolean {
    const token = this.tokens.get(server);
    if (!token || !token.token) return false;
    
    if (token.expiresAt) {
      const expiresAt = new Date(token.expiresAt);
      return expiresAt > new Date();
    }
    
    return true;
  }

  public async authenticateServer(server: typeof MCP_OAUTH_SERVERS[0]): Promise<boolean> {
    console.log(chalk.blue(`\nAuthenticating ${server.displayName}...`));
    
    return new Promise((resolve) => {
      // Start a local server to handle OAuth callback
      const callbackPort = 8080 + Math.floor(Math.random() * 1000);
      let authCode: string | null = null;
      let serverClosed = false;
      let timeoutId: NodeJS.Timeout;
      
      const cleanup = () => {
        if (!serverClosed) {
          serverClosed = true;
          callbackServer.close();
          if (timeoutId) clearTimeout(timeoutId);
        }
      };
      
      const callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${callbackPort}`);
        
        if (url.pathname === '/oauth/callback' || url.pathname === '/callback') {
          authCode = url.searchParams.get('code') || url.searchParams.get('token');
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head>
                <title>MCP OAuth Success</title>
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  }
                  .message {
                    background: white;
                    padding: 40px;
                    border-radius: 10px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                  }
                  h1 { color: #667eea; }
                  p { color: #666; }
                </style>
              </head>
              <body>
                <div class="message">
                  <h1>✓ Authentication Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </div>
              </body>
            </html>
          `);
          
          // Process the auth code
          if (authCode) {
            console.log(chalk.green('\n✓ Received authentication code'));
            
            // Save token info
            this.setToken(server.name, {
              server: server.name,
              token: authCode,
              authorizedAt: new Date().toISOString()
            });
            
            // Clean up and resolve
            setTimeout(() => {
              cleanup();
              resolve(true);
            }, 1000);
          }
        } else if (url.pathname === '/') {
          // Redirect to proper OAuth flow if accessed directly
          res.writeHead(302, { 
            'Location': `https://dash.cloudflare.com/oauth/authorize?client_id=mcp-${server.name}&redirect_uri=http://localhost:${callbackPort}/oauth/callback&response_type=code` 
          });
          res.end();
        }
      });
      
      callbackServer.on('error', (err) => {
        console.error(chalk.red(`Callback server error: ${err.message}`));
        cleanup();
        resolve(false);
      });
      
      callbackServer.listen(callbackPort, async () => {
        console.log(chalk.gray(`Callback server listening on port ${callbackPort}`));
        
        // Instead of using mcp-remote, directly open the OAuth URL
        const clientId = `mcp-${server.name}`;
        const redirectUri = `http://localhost:${callbackPort}/oauth/callback`;
        const authUrl = `https://dash.cloudflare.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=mcp:${server.name}`;
        
        console.log(chalk.yellow('\n📋 Opening browser for authentication...'));
        console.log(chalk.gray('If the browser does not open, please visit:'));
        console.log(chalk.cyan(authUrl));
        console.log(chalk.gray('\nWaiting for authentication (5 minutes timeout)...'));
        
        // Open browser
        try {
          await open(authUrl);
        } catch (error) {
          console.log(chalk.yellow('Could not open browser automatically. Please visit the URL above.'));
        }
        
        // Set a longer timeout - 5 minutes
        timeoutId = setTimeout(() => {
          if (!serverClosed) {
            console.log(chalk.yellow('\n⏱ Authentication timeout (5 minutes)'));
            console.log(chalk.gray('If you need more time, please run the command again.'));
            cleanup();
            resolve(false);
          }
        }, 300000); // 5 minutes
      });
    });
  }

  public printStatus(): void {
    console.log(chalk.cyan.bold('\n📊 MCP Server Authentication Status\n'));
    
    for (const server of MCP_OAUTH_SERVERS) {
      const hasToken = this.hasValidToken(server.name);
      const tokenInfo = this.getToken(server.name);
      const status = hasToken ? chalk.green('✓ Authenticated') : chalk.red('✗ Not authenticated');
      
      console.log(`${server.displayName.padEnd(20)} ${status}`);
      if (tokenInfo?.authorizedAt) {
        console.log(chalk.gray(`  Authorized: ${new Date(tokenInfo.authorizedAt).toLocaleString()}`));
      }
    }
  }
}

async function main() {
  console.log(chalk.cyan.bold('\n🔐 MCP OAuth Setup Wizard\n'));
  console.log(chalk.yellow('This wizard will help you authenticate with MCP servers.\n'));
  
  const manager = new MCPOAuthManager();
  
  // Show current status
  manager.printStatus();
  
  // Ask which servers to authenticate
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Authenticate all servers', value: 'all' },
        { name: 'Authenticate specific servers', value: 'specific' },
        { name: 'Check authentication status', value: 'status' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);
  
  if (action === 'exit') {
    process.exit(0);
  }
  
  if (action === 'status') {
    manager.printStatus();
    process.exit(0);
  }
  
  let serversToAuth = MCP_OAUTH_SERVERS;
  
  if (action === 'specific') {
    const { servers } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'servers',
        message: 'Select servers to authenticate:',
        choices: MCP_OAUTH_SERVERS.map(s => ({
          name: `${s.displayName} - ${s.description}`,
          value: s.name,
          checked: !manager.hasValidToken(s.name)
        }))
      }
    ]);
    
    serversToAuth = MCP_OAUTH_SERVERS.filter(s => servers.includes(s.name));
  }
  
  // Filter out already authenticated servers
  const needsAuth = serversToAuth.filter(s => !manager.hasValidToken(s.name));
  
  if (needsAuth.length === 0) {
    console.log(chalk.green('\n✓ All selected servers are already authenticated!'));
    process.exit(0);
  }
  
  console.log(chalk.yellow(`\n🔄 Authenticating ${needsAuth.length} server(s)...\n`));
  console.log(chalk.gray('Note: Your browser will open for each server to complete OAuth.'));
  console.log(chalk.gray('Please authorize the application when prompted.\n'));
  
  // Authenticate each server
  let successCount = 0;
  for (const server of needsAuth) {
    const success = await manager.authenticateServer(server);
    if (success) {
      successCount++;
      console.log(chalk.green(`✓ ${server.displayName} authenticated successfully`));
    } else {
      console.log(chalk.red(`✗ ${server.displayName} authentication failed`));
    }
    
    // Small delay between authentications
    if (needsAuth.indexOf(server) < needsAuth.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Final status
  console.log(chalk.cyan.bold('\n📊 Authentication Summary\n'));
  console.log(`Successfully authenticated: ${successCount}/${needsAuth.length}`);
  
  manager.printStatus();
  
  if (successCount > 0) {
    console.log(chalk.green('\n✨ Tokens saved to .mcp-tokens.json'));
    console.log(chalk.yellow('You can now use the authenticated MCP servers!'));
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
});

// Run the wizard
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
