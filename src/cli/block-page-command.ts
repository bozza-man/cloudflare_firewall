/**
 * CLI Command for Dynamic Block Page Management
 * Configure and deploy custom block pages for Gateway rules
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { GatewayClient } from '../api/gateway-client.js';
import { BlockPageConfigurator, BlockPageSettings } from '../rules/block-page-config.js';
import { config } from '../utils/config.js';

export class BlockPageCommand {
  public getCommand(): Command {
    const program = new Command('block-page');
    
    program
      .description('Manage dynamic block page configuration for Gateway rules')
      .version('1.0.0');

    // Deploy block page Worker
    program
      .command('deploy')
      .description('Deploy the dynamic block page Worker to Cloudflare')
  .option('--account-id <id>', 'Cloudflare account ID')
  .option('--domain <domain>', 'Custom domain for block page')
  .option('--debug', 'Enable debug mode')
  .action(async (options) => {
    const spinner = ora('Deploying dynamic block page Worker...').start();
    
    try {
      // Validate configuration
      if (!config.cloudflare.accountId && !options.accountId) {
        spinner.fail('Account ID is required');
        process.exit(1);
      }

      const domain = options.domain || 'block.example.com';
      
      console.log(chalk.cyan('\n📋 Deployment Configuration:'));
      console.log(`   Account ID: ${options.accountId || config.cloudflare.accountId}`);
      console.log(`   Domain: ${domain}`);
      console.log(`   Debug Mode: ${options.debug ? 'Enabled' : 'Disabled'}`);
      
      // Run deployment script
      const { execSync } = await import('child_process');
      
      const env = {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: options.accountId || config.cloudflare.accountId,
        CLOUDFLARE_API_TOKEN: config.cloudflare.apiToken || '',
        BLOCK_PAGE_DOMAIN: domain,
        DEBUG_MODE: options.debug ? 'true' : 'false'
      };
      
      execSync('./scripts/deploy-block-page.sh', { 
        stdio: 'inherit',
        env 
      });
      
      spinner.succeed('Block page Worker deployed successfully!');
      
      console.log(chalk.green('\n✅ Next Steps:'));
      console.log('1. Update your Access applications to use the custom block page');
      console.log(`2. Set block page URL to: https://${domain}/access-denied`);
      if (options.debug) {
        console.log(`3. Visit https://${domain}/debug to configure theme`);
      }
    } catch (error) {
      spinner.fail('Failed to deploy block page Worker');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

    // Configure block page for rules
    program
      .command('configure')
  .description('Configure dynamic block page for Gateway rules')
  .option('--url <url>', 'Block page URL')
  .option('--all', 'Apply to all blocking rules')
  .option('--rule <id>', 'Apply to specific rule ID')
  .option('--message <message>', 'Custom message to display')
  .option('--support <email>', 'Support contact email')
  .action(async (options) => {
    const spinner = ora('Configuring block page settings...').start();
    
    try {
      const client = new GatewayClient();
      const configurator = new BlockPageConfigurator(client, options.url);
      
      // Interactive configuration if no options provided
      if (!options.all && !options.rule) {
        spinner.stop();
        
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'scope',
            message: 'Apply block page configuration to:',
            choices: [
              { name: 'All blocking rules', value: 'all' },
              { name: 'Specific rule', value: 'specific' },
              { name: 'New rule', value: 'new' }
            ]
          }
        ]);
        
        if (answers.scope === 'all') {
          options.all = true;
        } else if (answers.scope === 'specific') {
          const rules = await client.listGatewayRules();
          const blockingRules = rules.filter(r => r.action === 'block');
          
          const ruleAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'ruleId',
              message: 'Select rule to configure:',
              choices: blockingRules.map(r => ({
                name: `${r.name} (${r.description || 'No description'})`,
                value: r.id
              }))
            }
          ]);
          
          options.rule = ruleAnswer.ruleId;
        } else {
          // Create new rule with block page
          await createNewRuleWithBlockPage(client, configurator);
          return;
        }
        
        spinner.start('Configuring block page settings...');
      }
      
      // Build block page settings
      const settings: BlockPageSettings = {
        enabled: true,
        url: options.url,
        customMessage: options.message,
        supportContact: options.support,
        showRuleName: true,
        showCategory: true,
        showUserInfo: true
      };
      
      // Validate settings
      if (!configurator.validateBlockPageConfig(settings)) {
        spinner.fail('Invalid block page configuration');
        process.exit(1);
      }
      
      // Apply configuration
      if (options.all) {
        const updatedRules = await configurator.enableBlockPageForAllRules(settings);
        spinner.succeed(`Block page enabled for ${updatedRules.length} rules`);
        
        console.log(chalk.green('\n✅ Updated Rules:'));
        updatedRules.forEach(rule => {
          console.log(`   - ${rule.name}`);
        });
      } else if (options.rule) {
        const updated = await configurator.updateRuleWithBlockPage(options.rule, {
          block_page_settings: settings
        });
        spinner.succeed(`Block page configured for rule: ${updated.name}`);
      }
      
    } catch (error) {
      spinner.fail('Failed to configure block page');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

    // Show block page status
    program
      .command('status')
  .description('Show block page configuration status')
  .action(async () => {
    const spinner = ora('Fetching block page status...').start();
    
    try {
      const client = new GatewayClient();
      const rules = await client.listGatewayRules();
      
      const blockingRules = rules.filter(r => r.action === 'block');
      const rulesWithBlockPage = blockingRules.filter(r => 
        r.rule_settings?.block_page?.enabled
      );
      
      spinner.stop();
      
      console.log(chalk.cyan('\n📊 Block Page Status:'));
      console.log(`   Total blocking rules: ${blockingRules.length}`);
      console.log(`   Rules with custom block page: ${rulesWithBlockPage.length}`);
      console.log(`   Rules without block page: ${blockingRules.length - rulesWithBlockPage.length}`);
      
      if (rulesWithBlockPage.length > 0) {
        console.log(chalk.green('\n✅ Rules with Block Page:'));
        rulesWithBlockPage.forEach(rule => {
          const blockPage = rule.rule_settings?.block_page;
          console.log(`   - ${rule.name}`);
          if (blockPage?.url) {
            console.log(`     URL: ${blockPage.url}`);
          }
        });
      }
      
      if (blockingRules.length > rulesWithBlockPage.length) {
        console.log(chalk.yellow('\n⚠️  Rules without Block Page:'));
        blockingRules
          .filter(r => !r.rule_settings?.block_page?.enabled)
          .forEach(rule => {
            console.log(`   - ${rule.name}`);
          });
      }
      
    } catch (error) {
      spinner.fail('Failed to fetch block page status');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

    // Analytics command
    program
      .command('analytics')
  .description('View block page analytics')
  .option('--days <days>', 'Number of days to analyze', '7')
  .action(async (options) => {
    const spinner = ora('Fetching block page analytics...').start();
    
    try {
      const client = new GatewayClient();
      const configurator = new BlockPageConfigurator(client);
      
      const endTime = new Date();
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - parseInt(options.days));
      
      const analytics = await configurator.getBlockPageAnalytics(startTime, endTime);
      
      spinner.stop();
      
      console.log(chalk.cyan(`\n📈 Block Page Analytics (Last ${options.days} days):`));
      console.log(`   Total blocks: ${analytics.totalBlocks}`);
      console.log(`   Unique users affected: ${analytics.uniqueUsers}`);
      
      if (analytics.topBlockedDomains.length > 0) {
        console.log(chalk.yellow('\n🚫 Top Blocked Domains:'));
        analytics.topBlockedDomains.slice(0, 10).forEach((domain, i) => {
          console.log(`   ${i + 1}. ${domain}`);
        });
      }
      
      const topRules = Object.entries(analytics.blocksByRule)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      
      if (topRules.length > 0) {
        console.log(chalk.red('\n📋 Top Blocking Rules:'));
        topRules.forEach(([ruleName, count]) => {
          console.log(`   - ${ruleName}: ${count} blocks`);
        });
      }
      
    } catch (error) {
      spinner.fail('Failed to fetch analytics');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  });

    // Set organization-wide block page
    program
      .command('set-org')
      .description('Set the organization-wide block page URL in Zero Trust')
      .option('--url <url>', 'Block page URL (e.g., https://block.bozza.au/access-denied)')
      .option('--email <email>', 'Support email address', 'it-support@bozza.au')
      .option('--footer <text>', 'Footer text for block page')
      .action(async (options) => {
        const spinner = ora('Updating organization block page settings...').start();
        
        try {
          // Import the update function
          const { updateOrganizationBlockPage, getOrganizationSettings } = await import('../scripts/update-org-block-page.js');
          
          // If no URL provided, prompt for it
          let blockPageUrl = options.url;
          if (!blockPageUrl) {
            spinner.stop();
            const answers = await inquirer.prompt([
              {
                type: 'input',
                name: 'url',
                message: 'Enter the block page URL:',
                default: 'https://block.bozza.au/access-denied',
                validate: (input) => {
                  try {
                    new URL(input);
                    return true;
                  } catch {
                    return 'Please enter a valid URL';
                  }
                }
              }
            ]);
            blockPageUrl = answers.url;
            spinner.start('Updating organization block page settings...');
          }
          
          // Get current settings first
          spinner.text = 'Fetching current organization settings...';
          const currentSettings = await getOrganizationSettings();
          
          spinner.stop();
          console.log(chalk.cyan('\n📋 Current Block Page Configuration:'));
          if (currentSettings.custom_pages?.forbidden) {
            console.log(`   Current URL: ${currentSettings.custom_pages.forbidden}`);
          } else {
            console.log('   No custom block page configured');
          }
          
          spinner.start('Applying new block page configuration...');
          
          // Update the organization settings
          await updateOrganizationBlockPage(blockPageUrl);
          
          spinner.succeed('Organization block page updated successfully!');
          
          console.log(chalk.green('\n✅ Organization Settings Updated:'));
          console.log(`   Block Page URL: ${blockPageUrl}`);
          console.log(`   Support Email: ${options.email}`);
          if (options.footer) {
            console.log(`   Footer Text: ${options.footer}`);
          }
          console.log('\n' + chalk.yellow('Note: Changes may take a few minutes to propagate'));
          console.log(chalk.cyan('Test by visiting a blocked site to see your custom block page'));
          
        } catch (error) {
          spinner.fail('Failed to update organization block page');
          console.error(chalk.red('Error:'), error);
          process.exit(1);
        }
      });

    return program;
  }
}

// Helper function to create new rule with block page
async function createNewRuleWithBlockPage(
  client: GatewayClient,
  configurator: BlockPageConfigurator
): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Rule name:',
      validate: (input) => input.length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Rule description:'
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Domain to block (e.g., facebook.com):',
      validate: (input) => input.length > 0 || 'Domain is required'
    },
    {
      type: 'input',
      name: 'blockPageUrl',
      message: 'Block page URL:',
      default: 'https://block.example.com/access-denied'
    },
    {
      type: 'input',
      name: 'customMessage',
      message: 'Custom message for users:'
    },
    {
      type: 'input',
      name: 'supportEmail',
      message: 'Support contact email:',
      default: 'it-support@example.com'
    }
  ]);
  
  const spinner = ora('Creating rule with block page...').start();
  
  try {
    const rule = await configurator.createRuleWithBlockPage({
      name: answers.name,
      description: answers.description,
      action: 'block',
      filters: [`dns.fqdn == "${answers.domain}"`],
      block_page_settings: {
        enabled: true,
        url: answers.blockPageUrl,
        customMessage: answers.customMessage,
        supportContact: answers.supportEmail,
        showRuleName: true,
        showCategory: true,
        showUserInfo: true
      }
    });
    
    spinner.succeed(`Rule created: ${rule.name}`);
    console.log(chalk.green('✅ Block page configured successfully!'));
  } catch (error) {
    spinner.fail('Failed to create rule');
    throw error;
  }
}
