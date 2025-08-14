import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { GatewayClient } from '../../src/api/gateway-client';
import { 
  mockGatewayRule, 
  mockGatewayRules, 
  mockCloudflareResponse,
  mockCloudflareError 
} from '../fixtures/gateway-rules';
import { createTestEnvironment, mockCloudflareAPI } from '../utils/test-helpers';

describe('GatewayClient', () => {
  let client: GatewayClient;
  let envCleanup: ReturnType<typeof createTestEnvironment>;
  let cloudflareAPI: ReturnType<typeof mockCloudflareAPI>;

  beforeEach(() => {
    envCleanup = createTestEnvironment();
    cloudflareAPI = mockCloudflareAPI();
    client = new GatewayClient();
  });

  afterEach(() => {
    envCleanup.restore();
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should initialize with API token authentication', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      const client = new GatewayClient();
      expect(client).toBeInstanceOf(GatewayClient);
    });

    it('should initialize with global key authentication', () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      process.env.CLOUDFLARE_GLOBAL_KEY = 'test-global-key';
      process.env.CLOUDFLARE_EMAIL = 'test@example.com';
      const client = new GatewayClient();
      expect(client).toBeInstanceOf(GatewayClient);
    });
  });

  describe('listGatewayRules', () => {
    it('should fetch gateway rules successfully', async () => {
      cloudflareAPI.mockListRules(mockCloudflareResponse);

      const rules = await client.listGatewayRules();

      expect(rules).toEqual(mockGatewayRules);
      expect(rules).toHaveLength(3);
      expect(rules[0]).toMatchObject({
        id: 'rule-1',
        name: 'Block Malware',
        action: 'block'
      });
    });

    it('should handle API errors gracefully', async () => {
      cloudflareAPI.mockListRules(mockCloudflareError, 401);

      await expect(client.listGatewayRules()).rejects.toThrow('Cloudflare API Error: Authentication failed');
    });

    it('should handle network errors', async () => {
      cloudflareAPI.scope.get('/client/v4/accounts/test-account-id/gateway/rules')
        .replyWithError('Network Error');

      await expect(client.listGatewayRules()).rejects.toThrow('API Request failed: Network Error');
    });

    it('should handle empty response', async () => {
      const emptyResponse = { ...mockCloudflareResponse, result: [] };
      cloudflareAPI.mockListRules(emptyResponse);

      const rules = await client.listGatewayRules();
      expect(rules).toEqual([]);
      expect(rules).toHaveLength(0);
    });
  });

  describe('getGatewayRule', () => {
    it('should fetch a single rule by ID', async () => {
      const response = { ...mockCloudflareResponse, result: mockGatewayRule };
      cloudflareAPI.mockGetRule('test-rule-123', response);

      const rule = await client.getGatewayRule('test-rule-123');

      expect(rule).toEqual(mockGatewayRule);
      expect(rule.id).toBe('test-rule-123');
    });

    it('should handle rule not found', async () => {
      const notFoundResponse = {
        success: false,
        errors: [{ code: 1003, message: 'Rule not found' }],
        messages: [],
        result: null
      };
      cloudflareAPI.mockGetRule('non-existent-rule', notFoundResponse, 404);

      await expect(client.getGatewayRule('non-existent-rule'))
        .rejects.toThrow('Cloudflare API Error: Rule not found');
    });

    it('should validate rule ID parameter', async () => {
      await expect(client.getGatewayRule('')).rejects.toThrow();
    });
  });

  describe('createGatewayRule', () => {
    it('should create a new gateway rule with DNS traffic', async () => {
      const newRule = {
        name: 'New DNS Rule',
        description: 'A new DNS blocking rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "test.example.com"'],
        enabled: true
      };
      
      const response = { ...mockCloudflareResponse, result: { ...mockGatewayRule, ...newRule } };
      cloudflareAPI.mockCreateRule(response, 201);

      const createdRule = await client.createGatewayRule(newRule);

      expect(createdRule.name).toBe(newRule.name);
      expect(createdRule.action).toBe(newRule.action);
      expect(createdRule.enabled).toBe(true);
    });

    it('should create rule with HTTP traffic', async () => {
      const httpRule = {
        name: 'HTTP Block Rule',
        action: 'block' as const,
        filters: ['http.request.host == "malware.example.com"'],
        traffic: 'http'
      };
      
      const response = { ...mockCloudflareResponse, result: { ...mockGatewayRule, ...httpRule } };
      cloudflareAPI.mockCreateRule(response, 201);

      const createdRule = await client.createGatewayRule(httpRule);
      expect(createdRule.name).toBe(httpRule.name);
    });

    it('should handle invalid rule data', async () => {
      const invalidRule = {
        name: '',
        action: 'invalid' as any,
        filters: []
      };

      const errorResponse = {
        success: false,
        errors: [{ code: 1004, message: 'Invalid rule data' }],
        messages: [],
        result: null
      };
      cloudflareAPI.mockCreateRule(errorResponse, 400);

      await expect(client.createGatewayRule(invalidRule))
        .rejects.toThrow('Cloudflare API Error: Invalid rule data');
    });

    it('should assign precedence automatically when not provided', async () => {
      // Mock existing rules for precedence calculation
      cloudflareAPI.mockListRules(mockCloudflareResponse);
      
      const newRule = {
        name: 'Auto Precedence Rule',
        action: 'allow' as const,
        filters: ['dns.fqdn == "auto.example.com"']
      };
      
      const response = { 
        ...mockCloudflareResponse, 
        result: { ...mockGatewayRule, ...newRule, precedence: 4000 }
      };
      cloudflareAPI.mockCreateRule(response, 201);

      const createdRule = await client.createGatewayRule(newRule);
      expect(createdRule.precedence).toBeDefined();
    });

    it('should handle empty filters gracefully', async () => {
      const ruleWithEmptyFilters = {
        name: 'Empty Filters Rule',
        action: 'allow' as const,
        filters: []
      };
      
      const response = { 
        ...mockCloudflareResponse, 
        result: { ...mockGatewayRule, ...ruleWithEmptyFilters, traffic: 'true' }
      };
      cloudflareAPI.mockCreateRule(response, 201);

      const createdRule = await client.createGatewayRule(ruleWithEmptyFilters);
      expect(createdRule.name).toBe(ruleWithEmptyFilters.name);
    });
  });

  describe('updateGatewayRule', () => {
    it('should update an existing rule', async () => {
      const updateData = {
        id: 'test-rule-123',
        name: 'Updated Rule Name',
        description: 'Updated description'
      };

      const updatedRule = { ...mockGatewayRule, ...updateData };
      const response = { ...mockCloudflareResponse, result: updatedRule };
      
      cloudflareAPI.mockUpdateRule('test-rule-123', response);

      const result = await client.updateGatewayRule(updateData);

      expect(result.name).toBe('Updated Rule Name');
      expect(result.description).toBe('Updated description');
      expect(result.id).toBe('test-rule-123');
    });

    it('should update rule action', async () => {
      const updateData = {
        id: 'test-rule-123',
        action: 'allow' as const
      };

      const updatedRule = { ...mockGatewayRule, action: 'allow' as const };
      const response = { ...mockCloudflareResponse, result: updatedRule };
      
      cloudflareAPI.mockUpdateRule('test-rule-123', response);

      const result = await client.updateGatewayRule(updateData);
      expect(result.action).toBe('allow');
    });

    it('should handle update errors', async () => {
      const updateData = {
        id: 'invalid-rule-id',
        name: 'Updated Name'
      };

      const errorResponse = {
        success: false,
        errors: [{ code: 1005, message: 'Rule not found for update' }],
        messages: [],
        result: null
      };
      cloudflareAPI.mockUpdateRule('invalid-rule-id', errorResponse, 404);

      await expect(client.updateGatewayRule(updateData))
        .rejects.toThrow('Cloudflare API Error: Rule not found for update');
    });
  });

  describe('deleteGatewayRule', () => {
    it('should delete a rule successfully', async () => {
      cloudflareAPI.mockDeleteRule('test-rule-123');

      await expect(client.deleteGatewayRule('test-rule-123')).resolves.toBeUndefined();
    });

    it('should handle delete errors', async () => {
      cloudflareAPI.mockDeleteRule('test-rule-123', 404);

      await expect(client.deleteGatewayRule('test-rule-123')).rejects.toThrow();
    });

    it('should handle non-existent rule deletion', async () => {
      const errorResponse = {
        success: false,
        errors: [{ code: 1006, message: 'Rule does not exist' }],
        messages: [],
        result: null
      };
      cloudflareAPI.scope
        .delete('/client/v4/accounts/test-account-id/gateway/rules/non-existent')
        .reply(404, errorResponse);

      await expect(client.deleteGatewayRule('non-existent')).rejects.toThrow();
    });
  });

  describe('updateRulePrecedence', () => {
    it('should update rule precedence successfully', async () => {
      // Mock getting the existing rule first
      const getResponse = { ...mockCloudflareResponse, result: mockGatewayRule };
      cloudflareAPI.mockGetRule('test-rule-123', getResponse);

      // Mock updating the rule
      const updatedRule = { ...mockGatewayRule, precedence: 500 };
      const updateResponse = { ...mockCloudflareResponse, result: updatedRule };
      cloudflareAPI.mockUpdateRule('test-rule-123', updateResponse);

      const result = await client.updateRulePrecedence('test-rule-123', 500);

      expect(result.precedence).toBe(500);
      expect(result.id).toBe('test-rule-123');
    });

    it('should preserve all rule properties when updating precedence', async () => {
      const originalRule = {
        ...mockGatewayRule,
        name: 'Complex Rule',
        description: 'A complex rule with many properties',
        filters: ['dns', 'http'],
        enabled: true,
        identity: 'user-group-123',
        rule_settings: { block_page_enabled: true }
      };

      const getResponse = { ...mockCloudflareResponse, result: originalRule };
      cloudflareAPI.mockGetRule('complex-rule', getResponse);

      const updatedRule = { ...originalRule, precedence: 750 };
      const updateResponse = { ...mockCloudflareResponse, result: updatedRule };
      cloudflareAPI.mockUpdateRule('complex-rule', updateResponse);

      const result = await client.updateRulePrecedence('complex-rule', 750);

      expect(result.precedence).toBe(750);
      expect(result.name).toBe('Complex Rule');
      expect(result.description).toBe('A complex rule with many properties');
      expect(result.enabled).toBe(true);
      expect(result.identity).toBe('user-group-123');
    });

    it('should handle precedence update errors', async () => {
      const getResponse = { ...mockCloudflareResponse, result: mockGatewayRule };
      cloudflareAPI.mockGetRule('test-rule-123', getResponse);

      const errorResponse = {
        success: false,
        errors: [{ code: 1007, message: 'Invalid precedence value' }],
        messages: [],
        result: null
      };
      cloudflareAPI.mockUpdateRule('test-rule-123', errorResponse, 400);

      await expect(client.updateRulePrecedence('test-rule-123', -100))
        .rejects.toThrow('Cloudflare API Error: Invalid precedence value');
    });
  });

  describe('Gateway Lists', () => {
    it('should list gateway lists', async () => {
      const mockLists = [
        { id: 'list-1', name: 'Blocklist', type: 'DOMAIN', items: [] },
        { id: 'list-2', name: 'Allowlist', type: 'IP', items: [] }
      ];
      const response = { ...mockCloudflareResponse, result: mockLists };
      
      cloudflareAPI.scope
        .get('/client/v4/accounts/test-account-id/gateway/lists')
        .reply(200, response);

      const lists = await client.listGatewayLists();
      expect(lists).toHaveLength(2);
      expect(lists[0].name).toBe('Blocklist');
    });

    it('should get a specific gateway list', async () => {
      const mockList = { id: 'list-1', name: 'Test List', type: 'DOMAIN', items: [] };
      const response = { ...mockCloudflareResponse, result: mockList };
      
      cloudflareAPI.scope
        .get('/client/v4/accounts/test-account-id/gateway/lists/list-1')
        .reply(200, response);

      const list = await client.getGatewayList('list-1');
      expect(list.id).toBe('list-1');
      expect(list.name).toBe('Test List');
    });

    it('should create a new gateway list', async () => {
      const newList = {
        name: 'New Blocklist',
        description: 'Domains to block',
        type: 'DOMAIN' as const,
        items: [
          { value: 'malware.example.com', description: 'Known malware domain' }
        ]
      };
      
      const response = { 
        ...mockCloudflareResponse, 
        result: { id: 'new-list-123', ...newList }
      };
      
      cloudflareAPI.scope
        .post('/client/v4/accounts/test-account-id/gateway/lists')
        .reply(201, response);

      const createdList = await client.createGatewayList(newList);
      expect(createdList.name).toBe('New Blocklist');
      expect(createdList.id).toBe('new-list-123');
    });
  });

  describe('Gateway Categories and Locations', () => {
    it('should list gateway categories', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Malware', class: 'security' },
        { id: 'cat-2', name: 'Social Media', class: 'content' }
      ];
      const response = { ...mockCloudflareResponse, result: mockCategories };
      
      cloudflareAPI.scope
        .get('/client/v4/accounts/test-account-id/gateway/categories')
        .reply(200, response);

      const categories = await client.listGatewayCategories();
      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe('Malware');
    });

    it('should list gateway locations', async () => {
      const mockLocations = [
        { id: 'loc-1', name: 'Office Location', networks: [] },
        { id: 'loc-2', name: 'Remote Location', networks: [] }
      ];
      const response = { ...mockCloudflareResponse, result: mockLocations };
      
      cloudflareAPI.scope
        .get('/client/v4/accounts/test-account-id/gateway/locations')
        .reply(200, response);

      const locations = await client.listGatewayLocations();
      expect(locations).toHaveLength(2);
      expect(locations[0].name).toBe('Office Location');
    });
  });

  describe('error handling', () => {
    it('should properly format Cloudflare API errors', async () => {
      const multiErrorResponse = {
        success: false,
        errors: [
          { code: 1001, message: 'Authentication failed' },
          { code: 1002, message: 'Rate limited' }
        ],
        messages: [],
        result: null
      };
      
      cloudflareAPI.mockListRules(multiErrorResponse, 400);

      await expect(client.listGatewayRules())
        .rejects.toThrow('Cloudflare API Error: Authentication failed');
    });

    it('should handle non-Cloudflare errors', async () => {
      const genericError = new Error('Generic error');
      cloudflareAPI.scope.get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(() => { throw genericError; });

      await expect(client.listGatewayRules()).rejects.toThrow('Generic error');
    });

    it('should handle malformed responses', async () => {
      cloudflareAPI.scope.get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, 'invalid json');

      await expect(client.listGatewayRules()).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      cloudflareAPI.scope.get('/client/v4/accounts/test-account-id/gateway/rules')
        .delay(15000) // Longer than jest timeout
        .reply(200, mockCloudflareResponse);

      await expect(client.listGatewayRules()).rejects.toThrow();
    });

    it('should handle string errors', async () => {
      const stringError = 'String error message';
      const handleError = client['handleError'].bind(client);
      
      const result = handleError(stringError);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('String error message');
    });

    it('should handle null/undefined errors', async () => {
      const handleError = client['handleError'].bind(client);
      
      const nullResult = handleError(null);
      expect(nullResult).toBeInstanceOf(Error);
      expect(nullResult.message).toBe('null');
      
      const undefinedResult = handleError(undefined);
      expect(undefinedResult).toBeInstanceOf(Error);
      expect(undefinedResult.message).toBe('undefined');
    });
  });

  describe('private methods', () => {
    it('should calculate next precedence correctly for empty ruleset', async () => {
      const emptyResponse = { ...mockCloudflareResponse, result: [] };
      cloudflareAPI.mockListRules(emptyResponse);

      const getNextPrecedence = client['getNextPrecedence'].bind(client);
      const precedence = await getNextPrecedence();
      
      expect(precedence).toBe(1000);
    });

    it('should calculate next precedence correctly for existing rules', async () => {
      const rulesWithHighPrecedence = mockGatewayRules.map((rule, index) => ({
        ...rule,
        precedence: 5000 + (index * 1000)
      }));
      const response = { ...mockCloudflareResponse, result: rulesWithHighPrecedence };
      cloudflareAPI.mockListRules(response);

      const getNextPrecedence = client['getNextPrecedence'].bind(client);
      const precedence = await getNextPrecedence();
      
      expect(precedence).toBe(8000); // 7000 (max) + 1000
    });
  });
});
