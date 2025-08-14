import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { GatewayAIAssistant } from '../../src/llm/gateway-ai-assistant.js';
import type Anthropic from '@anthropic-ai/sdk';
import { mockGatewayRules, mockGatewayRule } from '../fixtures/gateway-rules.js';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }))
}));

// Mock config
jest.mock('../../src/utils/config', () => ({
  config: {
    anthropic: {
      apiKey: 'test-api-key'
    }
  }
}));

describe('GatewayAIAssistant', () => {
  let assistant: GatewayAIAssistant;
  let mockAnthropicClient: { messages: { create: jest.Mock } };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Import after mocks are set up
    const { GatewayAIAssistant: AssistantClass } = await import('../../src/llm/gateway-ai-assistant');
    assistant = new AssistantClass();
    
    // Get mock client
    const AnthropicMock = (await import('@anthropic-ai/sdk')).default as jest.MockedClass<typeof Anthropic>;
    mockAnthropicClient = AnthropicMock.mock.results[0].value as any;
  });

  describe('analyzeRuleConflictsWithResolutions', () => {
    it('should detect conflicts and provide resolutions', async () => {
      const newRule = {
        name: 'Block Social Media',
        filters: ['dns.content_category in {23}'],
        action: 'block',
        traffic: 'dns'
      };

      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            conflicts: [{
              conflictingRuleId: 'rule-2',
              reason: 'Existing rule allows internal social media access',
              severity: 'high',
              suggestion: 'Add exception for internal domains'
            }],
            resolutions: [{
              type: 'modify_existing',
              description: 'Add exception to existing allow rule',
              details: {
                ruleId: 'rule-2',
                suggestedFilters: ['dns.fqdn != "internal-social.company.com"']
              },
              recommendation: 'recommended'
            }]
          })
        }]
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse as any);

      const result = await assistant.analyzeRuleConflictsWithResolutions(newRule, mockGatewayRules);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].severity).toBe('high');
      expect(result.resolutions).toHaveLength(1);
      expect(result.resolutions[0].type).toBe('modify_existing');
    });

    it('should handle no conflicts', async () => {
      const newRule = {
        name: 'Unique Rule',
        filters: ['dns.fqdn == "unique.com"'],
        action: 'block',
        traffic: 'dns'
      };

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ conflicts: [], resolutions: [] })
        }]
      } as any);

      const result = await assistant.analyzeRuleConflictsWithResolutions(newRule, []);

      expect(result.conflicts).toEqual([]);
      expect(result.resolutions).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropicClient.messages.create.mockRejectedValue(new Error('API Error'));

      const result = await assistant.analyzeRuleConflictsWithResolutions(
        { name: 'Test', filters: [], action: 'block' },
        []
      );

      expect(result.conflicts).toEqual([]);
      expect(result.resolutions).toEqual([]);
    });
  });

  describe('suggestRulePrecedence', () => {
    it('should suggest appropriate precedence for security rules', async () => {
      const newRule = {
        name: 'Block Malware',
        filters: ['dns.security_category in {80}'],
        action: 'block',
        traffic: 'dns'
      };

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            precedence: 1001,
            reasoning: 'Security block rule - high priority in 1000-1099 range'
          })
        }]
      } as any);

      const result = await assistant.suggestRulePrecedence(newRule, mockGatewayRules);

      expect(result.precedence).toBe(1001);
      expect(result.reasoning).toContain('Security block');
    });

    it('should handle existing rules and suggest gaps', async () => {
      const existingRules = [
        { ...mockGatewayRule, precedence: 1000 },
        { ...mockGatewayRule, precedence: 1100 }
      ];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            precedence: 1050,
            reasoning: 'Placed between existing rules to maintain order'
          })
        }]
      } as any);

      const result = await assistant.suggestRulePrecedence(
        { name: 'New Rule', filters: [], action: 'block' },
        existingRules
      );

      expect(result.precedence).toBe(1050);
    });
  });

  describe('generateRuleFilters', () => {
    it('should generate DNS filters from description', async () => {
      const description = 'block all gambling and adult content websites';

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            filters: [
              'any(dns.content_category[*] in {15})', // Gambling
              'any(dns.content_category[*] in {17})'  // Adult content
            ],
            explanation: 'Block gambling and adult content categories',
            traffic: 'dns'
          })
        }]
      } as any);

      const result = await assistant.generateRuleFilters(description);

      expect(result.filters).toHaveLength(2);
      expect(result.traffic).toBe('dns');
      expect(result.explanation).toContain('gambling and adult');
    });

    it('should handle HTTP filters', async () => {
      const description = 'allow access to company.com';

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            filters: ['http.request.host == "company.com"'],
            explanation: 'Allow HTTP access to company.com',
            traffic: 'http'
          })
        }]
      } as any);

      const result = await assistant.generateRuleFilters(description);

      expect(result.filters[0]).toContain('company.com');
      expect(result.traffic).toBe('http');
    });

    it('should handle generation failure', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Invalid response not JSON'
        }]
      } as any);

      const result = await assistant.generateRuleFilters('test');

      expect(result.filters).toEqual([]);
      expect(result.explanation).toContain('Unable to');
    });
  });

  describe('explainRule', () => {
    it('should provide clear explanation of rule', async () => {
      const explanation = `This rule blocks DNS requests to malicious domains.
      It matches any domain categorized as malware or phishing.
      Common use: Protecting users from known threats.
      The rule is enabled with high precedence for immediate effect.`;

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: explanation
        }]
      } as any);

      const result = await assistant.explainRule(mockGatewayRule);

      expect(result).toBe(explanation);
      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 500
        })
      );
    });
  });

  describe('validateAndOptimizeFilters', () => {
    it('should validate correct filter syntax', async () => {
      const filters = ['dns.fqdn == "example.com"', 'dns.fqdn in {"test.com" "demo.com"}'];

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: true,
            optimized: filters,
            issues: [],
            suggestions: []
          })
        }]
      } as any);

      const result = await assistant.validateAndOptimizeFilters(filters);

      expect(result.valid).toBe(true);
      expect(result.optimized).toEqual(filters);
      expect(result.issues).toEqual([]);
    });

    it('should detect and fix syntax errors', async () => {
      const filters = ['dns.fqdn = "example.com"']; // Missing second =

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            valid: false,
            optimized: ['dns.fqdn == "example.com"'],
            issues: ['Missing equality operator - should be == not ='],
            suggestions: ['Use == for exact match comparisons']
          })
        }]
      } as any);

      const result = await assistant.validateAndOptimizeFilters(filters);

      expect(result.valid).toBe(false);
      expect(result.optimized[0]).toContain('==');
      expect(result.issues).toHaveLength(1);
    });
  });

  describe('analyzeAndOptimizeRuleset', () => {
    it('should analyze ruleset and provide optimization suggestions', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Ruleset has 3 rules with some optimization opportunities',
            criticalIssues: [
              'Conflicting rules for social media access'
            ],
            recommendations: [{
              priority: 'high',
              action: 'Merge redundant DNS rules',
              reason: 'Rules 1 and 3 can be combined',
              affectedRules: ['rule-1', 'rule-3']
            }],
            optimizedRuleset: []
          })
        }]
      } as any);

      const result = await assistant.analyzeAndOptimizeRuleset(mockGatewayRules);

      expect(result.summary).toContain('3 rules');
      expect(result.criticalIssues).toHaveLength(1);
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].priority).toBe('high');
    });
  });

  describe('categorizeService', () => {
    it('should categorize business critical services', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            category: 'business_critical',
            priority: 'critical',
            suggestedAction: 'allow',
            reasoning: 'GitHub is essential for development operations'
          })
        }]
      } as any);

      const result = await assistant.categorizeService('GitHub', ['github.com', 'api.github.com']);

      expect(result.category).toBe('business_critical');
      expect(result.priority).toBe('critical');
      expect(result.suggestedAction).toBe('allow');
    });

    it('should categorize entertainment services', async () => {
      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            category: 'entertainment',
            priority: 'low',
            suggestedAction: 'block',
            reasoning: 'Netflix is entertainment/streaming service'
          })
        }]
      } as any);

      const result = await assistant.categorizeService('Netflix', ['netflix.com']);

      expect(result.category).toBe('entertainment');
      expect(result.priority).toBe('low');
      expect(result.suggestedAction).toBe('block');
    });
  });

  describe('generateRulesetTemplate', () => {
    it('should generate enterprise template with strict security', async () => {
      const requirements = {
        environment: 'enterprise' as const,
        securityLevel: 'strict' as const,
        services: ['email', 'cloud storage'],
        specialRequirements: ['GDPR compliance']
      };

      mockAnthropicClient.messages.create.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            template: [
              {
                name: 'Block Malware',
                action: 'block',
                traffic: 'dns',
                filters: ['any(dns.security_category[*] in {80})'],
                precedence: 1000,
                description: 'Block known malware domains',
                category: 'security'
              },
              {
                name: 'Allow Business Email',
                action: 'allow',
                traffic: 'http',
                filters: ['http.request.host in {"outlook.com" "gmail.com"}'],
                precedence: 1200,
                description: 'Allow access to business email',
                category: 'business'
              }
            ],
            explanation: 'Enterprise template with strict security and GDPR compliance'
          })
        }]
      } as any);

      const result = await assistant.generateRulesetTemplate(requirements);

      expect(result.template).toHaveLength(2);
      expect(result.template[0].category).toBe('security');
      expect(result.explanation).toContain('Enterprise');
    });
  });
});