import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { GatewayRuleManager } from '../../src/rules/gateway-rule-manager.js';
import type { GatewayClient } from '../../src/api/gateway-client.js';
import type { GatewayAIAssistant } from '../../src/llm/gateway-ai-assistant.js';
import { mockGatewayRules, mockGatewayRule } from '../fixtures/gateway-rules.js';

// Mock all dependencies
jest.mock('../../src/api/gateway-client.js');
jest.mock('../../src/llm/gateway-ai-assistant.js');
jest.mock('../../src/rules/conflict-resolver.js');
jest.mock('../../src/rules/domain-conflict-detector.js');
jest.mock('../../src/utils/domain-verifier.js');
jest.mock('../../src/utils/config', () => ({
  config: {
    cloudflare: {
      apiToken: 'test-token',
      accountId: 'test-account',
      baseUrl: 'https://api.cloudflare.com/client/v4'
    },
    anthropic: {
      apiKey: 'test-key'
    }
  }
}));

describe('GatewayRuleManager', () => {
  let manager: GatewayRuleManager;
  let mockGatewayClient: jest.Mocked<GatewayClient>;
  let mockAIAssistant: jest.Mocked<GatewayAIAssistant>;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Import the class after mocks are set up
    const { GatewayRuleManager: ManagerClass } = await import('../../src/rules/gateway-rule-manager');
    manager = new ManagerClass();
    
    // Get references to mocked instances
    const { GatewayClient } = await import('../../src/api/gateway-client');
    const { GatewayAIAssistant } = await import('../../src/llm/gateway-ai-assistant');
    
    mockGatewayClient = jest.mocked(GatewayClient).mock.instances[0] as jest.Mocked<GatewayClient>;
    mockAIAssistant = jest.mocked(GatewayAIAssistant).mock.instances[0] as jest.Mocked<GatewayAIAssistant>;
  });

  describe('listRules', () => {
    it('should fetch and sort rules by precedence', async () => {
      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue(mockGatewayRules);
      
      const rules = await manager.listRules();
      
      expect(rules).toHaveLength(3);
      expect(rules[0].precedence).toBeLessThanOrEqual(rules[1].precedence);
      expect(mockGatewayClient.listGatewayRules).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      mockGatewayClient.listGatewayRules = jest.fn().mockRejectedValue(new Error('API Error'));
      
      await expect(manager.listRules()).rejects.toThrow('API Error');
    });

    it('should handle empty ruleset', async () => {
      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue([]);
      
      const rules = await manager.listRules();
      
      expect(rules).toEqual([]);
    });
  });

  describe('createRule', () => {
    it('should create a rule with conflict detection', async () => {
      const newRule = {
        name: 'Test Rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "test.com"'],
        traffic: 'dns'
      };

      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue([]);
      mockAIAssistant.analyzeRuleConflictsWithResolutions = jest.fn().mockResolvedValue({
        conflicts: [],
        resolutions: []
      });
      mockAIAssistant.suggestRulePrecedence = jest.fn().mockResolvedValue({
        precedence: 1000,
        reasoning: 'Standard precedence for DNS block rule'
      });
      mockGatewayClient.createGatewayRule = jest.fn().mockResolvedValue({
        ...mockGatewayRule,
        ...newRule,
        precedence: 1000
      });

      const rule = await manager.createRule(newRule);

      expect(rule.name).toBe(newRule.name);
      expect(rule.action).toBe(newRule.action);
      expect(mockAIAssistant.analyzeRuleConflictsWithResolutions).toHaveBeenCalled();
      expect(mockGatewayClient.createGatewayRule).toHaveBeenCalled();
    });

    it('should handle conflicts and suggest resolutions', async () => {
      const newRule = {
        name: 'Conflicting Rule',
        action: 'allow' as const,
        filters: ['dns.fqdn == "blocked.com"'],
        traffic: 'dns'
      };

      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue(mockGatewayRules);
      mockAIAssistant.analyzeRuleConflictsWithResolutions = jest.fn().mockResolvedValue({
        conflicts: [{
          conflictingRule: mockGatewayRules[0],
          reason: 'Conflicting actions for same domain',
          severity: 'high',
          suggestion: 'Consider modifying existing rule'
        }],
        resolutions: [{
          type: 'modify_existing',
          description: 'Remove domain from existing block rule',
          details: {
            ruleId: mockGatewayRules[0].id,
            filtersToRemove: ['blocked.com']
          },
          recommendation: 'recommended'
        }]
      });

      // Mock the conflict resolver to skip the conflict
      const { ConflictResolver } = await import('../../src/rules/conflict-resolver');
      const mockResolver = jest.mocked(ConflictResolver).mock.instances[0];
      (mockResolver as any).resolveConflicts = jest.fn().mockResolvedValue({
        action: 'skip'
      });

      await expect(manager.createRule(newRule)).rejects.toThrow('Rule creation cancelled');
    });

    it('should adjust precedence to avoid conflicts', async () => {
      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue([
        { ...mockGatewayRule, precedence: 1000 },
        { ...mockGatewayRule, precedence: 1001 }
      ]);
      
      mockAIAssistant.analyzeRuleConflictsWithResolutions = jest.fn().mockResolvedValue({
        conflicts: [],
        resolutions: []
      });
      
      mockAIAssistant.suggestRulePrecedence = jest.fn().mockResolvedValue({
        precedence: 1000.5, // Non-integer that will be adjusted
        reasoning: 'Place between existing rules'
      });
      
      mockGatewayClient.createGatewayRule = jest.fn().mockImplementation((rule) => 
        Promise.resolve({ ...mockGatewayRule, ...rule })
      );

      const newRule = {
        name: 'Test Rule',
        action: 'block' as const,
        filters: ['dns.fqdn == "test.com"']
      };

      await manager.createRule(newRule);

      // Should adjust to next available integer (1002)
      expect(mockGatewayClient.createGatewayRule).toHaveBeenCalledWith(
        expect.objectContaining({
          precedence: 1002
        })
      );
    });
  });

  describe('createRuleFromDescription', () => {
    it('should generate rule from natural language', async () => {
      const description = 'block all social media sites';

      mockAIAssistant.generateRuleFilters = jest.fn().mockResolvedValue({
        filters: [
          'dns.content_category in {23}' // Social media category
        ],
        explanation: 'Block social media content category',
        traffic: 'dns'
      });

      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue([]);
      mockAIAssistant.analyzeRuleConflictsWithResolutions = jest.fn().mockResolvedValue({
        conflicts: [],
        resolutions: []
      });
      mockAIAssistant.suggestRulePrecedence = jest.fn().mockResolvedValue({
        precedence: 1300,
        reasoning: 'General content blocking rule'
      });
      mockGatewayClient.createGatewayRule = jest.fn().mockResolvedValue({
        ...mockGatewayRule,
        name: 'block all social media sites',
        filters: ['dns'],
        traffic: 'dns.content_category in {23}'
      });

      // Mock process.stdin.isTTY to false for non-interactive mode
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;

      const rule = await manager.createRuleFromDescription(description);

      expect(rule).toBeDefined();
      expect(mockAIAssistant.generateRuleFilters).toHaveBeenCalledWith(description);
      expect(mockGatewayClient.createGatewayRule).toHaveBeenCalled();

      // Restore original value
      process.stdin.isTTY = originalIsTTY;
    });

    it('should handle AI generation failure', async () => {
      mockAIAssistant.generateRuleFilters = jest.fn().mockResolvedValue({
        filters: [],
        explanation: 'Unable to generate filters',
        traffic: 'dns'
      });

      await expect(manager.createRuleFromDescription('invalid description'))
        .rejects.toThrow('Failed to generate filters');
    });
  });

  describe('updateRule', () => {
    it('should update rule with validation', async () => {
      const update = {
        id: 'test-rule-123',
        name: 'Updated Rule Name',
        filters: ['dns.fqdn == "updated.com"']
      };

      mockAIAssistant.validateAndOptimizeFilters = jest.fn().mockResolvedValue({
        valid: true,
        optimized: update.filters,
        issues: [],
        suggestions: []
      });

      mockGatewayClient.listGatewayRules = jest.fn().mockResolvedValue(mockGatewayRules);
      mockAIAssistant.analyzeRuleConflictsWithResolutions = jest.fn().mockResolvedValue({
        conflicts: [],
        resolutions: []
      });
      mockGatewayClient.updateGatewayRule = jest.fn().mockResolvedValue({
        ...mockGatewayRule,
        ...update
      });

      const rule = await manager.updateRule(update);

      expect(rule.name).toBe(update.name);
      expect(mockAIAssistant.validateAndOptimizeFilters).toHaveBeenCalledWith(update.filters);
      expect(mockGatewayClient.updateGatewayRule).toHaveBeenCalledWith(update);
    });

    it('should reject invalid filters', async () => {
      const update = {
        id: 'test-rule-123',
        filters: ['invalid filter syntax']
      };

      mockAIAssistant.validateAndOptimizeFilters = jest.fn().mockResolvedValue({
        valid: false,
        optimized: [],
        issues: ['Invalid filter syntax'],
        suggestions: ['Use proper Cloudflare filter format']
      });

      await expect(manager.updateRule(update)).rejects.toThrow('Invalid rule filters');
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', async () => {
      mockGatewayClient.deleteGatewayRule = jest.fn().mockResolvedValue(undefined);

      await manager.deleteRule('test-rule-123');

      expect(mockGatewayClient.deleteGatewayRule).toHaveBeenCalledWith('test-rule-123');
    });

    it('should handle deletion errors', async () => {
      mockGatewayClient.deleteGatewayRule = jest.fn().mockRejectedValue(
        new Error('Rule not found')
      );

      await expect(manager.deleteRule('non-existent')).rejects.toThrow('Rule not found');
    });
  });

  describe('explainRule', () => {
    it('should provide AI explanation of rule', async () => {
      const explanation = 'This rule blocks access to malware domains for security.';
      
      mockGatewayClient.getGatewayRule = jest.fn().mockResolvedValue(mockGatewayRule);
      mockAIAssistant.explainRule = jest.fn().mockResolvedValue(explanation);

      const result = await manager.explainRule('test-rule-123');

      expect(result).toBe(explanation);
      expect(mockGatewayClient.getGatewayRule).toHaveBeenCalledWith('test-rule-123');
      expect(mockAIAssistant.explainRule).toHaveBeenCalledWith(mockGatewayRule);
    });
  });

  describe('listLists', () => {
    it('should fetch gateway lists', async () => {
      const mockLists = [
        { id: 'list-1', name: 'Block List', type: 'DOMAIN' },
        { id: 'list-2', name: 'Allow List', type: 'EMAIL' }
      ];

      mockGatewayClient.listGatewayLists = jest.fn().mockResolvedValue(mockLists);

      const lists = await manager.listLists();

      expect(lists).toEqual(mockLists);
      expect(mockGatewayClient.listGatewayLists).toHaveBeenCalled();
    });
  });

  describe('listLocations', () => {
    it('should fetch gateway locations', async () => {
      const mockLocations = [
        { id: 'loc-1', name: 'Office 1' },
        { id: 'loc-2', name: 'Office 2' }
      ];

      mockGatewayClient.listGatewayLocations = jest.fn().mockResolvedValue(mockLocations);

      const locations = await manager.listLocations();

      expect(locations).toEqual(mockLocations);
      expect(mockGatewayClient.listGatewayLocations).toHaveBeenCalled();
    });
  });

  describe('listCategories', () => {
    it('should fetch gateway categories', async () => {
      const mockCategories = [
        { id: 1, name: 'Malware', class: 'security' },
        { id: 2, name: 'Social Media', class: 'content' }
      ];

      mockGatewayClient.listGatewayCategories = jest.fn().mockResolvedValue(mockCategories);

      const categories = await manager.listCategories();

      expect(categories).toEqual(mockCategories);
      expect(mockGatewayClient.listGatewayCategories).toHaveBeenCalled();
    });
  });
});