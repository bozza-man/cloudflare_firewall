import Anthropic from '@anthropic-ai/sdk';
import { config } from '../utils/config.js';
import type { GatewayRule, RuleConflict } from '../types/gateway.js';

export class GatewayAIAssistant {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey
    });
  }

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
      details: {
        ruleId?: string;
        ruleName?: string;
        suggestedFilters?: string[];
        suggestedAction?: string;
        suggestedPrecedence?: number;
        filtersToRemove?: string[];
        filtersToAdd?: string[];
      };
      recommendation: 'recommended' | 'alternative' | 'not_recommended';
    }>;
  }> {
    const prompt = `You are a Cloudflare Zero Trust Gateway expert. Analyze this new rule for conflicts and provide resolution options.

New Rule:
- Name: ${newRule.name}
- Traffic Type: ${newRule.traffic || 'http'}
- Filters: ${JSON.stringify(newRule.filters, null, 2)}
- Action: ${newRule.action}

Existing Rules (ordered by precedence):
${existingRules.map((rule, index) => `
Rule ${index + 1}:
- Name: ${rule.name}
- ID: ${rule.id}
- Precedence: ${rule.precedence}
- Traffic Type: ${rule.traffic}
- Filters: ${JSON.stringify(rule.filters, null, 2)}
- Action: ${rule.action}
- Enabled: ${rule.enabled}
`).join('\n')}

Analyze for conflicts and provide resolution options. Pay special attention to:

**LOGICAL CONTRADICTIONS** - Look for patterns like:
- Allow rules that contradict existing block rules for same domains
- Block rules that contradict existing allow rules for same domains  
- Redundant rules that duplicate existing functionality
- Rules that create conflicting precedence chains

For each conflict, suggest multiple ways to resolve it, including:
1. Modifying existing rules (e.g., removing specific domains from a block list)
2. Creating the new rule with adjustments
3. Merging rules
4. Reordering rules
5. Skipping the new rule if redundant
6. **Disabling conflicting existing rules** when the new rule provides better coverage

Respond with JSON containing:
- conflicts: array of conflicts (same format as before)
- resolutions: array of resolution options with type, description, details, and recommendation level`;

    try {
      const response = await this.client.messages.create({
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

      // Clean up JSON string to handle control characters
      let jsonStr = jsonMatch[0];
      // Remove control characters that might break JSON parsing
      // eslint-disable-next-line no-control-regex
      jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      
      const result = JSON.parse(jsonStr);
      
      // Map conflicts to include the rule objects
      const conflicts = (result.conflicts || []).map((conflict: {
        conflictingRuleId: string;
        reason: string;
        severity: 'high' | 'medium' | 'low';
        suggestion: string;
      }) => {
        const conflictingRule = existingRules.find(r => r.id === conflict.conflictingRuleId);
        if (!conflictingRule) return null;

        return {
          conflictingRule,
          reason: conflict.reason,
          severity: conflict.severity,
          suggestion: conflict.suggestion
        };
      }).filter(Boolean) as RuleConflict[];

      return {
        conflicts,
        resolutions: result.resolutions || []
      };
    } catch (error) {
      console.error('Error analyzing rule conflicts:', error);
      return { conflicts: [], resolutions: [] };
    }
  }

  async analyzeRuleConflicts(
    newRule: { 
      filters: string[]; 
      action: string; 
      name: string; 
      traffic?: string;
    },
    existingRules: GatewayRule[]
  ): Promise<RuleConflict[]> {
    const prompt = `You are a Cloudflare Zero Trust Gateway expert. Analyze the following new Gateway rule for potential conflicts with existing rules.

New Rule:
- Name: ${newRule.name}
- Traffic Type: ${newRule.traffic || 'http'}
- Filters: ${JSON.stringify(newRule.filters, null, 2)}
- Action: ${newRule.action}

Existing Rules (ordered by precedence):
${existingRules.map((rule, index) => `
Rule ${index + 1}:
- Name: ${rule.name}
- ID: ${rule.id}
- Precedence: ${rule.precedence}
- Traffic Type: ${rule.traffic}
- Filters: ${JSON.stringify(rule.filters, null, 2)}
- Action: ${rule.action}
- Enabled: ${rule.enabled}
`).join('\n')}

Analyze for:
1. Filter conflicts (overlapping or contradictory conditions)
2. Action conflicts (contradictory actions for similar traffic)
3. Precedence issues (rules that might never be reached)
4. Redundancy (duplicate or unnecessary rules)
5. Security gaps (missing coverage or bypasses)

Gateway rules are evaluated in precedence order (lower numbers first).

Respond with a JSON array of conflicts. Each conflict should have:
- conflictingRuleId: the ID of the conflicting rule
- reason: detailed explanation of the conflict
- severity: "high", "medium", or "low"
- suggestion: how to resolve the conflict

If there are no conflicts, return an empty array.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const conflicts = JSON.parse(jsonMatch[0]);
      
      return conflicts.map((conflict: {
        conflictingRuleId: string;
        reason: string;
        severity: 'high' | 'medium' | 'low';
        suggestion: string;
      }) => {
        const conflictingRule = existingRules.find(r => r.id === conflict.conflictingRuleId);
        if (!conflictingRule) return null;

        return {
          conflictingRule,
          reason: conflict.reason,
          severity: conflict.severity,
          suggestion: conflict.suggestion
        };
      }).filter(Boolean) as RuleConflict[];
    } catch (error) {
      console.error('Error analyzing rule conflicts:', error);
      return [];
    }
  }

  async suggestRulePrecedence(
    newRule: { 
      filters: Array<{ 
        expression: string; 
        value: string | string[] | number[];
      }>; 
      action: string; 
      name: string;
      traffic?: string;
    },
    existingRules: GatewayRule[]
  ): Promise<{ precedence: number; reasoning: string }> {
    const prompt = `You are a Cloudflare Zero Trust Gateway expert. Determine the optimal precedence for a new Gateway rule using best-practice hierarchy.

IMPORTANT PRECEDENCE HIERARCHY (lower numbers = higher priority):

**System Services (900-999):**
- NTP, DNS infrastructure, time services
- Critical system updates, package management

**Security Bypasses (998-999):**
- TLS bypass rules for essential authentication (Apple ID, banking)
- Identity service bypasses (very specific hostnames only)

**Security Blocks (1000-1099):**
- Malware, phishing, C&C, botnet categories
- High-risk country geo-blocking
- Unknown/uncategorized DNS blocking

**Infrastructure & Monitoring (1100-1199):**
- SSH, RDP, network protocol monitoring
- Core infrastructure services (Apple, enterprise tools)
- Network equipment management (UniFi, etc.)

**Business Critical Services (1200-1299):**
- Development tools (GitHub, Docker registries)
- Cloud providers (AWS, Azure, Google Cloud)
- Essential communication (email, Slack, Teams)

**General Services (1300-1399):**
- Social media, streaming, entertainment
- CDNs, general content delivery
- Financial services (PayPal, Stripe)

**Catch-All Rules (1400+):**
- Default deny, audit logging, broad categories

New Rule:
- Name: ${newRule.name}
- Traffic Type: ${newRule.traffic || 'http'}
- Filters: ${JSON.stringify(newRule.filters, null, 2)}
- Action: ${newRule.action}

Existing Rules (ordered by current precedence):
${existingRules.map((rule, index) => `
Position ${index + 1} (Precedence: ${rule.precedence}):
- Name: ${rule.name}
- Traffic Type: ${rule.traffic}
- Action: ${rule.action}
`).join('\n')}

Analyze the new rule and:
1. Categorize it within the hierarchy above
2. Find the appropriate precedence range
3. Position it correctly relative to existing rules
4. Leave gaps (10-50 points) for future insertions
5. Avoid conflicts with existing precedence values

Respond ONLY with valid JSON in this exact format:
{
  "precedence": number,
  "reasoning": "string without line breaks or special characters"
}

IMPORTANT: Ensure the reasoning field is a single line string without any newlines, tabs, or special control characters.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        const maxPrecedence = existingRules.length > 0 
          ? Math.max(...existingRules.map(r => r.precedence)) 
          : 0;
        return { 
          precedence: maxPrecedence + 1000, 
          reasoning: 'Unable to analyze precedence' 
        };
      }

      // Clean the response text to remove any potential control characters
      let cleanedText = content.text;
      
      // Remove any non-printable characters except spaces, tabs, and newlines for initial parsing
      cleanedText = cleanedText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // Try to extract JSON using a more robust regex
      const jsonMatch = cleanedText.match(/{[^{}]*(?:{[^{}]*}[^{}]*)*}/);
      
      if (!jsonMatch) {
        const maxPrecedence = existingRules.length > 0 
          ? Math.max(...existingRules.map(r => r.precedence)) 
          : 0;
        return { 
          precedence: maxPrecedence + 1000, 
          reasoning: 'Unable to parse response' 
        };
      }

      try {
        // Further clean the matched JSON string
        let jsonString = jsonMatch[0];
        
        // Replace any remaining newlines, tabs, and carriage returns within string values
        // This regex matches strings and replaces control characters within them
        jsonString = jsonString.replace(/"([^"]*)"/g, (match, p1) => {
          const cleaned = p1
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return `"${cleaned}"`;
        });
        
        return JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        console.error('JSON string:', jsonString);
        const maxPrecedence = existingRules.length > 0 
          ? Math.max(...existingRules.map(r => r.precedence)) 
          : 0;
        return { 
          precedence: maxPrecedence + 1000, 
          reasoning: 'Error parsing JSON response' 
        };
      }
    } catch (error) {
      console.error('Error suggesting rule precedence:', error);
      const maxPrecedence = existingRules.length > 0 
        ? Math.max(...existingRules.map(r => r.precedence)) 
        : 0;
      return { 
        precedence: maxPrecedence + 1000, 
        reasoning: 'Error occurred during analysis' 
      };
    }
  }

  async explainRule(rule: GatewayRule): Promise<string> {
    const prompt = `Explain this Cloudflare Zero Trust Gateway rule in simple terms:

Name: ${rule.name}
Traffic Type: ${rule.traffic}
Filters: ${JSON.stringify(rule.filters, null, 2)}
Action: ${rule.action}
Enabled: ${rule.enabled}
Precedence: ${rule.precedence}
${rule.rule_settings ? `Settings: ${JSON.stringify(rule.rule_settings, null, 2)}` : ''}

Provide a clear, concise explanation of:
1. What traffic this rule matches
2. What happens to matched traffic
3. Common use cases for this type of rule
4. Any special settings or considerations`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : 'Unable to explain rule';
    } catch (error) {
      console.error('Error explaining rule:', error);
      return 'Error occurred while explaining rule';
    }
  }

  async generateRuleFilters(description: string): Promise<{ 
    filters: string[]; 
    explanation: string;
    traffic: string;
  }> {
    const prompt = `Generate Cloudflare Zero Trust Gateway rule filters based on this description:

"${description}"

Gateway supports these filter types (IMPORTANT: Each rule can only use ONE traffic type):
- DNS: dns.fqdn, dns.content_category, dns.security_category
- HTTP: http.request.host, http.request.uri.path, http.request.uri.query
- L4: net.src.geo.country, net.dst.port, net.dst.ip

Correct filter syntax examples:
- Block specific domain (DNS): dns.fqdn == "snapchat.com"
- Allow multiple domains (DNS): dns.fqdn in {"snapchat.com" "snap.com" "sc-cdn.net"}
- Block social media category (DNS): any(dns.content_category[*] in {23}) 
- Block malware category (DNS): any(dns.security_category[*] in {80})
- Match subdomain pattern (DNS): dns.fqdn matches "^.*\\.snapchat\\.com$"
- HTTP host matching (HTTP): http.request.host == "example.com"
- HTTP subdomain matching (HTTP): http.request.host matches "^.*\\.snapchat\\.com$"
- Block by country (L4): net.src.geo.country in {"CN" "RU"}

IMPORTANT: For \`in\` operators, use SPACES between quoted domains, NOT commas! Example: {"domain1.com" "domain2.com"} not {"domain1.com", "domain2.com"}

IMPORTANT: Never mix DNS, HTTP, and L4 filters in the same rule. Choose the most appropriate single traffic type.

Respond ONLY with valid JSON in this exact format:
{
  "filters": ["filter expression 1", "filter expression 2"],
  "explanation": "description of what these filters match",
  "traffic": "http" | "dns" | "l4"
}

Do not include any text before or after the JSON object.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { 
          filters: [], 
          explanation: 'Unable to generate filters',
          traffic: 'http' 
        };
      }

      // Try to extract JSON from the response
      let jsonStr = '';
      
      // First, try to find JSON block wrapped in ```json
      const jsonBlockMatch = content.text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        jsonStr = jsonBlockMatch[1].trim();
      } else {
        // Fallback to finding complete JSON object (greedy match)
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }
      
      // If no match, try to extract JSON from start/end of response
      if (!jsonStr) {
        const trimmed = content.text.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          jsonStr = trimmed;
        } else if (trimmed.includes('{') && trimmed.includes('}')) {
          // Find first { and last }
          const start = trimmed.indexOf('{');
          const end = trimmed.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            jsonStr = trimmed.substring(start, end + 1);
          }
        }
      }
      
      if (!jsonStr) {
        console.error('No JSON found in response:', content.text);
        return { 
          filters: [], 
          explanation: 'Unable to parse response - no JSON found',
          traffic: 'http' 
        };
      }

      try {
        const parsed = JSON.parse(jsonStr);
        return {
          filters: parsed.filters || [],
          explanation: parsed.explanation || 'Generated filters',
          traffic: parsed.traffic || 'http'
        };
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('JSON string:', jsonStr);
        console.error('Full response:', content.text);
        return { 
          filters: [], 
          explanation: 'JSON parsing failed',
          traffic: 'http' 
        };
      }
    } catch (error) {
      console.error('Error generating filters:', error);
      return { 
        filters: [], 
        explanation: 'Error occurred during generation',
        traffic: 'http' 
      };
    }
  }

  async analyzeAndOptimizeRuleset(rules: GatewayRule[]): Promise<{
    summary: string;
    criticalIssues: string[];
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      action: string;
      reason: string;
      affectedRules: string[];
    }>;
    optimizedRuleset: Array<{
      rule: GatewayRule;
      changes: string[];
      newPrecedence?: number;
    }>;
  }> {
    const prompt = `You are a Cloudflare Zero Trust Gateway expert. Analyze this complete ruleset and provide optimization recommendations.

Current Rules (in precedence order):
${rules.map((rule, index) => `
Rule ${index + 1}:
- Name: ${rule.name}
- ID: ${rule.id}
- Precedence: ${rule.precedence}
- Traffic Type: ${rule.traffic}
- Filters: ${JSON.stringify(rule.filters, null, 2)}
- Action: ${rule.action}
- Enabled: ${rule.enabled}
- Description: ${rule.description || 'None'}
`).join('\n')}

Analyze for:
1. Conflicts and contradictions
2. Performance bottlenecks
3. Security gaps
4. Redundancies
5. Ordering issues
6. Best practice violations

Provide:
1. A summary of the overall ruleset health
2. Critical issues that need immediate attention
3. Specific recommendations with priority levels
4. An optimized ruleset with suggested changes

Respond with JSON containing:
- summary: overall assessment
- criticalIssues: array of critical problems
- recommendations: array of recommended actions with priority, action, reason, and affected rule IDs
- optimizedRuleset: array of rules with suggested changes and new precedence values`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return {
          summary: 'Unable to analyze ruleset',
          criticalIssues: [],
          recommendations: [],
          optimizedRuleset: []
        };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          summary: 'Unable to parse analysis',
          criticalIssues: [],
          recommendations: [],
          optimizedRuleset: []
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error analyzing ruleset:', error);
      return {
        summary: 'Error occurred during analysis',
        criticalIssues: [],
        recommendations: [],
        optimizedRuleset: []
      };
    }
  }

  async validateAndOptimizeFilters(filters: string[]): Promise<{ 
    valid: boolean;
    optimized: string[];
    issues: string[];
    suggestions: string[];
  }> {
    const prompt = `Validate these Cloudflare Zero Trust Gateway filters for syntax correctness:

${JSON.stringify(filters, null, 2)}

IMPORTANT: Keep filters EXACTLY as provided unless there are clear syntax errors. Do NOT combine different filter types.

Cloudflare Gateway filter syntax rules:
- dns.fqdn in {"domain1.com" "domain2.com"} - for exact domain matching (use SPACES, not commas between domains)
- dns.fqdn matches "^.*\\.domain\\.com$" - for subdomain pattern matching with regex
- NEVER mix wildcards with the 'in' operator
- NEVER combine 'in' and 'matches' expressions into one filter
- Each filter expression must be syntactically valid on its own
- For 'in' operators: use SPACES between quoted domains, NOT commas

Check for:
1. Syntax errors (invalid operators, malformed regex, incorrect quotes)
2. Invalid combinations (wildcards in 'in' statements)
3. Malformed regular expressions in 'matches' statements
4. Missing quotes or braces

If filters are syntactically correct, return them unchanged in the 'optimized' array.
Only fix actual syntax errors, do not reorganize or combine valid filters.

Respond with JSON containing:
- valid: boolean indicating if ALL filters have valid syntax
- optimized: array of filters (unchanged unless fixing syntax errors)
- issues: array of specific syntax problems found
- suggestions: array of performance or best practice suggestions (but do not apply them to optimized filters)`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return { 
          valid: true, 
          optimized: filters, 
          issues: [], 
          suggestions: [] 
        };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { 
          valid: true, 
          optimized: filters, 
          issues: [], 
          suggestions: [] 
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error validating filters:', error);
      return { 
        valid: true, 
        optimized: filters, 
        issues: ['Error occurred during validation'], 
        suggestions: [] 
      };
    }
  }

  async generateRulesetTemplate(requirements: {
    environment: 'enterprise' | 'small_business' | 'personal' | 'development';
    securityLevel: 'strict' | 'balanced' | 'permissive';
    services: string[];
    specialRequirements?: string[];
  }): Promise<{
    template: Array<{
      name: string;
      action: string;
      traffic: string;
      filters: string[];
      precedence: number;
      description: string;
      category: string;
    }>;
    explanation: string;
  }> {
    const prompt = `Generate a comprehensive Cloudflare Gateway ruleset template based on these requirements:

Environment: ${requirements.environment}
Security Level: ${requirements.securityLevel}
Required Services: ${requirements.services.join(', ')}
Special Requirements: ${requirements.specialRequirements?.join(', ') || 'None'}

Generate rules following this hierarchy:
1. System Services (900-999): NTP, DNS infrastructure
2. Security Bypasses (998-999): TLS bypass for critical auth
3. Security Blocks (1000-1099): Malware, phishing, geo-blocking
4. Infrastructure (1100-1199): SSH, core services
5. Business Critical (1200-1299): Dev tools, cloud, email
6. General Services (1300-1399): Social, streaming, CDNs
7. Catch-All (1400+): Default rules

For ${requirements.securityLevel} security:
- Strict: Comprehensive blocking, minimal exceptions
- Balanced: Standard security with business needs
- Permissive: Light security, maximum access

Include essential rules for ${requirements.environment} environment and requested services.

Respond with JSON containing:
- template: array of rule objects with name, action, traffic, filters, precedence, description, category
- explanation: overview of the generated ruleset strategy`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return {
          template: [],
          explanation: 'Unable to generate template'
        };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          template: [],
          explanation: 'Unable to parse template response'
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error generating ruleset template:', error);
      return {
        template: [],
        explanation: 'Error occurred during template generation'
      };
    }
  }

  async categorizeService(serviceName: string, domains: string[]): Promise<{
    category: 'system' | 'security' | 'infrastructure' | 'business_critical' | 'general' | 'entertainment';
    priority: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: 'allow' | 'block' | 'bypass';
    reasoning: string;
  }> {
    const prompt = `Analyze this service and categorize it for Gateway firewall rules:

Service Name: ${serviceName}
Domains: ${domains.join(', ')}

Categorize based on:
- Business criticality
- Security implications  
- Usage patterns
- Infrastructure dependencies

Categories:
- system: Core OS/infrastructure services
- security: Security tools and threat intel
- infrastructure: Network equipment, monitoring
- business_critical: Essential business operations
- general: Standard productivity/communication
- entertainment: Social media, streaming, gaming

Priorities:
- critical: Essential for operations
- high: Important for business
- medium: Standard productivity
- low: Optional/entertainment

Actions:
- allow: Standard allow rule
- block: Block/restrict access
- bypass: TLS bypass for functionality

Respond with JSON containing category, priority, suggestedAction, and reasoning.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return {
          category: 'general',
          priority: 'medium',
          suggestedAction: 'allow',
          reasoning: 'Unable to analyze service'
        };
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          category: 'general',
          priority: 'medium', 
          suggestedAction: 'allow',
          reasoning: 'Unable to parse categorization response'
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error categorizing service:', error);
      return {
        category: 'general',
        priority: 'medium',
        suggestedAction: 'allow',
        reasoning: 'Error occurred during categorization'
      };
    }
  }
}
