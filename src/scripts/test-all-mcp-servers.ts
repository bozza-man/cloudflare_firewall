#!/usr/bin/env tsx
/**
 * Test All MCP Servers
 * Comprehensive testing of each MCP server connection
 */

import { getMCPClientManager } from '../mcp/client-manager.js';
import { sslConfig } from '../mcp/ssl-config.js';
import chalk from 'chalk';
import https from 'https';
import { URL } from 'url';

// MCP Server configurations
const MCP_SERVERS = [
  { 
    name: 'observability', 
    url: 'https://observability.mcp.cloudflare.com/sse',
    category: 'observability',
    description: 'Monitoring and observability services'
  },
  { 
    name: 'auditLogs', 
    url: 'https://auditlogs.mcp.cloudflare.com/sse',
    category: 'security',
    description: 'Security audit logs'
  },
  { 
    name: 'docs', 
    url: 'https://docs.mcp.cloudflare.com/sse',
    category: 'docs',
    description: 'Documentation services'
  },
  { 
    name: 'browserRendering', 
    url: 'https://browser.mcp.cloudflare.com/sse',
    category: 'utilities',
    description: 'Browser rendering services'
  },
  { 
    name: 'dnsAnalytics', 
    url: 'https://dns-analytics.mcp.cloudflare.com/sse',
    category: 'analytics',
    description: 'DNS analytics and insights'
  },
  { 
    name: 'radar', 
    url: 'https://radar.mcp.cloudflare.com/sse',
    category: 'security',
    description: 'Cloudflare Radar threat intelligence'
  },
  {
    name: 'aiGateway',
    url: 'https://ai-gateway.mcp.cloudflare.com/sse',
    category: 'ai',
    description: 'AI Gateway services'
  },
  {
    name: 'graphql',
    url: 'https://graphql.mcp.cloudflare.com/sse',
    category: 'api',
    description: 'GraphQL API services'
  },
  {
    name: 'workersBindings',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    category: 'workers',
    description: 'Workers bindings'
  },
  {
    name: 'workersBuilds',
    url: 'https://builds.mcp.cloudflare.com/sse',
    category: 'workers',
    description: 'Workers builds'
  }
];

interface TestResult {
  server: string;
  url: string;
  category: string;
  sslTest: {
    success: boolean;
    error?: string;
    certificate?: any;
  };
  httpTest: {
    success: boolean;
    statusCode?: number;
    error?: string;
  };
  mcpConnection: {
    success: boolean;
    error?: string;
    tools?: string[];
  };
}

async function testSSLConnection(url: string, serverName: string): Promise<TestResult['sslTest']> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const agent = sslConfig.getHttpsAgent(serverName);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'GET',
        agent: agent,
        timeout: 5000,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      };

      const req = https.request(options, (res) => {
        const cert = (res.socket as any)?.getPeerCertificate?.();
        resolve({
          success: true,
          certificate: cert ? {
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to
          } : undefined
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Connection timeout (5s)'
        });
      });

      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

async function testHTTPConnection(url: string, serverName: string): Promise<TestResult['httpTest']> {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const agent = sslConfig.getHttpsAgent(serverName);
      
      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'GET',
        agent: agent,
        timeout: 10000,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      };

      const req = https.request(options, (res) => {
        // For SSE endpoints, we expect a 200 status
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk.toString();
          // For SSE, we just need to confirm we're getting data
          if (data.length > 0) {
            req.destroy(); // Close connection after confirming it works
            resolve({
              success: res.statusCode === 200,
              statusCode: res.statusCode
            });
          }
        });

        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            statusCode: res.statusCode
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'HTTP timeout (10s)'
        });
      });

      req.end();
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

