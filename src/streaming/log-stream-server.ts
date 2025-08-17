import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import type { GatewayLog, LogFilter } from '../types/streaming.js';
// import type { LogLevel } from '../types/streaming.js';

export class LogStreamServer extends EventEmitter {
  private wss: WebSocketServer;
  private httpServer: ReturnType<typeof createServer>;
  private clients: Set<WebSocket> = new Set();
  private logBuffer: GatewayLog[] = [];
  private maxBufferSize = 10000;
  private port: number;

  constructor(port: number = 8080) {
    super();
    this.port = port;
    
    // Create HTTP server
    this.httpServer = createServer();
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });
    
    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(chalk.green(`✓ New client connected from ${clientIp}`));
      
      this.clients.add(ws);
      
      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Gateway Log Stream',
        timestamp: new Date().toISOString()
      }));
      
      // Send recent log buffer to new client
      this.sendBufferToClient(ws);
      
      // Handle client messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Failed to parse client message:', error);
        }
      });
      
      // Handle client disconnect
      ws.on('close', () => {
        console.log(chalk.yellow(`Client disconnected from ${clientIp}`));
        this.clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
      
      // Setup heartbeat
      this.setupHeartbeat(ws);
    });
  }

  private setupHeartbeat(ws: WebSocket): void {
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);
    
    ws.on('pong', () => {
      // Client is alive
    });
    
    ws.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  private handleClientMessage(ws: WebSocket, message: { type: string; data?: unknown }): void {
    switch (message.type) {
      case 'filter':
        // Client wants to filter logs
        this.sendFilteredLogs(ws, message.filter);
        break;
        
      case 'replay':
        // Client wants to replay logs from a specific time
        this.replayLogs(ws, message.from, message.to);
        break;
        
      case 'subscribe':
        // Client wants to subscribe to specific log types
        ws.send(JSON.stringify({
          type: 'subscribed',
          topics: message.topics
        }));
        break;
        
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private sendBufferToClient(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'buffer',
        logs: this.logBuffer.slice(-100) // Send last 100 logs
      }));
    }
  }

  private sendFilteredLogs(ws: WebSocket, filter: LogFilter): void {
    const filtered = this.logBuffer.filter(log => {
      if (filter.level && log.level !== filter.level) return false;
      if (filter.ruleId && log.ruleId !== filter.ruleId) return false;
      if (filter.action && log.action !== filter.action) return false;
      if (filter.search && !JSON.stringify(log).includes(filter.search)) return false;
      
      if (filter.from || filter.to) {
        const logTime = new Date(log.timestamp).getTime();
        if (filter.from && logTime < new Date(filter.from).getTime()) return false;
        if (filter.to && logTime > new Date(filter.to).getTime()) return false;
      }
      
      return true;
    });
    
    ws.send(JSON.stringify({
      type: 'filtered',
      logs: filtered,
      filter
    }));
  }

  private replayLogs(ws: WebSocket, from?: string, to?: string): void {
    let logs = this.logBuffer;
    
    if (from || to) {
      logs = logs.filter(log => {
        const logTime = new Date(log.timestamp).getTime();
        if (from && logTime < new Date(from).getTime()) return false;
        if (to && logTime > new Date(to).getTime()) return false;
        return true;
      });
    }
    
    ws.send(JSON.stringify({
      type: 'replay',
      logs,
      from,
      to
    }));
  }

  public broadcastLog(log: GatewayLog): void {
    // Add to buffer
    this.logBuffer.push(log);
    
    // Trim buffer if too large
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
    
    // Broadcast to all connected clients
    const message = JSON.stringify({
      type: 'log',
      data: log
    });
    
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    // Emit event for local listeners
    this.emit('log', log);
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, () => {
        console.log(chalk.green(`✓ Log stream server running on ws://localhost:${this.port}`));
        resolve();
      });
      
      this.httpServer.on('error', reject);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      this.clients.forEach(client => {
        client.close();
      });
      
      // Close WebSocket server
      this.wss.close(() => {
        // Close HTTP server
        this.httpServer.close(() => {
          console.log(chalk.yellow('Log stream server stopped'));
          resolve();
        });
      });
    });
  }

  public getStats() {
    return {
      connectedClients: this.clients.size,
      bufferSize: this.logBuffer.length,
      port: this.port
    };
  }
}