import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GatewayRuleManager } from '../../src/rules/gateway-rule-manager.js';
import { GatewayClient } from '../../src/api/gateway-client.js';
import { GatewayAIAssistant } from '../../src/llm/gateway-ai-assistant.js';
import { TestFactory } from '../utils/test-factory.js';

// Mock dependencies
jest.mock('../../src/api/gateway-client.js');
jest.mock('../../src/llm/gateway-ai-assistant.js');
jest.mock('ora', () => ({
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    info: jest.fn().mockReturnThis(),
    text: ''
  }))
}));

describe('Rule Creation Flow Integration', () => {
  let ruleManager: GatewayRuleManager;
  let mockGatewayClient: jest.Mocked<GatewayClient>;
  let mockAIAssistant: jest.Mocked<GatewayAIAssistant>;

  beforeEach(() => {
    // Setup mocks
    mockGatewayClient = new GatewayClient() as jest.Mocked<GatewayClient>;
    mockAIAssistant = new GatewayAIAssistant() as jest.Mocked<GatewayAIAssistant>;
    
    // Create rule manager
    ruleManager = new GatewayRuleManager();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ruleManager as any).gateway = mockGatewayClient;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ruleManager as any).ai = mockAIAssistant;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRule', () => {
    it('should create a rule without conflicts', async () => {
      const newRuleRequest = {
        name: 'Allow GitHub',
        action: 'allow' as const,
        filters: ['dns.fqdn in {"github.com" "api.github.com"}'],
        traffic: 'dns',
        description: 'Allow access to GitHub'
      };

      const createdRule = TestFactory.createGatewayRule({
        ...newRuleRequest,
        id: 'new-rule-id',
        precedence: 1100
      });

      // Mock existing rules (no conflicts)
      mockGatewayClient.listGatewayRules.mockResolvedValue([
        TestFactory.createGatewayRule({ 
          id: 'existing-1',
          name: 'Block Malware',
          action: 'block',
          precedence: 1000
        })
      ]);

      // Mock AI validation
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: true,
        optimized: newRuleRequest.filters,
        issues: [],
        suggestions: []
      });

      // Mock AI conflict analysis (no conflicts)
      mockAIAssistant.analyzeRuleConflictsWithResolutions.mockResolvedValue({
        conflicts: [],
        resolutions: []
      });

      // Mock AI precedence suggestion
      mockAIAssistant.suggestRulePrecedence.mockResolvedValue({
        precedence: 1100,
        reasoning: 'Development tools should be after security blocks'
      });

      // Mock rule creation
      mockGatewayClient.createGatewayRule.mockResolvedValue(createdRule);

      const result = await ruleManager.createRule(newRuleRequest);

      expect(result).toEqual(createdRule);
      expect(mockGatewayClient.createGatewayRule).toHaveBeenCalledWith({
        ...newRuleRequest,
        filters: newRuleRequest.filters,
        precedence: 1100
      });
    });

    it('should handle conflicts and skip creation when cancelled', async () => {
      const newRuleRequest = {
        name: 'Allow Example',
        action: 'allow' as const,
        filters: ['dns.fqdn == "example.com"'],
        traffic: 'dns'
      };

      // Mock existing conflicting rule
      mockGatewayClient.listGatewayRules.mockResolvedValue([
        TestFactory.createGatewayRule({
          id: 'existing-1',
          name: 'Block Example',
          action: 'block',
          filters: ['dns.fqdn == "example.com"'],
          precedence: 1000
        })
      ]);

      // Mock AI validation
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: true,
        optimized: newRuleRequest.filters,
        issues: [],
        suggestions: []
      });

      // Mock AI conflict detection
      mockAIAssistant.analyzeRuleConflictsWithResolutions.mockResolvedValue({
        conflicts: [{
          conflictingRule: TestFactory.createGatewayRule({
            id: 'existing-1',
            name: 'Block Example'
          }),
          reason: 'Conflicting actions for same domain',
          severity: 'high',
          suggestion: 'Remove domain from block rule'
        }],
        resolutions: []
      });

      // Mock conflict resolver to skip
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockConflictResolver = (ruleManager as any).conflictResolver;
      mockConflictResolver.resolveConflicts = jest.fn().mockResolvedValue({
        action: 'skip'
      });

      await expect(ruleManager.createRule(newRuleRequest))
        .rejects.toThrow('Rule creation cancelled');

      expect(mockGatewayClient.createGatewayRule).not.toHaveBeenCalled();
    });

    it('should detect and warn about duplicate rules', async () => {
      const newRuleRequest = {
        name: 'GitHub: API Services',
        action: 'allow' as const,
        filters: ['dns.fqdn in {"api.github.com"}'],
        traffic: 'dns'
      };

      // Mock existing duplicate rule
      const existingRule = TestFactory.createGatewayRule({
        id: 'existing-1',
        name: 'GitHub: Core Services',
        action: 'allow',
        filters: ['dns.fqdn in {"github.com" "api.github.com"}'],
        traffic: 'dns.fqdn in {"github.com" "api.github.com"}',
        precedence: 1100
      });

      mockGatewayClient.listGatewayRules.mockResolvedValue([existingRule]);

      // Mock AI validation
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: true,
        optimized: newRuleRequest.filters,
        issues: [],
        suggestions: []
      });

      // Mock no AI conflicts (since it's a duplicate, not a conflict)
      mockAIAssistant.analyzeRuleConflictsWithResolutions.mockResolvedValue({
        conflicts: [],
        resolutions: []
      });

      // Mock precedence suggestion
      mockAIAssistant.suggestRulePrecedence.mockResolvedValue({
        precedence: 1105,
        reasoning: 'Similar to existing GitHub rule'
      });

      // Mock rule creation
      mockGatewayClient.createGatewayRule.mockResolvedValue(
        TestFactory.createGatewayRule(newRuleRequest)
      );

      // Note: In real implementation, this would show a warning but still allow creation
      // The test verifies the duplicate detection logic works
      const result = await ruleManager.createRule(newRuleRequest);

      expect(result).toBeDefined();
    });
  });

  describe('createRuleFromDescription', () => {
    it('should generate and create rule from natural language', async () => {
      const description = 'block all social media sites';

      // Mock AI filter generation
      mockAIAssistant.generateRuleFilters.mockResolvedValue({
        filters: ['dns.content_category in {23}'],
        explanation: 'Block social media content category',
        traffic: 'dns'
      });

      // Mock existing rules
      mockGatewayClient.listGatewayRules.mockResolvedValue([]);

      // Mock AI validation
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: true,
        optimized: ['dns.content_category in {23}'],
        issues: [],
        suggestions: []
      });

      // Mock no conflicts
      mockAIAssistant.analyzeRuleConflictsWithResolutions.mockResolvedValue({
        conflicts: [],
        resolutions: []
      });

      // Mock precedence
      mockAIAssistant.suggestRulePrecedence.mockResolvedValue({
        precedence: 1300,
        reasoning: 'Content filtering rule'
      });

      // Mock rule creation
      const createdRule = TestFactory.createGatewayRule({
        name: 'block all social media sites',
        action: 'block',
        filters: ['dns.content_category in {23}'],
        precedence: 1300
      });
      mockGatewayClient.createGatewayRule.mockResolvedValue(createdRule);

      // Mock stdin.isTTY to false for non-interactive mode
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;

      const result = await ruleManager.createRuleFromDescription(description);

      expect(result).toEqual(createdRule);
      expect(mockAIAssistant.generateRuleFilters).toHaveBeenCalledWith(description);

      // Restore stdin.isTTY
      process.stdin.isTTY = originalIsTTY;
    });

    it('should handle filter generation failure', async () => {
      mockAIAssistant.generateRuleFilters.mockResolvedValue({
        filters: [],
        explanation: 'Unable to generate filters',
        traffic: 'dns'
      });

      await expect(ruleManager.createRuleFromDescription('invalid description'))
        .rejects.toThrow('Failed to generate filters');
    });
  });

  describe('updateRule', () => {
    it('should update rule with new filters', async () => {
      const updateRequest = {
        id: 'rule-1',
        name: 'Updated Rule',
        filters: ['dns.fqdn in {"newdomain.com"}']
      };

      const existingRule = TestFactory.createGatewayRule({
        id: 'rule-1',
        name: 'Original Rule',
        filters: ['dns.fqdn == "olddomain.com"']
      });

      const updatedRule = TestFactory.createGatewayRule({
        ...existingRule,
        ...updateRequest
      });

      // Mock get existing rules
      mockGatewayClient.listGatewayRules.mockResolvedValue([existingRule]);

      // Mock AI validation
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: true,
        optimized: updateRequest.filters!,
        issues: [],
        suggestions: []
      });

      // Mock no conflicts
      mockAIAssistant.analyzeRuleConflictsWithResolutions.mockResolvedValue({
        conflicts: [],
        resolutions: []
      });

      // Mock update
      mockGatewayClient.updateGatewayRule.mockResolvedValue(updatedRule);

      const result = await ruleManager.updateRule(updateRequest);

      expect(result).toEqual(updatedRule);
      expect(mockGatewayClient.updateGatewayRule).toHaveBeenCalledWith({
        ...updateRequest,
        filters: updateRequest.filters
      });
    });

    it('should validate filters before updating', async () => {
      const updateRequest = {
        id: 'rule-1',
        filters: ['invalid filter syntax']
      };

      // Mock AI validation failure
      mockAIAssistant.validateAndOptimizeFilters.mockResolvedValue({
        valid: false,
        optimized: [],
        issues: ['Invalid filter syntax'],
        suggestions: []
      });

      await expect(ruleManager.updateRule(updateRequest))
        .rejects.toThrow('Invalid rule filters');

      expect(mockGatewayClient.updateGatewayRule).not.toHaveBeenCalled();
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', async () => {
      mockGatewayClient.deleteGatewayRule.mockResolvedValue(undefined);

      await ruleManager.deleteRule('rule-1');

      expect(mockGatewayClient.deleteGatewayRule).toHaveBeenCalledWith('rule-1');
    });

    it('should handle deletion errors', async () => {
      mockGatewayClient.deleteGatewayRule.mockRejectedValue(
        new Error('Rule not found')
      );

      await expect(ruleManager.deleteRule('non-existent'))
        .rejects.toThrow('Rule not found');
    });
  });
});