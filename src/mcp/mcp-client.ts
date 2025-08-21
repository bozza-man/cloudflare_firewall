import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import chalk from 'chalk';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPToolResult {
  content: any;
  isError: boolean;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverConfig: MCPServerConfig;
  private connected: boolean = false;
  private availableTools: Map<string, Tool> = new Map();

  constructor(serverConfig: MCPServerConfig) {
    this.serverConfig = serverConfig;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      console.log(chalk.cyan(`🔌 Connecting to MCP server: ${this.serverConfig.name}...`));

      // Spawn the MCP server process
      const serverProcess = spawn(this.serverConfig.command, this.serverConfig.args, {
        env: { ...process.env, ...this.serverConfig.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Create transport
      this.transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout,
        stderr: serverProcess.stderr
      } as any);

      // Create client
      this.client = new Client(
        {
          name: 'cloudflare-gateway-manager',
          version: '1.0.0'
        },
        {
          capabilities: {}
        }
      );

      // Connect to the server
      await this.client.connect(this.transport);
      this.connected = true;

      // List available tools
      await this.listTools();

      console.log(chalk.green(`✅ Connected to ${this.serverConfig.name}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to connect to ${this.serverConfig.name}:`), error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      this.client = null;
      this.transport = null;
      console.log(chalk.yellow(`🔌 Disconnected from ${this.serverConfig.name}`));
    } catch (error) {
      console.error(chalk.red(`❌ Error disconnecting from ${this.serverConfig.name}:`), error);
    }
  }

  async listTools(): Promise<Tool[]> {
    if (!this.client || !this.connected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const response = await this.client.listTools();
      const tools = response.tools || [];
      
      // Cache tools for reference
      this.availableTools.clear();
      tools.forEach(tool => {
        this.availableTools.set(tool.name, tool);
      });

      return tools;
    } catch (error) {
      console.error(chalk.red('Error listing tools:'), error);
      return [];
    }
  }

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<MCPToolResult> {
    if (!this.client || !this.connected) {
      throw new Error('Not connected to MCP server');
    }

    if (!this.availableTools.has(toolName)) {
      throw new Error(`Tool '${toolName}' not available on this server`);
    }

    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return {
        content: response.content,
        isError: (response as any).isError === true
      };
    } catch (error) {
      console.error(chalk.red(`Error calling tool '${toolName}':`), error);
      throw error;
    }
  }

  getAvailableTools(): Tool[] {
    return Array.from(this.availableTools.values());
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// MCP Server configurations for Cloudflare services
export const CLOUDFLARE_MCP_SERVERS = {
  observability: {
    name: 'cloudflare-observability',
    command: 'npx',
    args: ['mcp-remote', 'https://observability.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  bindings: {
    name: 'cloudflare-bindings',
    command: 'npx',
    args: ['mcp-remote', 'https://bindings.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  browser: {
    name: 'cloudflare-browser',
    command: 'npx',
    args: ['mcp-remote', 'https://browser.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  auditlogs: {
    name: 'cloudflare-auditlogs',
    command: 'npx',
    args: ['mcp-remote', 'https://auditlogs.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  radar: {
    name: 'cloudflare-radar',
    command: 'npx',
    args: ['mcp-remote', 'https://radar.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  aiGateway: {
    name: 'cloudflare-ai-gateway',
    command: 'npx',
    args: ['mcp-remote', 'https://ai-gateway.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },
  dnsAnalytics: {
    name: 'cloudflare-dns-analytics',
    command: 'npx',
    args: ['mcp-remote', 'https://dns-analytics.mcp.cloudflare.com/sse'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      CLOUDFLARE_ZONE_ID: process.env.CLOUDFLARE_ZONE_ID || '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  }
};
