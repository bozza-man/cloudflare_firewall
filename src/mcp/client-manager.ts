/**
 * Unified MCP Client Manager
 * Manages connections to multiple MCP servers with automatic failover and load balancing
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { 
  getMultiServerConfig, 
  ServerSpecificConfig,
  isServerEnabled 
} from './multi-server-config.js';
import { MCPServerConfig } from './server-registry.js';
import { mcpDebug } from '../security/mcp-config.js';

interface MCPClientConnection {
  serverName: string;
  client: Client;
  transport: StdioClientTransport;
  process?: ChildProcess;
  config: ServerSpecificConfig;
  connected: boolean;
  lastHealthCheck: Date;
  failureCount: number;
}

export class MCPClientManager extends EventEmitter {
  private connections: Map<string, MCPClientConnection> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupCleanup();
  }

  /**
   * Initialize connections to all enabled MCP servers
   */
  async initialize(): Promise<void> {
    const config = getMultiServerConfig();
    
    mcpDebug('Initializing MCP Client Manager with servers:', Array.from(config.enabledServers));
    
    // Initialize connections in parallel
    const initPromises: Promise<void>[] = [];
    
    for (const serverName of config.enabledServers) {
      const serverConfig = config.servers.get(serverName);
      if (serverConfig && serverConfig.enabled) {
        initPromises.push(this.connectToServer(serverName, serverConfig));
      }
    }
    
    await Promise.allSettled(initPromises);
    
    // Start health checking
    this.startHealthChecks();
    
    mcpDebug('MCP Client Manager initialized with', this.connections.size, 'connections');
  }

  /**
   * Connect to a specific MCP server
   */
  private async connectToServer(
    serverName: string, 
    config: ServerSpecificConfig
  ): Promise<void> {
    try {
      mcpDebug(`Connecting to ${serverName} at ${config.serverUrl}`);
      
      // Create client
      const client = new Client({
        name: `cloudflare-firewall-${serverName}`,
        version: '1.0.0'
      });
      
      // Create transport based on server configuration
      const transport = await this.createTransport(serverName, config);
      
      // Connect with timeout
      const connected = await this.connectWithTimeout(
        client,
        transport,
        config.connectionTimeout
      );
      
      if (connected) {
        // Store connection
        this.connections.set(serverName, {
          serverName,
          client,
          transport,
          config,
          connected: true,
          lastHealthCheck: new Date(),
          failureCount: 0
        });
        
        this.emit('serverConnected', serverName);
        mcpDebug(`Successfully connected to ${serverName}`);
      } else {
        throw new Error(`Failed to connect to ${serverName}`);
      }
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverName}:`, error);
      this.emit('serverError', { serverName, error });
      
      // Store failed connection for retry
      this.connections.set(serverName, {
        serverName,
        client: new Client({ name: `cloudflare-firewall-${serverName}`, version: '1.0.0' }),
        transport: new StdioClientTransport({ command: 'echo', args: ['disconnected'] }),
        config,
        connected: false,
        lastHealthCheck: new Date(),
        failureCount: 1
      });
    }
  }

  /**
   * Create appropriate transport for server
   */
  private async createTransport(
    serverName: string,
    config: ServerSpecificConfig
  ): Promise<StdioClientTransport> {
    // For remote servers, use mcp-remote
    const args = ['mcp-remote', config.serverUrl];
    
    // Add authentication if available
    if (config.auth?.token) {
      args.push('--token', config.auth.token);
    }
    
    const processOptions: any = {
      env: {
        ...process.env,
        MCP_AUTH_TOKEN: config.auth?.token || '',
        MCP_SERVER_URL: config.serverUrl
      }
    };
    
    if (config.backgroundMode) {
      processOptions.detached = false;
      processOptions.stdio = ['pipe', 'pipe', 'pipe'];
    }
    
    const childProcess = spawn('npx', args, processOptions);
    
    // Create transport
    const transport = new StdioClientTransport({
      command: 'npx',
      args,
      env: processOptions.env
    });
    
    // Store process reference for cleanup
    const connection = this.connections.get(serverName);
    if (connection) {
      connection.process = childProcess;
    }
    
    return transport;
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(
    client: Client,
    transport: StdioClientTransport,
    timeout: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        mcpDebug('Connection timeout');
        resolve(false);
      }, timeout);
      
      client.connect(transport)
        .then(() => {
          clearTimeout(timer);
          resolve(true);
        })
        .catch((error) => {
          clearTimeout(timer);
          mcpDebug('Connection error:', error);
          resolve(false);
        });
    });
  }

  /**
   * Get client for a specific server
   */
  getClient(serverName: string): Client | null {
    const connection = this.connections.get(serverName);
    return connection?.connected ? connection.client : null;
  }

  /**
   * Get best available client for a category
   */
  getClientForCategory(category: MCPServerConfig['category']): Client | null {
    const config = getMultiServerConfig();
    let bestConnection: MCPClientConnection | null = null;
    let bestPriority = Infinity;
    
    for (const [name, connection] of this.connections) {
      if (connection.connected && 
          connection.config.category === category) {
        const priority = config.serverPriorities.get(name) || Infinity;
        if (priority < bestPriority) {
          bestPriority = priority;
          bestConnection = connection;
        }
      }
    }
    
    return bestConnection?.client || null;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<any> {
    const client = this.getClient(serverName);
    
    if (!client) {
      throw new Error(`MCP server ${serverName} is not connected`);
    }
    
    try {
      mcpDebug(`Calling tool ${toolName} on ${serverName}`, args);
      
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      
      return result;
    } catch (error) {
      console.error(`Error calling tool ${toolName} on ${serverName}:`, error);
      
      // Mark connection as failed
      const connection = this.connections.get(serverName);
      if (connection) {
        connection.failureCount++;
        if (connection.failureCount > 3) {
          connection.connected = false;
          this.emit('serverDisconnected', serverName);
        }
      }
      
      throw error;
    }
  }

  /**
   * Call a tool with automatic server selection
   */
  async callToolAuto(
    toolName: string,
    args: any,
    category?: MCPServerConfig['category']
  ): Promise<any> {
    // Try to find a server that supports this tool
    const availableServers = Array.from(this.connections.values())
      .filter(conn => conn.connected)
      .filter(conn => !category || conn.config.category === category)
      .sort((a, b) => a.failureCount - b.failureCount);
    
    for (const connection of availableServers) {
      try {
        return await this.callTool(connection.serverName, toolName, args);
      } catch (error) {
        mcpDebug(`Failed to call ${toolName} on ${connection.serverName}, trying next server`);
        continue;
      }
    }
    
    throw new Error(`No available MCP server could handle tool: ${toolName}`);
  }

  /**
   * Start health checking for all connections
   */
  private startHealthChecks(): void {
    const config = getMultiServerConfig();
    
    this.healthCheckInterval = setInterval(async () => {
      for (const [name, connection] of this.connections) {
        if (connection.connected) {
          try {
            // Simple health check - list available tools
            await connection.client.listTools();
            connection.lastHealthCheck = new Date();
            connection.failureCount = 0;
          } catch (error) {
            mcpDebug(`Health check failed for ${name}:`, error);
            connection.failureCount++;
            
            if (connection.failureCount > 3) {
              connection.connected = false;
              this.emit('serverDisconnected', name);
              
              // Attempt reconnection
              setTimeout(() => this.reconnectServer(name), 5000);
            }
          }
        }
      }
    }, config.global.healthCheckInterval);
  }

  /**
   * Attempt to reconnect to a server
   */
  private async reconnectServer(serverName: string): Promise<void> {
    if (this.isShuttingDown) return;
    
    const connection = this.connections.get(serverName);
    if (!connection || connection.connected) return;
    
    mcpDebug(`Attempting to reconnect to ${serverName}`);
    
    try {
      await this.connectToServer(serverName, connection.config);
    } catch (error) {
      mcpDebug(`Reconnection failed for ${serverName}:`, error);
      
      // Schedule another retry with exponential backoff
      const retryDelay = Math.min(
        connection.config.retryDelayMs * Math.pow(2, connection.failureCount),
        60000 // Max 1 minute
      );
      
      setTimeout(() => this.reconnectServer(serverName), retryDelay);
    }
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanup(): void {
    const cleanup = () => {
      this.shutdown();
    };
    
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    mcpDebug('Shutting down MCP Client Manager');
    
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Close all connections
    for (const [name, connection] of this.connections) {
      try {
        if (connection.connected) {
          await connection.client.close();
        }
        
        if (connection.process) {
          connection.process.kill();
        }
      } catch (error) {
        console.error(`Error closing connection to ${name}:`, error);
      }
    }
    
    this.connections.clear();
    this.emit('shutdown');
  }

  /**
   * Get status of all connections
   */
  getStatus(): Record<string, {
    connected: boolean;
    lastHealthCheck: Date;
    failureCount: number;
    category: string;
  }> {
    const status: Record<string, any> = {};
    
    for (const [name, connection] of this.connections) {
      status[name] = {
        connected: connection.connected,
        lastHealthCheck: connection.lastHealthCheck,
        failureCount: connection.failureCount,
        category: connection.config.category
      };
    }
    
    return status;
  }
}

// Singleton instance
let managerInstance: MCPClientManager | null = null;

/**
 * Get or create the MCP Client Manager instance
 */
export async function getMCPClientManager(): Promise<MCPClientManager> {
  if (!managerInstance) {
    managerInstance = new MCPClientManager();
    await managerInstance.initialize();
  }
  
  return managerInstance;
}

/**
 * Reset the MCP Client Manager (mainly for testing)
 */
export async function resetMCPClientManager(): Promise<void> {
  if (managerInstance) {
    await managerInstance.shutdown();
    managerInstance = null;
  }
}
