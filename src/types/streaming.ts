export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface GatewayLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  type: string;
  action: string;
  ruleId?: string;
  ruleName?: string;
  source: {
    ip?: string;
    country?: string;
    asn?: string;
    user?: string;
  };
  destination: {
    hostname?: string;
    ip?: string;
    port?: number;
    protocol?: string;
  };
  details: {
    method?: string;
    path?: string;
    query?: string;
    userAgent?: string;
    referer?: string;
    statusCode?: number;
    category?: string;
    threat?: string;
    [key: string]: any;
  };
  raw?: any;
}

export interface LogFilter {
  level?: LogLevel;
  ruleId?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface StreamStats {
  totalLogs: number;
  logsPerSecond: number;
  activeConnections: number;
  bufferSize: number;
  uptime: number;
}

export interface LogAggregation {
  timeRange: {
    from: string;
    to: string;
  };
  totals: {
    blocked: number;
    allowed: number;
    isolated: number;
    inspected: number;
  };
  topRules: Array<{
    ruleId: string;
    ruleName: string;
    count: number;
  }>;
  topSources: Array<{
    ip: string;
    country?: string;
    count: number;
  }>;
  topDestinations: Array<{
    hostname: string;
    count: number;
  }>;
  threatCategories: Record<string, number>;
}