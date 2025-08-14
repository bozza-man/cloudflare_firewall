import type { 
  AIAnalysisResponse, 
  AIRecommendation,
  AIOptimizedRule,
  LocalAnalysis 
} from '../../src/types/ai-responses.js';
import type { GatewayRule } from '../../src/types/gateway.js';
import { mockGatewayRules } from './gateway-rules';

export const mockAIRecommendation: AIRecommendation = {
  action: 'update rule precedence',
  reason: 'Rule should be ordered before more specific rules',
  priority: 'high',
  affectedRules: ['rule-1'],
  category: 'optimization'
};

export const mockAIOptimizedRule: AIOptimizedRule = {
  rule: mockGatewayRules[0],
  changes: ['precedence'],
  newPrecedence: 500,
  reason: 'Improved performance by reordering'
};

export const mockAIAnalysisResponse: AIAnalysisResponse = {
  summary: 'Analyzed 3 gateway rules. Found 1 optimization opportunity and 0 critical issues.',
  criticalIssues: [],
  recommendations: [mockAIRecommendation],
  optimizedRuleset: [mockAIOptimizedRule]
};

export const mockLocalAnalysis: LocalAnalysis = {
  issues: [
    {
      ruleId: 'rule-1',
      category: 'redundancy',
      type: 'warning',
      message: 'Rule overlaps with rule-2',
      relatedRules: ['rule-2'],
      severity: 'medium'
    }
  ],
  proposedOrder: [
    {
      rule: mockGatewayRules[0],
      suggestedPrecedence: 500,
      reason: 'Should be evaluated first due to specificity'
    }
  ],
  summary: {
    totalRules: 3,
    errors: 0,
    warnings: 1,
    suggestions: 1
  }
};

export const mockAnthropicResponse = {
  id: 'msg_test123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: JSON.stringify(mockAIAnalysisResponse)
    }
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 100,
    output_tokens: 200
  }
};
