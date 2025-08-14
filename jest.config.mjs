/** @type {import('jest').Config} */
export default {
  // Use ts-jest preset for ESM
  preset: 'ts-jest/presets/default-esm',
  
  // Enable ESM support
  extensionsToTreatAsEsm: ['.ts'],
  
  // Test environment
  testEnvironment: 'node',
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Transform configuration for ESM
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        target: 'ES2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        resolveJsonModule: true,
      }
    }],
  },
  
  // Module name mapper to handle .js extensions in imports
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/*.(test|spec).(ts|js)'
  ],
  
  // Coverage settings
  collectCoverage: false, // Disable by default, enable with --coverage flag
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  
  // Coverage thresholds - gradually increasing
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 15,
      lines: 10,
      statements: 10
    },
    './src/utils/': {
      branches: 50,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './src/rules/domain-conflict-detector.ts': {
      branches: 55,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Transform ESM modules - don't transform any node_modules for ESM
  transformIgnorePatterns: [
    'node_modules/(?!(@anthropic-ai|chalk|ora|cli-spinners|cli-cursor|restore-cursor|ansi-escapes|ansi-styles|strip-ansi|ansi-regex|log-symbols|figures)/)',
  ],
  
  
  // Verbose output
  verbose: true,
  
  // Timeout for tests (10 seconds)
  testTimeout: 10000,
  
  // Removed custom resolver - using default
};