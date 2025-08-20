#!/usr/bin/env tsx
/**
 * Test script for MCP integrations
 * Verifies that all MCP clients are working correctly
 */

import { getMCPClientManager } from '../mcp/client-manager.js';
import { getWorkersMCPClient } from '../mcp/clients/workers-client.js';
import { getObservabilityMCPClient } from '../mcp/clients/observability-client.js';
import { EnhancedRadarClient } from '../security/enhanced-radar-client.js';
import { config } from '../../config.js';
import chalk from 'chalk';

// Test results tracking
const results: {
  server: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  error?: any;
}[] = [];

function logTest(server: string, status: 'success' | 'failed' | 'skipped', message: string, error?: any) {
  results.push({ server, status, message, error });
  
  const icon = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
  const color = status === 'success' ? chalk.green : status === 'failed' ? chalk.red : chalk.yellow;
  
  console.log(`${icon} ${color(server)}: ${message}`);
  if (error && process.env.DEBUG_MCP) {
    console.error(chalk.gray('  Error:', error.message));
  }
}

async function testMCPManager() {
  console.log(chalk.blue('\n🔧 Testing MCP Client Manager...\n'));
  
  try {
    const manager = await getMCPClientManager();
    const status = manager.getStatus();
    
    console.log('Connected MCP Servers:');
    for (const [name, info] of Object.entries(status)) {
      const statusIcon = info.connected ? '🟢' : '🔴';
      console.log(`  ${statusIcon} ${name}: ${info.connected ? 'Connected' : 'Disconnected'} (${info.category})`);
    }
    
    logTest('MCP Manager', 'success', 'Manager initialized successfully');
    return manager;
  } catch (error) {
    logTest('MCP Manager', 'failed', 'Failed to initialize manager', error);
    throw error;
  }
}

async function testRadarMCP() {
  console.log(chalk.blue('\n🛡️ Testing Radar MCP Server...\n'));
  
  try {
    const radar = new EnhancedRadarClient();
    
    // Test domain details
    console.log('Testing domain lookup...');
    const domainInfo = await radar.getDomainDetails('cloudflare.com');
    if (domainInfo) {
      console.log(`  Domain: cloudflare.com`);
      console.log(`  Rank: ${domainInfo.rank || 'N/A'}`);
      console.log(`  Categories: ${domainInfo.categories?.join(', ') || 'N/A'}`);
      logTest('Radar MCP', 'success', 'Domain lookup successful');
    } else {
      logTest('Radar MCP', 'failed', 'No domain info returned');
    }
    
    // Test IP details
    console.log('\nTesting IP lookup...');
    const ipInfo = await radar.getIPDetails('1.1.1.1');
    if (ipInfo) {
      console.log(`  IP: 1.1.1.1`);
      console.log(`  ASN: ${ipInfo.asn || 'N/A'}`);
      console.log(`  Country: ${ipInfo.country || 'N/A'}`);
      logTest('Radar MCP', 'success', 'IP lookup successful');
    } else {
      logTest('Radar MCP', 'failed', 'No IP info returned');
    }
  } catch (error) {
    logTest('Radar MCP', 'failed', 'Radar tests failed', error);
  }
}

async function testWorkersMCP() {
  console.log(chalk.blue('\n⚡ Testing Workers MCP Servers...\n'));
  
  try {
    const workers = await getWorkersMCPClient();
    
    // Test KV namespaces (read-only)
    console.log('Testing KV namespace listing...');
    try {
      const namespaces = await workers.listKVNamespaces();
      console.log(`  Found ${namespaces?.length || 0} KV namespaces`);
      logTest('Workers Bindings', 'success', 'KV namespace listing successful');
    } catch (error) {
      logTest('Workers Bindings', 'failed', 'KV namespace listing failed', error);
    }
    
    // Test R2 buckets (read-only)
    console.log('\nTesting R2 bucket listing...');
    try {
      const buckets = await workers.listR2Buckets();
      console.log(`  Found ${buckets?.length || 0} R2 buckets`);
      logTest('Workers Bindings', 'success', 'R2 bucket listing successful');
    } catch (error) {
      logTest('Workers Bindings', 'failed', 'R2 bucket listing failed', error);
    }
    
    // Test builds
    console.log('\nTesting build status...');
    try {
      const builds = await workers.listBuilds(5);
      console.log(`  Found ${builds?.length || 0} recent builds`);
      logTest('Workers Builds', 'success', 'Build listing successful');
    } catch (error) {
      logTest('Workers Builds', 'failed', 'Build listing failed', error);
    }
  } catch (error) {
    logTest('Workers MCP', 'failed', 'Workers tests failed', error);
  }
}

async function testObservabilityMCP() {
  console.log(chalk.blue('\n📊 Testing Observability MCP Servers...\n'));
  
  try {
    const obs = await getObservabilityMCPClient();
    
    // Test log search
    console.log('Testing log search...');
    try {
      const logs = await obs.searchLogs({
        limit: 10
      });
      console.log(`  Found ${logs?.length || 0} log entries`);
      logTest('Observability', 'success', 'Log search successful');
    } catch (error) {
      logTest('Observability', 'failed', 'Log search failed', error);
    }
    
    // Test error tracking
    console.log('\nTesting error tracking...');
    try {
      const errors = await obs.getErrors('24h');
      console.log(`  Error data retrieved for last 24 hours`);
      logTest('Observability', 'success', 'Error tracking successful');
    } catch (error) {
      logTest('Observability', 'failed', 'Error tracking failed', error);
    }
    
    // Test Logpush jobs
    console.log('\nTesting Logpush job listing...');
    try {
      const jobs = await obs.listLogpushJobs();
      console.log(`  Found ${jobs?.length || 0} Logpush jobs`);
      logTest('Logpush', 'success', 'Logpush job listing successful');
    } catch (error) {
      logTest('Logpush', 'failed', 'Logpush job listing failed', error);
    }
  } catch (error) {
    logTest('Observability MCP', 'failed', 'Observability tests failed', error);
  }
}

async function printSummary() {
  console.log(chalk.blue('\n📋 Test Summary\n'));
  
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  
  console.log(`Total Tests: ${results.length}`);
  console.log(chalk.green(`✅ Successful: ${successful}`));
  if (failed > 0) {
    console.log(chalk.red(`❌ Failed: ${failed}`));
  }
  if (skipped > 0) {
    console.log(chalk.yellow(`⚠️ Skipped: ${skipped}`));
  }
  
  if (failed > 0) {
    console.log(chalk.red('\n❌ Failed Tests:'));
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.server}: ${r.message}`);
    });
  }
  
  console.log(chalk.blue('\n💡 Tips:'));
  console.log('  - Set DEBUG_MCP=true for detailed error messages');
  console.log('  - Check MCP_AUTH_TOKEN is set if authentication failures occur');
  console.log('  - Ensure MCP_ENABLED_SERVERS includes the servers you want to test');
}

async function main() {
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  console.log(chalk.cyan('   MCP Integration Test Suite'));
  console.log(chalk.cyan('═══════════════════════════════════════════'));
  
  try {
    // Test MCP Manager first
    const manager = await testMCPManager();
    
    // Test individual server categories
    await testRadarMCP();
    await testWorkersMCP();
    await testObservabilityMCP();
    
  } catch (error) {
    console.error(chalk.red('\n❌ Test suite encountered a critical error:'), error);
  } finally {
    await printSummary();
  }
  
  // Exit with appropriate code
  const failed = results.filter(r => r.status === 'failed').length;
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
main().catch(console.error);
