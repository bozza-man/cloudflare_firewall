# Testing Guide

This document describes the comprehensive testing framework for the Cloudflare Firewall Manager project.

## Testing Philosophy

**IMPORTANT**: This project prioritizes **real data testing** over mock-based testing whenever possible. We avoid using mock data and instead prefer:

- Real API calls to stable, well-known services (e.g., DNS resolution of google.com)
- Real domain validation with actual domain formats
- Actual network operations with appropriate timeouts
- Integration testing with real systems where safe

**When mocks are unavoidable**:
- Use them only for external dependencies that are unreliable or unsafe to test against
- Always document why a mock is necessary
- Prefer "NO DATA" displays over fake/mock data in the application

## Testing Structure

```
tests/
├── setup.ts              # Jest setup and global configuration
├── types.d.ts            # TypeScript declarations for custom matchers
├── fixtures/              # Real test data (NO MOCKS - real sample data only)
│   ├── sample-gateway-rules.ts   # Real example Gateway rule formats
│   └── real-domains.ts           # Lists of real domains for testing
├── utils/                 # Testing utilities and helpers
│   └── test-helpers.ts    # Environment setup, real data helpers
├── unit/                  # Unit tests for individual components
│   ├── gateway-client.test.ts     # API client tests (real API calls)
│   ├── ai-responses.test.ts       # Type guards and utilities
│   └── domain-verifier.test.ts    # Domain validation tests (real domains)
└── integration/           # Integration tests for complete workflows
    └── rule-optimizer.test.ts     # End-to-end optimization tests
```

## Test Categories

### Unit Tests
- **Location**: `tests/unit/`
- **Purpose**: Test individual functions, classes, and components in isolation
- **Run with**: `npm run test:unit`
- **Coverage**: Each unit should have >90% code coverage

### Integration Tests
- **Location**: `tests/integration/`
- **Purpose**: Test complete workflows with mocked external dependencies
- **Run with**: `npm run test:integration`
- **Coverage**: Test realistic user scenarios and API integrations

## Available Test Scripts

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:watch` | Run tests in watch mode for development |
| `npm run test:coverage` | Generate test coverage report |
| `npm run test:verbose` | Run tests with detailed output |
| `npm run test:ci` | Run tests for CI environment |

## Testing Utilities

### Environment Setup
```typescript
import { createTestEnvironment } from '../utils/test-helpers.js';

const envCleanup = createTestEnvironment();
// Test code here
envCleanup.restore(); // Clean up
```

### Real Data Testing Utilities
```typescript
import { getRealDomains, createRealDomainTests } from '../utils/test-helpers.js';

// Use real, stable domains for testing
const stableDomains = getRealDomains('stable'); // ['google.com', 'github.com']
const testDomains = getRealDomains('test'); // Domains that should fail

// Real domain verification
const result = await domainVerifier.verifyDomain('google.com');
expect(result.success).toBe(true);
expect(result.ip).toBeDefined();
```

### API Testing (Real Calls Preferred)
```typescript
// PREFERRED: Test against real APIs when safe
import { CloudflareAPI } from '../src/api/cloudflare.js';

const api = new CloudflareAPI();
// Test with real API call
const rules = await api.listGatewayRules();

// Only mock when absolutely necessary
// import { mockCloudflareAPI } from '../utils/test-helpers.js';
// const mockAPI = mockCloudflareAPI();
// mockAPI.mockListRules(realApiResponse); // Use real response format
```

### Custom Matchers
```typescript
expect(rule).toBeValidRule(); // Validates Gateway rule structure
expect(aiResponse).toBeValidAIResponse(); // Validates AI response format
```

## Writing Tests

### Unit Test Example (Real Data Approach)
```typescript
import { describe, it, expect } from '@jest/globals';
import { DomainVerifier } from '../../src/utils/domain-verifier.js';

describe('DomainVerifier', () => {
  it('should resolve real domains successfully', async () => {
    // Arrange
    const verifier = new DomainVerifier();
    
    // Act - Using real, stable domain
    const result = await verifier.verifyDomain('google.com');
    
    // Assert - Test against real response structure
    expect(result.domain).toBe('google.com');
    expect(result.success).toBe(true);
    expect(result.ip).toBeDefined();
    expect(typeof result.ip).toBe('string');
    expect(result.responseTime).toBeGreaterThan(0);
  });
  
  it('should handle non-existent domains', async () => {
    // Using a domain that definitely should not exist
    const result = await verifier.verifyDomain('this-domain-definitely-does-not-exist-12345.com');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.ip).toBeUndefined();
  });
});
```

### Integration Test Example (Real System)
```typescript
import { DomainVerifier } from '../../src/utils/domain-verifier.js';
import { RuleVerificationContext } from '../../src/utils/domain-verifier.js';

