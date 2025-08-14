/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'node',
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Transform files with ts-jest
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'es2022',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }
    }],
  },
  
  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.(ts|js)',
    '**/*.(test|spec).(ts|js)'
  ],
  
  // Coverage settings
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point
    '!src/**/__tests__/**',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/cli/**', // Exclude CLI files temporarily
    '!src/rules/rule-optimizer.ts', // Exclude temporarily due to import issues
    '!src/rules/conflict-resolver.ts', // Exclude temporarily due to type issues
    '!src/utils/domain-verifier.ts' // Exclude temporarily due to ESM dependencies
  ],
  
  // Coverage thresholds (temporarily disabled for initial setup)
  // coverageThreshold: {
  //   global: {
  //     branches: 10,
  //     functions: 10,
  //     lines: 10,
  //     statements: 10
  //   }
  // },
  
  // Setup files (temporarily disabled)
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Module name mappings for problematic ESM modules
  moduleNameMapper: {
    '^chalk$': '<rootDir>/node_modules/chalk/source/index.js',
    '^ora$': '<rootDir>/node_modules/ora/index.js'
  },
  
  // Transform ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ora|cli-spinners|cli-cursor|restore-cursor|ansi-escapes|ansi-styles|strip-ansi|ansi-regex|log-symbols|figures|#ansi-styles)/)',
  ],
  
  // Verbose output
  verbose: true,
  
  // Timeout for tests (10 seconds)
  testTimeout: 10000
};
