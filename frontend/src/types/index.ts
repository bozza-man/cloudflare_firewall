// Firewall Rule Types
export interface FirewallRule {
  id: string;
  expression: string;
  action: 'block' | 'challenge' | 'js_challenge' | 'managed_challenge' | 'allow' | 'log' | 'bypass';
  description?: string;
  priority?: number;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  ref?: string;
  products?: string[];
}

// Rule Generation Types
export interface RuleGenerationRequest {
  description: string;
  context?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  suggestions?: string[];
}

export interface RuleGenerationResponse {
  rule: FirewallRule;
  explanation: string;
  confidence: number;
  alternatives?: FirewallRule[];
}

// Conflict Analysis Types
export interface ConflictAnalysisRequest {
  rules: FirewallRule[];
  checkOverlaps?: boolean;
  checkRedundancy?: boolean;
  checkContradictions?: boolean;
}

export interface RuleConflict {
  type: 'overlap' | 'redundancy' | 'contradiction' | 'shadow';
  severity: 'low' | 'medium' | 'high' | 'critical';
  rules: string[];
  description: string;
  resolution?: string;
  impact?: string;
}

export interface ConflictAnalysisResponse {
  conflicts: RuleConflict[];
  summary: {
    totalConflicts: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  recommendations: string[];
}

// Optimization Types
export interface OptimizationRequest {
  rules: FirewallRule[];
  optimizationLevel?: 'conservative' | 'moderate' | 'aggressive';
  preservePriority?: boolean;
  combineRules?: boolean;
  removeRedundant?: boolean;
}

export interface OptimizationSuggestion {
  type: 'combine' | 'remove' | 'reorder' | 'simplify' | 'modify';
  description: string;
  affectedRules: string[];
  newRule?: FirewallRule;
  expectedImprovement: string;
  risk: 'low' | 'medium' | 'high';
}

export interface OptimizationResponse {
  optimizedRules: FirewallRule[];
  suggestions: OptimizationSuggestion[];
  metrics: {
    originalCount: number;
    optimizedCount: number;
    reductionPercentage: number;
    performanceGain: string;
  };
}

// Backup Types
export interface Backup {
  id: string;
  timestamp: string;
  ruleCount: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface BackupResponse {
  backupId: string;
  timestamp: string;
  ruleCount: number;
  status: 'success' | 'partial' | 'failed';
  message?: string;
}

// Analytics Types
export interface RuleAnalytics {
  ruleId: string;
  hits: number;
  blocks: number;
  challenges: number;
  allows: number;
  lastTriggered?: string;
  topCountries?: { country: string; count: number }[];
  topIPs?: { ip: string; count: number }[];
  topUserAgents?: { userAgent: string; count: number }[];
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  apiStatus: 'up' | 'down';
  aiStatus: 'up' | 'down';
  databaseStatus: 'up' | 'down';
  storageStatus: 'up' | 'down';
  lastCheck: string;
  responseTime: number;
  version: string;
}

// Settings Types
export interface Settings {
  apiKey?: string;
  apiEndpoint: string;
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    enabled: boolean;
    critical: boolean;
    high: boolean;
    medium: boolean;
    low: boolean;
  };
  autoBackup: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly';
    retention: number;
  };
  aiSettings: {
    provider: 'cloudflare' | 'anthropic';
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    duration: number;
  };
}

// User Session Types
export interface UserSession {
  authenticated: boolean;
  apiKey?: string;
  expiresAt?: string;
  permissions?: string[];
}
