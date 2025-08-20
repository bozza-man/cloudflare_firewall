/**
 * MCP (Model Context Protocol) Client for Cloudflare Radar
 * 
 * This module provides integration with the Cloudflare Radar MCP Server
 * for accessing Cloudflare Radar API through a standardized protocol.
 * 
 * Documentation: https://github.com/cloudflare/mcp-server-cloudflare/tree/main/apps/radar
 */

import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import { getMCPConfig, mcpDebug, shouldUseMCP } from './mcp-config.js';

export interface MCPRadarDomainInfo {
  domain: string;
  rank?: number;
  categories?: string[];
  riskScore?: number;
  popularity?: number;
  asn?: number;
  organization?: string;
  country?: string;
  threats?: string[];
}

export interface MCPRadarASInfo {
  asn: number;
  name: string;
  country?: string;
  orgName?: string;
}

export interface MCPRadarIPInfo {
  ip: string;
  asn?: number;
  organization?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isProxy?: boolean;
  isVpn?: boolean;
  isTor?: boolean;
}

export interface MCPRadarScanResult {
  url: string;
  verdict?: 'safe' | 'suspicious' | 'malicious';
  categories?: string[];
  technologies?: string[];
  risks?: string[];
  certificates?: {
    issuer?: string;
    validFrom?: string;
    validTo?: string;
  }[];
}

export class MCPRadarClient extends EventEmitter {
  private client: MCPClient | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number;
  private mcpProcess: ChildProcess | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private config = getMCPConfig();

  constructor() {
    super();
    this.maxConnectionAttempts = this.config.maxRetries;
    // Don't initialize immediately - wait for first use
    // This prevents unnecessary background processes
    this.setupProcessHandlers();
  }

  /**
   * Setup process cleanup handlers
   */
  private setupProcessHandlers(): void {
    // Cleanup on process exit
    process.on('exit', () => {
      this.cleanup();
    });

    // Cleanup on SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    // Cleanup on SIGTERM
    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Cleanup MCP process and timers
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.mcpProcess && !this.mcpProcess.killed) {
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
    }

