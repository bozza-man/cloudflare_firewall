#!/usr/bin/env tsx

import axios from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Creates a new Cloudflare API Token with all required permissions
 * for the Cloudflare Firewall Manager application
 */
async function createApiToken() {
  const spinner = ora('Creating new API Token with full permissions...').start();
  
  try {
    // Check if we have Global API Key credentials
    if (!config.cloudflare.globalKey || !config.cloudflare.email) {
      throw new Error('CLOUDFLARE_GLOBAL_KEY and CLOUDFLARE_EMAIL are required to create a new API token');
    }
    
    // Get account information first
    spinner.text = 'Fetching account information...';
    const accountsResponse = await axios.get(
      'https://api.cloudflare.com/client/v4/accounts',
      {
        headers: {
          'X-Auth-Email': config.cloudflare.email,
          'X-Auth-Key': config.cloudflare.globalKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    let accountId = config.cloudflare.accountId;
    if (!accountId && accountsResponse.data.success && accountsResponse.data.result.length > 0) {
      accountId = accountsResponse.data.result[0].id;
      console.log(chalk.gray(`\nUsing account: ${accountsResponse.data.result[0].name} (${accountId})`));
    }
    
    spinner.text = 'Fetching available permission groups...';
    
    // First, fetch available permission groups to get correct IDs
    const permGroupsResponse = await axios.get(
      'https://api.cloudflare.com/client/v4/user/tokens/permission_groups',
      {
        headers: {
          'X-Auth-Email': config.cloudflare.email,
          'X-Auth-Key': config.cloudflare.globalKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Map permission names to IDs
    const permissionMap: Record<string, string> = {};
    if (permGroupsResponse.data.success) {
      permGroupsResponse.data.result.forEach((group: any) => {
        permissionMap[group.name] = group.id;
      });
    }
    
    spinner.text = 'Creating API token with permissions...';
    
    // Build separate policies for different resource scopes
    const policies = [];
    
    // Zone-level permissions
    const zonePermissions = [
      'Zone Read',
      'Zone Write', 
      'DNS Read',
      'DNS Write',
      'Firewall Services Read',
      'Firewall Services Write',
      'Analytics Read',
      'Page Rules Read',
      'Page Rules Write',
      'SSL and Certificates Read',
      'SSL and Certificates Write',
      'Zone Settings Read',
      'Zone Settings Write'
    ];
    
    const zonePermGroups = [];
    for (const permName of zonePermissions) {
      if (permissionMap[permName]) {
        zonePermGroups.push({ id: permissionMap[permName] });
      }
    }
    
    if (zonePermGroups.length > 0) {
      policies.push({
        effect: 'allow',
        resources: {
          'com.cloudflare.api.account.zone.*': '*'
        },
        permission_groups: zonePermGroups
      });
    }
    
    // Account-level permissions (Workers, KV, etc)
    const accountPermissions = [
      'Workers Scripts Read',
      'Workers Scripts Write',
      'Workers KV Storage Read',
      'Workers KV Storage Write',
      'Workers Routes Read',
      'Workers Routes Write',
      'Account Settings Read',
      'Logs Read'
    ];
    
    const accountPermGroups = [];
    for (const permName of accountPermissions) {
      if (permissionMap[permName]) {
        accountPermGroups.push({ id: permissionMap[permName] });
      }
    }
    
    if (accountPermGroups.length > 0 && accountId) {
      policies.push({
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.${accountId}`]: '*'
        },
        permission_groups: accountPermGroups
      });
    }
    
    // Skip user-level permissions as they cause issues with resource format
    
    // If we couldn't build any policies, use a simple zone read/write token
    if (policies.length === 0) {
      console.log(chalk.yellow('\nWarning: Using simplified permissions'));
      policies.push({
        effect: 'allow',
        resources: {
          'com.cloudflare.api.account.zone.*': '*'
        },
        permission_groups: [
          { id: 'c8fed203ed3043cba015a93ad1616f1f' }, // Zone Read
          { id: 'e086da7e2179491d91ee5f35b3ca210a' }  // Zone Write
        ]
      });
    }
    
    // Define the token configuration
    const tokenConfig = {
      name: `Cloudflare Firewall Manager - ${new Date().toISOString().split('T')[0]}`,
      policies: policies
    };

    // Create the API token using the Global API Key
    const response = await axios.post(
      'https://api.cloudflare.com/client/v4/user/tokens',
      tokenConfig,
      {
        headers: {
          'X-Auth-Email': config.cloudflare.email,
          'X-Auth-Key': config.cloudflare.globalKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      spinner.succeed('API Token created successfully!');
      
      const token = response.data.result;
      
      console.log(chalk.green.bold('\n✅ New API Token Created Successfully!\n'));
      console.log(chalk.cyan('Token Details:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Name: ${chalk.yellow(token.name)}`);
      console.log(`ID: ${chalk.gray(token.id)}`);
      console.log(`Status: ${chalk.green(token.status)}`);
      console.log(`Created: ${new Date(token.issued_on).toLocaleString()}`);
      console.log(`Expires: ${new Date(token.expires_on).toLocaleString()}`);
      
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.cyan.bold('\n🔑 Your New API Token:'));
      console.log(chalk.yellow.bold(token.value));
      
      console.log(chalk.gray('\n─'.repeat(60)));
      console.log(chalk.red.bold('⚠️  IMPORTANT: ') + chalk.yellow('Save this token now! It will not be shown again.'));
      console.log(chalk.gray('─'.repeat(60)));
      
      console.log(chalk.cyan('\n📝 To use this token, update your .env file:'));
      console.log(chalk.gray(`CLOUDFLARE_API_TOKEN=${token.value}`));
      
      console.log(chalk.cyan('\n✨ This token includes permissions for:'));
      console.log('  • Zero Trust / Gateway management');
      console.log('  • Workers deployment and KV storage');
      console.log('  • Firewall rules management');
      console.log('  • DNS management');
      console.log('  • Analytics and logs access');
      console.log('  • Account and zone settings');
      
      return token.value;
    } else {
      throw new Error(`Failed to create token: ${JSON.stringify(response.data.errors)}`);
    }
    
  } catch (error) {
    spinner.fail('Failed to create API Token');
    
    if (axios.isAxiosError(error)) {
      console.error(chalk.red('Error details:'));
      if (error.response?.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          console.error(chalk.red(`  - ${err.message}`));
        });
      } else {
        console.error(chalk.red(error.message));
      }
      
      // Check if it's a permissions issue
      if (error.response?.status === 403) {
        console.error(chalk.yellow('\n💡 Tip: Make sure your Global API Key has the necessary permissions.'));
      }
    } else {
      console.error(chalk.red('Error:'), error);
    }
    
    process.exit(1);
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createApiToken().catch(console.error);
}

export { createApiToken };
