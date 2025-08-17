#!/usr/bin/env node

import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../utils/config.js';

interface LogAccessChecker {
  checkGraphQLAccess(): Promise<boolean>;
  checkLogpushAccess(): Promise<boolean>;
  checkAnalyticsAccess(): Promise<boolean>;
  checkGatewayAnalytics(): Promise<boolean>;
}

class CloudflareLogAccessChecker implements LogAccessChecker {
  private apiToken: string;
  private accountId: string;
  private headers: Record<string, string>;

  constructor() {
    this.apiToken = config.cloudflare.apiToken;
    this.accountId = config.cloudflare.accountId;
    this.headers = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async checkGraphQLAccess(): Promise<boolean> {
    const spinner = ora('Checking GraphQL Analytics API access...').start();
    
    try {
      const query = `
        query {
          viewer {
            accounts(filter: { accountTag: "${this.accountId}" }) {
              accountTag
              accountName
              settings {
                enforceTwoFactor
              }
            }
          }
        }
      `;

      const response = await axios.post(
        'https://api.cloudflare.com/client/v4/graphql',
        { query },
        { headers: this.headers }
      );

      if (response.data?.data?.viewer?.accounts?.length > 0) {
        spinner.succeed('GraphQL Analytics API is accessible');
        return true;
      } else {
        spinner.fail('GraphQL Analytics API returned no data');
        return false;
      }
    } catch (error) {
      spinner.fail(`GraphQL Analytics API not accessible: ${error.message}`);
      return false;
    }
  }

  async checkLogpushAccess(): Promise<boolean> {
    const spinner = ora('Checking Logpush API access...').start();
    
    try {
      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/logpush/jobs`,
        { headers: this.headers }
      );

      if (response.data.success) {
        spinner.succeed(`Logpush API is accessible (${response.data.result?.length || 0} jobs configured)`);
        return true;
      } else {
        spinner.fail('Logpush API returned unsuccessful response');
        return false;
      }
    } catch (error) {
      if (error.response?.status === 403) {
        spinner.fail('Logpush API not available (requires Enterprise plan)');
      } else {
        spinner.fail(`Logpush API not accessible: ${error.message}`);
      }
      return false;
    }
  }

  async checkAnalyticsAccess(): Promise<boolean> {
    const spinner = ora('Checking Analytics API access...').start();
    
    try {
      // Check basic analytics endpoint
      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/analytics/aggregate`,
        {
          headers: this.headers,
          params: {
            since: new Date(Date.now() - 86400000).toISOString(), // 24h ago
            until: new Date().toISOString(),
          }
        }
      );

      if (response.data.success) {
        spinner.succeed('Analytics API is accessible');
        return true;
      } else {
        spinner.fail('Analytics API returned unsuccessful response');
        return false;
      }
    } catch (error) {
      spinner.fail(`Analytics API not accessible: ${error.message}`);
      return false;
    }
  }

  async checkGatewayAnalytics(): Promise<boolean> {
    const spinner = ora('Checking Gateway-specific analytics...').start();
    
    try {
      // Try Gateway analytics endpoint
      const response = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/gateway/locations`,
        { headers: this.headers }
      );

      if (response.data.success) {
        spinner.succeed(`Gateway API is accessible (${response.data.result?.length || 0} locations found)`);
        
        // Now check for logs specifically
        const logsSpinner = ora('Checking Gateway logs endpoint...').start();
        try {
          // Try to fetch Gateway activity logs
          const logsResponse = await axios.get(
            `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/gateway/activities`,
            { 
              headers: this.headers,
              params: {
                limit: 1,
                since: new Date(Date.now() - 3600000).toISOString(), // 1h ago
              }
            }
          );
          
          if (logsResponse.data.success) {
            logsSpinner.succeed('Gateway activity logs are accessible');
            return true;
          } else {
            logsSpinner.warn('Gateway logs endpoint exists but returned no data');
            return true;
          }
        } catch (logError: any) {
          if (logError.response?.status === 404) {
            logsSpinner.info('Gateway logs endpoint not found (may need different endpoint)');
          } else {
            logsSpinner.warn(`Gateway logs endpoint error: ${logError.message}`);
          }
        }
        
        return true;
      } else {
        spinner.fail('Gateway API returned unsuccessful response');
        return false;
      }
    } catch (error) {
      spinner.fail(`Gateway API not accessible: ${error.message}`);
      return false;
    }
  }

  async checkAllMethods(): Promise<void> {
    console.log(chalk.cyan.bold('\n🔍 Checking Cloudflare Log Access Methods\n'));
    console.log(chalk.gray(`Account ID: ${this.accountId}`));
    console.log(chalk.gray(`API Token: ${this.apiToken.substring(0, 8)}...${this.apiToken.substring(this.apiToken.length - 4)}\n`));

    const results = {
      graphql: await this.checkGraphQLAccess(),
      logpush: await this.checkLogpushAccess(),
      analytics: await this.checkAnalyticsAccess(),
      gateway: await this.checkGatewayAnalytics(),
    };

    console.log(chalk.cyan.bold('\n📊 Summary:\n'));
    
    const available = [];
    const unavailable = [];
    
    if (results.graphql) {
      available.push('GraphQL Analytics API');
    } else {
      unavailable.push('GraphQL Analytics API');
    }
    
    if (results.logpush) {
      available.push('Logpush (Enterprise)');
    } else {
      unavailable.push('Logpush (requires Enterprise plan)');
    }
    
    if (results.analytics) {
      available.push('Analytics API');
    } else {
      unavailable.push('Analytics API');
    }
    
    if (results.gateway) {
      available.push('Gateway API');
    } else {
      unavailable.push('Gateway API');
    }

    if (available.length > 0) {
      console.log(chalk.green('✅ Available methods:'));
      available.forEach(method => {
        console.log(chalk.green(`   • ${method}`));
      });
    }
    
    if (unavailable.length > 0) {
      console.log(chalk.red('\n❌ Unavailable methods:'));
      unavailable.forEach(method => {
        console.log(chalk.red(`   • ${method}`));
      });
    }

    // Recommendations
    console.log(chalk.cyan.bold('\n💡 Recommendations:\n'));
    
    if (results.graphql) {
      console.log(chalk.yellow('1. Use GraphQL Analytics API for querying historical logs'));
      console.log(chalk.gray('   - Most flexible option for complex queries'));
      console.log(chalk.gray('   - Can filter by time, action, user, etc.'));
    }
    
    if (results.gateway) {
      console.log(chalk.yellow('\n2. Use Gateway API for real-time monitoring'));
      console.log(chalk.gray('   - Check for specific endpoints in your plan'));
      console.log(chalk.gray('   - May have limitations on historical data'));
    }
    
    if (!results.logpush) {
      console.log(chalk.yellow('\n3. Consider upgrading to Enterprise for Logpush'));
      console.log(chalk.gray('   - Real-time streaming to external destinations'));
      console.log(chalk.gray('   - Best for high-volume log analysis'));
    }

    console.log(chalk.cyan.bold('\n🔧 Next Steps:\n'));
    console.log('1. Check Cloudflare dashboard for your specific plan features');
    console.log('2. Review API documentation for your available endpoints');
    console.log('3. Test with smaller time ranges and limits first');
    console.log('4. Consider using webhook integrations if available\n');
  }
}

// Run the checker
async function main() {
  try {
    const checker = new CloudflareLogAccessChecker();
    await checker.checkAllMethods();
  } catch (error) {
    console.error(chalk.red('Error checking log access:'), error);
    process.exit(1);
  }
}

main();