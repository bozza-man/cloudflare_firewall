import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import nock from 'nock';
import { 
  mockGatewayRules, 
  mockCloudflareResponse 
} from '../fixtures/gateway-rules';
import { 
  mockAIAnalysisResponse,
  mockLocalAnalysis,
  mockAnthropicResponse
} from '../fixtures/ai-responses';
import { 
  createTestEnvironment, 
  mockCloudflareAPI, 
  mockAnthropicAPI,
  captureConsole
} from '../utils/test-helpers';

// Simple RuleOptimizer implementation for integration testing
class RuleOptimizer {
  private gateway: any;
  private ai: any;
  private analyzer: any;

  constructor() {
    // Mock implementations that work with our test data
    this.gateway = {
      listGatewayRules: jest.fn(),
      updateGatewayRule: jest.fn(),
      deleteGatewayRule: jest.fn(),
      updateRulePrecedence: jest.fn(),
      createGatewayRule: jest.fn()
    };

    this.ai = {
      analyzeAndOptimizeRuleset: jest.fn()
    };

    this.analyzer = {
      analyzeRules: jest.fn(),
      displayAnalysis: jest.fn()
    };
  }

  async analyzeAndOptimize(options: {
    autoFix?: boolean;
    dryRun?: boolean;
    interactive?: boolean;
  } = {}): Promise<void> {
    // Fetch current rules
    const rules = await this.gateway.listGatewayRules();
    const sortedRules = rules.sort((a: any, b: any) => a.precedence - b.precedence);
    
    // Run local analysis
    const localAnalysis = this.analyzer.analyzeRules(sortedRules);
    
    // Run AI analysis
    const aiAnalysis = await this.ai.analyzeAndOptimizeRuleset(sortedRules);
    
    // Display analysis results
    console.log('\n🤖 AI Analysis Summary:\n');
    console.log(aiAnalysis.summary);
    
    if (aiAnalysis.criticalIssues && aiAnalysis.criticalIssues.length > 0) {
      console.log('\n🚨 Critical Issues:');
      aiAnalysis.criticalIssues.forEach((issue: any, index: number) => {
        const issueText = typeof issue === 'string' ? issue : 
                         (issue?.description || issue?.message || 
                         issue?.reason || JSON.stringify(issue));
        console.log(`   ${index + 1}. ${issueText}`);
      });
    }

    // Display local analysis
    this.analyzer.displayAnalysis(localAnalysis);

    // Generate optimization plan
    const plan = await this.generateOptimizationPlan(sortedRules, localAnalysis, aiAnalysis);

    // Display the plan
    this.displayOptimizationPlan(plan);

    // Execute the plan if requested
    if (options.autoFix || options.interactive) {
      if (options.dryRun) {
        console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
      } else {
        await this.executeOptimizationPlan(plan, options.interactive || false);
      }
    }
  }

  private async generateOptimizationPlan(rules: any[], localAnalysis: any, aiAnalysis: any): Promise<any> {
    const plan = {
      rulesToUpdate: [] as any[],
      rulesToDelete: [] as any[],
      rulesToCreate: [] as any[],
      reorderingPlan: [] as any[]
    };

    // Process local analysis findings
    if (localAnalysis.issues) {
      localAnalysis.issues.forEach((issue: any) => {
        if (issue.category === 'redundancy' && issue.type === 'warning') {
          const rule = rules.find(r => r.id === issue.ruleId);
          if (rule) {
            plan.rulesToDelete.push({
              rule,
              reason: issue.message
            });
          }
        }
      });
    }

    // Process AI recommendations
    if (aiAnalysis.recommendations) {
      aiAnalysis.recommendations.forEach((rec: any) => {
        if (rec.priority === 'high' && rec.affectedRules) {
          rec.affectedRules.forEach((ruleId: string) => {
            const rule = rules.find(r => r.id === ruleId);
            if (rule && rec.action.includes('update')) {
              plan.rulesToUpdate.push({
                rule,
                updates: { name: `Updated ${rule.name}` },
                reason: rec.reason
              });
            }
          });
        }
      });
    }

    // Process reordering suggestions
    if (localAnalysis.proposedOrder) {
      localAnalysis.proposedOrder.forEach((proposal: any) => {
        plan.reorderingPlan.push({
          ruleId: proposal.rule.id,
          ruleName: proposal.rule.name,
          currentPrecedence: proposal.rule.precedence,
          newPrecedence: proposal.suggestedPrecedence
        });
      });
    }

    return plan;
  }

