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
    
    // Define all the permissions needed by the app
    const tokenConfig = {
      name: 'Cloudflare Firewall Manager - Full Access',
      policies: [
        {
          // Account-level permissions
          effect: 'allow',
          resources: {
            'com.cloudflare.api.account.*': '*'
          },
          permission_groups: [
            {
              // Zero Trust / Gateway permissions
              id: 'c1fde68c7bcc44588cbb6ddbc16d6480', // Account:Zero Trust:Edit
              name: 'Zero Trust:Edit'
            },
            {
              id: '8b47d2786a534c08a1f94ee8f9f599ef', // Account:Zero Trust:Read
              name: 'Zero Trust:Read'
            },
            {
              // Workers permissions
              id: '1a71c399035b4950a1bd1466bbe4f420', // Account:Workers Scripts:Edit
              name: 'Workers Scripts:Edit'
            },
            {
              id: 'ed07f6c337da4195b884ca2ab72fba25', // Account:Workers Scripts:Read
              name: 'Workers Scripts:Read'
            },
            {
              // Workers KV permissions
              id: 'f7f0eda5697f475c90846e879bab8666', // Account:Workers KV Storage:Edit
              name: 'Workers KV Storage:Edit'
            },
            {
              id: '06d26cd6e77e4e0965002d8b8c92f3b7', // Account:Workers KV Storage:Read
              name: 'Workers KV Storage:Read'
            },
            {
              // Workers Routes permissions
              id: 'e086da7e2179491d91ee5f35b3ca210a', // Account:Workers Routes:Edit
              name: 'Workers Routes:Edit'
            },
            {
              // Analytics permissions
              id: 'd2a1802cc9a34e30852f8b33869b2f3c', // Account:Analytics:Read
              name: 'Analytics:Read'
            },
            {
              // Logs permissions
              id: '6e76de3e91d84cb2957618b2ba8096ec', // Account:Logs:Read
              name: 'Logs:Read'
            },
            {
              // Account Settings permissions
              id: 'e6d2666161e84845ace17c0d3987a3b5', // Account:Account Settings:Edit
              name: 'Account Settings:Edit'
            },
            {
              id: 'f415812696154be1afc35a582e356eed', // Account:Account Settings:Read
              name: 'Account Settings:Read'
            }
          ]
        },
        {
          // Zone-level permissions (for firewall rules)
          effect: 'allow',
          resources: {
            'com.cloudflare.api.account.zone.*': '*'
          },
          permission_groups: [
            {
              id: 'e17beae8b8cb423a99b1730f21238bed', // Zone:Firewall Services:Edit
              name: 'Firewall Services:Edit'
            },
            {
              id: '1170401550a74e548831e863b3660255', // Zone:Firewall Services:Read
              name: 'Firewall Services:Read'
            },
            {
              id: '517b21aee92c4d89936c976ba6e4be55', // Zone:Page Rules:Edit
              name: 'Page Rules:Edit'
            },
            {
              id: '3030687196b94b638145a3953da2b699', // Zone:Page Rules:Read
              name: 'Page Rules:Read'
            },
            {
              id: '4755a26eedb94da69e1066d98aa820be', // Zone:Zone Settings:Edit
              name: 'Zone Settings:Edit'
            },
            {
              id: 'c7f671298c0c4885b9c7e2afe34f646e', // Zone:Zone Settings:Read
              name: 'Zone Settings:Read'
            },
            {
              id: '82e64a83756745bbbb1c9c2701bf816b', // Zone:DNS:Edit
              name: 'DNS:Edit'
            },
            {
              id: '269d8f4853475ca241f4e2d9e37a3b0f', // Zone:DNS:Read
              name: 'DNS:Read'
            },
            {
              id: 'c1b1b4e7b2fe4cfca7a10e2e826fd11f', // Zone:Analytics:Read
              name: 'Analytics:Read'
            }
          ]
        },
        {
          // User-level permissions
          effect: 'allow',
          resources: {
            'com.cloudflare.api.user.*': '*'
          },
          permission_groups: [
            {
              id: 'c0c5655e9b014e52aaf5e528028d0bd3', // User:User Details:Read
              name: 'User Details:Read'
            },
            {
              id: 'f7753d46c3874bb98c460a443a039206', // User:API Tokens:Edit
              name: 'API Tokens:Edit'
            },
            {
              id: '8e3a09e098a3438285565eca4628b34f', // User:API Tokens:Read
              name: 'API Tokens:Read'
            }
          ]
        }
      ],
      // Remove milliseconds from ISO string to match required format
      not_before: new Date().toISOString().split('.')[0] + 'Z',
      // Token expires in 1 year
      expires_on: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z',
      condition: {
        request_ip: {
          // Allow from any IP
          in: [],
          not_in: []
        }
      }
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
