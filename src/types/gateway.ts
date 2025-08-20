export interface GatewayRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
  filters: string[];
  traffic: string;
  identity?: string;
  device_posture?: string;
  precedence: number;
  created_at: string;
  updated_at: string;
  rule_settings?: {
    block_page_enabled?: boolean;
    block_page_reason?: string;
    block_page?: {
      enabled: boolean;
      url?: string;
      context?: {
        rule_name?: string;
        custom_message?: string;
        show_rule_name?: boolean;
        show_category?: boolean;
        show_user_info?: boolean;
        support_contact?: string;
      };
    };
    override_ips?: string[];
    override_host?: string;
    l4_override?: {
      ip: string;
      port: number;
    };
    egress?: {
      ipv4?: string;
      ipv6?: string;
    };
    untrusted_cert?: {
      action?: 'pass_through' | 'block' | 'error';
    };
  };
}

export interface GatewayLocation {
  id: string;
  name: string;
  networks?: Array<{
    network: string;
  }>;
  client_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GatewayList {
  id: string;
  name: string;
  description?: string;
  type: 'SERIAL' | 'URL' | 'DOMAIN' | 'EMAIL' | 'IP';
  items: Array<{
    value: string;
    description?: string;
    created_at: string;
  }>;
  count: number;
  created_at: string;
  updated_at: string;
}

export interface GatewayCategory {
  id: number;
  name: string;
  description: string;
  class: string;
  subcategories: Array<{
    id: number;
    name: string;
  }> | null;
}

export interface CreateGatewayRuleRequest {
  name: string;
  description?: string;
  action: GatewayRule['action'];
  enabled?: boolean;
  filters: string[];
  traffic?: string;
  identity?: string;
  device_posture?: string;
  precedence?: number;
  rule_settings?: GatewayRule['rule_settings'];
}

export interface UpdateGatewayRuleRequest {
  id: string;
  name?: string;
  description?: string;
  action?: GatewayRule['action'];
  enabled?: boolean;
  filters?: string[];
  traffic?: string;
  identity?: string;
  device_posture?: string;
  precedence?: number;
  rule_settings?: GatewayRule['rule_settings'];
}

export interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: string[];
  result: T;
}

export interface RuleConflict {
  conflictingRule: GatewayRule;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  suggestion?: string;
}

export interface GatewayFilter {
  // HTTP filters
  http?: {
    host?: string[];
    path?: string[];
    method?: string[];
  };
  // DNS filters
  dns?: {
    domain?: string[];
    content_categories?: number[];
    security_categories?: number[];
  };
  // Network filters
  l4?: {
    protocol?: string;
    port?: string[];
    ip?: string[];
  };
  // Application filters
  application?: {
    app_id?: string[];
  };
}export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'warning';