describe('Domain Verification Integration', () => {
  it('should complete real domain verification workflow', async () => {
    // Arrange - Real test data
    const verifier = new DomainVerifier();
    const context: RuleVerificationContext = {
      ruleName: 'Test Allow Rule',
      action: 'allow',
      domains: ['google.com', 'github.com'], // Real domains
      phase: 'pre'
    };
    
    // Act - Real network operations
    const result = await verifier.verifyRuleImplementation(context);
    
    // Assert - Real results
    expect(result.totalDomains).toBe(2);
    expect(result.successfulDomains).toBeGreaterThan(0);
    expect(result.results).toHaveLength(2);
    
    // Verify real response structure
    result.results.forEach(domainResult => {
      expect(domainResult.domain).toBeDefined();
      expect(typeof domainResult.success).toBe('boolean');
      expect(typeof domainResult.responseTime).toBe('number');
    });
  });
});
```

## Test Data Management

### Real Data Fixtures (PREFERRED)
All test data should use real examples when possible:
- `sample-gateway-rules.ts`: Real Gateway rule examples from Cloudflare docs
- `real-domains.ts`: Lists of real domains categorized by test purpose
- `api-examples.ts`: Real API response examples (anonymized if needed)

### Data Categories
Organize real test data by purpose:
- **Stable domains**: `['google.com', 'github.com', 'stackoverflow.com']` - Always resolve
- **Test domains**: `['this-should-not-exist-12345.com']` - Should fail
- **Real rule examples**: Actual Cloudflare Gateway rule formats
- **NO DATA scenarios**: Test empty states without fake data

### Mock Objects (Use Only When Necessary)
When mocks are unavoidable, ensure they match real data:
- `sampleGatewayRule`: Based on real Cloudflare API responses
- `realApiResponse`: Actual API response structure (anonymized)
- **Document why mocks are needed** in each case

## Coverage Requirements

- **Overall Coverage**: >70% (enforced by CI)
- **Unit Tests**: >90% per component
- **Critical Paths**: 100% coverage required
- **Error Handling**: All error paths must be tested

## CI/CD Integration

### Pre-commit Hooks
Tests run automatically on commit:
```bash
git commit -m "feature: add new functionality"
# Triggers: linting, type checking, and tests
```

### GitHub Actions
Comprehensive CI pipeline includes:
- Multi-node version testing (18.x, 20.x)
- Unit and integration test execution
- Coverage reporting
- Security audits
- Performance benchmarks

### Coverage Reporting
- Codecov integration for PR coverage analysis
- HTML reports generated in `coverage/` directory
- LCOV format for CI integration

## Best Practices

### Test Organization
- Group related tests using `describe()` blocks
- Use descriptive test names that explain the expected behavior
- Follow AAA pattern: Arrange, Act, Assert

### Real Data Testing (PREFERRED)
- **Use real domains**: google.com, github.com, stackoverflow.com for DNS testing
- **Use actual API endpoints** when safe and stable
- **Test with real network conditions** including timeouts and failures
- **Use actual data formats** from Cloudflare APIs when available
- **Test edge cases** with real scenarios (e.g., non-existent domains)

### When Mocks Are Necessary
- **Document the reason**: Always explain why real data cannot be used
- **Minimize scope**: Mock only what's absolutely necessary
- **Use typed mocks**: Ensure mocks match real API contracts
- **Clean up**: Remove mocks between tests to avoid interference

### Mock Alternatives
- **Controlled timeouts**: Use very short timeouts to test timeout scenarios
- **Test environments**: Use dedicated test APIs when available
- **Error injection**: Modify real calls to trigger error conditions
- **NO DATA states**: Test empty/no-data scenarios instead of fake data

### Assertions
- Use specific matchers (`toBe`, `toEqual`, `toContain`)
- Test both success and failure scenarios
- Verify error messages and types
- **Validate real data structure**: Ensure tests verify actual response formats

### Performance
- Accept slower tests for real data (up to 5s for network operations)
- Use `beforeEach` and `afterEach` for setup/cleanup
- **Real network calls are acceptable** when testing network functionality
- Use timeouts appropriately for real network testing

## Debugging Tests

### Verbose Output
```bash
npm run test:verbose
```

### Single Test File
```bash
npm test gateway-client.test.ts
```

### Watch Mode
```bash
npm run test:watch
```

### Debug in VS Code
Add breakpoints and use VS Code's Jest extension for debugging.

## Continuous Improvement

- Review test coverage reports regularly
- Add tests for new features and bug fixes
- Refactor tests when code structure changes
- Update fixtures when API schemas change

## Troubleshooting

### Common Issues

**Tests timing out:**
- Increase timeout in Jest config or individual tests
- Check for unresolved promises or missing async/await

**Mock not working:**
- Ensure mocks are set up before importing modules
- Clear mocks between tests using `jest.clearAllMocks()`

**TypeScript errors:**
- Check import paths and file extensions
- Ensure test types are properly declared

**Coverage not updating:**
- Clear Jest cache: `npx jest --clearCache`
- Ensure all source files are included in coverage collection

For more help, check the Jest documentation or create an issue in the project repository.
