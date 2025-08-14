import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Config Module', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear module cache to allow reimporting with new env
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('config object', () => {
    it('should load configuration from environment variables', async () => {
      // Set test environment variables
      process.env.CLOUDFLARE_API_TOKEN = 'test-token-123';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-456';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-789';
      
      // Import config after setting env vars
      const { config } = await import('../../src/utils/config.js');
      
      expect(config.cloudflare.apiToken).toBe('test-token-123');
      expect(config.cloudflare.accountId).toBe('test-account-456');
      expect(config.anthropic.apiKey).toBe('test-anthropic-789');
    });

    it('should provide default values when env vars are not set', async () => {
      // Clear environment variables
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.ANTHROPIC_API_KEY;
      
      // Import config with no env vars
      const { config } = await import('../../src/utils/config.js');
      
      expect(config.cloudflare.apiToken).toBe('');
      expect(config.cloudflare.accountId).toBe('');
      expect(config.anthropic.apiKey).toBe('');
    });

    it('should have correct base URL', async () => {
      const { config } = await import('../../src/utils/config.js');
      
      expect(config.cloudflare.baseUrl).toBe('https://api.cloudflare.com/client/v4');
    });
  });

  describe('validateConfig', () => {
    it('should not throw when all required config is present', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'valid-token';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'valid-account';
      process.env.CLOUDFLARE_ZONE_ID = 'valid-zone';
      process.env.ANTHROPIC_API_KEY = 'valid-key';
      
      const { validateConfig } = await import('../../src/utils/config.js');
      
      // Mock console.error and process.exit
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });
      
      // Should not throw or exit
      expect(() => validateConfig()).not.toThrow();
      
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should exit when API token is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      delete process.env.CLOUDFLARE_GLOBAL_KEY;
      process.env.CLOUDFLARE_ACCOUNT_ID = 'valid-account';
      process.env.CLOUDFLARE_ZONE_ID = 'valid-zone';
      process.env.ANTHROPIC_API_KEY = 'valid-key';
      
      const { validateConfig } = await import('../../src/utils/config.js');
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });
      
      expect(() => validateConfig()).toThrow('Process exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
      
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should accept global key + email as alternative auth', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      process.env.CLOUDFLARE_GLOBAL_KEY = 'global-key';
      process.env.CLOUDFLARE_EMAIL = 'test@example.com';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'valid-account';
      process.env.CLOUDFLARE_ZONE_ID = 'valid-zone';
      process.env.ANTHROPIC_API_KEY = 'valid-key';
      
      const { validateConfig } = await import('../../src/utils/config.js');
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });
      
      // Should not throw with global key auth
      expect(() => validateConfig()).not.toThrow();
      
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });
  });
});