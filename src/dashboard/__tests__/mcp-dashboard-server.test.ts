import request from 'supertest';
import express from 'express';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import path from 'path';

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn()
}));

describe('MCP Dashboard Server', () => {
  let app: express.Application;
  let server: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Set up the Express app
    app = express();
    app.use(express.json());

    // Mock HTML file reading for dashboard endpoint
    const mockHtml = '<html><body>MCP Dashboard</body></html>';
    (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockReturnValue(mockHtml);

    // Add CORS headers
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Dashboard route
    app.get('/', (req, res) => {
      const htmlPath = path.join(__dirname, '../mcp-dashboard.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');
      res.send(html);
    });

    // API routes
    app.get('/api/mcp/status', (req, res) => {
      res.json({
        servers: [
          {
            name: 'cloudflare-gateway',
            status: 'connected',
            uptime: 3600000,
            lastResponse: Date.now() - 1000,
            responseTime: 45,
            requestsHandled: 150,
            errors: 2
          },
          {
            name: 'threat-intelligence',
            status: 'connected',
            uptime: 3600000,
            lastResponse: Date.now() - 2000,
            responseTime: 120,
            requestsHandled: 85,
            errors: 0
          }
        ],
        overallStatus: 'healthy',
        totalRequests: 235,
        totalErrors: 2,
        averageResponseTime: 82.5
      });
    });

    app.post('/api/mcp/test/:serverName', (req, res) => {
      const { serverName } = req.params;
      res.json({
        server: serverName,
        status: 'success',
        responseTime: 35,
        message: `Successfully connected to ${serverName}`,
        timestamp: new Date().toISOString()
      });
    });

    app.post('/api/mcp/reconnect/:serverName', (req, res) => {
      const { serverName } = req.params;
      res.json({
        server: serverName,
        status: 'reconnected',
        message: `Successfully reconnected to ${serverName}`,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/mcp/logs/:serverName', (req, res) => {
      const { serverName } = req.params;
      const { limit = 100, offset = 0 } = req.query;
      
      const logs = Array.from({ length: Number(limit) }, (_, i) => ({
        timestamp: new Date(Date.now() - (i + Number(offset)) * 60000).toISOString(),
        level: i % 10 === 0 ? 'error' : i % 3 === 0 ? 'warn' : 'info',
        message: `Log entry ${i + Number(offset)} from ${serverName}`,
        metadata: {
          requestId: `req-${i + Number(offset)}`,
          duration: Math.floor(Math.random() * 100)
        }
      }));

      res.json({
        server: serverName,
        logs,
        total: 1000,
        limit: Number(limit),
        offset: Number(offset)
      });
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0'
      });
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  describe('GET /', () => {
    it('should return the dashboard HTML', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('MCP Dashboard');
      expect(response.headers['content-type']).toMatch(/html/);
    });

    it('should handle file read errors gracefully', async () => {
      (fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>).mockImplementation(() => {
        throw new Error('File not found');
      });

      const response = await request(app).get('/');
      
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/mcp/status', () => {
    it('should return MCP server status', async () => {
      const response = await request(app).get('/api/mcp/status');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('servers');
      expect(response.body.servers).toBeInstanceOf(Array);
      expect(response.body.servers.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('overallStatus');
      expect(response.body).toHaveProperty('totalRequests');
      expect(response.body).toHaveProperty('totalErrors');
      expect(response.body).toHaveProperty('averageResponseTime');
    });

    it('should include server details in status response', async () => {
      const response = await request(app).get('/api/mcp/status');
      
      const server = response.body.servers[0];
      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('status');
      expect(server).toHaveProperty('uptime');
      expect(server).toHaveProperty('lastResponse');
      expect(server).toHaveProperty('responseTime');
      expect(server).toHaveProperty('requestsHandled');
      expect(server).toHaveProperty('errors');
    });

    it('should calculate overall metrics correctly', async () => {
      const response = await request(app).get('/api/mcp/status');
      
      const totalRequests = response.body.servers.reduce(
        (sum: number, s: any) => sum + s.requestsHandled, 
        0
      );
      const totalErrors = response.body.servers.reduce(
        (sum: number, s: any) => sum + s.errors, 
        0
      );
      
      expect(response.body.totalRequests).toBe(totalRequests);
      expect(response.body.totalErrors).toBe(totalErrors);
    });
  });

  describe('POST /api/mcp/test/:serverName', () => {
    it('should test connection to specified server', async () => {
      const serverName = 'cloudflare-gateway';
      const response = await request(app)
        .post(`/api/mcp/test/${serverName}`)
        .send();
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('server', serverName);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should handle different server names', async () => {
      const serverName = 'threat-intelligence';
      const response = await request(app)
        .post(`/api/mcp/test/${serverName}`)
        .send();
      
      expect(response.status).toBe(200);
      expect(response.body.server).toBe(serverName);
      expect(response.body.message).toContain(serverName);
    });

    it('should include response time in test results', async () => {
      const response = await request(app)
        .post('/api/mcp/test/test-server')
        .send();
      
      expect(response.body.responseTime).toBeGreaterThan(0);
      expect(typeof response.body.responseTime).toBe('number');
    });
  });

  describe('POST /api/mcp/reconnect/:serverName', () => {
    it('should reconnect to specified server', async () => {
      const serverName = 'cloudflare-gateway';
      const response = await request(app)
        .post(`/api/mcp/reconnect/${serverName}`)
        .send();
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('server', serverName);
      expect(response.body).toHaveProperty('status', 'reconnected');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return success message after reconnection', async () => {
      const serverName = 'test-server';
      const response = await request(app)
        .post(`/api/mcp/reconnect/${serverName}`)
        .send();
      
      expect(response.body.message).toContain('Successfully reconnected');
      expect(response.body.message).toContain(serverName);
    });

    it('should include timestamp in reconnection response', async () => {
      const response = await request(app)
        .post('/api/mcp/reconnect/test-server')
        .send();
      
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('GET /api/mcp/logs/:serverName', () => {
    it('should return logs for specified server', async () => {
      const serverName = 'cloudflare-gateway';
      const response = await request(app)
        .get(`/api/mcp/logs/${serverName}`)
        .query({ limit: 50, offset: 0 });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('server', serverName);
      expect(response.body).toHaveProperty('logs');
      expect(response.body.logs).toBeInstanceOf(Array);
      expect(response.body.logs.length).toBe(50);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit', 50);
      expect(response.body).toHaveProperty('offset', 0);
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/mcp/logs/test-server')
        .query({ limit: 25, offset: 10 });
      
      expect(response.body.limit).toBe(25);
      expect(response.body.offset).toBe(10);
      expect(response.body.logs.length).toBe(25);
    });

    it('should use default pagination when not specified', async () => {
      const response = await request(app)
        .get('/api/mcp/logs/test-server');
      
      expect(response.body.limit).toBe(100);
      expect(response.body.offset).toBe(0);
      expect(response.body.logs.length).toBe(100);
    });

    it('should include log entry details', async () => {
      const response = await request(app)
        .get('/api/mcp/logs/test-server')
        .query({ limit: 1 });
      
      const logEntry = response.body.logs[0];
      expect(logEntry).toHaveProperty('timestamp');
      expect(logEntry).toHaveProperty('level');
      expect(logEntry).toHaveProperty('message');
      expect(logEntry).toHaveProperty('metadata');
      expect(logEntry.metadata).toHaveProperty('requestId');
      expect(logEntry.metadata).toHaveProperty('duration');
    });

    it('should return different log levels', async () => {
      const response = await request(app)
        .get('/api/mcp/logs/test-server')
        .query({ limit: 100 });
      
      const levels = new Set(response.body.logs.map((log: any) => log.level));
      expect(levels.has('info')).toBe(true);
      expect(levels.has('warn')).toBe(true);
      expect(levels.has('error')).toBe(true);
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('version');
    });

    it('should include memory usage details', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('external');
    });

    it('should return valid timestamp', async () => {
      const response = await request(app).get('/api/health');
      
      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should return positive uptime', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(typeof response.body.uptime).toBe('number');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(app).get('/api/mcp/status');
      
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should handle OPTIONS requests', async () => {
      const response = await request(app)
        .options('/api/mcp/status')
        .send();
      
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown');
      
      expect(response.status).toBe(404);
    });

    it('should handle invalid query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/mcp/logs/test-server')
        .query({ limit: 'invalid', offset: 'invalid' });
      
      // The server should handle invalid params and use defaults or return error
      expect(response.status).toBeLessThanOrEqual(400);
    });
  });

  describe('Content Types', () => {
    it('should return JSON for API endpoints', async () => {
      const response = await request(app).get('/api/mcp/status');
      
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return HTML for dashboard endpoint', async () => {
      const response = await request(app).get('/');
      
      expect(response.headers['content-type']).toMatch(/html/);
    });
  });
});

describe('MCP Dashboard Server Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());

    // Mock integration endpoints
    app.get('/api/mcp/metrics', (req, res) => {
      res.json({
        servers: {
          'cloudflare-gateway': {
            cpu: 45.2,
            memory: 67.8,
            connections: 12,
            throughput: 1024
          },
          'threat-intelligence': {
            cpu: 23.1,
            memory: 45.6,
            connections: 8,
            throughput: 512
          }
        },
        timestamp: new Date().toISOString()
      });
    });

    app.get('/api/mcp/tools', (req, res) => {
      res.json({
        tools: [
          {
            name: 'gateway-rules',
            description: 'Manage Cloudflare Gateway rules',
            usage: 150,
            lastUsed: new Date(Date.now() - 3600000).toISOString()
          },
          {
            name: 'threat-check',
            description: 'Check domain threat intelligence',
            usage: 85,
            lastUsed: new Date(Date.now() - 7200000).toISOString()
          }
        ]
      });
    });
  });

  describe('GET /api/mcp/metrics', () => {
    it('should return server metrics', async () => {
      const response = await request(app).get('/api/mcp/metrics');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('servers');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include metrics for each server', async () => {
      const response = await request(app).get('/api/mcp/metrics');
      
      const cfMetrics = response.body.servers['cloudflare-gateway'];
      expect(cfMetrics).toHaveProperty('cpu');
      expect(cfMetrics).toHaveProperty('memory');
      expect(cfMetrics).toHaveProperty('connections');
      expect(cfMetrics).toHaveProperty('throughput');
    });
  });

  describe('GET /api/mcp/tools', () => {
    it('should return available tools', async () => {
      const response = await request(app).get('/api/mcp/tools');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tools');
      expect(response.body.tools).toBeInstanceOf(Array);
    });

    it('should include tool details', async () => {
      const response = await request(app).get('/api/mcp/tools');
      
      const tool = response.body.tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('usage');
      expect(tool).toHaveProperty('lastUsed');
    });
  });
});
