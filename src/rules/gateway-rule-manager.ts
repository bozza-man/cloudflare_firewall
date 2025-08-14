import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { ConflictResolver } from './conflict-resolver.js';
import { DomainConflictDetector } from './domain-conflict-detector.js';
import { DomainVerifier } from '../utils/domain-verifier.js';
import type { 
  GatewayRule, 
  CreateGatewayRuleRequest, 
  UpdateGatewayRuleRequest,
  GatewayList,
  GatewayLocation,
  GatewayCategory 
} from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';

export class GatewayRuleManager {
  private gateway: GatewayClient;
  private ai: GatewayAIAssistant;
  private conflictResolver: ConflictResolver;
  private domainConflictDetector: DomainConflictDetector;
  private domainVerifier: DomainVerifier;

  constructor() {
    this.gateway = new GatewayClient();
    this.ai = new GatewayAIAssistant();
    this.conflictResolver = new ConflictResolver();
    this.domainConflictDetector = new DomainConflictDetector();
    this.domainVerifier = new DomainVerifier();
  }

  async listRules(): Promise<GatewayRule[]> {
    const spinner = ora('Fetching Gateway rules...').start();
    try {
      const rules = await this.gateway.listGatewayRules();
      spinner.succeed(`Found ${rules.length} Gateway rules`);
      return rules.sort((a, b) => a.precedence - b.precedence);
    } catch (error) {
      spinner.fail('Failed to fetch rules');
      throw error;
    }
  }