async function testMCPConnection(serverName: string): Promise<TestResult['mcpConnection']> {
  try {
    const manager = await getMCPClientManager();
    const client = manager.getClient(serverName);
    
    if (!client) {
      return {
        success: false,
        error: 'Client not connected'
      };
    }

    // Try to list tools as a connection test
    const tools = await client.listTools();
    
    return {
      success: true,
      tools: tools.map(t => t.name).slice(0, 5) // First 5 tools
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testServer(server: typeof MCP_SERVERS[0]): Promise<TestResult> {
  console.log(chalk.blue(`\nTesting ${server.name}...`));
  
  const result: TestResult = {
    server: server.name,
    url: server.url,
    category: server.category,
    sslTest: { success: false },
    httpTest: { success: false },
    mcpConnection: { success: false }
  };

  // Test 1: SSL Connection
  console.log(chalk.gray('  1. Testing SSL connection...'));
  result.sslTest = await testSSLConnection(server.url, server.name);
  
  if (result.sslTest.success) {
    console.log(chalk.green('     ✓ SSL connection successful'));
    if (result.sslTest.certificate) {
      console.log(chalk.gray(`     Certificate: ${result.sslTest.certificate.subject?.CN || 'Unknown'}`));
    }
  } else {
    console.log(chalk.red(`     ✗ SSL failed: ${result.sslTest.error}`));
  }

  // Test 2: HTTP Connection
  console.log(chalk.gray('  2. Testing HTTP/SSE endpoint...'));
  result.httpTest = await testHTTPConnection(server.url, server.name);
  
  if (result.httpTest.success) {
    console.log(chalk.green(`     ✓ HTTP connection successful (${result.httpTest.statusCode})`));
  } else {
    console.log(chalk.red(`     ✗ HTTP failed: ${result.httpTest.error || `Status ${result.httpTest.statusCode}`}`));
  }

  // Test 3: MCP Connection
  console.log(chalk.gray('  3. Testing MCP client connection...'));
  result.mcpConnection = await testMCPConnection(server.name);
  
  if (result.mcpConnection.success) {
    console.log(chalk.green('     ✓ MCP client connected'));
    if (result.mcpConnection.tools && result.mcpConnection.tools.length > 0) {
      console.log(chalk.gray(`     Available tools: ${result.mcpConnection.tools.join(', ')}`));
    }
  } else {
    console.log(chalk.red(`     ✗ MCP failed: ${result.mcpConnection.error}`));
  }

  return result;
}

async function main() {
  console.log(chalk.cyan.bold('\n🔍 MCP Server Connection Test\n'));
  console.log(chalk.yellow('Testing all configured MCP servers...\n'));
  console.log(chalk.gray('Environment:'));
  console.log(chalk.gray(`  NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED || 'not set'}`));
  console.log(chalk.gray(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`));
  
  const results: TestResult[] = [];
  
  // Test each server
  for (const server of MCP_SERVERS) {
    const result = await testServer(server);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(chalk.cyan.bold('\n📊 Test Summary\n'));
  
  const categories = [...new Set(results.map(r => r.category))];
  
  for (const category of categories) {
    console.log(chalk.blue(`\n${category.toUpperCase()}`));
    const categoryResults = results.filter(r => r.category === category);
    
    for (const result of categoryResults) {
      const sslIcon = result.sslTest.success ? '✅' : '❌';
      const httpIcon = result.httpTest.success ? '✅' : '❌';
      const mcpIcon = result.mcpConnection.success ? '✅' : '❌';
      
      console.log(`  ${chalk.bold(result.server.padEnd(20))} SSL: ${sslIcon}  HTTP: ${httpIcon}  MCP: ${mcpIcon}`);
    }
  }

  // Overall stats
  const totalServers = results.length;
  const sslSuccess = results.filter(r => r.sslTest.success).length;
  const httpSuccess = results.filter(r => r.httpTest.success).length;
  const mcpSuccess = results.filter(r => r.mcpConnection.success).length;

  console.log(chalk.cyan.bold('\n📈 Overall Statistics\n'));
  console.log(`  Total Servers: ${totalServers}`);
  console.log(`  SSL Success:   ${sslSuccess}/${totalServers} (${Math.round(sslSuccess/totalServers * 100)}%)`);
  console.log(`  HTTP Success:  ${httpSuccess}/${totalServers} (${Math.round(httpSuccess/totalServers * 100)}%)`);
  console.log(`  MCP Success:   ${mcpSuccess}/${totalServers} (${Math.round(mcpSuccess/totalServers * 100)}%)`);

  // Recommendations
  if (mcpSuccess < totalServers) {
    console.log(chalk.yellow.bold('\n💡 Recommendations:\n'));
    
    if (sslSuccess < totalServers) {
      console.log(chalk.yellow('  1. SSL issues detected. Try running with:'));
      console.log(chalk.gray('     NODE_TLS_REJECT_UNAUTHORIZED=0 npm run test:mcp'));
    }
    
    if (httpSuccess < totalServers && httpSuccess < sslSuccess) {
      console.log(chalk.yellow('  2. Some servers are not responding. Check:'));
      console.log(chalk.gray('     - Server URLs are correct'));
      console.log(chalk.gray('     - Authentication tokens are set'));
      console.log(chalk.gray('     - Network connectivity'));
    }
    
    if (mcpSuccess < httpSuccess) {
      console.log(chalk.yellow('  3. MCP client connection issues. Check:'));
      console.log(chalk.gray('     - mcp-remote package is installed'));
      console.log(chalk.gray('     - Server configurations in multi-server-config.ts'));
    }
  } else {
    console.log(chalk.green.bold('\n✨ All MCP servers are connected and operational!'));
  }

  // Exit with appropriate code
  process.exit(mcpSuccess === totalServers ? 0 : 1);
}

// Run the test
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
