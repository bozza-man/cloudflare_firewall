import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { getMCPClientManager } from '../mcp/client-manager.js';
import { EventEmitter } from 'events';

interface MCPStatusUpdate {
  type: 'status' | 'connection' | 'error' | 'metrics' | 'logs';
  serverName?: string;
  data: any;
  timestamp: string;
}

export class MCPWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private updateInterval?: NodeJS.Timeout;
  private mcpManager: any = null;

  constructor(server: Server) {
    super();
    
    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/mcp'
    });

    this.setupWebSocketHandlers();
    this.startStatusUpdates();
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      console.log('New WebSocket connection from:', request.socket.remoteAddress);
      
      // Add to clients set
      this.clients.add(ws);
      
      // Send initial status
      this.sendInitialStatus(ws);
      
      // Handle messages from client
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(ws, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });
      
      // Handle client disconnect
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });
  }

  private async sendInitialStatus(ws: WebSocket): Promise<void> {
    try {
      if (!this.mcpManager) {
        this.mcpManager = await getMCPClientManager();
      }

      const status = this.mcpManager.getStatus();
      
      const statusUpdate: MCPStatusUpdate = {
        type: 'status',
        data: status,
        timestamp: new Date().toISOString()
      };
      
      this.sendToClient(ws, statusUpdate);
    } catch (error) {
      console.error('Error sending initial status:', error);
    }
  }

  private async handleClientMessage(ws: WebSocket, message: any): Promise<void> {
    try {
      switch (message.type) {
        case 'getStatus':
          await this.sendInitialStatus(ws);
          break;
          
        case 'testConnection':
          await this.testServerConnection(ws, message.serverName);
          break;
          
        case 'reconnect':
          await this.reconnectServer(ws, message.serverName);
          break;
          
        case 'getLogs':
          await this.getServerLogs(ws, message.serverName, message.options);
          break;
          
        case 'executeCommand':
          await this.executeCommand(ws, message.serverName, message.command, message.args);
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling client message:', error);
      this.sendError(ws, error);
    }
  }

  private async testServerConnection(ws: WebSocket, serverName: string): Promise<void> {
    try {
      if (!this.mcpManager) {
        this.mcpManager = await getMCPClientManager();
      }

      const startTime = Date.now();
      const client = this.mcpManager.getClient(serverName);
      
      if (client) {
        // Try to list tools as a connection test
        await client.listTools();
        const responseTime = Date.now() - startTime;
        
        this.sendToClient(ws, {
          type: 'connection',
          serverName,
          data: {
            status: 'success',
            responseTime,
            message: `Connection test successful (${responseTime}ms)`
          },
          timestamp: new Date().toISOString()
        });
      } else {
        throw new Error(`Server ${serverName} is not connected`);
      }
    } catch (error) {
      this.sendToClient(ws, {
        type: 'connection',
        serverName,
        data: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Connection test failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  private async reconnectServer(ws: WebSocket, serverName: string): Promise<void> {
    try {
      // This would trigger a reconnection in the MCP manager
      // For now, just send a mock response
      this.sendToClient(ws, {
        type: 'connection',
        serverName,
        data: {
          status: 'reconnecting',
          message: `Attempting to reconnect to ${serverName}...`
        },
        timestamp: new Date().toISOString()
      });
      
      // Simulate reconnection delay
      setTimeout(() => {
        this.sendToClient(ws, {
          type: 'connection',
          serverName,
          data: {
            status: 'reconnected',
            message: `Successfully reconnected to ${serverName}`
          },
          timestamp: new Date().toISOString()
        });
      }, 2000);
    } catch (error) {
      this.sendError(ws, error);
    }
  }

  private async getServerLogs(ws: WebSocket, serverName: string, options: any = {}): Promise<void> {
    try {
      // Mock log data for now
      const logs = Array.from({ length: options.limit || 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        level: i % 3 === 0 ? 'error' : i % 2 === 0 ? 'warn' : 'info',
        message: `Log entry ${i} from ${serverName}`,
        metadata: {
          requestId: `req-${i}`,
          duration: Math.floor(Math.random() * 100)
        }
      }));

      this.sendToClient(ws, {
        type: 'logs',
        serverName,
        data: {
          logs,
          total: 100,
          options
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.sendError(ws, error);
    }
  }

  private async executeCommand(ws: WebSocket, serverName: string, command: string, args: any): Promise<void> {
    try {
      if (!this.mcpManager) {
        this.mcpManager = await getMCPClientManager();
      }

      // Execute command on the MCP server
      const result = await this.mcpManager.callTool(serverName, command, args);
      
      this.sendToClient(ws, {
        type: 'metrics',
        serverName,
        data: {
          command,
          args,
          result,
          success: true
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.sendToClient(ws, {
        type: 'error',
        serverName,
        data: {
          command,
          args,
          error: error instanceof Error ? error.message : 'Command execution failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  private startStatusUpdates(): void {
    // Send status updates every 5 seconds
    this.updateInterval = setInterval(async () => {
      if (this.clients.size === 0) return;
      
      try {
        if (!this.mcpManager) {
          this.mcpManager = await getMCPClientManager();
        }

        const status = this.mcpManager.getStatus();
        
        const update: MCPStatusUpdate = {
          type: 'status',
          data: status,
          timestamp: new Date().toISOString()
        };
        
        this.broadcast(update);
      } catch (error) {
        console.error('Error broadcasting status update:', error);
      }
    }, 5000);
  }

  private sendToClient(ws: WebSocket, data: MCPStatusUpdate): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private sendError(ws: WebSocket, error: any): void {
    this.sendToClient(ws, {
      type: 'error',
      data: {
        error: error instanceof Error ? error.message : 'An error occurred'
      },
      timestamp: new Date().toISOString()
    });
  }

  private broadcast(data: MCPStatusUpdate): void {
    const message = JSON.stringify(data);
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public async broadcastServerEvent(event: string, serverName: string, data: any): Promise<void> {
    const update: MCPStatusUpdate = {
      type: event as any,
      serverName,
      data,
      timestamp: new Date().toISOString()
    };
    
    this.broadcast(update);
  }

  public shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    
    this.wss.close();
  }

  public getConnectionCount(): number {
    return this.clients.size;
  }
}

// Helper function to attach WebSocket server to existing HTTP server
export function attachWebSocketServer(server: Server): MCPWebSocketServer {
  return new MCPWebSocketServer(server);
}
