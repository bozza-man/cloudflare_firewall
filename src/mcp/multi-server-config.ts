/**
 * Multi-Server MCP Configuration
 * Extended configuration system for managing multiple MCP servers
 */

import { MCPConfig } from '../security/mcp-config.js';
import { MCP_SERVERS, MCPServerConfig } from './server-registry.js';

export interface ServerSpecificConfig extends MCPConfig {
  serverName: string;
  serverUrl: string;
  category: MCPServerConfig['category'];
  requiredPermissions?: string[];
  customHeaders?: Record<string, string>;
}

export interface MultiServerConfig {
  // Global configuration that applies to all servers
  global: MCPConfig;
  
  // Server-specific configurations
  servers: Map<string, ServerSpecificConfig>;
  
  // List of enabled servers
  enabledServers: Set<string>;
  
  // Server priorities for fallback
  serverPriorities: Map<string, number>;
}

/**
 * Get configuration for a specific MCP server
 */
export function getServerConfig(serverName: string): ServerSpecificConfig | null {
  const globalConfig = getMCPGlobalConfig();
  const serverInfo = MCP_SERVERS[serverName];
  
  if (!serverInfo) {
    console.warn(`Unknown MCP server: ${serverName}`);
    return null;
  }
  
  // Check for server-specific environment variables
  const envPrefix = `MCP_${serverName.toUpperCase()}_`;
  
  return {
    ...globalConfig,
    serverName,
    serverUrl: process.env[`${envPrefix}URL`] || serverInfo.url,
    category: serverInfo.category,
    requiredPermissions: serverInfo.requiredPermissions,
    enabled: process.env[`${envPrefix}ENABLED`] !== 'false',
    backgroundMode: process.env[`${envPrefix}BACKGROUND`] !== 'false',
    debug: process.env[`${envPrefix}DEBUG`] === 'true' || globalConfig.debug,
    connectionTimeout: parseInt(
      process.env[`${envPrefix}TIMEOUT`] || String(globalConfig.connectionTimeout)
    ),
    maxRetries: parseInt(
      process.env[`${envPrefix}MAX_RETRIES`] || String(globalConfig.maxRetries)
    ),
    auth: {
      token: process.env[`${envPrefix}TOKEN`] || globalConfig.auth?.token,
      skipBrowserAuth: process.env[`${envPrefix}SKIP_AUTH`] !== 'false'
    },
    customHeaders: parseCustomHeaders(process.env[`${envPrefix}HEADERS`])
  };
}

/**
 * Get global MCP configuration
 */
function getMCPGlobalConfig(): MCPConfig {
  return {
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
 * Parse custom headers from environment variable
 */
function parseCustomHeaders(headersStr?: string): Record<string, string> | undefined {
  if (!headersStr) return undefined;
  
  try {
    return JSON.parse(headersStr);
  } catch {
    // Try to parse as comma-separated key:value pairs
    const headers: Record<string, string> = {};
    const pairs = headersStr.split(',');
    
    for (const pair of pairs) {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (key && value) {
        headers[key] = value;
      }
    }
    
    return Object.keys(headers).length > 0 ? headers : undefined;
  }
}

/**
 * Get list of enabled MCP servers
 */
export function getEnabledServers(): string[] {
  // Check for explicit enabled servers list
  const enabledList = process.env.MCP_ENABLED_SERVERS;
  
  if (enabledList) {
    return enabledList.split(',').map(s => s.trim()).filter(Boolean);
  }
  
  // Default enabled servers based on common use cases
  const defaultEnabled = [
    'radar',           // Security and threat intelligence
    'docs',            // Documentation access
    'observability',   // Logs and debugging
    'dnsAnalytics',   // DNS performance
    'auditLogs',      // Security auditing
    'browserRendering' // Web page analysis
  ];
  
  // Filter out servers that are explicitly disabled
  return defaultEnabled.filter(serverName => {
    const envKey = `MCP_${serverName.toUpperCase()}_ENABLED`;
    return process.env[envKey] !== 'false';
  });
}

/**
 * Get complete multi-server configuration
 */
export function getMultiServerConfig(): MultiServerConfig {
  const global = getMCPGlobalConfig();
  const servers = new Map<string, ServerSpecificConfig>();
  const enabledServers = new Set(getEnabledServers());
  const serverPriorities = new Map<string, number>();
  
  // Configure each enabled server
  for (const serverName of enabledServers) {
    const config = getServerConfig(serverName);
    if (config) {
      servers.set(serverName, config);
      
      // Set default priorities based on category
      const priority = getDefaultPriority(config.category);
      serverPriorities.set(serverName, priority);
    }
  }
  
  return {
    global,
    servers,
    enabledServers,
    serverPriorities
  };
}

/**
 * Get default priority for a server category
 */
function getDefaultPriority(category: MCPServerConfig['category']): number {
  const priorities: Record<MCPServerConfig['category'], number> = {
    'docs': 1,         // Documentation is highest priority
    'security': 2,     // Security features are critical
    'observability': 3, // Monitoring and debugging
    'analytics': 4,    // Analytics and insights
    'workers': 5,      // Development features
    'utilities': 6     // Utility functions
  };
  
  return priorities[category] || 10;
}

/**
 * Check if a specific server is enabled
 */
export function isServerEnabled(serverName: string): boolean {
  const config = getMultiServerConfig();
  return config.enabledServers.has(serverName);
}

/**
 * Get servers by category
 */
export function getEnabledServersByCategory(
  category: MCPServerConfig['category']
): ServerSpecificConfig[] {
  const config = getMultiServerConfig();
  const results: ServerSpecificConfig[] = [];
  
  for (const [name, serverConfig] of config.servers) {
    if (serverConfig.category === category && config.enabledServers.has(name)) {
      results.push(serverConfig);
    }
  }
  
  return results;
}

/**
 * Validate that required permissions are available
 */
export function validatePermissions(serverNames: string[]): {
  valid: boolean;
  missing: string[];
} {
  const requiredPermissions = new Set<string>();
  
  for (const name of serverNames) {
    const server = MCP_SERVERS[name];
    if (server?.requiredPermissions) {
      server.requiredPermissions.forEach(p => requiredPermissions.add(p));
    }
  }
  
  // In a real implementation, this would check against the API token's actual permissions
  // For now, we'll assume all permissions are available if a token is provided
  const hasToken = !!process.env.MCP_AUTH_TOKEN || !!process.env.CLOUDFLARE_API_TOKEN;
  
  return {
    valid: hasToken,
    missing: hasToken ? [] : Array.from(requiredPermissions)
  };
}
