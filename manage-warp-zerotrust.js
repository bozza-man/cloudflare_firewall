#!/usr/bin/env node
// Cloudflare WARP Zero Trust management script for testing phase
import { execSync, exec } from 'child_process';
import { createRequire } from 'module';
import { promisify } from 'util';

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

class WARPZeroTrustManager {
  constructor() {
    this.platform = process.platform;
    this.warpCommand = this.getWARPCommand();
    this.configPath = this.getConfigPath();
    this.organizationName = 'bruteforcegroup';
  }

  getWARPCommand() {
    switch (this.platform) {
      case 'darwin':
        return 'warp-cli';
      case 'linux':
        return 'warp-cli';
      case 'win32':
        return 'warp-cli.exe';
      default:
        return 'warp-cli';
    }
  }

  getConfigPath() {
    switch (this.platform) {
      case 'darwin':
        return '~/Library/Application Support/Cloudflare';
      case 'linux':
        return '~/.config/cloudflare-warp';
      case 'win32':
        return '%LOCALAPPDATA%\\Cloudflare';
      default:
        return '~/.config/cloudflare-warp';
    }
  }

  async checkWARPInstallation() {
    try {
      const result = await execAsync(`${this.warpCommand} --version`);
      console.log('✅ WARP installed:', result.stdout.trim());
      
      // Check Zero Trust registration
      try {
        const regStatus = await execAsync(`${this.warpCommand} registration show`);
        const regInfo = regStatus.stdout.trim();
        
        if (regInfo.includes('Account type: Team')) {
          console.log('✅ Registered as Zero Trust (Team) account');
        } else {
          console.log('ℹ️  Registration type:', regInfo.includes('Account type:') ? regInfo.split('\n')[0] : 'Unknown');
        }
        
        // Check organization
        const orgResult = await execAsync(`${this.warpCommand} registration organization`);
        const orgName = orgResult.stdout.trim();
        if (orgName === this.organizationName) {
          console.log(`✅ Registered to Zero Trust organization: ${this.organizationName}`);
        } else if (orgName) {
          console.log(`⚠️  Registered to different organization: ${orgName}`);
        } else {
          console.log('⚠️  Not registered to any Zero Trust organization');
        }
      } catch (error) {
        console.log('ℹ️  Zero Trust registration status: Unknown or not registered');
      }
      
      return true;
    } catch (error) {
      console.log('❌ WARP not installed or not accessible');
      console.log('   Please install Cloudflare WARP from: https://1.1.1.1/');
      return false;
    }
  }

  async getWARPStatus() {
    try {
      const result = await execAsync(`${this.warpCommand} status`);
      return result.stdout.trim();
    } catch (error) {
      return 'Error getting status: ' + error.message;
    }
  }

  async enableWARP() {
    console.log('🚀 Enabling WARP Zero Trust connection...');
    try {
      // Connect to WARP
      await execAsync(`${this.warpCommand} connect`);
      console.log('✅ WARP enabled successfully');
      
      // Show current status
      const status = await this.getWARPStatus();
      console.log('📊 Current status:', status);
      
      // Check organization after connection
      try {
        const org = await execAsync(`${this.warpCommand} registration organization`);
        console.log(`🏢 Connected through: ${org.stdout.trim()}`);
      } catch (error) {
        console.log('ℹ️  Organization info not available');
      }
      
      return true;
    } catch (error) {
      console.log('❌ Failed to enable WARP:', error.message);
      return false;
    }
  }

  async disableWARP() {
    console.log('⏹️  Disabling WARP...');
    try {
      // Disconnect from WARP
      await execAsync(`${this.warpCommand} disconnect`);
      console.log('✅ WARP disabled successfully');
      
      // Show current status
      const status = await this.getWARPStatus();
      console.log('📊 Current status:', status);
      
      return true;
    } catch (error) {
      console.log('❌ Failed to disable WARP:', error.message);
      return false;
    }
  }

