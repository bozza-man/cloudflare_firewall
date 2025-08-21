#!/usr/bin/env tsx

/**
 * Setup Cloudflare AI Gateway for the firewall management tool
 * This script creates and configures the AI Gateway with optimal settings
 */

import axios from 'axios';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_GLOBAL_KEY;

async function createAIGateway() {
  console.log(chalk.blue('🚀 Setting up Cloudflare AI Gateway...'));

  const gatewayConfig = {
    id: 'firewall-ai',
    name: 'Firewall AI Gateway',
    collect_logs: true,
    rate_limiting_interval: 60, // 60 seconds
    rate_limiting_limit: 100, // 100 requests per interval
    rate_limiting_technique: 'sliding' as const,
    cache_ttl: 3600, // 1 hour cache
    cache_invalidate_on_update: true
  };

  try {
    // Check if gateway already exists
    const checkResponse = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways`,
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const existingGateway = checkResponse.data.result?.find(
      (g: any) => g.id === gatewayConfig.id
    );

    if (existingGateway) {
      console.log(chalk.yellow('⚠️  AI Gateway already exists. Updating configuration...'));
      
      // Update existing gateway
      const updateResponse = await axios.patch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${existingGateway.id}`,
        gatewayConfig,
        {
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (updateResponse.data.success) {
        console.log(chalk.green('✅ AI Gateway updated successfully!'));
        console.log(chalk.cyan('Gateway ID:'), existingGateway.id);
        console.log(chalk.cyan('Gateway URL:'), `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/${gatewayConfig.id}`);
        return existingGateway.id;
      }
    } else {
      // Create new gateway
      const createResponse = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways`,
        gatewayConfig,
        {
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (createResponse.data.success) {
        const gateway = createResponse.data.result;
        console.log(chalk.green('✅ AI Gateway created successfully!'));
        console.log(chalk.cyan('Gateway ID:'), gateway.id);
        console.log(chalk.cyan('Gateway URL:'), `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/${gatewayConfig.id}`);
        
        // Save to .env file
        await updateEnvFile(gateway.id);
        
        return gateway.id;
      }
    }
  } catch (error: any) {
    console.error(chalk.red('❌ Error setting up AI Gateway:'));
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    throw error;
  }
}

async function updateEnvFile(gatewayId: string) {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const envPath = path.join(process.cwd(), '.env');
  
  try {
    let envContent = await fs.readFile(envPath, 'utf-8');
    
    // Add or update AI_GATEWAY_ID
    if (envContent.includes('AI_GATEWAY_ID=')) {
      envContent = envContent.replace(/AI_GATEWAY_ID=.*/, `AI_GATEWAY_ID=${gatewayId}`);
    } else {
      envContent += `\n# Cloudflare AI Gateway\nAI_GATEWAY_ID=${gatewayId}\n`;
    }
    
    // Add feature flags if not present
    if (!envContent.includes('USE_AI_GATEWAY=')) {
      envContent += `USE_AI_GATEWAY=true\n`;
    }
    
    await fs.writeFile(envPath, envContent);
    console.log(chalk.green('✅ Updated .env file with AI Gateway configuration'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not update .env file automatically'));
    console.log(chalk.cyan('Please add the following to your .env file:'));
    console.log(`AI_GATEWAY_ID=${gatewayId}`);
    console.log('USE_AI_GATEWAY=true');
  }
}

async function testAIGateway(gatewayId: string) {
  console.log(chalk.blue('\n🧪 Testing AI Gateway...'));
  
  const testPrompt = 'Generate a simple Cloudflare Gateway rule to block social media sites.';
  
  try {
    const response = await axios.post(
      `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/firewall-ai/workers-ai/@cf/meta/llama-3.2-3b-instruct`,
      {
        messages: [
          {
            role: 'system',
            content: 'You are a Cloudflare Gateway rules expert. Generate valid JSON rules.'
          },
          {
            role: 'user',
            content: testPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success !== false) {
      console.log(chalk.green('✅ AI Gateway test successful!'));
      console.log(chalk.cyan('Response preview:'), 
        JSON.stringify(response.data).substring(0, 200) + '...');
    } else {
      console.log(chalk.yellow('⚠️  AI Gateway test returned an error:'), response.data.errors);
    }
  } catch (error: any) {
    console.error(chalk.red('❌ AI Gateway test failed:'));
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

async function main() {
  console.log(chalk.bold.blue('\n🔧 Cloudflare AI Gateway Setup\n'));
  
  try {
    // Create or update AI Gateway
    const gatewayId = await createAIGateway();
    
    // Test the gateway
    await testAIGateway(gatewayId);
    
    console.log(chalk.bold.green('\n✨ AI Gateway setup complete!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log('1. Run: npm run setup:vectorize');
    console.log('2. Run: npm run setup:d1');
    console.log('3. Run: npm run setup:r2');
    console.log('4. Run: npm run migrate:ai');
    
  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed. Please check your configuration and try again.'));
    process.exit(1);
  }
}

// Run the setup
main();
