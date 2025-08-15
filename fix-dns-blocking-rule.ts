import { GatewayClient } from './src/api/gateway-client.js';
import chalk from 'chalk';

const RULE_ID = '0519eb6f-0e60-4713-8213-19da74e501f9';
const TARGET_PRECEDENCE = 63000;

async function fixDnsBlockingRule() {
  const gateway = new GatewayClient();
  
  try {
    console.log(chalk.blue('🔧 Fixing DNS blocking rule precedence...'));
    
    // Get current rule details
    const currentRule = await gateway.getGatewayRule(RULE_ID);
    console.log(`Current precedence: ${currentRule.precedence}`);
    console.log(`Current name: ${currentRule.name}`);
    
    // Update precedence using the working method
    const updatedRule = await gateway.updateRulePrecedence(RULE_ID, TARGET_PRECEDENCE);
    
    console.log(chalk.green(`✅ Successfully updated rule precedence!`));
    console.log(`New precedence: ${updatedRule.precedence}`);
    console.log(`Rule is now at position: Last (catch-all)`);
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to update rule:'), error);
    process.exit(1);
  }
}

fixDnsBlockingRule();
