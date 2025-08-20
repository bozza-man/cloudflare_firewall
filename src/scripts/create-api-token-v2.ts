#!/usr/bin/env tsx

import axios from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Creates a new Cloudflare API Token with simplified but comprehensive permissions
 * for the Cloudflare Firewall Manager application
 */
async function createApiToken() {
  const spinner = ora('Creating new API Token with full permissions...').start();
  
  try {
    // Check if we have Global API Key credentials
    if (!config.cloudflare.globalKey || !config.cloudflare.email) {
      throw new Error('CLOUDFLARE_GLOBAL_KEY and CLOUDFLARE_EMAIL are required to create a new API token');
    }
    
    // First, let's fetch available permission groups
    spinner.text = 'Fetching available permission groups...';
    
    const permissionsResponse = await axios.get(
      'https://api.cloudflare.com/client/v4/user/tokens/permission_groups',
      {
        headers: {
          'X-Auth-Email': config.cloudflare.email,
          'X-Auth-Key': config.cloudflare.globalKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!permissionsResponse.data.success) {
      throw new Error('Failed to fetch permission groups');
    }
    
    const permissions = permissionsResponse.data.result;
    
    // Find required permissions by name
    const findPermission = (name: string) => {
      const perm = permissions.find((p: any) => p.name === name);
      if (!perm) {
        console.warn(chalk.yellow(`Warning: Permission "${name}" not found`));
      }
      return perm;
    };
    
    // Build permission groups based on what's available
    const accountPermissionGroups = [];
    const zonePermissionGroups = [];
    const userPermissionGroups = [];
    
    // Account-level permissions (Zero Trust, Workers, etc.)
    const accountPerms = [
      'Zero Trust:Edit',
      'Zero Trust:Read',
      'Workers Scripts:Edit',
      'Workers Scripts:Read',
      'Workers KV Storage:Edit',
      'Workers KV Storage:Read',
      'Workers Routes:Edit',
      'Workers Routes:Read',
      'Analytics:Read',
      'Logs:Read',
      'Account Settings:Edit',
      'Account Settings:Read',
      'Access: Organizations, Identity Providers, and Groups:Edit',
      'Access: Organizations, Identity Providers, and Groups:Read',
      'Access: Apps and Policies:Edit',
      'Access: Apps and Policies:Read'
    ];
    
    for (const permName of accountPerms) {
      const perm = findPermission(permName);
      if (perm) {
        accountPermissionGroups.push({
          id: perm.id,
          name: perm.name
        });
      }
    }
    
    // Zone-level permissions
    const zonePerms = [
      'Firewall Services:Edit',
      'Firewall Services:Read',
      'Page Rules:Edit',
      'Page Rules:Read',
      'Zone Settings:Edit',
      'Zone Settings:Read',
      'DNS:Edit',
      'DNS:Read',
      'Analytics:Read',
      'SSL and Certificates:Edit',
      'SSL and Certificates:Read'
    ];
    
    for (const permName of zonePerms) {
      const perm = findPermission(permName);
      if (perm) {
        zonePermissionGroups.push({
          id: perm.id,
          name: perm.name
        });
      }
    }
    
    // User-level permissions
    const userPerms = [
      'User Details:Read',
      'API Tokens:Edit',
      'API Tokens:Read'
    ];
    
    for (const permName of userPerms) {
      const perm = findPermission(permName);
      if (perm) {
        userPermissionGroups.push({
          id: perm.id,
          name: perm.name
        });
      }
    }
    
    spinner.text = 'Creating API token with discovered permissions...';
    
    // Define the token configuration
    const tokenConfig = {
      name: `Cloudflare Firewall Manager - ${new Date().toLocaleDateString()}`,
      policies: []
    };
    
    // Add account-level policy if we have permissions
    if (accountPermissionGroups.length > 0) {
      tokenConfig.policies.push({
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.${config.cloudflare.accountId}`]: '*'
        },
        permission_groups: accountPermissionGroups.map(p => ({ id: p.id }))
      });
    }
    
    // Add zone-level policy if we have permissions
    if (zonePermissionGroups.length > 0 && config.cloudflare.zoneId) {
      tokenConfig.policies.push({
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.${config.cloudflare.accountId}.zone.${config.cloudflare.zoneId}`]: '*'
        },
        permission_groups: zonePermissionGroups.map(p => ({ id: p.id }))
      });
    }
    
    // Add user-level policy if we have permissions
    if (userPermissionGroups.length > 0) {
      tokenConfig.policies.push({
        effect: 'allow',
        resources: {
          'com.cloudflare.api.user.*': '*'
        },
        permission_groups: userPermissionGroups.map(p => ({ id: p.id }))
      });
    }
    
    // Create the API token
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
      
      if (token.issued_on) {
        console.log(`Created: ${new Date(token.issued_on).toLocaleString()}`);
      }
      if (token.expires_on) {
        console.log(`Expires: ${new Date(token.expires_on).toLocaleString()}`);
      }
      
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.cyan.bold('\n🔑 Your New API Token:'));
      console.log(chalk.yellow.bold(token.value));
      
      console.log(chalk.gray('\n─'.repeat(60)));
      console.log(chalk.red.bold('⚠️  IMPORTANT: ') + chalk.yellow('Save this token now! It will not be shown again.'));
      console.log(chalk.gray('─'.repeat(60)));
      
      console.log(chalk.cyan('\n📝 To use this token, update your .env file:'));
      console.log(chalk.gray(`CLOUDFLARE_API_TOKEN=${token.value}`));
      
      console.log(chalk.cyan('\n✨ This token includes permissions for:'));
      console.log(`  • ${accountPermissionGroups.length} Account-level permissions`);
      console.log(`  • ${zonePermissionGroups.length} Zone-level permissions`);
      console.log(`  • ${userPermissionGroups.length} User-level permissions`);
      
      console.log(chalk.cyan('\nKey capabilities:'));
      console.log('  • Zero Trust / Gateway management');
      console.log('  • Workers deployment and KV storage');
      console.log('  • Firewall rules management');
      console.log('  • DNS management');
      console.log('  • Analytics and logs access');
      console.log('  • Account and zone settings');
      
      // Optionally save to .env file
      console.log(chalk.cyan('\n💾 Would you like to update your .env file automatically?'));
      console.log(chalk.gray('  Run: npm run update-token'));
      
      return token.value;
    } else {
      throw new Error(`Failed to create token: ${JSON.stringify(response.data.errors)}`);
    }
    
  } catch (error) {
    spinner.fail('Failed to create API Token');
    
    if (axios.isAxiosError(error)) {
      console.error(chalk.red('\nError details:'));
      if (error.response?.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          console.error(chalk.red(`  - ${err.message}`));
          if (err.error_chain) {
            err.error_chain.forEach((chain: any) => {
              console.error(chalk.red(`    - ${chain.message}`));
            });
          }
        });
      } else {
        console.error(chalk.red(error.message));
      }
      
      // Debug info
      if (error.response?.status === 403) {
        console.error(chalk.yellow('\n💡 Tip: Make sure your Global API Key has the necessary permissions.'));
      }
      
      if (error.response?.data && process.env.DEBUG) {
        console.error(chalk.gray('\nFull response:'));
        console.error(JSON.stringify(error.response.data, null, 2));
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
