/**
 * Gateway AI Assistant v2 - Worker Environment Compatible Version
 *
 * This implementation uses Cloudflare's AI services as primary provider
 * with built-in basic analysis as fallback.
 */
export class GatewayAIAssistantV2 {
    constructor(env) {
        this.env = env;
    }
    /**
     * Generate rule from natural language description
     */
    async generateRuleFromDescription(description, context = {}) {
        const startTime = Date.now();
        try {
            let generatedRule;
            if (this.env?.AI) {
                generatedRule = await this.generateWithCloudflareAI(description, context);
            }
            if (!generatedRule) {
                // Fallback to basic rule creation
                generatedRule = this.createBasicRule(description);
            }
            // Log analytics
            if (this.env?.ANALYTICS) {
                this.env.ANALYTICS.writeDataPoint({
                    blobs: ['rule_generation'],
                    doubles: [Date.now() - startTime]
                });
            }
            return generatedRule;
        }
        catch (error) {
            console.error('Error generating rule:', error);
            // Return a basic rule as fallback
            return this.createBasicRule(description);
        }
    }
    /**
     * Analyze rule conflicts with intelligent resolutions
     */
    async analyzeRuleConflictsWithResolutions(newRule, existingRules) {
        // Use basic analysis for now
        return this.basicConflictAnalysis(newRule, existingRules);
    }
    /**
     * Optimize entire ruleset
     */
    async optimizeRuleset(rules) {
        return this.performBasicRulesetAnalysis(rules);
    }
    /**
     * Generate rule using Cloudflare AI
     */
    async generateWithCloudflareAI(description, context) {
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
            const aiResponse = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{
                        role: 'user',
                        content: prompt
                    }],
                max_tokens: 500
            });
            const response = aiResponse.response || aiResponse;
            // Parse the response to extract JSON
            let rule;
            const responseText = typeof response === 'string' ? response : JSON.stringify(response);
            // Try to extract JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    rule = JSON.parse(jsonMatch[0]);
                }
                catch (e) {
                    // If parsing fails, create a basic rule from the description
                    rule = this.createBasicRule(description);
                }
            }
            else {
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
        }
        catch (error) {
            console.error('Cloudflare AI generation failed:', error);
            return null;
        }
    }
    /**
     * Create basic rule without AI
     */
    createBasicRule(description) {
        const lower = description.toLowerCase();
        const rule = {
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
        }
        else if (lower.includes('social media') || lower.includes('facebook')) {
            rule.name = 'Block Social Media';
            rule.filters = ['facebook.com', '*.facebook.com', 'instagram.com', '*.instagram.com'];
        }
        else if (lower.includes('adult') || lower.includes('porn')) {
            rule.name = 'Block Adult Content';
            rule.filters = ['*.xxx', '*.porn', '*.adult'];
        }
        else if (lower.includes('malware') || lower.includes('phishing')) {
            rule.name = 'Block Malware/Phishing';
            rule.filters = ['*.malware.com', '*.phishing.com'];
        }
        else if (lower.includes('youtube')) {
            rule.name = 'Block YouTube';
            rule.filters = ['youtube.com', '*.youtube.com', 'youtu.be'];
        }
        else if (lower.includes('tiktok')) {
            rule.name = 'Block TikTok';
            rule.filters = ['tiktok.com', '*.tiktok.com'];
        }
        // Detect action
        if (lower.includes('allow') || lower.includes('permit')) {
            rule.action = 'allow';
            rule.name = rule.name.replace('Block', 'Allow');
        }
        return rule;
    }
    /**
     * Perform basic conflict analysis
     */
    basicConflictAnalysis(newRule, existingRules) {
        const conflicts = [];
        const resolutions = [];
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
    /**
     * Perform basic ruleset analysis without AI
     */
    performBasicRulesetAnalysis(rules) {
        const recommendations = [];
        const rulesByFilter = new Map();
        const rulesByAction = new Map();
        // Group rules by filters and actions
        rules.forEach(rule => {
            if (rule.filters && Array.isArray(rule.filters)) {
                rule.filters.forEach(filter => {
                    const key = `${filter}:${rule.action}`;
                    if (!rulesByFilter.has(key)) {
                        rulesByFilter.set(key, []);
                    }
                    rulesByFilter.get(key).push(rule);
                });
            }
            const actionKey = rule.action || 'unknown';
            if (!rulesByAction.has(actionKey)) {
                rulesByAction.set(actionKey, []);
            }
            rulesByAction.get(actionKey).push(rule);
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
        // Check for overlapping rules
        const seenCombos = new Set();
        rules.forEach((rule1, i) => {
            rules.slice(i + 1).forEach(rule2 => {
                const comboKey = [rule1.id, rule2.id].sort().join(':');
                if (!seenCombos.has(comboKey) && rule1.filters && rule2.filters) {
                    seenCombos.add(comboKey);
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
                }
            });
        });
        // Check for conflicting rules (same filter, different actions)
        const conflicts = new Map();
        rules.forEach(rule => {
            if (rule.filters && Array.isArray(rule.filters)) {
                rule.filters.forEach(filter => {
                    if (!conflicts.has(filter)) {
                        conflicts.set(filter, { block: [], allow: [] });
                    }
                    if (rule.action === 'block') {
                        conflicts.get(filter).block.push(rule);
                    }
                    else if (rule.action === 'allow') {
                        conflicts.get(filter).allow.push(rule);
                    }
                });
            }
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
}
export default GatewayAIAssistantV2;
