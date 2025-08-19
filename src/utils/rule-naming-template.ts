/**
 * Rule Naming Template Utility
 * 
 * Standardizes rule naming conventions across the application.
 * Format: [TRAFFIC_TYPE]: [CATEGORY] - [DESCRIPTION]
 * Example: "DNS: Security - Block malware domains"
 */

import type { GatewayRule } from '../types/gateway.js';

export type TrafficType = 'DNS' | 'HTTP' | 'L4' | 'NETWORK';
export type RuleCategory = 
  | 'Security'
  | 'Productivity'
  | 'Development'
  | 'AI Services'
  | 'Cloud Infrastructure'
  | 'Authentication'
  | 'Social Media'
  | 'Streaming'
  | 'Smart Home'
  | 'Certificate'
  | 'API'
  | 'Email'
  | 'VPN'
  | 'Custom';

export interface RuleNameComponents {
  trafficType: TrafficType;
  category: RuleCategory;
  description: string;
  action?: 'Allow' | 'Block' | 'Isolate' | 'Bypass';
}

export class RuleNamingTemplate {
  /**
   * Generate a standardized rule name from components
   */
  static generateRuleName(components: RuleNameComponents): string {
    const { trafficType, category, description, action } = components;
    
    // Format: "TRAFFIC_TYPE: Category - Description"
    let name = `${trafficType}: ${category}`;
    
    // Add action if specified and not obvious from description
    if (action && !description.toLowerCase().includes(action.toLowerCase())) {
      name += ` (${action})`;
    }
    
    // Add description
    name += ` - ${description}`;
    
    // Ensure the name isn't too long (Cloudflare limit is typically 128 chars)
    if (name.length > 128) {
      // Truncate description part only
      const prefix = `${trafficType}: ${category}${action ? ` (${action})` : ''} - `;
      const maxDescLength = 128 - prefix.length - 3; // 3 for "..."
      name = prefix + description.substring(0, maxDescLength) + '...';
    }
    
    return name;
  }

  /**
   * Parse an existing rule name to extract components
   */
  static parseRuleName(name: string): Partial<RuleNameComponents> {
    const components: Partial<RuleNameComponents> = {};
    
    // Try to match pattern: "TRAFFIC_TYPE: Category - Description"
    const match = name.match(/^(DNS|HTTP|L4|NETWORK):\s*([^-]+?)\s*(?:\(([^)]+)\))?\s*-\s*(.+)$/);
    
    if (match) {
      components.trafficType = match[1] as TrafficType;
      components.category = match[2].trim() as RuleCategory;
      if (match[3]) {
        components.action = match[3] as RuleNameComponents['action'];
      }
      components.description = match[4].trim();
    } else {
      // Fallback: treat entire name as description
      components.description = name;
    }
    
