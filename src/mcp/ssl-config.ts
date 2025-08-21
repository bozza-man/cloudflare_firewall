import { Agent } from 'https';
import fs from 'fs';
import path from 'path';

/**
 * SSL Configuration for MCP Servers
 * Handles self-signed certificates and custom SSL settings
 */

export interface SSLConfig {
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  cert?: string | Buffer;
  key?: string | Buffer;
  allowSelfSigned?: boolean;
}

export class MCPSSLConfig {
  private static instance: MCPSSLConfig;
  private configs: Map<string, SSLConfig> = new Map();
  private httpsAgent: Agent | null = null;

  private constructor() {
    this.initializeConfigs();
  }

  public static getInstance(): MCPSSLConfig {
    if (!MCPSSLConfig.instance) {
      MCPSSLConfig.instance = new MCPSSLConfig();
    }
    return MCPSSLConfig.instance;
  }

  private initializeConfigs(): void {
    // Default configuration for development
    const defaultConfig: SSLConfig = {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      allowSelfSigned: process.env.NODE_ENV !== 'production'
    };

    // Server-specific configurations
    this.configs.set('observability', {
      ...defaultConfig,
      rejectUnauthorized: false, // Allow self-signed for MCP servers
      allowSelfSigned: true
    });

    this.configs.set('auditLogs', {
      ...defaultConfig,
      rejectUnauthorized: false,
      allowSelfSigned: true
    });

    this.configs.set('docs', {
      ...defaultConfig,
      rejectUnauthorized: false,
      allowSelfSigned: true
    });

    this.configs.set('browserRendering', {
      ...defaultConfig,
      rejectUnauthorized: false,
      allowSelfSigned: true
    });

    this.configs.set('dnsAnalytics', {
      ...defaultConfig,
      rejectUnauthorized: false,
      allowSelfSigned: true
    });

    this.configs.set('radar', {
      ...defaultConfig,
      // Radar seems to work, keep its current settings
    });

    // Load custom certificates if available
    this.loadCustomCertificates();
  }

  private loadCustomCertificates(): void {
    const certsDir = path.join(process.cwd(), 'certs');
    
    if (!fs.existsSync(certsDir)) {
      return;
    }

    // Load server-specific certificates
    for (const [serverName] of this.configs) {
      const certPath = path.join(certsDir, `${serverName}.crt`);
      const keyPath = path.join(certsDir, `${serverName}.key`);
      const caPath = path.join(certsDir, `${serverName}-ca.crt`);

      const config = this.configs.get(serverName)!;

      if (fs.existsSync(certPath)) {
        config.cert = fs.readFileSync(certPath);
      }

      if (fs.existsSync(keyPath)) {
        config.key = fs.readFileSync(keyPath);
      }

      if (fs.existsSync(caPath)) {
        config.ca = fs.readFileSync(caPath);
      }
    }
  }

  public getConfig(serverName: string): SSLConfig {
    return this.configs.get(serverName) || {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      allowSelfSigned: process.env.NODE_ENV !== 'production'
    };
  }

  public getHttpsAgent(serverName?: string): Agent {
    const config = serverName ? this.getConfig(serverName) : {
      rejectUnauthorized: false,
      allowSelfSigned: true
    };

    return new Agent({
      rejectUnauthorized: config.rejectUnauthorized ?? false,
      ca: config.ca,
      cert: config.cert,
      key: config.key,
      // Additional options for self-signed certificates
      checkServerIdentity: () => undefined, // Skip hostname verification for dev
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3'
    });
  }

  public setServerConfig(serverName: string, config: SSLConfig): void {
    this.configs.set(serverName, config);
  }

  public updateGlobalSSLSettings(): void {
    // Set NODE_TLS_REJECT_UNAUTHORIZED for development
    if (process.env.NODE_ENV !== 'production') {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      console.warn('⚠️  SSL certificate verification disabled for development');
    }
  }

  public async testSSLConnection(url: string, serverName?: string): Promise<{
    success: boolean;
    error?: string;
    certificate?: any;
  }> {
    try {
      const https = await import('https');
      const agent = this.getHttpsAgent(serverName);

      return new Promise((resolve) => {
        const urlObj = new URL(url);
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname,
          method: 'GET',
          agent: agent,
          timeout: 5000
        };

        const req = https.request(options, (res) => {
          const cert = res.socket?.getPeerCertificate();
          resolve({
            success: true,
            certificate: cert
          });
        });

        req.on('error', (error) => {
          resolve({
            success: false,
            error: error.message
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            error: 'Connection timeout'
          });
        });

        req.end();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public getCertificateInfo(serverName: string): {
    hasCustomCert: boolean;
    hasCustomKey: boolean;
    hasCustomCA: boolean;
    config: SSLConfig;
  } {
    const config = this.getConfig(serverName);
    return {
      hasCustomCert: !!config.cert,
      hasCustomKey: !!config.key,
      hasCustomCA: !!config.ca,
      config
    };
  }
}

// Export singleton instance
export const sslConfig = MCPSSLConfig.getInstance();

// Helper function to configure fetch with SSL settings
export function configureFetchWithSSL(serverName?: string): RequestInit {
  const agent = sslConfig.getHttpsAgent(serverName);
  
  return {
    // @ts-ignore - agent is not in standard RequestInit but works in Node.js
    agent: agent,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
}

// Initialize SSL settings on module load
if (process.env.NODE_ENV !== 'production') {
  sslConfig.updateGlobalSSLSettings();
}
