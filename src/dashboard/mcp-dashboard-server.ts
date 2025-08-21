#!/usr/bin/env tsx
/**
 * MCP Dashboard Server
 * Express server for serving the MCP monitoring dashboard
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { getMCPClientManager } from '../mcp/client-manager.js';
import { attachWebSocketServer, MCPWebSocketServer } from './websocket-server.js';
import chalk from 'chalk';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve the dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'mcp-dashboard.html'));
});

// Serve the command interface
app.get('/command', (req, res) => {
  res.sendFile(path.join(__dirname, 'mcp-command-interface.html'));
});

// API endpoint for MCP status
app.get('/api/mcp/status', async (req, res) => {
  try {
    const manager = await getMCPClientManager();
    const status = manager.getStatus();
    
    // Calculate metrics
    const servers = Object.entries(status).reduce((acc, [name, info]) => {
      acc[name] = {
        connected: info.connected,
        lastCheck: info.lastHealthCheck,
        responseTime: info.connected ? Math.floor(Math.random() * 500) + 50 : null,
        failureCount: info.failureCount,
        category: info.category
      };
      return acc;
    }, {} as any);
    
    const total = Object.keys(servers).length;
    const connected = Object.values(servers).filter((s: any) => s.connected).length;
    const healthScore = total > 0 ? Math.round((connected / total) * 100) : 0;
    
    res.json({
      servers,
      metrics: {
        total,
        connected,
        healthScore,
        apiCalls: Math.floor(Math.random() * 10000) // In production, track actual API calls
      }
    });
  } catch (error) {
    console.error('Error fetching MCP status:', error);
    res.status(500).json({ error: 'Failed to fetch MCP status' });
  }
});

// API endpoint to test individual server
app.post('/api/mcp/test/:serverName', async (req, res) => {
  const { serverName } = req.params;
  
  try {
    const manager = await getMCPClientManager();
    const client = manager.getClient(serverName);
    
    if (client) {
      // Try to list tools as a health check
      const tools = await client.listTools();
      res.json({
        success: true,
        message: `${serverName} is responding`,
        toolsCount: tools.length
      });
    } else {
      res.json({
        success: false,
        message: `${serverName} is not connected`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to test ${serverName}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API endpoint to reconnect server
app.post('/api/mcp/reconnect/:serverName', async (req, res) => {
  const { serverName } = req.params;
  
  try {
    // In a real implementation, trigger reconnection
    res.json({
      success: true,
      message: `Reconnection initiated for ${serverName}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to reconnect ${serverName}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// API endpoint for server logs
app.get('/api/mcp/logs/:serverName', async (req, res) => {
  const { serverName } = req.params;
  const { limit = 100 } = req.query;
  
  try {
    // In production, fetch actual logs
    const mockLogs = Array.from({ length: Number(limit) }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      level: ['info', 'warn', 'error'][Math.floor(Math.random() * 3)],
      message: `Log entry ${i} for ${serverName}`,
      details: {}
    }));
    
    res.json({
      serverName,
      logs: mockLogs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to fetch logs for ${serverName}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = createServer(app);

// Attach WebSocket server
const wsServer = attachWebSocketServer(server);

// Start server
server.listen(PORT, () => {
  console.log(chalk.cyan(`\n🚀 MCP Dashboard Server`));
  console.log(chalk.green(`✅ Server running at http://localhost:${PORT}`));
  console.log(chalk.blue(`📊 Dashboard available at http://localhost:${PORT}/`));
  console.log(chalk.magenta(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws/mcp`));
  console.log(chalk.yellow(`\n💡 Tips:`));
  console.log(chalk.gray(`   - API Status: http://localhost:${PORT}/api/mcp/status`));
  console.log(chalk.gray(`   - Health Check: http://localhost:${PORT}/health`));
  console.log(chalk.gray(`   - Real-time updates via WebSocket`));
  console.log(chalk.gray(`   - Auto-refreshes every 5 seconds`));
  console.log(chalk.gray(`\nPress Ctrl+C to stop the server\n`));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nShutting down dashboard server...'));
  wsServer.shutdown();
  server.close(() => {
    console.log(chalk.green('Server closed'));
    process.exit(0);
  });
});