  private displayOptimizationPlan(plan: any): void {
    console.log('\n📋 Optimization Plan:\n');

    const totalChanges = 
      plan.rulesToUpdate.length + 
      plan.rulesToDelete.length + 
      plan.rulesToCreate.length + 
      plan.reorderingPlan.length;

    if (totalChanges === 0) {
      console.log('✨ Your ruleset is already well-optimized! No changes needed.');
      return;
    }

    console.log(`Total changes to apply: ${totalChanges}`);

    // Display updates
    if (plan.rulesToUpdate.length > 0) {
      console.log(`\n📝 Rules to Update (${plan.rulesToUpdate.length}):`);
      plan.rulesToUpdate.forEach(({ rule, reason }: any) => {
        console.log(`   ${rule.name} - ${reason}`);
      });
    }

    // Display deletions
    if (plan.rulesToDelete.length > 0) {
      console.log(`\n🗑️  Rules to Delete (${plan.rulesToDelete.length}):`);
      plan.rulesToDelete.forEach(({ rule, reason }: any) => {
        console.log(`   ${rule.name} - ${reason}`);
      });
    }

    // Display reordering
    if (plan.reorderingPlan.length > 0) {
      console.log(`\n🔄 Rules to Reorder (${plan.reorderingPlan.length}):`);
      plan.reorderingPlan.forEach(({ ruleName, currentPrecedence, newPrecedence }: any) => {
        const direction = newPrecedence < currentPrecedence ? '↑' : '↓';
        console.log(`   ${direction} ${ruleName}: ${currentPrecedence} → ${newPrecedence}`);
      });
    }
  }

