#!/usr/bin/env node
// Network topology detection for Cloudflare WARP deployment
import { execSync } from 'child_process';
import { createRequire } from 'module';
import dns from 'dns/promises';

const require = createRequire(import.meta.url);

class NetworkTopologyDetector {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      topology: 'unknown',
      cloudflarePresent: false,
      gatewayInfo: {},
      dnsServers: [],
      recommendations: []
    };
  }

  async detectTopology() {
    console.log('🔍 Detecting network topology for Cloudflare WARP deployment...\n');

    try {
      // Step 1: Check DNS servers
      await this.checkDNSServers();
      
      // Step 2: Check gateway/router information
      await this.checkGatewayInfo();
      
      // Step 3: Test Cloudflare connectivity
      await this.testCloudflareConnectivity();
      
      // Step 4: Check for existing WARP installation
      await this.checkWARPStatus();
      
      // Step 5: Analyze results and make recommendations
      this.analyzeTopology();
      
      // Step 6: Display results
      this.displayResults();
      
      return this.results;
    } catch (error) {
      console.error('❌ Error during network topology detection:', error.message);
      return null;
    }
  }

  async checkDNSServers() {
    console.log('📡 Checking DNS configuration...');
    
    try {
      let dnsCommand;
      if (process.platform === 'darwin' || process.platform === 'linux') {
        dnsCommand = 'cat /etc/resolv.conf | grep nameserver | awk \'{print $2}\'';
      } else if (process.platform === 'win32') {
        dnsCommand = 'nslookup google.com | findstr "Server"';
      }
      
      const dnsOutput = execSync(dnsCommand, { encoding: 'utf8' }).trim();
      this.results.dnsServers = dnsOutput.split('\n').filter(ip => ip.trim());
      
      // Check for Cloudflare DNS servers
      const cloudflareDNS = ['1.1.1.1', '1.0.0.1', '2606:4700:4700::1111', '2606:4700:4700::1001'];
      const hasCloudflareDS = this.results.dnsServers.some(dns => cloudflareDNS.includes(dns));
      
      if (hasCloudflareDS) {
        console.log('✅ Cloudflare DNS servers detected');
        this.results.cloudflarePresent = true;
      }
      
      console.log(`   DNS Servers: ${this.results.dnsServers.join(', ')}\n`);
    } catch (error) {
      console.log(`⚠️  Could not detect DNS servers: ${error.message}\n`);
    }
  }

  async checkGatewayInfo() {
    console.log('🌐 Checking gateway/router information...');
    
    try {
      let routeCommand;
      if (process.platform === 'darwin') {
        routeCommand = 'route -n get default | grep gateway';
      } else if (process.platform === 'linux') {
        routeCommand = 'ip route | grep default';
      } else if (process.platform === 'win32') {
        routeCommand = 'ipconfig | findstr "Default Gateway"';
      }
      
      const routeOutput = execSync(routeCommand, { encoding: 'utf8' }).trim();
      
      // Extract gateway IP
      const gatewayMatch = routeOutput.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (gatewayMatch) {
        this.results.gatewayInfo.ip = gatewayMatch[1];
        console.log(`   Gateway IP: ${this.results.gatewayInfo.ip}`);
        
        // Check if gateway is in typical router ranges
        const isRouterGateway = this.results.gatewayInfo.ip.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/);
        this.results.gatewayInfo.isRouter = !!isRouterGateway;
        
        if (isRouterGateway) {
          console.log('   📡 Behind router/gateway detected');
        } else {
          console.log('   🌐 Direct internet connection detected');
        }
      }
      
      console.log();
    } catch (error) {
      console.log(`⚠️  Could not detect gateway info: ${error.message}\n`);
    }
  }

  async testCloudflareConnectivity() {
    console.log('☁️  Testing Cloudflare connectivity...');
    
    try {
      // Test connectivity to Cloudflare services
      const testDomains = [
        'cloudflare.com',
        'one.one.one.one',
        'warp.dev'
      ];
      
      for (const domain of testDomains) {
        try {
          const result = await dns.lookup(domain);
          console.log(`   ✅ ${domain}: ${result.address}`);
        } catch (error) {
          console.log(`   ❌ ${domain}: Failed to resolve`);
        }
      }
      
      // Check for Cloudflare-specific headers or responses
      try {
        const curlCommand = 'curl -s -I https://cloudflare.com | grep -i cloudflare';
        const cfHeaders = execSync(curlCommand, { encoding: 'utf8' }).trim();
        if (cfHeaders) {
          this.results.cloudflarePresent = true;
          console.log('   ✅ Cloudflare services accessible');
        }
      } catch (error) {
        console.log('   ⚠️  Could not verify Cloudflare headers');
      }
      
      console.log();
    } catch (error) {
      console.log(`⚠️  Cloudflare connectivity test failed: ${error.message}\n`);
    }
  }

  async checkWARPStatus() {
    console.log('🛡️  Checking existing WARP installation...');
    
    try {
      let warpCommand;
      if (process.platform === 'darwin') {
        warpCommand = 'warp-cli';
      } else if (process.platform === 'linux') {
        warpCommand = 'warp-cli';
      } else if (process.platform === 'win32') {
        warpCommand = 'warp-cli.exe';
      }
      
      const warpOutput = execSync(`${warpCommand} status`, { encoding: 'utf8' }).trim();
      this.results.warpInstalled = true;
      this.results.warpStatus = warpOutput;
      
      console.log(`   ✅ WARP installed`);
      console.log(`   Status: ${warpOutput}`);
      
      // Check for Zero Trust registration
      try {
        const regOutput = execSync(`${warpCommand} registration show`, { encoding: 'utf8' }).trim();
        if (regOutput.includes('Account type: Team')) {
          this.results.isZeroTrust = true;
          console.log('   ✅ Zero Trust (Team) account detected');
          
          // Get organization name
          try {
            const orgOutput = execSync(`${warpCommand} registration organization`, { encoding: 'utf8' }).trim();
            this.results.zeroTrustOrg = orgOutput;
            console.log(`   Organization: ${orgOutput}`);
          } catch (error) {
            console.log('   Organization: Unknown');
          }
        } else {
          this.results.isZeroTrust = false;
          console.log('   Consumer WARP account');
        }
      } catch (error) {
        this.results.isZeroTrust = false;
        console.log('   Registration status: Unknown');
      }
    } catch (error) {
      this.results.warpInstalled = false;
      this.results.isZeroTrust = false;
      console.log('   ⚠️  WARP not installed or not accessible');
    }
    
    console.log();
  }

  analyzeTopology() {
    console.log('📊 Analyzing network topology...\n');
    
    // Determine topology based on gathered information
    if (this.results.gatewayInfo.isRouter && this.results.cloudflarePresent) {
      this.results.topology = 'behind_cloudflare_router';
      this.results.recommendations = [
        'Device is behind a router already connected to Cloudflare',
        'WARP can be configured in "Split Tunnel" mode',
        'Consider "Gateway with WARP" for additional protection',
        'Monitor for double-NAT or routing conflicts'
      ];
    } else if (this.results.gatewayInfo.isRouter && !this.results.cloudflarePresent) {
      this.results.topology = 'behind_regular_router';
      this.results.recommendations = [
        'Device is behind a regular router/gateway',
        'WARP should be configured in "Gateway with WARP" mode',
        'Full tunnel encryption recommended',
        'May need to configure router bypass rules'
      ];
    } else if (!this.results.gatewayInfo.isRouter) {
      this.results.topology = 'direct_internet';
      this.results.recommendations = [
        'Device has direct internet connection',
        'WARP should be configured in "Gateway with WARP" mode',
        'Full protection and encryption available',
        'Optimal configuration for testing'
      ];
    }
  }

  displayResults() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                 NETWORK TOPOLOGY REPORT                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    
    console.log(`🌐 Detected Topology: ${this.results.topology.replace(/_/g, ' ').toUpperCase()}`);
    console.log(`☁️  Cloudflare Present: ${this.results.cloudflarePresent ? '✅ Yes' : '❌ No'}`);
    console.log(`🛡️  WARP Installed: ${this.results.warpInstalled ? '✅ Yes' : '❌ No'}`);
    if (this.results.warpInstalled) {
      console.log(`🏢 Zero Trust: ${this.results.isZeroTrust ? '✅ Yes' : '❌ No (Consumer)'}`);
      if (this.results.isZeroTrust && this.results.zeroTrustOrg) {
        console.log(`🏢 Organization: ${this.results.zeroTrustOrg}`);
      }
    }
    console.log();
    
    console.log('📡 Network Details:');
    console.log(`   Gateway: ${this.results.gatewayInfo.ip || 'Unknown'}`);
    console.log(`   Behind Router: ${this.results.gatewayInfo.isRouter ? 'Yes' : 'No'}`);
    console.log(`   DNS Servers: ${this.results.dnsServers.join(', ')}`);
    console.log();
    
    console.log('💡 Recommendations:');
    this.results.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
    console.log();
    
    console.log('🚀 Next Steps:');
    if (!this.results.warpInstalled) {
      console.log('   1. Install Cloudflare WARP client');
      console.log('   2. Register to bruteforcegroup Zero Trust organization');
      console.log('   3. Run WARP configuration script');
    } else if (this.results.isZeroTrust && this.results.zeroTrustOrg === 'bruteforcegroup') {
      console.log('   1. Use node manage-warp-zerotrust.js for testing');
      console.log('   2. Configure Zero Trust testing mode');
      console.log('   3. Test Gateway rule enforcement');
    } else if (this.results.isZeroTrust) {
      console.log('   1. Verify Zero Trust organization registration');
      console.log('   2. Use node manage-warp-zerotrust.js for testing');
      console.log('   3. Configure Zero Trust testing mode');
    } else {
      console.log('   1. Register to bruteforcegroup Zero Trust organization');
      console.log('   2. Use node manage-warp-zerotrust.js for testing');
      console.log('   3. Configure Zero Trust testing mode');
    }
    console.log('   4. Test connectivity and Gateway rule performance');
    console.log('   5. Document configuration for deployment');
    console.log();
  }

  saveResults(filename = 'network-topology-report.json') {
    const fs = require('fs');
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`📝 Report saved to: ${filename}`);
  }
}

// Run detection if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const detector = new NetworkTopologyDetector();
  detector.detectTopology().then(results => {
    if (results) {
      detector.saveResults();
    }
  });
}

export default NetworkTopologyDetector;
