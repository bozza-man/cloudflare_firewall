#!/usr/bin/env tsx

/**
 * Script to add MCP domains to the Critical Infrastructure Domains list
 */

import { GatewayClient } from './src/api/gateway-client.js';
import { config } from './src/utils/config.js';
import chalk from 'chalk';
import fs from 'fs/promises';

const mcpDomains = [
  'docs.mcp.cloudflare.com',
  'bindings.mcp.cloudflare.com',
  'builds.mcp.cloudflare.com',
  'observability.mcp.cloudflare.com',
  'radar.mcp.cloudflare.com',
  'containers.mcp.cloudflare.com',
  'browser.mcp.cloudflare.com',
  'logs.mcp.cloudflare.com',
  'ai-gateway.mcp.cloudflare.com',
  'autorag.mcp.cloudflare.com',
  'auditlogs.mcp.cloudflare.com',
  'dns-analytics.mcp.cloudflare.com',
  'dex.mcp.cloudflare.com',
  'casb.mcp.cloudflare.com',
  'graphql.mcp.cloudflare.com'
];

async function addMCPDomains() {
  console.log(chalk.bold.blue('🚀 Adding MCP Domains to Critical Infrastructure List\n'));

  try {
    const manager = new GatewayClient();

    // Fetch all lists to find the Critical Infrastructure Domains list
    console.log(chalk.cyan('📋 Fetching Gateway lists...'));
    const lists = await manager.listGatewayLists();
    
    // Find the Critical Infrastructure Domains list
    const criticalInfraList = lists.find(list => 
      list.name === 'Critical Infrastructure Domains'
    );

    if (!criticalInfraList) {
      console.error(chalk.red('❌ Critical Infrastructure Domains list not found!'));
      console.log(chalk.yellow('\nAvailable lists:'));
      lists.forEach(list => {
        console.log(chalk.gray(`  • ${list.name} (${list.count} items)`));
      });
      return;
    }

    console.log(chalk.green(`✅ Found Critical Infrastructure Domains list (ID: ${criticalInfraList.id})`));
    console.log(chalk.gray(`   Current items: ${criticalInfraList.count}`));

    // Get current list items
    const currentList = await manager.getGatewayList(criticalInfraList.id);
    const currentDomains = new Set(currentList.items?.map(item => item.value) || []);

    // Filter out domains that already exist
    const newDomains = mcpDomains.filter(domain => !currentDomains.has(domain));

    if (newDomains.length === 0) {
      console.log(chalk.yellow('⚠️  All MCP domains are already in the list!'));
      return;
    }

    console.log(chalk.cyan(`\n📝 Adding ${newDomains.length} new domains:`));
    newDomains.forEach(domain => {
      console.log(chalk.gray(`   • ${domain}`));
    });

    // Prepare items for addition
    const itemsToAdd = newDomains.map(domain => ({
      value: domain,
      description: `MCP Server - ${domain.split('.')[0].toUpperCase()}`
    }));

    // Add items to the list
    console.log(chalk.cyan('\n⏳ Adding domains to the list...'));
    // Combine existing items with new items
    const allItems = [...(currentList.items || []), ...itemsToAdd];
    await manager.updateGatewayList({
      id: criticalInfraList.id,
      items: allItems
    });

    console.log(chalk.green(`\n✅ Successfully added ${newDomains.length} MCP domains to Critical Infrastructure Domains list!`));

    // Verify the update
    const updatedList = await manager.getGatewayList(criticalInfraList.id);
    console.log(chalk.blue(`\n📊 Updated list stats:`));
    console.log(chalk.gray(`   • Total items: ${updatedList.count}`));
    console.log(chalk.gray(`   • List ID: ${updatedList.id}`));
    console.log(chalk.gray(`   • Last modified: ${new Date(updatedList.modified_on).toLocaleString()}`));

  } catch (error) {
    console.error(chalk.red('\n❌ Error adding domains:'), error);
    if (error instanceof Error) {
      console.error(chalk.red(`   ${error.message}`));
    }
  }
}

// Run the script
addMCPDomains().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