  async configureZeroTrustTestingMode() {
    console.log(`⚙️  Configuring WARP for Zero Trust testing mode (${this.organizationName})...`);
    
    // Check current registration status
    try {
      const regStatus = await execAsync(`${this.warpCommand} registration show`);
      console.log('   ℹ️  Current registration status:');
      const lines = regStatus.stdout.trim().split('\n');
      lines.forEach(line => {
        if (line.includes('Account type:') || line.includes('Organization:') || line.includes('Account ID:')) {
          console.log(`      ${line}`);
        }
      });
      
      // Check if already registered to bruteforcegroup
      if (regStatus.stdout.includes(this.organizationName)) {
        console.log(`   ✅ Already registered to ${this.organizationName} organization`);
      } else {
        console.log(`   ⚠️  Not registered to ${this.organizationName} organization`);
        console.log('   💡 To register to Zero Trust organization:');
        console.log('      1. Visit your Zero Trust dashboard at https://dash.teams.cloudflare.com/');
        console.log('      2. Go to Settings > WARP Client');
        console.log('      3. Copy the enrollment token');
        console.log(`      4. Run: ${this.warpCommand} registration new <token>`);
        console.log('      Or provide the token as a parameter to this script');
      }
    } catch (error) {
      console.log('   ⚠️  Registration check failed:', error.message);
      console.log(`   💡 To register new device to ${this.organizationName}:`);
      console.log(`      Run: ${this.warpCommand} registration new <enrollment-token>`);
    }

    // Set Zero Trust mode (WARP + DoH for Gateway filtering)
    try {
      await execAsync(`${this.warpCommand} mode warp+doh`);
      console.log('   ✅ Mode set to: WARP + DoH (Zero Trust Gateway)');
    } catch (error) {
      console.log('   ⚠️  Could not set WARP mode:', error.message);
      // Try alternative mode setting
      try {
        await execAsync(`${this.warpCommand} mode warp`);
        console.log('   ✅ Mode set to: WARP (fallback mode)');
      } catch (fallbackError) {
        console.log('   ❌ Failed to set any WARP mode');
      }
    }

    console.log(`\\n🎯 Zero Trust testing configuration applied for ${this.organizationName}!`);
    console.log('   • Zero Trust organization: bruteforcegroup');
    console.log('   • Gateway DNS filtering enabled (DoH)');
    console.log('   • WARP tunnel for full traffic protection');
    console.log('   • Manual control enabled for testing');
    console.log('   • Easy toggle on/off capability');
  }

  async registerWithToken(token) {
    console.log(`🔐 Registering device to ${this.organizationName} with enrollment token...`);
    
    try {
      // Delete existing registration if any
      try {
        await execAsync(`${this.warpCommand} registration delete`);
        console.log('   🗑️  Cleared existing registration');
      } catch (error) {
        console.log('   ℹ️  No existing registration to clear');
      }
      
      // Register with token
      await execAsync(`${this.warpCommand} registration new ${token}`);
      console.log('   ✅ Successfully registered with enrollment token');
      
      // Verify registration
      const regStatus = await execAsync(`${this.warpCommand} registration show`);
      console.log('   📋 Registration verified:');
      const lines = regStatus.stdout.trim().split('\n');
      lines.forEach(line => {
        if (line.includes('Account type:') || line.includes('Organization:')) {
          console.log(`      ${line}`);
        }
      });
      
      return true;
    } catch (error) {
      console.log('   ❌ Failed to register with token:', error.message);
      return false;
    }
  }

  async testConnectivity() {
    console.log('🔍 Testing Zero Trust connectivity...');
    
    const testSites = [
      'cloudflare.com',
      'google.com', 
      'github.com',
      'anthropic.com',
      'grindr.com'
    ];

    for (const site of testSites) {
      try {
        const result = await execAsync(`curl -s -o /dev/null -w "%{http_code} %{time_total}s" https://${site}`);
        const [statusCode, time] = result.stdout.trim().split(' ');
        
        if (statusCode === '200') {
          console.log(`   ✅ ${site}: ${statusCode} (${time})`);
        } else {
          console.log(`   ⚠️  ${site}: ${statusCode} (${time})`);
        }
      } catch (error) {
        console.log(`   ❌ ${site}: Failed to connect`);
      }
    }
    
    console.log('\\n🔍 Testing Gateway DNS filtering...');
    try {
      const dnsTest = await execAsync('dig +short @1.1.1.1 cloudflare.com');
      console.log(`   ✅ DNS resolution working: ${dnsTest.stdout.trim()}`);
    } catch (error) {
      console.log('   ⚠️  DNS resolution test failed');
    }
  }

  async getDetailedStatus() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║               WARP ZERO TRUST STATUS REPORT              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();

