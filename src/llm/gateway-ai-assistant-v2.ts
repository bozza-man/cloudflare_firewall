/**
 * Gateway AI Assistant v2 - Full Cloudflare Services Integration
 * 
 * This implementation uses Cloudflare's AI services as primary provider
 * with Anthropic Claude as fallback for complex operations.
 */

import type { GatewayRule, RuleConflict } from '../types/gateway.js';

// Conditional imports for CLI vs Worker environments
const isWorkerEnv = typeof globalThis.navigator === 'undefined' && typeof importScripts === 'undefined';

let config: any = {};
let chalk: any = { cyan: (s: string) => s, yellow: (s: string) => s, red: (s: string) => s, green: (s: string) => s };
let Anthropic: any = null;

if (!isWorkerEnv) {
  try {
    const configModule = await import('../utils/config.js');
    config = configModule.config;
    const chalkModule = await import('chalk');
    chalk = chalkModule.default;
    const anthropicModule = await import('@anthropic-ai/sdk');
    Anthropic = anthropicModule.default;
  } catch (e) {
    // Fallback for Worker environment
  }
}

// Cloudflare service types
interface CloudflareEnv {
  AI: any;
  VECTORIZE: any;
  DB: D1Database;
  CACHE: KVNamespace;
  ANALYTICS: AnalyticsEngineDataset;
  AI_GATEWAY_SLUG: string;
}

export class GatewayAIAssistantV2 {
  private anthropicClient?: Anthropic;
  private useAIGateway: boolean;
  private aiGatewayUrl: string;
  private accountId: string;
  private apiToken: string;
  private env?: CloudflareEnv;

