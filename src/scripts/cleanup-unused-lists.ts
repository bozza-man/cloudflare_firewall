#!/usr/bin/env tsx

import { GatewayClient } from '../api/gateway-client.js';
import type { GatewayRule, GatewayList } from '../types/gateway.js';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

interface UnusedList {
  list: GatewayList;
  itemCount: number;
  lastModified?: string;
}

class UnusedListCleaner {
  private gateway: GatewayClient;

  constructor() {
    this.gateway = new GatewayClient();
  }

  async analyze(): Promise<void> {
    const spinner = ora('Analyzing Gateway Lists usage...').start();

    try {
      // Fetch current rules and lists
      const [rules, lists] = await Promise.all([
        this.gateway.listGatewayRules(),
        this.gateway.listGatewayLists()
      ]);

      spinner.succeed('Analysis complete');

      // Find which lists are actually used in rules
      const usedListIds = this.findUsedListIds(rules);
      
      // Identify unused lists
      const unusedLists = lists.filter(list => !usedListIds.has(list.id));
      
      if (unusedLists.length === 0) {
        console.log(chalk.green('\n✅ All Gateway Lists are currently in use. No cleanup needed!'));
        return;
      }

      // Prepare unused list details
      const unusedListDetails: UnusedList[] = unusedLists.map(list => ({
        list,
        itemCount: (list.items || []).length,
        lastModified: list.updated_at || list.created_at
      }));

      // Sort by item count (larger lists first)
      unusedListDetails.sort((a, b) => b.itemCount - a.itemCount);

      // Display unused lists
      console.log(chalk.bold.red(`\n🗑️  Found ${unusedLists.length} unused Gateway Lists:\n`));
      
      unusedListDetails.forEach((item, index) => {
        console.log(`${index + 1}. ${chalk.bold(item.list.name)}`);
        console.log(`   Type: ${item.list.type}`);
        console.log(`   Items: ${item.itemCount}`);
        if (item.lastModified) {
          console.log(`   Last modified: ${new Date(item.lastModified).toLocaleDateString()}`);
        }
        console.log(`   ID: ${chalk.gray(item.list.id)}`);
        console.log();
      });

      // Calculate total items that would be deleted
      const totalItems = unusedListDetails.reduce((sum, item) => sum + item.itemCount, 0);
      console.log(chalk.yellow(`Total: ${unusedLists.length} lists with ${totalItems} items`));

      // Ask user how to proceed
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'How would you like to proceed?',
          choices: [
            { name: 'Delete all unused lists', value: 'deleteAll' },
            { name: 'Review and delete individually', value: 'interactive' },
            { name: 'Export list details (dry run)', value: 'export' },
            { name: 'Cancel', value: 'cancel' }
          ]
        }
      ]);

      switch (action) {
        case 'deleteAll':
          await this.deleteAllUnusedLists(unusedListDetails);
          break;
        case 'interactive':
          await this.interactiveDelete(unusedListDetails);
          break;
        case 'export':
          await this.exportListDetails(unusedListDetails);
          break;
        case 'cancel':
          console.log(chalk.yellow('\nCleanup cancelled.'));
          break;
      }

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
      process.exit(1);
    }
  }

  private findUsedListIds(rules: GatewayRule[]): Set<string> {
    const usedIds = new Set<string>();
    
    for (const rule of rules) {
      for (const filter of rule.filters) {
        // Extract list IDs from filters (format: $list-id)
        const listMatches = filter.match(/\$([a-f0-9-]+)/g);
        if (listMatches) {
          listMatches.forEach(match => {
            const listId = match.substring(1); // Remove the $ prefix
            usedIds.add(listId);
          });
        }
      }
    }
    
    return usedIds;
  }

  private async deleteAllUnusedLists(unusedLists: UnusedList[]): Promise<void> {
    console.log(chalk.bold.yellow(`\n⚠️  This will delete ${unusedLists.length} lists permanently!`));
    
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you absolutely sure you want to delete all unused lists?',
        default: false
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Deletion cancelled.'));
      return;
    }

    const spinner = ora('Deleting unused lists...').start();
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ list: string; error: any }> = [];

    for (const item of unusedLists) {
      try {
        spinner.text = `Deleting: ${item.list.name}`;
        await this.gateway.deleteGatewayList(item.list.id);
        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({ list: item.list.name, error });
      }
    }

    if (errorCount === 0) {
      spinner.succeed(`Successfully deleted ${successCount} unused lists!`);
    } else {
      spinner.warn(`Deleted ${successCount} lists, but ${errorCount} failed`);
      
      console.log(chalk.red('\nFailed deletions:'));
      errors.forEach(({ list, error }) => {
        console.log(`  - ${list}: ${error.message || error}`);
      });
    }

    console.log(chalk.green(`\n✅ Cleanup complete! Deleted ${successCount} unused lists.`));
  }

  private async interactiveDelete(unusedLists: UnusedList[]): Promise<void> {
    console.log(chalk.cyan('\n📋 Interactive deletion mode\n'));
    
    let deletedCount = 0;
    let skippedCount = 0;

    for (const item of unusedLists) {
      console.log(chalk.bold(`\nList: ${item.list.name}`));
      console.log(`Type: ${item.list.type}`);
      console.log(`Items: ${item.itemCount}`);
      
      // Show sample items if available
      if (item.list.items && item.list.items.length > 0) {
        const sampleItems = item.list.items.slice(0, 3);
        console.log('Sample items:');
        sampleItems.forEach(listItem => {
          const value = typeof listItem === 'string' ? listItem : listItem.value;
          console.log(`  - ${value}`);
        });
        if (item.list.items.length > 3) {
          console.log(`  ... and ${item.list.items.length - 3} more`);
        }
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do with this list?',
          choices: [
            { name: 'Delete', value: 'delete' },
            { name: 'Keep', value: 'keep' },
            { name: 'Skip remaining and exit', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        break;
      }

      if (action === 'delete') {
        const spinner = ora(`Deleting ${item.list.name}...`).start();
        try {
          await this.gateway.deleteGatewayList(item.list.id);
          spinner.succeed(`Deleted ${item.list.name}`);
          deletedCount++;
        } catch (error) {
          spinner.fail(`Failed to delete ${item.list.name}`);
          console.error(chalk.red('Error:'), error);
        }
      } else {
        skippedCount++;
        console.log(chalk.yellow(`Kept ${item.list.name}`));
      }
    }

    console.log(chalk.green(`\n✅ Interactive cleanup complete!`));
    console.log(`   Deleted: ${deletedCount} lists`);
    console.log(`   Kept: ${skippedCount} lists`);
  }

  private async exportListDetails(unusedLists: UnusedList[]): Promise<void> {
    console.log(chalk.cyan('\n📄 Unused Lists Report\n'));
    console.log('=' .repeat(80));
    
    // Group by type
    const byType = new Map<string, UnusedList[]>();
    
    for (const item of unusedLists) {
      const type = item.list.type;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(item);
    }

    // Display by type
    for (const [type, items] of byType) {
      console.log(chalk.bold(`\n${type} Lists (${items.length}):`));
      console.log('-'.repeat(40));
      
      items.forEach(item => {
        console.log(`\n  ${chalk.bold(item.list.name)}`);
        console.log(`    ID: ${item.list.id}`);
        console.log(`    Items: ${item.itemCount}`);
        
        // Show first few items as examples
        if (item.list.items && item.list.items.length > 0) {
          console.log('    Sample items:');
          item.list.items.slice(0, 5).forEach(listItem => {
            const value = typeof listItem === 'string' ? listItem : listItem.value;
            console.log(`      - ${value}`);
          });
          if (item.list.items.length > 5) {
            console.log(`      ... and ${item.list.items.length - 5} more`);
          }
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold('Summary:'));
    console.log(`  Total unused lists: ${unusedLists.length}`);
    console.log(`  Total items in unused lists: ${unusedLists.reduce((sum, item) => sum + item.itemCount, 0)}`);
    
    // Show cleanup command
    console.log(chalk.yellow('\n💡 To delete these lists, run this script again and choose "Delete all unused lists"'));
  }

  async checkForDuplicateContent(): Promise<void> {
    const spinner = ora('Checking for lists with duplicate content...').start();

    try {
      const lists = await this.gateway.listGatewayLists();
      spinner.succeed('Analysis complete');

      // Find lists with identical content
      const contentMap = new Map<string, GatewayList[]>();
      
      for (const list of lists) {
        if (list.type === 'DOMAIN' && list.items) {
          // Create a sorted string of items for comparison
          const items = (list.items || []).map(item => 
            typeof item === 'string' ? item : item.value
          ).sort();
          const contentKey = items.join('|');
          
          if (!contentMap.has(contentKey)) {
            contentMap.set(contentKey, []);
          }
          contentMap.get(contentKey)!.push(list);
        }
      }

      // Find duplicates
      const duplicateGroups = Array.from(contentMap.values()).filter(group => group.length > 1);
      
      if (duplicateGroups.length === 0) {
        console.log(chalk.green('\n✅ No duplicate list content found!'));
        return;
      }

      console.log(chalk.yellow(`\n⚠️  Found ${duplicateGroups.length} groups of lists with identical content:\n`));
      
      duplicateGroups.forEach((group, index) => {
        console.log(`${index + 1}. Duplicate group (${group.length} lists):`);
        group.forEach(list => {
          console.log(`   - ${list.name} (ID: ${list.id})`);
        });
        const itemCount = (group[0].items || []).length;
        console.log(`   Content: ${itemCount} identical items`);
        console.log();
      });

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red('Error:'), error);
    }
  }
}

// Main execution
async function main() {
  const cleaner = new UnusedListCleaner();
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'Find and clean up unused lists', value: 'cleanup' },
        { name: 'Check for duplicate list content', value: 'duplicates' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'cleanup':
      await cleaner.analyze();
      break;
    case 'duplicates':
      await cleaner.checkForDuplicateContent();
      break;
    case 'exit':
      console.log(chalk.yellow('Goodbye!'));
      break;
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
