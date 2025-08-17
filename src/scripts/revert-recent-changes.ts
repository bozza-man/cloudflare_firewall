#!/usr/bin/env npx tsx

import { GatewayClient } from '../api/gateway-client.js';
import { config } from '../utils/config.js';

interface RevertOperation {
  listId: string;
  listName: string;
  domainsToRemove: string[];
  deleteList?: boolean;
}

const REVERT_OPERATIONS: RevertOperation[] = [
  {
    listId: '', // Will be populated from existing lists
    listName: 'Apple Services',
    domainsToRemove: [
      'configuration.apple.com.akadns.net',
      'gs-loc.ls-apple.com.akadns.net',
      'wallet.cdn-apple.com',
      'xp.itunes-apple.com.akadns.net',
      'metrics.icloud.com',
      'gdmf.v.aaplimg.com',
      'p69-contacts.icloud.com',
      'p143-contacts.icloud.com'
    ]
  },
  {
    listId: '', // Will be populated from existing lists
    listName: 'Social Media Sites',
    domainsToRemove: ['cdns.grindr.com']
  },
  {
    listId: '', // Will be populated from existing lists
    listName: 'Google Services',
    domainsToRemove: [
      'gcs-blue-upload-us.l.googleusercontent.com',
      'gcs-blue-download-us.l.googleusercontent.com'
    ]
  },
  {
    listId: '', // Will be populated from existing lists
    listName: 'IoT and Smart Devices',
    domainsToRemove: ['mqtt.crealitycloud.com'],
    deleteList: true
  },
  {
    listId: '', // Will be populated from existing lists
    listName: 'Miscellaneous Domains',
    domainsToRemove: ['bozza.au', 'ausyd2.icloud-content.com'],
    deleteList: true
  }
];

async function revertChanges() {
  console.log('🔄 Starting revert process...\n');
  
  const api = new GatewayClient();

  try {
    // Get all existing lists
    console.log('📋 Fetching existing Gateway Lists...');
    const lists = await api.listGatewayLists();
    console.log(`Found ${lists.length} lists\n`);

    // Map list names to IDs
    const listMap = new Map<string, string>();
    lists.forEach(list => {
      if (list.name) {
        listMap.set(list.name, list.id);
      }
    });

    // Process each revert operation
    for (const operation of REVERT_OPERATIONS) {
      const listId = listMap.get(operation.listName);
      
      if (!listId) {
        console.log(`⚠️  List "${operation.listName}" not found, skipping...`);
        continue;
      }

      operation.listId = listId;
      console.log(`🎯 Processing list: ${operation.listName} (${listId})`);

      if (operation.deleteList) {
        // Delete the entire list
        console.log(`🗑️  Deleting list "${operation.listName}"...`);
        try {
          await api.deleteGatewayList(listId);
          console.log(`✅ Successfully deleted list "${operation.listName}"\n`);
        } catch (error) {
          console.error(`❌ Failed to delete list "${operation.listName}":`, error);
        }
      } else {
        // Remove specific domains from the list
        try {
          // Get current list items
          const currentList = await api.getGatewayList(listId);
          if (!currentList || !currentList.items) {
            console.log(`⚠️  List "${operation.listName}" has no items, skipping...`);
            continue;
          }

          // Filter out domains to remove
          const currentDomains = currentList.items.map(item => item.value);
          const filteredDomains = currentDomains.filter(
            domain => !operation.domainsToRemove.includes(domain)
          );

          console.log(`  📝 Removing ${operation.domainsToRemove.length} domains:`);
          operation.domainsToRemove.forEach(domain => {
            console.log(`     - ${domain}`);
          });

          // Update the list with filtered domains
          const updatedList = await api.updateGatewayList({
            id: listId,
            name: operation.listName,
            description: currentList.description,
            items: filteredDomains.map(domain => ({ value: domain }))
          });

          console.log(`✅ Successfully updated "${operation.listName}" - removed ${operation.domainsToRemove.length} domains\n`);
        } catch (error) {
          console.error(`❌ Failed to update list "${operation.listName}":`, error);
        }
      }
    }

    console.log('🎉 Revert process completed!');
    console.log('\nSummary of reverted changes:');
    console.log('- Removed 8 domains from Apple Services list');
    console.log('- Removed 1 domain from Social Media Sites list');
    console.log('- Removed 2 domains from Google Services list');
    console.log('- Deleted "IoT and Smart Devices" list');
    console.log('- Deleted "Miscellaneous Domains" list');

  } catch (error) {
    console.error('💥 Error during revert process:', error);
    process.exit(1);
  }
}

// Run the revert process
revertChanges().catch(console.error);
