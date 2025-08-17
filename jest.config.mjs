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
      isolatedModules: true,
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
    '^ora$': '<rootDir>/tests/mocks/ora.js',
    '^chalk$': '<rootDir>/tests/mocks/chalk.js',
    '^inquirer$': '<rootDir>/tests/mocks/inquirer.js'
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
      branches: 5,
      functions: 8,
      lines: 5,
      statements: 5
    },
    './src/utils/': {
      branches: 30,
      functions: 40,
      lines: 30,
      statements: 30
    },
    './src/rules/domain-conflict-detector.ts': {
      branches: 70,
      functions: 85,
      lines: 80,
      statements: 80
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