# Testing Guide

This document describes the comprehensive testing framework for the Cloudflare Firewall Manager project.

## Testing Structure

```
tests/
├── setup.ts              # Jest setup and global configuration
├── types.d.ts            # TypeScript declarations for custom matchers
├── fixtures/              # Test data and mock objects
│   ├── gateway-rules.ts   # Mock Gateway rules and API responses
│   └── ai-responses.ts    # Mock AI analysis responses
├── utils/                 # Testing utilities and helpers
│   └── test-helpers.ts    # API mocking, environment setup
├── unit/                  # Unit tests for individual components
│   ├── gateway-client.test.ts     # API client tests
│   ├── ai-responses.test.ts       # Type guards and utilities
│   └── domain-verifier.test.ts    # Domain validation tests
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

### API Mocking
```typescript
import { mockCloudflareAPI, mockAnthropicAPI } from '../utils/test-helpers.js';

const cloudflareAPI = mockCloudflareAPI();
cloudflareAPI.mockListRules(mockResponse);

const anthropicAPI = mockAnthropicAPI();
anthropicAPI.mockMessages(mockAIResponse);
```

### Custom Matchers
```typescript
expect(rule).toBeValidRule(); // Validates Gateway rule structure
expect(aiResponse).toBeValidAIResponse(); // Validates AI response format
```

## Writing Tests

### Unit Test Example
```typescript
import { describe, it, expect } from '@jest/globals';
import { GatewayClient } from '../../src/api/gateway-client.js';
import { mockGatewayRules } from '../fixtures/gateway-rules.js';

describe('GatewayClient', () => {
  it('should fetch rules successfully', async () => {
    // Arrange
    const client = new GatewayClient();
    
    // Act
    const rules = await client.listGatewayRules();
    
    // Assert
    expect(rules).toHaveLength(3);
    expect(rules[0]).toBeValidRule();
  });
});
```

### Integration Test Example
```typescript
import { RuleOptimizer } from '../../src/rules/rule-optimizer.js';
import { mockCloudflareAPI } from '../utils/test-helpers.js';

describe('RuleOptimizer Integration', () => {
  it('should complete optimization workflow', async () => {
    // Setup mocks
    const cloudflareAPI = mockCloudflareAPI();
    cloudflareAPI.mockListRules(mockResponse);
    
    // Run integration
    const optimizer = new RuleOptimizer();
    await optimizer.analyzeAndOptimize({ dryRun: true });
    
    // Verify
    expect(cloudflareAPI.scope.isDone()).toBe(true);
  });
});
```

## Test Data Management

### Fixtures
All test data is centralized in the `fixtures/` directory:
- `gateway-rules.ts`: Mock Gateway rules, API responses
- `ai-responses.ts`: Mock AI analysis responses, recommendations

### Mock Objects
Consistent mock objects ensure reliable tests:
- `mockGatewayRule`: Single rule object
- `mockGatewayRules`: Array of rules
- `mockAIAnalysisResponse`: Complete AI response
- `mockCloudflareResponse`: API wrapper response

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

### Mocking
- Mock external dependencies (APIs, file system, network)
- Use consistent mock data from fixtures
- Clean up mocks between tests

### Assertions
- Use specific matchers (`toBe`, `toEqual`, `toContain`)
- Test both success and failure scenarios
- Verify error messages and types

### Performance
- Keep tests fast (<100ms per test)
- Use `beforeEach` and `afterEach` for setup/cleanup
- Avoid unnecessary network calls

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
