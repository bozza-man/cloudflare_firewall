/**
 * Cloudflare Workers AI Assistant for Gateway Rule Management
 * 
 * This is a proof-of-concept implementation showing how to replace
 * the Anthropic Claude API with Cloudflare's native AI services.
 */

import chalk from 'chalk';
import { config } from '../utils/config.js';

export class CloudflareAIAssistant {
  constructor() {
    this.accountId = config.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = config.CLOUDFLARE_API_TOKEN;
    this.aiGatewayId = config.AI_GATEWAY_ID || 'gateway-firewall-ai';
    
    // Base URLs for different Cloudflare AI services
    this.workersAiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`;
    this.aiGatewayUrl = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${this.aiGatewayId}`;
    this.vectorizeUrl = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/vectorize`;
  }

  /**
   * Headers for Cloudflare API requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Analyze potential conflicts between rules using Workers AI
   */
  async analyzeConflicts(newRule, existingRules) {
    const prompt = this.buildConflictAnalysisPrompt(newRule, existingRules);
    
    try {
      // Use AI Gateway for caching and fallbacks
      const response = await fetch(`${this.aiGatewayUrl}/workers-ai/@cf/meta/llama-3.2-11b-vision-instruct`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a Cloudflare Zero Trust Gateway rules expert. Analyze rule conflicts and provide detailed recommendations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          // Use function calling for structured output
          tools: [{
            type: 'function',
            function: {
              name: 'analyze_rule_conflicts',
              description: 'Analyze conflicts between firewall rules',
              parameters: {
                type: 'object',
                properties: {
                  hasConflicts: {
                    type: 'boolean',
                    description: 'Whether conflicts exist'
                  },
                  conflicts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        ruleId: { type: 'string' },
                        ruleName: { type: 'string' },
                        conflictType: { 
                          type: 'string',
                          enum: ['overlap', 'duplicate', 'contradiction', 'precedence']
                        },
                        severity: {
                          type: 'string',
                          enum: ['low', 'medium', 'high', 'critical']
                        },
                        description: { type: 'string' },
                        resolution: { type: 'string' }
                      }
                    }
                  },
                  recommendations: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                },
                required: ['hasConflicts', 'conflicts', 'recommendations']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'analyze_rule_conflicts' } },
          // AI Gateway specific options
          cache: {
            ttl: 3600, // Cache for 1 hour
            key: this.generateCacheKey(newRule, existingRules)
          }
        })
      });

      const data = await response.json();
      
      if (data.tool_calls && data.tool_calls[0]) {
        return JSON.parse(data.tool_calls[0].function.arguments);
      }

      // Fallback to text parsing if function calling fails
      return this.parseTextResponse(data.response);
    } catch (error) {
      console.error(chalk.yellow('Workers AI error, falling back to text analysis:'), error);
      return this.basicConflictAnalysis(newRule, existingRules);
    }
  }

  /**
   * Generate a rule from natural language description
   */
  async generateRuleFromDescription(description, context = {}) {
    const prompt = `Generate a Cloudflare Zero Trust Gateway rule based on this description: "${description}"
    
Context:
- Account ID: ${this.accountId}
- Existing rules count: ${context.existingRulesCount || 0}
- Rule type preference: ${context.ruleType || 'auto-detect'}

Requirements:
- Determine the appropriate traffic type (dns, http, or l4)
- Generate valid Cloudflare filter expressions
- Suggest appropriate action (block, allow, isolate, etc.)
- Set reasonable precedence based on rule specificity
- Include a clear name and description`;

    try {
      const response = await fetch(`${this.workersAiUrl}/@cf/meta/llama-3.2-3b-instruct`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an expert at creating Cloudflare Zero Trust Gateway rules. Generate valid, secure, and efficient rules.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'create_gateway_rule',
              description: 'Create a Cloudflare Gateway rule',
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  action: { 
                    type: 'string',
                    enum: ['allow', 'block', 'isolate', 'do_not_isolate', 'do_not_scan', 'l4_override']
                  },
                  traffic: {
                    type: 'string',
                    enum: ['dns', 'http', 'l4']
                  },
                  filters: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  precedence: { type: 'integer' },
                  enabled: { type: 'boolean' },
                  rule_settings: {
                    type: 'object',
                    properties: {
                      block_page_enabled: { type: 'boolean' },
                      block_reason: { type: 'string' },
                      biso_admin_controls: { type: 'object' },
                      add_headers: { type: 'object' },
                      l4override: { type: 'object' },
                      notification_settings: { type: 'object' }
                    }
                  }
                },
                required: ['name', 'action', 'traffic', 'filters', 'precedence', 'enabled']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'create_gateway_rule' } },
          temperature: 0.3, // Lower temperature for more consistent rule generation
          max_tokens: 1000
        })
      });

      const data = await response.json();
      
      if (data.tool_calls && data.tool_calls[0]) {
        const rule = JSON.parse(data.tool_calls[0].function.arguments);
        
        // Validate and enhance the generated rule
        return this.validateAndEnhanceRule(rule);
      }

      throw new Error('Failed to generate structured rule');
    } catch (error) {
      console.error(chalk.red('Error generating rule with Workers AI:'), error);
      throw error;
    }
  }

  /**
   * Use Vectorize to find semantically similar rules
   */
  async findSimilarRules(ruleDescription, topK = 5) {
    try {
      // First, generate embedding for the rule description
      const embeddingResponse = await fetch(`${this.workersAiUrl}/@cf/baai/bge-base-en-v1.5`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          text: ruleDescription
        })
      });

      const { data: { embedding } } = await embeddingResponse.json();

      // Query Vectorize for similar rules
      const vectorResponse = await fetch(`${this.vectorizeUrl}/indexes/gateway-rules/query`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          vector: embedding,
          topK,
          includeMetadata: true,
          filter: {
            enabled: true // Only search active rules
          }
        })
      });

      const { matches } = await vectorResponse.json();

      return matches.map(match => ({
        ruleId: match.id,
        similarity: match.score,
        metadata: match.metadata,
        suggestedAction: this.determineSuggestedAction(match.score)
      }));
    } catch (error) {
      console.error(chalk.yellow('Vectorize search failed:'), error);
      return [];
    }
  }

  /**
   * Optimize a set of rules using AI analysis
   */
  async optimizeRuleset(rules) {
    const prompt = `Analyze and optimize this set of Cloudflare Gateway rules:

${JSON.stringify(rules, null, 2)}

Identify:
1. Redundant rules that can be combined
2. Conflicting rules that need resolution
3. Performance improvements (precedence reordering)
4. Security gaps that need new rules
5. Rules that can be simplified

Provide specific, actionable recommendations.`;

    try {
      const response = await fetch(`${this.aiGatewayUrl}/workers-ai/@cf/mistral/mistral-7b-instruct-v0.2`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a security and performance optimization expert for Cloudflare Gateway rules.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.5,
          max_tokens: 2000,
          // Enable caching for optimization analysis
          cache: {
            ttl: 7200, // Cache for 2 hours
            key: this.generateRulesetHash(rules)
          }
        })
      });

      const data = await response.json();
      return this.parseOptimizationResponse(data.response);
    } catch (error) {
      console.error(chalk.red('Error optimizing ruleset:'), error);
      throw error;
    }
  }

  /**
   * Helper method to build conflict analysis prompt
   */
  buildConflictAnalysisPrompt(newRule, existingRules) {
    return `Analyze potential conflicts between this new rule and existing rules:

NEW RULE:
${JSON.stringify(newRule, null, 2)}

EXISTING RULES:
${existingRules.map(r => JSON.stringify(r, null, 2)).join('\n---\n')}

Consider:
- Domain/IP overlaps
- Port conflicts
- Action contradictions
- Precedence issues
- Performance impact

Provide detailed conflict analysis and resolution suggestions.`;
  }

  /**
   * Validate and enhance generated rule
   */
  validateAndEnhanceRule(rule) {
    // Ensure filter expressions are valid
    if (rule.filters && Array.isArray(rule.filters)) {
      rule.filters = rule.filters.map(filter => {
        // Convert to Cloudflare expression syntax if needed
        return this.convertToCloudflareExpression(filter, rule.traffic);
      });
    }

    // Set default precedence if not specified
    if (!rule.precedence) {
      rule.precedence = 10000; // Default middle precedence
    }

    // Add default rule settings if missing
    if (!rule.rule_settings) {
      rule.rule_settings = {};
    }

    // Enable block page for block actions
    if (rule.action === 'block' && rule.traffic === 'http') {
      rule.rule_settings.block_page_enabled = true;
      rule.rule_settings.block_reason = rule.description || 'Blocked by security policy';
    }

    return rule;
  }

  /**
   * Convert filter to Cloudflare expression syntax
   */
  convertToCloudflareExpression(filter, trafficType) {
    // This is a simplified example - expand based on your needs
    if (trafficType === 'dns') {
      // DNS query expressions
      if (filter.includes('domain')) {
        return filter; // Assume it's already in correct format
      }
      return `dns.query_name in {${filter}}`;
    } else if (trafficType === 'http') {
      // HTTP expressions
      if (filter.includes('http.')) {
        return filter; // Already in correct format
      }
      // Convert simple domain to HTTP host
      if (!filter.includes(' ')) {
        return `http.host == "${filter}"`;
      }
      return filter;
    } else if (trafficType === 'l4') {
      // Network expressions
      if (filter.includes('ip.')) {
        return filter;
      }
      // Convert IP address to proper format
      if (filter.match(/\d+\.\d+\.\d+\.\d+/)) {
        return `ip.dst == ${filter}`;
      }
      return filter;
    }
    
    return filter;
  }

  /**
   * Generate cache key for AI Gateway
   */
  generateCacheKey(newRule, existingRules) {
    const ruleHash = this.hashObject(newRule);
    const existingHash = this.hashObject(existingRules);
    return `conflict-analysis-${ruleHash}-${existingHash}`;
  }

  /**
   * Generate hash for ruleset (for caching)
   */
  generateRulesetHash(rules) {
    return this.hashObject(rules);
  }

  /**
   * Simple hash function for objects
   */
  hashObject(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Determine suggested action based on similarity score
   */
  determineSuggestedAction(score) {
    if (score > 0.95) {
      return 'merge'; // Nearly identical
    } else if (score > 0.85) {
      return 'review'; // Very similar, needs review
    } else if (score > 0.75) {
      return 'compare'; // Similar enough to compare
    }
    return 'none'; // Different enough
  }

  /**
   * Parse text response (fallback)
   */
  parseTextResponse(text) {
    // Basic parsing logic - enhance as needed
    const hasConflicts = text.toLowerCase().includes('conflict');
    return {
      hasConflicts,
      conflicts: [],
      recommendations: [text]
    };
  }

  /**
   * Parse optimization response
   */
  parseOptimizationResponse(text) {
    // Parse the AI response into structured recommendations
    const sections = text.split(/\d+\.\s+/);
    const recommendations = [];

    sections.forEach(section => {
      if (section.trim()) {
        recommendations.push({
          type: this.detectRecommendationType(section),
          description: section.trim(),
          priority: this.detectPriority(section)
        });
      }
    });

    return {
      recommendations,
      summary: text.substring(0, 200)
    };
  }

  /**
   * Detect recommendation type from text
   */
  detectRecommendationType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('redundant') || lower.includes('combine')) return 'consolidation';
    if (lower.includes('conflict')) return 'conflict_resolution';
    if (lower.includes('performance') || lower.includes('precedence')) return 'performance';
    if (lower.includes('security') || lower.includes('gap')) return 'security';
    if (lower.includes('simplif')) return 'simplification';
    return 'general';
  }

  /**
   * Detect priority from text
   */
  detectPriority(text) {
    const lower = text.toLowerCase();
    if (lower.includes('critical') || lower.includes('urgent')) return 'high';
    if (lower.includes('important') || lower.includes('should')) return 'medium';
    return 'low';
  }

  /**
   * Basic conflict analysis (fallback)
   */
  basicConflictAnalysis(newRule, existingRules) {
    const conflicts = [];
    
    existingRules.forEach(existingRule => {
      // Check for exact duplicates
      if (JSON.stringify(existingRule.filters) === JSON.stringify(newRule.filters)) {
        conflicts.push({
          ruleId: existingRule.id,
          ruleName: existingRule.name,
          conflictType: 'duplicate',
          severity: 'high',
          description: 'Rules have identical filters',
          resolution: 'Remove duplicate or merge rules'
        });
      }
      
      // Check for action conflicts on same target
      if (existingRule.action !== newRule.action && 
          this.hasFilterOverlap(existingRule.filters, newRule.filters)) {
        conflicts.push({
          ruleId: existingRule.id,
          ruleName: existingRule.name,
          conflictType: 'contradiction',
          severity: 'medium',
          description: 'Rules have conflicting actions for overlapping targets',
          resolution: 'Review precedence or consolidate rules'
        });
      }
    });

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      recommendations: conflicts.length > 0 
        ? ['Review and resolve conflicts before creating rule']
        : ['No conflicts detected, safe to create rule']
    };
  }

  /**
   * Check if filters overlap
   */
  hasFilterOverlap(filters1, filters2) {
    // Simplified overlap detection - enhance as needed
    return filters1.some(f1 => filters2.some(f2 => 
      f1.toLowerCase().includes(f2.toLowerCase()) || 
      f2.toLowerCase().includes(f1.toLowerCase())
    ));
  }
}

// Export for use in existing codebase
export default CloudflareAIAssistant;
