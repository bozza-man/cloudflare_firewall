#!/usr/bin/env node

/**
 * Update Organization-Wide Block Page Settings
 * Configures Cloudflare Zero Trust to use the custom block page Worker
 */

import chalk from 'chalk';
import ora from 'ora';
import { config } from '../utils/config.js';

interface OrgSettings {
  block_page?: {
    enabled: boolean;
    footer_text?: string;
    header_text?: string;
    logo_path?: string;
    background_color?: string;
    name?: string;
    mail_to_address?: string;
    mail_to_subject?: string;
    redirect_url?: string;
  };
  custom_pages?: {
    forbidden?: string;
    identity_denied?: string;
  };
}

async function getOrganizationSettings(): Promise<OrgSettings> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/gateway`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.cloudflare.apiToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch organization settings: ${response.statusText}`);
  }

  const data = await response.json();
  return data.result?.settings || {};
}

async function updateOrganizationBlockPage(blockPageUrl: string): Promise<void> {
  const spinner = ora('Updating organization block page settings...').start();

  try {
    // First, get current settings
    spinner.text = 'Fetching current organization settings...';
    const currentSettings = await getOrganizationSettings();
    
    console.log(chalk.cyan('\n📋 Current Block Page Configuration:'));
    if (currentSettings.custom_pages?.forbidden) {
      console.log(`   Current URL: ${currentSettings.custom_pages.forbidden}`);
    } else {
      console.log('   No custom block page configured');
    }

    // Update the settings with new block page URL
    spinner.text = 'Updating block page configuration...';
    
    const updatedSettings = {
      ...currentSettings,
      custom_pages: {
        ...currentSettings.custom_pages,
        forbidden: blockPageUrl,
        identity_denied: blockPageUrl
      },
      block_page: {
        ...currentSettings.block_page,
        enabled: true,
        name: 'Custom Block Page',
        footer_text: 'If you believe this is a mistake, please contact IT support.',
        mail_to_address: 'it-support@bozza.au',
        mail_to_subject: 'Access Blocked - Support Request'
      }
    };

    const updateResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/gateway`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.cloudflare.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: updatedSettings })
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      throw new Error(`Failed to update settings: ${errorData.errors?.[0]?.message || updateResponse.statusText}`);
    }

    spinner.succeed('Organization block page updated successfully!');

    console.log(chalk.green('\n✅ Block Page Configuration Updated:'));
    console.log(`   Block Page URL: ${blockPageUrl}`);
    console.log(`   Applies to: All blocked requests in Zero Trust`);
    console.log(`   Footer Text: ${updatedSettings.block_page.footer_text}`);
    console.log(`   Support Email: ${updatedSettings.block_page.mail_to_address}`);

    // Additional configuration for Gateway policies
    await updateGatewayPolicies(blockPageUrl);

  } catch (error) {
    spinner.fail('Failed to update organization block page');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

async function updateGatewayPolicies(blockPageUrl: string): Promise<void> {
  const spinner = ora('Checking Gateway policy settings...').start();

  try {
    // Get Gateway configuration
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/gateway/configuration`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.cloudflare.apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      spinner.warn('Could not fetch Gateway configuration');
      return;
    }

    const data = await response.json();
    const currentConfig = data.result || {};

    // Update with block page settings
    const updatedConfig = {
      ...currentConfig,
      settings: {
        ...currentConfig.settings,
        block_page: {
          enabled: true,
          custom_url: blockPageUrl,
          name: 'Dynamic Block Page',
          // Preserve any existing block page settings
          ...currentConfig.settings?.block_page
        }
      }
    };

    // Apply the updated configuration
    const updateResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.cloudflare.accountId}/gateway/configuration`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.cloudflare.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedConfig)
      }
    );

    if (updateResponse.ok) {
      spinner.succeed('Gateway policies updated with custom block page');
    } else {
      spinner.warn('Gateway policies may need manual configuration');
    }

  } catch (error) {
    spinner.warn('Could not update Gateway policies automatically');
    console.log(chalk.yellow('⚠️  You may need to manually configure Gateway policies in the dashboard'));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(chalk.cyan('Usage: update-org-block-page <block-page-url>'));
    console.log(chalk.cyan('Example: update-org-block-page https://block.bozza.au/access-denied'));
    process.exit(0);
  }

  const blockPageUrl = args[0];

  // Validate URL
  try {
    new URL(blockPageUrl);
  } catch {
    console.error(chalk.red('Error: Invalid URL provided'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n🔄 Updating Organization-Wide Block Page\n'));
  console.log(`New Block Page URL: ${chalk.green(blockPageUrl)}`);
  console.log(`Account ID: ${config.cloudflare.accountId}`);

  await updateOrganizationBlockPage(blockPageUrl);

  console.log(chalk.cyan('\n📝 Next Steps:'));
  console.log('1. Verify the block page is working by visiting a blocked site');
  console.log('2. Check the Zero Trust dashboard to confirm settings');
  console.log('3. Test with different user groups and scenarios');
  console.log('4. Monitor logs for block page hits');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { updateOrganizationBlockPage, getOrganizationSettings };
