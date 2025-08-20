/**
 * Block Page Configuration for Gateway Rules
 * Extends Gateway rules to support dynamic block page settings
 */

import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, CreateGatewayRuleRequest, UpdateGatewayRuleRequest } from '../types/gateway.js';

export interface BlockPageSettings {
  enabled: boolean;
  url?: string;
  customMessage?: string;
  showRuleName?: boolean;
  showCategory?: boolean;
  showUserInfo?: boolean;
  supportContact?: string;
}

export interface GatewayRuleWithBlockPage extends GatewayRule {
  block_page_settings?: BlockPageSettings;
}

export interface CreateRuleWithBlockPageRequest extends CreateGatewayRuleRequest {
  block_page_settings?: BlockPageSettings;
}

export class BlockPageConfigurator {
  private client: GatewayClient;
  private defaultBlockPageUrl: string;

  constructor(client: GatewayClient, defaultBlockPageUrl?: string) {
    this.client = client;
    this.defaultBlockPageUrl = defaultBlockPageUrl || 'https://block.example.com/access-denied';
  }

  /**
   * Create a Gateway rule with custom block page settings
   */
  async createRuleWithBlockPage(rule: CreateRuleWithBlockPageRequest): Promise<GatewayRuleWithBlockPage> {
    // If the rule action is 'block', apply block page settings
    if (rule.action === 'block' && rule.block_page_settings?.enabled) {
      // Add block page configuration to rule settings
      const ruleSettings = {
        ...rule.rule_settings,
        block_page: {
          enabled: true,
          url: rule.block_page_settings.url || this.defaultBlockPageUrl,
          // Pass additional context as query parameters
          context: {
            rule_name: rule.name,
            custom_message: rule.block_page_settings.customMessage,
            show_rule_name: rule.block_page_settings.showRuleName,
            show_category: rule.block_page_settings.showCategory,
            show_user_info: rule.block_page_settings.showUserInfo,
            support_contact: rule.block_page_settings.supportContact
          }
        }
      };

      const enhancedRule: CreateGatewayRuleRequest = {
        ...rule,
        rule_settings: ruleSettings
      };

      const createdRule = await this.client.createGatewayRule(enhancedRule);
      
      return {
        ...createdRule,
        block_page_settings: rule.block_page_settings
      } as GatewayRuleWithBlockPage;
    }

    // For non-block rules, create as normal
    return await this.client.createGatewayRule(rule) as GatewayRuleWithBlockPage;
  }

  /**
   * Update a Gateway rule with block page settings
   */
  async updateRuleWithBlockPage(
    ruleId: string, 
    updates: Partial<CreateRuleWithBlockPageRequest>
  ): Promise<GatewayRuleWithBlockPage> {
    const existingRule = await this.client.getGatewayRule(ruleId);
    
    // Prepare update payload
    const updatePayload: UpdateGatewayRuleRequest = {
      id: ruleId,
      ...updates
    };

    // If block page settings are provided and action is block
    if (updates.block_page_settings && (updates.action === 'block' || existingRule.action === 'block')) {
      updatePayload.rule_settings = {
        ...existingRule.rule_settings,
        ...updates.rule_settings,
        block_page: {
          enabled: updates.block_page_settings.enabled,
          url: updates.block_page_settings.url || this.defaultBlockPageUrl,
          context: {
            rule_name: updates.name || existingRule.name,
            custom_message: updates.block_page_settings.customMessage,
            show_rule_name: updates.block_page_settings.showRuleName,
            show_category: updates.block_page_settings.showCategory,
            show_user_info: updates.block_page_settings.showUserInfo,
            support_contact: updates.block_page_settings.supportContact
          }
        }
      };
    }

    const updatedRule = await this.client.updateGatewayRule(updatePayload);
    
    return {
      ...updatedRule,
      block_page_settings: updates.block_page_settings
    } as GatewayRuleWithBlockPage;
  }

  /**
   * Enable dynamic block page for all blocking rules
   */
  async enableBlockPageForAllRules(
    settings?: Partial<BlockPageSettings>
  ): Promise<GatewayRuleWithBlockPage[]> {
    const rules = await this.client.listGatewayRules();
    const updatedRules: GatewayRuleWithBlockPage[] = [];

    for (const rule of rules) {
      if (rule.action === 'block') {
        const blockPageSettings: BlockPageSettings = {
          enabled: true,
          url: settings?.url || this.defaultBlockPageUrl,
          showRuleName: settings?.showRuleName ?? true,
          showCategory: settings?.showCategory ?? true,
          showUserInfo: settings?.showUserInfo ?? true,
          supportContact: settings?.supportContact || 'it-support@example.com',
          customMessage: settings?.customMessage
        };

        const updated = await this.updateRuleWithBlockPage(rule.id, {
          block_page_settings: blockPageSettings
        });

        updatedRules.push(updated);
      }
    }

    return updatedRules;
  }

  /**
   * Generate block page URL with context
   */
  generateBlockPageUrl(
    baseUrl: string,
    context: Record<string, any>
  ): string {
    const url = new URL(baseUrl);
    
    // Add context as query parameters
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    return url.toString();
  }

  /**
   * Validate block page configuration
   */
  validateBlockPageConfig(settings: BlockPageSettings): boolean {
    if (!settings.enabled) {
      return true; // Disabled configs are always valid
    }

    // Validate URL format
    if (settings.url) {
      try {
        new URL(settings.url);
      } catch {
        console.error('Invalid block page URL:', settings.url);
        return false;
      }
    }

    // Validate support contact email if provided
    if (settings.supportContact) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(settings.supportContact)) {
        console.error('Invalid support contact email:', settings.supportContact);
        return false;
      }
    }

    return true;
  }

  /**
   * Get block page analytics
   */
  async getBlockPageAnalytics(
    startTime: Date,
    endTime: Date
  ): Promise<{
    totalBlocks: number;
    uniqueUsers: number;
    topBlockedDomains: string[];
    blocksByRule: Record<string, number>;
  }> {
    // This would integrate with Cloudflare Analytics API
    // Placeholder implementation
    console.log('Fetching block page analytics from', startTime, 'to', endTime);
    
    return {
      totalBlocks: 0,
      uniqueUsers: 0,
      topBlockedDomains: [],
      blocksByRule: {}
    };
  }
}
