import { ThreatIntelligenceClient } from './src/security/threat-intelligence-client.js';
import { validationResultsManager } from './src/security/validation-results-manager.js';
import chalk from 'chalk';

async function testValidationSave() {
  console.log(chalk.cyan('🔍 Testing Validation Results Persistence'));
  console.log('='.repeat(60));
  
  // Test domains
  const testDomains = [
    'microsoft.com',
    'google.com', 
    'github.com',
    'cloudflare.com',
    'example.com'
  ];
  
  // Scan domains
  console.log(chalk.yellow('\n📊 Scanning domains...'));
  const threatClient = new ThreatIntelligenceClient();
  const results = new Map();
  
  for (const domain of testDomains) {
    console.log(chalk.gray(`  Scanning ${domain}...`));
    const result = await threatClient.scanDomain(domain);
    results.set(domain, result);
  }
  
  // Generate and display report
  console.log('\n');
  const report = validationResultsManager.generateReport(results);
  console.log(report);
  
  // Create a validated list with results
  console.log(chalk.yellow('\n📝 Creating validated list with results...'));
  const listId = await validationResultsManager.createValidatedList(
    'Test Validated Domains',
    results,
    'DOMAIN'
  );
  
  if (listId) {
    console.log(chalk.green(`✅ List created with ID: ${listId}`));
    
    // Save to existing list description
    console.log(chalk.yellow('\n📝 Updating list with validation metadata...'));
    await validationResultsManager.saveToList(listId, results);
  }
  
  // Test retrieving metadata
  console.log(chalk.yellow('\n🔍 Testing metadata retrieval...'));
  for (const domain of testDomains.slice(0, 2)) {
    const metadata = await validationResultsManager.getValidationMetadata(domain);
    if (metadata) {
      console.log(chalk.green(`\n✅ Retrieved metadata for ${domain}:`));
      console.log(`  • Reputation: ${metadata.reputation}`);
      console.log(`  • Risk Score: ${metadata.riskScore}`);
      console.log(`  • Organization: ${metadata.organization || 'Unknown'}`);
      console.log(`  • Last Validated: ${metadata.lastValidated}`);
    } else {
      console.log(chalk.gray(`  No metadata found for ${domain}`));
    }
  }
  
  console.log(chalk.green('\n\n✅ Validation persistence testing complete!'));
}

testValidationSave().catch(console.error);
