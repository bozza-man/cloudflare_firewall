/**
 * MCP (Model Context Protocol) Configuration
 * 
 * Controls how MCP servers are initialized and managed
 */

export interface MCPConfig {
  /**
   * Enable MCP integration
   * Set to false to completely disable MCP and always use fallback
   */
  enabled: boolean;

  /**
   * Run MCP servers in background mode
   * When true, MCP servers start silently without interactive prompts
   */
  backgroundMode: boolean;

  /**
   * Enable debug logging for MCP operations
   */
  debug: boolean;

  /**
   * Maximum time to wait for MCP connection (ms)
   */
  connectionTimeout: number;

  /**
   * Maximum connection retry attempts
   */
  maxRetries: number;

  /**
   * Health check interval (ms)
   */
  healthCheckInterval: number;

  /**
   * Authentication configuration
   */
  auth?: {
    /**
     * OAuth token for MCP server
     * If not provided, will attempt browser-based OAuth flow
     */
    token?: string;

    /**
     * Skip browser-based authentication
     * Useful for CI/CD environments
     */
    skipBrowserAuth: boolean;
  };
}

/**
 * Default MCP configuration
 */
export const defaultMCPConfig: MCPConfig = {
  enabled: process.env.MCP_ENABLED !== 'false', // Enabled by default
  backgroundMode: true, // Always run in background
  debug: process.env.DEBUG_MCP === 'true',
  connectionTimeout: 10000, // 10 seconds
  maxRetries: 3,
  healthCheckInterval: 30000, // 30 seconds
  auth: {
    token: process.env.MCP_AUTH_TOKEN,
    skipBrowserAuth: true // Skip browser auth by default
  }
};

/**
 * Get MCP configuration from environment and defaults
 */
export function getMCPConfig(): MCPConfig {
  return {
    ...defaultMCPConfig,
    enabled: process.env.MCP_ENABLED !== 'false',
    backgroundMode: process.env.MCP_BACKGROUND !== 'false',
    debug: process.env.DEBUG_MCP === 'true',
    connectionTimeout: parseInt(process.env.MCP_TIMEOUT || '10000'),
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3'),
    healthCheckInterval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL || '30000'),
    auth: {
      token: process.env.MCP_AUTH_TOKEN,
      skipBrowserAuth: process.env.MCP_SKIP_BROWSER_AUTH !== 'false'
    }
  };
}

/**
 * Check if MCP should be used based on configuration
 */
export function shouldUseMCP(): boolean {
  const config = getMCPConfig();
  return config.enabled;
}

/**
 * Log MCP debug message if debug mode is enabled
 */
export function mcpDebug(message: string, ...args: any[]): void {
  const config = getMCPConfig();
  if (config.debug) {
    console.debug(`[MCP] ${message}`, ...args);
  }
}
