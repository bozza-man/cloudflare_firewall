import { GatewayClient } from '../api/gateway-client.js';
import { readFileSync } from 'fs';
import { join } from 'path';



type Rule = {
  name: string;
  description: string;
  precedence: number;
  action: 'allow' | 'block' | 'isolate' | 'do_not_isolate' | 'do_not_inspect' | 'inspect';
  enabled: boolean;
  filters: string[];
  traffic: string;
  rule_settings: Record<string, unknown>;
};

async function applyRule(client: GatewayClient, rule: Rule) {
  try {
    // Check if rule exists
    const existingRules = await client.listGatewayRules();
    const existingRule = existingRules.find(r => r.name === rule.name);
    
    if (existingRule) {
      // Update existing rule
      const updatedRule = {
        ...rule,
        id: existingRule.id,
        precedence: existingRule.precedence
      };
      const result = await client.updateGatewayRule(updatedRule);
      console.log(`Updated rule: ${rule.name} (${result.id})`);
    } else {
      // Create new rule
      const result = await client.createGatewayRule(rule);
      console.log(`Created rule: ${rule.name} (${result.id})`);
    }
  } catch (error: any) {
    console.error(`Failed to apply rule ${rule.name}:`, error);
  }
}

async function applyProjectDependencyRules() {
  const client = new GatewayClient();
  
  // Read test rule configuration
  const testRules = JSON.parse(
    readFileSync(join(process.cwd(), 'gateway-rules', 'test-rule.json'), 'utf-8')
  );

  console.log('Applying gateway rules...');
  for (const rule of testRules.rules) {
    await applyRule(client, rule);
  }

  console.log('\nFinished applying gateway rules');
}

// Run the script
applyProjectDependencyRules().catch(console.error);