    try {
      // Get basic status
      const status = await this.getWARPStatus();
      console.log('📊 Connection Status:');
      console.log(`   ${status}\\n`);

      // Get Zero Trust registration info
      try {
        const regInfo = await execAsync(`${this.warpCommand} registration show`);
        console.log('🏢 Zero Trust Registration:');
        const lines = regInfo.stdout.trim().split('\n');
        lines.forEach(line => {
          console.log(`   ${line}`);
        });
        console.log();
      } catch (error) {
        console.log('🏢 Registration: Not available or not registered\\n');
      }

      // Get current settings (abbreviated)
      try {
        const settings = await execAsync(`${this.warpCommand} settings list`);
        console.log('⚙️  Key Settings:');
        const lines = settings.stdout.trim().split('\n');
        lines.forEach(line => {
          if (line.includes('Always On:') || 
              line.includes('Mode:') || 
              line.includes('Organization:') ||
              line.includes('Resolve via:')) {
            console.log(`   ${line}`);
          }
        });
        console.log();
      } catch (error) {
        console.log('⚙️  Settings: Could not retrieve\\n');
      }

    } catch (error) {
      console.log('❌ Could not retrieve WARP status:', error.message);
    }
  }

  printUsage() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║            WARP ZERO TRUST TESTING MANAGER               ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log();
    console.log('Usage: node manage-warp-zerotrust.js [command] [options]');
    console.log();
    console.log('Commands:');
    console.log('  status        - Show detailed WARP Zero Trust status');
    console.log('  on            - Enable WARP connection');
    console.log('  off           - Disable WARP connection');
    console.log('  toggle        - Toggle WARP on/off');
    console.log('  setup         - Configure WARP for Zero Trust testing mode');
    console.log('  register      - Register with enrollment token');
    console.log('  test          - Test connectivity through WARP');
    console.log('  check         - Check WARP installation and registration');
    console.log();
    console.log('Options for register command:');
    console.log('  --token <token>   Enrollment token from Zero Trust dashboard');
    console.log();
    console.log('Examples:');
    console.log('  node manage-warp-zerotrust.js register --token <your-token>');
    console.log('  node manage-warp-zerotrust.js toggle');
    console.log();
    console.log('🧪 Zero Trust Testing Mode Features:');
    console.log(`  • Organization: ${this.organizationName}`);
    console.log('  • Gateway DNS filtering (DoH)');
    console.log('  • WARP tunnel encryption');
    console.log('  • Manual control (no auto-reconnect)');
    console.log('  • Easy on/off toggling');
    console.log('  • Gateway rule enforcement');
    console.log();
  }

  async run(command, options = {}) {
    if (!command) {
      this.printUsage();
      return;
    }

    const isInstalled = await this.checkWARPInstallation();
    if (!isInstalled && command !== 'check') {
      return;
    }

    switch (command.toLowerCase()) {
      case 'status':
        await this.getDetailedStatus();
        break;
        
      case 'on':
      case 'enable':
        await this.enableWARP();
        break;
        
      case 'off':
      case 'disable':
        await this.disableWARP();
        break;
        
      case 'toggle':
        const currentStatus = await this.getWARPStatus();
        if (currentStatus.includes('Connected')) {
          await this.disableWARP();
        } else {
          await this.enableWARP();
        }
        break;
        
      case 'setup':
      case 'configure':
        await this.configureZeroTrustTestingMode();
        break;
        
      case 'register':
        if (options.token) {
          await this.registerWithToken(options.token);
        } else {
          console.log('❌ Enrollment token required for registration');
          console.log('   Use: node manage-warp-zerotrust.js register --token <your-token>');
          console.log('   Get token from: https://dash.teams.cloudflare.com/');
        }
        break;
        
      case 'test':
        await this.testConnectivity();
        break;
        
      case 'check':
        await this.checkWARPInstallation();
        break;
        
      default:
        console.log(`❌ Unknown command: ${command}`);
        this.printUsage();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new WARPZeroTrustManager();
  const command = process.argv[2];
  
  // Parse token option
  const options = {};
  const tokenIndex = process.argv.indexOf('--token');
  if (tokenIndex !== -1 && process.argv[tokenIndex + 1]) {
    options.token = process.argv[tokenIndex + 1];
  }
  
  manager.run(command, options).catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export default WARPZeroTrustManager;
