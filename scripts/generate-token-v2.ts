import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

interface TokenResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: {
    id: string;
    name: string;
    status: string;
    issued_on: string;
    modified_on: string;
    not_before?: string;
    expires_on?: string;
    policies: Array<{
      id: string;
      effect: string;
      resources: Record<string, any>;
      permission_groups: Array<{
        id: string;
        name: string;
      }>;
    }>;
    value?: string;
  };
}

async function generateToken() {
  const email = process.env.CLOUDFLARE_EMAIL;
  const globalKey = process.env.CLOUDFLARE_GLOBAL_KEY;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!email || !globalKey) {
    console.error(chalk.red('Error: CLOUDFLARE_EMAIL and CLOUDFLARE_GLOBAL_KEY must be set in .env'));
    process.exit(1);
  }

  if (!accountId) {
    console.error(chalk.red('Error: CLOUDFLARE_ACCOUNT_ID must be set in .env'));
    process.exit(1);
  }

  const spinner = ora('Creating API token with Zero Trust permissions...').start();

  try {
    // Zero Trust permission IDs based on the list
    const zeroTrustReadId = '3f376c8e6f764a938b848bd01c8995c4';
    const zeroTrustWriteId = 'b33f02c6f7284e05a6f20741c0bb0567';

    // Create the API token
    const tokenName = `Zero Trust Gateway Manager - ${new Date().toISOString().split('T')[0]}`;
    
    const tokenPayload = {
      name: tokenName,
      policies: [
        {
          effect: 'allow',
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: '*'
          },
          permission_groups: [
            { id: zeroTrustReadId },
            { id: zeroTrustWriteId }
          ]
        }
      ]
    };

    spinner.text = 'Creating API token with Zero Trust permissions...';

    const response = await axios.post<TokenResponse>(
      'https://api.cloudflare.com/client/v4/user/tokens',
      tokenPayload,
      {
        headers: {
          'X-Auth-Email': email,
          'X-Auth-Key': globalKey,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.success) {
      throw new Error(`Failed to create token: ${JSON.stringify(response.data.errors)}`);
    }

    const token = response.data.result.value;
    
    if (!token) {
      throw new Error('Token was created but no value was returned');
    }

    spinner.succeed('API token created successfully!');

    // Update .env file
    spinner.start('Updating .env file...');
    
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');
    
    // Update or add CLOUDFLARE_API_TOKEN
    if (envContent.includes('CLOUDFLARE_API_TOKEN=')) {
      envContent = envContent.replace(/CLOUDFLARE_API_TOKEN=.*$/m, `CLOUDFLARE_API_TOKEN=${token}`);
    } else {
      envContent += `\n# Generated API Token\nCLOUDFLARE_API_TOKEN=${token}\n`;
    }
    
    fs.writeFileSync(envPath, envContent);
    
    spinner.succeed('.env file updated with new API token');

    console.log(chalk.green('\n✨ Success!'));
    console.log(chalk.cyan('Token Name:'), tokenName);
    console.log(chalk.cyan('Token ID:'), response.data.result.id);
    console.log(chalk.cyan('Permissions:'), response.data.result.policies[0].permission_groups.map(pg => pg.name).join(', '));
    
    console.log(chalk.yellow('\n⚠️  Important:'));
    console.log('  - This token value will not be shown again');
    console.log('  - The token has been saved to your .env file');
    console.log('  - Keep your .env file secure and never commit it to version control');
    
    // Test the token
    spinner.start('Testing the new token...');
    
    try {
      const testResponse = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/gateway/rules`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (testResponse.data.success) {
        spinner.succeed('Token verified! Successfully accessed Gateway rules.');
      } else {
        spinner.warn('Token created but could not verify Gateway access');
      }
    } catch (error) {
      // Try another Zero Trust endpoint
      try {
        const testResponse2 = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (testResponse2.data.success) {
          spinner.succeed('Token verified! Successfully accessed Zero Trust endpoints.');
        } else {
          spinner.warn('Token created but verification returned unexpected response');
        }
      } catch (error2) {
        spinner.warn('Token created successfully but could not verify access (this may be normal if Zero Trust is not fully configured)');
      }
    }

  } catch (error) {
    spinner.fail('Failed to create API token');
    
    if (axios.isAxiosError(error)) {
      console.error(chalk.red('\nError details:'));
      if (error.response?.data) {
        console.error(JSON.stringify(error.response.data, null, 2));
      } else {
        console.error(error.message);
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

// Run the script
generateToken();