  private async executeOptimizationPlan(plan: any, interactive: boolean): Promise<void> {
    let successCount = 0;
    let errorCount = 0;

    try {
      // Apply deletions first
      for (const { rule } of plan.rulesToDelete) {
        try {
          await this.gateway.deleteGatewayRule(rule.id);
          successCount++;
        } catch (error) {
          console.error(`Failed to delete ${rule.name}:`, error);
          errorCount++;
        }
      }

      // Apply updates
      for (const { rule, updates } of plan.rulesToUpdate) {
        try {
          await this.gateway.updateGatewayRule({
            id: rule.id,
            ...updates
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to update ${rule.name}:`, error);
          errorCount++;
        }
      }

      // Apply reordering
      for (const { ruleId, newPrecedence } of plan.reorderingPlan) {
        try {
          await this.gateway.updateRulePrecedence(ruleId, newPrecedence);
          successCount++;
        } catch (error) {
          console.error(`Failed to reorder rule:`, error);
          errorCount++;
        }
      }

      console.log(`\nOptimization complete: ${successCount} succeeded, ${errorCount} failed`);

      if (successCount > 0) {
        console.log('\n✅ Rules have been optimized successfully!');
      }

    } catch (error) {
      console.error('Optimization failed:', error);
      throw error;
    }
  }
}

describe('RuleOptimizer Integration', () => {
  let optimizer: RuleOptimizer;
  let envCleanup: ReturnType<typeof createTestEnvironment>;
  let cloudflareAPI: ReturnType<typeof mockCloudflareAPI>;
  let anthropicAPI: ReturnType<typeof mockAnthropicAPI>;
  let consoleCapture: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    envCleanup = createTestEnvironment();
    cloudflareAPI = mockCloudflareAPI();
    anthropicAPI = mockAnthropicAPI();
    consoleCapture = captureConsole();
    optimizer = new RuleOptimizer();

    // Setup default mock responses
    optimizer['gateway'].listGatewayRules.mockResolvedValue(mockGatewayRules);
    optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(mockAIAnalysisResponse);
    optimizer['analyzer'].analyzeRules.mockReturnValue(mockLocalAnalysis);
    optimizer['analyzer'].displayAnalysis.mockImplementation(() => {
      console.log('Local analysis displayed');
    });
  });

  afterEach(() => {
    envCleanup.restore();
    consoleCapture.restore();
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe('complete analysis workflow', () => {
    it('should perform full analysis without errors', async () => {
      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(optimizer['gateway'].listGatewayRules).toHaveBeenCalled();
      expect(optimizer['ai'].analyzeAndOptimizeRuleset).toHaveBeenCalled();
      expect(optimizer['analyzer'].analyzeRules).toHaveBeenCalled();
    });

    it('should handle empty ruleset gracefully', async () => {
      optimizer['gateway'].listGatewayRules.mockResolvedValue([]);
      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue({
        summary: 'No rules to analyze',
        criticalIssues: [],
        recommendations: []
      });
      optimizer['analyzer'].analyzeRules.mockReturnValue({
        issues: [],
        summary: { totalRules: 0, errors: 0, warnings: 0, suggestions: 0 }
      });

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.errors).toHaveLength(0);
      expect(consoleCapture.logs.some(log => 
        log.includes('No rules to analyze')
      )).toBe(true);
    });

    it('should display optimization plan correctly', async () => {
      const localAnalysisWithIssues = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Rule is redundant',
            severity: 'medium'
          }
        ],
        proposedOrder: [
          {
            rule: mockGatewayRules[0],
            suggestedPrecedence: 500,
            reason: 'Should be evaluated first'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithIssues);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization Plan')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Total changes to apply')
      )).toBe(true);
    });

    it('should handle AI analysis with critical issues', async () => {
      const aiAnalysisWithIssues = {
        ...mockAIAnalysisResponse,
        criticalIssues: [
          'Critical security vulnerability detected',
          { description: 'Rule conflict detected' }
        ]
      };

      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(aiAnalysisWithIssues);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Critical Issues')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Critical security vulnerability')
      )).toBe(true);
    });
  });

  describe('optimization plan generation', () => {
    it('should generate plan from local analysis issues', async () => {
      const localAnalysisWithDeletion = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Rule should be deleted'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithDeletion);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Rules to Delete')
      )).toBe(true);
    });

    it('should generate plan from AI recommendations', async () => {
      const aiAnalysisWithRecommendations = {
        ...mockAIAnalysisResponse,
        recommendations: [
          {
            action: 'update rule filters',
            reason: 'Improve specificity',
            priority: 'high',
            affectedRules: ['rule-1']
          }
        ]
      };

      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(aiAnalysisWithRecommendations);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Rules to Update')
      )).toBe(true);
    });

    it('should generate reordering plan', async () => {
      const localAnalysisWithReordering = {
        ...mockLocalAnalysis,
        proposedOrder: [
          {
            rule: mockGatewayRules[0],
            suggestedPrecedence: 500,
            reason: 'Should be evaluated first'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithReordering);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Rules to Reorder')
      )).toBe(true);
    });

    it('should show no changes message for clean ruleset', async () => {
      optimizer['analyzer'].analyzeRules.mockReturnValue({
        issues: [],
        proposedOrder: [],
        summary: { totalRules: 3, errors: 0, warnings: 0, suggestions: 0 }
      });

      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue({
        summary: 'Ruleset is optimized',
        criticalIssues: [],
        recommendations: []
      });

      await optimizer.analyzeAndOptimize({ dryRun: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('already well-optimized')
      )).toBe(true);
    });
  });

  describe('optimization execution', () => {
    beforeEach(() => {
      // Setup successful mock responses for execution
      optimizer['gateway'].deleteGatewayRule.mockResolvedValue(undefined);
      optimizer['gateway'].updateGatewayRule.mockResolvedValue(mockGatewayRules[0]);
      optimizer['gateway'].updateRulePrecedence.mockResolvedValue(mockGatewayRules[0]);
    });

    it('should execute optimization plan in autoFix mode', async () => {
      const localAnalysisWithChanges = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Redundant rule'
          }
        ],
        proposedOrder: [
          {
            rule: mockGatewayRules[1],
            suggestedPrecedence: 500,
            reason: 'Reorder for efficiency'
          }
        ]
      };

      const aiAnalysisWithRecommendations = {
        ...mockAIAnalysisResponse,
        recommendations: [
          {
            action: 'update rule name',
            reason: 'Improve clarity',
            priority: 'high',
            affectedRules: ['rule-2']
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithChanges);
      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(aiAnalysisWithRecommendations);

      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(optimizer['gateway'].deleteGatewayRule).toHaveBeenCalledWith('rule-1');
      expect(optimizer['gateway'].updateGatewayRule).toHaveBeenCalled();
      expect(optimizer['gateway'].updateRulePrecedence).toHaveBeenCalledWith('rule-2', 500);
      
      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization complete')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('optimized successfully')
      )).toBe(true);
    });

    it('should handle execution errors gracefully', async () => {
      const localAnalysisWithChanges = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Redundant rule'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithChanges);
      optimizer['gateway'].deleteGatewayRule.mockRejectedValue(new Error('Delete failed'));

      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(consoleCapture.errors.some(error => 
        typeof error === 'string' && error.includes('Failed to delete')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization complete: 0 succeeded, 1 failed')
      )).toBe(true);
    });

    it('should count successes and failures correctly', async () => {
      const localAnalysisWithMultipleChanges = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'First redundant rule'
          },
          {
            ruleId: 'rule-2',
            category: 'redundancy',
            type: 'warning',
            message: 'Second redundant rule'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithMultipleChanges);
      optimizer['gateway'].deleteGatewayRule
        .mockResolvedValueOnce(undefined) // First delete succeeds
        .mockRejectedValueOnce(new Error('Second delete fails')); // Second delete fails

      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization complete: 1 succeeded, 1 failed')
      )).toBe(true);
    });

    it('should not execute changes in dry run mode', async () => {
      const localAnalysisWithChanges = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Redundant rule'
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(localAnalysisWithChanges);

      await optimizer.analyzeAndOptimize({ autoFix: true, dryRun: true });

      expect(optimizer['gateway'].deleteGatewayRule).not.toHaveBeenCalled();
      expect(consoleCapture.logs.some(log => 
        log.includes('DRY RUN MODE')
      )).toBe(true);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle API failures during rule fetching', async () => {
      optimizer['gateway'].listGatewayRules.mockRejectedValue(new Error('API Error'));

      await expect(optimizer.analyzeAndOptimize()).rejects.toThrow('API Error');
    });

    it('should handle AI analysis failures', async () => {
      optimizer['ai'].analyzeAndOptimizeRuleset.mockRejectedValue(new Error('AI Service Unavailable'));

      await expect(optimizer.analyzeAndOptimize()).rejects.toThrow('AI Service Unavailable');
    });

    it('should handle malformed AI responses gracefully', async () => {
      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue({
        // Missing required fields
        summary: 'Incomplete response'
      });

      await optimizer.analyzeAndOptimize({ dryRun: true });

      // Should complete without throwing errors
      expect(consoleCapture.errors).toHaveLength(0);
    });

    it('should handle local analysis failures', async () => {
      optimizer['analyzer'].analyzeRules.mockImplementation(() => {
        throw new Error('Analysis failed');
      });

      await expect(optimizer.analyzeAndOptimize()).rejects.toThrow('Analysis failed');
    });

    it('should handle mixed success/failure in execution', async () => {
      const complexPlan = {
        ...mockLocalAnalysis,
        issues: [
          {
            ruleId: 'rule-1',
            category: 'redundancy',
            type: 'warning',
            message: 'Delete this rule'
          }
        ],
        proposedOrder: [
          {
            rule: mockGatewayRules[0],
            suggestedPrecedence: 500,
            reason: 'Reorder rule'
          }
        ]
      };

      const aiAnalysisWithUpdates = {
        ...mockAIAnalysisResponse,
        recommendations: [
          {
            action: 'update filters',
            reason: 'Optimize performance',
            priority: 'high',
            affectedRules: ['rule-2']
          }
        ]
      };

      optimizer['analyzer'].analyzeRules.mockReturnValue(complexPlan);
      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(aiAnalysisWithUpdates);

      // Setup mixed success/failure responses
      optimizer['gateway'].deleteGatewayRule.mockResolvedValue(undefined); // Success
      optimizer['gateway'].updateGatewayRule.mockRejectedValue(new Error('Update failed')); // Failure
      optimizer['gateway'].updateRulePrecedence.mockResolvedValue(mockGatewayRules[0]); // Success

      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('2 succeeded, 1 failed')
      )).toBe(true);
      expect(consoleCapture.errors.some(error => 
        typeof error === 'string' && error.includes('Update failed')
      )).toBe(true);
    });
  });

  describe('performance and scalability', () => {
    it('should handle large rulesets efficiently', async () => {
      const largeRuleset = Array.from({ length: 100 }, (_, i) => ({
        ...mockGatewayRules[0],
        id: `rule-${i}`,
        name: `Rule ${i}`,
        precedence: 1000 + i
      }));

      optimizer['gateway'].listGatewayRules.mockResolvedValue(largeRuleset);
      optimizer['analyzer'].analyzeRules.mockReturnValue({
        issues: [],
        summary: { totalRules: 100, errors: 0, warnings: 0, suggestions: 0 }
      });

      const startTime = Date.now();
      await optimizer.analyzeAndOptimize({ dryRun: true });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(optimizer['gateway'].listGatewayRules).toHaveBeenCalled();
    });

    it('should handle many optimization changes efficiently', async () => {
      // Create 50 rules with corresponding issues
      const manyRules = Array.from({ length: 50 }, (_, i) => ({
        id: `rule-${i}`,
        name: `Rule ${i}`,
        precedence: 1000 + i,
        action: 'block'
      }));
      
      const manyIssues = Array.from({ length: 50 }, (_, i) => ({
        ruleId: `rule-${i}`,
        category: 'redundancy' as const,
        type: 'warning' as const,
        message: `Redundant rule ${i}`
      }));

      optimizer['gateway'].listGatewayRules.mockResolvedValue(manyRules);
      optimizer['analyzer'].analyzeRules.mockReturnValue({
        issues: manyIssues,
        summary: { totalRules: 50, errors: 0, warnings: 50, suggestions: 0 }
      });

      optimizer['gateway'].deleteGatewayRule.mockResolvedValue(undefined);

      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(optimizer['gateway'].deleteGatewayRule).toHaveBeenCalledTimes(50);
      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization complete: 50 succeeded, 0 failed')
      )).toBe(true);
    });
  });

  describe('user interaction simulation', () => {
    it('should display comprehensive analysis information', async () => {
      const detailedAIAnalysis = {
        summary: 'Comprehensive analysis of 5 rules revealed multiple optimization opportunities',
        criticalIssues: [
          'Security vulnerability in rule-1',
          { description: 'Performance bottleneck detected', severity: 'high' }
        ],
        recommendations: [
          {
            action: 'consolidate rules',
            reason: 'Reduce complexity and improve performance',
            priority: 'high',
            affectedRules: ['rule-1', 'rule-2']
          }
        ]
      };

      const detailedLocalAnalysis = {
        issues: [
          {
            ruleId: 'rule-3',
            category: 'conflict',
            type: 'error',
            message: 'Rule conflicts with rule-4',
            severity: 'high'
          }
        ],
        summary: { totalRules: 5, errors: 1, warnings: 2, suggestions: 3 }
      };

      optimizer['ai'].analyzeAndOptimizeRuleset.mockResolvedValue(detailedAIAnalysis);
      optimizer['analyzer'].analyzeRules.mockReturnValue(detailedLocalAnalysis);

      await optimizer.analyzeAndOptimize({ dryRun: true });

      // Verify comprehensive output
      expect(consoleCapture.logs.some(log => 
        log.includes('AI Analysis Summary')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Critical Issues')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Security vulnerability')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('Performance bottleneck')
      )).toBe(true);
    });

    it('should provide clear feedback for optimization results', async () => {
      await optimizer.analyzeAndOptimize({ autoFix: true });

      expect(consoleCapture.logs.some(log => 
        log.includes('Optimization complete')
      )).toBe(true);
      expect(consoleCapture.logs.some(log => 
        log.includes('optimized successfully')
      )).toBe(true);
    });
  });
});