  constructor(env?: CloudflareEnv) {
    this.accountId = config.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = config.CLOUDFLARE_API_TOKEN || config.CLOUDFLARE_GLOBAL_KEY;
    this.useAIGateway = config.USE_AI_GATEWAY === 'true';
    this.aiGatewayUrl = `https://gateway.ai.cloudflare.com/v1/${this.accountId}/${config.AI_GATEWAY_ID || 'firewall-ai'}`;
    this.env = env;

    // Initialize Anthropic as fallback
    if (config.anthropic?.apiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.anthropic.apiKey
      });
    }
  }

  /**
   * Analyze rule conflicts with intelligent resolutions
   */
  async analyzeRuleConflictsWithResolutions(
    newRule: {
      filters: string[];
      action: string;
      name: string;
      traffic?: string;
    },
    existingRules: GatewayRule[]
  ): Promise<{
    conflicts: RuleConflict[];
    resolutions: Array<{
      type: 'modify_existing' | 'create_new' | 'merge_rules' | 'reorder' | 'skip';
      description: string;
      details: any;
      recommendation: 'recommended' | 'alternative' | 'not_recommended';
    }>;
  }> {
    const startTime = Date.now();
    
    try {
      // Try Cloudflare AI first if available
      if (this.useAIGateway || this.env?.AI) {
        console.log(chalk.cyan('🤖 Using Cloudflare AI for conflict analysis...'));
        
        const cfResult = await this.analyzeWithCloudflareAI(newRule, existingRules);
        if (cfResult) {
          await this.logAnalytics('conflict_analysis', {
            provider: 'cloudflare',
            duration: Date.now() - startTime,
            rulesAnalyzed: existingRules.length
          });
          return cfResult;
        }
      }

      // Fallback to Anthropic
      if (this.anthropicClient) {
        console.log(chalk.yellow('⚡ Falling back to Anthropic Claude...'));
        return await this.analyzeWithAnthropic(newRule, existingRules);
      }

      // If no AI available, use basic analysis
      return await this.basicConflictAnalysis(newRule, existingRules);
      
    } catch (error) {
      console.error(chalk.red('❌ Error in conflict analysis:'), error);
      return await this.basicConflictAnalysis(newRule, existingRules);
    }
  }

  /**
   * Analyze conflicts using Cloudflare AI
   */
  private async analyzeWithCloudflareAI(
    newRule: any,
    existingRules: GatewayRule[]
  ): Promise<any> {
    const prompt = this.buildConflictPrompt(newRule, existingRules);
    
    try {
      let response;
      
      if (this.env?.AI) {
        // Using Workers AI binding (in Worker context)
        response = await this.env.AI.run('@cf/meta/llama-3.2-11b-instruct', {
          messages: [
            {
              role: 'system',
              content: 'You are a Cloudflare Gateway expert. Analyze rule conflicts and provide JSON responses.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false,
          max_tokens: 2000,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        });
      } else {
        // Using AI Gateway API (CLI context)
        const apiResponse = await fetch(
          `${this.aiGatewayUrl}/workers-ai/@cf/meta/llama-3.2-11b-instruct`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: 'You are a Cloudflare Gateway expert. Analyze rule conflicts and provide JSON responses.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              max_tokens: 2000,
              temperature: 0.3
            })
          }
        );
        
        if (!apiResponse.ok) {
          throw new Error(`AI Gateway error: ${apiResponse.statusText}`);
        }
        
        const data = await apiResponse.json();
        response = data.result || data;
      }

      // Parse and validate response
      return this.parseAIResponse(response, existingRules);
      
    } catch (error) {
      console.error(chalk.yellow('Cloudflare AI error:'), error);
      return null;
    }
  }

  /**
   * Analyze conflicts using Anthropic Claude (fallback)
   */
  private async analyzeWithAnthropic(
    newRule: any,
    existingRules: GatewayRule[]
  ): Promise<any> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const prompt = this.buildConflictPrompt(newRule, existingRules);
    
    const response = await this.anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { conflicts: [], resolutions: [] };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { conflicts: [], resolutions: [] };
    }

    return this.parseAIResponse(jsonMatch[0], existingRules);
  }

  /**
   * Generate rule from natural language description
   */
  async generateRuleFromDescription(
    description: string,
    context: any = {}
  ): Promise<GatewayRule> {
    const startTime = Date.now();
    
    // First, check vector database for similar existing rules
    const similarRules = await this.findSimilarRules(description);
    
    if (similarRules.length > 0 && similarRules[0].score > 0.95) {
      console.log(chalk.green('✨ Found nearly identical existing rule'));
      return similarRules[0].rule;
    }

    try {
      let generatedRule;
      
      if (this.useAIGateway || this.env?.AI) {
        console.log(chalk.cyan('🤖 Generating rule with Cloudflare AI...'));
        generatedRule = await this.generateWithCloudflareAI(description, context, similarRules);
      }
      
      if (!generatedRule && this.anthropicClient) {
        console.log(chalk.yellow('⚡ Using Anthropic Claude for generation...'));
        generatedRule = await this.generateWithAnthropic(description, context, similarRules);
      }
      
      if (!generatedRule) {
        throw new Error('No AI provider available for rule generation');
      }

      // Store in vector database for future similarity searches
      await this.storeRuleEmbedding(generatedRule);
      
      // Log analytics
      await this.logAnalytics('rule_generation', {
        provider: generatedRule.ai_provider || 'unknown',
        duration: Date.now() - startTime,
        fromCache: false
      });
      
      return generatedRule;
      
    } catch (error) {
      console.error(chalk.red('❌ Error generating rule:'), error);
      throw error;
    }
  }

  /**
   * Find semantically similar rules using Vectorize
   */
  async findSimilarRules(description: string): Promise<any[]> {
    if (!this.env?.VECTORIZE) {
      return [];
    }

    try {
      // Generate embedding for the description
      const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: description
      });

      // Query vector database
      const results = await this.env.VECTORIZE.query({
        vector: embedding.data[0],
        topK: 5,
        includeMetadata: true,
        filter: { enabled: true }
      });

      return results.matches.map((match: any) => ({
        rule: match.metadata,
        score: match.score
      }));
      
    } catch (error) {
      console.error(chalk.yellow('Vector search failed:'), error);
      return [];
    }
  }

  /**
   * Store rule embedding in Vectorize
   */
  private async storeRuleEmbedding(rule: GatewayRule): Promise<void> {
    if (!this.env?.VECTORIZE || !this.env?.AI) {
      return;
    }

    try {
      const text = `${rule.name} ${rule.filters.join(' ')} ${rule.action}`;
      const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text
      });

      await this.env.VECTORIZE.upsert([{
        id: rule.id,
        values: embedding.data[0],
        metadata: {
          name: rule.name,
          action: rule.action,
          traffic: rule.traffic,
          filters: rule.filters,
          enabled: rule.enabled,
          precedence: rule.precedence
        }
      }]);
      
    } catch (error) {
      console.error(chalk.yellow('Failed to store embedding:'), error);
    }
  }

  /**
   * Optimize entire ruleset using AI
   */
  async optimizeRuleset(rules: GatewayRule[]): Promise<{
    recommendations: Array<{
      type: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      impact: string;
      implementation?: any;
    }>;
    optimizedRules?: GatewayRule[];
  }> {
    console.log(chalk.cyan('🔧 Analyzing ruleset for optimization...'));
    
    // Check cache first
    const cacheKey = `optimize:${this.hashRules(rules)}`;
    const cached = await this.getCached(cacheKey);
    if (cached) {
      console.log(chalk.green('✨ Using cached optimization results'));
      return cached;
    }

    const analysis = await this.analyzeRulesetWithAI(rules);
    
    // Cache the results
    await this.setCached(cacheKey, analysis, 7200); // 2 hours
    
    // Store in D1 for historical tracking
    await this.storeOptimizationHistory(rules, analysis);
    
    return analysis;
  }

  /**
   * Analyze ruleset with AI
   */
  private async analyzeRulesetWithAI(rules: GatewayRule[]): Promise<any> {
    // First, do a basic analysis to identify obvious issues
    const basicAnalysis = this.performBasicRulesetAnalysis(rules);
    
    if (basicAnalysis.recommendations.length > 0) {
      return basicAnalysis;
    }

    const prompt = `Analyze this Cloudflare Gateway ruleset and provide optimization recommendations:

${JSON.stringify(rules, null, 2)}

Provide recommendations for:
1. Redundant rules that can be removed or combined
2. Conflicting rules that need resolution
3. Performance improvements
4. Security gaps

Format your response as a numbered list of specific recommendations.`;

    try {
      let response;
      
      if (this.env?.AI) {
        const aiResponse = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [{
            role: 'user',
            content: prompt
          }],
          max_tokens: 1500
        });
        response = aiResponse.response || aiResponse;
      } else if (this.anthropicClient) {
        const anthropicResponse = await this.anthropicClient.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 3000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        });
        
        response = anthropicResponse.content[0].type === 'text' 
          ? anthropicResponse.content[0].text 
          : '';
      } else {
        // Return basic analysis if no AI available
        return this.performBasicRulesetAnalysis(rules);
      }

      const parsed = this.parseOptimizationResponse(response);
      
      // If AI didn't provide good recommendations, use basic analysis
      if (!parsed.recommendations || parsed.recommendations.length === 0) {
        return this.performBasicRulesetAnalysis(rules);
      }
      
      return parsed;
      
    } catch (error) {
      console.error(chalk.red('AI analysis failed:'), error);
      // Fallback to basic analysis
      return this.performBasicRulesetAnalysis(rules);
    }
  }

  /**
   * Perform basic ruleset analysis without AI
   */
  private performBasicRulesetAnalysis(rules: GatewayRule[]): any {
    const recommendations: any[] = [];
    const rulesByFilter = new Map<string, GatewayRule[]>();
    const rulesByAction = new Map<string, GatewayRule[]>();
    
    // Group rules by filters and actions
    rules.forEach(rule => {
      rule.filters.forEach(filter => {
        const key = `${filter}:${rule.action}`;
        if (!rulesByFilter.has(key)) {
          rulesByFilter.set(key, []);
        }
        rulesByFilter.get(key)!.push(rule);
      });
      
      const actionKey = rule.action;
      if (!rulesByAction.has(actionKey)) {
        rulesByAction.set(actionKey, []);
      }
      rulesByAction.get(actionKey)!.push(rule);
    });
    
    // Check for duplicate rules
    rulesByFilter.forEach((rulesWithSameFilter, filterKey) => {
      if (rulesWithSameFilter.length > 1) {
        const [filter, action] = filterKey.split(':');
        recommendations.push({
          type: 'consolidation',
          description: `Found ${rulesWithSameFilter.length} rules with duplicate filter "${filter}" and action "${action}". Consider removing duplicates: ${rulesWithSameFilter.map(r => r.name).join(', ')}`,
          priority: 'high',
          impact: 'Reduces rule count and improves performance',
          implementation: {
            remove: rulesWithSameFilter.slice(1).map(r => r.id),
            keep: rulesWithSameFilter[0].id
          }
        });
      }
    });
    
    // Check for rules that could be combined
    const blockRules = rulesByAction.get('block') || [];
    const allowRules = rulesByAction.get('allow') || [];
    
    // Check for overlapping rules
    rules.forEach((rule1, i) => {
      rules.slice(i + 1).forEach(rule2 => {
        const overlap = rule1.filters.filter(f => rule2.filters.includes(f));
        if (overlap.length > 0 && rule1.action === rule2.action) {
          recommendations.push({
            type: 'consolidation',
            description: `Rules "${rule1.name}" and "${rule2.name}" have overlapping filters (${overlap.join(', ')}). Consider combining them.`,
            priority: 'medium',
            impact: 'Simplifies ruleset management',
            implementation: {
              merge: [rule1.id, rule2.id],
              newFilters: [...new Set([...rule1.filters, ...rule2.filters])]
            }
          });
        }
      });
    });
    
    // Check for conflicting rules (same filter, different actions)
    const conflicts = new Map<string, {block: GatewayRule[], allow: GatewayRule[]}>();
    
    rules.forEach(rule => {
      rule.filters.forEach(filter => {
        if (!conflicts.has(filter)) {
          conflicts.set(filter, {block: [], allow: []});
        }
        if (rule.action === 'block') {
          conflicts.get(filter)!.block.push(rule);
        } else if (rule.action === 'allow') {
          conflicts.get(filter)!.allow.push(rule);
        }
      });
    });
    
    conflicts.forEach((conflictingRules, filter) => {
      if (conflictingRules.block.length > 0 && conflictingRules.allow.length > 0) {
        recommendations.push({
          type: 'conflict_resolution',
          description: `Conflicting rules for filter "${filter}": Block rules (${conflictingRules.block.map(r => r.name).join(', ')}) vs Allow rules (${conflictingRules.allow.map(r => r.name).join(', ')}). Check precedence order.`,
          priority: 'high',
          impact: 'Resolves potential security issues',
          implementation: {
            reorder: true,
            conflictingFilter: filter
          }
        });
      }
    });
    
    // Performance recommendations
    if (rules.length > 50) {
      recommendations.push({
        type: 'performance',
        description: `You have ${rules.length} rules. Consider consolidating similar rules to improve performance.`,
        priority: 'medium',
        impact: 'Improves rule processing speed'
      });
    }
    
    return { recommendations };
  }

  /**
   * Cache operations using KV or in-memory
   */
  private async getCached(key: string): Promise<any> {
    if (this.env?.CACHE) {
      const cached = await this.env.CACHE.get(key, 'json');
      return cached;
    }
    return null;
  }

  private async setCached(key: string, value: any, ttl: number = 3600): Promise<void> {
    if (this.env?.CACHE) {
      await this.env.CACHE.put(key, JSON.stringify(value), {
        expirationTtl: ttl
      });
    }
  }

  /**
   * Store optimization history in D1
   */
  private async storeOptimizationHistory(
    rules: GatewayRule[],
    analysis: any
  ): Promise<void> {
    if (!this.env?.DB) {
      return;
    }

    try {
      await this.env.DB.prepare(`
        INSERT INTO optimization_history (
          timestamp,
          rules_count,
          recommendations_count,
          analysis,
          rules_snapshot
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        new Date().toISOString(),
        rules.length,
        analysis.recommendations?.length || 0,
        JSON.stringify(analysis),
        JSON.stringify(rules)
      ).run();
    } catch (error) {
      console.error(chalk.yellow('Failed to store optimization history:'), error);
    }
  }

  /**
   * Log analytics events
   */
  private async logAnalytics(event: string, data: any): Promise<void> {
    if (!this.env?.ANALYTICS) {
      return;
    }

    try {
      this.env.ANALYTICS.writeDataPoint({
        blobs: [event],
        doubles: [data.duration || 0],
        indexes: [data.provider || 'unknown']
      });
    } catch (error) {
      console.error(chalk.yellow('Failed to log analytics:'), error);
    }
  }

  /**
   * Helper methods
   */
  private buildConflictPrompt(newRule: any, existingRules: GatewayRule[]): string {
    return `Analyze conflicts between this new Cloudflare Gateway rule and existing rules.

NEW RULE:
${JSON.stringify(newRule, null, 2)}

EXISTING RULES:
${existingRules.map(r => JSON.stringify(r, null, 2)).join('\n---\n')}

Provide a JSON response with:
{
  "conflicts": [
    {
      "conflictingRuleId": "rule-id",
      "reason": "explanation",
      "severity": "high|medium|low",
      "suggestion": "resolution"
    }
  ],
  "resolutions": [
    {
      "type": "modify_existing|create_new|merge_rules|reorder|skip",
      "description": "what to do",
      "details": {},
      "recommendation": "recommended|alternative|not_recommended"
    }
  ]
}`;
  }

  private parseAIResponse(response: any, existingRules: GatewayRule[]): any {
    try {
      let parsed;
      
      if (typeof response === 'string') {
        // Clean up JSON string
        const jsonStr = response.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        parsed = JSON.parse(jsonStr);
      } else if (response.response) {
        // Cloudflare AI format
        parsed = typeof response.response === 'string' 
          ? JSON.parse(response.response) 
          : response.response;
      } else {
        parsed = response;
      }

      // Map conflicts to include rule objects
      const conflicts = (parsed.conflicts || []).map((conflict: any) => {
        const conflictingRule = existingRules.find(r => r.id === conflict.conflictingRuleId);
        if (!conflictingRule) return null;

        return {
          conflictingRule,
          reason: conflict.reason,
          severity: conflict.severity,
          suggestion: conflict.suggestion
        };
      }).filter(Boolean);

      return {
        conflicts,
        resolutions: parsed.resolutions || []
      };
      
    } catch (error) {
      console.error(chalk.yellow('Failed to parse AI response:'), error);
      return { conflicts: [], resolutions: [] };
    }
  }

  private parseOptimizationResponse(response: any): any {
    // Implementation similar to existing parseOptimizationResponse
    // but adapted for both Cloudflare and Anthropic responses
    const text = typeof response === 'string' ? response : response.response || '';
    const sections = text.split(/\d+\.\s+/);
    const recommendations: any[] = [];

    sections.forEach((section: string) => {
      if (section.trim()) {
        recommendations.push({
          type: this.detectRecommendationType(section),
          description: section.trim(),
          priority: this.detectPriority(section),
          impact: this.detectImpact(section)
        });
      }
    });

    return { recommendations };
  }

  private detectRecommendationType(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('redundant') || lower.includes('combine')) return 'consolidation';
    if (lower.includes('conflict')) return 'conflict_resolution';
    if (lower.includes('performance') || lower.includes('precedence')) return 'performance';
    if (lower.includes('security') || lower.includes('gap')) return 'security';
    if (lower.includes('simplif')) return 'simplification';
    return 'general';
  }

  private detectPriority(text: string): 'high' | 'medium' | 'low' {
    const lower = text.toLowerCase();
    if (lower.includes('critical') || lower.includes('urgent')) return 'high';
    if (lower.includes('important') || lower.includes('should')) return 'medium';
    return 'low';
  }

  private detectImpact(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('significant') || lower.includes('major')) return 'High impact on security and performance';
    if (lower.includes('moderate')) return 'Moderate improvement expected';
    return 'Minor optimization';
  }

  private hashRules(rules: GatewayRule[]): string {
    const str = JSON.stringify(rules.map(r => ({ 
      id: r.id, 
      filters: r.filters, 
      action: r.action 
    })));
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private async generateWithCloudflareAI(
    description: string,
    context: any,
    similarRules: any[]
  ): Promise<any> {
    const prompt = `Generate a Cloudflare Gateway DNS filtering rule in JSON format.

Description: "${description}"

Return a JSON object with these required fields:
- id: unique identifier string (e.g., "rule-" + timestamp)
- name: descriptive name for the rule
- filters: array of domain patterns to match (e.g., ["gambling.com", "*.casino.com"])
- action: "block" or "allow"
- traffic: "dns" (always)
- enabled: true
- precedence: number (e.g., 100)

Example response:
{
  "id": "rule-123",
  "name": "Block Gambling Sites",
  "filters": ["*.gambling.com", "casino.com", "*.bet365.com"],
  "action": "block",
  "traffic": "dns",
  "enabled": true,
  "precedence": 100
}`;

    try {
      let response;
      
      if (this.env?.AI) {
        // Use Cloudflare Workers AI
        const aiResponse = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [{ 
            role: 'user', 
            content: prompt 
          }],
          max_tokens: 500
        });
        response = aiResponse.response || aiResponse;
      } else if (this.aiGatewayUrl && this.apiToken) {
        // Fallback to AI Gateway API
        const apiResponse = await fetch(
          `${this.aiGatewayUrl}/workers-ai/@cf/meta/llama-3-8b-instruct`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 500
            })
          }
        );
        
        if (!apiResponse.ok) {
          throw new Error(`AI Gateway error: ${apiResponse.statusText}`);
        }
        
        const data = await apiResponse.json();
        response = data.result?.response || data.response || data;
      } else {
        throw new Error('No AI provider available');
      }

      // Parse the response to extract JSON
      let rule;
      const responseText = typeof response === 'string' ? response : JSON.stringify(response);
      
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          rule = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // If parsing fails, create a basic rule from the description
          rule = this.createBasicRule(description);
        }
      } else {
        // Fallback to basic rule creation
        rule = this.createBasicRule(description);
      }
      
      // Ensure all required fields
      rule.id = rule.id || `rule-${Date.now()}`;
      rule.traffic = 'dns';
      rule.enabled = rule.enabled !== false;
      rule.precedence = rule.precedence || 100;
      rule.ai_provider = 'cloudflare';
      
      return rule;
      
    } catch (error) {
      console.error(chalk.yellow('Cloudflare AI generation failed:'), error);
      return null;
    }
  }

  private createBasicRule(description: string): any {
    const lower = description.toLowerCase();
    const rule: any = {
      id: `rule-${Date.now()}`,
      name: description.slice(0, 50),
      filters: [],
      action: 'block',
      traffic: 'dns',
      enabled: true,
      precedence: 100
    };

    // Extract common patterns
    if (lower.includes('gambling') || lower.includes('casino')) {
      rule.name = 'Block Gambling Sites';
      rule.filters = ['*.gambling.com', '*.casino.com', '*.bet365.com', '*.pokerstars.com'];
    } else if (lower.includes('social media') || lower.includes('facebook')) {
      rule.name = 'Block Social Media';
      rule.filters = ['facebook.com', '*.facebook.com', 'instagram.com', '*.instagram.com'];
    } else if (lower.includes('adult') || lower.includes('porn')) {
      rule.name = 'Block Adult Content';
      rule.filters = ['*.xxx', '*.porn', '*.adult'];
    } else if (lower.includes('malware') || lower.includes('phishing')) {
      rule.name = 'Block Malware/Phishing';
      rule.filters = ['*.malware.com', '*.phishing.com'];
    }

    // Detect action
    if (lower.includes('allow') || lower.includes('permit')) {
      rule.action = 'allow';
    }

    return rule;
  }

  private async generateWithAnthropic(
    description: string,
    context: any,
    similarRules: any[]
  ): Promise<any> {
    if (!this.anthropicClient) return null;

    const prompt = `Generate a Cloudflare Gateway rule from: "${description}"
    
Context: ${JSON.stringify(context)}
Similar rules: ${JSON.stringify(similarRules.slice(0, 3))}

Return a valid JSON rule object with all required fields.`;

    const response = await this.anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') return null;

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const rule = JSON.parse(jsonMatch[0]);
    rule.ai_provider = 'anthropic';
    return rule;
  }

  private async basicConflictAnalysis(
    newRule: any,
    existingRules: GatewayRule[]
  ): Promise<any> {
    const conflicts: any[] = [];
    const resolutions: any[] = [];

    existingRules.forEach(existingRule => {
      // Check for exact duplicates
      if (JSON.stringify(existingRule.filters) === JSON.stringify(newRule.filters)) {
        conflicts.push({
          conflictingRule: existingRule,
          reason: 'Duplicate rule with identical filters',
          severity: 'high',
          suggestion: 'Remove duplicate or merge rules'
        });
        
        resolutions.push({
          type: 'skip',
          description: 'Skip creating duplicate rule',
          details: { existingRuleId: existingRule.id },
          recommendation: 'recommended'
        });
      }
    });

    return { conflicts, resolutions };
  }
}

export default GatewayAIAssistantV2;
