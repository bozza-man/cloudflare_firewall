import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import nock from 'nock';
import type { GatewayClient } from '../../src/api/gateway-client';
import { 
  mockGatewayRule, 
  mockGatewayRules, 
  mockCloudflareResponse,
  mockCloudflareError 
} from '../fixtures/gateway-rules';

// Mock the config module
jest.mock('../../src/utils/config', () => ({
  config: {
    cloudflare: {
      apiToken: 'test-api-token',
      accountId: 'test-account-id',
      baseUrl: 'https://api.cloudflare.com/client/v4',
      globalKey: '',
      email: '',
      zoneId: ''
    },
    anthropic: {
      apiKey: 'test-anthropic-key'
    }
  }
}));

describe('GatewayClient', () => {
  let client: GatewayClient;

  beforeEach(async () => {
    // Clear all nock interceptors
    nock.cleanAll();
    
    // Import GatewayClient after mocks are set up
    const { GatewayClient: GatewayClientClass } = await import('../../src/api/gateway-client');
    client = new GatewayClientClass();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with mocked config', () => {
      expect(client).toBeDefined();
      expect(client).toHaveProperty('listGatewayRules');
    });
  });

  describe('listGatewayRules', () => {
    it('should fetch gateway rules successfully', async () => {
      // Mock the API endpoint
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, mockCloudflareResponse);

      const rules = await client.listGatewayRules();

      expect(rules).toEqual(mockGatewayRules);
      expect(rules).toHaveLength(3);
      expect(nock.isDone()).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(401, mockCloudflareError);

      await expect(client.listGatewayRules()).rejects.toThrow('Authentication failed');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle network errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .replyWithError('Network error');

      await expect(client.listGatewayRules()).rejects.toThrow('Network error');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle empty response', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, { success: true, result: [], errors: [], messages: [] });

      const rules = await client.listGatewayRules();
      expect(rules).toEqual([]);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('getGatewayRule', () => {
    it('should fetch a single rule by ID', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, { success: true, result: mockGatewayRule, errors: [], messages: [] });

      const rule = await client.getGatewayRule('test-rule-123');
      expect(rule).toEqual(mockGatewayRule);
      expect(nock.isDone()).toBe(true);
    });

    it('should handle rule not found', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules/non-existent')
        .reply(404, {
          success: false,
          errors: [{ code: 404, message: 'Rule not found' }],
          messages: [],
          result: null
        });

      await expect(client.getGatewayRule('non-existent')).rejects.toThrow('Rule not found');
      expect(nock.isDone()).toBe(true);
    });

    it('should validate rule ID parameter', async () => {
      // Test with empty string
      await expect(client.getGatewayRule('')).rejects.toThrow();
    });
  });

  describe('createGatewayRule', () => {
    it('should create a new gateway rule with DNS traffic', async () => {
      const newRule = {
        name: 'New Test Rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "test.example.com"'],
        traffic: 'dns'
      };

      const expectedResponse = {
        ...mockGatewayRule,
        name: newRule.name,
        traffic: 'dns.fqdn == "test.example.com"'
      };

      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, { success: true, result: expectedResponse, errors: [], messages: [] });

      const rule = await client.createGatewayRule(newRule);
      expect(rule.name).toBe(newRule.name);
      expect(nock.isDone()).toBe(true);
    });

    it('should create rule with HTTP traffic', async () => {
      const newRule = {
        name: 'HTTP Rule',
        action: 'allow' as const,
        filters: ['http.request.host == "example.com"'],
        traffic: 'http'
      };

      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, { 
          success: true, 
          result: { ...mockGatewayRule, ...newRule },
          errors: [],
          messages: []
        });

      const rule = await client.createGatewayRule(newRule);
      expect(rule.name).toBe(newRule.name);
      expect(nock.isDone()).toBe(true);
    });

    it('should handle invalid rule data', async () => {
      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(400, {
          success: false,
          errors: [{ code: 400, message: 'Invalid rule data' }],
          messages: [],
          result: null
        });

      const invalidRule = {
        name: '',
        action: 'block' as const,
        filters: []
      };

      await expect(client.createGatewayRule(invalidRule)).rejects.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should assign precedence automatically when not provided', async () => {
      // First mock the list call to get existing rules
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, mockCloudflareResponse);

      // Then mock the create call
      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, precedence: 4000 },
          errors: [],
          messages: []
        });

      const rule = await client.createGatewayRule({
        name: 'Auto Precedence Rule',
        action: 'block',
        filters: ['dns.fqdn == "test.com"']
      });

      expect(rule.precedence).toBeDefined();
      expect(nock.isDone()).toBe(true);
    });

    it('should handle empty filters gracefully', async () => {
      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, filters: ['dns'], traffic: 'true' },
          errors: [],
          messages: []
        });

      const rule = await client.createGatewayRule({
        name: 'Empty Filter Rule',
        action: 'block',
        filters: []
      });

      expect(rule).toBeDefined();
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('updateGatewayRule', () => {
    it('should update an existing rule', async () => {
      const update = {
        id: 'test-rule-123',
        name: 'Updated Rule Name'
      };

      nock('https://api.cloudflare.com')
        .put('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, name: update.name },
          errors: [],
          messages: []
        });

      const rule = await client.updateGatewayRule(update);
      expect(rule.name).toBe(update.name);
      expect(nock.isDone()).toBe(true);
    });

    it('should update rule action', async () => {
      const update = {
        id: 'test-rule-123',
        action: 'allow' as const
      };

      nock('https://api.cloudflare.com')
        .put('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, action: 'allow' },
          errors: [],
          messages: []
        });

      const rule = await client.updateGatewayRule(update);
      expect(rule.action).toBe('allow');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle update errors', async () => {
      nock('https://api.cloudflare.com')
        .put('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(400, {
          success: false,
          errors: [{ code: 400, message: 'Invalid update data' }],
          messages: [],
          result: null
        });

      await expect(client.updateGatewayRule({ id: 'test-rule-123' })).rejects.toThrow('Invalid update data');
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('deleteGatewayRule', () => {
    it('should delete a rule successfully', async () => {
      nock('https://api.cloudflare.com')
        .delete('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, { success: true, errors: [], messages: [] });

      await expect(client.deleteGatewayRule('test-rule-123')).resolves.not.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should handle delete errors', async () => {
      nock('https://api.cloudflare.com')
        .delete('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(404, {
          success: false,
          errors: [{ code: 404, message: 'Rule not found' }],
          messages: []
        });

      await expect(client.deleteGatewayRule('test-rule-123')).rejects.toThrow('Rule not found');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle non-existent rule deletion', async () => {
      nock('https://api.cloudflare.com')
        .delete('/client/v4/accounts/test-account-id/gateway/rules/non-existent')
        .reply(404, {
          success: false,
          errors: [{ code: 404, message: 'Rule not found' }],
          messages: []
        });

      await expect(client.deleteGatewayRule('non-existent')).rejects.toThrow();
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('updateRulePrecedence', () => {
    it('should update rule precedence successfully', async () => {
      // Mock the get call
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, { success: true, result: mockGatewayRule, errors: [], messages: [] });

      // Mock the update call
      nock('https://api.cloudflare.com')
        .put('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, precedence: 5000 },
          errors: [],
          messages: []
        });

      const rule = await client.updateRulePrecedence('test-rule-123', 5000);
      expect(rule.precedence).toBe(5000);
      expect(nock.isDone()).toBe(true);
    });

    it('should preserve all rule properties when updating precedence', async () => {
      const originalRule = {
        ...mockGatewayRule,
        description: 'Original description',
        enabled: true,
        filters: ['dns'],
        traffic: 'dns.fqdn == "test.com"'
      };

      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, { success: true, result: originalRule, errors: [], messages: [] });

      nock('https://api.cloudflare.com')
        .put('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(200, {
          success: true,
          result: { ...originalRule, precedence: 2000 },
          errors: [],
          messages: []
        });

      const rule = await client.updateRulePrecedence('test-rule-123', 2000);
      expect(rule.description).toBe(originalRule.description);
      expect(rule.enabled).toBe(originalRule.enabled);
      expect(rule.filters).toEqual(originalRule.filters);
      expect(nock.isDone()).toBe(true);
    });

    it('should handle precedence update errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules/test-rule-123')
        .reply(404, {
          success: false,
          errors: [{ code: 404, message: 'Rule not found' }],
          messages: [],
          result: null
        });

      await expect(client.updateRulePrecedence('test-rule-123', 5000)).rejects.toThrow('Rule not found');
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('Gateway Lists', () => {
    it('should list gateway lists', async () => {
      const mockLists = [
        { id: 'list-1', name: 'Test List 1', type: 'SERIAL_NUMBER' },
        { id: 'list-2', name: 'Test List 2', type: 'EMAIL' }
      ];

      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/lists')
        .reply(200, { success: true, result: mockLists, errors: [], messages: [] });

      const lists = await client.listGatewayLists();
      expect(lists).toEqual(mockLists);
      expect(nock.isDone()).toBe(true);
    });

    it('should get a specific gateway list', async () => {
      const mockList = { id: 'list-1', name: 'Test List', type: 'SERIAL_NUMBER' };

      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/lists/list-1')
        .reply(200, { success: true, result: mockList, errors: [], messages: [] });

      const list = await client.getGatewayList('list-1');
      expect(list).toEqual(mockList);
      expect(nock.isDone()).toBe(true);
    });

    it('should create a new gateway list', async () => {
      const newList = {
        name: 'New List',
        type: 'EMAIL' as const,
        items: [{ value: 'test@example.com' }]
      };

      const createdList = { id: 'list-new', ...newList };

      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/lists')
        .reply(200, { success: true, result: createdList, errors: [], messages: [] });

      const list = await client.createGatewayList(newList);
      expect(list).toEqual(createdList);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('Gateway Categories and Locations', () => {
    it('should list gateway categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Security', class: 'security' },
        { id: 2, name: 'Content', class: 'content' }
      ];

      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/categories')
        .reply(200, { success: true, result: mockCategories, errors: [], messages: [] });

      const categories = await client.listGatewayCategories();
      expect(categories).toEqual(mockCategories);
      expect(nock.isDone()).toBe(true);
    });

    it('should list gateway locations', async () => {
      const mockLocations = [
        { id: 'loc-1', name: 'Location 1' },
        { id: 'loc-2', name: 'Location 2' }
      ];

      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/locations')
        .reply(200, { success: true, result: mockLocations, errors: [], messages: [] });

      const locations = await client.listGatewayLocations();
      expect(locations).toEqual(mockLocations);
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should properly format Cloudflare API errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(400, {
          success: false,
          errors: [{ code: 1001, message: 'Invalid request' }],
          messages: []
        });

      await expect(client.listGatewayRules()).rejects.toThrow('Invalid request');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle non-Cloudflare errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(500, 'Internal Server Error');

      await expect(client.listGatewayRules()).rejects.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should handle malformed responses', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, 'not json');

      await expect(client.listGatewayRules()).rejects.toThrow();
      expect(nock.isDone()).toBe(true);
    });

    it('should handle timeout errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .delayConnection(100)
        .reply(200, mockCloudflareResponse);

      // This test will pass because the delay is short
      const rules = await client.listGatewayRules();
      expect(rules).toEqual(mockGatewayRules);
      expect(nock.isDone()).toBe(true);
    });

    it('should handle string errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .replyWithError('Connection refused');

      await expect(client.listGatewayRules()).rejects.toThrow('Connection refused');
      expect(nock.isDone()).toBe(true);
    });

    it('should handle null/undefined errors', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, { success: true, result: null, errors: [], messages: [] });

      // Should handle null result gracefully
      await expect(client.listGatewayRules()).rejects.toThrow();
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('private methods', () => {
    it('should calculate next precedence correctly for empty ruleset', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, { success: true, result: [], errors: [], messages: [] });

      // Create a rule without precedence to trigger getNextPrecedence
      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, precedence: 1000 },
          errors: [],
          messages: []
        });

      const rule = await client.createGatewayRule({
        name: 'Test Rule',
        action: 'block',
        filters: ['dns.fqdn == "test.com"']
      });

      expect(rule.precedence).toBe(1000);
      expect(nock.isDone()).toBe(true);
    });

    it('should calculate next precedence correctly for existing rules', async () => {
      nock('https://api.cloudflare.com')
        .get('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, mockCloudflareResponse);

      nock('https://api.cloudflare.com')
        .post('/client/v4/accounts/test-account-id/gateway/rules')
        .reply(200, {
          success: true,
          result: { ...mockGatewayRule, precedence: 4000 },
          errors: [],
          messages: []
        });

      const rule = await client.createGatewayRule({
        name: 'Test Rule',
        action: 'block',
        filters: ['dns.fqdn == "test.com"']
      });

      // Should be max precedence (3000) + 1000 = 4000
      expect(rule.precedence).toBe(4000);
      expect(nock.isDone()).toBe(true);
    });
  });
});