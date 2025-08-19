#!/usr/bin/env npx tsx

import { InteractiveSecurityReviewer } from '../security/interactive-security-reviewer.js';
import { GatewayClient } from '../api/gateway-client.js';
import chalk from 'chalk';

// The same 14 domains from the previous attempt
const DOMAINS_TO_REVIEW = [
  'configuration.apple.com.akadns.net',
  'bozza.au',
  'cdns.grindr.com',
  'gs-loc.ls-apple.com.akadns.net',
  'wallet.cdn-apple.com',
  'xp.itunes-apple.com.akadns.net',
  'metrics.icloud.com',
  'mqtt.crealitycloud.com',
  'gcs-blue-upload-us.l.googleusercontent.com',
  'gcs-blue-download-us.l.googleusercontent.com',
  'gdmf.v.aaplimg.com',
  'p69-contacts.icloud.com',
  'p143-contacts.icloud.com',
  'ausyd2.icloud-content.com'
];

// Enhanced categorization mappings based on domain patterns
const CATEGORY_MAPPINGS = new Map<string, string>([
  // Apple Services
  ['configuration.apple.com.akadns.net', 'Apple Services'],
  ['gs-loc.ls-apple.com.akadns.net', 'Apple Services'],
  ['wallet.cdn-apple.com', 'Apple Services'],
  ['xp.itunes-apple.com.akadns.net', 'Apple Services'],
  ['metrics.icloud.com', 'Apple Services'],
  ['gdmf.v.aaplimg.com', 'Apple Services'],
  ['p69-contacts.icloud.com', 'Apple Services'],
  ['p143-contacts.icloud.com', 'Apple Services'],
  ['ausyd2.icloud-content.com', 'Apple Services'],
  
  // Google Services
  ['gcs-blue-upload-us.l.googleusercontent.com', 'Google Services'],
  ['gcs-blue-download-us.l.googleusercontent.com', 'Google Services'],
  
  // Social Media
  ['cdns.grindr.com', 'Social Media Sites'],
  
  // IoT/Other
  ['mqtt.crealitycloud.com', 'IoT and Smart Devices'],
  ['bozza.au', 'Miscellaneous Domains']
]);

