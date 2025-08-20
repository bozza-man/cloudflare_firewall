/**
 * Cloudflare MCP Server Registry
 * Central registry of all available Cloudflare MCP servers with their configurations
 */

export interface MCPServerConfig {
  name: string;
  description: string;
  url: string;
  category: 'docs' | 'workers' | 'observability' | 'security' | 'analytics' | 'utilities';
  requiredPermissions?: string[];
  features: string[];
}

export const MCP_SERVERS: Record<string, MCPServerConfig> = {
  // Documentation & Reference
  docs: {
    name: 'Documentation Server',
    description: 'Get up to date reference information on Cloudflare',
    url: 'https://docs.mcp.cloudflare.com/sse',
    category: 'docs',
    features: [
      'Search Cloudflare documentation',
      'Get API reference information',
      'Find configuration examples',
      'Access best practices'
    ]
  },

  // Workers & Development
  bindings: {
    name: 'Workers Bindings Server',
    description: 'Build Workers applications with storage, AI, and compute primitives',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    category: 'workers',
    requiredPermissions: ['Workers Scripts:Read', 'Workers Scripts:Edit'],
    features: [
      'Manage KV namespaces',
      'Configure Durable Objects',
      'Set up R2 buckets',
      'Configure AI bindings',
      'Manage D1 databases',
      'Configure Queues',
      'Set up Vectorize indexes'
    ]
  },

  builds: {
    name: 'Workers Builds Server',
    description: 'Get insights and manage your Cloudflare Workers Builds',
    url: 'https://builds.mcp.cloudflare.com/sse',
    category: 'workers',
    requiredPermissions: ['Workers Scripts:Read'],
    features: [
      'Monitor build status',
      'View build logs',
      'Track deployment history',
      'Analyze build performance',
      'Debug build failures'
    ]
  },

  containers: {
    name: 'Container Server',
    description: 'Spin up a sandbox development environment',
    url: 'https://containers.mcp.cloudflare.com/sse',
    category: 'workers',
    features: [
      'Create sandbox environments',
      'Test Workers locally',
      'Prototype configurations',
      'Isolated development'
    ]
  },

  // Observability & Monitoring
  observability: {
    name: 'Observability Server',
    description: "Debug and get insight into your application's logs and analytics",
    url: 'https://observability.mcp.cloudflare.com/sse',
    category: 'observability',
    requiredPermissions: ['Analytics:Read', 'Logs:Read'],
    features: [
      'Real-time log streaming',
      'Error tracking',
      'Performance metrics',
      'Request analytics',
      'Tail Workers logs',
      'Search historical logs'
    ]
  },

  logpush: {
    name: 'Logpush Server',
    description: 'Get quick summaries for Logpush job health',
    url: 'https://logs.mcp.cloudflare.com/sse',
    category: 'observability',
    requiredPermissions: ['Logs:Read', 'Logs:Edit'],
    features: [
      'Monitor Logpush jobs',
      'Check job health',
      'View delivery status',
      'Analyze log volumes',
      'Configure destinations'
    ]
  },

  // Security
  radar: {
    name: 'Radar Server',
    description: 'Get global Internet traffic insights, trends, URL scans, and other utilities',
    url: 'https://radar.mcp.cloudflare.com/sse',
    category: 'security',
    features: [
      'Domain reputation checks',
      'URL scanning',
      'Traffic insights',
      'Threat intelligence',
      'ASN information',
      'IP geolocation',
      'Attack trends',
      'Internet quality metrics'
    ]
  },

  aiGateway: {
    name: 'AI Gateway Server',
    description: 'Search your logs, get details about the prompts and responses',
    url: 'https://ai-gateway.mcp.cloudflare.com/sse',
    category: 'security',
    requiredPermissions: ['AI Gateway:Read'],
    features: [
      'Monitor AI requests',
      'Analyze prompts',
      'Track responses',
      'Cost analysis',
      'Rate limiting insights',
      'Cache performance'
    ]
  },

  auditLogs: {
    name: 'Audit Logs Server',
    description: 'Query audit logs and generate reports for review',
    url: 'https://auditlogs.mcp.cloudflare.com/sse',
    category: 'security',
    requiredPermissions: ['Audit Logs:Read'],
    features: [
      'Search audit events',
      'Generate compliance reports',
      'Track user actions',
      'Monitor API usage',
      'Security event analysis'
    ]
  },

  casb: {
    name: 'Cloudflare One CASB Server',
    description: 'Quickly identify any security misconfigurations for SaaS applications to safeguard users & data',
    url: 'https://casb.mcp.cloudflare.com/sse',
    category: 'security',
    requiredPermissions: ['Zero Trust:Read'],
    features: [
      'SaaS security scanning',
      'Misconfiguration detection',
      'Compliance checks',
      'Risk assessment',
      'Shadow IT discovery'
    ]
  },

  // Analytics
  dnsAnalytics: {
    name: 'DNS Analytics Server',
    description: 'Optimize DNS performance and debug issues based on current set up',
    url: 'https://dns-analytics.mcp.cloudflare.com/sse',
    category: 'analytics',
    requiredPermissions: ['DNS:Read', 'Analytics:Read'],
    features: [
      'Query performance metrics',
      'NXDOMAIN analysis',
      'Response time tracking',
      'Geographic distribution',
      'Query type breakdown'
    ]
  },

  dex: {
    name: 'Digital Experience Monitoring Server',
    description: 'Get quick insight on critical applications for your organization',
    url: 'https://dex.mcp.cloudflare.com/sse',
    category: 'analytics',
    requiredPermissions: ['Zero Trust:Read'],
    features: [
      'Application performance',
      'User experience metrics',
      'Network path analysis',
      'Device health monitoring',
      'Connectivity issues'
    ]
  },

  graphql: {
    name: 'GraphQL Server',
    description: "Get analytics data using Cloudflare's GraphQL API",
    url: 'https://graphql.mcp.cloudflare.com/sse',
    category: 'analytics',
    requiredPermissions: ['Analytics:Read'],
    features: [
      'Custom analytics queries',
      'Flexible data retrieval',
      'Complex aggregations',
      'Time series analysis',
      'Cross-product analytics'
    ]
  },

  // Utilities
  browserRendering: {
    name: 'Browser Rendering Server',
    description: 'Fetch web pages, convert them to markdown and take screenshots',
    url: 'https://browser.mcp.cloudflare.com/sse',
    category: 'utilities',
    requiredPermissions: ['Browser Rendering:Read'],
    features: [
      'Webpage screenshots',
      'HTML to Markdown conversion',
      'JavaScript rendering',
      'Content extraction',
      'Automated browsing'
    ]
  },

  autorag: {
    name: 'AutoRAG Server',
    description: 'List and search documents on your AutoRAGs',
    url: 'https://autorag.mcp.cloudflare.com/sse',
    category: 'utilities',
    requiredPermissions: ['AI:Read'],
    features: [
      'Document search',
      'RAG management',
      'Knowledge base queries',
      'Document indexing status'
    ]
  }
};

// Helper functions
export function getServersByCategory(category: MCPServerConfig['category']): MCPServerConfig[] {
  return Object.values(MCP_SERVERS).filter(server => server.category === category);
}

export function getServerByName(name: string): MCPServerConfig | undefined {
  return MCP_SERVERS[name];
}

export function getAllServers(): MCPServerConfig[] {
  return Object.values(MCP_SERVERS);
}

export function getRequiredPermissions(serverNames: string[]): string[] {
  const permissions = new Set<string>();
  
  for (const name of serverNames) {
    const server = MCP_SERVERS[name];
    if (server?.requiredPermissions) {
      server.requiredPermissions.forEach(p => permissions.add(p));
    }
  }
  
  return Array.from(permissions);
}
