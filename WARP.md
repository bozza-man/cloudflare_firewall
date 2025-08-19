# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is an intelligent CLI tool for managing Cloudflare Zero Trust Gateway rules with AI-powered conflict detection, rule optimization, and natural language rule generation. The project is written in TypeScript and uses the Anthropic Claude API for AI functionality.

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Build the TypeScript project
npm run build

# Start the compiled application
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only  
npm run test:integration

# Run tests in watch mode during development
npm run test:watch

# Generate test coverage report
npm run test:coverage

# Run CI test suite (used in GitHub Actions)
npm run test:ci
```

### Code Quality
```bash
# Run TypeScript type checking
npm run typecheck

# Run ESLint
npm run lint

# Both lint and typecheck are run automatically via Husky pre-commit hooks
```

### CLI Usage Examples
```bash
# List all Gateway rules
npm start -- rules list

# Create a rule from natural language
npm start -- rules create --description "block all social media sites"

# Analyze and optimize all rules
npm start -- rules analyze

# Apply optimizations automatically
npm start -- rules analyze --auto-fix

# Check for domain conflicts
npm start -- rules conflicts --fix-suggestions

# Stream logs (for monitoring)
npm start -- logs stream
```

## Architecture Overview

### Core Components

1. **API Layer (`src/api/`)**: Handles all Cloudflare API interactions
   - `GatewayClient`: Main client for Gateway API operations
   - Supports both API Token and Global Key authentication
   - Handles rule CRUD operations, lists, categories, and locations

2. **LLM Integration (`src/llm/`)**: AI-powered features using Claude
   - `GatewayAIAssistant`: Analyzes conflicts, generates rules from natural language
   - Uses Claude 3.5 Sonnet model for intelligent rule analysis
   - Provides conflict resolution suggestions

3. **Rules Engine (`src/rules/`)**: Core business logic
   - `GatewayRuleManager`: Orchestrates rule operations with conflict detection
   - `DomainConflictDetector`: Specialized domain-based conflict analysis
   - `ConflictResolver`: Interactive conflict resolution UI
   - `RuleOptimizer`: Analyzes and optimizes entire rulesets

4. **CLI Layer (`src/cli/`)**: Command-line interface
   - Commander.js based CLI structure
   - Interactive prompts using Inquirer
   - Natural language interface for rule creation
   - Streaming logs command for real-time monitoring

5. **Utilities (`src/utils/`)**: Helper functions
   - `config.js`: Environment configuration management
   - `DomainVerifier`: DNS verification for domains
   - Various formatting and validation utilities

### Key Design Patterns

- **Conflict Detection Pipeline**: New rules go through multiple layers of conflict analysis:
  1. Exact duplicate detection
  2. Domain-based conflict detection (custom logic)
  3. AI-powered semantic conflict analysis
  4. Interactive resolution with multiple options

- **Rule Precedence Management**: Lower precedence numbers are evaluated first. The system automatically suggests optimal precedence based on rule specificity.

- **Filter Expression Handling**: Converts user-friendly filters to Cloudflare's expression syntax, automatically determining traffic type (DNS, HTTP, L4).

## Configuration Requirements

The application requires environment variables set in `.env`:
- `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_GLOBAL_KEY` + `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_ACCOUNT_ID`
- `ANTHROPIC_API_KEY` for AI features
- Optional OSINT service API keys for enhanced intelligence gathering

## Testing Strategy

Tests are organized into:
- `tests/unit/`: Isolated component tests
- `tests/integration/`: End-to-end workflow tests
- `tests/fixtures/`: Test data and mock responses
- `tests/mocks/`: Mock implementations for external dependencies

The project uses Jest with ts-jest for TypeScript support and includes coverage thresholds that gradually increase as the codebase matures.

## CI/CD Pipeline

GitHub Actions workflow (`ci.yml`) runs:
1. Test suite across Node.js 18.x and 20.x
2. TypeScript compilation and linting
3. Security audit for dependencies
4. Build verification
5. Performance tests
6. Automated deployment to staging (develop branch)
7. Release creation (main branch)

## Important Considerations

- **Deduplication**: The system checks for exact duplicate rules before creation to prevent redundancy
- **Traffic Type Separation**: Cloudflare Gateway rules can only handle one traffic type per rule (DNS, HTTP, or L4)
- **Filter Validation**: Some filter fields like `app.type` are not supported and are automatically filtered out
- **Interactive Mode**: Many commands support interactive mode when TTY is available for better UX
- **Rate Limiting**: Be mindful of Cloudflare API rate limits when performing bulk operations

## Cloudflare Workers Integration

The project includes a Cloudflare Worker configuration (`wrangler.toml`) for potential edge deployment of certain features, though the primary interface is the CLI tool.
