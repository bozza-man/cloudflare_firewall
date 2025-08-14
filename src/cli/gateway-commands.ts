import { Command } from 'commander';
import chalk from 'chalk';
import { GatewayRuleManager } from '../rules/gateway-rule-manager.js';
import { RuleOptimizer } from '../rules/rule-optimizer.js';
import { DomainConflictDetector } from '../rules/domain-conflict-detector.js';
import type { GatewayRule, GatewayList, GatewayCategory } from '../types/gateway.js';
import inquirer from 'inquirer';
import ora from 'ora';

export function createGatewayCommands(): Command {
  const program = new Command();
  const ruleManager = new GatewayRuleManager();

  program
    .name('cf-gateway')
    .description('Intelligent Cloudflare Zero Trust Gateway manager with AI assistance')
    .version('1.0.0');

  // Rules commands
  const rules = program.command('rules').description('Manage Gateway rules');

  rules
    .command('list')
    .description('List all Gateway rules')
    .option('-v, --verbose', 'Show detailed rule information')
    .action(async (options) => {
      try {
        const rules = await ruleManager.listRules();
        displayRules(rules, options.verbose);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('create')
    .description('Create a new Gateway rule with conflict analysis')
    .option('-n, --name <name>', 'Rule name')
    .option('-f, --filters <filters...>', 'Rule filters')
    .option('-a, --action <action>', 'Rule action')
    .option('-t, --traffic <type>', 'Traffic type (http, dns, l4)')
    .option('-d, --description <description>', 'Natural language description to generate rule')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (options) => {
      try {
        let rule;
        
        if (options.description) {
          rule = await ruleManager.createRuleFromDescription(options.description);
        } else if (options.interactive || !options.name || !options.filters || !options.action) {
          const ruleData = await promptRuleCreation(options);
          rule = await ruleManager.createRule(ruleData);
        } else {
          rule = await ruleManager.createRule({
            name: options.name,
            filters: options.filters,
            action: options.action as 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect',
            traffic: options.traffic
          });
        }

        console.log(chalk.green('\n✓ Rule created successfully!'));
        displayRules([rule], true);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('update <ruleId>')
    .description('Update an existing Gateway rule')
    .option('-n, --name <name>', 'New rule name')
    .option('-f, --filters <filters...>', 'New rule filters')
    .option('-a, --action <action>', 'New rule action')
    .option('-e, --enabled <enabled>', 'Enable/disable rule (true/false)')
    .option('-p, --precedence <precedence>', 'New precedence value')
    .action(async (ruleId, options) => {
      try {
        const updateData: {
          id: string;
          name?: string;
          filters?: string[];
          action?: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
          enabled?: boolean;
          precedence?: number;
        } = { id: ruleId };
        
        if (options.name) updateData.name = options.name;
        if (options.filters) updateData.filters = options.filters;
        if (options.action) updateData.action = options.action as 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
        if (options.enabled !== undefined) updateData.enabled = options.enabled === 'true';
        if (options.precedence) updateData.precedence = parseInt(options.precedence);

        const rule = await ruleManager.updateRule(updateData);
        console.log(chalk.green('\n✓ Rule updated successfully!'));
        displayRules([rule], true);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('delete <ruleId>')
    .description('Delete a Gateway rule')
    .option('-f, --force', 'Skip confirmation')
    .action(async (ruleId, options) => {
      try {
        if (!options.force) {
          if (process.stdin.isTTY) {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to delete rule ${ruleId}?`,
                default: false
              }
            ]);
            
            if (!confirm) {
              console.log('Deletion cancelled');
              return;
            }
          } else {
            console.log(chalk.yellow('Non-interactive mode: Use --force to skip confirmation'));
            console.log('Deletion cancelled');
            return;
          }
        }

        await ruleManager.deleteRule(ruleId);
        console.log(chalk.green(`\n✓ Rule ${ruleId} deleted successfully!`));
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('explain <ruleId>')
    .description('Get an AI explanation of a Gateway rule')
    .action(async (ruleId) => {
      try {
        const explanation = await ruleManager.explainRule(ruleId);
        console.log(chalk.cyan('\n📖 Rule Explanation:\n'));
        console.log(explanation);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('analyze')
    .description('Analyze all rules and suggest optimizations using AI and best practices')
    .option('--auto-fix', 'Automatically apply recommended optimizations')
    .option('--dry-run', 'Show what would be changed without making actual changes')
    .option('-i, --interactive', 'Interactively approve each optimization')
    .action(async (options) => {
      try {
        const optimizer = new RuleOptimizer();
        await optimizer.analyzeAndOptimize({
          autoFix: options.autoFix,
          dryRun: options.dryRun,
          interactive: options.interactive
        });
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  rules
    .command('conflicts')
    .description('Analyze existing rules for domain-based conflicts and contradictions')
    .option('--show-redundant', 'Show redundant rules with same actions')
    .option('--fix-suggestions', 'Show consolidation and fix suggestions')
    .action(async (options) => {
      try {
        await analyzeRuleConflicts(ruleManager, options);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  // Lists commands
  const lists = program.command('lists').description('Manage Gateway lists');

  lists
    .command('list')
    .description('List all Gateway lists')
    .action(async () => {
      try {
        const lists = await ruleManager.listLists();
        displayLists(lists);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  // Categories command
  program
    .command('categories')
    .description('List all Gateway content and security categories')
    .option('-c, --class <class>', 'Filter by class')
    .action(async (options) => {
      try {
        const categories = await ruleManager.listCategories();
        displayCategories(categories, options.class);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  // Locations command
  program
    .command('locations')
    .description('List all Gateway locations')
    .action(async () => {
      try {
        const locations = await ruleManager.listLocations();
        displayLocations(locations);
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return program;
}

function displayRules(rules: GatewayRule[], verbose: boolean = false): void {
  if (rules.length === 0) {
    console.log(chalk.yellow('No rules found'));
    return;
  }

  console.log('\n' + chalk.bold('Gateway Rules:'));
  
  rules.forEach((rule, index) => {
    const statusIcon = rule.enabled ? '✅' : '⏸️ ';
    const actionColor = {
      block: chalk.red,
      allow: chalk.green,
      isolate: chalk.yellow,
      do_not_isolate: chalk.cyan,
      do_not_inspect: chalk.blue,
      inspect: chalk.magenta
    }[rule.action] || chalk.white;

    console.log(`\n${index + 1}. ${statusIcon} ${chalk.bold(rule.name)}`);
    console.log(`   ID: ${chalk.gray(rule.id)}`);
    console.log(`   Action: ${actionColor(rule.action.toUpperCase())}`);
    console.log(`   Precedence: ${rule.precedence}`);
    console.log(`   Traffic: ${rule.traffic}`);
    
    if (verbose) {
      console.log(`   Filters: ${chalk.gray(JSON.stringify(rule.filters))}`);
      if (rule.description) {
        console.log(`   Description: ${rule.description}`);
      }
      if (rule.identity) {
        console.log(`   Identity: ${rule.identity}`);
      }
      if (rule.device_posture) {
        console.log(`   Device Posture: ${rule.device_posture}`);
      }
      console.log(`   Created: ${new Date(rule.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(rule.updated_at).toLocaleString()}`);
    }
  });
  console.log('');
}

function displayLists(lists: GatewayList[]): void {
  if (lists.length === 0) {
    console.log(chalk.yellow('No lists found'));
    return;
  }

  console.log('\n' + chalk.bold('Gateway Lists:'));
  
  lists.forEach((list, index) => {
    console.log(`\n${index + 1}. ${chalk.bold(list.name)}`);
    console.log(`   ID: ${chalk.gray(list.id)}`);
    console.log(`   Type: ${chalk.cyan(list.type)}`);
    console.log(`   Items: ${list.count}`);
    if (list.description) {
      console.log(`   Description: ${list.description}`);
    }
  });
  console.log('');
}

function displayCategories(categories: GatewayCategory[], filterClass?: string): void {
  let filtered = categories;
  if (filterClass) {
    filtered = categories.filter(c => c.class.toLowerCase() === filterClass.toLowerCase());
  }

  if (filtered.length === 0) {
    console.log(chalk.yellow('No categories found'));
    return;
  }

  console.log('\n' + chalk.bold('Gateway Categories:'));
  
  filtered.forEach((category) => {
    console.log(`\n${chalk.bold(category.name)} (ID: ${category.id})`);
    console.log(`   Class: ${chalk.cyan(category.class)}`);
    console.log(`   Description: ${category.description}`);
    if (category.subcategories && category.subcategories.length > 0) {
      console.log(`   Subcategories: ${category.subcategories.map(s => s.name).join(', ')}`);
    }
  });
  console.log('');
}

function displayLocations(locations: {
  id: string;
  name: string;
  client_default?: boolean;
  networks?: { network: string }[];
}[]): void {
  if (locations.length === 0) {
    console.log(chalk.yellow('No locations found'));
    return;
  }

  console.log('\n' + chalk.bold('Gateway Locations:'));
  
  locations.forEach((location, index) => {
    const defaultIcon = location.client_default ? '⭐' : '';
    console.log(`\n${index + 1}. ${defaultIcon} ${chalk.bold(location.name)}`);
    console.log(`   ID: ${chalk.gray(location.id)}`);
    if (location.networks && location.networks.length > 0) {
      console.log(`   Networks: ${location.networks.map((n) => n.network).join(', ')}`);
    }
  });
  console.log('');
}

async function promptRuleCreation(defaults: {
  name?: string;
  filters?: string[];
  action?: string;
  traffic?: string;
  description?: string;
}): Promise<{
  name: string;
  filters: string[];
  action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
  traffic: string;
  description?: string;
}> {
  const actions = ['block', 'allow', 'isolate', 'do_not_isolate', 'do_not_inspect'];
  const trafficTypes = ['http', 'dns', 'l4'];
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Enter the rule name:',
      default: defaults.name,
      validate: (input) => input.trim().length > 0 || 'Name is required'
    },
    {
      type: 'list',
      name: 'traffic',
      message: 'Select traffic type:',
      choices: trafficTypes,
      default: defaults.traffic || 'http'
    },
    {
      type: 'input',
      name: 'filters',
      message: 'Enter filter expressions (comma-separated):',
      default: defaults.filters?.join(', '),
      validate: (input) => input.trim().length > 0 || 'At least one filter is required',
      filter: (input) => input.split(',').map((f: string) => f.trim())
    },
    {
      type: 'list',
      name: 'action',
      message: 'Select the rule action:',
      choices: actions,
      default: defaults.action || 'block'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Enter a description (optional):',
      default: defaults.description
    }
  ]);

  return {
    name: answers.name,
    filters: answers.filters,
    action: answers.action,
    traffic: answers.traffic,
    description: answers.description
  };
}

async function analyzeRuleConflicts(ruleManager: GatewayRuleManager, options: {
  showRedundant?: boolean;
  fixSuggestions?: boolean;
}): Promise<void> {
  const spinner = ora('Fetching Gateway rules...').start();
  
  try {
    const rules = await ruleManager.listRules();
    spinner.succeed(`Found ${rules.length} Gateway rules`);
    
    if (rules.length === 0) {
      console.log(chalk.yellow('No rules found to analyze'));
      return;
    }

    spinner.start('Analyzing rules for domain-based conflicts...');
    const detector = new DomainConflictDetector();
    const allConflicts: Array<{
      type: string;
      severity: 'high' | 'medium' | 'low';
      description: string;
      affectedRules: string[];
      overlappingDomains: string[];
      suggestion: string;
      ruleDetails: { name: string; action: string; id: string }[];
    }> = [];
    
    // Check each rule against all others
    for (let i = 0; i < rules.length; i++) {
      const currentRule = rules[i];
      const otherRules = rules.slice(i + 1); // Only check rules that come after to avoid duplicates
      
      const conflicts = detector.detectConflicts(
        {
          name: currentRule.name,
          action: currentRule.action,
          filters: currentRule.filters,
          traffic: currentRule.traffic
        },
        otherRules
      );
      
      for (const conflict of conflicts) {
        // Add rule details for better display
        const ruleDetails = [
          { name: currentRule.name, action: currentRule.action, id: currentRule.id },
          ...conflict.affectedRules.map(ruleId => {
            const rule = rules.find(r => r.id === ruleId);
            return { 
              name: rule?.name || 'Unknown', 
              action: rule?.action || 'Unknown', 
              id: ruleId 
            };
          })
        ];
        
        allConflicts.push({
          ...conflict,
          ruleDetails
        });
      }
    }
    
    spinner.succeed('Conflict analysis complete');
    
    // Display results
    if (allConflicts.length === 0) {
      console.log(chalk.green('\n✅ No domain-based conflicts detected!'));
      console.log(chalk.gray('Your rules appear to be well-organized without contradictory domain filtering.'));
      return;
    }
    
    // Group conflicts by severity
    const highPriorityConflicts = allConflicts.filter(c => c.severity === 'high');
    const mediumPriorityConflicts = allConflicts.filter(c => c.severity === 'medium');
    // Removed unused variable lowPriorityConflicts
    
    console.log(chalk.bold.red(`\n🚨 Found ${allConflicts.length} potential conflicts:`));
    
    // Display high priority conflicts
    if (highPriorityConflicts.length > 0) {
      console.log(chalk.red('\n❌ HIGH PRIORITY CONFLICTS (Action Required):'));
      highPriorityConflicts.forEach((conflict, index) => {
        console.log(`\n   ${index + 1}. ${chalk.bold(conflict.type.replace('_', ' ').toUpperCase())}`);
        console.log(`      ${conflict.description}`);
        console.log(`      ${chalk.gray('Overlapping domains:')} ${conflict.overlappingDomains.join(', ')}`);
        console.log(`      ${chalk.gray('Affected rules:')}`);
        conflict.ruleDetails.forEach(rule => {
          const actionColor = rule.action === 'block' ? chalk.red : 
                              rule.action === 'allow' ? chalk.green : chalk.yellow;
          console.log(`        - ${rule.name} (${actionColor(rule.action)}) [${rule.id}]`);
        });
        console.log(`      ${chalk.cyan('💡 Suggestion:')} ${conflict.suggestion}`);
      });
    }
    
    // Display medium priority conflicts (redundant rules)
    if (mediumPriorityConflicts.length > 0 && (options.showRedundant || highPriorityConflicts.length === 0)) {
      console.log(chalk.yellow('\n⚠️  MEDIUM PRIORITY - REDUNDANT RULES:'));
      mediumPriorityConflicts.forEach((conflict, index) => {
        console.log(`\n   ${index + 1}. ${chalk.bold(conflict.type.replace('_', ' ').toUpperCase())}`);
        console.log(`      ${conflict.description}`);
        console.log(`      ${chalk.gray('Overlapping domains:')} ${conflict.overlappingDomains.join(', ')}`);
        console.log(`      ${chalk.gray('Affected rules:')}`);
        conflict.ruleDetails.forEach(rule => {
          const actionColor = rule.action === 'block' ? chalk.red : 
                              rule.action === 'allow' ? chalk.green : chalk.yellow;
          console.log(`        - ${rule.name} (${actionColor(rule.action)}) [${rule.id}]`);
        });
        console.log(`      ${chalk.cyan('💡 Suggestion:')} ${conflict.suggestion}`);
      });
    }
    
    // Show consolidation suggestions if requested
    if (options.fixSuggestions && mediumPriorityConflicts.length > 0) {
      console.log(chalk.blue('\n🔧 CONSOLIDATION OPPORTUNITIES:'));
      
      const redundantConflicts = mediumPriorityConflicts.slice(0, 3); // Limit to first 3 for clarity
      redundantConflicts.forEach((conflict, index) => {
        if (conflict.ruleDetails.length >= 2) {
          const rule1 = conflict.ruleDetails[0];
          const rule2 = conflict.ruleDetails[1];
          
          console.log(`\n   ${index + 1}. Merge "${rule1.name}" and "${rule2.name}"`);
          console.log(`      Both rules ${rule1.action} similar domains`);
          console.log(`      Consider consolidating into a single rule with combined domain filters`);
        }
      });
    }
    
    // Summary and recommendations
    console.log(chalk.bold('\n📊 SUMMARY:'));
    if (highPriorityConflicts.length > 0) {
      console.log(`   • ${chalk.red(highPriorityConflicts.length + ' critical conflicts')} need immediate attention`);
      console.log(`   • These may cause unexpected behavior in your Gateway filtering`);
    }
    if (mediumPriorityConflicts.length > 0) {
      console.log(`   • ${chalk.yellow(mediumPriorityConflicts.length + ' redundant rules')} could be consolidated`);
      console.log(`   • This would simplify rule management and improve performance`);
    }
    
    console.log(chalk.gray('\n💡 Use "rules analyze --interactive" for AI-powered optimization suggestions'));
    
  } catch (error) {
    spinner.fail('Failed to analyze rule conflicts');
    throw error;
  }
}
