import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GatewayAIAssistant } from '../../src/llm/gateway-ai-assistant.js';
import { TestFactory } from '../utils/test-factory.js';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');
const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

// Mock config
jest.mock('../../src/utils/config.js', () => ({
  config: {
    anthropic: {
      apiKey: 'test-api-key'
    }
  }
}));

describe('GatewayAIAssistant', () => {
  let assistant: GatewayAIAssistant;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAnthropicClient: any;

  beforeEach(() => {
    // Create mock Anthropic client
    mockAnthropicClient = {
      messages: {
        create: jest.fn()
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MockedAnthropic.mockImplementation(() => mockAnthropicClient as any);
    assistant = new GatewayAIAssistant();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRuleFilters', () => {
    it('should generate filters from natural language description', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            filters: ['dns.fqdn in {"facebook.com" "instagram.com"}'],
            explanation: 'Block social media sites',
            traffic: 'dns'
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.generateRuleFilters('block facebook and instagram');

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: expect.stringContaining('block facebook and instagram')
        }]
      });

      expect(result).toEqual({
        filters: ['dns.fqdn in {"facebook.com" "instagram.com"}'],
        explanation: 'Block social media sites',
        traffic: 'dns'
      });
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Invalid JSON response'
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.generateRuleFilters('invalid request');

      expect(result).toEqual({
        filters: [],
        explanation: 'Unable to parse response - no JSON found',
        traffic: 'http'
      });
    });

    it('should extract JSON from markdown code blocks', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '```json\n{"filters": ["dns.fqdn == \\"example.com\\""], "explanation": "Test", "traffic": "dns"}\n```'
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.generateRuleFilters('block example.com');

      expect(result).toEqual({
        filters: ['dns.fqdn == "example.com"'],
        explanation: 'Test',
        traffic: 'dns'
      });
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropicClient.messages.create.mockRejectedValue(new Error('API error'));

      const result = await assistant.generateRuleFilters('test');

      expect(result).toEqual({
        filters: [],
        explanation: 'Error occurred during generation',
        traffic: 'http'
      });
    });
  });

  describe('analyzeRuleConflicts', () => {
    it('should detect conflicts between rules', async () => {
      const newRule = {
        filters: ['dns.fqdn == "example.com"'],
        action: 'allow',
        name: 'Allow Example'
      };

      const existingRules = [
        TestFactory.createGatewayRule({
          id: 'rule-1',
          name: 'Block Example',
          action: 'block',
          filters: ['dns.fqdn == "example.com"']
        })
      ];

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify([{
            conflictingRuleId: 'rule-1',
            reason: 'Conflicting actions for same domain',
            severity: 'high',
            suggestion: 'Remove one rule or adjust filters'
          }])
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const conflicts = await assistant.analyzeRuleConflicts(newRule, existingRules);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        conflictingRule: existingRules[0],
        reason: 'Conflicting actions for same domain',
        severity: 'high',
        suggestion: 'Remove one rule or adjust filters'
      });
    });

    it('should return empty array when no conflicts', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: '[]'
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const conflicts = await assistant.analyzeRuleConflicts(
        { filters: [], action: 'allow', name: 'Test' },
        []
      );

      expect(conflicts).toEqual([]);
    });
  });

  describe('suggestRulePrecedence', () => {
    it('should suggest appropriate precedence for new rule', async () => {
      const newRule = {
        filters: ['dns.fqdn == "github.com"'],
        action: 'allow',
        name: 'Allow GitHub',
        traffic: 'dns'
      };

      const existingRules = [
        TestFactory.createGatewayRule({ precedence: 1000 }),
        TestFactory.createGatewayRule({ precedence: 1100 })
      ];

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            precedence: 1050,
            reasoning: 'Development tool, should be between security blocks and general services'
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.suggestRulePrecedence(newRule, existingRules);

      expect(result).toEqual({
        precedence: 1050,
        reasoning: 'Development tool, should be between security blocks and general services'
      });
    });

    it('should provide fallback precedence on error', async () => {
      mockAnthropicClient.messages.create.mockRejectedValue(new Error('API error'));

      const result = await assistant.suggestRulePrecedence(
        { filters: [], action: 'allow', name: 'Test' },
        [TestFactory.createGatewayRule({ precedence: 1000 })]
      );

      expect(result.precedence).toBe(2000); // Max precedence + 1000
      expect(result.reasoning).toBe('Error occurred during analysis');
    });
  });

  describe('validateAndOptimizeFilters', () => {
    it('should validate correct filters', async () => {
      const filters = ['dns.fqdn == "example.com"'];

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: true,
            optimized: filters,
            issues: [],
            suggestions: []
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.validateAndOptimizeFilters(filters);

      expect(result).toEqual({
        valid: true,
        optimized: filters,
        issues: [],
        suggestions: []
      });
    });

    it('should detect and fix syntax errors', async () => {
      const filters = ['dns.fqdn in {"example.com", "test.com"}']; // Comma instead of space

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            optimized: ['dns.fqdn in {"example.com" "test.com"}'],
            issues: ['Use spaces, not commas between domains in "in" operator'],
            suggestions: []
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.validateAndOptimizeFilters(filters);

      expect(result.valid).toBe(false);
      expect(result.optimized).toEqual(['dns.fqdn in {"example.com" "test.com"}']);
      expect(result.issues).toContain('Use spaces, not commas between domains in "in" operator');
    });
  });

  describe('explainRule', () => {
    it('should provide clear explanation of rule', async () => {
      const rule = TestFactory.createGatewayRule({
        name: 'Block Social Media',
        filters: ['dns.content_category in {23}'],
        action: 'block'
      });

      const mockResponse = {
        content: [{
          type: 'text',
          text: 'This rule blocks access to social media websites by checking if the DNS query matches the social media content category (ID 23).'
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const explanation = await assistant.explainRule(rule);

      expect(explanation).toBe('This rule blocks access to social media websites by checking if the DNS query matches the social media content category (ID 23).');
    });
  });

  describe('categorizeService', () => {
    it('should categorize services appropriately', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            category: 'business_critical',
            priority: 'high',
            suggestedAction: 'allow',
            reasoning: 'GitHub is essential for development workflows'
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.categorizeService('GitHub', ['github.com', 'api.github.com']);

      expect(result).toEqual({
        category: 'business_critical',
        priority: 'high',
        suggestedAction: 'allow',
        reasoning: 'GitHub is essential for development workflows'
      });
    });
  });

  describe('analyzeAndOptimizeRuleset', () => {
    it('should analyze ruleset for issues and optimizations', async () => {
      const rules = [
        TestFactory.createGatewayRule({ id: 'rule-1', precedence: 1000 }),
        TestFactory.createGatewayRule({ id: 'rule-2', precedence: 1001 })
      ];

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Ruleset is well-organized with minor optimization opportunities',
            criticalIssues: [],
            recommendations: [{
              priority: 'low',
              action: 'Increase spacing between rules',
              reason: 'Rules are too close in precedence',
              affectedRules: ['rule-1', 'rule-2']
            }],
            optimizedRuleset: []
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const result = await assistant.analyzeAndOptimizeRuleset(rules);

      expect(result.summary).toBe('Ruleset is well-organized with minor optimization opportunities');
      expect(result.criticalIssues).toEqual([]);
      expect(result.recommendations).toHaveLength(1);
    });
  });
});