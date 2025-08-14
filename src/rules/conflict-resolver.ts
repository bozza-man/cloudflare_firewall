import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, RuleConflict } from '../types/gateway.js';
import chalk from 'chalk';
import inquirer from 'inquirer';

export interface ConflictResolution {
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
}

export class ConflictResolver {
  private gateway: GatewayClient;

  constructor() {
    this.gateway = new GatewayClient();
  }

  async resolveConflicts(
    conflicts: RuleConflict[],
    resolutions: ConflictResolution[],
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    }
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    if (conflicts.length === 0) {
      return { action: 'create', ruleToCreate: newRule };
    }

    this.displayConflicts(conflicts);
    
    const selectedResolution = await this.promptForResolution(resolutions, newRule);
    
    if (!selectedResolution) {
      return { action: 'skip' };
    }

    return await this.applyResolution(selectedResolution, newRule, conflicts);
  }

  private displayConflicts(conflicts: RuleConflict[]): void {
    console.log('\n' + chalk.yellow('⚠️  Potential Conflicts Detected:'));
    
    conflicts.forEach((conflict, index) => {
      const severityColor = {
        high: chalk.red,
        medium: chalk.yellow,
        low: chalk.blue
      }[conflict.severity];

      console.log(`\n${index + 1}. ${severityColor(`[${conflict.severity.toUpperCase()}]`)} ${conflict.conflictingRule.name}`);
      console.log(`   ${conflict.reason}`);
      if (conflict.suggestion) {
        console.log(`   ${chalk.gray('Suggestion:')} ${conflict.suggestion}`);
      }
    });
  }

  private async promptForResolution(
    resolutions: ConflictResolution[],
    _newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    }
  ): Promise<ConflictResolution | null> {
    console.log('\n' + chalk.cyan('📋 Resolution Options:'));

    // Sort resolutions by recommendation level
    const sortedResolutions = [...resolutions].sort((a, b) => {
      const order = { recommended: 0, alternative: 1, not_recommended: 2 };
      return order[a.recommendation] - order[b.recommendation];
    });

    // Build choices for inquirer
    const choices = sortedResolutions.map((resolution, index) => {
      const icon = {
        recommended: '✅',
        alternative: '🔄',
        not_recommended: '⚠️'
      }[resolution.recommendation];

      let name = `${icon} ${resolution.description}`;
      
      // Add details to the choice name
      if (resolution.type === 'modify_existing' && resolution.details.ruleName) {
        name += chalk.gray(` (modify "${resolution.details.ruleName}")`);
      }
      
      if (resolution.details.filtersToRemove && resolution.details.filtersToRemove.length > 0) {
        name += chalk.gray(`\n     Remove: ${resolution.details.filtersToRemove.join(', ')}`);
      }
      
      if (resolution.details.filtersToAdd && resolution.details.filtersToAdd.length > 0) {
        name += chalk.gray(`\n     Add: ${resolution.details.filtersToAdd.join(', ')}`);
      }

      return {
        name,
        value: index,
        short: resolution.description
      };
    });

    // Add skip option
    choices.push({
      name: chalk.red('❌ Cancel - Do not create or modify any rules'),
      value: -1,
      short: 'Cancel'
    });

    const { selectedIndex } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedIndex',
        message: 'How would you like to resolve these conflicts?',
        choices,
        pageSize: 10
      }
    ]);

    if (selectedIndex === -1) {
      return null;
    }

    return sortedResolutions[selectedIndex];
  }

  private async applyResolution(
    resolution: ConflictResolution,
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    },
    conflicts: RuleConflict[]
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    switch (resolution.type) {
      case 'modify_existing':
        return await this.applyModifyExisting(resolution, newRule);
      
      case 'create_new':
        return await this.applyCreateNew(resolution, newRule);
      
      case 'merge_rules':
        return await this.applyMergeRules(resolution, newRule, conflicts);
      
      case 'reorder':
        return await this.applyReorder(resolution, newRule);
      
      case 'skip':
        return { action: 'skip' };
      
      default:
        return { action: 'create', ruleToCreate: newRule };
    }
  }

  private async applyModifyExisting(
    resolution: ConflictResolution,
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    }
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    if (!resolution.details.ruleId) {
      throw new Error('No rule ID provided for modification');
    }

    // Fetch the existing rule
    const existingRule = await this.gateway.getGatewayRule(resolution.details.ruleId);
    
    // Calculate the new filters
    let updatedFilters = [...existingRule.filters];
    
    if (resolution.details.filtersToRemove) {
      updatedFilters = updatedFilters.filter(f => 
        !resolution.details.filtersToRemove!.includes(f)
      );
    }
    
    if (resolution.details.filtersToAdd) {
      updatedFilters.push(...resolution.details.filtersToAdd);
    }
    
    if (resolution.details.suggestedFilters) {
      updatedFilters = resolution.details.suggestedFilters;
    }

    // Show the changes to the user
    console.log('\n' + chalk.cyan('📝 Proposed Changes to Existing Rule:'));
    console.log(`Rule: ${chalk.bold(existingRule.name)}`);
    console.log('\nCurrent filters:');
    existingRule.filters.forEach(f => console.log(`  - ${f}`));
    console.log('\nUpdated filters:');
    updatedFilters.forEach(f => console.log(`  - ${chalk.green(f)}`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Apply these changes to the existing rule?',
        default: true
      }
    ]);

    if (!confirm) {
      return { action: 'skip' };
    }

    return {
      action: 'modify',
      rulesToModify: [{
        ruleId: resolution.details.ruleId,
        updates: {
          filters: updatedFilters,
          description: existingRule.description + 
            ` (Modified: removed conflicting filters for "${newRule.name}")`
        }
      }]
    };
  }

  private async applyCreateNew(
    resolution: ConflictResolution,
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    }
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    const modifiedRule = { ...newRule };
    
    if (resolution.details.suggestedFilters) {
      modifiedRule.filters = resolution.details.suggestedFilters;
    }
    
    if (resolution.details.suggestedAction) {
      modifiedRule.action = resolution.details.suggestedAction;
    }
    
    if (resolution.details.suggestedPrecedence) {
      modifiedRule.precedence = resolution.details.suggestedPrecedence;
    }

    // Show the modified rule
    console.log('\n' + chalk.cyan('📝 Modified Rule to Create:'));
    console.log(`Name: ${chalk.bold(modifiedRule.name)}`);
    console.log(`Action: ${modifiedRule.action}`);
    console.log('Filters:');
    modifiedRule.filters.forEach((f) => console.log(`  - ${f}`));
    
    if (resolution.details.suggestedPrecedence) {
      console.log(`Precedence: ${resolution.details.suggestedPrecedence}`);
    }

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Create this modified rule?',
        default: true
      }
    ]);

    if (!confirm) {
      return { action: 'skip' };
    }

    return { action: 'create', ruleToCreate: modifiedRule };
  }

  private async applyMergeRules(
    resolution: ConflictResolution,
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    },
    conflicts: RuleConflict[]
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    // Find the rule to merge with
    const targetRule = conflicts[0]?.conflictingRule;
    if (!targetRule) {
      throw new Error('No target rule found for merging');
    }

    // Combine filters
    const combinedFilters = [...new Set([...targetRule.filters, ...newRule.filters])];
    
    console.log('\n' + chalk.cyan('🔀 Merge Rules:'));
    console.log(`Merging "${newRule.name}" into "${targetRule.name}"`);
    console.log('\nCombined filters:');
    combinedFilters.forEach(f => console.log(`  - ${f}`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Merge these rules?',
        default: true
      }
    ]);

    if (!confirm) {
      return { action: 'skip' };
    }

    return {
      action: 'modify',
      rulesToModify: [{
        ruleId: targetRule.id,
        updates: {
          filters: combinedFilters,
          description: `${targetRule.description || ''} (Merged with: ${newRule.name})`.trim()
        }
      }]
    };
  }

  private async applyReorder(
    resolution: ConflictResolution,
    newRule: {
      name: string;
      filters: string[];
      action: string;
      traffic?: string;
      description?: string;
    }
  ): Promise<{
    action: 'create' | 'modify' | 'skip';
    ruleToCreate?: typeof newRule;
    rulesToModify?: Array<{
      ruleId: string;
      updates: Partial<GatewayRule>;
    }>;
  }> {
    const modifiedRule = { ...newRule };
    
    if (resolution.details.suggestedPrecedence) {
      modifiedRule.precedence = resolution.details.suggestedPrecedence;
    }

    console.log('\n' + chalk.cyan('🔄 Create Rule with Different Priority:'));
    console.log(`The rule will be created with precedence ${modifiedRule.precedence}`);
    console.log('This will ensure it is evaluated in the correct order.');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Create rule with this precedence?',
        default: true
      }
    ]);

    if (!confirm) {
      return { action: 'skip' };
    }

    return { action: 'create', ruleToCreate: modifiedRule };
  }
}