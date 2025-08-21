#!/usr/bin/env tsx

import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Script to add block page domains to Gateway allow rules
 * This bypasses security validation since these are trusted block page domains
 */
async function allowBlockPageDomains() {
  const spinner = ora('Setting up Gateway client...').start();
  
  try {
    const gateway = new GatewayClient();
    
    // Block page domains to allow
    const blockPageDomains = [
      'cloudflare-dynamic-block-page.bruteforce.workers.dev',
      'block.bozza.au'
    ];
    
    spinner.text = 'Fetching existing Gateway lists...';
    const lists = await gateway.listGatewayLists();
    
    // Check if we already have a block pages list
    let blockPagesList = lists.find(list => 
      list.name === 'Block Page Domains' || 
      list.name === 'Miscellaneous Domains'
    );
    
    if (!blockPagesList) {
      spinner.text = 'Creating Block Page Domains list...';
      
      // Create a new list for block page domains
      blockPagesList = await gateway.createGatewayList({
        name: 'Block Page Domains',
        description: 'Allowed domains for custom block pages',
        type: 'DOMAIN',
        items: blockPageDomains.map(domain => ({ value: domain }))
      });
      
      spinner.succeed(`Created list: Block Page Domains with ${blockPageDomains.length} domains`);
    } else {
      spinner.text = `Updating existing list: ${blockPagesList.name}...`;
      
      // Get the full list details including items
      const fullList = await gateway.getGatewayList(blockPagesList.id);
      const currentDomains = fullList.items?.map((item: any) => item.value) || [];
      
      // Add new domains that aren't already in the list
      const newDomains = blockPageDomains.filter(domain => !currentDomains.includes(domain));
      
      if (newDomains.length > 0) {
        // Combine existing and new items
        const allItems = [
          ...(fullList.items || []),
          ...newDomains.map(domain => ({ value: domain }))
        ];
        
        await gateway.updateGatewayList({
          id: blockPagesList.id,
          items: allItems
        });
        
        spinner.succeed(`Added ${newDomains.length} new domains to ${blockPagesList.name}`);
      } else {
        spinner.info('All block page domains already in the list');
      }
    }
    
    // Now create or update an allow rule for these domains
    spinner.start('Fetching existing Gateway rules...');
    const rules = await gateway.listGatewayRules();
    
    // Check if we already have an allow rule for block pages
    const blockPageRule = rules.find(rule => 
      rule.name === 'Allow Block Page Domains' ||
      (rule.name && rule.name.toLowerCase().includes('block page') && rule.action === 'allow')
    );
    
    if (!blockPageRule) {
      spinner.text = 'Creating allow rule for block page domains...';
      
      // Create the allow rule with proper HTTP traffic expression
      // Use direct domain matching since workers.dev domains are hostnames
      const domainsStr = blockPageDomains.map(d => `"${d}"`).join(' ');
      const newRule = await gateway.createGatewayRule({
        name: 'Allow Block Page Domains',
        description: 'Allow access to custom block page domains',
        action: 'allow',
        enabled: true,
        precedence: 100, // High precedence to ensure it takes effect
        filters: ['http'],
        traffic: `http.request.host in {${domainsStr}}`,
        rule_settings: {
          block_page_enabled: false,
          block_reason: '',
          override_ips: undefined,
          override_host: '',
          l4override: null,
          biso_admin_controls: null,
          add_headers: {},
          ip_categories: false,
          check_session: null,
          insecure_disable_dnssec_validation: false
        }
      });
      
      spinner.succeed(`Created allow rule: ${newRule.name} (ID: ${newRule.id})`);
      console.log(chalk.green(`✅ Rule created with precedence ${newRule.precedence}`));
    } else {
      spinner.info(`Allow rule already exists: ${blockPageRule.name}`);
      
      // Check if the rule uses the correct list
      if (!blockPageRule.traffic?.includes(blockPagesList.id)) {
        spinner.start('Updating rule to use the correct list...');
        
        const domainsStr = blockPageDomains.map(d => `"${d}"`).join(' ');
        await gateway.updateGatewayRule({
          id: blockPageRule.id,
          traffic: `http.request.host in {${domainsStr}}`
        });
        
        spinner.succeed('Updated rule to use the Block Page Domains list');
      }
    }
    
    // Also create DNS allow rule for these domains
    spinner.start('Checking DNS allow rules...');
    
    const dnsRule = rules.find(rule => 
      rule.name === 'Allow Block Page Domains (DNS)' ||
      (rule.name && rule.name.toLowerCase().includes('block page') && 
       rule.action === 'allow' && rule.filters?.includes('dns'))
    );
    
    if (!dnsRule) {
      spinner.text = 'Creating DNS allow rule for block page domains...';
      
      const domainsStr = blockPageDomains.map(d => `"${d}"`).join(' ');
      const newDnsRule = await gateway.createGatewayRule({
        name: 'Allow Block Page Domains (DNS)',
        description: 'Allow DNS resolution for custom block page domains',
        action: 'allow',
        enabled: true,
        precedence: 101,
        filters: ['dns'],
        traffic: `dns.fqdn in {${domainsStr}}`,
        rule_settings: {
          block_page_enabled: false,
          block_reason: '',
          override_ips: undefined,
          override_host: '',
          l4override: null,
          biso_admin_controls: null,
          add_headers: {},
          ip_categories: false,
          check_session: null,
          insecure_disable_dnssec_validation: false
        }
      });
      
      spinner.succeed(`Created DNS allow rule: ${newDnsRule.name} (ID: ${newDnsRule.id})`);
    } else {
      spinner.info(`DNS allow rule already exists: ${dnsRule.name}`);
    }
    
    console.log(chalk.green.bold('\\n✅ Block page domains successfully configured!'));
    console.log(chalk.cyan('\\nDomains allowed:'));
    blockPageDomains.forEach(domain => {
      console.log(chalk.gray(`  • ${domain}`));
    });
    
  } catch (error) {
    spinner.fail('Failed to configure block page domains');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

// Run the script
allowBlockPageDomains().catch(console.error);
