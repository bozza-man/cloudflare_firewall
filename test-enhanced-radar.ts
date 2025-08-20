import { enhancedRadarClient } from './src/security/enhanced-radar-client.js';
import chalk from 'chalk';

async function testEnhancedRadar() {
  console.log(chalk.cyan('🔍 Testing Enhanced Radar Client'));
  console.log('='.repeat(60));
  
  const testDomains = ['microsoft.com', 'google.com', 'shodan.io'];
  
  for (const domain of testDomains) {
    console.log(chalk.yellow(`\n📊 Analyzing ${domain}...`));
    
    try {
      const assessment = await enhancedRadarClient.assessDomainSecurity(domain);
      
      console.log(chalk.green('\n✅ Domain Assessment:'));
      console.log(`  • Risk Score: ${assessment.riskScore.toFixed(2)}`);
      console.log(`  • Popularity Rank: ${assessment.popularity || 'Unknown'}`);
      console.log(`  • Categories: ${assessment.categories?.join(', ') || 'None'}`);
      console.log(`  • High Risk: ${assessment.isHighRisk ? '⚠️ YES' : '✅ NO'}`);
      
      if (assessment.organizationInfo) {
        console.log(chalk.blue('\n🏢 Organization Info:'));
        console.log(`  • ASN: ${assessment.organizationInfo.asn}`);
        console.log(`  • Name: ${assessment.organizationInfo.asnName}`);
        console.log(`  • Organization: ${assessment.organizationInfo.organization}`);
        console.log(`  • Country: ${assessment.organizationInfo.country}`);
      }
      
      if (assessment.reasons.length > 0) {
        console.log(chalk.magenta('\n📝 Analysis Reasons:'));
        assessment.reasons.forEach(reason => {
          console.log(`  • ${reason}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error analyzing ${domain}:`), error);
    }
  }
  
  // Test IP assessment
  console.log(chalk.cyan('\n\n🔍 Testing IP Assessment'));
  console.log('='.repeat(60));
  
  const testIP = '8.8.8.8';
  console.log(chalk.yellow(`\n📊 Analyzing IP ${testIP}...`));
  
  try {
    const ipAssessment = await enhancedRadarClient.assessIPSecurity(testIP);
    
    console.log(chalk.green('\n✅ IP Assessment:'));
    console.log(`  • Risk Score: ${ipAssessment.riskScore.toFixed(2)}`);
    console.log(`  • ASN: ${ipAssessment.asn || 'Unknown'}`);
    console.log(`  • Organization: ${ipAssessment.organization || 'Unknown'}`);
    console.log(`  • Country: ${ipAssessment.country || 'Unknown'}`);
    console.log(`  • High Risk: ${ipAssessment.isHighRisk ? '⚠️ YES' : '✅ NO'}`);
    
    if (ipAssessment.reasons.length > 0) {
      console.log(chalk.magenta('\n📝 Analysis Reasons:'));
      ipAssessment.reasons.forEach(reason => {
        console.log(`  • ${reason}`);
      });
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error analyzing IP ${testIP}:`), error);
  }
  
  console.log(chalk.green('\n\n✅ Enhanced Radar testing complete!'));
}

testEnhancedRadar().catch(console.error);
