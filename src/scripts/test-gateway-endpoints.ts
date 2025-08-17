#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';
import { config } from '../utils/config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function testEndpoint(name: string, url: string, params?: any): Promise<any> {
  const headers = {
    'Authorization': `Bearer ${config.cloudflare.apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    console.log(chalk.cyan(`Testing: ${name}`));
    const response = await axios.get(url, { headers, params });
    
    if (response.data.success) {
      console.log(chalk.green(`✓ ${name} - Success`));
      console.log(chalk.gray(`  Result count: ${response.data.result?.length || 0}`));
      if (response.data.result && response.data.result.length > 0) {
        console.log(chalk.gray(`  Sample data:`));
        console.log(JSON.stringify(response.data.result[0], null, 2).split('\n').map(line => '    ' + line).join('\n'));
      }
      return response.data;
    } else {
      console.log(chalk.yellow(`⚠ ${name} - Returned but not successful`));
      return null;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(chalk.red(`✗ ${name} - Not found (404)`));
    } else if (error.response?.status === 403) {
      console.log(chalk.red(`✗ ${name} - Forbidden (403) - Not available in your plan`));
    } else {
      console.log(chalk.red(`✗ ${name} - Error: ${error.message}`));
    }
    return null;
  }
}

async function main() {
  const accountId = config.cloudflare.accountId;
  const baseUrl = 'https://api.cloudflare.com/client/v4';
  
  console.log(chalk.cyan.bold('\n🔍 Testing Cloudflare Gateway/Zero Trust Endpoints\n'));

  // Test various endpoints
  const endpoints = [
    {
      name: 'Gateway Rules',
      url: `${baseUrl}/accounts/${accountId}/gateway/rules`
    },
    {
      name: 'Gateway Locations',
      url: `${baseUrl}/accounts/${accountId}/gateway/locations`
    },
    {
      name: 'Gateway Lists',
      url: `${baseUrl}/accounts/${accountId}/gateway/lists`
    },
    {
      name: 'Gateway Categories',
      url: `${baseUrl}/accounts/${accountId}/gateway/categories`
    },
    {
      name: 'Access Audit Logs',
      url: `${baseUrl}/accounts/${accountId}/access/logs/access_requests`,
      params: { limit: 5 }
    },
    {
      name: 'Gateway Activity Logs',
      url: `${baseUrl}/accounts/${accountId}/gateway/activities`,
      params: { limit: 5 }
    },
    {
      name: 'DNS Logs',
      url: `${baseUrl}/accounts/${accountId}/logs/gateway/dns`,
      params: { limit: 5 }
    },
    {
      name: 'HTTP Logs', 
      url: `${baseUrl}/accounts/${accountId}/logs/gateway/http`,
      params: { limit: 5 }
    },
    {
      name: 'Network Logs',
      url: `${baseUrl}/accounts/${accountId}/logs/gateway/network`,
      params: { limit: 5 }
    },
    {
      name: 'Audit Logs',
      url: `${baseUrl}/accounts/${accountId}/audit_logs`,
      params: { per_page: 5 }
    },
    {
      name: 'Security Events',
      url: `${baseUrl}/accounts/${accountId}/security/events`,
      params: { limit: 5 }
    },
    {
      name: 'Magic Network Monitoring',
      url: `${baseUrl}/accounts/${accountId}/magic/network_monitoring`,
      params: { limit: 5 }
    }
  ];

  const results: Record<string, boolean> = {};
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, endpoint.params);
    results[endpoint.name] = result !== null;
    console.log(''); // Empty line for readability
  }

  // Summary
  console.log(chalk.cyan.bold('📊 Summary:\n'));
  
  const available = Object.entries(results).filter(([_, success]) => success).map(([name]) => name);
  const unavailable = Object.entries(results).filter(([_, success]) => !success).map(([name]) => name);
  
  if (available.length > 0) {
    console.log(chalk.green('✅ Available endpoints:'));
    available.forEach(name => console.log(chalk.green(`   • ${name}`)));
  }
  
  if (unavailable.length > 0) {
    console.log(chalk.red('\n❌ Unavailable endpoints:'));
    unavailable.forEach(name => console.log(chalk.red(`   • ${name}`)));
  }

  // Recommendations based on results
  console.log(chalk.cyan.bold('\n💡 Based on your plan:\n'));
  
  if (results['Gateway Rules']) {
    console.log(chalk.yellow('• You can manage Gateway rules programmatically'));
  }
  
  if (results['Audit Logs']) {
    console.log(chalk.yellow('• Account audit logs are available (admin actions)'));
  }
  
  if (!results['Gateway Activity Logs'] && !results['DNS Logs'] && !results['HTTP Logs']) {
    console.log(chalk.yellow('• Gateway traffic logs are not available in your plan'));
    console.log(chalk.gray('  → Consider using Cloudflare dashboard for manual monitoring'));
    console.log(chalk.gray('  → Or upgrade to a plan with log access'));
    console.log(chalk.gray('  → Alternative: Use Gateway rules with notifications/webhooks'));
  }
}

main().catch(console.error);