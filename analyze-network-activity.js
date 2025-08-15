#!/usr/bin/env node
// Analyze network activity patterns from Zero Trust Gateway
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!CLOUDFLARE_API_TOKEN || !ACCOUNT_ID) {
  console.error('❌ Missing environment variables. Check .env file.');
  process.exit(1);
}

const api = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: {
    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

class NetworkActivityAnalyzer {
  constructor() {
    this.startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
    this.endDate = new Date();
    this.analytics = {
      topDomains: [],
      categories: new Map(),
      countries: new Map(),
      protocols: new Map(),
      actions: new Map(),
      timePatterns: new Map()
    };
  }

  async analyzeNetworkActivity() {
    console.log('📊 Analyzing Zero Trust Gateway network activity...');
    console.log(`🕒 Period: ${this.startDate.toISOString()} to ${this.endDate.toISOString()}`);
    console.log();

    try {
      // Get Gateway analytics data
      await this.fetchGatewayAnalytics();
      
      // Analyze current rules effectiveness
      await this.analyzeCurrentRules();
      
      // Generate recommendations
      this.generateRecommendations();
      
      // Display comprehensive report
      this.displayReport();
      
    } catch (error) {
      console.error('❌ Error analyzing network activity:', error.message);
      
      // Fallback analysis using rule stats
      console.log('⚠️ Falling back to rule-based analysis...');
      await this.analyzeRuleEffectiveness();
    }
  }

  async fetchGatewayAnalytics() {
    try {
      console.log('📡 Fetching Gateway analytics data...');
      
      // Note: This would use the Gateway Analytics API when available
      // For now, we'll simulate analysis based on rule data
      console.log('   ℹ️ Using rule-based analysis (Analytics API integration pending)');
      
      // Get current gateway rules for analysis
      const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
      const rules = rulesResponse.data.result;
      
      console.log(`   📋 Found ${rules.length} total Gateway rules`);
      console.log(`   🔍 Analyzing rule patterns and configurations...\\n`);
      
      this.analyzeRulePatterns(rules);
      
    } catch (error) {
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }
  }

  analyzeRulePatterns(rules) {
    const categories = {
      'Critical Infrastructure': 0,
      'Security': 0,
      'Social Media': 0,
      'Application Control': 0,
      'Geographic': 0,
      'Monitoring': 0,
      'Business Apps': 0,
      'Unknown': 0
    };

    const actions = {
      'allow': 0,
      'block': 0,
      'isolate': 0,
      'safesearch': 0
    };

    rules.forEach(rule => {
      // Categorize rules
      const name = rule.name.toLowerCase();
      if (name.includes('critical') || name.includes('infrastructure')) {
        categories['Critical Infrastructure']++;
      } else if (name.includes('security') || name.includes('malware') || name.includes('phishing')) {
        categories['Security']++;
      } else if (name.includes('social') || name.includes('grindr')) {
        categories['Social Media']++;
      } else if (name.includes('app') || name.includes('control')) {
        categories['Application Control']++;
      } else if (name.includes('geo') || name.includes('country')) {
        categories['Geographic']++;
      } else if (name.includes('audit') || name.includes('monitor') || name.includes('log')) {
        categories['Monitoring']++;
      } else if (name.includes('business') || name.includes('microsoft') || name.includes('google')) {
        categories['Business Apps']++;
      } else {
        categories['Unknown']++;
      }

      // Count actions
      actions[rule.action] = (actions[rule.action] || 0) + 1;
    });

    this.analytics.categories = new Map(Object.entries(categories));
    this.analytics.actions = new Map(Object.entries(actions));
  }

  async analyzeCurrentRules() {
    console.log('🔍 Analyzing current rule effectiveness...');
    
    try {
      const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
      const rules = rulesResponse.data.result;
      
      const analysis = {
        totalRules: rules.length,
        enabledRules: rules.filter(r => r.enabled).length,
        disabledRules: rules.filter(r => !r.enabled).length,
        blockRules: rules.filter(r => r.action === 'block').length,
        allowRules: rules.filter(r => r.action === 'allow').length,
        dnsRules: rules.filter(r => r.filters?.includes('dns')).length,
        httpRules: rules.filter(r => r.filters?.includes('http')).length
      };

      console.log(`   📊 Rule Statistics:`);
      console.log(`      Total Rules: ${analysis.totalRules}`);
      console.log(`      Enabled: ${analysis.enabledRules} | Disabled: ${analysis.disabledRules}`);
      console.log(`      Block Rules: ${analysis.blockRules} | Allow Rules: ${analysis.allowRules}`);
      console.log(`      DNS Rules: ${analysis.dnsRules} | HTTP Rules: ${analysis.httpRules}`);
      console.log();

      // Check for gaps
      this.identifySecurityGaps(rules);
      
    } catch (error) {
      console.log(`   ⚠️ Could not analyze current rules: ${error.message}`);
    }
  }

  identifySecurityGaps(rules) {
    console.log('🛡️ Identifying security gaps...');
    
    const securityChecks = {
      'Malware Protection': rules.some(r => r.name.toLowerCase().includes('malware')),
      'Phishing Protection': rules.some(r => r.name.toLowerCase().includes('phishing')),
      'Geographic Blocking': rules.some(r => r.traffic?.includes('geoip')),
      'DLP Controls': rules.some(r => r.name.toLowerCase().includes('dlp') || r.name.toLowerCase().includes('data loss')),
      'Application Controls': rules.some(r => r.name.toLowerCase().includes('social') || r.name.toLowerCase().includes('streaming')),
      'Suspicious File Blocking': rules.some(r => r.traffic?.includes('.exe') || r.traffic?.includes('file')),
      'Monitoring Rules': rules.some(r => r.name.toLowerCase().includes('audit') || r.name.toLowerCase().includes('monitor'))
    };

    console.log('   🔍 Security Coverage Analysis:');
    Object.entries(securityChecks).forEach(([check, covered]) => {
      const status = covered ? '✅' : '❌';
      const recommendation = covered ? 'Covered' : 'MISSING - Recommend implementing';
      console.log(`      ${status} ${check}: ${recommendation}`);
    });
    console.log();

    // Store gaps for recommendations
    this.securityGaps = Object.entries(securityChecks)
      .filter(([_, covered]) => !covered)
      .map(([check, _]) => check);
  }

  generateRecommendations() {
    console.log('💡 Generating security recommendations...');
    
    this.recommendations = [];

    // Based on security gaps
    if (this.securityGaps?.length > 0) {
      this.recommendations.push({
        priority: 'HIGH',
        category: 'Security Gaps',
        action: 'Deploy missing security controls',
        details: `Missing: ${this.securityGaps.join(', ')}`
      });
    }

    // Network rule recommendations
    const totalRules = this.analytics.actions.get('allow') + this.analytics.actions.get('block');
    const blockRatio = this.analytics.actions.get('block') / totalRules;

    if (blockRatio < 0.3) {
      this.recommendations.push({
        priority: 'MEDIUM',
        category: 'Security Posture',
        action: 'Consider adding more security blocking rules',
        details: `Only ${Math.round(blockRatio * 100)}% of rules are blocking potentially harmful content`
      });
    }

    // Critical infrastructure check
    const criticalInfra = this.analytics.categories.get('Critical Infrastructure') || 0;
    if (criticalInfra < 2) {
      this.recommendations.push({
        priority: 'HIGH',
        category: 'Business Continuity',
        action: 'Ensure critical infrastructure protection',
        details: 'Add dedicated rules for essential business services'
      });
    }

    // Monitoring recommendations
    const monitoring = this.analytics.categories.get('Monitoring') || 0;
    if (monitoring < 5) {
      this.recommendations.push({
        priority: 'MEDIUM',
        category: 'Visibility',
        action: 'Increase monitoring and logging rules',
        details: 'Add comprehensive audit and monitoring rules for better visibility'
      });
    }

    console.log(`   📋 Generated ${this.recommendations.length} recommendations`);
    console.log();
  }

  displayReport() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║              NETWORK ACTIVITY ANALYSIS REPORT            ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();

    // Rule Categories
    console.log('📊 Rule Distribution by Category:');
    this.analytics.categories.forEach((count, category) => {
      if (count > 0) {
        const bar = '█'.repeat(Math.min(count, 20));
        console.log(`   ${category.padEnd(20)}: ${count.toString().padStart(2)} ${bar}`);
      }
    });
    console.log();

    // Actions Distribution
    console.log('⚙️ Rule Actions Distribution:');
    this.analytics.actions.forEach((count, action) => {
      if (count > 0) {
        const percentage = Math.round((count / [...this.analytics.actions.values()].reduce((a, b) => a + b, 0)) * 100);
        console.log(`   ${action.toUpperCase().padEnd(10)}: ${count.toString().padStart(2)} rules (${percentage}%)`);
      }
    });
    console.log();

    // Security Gaps
    if (this.securityGaps?.length > 0) {
      console.log('🚨 Security Gaps Identified:');
      this.securityGaps.forEach(gap => {
        console.log(`   ❌ ${gap}`);
      });
      console.log();
    }

    // Recommendations
    if (this.recommendations?.length > 0) {
      console.log('💡 Recommendations (Priority Order):');
      this.recommendations
        .sort((a, b) => {
          const priority = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
          return priority[b.priority] - priority[a.priority];
        })
        .forEach((rec, index) => {
          console.log(`   ${index + 1}. [${rec.priority}] ${rec.category}: ${rec.action}`);
          console.log(`      ${rec.details}`);
        });
      console.log();
    }

    // Next Steps
    console.log('🚀 Recommended Next Steps:');
    console.log('   1. Deploy core network security rules:');
    console.log('      node create-network-security-rules.js');
    console.log();
    console.log('   2. Monitor rule effectiveness:');
    console.log('      npm start -- rules stats');
    console.log();
    console.log('   3. Review Gateway Analytics (when available):');
    console.log('      Visit Cloudflare Zero Trust Dashboard > Analytics');
    console.log();
    console.log('   4. Fine-tune rules based on traffic patterns');
    console.log('   5. Set up alerting for security events');
    console.log();

    // Current Status
    const totalCategories = [...this.analytics.categories.values()].reduce((a, b) => a + b, 0);
    const securityCategories = (this.analytics.categories.get('Security') || 0) + 
                              (this.analytics.categories.get('Critical Infrastructure') || 0);
    const securityCoverage = Math.round((securityCategories / totalCategories) * 100);

    console.log('📈 Current Security Posture:');
    console.log(`   Security Rule Coverage: ${securityCoverage}%`);
    console.log(`   Critical Infrastructure: ${this.analytics.categories.get('Critical Infrastructure') || 0} rules`);
    console.log(`   Business Applications: ${this.analytics.categories.get('Business Apps') || 0} rules`);
    console.log(`   Monitoring & Audit: ${this.analytics.categories.get('Monitoring') || 0} rules`);
    console.log();
  }

  async analyzeRuleEffectiveness() {
    // Fallback method when full analytics aren't available
    console.log('📊 Performing rule-based effectiveness analysis...');
    
    try {
      const rulesResponse = await api.get(`/accounts/${ACCOUNT_ID}/gateway/rules`);
      const rules = rulesResponse.data.result;
      
      this.analyzeRulePatterns(rules);
      this.identifySecurityGaps(rules);
      this.generateRecommendations();
      this.displayReport();
      
    } catch (error) {
      console.error('❌ Failed to analyze rule effectiveness:', error.message);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const analyzer = new NetworkActivityAnalyzer();
  analyzer.analyzeNetworkActivity().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export default NetworkActivityAnalyzer;
