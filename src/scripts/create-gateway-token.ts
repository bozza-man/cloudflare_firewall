#!/usr/bin/env tsx

import axios from 'axios';
import { config } from '../utils/config.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Creates a new Cloudflare API Token with Zero Trust/Gateway permissions
 */
async function createGatewayToken() {
  const spinner = ora('Creating API Token with Zero Trust/Gateway permissions...').start();
  
  try {
    // Check if we have Global API Key credentials
    if (!config.cloudflare.globalKey || !config.cloudflare.email) {
      throw new Error('CLOUDFLARE_GLOBAL_KEY and CLOUDFLARE_EMAIL are required');
    }
    
    // Get account information
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
    
    spinner.text = 'Creating token with Zero Trust permissions...';
    
    // Create token with ALL permissions template
    const tokenConfig = {
      name: `Cloudflare Gateway Manager - ${new Date().toISOString().split('T')[0]}`,
      policies: [
        {
          effect: 'allow',
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: '*'
          },
          permission_groups: [
            // Try using the "All permissions" group if available
            { id: 'f2ef185ee87d405590e89833c1f990ef' }, // Account Read
            { id: '1e1e6a6fa28a470688a21dfa903c22a2' }, // Account Write
            { id: 'dfceea44fb1d416c910e1e6a887e8652' }  // Account Edit
          ]
        }
      ]
    };

    // Try to create the token
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
      spinner.succeed('Token created successfully!');
      
      const token = response.data.result;
      
      console.log(chalk.green.bold('\n✅ New API Token Created!\n'));
      console.log(chalk.cyan.bold('🔑 Your New API Token:'));
      console.log(chalk.yellow.bold(token.value));
      
      console.log(chalk.gray('\n' + '─'.repeat(60)));
      console.log(chalk.red.bold('⚠️  IMPORTANT: ') + chalk.yellow('Save this token now!'));
      console.log(chalk.gray('─'.repeat(60)));
      
      console.log(chalk.cyan('\n📝 Update your .env file:'));
      console.log(chalk.gray(`CLOUDFLARE_API_TOKEN=${token.value}`));
      
      return token.value;
    } else {
      throw new Error(`Failed: ${JSON.stringify(response.data.errors)}`);
    }
    
  } catch (error: any) {
    spinner.fail('Failed to create token with those permissions');
    
    // Fallback: Create using API Token template
    console.log(chalk.yellow('\nTrying alternative: Using Edit Zone template...'));
    return await createWithTemplate();
  }
}

async function createWithTemplate() {
  const spinner = ora('Creating token using Zone Administrator template...').start();
  
  try {
    // This uses the Cloudflare API Token Template for "Zone Administrator"
    // which should have broad permissions
    const templateId = '0c71c548-8ad2-4f0e-9598-b8a7dd859b40'; // Zone Administrator template
    
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/user/tokens`,
      {
        name: `Full Access Token - ${new Date().toISOString().split('T')[0]}`,
        // Use the template-based approach
        template: templateId
      },
      {
        headers: {
          'X-Auth-Email': config.cloudflare.email,
          'X-Auth-Key': config.cloudflare.globalKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      spinner.succeed('Token created with template!');
      
      const token = response.data.result;
      
      console.log(chalk.green.bold('\n✅ Token Created Successfully!\n'));
      console.log(chalk.cyan.bold('🔑 Your New API Token:'));
      console.log(chalk.yellow.bold(token.value));
      
      console.log(chalk.cyan('\n📝 Update your .env file:'));
      console.log(chalk.gray(`CLOUDFLARE_API_TOKEN=${token.value}`));
      
      return token.value;
    }
  } catch (error: any) {
    spinner.fail('Template approach also failed');
    
    // Last resort: Tell user to use Global API Key
    console.log(chalk.yellow('\n⚠️  API Token creation is limited'));
    console.log(chalk.cyan('\n🔧 Alternative Solutions:'));
    console.log(chalk.gray('1. Use your Global API Key instead of API Token'));
    console.log(chalk.gray('   - Already configured in your .env file'));
    console.log(chalk.gray('   - Works with all API endpoints'));
    console.log(chalk.gray('\n2. Create token manually in dashboard:'));
    console.log(chalk.gray('   - Visit: https://dash.cloudflare.com/profile/api-tokens'));
    console.log(chalk.gray('   - Use "Create Custom Token"'));
    console.log(chalk.gray('   - Add ALL available permissions'));
    console.log(chalk.gray('   - Include Zero Trust permissions'));
    
    process.exit(1);
  }
}

// Run the script
createGatewayToken().catch(console.error);