async function enhancedDomainSecurityReview() {
  console.log(chalk.cyan.bold('🔒 Enhanced Domain Security Review'));
  console.log(chalk.blue('With comprehensive OSINT analysis and manual approval for medium+ risks'));
  console.log('═'.repeat(80));
  
  console.log(chalk.yellow(`\n📋 Processing ${DOMAINS_TO_REVIEW.length} domains:`));
  DOMAINS_TO_REVIEW.forEach((domain, i) => {
    console.log(`   ${i + 1}. ${domain}`);
  });
  
  // Initialize the interactive security reviewer
  const reviewer = new InteractiveSecurityReviewer();
  
  try {
    // Process domains with enhanced security review
    const results = await reviewer.processDomainsWithReview(DOMAINS_TO_REVIEW, {
      requireApprovalForRisk: 'medium', // Require approval for medium+ risks
      autoApproveBelow: 'low', // Only auto-approve low risk domains
      showFullOSINT: true, // Show comprehensive OSINT analysis
      batchMode: false, // Interactive mode
      reviewer: process.env.USER || 'Security Reviewer'
    });
    
    console.log(chalk.cyan.bold('\n🎯 Processing Results for Approved Domains'));
    console.log('═'.repeat(80));
    
    if (results.approved.length === 0) {
      console.log(chalk.yellow('⚠️  No domains were approved for addition to Gateway Lists.'));
      console.log(chalk.blue('This indicates that the enhanced security measures are working as intended.'));
      return;
    }
    
    // Process approved domains and add them to appropriate lists
    const gateway = new GatewayClient();
    
    // Group approved domains by category
    const approvedByCategory = new Map<string, string[]>();
    
    for (const domain of results.approved) {
      const category = CATEGORY_MAPPINGS.get(domain) || 'Miscellaneous Domains';
      
      if (!approvedByCategory.has(category)) {
        approvedByCategory.set(category, []);
      }
      approvedByCategory.get(category)!.push(domain);
    }
    
    // Display categorization results
    console.log(chalk.green(`✅ ${results.approved.length} domains approved and categorized:`));
    for (const [category, domains] of approvedByCategory) {
      console.log(chalk.blue(`\n📁 ${category}:`));
      domains.forEach(domain => {
        console.log(`   • ${domain}`);
      });
    }
    
    // Confirm before making changes
    console.log(chalk.yellow('\n⚠️  The above domains will be added to their respective Gateway Lists.'));
    console.log(chalk.blue('Press Ctrl+C to cancel or wait 5 seconds to proceed...'));
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Add domains to appropriate lists
    console.log(chalk.cyan('\n🔧 Adding approved domains to Gateway Lists...'));
    
    const lists = await gateway.listGatewayLists();
    const listMap = new Map<string, string>();
    lists.forEach(list => {
      if (list.name) {
        listMap.set(list.name, list.id);
      }
    });
    
    for (const [categoryName, domains] of approvedByCategory) {
      const listId = listMap.get(categoryName);
      
      if (listId) {
        console.log(chalk.blue(`\n📝 Updating existing list: ${categoryName}`));
        
        // Get current list
        const currentList = await gateway.getGatewayList(listId);
        if (currentList && currentList.items) {
          const currentDomains = currentList.items.map(item => item.value);
          const newDomains = [...currentDomains, ...domains];
          
          // Remove duplicates
          const uniqueDomains = [...new Set(newDomains)];
          
          // Update list
          await gateway.updateGatewayList({
            id: listId,
            name: categoryName,
            description: currentList.description,
            items: uniqueDomains.map(domain => ({ value: domain }))
          });
          
          console.log(chalk.green(`   ✅ Added ${domains.length} domains to ${categoryName}`));
          domains.forEach(domain => {
            console.log(chalk.gray(`      • ${domain}`));
          });
        }
      } else {
        console.log(chalk.blue(`\n📝 Creating new list: ${categoryName}`));
        
        // Create new list
        const newList = await gateway.createGatewayList({
          name: categoryName,
          description: `Domains approved through enhanced security review on ${new Date().toISOString().split('T')[0]}`,
          type: 'DOMAIN',
          items: domains.map(domain => ({ value: domain }))
        });
        
        console.log(chalk.green(`   ✅ Created ${categoryName} with ${domains.length} domains`));
        domains.forEach(domain => {
          console.log(chalk.gray(`      • ${domain}`));
        });
      }
    }
    
    // Display final summary
    console.log(chalk.cyan.bold('\n🎉 Enhanced Security Review Complete'));
    console.log('═'.repeat(80));
    console.log(`${chalk.green('✅ Approved:')} ${results.approved.length} domains added to Gateway Lists`);
    console.log(`${chalk.red('❌ Rejected:')} ${results.rejected.length} domains blocked due to security concerns`);
    console.log(`${chalk.yellow('⏭️  Skipped:')} ${results.skipped.length} domains deferred for future review`);
    
    if (results.rejected.length > 0) {
      console.log(chalk.yellow('\n⚠️  Security Insights:'));
      console.log('The enhanced security review successfully identified and blocked domains with security concerns.');
      console.log('This demonstrates the effectiveness of combining threat intelligence with manual review processes.');
    }
    
    // Display security decision audit trail
    console.log(chalk.cyan.bold('\n📊 Security Decision Audit Trail'));
    console.log('─'.repeat(60));
    for (const decision of results.decisions) {
      const icon = decision.decision === 'approve' ? '✅' : decision.decision === 'reject' ? '❌' : '⏭️ ';
      console.log(`${icon} ${decision.item}: ${decision.decision.toUpperCase()}`);
      console.log(`   Reviewed by: ${decision.reviewedBy}`);
      console.log(`   Date: ${new Date(decision.reviewDate).toLocaleString()}`);
      if (decision.reasoning) {
        console.log(`   Reasoning: ${decision.reasoning}`);
      }
      console.log('');
    }
    
  } catch (error: any) {
    console.error(chalk.red('❌ Error during enhanced security review:'), error);
    process.exit(1);
  }
}

// Run the enhanced security review
enhancedDomainSecurityReview().catch(console.error);
