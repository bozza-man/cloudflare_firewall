export interface CloudflareError {
  response?: {
    data?: {
      errors?: Array<{
        message: string;
        code?: string;
      }>;
    };
    status?: number;
  };
  message: string;
  code?: string;
}

export interface LogData {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp?: string;
}

export interface DashboardStats {
  total: number;
  blocked: number;
  allowed: number;
  bypassed: number;
  [key: string]: number;
}

export interface RuleAnalysisResult {
  conflicts: Array<{
    rule: string;
    severity: string;
    description: string;
  }>;
  suggestions: string[];
  optimizations: Array<{
    type: string;
    description: string;
    impact: string;
  }>;
}