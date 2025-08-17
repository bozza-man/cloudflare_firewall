#!/usr/bin/env tsx

/**
 * Adds Apple MDM/DEP services needed for SimpleMDM and other MDM platforms
 */

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

async function addAppleMDMServices() {
  console.log(chalk.cyan.bold('🍎 Adding Apple MDM/DEP Services\n'));
  
  const gateway = new GatewayClient();
  
  // Apple MDM and Device Enrollment Program services
  const appleMDMRule = {
    name: 'Apple: MDM & Device Enrollment',
    description: 'Allow Apple MDM, DEP, and device enrollment services',
    action: 'allow' as const,
    enabled: true,
    filters: ['http'],
    traffic: 'http.request.host in {"deviceenrollment.apple.com" "deviceservices-external.apple.com" "gdmf.apple.com" "mdmenrollment.apple.com" "school.apple.com" "business.apple.com" "dep.apple.com" "dep-client-downloads.apple.com"}',
    precedence: 1008, // Place it with other Apple services
    identity: '',
    device_posture: '',
    rule_settings: {}
  };

  const spinner = ora(`Creating: ${appleMDMRule.name}`).start();
  
  try {
    // Create the rule using the Gateway API
    const response = await gateway.api.post(
      `/accounts/${gateway.accountId}/gateway/rules`,
      appleMDMRule
    );
    
    const createdRule = response.data.result;
    spinner.succeed(`✅ Created: ${appleMDMRule.name}`);
    
    console.log(chalk.green('\n✅ Successfully added Apple MDM services'));
    console.log(chalk.gray(`   Rule ID: ${createdRule.id}`));
    console.log(chalk.gray(`   Precedence: ${appleMDMRule.precedence}`));
    console.log(chalk.gray(`   Status: Enabled`));
    
    console.log(chalk.cyan.bold('\n📝 Services Enabled:\n'));
    console.log('Device Enrollment:');
    console.log('  • deviceenrollment.apple.com - Device Enrollment Program');
    console.log('  • mdmenrollment.apple.com - MDM enrollment');
    console.log('  • dep.apple.com - DEP portal');
    console.log('  • dep-client-downloads.apple.com - DEP client downloads');
    
    console.log('\nDevice Services:');
    console.log('  • deviceservices-external.apple.com - External device services');
    console.log('  • gdmf.apple.com - MDM feedback service');
    
    console.log('\nBusiness/Education:');
    console.log('  • business.apple.com - Apple Business Manager');
    console.log('  • school.apple.com - Apple School Manager');
    
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
    
    if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
      spinner.info(`⏭️  Skipped: Apple MDM services rule already exists`);
    } else {
      spinner.fail(`❌ Failed to create Apple MDM rule`);
      console.error(chalk.red(`   Error: ${errorMessage}`));
    }
  }

  console.log(chalk.cyan.bold('\n✅ MDM Configuration Complete!\n'));
  console.log('SimpleMDM and Apple MDM services are now fully configured.');
  console.log('Your devices should be able to:');
  console.log('  • Enroll in SimpleMDM');
  console.log('  • Download configuration profiles');
  console.log('  • Receive push notifications');
  console.log('  • Access Apple Business/School Manager');
  console.log('  • Complete DEP enrollment');
  
  console.log(chalk.yellow('\n⚠️  Testing Recommendations:'));
  console.log('1. Try enrolling a test device in SimpleMDM');
  console.log('2. Check that configuration profiles download properly');
  console.log('3. Verify push notifications are received');
  console.log('4. Test DEP enrollment if using automated enrollment');
}

// Main execution
addAppleMDMServices().catch((error) => {
  console.error(chalk.red('❌ Fatal error:'), error.message);
  process.exit(1);
});