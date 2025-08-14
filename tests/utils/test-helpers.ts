import { jest } from '@jest/globals';
import nock from 'nock';

/**
 * Create a mock environment for testing
 */
export function createTestEnvironment() {
  const originalEnv = process.env;
  
  // Set test environment variables
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    CLOUDFLARE_API_TOKEN: 'test-api-token',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
    ANTHROPIC_API_KEY: 'test-anthropic-key'
  };
  
  return {
    restore: () => {
      process.env = originalEnv;
    }
  };
}

/**
 * Mock Cloudflare API endpoints
 */
export function mockCloudflareAPI(accountId: string = 'test-account-id') {
  const scope = nock('https://api.cloudflare.com')
    .defaultReplyHeaders({
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true'
    });
    
  return {
    scope,
    mockListRules: (response: any, statusCode: number = 200) => {
      return scope
        .get(`/client/v4/accounts/${accountId}/gateway/rules`)
        .reply(statusCode, response);
    },
    mockGetRule: (ruleId: string, response: any, statusCode: number = 200) => {
      return scope
        .get(`/client/v4/accounts/${accountId}/gateway/rules/${ruleId}`)
        .reply(statusCode, response);
    },
    mockCreateRule: (response: any, statusCode: number = 200) => {
      return scope
        .post(`/client/v4/accounts/${accountId}/gateway/rules`)
        .reply(statusCode, response);
    },
    mockUpdateRule: (ruleId: string, response: any, statusCode: number = 200) => {
      return scope
        .put(`/client/v4/accounts/${accountId}/gateway/rules/${ruleId}`)
        .reply(statusCode, response);
    },
    mockDeleteRule: (ruleId: string, statusCode: number = 200) => {
      return scope
        .delete(`/client/v4/accounts/${accountId}/gateway/rules/${ruleId}`)
        .reply(statusCode);
    }
  };
}

/**
 * Mock Anthropic API
 */
export function mockAnthropicAPI() {
  const scope = nock('https://api.anthropic.com')
    .defaultReplyHeaders({
      'access-control-allow-origin': '*',
      'access-control-allow-credentials': 'true'
    });
    
  return {
    scope,
    mockMessages: (response: any, statusCode: number = 200) => {
      return scope
        .post('/v1/messages')
        .reply(statusCode, response);
    }
  };
}

/**
 * Create a delay for async testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to capture console output
 */
export function captureConsole() {
  const originalConsole = { ...console };
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  console.log = jest.fn((...args: any[]) => {
    logs.push(args.join(' '));
  }) as any;
  
  console.error = jest.fn((...args: any[]) => {
    errors.push(args.join(' '));
  }) as any;
  
  console.warn = jest.fn((message: string) => {
    warns.push(message);
  }) as any;

  return {
    logs,
    errors,
    warns,
    restore: () => {
      Object.assign(console, originalConsole);
    }
  };
}

/**
 * Mock successful domain verification
 */
export function mockDomainVerification() {
  return jest.fn(() => Promise.resolve(true));
}

/**
 * Assert that an error is thrown with specific message
 */
export async function expectToThrow(
  fn: () => Promise<any>,
  expectedMessage?: string
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedMessage && error instanceof Error) {
      expect(error.message).toContain(expectedMessage);
    }
    return error as Error;
  }
}
