#!/usr/bin/env node

/**
 * Allow Terraform through Cloudflare Gateway
 * This script creates rules to allow Terraform-related traffic including:
 * - Terraform Registry (registry.terraform.io)
 * - HashiCorp releases
 * - Provider downloads
 * - Module downloads
 */

require('dotenv').config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const GLOBAL_KEY = process.env.CLOUDFLARE_GLOBAL_KEY;
const EMAIL = process.env.CLOUDFLARE_EMAIL;

// Terraform domains and patterns
const TERRAFORM_DOMAINS = [
  // Core Terraform infrastructure
  'registry.terraform.io',
  'releases.hashicorp.com',
  'checkpoint-api.hashicorp.com',
  'checkpoint.hashicorp.com',
  
  // Provider registries
  '*.terraform.io',
  'registry.opentofu.org',  // OpenTofu registry
  
  // GitHub for module sources
  'github.com',
  'raw.githubusercontent.com',
  'api.github.com',
  
  // GitLab for module sources
  'gitlab.com',
  
  // Bitbucket for module sources
  'bitbucket.org',
  'api.bitbucket.org',
  
  // AWS Provider specific
  'awscli.amazonaws.com',
  '*.amazonaws.com',
  
  // Azure Provider specific
  '*.azure.com',
  '*.azurefd.net',
  '*.microsoftonline.com',
  
  // GCP Provider specific
  '*.googleapis.com',
  'storage.googleapis.com',
  
  // Cloudflare Provider specific
  'api.cloudflare.com',
  'dash.cloudflare.com'
];

// Additional IP ranges for direct connectivity (if needed)
const TERRAFORM_IPS = [
  // HashiCorp IP ranges (if documented)
];

async function makeRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  } else if (GLOBAL_KEY && EMAIL) {
    headers['X-Auth-Key'] = GLOBAL_KEY;
    headers['X-Auth-Email'] = EMAIL;
  } else {
    throw new Error('No authentication credentials found');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function getCurrentRules() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`;
  const result = await makeRequest(url);
  return result.result || [];
}

async function createTerraformAllowRule() {
  console.log('🔧 Creating Terraform allow rule for Cloudflare Gateway...\n');

  try {
    // Check for existing Terraform rules
    console.log('📋 Checking existing rules...');
    const existingRules = await getCurrentRules();
    
    const terraformRule = existingRules.find(rule => 
      rule.name?.toLowerCase().includes('terraform') ||
      rule.description?.toLowerCase().includes('terraform')
    );

    if (terraformRule) {
      console.log(`⚠️  Found existing Terraform rule: "${terraformRule.name}"`);
      console.log('   Rule ID:', terraformRule.id);
      console.log('   Enabled:', terraformRule.enabled);
      console.log('\nWould you like to update this rule? (Skipping for now)');
      return;
    }

    // Create the filter expression for domains
    const domainFilters = TERRAFORM_DOMAINS.map(domain => {
      if (domain.includes('*')) {
        // Convert wildcard to regex pattern
        const pattern = domain.replace(/\*/g, '[a-zA-Z0-9-]+');
        return `any(dns.domains[*] matches "${pattern}")`;
      }
      return `any(dns.domains[*] == "${domain}")`;
    }).join(' or ');

    // Create new rule
    const newRule = {
      name: 'Allow Terraform Infrastructure',
      description: 'Allow access to Terraform Registry, providers, modules, and cloud provider APIs for Infrastructure as Code operations',
      action: 'allow',
      enabled: true,
      filters: ['dns'],
      traffic: `(${domainFilters})`,
      precedence: 5000, // Lower precedence to ensure it's evaluated early
      rule_settings: {
        // Optional: Add additional settings
        block_page_enabled: false,
        block_reason: '',
        override_ips: null,
        override_host: null,
        l4override: null,
        biso_admin_controls: null,
        add_headers: null,
        check_session: null,
        insecure_disable_dnssec_validation: false
      }
    };

    console.log('\n📝 Creating new Terraform allow rule...');
    console.log('   Name:', newRule.name);
    console.log('   Action:', newRule.action);
    console.log('   Domains included:', TERRAFORM_DOMAINS.length);

    const createUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`;
    const result = await makeRequest(createUrl, {
      method: 'POST',
      body: JSON.stringify(newRule)
    });

    if (result.success) {
      console.log('\n✅ Successfully created Terraform allow rule!');
      console.log('   Rule ID:', result.result.id);
      console.log('   Status: Enabled');
      
      console.log('\n📦 Allowed Terraform domains:');
      TERRAFORM_DOMAINS.forEach(domain => {
        console.log(`   • ${domain}`);
      });

      console.log('\n💡 Tips:');
      console.log('   - This rule allows Terraform CLI and provider downloads');
      console.log('   - Module sources from GitHub, GitLab, and Bitbucket are included');
      console.log('   - Cloud provider APIs (AWS, Azure, GCP, Cloudflare) are allowed');
      console.log('   - The rule has precedence 5000 (evaluated early)');
      
      console.log('\n🔍 To verify the rule:');
      console.log('   1. Run: terraform init');
      console.log('   2. Check Gateway logs in Cloudflare dashboard');
      console.log('   3. Or use: npm start -- rules list --filter terraform');
    } else {
      console.error('❌ Failed to create rule:', result.errors);
    }

  } catch (error) {
    console.error('❌ Error creating Terraform allow rule:', error.message);
    
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Verify your API credentials in .env file');
    console.log('   2. Check if you have permission to create Gateway rules');
    console.log('   3. Ensure your account has Gateway enabled');
  }
}

async function createHTTPAllowRule() {
  console.log('\n🌐 Creating HTTP allow rule for Terraform providers...\n');

  try {
    // Additional HTTP rule for provider downloads
    const httpRule = {
      name: 'Allow Terraform HTTP Downloads',
      description: 'Allow HTTP/HTTPS traffic to Terraform infrastructure for provider and module downloads',
      action: 'allow',
      enabled: true,
      filters: ['http'],
      traffic: TERRAFORM_DOMAINS.map(domain => {
        if (domain.includes('*')) {
          const pattern = domain.replace(/\*/g, '.*');
          return `http.request.host matches "${pattern}"`;
        }
        return `http.request.host == "${domain}"`;
      }).join(' or '),
      precedence: 5001,
      rule_settings: {
        block_page_enabled: false
      }
    };

    const createUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`;
    const result = await makeRequest(createUrl, {
      method: 'POST',
      body: JSON.stringify(httpRule)
    });

    if (result.success) {
      console.log('✅ Successfully created Terraform HTTP allow rule!');
      console.log('   Rule ID:', result.result.id);
    }
  } catch (error) {
    console.error('⚠️  HTTP rule creation failed (may already exist):', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Cloudflare Gateway - Terraform Access Configuration');
  console.log('=' .repeat(55));
  
  // Create DNS rule
  await createTerraformAllowRule();
  
  // Optionally create HTTP rule as well
  // await createHTTPAllowRule();
  
  console.log('\n✨ Configuration complete!');
  console.log('\nYou can now use Terraform commands like:');
  console.log('  terraform init');
  console.log('  terraform plan');
  console.log('  terraform apply');
  console.log('\nAll required domains and APIs should be accessible through the Gateway.');
}

// Run the script
main().catch(console.error);