    return components;
  }

  /**
   * Detect traffic type from rule filters or traffic field
   */
  static detectTrafficType(rule: Partial<GatewayRule> | { filters?: string[]; traffic?: string }): TrafficType {
    const filters = rule.filters || [];
    const traffic = 'traffic' in rule ? rule.traffic : '';
    
    // Check filters and traffic field for patterns
    const allText = [...filters, traffic].join(' ').toLowerCase();
    
    if (allText.includes('dns.') || allText.includes('dns_')) {
      return 'DNS';
    } else if (allText.includes('http.') || allText.includes('https')) {
      return 'HTTP';
    } else if (allText.includes('net.') || allText.includes('port') || allText.includes('l4.')) {
      return 'L4';
    } else {
      return 'NETWORK';
    }
  }

  /**
   * Suggest category based on rule filters and action
   */
  static suggestCategory(rule: Partial<GatewayRule> | { filters?: string[]; action?: string }): RuleCategory {
    const filters = rule.filters || [];
    const action = rule.action || '';
    const allText = filters.join(' ').toLowerCase();
    
    // Security patterns
    if (allText.includes('malware') || allText.includes('phishing') || 
        allText.includes('botnet') || allText.includes('security_category') ||
        allText.includes('threat') || allText.includes('virus')) {
      return 'Security';
    }
    
    // AI Services
    if (allText.includes('openai') || allText.includes('anthropic') || 
        allText.includes('claude') || allText.includes('chatgpt') ||
        allText.includes('gemini') || allText.includes('copilot')) {
      return 'AI Services';
    }
    
    // Development
    if (allText.includes('github') || allText.includes('npm') || 
        allText.includes('gitlab') || allText.includes('bitbucket') ||
        allText.includes('stackoverflow') || allText.includes('docker')) {
      return 'Development';
    }
    
    // Cloud Infrastructure
    if (allText.includes('aws') || allText.includes('azure') || 
        allText.includes('gcp') || allText.includes('googleapis') ||
        allText.includes('cloudflare') || allText.includes('cloudfront')) {
      return 'Cloud Infrastructure';
    }
    
    // Authentication
    if (allText.includes('auth') || allText.includes('okta') || 
        allText.includes('onelogin') || allText.includes('duo') ||
        allText.includes('login') || allText.includes('sso')) {
      return 'Authentication';
    }
    
    // Social Media
    if (allText.includes('facebook') || allText.includes('instagram') || 
        allText.includes('twitter') || allText.includes('linkedin') ||
        allText.includes('snapchat') || allText.includes('tiktok')) {
      return 'Social Media';
    }
    
    // Streaming
    if (allText.includes('netflix') || allText.includes('youtube') || 
        allText.includes('spotify') || allText.includes('twitch') ||
        allText.includes('hulu') || allText.includes('disney')) {
      return 'Streaming';
    }
    
    // Smart Home
    if (allText.includes('homekit') || allText.includes('nest') || 
        allText.includes('aqara') || allText.includes('philips') ||
        allText.includes('smart') || allText.includes('iot')) {
      return 'Smart Home';
    }
    
    // Certificate
    if (allText.includes('ocsp') || allText.includes('crl') || 
        allText.includes('certificate') || allText.includes('pki')) {
      return 'Certificate';
    }
    
    // API
    if (allText.includes('/api/') || allText.includes('api.') || 
        allText.includes('graphql') || allText.includes('rest')) {
      return 'API';
    }
    
    // Email
    if (allText.includes('smtp') || allText.includes('imap') || 
        allText.includes('mail') || allText.includes('outlook') ||
        allText.includes('gmail')) {
      return 'Email';
    }
    
    // VPN
    if (allText.includes('vpn') || allText.includes('tailscale') || 
        allText.includes('wireguard') || allText.includes('openvpn')) {
      return 'VPN';
    }
    
    // Productivity (default for allow rules)
    if (action === 'allow') {
      return 'Productivity';
    }
    
    // Default
    return 'Custom';
  }

  /**
   * Generate a descriptive summary from filters
   */
  static generateDescription(filters: string[], action?: string): string {
    // Extract key information from filters
    const domains: string[] = [];
    const categories: string[] = [];
    const ports: string[] = [];
    const countries: string[] = [];
    
    filters.forEach(filter => {
      // Extract domains
      const domainMatches = filter.match(/"([^"]+)"/g);
      if (domainMatches) {
        domains.push(...domainMatches.map(d => d.replace(/"/g, '')));
      }
      
      // Extract categories
      if (filter.includes('category')) {
        const catMatch = filter.match(/\{(\d+)\}/);
        if (catMatch) {
          categories.push(catMatch[1]);
        }
      }
      
      // Extract ports
      const portMatch = filter.match(/port\s*==?\s*(\d+)/);
      if (portMatch) {
        ports.push(portMatch[1]);
      }
      
      // Extract countries
      const countryMatch = filter.match(/country\s+in\s+\{([^}]+)\}/);
      if (countryMatch) {
        const countryList = countryMatch[1].match(/"([^"]+)"/g);
        if (countryList) {
          countries.push(...countryList.map(c => c.replace(/"/g, '')));
        }
      }
    });
    
    // Build description
    let description = '';
    
    if (domains.length > 0) {
      const domainList = domains.slice(0, 3).join(', ');
      if (domains.length > 3) {
        description = `${domainList} and ${domains.length - 3} more`;
      } else {
        description = domainList;
      }
    } else if (categories.length > 0) {
      description = `Category ${categories.join(', ')}`;
    } else if (ports.length > 0) {
      description = `Port ${ports.join(', ')}`;
    } else if (countries.length > 0) {
      description = `Countries: ${countries.join(', ')}`;
    } else {
      // Generic description based on action
      if (action === 'allow') {
        description = 'Allow specific traffic';
      } else if (action === 'block') {
        description = 'Block specific traffic';
      } else {
        description = 'Custom rule';
      }
    }
    
    return description;
  }

  /**
   * Standardize an existing rule name
   */
  static standardizeRuleName(rule: Partial<GatewayRule>): string {
    // First try to parse existing name
    const parsed = this.parseRuleName(rule.name || '');
    
    // Detect or use existing traffic type
    const trafficType = parsed.trafficType || this.detectTrafficType(rule);
    
    // Suggest or use existing category
    const category = parsed.category || this.suggestCategory(rule);
    
    // Use existing description or generate new one
    const description = parsed.description || 
                       this.generateDescription(rule.filters || [], rule.action);
    
    // Determine action
    let action: RuleNameComponents['action'] | undefined;
    if (rule.action === 'allow') action = 'Allow';
    else if (rule.action === 'block') action = 'Block';
    else if (rule.action === 'isolate') action = 'Isolate';
    else if (rule.action === 'do_not_inspect') action = 'Bypass';
    
    return this.generateRuleName({
      trafficType,
      category,
      description,
      action
    });
  }

  /**
   * Check if a rule name follows the standard template
   */
  static isStandardized(name: string): boolean {
    return /^(DNS|HTTP|L4|NETWORK):\s*[^-]+\s*-\s*.+$/.test(name);
  }

  /**
   * Get a list of all available categories
   */
  static getCategories(): RuleCategory[] {
    return [
      'Security',
      'Productivity',
      'Development',
      'AI Services',
      'Cloud Infrastructure',
      'Authentication',
      'Social Media',
      'Streaming',
      'Smart Home',
      'Certificate',
      'API',
      'Email',
      'VPN',
      'Custom'
    ];
  }
}
