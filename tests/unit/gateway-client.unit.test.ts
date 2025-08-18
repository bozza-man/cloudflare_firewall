import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import { GatewayClient } from '../../src/api/gateway-client.js';
import { TestFactory } from '../utils/test-factory.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock config
jest.mock('../../src/utils/config.js', () => ({
  config: {
    cloudflare: {
      accountId: 'test-account-id',
      apiToken: 'test-api-token',
      baseUrl: 'https://api.cloudflare.com/client/v4'
    }
  }
}));

describe('GatewayClient', () => {
  let client: GatewayClient;
  let mockAxiosInstance: jest.Mocked<typeof axios>;

  beforeEach(() => {
    // Create mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    client = new GatewayClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct headers', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.cloudflare.com/client/v4',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-token'
        }
      });
    });
  });

  describe('listGatewayRules', () => {
    it('should fetch and return gateway rules', async () => {
      const mockRules = [
        TestFactory.createGatewayRule({ id: 'rule-1', name: 'Rule 1' }),
        TestFactory.createGatewayRule({ id: 'rule-2', name: 'Rule 2' })
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: { result: mockRules, success: true }
      });

      const rules = await client.listGatewayRules();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules'
      );
      expect(rules).toEqual(mockRules);
    });

    it('should handle API errors', async () => {
      const error = TestFactory.createCloudflareError('Failed to fetch rules');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.listGatewayRules()).rejects.toThrow('Failed to fetch rules');
    });
  });

  describe('getGatewayRule', () => {
    it('should fetch a specific rule by ID', async () => {
      const mockRule = TestFactory.createGatewayRule({ id: 'rule-1' });

      mockAxiosInstance.get.mockResolvedValue({
        data: { result: mockRule, success: true }
      });

      const rule = await client.getGatewayRule('rule-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules/rule-1'
      );
      expect(rule).toEqual(mockRule);
    });
  });

  describe('createGatewayRule', () => {
    it('should create a rule with valid filters', async () => {
      const newRule = {
        name: 'New Rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "malicious.com"'],
        traffic: 'dns',
        precedence: 1000
      };

      const createdRule = TestFactory.createGatewayRule(newRule);

      mockAxiosInstance.post.mockResolvedValue({
        data: { result: createdRule, success: true }
      });

      const result = await client.createGatewayRule(newRule);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules',
        expect.objectContaining({
          name: 'New Rule',
          action: 'block',
          precedence: 1000
        })
      );
      expect(result).toEqual(createdRule);
    });

    it('should filter out invalid app filters', async () => {
      const newRule = {
        name: 'New Rule',
        action: 'block' as const,
        filters: [
          'dns.fqdn == "example.com"',
          'app.type == "invalid"', // Should be filtered out
          'app.invalid == "test"'  // Should be filtered out
        ],
        traffic: 'dns'
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { result: TestFactory.createGatewayRule(), success: true }
      });

      await client.createGatewayRule(newRule);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules',
        expect.objectContaining({
          traffic: 'dns.fqdn == "example.com"'
        })
      );
    });

    it('should handle rules with no valid filters', async () => {
      const newRule = {
        name: 'New Rule',
        action: 'block' as const,
        filters: ['app.invalid == "test"'], // All invalid
        traffic: 'dns'
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { result: TestFactory.createGatewayRule(), success: true }
      });

      await client.createGatewayRule(newRule);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules',
        expect.objectContaining({
          traffic: 'true' // Fallback when no valid filters
        })
      );
    });
  });

  describe('updateGatewayRule', () => {
    it('should update an existing rule', async () => {
      const update = {
        id: 'rule-1',
        name: 'Updated Rule',
        action: 'allow' as const
      };

      const updatedRule = TestFactory.createGatewayRule(update);

      mockAxiosInstance.patch.mockResolvedValue({
        data: { result: updatedRule, success: true }
      });

      const result = await client.updateGatewayRule(update);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules/rule-1',
        expect.objectContaining({
          name: 'Updated Rule',
          action: 'allow'
        })
      );
      expect(result).toEqual(updatedRule);
    });
  });

  describe('deleteGatewayRule', () => {
    it('should delete a rule', async () => {
      mockAxiosInstance.delete.mockResolvedValue({
        data: { success: true }
      });

      await client.deleteGatewayRule('rule-1');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/rules/rule-1'
      );
    });
  });

  describe('listGatewayLists', () => {
    it('should fetch gateway lists', async () => {
      const mockLists = [
        TestFactory.createGatewayList({ id: 'list-1' }),
        TestFactory.createGatewayList({ id: 'list-2' })
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: { result: mockLists, success: true }
      });

      const lists = await client.listGatewayLists();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/lists'
      );
      expect(lists).toEqual(mockLists);
    });
  });

  describe('listGatewayCategories', () => {
    it('should fetch gateway categories', async () => {
      const mockCategories = [
        TestFactory.createGatewayCategory({ id: 1, name: 'Security' }),
        TestFactory.createGatewayCategory({ id: 2, name: 'Productivity' })
      ];

      mockAxiosInstance.get.mockResolvedValue({
        data: { result: mockCategories, success: true }
      });

      const categories = await client.listGatewayCategories();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/accounts/test-account-id/gateway/categories'
      );
      expect(categories).toEqual(mockCategories);
    });
  });

  describe('error handling', () => {
    it('should extract error message from Cloudflare API response', async () => {
      const error = {
        response: {
          data: {
            errors: [{ message: 'Invalid rule configuration' }]
          }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.listGatewayRules()).rejects.toThrow('Invalid rule configuration');
    });

    it('should handle non-Cloudflare errors', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(client.listGatewayRules()).rejects.toThrow('Network error');
    });
  });
});