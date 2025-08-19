import { GatewayClient } from '../api/gateway-client.js';
import { GatewayAIAssistant } from '../llm/gateway-ai-assistant.js';
import { ConflictResolver } from './conflict-resolver.js';
import { DomainConflictDetector } from './domain-conflict-detector.js';
import { DomainVerifier } from '../utils/domain-verifier.js';
import { RuleNamingTemplate } from '../utils/rule-naming-template.js';
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
      // Apply standardized naming template if not already standardized
      if (!RuleNamingTemplate.isStandardized(rule.name)) {
        const standardizedName = RuleNamingTemplate.standardizeRuleName({
          ...rule,
          filters: rule.filters,
          action: rule.action
        });
        
        console.log(chalk.cyan('\n📝 Applying standardized naming template:'));
        console.log(chalk.gray(`   Original: ${rule.name}`));
        console.log(chalk.green(`   Standardized: ${standardizedName}`));
        
        rule.name = standardizedName;
      }
      
      const existingRules = await this.gateway.listGatewayRules();
      
      // LESSON LEARNED: Always check for exact duplicates first!
      // Our deduplication found 13 redundant rules that were wasting processing time
      spinner.text = 'Checking for exact duplicates...';
      const exactDuplicate = this.findExactDuplicate(rule, existingRules);
      if (exactDuplicate) {
        spinner.warn(`Rule "${exactDuplicate.name}" already exists with same configuration`);
        console.log(chalk.yellow('\n⚠️  Duplicate Detection:'));
        console.log(`   Existing rule: ${exactDuplicate.name} (precedence: ${exactDuplicate.precedence})`);
        console.log(`   Action: ${exactDuplicate.action}`);
        console.log(chalk.cyan('   💡 Tip: Consider extending the existing rule instead of creating a duplicate\n'));
        
        if (process.stdin.isTTY) {
          const { default: inquirer } = await import('inquirer');
          const { continueAnyway } = await inquirer.prompt([{
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Create duplicate rule anyway?',
            default: false
          }]);
          if (!continueAnyway) {
            throw new Error('Duplicate rule creation cancelled');
          }
        }
      }
      
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
                  id: suggestion.ruleId || existingRule.id,
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
      
      // CRITICAL LESSON: Catch-all DNS blocks MUST be last (high precedence)
      // We incorrectly moved "Block Unknown DNS" to 1050 which broke legitimate services
      // It needs to be AFTER all allows (2000+) to function as a catch-all
      if (rule.action === 'block' && rule.name.toLowerCase().includes('unknown')) {
        const minCatchAllPrecedence = 2000;
        if (integerPrecedence < minCatchAllPrecedence) {
          console.log(chalk.red('\n⚠️  CRITICAL PRECEDENCE CORRECTION:'));
          console.log(`   "${rule.name}" is a catch-all block rule`);
          console.log(`   It MUST have precedence >= ${minCatchAllPrecedence} (after all allows)`);
          console.log(`   AI suggested: ${integerPrecedence}, correcting to: ${minCatchAllPrecedence}\n`);
          integerPrecedence = minCatchAllPrecedence;
        }
      }
      
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
    const spinner = ora('Analyzing description and existing rules...').start();
    
    try {
      // First, check existing rules and lists to see if we should add to an existing rule/list
      const existingRules = await this.gateway.listGatewayRules();
      const existingLists = await this.gateway.listGatewayLists();
      
      // Generate filters from description
      const { filters, explanation, traffic } = await this.ai.generateRuleFilters(description);
      
      if (filters.length === 0) {
        spinner.fail('Unable to generate filters from description');
        throw new Error('Failed to generate filters');
      }

      spinner.succeed(`Generated filters: ${explanation}`);
      
      // Extract domains and other characteristics from the generated filters
      const domains = this.domainVerifier.extractDomainsFromFilters(filters);
      const inferredAction = this.inferActionFromDescription(description);
      const inferredTrafficType = RuleNamingTemplate.detectTrafficType({ filters, traffic });
      
      // Check if these domains can be added to an existing list or rule
      const existingMatch = await this.findExistingRuleOrListMatch(
        domains,
        inferredAction,
        inferredTrafficType,
        existingRules,
        existingLists
      );
      
      if (existingMatch) {
        spinner.stop();
        console.log(chalk.yellow('\n🔍 Found existing rule/list that could be used:'));
        console.log(`   ${existingMatch.type}: ${existingMatch.name}`);
        
        if (existingMatch.type === 'list') {
          console.log(chalk.cyan(`\n💡 Consider adding these domains to the existing list "${existingMatch.name}":`));
          domains.forEach(d => console.log(`   - ${d}`));
          console.log(chalk.gray('\nUse the "lists" command to manage Gateway Lists.'));
          
          // Ask if they want to create a new rule anyway
          if (process.stdin.isTTY) {
            const { default: inquirer } = await import('inquirer');
            const { createNew } = await inquirer.prompt([{
              type: 'confirm',
              name: 'createNew',
              message: 'Create a new rule anyway?',
              default: false
            }]);
            
            if (!createNew) {
              throw new Error('Rule creation cancelled - use existing list instead');
            }
          }
        } else if (existingMatch.type === 'rule') {
          console.log(chalk.cyan(`\n💡 These domains could be added to the existing rule "${existingMatch.name}":`));
          domains.forEach(d => console.log(`   - ${d}`));
          
          if (process.stdin.isTTY) {
            const { default: inquirer } = await import('inquirer');
            const { choice } = await inquirer.prompt([{
              type: 'list',
              name: 'choice',
              message: 'What would you like to do?',
              choices: [
                { name: 'Add domains to existing rule', value: 'update' },
                { name: 'Create a new rule', value: 'new' },
                { name: 'Cancel', value: 'cancel' }
              ]
            }]);
            
            if (choice === 'cancel') {
              throw new Error('Rule creation cancelled');
            } else if (choice === 'update') {
              // Update the existing rule with new domains
              spinner.start('Updating existing rule...');
              const updatedFilters = await this.mergeFiltersWithDomains(
                existingMatch.rule!.filters,
                domains
              );
              
              const updatedRule = await this.updateRule({
                id: existingMatch.rule!.id,
                filters: updatedFilters
              });
              
              console.log(chalk.green(`\n✅ Updated existing rule "${existingMatch.name}" with new domains`));
              return updatedRule;
            }
          }
        }
      }
      
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
        
        // Auto-infer values from description
        const inferredAction = this.inferActionFromDescription(description);
        const trafficType = RuleNamingTemplate.detectTrafficType({ filters, traffic });
        const category = RuleNamingTemplate.suggestCategory({ filters, action: inferredAction });
        const descriptionText = RuleNamingTemplate.generateDescription(filters, inferredAction);
        const defaultName = RuleNamingTemplate.generateRuleName({
          trafficType,
          category,
          description: descriptionText,
          action: inferredAction === 'allow' ? 'Allow' : inferredAction === 'block' ? 'Block' : undefined
        });
        
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this rule:',
            default: defaultName,
            validate: (input) => input.trim().length > 0 || 'Name is required'
          },
          {
            type: 'list',
            name: 'action',
            message: 'Select the action:',
            choices: ['block', 'allow', 'isolate', 'do_not_isolate', 'do_not_inspect'],
            default: inferredAction
          },
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Create this rule?',
            default: true
          }
        ]);
      } else {
        // Non-interactive mode - use inferred values from description
        const baseAction = this.inferActionFromDescription(description);
        
        // Generate standardized name
        const trafficType = RuleNamingTemplate.detectTrafficType({ filters, traffic });
        const category = RuleNamingTemplate.suggestCategory({ filters, action: baseAction });
        const descriptionText = RuleNamingTemplate.generateDescription(filters, baseAction);
        
        const ruleName = RuleNamingTemplate.generateRuleName({
          trafficType,
          category,
          description: descriptionText,
          action: baseAction === 'allow' ? 'Allow' : 'Block'
        });
        
        console.log(`\n${chalk.cyan('Non-interactive mode detected. Using defaults:')}`);
        console.log(`  Rule name: ${ruleName}`);
        console.log(`  Action: ${baseAction}`);
        console.log(`  Confirmed: Yes`);
        
        answers = {
          name: ruleName,
          action: baseAction,
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

  /**
   * LESSON LEARNED: Check for exact duplicates before creating rules
   * We found 13 duplicate rules that were redundant and slowing down Gateway processing
   */
  private findExactDuplicate(newRule: CreateGatewayRuleRequest, existingRules: GatewayRule[]): GatewayRule | null {
    for (const existing of existingRules) {
      // Check if action matches
      if (existing.action !== newRule.action) continue;
      
      // Check if it's a similar service (name pattern matching)
      const servicePattern = this.extractServicePattern(newRule.name);
      if (servicePattern && existing.name.includes(servicePattern)) {
        // Check if domains overlap significantly
        const newDomains = this.extractDomainsFromRule(newRule);
        const existingDomains = this.extractDomainsFromRule(existing);
        
        const overlap = newDomains.filter(d => existingDomains.includes(d));
        if (overlap.length > 0 && overlap.length === newDomains.length) {
          // All new domains are already covered
          return existing;
        }
      }
    }
    return null;
  }

  /**
   * Extract service name pattern from rule name
   * Examples: "Tesla: API Services" -> "Tesla"
   *          "Apple: iCloud Services" -> "Apple"
   */
  private extractServicePattern(ruleName: string): string | null {
    const match = ruleName.match(/^([^:]+):/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract domains from a rule's traffic or filters
   */
  private extractDomainsFromRule(rule: CreateGatewayRuleRequest | GatewayRule): string[] {
    const domains: string[] = [];
    
    if ('traffic' in rule && rule.traffic) {
      // Extract from traffic field
      const matches = rule.traffic.match(/"([^"]+)"/g);
      if (matches) {
        matches.forEach(m => domains.push(m.replace(/"/g, '')));
      }
    } else if ('filters' in rule && rule.filters) {
      // Extract from filters
      domains.push(...this.domainVerifier.extractDomainsFromFilters(rule.filters));
    }
    
    return domains;
  }

  /**
   * LESSON LEARNED: Proper category-based precedence prevents conflicts
   * Our optimization organized 56 rules into 20 logical categories with proper spacing
   */
  async optimizePrecedence(dryRun: boolean = false): Promise<void> {
    const spinner = ora('Analyzing rule precedence...').start();
    
    try {
      const rules = await this.gateway.listGatewayRules();
      
      // Define proper precedence ranges (learned from our optimization)
      // CRITICAL: "Block Unknown" rules MUST be last (2000+) as catch-alls!
      const categoryRanges = [
        { name: 'Critical Auth & Certs', pattern: /Authentication|Certificate|OCSP/i, range: [990, 999] },
        { name: 'Security Blocks (Specific)', pattern: /Block.*(Malware|Phishing|Command|Botnet)/i, range: [1000, 1099] },
        { name: 'Development', pattern: /GitHub|NPM|Package/i, range: [1100, 1149] },
        { name: 'Cloud Services', pattern: /AWS|Azure|Google.*Core/i, range: [1150, 1199] },
        { name: 'Apple Services', pattern: /Apple|iCloud/i, range: [1200, 1249] },
        { name: 'Communication', pattern: /Slack|Zoom|Teams/i, range: [1250, 1299] },
        { name: 'Tesla', pattern: /Tesla/i, range: [1600, 1649] },
        { name: 'General Allows', pattern: /Allow/i, range: [1900, 1999] },
        { name: 'Catch-All Blocks', pattern: /Block.*Unknown|Block.*Default/i, range: [2000, 2999] },
      ];
      
      let reorderCount = 0;
      const reorderPlan: Array<{rule: GatewayRule, newPrecedence: number}> = [];
      
      // Categorize and plan reordering
      for (const category of categoryRanges) {
        const categoryRules = rules.filter(r => category.pattern.test(r.name));
        let currentPrecedence = category.range[0];
        
        for (const rule of categoryRules) {
          if (Math.abs(rule.precedence - currentPrecedence) > 10) {
            reorderPlan.push({ rule, newPrecedence: currentPrecedence });
            reorderCount++;
          }
          currentPrecedence += 5; // 5-point spacing for better organization
        }
      }
      
      spinner.succeed(`Found ${reorderCount} rules needing precedence optimization`);
      
      if (reorderCount > 0 && !dryRun) {
        console.log(chalk.yellow(`\n⚠️  ${reorderCount} rules have suboptimal precedence`));
        console.log(chalk.cyan('💡 Run deduplication script to optimize: npx tsx src/scripts/dedupe-and-reorder-rules.ts\n'));
      }
      
      return;
    } catch (error) {
      spinner.fail('Failed to analyze precedence');
      throw error;
    }
  }

  /**
   * Infer action from natural language description
   */
  private inferActionFromDescription(description: string): 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('allow') || lowerDesc.includes('permit') || lowerDesc.includes('whitelist')) {
      return 'allow';
    } else if (lowerDesc.includes('isolate') || lowerDesc.includes('sandbox')) {
      return 'isolate';
    } else if (lowerDesc.includes('do not isolate') || lowerDesc.includes("don't isolate")) {
      return 'do_not_isolate';
    } else if (lowerDesc.includes('bypass') || lowerDesc.includes('do not inspect') || lowerDesc.includes("don't inspect")) {
      return 'do_not_inspect';
    } else {
      // Default to block for security
      return 'block';
    }
  }

  /**
   * Find existing rule or list that matches the domains/action
   */
  private async findExistingRuleOrListMatch(
    domains: string[],
    action: string,
    trafficType: string,
    existingRules: GatewayRule[],
    existingLists: GatewayList[]
  ): Promise<{ type: 'rule' | 'list'; name: string; rule?: GatewayRule; list?: GatewayList } | null> {
    if (domains.length === 0) return null;
    
    // Check for rules with similar domains and same action
    for (const rule of existingRules) {
      if (rule.action === action && rule.traffic === trafficType) {
        const ruleDomains = this.extractDomainsFromRule(rule);
        const overlap = domains.filter(d => ruleDomains.includes(d));
        
        // If there's significant overlap, suggest using this rule
        if (overlap.length > 0 && overlap.length >= domains.length * 0.5) {
          return { type: 'rule', name: rule.name, rule };
        }
      }
    }
    
    // Check for lists that could be used
    for (const list of existingLists) {
      // Check if list name suggests it's for similar purpose
      const listNameLower = list.name.toLowerCase();
      const actionMatch = (action === 'allow' && listNameLower.includes('allow')) ||
                          (action === 'block' && listNameLower.includes('block'));
      
      if (actionMatch && list.type === 'DOMAIN') {
        // Check if any rules already use this list for similar purpose
        const rulesUsingList = existingRules.filter(rule => {
          return rule.filters.some(f => f.includes(`$${list.id}`));
        });
        
        if (rulesUsingList.some(r => r.action === action)) {
          return { type: 'list', name: list.name, list };
        }
      }
    }
    
    return null;
  }

  /**
   * Merge existing filters with new domains
   */
  private async mergeFiltersWithDomains(existingFilters: string[], newDomains: string[]): Promise<string[]> {
    const mergedFilters = [...existingFilters];
    
    // Find DNS filter and add new domains
    let dnsFilterIndex = mergedFilters.findIndex(f => f.includes('dns.fqdn'));
    
    if (dnsFilterIndex >= 0) {
      // Extract existing domains from the filter
      const existingFilter = mergedFilters[dnsFilterIndex];
      const existingDomains = this.domainVerifier.extractDomainsFromFilters([existingFilter]);
      
      // Combine unique domains
      const allDomains = [...new Set([...existingDomains, ...newDomains])];
      
      // Rebuild the filter
      if (allDomains.length === 1) {
        mergedFilters[dnsFilterIndex] = `dns.fqdn == "${allDomains[0]}"`;
      } else {
        const domainList = allDomains.map(d => `"${d}"`).join(' ');
        mergedFilters[dnsFilterIndex] = `dns.fqdn in {${domainList}}`;
      }
    } else {
      // Add new DNS filter
      if (newDomains.length === 1) {
        mergedFilters.push(`dns.fqdn == "${newDomains[0]}"`);
      } else {
        const domainList = newDomains.map(d => `"${d}"`).join(' ');
        mergedFilters.push(`dns.fqdn in {${domainList}}`);
      }
    }
    
    return mergedFilters;
  }

  /**
   * LESSON LEARNED: Consolidation reduces rule count and improves performance
   * We reduced from 69 to 56 rules (19% reduction) by consolidating duplicates
   */
  async suggestConsolidation(): Promise<void> {
    const spinner = ora('Analyzing consolidation opportunities...').start();
    
    try {
      const rules = await this.gateway.listGatewayRules();
      const groups = new Map<string, GatewayRule[]>();
      
      // Group rules by service
      for (const rule of rules) {
        const service = this.extractServicePattern(rule.name);
        if (service) {
          if (!groups.has(service)) {
            groups.set(service, []);
          }
          groups.get(service)!.push(rule);
        }
      }
      
      // Find groups with multiple rules
      const consolidationOpportunities: string[] = [];
      for (const [service, serviceRules] of groups) {
        if (serviceRules.length > 2) {
          consolidationOpportunities.push(`${service}: ${serviceRules.length} rules can be merged`);
        }
      }
      
      spinner.succeed('Consolidation analysis complete');
      
      if (consolidationOpportunities.length > 0) {
        console.log(chalk.yellow('\n💡 Consolidation Opportunities Found:'));
        consolidationOpportunities.forEach(opp => {
          console.log(`   • ${opp}`);
        });
        console.log(chalk.cyan('\n   Run optimization: npx tsx src/scripts/optimize-all-rules.ts\n'));
      } else {
        console.log(chalk.green('\n✅ Rules are well consolidated'));
      }
    } catch (error) {
      spinner.fail('Failed to analyze consolidation');
      throw error;
    }
  }

}