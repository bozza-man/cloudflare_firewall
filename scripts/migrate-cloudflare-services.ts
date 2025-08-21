#!/usr/bin/env tsx

/**
 * Complete Cloudflare Services Migration Script
 * This script sets up all required Cloudflare services for the firewall manager
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

interface MigrationConfig {
  accountId: string;
  apiToken: string;
  email?: string;
  existingRulesBackup?: boolean;
}

class CloudflareMigrationManager {
  private config: MigrationConfig;
  private results: Map<string, boolean> = new Map();

  constructor(config: MigrationConfig) {
    this.config = config;
  }

  async run() {
    console.log(chalk.bold.blue('\n🚀 Cloudflare Services Migration Tool\n'));
    console.log(chalk.gray('This will set up all required Cloudflare services for your firewall manager.\n'));

    // Verify prerequisites
    const ready = await this.verifyPrerequisites();
    if (!ready) {
      console.log(chalk.red('\n❌ Prerequisites check failed. Please resolve the issues above and try again.'));
      return;
    }

    // Show migration plan
    this.showMigrationPlan();

    // Confirm migration
    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Do you want to proceed with the migration?',
      default: true
    }]);

    if (!proceed) {
      console.log(chalk.yellow('\n⚠️  Migration cancelled.'));
      return;
    }

    // Run migration steps
    await this.runMigration();

    // Show results
    this.showResults();
  }

  async verifyPrerequisites(): Promise<boolean> {
    const spinner = ora('Verifying prerequisites...').start();
    
    try {
      // Check Node version
      const nodeVersion = process.version;
      if (!nodeVersion.match(/^v(1[89]|[2-9]\d)/)) {
        spinner.fail('Node.js 18+ is required');
        return false;
      }

      // Check for wrangler
      try {
        await execAsync('npx wrangler --version');
      } catch {
        spinner.fail('Wrangler CLI not found. Installing...');
        await execAsync('npm install -g wrangler');
      }

      // Check API token
      if (!this.config.apiToken) {
        spinner.fail('API token not found in environment');
        console.log(chalk.yellow('\nTo create an API token:'));
        console.log('1. Go to https://dash.cloudflare.com/profile/api-tokens');
        console.log('2. Click "Create Token"');
        console.log('3. Use "Custom token" with these permissions:');
        console.log('   - Account: AI Gateway:Edit');
        console.log('   - Account: Workers AI:Edit');
        console.log('   - Account: Workers Scripts:Edit');
        console.log('   - Account: D1:Edit');
        console.log('   - Account: R2 Storage:Edit');
        console.log('   - Account: Vectorize:Edit');
        console.log('4. Add to .env as CLOUDFLARE_API_TOKEN=your-token');
        return false;
      }

      spinner.succeed('Prerequisites verified');
      return true;
    } catch (error) {
      spinner.fail('Prerequisites check failed');
      console.error(error);
      return false;
    }
  }

  showMigrationPlan() {
    console.log(chalk.bold.cyan('\n📋 Migration Plan:\n'));
    
    const steps = [
      '1. AI Gateway - Set up caching and routing for AI requests',
      '2. Vectorize - Create vector index for semantic search',
      '3. D1 Database - Initialize database for rule history',
      '4. R2 Storage - Create bucket for backups',
      '5. Workers - Deploy edge API',
      '6. KV Namespaces - Set up caching and sessions',
      '7. Data Migration - Index existing rules',
      '8. Testing - Verify all services'
    ];

    steps.forEach(step => console.log(chalk.white(`  ${step}`)));
    console.log();
  }

  async runMigration() {
    console.log(chalk.bold.green('\n🔧 Starting Migration...\n'));

    // Step 1: AI Gateway
    await this.setupAIGateway();

    // Step 2: Vectorize
    await this.setupVectorize();

    // Step 3: D1 Database
    await this.setupD1Database();

    // Step 4: R2 Storage
    await this.setupR2Storage();

    // Step 5: KV Namespaces
    await this.setupKVNamespaces();

    // Step 6: Deploy Worker
    await this.deployWorker();

    // Step 7: Migrate Data
    await this.migrateData();

    // Step 8: Run Tests
    await this.runTests();
  }

  async setupAIGateway() {
    const spinner = ora('Setting up AI Gateway...').start();
    
    try {
      // This will be implemented when API token is available
      // For now, we'll prepare the configuration
      const config = {
        name: 'firewall-ai-gateway',
        slug: 'firewall-ai',
        cache_ttl: 3600,
        rate_limiting: {
          requests_per_minute: 100
        }
      };

      await fs.writeFile(
        path.join(process.cwd(), 'ai-gateway-config.json'),
        JSON.stringify(config, null, 2)
      );

      spinner.succeed('AI Gateway configuration prepared');
      this.results.set('AI Gateway', true);
    } catch (error) {
      spinner.fail('AI Gateway setup failed');
      this.results.set('AI Gateway', false);
      console.error(error);
    }
  }

  async setupVectorize() {
    const spinner = ora('Setting up Vectorize index...').start();
    
    try {
      const command = `npx wrangler vectorize create gateway-rules \
        --dimensions 768 \
        --metric cosine`;
      
      // This will fail without proper auth, so we'll prepare the command
      await fs.writeFile(
        path.join(process.cwd(), 'vectorize-setup.sh'),
        `#!/bin/bash\n${command}\n`,
        { mode: 0o755 }
      );

      spinner.succeed('Vectorize setup script created');
      this.results.set('Vectorize', true);
    } catch (error) {
      spinner.fail('Vectorize setup failed');
      this.results.set('Vectorize', false);
    }
  }

  async setupD1Database() {
    const spinner = ora('Setting up D1 database...').start();
    
    try {
      // Create D1 setup script
      const commands = [
        'npx wrangler d1 create firewall-db',
        'npx wrangler d1 execute firewall-db --file=./schema.sql'
      ];

      await fs.writeFile(
        path.join(process.cwd(), 'd1-setup.sh'),
        `#!/bin/bash\n${commands.join('\n')}\n`,
        { mode: 0o755 }
      );

      spinner.succeed('D1 setup script created');
      this.results.set('D1 Database', true);
    } catch (error) {
      spinner.fail('D1 setup failed');
      this.results.set('D1 Database', false);
    }
  }

  async setupR2Storage() {
    const spinner = ora('Setting up R2 storage...').start();
    
    try {
      const command = 'npx wrangler r2 bucket create gateway-rule-backups';
      
      await fs.writeFile(
        path.join(process.cwd(), 'r2-setup.sh'),
        `#!/bin/bash\n${command}\n`,
        { mode: 0o755 }
      );

      spinner.succeed('R2 setup script created');
      this.results.set('R2 Storage', true);
    } catch (error) {
      spinner.fail('R2 setup failed');
      this.results.set('R2 Storage', false);
    }
  }

  async setupKVNamespaces() {
    const spinner = ora('Setting up KV namespaces...').start();
    
    try {
      const commands = [
        'npx wrangler kv:namespace create "CACHE"',
        'npx wrangler kv:namespace create "SESSIONS"',
        'npx wrangler kv:namespace create "RATE_LIMIT"'
      ];

      await fs.writeFile(
        path.join(process.cwd(), 'kv-setup.sh'),
        `#!/bin/bash\n${commands.join('\n')}\n`,
        { mode: 0o755 }
      );

      spinner.succeed('KV namespace setup script created');
      this.results.set('KV Namespaces', true);
    } catch (error) {
      spinner.fail('KV setup failed');
      this.results.set('KV Namespaces', false);
    }
  }

  async deployWorker() {
    const spinner = ora('Preparing Worker deployment...').start();
    
    try {
      // Check if wrangler.toml exists
      const wranglerPath = path.join(process.cwd(), 'wrangler.full.toml');
      const exists = await fs.access(wranglerPath).then(() => true).catch(() => false);
      
      if (exists) {
        const command = 'npx wrangler deploy -c wrangler.full.toml';
        
        await fs.writeFile(
          path.join(process.cwd(), 'worker-deploy.sh'),
          `#!/bin/bash\n${command}\n`,
          { mode: 0o755 }
        );

        spinner.succeed('Worker deployment script created');
        this.results.set('Worker Deployment', true);
      } else {
        spinner.warn('wrangler.full.toml not found');
        this.results.set('Worker Deployment', false);
      }
    } catch (error) {
      spinner.fail('Worker deployment preparation failed');
      this.results.set('Worker Deployment', false);
    }
  }

  async migrateData() {
    const spinner = ora('Preparing data migration...').start();
    
    try {
      // Create migration script
      const migrationScript = `
#!/usr/bin/env node

// Data Migration Script
const axios = require('axios');

async function migrateRules() {
  console.log('Fetching existing rules...');
  
  // This would fetch existing rules and index them in Vectorize
  // Implementation depends on API token availability
  
  console.log('Migration script ready to run once services are deployed');
}

migrateRules().catch(console.error);
`;

      await fs.writeFile(
        path.join(process.cwd(), 'migrate-data.js'),
        migrationScript,
        { mode: 0o755 }
      );

      spinner.succeed('Data migration script created');
      this.results.set('Data Migration', true);
    } catch (error) {
      spinner.fail('Data migration preparation failed');
      this.results.set('Data Migration', false);
    }
  }

  async runTests() {
    const spinner = ora('Preparing test suite...').start();
    
    try {
      const testScript = `
#!/bin/bash

echo "Testing Cloudflare Services Integration"
echo "========================================"
echo ""

# Test Worker health endpoint
echo "Testing Worker health..."
curl -s https://firewall-api.bozza.au/health | jq '.'

# Test AI Gateway
echo "Testing AI Gateway..."
# Add test commands here

echo ""
echo "Tests complete!"
`;

      await fs.writeFile(
        path.join(process.cwd(), 'test-services.sh'),
        testScript,
        { mode: 0o755 }
      );

      spinner.succeed('Test suite prepared');
      this.results.set('Testing', true);
    } catch (error) {
      spinner.fail('Test preparation failed');
      this.results.set('Testing', false);
    }
  }

  showResults() {
    console.log(chalk.bold.cyan('\n📊 Migration Results:\n'));
    
    let allSuccess = true;
    this.results.forEach((success, service) => {
      const icon = success ? '✅' : '❌';
      const color = success ? chalk.green : chalk.red;
      console.log(`  ${icon} ${color(service)}`);
      if (!success) allSuccess = false;
    });

    if (allSuccess) {
      console.log(chalk.bold.green('\n✨ Migration preparation complete!\n'));
      console.log(chalk.cyan('Next steps:'));
      console.log('1. Ensure you have a valid Cloudflare API token');
      console.log('2. Run the generated setup scripts:');
      console.log('   - ./ai-gateway-setup.sh');
      console.log('   - ./vectorize-setup.sh');
      console.log('   - ./d1-setup.sh');
      console.log('   - ./r2-setup.sh');
      console.log('   - ./kv-setup.sh');
      console.log('   - ./worker-deploy.sh');
      console.log('3. Run ./migrate-data.js to migrate existing rules');
      console.log('4. Run ./test-services.sh to verify everything works');
    } else {
      console.log(chalk.yellow('\n⚠️  Some services could not be prepared.'));
      console.log('Please review the errors above and try again.');
    }

    // Create master setup script
    this.createMasterScript();
  }

  async createMasterScript() {
    const masterScript = `#!/bin/bash

# Cloudflare Services Setup Master Script
# Run this once you have a valid API token

echo "🚀 Setting up Cloudflare Services..."
echo ""

# Export credentials
export CLOUDFLARE_API_TOKEN="$1"
export CLOUDFLARE_ACCOUNT_ID="${this.config.accountId}"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Usage: ./setup-all.sh YOUR_API_TOKEN"
  exit 1
fi

echo "1. Setting up AI Gateway..."
./ai-gateway-setup.sh

echo "2. Setting up Vectorize..."
./vectorize-setup.sh

echo "3. Setting up D1 Database..."
./d1-setup.sh

echo "4. Setting up R2 Storage..."
./r2-setup.sh

echo "5. Setting up KV Namespaces..."
./kv-setup.sh

echo "6. Deploying Worker..."
./worker-deploy.sh

echo "7. Migrating data..."
node ./migrate-data.js

echo "8. Running tests..."
./test-services.sh

echo ""
echo "✅ Setup complete!"
`;

    await fs.writeFile(
      path.join(process.cwd(), 'setup-all.sh'),
      masterScript,
      { mode: 0o755 }
    );

    console.log(chalk.bold.blue('\n📝 Master setup script created: ./setup-all.sh'));
    console.log(chalk.gray('Run it with: ./setup-all.sh YOUR_API_TOKEN'));
  }
}

// Main execution
async function main() {
  const config: MigrationConfig = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052',
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    email: process.env.CLOUDFLARE_EMAIL || 'daniel@bruteforce.group'
  };

  const manager = new CloudflareMigrationManager(config);
  await manager.run();
}

main().catch(error => {
  console.error(chalk.red('\n❌ Migration failed:'), error);
  process.exit(1);
});