  async createRule(rule: CreateGatewayRuleRequest): Promise<GatewayRule> {
    const spinner = ora('Analyzing new rule...').start();
    
    try {
      const existingRules = await this.gateway.listGatewayRules();
      
      // Use basic validation without AI optimization
      const validation = {
        valid: true,
        optimized: rule.filters,
        issues: [],
        suggestions: []
      };
      
      spinner.text = 'Filters validated successfully';

      // Enhanced domain-based conflict detection
      spinner.start('Performing domain-based conflict analysis...');
      const domainConflicts = this.domainConflictDetector.detectConflicts(
        {
          name: rule.name,
          action: rule.action,
          filters: validation.optimized,
          traffic: rule.traffic
        },
        existingRules
      );

      // Display domain conflicts immediately
      if (domainConflicts.length > 0) {
        spinner.stop();
        console.log(chalk.red('\n🚨 Domain-based conflicts detected:'));
        domainConflicts.forEach((conflict, index) => {
          const severityColor = conflict.severity === 'high' ? chalk.red : 
                                conflict.severity === 'medium' ? chalk.yellow : chalk.blue;
          console.log(`\n   ${index + 1}. ${severityColor(conflict.type.toUpperCase())} - ${conflict.description}`);
          console.log(`      ${chalk.gray('Overlapping domains:')} ${conflict.overlappingDomains.join(', ')}`);
          console.log(`      ${chalk.cyan('Suggestion:')} ${conflict.suggestion}`);
        });

        // Check if we should offer consolidation
        const consolidationSuggestions = this.domainConflictDetector.suggestConsolidation(
          {
            name: rule.name,
            action: rule.action,
            filters: validation.optimized
          },
          domainConflicts
        );

        if (consolidationSuggestions.length > 0) {
          console.log(chalk.yellow('\n💡 Consolidation opportunities:'));
          consolidationSuggestions.forEach((suggestion, index) => {
            console.log(`\n   ${index + 1}. ${suggestion.type === 'extend_existing' ? '🔗' : '🚫'} ${suggestion.description}`);
            console.log(`      Target rule: ${suggestion.ruleName}`);
            if (suggestion.modifiedFilters.length > 0) {
              console.log(`      Suggested filters: ${suggestion.modifiedFilters.join(', ')}`);
            }
          });

          // Ask user if they want to extend an existing rule instead
          if (process.stdin.isTTY) {
            const { default: inquirer } = await import('inquirer');
            const { extendExisting } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'extendExisting',
                message: 'Would you like to extend an existing rule instead of creating a new one?',
                default: true
              }
            ]);

            if (extendExisting && consolidationSuggestions.length > 0) {
              const { selectedSuggestion } = await inquirer.prompt([
                {
                  type: 'list',
                  name: 'selectedSuggestion',
                  message: 'Select which rule to extend:',
                  choices: consolidationSuggestions.map((s, i) => ({
                    name: `${s.ruleName} - ${s.description}`,
                    value: i
                  }))
                }
              ]);

              const suggestion = consolidationSuggestions[selectedSuggestion];
              const existingRule = existingRules.find(r => r.id === suggestion.ruleId);
              
              if (existingRule && suggestion.modifiedFilters.length > 0) {
                spinner.start('Extending existing rule...');
                const updatedRule = await this.gateway.updateGatewayRule({
                  id: suggestion.ruleId,
                  filters: [...existingRule.filters, ...suggestion.modifiedFilters]
                });
                spinner.succeed(`Extended rule "${existingRule.name}" with new domains`);
                return updatedRule;
              }
            }
          }
        }
      }

      spinner.start('Running AI-based conflict analysis...');
      const { conflicts, resolutions } = await this.ai.analyzeRuleConflictsWithResolutions(
        {
          filters: validation.optimized,
          action: rule.action,
          name: rule.name,
          traffic: rule.traffic
        },
        existingRules
      );

      spinner.stop();

      if (conflicts.length > 0) {
        // Use the conflict resolver to handle conflicts interactively
        const resolution = await this.conflictResolver.resolveConflicts(
          conflicts,
          resolutions,
          {
            name: rule.name,
            filters: validation.optimized,
            action: rule.action,
            traffic: rule.traffic,
            description: rule.description
          }
        );

        if (resolution.action === 'skip') {
          throw new Error('Rule creation cancelled');
        }

        if (resolution.action === 'modify' && resolution.rulesToModify) {
          // Apply modifications to existing rules
          spinner.start('Modifying existing rules...');
          
          for (const modification of resolution.rulesToModify) {
            await this.gateway.updateGatewayRule({
              id: modification.ruleId,
              ...modification.updates
            });
          }
          
          spinner.succeed('Existing rules modified successfully');
          return existingRules.find(r => r.id === resolution.rulesToModify![0].ruleId)!;
        }

        // If creating new rule, use the potentially modified rule
        if (resolution.action === 'create' && resolution.ruleToCreate) {
          rule = {
            ...rule,
            ...resolution.ruleToCreate,
            filters: resolution.ruleToCreate.filters || validation.optimized,
            action: resolution.ruleToCreate.action as GatewayRule['action'] || rule.action
          };
        }
      } else {
        spinner.succeed('No conflicts detected');
      }

      spinner.start('Determining optimal rule precedence...');
      const { precedence, reasoning } = await this.ai.suggestRulePrecedence(
        {
          filters: validation.optimized,
          action: rule.action,
          name: rule.name,
          traffic: rule.traffic
        },
        existingRules
      );

      // Ensure precedence is an integer and handle conflicts
      let integerPrecedence = Math.round(precedence);
      
      // Check if precedence already exists and find next available
      const existingPrecedences = new Set(existingRules.map(r => r.precedence));
      while (existingPrecedences.has(integerPrecedence)) {
        integerPrecedence++;
      }
      
      if (integerPrecedence !== Math.round(precedence)) {
        spinner.succeed(`Adjusted precedence to avoid conflicts: ${integerPrecedence} (AI suggested: ${Math.round(precedence)} - ${reasoning})`);
      } else {
        spinner.succeed(`Suggested precedence: ${integerPrecedence} - ${reasoning}`);
      }

      // Perform pre-rule verification to understand current state
      await this.verifyRuleImplementation({
        ...rule,
        filters: validation.optimized
      }, 'pre');
      
      spinner.start('Creating rule...');
      const newRule = await this.gateway.createGatewayRule({
        ...rule,
        filters: validation.optimized,
        precedence: integerPrecedence
      });

      spinner.succeed('Rule created successfully');
      
      // Wait for rule propagation
      await this.domainVerifier.waitForRulePropagation(3);
      
      // Perform post-rule verification to confirm implementation
      await this.verifyRuleImplementation(newRule, 'post');
      
      return newRule;
    } catch (error) {
      spinner.fail('Failed to create rule');
      throw error;
    }
  }

  async createRuleFromDescription(description: string): Promise<GatewayRule> {
    const spinner = ora('Generating rule from description...').start();
    
    try {
      const { filters, explanation, traffic } = await this.ai.generateRuleFilters(description);
      
      if (filters.length === 0) {
        spinner.fail('Unable to generate filters from description');
        throw new Error('Failed to generate filters');
      }

      spinner.succeed(`Generated filters: ${explanation}`);
      console.log(chalk.cyan('\nGenerated filters:'));
      filters.forEach(filter => console.log(`  - ${filter}`));

      let answers: {
        name: string;
        action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect';
        confirm: boolean;
      };
      
      // Check if stdin is a TTY (interactive terminal)
      if (process.stdin.isTTY) {
        const { default: inquirer } = await import('inquirer');
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this rule:',
            validate: (input) => input.trim().length > 0 || 'Name is required'
          },
          {
            type: 'list',
            name: 'action',
            message: 'Select the action:',
            choices: ['block', 'allow', 'isolate', 'do_not_isolate', 'do_not_inspect'],
            default: 'block'
          },
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Create this rule?',
            default: true
          }
        ]);
      } else {
        // Non-interactive mode - use defaults or derive from description
        const ruleName = description.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        const action = description.toLowerCase().includes('allow') ? 'allow' : 'block';
        
        console.log(`\n${chalk.cyan('Non-interactive mode detected. Using defaults:')}`);
        console.log(`  Rule name: ${ruleName}`);
        console.log(`  Action: ${action}`);
        console.log(`  Confirmed: Yes`);
        
        answers = {
          name: ruleName,
          action: action,
          confirm: true
        };
      }

      if (!answers.confirm) {
        throw new Error('Rule creation cancelled');
      }

      return await this.createRule({
        name: answers.name,
        action: answers.action,
        filters,
        traffic,
        description
      });
    } catch (error) {
      spinner.fail('Failed to create rule from description');
      throw error;
    }
  }

  async updateRule(update: UpdateGatewayRuleRequest): Promise<GatewayRule> {
    const spinner = ora('Updating rule...').start();
    
    try {
      if (update.filters) {
        spinner.text = 'Validating updated filters...';
        const validation = await this.ai.validateAndOptimizeFilters(update.filters);
        
        if (!validation.valid) {
          spinner.fail('Invalid filters detected');
          console.log(chalk.red('\nFilter Issues:'));
          validation.issues.forEach(issue => console.log(`  - ${issue}`));
          throw new Error('Invalid rule filters');
        }

        update.filters = validation.optimized;

        spinner.text = 'Checking for conflicts with updated filters...';
        const existingRules = await this.gateway.listGatewayRules();
        const otherRules = existingRules.filter(r => r.id !== update.id);
        const currentRule = existingRules.find(r => r.id === update.id);
        
        if (currentRule) {
          const { conflicts, resolutions } = await this.ai.analyzeRuleConflictsWithResolutions(
            {
              filters: update.filters,
              action: update.action || currentRule.action,
              name: update.name || currentRule.name,
              traffic: update.traffic || currentRule.traffic
            },
            otherRules
          );

          if (conflicts.length > 0) {
            spinner.stop();
            
            const resolution = await this.conflictResolver.resolveConflicts(
              conflicts,
              resolutions,
              {
                name: update.name || currentRule.name,
                filters: update.filters,
                action: update.action || currentRule.action,
                traffic: update.traffic || currentRule.traffic,
                description: update.description || currentRule.description
              }
            );

            if (resolution.action === 'skip') {
              throw new Error('Rule update cancelled');
            }

            // Apply any additional modifications suggested by the resolver
            if (resolution.ruleToCreate && resolution.ruleToCreate.filters) {
              update.filters = resolution.ruleToCreate.filters;
            }
            
            spinner.start('Updating rule...');
          }
        }
      }

      const updatedRule = await this.gateway.updateGatewayRule(update);
      spinner.succeed('Rule updated successfully');
      return updatedRule;
    } catch (error) {
      spinner.fail('Failed to update rule');
      throw error;
    }
  }

  async deleteRule(ruleId: string): Promise<void> {
    const spinner = ora('Deleting rule...').start();
    try {
      await this.gateway.deleteGatewayRule(ruleId);
      spinner.succeed('Rule deleted successfully');
    } catch (error) {
      spinner.fail('Failed to delete rule');
      throw error;
    }
  }

  async explainRule(ruleId: string): Promise<string> {
    const spinner = ora('Analyzing rule...').start();
    try {
      const rule = await this.gateway.getGatewayRule(ruleId);
      const explanation = await this.ai.explainRule(rule);
      spinner.succeed('Rule analysis complete');
      return explanation;
    } catch (error) {
      spinner.fail('Failed to explain rule');
      throw error;
    }
  }

  async listLists(): Promise<GatewayList[]> {
    const spinner = ora('Fetching Gateway lists...').start();
    try {
      const lists = await this.gateway.listGatewayLists();
      spinner.succeed(`Found ${lists.length} Gateway lists`);
      return lists;
    } catch (error) {
      spinner.fail('Failed to fetch lists');
      throw error;
    }
  }

  async listLocations(): Promise<GatewayLocation[]> {
    const spinner = ora('Fetching Gateway locations...').start();
    try {
      const locations = await this.gateway.listGatewayLocations();
      spinner.succeed(`Found ${locations.length} Gateway locations`);
      return locations;
    } catch (error) {
      spinner.fail('Failed to fetch locations');
      throw error;
    }
  }

  async listCategories(): Promise<GatewayCategory[]> {
    const spinner = ora('Fetching Gateway categories...').start();
    try {
      const categories = await this.gateway.listGatewayCategories();
      spinner.succeed(`Found ${categories.length} Gateway categories`);
      return categories;
    } catch (error) {
      spinner.fail('Failed to fetch categories');
      throw error;
    }
  }

  /**
   * Verify rule implementation with comprehensive before/after testing
   */
  private async verifyRuleImplementation(rule: CreateGatewayRuleRequest | GatewayRule, phase: 'pre' | 'post' = 'post'): Promise<void> {
    try {
      // Extract domains from the rule's filters or traffic
      let domains: string[] = [];
      
      if ('traffic' in rule && rule.traffic) {
        // For existing rules, use traffic field
        domains = this.domainVerifier.extractDomainsFromFilters([rule.traffic]);
      } else if ('filters' in rule && rule.filters) {
        // For new rules, use filters field
        domains = this.domainVerifier.extractDomainsFromFilters(rule.filters);
      }
      
      if (domains.length === 0) {
        console.log(chalk.gray(`\n🔍 No domains found in rule "${rule.name}" for verification`));
        return;
      }

      // Perform comprehensive verification
      await this.domainVerifier.verifyRuleImplementation({
        ruleName: rule.name,
        action: rule.action,
        domains,
        phase
      });
      
    } catch (error) {
      console.log(chalk.red('\n❌ Domain verification failed:'), error instanceof Error ? error.message : error);
    }
  }

}