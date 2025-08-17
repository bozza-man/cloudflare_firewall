import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config.js';
import type {
  GatewayRule,
  GatewayList,
  GatewayLocation,
  GatewayCategory,
  CloudflareResponse,
  CreateGatewayRuleRequest,
  UpdateGatewayRuleRequest
} from '../types/gateway.js';

export class GatewayClient {
  private api: AxiosInstance;
  private accountId: string;

  constructor() {
    this.accountId = config.cloudflare.accountId;
    
    // Create headers based on available authentication method
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (config.cloudflare.apiToken) {
      // Use API Token authentication
      headers['Authorization'] = `Bearer ${config.cloudflare.apiToken}`;
    } else if (config.cloudflare.globalKey && config.cloudflare.email) {
      // Use Global API Key authentication  
      headers['X-Auth-Email'] = config.cloudflare.email;
      headers['X-Auth-Key'] = config.cloudflare.globalKey;
    }
    
    this.api = axios.create({
      baseURL: config.cloudflare.baseUrl,
      headers
    });
  }

  // Gateway Rules
  async listGatewayRules(): Promise<GatewayRule[]> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayRule[]>>(
        `/accounts/${this.accountId}/gateway/rules`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getGatewayRule(ruleId: string): Promise<GatewayRule> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayRule>>(
        `/accounts/${this.accountId}/gateway/rules/${ruleId}`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createGatewayRule(rule: CreateGatewayRuleRequest): Promise<GatewayRule> {
    try {
      // Convert filter expressions to Cloudflare Gateway format
      let trafficExpression = '';
      let filterTypes: string[] = [];
      
      if (rule.filters && rule.filters.length > 0) {
        // Filter out invalid fields that are not supported by Cloudflare Gateway
        const validFilters = rule.filters.filter(filter => {
          // Remove filters with unsupported fields
          return !filter.includes('app.type') && 
                 !filter.includes('app.') && 
                 filter.trim().length > 0;
        });
        
        if (validFilters.length === 0) {
          // If no valid filters remain, create a simple domain-based filter
          // This is a fallback to prevent empty rules
          trafficExpression = 'true';
          filterTypes = ['dns'];
        } else {
          // Separate filters by traffic type since Cloudflare Gateway rules
          // can only handle one traffic type per rule
          const dnsFilters = validFilters.filter(f => f.includes('dns.'));
          const httpFilters = validFilters.filter(f => f.includes('http.'));
          const l4Filters = validFilters.filter(f => f.includes('net.'));
          
          // Choose the most appropriate traffic type and filters
          // Priority: DNS > HTTP > L4 (DNS is most common for domain-based rules)
          if (dnsFilters.length > 0) {
            filterTypes = ['dns'];
            trafficExpression = dnsFilters.join(' or ');
          } else if (httpFilters.length > 0) {
            filterTypes = ['http'];
            trafficExpression = httpFilters.join(' or ');
          } else if (l4Filters.length > 0) {
            filterTypes = ['l4'];
            trafficExpression = l4Filters.join(' or ');
          } else {
            // Fallback to DNS
            filterTypes = ['dns'];
            trafficExpression = 'true';
          }
        }
      } else {
        // Default fallback
        filterTypes = [rule.traffic || 'dns'];
        trafficExpression = 'true'; // Allow all for this traffic type
      }
      
      const payload = {
        name: rule.name,
        description: rule.description || '',
        action: rule.action,
        enabled: rule.enabled !== undefined ? rule.enabled : true,
        filters: filterTypes,
        traffic: trafficExpression,
        precedence: rule.precedence || await this.getNextPrecedence(),
        identity: rule.identity || '',
        device_posture: rule.device_posture || '',
        rule_settings: rule.rule_settings || {}
      };
      
      
      const response = await this.api.post<CloudflareResponse<GatewayRule>>(
        `/accounts/${this.accountId}/gateway/rules`,
        payload
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateGatewayRule(update: UpdateGatewayRuleRequest): Promise<GatewayRule> {
    try {
      const response = await this.api.put<CloudflareResponse<GatewayRule>>(
        `/accounts/${this.accountId}/gateway/rules/${update.id}`,
        update
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteGatewayRule(ruleId: string): Promise<void> {
    try {
      await this.api.delete(`/accounts/${this.accountId}/gateway/rules/${ruleId}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateRulePrecedence(ruleId: string, precedence: number): Promise<GatewayRule> {
    try {
      // First fetch the existing rule to get all its properties
      const existingRule = await this.getGatewayRule(ruleId);
      
      // Update only the precedence while preserving all other fields
      const updatePayload = {
        name: existingRule.name,
        description: existingRule.description || '',
        action: existingRule.action,
        enabled: existingRule.enabled,
        filters: existingRule.filters,
        traffic: existingRule.traffic,
        precedence: precedence,
        identity: existingRule.identity || '',
        device_posture: existingRule.device_posture || '',
        rule_settings: existingRule.rule_settings || {}
      };
      
      const response = await this.api.put<CloudflareResponse<GatewayRule>>(
        `/accounts/${this.accountId}/gateway/rules/${ruleId}`,
        updatePayload
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Gateway Lists
  async listGatewayLists(): Promise<GatewayList[]> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayList[]>>(
        `/accounts/${this.accountId}/gateway/lists`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getGatewayList(listId: string): Promise<GatewayList> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayList>>(
        `/accounts/${this.accountId}/gateway/lists/${listId}`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createGatewayList(list: {
    name: string;
    description?: string;
    type: GatewayList['type'];
    items: Array<{ value: string; description?: string }>;
  }): Promise<GatewayList> {
    try {
      const response = await this.api.post<CloudflareResponse<GatewayList>>(
        `/accounts/${this.accountId}/gateway/lists`,
        list
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateGatewayList(update: {
    id: string;
    name?: string;
    description?: string;
    items?: Array<{ value: string; description?: string }>;
  }): Promise<GatewayList> {
    try {
      // For Gateway Lists, we need to use PATCH to update items
      const response = await this.api.patch<CloudflareResponse<GatewayList>>(
        `/accounts/${this.accountId}/gateway/lists/${update.id}`,
        {
          name: update.name,
          description: update.description,
          items: update.items
        }
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteGatewayList(listId: string): Promise<void> {
    try {
      await this.api.delete(`/accounts/${this.accountId}/gateway/lists/${listId}`);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Gateway Locations
  async listGatewayLocations(): Promise<GatewayLocation[]> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayLocation[]>>(
        `/accounts/${this.accountId}/gateway/locations`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Gateway Categories
  async listGatewayCategories(): Promise<GatewayCategory[]> {
    try {
      const response = await this.api.get<CloudflareResponse<GatewayCategory[]>>(
        `/accounts/${this.accountId}/gateway/categories`
      );
      return response.data.result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async getNextPrecedence(): Promise<number> {
    const rules = await this.listGatewayRules();
    if (rules.length === 0) return 1000;
    
    const maxPrecedence = Math.max(...rules.map(r => r.precedence));
    return maxPrecedence + 1000;
  }

  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const response = error.response?.data as CloudflareResponse<unknown>;
      if (response?.errors?.length > 0) {
        return new Error(`Cloudflare API Error: ${response.errors[0].message}`);
      }
      return new Error(`API Request failed: ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Fetch logs from Cloudflare Gateway
   * Note: This is a placeholder - actual implementation depends on Cloudflare's log API
   */
  public async fetchLogs(_options: {
    type: 'audit' | 'gateway_activity' | 'dns' | 'http';
    since?: string;
    until?: string;
    limit?: number;
  }): Promise<unknown[]> {
    // Cloudflare Zero Trust logs are typically accessed through:
    // 1. Logpush to external destinations
    // 2. GraphQL Analytics API
    // 3. REST API endpoints (limited)
    
    // For demonstration, we'll return an empty array
    // In production, you would implement the actual API call
    console.warn('fetchLogs is a placeholder - implement based on your Cloudflare log access method');
    
    // Example implementation for GraphQL Analytics API:
    /*
    const query = `
      query GetLogs($accountId: String!, $filter: LogFilter!) {
        viewer {
          accounts(filter: { accountTag: $accountId }) {
            gatewayLogs(filter: $filter, limit: ${options.limit || 100}) {
              edges {
                node {
                  timestamp
                  action
                  ruleId
                  sourceIp
                  destinationHost
                  // ... other fields
                }
              }
            }
          }
        }
      }
    `;
    
    // Make GraphQL request
    const response = await this.request('POST', 'https://api.cloudflare.com/client/v4/graphql', {
      query,
      variables: {
        accountId: this.accountId,
        filter: {
          datetime_geq: options.since,
          datetime_leq: options.until,
          type: options.type
        }
      }
    });
    
    return response.data.viewer.accounts[0].gatewayLogs.edges.map(e => e.node);
    */
    
    return [];
  }
}