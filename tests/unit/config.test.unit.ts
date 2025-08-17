import { describe, it, expect, beforeEach } from '@jest/globals';
import { validateConfig } from '../../src/utils/config.js';

describe('Config Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('validateConfig', () => {
    it('should pass when all required env vars are set', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should throw when CLOUDFLARE_API_TOKEN is missing', () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      expect(() => validateConfig()).toThrow('Missing required environment variable: CLOUDFLARE_API_TOKEN');
    });

    it('should throw when CLOUDFLARE_ACCOUNT_ID is missing', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      expect(() => validateConfig()).toThrow('Missing required environment variable: CLOUDFLARE_ACCOUNT_ID');
    });

    it('should throw when ANTHROPIC_API_KEY is missing', () => {
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => validateConfig()).toThrow('Missing required environment variable: ANTHROPIC_API_KEY');
    });

    it('should accept both API token and global key authentication', () => {
      // Test with API token
      process.env.CLOUDFLARE_API_TOKEN = 'test-token';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      expect(() => validateConfig()).not.toThrow();

      // Test with global key
      delete process.env.CLOUDFLARE_API_TOKEN;
      process.env.CLOUDFLARE_GLOBAL_KEY = 'global-key';
      process.env.CLOUDFLARE_EMAIL = 'test@example.com';
      
      expect(() => validateConfig()).not.toThrow();
    });
  });
});