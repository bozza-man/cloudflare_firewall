#!/usr/bin/env tsx

/**
 * Test script for MCP Radar integration
 * Tests both direct MCP client and enhanced Radar client with MCP fallback
 */

import chalk from 'chalk';
import { mcpRadarClient } from './src/security/mcp-radar-client.js';
import { enhancedRadarClient } from './src/security/enhanced-radar-client.js';

async function testMCPDirect() {
  console.log(chalk.bold.blue('\n🧪 Testing Direct MCP Radar Client\n'));
  
  try {
    // Test domain details
    console.log(chalk.cyan('Testing domain details for google.com...'));
    const domainDetails = await mcpRadarClient.getDomainDetails('google.com');
    if (domainDetails) {
      console.log(chalk.green('✅ Domain details retrieved:'));
      console.log(JSON.stringify(domainDetails, null, 2));
    } else {
      console.log(chalk.yellow('⚠️  No domain details available'));
    }
    
    // Test IP details
    console.log(chalk.cyan('\nTesting IP details for 1.1.1.1...'));
    const ipDetails = await mcpRadarClient.getIPDetails('1.1.1.1');
    if (ipDetails) {
      console.log(chalk.green('✅ IP details retrieved:'));
      console.log(JSON.stringify(ipDetails, null, 2));
    } else {
      console.log(chalk.yellow('⚠️  No IP details available'));
    }
    
    // Test URL scan
    console.log(chalk.cyan('\nTesting URL scan for https://cloudflare.com...'));
    const scanResult = await mcpRadarClient.scanURL('https://cloudflare.com');
    if (scanResult) {
      console.log(chalk.green('✅ URL scan completed:'));
      console.log(JSON.stringify(scanResult, null, 2));
    } else {
      console.log(chalk.yellow('⚠️  URL scan not available'));
    }
    
  } catch (error) {
    console.error(chalk.red('❌ MCP Direct test failed:'), error);
  }
}

async function testEnhancedClient() {
  console.log(chalk.bold.blue('\n🧪 Testing Enhanced Radar Client with MCP Integration\n'));
  
  try {
    // Test domain security assessment
    console.log(chalk.cyan('Testing domain security assessment for github.com...'));
    const assessment = await enhancedRadarClient.assessDomainSecurity('github.com');
    console.log(chalk.green('✅ Domain assessment completed:'));
    console.log(`  Risk Score: ${(assessment.riskScore * 100).toFixed(1)}%`);
    console.log(`  Popularity: ${assessment.popularity || 'Unknown'}`);
    console.log(`  Categories: ${assessment.categories?.join(', ') || 'None'}`);
    console.log(`  Is High Risk: ${assessment.isHighRisk ? 'Yes' : 'No'}`);
    console.log(`  Reasons: ${assessment.reasons.join('; ')}`);
    
    // Test IP security assessment
    console.log(chalk.cyan('\nTesting IP security assessment for 8.8.8.8...'));
    const ipAssessment = await enhancedRadarClient.assessIPSecurity('8.8.8.8');
    console.log(chalk.green('✅ IP assessment completed:'));
    console.log(`  Risk Score: ${(ipAssessment.riskScore * 100).toFixed(1)}%`);
    console.log(`  ASN: ${ipAssessment.asn || 'Unknown'}`);
    console.log(`  Organization: ${ipAssessment.organization || 'Unknown'}`);
    console.log(`  Country: ${ipAssessment.country || 'Unknown'}`);
    console.log(`  Is High Risk: ${ipAssessment.isHighRisk ? 'Yes' : 'No'}`);
    console.log(`  Reasons: ${ipAssessment.reasons.join('; ')}`);
    
  } catch (error) {
    console.error(chalk.red('❌ Enhanced client test failed:'), error);
  }
}

async function testFallback() {
  console.log(chalk.bold.blue('\n🧪 Testing Fallback Mechanism\n'));
  
  try {
    // This should use MCP first, then fall back to direct API if MCP fails
    console.log(chalk.cyan('Testing with a less common domain (example.org)...'));
    const assessment = await enhancedRadarClient.assessDomainSecurity('example.org');
    console.log(chalk.green('✅ Assessment completed (may have used fallback):'));
    console.log(`  Risk Score: ${(assessment.riskScore * 100).toFixed(1)}%`);
    console.log(`  Reasons: ${assessment.reasons.join('; ')}`);
    
  } catch (error) {
    console.error(chalk.red('❌ Fallback test failed:'), error);
  }
}

async function main() {
  console.log(chalk.bold.magenta('=' .repeat(60)));
  console.log(chalk.bold.magenta(' MCP Radar Integration Test Suite'));
  console.log(chalk.bold.magenta('=' .repeat(60)));
  
  // Note about authentication
  console.log(chalk.yellow('\n⚠️  Note: MCP server requires OAuth authentication.'));
  console.log(chalk.yellow('   If not authenticated, tests will fall back to direct API.\n'));
  
  // Run tests
  await testMCPDirect();
  await testEnhancedClient();
  await testFallback();
  
  // Cleanup
  console.log(chalk.cyan('\n🧹 Cleaning up...'));
  await mcpRadarClient.disconnect();
  
  console.log(chalk.bold.green('\n✅ All tests completed!\n'));
}

// Run the tests
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