    this.isConnected = false;
    this.client = null;
  }

  /**
   * Initialize the MCP client connection
   */
  private async initialize(): Promise<void> {
    // Check if MCP is enabled
    if (!shouldUseMCP()) {
      mcpDebug('MCP is disabled via configuration');
      return;
    }

    if (this.isConnected || this.connectionAttempts >= this.maxConnectionAttempts) {
      return;
    }

    this.connectionAttempts++;

    try {
      mcpDebug('Starting MCP Radar client in background...');

      // Set environment variables to run in non-interactive mode
      const env = {
        ...process.env,
        MCP_NO_BROWSER: 'true',  // Prevent browser from opening
        MCP_BACKGROUND: String(this.config.backgroundMode),
        NODE_NO_WARNINGS: '1',   // Suppress Node warnings
        MCP_AUTH_TOKEN: this.config.auth?.token || '',
        MCP_SKIP_BROWSER_AUTH: String(this.config.auth?.skipBrowserAuth)
      };

      // Spawn the mcp-remote process in detached mode for background operation
      this.mcpProcess = spawn('npx', 
        ['mcp-remote', 'https://radar.mcp.cloudflare.com/sse'],
        {
          env: env as Record<string, string>,
          detached: false,  // Keep attached to parent but suppress output
          stdio: ['pipe', 'pipe', 'pipe']  // Pipe stdio for transport
        }
      );

      // Handle process errors silently
      this.mcpProcess.on('error', (error) => {
        mcpDebug(`Process error: ${error.message}`);
        this.handleDisconnection();
      });

      // Handle process exit
      this.mcpProcess.on('exit', (code, signal) => {
        if (code !== 0) {
          mcpDebug(`Process exited with code ${code}, signal ${signal}`);
        }
        this.handleDisconnection();
      });

      // Suppress stdout/stderr output in production
      if (this.mcpProcess.stdout) {
        this.mcpProcess.stdout.on('data', (data) => {
          mcpDebug(`Output: ${data.toString().trim()}`);
        });
      }

      if (this.mcpProcess.stderr) {
        this.mcpProcess.stderr.on('data', (data) => {
          mcpDebug(`Error output: ${data.toString().trim()}`);
        });
      }

      // Create transport using the spawned process
      const transport = new StdioClientTransport({
        stdin: this.mcpProcess.stdin!,
        stdout: this.mcpProcess.stdout!,
        stderr: this.mcpProcess.stderr!
      });

      this.client = new MCPClient({
        name: 'cloudflare-firewall-radar-client',
        version: '1.0.0'
      }, {
        capabilities: {}
      });

      // Set a timeout for connection
      let connectionTimeout: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise((_, reject) => {
        connectionTimeout = setTimeout(() => {
          reject(new Error('MCP connection timeout'));
        }, this.config.connectionTimeout);
      });

      // Race between connection and timeout
      await Promise.race([
        this.client.connect(transport),
        timeoutPromise
      ]);
      
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      
      this.isConnected = true;
      this.connectionAttempts = 0; // Reset on successful connection
      mcpDebug('MCP Radar client connected successfully');
      
      // Start health check
      this.startHealthCheck();
      
    } catch (error) {
      mcpDebug(`Connection failed (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}): ${error}`);
      
      this.handleDisconnection();
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        // Schedule retry
        this.scheduleReconnect();
      } else {
        mcpDebug('Max attempts reached - MCP features unavailable');
      }
    }
  }

  /**
   * Handle disconnection and cleanup
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.client = null;
    
    if (this.mcpProcess && !this.mcpProcess.killed) {
      this.mcpProcess.kill('SIGTERM');
      this.mcpProcess = null;
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000); // Exponential backoff, max 30s
    mcpDebug(`Scheduling reconnect in ${delay}ms...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.initialize().catch(() => {
        // Silently handle failure, will be logged in initialize
      });
    }, delay);
  }

  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    // Check connection health periodically
    this.healthCheckTimer = setInterval(() => {
      if (this.isConnected && this.client) {
        // Try a simple operation to check if connection is alive
        // If it fails, we'll handle reconnection
        this.client.listTools().catch(() => {
          mcpDebug('Health check failed, reconnecting...');
          this.handleDisconnection();
          this.scheduleReconnect();
        });
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Ensure the client is connected before making requests
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.initialize();
      if (!this.isConnected) {
        throw new Error('MCP server unavailable - using fallback');
      }
    }
    
    // Additional check to ensure client is still valid
    if (!this.client) {
      this.isConnected = false;
      await this.initialize();
      if (!this.client) {
        throw new Error('MCP client not available');
      }
    }
  }

  /**
   * Call a tool on the MCP server
   */
  private async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    await this.ensureConnected();
    
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args
      });

      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : null;
    } catch (error) {
      mcpDebug(`Tool call failed for ${toolName}: ${error}`);
      throw error;
    }
  }

  /**
   * Get domain ranking and details
   */
  async getDomainDetails(domain: string): Promise<MCPRadarDomainInfo | null> {
    try {
      // Clean domain
      const cleanDomain = domain.toLowerCase().trim()
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split('?')[0];

      // Get domain rank details
      const rankData = await this.callTool('get_domain_rank_details', {
        domain: cleanDomain
      });

      // Transform the response to our interface
      if (rankData) {
        return {
          domain: cleanDomain,
          rank: rankData.rank,
          categories: rankData.categories || [],
          popularity: rankData.rank ? 100 - (Math.log10(rankData.rank) * 10) : 0,
          // Additional fields would come from other tools or enhanced data
        };
      }

      return null;
    } catch (error) {
      mcpDebug(`Domain details lookup failed for ${domain}: ${error}`);
      return null;
    }
  }

  /**
   * Get AS (Autonomous System) details
   */
  async getASDetails(asn: number): Promise<MCPRadarASInfo | null> {
    try {
      const asData = await this.callTool('get_as_details', {
        asn: asn.toString()
      });

      if (asData) {
        return {
          asn,
          name: asData.name,
          country: asData.country,
          orgName: asData.orgName
        };
      }

      return null;
    } catch (error) {
      mcpDebug(`AS details lookup failed for ASN ${asn}: ${error}`);
      return null;
    }
  }

  /**
   * Get IP address details
   */
  async getIPDetails(ip: string): Promise<MCPRadarIPInfo | null> {
    try {
      const ipData = await this.callTool('get_ip_details', {
        ip
      });

      if (ipData) {
        return {
          ip,
          asn: ipData.asn,
          organization: ipData.organization,
          country: ipData.country,
          city: ipData.city,
          latitude: ipData.latitude,
          longitude: ipData.longitude,
          isProxy: ipData.is_proxy,
          isVpn: ipData.is_vpn,
          isTor: ipData.is_tor
        };
      }

      return null;
    } catch (error) {
      mcpDebug(`IP details lookup failed for ${ip}: ${error}`);
      return null;
    }
  }

  /**
   * Scan a URL for security threats
   */
  async scanURL(url: string): Promise<MCPRadarScanResult | null> {
    try {
      // Ensure URL has protocol
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      
      const scanData = await this.callTool('scan_url', {
        url: fullUrl
      });

      if (scanData) {
        return {
          url: fullUrl,
          verdict: scanData.verdict,
          categories: scanData.categories || [],
          technologies: scanData.technologies || [],
          risks: scanData.risks || [],
          certificates: scanData.certificates || []
        };
      }

      return null;
    } catch (error) {
      mcpDebug(`URL scan failed for ${url}: ${error}`);
      return null;
    }
  }

  /**
   * Get traffic anomalies for a location or AS
   */
  async getTrafficAnomalies(options: {
    asn?: number;
    location?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<any[]> {
    try {
      const anomalies = await this.callTool('get_traffic_anomalies', options);
      return anomalies || [];
    } catch (error) {
      mcpDebug('Traffic anomalies lookup failed');
      return [];
    }
  }

  /**
   * Get AI-related traffic data
   */
  async getAIData(options: {
    dateStart?: string;
    dateEnd?: string;
    location?: string;
  } = {}): Promise<any> {
    try {
      return await this.callTool('get_ai_data', options);
    } catch (error) {
      mcpDebug('AI data lookup failed');
      return null;
    }
  }

  /**
   * Get HTTP traffic data
   */
  async getHTTPData(options: {
    dateStart?: string;
    dateEnd?: string;
    location?: string;
    deviceType?: string;
  } = {}): Promise<any> {
    try {
      return await this.callTool('get_http_data', options);
    } catch (error) {
      mcpDebug('HTTP data lookup failed');
      return null;
    }
  }

  /**
   * Get Layer 7 attack data
   */
  async getL7AttackData(options: {
    dateStart?: string;
    dateEnd?: string;
    location?: string;
  } = {}): Promise<any> {
    try {
      return await this.callTool('get_l7_attack_data', options);
    } catch (error) {
      mcpDebug('L7 attack data lookup failed');
      return null;
    }
  }

  /**
   * Disconnect the MCP client
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.close();
      }
    } catch (error) {
      // Silently handle disconnect errors
      mcpDebug(`Disconnect error: ${error}`);
    } finally {
      this.cleanup();
      mcpDebug('MCP Radar client stopped');
    }
  }

  /**
   * Check if MCP is available (without trying to connect)
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }
}

// Export a singleton instance
export const mcpRadarClient = new MCPRadarClient();
