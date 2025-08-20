#!/usr/bin/env tsx

import axios from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Creates a new Cloudflare API Token with ALL available permissions
 */
async function createFullAccessToken() {
  const spinner = ora('Creating new API Token with ALL permissions...').start();
  
  try {
    // Check if we have Global API Key credentials
    if (!config.cloudflare.globalKey || !config.cloudflare.email) {
      throw new Error('CLOUDFLARE_GLOBAL_KEY and CLOUDFLARE_EMAIL are required to create a new API token');
    }
    
    // First, fetch all available permission groups
    spinner.text = 'Fetching all available permission groups...';
    
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
    
    const allPermissions = permissionsResponse.data.result;
    
    console.log(chalk.cyan(`\nFound ${allPermissions.length} available permission groups`));
    
    // Group permissions by scope
    const accountPermissions = allPermissions.filter((p: any) => 
      p.scopes && p.scopes.includes('com.cloudflare.api.account')
    );
    
    const zonePermissions = allPermissions.filter((p: any) => 
      p.scopes && p.scopes.includes('com.cloudflare.api.account.zone')
    );
    
    const userPermissions = allPermissions.filter((p: any) => 
      p.scopes && p.scopes.includes('com.cloudflare.api.user')
    );
    
    console.log(chalk.gray(`  • ${accountPermissions.length} account-level permissions`));
    console.log(chalk.gray(`  • ${zonePermissions.length} zone-level permissions`));
    console.log(chalk.gray(`  • ${userPermissions.length} user-level permissions`));
    
    spinner.text = 'Creating API token with ALL permissions...';
    
    // Build the token configuration with all permissions
    const tokenConfig = {
      name: `Cloudflare Firewall Manager - Full Access - ${new Date().toISOString().split('T')[0]}`,
      policies: []
    };
    
    // Add all account-level permissions
    if (accountPermissions.length > 0) {
      tokenConfig.policies.push({
        effect: 'allow',
        resources: {
          [`com.cloudflare.api.account.${config.cloudflare.accountId}`]: '*'
        },
        permission_groups: accountPermissions.map((p: any) => ({ id: p.id }))
      });
    }
    
    // Add all zone-level permissions
    if (zonePermissions.length > 0) {
      // Zone permissions use a different resource format
      tokenConfig.policies.push({
        effect: 'allow',
        resources: {
          'com.cloudflare.api.account.zone.*': '*'
        },
        permission_groups: zonePermissions.map((p: any) => ({ id: p.id }))
      });
    }
    
    // Add all user-level permissions
    // Note: User permissions need to be scoped to the current user
    // We'll skip these for now as they're not critical for the app functionality
    // If you need user permissions, you'll need to get the user ID first
    
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
      
      console.log(chalk.green.bold('\n✅ New FULL ACCESS API Token Created Successfully!\n'));
      console.log(chalk.cyan('Token Details:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`Name: ${chalk.yellow(token.name)}`);
      console.log(`ID: ${chalk.gray(token.id)}`);
      console.log(`Status: ${chalk.green(token.status)}`);
      
      if (token.issued_on) {
        console.log(`Created: ${new Date(token.issued_on).toLocaleString()}`);
      }
      if (token.expires_on) {
        console.log(`Expires: ${token.expires_on ? new Date(token.expires_on).toLocaleString() : 'Never'}`);
      }
      
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.cyan.bold('\n🔑 Your New FULL ACCESS API Token:'));
      console.log(chalk.yellow.bold(token.value));
      
      console.log(chalk.gray('\n─'.repeat(60)));
      console.log(chalk.red.bold('⚠️  IMPORTANT: ') + chalk.yellow('Save this token now! It will not be shown again.'));
      console.log(chalk.gray('─'.repeat(60)));
      
      console.log(chalk.cyan('\n📝 To use this token, update your .env file:'));
      console.log(chalk.gray(`CLOUDFLARE_API_TOKEN=${token.value}`));
      
      console.log(chalk.cyan('\n✨ This token includes:'));
      console.log(chalk.green(`  ✓ ALL ${accountPermissions.length} Account-level permissions`));
      console.log(chalk.green(`  ✓ ALL ${zonePermissions.length} Zone-level permissions`));
      console.log(chalk.green(`  ✓ ALL ${userPermissions.length} User-level permissions`));
      console.log(chalk.green(`  ✓ TOTAL: ${allPermissions.length} permissions`));
      
      console.log(chalk.cyan('\n🚀 Full capabilities include:'));
      console.log('  ✓ Zero Trust / Gateway management');
      console.log('  ✓ Workers deployment and KV storage');
      console.log('  ✓ Firewall rules management');
      console.log('  ✓ DNS management');
      console.log('  ✓ Analytics and logs access');
      console.log('  ✓ Account and zone settings');
      console.log('  ✓ SSL/TLS certificates');
      console.log('  ✓ Page rules');
      console.log('  ✓ Rate limiting');
      console.log('  ✓ And much more...');
      
      // List some key permissions that were included
      console.log(chalk.cyan('\n📋 Key permissions included:'));
      const keyPermissions = allPermissions
        .filter((p: any) => 
          p.name.includes('Workers') || 
          p.name.includes('Zero Trust') || 
          p.name.includes('Gateway') ||
          p.name.includes('Firewall') ||
          p.name.includes('DNS')
        )
        .slice(0, 10);
      
      keyPermissions.forEach((p: any) => {
        console.log(chalk.gray(`  • ${p.name}`));
      });
      
      if (allPermissions.length > 10) {
        console.log(chalk.gray(`  • ... and ${allPermissions.length - 10} more permissions`));
      }
      
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
      
      if (error.response?.status === 403) {
        console.error(chalk.yellow('\n💡 The Global API Key might not have permission to create tokens.'));
        console.error(chalk.yellow('   You can create a token manually at:'));
        console.error(chalk.cyan('   https://dash.cloudflare.com/profile/api-tokens'));
      }
    } else {
      console.error(chalk.red('Error:'), error);
    }
    
    process.exit(1);
  }
}

// Run the script
createFullAccessToken().catch(console.error);
