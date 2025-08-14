import { jest } from '@jest/globals';

// Set up environment variables for testing
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests, but keep error for debugging
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging failed tests
  error: console.error,
};

// Extend Jest matchers
expect.extend({
  toBeValidRule(received: any) {
    const pass = received &&
      typeof received === 'object' &&
      typeof received.id === 'string' &&
      typeof received.name === 'string' &&
      typeof received.action === 'string' &&
      Array.isArray(received.filters);

    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid gateway rule`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid gateway rule`,
        pass: false,
      };
    }
  },
  
  toBeValidAIResponse(received: any) {
    const pass = received &&
      typeof received === 'object' &&
      typeof received.summary === 'string' &&
      Array.isArray(received.criticalIssues) &&
      Array.isArray(received.recommendations);

    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid AI response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid AI response`,
        pass: false,
      };
    }
  }
});

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
